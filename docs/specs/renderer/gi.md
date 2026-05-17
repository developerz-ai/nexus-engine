<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Global Illumination

> Two-tier GI: a Lumen-inspired dynamic GI path (surface cache + SDF/RT tracing) for Tier 3 GPUs, and a precomputed baked lightmap + irradiance volume path as the universal fallback. Same shading API in both.

## Boundaries

- Owns: indirect diffuse beyond IBL, indirect specular beyond IBL, GI cache update, baked lightmap eval.
- Does NOT own:
  - IBL environment evaluation → `docs/specs/renderer/pbr.md`.
  - Distance-field generation (shared with shadows/physics queries) → `docs/specs/assets/lod.md` [AGENT: 09].
  - Direct lighting / shadows → pbr.md, shadows.md.
- Depends on:
  - `docs/specs/renderer/backend.md` capability tier (dynamic path needs Tier 3).
  - `docs/specs/assets/overview.md` [AGENT: 09] for lightmap UV bake outputs.
  - `docs/contracts/renderer-assets.md` [AGENT: 14] for SDF mesh assets.

## Architecture

```
                         Scene
                           │
       ┌───────────────────┴────────────────────┐
       │                                        │
   DYNAMIC GI (Tier 3)                  BAKED GI (universal)
   "lumen-style"                        "lightmaps + probes"
       │                                        │
       ▼                                        ▼
 ┌───────────────────┐                 ┌──────────────────────┐
 │  Surface Cache    │                 │  Lightmap atlas      │
 │  (cards per mesh, │                 │  (per static mesh,   │
 │   low-res lit)    │                 │   2nd UV channel)    │
 └────────┬──────────┘                 └──────────┬───────────┘
          │                                       │
   ┌──────┴──────────┐                            │
   ▼                 ▼                            ▼
 SDF trace      Hardware RT             Irradiance volume probes
 (mesh SDF +    (BVH, optional,         (3D grid, SH9 or SH3,
  global SDF)    HW-RT capable)          editor-placed or auto)
          │                                       │
          └──────────────┬────────────────────────┘
                         ▼
                  Indirect diffuse  +  indirect specular
                         │
                         ▼
                   Lit shader        — same gather API
```

## Dynamic Path (Lumen-inspired)

Adapted concept; no UE5 code, only public talks (Krzysztof Narkowicz 2022 SIGGRAPH; Daniel Wright UE5 launch reveal).

1. **Surface Cache.** Each opaque mesh exposes "cards" — orthographic projections of its faces baked at low resolution (64–512 px per card). Cards store material attributes (albedo, normal, emissive, depth). Rebuilt only on geometry change.
2. **Direct lighting injection.** Each frame, sun + tracked lights are evaluated into surface-cache cards (compute pass, ≤ N cards/frame budget).
3. **Tracing.** Final-gather rays from screen pixels (1/2 or 1/4 res):
   - First, **screen-space trace** (HiZ) for nearby hits.
   - On miss, **SDF trace** against per-mesh SDF; fall through to global SDF for distant rays.
   - On HW-RT-capable GPU, optional **BVH ray query** path replaces SDF (better thin-feature accuracy).
4. **Hit shading.** Sample surface cache at hit point.
5. **Spatial + temporal filter.** SVGF-style denoiser → full-res reconstruction.
6. **Apply.** Indirect diffuse term added in lit shader.

```
[BENCHMARK NEEDED] surface cache budget per frame (cards updated)
[BENCHMARK NEEDED] trace ray count (target ≤ 1 ray / 4 px / frame, denoised)
```

Indirect specular (dynamic): screen-space reflection (SSR) for short rays + surface-cache fallback or RT reflection on Tier 3+.

## Baked Path (universal)

Authoring workflow:

```
Static meshes ─► Auto UV2 unwrap ─► Lightmap atlas (e.g., 4096²)
                                                │
                                                ▼
              CPU/GPU path tracer (offline) ──► HDR irradiance + directional component
                                                │
                                                ▼
                                          Lightmap textures (BC6H HDR)
                                                │
Dynamic meshes ─► sample nearest irradiance probe (SH9 or SH3)
                  trilinear in 3D probe grid (per-room or world)
```

- Format: BC6H HDR for atlas; SH9 RGB per probe.
- Directional component: HL2-basis (3 axes) or Enlighten-style ambient cube — `[DECISION NEEDED]`.
- Bake backend: shared with offline path tracer used for reference renders; can run on GPU via wgpu compute.

## Public API

```rust
pub enum GiMode { Off, Baked, Dynamic, BakedPlusDynamicSpec }

pub struct GiConfig {
    pub mode: GiMode,
    pub quality: GiQuality,                // Low | Medium | High | Cinematic
    pub probe_spacing_m: f32,              // baked irradiance grid
    pub lightmap_atlas_size: u32,
    pub dynamic_resolution_scale: f32,     // 0.25 .. 1.0
    pub use_hw_rt: bool,                   // overrides SDF trace
}

impl Renderer {
    pub fn bake_static_gi(&mut self, scene: &Scene, cfg: &BakeConfig)
        -> Result<BakeReport, RendererError>;
    pub fn invalidate_surface_card(&mut self, mesh: MeshHandle);
}
```

## Performance Contract

| Metric                                              | Target          | Hard limit         |
|-----------------------------------------------------|-----------------|--------------------|
| Dynamic GI total cost (1080p, Tier 3)               | < 4.0 ms        | < 8.0 ms           |
| Surface card update budget per frame                | ≤ 64 cards      | ≤ 256              |
| SDF trace cost (1/4 res, 1 ray/px)                  | < 1.5 ms        | < 3.0 ms           |
| Denoiser (SVGF-style)                               | < 1.0 ms        | < 2.5 ms           |
| Baked path: probe sample cost (per pixel)           | < 4 ALU + 8 tex | < 8 ALU + 16 tex   |
| Lightmap memory (1 km² scene, 1 lux/cm density)     | < 256 MB        | < 1 GB             |
| Bake time (medium scene, GPU path tracer)           | < 5 min         | < 30 min           |

## Error Contract

| Code                        | Meaning                                | Caller action                   |
|-----------------------------|----------------------------------------|---------------------------------|
| `GI_DYNAMIC_UNAVAILABLE`    | Tier < 3 or RT/SDF missing             | Fall back to baked              |
| `GI_LIGHTMAP_NOT_BAKED`     | Static GI requested but no bake found  | Trigger bake or fall back IBL   |
| `GI_PROBE_OUT_OF_BOUNDS`    | Dynamic object outside probe grid      | Use nearest probe, log warning  |
| `GI_BAKE_FAILED`            | Path tracer error (NaN, OOM)           | Report scene, abort bake        |
| `GI_SURFACE_CACHE_EXHAUSTED`| Card budget exceeded                   | Increase budget or drop quality |

## Integration Points

| System    | Contact                                                                            |
|-----------|------------------------------------------------------------------------------------|
| Assets    | SDF generation hooks into mesh import → `docs/specs/assets/import.md` [AGENT: 09]. |
| Editor    | Probe placement tool, bake button → `docs/specs/editor/scene.md` [AGENT: 11].      |
| PBR       | Lit shader calls `gi_sample_diffuse(N, P)` regardless of underlying mode.          |
| Shadows   | Dynamic GI can re-use VSM data to skip occluded rays.                              |
| Terrain   | Terrain shading samples GI through the same API; large-scale clipmap-aware.        |
| Agent SDK | Bake job runs headless via `nexus bake --gi` (see agent/headless.md).              |

## Test Requirements

- Cornell-box reference: dynamic mode within RMSE 8% of offline reference.
- Static scene + bake: relighting matches probe-only path within tolerance.
- Capability fallback: force Tier 2 → renderer never selects dynamic path.
- Probe grid trilinear: probe values constant → identical color everywhere (no banding > 1/255).
- Surface card invalidation: moving an entity flips invalidate bits for affected cards only.
- Bake determinism: same scene + same seed → identical lightmap hash.

## Prior Art

- UE5 Lumen ✓ surface cache + dual SDF/RT tracing (concept reused, no code).
- UE4 ILC (Indirect Lighting Cache) ✓ probe grid for dynamics.
- DDGI (Majercik et al., NVIDIA 2019) ✓ dynamic irradiance volumes, viable mid-tier alternative.
- Enlighten ✓ precomputed radiance transfer for dynamic lighting on static geo.
- SVGF (Schied et al.) ✓ spatiotemporal denoiser for sparse ray budgets.
- Frostbite Real-Time Global Illumination by Precomputed Local Reconstruction ✓ probe interpolation.

## Open Questions

- `[DECISION NEEDED]` DDGI as a third tier (between baked and Lumen-style) for Tier 2 GPUs?
- `[DECISION NEEDED]` Surface card authoring — auto-generated only, or allow artist override?
- `[BENCHMARK NEEDED]` SDF memory cost for a 1 km² open world (global SDF resolution sweep).
- `[DECISION NEEDED]` Bake backend: own GPU path tracer vs. shell out to Blender Cycles for v1.0.
- `[DECISION NEEDED]` Sky GI: separate skylight path or unified into IBL probe?
- `[DECISION NEEDED]` Per-pixel motion vectors needed for GI denoiser → coordination with TAA → post.md.
