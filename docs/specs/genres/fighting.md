<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Fighting Genre Module

> Fighting-game primitives: frame-data driven move authoring, layered hitbox/hurtbox/throwbox/proxybox, input buffer + motion parser, GGPO-style rollback netcode, training-mode tooling.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.fighting] version = "0.1"
tick_hz = 60                     # MUST be fixed
input_buffer_frames = 8
rollback_frames = 8
netcode = "rollback"             # → docs/specs/networking/rollback.md
```

## Boundaries

- Owns: frame-data tables, move FSM, hitbox/hurtbox layering, input buffer, motion parser (236P etc.), cancel/link/option-select arbitration, training tools.
- Does NOT own: rollback transport (→ `docs/specs/networking/rollback.md`), animation playback (game-side), audio (→ `docs/specs/audio/spatial.md`).
- Depends on: networking rollback, deterministic math, input HAL, jobs.

## Architecture

```
Input(t) ──► InputBuffer (ring, 8f) ──► MotionParser
                                            │
                            recognized inputs (1, 6P, 236P, 623K, ...)
                                            ▼
                                   ┌────────────────┐
                                   │   Move FSM     │
                                   │  (per fighter) │
                                   │  Idle/Walk/Att │
                                   │  Block/Hit/    │
                                   │  Stun/Knockdown│
                                   └────┬───────────┘
                                        │ active frames
                                        ▼
                  Hitbox sweep × opponent hurtboxes
                                        │
                                        ▼
                     Resolve: hit/block/whiff/clash/throw-tech
                                        │
                                        ▼
                     ApplyHitState (hitstun, blockstun, KB, damage)
                                        │
                                        ▼
                                   Telemetry
```

### Hitbox Layering

| Box | Purpose |
|---|---|
| hurtbox | can be hit |
| hitbox | strikes hurtbox |
| throwbox | grabs throwable opponent |
| proxybox | proximity guard trigger, parry window |
| pushbox | body collision |
| projectile_hitbox | belongs to projectile entity |

Per frame: arrays of (kind, AABB or oriented capsule, dmg, props).

### Frame Data Table

```
Move: "lvl3.5C"
  startup:  6f (frames 1..6)
  active:   3f (7..9)   hitbox H1 dmg=70 hit_lv=Mid level adv +5 / -2
  recovery: 14f (10..23)
  cancel:   {special: 4..23, super: 7..18, dash: 9..15}
  on_block: blockstun 12, push 6.0u
  on_hit:   hitstun 18, gravity scale 0.6
```

ASCII timeline:
```
Frame: 1 2 3 4 5 6 7 8 9 10 11 .. 23
       S S S S S S A A A R  R  ..  R
                   ^hitbox active^
```

## Public API

```rust
// components
pub struct Fighter { def: FighterDefId, hp:i32, meter:i16, state: FSMState, t_in_state:u16 }
pub struct InputBuf { ring: [InputFrame; 60], head: u16 }
pub struct Boxes { hurts: SmallVec<[Hurt;4]>, hits: SmallVec<[Hit;4]>, throws: SmallVec<[Throw;1]>, pushbox: Aabb }
pub struct HitState { kind: HitKind, stun_left: u16, juggle_count: u8 }

// resources
pub struct MoveRegistry; // FighterDef → moves[]
pub struct MotionParser; // pattern table compiled at load

// systems (per fixed tick, ORDERED — determinism)
fn input_collect_system();
fn motion_parse_system();
fn fsm_advance_system();
fn box_sweep_system();
fn hit_resolve_system();
fn apply_hitstate_system();
fn pushback_clamp_system();      // corner-push, both fighters in stage

// events
pub enum FightEvent {
    InputRecognized{p, pattern}, MoveStarted{p,mv}, HitConfirmed{atk,vic,mv},
    Blocked{atk,vic,mv}, ThrowTech{a,b}, KO{loser}, RoundOver{winner},
}
```

## Move FSM Diagram

```
        ┌─────┐    walk/dash    ┌──────┐
        │Idle │ ◄─────────────► │Walk  │
        └──┬──┘                 └──┬───┘
           │ attack input          │
           ▼                       ▼
        ┌─────┐ cancel ──► ┌──────────┐ recovery ──► Idle
        │Start│           │Active    │
        └──┬──┘           └────┬─────┘
           │                   │ on hit/block opp
           ▼                   ▼
        Whiff               Hitstop (both)
                               │
                               ▼
                          Opponent → Hitstun/Blockstun
```

## Input Buffer & Motion Parser

```
buffer  (newest→oldest):  P, 6, 3, 2, 1, ...
patterns:
  236P  = 2,3,6 within 12f then P within 4f
  623P  = 6,2,3,6 within 14f then P within 4f
  41236K= 4,1,2,3,6 within 16f then K within 4f
charge moves: hold direction ≥ N frames, opposite within window
```
Parser is deterministic; matches longest pattern with highest priority.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Per-tick simulation (2 fighters + projectiles) | <300 µs | 1 ms |
| Hitbox sweep | <50 µs | 200 µs |
| Resim 8 frames (rollback) | <2.4 ms | 8 ms |
| Determinism across OS | bit-exact | required |
| Input poll → applied | ≤ 1 frame | 2 frames |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `FIGHT_E001` | unknown move id | substitute neutral, log |
| `FIGHT_E002` | frame data malformed | reject load, surface to editor |
| `FIGHT_E010` | rollback hash mismatch | desync — abort match, snapshot |

## Integration Points

- Networking: → `docs/specs/networking/rollback.md` (GGPO model — input delay, prediction, rollback, resim).
- Animation: FSM exposes hook for game to drive anim — engine does not bind anim to frame data automatically (anim ≠ frame data, per FG industry rule).
- Audio: hit/block stings per HitKind tier → `docs/specs/audio/spatial.md`.
- Agent: training-mode harness, frame-step, hit-confirm probability tests → `docs/specs/agent/scenarios.md`.

## Training Tooling (Editor)

- Hitbox viewer overlay (toggle per layer).
- Frame-step + frame-by-frame inspector.
- Record/replay dummy actions.
- Combo trial scripting (TOML scenarios run in agent harness).

## Telemetry

```json
{"frame":7421,"sys":"fight","evt":"hit_confirmed","atk":1,"vic":2,"mv":"623P","dmg":120,"meter_gain":12}
```

## Test Requirements

- Determinism: replay 60 sec match → identical final hash 1000× across OS.
- Motion parser: each pattern recognized at correct frame within ±0 frames over recorded scripts.
- Rollback: inject 8-frame mispredict → resim equals ground-truth.
- Throw-tech: simultaneous-frame throws produce tech 100% of recorded cases.
- Frame data loader: corrupted file rejected with structured error.

## Prior Art

- GGPO rollback (Tony Cannon, GDC 2012) ✓ — networking backbone.
- Street Fighter 2 / 3rd Strike frame data ✓ — canonical model.
- Skullgirls hitbox tooling ✓ — first-class viewer.
- Guilty Gear Strive animation/box decoupling ✓.
- Tekken 8 input buffer behavior (heavier buffer than 2D) — selectable per project.
- Sirlin "Playing to Win" frame trap definitions ✓.

## Open Questions

- [DECISION NEEDED] Default 2D vs 3D plane (Tekken/SC vs SF).
- [DECISION NEEDED] Built-in supers/install model or game-side.
- [BENCHMARK NEEDED] Resim cost ceiling for projectile-heavy patches (Peacock, Faust).
