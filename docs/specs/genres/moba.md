<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# MOBA Genre Module

> MOBA primitives: 3-lane map topology, towers/barracks, jungle camps with respawn, creep waves, gold/XP economy, ability system inspired by DOTA2 "modifier-everything" architecture.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.moba] version = "0.1"
tick_hz = 30
lanes = 3
match_max_min = 90
```

## Boundaries

- Owns: ability/modifier system, lane management, tower/barracks logic, creep wave spawner, jungle camp lifecycle, gold/XP ledger, last-hit detection, ability targeting.
- Does NOT own: per-hero stats (use → `docs/specs/genres/rpg.md` stat block), terrain/navmesh (engine), netcode (→ `docs/specs/networking/replication.md`).
- Depends on: RPG stats, scripting (ability scripts in Lua), pathing (RTS pathing layer for creeps), telemetry.

## Architecture

```
              ┌────────────────┐
              │  Match Director │ (timer, phase, win cond)
              └───────┬─────────┘
                      │
   ┌──────────────────┼──────────────────┐
   ▼                  ▼                  ▼
LaneMgr          JungleMgr          AbilitySystem
 ├ Top spawner    ├ camps[]          ├ Caster
 ├ Mid spawner    ├ respawn timers   ├ Modifier stack (every effect)
 └ Bot spawner    └ buffs            └ Event hooks (on_dmg, on_kill, ...)
   │                                       │
   ▼                                       ▼
 Towers/Barracks ──────────────────► DamageEvent ► GoldXp ledger
```

### Lane Topology

```
   Radiant Base                          Dire Base
   ┌────┐                                       ┌────┐
   │ A  │═T3══T2══T1══════════════T1══T2══T3═══│ A  │  top
   │T3 │  \                                /   │T3 │
   │   │   \═════════T2══════════════════/    │   │  mid
   │T3 │   /                              \   │T3 │
   │ B  │═T3══T2══T1══════════════T1══T2══T3═══│ B  │  bot
   └────┘            JUNGLE       JUNGLE       └────┘
```
T1/T2/T3 = tower tiers. A/B = barracks (ranged/melee). Ancient = win target.

### Ability/Modifier Model (DOTA2-inspired)

Everything is a **modifier**. Damage, slows, stuns, auras, items, buffs, even passives. Modifiers carry: source, duration, stack rule, properties map, event handlers (`on_attack`, `on_taken_damage`, `on_death`, ...). Abilities are Lua scripts that apply/remove modifiers.

```
Hero ──► ModifierStack
            ├ "stun" dur=1.4 src=ability:lina.q
            ├ "burning" dur=4 stacks=3 src=item.veil
            └ "aura.haste" dur=∞ src=ability:omni.passive
```

## Public API

```rust
// components
pub struct Hero { def: HeroDefId, team: Team, level: u8, xp: u32 }
pub struct ModStack(Vec<ActiveModifier>);
pub struct AbilitySlots { slots: [Option<AbilityId>; 6] }
pub struct LastHitable { current_attacker: Option<Entity>, hp_at_swing: f32 }
pub struct Tower { tier: u8, lane: Lane, hp: f32, range: f32 }
pub struct CreepWave { lane: Lane, t_spawn: Tick, composition: WaveDef }

// resources
pub struct AbilityRegistry; pub struct ModifierRegistry;
pub struct GoldXpLedger { per_player: HashMap<PlayerId, GoldXp> }
pub struct MatchClock { tick: Tick, phase: Phase /* DraftIdle, PreGame, Game, PostGame */ }

// systems (ordered each tick)
fn ability_cast_system();
fn modifier_tick_system();        // duration decrement, periodic procs
fn damage_resolve_system();
fn last_hit_system();
fn gold_xp_award_system();
fn lane_wave_spawn_system();
fn jungle_respawn_system();
fn tower_target_system();
fn objective_check_system();

// events
pub enum MobaEvent {
    AbilityCast{caster,abil,tgt}, ModifierApplied{e,mod_id,src,dur},
    DamageDealt{e,attacker,amt,type}, LastHit{killer,victim,gold},
    TowerDestroyed{t,by}, BarracksDestroyed{b,lane,type},
    AncientDestroyed{team}, GameOver{winner},
}
```

## Ability Script (Lua, sandboxed)

```lua
-- abilities/lina_q.lua
ability("lina_dragon_slave", {
  mana = 100, cooldown = 8.5, range = 1075,
  cast = function(caster, point)
    spawn_projectile("dragon_slave", caster, point, {
      speed = 1200, length = 700, width = 275,
      on_hit = function(self, target)
        apply_modifier(target, "lina_dmg", {dur=0, dmg=240, type="magical", src=caster})
      end
    })
  end,
})
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Tick budget (30 Hz) | <25 ms | 33 ms |
| Modifier ticks (10 heroes × 30 mods) | <0.5 ms | 2 ms |
| Ability cast latency client→server | <80 ms p95 | 200 ms |
| Wave spawn schedule jitter | <1 tick | 2 ticks |
| Determinism (rollback resim) | bit-exact | required |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `MOBA_E001` | unknown AbilityId | reject cast |
| `MOBA_E002` | insufficient mana | client-side denial event |
| `MOBA_E010` | modifier stack overflow (>64) | drop oldest non-pinned |
| `MOBA_E020` | last-hit race ambiguous | award to highest-dmg attacker, log |

## Integration Points

- Scripting: ability/modifier scripts → `docs/specs/scripting/lua.md` with capability `moba.ability`.
- Networking: server-auth replication, rollback for resim → `docs/specs/networking/rollback.md`.
- Pathing: creeps reuse RTS pathing → `docs/specs/genres/rts.md`.
- Agent: bot-vs-bot scenario harness, headless 30 Hz, 90× speed → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"tick":54320,"sys":"moba","evt":"last_hit","killer":3,"victim_kind":"creep_melee","gold":42,"lane":"mid"}
```
Per-minute: GPM/XPM/CS, hero damage dealt/taken/healed.

## Test Requirements

- 10 bots, full match to ancient destroyed, deterministic state hash across runs.
- Modifier interactions: stun + silence + slow simultaneously resolve to expected sample table.
- Tower aggro priority follows DOTA-style rules (recent enemy hero > creeps > nearest).
- Wave spawn: T+0 first wave at fountain gate (configurable).
- Lua ability sandbox: cannot read filesystem or network.

## Prior Art

- DOTA2 modifier-everything (Bruno Ferreira / IceFrog talks, GDC) ✓ — design backbone.
- LoL ability scripting in BBQ/lua hybrid ✓ — script-driven design.
- Heroes of the Storm shared XP ✗ — Nexus default per-hero, configurable.
- Predecessor / Smite tower aggro rules ✓.

## Open Questions

- [DECISION NEEDED] Camera projection default — top-down ortho vs perspective tilt.
- [DECISION NEEDED] Built-in draft phase or game-side?
- [BENCHMARK NEEDED] Modifier dispatch via vtable vs flat ID switch under 10k active modifiers (jungle creeps + heroes + items).
