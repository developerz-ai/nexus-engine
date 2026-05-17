<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Survival Genre Module

> Survival primitives: vital stats (hunger/thirst/temperature/stamina), crafting graph, modular base building, day/night cycle, resource depletion + regrowth.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.survival] version = "0.1"
time_scale = 48           # 30 real minutes = 1 in-game day
temp_model = "envelope"   # ambient + clothing + shelter
build_grid = "snap"       # "snap" | "free"
```

## Boundaries

- Owns: vital meters, crafting recipe graph, building snap system, environmental ticker, decay/spoilage, harvest/respawn.
- Does NOT own: inventory itself (→ `docs/specs/genres/rpg.md`), weather rendering (→ `docs/specs/genres/openworld.md`).
- Depends on: RPG inventory, world events, audio (ambience), time.

## Architecture

```
   ┌──────────────────────────────────────────┐
   │              Vitals Tracker              │
   │  hunger ──►   tick = base + activity     │
   │  thirst ──►   reduces over time/temp     │
   │  temp   ──►   ambient + clothing + fire  │
   │  stam   ──►   regen/drain, gates actions │
   └─────┬────────────────────────────────────┘
         │ thresholds emit StatusEvents
         ▼
   ┌──────────────┐    ┌──────────────────────┐
   │ Crafting DAG │ ◄─►│   Inventory (RPG)    │
   └──────────────┘    └──────────────────────┘
                              ▲
                              │
                       Harvest System ◄── Resource nodes (regrow)
   
   BuildSystem ── snap grid / placement validator ── BuildPart entities
   Decay/Spoilage ── per-item TTL ticker
   DayNight ── sun pos, ambient lookup, NPC schedules
```

## Public API

```rust
// components
pub struct Vitals { hunger:f32, thirst:f32, temp_c:f32, stamina:f32, hp:f32 }
pub struct VitalRates { hunger_per_h:f32, thirst_per_h:f32, stam_regen:f32 }
pub struct Clothing { insulation_c:f32, slots:[Option<ItemId>; CLOTH_SLOTS] }
pub struct BuildPart { kind:BuildPartKind, grid_cell:IVec3, integrity:f32, anchored:bool }
pub struct ResourceNode { kind:ResourceKind, yield_left:u16, respawn_in:f32 }

// resources
pub struct WorldClock { day:u32, hour_f:f32, year_day:u16 }
pub struct CraftingGraph; // adjacency from inputs → outputs, with station requirement
pub struct BuildRegistry; // PartDef + snap rules
pub struct TempEnvelope { ambient_c:f32, wind_mps:f32, sheltered:bool, near_fire:bool }

// systems
fn vitals_tick_system();
fn temperature_eval_system();
fn craft_attempt_system();
fn build_place_system();
fn build_integrity_system();      // floating-collapse propagation
fn resource_respawn_system();
fn decay_spoilage_system();
fn daynight_tick_system();

// events
pub enum SurvivalEvent {
    VitalThreshold{e,kind,level}, Starved{e}, Frozen{e}, Heatstroke{e},
    Crafted{e,recipe,qty}, BuildPlaced{e,part}, BuildCollapsed{root},
    Harvested{e,node,qty}, NightFell, DayBroke,
}
```

## Vitals Model

| Stat | Range | Base rate | Activity cost | Threshold effects |
|---|---|---|---|---|
| hunger (0–100) | 0=starving | -4/h | jog +2/h, run +6/h | <20 hp tick, =0 hp drain |
| thirst (0–100) | 0=dehyd | -6/h | climate hot ×1.5 | <15 stam cap halved |
| temp_c | 36.6 ± env | dynamic | shiver burns kcal | <34 hypoth, >40 hyperth |
| stamina (0–100) | regen 20/min | drained by sprint/climb | — | =0 forced walk |

## Crafting DAG

```
recipes/wood_axe.toml
inputs = [{item="stick", qty=2}, {item="stone_sharp", qty=1}]
station = "workbench_t1"     # or "hand" / "campfire" / "anvil"
outputs = [{item="wood_axe", qty=1}]
time_s = 6
unlock = "skill.tools >= 1"
```
Graph queries: "what can I craft with current inventory?" → traversal in <1 ms for 500 recipes.

## Base Building

Snap grid (1 m default). Parts: Foundation / Wall / Doorway / Window / Floor / Roof / Stair / Pillar.
Integrity rule (Rust-game inspired):
- Foundations grant integrity 100.
- Each step from foundation -10.
- Part with integrity <= 0 collapses; cascade collapse propagates one tick later.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Vitals tick (10k actors) | <0.5 ms | 2 ms |
| Craft query (500 recipes) | <500 µs | 2 ms |
| Build placement validate | <100 µs | 1 ms |
| Integrity propagation per collapse | <2 ms | 10 ms |
| Decay sweep (50k items) | <3 ms | 10 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SURV_E001` | recipe inputs missing | client denial |
| `SURV_E002` | build snap invalid | reject + reason code |
| `SURV_E010` | base too large for budget | warn, suggest split |

## Integration Points

- Audio: heartbeat under low stamina, fire crackle, blizzard wind → `docs/specs/audio/adaptive.md`.
- Renderer: time-of-day sun + ambient → `docs/specs/genres/openworld.md`.
- Networking: server-authoritative build state (cheat-prone) → `docs/specs/networking/replication.md`.
- Agent: long-horizon survival scenario (7 in-game days headless) → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"t":3120,"sys":"surv","evt":"vital_threshold","e":1,"kind":"temp_c","level":33.1}
```

## Test Requirements

- Vitals: with fixed env, character starves in [BENCHMARK NEEDED] hours within ±5%.
- Build collapse cascades to expected parts list (golden file).
- Crafting graph: every recipe reachable from starter inventory tree (game-side check).
- Day/night cycle: ambient lookup deterministic at given hour_f.
- 7-day headless run: no memory growth, no NaN vitals.

## Prior Art

- Don't Starve insanity + hunger interplay ✓.
- The Long Dark temperature envelope ✓ — primary inspiration.
- Rust integrity model ✓ — foundation propagation.
- Valheim build pieces ✓ — snap-grid simplicity.
- RimWorld emergent storytelling (Tynan Sylvester GDC) ✓ — telemetry-as-narrative.

## Open Questions

- [DECISION NEEDED] Permadeath default vs respawn with penalty.
- [DECISION NEEDED] Base-building grid: 1 m vs 2 m.
- [BENCHMARK NEEDED] Item decay sweep cost at 1M items across world (chunked?).
