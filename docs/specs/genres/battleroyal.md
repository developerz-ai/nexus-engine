<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Battle Royale Genre Module

> Battle royale primitives: 100-player match scaling, shrinking play-zone with phase schedule, world-distributed loot tables, drop-pod insertion, kill-feed + spectate.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.battleroyal] version = "0.1"
players = 100
team_size = 4                 # 1 solo, 2 duos, 4 squads
zone_phases = 8
loot_density = "high"
```

## Boundaries

- Owns: match lifecycle, zone shrink scheduler + damage, loot spawn tables + container entities, drop-pod insertion vehicle, ring/zone visualizer events, kill-feed aggregation.
- Does NOT own: weapons/ballistics (→ `docs/specs/genres/fps.md`), networking scaling (→ `docs/specs/networking/replication.md`), terrain (→ `docs/specs/renderer/terrain.md`).
- Depends on: FPS module, MMORPG interest management (for 100-player AOI), networking, asset streaming.

## Architecture

```
       ┌────────────────────────────────────────┐
       │             Match Director             │
       │ Lobby → DropShip → Drop → Play → End   │
       └─────┬──────────────┬─────────────────┬─┘
             │              │                 │
             ▼              ▼                 ▼
       DropShip Path    Zone Scheduler   KillFeed Stream
       (spline)        - phases[]
                       - next center
                       - shrink time
                       - dmg/sec
                                        
   World Loot Manager
     ├ buildings → POI tables
     ├ supply bins → tiered rolls
     └ care packages (mid-match drops)
   
   Drop-Pod / Glide system (per player exit + parachute)
   Spectate camera (follows killer chain)
```

### Zone Shrink Diagram

```
Phase 1: huge ring (90% map), wait 4 min, then shrink 3 min, dmg 1/s
Phase 2: 60% map, wait 3 min, shrink 2 min, dmg 2/s
Phase 3: 40%, ...
...
Phase 8: ~radius 0, dmg 10/s
                                  ◯ next center (visible to all)
        ╲    current ring         ╱
         ╲───────────────────────╱
          ╲                     ╱
           ╲    play space     ╱
            ╲                 ╱
             ╲_______________╱
```

## Public API

```rust
// resources
pub struct MatchState { phase: BrPhase, t_in_phase: f32, alive: u16, teams_left: u16 }
pub struct ZoneSchedule { phases: [ZonePhase; 8], current: u8 }
pub struct ZonePhase { wait_s: f32, shrink_s: f32, dmg_per_s: f32, radius_m: f32, center: Vec2 }
pub struct LootTables { poi: HashMap<PoiId, LootTable>, container: HashMap<ContKind, LootTable> }
pub struct KillFeed { entries: VecDeque<KillEntry> }

// components
pub struct BrPlayer { team: TeamId, kills: u8, alive: bool, downs: u8 }
pub struct LootContainer { table: ContKind, opened: bool }
pub struct CarePackage { drop_at: Vec3, t_arrival: f32, contents: LootRoll }
pub struct DropPod { path_t: f32, exited: bool }

// systems
fn match_director_system();
fn zone_schedule_system();
fn zone_damage_system();              // any entity outside ring → tick dmg
fn loot_spawn_system();               // at match start, populate POIs
fn loot_open_system();
fn care_package_system();
fn drop_pod_system();
fn killfeed_aggregate_system();
fn spectate_target_system();

// events
pub enum BrEvent {
    MatchStarted, DropShipPath{spline}, PlayerExited{p}, PlayerDowned{p,by}, PlayerKilled{p,by,wep},
    ZonePhaseStarted{phase}, ZoneShrinkStarted{phase}, OutsideZone{p}, CarePackageDropped{pos},
    Top10, Top3, MatchWon{team},
}
```

## Loot Tables (data)

```toml
[poi.military_base]
rolls = 3
table = [
  {item="rifle_762", weight=20},
  {item="smg_9mm",   weight=30},
  {item="ammo_762",  weight=50, qty="20-60"},
  {item="armor_2",   weight=10},
  {item="med_large", weight=15},
]
```
Loot rolls deterministic per match seed → replay-safe, anti-cheat-friendly (server authoritative).

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| 100 players, server tick @ 30 Hz | <22 ms | 33 ms |
| AOI per player (interest set) | <100 entities streamed | 250 |
| Bandwidth per client | <50 KB/s | 150 KB/s |
| Loot spawn (match init) | <800 ms | 3 s |
| Zone damage tick (sparse) | <0.3 ms | 1 ms |
| Match start → first drop | <60 s | 90 s |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `BR_E001` | not enough players to start | extend lobby timer |
| `BR_E002` | drop-ship spline invalid | regenerate from map metadata |
| `BR_E010` | zone phase index OOB | freeze at last phase |
| `BR_E020` | loot table empty for POI | fall back to global default |

## Integration Points

- FPS module: combat layer → `docs/specs/genres/fps.md`.
- Networking: MMORPG-style AOI tuned for 100 players → `docs/specs/genres/mmorpg.md` § Interest Management.
- Assets: stream POI assets on drop-ship trajectory (predictive prefetch) → `docs/specs/assets/streaming.md`.
- Agent: 100-bot match harness → `docs/specs/agent/scenarios.md`.

## Drop & Glide

- DropShip path = bezier across map, fixed per match (replicated).
- Player exits at chosen tick → freefall → auto-deploy chute at threshold altitude.
- Position deterministic from `(exit_tick, input)` so replays match.

## Telemetry

```json
{"t":420.1,"sys":"br","evt":"zone_shrink_started","phase":3,"new_radius":300.0,"dps":2.0}
```
Per-match: kill-position heatmap, drop-location heatmap, time-to-first-fight.

## Test Requirements

- 100 bots, full match runs to single team alive within phase 8.
- Zone schedule deterministic from match seed.
- Loot roll deterministic from match seed + POI id.
- Bandwidth budget stays under hard limit at peak (mid-match firefight).
- Spectate chain: on killer-of-killer chain, follows correctly without target gaps.

## Prior Art

- PUBG ring damage model ✓.
- Apex Legends ping system + drop-ship (Respawn GDC talks) ✓ inspiration for telemetry-rich design.
- Fortnite storm + map streaming ✓.
- Warzone gulag (skip — game-side).
- Valve GameNetworkingSockets ✓ transport.

## Open Questions

- [DECISION NEEDED] Server topology: single 100p server vs region of 4×25 with handoff.
- [DECISION NEEDED] Loot quality curve: flat vs tiered hot-zone bias.
- [BENCHMARK NEEDED] 150-player stretch goal cost on reference HW.
