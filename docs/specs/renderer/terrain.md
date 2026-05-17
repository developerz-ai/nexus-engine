<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Terrain

> Virtual, streaming, GPU-driven terrain. Quadtree of tiles with CDLOD-style continuous LOD; virtual textures for material/heightfield/splat data; supports km-scale open worlds with seamless detail.

## Boundaries

- Owns: terrain tile system, heightfield storage, virtual texture page table, LOD selection, geometry generation, terrain shading entry.
- Does NOT own:
  - Foliage / scatter instancing → `[DECISION NEEDED]` separate `vegetation.md` or part of particles?
  - Physics heightfield collision → `docs/specs/physics/collision.md` [AGENT: 05] consumes heightfield directly.
  - Water / oceans → `[DECISION NEEDED]` separate spec.
  - Terrain authoring tools → `docs/specs/editor/scene.md` [AGENT: 11].
- Depends on:
  - `docs/specs/assets/streaming.md` [AGENT: 09] for tile streaming.
  - `docs/specs/renderer/shaders.md` for terrain shader permutations.
  - `docs/specs/renderer/shadows.md` (terrain participates in VSM page allocation).

## Architecture

```
World Quadtree (root = entire world, e.g., 64 km × 64 km)
              ┌─────────────────────────┐
              │            R            │   level 0 (1 tile, very low res)
              └─────────────────────────┘
                          │ subdivide on demand
              ┌─────┬─────┬─────┬─────┐
              │  A  │  B  │  C  │  D  │   level 1 (4 tiles)
              └─────┴─────┴─────┴─────┘
                       ...
                          ▼
              Leaf tile (e.g., 64 m × 64 m, 256 m × 256 m)
                  ↓ each leaf holds:
                  · heightfield        (R16  256×256)
                  · normal             (RG8  256×256, derived)
                  · splat / material   (RGBA8 256×256)
                  · color              (BC1   256×256, optional)
                  · physics collision  (downsampled height)

LOD selection (CDLOD):
   per-quadtree-node morph factor based on view distance
   → mesh vertices smoothly morph toward parent LOD, no cracks
   → uniform-grid patch mesh reused across all tiles (single VB)
```

## Geometry

Single shared patch mesh: a 65×65 uniform grid (4225 verts). Per-tile instance attributes:

```c
struct TileInstance {
    vec4 world_min_xz_size;   // world origin XZ + tile size
    vec4 lod_morph;           // current lod, parent lod, morph_range, _
    uint heightfield_page;    // page index in virtual height texture
    uint splat_page;          // page index in virtual splat texture
    uint flags;
    uint _pad;
};
```

Vertex shader displaces grid by sampling heightfield (per-tile virtual texture page) and morphs toward parent LOD using `lod_morph.z`.

GPU-driven culling: compute pass builds visible tile list per frame from quadtree traversal (frustum + max-error). Indirect MultiDraw emits all visible tiles in one draw call (Tier 2+); fallback issues per-tile draws.

## Virtual Texturing

Page table on GPU; physical pages in shared atlases per channel (height / splat / color).

```
Virtual addr = (tile_x, tile_y, lod, channel)
       │
       ▼ page table lookup
       │
       ▼
Physical page (in atlas) ──► sample with anisotropic + manual derivative correction
```

Page residency:

```
Visibility feedback pass (1/8 res):
   write needed virtual addresses to a uint buffer
        │
        ▼
   CPU collects unique requests, queues async loads
        │
        ▼
   Streamed pages uploaded to atlas (LRU eviction)
        │
        ▼
   Page table updated next frame
```

Until a page is resident, sampler returns parent-LOD page (always resident at low LODs). No pop because morph is smooth.

## Material Layering

Splat map: 4 channels weight up to 4 material layers per tile. Layers reference standard PBR materials (`docs/specs/renderer/pbr.md`). Triplanar option for cliff/steep regions.

```
final_albedo  = Σ weight_i * albedo_i        (height-aware blend optional)
final_normal  = blend(normals)               (reoriented normal mapping)
final_rough   = Σ weight_i * roughness_i
```

Up to 8 layers per terrain via two stacked splat tiles (Tier 3) — `[BENCHMARK NEEDED]`.

## Streaming

```
Predictive streamer: project camera 2 s forward at current velocity → request
                     tiles & VT pages along predicted path
Priority   :  level (LOD) × screen coverage × visibility
Budget     :  configurable bytes/sec from disk
Disk format:  zstd-compressed chunks; mesh shader-friendly arrangement
```

## Public API

```rust
pub struct Terrain { /* opaque */ }

pub struct TerrainConfig {
    pub world_size_m: f32,           // total square world side
    pub tile_size_m: f32,            // leaf tile side
    pub max_lod: u8,                 // quadtree depth
    pub heightfield_resolution: u32, // per-tile, must be 2^n + 1 (e.g. 257)
    pub vt_atlas_size: u32,          // pixels per channel atlas
    pub max_layers: u8,              // 4 (T2) or 8 (T3)
    pub streaming_budget_mb_s: u32,
}

impl Renderer {
    pub fn create_terrain(&mut self, cfg: TerrainConfig) -> Result<TerrainId, RendererError>;
    pub fn load_terrain_chunk(&mut self, id: TerrainId, chunk: &TerrainChunkData);
    pub fn paint_terrain(&mut self, id: TerrainId, brush: BrushOp);  // editor / dynamic
    pub fn sample_height(&self, id: TerrainId, world_xz: Vec2) -> Option<f32>; // CPU
}
```

## Performance Contract

| Metric                                            | Target          | Hard limit         |
|---------------------------------------------------|-----------------|--------------------|
| Visible terrain draw cost (1080p, 10 km view)     | < 1.5 ms        | < 4.0 ms           |
| Tile culling compute pass (4096 candidate tiles)  | < 0.2 ms        | < 0.6 ms           |
| VT page residency (steady, mid GPU)               | ≥ 99%           | ≥ 95%              |
| Page upload throughput                            | ≥ 200 MB/s      | ≥ 64 MB/s          |
| Memory: VT atlases total (default)                | 512 MB          | 1.5 GB             |
| Memory: streamed leaf cache                       | 256 MB          | 1 GB               |
| CPU sample_height latency                         | < 1 µs          | < 5 µs             |
| Max world size                                    | 256 km          | 1024 km            |

## Error Contract

| Code                          | Meaning                              | Caller action                   |
|-------------------------------|--------------------------------------|---------------------------------|
| `TERRAIN_VT_PAGE_MISSING`     | Sampler hit non-resident page repeatedly | Increase budget or pre-warm |
| `TERRAIN_STREAM_BACKPRESSURE` | Disk can't keep up with prediction   | Slow camera or shrink prefetch  |
| `TERRAIN_ATLAS_FULL`          | Physical atlas at capacity           | Increase budget or evict        |
| `TERRAIN_CONFIG_INVALID`      | Non-power-of-two or out-of-range     | Fix config and reload           |
| `TERRAIN_INDIRECT_UNAVAILABLE`| Backend lacks MDI                    | Fall back to per-tile draws     |

## Integration Points

| System     | Contact                                                                              |
|------------|--------------------------------------------------------------------------------------|
| Assets     | `.nxterr` chunks streamed via asset pipeline.                                        |
| Physics    | Heightfield shared zero-copy as `HeightFieldCollider` source.                        |
| Shadows    | Tile bounding boxes feed CSM/VSM culling.                                            |
| GI         | Terrain participates in SDF / surface cache; large heightfield → low-res SDF tiles.  |
| Editor     | Sculpt + paint brushes call `paint_terrain`; live VT update.                         |
| Agent SDK  | Headless `sample_height` accessible from agent API for navmesh/AI queries.           |
| Navmesh    | Provides walkable heightfield → `docs/architecture/02-system-map.md` [AGENT: 01].    |

## Test Requirements

- Render 64 km world, fly straight at 200 m/s → no LOD pops above 1 px, no missing VT page sticks > 1 s.
- Cracks: traverse all LOD boundaries → zero T-junctions visible (CDLOD morph correct).
- VT page request → upload → sample round trip occurs within 2 frames at default budget.
- Headless: deterministic camera path produces deterministic visible-tile list across runs.
- Physics: `sample_height` (CPU) matches GPU vertex height within ε for any world position.
- Paint brush dirties exactly the affected VT pages; non-affected pages untouched.

## Prior Art

- Hoppe et al. "Geometry Clipmaps" ✓ baseline streaming structure.
- "CDLOD" (Filip Strugar, Intel) ✓ smooth morph LOD, default v1.0 approach.
- UE5 Nanite-virtualized-geometry ✓ aspirational; terrain-specific subset.
- id Tech 5 / Rage virtual texturing ✓ originator of mega-textures.
- Frostbite procedural terrain talks ✓ splat blending best practices.
- Bevy's planned terrain plugin ✓ Rust patterns to align with.
- NVIDIA GPU Gems 2 ch.2 "Geometry Clipmaps on GPU" ✓ classic reference.

## Open Questions

- `[DECISION NEEDED]` CDLOD vs. clipmaps vs. Nanite-like cluster terrain. CDLOD chosen for v1.0 simplicity; revisit for v2.0.
- `[DECISION NEEDED]` Tessellation-shader path for displacement on Tier 3 — better silhouette, no morph needed.
- `[DECISION NEEDED]` 3D terrain (caves/overhangs) — punt to voxel system (separate spec) for v1.1+.
- `[BENCHMARK NEEDED]` Atlas size sweep on mobile (VRAM-constrained).
- `[DECISION NEEDED]` Foliage scattering co-located with terrain pipeline or separate `scatter.md`?
- `[DECISION NEEDED]` Heightfield format: R16 (65k steps) sufficient or R32F required for extreme worlds?
- `[DECISION NEEDED]` Editor brush ops applied CPU-side then re-uploaded vs. GPU compute in place.
