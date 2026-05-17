<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Overview

> Deterministic, multi-threaded, agent-introspectable physics world: rigid + character + soft + fluid, one unified timestep, snapshot/restore at any tick.

## Boundaries

- Owns: physics `World`, timestep loop, body lifecycle, integrator, solver, broad/narrow phase, collision/contact event stream, debug-draw vertex buffer, snapshot/restore.
- Does NOT own:
  - Transform → ECS component sync (→ `docs/contracts/core-physics.md`)
  - Debug-draw rasterization (→ `docs/contracts/physics-renderer.md`)
  - Network rollback orchestration (→ `docs/specs/networking/rollback.md`)
  - Skeletal animation (→ `[AGENT 03 RENDERER]` skinning) — physics only writes ragdoll bone transforms.
- Depends on:
  - `docs/specs/core/math.md` — `Vec3`, `Quat`, `Mat3`, optional `Fixed64`.
  - `docs/specs/core/jobs.md` — island-parallel solve, broad-phase build, narrow-phase contact generation.
  - `docs/specs/core/memory.md` — per-step arena (contacts, manifolds, islands).
  - `docs/specs/core/events.md` — typed collision events (`Started`, `Persisted`, `Ended`, `Sensor`).

## Architecture

```
                      PhysicsWorld (one per scene)
                              │
        ┌───────────┬─────────┼─────────┬───────────┬───────────┐
        ▼           ▼         ▼         ▼           ▼           ▼
    BodySet     ColliderSet  Joints   Islands    Broadphase  Solver
   (rigid +    (shape +     (rev,    (graph     (BVH-DAABB) (PGS / XPBD
   character   filter +     prism,   coloring                positional)
   + soft)     material)    motor,   for                    
                            spring)  parallel)              

  Per step (fixed Δt):

   t                                    t + Δt
   │   apply forces & gravity                │
   │      │                                  │
   │      ▼                                  │
   │   broad phase (BVH update + pairs)      │
   │      │                                  │
   │      ▼                                  │
   │   narrow phase (manifolds via GJK/EPA   │
   │     or SAT per shape pair)              │
   │      │                                  │
   │      ▼                                  │
   │   island build (union-find on graph)    │
   │      │                                  │
   │      ▼                                  │
   │   solver: N velocity iters → integrate  │
   │             → M position iters          │
   │      │                                  │
   │      ▼                                  │
   │   emit events  →  snapshot tick  →  done
   ▼                                         ▼
```

`PhysicsWorld::step(dt)` is the **only** mutator entry point. It is pure given (state, inputs, dt). No hidden clocks. No reads of wall time inside the world.

## Timestep Model

| Mode               | Δt fixed?   | Use case                                    |
| ------------------ | ----------- | ------------------------------------------- |
| `Fixed(hz)`        | yes         | default — required for rollback netcode     |
| `SemiFixed(hz, n)` | up to `n` substeps per frame, accumulator | offline / single-player smoothness        |
| `Variable`         | no          | editor scrubbing only — **never** at runtime |

Default: `Fixed(60)` for 3D, `Fixed(60)` for 2D. Substep count = `1`. Increase substeps for stiff joints, fast bullets, ragdolls.

Determinism mandate: changing thread count, scheduling order, or frame pacing MUST NOT change simulation output. → `docs/specs/physics/determinism.md`.

## Public API

```rust
pub struct PhysicsWorld { /* opaque */ }

pub struct StepConfig {
    pub dt: Fixed64,                 // or f32 in non-deterministic mode
    pub velocity_iterations: u8,     // default 8  (Catto recommendation)
    pub position_iterations: u8,     // default 3
    pub substeps: u8,                // default 1
    pub gravity: Vec3,
}

impl PhysicsWorld {
    pub fn new(cfg: WorldConfig) -> Self;
    pub fn step(&mut self, cfg: &StepConfig) -> StepReport;
    pub fn snapshot(&self) -> WorldSnapshot;      // see determinism.md
    pub fn restore(&mut self, snap: &WorldSnapshot);
    pub fn events(&self) -> &CollisionEventStream;
    pub fn telemetry(&self) -> StepTelemetry;     // per-tick metrics

    // Body / collider CRUD → see rigid.md
    // Queries (raycast, shapecast, AABB, point) → see collision.md
}

pub struct StepReport {
    pub tick: u64,
    pub islands: u32,
    pub active_bodies: u32,
    pub contacts: u32,
    pub solver_iters_actual: u32,
    pub elapsed_ns: u64,
}
```

Headless mode: `PhysicsWorld` runs without renderer, audio, or window. Required for AI agent batch sims (→ `docs/specs/agent/headless.md`).

## Performance Contract

| Metric                                         | Target          | Hard limit       |
| ---------------------------------------------- | --------------- | ---------------- |
| 1k dynamic boxes stacked, 60 Hz, M2 / 7950X    | < 2.0 ms / step | < 4.0 ms / step  |
| 10k dynamic bodies, sparse, mid-tier desktop   | < 6.0 ms / step | < 12.0 ms / step |
| Step jitter (same scene, 1000 steps)           | < 5 % stddev    | < 10 %           |
| Bytes per body (dynamic, rigid)                | < 384 B         | < 512 B          |
| Snapshot size, 1k bodies                       | < 256 KB        | < 512 KB         |
| Snapshot encode (1k bodies)                    | < 0.5 ms        | < 1.0 ms         |
| Restore (1k bodies)                            | < 0.3 ms        | < 0.8 ms         |
| Determinism: bit-identical across runs, same CPU/OS | always     | always           |

`[BENCHMARK NEEDED]` 100k static + 5k dynamic open-world target.

## Error Contract

| Code                       | Meaning                                              | Caller action                              |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `PHY_E_BODY_NOT_FOUND`     | `BodyHandle` references freed slot                   | drop handle, re-acquire                    |
| `PHY_E_INVALID_SHAPE`      | degenerate shape (zero extent, NaN)                  | sanitize at import; reject build          |
| `PHY_E_STEP_DIVERGED`      | NaN in velocity/position post-solve                  | restore last snapshot; bisect inputs       |
| `PHY_E_NONDET_FEATURE`     | non-deterministic API used in `Fixed` det. mode      | swap to deterministic variant              |
| `PHY_E_BUDGET_EXCEEDED`    | step exceeded configured budget                      | reduce substeps / iterations / body count  |
| `PHY_E_SNAPSHOT_VERSION`   | snapshot from incompatible engine version            | re-record; refuse playback                 |

All errors are structured JSON (→ `docs/architecture/01-principles.md` law: structured errors only).

## Integration Points

- **ECS** — `Transform`, `RigidBody`, `Collider`, `Sensor`, `CharacterController` components. Write-back order specified in `docs/contracts/core-physics.md`.
- **Networking** — `snapshot()` / `restore()` is the rollback primitive. Every step is replayable. → `docs/specs/networking/rollback.md`.
- **Renderer** — debug-draw fills a vertex buffer in renderer-owned format. → `docs/contracts/physics-renderer.md`.
- **Agent API** — JSON-RPC: `physics.raycast`, `physics.spawn_body`, `physics.subscribe_events`, `physics.snapshot`, `physics.restore`. → `docs/specs/agent/api.md`.
- **Scripting** — Lua/Rune bindings expose a subset (queries, set velocity, apply impulse). No raw solver access. → `docs/contracts/core-scripting.md`.
- **Audio** — physics emits `ContactStarted` events with impulse magnitude + materials; audio system maps to footstep/impact sounds. → `docs/contracts/core-audio.md`.

## AI-First Hooks

1. `StepTelemetry` — JSON every tick: per-island solver iters, contact count, longest manifold, body wake/sleep deltas.
2. `CollisionEventStream` — structured: `{tick, a, b, point, normal, impulse, materials, sensor}`.
3. `snapshot()` returns a versioned blob; bit-identical restore is a hard guarantee under `Fixed` mode.
4. Headless: `nexus run --headless --physics-only` runs `World::step` with scripted body inputs at unbounded speed.
5. Per-body telemetry channel: `world.trace(body)` records every force, impulse, contact, sleep transition for that handle — for agent debugging.

## Test Requirements

- 1k boxes drop into pyramid, 5 s sim, restore at tick 100, step to 300 — body positions bit-equal between original and restored runs (deterministic mode).
- Sphere fired through 1k static triangles — no tunneling at < 50 m/s with default CCD on.
- 100 ragdolls active, no NaN, no explode, 10 s sim.
- 10k sleeping bodies + 100 active — active step cost within 10 % of 100-body baseline (sleep system works).
- Same scene, threads = 1 vs 16 — bit-identical output in `Fixed` mode.
- `StepReport.elapsed_ns` monotone-ish (< 2x variance) across 1000 steps for same scene.

## Prior Art

- `dimforge/rapier` — ✓ Rust-native, ✓ optional cross-platform determinism via IEEE 754-2008, ✓ island parallelism, ✓ snapshot. Inspiration for API shape.
- `jrouwe/JoltPhysics` — ✓ lock-free broadphase quadtree, ✓ deferred body activation, ✓ shipped Horizon Forbidden West & Death Stranding 2. Inspiration for concurrency model. (Architecting Jolt, GDC 2022, Rouwé.)
- `bulletphysics/bullet3` — ✓ breadth (soft, cloth, MLCP), ✗ accreted API, ✗ determinism caveats.
- `erincatto/box2d` — ✓ sequential-impulses solver (Catto, GDC 2006), ✓ simplicity benchmark for 2D. Solver inspiration.

## Open Questions

- `[DECISION NEEDED]` Default solver: PGS (sequential impulses, Catto) vs TGS (Rapier default) vs XPBD positional. Leaning: PGS for rigid, XPBD for soft/cloth, both share the same island scheduler.
- `[DECISION NEEDED]` 2D physics: separate `Physics2DWorld` vs unified 3D with locked axes. Rapier ships separate crates; Jolt is 3D-only. Lean: separate, to keep 2D cache-tight.
- `[DECISION NEEDED]` CCD strategy: speculative contacts (Rapier) vs sub-stepped TOI (Bullet) vs both per-body. → `collision.md`.
- `[BENCHMARK NEEDED]` Real-world per-body cost target for 100k-entity open-world streaming.
