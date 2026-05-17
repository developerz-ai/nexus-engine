<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Voxel — Overview

> Voxel world subsystem. Chunk-based storage, greedy meshing, GPU-compute remesh on edit, infinite world streaming, ambient occlusion, lighting propagation. Composed from existing Nexus modules. The dev does not build a voxel engine — they `nexus add nexus-voxel-core` and start designing the game.

## Boundaries

- Owns: `Chunk` (16³ default), palette compression, greedy mesher, GPU-compute remesh kernel, voxel AO, voxel light propagation, infinite-world chunk streaming policy, voxel save format.
- Does NOT own: low-level mesh upload (→ `docs/specs/renderer/overview.md`), streaming I/O (→ `docs/specs/assets/streaming.md`), block-physics rigid (→ `docs/specs/physics/rigid.md`), block scripting / behavior (→ `docs/specs/scripting/overview.md`).
- Depends on: `nexus-renderer`, `nexus-assets/streaming`, `nexus-physics/collision` (voxel collider), `nexus-net/replication` (delta-compressed chunks), `nexus-core/ecs`, `nexus-core/jobs`.

## Composes (the whole point)

| Existing Nexus module | Purpose in voxel subsystem |
|---|---|
| `nexus-core/ecs` | per-chunk entity, per-voxel-event components |
| `nexus-core/jobs` | parallel meshing, parallel light propagation |
| `nexus-renderer` | indirect chunk mesh draw, GPU compute remesh |
| `nexus-assets/streaming` | LRU chunk cache + disk persistence |
| `nexus-physics/collision` | voxel-collider for rigid-body interactions |
| `nexus-net/replication` | delta-compressed chunk diffs (per-edit, not per-frame) |
| `nexus-agent/telemetry` | per-frame chunk counts, mesh build µs, palette compression ratio |

## New modules that need to land

| Crate | Category | Purpose |
|---|---|---|
| `nexus-voxel-core` | `voxel` (new — see `docs/architecture/08-compose-dont-build.md` cross-agent flags) | `Chunk`, palette, save format |
| `nexus-voxel-greedy-mesh` | `voxel` | CPU + GPU-compute greedy mesher |
| `nexus-voxel-marching-cubes` | `voxel` | optional smooth-voxel mesher (Vintage Story / NMS-style) |
| `nexus-voxel-light-propagate` | `voxel` | flood-fill skylight + block light |

## Architecture

```
World streaming + voxel pipeline

  Player position → ChunkLoader policy (radius R, predictive)
                          │
                          ▼
  ┌────────────────────────────────────────────────────────────┐
  │  ChunkRegistry  (active chunks, LRU)                       │
  │    on miss: disk load OR generator (procgen integration)   │
  │    on edit: dirty-mark + replication delta                 │
  └─────────────┬──────────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────────┐
  │  Mesher (per-chunk, parallel via nexus-core/jobs)          │
  │    greedy: merge co-planar same-block faces                │
  │    GPU compute: remesh on edit if chunk is hot             │
  └─────────────┬──────────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────────┐
  │  LightPropagator (BFS flood, parallel per chunk + borders) │
  │    skylight + 16 block-light levels                        │
  └─────────────┬──────────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────────┐
  │  Renderer (indirect chunk draw, frustum + occlusion cull)  │
  │  Physics (voxel collider per loaded chunk)                 │
  │  Net (delta replication: per-edit voxel diffs, NOT bulk)   │
  └────────────────────────────────────────────────────────────┘
```

## Public API

```toml
[voxel]
chunk_size      = 16              # 16³ = 4096 voxels/chunk (default)
view_radius     = 12              # chunks (XZ); R*R*world_height chunks active
predict_radius  = 16              # streaming preload
mesher          = "greedy"        # "greedy" | "marching-cubes" | "naive"
remesh_backend  = "gpu-compute"   # "cpu" | "gpu-compute"
light_levels    = 16              # block light intensity steps
skylight        = true
world_height    = 256             # voxels (Y)
infinite        = true            # XZ unbounded; world_height fixed

[voxel.save]
format          = "region-files"  # 32×32 chunks per region file
compression     = "zstd"          # "none" | "zstd" | "lz4"
```

```rust
pub struct VoxelId(pub u16);           // 64k block types
pub struct Chunk { palette: Palette, data: PackedVoxels /* 16³ */ }

pub trait Mesher {
    fn build(&self, chunk: &Chunk, neighbors: &ChunkNeighbors) -> MeshData;
}

pub struct VoxelWorld { /* registry, streaming, save */ }

impl VoxelWorld {
    pub fn get(&self, x: i32, y: i32, z: i32) -> VoxelId;
    pub fn set(&mut self, x: i32, y: i32, z: i32, v: VoxelId);
    pub fn raycast(&self, origin: Vec3, dir: Vec3, max: f32) -> Option<VoxelHit>;
    pub fn telemetry(&self) -> VoxelTelemetry;
}
```

CLI:

```
nexus voxel save-info <world-dir>
nexus voxel remesh-all <world-dir>     # rebuild meshes from raw voxels
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Greedy mesh (1 chunk, 16³, mixed) | < 0.5 ms (CPU) / < 0.1 ms (GPU) | < 1.5 ms |
| Light propagation (1 chunk edit) | < 0.2 ms | < 1 ms |
| Active chunks @ view-radius 12 | 576 (24² × adjusted) | 1500 |
| Memory per chunk (compressed) | ~2 KB avg | 8 KB |
| Memory per chunk (mesh, dense) | ~32 KB | 128 KB |
| Edit-to-visible latency | < 50 ms | < 200 ms |
| Frame budget for voxel render | < 4 ms | < 8 ms |
| Net delta per voxel edit | < 16 B | 64 B |

`[BENCHMARK NEEDED]` — Steam Deck and mobile targets.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `VOXEL_E_OOB` | Voxel coords out of world height | Clamp Y or extend world_height |
| `VOXEL_E_PALETTE_FULL` | > 65535 block types in one chunk palette | Split palette or use VoxelId(u32) feature flag |
| `VOXEL_E_NO_COMPUTE` | `remesh_backend = "gpu-compute"` on backend without compute | Fall back to `"cpu"` |
| `VOXEL_E_SAVE_CORRUPT` | Region file checksum mismatch | Restore from backup or regenerate |
| `VOXEL_W_OVER_CAP` | Active chunk count > soft cap | Lower `view_radius` |

## Integration Points

- **Renderer**: chunk meshes drawn via instanced indirect draw; AO baked per-vertex. → `docs/specs/renderer/overview.md`.
- **Physics**: each loaded chunk publishes a voxel collider (rebuilt on edit). → `docs/specs/physics/collision.md`.
- **Net**: replication is per-edit delta (NOT per-frame chunk snapshot). Initial chunk handoff is compressed bulk. → `docs/specs/networking/replication.md`.
- **Assets/streaming**: LRU on chunk handles. → `docs/specs/assets/streaming.md`.
- **Procgen**: chunk generator hook (`fn generate(seed, x, z) -> Chunk`) — `docs/specs/procgen-first/overview.md`.
- **Destruction**: voxel edits double as a coarse destruction system. → `docs/specs/destruction-first/overview.md`.
- **Deformable terrain**: heightmap terrain may co-exist with voxel above/below. → `docs/specs/deformable-terrain/overview.md`.

## Scenario test (starter, ships with recipe)

`scenarios/voxel-place-and-dig.scenario.toml`:

```toml
[scene]
template = "voxel-empty-flat"
[actions]
- { tick = 10, action = "voxel_set", pos = [0, 65, 0], id = "stone" }
- { tick = 20, action = "voxel_set", pos = [0, 65, 0], id = "air" }
[asserts]
- { tick = 30, predicate = "voxel_at(0,65,0) == air" }
- { tick = 30, predicate = "frame_budget_ms < 16.6" }
```

## Test Requirements

- Generate 500 chunks from a deterministic seed → identical voxel hashes across two runs.
- Edit a single voxel → mesh visible within 50 ms; net delta replicated to second client within 100 ms.
- View-radius 12 sustained at 60 Hz on baseline desktop.
- Save / reload round-trips a 100-chunk world without data loss.
- Light propagation: place a torch in dark cave → 12-voxel-radius lit within 100 ms.

## Prior Art

- Minecraft — Notch's chunk-based voxel canon. [VERIFY — Mojang Block-Reform talk URL].
- Vintage Story — marching-cubes smooth voxels in production. [VERIFY — Vintage Story dev blog URL].
- Teardown — voxel + raytracing + destruction. [VERIFY — Teardown GDC 2021 talk URL by Dennis Gustafsson].
- Trove — Voxel MMO scaling. [VERIFY — Trion dev talk URL].
- Veloren — open-source voxel RPG (Rust precedent). https://veloren.net.

## Open Questions

- `[DECISION NEEDED]` Default chunk size: 16³ (Minecraft) vs 32³ (Vintage Story, better for GPU mesh).
- `[DECISION NEEDED]` `VoxelId` width: u16 default; u32 as feature flag for mod-heavy worlds.
- `[BENCHMARK NEEDED]` GPU compute mesher break-even point vs CPU (likely > 200 chunks/sec edit rate).
- `[DECISION NEEDED]` World save format compatibility: invent ours or adopt Minecraft Anvil for tool compatibility?
