<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Destruction-First — Overview

> Destruction as primary gameplay, not cosmetic effect. Voronoi pre-fracture, GPU-accelerated debris, persistent destruction across saves, network-syncable. Red Faction Guerrilla GeoMod, Teardown voxel destruction, Battlefield Bad Company 2 Frostbite.

## Boundaries

- Owns: pre-fracture pipeline (Voronoi shatter + V-HACD convex decomposition), destruction event stream, persistent destruction state (save/load), network-syncable destruction protocol, debris LOD policy.
- Does NOT own: soft-body solver (→ `docs/specs/physics/soft.md`), rigid solver (→ `docs/specs/physics/rigid.md`), voxel destruction (→ `docs/specs/voxel/overview.md` — voxels destroy by `set(air)`), asset import (→ `docs/specs/assets/import.md`).
- Depends on: `nexus-physics/soft` (debris), `nexus-physics/rigid` (chunks), `nexus-assets/import` (V-HACD baking), `nexus-net/replication` (delta destruction events), `nexus-renderer/particles-heavy` (dust + debris cloud).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-physics/rigid` | fractured chunks as rigid bodies |
| `nexus-physics/soft` | bend / crumple of soft debris |
| `nexus-assets/import` | V-HACD convex decomposition at import time |
| `nexus-net/replication` | per-event destruction sync (NOT per-frame state) |
| `nexus-renderer/particles-heavy` | dust clouds, splinters |
| `nexus-audio/adaptive` | material-dependent destruction sound (wood crack, glass shatter, concrete crumble) |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-destruction-voronoi` | `destruction` (new) | Voronoi cell pre-fracture pipeline |
| `nexus-destruction-persistent` | `destruction` | save/load destruction state |
| `nexus-destruction-events` | `destruction` | destruction event stream + network codec |

## Architecture

```
Pre-fracture pipeline (asset import time)

  Source mesh (.glb)
       │
       ▼
  Voronoi-cell shatter (N cells, biased by stress map)
       │
       ▼
  V-HACD convex decomposition of each cell
       │
       ▼
  Bake to .destruct asset:
       - chunk meshes (visible)
       - chunk convex hulls (physics)
       - chunk graph (which-touches-which)
       - chunk masses
       - chunk material IDs (for audio + dust color)

Runtime — destruction event flow

  Damage source (bullet, explosion)
       │
       ▼
  PhysicsWorld::apply_damage(entity, point, magnitude)
       │
       ▼
  Damage accumulator (per-chunk hit-points)
       │
       ▼
  Chunk breaks → DestructionEvent { entity, chunk_id, time, force }
       │
       ├─► Rigid solver: chunk becomes a free rigid body
       ├─► Soft solver: optional bend (e.g., metal beam deformation)
       ├─► Particles-heavy: dust burst at chunk_id world position
       ├─► Audio: material-keyed shatter sound
       ├─► Net replication: broadcast event (small, < 32 B)
       └─► Persistent store: append event to world save delta
```

## Public API

```toml
[destruction]
enabled                = true
chunk_cap              = 5000              # max free chunks in scene
debris_lifetime_s      = 30.0              # chunks despawn after settling
persistent             = true              # destruction survives save/load
net_sync               = "events"          # "events" | "off" (single-player)

[destruction.fracture]
default_cells          = 24
stress_map_bias        = 0.4               # 0=uniform, 1=stress-driven only
seed                   = 0xDEADBEEF        # deterministic shatter pattern

[destruction.debris]
lod_distance_full      = 30.0
lod_distance_impostor  = 80.0
lod_distance_cull      = 200.0

[destruction.persistence]
backend                = "delta-log"       # "delta-log" | "snapshot"
max_events_per_world   = 100_000
```

```rust
pub struct DestructibleAsset { /* chunks, graph, masses */ }
pub struct ChunkId(pub u32);

pub struct DestructionEvent {
    pub entity: EntityId,
    pub chunk: ChunkId,
    pub at: Vec3,
    pub force: Vec3,
    pub material: MaterialId,
    pub time: GameTime,
}

impl PhysicsWorld {
    pub fn apply_damage(&mut self, e: EntityId, point: Vec3, magnitude: f32);
    pub fn destruction_events(&self) -> &[DestructionEvent];
}

impl DestructionPersist {
    pub fn save(&self, world: &World) -> Bytes;
    pub fn restore(&self, world: &mut World, bytes: &[u8]);
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Fracture (asset import, 1k-tri mesh, 24 cells) | < 500 ms | 2 s |
| Damage event handling (per event) | < 50 µs | 200 µs |
| Live debris (free chunks) | 5000 | 10000 |
| Frame budget for destruction (1k debris) | < 2 ms | 5 ms |
| Net event size | < 32 B | 64 B |
| Persistence log entry | < 24 B | 48 B |
| Save (100k events) | < 100 ms | 500 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `DEST_E_NO_VHACD` | `nexus-assets/import` V-HACD unavailable | Install or use simpler fracture (box-cells) |
| `DEST_E_CHUNK_CAP` | Free-chunk cap exceeded | Lifecycle older chunks or raise cap |
| `DEST_E_PERSIST_OVERFLOW` | > `max_events_per_world` | Compact via snapshot or raise cap |
| `DEST_E_NET_DESYNC` | Client missed events; rebuild from snapshot | Force snapshot resync |
| `DEST_W_FRACTURE_DEGENERATE` | Voronoi produced zero-volume cells | Re-seed or reduce cell count |

## Integration Points

- **Physics/rigid + soft**: chunks become rigid bodies; optional soft-debris (e.g., bent metal). → `docs/specs/physics/rigid.md`, `docs/specs/physics/soft.md`.
- **Assets/import**: V-HACD baking at import. → `docs/specs/assets/import.md`.
- **Net/replication**: per-event delta stream, not per-frame state. → `docs/specs/networking/replication.md`.
- **Particles-heavy**: dust + debris cloud at chunk break point. → `docs/specs/renderer/particles-heavy.md`.
- **Audio**: per-material destruction sound. → `docs/specs/audio/overview.md`.
- **Voxel**: voxel destruction is the simpler path; this spec is for arbitrary-mesh destruction. → `docs/specs/voxel/overview.md`.
- **Deformable terrain**: terrain destruction (craters) overlaps with this spec. → `docs/specs/deformable-terrain/overview.md`.

## Scenario test (starter)

`scenarios/destruction-explosion-on-wall.scenario.toml`:

```toml
[scene]
template = "destruction-test-room"
[actions]
- { tick = 1,   action = "spawn", asset = "wall_brick.destruct", at = [0, 0, 0] }
- { tick = 30,  action = "apply_damage", entity = "wall", point = [0, 1, 0], magnitude = 500 }
[asserts]
- { tick = 60,  predicate = "destruction_events_count > 5" }
- { tick = 60,  predicate = "free_chunks > 5 && free_chunks < 30" }
- { tick = 600, predicate = "free_chunks == 0" }   # debris lifecycled
- { tick = 60,  predicate = "frame_budget_ms < 16.6" }
```

## Test Requirements

- Pre-fracture mesh → asset baked correctly; chunks load + render.
- Explosion → expected number of chunks separate, fly with force, settle within 30 s.
- Save → reload → destroyed wall stays destroyed (persistent).
- Network: chunk break event from one client arrives on second client within 100 ms; chunks land in identical positions if `destruction.fracture.seed` shared.
- 1000 simultaneous destruction events (mass explosion) → no frame spike > 25 ms.

## Prior Art

- Red Faction Guerrilla (Volition) — GeoMod 2.0, full building destruction. [VERIFY — Volition GDC URL].
- Teardown (Tuxedo Labs) — voxel destruction primary gameplay. [VERIFY — Dennis Gustafsson GDC 2021 URL].
- Battlefield Bad Company 2 (DICE) — Frostbite destruction. [VERIFY — DICE GDC URL].
- The Finals (Embark) — UE5 + custom destruction networking. [VERIFY — Embark tech blog URL].
- Control (Remedy) — Northlight destruction tech. [VERIFY — Remedy tech blog URL].
- *Inspired by*: Müller, "Real Time Destruction" (game-dev workshop) — Voronoi shatter reference.
- *Inspired by*: V-HACD library (Khaled Mamou) — convex decomposition. https://github.com/kmammou/v-hacd.

## Open Questions

- `[DECISION NEEDED]` Default fracture: Voronoi (mesh-agnostic) vs pre-authored break patterns (Frostbite style, hand-tuned per building).
- `[DECISION NEEDED]` Persistent destruction granularity per save: full log (replayable) vs final state snapshot (smaller).
- `[BENCHMARK NEEDED]` Net bandwidth in worst-case (1000 simultaneous breaks).
- `[DECISION NEEDED]` Destructible-by-default vs opt-in tag? Lean opt-in: only assets baked with `.destruct` are destructible.
- `[DECISION NEEDED]` Cross-genre policy: ship as `destruction` category vs `genre-toolkit`?
