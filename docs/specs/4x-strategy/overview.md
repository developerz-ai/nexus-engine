<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# 4X Strategy — Overview

> Civ-style 4X. Hex/square grid. Fog of war per civilization. Diplomacy AI. Deep tech-tree systems. Turn-based OR asynchronous-multiplayer. Civilization, Endless Legend, Old World, Stellaris.

## Boundaries

- Owns: hex / square grid primitives, per-civ fog-of-war, tech-tree data model + runtime, diplomacy state machine + AI hooks, turn-manager (turn-based or async), data-driven civ definitions, async-MP lockstep-turns protocol.
- Does NOT own: real-time unit movement (use `docs/specs/genres/rts.md` or `docs/specs/massive-rts/overview.md` for those genres), low-level networking transport (→ `docs/specs/networking/transport.md`), UI rendering (→ `docs/specs/editor/overview.md` UI primitives).
- Depends on: `nexus-genres/rts` (partial — share unit + selection), `nexus-net/replication` (lockstep turns), `nexus-scripting` (data-driven civs + leaders), `nexus-procgen-seeded-rng` (map generation).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-genres/rts` | partial; shares selection + camera primitives |
| `nexus-net/replication` | lockstep-turn protocol or async-PBEM email-like |
| `nexus-scripting` | data-driven civ + leader definitions |
| `nexus-procgen-seeded-rng` | deterministic map generation |
| `nexus-procgen-wfc` | adjacency-constrained map features (rivers, biomes) |
| `nexus-core/ecs` | per-tile components, per-civ state |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-4x-hexgrid` | `4x` (new) | hex coords, neighbors, pathing on hex graph |
| `nexus-4x-fogofwar` | `4x` | per-civ fog-of-war bitset + visibility ticks |
| `nexus-4x-techtree` | `4x` | tech-tree data + research progression |
| `nexus-4x-diplomacy` | `4x` | diplomacy state machine + AI hooks |
| `nexus-4x-turnmgr` | `4x` | turn-based or async turn manager |

## Architecture

```
4X game loop

  Turn N starts
       │
       ▼
  ┌────────────────────────────────────────────────────────────┐
  │ Per-civ turn (sequential or simultaneous)                  │
  │  - civ collects yields (food, gold, science)               │
  │  - civ research progresses (science → next tech)           │
  │  - civ AI / player issues orders (move, build, diplomacy)  │
  │  - diplomacy state machine ticks                           │
  └────────────┬───────────────────────────────────────────────┘
               │
               ▼
  ┌────────────────────────────────────────────────────────────┐
  │ End-of-turn resolution (lockstep across MP clients)        │
  │  - units move (orders queued during turn)                  │
  │  - combats resolve (deterministic given turn-seed)         │
  │  - fog-of-war recomputed per civ                           │
  │  - victory conditions checked                              │
  └────────────────────────────────────────────────────────────┘
       │
       ▼
  Turn N+1
```

## Hex / square grid

```rust
pub trait Grid {
    type Coord: Copy + Eq + Hash;
    fn neighbors(&self, c: Self::Coord) -> &[Self::Coord];
    fn distance(&self, a: Self::Coord, b: Self::Coord) -> u32;
    fn line_of_sight(&self, a: Self::Coord, b: Self::Coord) -> Vec<Self::Coord>;
}

pub struct HexGrid { width: u32, height: u32 }    // axial or offset coords
pub struct SquareGrid { width: u32, height: u32 }
```

Hex default: axial coords, 6 neighbors. Square default: 4 or 8 neighbors (configurable).

## Fog of war

```
Per civ: per-tile visibility = { Unseen | Explored | Visible }

  Unseen   = never seen; map shows nothing
  Explored = previously seen; static last-known state shown
  Visible  = currently in line of sight; live update

Visibility update per turn:
  for each unit / city of civ:
    mark tiles within sight_radius as Visible
  on turn end:
    formerly-Visible tiles → Explored (still rendered but stale)
```

Implementation: per-civ bitset (1 bit Visible, 1 bit Explored) × map_tiles.

## Tech tree

```toml
[[tech]]
id            = "pottery"
era           = "ancient"
science_cost  = 25
prereqs       = []
unlocks       = ["granary"]

[[tech]]
id            = "bronze_working"
era           = "ancient"
science_cost  = 35
prereqs       = []
unlocks       = ["spearman", "barracks"]

[[tech]]
id            = "writing"
era           = "ancient"
science_cost  = 55
prereqs       = ["pottery"]
unlocks       = ["library"]
```

Civs unlock unit/building/policy options as tech progresses. Tree is acyclic; cycles rejected at load.

## Diplomacy AI hooks

Diplomacy state machine per civ-pair (peace / war / ally / vassal). AI evaluates relations via scripting hooks:

```lua
function diplomacy.evaluate(my_civ, other_civ)
  local rel = relations(my_civ, other_civ)
  rel = rel + 10 * shared_tech_count(my_civ, other_civ)
  rel = rel - 5  * border_friction(my_civ, other_civ)
  rel = rel - 20 * recent_war_count(my_civ, other_civ)
  return rel
end
```

Hook-driven so studios can customize diplomacy depth.

## Public API

```toml
[strategy_4x]
grid_type             = "hex"          # "hex" | "square"
map_size              = [128, 80]      # tiles
fogofwar              = true
turn_style            = "turn-based"   # "turn-based" | "simultaneous" | "async"
async_turn_timeout_h  = 24             # PBEM-style

[strategy_4x.civs_dir]
path                  = "data/civs/"   # data-driven civ definitions

[strategy_4x.diplomacy]
script                = "scripts/diplomacy.lua"
```

```rust
pub struct Civ { /* id, leader, traits */ }
pub struct TechProgress { /* unlocked, current_research */ }

pub struct StrategyWorld { /* grid, civs, turn_mgr */ }

impl StrategyWorld {
    pub fn current_turn(&self) -> Turn;
    pub fn current_civ(&self) -> CivId;
    pub fn issue(&mut self, order: Order);
    pub fn end_turn(&mut self);
    pub fn visibility(&self, civ: CivId, tile: TileCoord) -> Visibility;
    pub fn telemetry(&self) -> StrategyTelemetry;
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Map gen (128×80 hex) | < 500 ms | 2 s |
| Per-turn resolution (8 civs, ~100 units) | < 500 ms | 2 s |
| Fog-of-war recompute (per civ, full map) | < 5 ms | 20 ms |
| Tech-tree advance | < 100 µs | 1 ms |
| AI turn (per civ, average difficulty) | < 200 ms | 1 s |
| MP lockstep turn confirmation latency | < 200 ms (LAN) / < 800 ms (cloud) | 2 s |
| Memory: full game state (8 civs, 128×80 map) | < 32 MB | 128 MB |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `4X_E_TECH_CYCLE` | Tech-tree prereqs form cycle | Reject load; show cycle path |
| `4X_E_CIV_INVALID` | Civ TOML missing required fields | Show field + suggested fix |
| `4X_E_LOCKSTEP_DESYNC` | MP clients diverge on turn resolution | Force snapshot resync; log |
| `4X_E_GRID_OOB` | Coord outside map bounds | Reject |
| `4X_W_AI_TIMEOUT` | AI turn > soft limit | Truncate AI evaluation |

## Integration Points

- **RTS genre**: shares selection, camera, unit primitives. → `docs/specs/genres/rts.md`.
- **Massive RTS**: 4X is generally NOT massive-scale; use `massive-rts` only for hybrids (Total War-style battles). → `docs/specs/massive-rts/overview.md`.
- **Net/replication**: lockstep turn confirmation; PBEM/async via simple snapshot ship + resume. → `docs/specs/networking/replication.md`.
- **Scripting**: civ + diplomacy + AI behavior data-driven via Lua. → `docs/specs/scripting-first/overview.md`.
- **Procgen**: deterministic map generation. → `docs/specs/procgen-first/overview.md`.
- **Sim-game**: 4X is a sim-game variant; reuse tick-decoupling for asynchronous play. → `docs/specs/sim-game/overview.md`.

## Scenario test (starter)

`scenarios/4x-tech-and-research.scenario.toml`:

```toml
[scene]
template = "4x-default-hex-128x80"
[setup]
civs = ["roman", "greek"]
map_seed = 0x4242
[actions]
- { tick = 1,  action = "start_research", civ = "roman", tech = "pottery" }
- { tick = 5,  action = "end_turn", times = 5 }
[asserts]
- { tick = 6,  predicate = "civ_has_tech('roman', 'pottery') == true" }
- { tick = 6,  predicate = "fog_visibility('greek', [10, 10]) == Unseen" }
- { tick = 6,  predicate = "turn_resolution_ms_p99 < 500" }
```

## Test Requirements

- Map generation deterministic per seed.
- Tech research completes in expected turns given science yield.
- Fog of war: civ A scouts tile → civ A sees, civ B doesn't.
- Lockstep MP: two clients submit orders; resolution bit-identical.
- AI evaluation: 8-civ map, end-of-turn AI completes within budget.
- Save / reload round-trips full game state.

## Prior Art

- Civilization series (Sid Meier / Firaxis) — canonical 4X. [VERIFY — Firaxis dev posts].
- Endless Legend (Amplitude) — hex-grid 4X with diplomacy depth. [VERIFY — Amplitude dev posts].
- Old World (Mohawk) — Soren Johnson's family-tree 4X. [VERIFY — Mohawk dev URL].
- Stellaris (Paradox) — async + real-time pause-based 4X. [VERIFY — Paradox dev diaries].
- FreeCiv — open-source Civilization. https://www.freeciv.org.
- Polytopia — minimalist hex 4X. [VERIFY — Midjiwan posts].
- *Inspired by*: Amit Patel, "Hexagonal Grids" — https://www.redblobgames.com/grids/hexagons/.

## Open Questions

- `[DECISION NEEDED]` Hex coord system: axial (cleanest math) vs offset (most-implementations friendly) vs cube (best for distance).
- `[DECISION NEEDED]` Default map size: 128×80 (Civ default-ish) vs 200×100 (larger).
- `[BENCHMARK NEEDED]` AI turn cost on 16-civ map (workstation vs Steam Deck).
- `[DECISION NEEDED]` Diplomacy state machine: scripted-only vs engine-default-with-scripted-override.
- `[DECISION NEEDED]` Async MP storage: client uploads turn-end snapshot to server (simple) vs P2P passing (decentralized).
