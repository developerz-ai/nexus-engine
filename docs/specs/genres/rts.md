<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# RTS Genre Module

> Real-time strategy primitives: unit AI, large-scale pathfinding (flow fields + HPA*), fog of war, resource economy, formation movement, command queue with lockstep determinism.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.rts]
version = "0.1"
netcode = "lockstep"          # lockstep deterministic command sync
tick_hz = 16
max_units_per_player = 500
fog_cell_m = 2.0
```

## Boundaries

- Owns: unit components, command queue, formations, pathing layer (flow fields + HPA*), fog of war grid, vision sources, resource ledger, build queue.
- Does NOT own: low-level pathfinding kernels (engine-level → `docs/specs/core/...`), netcode transport (→ `docs/specs/networking/transport.md`), terrain mesh (→ `docs/specs/renderer/terrain.md`).
- Depends on: core ECS, jobs, physics (selection raycasts), networking lockstep mode, deterministic math.

## Architecture

```
Player Input ─► CommandQueue (tick T+N) ──► Lockstep Replicate
                                                  │
                                                  ▼
                              ┌────────────────────────────────┐
                              │     Unit AI (per unit FSM)     │
                              │  Idle / Move / Attack / Build  │
                              └──────────────┬─────────────────┘
                                             │
            ┌─────────── Pathing Layer ──────┴─────────┐
            ▼                                          ▼
     ┌─────────────┐                           ┌─────────────┐
     │ Flow Field  │ ◄── for group goals       │   HPA*      │ long-range
     │ (per goal)  │     50+ units             │ abstraction │
     └─────────────┘                           └─────────────┘
                                             
   Fog of War grid (vision-up writes, render reads)
   Resource Ledger (atomic deltas per tick)
```

### HPA Path Diagram

```
Map split into 16x16 sectors. Abstract nodes at sector borders.
+----+----+----+
| .  X.  | .  |    X = abstract node (border crossing)
+--X-+-X--+----+    -- = abstract edge
| .  X.  X .  |    .  = local A* refines path inside sector
+----+----+----+
```

### Flow Field Diagram

```
Goal = G.  Integration field (cost to G):  Flow vectors point downhill.
3 2 1 0(G)        → → → •
4 3 2 1           → → → ←
5 4 3 2           → → → ←
```
1 flow field shared by all units assigned the same goal cell. Recomputed on terrain change or large obstruction.

## Public API

```rust
// components
pub struct Unit { kind: UnitKind, hp: f32, owner: PlayerId, state: UnitState }
pub struct Command { kind: CmdKind, target: CmdTarget, queued: bool }
pub struct PathAgent { current_goal: GoalId, sector: SectorId, local_path: SmallVec<[Cell;16]> }
pub struct Vision { radius_cells: u8, tower: bool }
pub struct Formation { id: FormationId, slot: u16, kind: FormKind /* line, wedge, box */ }

// resources
pub struct FogGrid { w:u32, h:u32, cells: Bitset3 /*Unseen/Explored/Visible*/ per player }
pub struct ResourceLedger { per_player: HashMap<PlayerId, Resources> }
pub struct FlowFieldCache;  // goal → field

// systems (lockstep ordered)
fn ingest_commands_system(tick);
fn unit_ai_system();
fn pathing_request_system();   // batches into FF/HPA* jobs
fn movement_integrate_system();
fn vision_update_system();
fn fog_update_system();
fn resource_apply_system();
fn build_queue_system();

// events
pub enum RtsEvent {
    UnitOrdered{u, cmd}, UnitDied{u, by}, ResourceGained{p, kind, amt},
    BuildingComplete{b}, VisionRevealed{p, cell},
}
```

## Fog of War

| State | Bits | Renders |
|---|---|---|
| Unseen | 00 | black |
| Explored | 01 | terrain only, last snapshot of enemies |
| Visible | 10 | live state |

Bit-grid per player; vision sources rasterize circles via Bresenham each fog-tick (≤ 4 Hz). GPU upload as R8 texture for shader sampling.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Units active | 2,000 (1v1), 500/player (4v4) | 4,000 |
| Tick budget (16 Hz) | <40 ms | 62 ms |
| Flow field build (256×256) | <8 ms | 20 ms |
| HPA* query (avg) | <300 µs | 2 ms |
| Fog rasterize all sources | <2 ms | 5 ms |
| Command queue replication | <1 KB/tick/player | 4 KB |
| Determinism | bit-exact across OS | required |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `RTS_E001` | path unreachable | emit `CommandFailed`, unit idle |
| `RTS_E002` | flow field cache full | LRU evict, log warn |
| `RTS_E010` | resource debit overdraw | reject build |
| `RTS_E020` | desync detected (hash mismatch) | halt match, snapshot |

## Integration Points

- Networking: lockstep input sync → `docs/specs/networking/rollback.md` (lockstep mode).
- Renderer: fog texture upload, formation gizmos in editor → `docs/specs/renderer/overview.md`.
- Audio: unit ack sounds, build complete → `docs/specs/audio/spatial.md`.
- Agent: scenario runs for AI matchup → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"tick":1840,"sys":"rts","evt":"unit_died","u":7012,"by":7501,"kind":"marine","p":2}
```
APM, units-per-minute, resource-rate, and fog-coverage-% emitted each second.

## Test Requirements

- 1000 units, single goal, flow field route → all reach within 2× shortest path time.
- Lockstep 4 players, 30-min replay → identical state hash on Linux/Win/macOS.
- HPA* path through 8 sectors completes <2 ms p99.
- Fog: explored persists; visible falls back to explored when vision lost.
- Headless 60× speed scenario: macro-AI vs macro-AI runs to victory deterministically.

## Prior Art

- StarCraft II pathing ✓ (boid steering + grid).
- Supreme Commander 2 flow fields ✓ (Elijah Emerson, GDC 2011) — primary inspiration.
- Planetary Annihilation HPA* ✓ for planetary scale.
- AoE II group movement ✗ — pathfinding chokes; Nexus avoids via per-goal field reuse.
- Game AI Pro Vol. 1 ch. on hierarchical pathing.

## Open Questions

- [DECISION NEEDED] Flow field cell size: 1 m vs 2 m vs adaptive.
- [DECISION NEEDED] Push-aside vs hard-collision between own units.
- [BENCHMARK NEEDED] FF GPU compute (wgpu) vs CPU jobs for 512² grids.
