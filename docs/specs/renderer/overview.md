<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Renderer Overview

> Render-graph-driven, wgpu-backed renderer that produces a frame from an ECS world; deterministic, headless-capable, telemetry-by-default.

## Boundaries

- Owns: render graph compilation/execution, frame lifecycle, GPU resource lifetime, command encoding, presentation.
- Does NOT own:
  - GPU device/surface acquisition → `docs/specs/renderer/backend.md`.
  - Asset upload/streaming → `docs/contracts/renderer-assets.md`.
  - Materials/lighting math → `docs/specs/renderer/pbr.md`.
  - Window/swapchain creation → `docs/specs/core/hal.md` [AGENT: 02].
  - Style overrides (NPR, pixel) → `docs/specs/styles/overview.md` [AGENT: 04].
- Depends on:
  - `docs/specs/core/ecs.md` [AGENT: 02] — extracts world data into `RenderWorld` each frame.
  - `docs/specs/core/jobs.md` [AGENT: 02] — parallel node encoding.
  - `docs/contracts/core-renderer.md` [AGENT: 14] — transform/camera/light component shapes.
  - `docs/contracts/renderer-assets.md` [AGENT: 14] — texture, mesh, shader handles.

## Architecture

```
┌──────────────────────────── FRAME N ───────────────────────────────────┐
│                                                                        │
│  ECS World ──extract──► RenderWorld (snapshot, owned by render thread) │
│                              │                                         │
│                              ▼                                         │
│                       ┌───────────────┐                                │
│                       │ Render Graph  │  nodes+edges, declared once,   │
│                       │   (DAG)       │  re-evaluated per frame        │
│                       └──────┬────────┘                                │
│                              │ compile (topo sort, resource alias)     │
│                              ▼                                         │
│                       ┌───────────────┐                                │
│                       │ Schedule      │  pass list + transient texture │
│                       │ + Resources   │  pool + barrier plan           │
│                       └──────┬────────┘                                │
│                              │ encode (parallel per-pass)              │
│                              ▼                                         │
│                       ┌───────────────┐                                │
│                       │ CommandBuffers│  one per pass, recorded in     │
│                       │               │  job system threads            │
│                       └──────┬────────┘                                │
│                              │ submit (single queue)                   │
│                              ▼                                         │
│                       ┌───────────────┐                                │
│                       │ wgpu Queue    │ ──► swapchain.present()        │
│                       └───────────────┘                                │
│                                                                        │
│  Telemetry tap ◄── every node emits: name, gpu_us, dispatched_draws,   │
│                    bytes_written, transitions, cache_hits              │
└────────────────────────────────────────────────────────────────────────┘
```

Render graph node taxonomy:

```
Setup nodes        : Depth prepass, GBuffer
Shadow nodes       : CSM cascades, VSM page allocation        → shadows.md
Lighting nodes     : Direct lighting, IBL, GI                 → pbr.md, gi.md
Geometry nodes     : Opaque, transparent, terrain, particles  → terrain.md, particles.md
Post nodes         : Bloom, TAA, SSAO, motion blur, tonemap   → post.md
Present node       : Swapchain blit
Debug nodes        : Wireframe overlay, telemetry HUD         → docs/contracts/physics-renderer.md
```

## Frame Lifecycle

```
T0   begin_frame()                    // host-side
T1   extract()                        // ECS → RenderWorld; parallel system-by-system
T2   prepare()                        // upload uniforms, transient buffers, instance data
T3   graph.compile()                  // topo sort, alias transient resources, plan barriers
T4   graph.encode()                   // parallel; each node returns CommandBuffer
T5   queue.submit(all buffers)        // single Submit call
T6   surface.present()                // wgpu swapchain
T7   end_frame()                      // emit telemetry, age fences, recycle resources
```

Triple buffering: frames N-2, N-1, N may be in flight (CPU prepare, GPU encode, GPU present). Determinism is preserved because extract reads a snapshot of world state at frame begin; rendering never mutates ECS.

## Public API

```rust
pub struct Renderer { /* opaque */ }

impl Renderer {
    pub fn new(cfg: RendererConfig) -> Result<Self, RendererError>;
    pub fn render(&mut self, world: &World) -> Result<FrameStats, RendererError>;
    pub fn add_node<N: RenderNode>(&mut self, node: N) -> NodeId;
    pub fn add_edge(&mut self, from: NodeId, to: NodeId) -> Result<(), RendererError>;
    pub fn capture(&mut self, target: CaptureTarget) -> Result<Image, RendererError>;  // offscreen
    pub fn telemetry(&self) -> &FrameTelemetry;
}

pub trait RenderNode: Send + Sync {
    fn name(&self) -> &'static str;
    fn declare(&self, b: &mut GraphBuilder);                  // inputs/outputs
    fn encode(&self, ctx: &mut EncodeCtx) -> Result<(), RendererError>;
}

pub struct RendererConfig {
    pub backend_pref: BackendPref,           // → backend.md
    pub headless: bool,                      // no surface, render to offscreen
    pub frame_capture: bool,                 // wgpu trace
    pub deterministic: bool,                 // disables async timing, fixes fp mode
    pub resolution: (u32, u32),
    pub hdr: bool,
    pub vsync: VsyncMode,
}

pub struct FrameStats {
    pub frame_index: u64,
    pub gpu_us: u64,
    pub cpu_us: u64,
    pub draw_calls: u32,
    pub triangles: u64,
    pub per_node: Vec<NodeStats>,
}
```

## Performance Contract

| Metric                              | Target            | Hard limit          |
|-------------------------------------|-------------------|---------------------|
| Frame budget (1080p, mid GPU)       | 8.33 ms (120 fps) | 16.66 ms (60 fps)   |
| Frame budget (4K, high GPU)         | 16.66 ms          | 33.3 ms             |
| Render-thread CPU cost              | < 2 ms            | < 4 ms              |
| Graph compile (≤200 nodes)          | < 50 µs           | < 200 µs            |
| Extract phase (10k entities)        | < 1 ms            | < 3 ms              |
| Headless throughput (no surface)    | 10× real-time     | 4× real-time        |
| Allocations per frame (steady)      | 0                 | < 8                 |
| Transient texture pool reuse        | ≥ 95%             | ≥ 80%               |

Numbers above are targets; baselines `[BENCHMARK NEEDED]` once first vertical slice runs.

## Error Contract

| Code                          | Meaning                                          | Caller action                          |
|-------------------------------|--------------------------------------------------|----------------------------------------|
| `RENDER_GRAPH_CYCLE`          | Cycle detected during compile                    | Inspect edges, return graph repro JSON |
| `RENDER_GRAPH_MISSING_INPUT`  | Node declared input never produced               | Show producer name, abort frame        |
| `RENDER_RESOURCE_EXHAUSTED`   | Transient pool over budget                       | Raise budget or split pass             |
| `RENDER_SHADER_COMPILE`       | WGSL → backend translation failed                | Forward naga diagnostics → shaders.md  |
| `RENDER_BACKEND_LOST`         | Device lost / TDR                                | Recreate device, replay last frame     |
| `RENDER_HEADLESS_CAPTURE_FAIL`| Offscreen readback failed                        | Drop frame, log, retry next frame      |

All errors are `serde`-serializable, carry `code` (stable string), `message`, `node` (if applicable), `suggested_fix`.

## Integration Points

| System         | Contact                                                                                  |
|----------------|------------------------------------------------------------------------------------------|
| ECS            | Extract systems read `Transform`, `MeshHandle`, `MaterialHandle`, `Light`, `Camera`.     |
| Assets         | `MeshHandle`/`TextureHandle` resolve via registry → `docs/contracts/renderer-assets.md`. |
| Physics        | Debug draw node consumes line buffer → `docs/contracts/physics-renderer.md`.             |
| Editor         | Render graph viewer subscribes to telemetry → `docs/specs/editor/debug.md` [AGENT: 11].  |
| Agent SDK      | Headless captures route to `docs/specs/agent/headless.md` [AGENT: 10].                   |
| Styles         | Style modules inject/replace passes → `docs/specs/styles/overview.md` [AGENT: 04].       |

## Test Requirements

- Compile a 200-node graph → topo sort ≤ 200 µs.
- Headless render of a single triangle on a Linux box with no display → produces deterministic PNG hash.
- Inject a cycle → returns `RENDER_GRAPH_CYCLE` with cycle path.
- Replay: same world + same input + same seed → identical pixel hash across 1000 frames.
- Hot-swap node at runtime → no GPU validation errors, no leaked resources.
- Drop GPU device mid-frame → renderer recovers within 200 ms, replays last known good frame.

## Prior Art

- `google/filament` ✓ deferred + clustered forward duality, render graph design.
- `gfx-rs/wgpu` ✓ portable HAL, validation layer, naga integration.
- `bevyengine/bevy` ✓ render graph as DAG with named nodes/slots; ✗ extract phase is single-threaded today.
- `EmbarkStudios/kajiya` ✓ rg.rs-style transient resource aliasing.
- Frostbite "FrameGraph" GDC 2017 ✓ explicit pass/resource declaration.
- UE5 Rendering Dependency Graph (RDG) ✓ async compute scheduling.

## Open Questions

- `[DECISION NEEDED]` Forward+ clustered vs. tiled deferred default? Filament defaults to clustered forward; deferred wins for many lights. Likely: clustered forward default, deferred opt-in per project.
- `[DECISION NEEDED]` Render thread model — dedicated thread (Bevy 0.14+) vs. inline on main thread for WASM?
- `[DECISION NEEDED]` Mesh shader path vs. classic VS/PS for v1.0? Mesh shaders unavailable on WebGPU and pre-Turing GPUs.
- `[BENCHMARK NEEDED]` Cost of `RenderWorld` extract for 100k entities — informs ECS query design.
- `[DECISION NEEDED]` Async compute queue usage — wgpu exposes a single queue today; emulate via fences?
