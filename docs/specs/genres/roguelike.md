<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Roguelike / Roguelite Genre Module

> Roguelike primitives: seeded procedural generation, run-scoped state, permadeath lifecycle, meta-progression layer, deterministic replay from seed + input.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.roguelike] version = "0.1"
permadeath = true
seed_mode = "daily+random"     # daily-seed + custom-seed support
meta_enabled = true
```

## Boundaries

- Owns: run state, seeded RNG streams, room/floor generator scaffolding (data-driven), reward roll, meta-progression ledger, daily challenge management.
- Does NOT own: combat (game-side), specific dungeon templates (game-side data), persistent save format details (→ `docs/specs/genres/rpg.md` save chunks).
- Depends on: RPG (stats, inventory), deterministic math, assets, telemetry.

## Architecture

```
                ┌──────────────────────┐
                │   RunDirector        │
                │ seed → master RNG    │
                │ ├ rng.world          │
                │ ├ rng.loot           │
                │ ├ rng.events         │
                │ └ rng.shop           │
                └──────────┬───────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │      Procedural Generator        │
        │ Floor → Layout (graph) → Rooms   │
        │ Rooms → Encounters from tags     │
        │ Encounter → Loot roll            │
        └─────┬────────────────────────────┘
              │
              ▼
        RunState{ floor, hp, gold, deck/inv, modifiers, history[] }
              │
              ▼ death
        MetaLedger{ unlocks, currency, stats, daily best }
```

## RNG Streams (Anti-Save-Scum)

Single seed → derive *named* substreams via SplitMix:
```
master = seed
rng.world  = split(master, "world")
rng.loot   = split(master, "loot")
rng.events = split(master, "events")
rng.shop   = split(master, "shop")
```
Each stream advances independently; reloading floor doesn't reroll others.

## Public API

```rust
// resources
pub struct RunState {
    seed: u64, floor: u16, t_run_s: f32, hp: i32, hp_max: i32,
    gold: u32, modifiers: Vec<RunModifier>, history: Vec<RunEvent>,
}
pub struct RngStreams { world: Rng, loot: Rng, events: Rng, shop: Rng }
pub struct MetaLedger { currency: u64, unlocks: BitSet, best_floor: u16, best_score: u64 }
pub struct DailyChallenge { date: NaiveDate, seed: u64, leaderboard_local: Vec<RunSummary> }

// systems
fn run_director_system();         // start/end run, transitions
fn floor_generate_system();
fn encounter_resolve_system();
fn loot_roll_system();
fn permadeath_system();           // on hp<=0 → archive RunState, write Meta, reset
fn meta_apply_system();           // start-of-run boons from unlocks

// events
pub enum RogueEvent {
    RunStarted{seed,char_id}, FloorEntered{n}, RoomCleared{room}, ItemPicked{item},
    BossDefeated{boss}, Died{cause,floor,t}, RunEnded{summary},
    UnlockEarned{id}, MetaCurrencyGained{amt},
}
```

## Procedural Floor (data-driven)

```toml
# floors/swamp.toml
size_range = [8, 14]                     # room count
layout = "branching"                     # "linear" | "branching" | "graph"
required_rooms = ["start","boss","shop"]
optional_rooms = [
  {tag="combat", weight=60, max=8},
  {tag="elite",  weight=10, max=2},
  {tag="event",  weight=15, max=2},
  {tag="treasure", weight=10, max=2},
]
```
Generator emits a room graph; game-side fills rooms from tagged templates.

## Run State Diagram

```
        ┌─────────┐
        │ Lobby   │ ◄── from death
        └────┬────┘
             │ start_run(seed)
             ▼
        ┌─────────┐  next_floor   ┌──────────┐
        │  Floor  │ ─────────────►│ Boss     │
        │  Loop   │ ◄─────────────│ floor    │
        └────┬────┘                └─────┬────┘
             │ hp<=0                     │ defeat final
             ▼                           ▼
         Permadeath                  Run Won
             └──────────┬──────────────┘
                        ▼
                 Meta progression
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Floor generate (size 14) | <80 ms | 300 ms |
| Deterministic replay from seed + input | bit-exact | required |
| Loot roll per room | <50 µs | 500 µs |
| Meta save write | <40 ms | 200 ms |
| 1000 headless runs (regression) | <60 s wall | 5 min |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `RGE_E001` | floor generator failed constraints | reseed once, then surface error |
| `RGE_E002` | required room cannot fit | relax layout size, retry |
| `RGE_E010` | meta ledger corruption (checksum) | restore from backup, warn |

## Integration Points

- RPG: inventory + stats reused per run, reset on death → `docs/specs/genres/rpg.md`.
- Agent: regression harness runs N daily seeds end-to-end → `docs/specs/agent/scenarios.md`.
- Editor: floor graph visualizer → `docs/specs/editor/scene.md`.
- Networking: optional async multiplayer (daily leaderboard) — out of scope for engine, exposes data only.

## Telemetry

```json
{"t":620.4,"sys":"rogue","evt":"died","cause":"elite_swamp_witch","floor":7,"hp_max":120,"gold":342,"items":["shiv","ember"]}
```
Per-run summary persisted as TOML + appended to meta.

## Test Requirements

- 10,000 seeds: every run reaches at least floor 1 boss (no soft-locks).
- Same seed twice → identical run trace (deterministic resim from input log).
- Permadeath archives RunState to history before reset.
- Daily-seed test: on date X, seed equals deterministic hash of date (no servers needed).
- Meta unlock persists across crash (atomic write + rename).

## Prior Art

- Slay the Spire run state + seeded RNG (Mega Crit talk) ✓ — primary inspiration.
- Hades meta-progression curve ✓ "death is progress".
- Spelunky 2 daily challenge ✓ deterministic + leaderboard.
- Brogue room generator ✓ algorithmic flavor.
- Caves of Qud parts/genes generation ✓ data-driven density.

## Open Questions

- [DECISION NEEDED] RNG algorithm: xoshiro256++ vs PCG64 (both deterministic; pick one).
- [DECISION NEEDED] Mid-run save (cloud sync) — anti-save-scum risk.
- [BENCHMARK NEEDED] Floor generate target on mobile.
