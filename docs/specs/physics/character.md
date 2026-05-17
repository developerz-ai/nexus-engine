<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Character Controller

> Kinematic capsule controller with sweep-and-slide, slope handling, step-up climbing, coyote time, jump buffering, ground-aware movement. Two flavors: kinematic (default) and rigid-backed.

## Boundaries

- Owns: `CharacterController`, sweep-and-slide algorithm, ground/wall/ceiling state, slope policy, step climbing, gameplay-feel timers (coyote, jump buffer, apex hang).
- Does NOT own: input mapping (→ `docs/specs/core/hal.md`), animation blend (→ renderer/animation), gravity policy (→ `overview.md`), genre-specific weapon recoil (→ `docs/specs/genres/fps.md`).
- Depends on: `overview.md` (world step), `collision.md` (shapecast queries), `rigid.md` (optional rigid-backed mode).

## Architecture

```
   Input ──► desired_move (Vec3 per tick) ──► CharacterController.step(dt)
                                                       │
                                                       ▼
                                       ┌────────────────────────────────┐
                                       │  1. Apply gravity to vertical  │
                                       │  2. Sweep capsule along motion │
                                       │     (collision.shapecast)      │
                                       │  3. On hit: classify normal    │
                                       │      (floor / wall / ceiling   │
                                       │       / slope_too_steep)       │
                                       │  4. Slide: project remaining   │
                                       │     motion onto plane          │
                                       │  5. Step-up if blocked by      │
                                       │     small obstacle             │
                                       │  6. Snap-down if leaving floor │
                                       │     while grounded             │
                                       │  7. Update timers              │
                                       │     (coyote, buffer, airtime)  │
                                       └────────────────────────────────┘
                                                       │
                                                       ▼
                                          new_position, new_state
```

Two implementations behind one trait, picked per-character:

| Mode             | Body type     | Pros                                              | Cons                                           |
| ---------------- | ------------- | ------------------------------------------------- | ---------------------------------------------- |
| `Kinematic`      | kinematic     | predictable, ignores other-body push-back        | does not push dynamics naturally (needs hint) |
| `RigidBacked`    | dynamic w/ locked rotation | full physics interaction                     | harder to feel-tune; can be shoved unfairly  |

Jolt offers both — Nexus mirrors this (Rouwé, GDC 2022). Default = `Kinematic`. `RigidBacked` for physics-puzzle / horror games where the world pushes back hard.

## Public API

```rust
pub struct CharacterControllerDesc {
    pub mode: CharMode,                 // Kinematic | RigidBacked
    pub shape: CharShape,               // Capsule { radius, half_height } | Cylinder
    pub max_slope: Fixed64,             // radians, default 50°
    pub min_slide_angle: Fixed64,       // below this, treat as floor
    pub step_offset: Fixed64,           // max step-up height, default 0.4 m
    pub snap_to_ground: Fixed64,        // max snap-down distance, default 0.2 m
    pub skin_width: Fixed64,            // sweep epsilon, default 0.01 m
    pub up: Vec3,                       // usually Vec3::Y
    pub coyote_time: Fixed64,           // seconds, default 0.10
    pub jump_buffer: Fixed64,           // seconds, default 0.10
    pub max_iterations: u8,             // slide passes per step, default 4
    pub mass: Fixed64,                  // for pushing dynamics, default 70 kg
    pub apply_impulses_to_dynamics: bool,
    pub filter: QueryFilter,
}

pub struct CharacterController; // handle = CharHandle(u32 + u32)

impl PhysicsWorld {
    pub fn spawn_character(&mut self, desc: CharacterControllerDesc, pos: Vec3) -> CharHandle;

    pub fn character_step(&mut self, h: CharHandle, desired_motion: Vec3, dt: Fixed64)
        -> CharStepResult;

    pub fn character_state(&self, h: CharHandle) -> &CharacterState;
}

pub struct CharStepResult {
    pub effective_motion: Vec3,
    pub grounded: bool,
    pub slope_normal: Option<Vec3>,
    pub hit_ceiling: bool,
    pub touched_dynamic: SmallVec<[(BodyHandle, Vec3); 4]>, // (body, push impulse)
    pub iterations_used: u8,
}

pub struct CharacterState {
    pub position: Vec3,
    pub grounded: bool,
    pub airtime: Fixed64,
    pub coyote_left: Fixed64,
    pub jump_buffer_left: Fixed64,
    pub last_floor_normal: Vec3,
}
```

Input layering (gameplay-feel helpers, optional):

```rust
impl CharacterController {
    pub fn try_jump(&mut self, impulse: Vec3) -> bool;  // honors coyote + buffer
    pub fn request_jump(&mut self);                     // fills jump_buffer
    pub fn refresh_coyote(&mut self);                   // called on ground frame
}
```

## Slope Handling

Per hit normal `n` against `up`:

```
angle = acos(n · up)

angle < min_slide_angle      → floor; full vertical correction; grounded
angle ≤ max_slope            → walkable slope; project motion along slope plane
angle > max_slope            → wall-like; horizontal-only slide; not grounded
n · up < -0.7                → ceiling; cancel upward motion
```

On steep slopes, gravity is allowed to slide the character down (no sticking).

## Step Climbing

Inspired by Quake/Source `stepheight`, Unity CharacterController, Jolt virtual character. Algorithm:

1. Sweep horizontal motion; on blocking wall hit with `angle > max_slope`:
2. Trial shapecast: raise capsule by `step_offset`, sweep forward by remaining motion.
3. If clear, sweep down `step_offset + skin_width`.
4. If landing surface walkable → commit step. Else → revert, treat as wall.

Cost: ≤ 3 extra shapecasts per step climb. Capped by `max_iterations`.

## Coyote Time & Jump Buffer

Standard 2010s-platformer feel rules (lifted from Celeste, Hollow Knight design talks):

- **Coyote time**: after leaving a ledge, `coyote_left = coyote_time`. Decrements each step. `try_jump` succeeds if `grounded || coyote_left > 0`.
- **Jump buffer**: `request_jump()` sets `jump_buffer_left = jump_buffer`. On any later step where the character becomes grounded, an auto-jump fires if buffer > 0.

Both timers are part of `CharacterState` → serialized in snapshots → rollback-safe.

## Pushing Dynamic Bodies

In `Kinematic` mode, when sweep contacts a dynamic body and `apply_impulses_to_dynamics=true`:

```
relative_v = char_velocity - body_velocity_at_point
push_impulse = clamp(mass * (relative_v · n_into_body), 0, push_cap) * n_into_body
PhysicsWorld::apply_impulse_at(body, push_impulse, contact_point)
```

`push_cap` defaults to `mass * 3` m/s — prevents launching ragdolls into orbit.

## Sweep-and-Slide Loop (per step)

```
remaining = desired_motion
for i in 0..max_iterations:
    hit = shapecast(capsule, pos, remaining)
    if hit.is_none():
        pos += remaining
        break
    pos += remaining * hit.toi      // travel until contact (minus skin)
    remaining = remaining * (1 - hit.toi)
    classify(hit.normal)            // floor/slope/wall/ceiling
    if step_climb_applicable(hit):
        try_step_up()
    remaining = project_on_plane(remaining, slide_normal)
if grounded_before && !grounded_after && downward_velocity_small:
    try_snap_down(snap_to_ground)
```

## Performance Contract

| Metric                                          | Target         | Hard limit       |
| ----------------------------------------------- | -------------- | ---------------- |
| Cost per `character_step` (4 iters, no step-up) | < 25 µs        | < 80 µs          |
| 1000 characters in same scene                   | < 5 ms total   | < 12 ms          |
| Step-up overhead                                | < +50 % single-iter cost | < +150 %         |
| Determinism: same inputs → same path            | always (Fixed) | always           |

## Error Contract

| Code                          | Meaning                                          | Caller action                                |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `PHY_E_CHAR_STUCK`            | initial position penetrates static geometry      | depenetrate via shape query before stepping  |
| `PHY_E_CHAR_ITER_EXHAUSTED`   | `max_iterations` hit; motion may be incomplete   | inspect telemetry; raise iter cap            |
| `PHY_E_CHAR_NON_CAPSULE`      | unsupported shape kind                           | use Capsule or Cylinder                      |

## Integration Points

- ECS: `CharacterController` component owns `CharHandle`. System reads `DesiredMove`, calls `character_step`, writes `Transform` + `CharacterState`.
- Networking: `CharacterState` is snapshot data; full rollback works because controller logic is pure of `(state, input, dt, world)` (→ `docs/specs/networking/rollback.md`).
- Scripting: high-level API exposed (`request_jump`, `state.grounded`, `set_desired_motion`). No direct sweep access.
- Genres: FPS, platformer, RPG, MMO all consume this. → `docs/specs/genres/fps.md`, `docs/specs/genres/platformer.md`.
- Agent: `physics.character.spawn / step / state`; semantic API may translate `"walk to (x,y,z)"` into per-tick desired-motion vectors.

## Test Requirements

- Walk up 45° slope at constant speed; no jitter; vertical velocity stays at gravity-induced.
- Walk into 0.3 m step (≤ `step_offset`) → climbs without stopping.
- Walk into 0.6 m step → stops as if it were a wall.
- Drop off ledge, press jump within 100 ms → coyote jump succeeds.
- Press jump 100 ms before landing → buffered jump fires on first grounded frame.
- 1000-char stress: avg `character_step` ≤ 25 µs on M2.
- Determinism: same recorded input sequence over 10 s replays bit-identical position in Fixed mode (single thread vs 16 threads).
- Two characters pushed into wall corner — no infinite slide loop; `iterations_used` ≤ 4.

## Prior Art

- Quake / Source `pmove` — ✓ slope projection, stepheight, original sweep-and-slide.
- Unity CharacterController — ✓ skin width concept; ✗ no proper coyote / buffer baked in.
- Jolt `CharacterVirtual` (Rouwé, GDC 2022) — ✓ virtual character outside physics step; chosen as primary inspiration for `Kinematic` mode.
- Rapier `KinematicCharacterController` — ✓ Rust-native API shape.
- Celeste / Hollow Knight design talks — ✓ coyote, jump buffer, apex hang as first-class.

## Open Questions

- `[DECISION NEEDED]` Auto-stair detection (sloped collider over actual steps) vs require designers to model ramps. Lean toward auto step-up handling both cases.
- `[DECISION NEEDED]` Apex hang time (reduce gravity near jump apex for floatier feel) as a first-class toggle vs leaving to genres/platformer.
- `[DECISION NEEDED]` Multi-shape characters (head + body capsules for crouch transitions) in core controller vs leaving to gameplay code.
- `[BENCHMARK NEEDED]` MMO target: 5000 NPC characters in one zone; current 1000-char target is for player + crowd.
