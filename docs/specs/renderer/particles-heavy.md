<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Particles — Heavy (10M–100M)

> When `docs/specs/renderer/particles.md` baseline (5M live target) is not enough. GPU-driven everything: emit on GPU, simulate on GPU, sort on GPU, render via instanced impostors. Target: 10M–100M particles on desktop dGPU, 1M–10M on integrated/mobile. For Returnal-grade VFX, Geometry Wars 3 storms, Resogun voxel-burst, bullet hells, and particle-art games.

## Boundaries

- Owns: GPU-resident SoA double-buffered particle pool, GPU emit, GPU sim with distance-LOD step, GPU radix sort, instanced impostor render, free-list compaction pass, depth-buffer collision, 2D-grid SPH fluid coupling.
- Does NOT own: VFX graph authoring (→ `docs/specs/renderer/particles.md` — baseline), CPU spawn batching (→ `docs/specs/core/jobs.md`), Lagrangian fluid (→ `docs/specs/physics/fluid.md` — coupling only).
- Depends on: `docs/specs/renderer/particles.md` (the baseline this extends), `docs/specs/physics/determinism.md`, `docs/specs/physics/fluid.md`, `docs/specs/styles/2-5d.md`.

## Architecture

```
Heavy-particle pipeline — everything on GPU

  CPU (per frame): one spawn request struct per emitter
                                 │
                                 ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  GPU emit kernel                                              │
  │  - reads spawn requests + free-list head                      │
  │  - atomic-pops free slots, writes initial state               │
  └────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  GPU simulate kernel (LOD-stepped)                            │
  │  - close particles (d < L1): per-frame                        │
  │  - mid particles  (L1 < d < L2): every 2 frames               │
  │  - far particles  (d > L2): every 4 frames                    │
  │  - collide with depth buffer (cheap occlusion)                │
  │  - fluid coupling via 2D-grid SPH (read fluid density texture)│
  │  - write dead particles to free-list                          │
  └────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  GPU compact kernel (every N frames, default N=8)             │
  │  - prefix-sum alive mask                                      │
  │  - scatter alive particles to front of buffer                 │
  │  - reset free-list                                            │
  └────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  GPU sort kernel (transparent only — bitonic or radix)        │
  │  - sort indices by view-space depth                           │
  └────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  Instanced impostor render                                    │
  │  - one indirect MultiDraw call                                │
  │  - impostor atlas (8×8 view angles), depth-aware soft blend   │
  └───────────────────────────────────────────────────────────────┘
```

## Storage

| Buffer | Type | Size (10M particles, base attrs) |
|---|---|---|
| `positions` SSBO (double-buffered, ping-pong) | `vec4` (xyz + age) | 320 MB (× 2 = 640 MB) |
| `velocities` SSBO | `vec4` (xyz + drag) | 160 MB |
| `colors` SSBO | `u32` packed RGBA8 | 40 MB |
| `sizes` SSBO | `u16x2` | 40 MB |
| `alive_mask` SSBO | `u32` bitset | 1.25 MB |
| `free_list` SSBO + atomic head | `u32` indices | 40 MB |
| `sort_keys` SSBO (transparent only) | `u32` packed depth | 40 MB |

Total for 10M: ~1.3 GB GPU memory. 100M: ~13 GB (desktop only).

Compaction frequency: every 8 frames OR when fragmentation > 30%, whichever first.

## LOD

```
Distance-LOD simulation step:

  ─ camera ─────────────────────────────────────────────────────────►
            │       │            │             │
            ▼       ▼            ▼             ▼
        per-frame  every 2 fr   every 4 fr   cull
        (d < L1)   (L1<d<L2)    (L2<d<L3)    (d>L3)

  Render LOD:
            │       │            │             │
            ▼       ▼            ▼             ▼
        full quad  half-res     impostor      cull
        + soft     impostor     (1 px point)
```

Per-LOD parameters in `[particles-heavy.lod]`. Default tier distances tuned for 60-Hz on Ryzen 9 + RTX 4070 baseline.

## Determinism

Opt-in via `[particles-heavy] determinism = "seeded"`. Implementation:

- Spawn uses fixed work-group permutation seeded by `(frame_index, system_id, user_seed)`.
- Sim avoids atomics in the hot path; uses `atomicXor` only on free-list under `Free` mode.
- Sort uses radix (deterministic across runs on same GPU, not cross-GPU).
- Cross-link `→ docs/specs/physics/determinism.md` for replay framework.

Cross-GPU bit-exactness: [DECISION NEEDED] likely never. Document as "deterministic per-GPU-model only" (matches `docs/specs/physics/fluid.md` policy).

## Physics integration

- **Depth-buffer collision (cheap).** Sim kernel samples scene depth; if particle Z > depth, reflect or kill. Sub-pixel precision lost — fine for smoke, sparks. Per-particle cost ~0.5 µs at 1080p.
- **Mesh SDF collision (accurate).** Pre-baked SDF texture per major collider. Per-particle cost ~2 µs.
- **2D-grid SPH coupling (cheap fluid).** Particles read a small fluid density texture (256 × 256, updated by CPU SPH at 30 Hz) and accumulate drag toward fluid velocity. Two-way: heavy particles deposit momentum back to the fluid grid. → `docs/specs/physics/fluid.md` "non-authoritative visual fluid" path.

## Audio integration

- **Per-particle event budget.** GPU sim emits collision events into a ring buffer; CPU consumes at most N events/frame (default 256) and triggers audio.
- **LOD audio.** Events from distant LOD particles are downsampled by distance (1 event per cluster of M particles).
- → `docs/specs/audio/overview.md` for the event consumer side.

## Public API

```toml
[style.particles_heavy]
enabled         = true
capacity        = 10_000_000    # particles in flight (memory budget = capacity * ~130 B)
determinism     = "free"        # "free" | "seeded"
sort_transparent = true
compact_every   = 8             # frames
lod_distances   = [50.0, 200.0, 1000.0]  # L1, L2, L3 meters
collide_depth   = true
collide_sdf     = false         # opt-in, requires baked SDFs
fluid_couple_2d = false         # opt-in, requires fluid density texture
audio_events_per_frame = 256

[style.particles_heavy.impostor]
atlas_views     = 64            # 8×8 view-angle atlas
soft_blend      = true          # depth-aware blend against opaque scene
```

```rust
pub struct HeavyParticleSystem { /* GPU handles */ }

pub struct HeavyEmitterDesc {
    pub asset: VfxHandle,           // shares author-time DAG with baseline particles
    pub transform: Transform,
    pub spawn_rate: f32,            // particles/sec
    pub burst: Option<u32>,
    pub determinism: Determinism,
}

impl Renderer {
    pub fn create_heavy_system(&mut self, capacity: u32) -> HeavyId;
    pub fn add_heavy_emitter(&mut self, sys: HeavyId, desc: HeavyEmitterDesc);
    pub fn heavy_telemetry(&self, sys: HeavyId) -> HeavyTelemetry;
}

pub struct HeavyTelemetry {
    pub alive: u32,
    pub spawned_this_frame: u32,
    pub killed_this_frame: u32,
    pub fragmentation_pct: f32,
    pub sim_ms: f32,
    pub sort_ms: f32,
    pub render_ms: f32,
    pub draw_calls: u32,
}
```

## Performance Contract

| Metric | Target (desktop dGPU) | Target (Steam Deck) | Hard limit |
|---|---|---|---|
| Live particles | 10M | 1M | 100M |
| Sim cost (10M, mixed LOD) | < 2.0 ms | < 8.0 ms | < 5.0 ms |
| Sort cost (1M transparent) | < 0.8 ms | < 3.0 ms | < 2.0 ms |
| Compaction cost (every 8 fr) | < 1.5 ms amortized | < 5.0 ms | < 3.0 ms |
| Render cost (10M opaque impostors) | < 1.5 ms | < 6.0 ms | < 4.0 ms |
| Draw calls per system | 1 (indirect) | 1 | 4 |
| GPU memory per 1M particles (base attrs) | ~130 MB | ~130 MB | 256 MB |
| End-to-end frame budget for 10M particles only | < 6.0 ms | < 20 ms | < 12 ms |

`[BENCHMARK NEEDED]` — WebGPU on Chrome stable: storage texture and atomic support varies; expect 1M-particle ceiling.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `VFX_HEAVY_CAPACITY` | `capacity` larger than backend SSBO max | Lower capacity or detect and split into multiple systems |
| `VFX_HEAVY_NO_COMPUTE` | Backend lacks compute (e.g., GLES3 fallback) | Drop to `docs/specs/renderer/particles.md` baseline |
| `VFX_HEAVY_FRAGMENTED` | Fragmentation > 60% — emergency compaction stalls | Lower `compact_every` or capacity |
| `VFX_HEAVY_DET_UNAVAILABLE` | `determinism = "seeded"` on backend without sufficient atomics | Force `"free"` or fall back to baseline particles |
| `VFX_HEAVY_AUDIO_OVERFLOW` | Per-frame audio event ring buffer overflow | Increase `audio_events_per_frame` or cluster events |
| `VFX_HEAVY_FLUID_GRID_MISMATCH` | `fluid_couple_2d = true` but no fluid density texture bound | Spawn a `nexus-physics/fluid` 2D grid first |

## Integration Points

- **Renderer (baseline particles)**: shares `.vfx` author format; heavy systems are a render-time pool variant. → `docs/specs/renderer/particles.md`.
- **Physics (determinism)**: opt-in seeded mode aligns with replay framework. → `docs/specs/physics/determinism.md`.
- **Physics (fluid)**: 2D-grid SPH coupling for cheap visual fluid interaction. → `docs/specs/physics/fluid.md`.
- **Styles (2.5D, billboard-3D)**: sprite-particle bridge — heavy systems can render as sprites in a 3D world with depth-aware soft blend. → `docs/specs/styles/2-5d.md`.
- **Audio**: ring-buffer event drain with LOD downsample. → `docs/specs/audio/overview.md`.
- **Agent SDK**: telemetry per system (alive, spawned, killed, fragmentation, sim_ms, sort_ms, render_ms). → `docs/specs/agent/telemetry.md`.

## Test Requirements

- Spawn 10M particles, sustain 60 Hz for 60 s, no frame > 16.6 ms.
- Deterministic mode: same seed → identical alive count and position hash after 1000 frames (same GPU).
- Compaction: artificially fragment to 50%, trigger compact → fragmentation < 5% after one pass.
- Depth-buffer collision: 1M particles falling on a rendered cube → particles stop within 1 px of cube surface.
- 2D-grid fluid coupling: 1M particles in a swirling fluid → drag pulls them along fluid velocity (visible vortex).
- Cross-platform: on integrated GPU (Iris Xe), 1M particles sustain 60 Hz; on Steam Deck, 1M particles sustain 60 Hz.
- Audio events: 10M particles colliding produce no more than `audio_events_per_frame` triggers; cluster-downsample working.

## Prior Art

- Returnal (Housemarque) — GPU-resident bullet-hell particles + soft particle compositing. [VERIFY — Housemarque GDC 2022 talk URL].
- Geometry Wars 3 (Lucid Games) — millions of particle bullets at 60 Hz on Xbox One. [VERIFY — Bizarre Creations / Lucid talk URL].
- Resogun (Housemarque) — voxel-particle decomposition of enemies. [VERIFY — Housemarque 2014 GDC URL].
- Unity VFX Graph — production proof of GPU-driven particle authoring. [VERIFY — Unite docs URL].
- UE5 Niagara — production proof of GPU-particle scale. [VERIFY — Epic docs URL].
- "GPU Pro" series, particle chapters — sort + compaction patterns reused here.
- *Inspired by*: nVidia FleX (deprecated) — unified particle solver concept; not used directly (license/closed).

## Open Questions

- `[DECISION NEEDED]` Ship a unified VFX graph that targets both baseline particles AND heavy particles (one author-time format) — vs separate `.vfx` and `.vfx-heavy`? Lean unified: same DAG compiles to either backend per emitter capacity.
- `[BENCHMARK NEEDED]` Pin the exact LOD distances. Current defaults are placeholders.
- `[DECISION NEEDED]` Mobile fallback strategy: refuse heavy systems above 1M, or auto-degrade to baseline particles?
- `[DECISION NEEDED]` Mesh-SDF baking — in `nexus-assets/import` or in a new `nexus-particles-sdf-baker`?
- `[BENCHMARK NEEDED]` 100M-particle test scene — does any non-workstation GPU run it? Possibly ship only as a stress demo.
- `[DECISION NEEDED]` Per-particle audio event budget tuning — likely too low at 256/frame for bullet hells; bench 1024/frame.
