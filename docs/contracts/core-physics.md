<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Physics

> Core owns `Transform` ground truth between physics steps; physics owns it during the step and writes back. Collision events flow physics → core::EventBus.

Related specs:
- `docs/specs/core/ecs.md` · `docs/specs/core/events.md` · `docs/specs/core/math.md`
- `docs/specs/physics/overview.md` · `docs/specs/physics/rigid.md` · `docs/specs/physics/collision.md` · `docs/specs/physics/determinism.md`
- Sibling: `docs/contracts/physics-renderer.md` (debug draw) · `docs/contracts/core-networking.md` (rollback timestep)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (transform, timestep) | `nexus-core` | `crates/core/src/transform.rs`, `crates/core/src/time.rs` |
| Provider (physics world, simulation) | `nexus-physics` | `crates/physics/src/lib.rs` (impl `Plugin`) |
| Consumer of events | any system | via `EventBus<CollisionEvent>` |

Pattern reference: Rapier `IntegrationParameters` + `PhysicsPipeline::step`. Cf. `dimforge/rapier`. Determinism guarantees follow Rapier's documented determinism contract (cross-platform identical bit-results require `enhanced-determinism` feature and fixed timestep).

---

## Call flow

```
 fixed-step accumulator (core::time)
   │
   ├─► while acc >= DT:
   │      physics::extract_transforms(&World)   ── writes RigidBody.next_pose
   │      physics::step(DT)                     ── Rapier pipeline
   │      physics::write_back(&mut World)       ── Transform <- next_pose
   │      physics::drain_events(&EventBus)      ── CollisionEvent, TriggerEvent
   │      acc -= DT
   │
   └─► interpolation: renderer reads (prev_pose, curr_pose, alpha) on variable frame
```

DT is global and constant per project; default 1/60 s. See `docs/specs/physics/determinism.md`.

---

## Provided API (Physics surface that Core calls)

```rust
pub trait PhysicsBackend: Send + Sync + 'static {
    fn init(&mut self, cfg: &PhysicsConfig) -> Result<(), PhysicsError>;

    /// Pull authoritative state from ECS into the physics world.
    /// Called once per fixed step, before step().
    fn extract_transforms(&mut self, world: &World) -> Result<(), PhysicsError>;

    /// Advance simulation by exactly dt_s seconds. MUST be deterministic.
    fn step(&mut self, dt_s: f32, step_id: StepId) -> Result<StepStats, PhysicsError>;

    /// Write resulting transforms back into ECS.
    fn write_back(&mut self, world: &mut World) -> Result<(), PhysicsError>;

    /// Push CollisionEvent / TriggerEvent into bus, ordered by (step_id, pair_id).
    fn drain_events(&mut self, bus: &EventBus) -> Result<usize, PhysicsError>;

    // --- Rollback support, see docs/contracts/core-networking.md ---
    fn snapshot(&self) -> PhysicsSnapshot;
    fn restore(&mut self, snap: &PhysicsSnapshot) -> Result<(), PhysicsError>;

    // --- Queries (read-only, callable from any ECS system) ---
    fn raycast(&self, q: RayQuery) -> Option<RayHit>;
    fn shapecast(&self, q: ShapeQuery) -> Option<ShapeHit>;
    fn overlap(&self, q: OverlapQuery, out: &mut Vec<EntityId>) -> usize;
}
```

## Required API (Core surface that Physics calls)

```rust
pub fn world(&self) -> &World;
pub fn world_mut(&mut self) -> &mut World;
pub fn events(&self) -> &EventBus;
pub fn time(&self) -> Time;                // fixed_dt_s, step_id, alpha
pub fn config(&self) -> &PhysicsConfig;
```

Components physics reads/writes:

| Component | Access | Notes |
|---|---|---|
| `Transform { translation, rotation, scale }` | R/W | scale is read-only to physics; rotation `Quat` |
| `RigidBody { mode: Dynamic|Static|Kinematic, mass, ... }` | R | added by user; immutable per step |
| `Collider { shape, layers, mask, friction, restitution }` | R | |
| `Velocity { linear, angular }` | R/W | optional; physics writes after step |
| `PhysicsHandle(rapier::RigidBodyHandle)` | W only | physics owns; user reads to call queries |
| `PrevTransform` | W | physics writes for renderer interpolation |

---

## Data Schema

```rust
pub struct StepId(pub u64);                // monotonic across rollbacks (logical step)
pub struct PhysicsConfig {
    pub fixed_dt_s: f32,                   // default 1.0 / 60.0
    pub max_substeps: u8,                  // default 4
    pub gravity: Vec3,
    pub solver_iters_pos: u8,              // Rapier default 4
    pub solver_iters_vel: u8,              // Rapier default 1
    pub determinism: Determinism,          // F32 | F64 | Fixed64Q32
}

pub enum CollisionEvent {
    Begin { a: EntityId, b: EntityId, contact: ContactManifold, step: StepId },
    End   { a: EntityId, b: EntityId, step: StepId },
}
pub enum TriggerEvent {
    Enter { trigger: EntityId, other: EntityId, step: StepId },
    Exit  { trigger: EntityId, other: EntityId, step: StepId },
}

pub struct ContactManifold {
    pub point_ws: Vec3,
    pub normal_ws: Vec3,                   // pointing from a -> b
    pub depth: f32,
    pub impulse: f32,
}

pub struct StepStats {
    pub step: StepId,
    pub cpu_us: u32,
    pub n_active_bodies: u32,
    pub n_contacts: u32,
    pub n_islands: u32,
}

pub struct PhysicsSnapshot {              // for rollback
    pub step: StepId,
    pub blob: Box<[u8]>,                  // serialized rapier islands + bodies
    pub checksum: u32,                    // CRC32 for determinism verification
}
```

JSON wire fragment (`channel: "physics.collision"`):

```json
{"schema":1,"step":12044,"begin":[{"a":17,"b":42,"point":[3.1,0.0,-2.4],"normal":[0,1,0],"depth":0.012,"impulse":4.8}]}
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Core | `Transform` is authoritative outside the `extract→step→write_back` window. |
| O-2 | Physics | Inside the window, physics owns rigid-body poses; ECS systems MUST NOT mutate `Transform` of physics-owned entities. |
| O-3 | Physics | Events from step N are drained before step N+1 begins. |
| O-4 | Physics | Within one drain, events are sorted by `(step_id ASC, pair_id ASC)` — deterministic order. |
| O-5 | Physics | `snapshot()` is callable only between fully-completed steps (not mid-step). |
| O-6 | Both | `step(dt, step_id)` with identical inputs (snapshot + ordered inputs) yields bit-identical state when `Determinism::Fixed64Q32`. |
| O-7 | Core | Variable-rate frame interpolation uses `(PrevTransform, Transform, alpha = acc/DT)`. Renderer never reads mid-step state. |
| O-8 | Physics | Spawning a `RigidBody` mid-step is queued and applied at start of next step. |

---

## Threading & Concurrency Rules

- `step` is single-threaded externally — physics may parallelize internally (Rapier uses `rayon`).
- `extract_transforms` requires `&World` exclusive (read-locks all relevant components).
- `write_back` requires `&mut World` exclusive.
- `raycast` / `shapecast` / `overlap` are `&self` and re-entrant-safe between steps; UB if called during a step.
- Event bus writes are MPMC; drain is single-producer (physics) → many-consumer.
- Rollback `snapshot`/`restore` is `&self` / `&mut self` respectively; no other physics call may overlap.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| `step` @ 1k dynamic bodies | ≤ 1.5 ms | 4 ms | [BENCHMARK NEEDED] |
| `step` @ 10k dynamic bodies | ≤ 6 ms | 12 ms | islanding required |
| `extract_transforms` | ≤ 0.3 ms | 1 ms | per 10k bodies |
| `write_back` | ≤ 0.3 ms | 1 ms | per 10k bodies |
| `raycast` single | ≤ 5 µs | 30 µs | BVH query |
| `snapshot()` | ≤ 1 ms | 5 ms | 1k bodies, for rollback |
| `restore()` | ≤ 1 ms | 5 ms | |
| Snapshot blob size | ≤ 16 kB | 64 kB | per 1k bodies; networking budget |
| `max_substeps` exceeded | log + skip | never panic | spiral-of-death prevention |

References: Rapier benchmarks (`dimforge/rapier`) and GGPO's recommended snapshot budget (< 64kB for 60Hz rollback over 200ms window — see https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md).

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `PHY-001` | `BackendInit` | Rapier init failed | Fatal; core aborts boot |
| `PHY-010` | `BodyHandleStale` | Entity's `PhysicsHandle` not in world | Auto-remove component; log |
| `PHY-011` | `ColliderInvalid` | Degenerate shape (NaN, zero size) | Reject spawn; emit error to bus |
| `PHY-020` | `StepOverBudget` | step > hard limit | Non-fatal; profile flag |
| `PHY-021` | `SubstepCapped` | Frame too long, substeps clamped | Non-fatal; log; time dilates |
| `PHY-030` | `NonDeterministic` | Checksum mismatch on rollback re-sim | Networking layer disconnects, reports |
| `PHY-040` | `SnapshotTooLarge` | Snapshot exceeds hard limit | Networking falls back to delta-only |

---

## Versioning Rule

`nexus-contract-physics = "MAJOR.MINOR.PATCH"`. See https://semver.org.

- **MAJOR**: changing `PhysicsSnapshot` layout, changing `CollisionEvent` field semantics, changing the meaning of `fixed_dt_s` (would break determinism replays).
- **MINOR**: adding a new query method with default `unimplemented!`, adding a new optional component the physics reads, adding `Determinism` variants.
- **PATCH**: solver iteration defaults, perf tuning, internal Rapier upgrades that preserve bit-identity within a `Determinism` mode.

Replays carry `(contract_version, determinism_mode)` in header; mismatched MAJOR rejects replay.

---

## Test Matrix

`tests/contract_core_physics.rs`:

- T-01 Spawn 1000 dynamic boxes falling onto a plane → all at rest within 5s sim.
- T-02 Two runs, identical seed, `Determinism::Fixed64Q32` → identical `PhysicsSnapshot.checksum` every step.
- T-03 Delete entity with collider mid-step queue → next step: no events for it, no crash.
- T-04 Rollback: snapshot(s0) → 10 steps → restore(s0) → 10 steps → final checksum equal.
- T-05 Long pause (frame = 5s) → `SubstepCapped` emitted, sim continues, no spiral.
- T-06 Raycast under load (10k bodies, 1000 rays/frame) → < 30 ms total.
- T-07 Trigger volume: entity enters → `TriggerEvent::Enter` exactly once; exits → `Exit` exactly once.
- T-08 `Transform` mutated by user system mid-frame on a Dynamic body → physics treats as teleport at next `extract_transforms`, no constraint blow-up.

---

## Open Questions

- [DECISION NEEDED] Fixed-point math for cross-platform determinism: do we vendor `fixed`/`fixed-trig` or rely on Rapier's `enhanced-determinism` f32 mode? → AGENT 05 + AGENT 07.
- [DECISION NEEDED] Should `Velocity` be a required component for Dynamic bodies, or auto-inserted? Auto-insert simplifies UX but violates "explicit components" principle.
- [DECISION NEEDED] Multi-world physics (e.g., separate physics scenes for UI ragdolls vs main world): one `PhysicsBackend` or N? → AGENT 05.
- [BENCHMARK NEEDED] Snapshot size at 10k bodies — networking budget assumption above may be optimistic.
- [AGENT: 02] Confirm event bus supports per-frame ordered drain semantics (O-4).
- [AGENT: 07] Confirm rollback layer can guarantee `snapshot`/`restore` only between steps (O-5).
