<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Rigid Body Dynamics

> Rigid bodies, constraints, joints, and motors. Sequential-impulse solver with island parallelism. Stable stacking, predictable joints, deterministic by default.

## Boundaries

- Owns: `RigidBody`, `Mass`, `Velocity`, `Joint`, `Motor`, integrator, constraint solver, sleeping, CCD coordination.
- Does NOT own: shape geometry / collision detection (→ `docs/specs/physics/collision.md`), character locomotion (→ `docs/specs/physics/character.md`), soft / deformable (→ `docs/specs/physics/soft.md`).
- Depends on: `overview.md` (world + step), `collision.md` (manifolds), `docs/specs/core/math.md`.

## Architecture

```
   BodySet ───► IslandBuilder ───► Solver (per island, parallel)
      ▲             │                     │
      │             ▼                     ▼
   Joints     ContactGraph         velocity iters  ──►  integrate  ──►  position iters
                                   (PGS impulses)      (semi-implicit    (Baumgarte /
                                                        Euler)            split-impulse)
```

Per island the solver is a **sequential impulses** loop, Catto-style: warm-start cached impulses → N velocity iterations across (contact + joint) constraints → integrate → M position-correction iterations. Islands are independent → solved on the job graph.

### Integrator

- Semi-implicit (symplectic) Euler. `v += (F/m + g) Δt; x += v Δt`.
- Angular: `ω += I⁻¹ (τ − ω × Iω) Δt` with gyroscopic term toggle.
- Quaternion integration: `q += 0.5 * (ω · q) Δt`, then renormalize each step (bit-exact in Fixed mode).

### Body States

| State        | Steps | Notes                                                  |
| ------------ | ----- | ------------------------------------------------------ |
| `Dynamic`    | yes   | full forces / impulses / collisions                    |
| `Kinematic`  | yes   | velocity-driven, infinite mass to dynamics             |
| `Static`     | no    | immovable; never solved; collider-only                 |
| `Disabled`   | no    | excluded from broad phase                              |
| `Sleeping`   | no    | wakes on contact, force, or neighbor wake propagation  |

Sleep threshold: linear & angular velocity below `(sleep_lin_eps, sleep_ang_eps)` for `sleep_time_threshold` (default 0.5 s). Wake propagation walks contact graph one hop.

### Solver

Sequential impulses (Catto, GDC 2006). For each constraint per iteration:

```
λ_new = clamp(λ_old + Δλ, lo, hi)
Δλ_applied = λ_new − λ_old
v_a += Δλ_applied * J_a⁻¹
v_b += Δλ_applied * J_b⁻¹
```

Warm-starting: cache λ from previous tick by feature ID (`vertex⨯vertex`, `edge⨯edge` etc.). 8 velocity iters, 3 position iters by default.

`[DECISION NEEDED]` PGS (current default) vs TGS-Soft (Rapier 0.18+) vs XPBD positional rigid. PGS chosen first for predictability + Erin Catto educational lineage. XPBD reserved for soft (→ `soft.md`).

## Mass Properties

```rust
pub struct MassProperties {
    pub mass: Fixed64,         // 0 = infinite (static / kinematic)
    pub inv_mass: Fixed64,
    pub local_com: Vec3,
    pub principal_inertia: Vec3, // diagonalized
    pub principal_local_frame: Quat,
}
```

Auto-derived from collider shape + density on `Body::build()`. User may override.

## Public API

```rust
pub struct RigidBodyDesc {
    pub body_type: BodyType,        // Dynamic / Kinematic / Static
    pub position: Isometry,         // Vec3 + Quat
    pub linvel: Vec3,
    pub angvel: Vec3,
    pub linear_damping: Fixed64,    // default 0
    pub angular_damping: Fixed64,   // default 0
    pub gravity_scale: Fixed64,     // default 1
    pub ccd: CcdMode,               // Off | Speculative | SubstepTOI
    pub can_sleep: bool,            // default true
    pub locked_axes: AxisMask,      // freeze translation/rotation per axis
    pub user_data: u64,             // ECS entity id, agent token, etc.
}

pub struct RigidBody;  // handle = BodyHandle(u32 idx + u32 gen)

impl PhysicsWorld {
    pub fn spawn_body(&mut self, desc: RigidBodyDesc) -> BodyHandle;
    pub fn despawn_body(&mut self, h: BodyHandle);
    pub fn body(&self, h: BodyHandle) -> &RigidBody;
    pub fn body_mut(&mut self, h: BodyHandle) -> &mut RigidBody;

    pub fn apply_force(&mut self, h: BodyHandle, f: Vec3);
    pub fn apply_force_at(&mut self, h: BodyHandle, f: Vec3, world_point: Vec3);
    pub fn apply_impulse(&mut self, h: BodyHandle, j: Vec3);
    pub fn apply_torque(&mut self, h: BodyHandle, t: Vec3);
    pub fn apply_torque_impulse(&mut self, h: BodyHandle, ti: Vec3);
    pub fn wake(&mut self, h: BodyHandle);
    pub fn sleep(&mut self, h: BodyHandle);
}
```

Forces accumulate within a step, are zeroed after integration. Impulses apply immediately to velocity.

## Joints

All joints share the constraint API: `position`, `axis`, `limits`, `motor`, `break_impulse`.

| Joint        | DoF Removed | Inspirations                                |
| ------------ | ----------- | ------------------------------------------- |
| `Fixed`      | 6           | Rapier `FixedJoint`                         |
| `Revolute`   | 5 (1 spin)  | hinge — door, wheel; Box2D `b2RevoluteJoint`|
| `Prismatic`  | 5 (1 slide) | piston, slider; Box2D `b2PrismaticJoint`    |
| `Spherical`  | 3 (ball)    | ragdoll shoulder; Bullet `btPoint2Point`    |
| `Generic6Dof`| configurable 0–6 | vehicles, custom rigs; Bullet           |
| `Rope`       | distance ≤ L | rope segment; Rapier rope-joint            |
| `Spring`     | soft pos.   | damped spring; XPBD compliance              |

Each joint exposes:

```rust
pub struct JointDesc {
    pub a: BodyHandle, pub b: BodyHandle,
    pub anchor_a: Vec3, pub anchor_b: Vec3,
    pub kind: JointKind,
    pub limits: Option<Limits>,        // (lo, hi) per limited axis
    pub motor: Option<Motor>,
    pub break_impulse: Option<Fixed64>, // joint snaps when exceeded
    pub collide_connected: bool,
}

pub struct Motor {
    pub target_vel: Fixed64,           // or target_pos with PD
    pub max_force: Fixed64,
    pub stiffness: Fixed64,            // 0 = pure velocity motor
    pub damping: Fixed64,
}
```

Motors solved as additional constraints in the same PGS loop (Catto "Soft Constraints" GDC 2011 — CFM/ERP form).

`[DECISION NEEDED]` Joint solver: per-island PGS (current) vs XPBD positional joints (better for stiff chains). May offer both: `JointSolverHint::Stiff | Soft`.

## Continuous Collision (CCD)

| Mode         | Cost     | Use                                            |
| ------------ | -------- | ---------------------------------------------- |
| `Off`        | 0        | default for non-fast bodies                    |
| `Speculative`| low      | adds predicted contacts to manifold (Rapier)   |
| `SubstepTOI` | medium   | sub-steps fast body to first time-of-impact    |

Auto-promotion: any dynamic body whose translation per step > 0.5 × min(half_extents) is escalated to Speculative for that step. Bullets / projectiles should declare `CcdMode::SubstepTOI`.

## Performance Contract

| Metric                                          | Target         | Hard limit      |
| ----------------------------------------------- | -------------- | --------------- |
| 1k dynamic boxes + 1k joints, 8/3 iters, 60 Hz  | < 3 ms / step  | < 6 ms / step   |
| Sleep ratio in steady-state pyramid (1k boxes)  | > 95 %         | > 80 %          |
| Joint stretch under 1× gravity, default iters   | < 1 % of length| < 5 %           |
| Wake propagation latency                        | 1 step         | 2 steps         |

## Error Contract

| Code                       | Meaning                                  | Caller action                       |
| -------------------------- | ---------------------------------------- | ----------------------------------- |
| `PHY_E_INVALID_MASS`       | mass ≤ 0 on dynamic body                 | reject; static/kinematic if intended|
| `PHY_E_JOINT_REF_DEAD`     | joint references freed body              | despawn joint or rebind             |
| `PHY_E_CCD_BUDGET`         | too many sub-step TOI iterations         | raise budget or use Speculative     |
| `PHY_E_LOCKED_DYNAMIC`     | applying force to kinematic body         | switch to `set_kinematic_velocity`  |

## Integration Points

- ECS: `Transform` is the rendered transform; physics writes back after step (→ `docs/contracts/core-physics.md`).
- Networking: every body's `(pos, rot, linvel, angvel, sleep_state, accum_λ)` is part of the snapshot (→ `determinism.md`).
- Scripting: limited surface — `apply_impulse`, `set_velocity`, `is_sleeping`, read state. No solver tweaks at runtime from scripts.
- Agent: `physics.body.spawn / apply_impulse / inspect` JSON-RPC, plus per-body trace channel.

## Test Requirements

- Box stack of 20 — stable for 30 s, top body within ±0.5 mm of rest pos.
- Newton's cradle (5 spheres, rope joints) — last sphere swings with energy loss < 5 % over 10 s with damping 0.
- Hinge motor at 2 rad/s under load — actual ω within 5 % of target.
- 100 ragdolls (15 bodies + 14 joints each) drop, no NaN, < 8 ms / step on reference HW.
- Bullet (CCD on) through 1 cm wall at 100 m/s — registers contact, does not tunnel.
- Warm-start disabled → solver still converges in ≤ 32 iters for stack-of-10.

## Prior Art

- Catto, *Sequential Impulses* (GDC 2006) — ✓ solver core.
- Catto, *Soft Constraints* (GDC 2011) — ✓ joint compliance model.
- Catto, *Continuous Collision* (GDC 2013) — ✓ CCD reference.
- Rapier — ✓ island parallel scheduling, ✓ snapshot API. Migrated to TGS-Soft 2024+.
- Jolt — ✓ deferred activation, ✓ batch insertion. (Rouwé, GDC 2022 *Architecting Jolt*.)
- Bullet — ✓ rich joint library; ✗ accreted API, harder determinism.

## Open Questions

- `[DECISION NEEDED]` Default solver: PGS vs TGS. PGS picked for v0.1 — re-evaluate at v0.4 with cloth/ragdoll benchmarks.
- `[DECISION NEEDED]` Expose Featherstone reduced-coordinate articulations (Bullet `btMultiBody`) for vehicles / characters, or stay maximal-coords + 6-DoF joint clusters.
- `[DECISION NEEDED]` Wheel raycast vehicle (Rapier `WheelCollider`-style) ships in `crates/physics-vehicle/` or stays in `genres/racing` (→ `docs/specs/genres/racing.md`).
