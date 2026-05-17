<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# LOD & Virtual Geometry

> Automatic discrete-LOD chain for every imported mesh, plus an opt-in virtual-geometry path (meshlet hierarchy + cluster culling, UE5 Nanite-inspired) for assets that need pixel-scale detail.

## Boundaries

- Owns: simplification, meshlet generation, BVH/DAG build, page packing for streamed clusters, screen-coverage LOD selector, impostor billboard generation.
- Does NOT own: GPU-side cluster culling shaders (`→ docs/specs/renderer/overview.md`), shadow virtual geometry (`→ docs/specs/renderer/shadows.md`), terrain LOD (`→ docs/specs/renderer/terrain.md`).
- Depends on: `→ import.md` (mesh IR), `→ compression.md` (per-LOD encoding), `→ streaming.md` (page tiering), `→ docs/contracts/renderer-assets.md` (cluster upload format).

## Two Paths

```
   mesh IR
      │
      ├── path A: DISCRETE LOD CHAIN (default)
      │        meshopt_simplify ×N → {L0,L1,L2,L3}
      │        + impostor billboard (L_imp)
      │
      └── path B: VIRTUAL GEOMETRY  (opt-in via ImportOpts.virtual_geometry)
               cluster → simplify → group → recurse
               → meshlet DAG + page-stream blobs
```

Path A is universally supported (mobile, web, low-end). Path B falls back to path A's chain on hardware without mesh shaders or where budget excludes virtual geometry.

## Path A — Discrete LOD Chain

Algorithm (per source mesh):
1. Optimize vertex/index order: `meshopt_optimizeVertexCache`, `meshopt_optimizeOverdraw`, `meshopt_optimizeVertexFetch`.
2. Build L0 = optimized source.
3. For `i in 1..N`: `meshopt_simplify(target_ratio = 0.5^i, target_error = ε_i)` producing reduced index buffer over shared vertex pool.
4. Vertex stream quantization → `KHR_mesh_quantization` compatible. `→ compression.md`.
5. Optional impostor billboard at distance > `d_imp`: 8-view octahedral RGBA + normal.

Defaults: `N = 4` LODs, ratios `{1.0, 0.5, 0.25, 0.0625}`, `ε` ramps with distance. Overridable per asset.

### LOD Selection (CPU/GPU)

```
screen_height_px = (radius_world / dist_world) · (viewport_h / (2 · tan(fovy/2)))
target_lod       = clamp( floor( log2(threshold / screen_height_px) ), 0, N-1 )
```

`threshold ≈ 8` pixels by default (Nanite-inspired "~1 pixel per triangle" goal at L0). Stylized presets may tune higher for performance.

## Path B — Virtual Geometry (Nanite-Inspired)

Goal: render assets with effectively unbounded triangle counts by streaming cluster pages and selecting per-cluster LOD that yields ~1 triangle per screen pixel.

Reference: Brian Karis, Rune Stubbe, Graham Wihlidal — "Nanite: A Deep Dive", SIGGRAPH 2021 Advances in Real-Time Rendering (`advances.realtimerendering.com/s2021/Karis_Nanite_SIGGRAPH_Advances_2021_final.pdf`).

### Build Pipeline (offline, deterministic)

```
mesh IR
   │
   ▼  meshopt_buildMeshlets   ─ clusters of ~128 vertices / ~128 triangles
clusters L0
   │
   ▼  group clusters spatially (k-way, BVH)
   ▼  simplify each group (meshopt_simplifyWithLockedBorder)
   ▼  re-cluster the simplified geometry  → clusters L1
   ... recurse until single root cluster
   │
   ▼ DAG of clusters with parent/child relationships and per-cluster error bounds
   │
   ▼ pack clusters into 128 KB pages, group pages by spatial locality
   │
   ▼ write to .nxa as streamable region table
```

Per-cluster metadata (deterministic, hashable):
```
{ bbox, sphere, parent_error, group_error,
  triangle_count, vertex_count,
  page_id, page_offset, page_size,
  material_index }
```

### Runtime Selection (GPU-driven)

```
choose-cut: walk DAG top-down; for each cluster c:
    if  project(c.error_bound) < threshold_px  →  use c
    else                                          → descend to children
```
- Cut is consistent: parents/children never both selected → no cracks at seams (Karis: edges are stitched at simplification time using locked borders).
- Cluster culling: HZB occlusion + frustum + backface, per-cluster, on GPU. `→ docs/specs/renderer/overview.md`.

### Streaming Integration

- Pages are `Streamed` tier (`→ streaming.md`).
- Working-set request driven by GPU feedback buffer (which clusters/pages were referenced).
- Cold cluster → render parent (lower-LOD already resident) until child page arrives. No pop in: parent error already bounds child.

### Constraints

- Static meshes only in v1.0 (matches Karis 2021).
- Material count per cluster ≤ 1 (cluster split at material seams during build).
- Skinned + animated paths use path A.
- Hardware: requires storage buffers + 32-bit atomics. Mesh shaders preferred (Vulkan/DX12/Metal3) but compute fallback supported.

## Impostor Billboards

For `dist > d_imp` even with virtual geometry, render a single quad sampled from a pre-baked octahedral atlas. Generated automatically when `ImportOpts.impostor = true` (default for static props).

## Public API

```rust
// build-time
fn build_discrete_lods(ir: &MeshIR, opts: LodOpts) -> LodChain;
fn build_virtual_geometry(ir: &MeshIR, opts: VgOpts) -> VgDag;
fn build_impostor(ir: &MeshIR, opts: ImpostorOpts) -> ImpostorAtlas;

// runtime (renderer-facing)
fn select_discrete(chain: &LodChain, screen_h_px: f32) -> u8;
fn select_virtual_cut(dag: &VgDag, view: &View, out: &mut Vec<ClusterId>);
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Discrete LOD build (100k tri mesh) | 80 ms | 500 ms |
| Virtual geometry build (1M tri mesh) | 4 s | 20 s |
| Virtual geometry build (10M tri mesh) | 30 s | 180 s |
| Cluster cut selection (1M visible clusters) | < 0.5 ms (GPU) | 2 ms |
| Cluster page (128 KB) decode | 0.2 ms | 1 ms |
| Triangles per screen-pixel | 0.7 – 1.5 | < 4 (perf budget) |
| LOD pop visible cases | 0 | 0 (cut consistency guarantees) |
| Impostor build per asset | 200 ms | 1 s |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_LOD_MESH_TOO_SMALL` | Source < 64 tri, no LOD generated | Use as-is |
| `E_VG_UNSUPPORTED` | Source skinned or has overlapping UVs preventing simplification | Use path A |
| `E_VG_HARDWARE` | GPU lacks required features at runtime | Auto-falls back to path A |
| `W_LOD_HIGH_ERROR` | Requested ratio exceeds geometric error budget | Lower ratio or accept |

## Integration Points

- Renderer: cluster culling compute + visibility buffer rendering (`→ docs/contracts/renderer-assets.md`, `→ docs/specs/renderer/overview.md`).
- Shadows: virtual geometry shares meshlet hierarchy with virtual shadow maps (`→ docs/specs/renderer/shadows.md`).
- Streaming: pages routed through `Streamed` tier (`→ streaming.md`).
- Editor: LOD overview shows chain + per-LOD stats; VG path shows DAG depth and resident page count (`→ docs/specs/editor/debug.md`).
- Agent: `assets.lod_stats` exposes per-asset chain metadata (`→ docs/specs/agent/api.md`).

## Test Requirements

- Discrete LOD chain monotonically reduces tri count; each level renders without holes.
- VG cut consistency: synthetic test enumerates 1k camera views, asserts no T-junction cracks at cluster borders.
- VG falls back to path A when mesh-shader extension absent; renders identically (within shading epsilon).
- Reimport produces byte-identical DAG (deterministic build).
- 10M-triangle "kitbash scene" demo holds 60 fps at 1080p on mid-tier desktop. [BENCHMARK NEEDED]

## Prior Art

- UE5 Nanite (Karis et al., SIGGRAPH 2021) ✓ — cluster DAG + screen-error cut. Conceptual reference, not code.
- meshoptimizer (`zeux/meshoptimizer`) ✓ — `simplify`, `buildMeshlets`, `simplifyWithLockedBorder`, `simplifyWithUpdate` are the build-time backbone.
- Geometry Images / virtual texturing analog ✓ — page-streaming pattern.
- Discrete LODs in Unity / Unreal ✗ — manual authoring required, source of bugs. Nexus generates automatically.
- Imposter atlases (per Wahlqvist / Dreams) ✓ — far-distance fallback.

## Open Questions

- [DECISION NEEDED] Skinned virtual geometry — research path, defer past v1.0?
- [DECISION NEEDED] Software raster path (for sub-pixel triangles) — required for "1 tri / pixel" on lower-end GPUs?
- [DECISION NEEDED] Material count > 1 per cluster: allow via cluster atlas (UE5-style) or strict 1-mat?
- [BENCHMARK NEEDED] Build-time budget on CI for the demo asset set.
