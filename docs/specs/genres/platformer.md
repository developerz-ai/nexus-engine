<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Platformer Genre Module

> Precise 2D/3D platformer primitives: deterministic character physics, coyote time, jump buffering, variable-height jumps, wall jump, ledge grab, dash.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.platformer]
version = "0.1"
dimension = "2d"           # "2d" | "2.5d" | "3d"
tick_hz = 60               # MUST be fixed for feel
coyote_ms = 100
jump_buffer_ms = 120
```

## Boundaries

- Owns: platformer character FSM, coyote-time logic, input buffer, jump curves, wall/ledge detection, dash state, hazard contact.
- Does NOT own: generic character controller physics (→ `docs/specs/physics/character.md`), animation blending, level data format.
- Depends on: physics character controller, input HAL (low-latency polling), event bus.

## Architecture

```
                     ┌────────────────────────┐
   Input (poll) ──►  │   InputBuffer (120ms)  │
                     └──────────┬─────────────┘
                                │
                                ▼
   ┌───────────────────────────────────────────────┐
   │           Character FSM                       │
   │  Grounded ─jump─► Rising ──peak──► Falling    │
   │     ▲                              │  ▲       │
   │     │       (coyote 100ms)         │  │       │
   │     └──── land ─── ground sensor ◄─┘  │       │
   │                                       │       │
   │  WallSlide ─wall-jump─► Rising        │       │
   │  Dashing  (i-frames, fixed vel)        │       │
   │  Grabbing (ledge snap, no-grav)        │       │
   └────────────────────┬──────────────────────────┘
                        │
                        ▼
            Physics::move_and_slide
```

## Public API

```rust
// components
pub struct Plat2dBody { vel: Vec2, on_ground: bool, facing: i8 }
pub struct PlatFsm { state: PlatState, t_in_state: f32 }
pub enum PlatState { Grounded, Rising, Falling, WallSlide{wall_dir:i8}, LedgeGrab{ledge:LedgeId}, Dashing{t_left:f32} }
pub struct Coyote { t_since_left_ground: f32 }
pub struct JumpBuffer { t_since_press: f32 }

// resources
pub struct PlatTuning {
    jump_vel_initial: f32, jump_vel_held: f32, jump_cut_mul: f32,
    gravity_rise: f32, gravity_fall: f32, max_fall: f32,
    move_accel: f32, move_decel: f32, max_run: f32,
    dash_vel: f32, dash_dur: f32, dash_iframes: f32,
    wall_slide_max: f32, wall_jump_vec: Vec2,
    coyote_s: f32, jump_buffer_s: f32,
}

// systems (fixed-tick ordered)
fn input_buffer_system();
fn coyote_update_system();
fn fsm_tick_system();
fn movement_apply_system();    // calls physics::move_and_slide

// events
pub enum PlatEvent { Jumped{height_class:u8}, Landed{vel_y}, Dashed, WallJumped, LedgeGrabbed, Damaged{src} }
```

## Variable Jump Curve

```
vel_y
  ▲
  │     held = full curve
  │    ╲
  │  ▕  ╲      released early (apex cut)
  │  ▕   ╲╲╲
  │  ▕      ╲╲
  └──┴────────┴────── t
   ↑press     ↑release
```
Two gravities: lighter on rise, heavier on fall — Celeste-style "good feel".

## Coyote + Buffer Timing

```
ground:  ████████░░░░░░░░ (left at T0)
press:        ↑press @ T0+150 ms
coyote:  ████████░░ (100 ms grace)
buffer:        ░░░░░░░░░░░░ (press valid for 120 ms)
result:  ground re-touched @ T0+200 ms → buffered jump fires
```
Both timers run independently; jump succeeds if either window is open AND grounded condition holds within the window.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Per-character per-tick cost | <10 µs | 50 µs |
| Input → response latency | <33 ms (2 frames @ 60) | 50 ms |
| Determinism (fixed tick, fixed input) | bit-exact | required |
| 1024 simultaneous chars (auto-runners) | <5 ms | 16 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `PLAT_E001` | tuning value out of safe range | clamp + warn |
| `PLAT_E002` | character body missing physics ref | drop component, log |

## Integration Points

- Physics: must run at fixed tick == platformer tick → `docs/specs/physics/character.md`.
- Animation: state transitions emit anim triggers (game-side mapping).
- Audio: footfall/jump/dash events → `docs/specs/audio/spatial.md`.
- Networking: rollback-friendly fixed-step → `docs/specs/networking/rollback.md`.

## Telemetry

```json
{"t":12.4,"sys":"plat","evt":"jumped","e":7,"vel_y":12.5,"buffered":true,"coyote":false}
```
Useful aggregates: deaths-per-screen, dash-uses-per-min, ledge-grabs-attempted/succeeded.

## Test Requirements

- Coyote: leave ground, press jump within 100 ms → jump fires.
- Buffer: press jump 120 ms before landing → jump fires on land tick.
- Variable jump: release at T_press+50 ms → apex ≤ 60% of full jump.
- Wall jump cycles up vertical shaft 5×, no slip.
- 60-Hz playback of recorded input → identical pixel-accurate playthrough across OS.
- Maddy Thorson's "Celeste move set" reproducible in a unit test scene.

## Prior Art

- Celeste — Maddy Thorson, "The Coyote Time Talk" (GDC) ✓ — direct inspiration.
- Super Meat Boy — input buffer + apex hang ✓.
- Hollow Knight — pogo + dash combo, generous input windows ✓.
- Mario Galaxy — 3D analog version of the same rules ✓.
- "How Mega Man X jumps" — 1 frame jump prediction ✗ unforgiving; default to Celeste-style.

## Open Questions

- [DECISION NEEDED] Pixel-perfect vs sub-pixel position (snap on render only?).
- [DECISION NEEDED] Default control scheme: hold-to-run vs analog?
- [BENCHMARK NEEDED] 3D variant cost for wall normal detection at large mesh densities.
