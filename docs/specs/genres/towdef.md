<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Tower Defense Genre Module

> Tower-defense primitives: placement grid with validity rules, wave schedule + spawner, multi-path enemy routing, tower targeting/AoE, economy ledger.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.towdef] version = "0.1"
grid_size_m = 1.0
path_model = "fixed"          # "fixed" | "dynamic"  (dynamic = maze TD)
tick_hz = 30
```

## Boundaries

- Owns: grid placement, validity (no path blocking), wave schedule, spawner, enemy path follower, tower target selector, projectile/AoE, economy.
- Does NOT own: rendering effects (engine), generic pathing kernels (→ `docs/specs/genres/rts.md` pathing layer).
- Depends on: ECS, pathing, audio, telemetry.

## Architecture

```
       ┌──────────────────┐
       │  Map / Grid      │ cells: Buildable | Path | Blocked | Tower
       └────────┬─────────┘
                │ validity
                ▼
       ┌──────────────────┐         ┌──────────────────────┐
       │ Build Controller │ ◄──────►│  Path Recompute (D*) │  (dynamic mode)
       └────────┬─────────┘         └──────────────────────┘
                │
                ▼
        Tower Entities ── targeting policy ── shoot ── damage
                                                 │
                                                 ▼
                          Enemy Path Follower ── HP ── death/leak
                                  ▲
                                  │
                          Wave Scheduler ── spawner cadence
```

## Public API

```rust
// resources
pub struct Grid { w:u32, h:u32, cells: Vec<CellKind> }
pub enum CellKind { Buildable, Path, Blocked, Tower(Entity) }

pub struct WaveSchedule { waves: Vec<Wave>, current: u16, t_to_next: f32 }
pub struct Wave { spawns: Vec<SpawnPulse>, reward: u32 }
pub struct SpawnPulse { enemy: EnemyKind, count: u16, interval_s: f32, delay_s: f32 }

pub struct Economy { gold: u32, lives: u16, score: u64 }

// components
pub struct Tower { kind: TowerKind, range_m: f32, dps: f32, target_policy: TargetPolicy }
pub struct Enemy { kind: EnemyKind, hp: f32, speed: f32, armor: f32, path_id: PathId, path_t: f32 }
pub struct PathFollower { path: PathId, t: f32 }

// systems
fn build_validate_system();
fn path_recompute_system();        // only when grid changes (dynamic)
fn wave_director_system();
fn enemy_spawn_system();
fn enemy_advance_system();
fn tower_target_system();          // sorts candidates per policy each fire
fn tower_fire_system();
fn projectile_system();
fn leak_system();                  // enemy reaches end → lose life
fn economy_system();

// events
pub enum TdEvent {
    Placed{tower,cell}, Sold{tower,refund}, WaveStarted{n}, WaveCleared{n},
    EnemySpawned{e,kind}, EnemyKilled{e,by}, Leaked{e}, Lost, Won, GoldChanged{delta},
}
```

## Targeting Policies

| Policy | Pick |
|---|---|
| First | enemy with highest `path_t` in range (closest to end) |
| Last | lowest `path_t` |
| Strong | highest current HP |
| Weak | lowest current HP |
| Close | shortest 3D dist |
| Random | uniform from in-range |

## Grid + Pathing

```
Fixed map: paths baked at load, enemies advance along spline.
Dynamic map (maze TD):
  any placement that breaks ANY enemy-spawn → end path is invalid.
  validator runs D* on a copy of grid; if cost == ∞ → reject build.
```

Build validity diagram:
```
. . . . E . .       valid path exists
. T . T . . .       T = tower placed
. . T . . . .
S . . . T . E
       ▲ if blocking move → reject
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| 200 enemies + 50 towers tick (30 Hz) | <6 ms | 16 ms |
| Build validity (dynamic, 64×64 grid) | <2 ms | 8 ms |
| Wave spawn jitter | <1 tick | 2 ticks |
| Targeting policy per tower | <5 µs | 30 µs |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `TD_E001` | placement blocks all paths | reject, refund cost |
| `TD_E002` | insufficient gold | client denial |
| `TD_E010` | wave index OOB | mark Won/Lost per game rules |

## Integration Points

- Pathing: reuses → `docs/specs/genres/rts.md` flow-field or A*; per-game choice.
- Audio: tower-fire and enemy-death stings → `docs/specs/audio/spatial.md`.
- Agent: balance harness (auto-play towers vs waves; emit per-wave win-rate matrix) → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"t":92.5,"sys":"td","evt":"wave_cleared","n":12,"gold":340,"lives":17,"dps_top":[{"tower":7,"dps":120.3}]}
```

## Test Requirements

- 200 enemies, all spawn cadence honored within 1 tick of schedule.
- Build validator: 1000 random placements, no false-allow (i.e. never blocks all paths).
- Targeting deterministic per policy + seed (so replays match).
- Headless harness: defeats baseline wave-set with baseline build in <X seconds (regression).

## Prior Art

- Bloons TD targeting policies ✓ — model adopted directly.
- Defense Grid pathing + replanning ✓.
- Mindustry conveyor/economy (open source reference) ✓.
- Dungeon Warfare 2 trap chaining — out of scope (game-side).
- Kingdom Rush wave pacing curves ✓.

## Open Questions

- [DECISION NEEDED] Default upgrade tree shape (linear vs branching).
- [DECISION NEEDED] Lives system vs single-base-HP.
- [BENCHMARK NEEDED] 1000-enemy stress (Bloons TD6 ceremony levels).
