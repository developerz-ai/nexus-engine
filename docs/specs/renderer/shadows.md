<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Shadows

> Cascaded shadow maps for directional lights; UE5-inspired virtual shadow maps (VSM) as opt-in high-end path; spot/point use cubemap or paraboloid SM. All paths use the same filtering API.

## Boundaries

- Owns: shadow map generation, cascade fitting, page allocation (VSM), shadow sampling/filtering API.
- Does NOT own:
  - Light parameters / lifecycle → `docs/specs/renderer/pbr.md`.
  - Mesh culling primitives → renderer/overview.md graph nodes call into ECS.
  - Ambient occlusion → `docs/specs/renderer/post.md`.
- Depends on:
  - `docs/specs/renderer/backend.md` (capability tiers: VSM requires Tier 3 atomics, large 2D arrays).
  - `docs/specs/renderer/overview.md` (shadow nodes inserted into render graph).

## Architecture

Three paths:

```
DirectionalLight ────► CSM (default)   or   VSM (Tier 3 opt-in)
SpotLight        ────► 2D shadow map (one per light, atlased)
PointLight       ────► Cube shadow map (6 faces) or dual-paraboloid (mobile)
```

### Cascaded Shadow Maps (CSM)

```
                Camera frustum
       ┌─────────────────────────────────┐
       │  C0 (near)  │ C1 │ C2 │   C3    │   default: 4 cascades
       └─────────────────────────────────┘
              │       │     │      │
              ▼       ▼     ▼      ▼
            2048²   2048² 2048²  2048²    typical desktop (Tier 2)
            1024²   1024² 1024²  1024²    mobile (Tier 1)

Split scheme: PSSM-style log+uniform blend (λ = 0.7 default).
Stable cascades: snap shadow-space origin to texel-size increments
                 → no shimmering on camera rotation.
PCF kernel : 3x3 default; PCSS optional with blocker search.
Cascade transition: 5%–10% range alpha blend in shader to hide seams.
```

### Virtual Shadow Maps (VSM) — UE5-inspired

Conceptual 16k×16k logical map per light, subdivided into 128×128 pages, with only requested pages physically resident.

```
   Logical address (16k×16k)            Physical page pool (shared)
   ┌───────────────────────┐            ┌────────────────────────┐
   │ ░░░░░░░░░░░░░░░░░░░░░ │   page     │ ████ ████ ████ ████    │   8k×8k atlas
   │ ░░░░░░░░░░░░░▓░░░░░░░ │ ────────►  │ ████ ████ ████ ████    │
   │ ░░░░░░░░░░░░░░░░░░░░░ │  table     │ ████ ████ ████ ████    │
   │ ░░░░░░░░░░░░░░░░░░░░░ │  lookup    │ ████ ████ ████ ████    │
   └───────────────────────┘            └────────────────────────┘
   directional = clipmap stack:
     each level halves resolution, doubles radius around camera
     levels 0..7 typical

Frame steps:
   1. Visibility pass        : screen-space → which logical pages are needed
   2. Allocate / evict pages : LRU on page pool
   3. Mark invalidated pages : dynamic objects, light movement
   4. Render dirty pages     : geometry shader / instanced draw into physical page
   5. Sample shadow          : virtual address → page table → physical UV
```

VSM gates: requires shader atomics, 16k×16k page table buffer, ≥ Tier 3 capability.

### Spot / Point

| Light  | Map type                 | Default res | Notes                                       |
|--------|--------------------------|-------------|---------------------------------------------|
| Spot   | 2D atlas slot            | 1024²       | atlas size = `[BENCHMARK NEEDED]`           |
| Point  | Cube (6 × 1024²)         | 1024²       | mobile fallback: dual-paraboloid (2 × 1024²)|

Atlas: all per-frame shadow maps for non-CSM lights packed into a single 8k×8k R32F (Tier 2) or D32F (Tier 3) atlas. Allocation = LRU + importance score (light intensity × screen coverage).

## Filtering

| Filter | Cost   | Quality | When                                  |
|--------|--------|---------|---------------------------------------|
| Hard   | 1 tap  | Hard edge | Mobile low; per-pixel cost critical |
| PCF 3×3| 9 taps | Soft    | Default                               |
| PCF 5×5| 25 taps| Softer  | High quality preset                   |
| PCSS   | 32+    | Soft, contact-hardening | Cinematic preset    |
| EVSM   | 4 taps + filter | Soft, prefilterable | High-quality grass/foliage |

Filter implementations live in a single `shadow_sample.wgsl` module included by every lit shader; the filter constant is a shader define → permutation system handles it (`docs/specs/renderer/shaders.md`).

## Public API

```rust
pub enum ShadowKind { Csm { cascades: u8, resolution: u32 },
                       Vsm { clipmap_levels: u8 },
                       Spot { resolution: u32 },
                       Cube { resolution: u32 } }

pub struct ShadowConfig {
    pub kind: ShadowKind,
    pub filter: ShadowFilter,
    pub bias: f32,
    pub normal_bias: f32,
    pub slope_bias: f32,
    pub csm_split_lambda: f32,    // 0.0 uniform .. 1.0 logarithmic
    pub max_distance: f32,
}

pub trait Light {
    fn shadow_config(&self) -> Option<&ShadowConfig>;
}
```

## Performance Contract

| Metric                                                   | Target          | Hard limit       |
|----------------------------------------------------------|-----------------|------------------|
| CSM 4×2048², 50k triangles, GPU                          | < 1.5 ms        | < 4.0 ms         |
| VSM page render (≤ 256 dirty pages)                      | < 2.0 ms        | < 5.0 ms         |
| Spot atlas allocator (≤ 64 lights)                       | < 50 µs CPU     | < 200 µs         |
| PCF 3×3 sample cost in lit shader                        | < 6 ALU + 9 tex | < 12 ALU + 9 tex |
| Shadow memory (CSM, default desktop)                     | 64 MB           | 96 MB            |
| Shadow memory (VSM page pool default)                    | 256 MB          | 512 MB           |
| Max simultaneous shadow-casting lights                   | 64              | 256              |

## Error Contract

| Code                          | Meaning                              | Caller action                   |
|-------------------------------|--------------------------------------|---------------------------------|
| `SHADOW_ATLAS_FULL`           | No space in spot/cube atlas          | Drop lowest-priority light      |
| `SHADOW_VSM_UNAVAILABLE`      | Capability tier < required           | Fall back to CSM                |
| `SHADOW_VSM_POOL_EXHAUSTED`   | Physical page pool full              | Increase budget, drop quality   |
| `SHADOW_CASCADE_INVALID`      | Bad split / NaN cascade matrix       | Reset to defaults               |

## Integration Points

| System       | Contact                                                                                |
|--------------|----------------------------------------------------------------------------------------|
| ECS          | Reads `Camera`, `DirLight`, `SpotLight`, `PointLight`, `MeshHandle`, `ShadowCaster`.   |
| PBR          | Provides `shadow_sample(world_pos, light_id)` to lighting loop.                        |
| Render graph | `ShadowPass` runs after `CullPass`, before `LightingPass`.                             |
| Terrain      | Terrain may inject custom heightfield shadow path → terrain.md.                        |
| Editor       | Shadow debug visualizer: cascade colors, VSM page heatmap.                             |
| Agent SDK    | Telemetry per shadow pass: pages_rendered, atlas_occupancy, draw_calls.                |

## Test Requirements

- CSM stable-cascade test: rotate camera 360° → shadow shimmer Δ ≤ 1 texel per frame.
- PCF 3×3 reference: match precomputed ground-truth penumbra width within 1 px at 1080p.
- VSM round-trip: render 10k objects, each casting tiny shadow → only required pages allocated; no page table overflow.
- VSM invalidation: move a dynamic object → only that object's pages re-rendered next frame.
- Headless determinism: same scene + camera → identical shadow buffer hash across 100 frames.
- Capability fallback: force Tier 2 → renderer never invokes VSM nodes; CSM substituted automatically.

## Prior Art

- Microsoft "Cascaded Shadow Maps" (Dimitrov, NVIDIA) ✓ stable cascades, PCF on cascade boundaries.
- MJP "A Sampling of Shadow Techniques" ✓ filter taxonomy.
- UE5 "Virtual Shadow Maps in Fortnite Chapter 4" (Epic, 2023) ✓ page pool + clipmap design.
- AMD "GPU-Driven Rendering" (Wihlidal) ✓ bindless shadow atlas patterns.
- Stratus VSM article (J Stephano) ✓ sparse VSM implementation notes.
- LearnOpenGL CSM guest article ✓ educational baseline.

## Open Questions

- `[DECISION NEEDED]` VSM in v1.0 (vs. defer to v1.1)? Implementation is large; CSM alone covers most use cases.
- `[DECISION NEEDED]` EVSM as optional path or remove? Cost is light filtering pre-pass + 2-channel storage.
- `[BENCHMARK NEEDED]` Atlas vs. array-texture for non-CSM shadows — atlas is cache-friendly, array is simpler.
- `[DECISION NEEDED]` Per-object shadow bias overrides — useful for grass/foliage; complicates the API.
- `[DECISION NEEDED]` Translucent shadows (colored stained glass): screen-space approximation or full transmission?
- `[DECISION NEEDED]` Ray-traced shadow option on Tier 3 — gates on `BACKEND::supports_ray_query`.
