<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# RPG Genre Module

> Role-playing primitives: stat/attribute/derived system, inventory + equipment, dialogue trees with conditions, quest graph, save/load with backwards compat.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.rpg]
version = "0.1"
stat_model = "attr+derived"   # base attrs feed derived stats via formulas
save_format = "ron+zstd"
```

## Boundaries

- Owns: Stat blocks, modifiers, inventory, equip slots, dialogue VM, quest graph, journal, save/load serializer.
- Does NOT own: combat resolution (game-side), animation, AI behaviour trees (→ `docs/specs/agent/...`), persistent world (→ `docs/specs/genres/mmorpg.md`).
- Depends on: core ECS, scripting (Lua) for dialogue conditions, assets (item icons), events.

## Architecture

```
       ┌─────────────┐
       │  Attributes │ STR DEX INT WIS CHA CON
       └──────┬──────┘
              │ formulas (data-driven)
              ▼
       ┌─────────────┐    ModifierStack (timed, source-tagged)
       │   Derived   │◄── buffs/debuffs/equipment
       │ HP MP DMG AC│
       └──────┬──────┘
              │
              ▼
        StatChangeEvent ──► Telemetry

Inventory ─── slots[] ─── ItemDef registry
   │
   ▼
Equipment ── slot=Head/Chest/MH/OH/Ring1/Ring2/...

DialogueVM ── Node graph ── conditions(Lua) → branches
QuestSystem ── Quest DAG ── stages with predicates → rewards
```

## Public API

```rust
pub struct Attributes { str:i16, dex:i16, int:i16, wis:i16, cha:i16, con:i16 }
pub struct Derived { hp:f32, hp_max:f32, mp:f32, mp_max:f32, dmg:f32, ac:i16 /*..*/ }
pub struct ModifierStack(Vec<Modifier>); // additive/mult/override, with source + expiry

pub struct Inventory { slots: Vec<ItemStack>, capacity: u16 }
pub struct Equipment { map: HashMap<EquipSlot, ItemInstanceId> }

pub struct DialogueRunner { tree: DialogueTreeId, cursor: NodeId, vars: ScriptScope }
pub struct QuestLog { active: Vec<QuestState>, completed: Vec<QuestId> }

// systems
fn recompute_derived_system(...);
fn modifier_expiry_system(...);
fn dialogue_step_system(...);
fn quest_evaluator_system(...);
fn save_system(...); fn load_system(...);

// events
pub enum RpgEvent {
    ItemAcquired{e, item, qty}, ItemUsed{e,item}, Equipped{e,slot,item},
    StatChanged{e, key, old, new, src}, DialogueAdvanced{e, node},
    QuestStarted(QuestId), QuestStageCompleted{q, stage}, QuestCompleted(QuestId),
}
```

## Data Formats

**Item (`items/sword_iron.toml`):**
```toml
id = "sword_iron"
slot = "MainHand"
stackable = false
mods = [{stat="dmg", op="add", value=8}]
icon = "ui/items/sword_iron.png"
```

**Dialogue (`dialogue/elder.dlg.toml`):**
```toml
[[node]]
id = "greet"
text_key = "elder.greet"
choices = [
  {text_key="ask_quest", goto="quest_offer", cond="!player.has_quest('elder.1')"},
  {text_key="bye", goto="end"}
]
```

**Quest (`quests/elder_1.toml`):**
```toml
id = "elder.1"
stages = [
  {id="find", predicate="visited('cave_entry')"},
  {id="retrieve", predicate="inventory.has('relic',1)"},
  {id="return", predicate="near('elder', 3.0)"},
]
rewards = [{kind="xp", value=500}, {kind="item", id="amulet_proto"}]
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Recompute derived (1 entity) | <2 µs | 10 µs |
| Modifier stack apply (16 mods) | <5 µs | 20 µs |
| Dialogue step | <50 µs | 200 µs |
| Save (10k entities) | <500 ms | 2 s |
| Load (10k entities) | <800 ms | 3 s |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `RPG_E001` | unknown ItemId | reject acquire |
| `RPG_E002` | inventory full | emit `ItemAcquireDenied` |
| `RPG_E010` | quest predicate compile failed | mark quest invalid, log |
| `RPG_E020` | save version mismatch | run migration chain |

## Integration Points

- Scripting: dialogue conditions + quest predicates run in Lua sandbox → `docs/specs/scripting/lua.md`.
- Save/Load: uses asset registry UUIDs → `docs/specs/assets/registry.md`.
- UI: emits journal/inventory events to game UI layer (engine-agnostic).
- Agent: full state snapshot endpoint for replay → `docs/specs/agent/replay.md`.

## Save Format

```
header: magic="NXSV" u32, version u32, game_id [16]u8, ts u64
chunks:
  ENT  — entity table (id, archetype, component blobs)
  REG  — asset reference table (UUID → path)
  SCRIPT — scripting VM scope snapshots
  QUEST — quest graph state
  CKSUM — blake3 over all preceding chunks
```
Migration chain: each version owns an upgrader fn `vN → vN+1`.

## Test Requirements

- Modifier expiry restores derived to pre-buff state exactly.
- Dialogue traversal with all branches reaches all terminal nodes (graph coverage).
- Quest predicates evaluated headlessly produce same result as in-game (determinism).
- Save → load → save → byte-identical (canonical serialization).
- 10k-entity save round-trip <2 s on reference HW.

## Prior Art

- Disco Elysium dialogue ✓ — skill-checks as first-class.
- Pillars of Eternity stat formulas ✓ — explicit, data-driven.
- Skyrim modifier stack ✗ overflow bugs from int wrap — Nexus uses saturating math.
- Larian (BG3) quest journal ✓ — DAG with multiple satisfy paths.
- Catlike Coding RPG tutorials (reference).

## Open Questions

- [DECISION NEEDED] Inventory model: slot-grid (Diablo) vs flat-stack (Skyrim) — engine offers both, but default?
- [DECISION NEEDED] Time-scaled modifiers — game-time, real-time, or both?
- [BENCHMARK NEEDED] Save chunked vs monolithic for 100k entities.
