<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deformable Terrain — Overview

> Terrain you can dig, mound, modify at runtime. Editable heightmap, multi-material layers, runtime regeneration of nav-mesh, network-syncable edits. Worms, From Dust, Spintires, Minecraft surface (when not voxelized).

## Boundaries

- Owns: editable heightmap storage, multi-material layer system (sand/dirt/stone/snow), edit operations (dig/raise/level/smooth), nav-mesh re-bake on edit, terrain LOD + chunking, edit replication.
- Does NOT own: terrain rendering / shading (→ `docs/specs/renderer/terrain.md`), voxel 3D (use voxel for full 6-DOF carving — `docs/specs/voxel/overview.md`), physics collision shape (→ `docs/specs/physics/collision.md` cooked from heightmap), navmesh primitives (→ baseline navmesh in physics).
- Depends on: `nexus-renderer/terrain`, `nexus-physics/collision` (heightfield collider, re-cooked on edit), `nexus-net/replication` (edit deltas), navmesh subsystem.

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-renderer/terrain` | rendering of heightfield + splat material |
| `nexus-physics/collision` | heightfield collider re-cooked on chunk edit |
| `nexus-net/replication` | per-edit replication (small deltas) |
| `navmesh` (planned subsystem) | re-bake on terrain edit in dirty chunks |
| `nexus-core/jobs` | parallel chunk re-cook + re-bake |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-deformable-heightmap` | `deformable` (new) | editable heightmap storage + operations |
| `nexus-deformable-multimaterial` | `deformable` | per-vertex material weights, splat blending |
| `nexus-deformable-navmesh-rebake` | `deformable` | dirty-chunk nav-mesh re-bake scheduler |

## Architecture

```
Deformable terrain pipeline

  Terrain world (chunked heightmap, e.g., 64×64 vertices per chunk)
              │
              ▼
  ┌────────────────────────────────────────────────────────────┐
  │ EditOperation (dig/raise/level/smooth)                     │
  │  - center, radius, falloff, magnitude                      │
  │  - applies to heightmap + material splat layers            │
  │  - dirties affected chunks                                 │
  └─────────────┬──────────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────────┐
  │ Re-cook (per dirty chunk, parallel via nexus-core/jobs)    │
  │  - heightfield → physics collider (re-cook)                │
  │  - splat material → renderer texture upload                │
  │  - heightfield → navmesh tile re-bake                      │
  └─────────────┬──────────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────────┐
  │ Net replicate edit (NOT per-frame state)                   │
  │  - serialize EditOperation (~32 B per op)                  │
  │  - apply same op on remote                                 │
  └────────────────────────────────────────────────────────────┘
```

## Multi-material model

Each terrain vertex stores material weights for N layers (sand, dirt, stone, snow, custom):

```
material_weights[v] = [0.0..1.0]  for each of N layers, summing to 1.0
```

Renderer splat-blends layer textures by weight (standard terrain technique). Digging through one layer reveals the next.

Layer-driven physics: friction, restitution, audio-material picked from dominant layer at contact point.

## Public API

```toml
[deformable_terrain]
chunk_size_v          = 64               # vertices per chunk side
chunk_size_m          = 64.0             # world meters per chunk side
material_layers       = 4                # max simultaneous (sand, dirt, stone, snow)
recook_throttle_ms    = 4                # max ms/frame for re-cook work
navmesh_rebake_ms     = 8                # max ms/frame for nav re-bake
net_sync              = "edits"          # "edits" | "off"

[deformable_terrain.lod]
distance_full         = 200.0
distance_half         = 800.0
distance_quarter      = 2000.0
```

```rust
pub enum EditOp {
    Dig    { center: Vec3, radius: f32, magnitude: f32 },
    Raise  { center: Vec3, radius: f32, magnitude: f32 },
    Level  { center: Vec3, radius: f32, target_y: f32 },
    Smooth { center: Vec3, radius: f32, strength: f32 },
    SetMaterial { center: Vec3, radius: f32, layer: u8, weight: f32 },
}

impl Terrain {
    pub fn apply(&mut self, op: EditOp);
    pub fn height_at(&self, x: f32, z: f32) -> f32;
    pub fn material_at(&self, x: f32, z: f32) -> MaterialId;
    pub fn dirty_chunks(&self) -> &[ChunkCoord];
    pub fn telemetry(&self) -> TerrainTelemetry;
}

pub struct TerrainTelemetry {
    pub edits_this_frame: u32,
    pub recook_ms: f32,
    pub navrebake_ms: f32,
    pub dirty_chunks_pending: u32,
}
```

CLI:

```
nexus terrain bake <world.tif>     # author-time bake
nexus terrain stats <world.tif>
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Edit op (single, 5 m radius) | < 200 µs | 1 ms |
| Re-cook (1 chunk, 64² vertices) | < 1.5 ms | 5 ms |
| Nav-mesh re-bake (1 chunk) | < 3 ms | 10 ms |
| Edit-to-visible latency | < 50 ms | 200 ms |
| Edit-to-physics latency | < 100 ms | 300 ms |
| Edit-to-nav latency | < 250 ms | 800 ms |
| Net edit op size | < 32 B | 64 B |
| Edits per frame (sustained) | < 50 | 200 |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `DEF_E_OOB` | Edit outside world bounds | Clamp or reject |
| `DEF_E_NAV_REBAKE_BACKLOG` | Nav-rebake queue > soft limit | Throttle edit rate or accept stale nav |
| `DEF_E_MATERIAL_LIMIT` | > 4 simultaneous material layers in one chunk | Consolidate weights below threshold |
| `DEF_W_LOD_RECOOK_BURST` | LOD transition triggered large re-cook burst | Telemetry warn; consider distance hysteresis |

## Integration Points

- **Renderer/terrain**: heightmap + splat material drive standard terrain shader. → `docs/specs/renderer/terrain.md`.
- **Physics/collision**: heightfield collider re-cooked per dirty chunk; throttled. → `docs/specs/physics/collision.md`.
- **Navmesh**: dirty-chunk re-bake; AI repaths if its current path crosses a dirty area. → (planned navmesh spec, cross-link `→ docs/specs/physics/navmesh.md` when authored).
- **Net**: per-edit-op replication; tiny bandwidth. → `docs/specs/networking/replication.md`.
- **Audio**: dig/level/raise events trigger material-keyed audio (dirt thunk, stone crack). → `docs/specs/audio/overview.md`.
- **Weather**: rain on dirt accumulates as mud (raises material_layer weight) — slow integration. → `docs/specs/weather-as-system/overview.md`.
- **Destruction**: explosions on terrain trigger `EditOp::Dig` craters automatically. → `docs/specs/destruction-first/overview.md`.
- **Voxel**: deformable heightmap is the lighter alternative for "surface only" carving; voxel for full 3D carving. → `docs/specs/voxel/overview.md`.

## Scenario test (starter)

`scenarios/deformable-dig-and-fill.scenario.toml`:

```toml
[scene]
template = "deformable-flat-terrain"
[actions]
- { tick = 10,  action = "edit", op = "dig",   center = [0, 0, 0], radius = 5.0, magnitude = 2.0 }
- { tick = 100, action = "edit", op = "raise", center = [0, 0, 0], radius = 5.0, magnitude = 2.0 }
[asserts]
- { tick = 50,  predicate = "height_at(0, 0) < -1.5" }
- { tick = 200, predicate = "height_at(0, 0) > -0.1" }    # filled back
- { tick = 200, predicate = "navmesh_passable(0, 0) == true" }
```

## Test Requirements

- Dig at center → physics character can fall into hole within 100 ms of edit.
- Raise mound → NPC pathfinding routes around it within 250 ms.
- Multi-layer reveal: dig through grass layer → dirt visible; deeper → stone.
- 50 edits in one frame → no frame > 16.6 ms; re-cook backlog drains within 500 ms.
- Net: client digs → second client sees identical terrain within 100 ms (op replication).
- Save/reload → terrain state preserved (heightmap diff or full snapshot, whichever smaller).

## Prior Art

- Worms series — 2D deformable terrain canon (Team17, since 1995).
- From Dust (Ubisoft Montpellier) — gameplay-first terraforming. [VERIFY — Eric Chahi GDC talk URL].
- Spintires / MudRunner (Saber Interactive) — mud deformation under tires. [VERIFY — Saber tech URL].
- DeepMind paper "Procedural Terrain Generation" — heightmap techniques. [VERIFY — paper URL].
- Minecraft (Notch) — block-by-block surface mutation (voxel path; this spec is the heightmap alternative).
- *Inspired by*: Recast & Detour navmesh re-baking patterns. https://github.com/recastnavigation/recastnavigation.

## Open Questions

- `[DECISION NEEDED]` Heightmap fidelity: u16 (32k height steps) vs f32 (smooth). Lean u16 for memory.
- `[DECISION NEEDED]` Default material-layer count: 4 (cheap splat) vs 8 (richer surface variety).
- `[BENCHMARK NEEDED]` Nav re-bake throughput on Steam Deck.
- `[DECISION NEEDED]` Caves / overhangs: not representable in heightmap. Use voxel for that case. Document this boundary.
- `[DECISION NEEDED]` Edit op compounding: should multiple edits in one frame coalesce into a single re-cook? Lean yes.
