<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Particles & VFX Graph

> GPU-resident particle system with a node-graph authoring model (VFX-graph concept). Simulation in compute shaders; rendering via instanced quads, ribbons, or mesh particles. Millions of particles per system, deterministic when required.

## Boundaries

- Owns: particle simulation, emission, lifetime, sorting, rendering, VFX graph runtime.
- Does NOT own:
  - Graph editor UI → `docs/specs/editor/shader.md` [AGENT: 11] (shares node editor).
  - Physics collision queries → exposed via `docs/contracts/core-physics.md` [AGENT: 14].
  - Audio triggers → emitted as ECS events to `docs/specs/audio/overview.md` [AGENT: 06].
- Depends on:
  - Compute shader capability (Tier 2 minimum).
  - `docs/specs/renderer/shaders.md` for permutation handling.
  - `docs/specs/core/jobs.md` [AGENT: 02] for CPU-side spawn batching.

## Architecture

```
VFX Asset (.vfx) — author-time DAG
   ┌──────────────────────────────────────────────┐
   │  Contexts (ordered):                         │
   │    Spawn  →  Initialize  →  Update  →  Render│
   │                                              │
   │  Each context contains Blocks (operators):   │
   │    e.g. Spawn:      "constant rate 100/s"    │
   │         Initialize: "set position from sphere"│
   │         Update:     "gravity", "drag",       │
   │                     "color over life"        │
   │         Render:     "quad: face camera"      │
   └──────────────────────────────────────────────┘
                       │ compile
                       ▼
              ┌────────────────────┐
              │  Compute pipelines │  one or more WGSL kernels
              │  + Render pipeline │  generated from graph
              └────────────────────┘
                       │
                       ▼
   ┌───────────────────────────────────────────────────────┐
   │             Runtime (per system, per frame)           │
   │                                                       │
   │  ┌──────────┐  ┌────────────┐  ┌────────┐  ┌────────┐ │
   │  │  Spawn   │─►│ Initialize │─►│ Update │─►│ Render │ │
   │  └──────────┘  └────────────┘  └────────┘  └────────┘ │
   │       │             │              │            │     │
   │       └────►  Particle Pool (GPU buffer) ◄──────┘     │
   │              alive list (compaction or dead list)     │
   │                                                       │
   │              Indirect draw (count from compact pass)  │
   └───────────────────────────────────────────────────────┘
```

Storage layout — Structure-of-Arrays GPU buffers (cache-friendly compute):

```
positions [N]   vec4   (xyz + age)
velocities[N]   vec4   (xyz + drag)
colors    [N]   vec4   (rgba)
sizes     [N]   vec2   (x, y)
custom    [N]   vec4×M (user attributes, packed)
alive_idx [N]   u32    (compacted indices, indirect-draw count)
```

`N` is system capacity; pool is fixed-size (no GPU allocation). Overflow → dropped emissions (counted in telemetry).

## Render Modes

| Mode      | Primitive                  | Use case                          |
|-----------|----------------------------|-----------------------------------|
| Quad      | Camera-facing billboard    | Sparks, smoke, dust               |
| Axial quad| Aligned to velocity        | Tracer, debris streak             |
| Ribbon    | Triangle strip across N particles | Trail, lightning bolt      |
| Mesh      | Instanced mesh per particle| Debris chunks, leaves             |
| Light     | No mesh, contributes as light to clustered list | Sparks lighting nearby |

Sorting: back-to-front bitonic sort on GPU for transparent particles; opaque uses depth test only.

## VFX Graph Concept

Compiles a DAG of typed blocks into a set of compute kernels + a render pipeline. Inspired by Unity VFX Graph and Houdini SOPs.

Block categories:

```
Spawn       : constant rate, burst, scripted curve, event-driven
Initialize  : position (sphere, box, mesh surface, spline),
              velocity (cone, vector field), color, lifetime, custom attrs
Update      : forces (gravity, vortex, attractor), drag, turbulence (curl noise),
              color/size/rotation over life, kill at lifetime,
              collide (depth buffer, mesh SDF), event emit, sub-emit (chain)
Render      : quad/axial/ribbon/mesh/light + material binding
```

Authored in editor (`docs/specs/editor/shader.md`), saved as `.vfx` TOML+JSON hybrid. Hot reload supported via the shader/asset reload paths.

## Public API

```rust
pub struct VfxAsset { /* compiled DAG */ }
pub struct VfxInstance { /* runtime, position/orientation, parameters override */ }

pub struct EmitterSpawn {
    pub asset: VfxHandle,
    pub transform: Transform,
    pub parameters: SmallVec<[(StrId, VfxParam); 8]>,
    pub determinism: Determinism,   // Free | Seeded(u64)
}

impl Renderer {
    pub fn spawn_vfx(&mut self, spawn: EmitterSpawn) -> VfxId;
    pub fn despawn_vfx(&mut self, id: VfxId);
    pub fn set_vfx_param(&mut self, id: VfxId, name: &str, value: VfxParam);
}
```

ECS integration: `ParticleEmitter` component carries `VfxId`. Render extract issues an indirect draw per active emitter.

## Determinism

Default mode uses GPU `atomicAdd` for spawn indexing → non-deterministic order. `Determinism::Seeded(s)` switches to a permuted-congruential RNG seeded per-frame from `(frame_index, system_id, s)` and uses a fixed work-group layout → bit-exact replay (verified across same GPU; cross-GPU bit-exactness `[DECISION NEEDED]`).

## Performance Contract

| Metric                                          | Target            | Hard limit            |
|-------------------------------------------------|-------------------|-----------------------|
| Particles per frame (steady, one system)        | 1,000,000         | 4,000,000             |
| Total live particles (scene)                    | 5,000,000         | 16,000,000            |
| Update kernel cost (1M particles)               | < 0.5 ms          | < 1.5 ms              |
| Sort cost (1M transparent)                      | < 1.0 ms          | < 3.0 ms              |
| Spawn rate (events / frame, CPU-side)           | 10,000            | 50,000                |
| Compile (.vfx → pipeline)                       | < 50 ms           | < 250 ms              |
| Memory per system (capacity 1M, 32 B/particle)  | 32 MB             | 128 MB                |

## Error Contract

| Code                              | Meaning                                  | Caller action                   |
|-----------------------------------|------------------------------------------|---------------------------------|
| `VFX_GRAPH_COMPILE`               | DAG cycle or unsupported block combo     | Show offending node, abort      |
| `VFX_POOL_EXHAUSTED`              | Capacity hit — drops counted             | Increase capacity or trim emit  |
| `VFX_DETERMINISTIC_UNAVAILABLE`   | Tier < 2 atomics                         | Force `Determinism::Free`       |
| `VFX_RENDER_MODE_UNSUPPORTED`     | Mesh particle on backend w/o SSBO        | Fall back to quads              |

## Integration Points

| System    | Contact                                                                                   |
|-----------|-------------------------------------------------------------------------------------------|
| ECS       | `ParticleEmitter` component; extract pushes spawn requests to GPU spawn buffer.           |
| Physics   | Collision blocks query depth buffer (cheap) or mesh SDF (accurate) → core-physics contract|
| Audio     | "Emit event" block writes to `EventQueue<ParticleEvent>` consumed by audio for hits.      |
| Renderer  | VFX render pass runs after opaque (for transparent) or in GBuffer (for mesh-particles).   |
| Editor    | Visual graph in node editor; live param tweaks during play.                               |
| Agent SDK | Telemetry per system: alive, spawned_this_frame, dropped_this_frame, update_us, draw_us.  |
| Styles    | NPR style may swap render block shader (e.g., toon sparks).                               |

## Test Requirements

- Spawn 1M particles, run 60 frames headless → live count and frame budget within targets.
- Deterministic mode: same seed + same inputs → identical particle position hash after 1000 frames.
- Cycle in graph → returns `VFX_GRAPH_COMPILE` with cycle path.
- Capacity overflow: emit 2× pool size → drops counted, no crash.
- Hot reload `.vfx` mid-run → no GPU validation errors; live particles preserved or gracefully reset.
- Depth-buffer collision: particles bounce off rendered ground plane within 1 px error.

## Prior Art

- Unity VFX Graph ✓ context/block authoring model; ✓ GPU-only sim; ✗ tied to HDRP/URP.
- Houdini SOPs ✓ node graph for VFX, gold standard.
- UE Niagara ✓ data-driven modules, GPU+CPU sims; ✗ heavy authoring overhead.
- Cascade (UE3) ✓ simple stack-based; ✗ outgrown.
- "GPU Gems 3" particle chapters ✓ sort/compaction patterns.
- `kit-vfx` (Bevy ecosystem) ✓ Rust-native baseline.

## Open Questions

- `[DECISION NEEDED]` CPU fallback path for backends without compute (WebGPU has compute; GLES3 fallback would not).
- `[DECISION NEEDED]` Cross-GPU bit-exact determinism — likely impossible due to floating-point reductions; document as not guaranteed.
- `[DECISION NEEDED]` Maximum custom attributes per particle — adds VGPR pressure.
- `[BENCHMARK NEEDED]` Bitonic sort vs. radix sort for 1M particles on mid-tier mobile.
- `[DECISION NEEDED]` Mesh particle path: GPU-driven indirect MultiDraw vs. CPU draw loop on backends without MDI.
- `[DECISION NEEDED]` Sub-emitters (particle spawns another system on death) — recursion depth limit?
