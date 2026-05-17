<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Determinism Guarantees

> Same inputs → same outputs, bit-for-bit, across runs, threads, processes, OSes, and CPUs. Two modes: **Local** (float, same machine) and **Cross-Platform** (fixed-point or strict IEEE-754). The substrate for rollback netcode, replay, AI scenario testing, and merge-system reproducibility.

## Boundaries

- Owns: the determinism contract for the physics world, fixed-point math layer for physics, snapshot/restore binary format, the "what may diverge" exclusion list.
- Does NOT own: ECS / game-logic determinism (→ `docs/specs/core/ecs.md`), networking transport (→ `docs/specs/networking/transport.md`), rollback orchestration (→ `docs/specs/networking/rollback.md`). Physics is one component of a deterministic stack.
- Depends on: `docs/specs/core/math.md` (fixed-point `Fixed64`), `overview.md` (step entrypoint), `rigid.md` / `collision.md` / `character.md` / `soft.md` / `fluid.md` (per-subsystem determinism rules).

## Modes

| Mode                  | Numbers         | Cross-thread | Cross-CPU / OS | Cross-version | Use case                                |
| --------------------- | --------------- | ------------ | -------------- | ------------- | --------------------------------------- |
| `Float::Local`        | `f32`           | yes          | no             | no            | single-player, replays per-install      |
| `Float::StrictIEEE`   | `f32` strict    | yes          | yes (IEEE-2008)| best-effort   | Rapier-style cross-platform float       |
| `Fixed::Q32_32`       | `Fixed64`       | yes          | yes            | yes (versioned format) | competitive netcode, AI replays |

Default for new projects: **`Fixed::Q32_32`**. The Nexus thesis is rollback-first, agent-first; determinism is mandatory.

`Float::StrictIEEE` follows Rapier's playbook (IEEE 754-2008 compliance, deterministic reduction order). It is supported but not the default — fixed-point sidesteps the entire FP-pitfall class.

## Fixed-Point Layer

```rust
/// Q32.32 signed fixed-point. ±2_147_483_647 with 32-bit fractional resolution (~2.3e-10 m).
#[repr(transparent)]
pub struct Fixed64(pub i64);

impl Fixed64 {
    pub const ZERO: Self;
    pub const ONE:  Self;
    pub fn from_int(i: i32) -> Self;
    pub fn to_f32(self) -> f32;       // lossy — never feed back into sim
    pub fn from_f32(v: f32) -> Self;  // construction only, asserts no NaN/Inf
    pub fn mul(self, b: Self) -> Self;   // 128-bit intermediate
    pub fn div(self, b: Self) -> Self;
    pub fn sqrt(self) -> Self;            // CORDIC / Newton, fixed iteration count
    pub fn sin(self) -> Self;             // table + polynomial, identical on all platforms
    pub fn cos(self) -> Self;
    pub fn atan2(y: Self, x: Self) -> Self;
}
```

Defined fully in `docs/specs/core/math.md`. Physics consumes the type opaquely. No `std::f32` calls in deterministic-mode physics paths.

Range / precision rationale (Q32.32):
- ±2.1×10⁹ meters world span → enough for open-world.
- ~0.23 nm precision → sub-millimeter even at world edge.
- Multiplication via 128-bit intermediate fits cleanly on 64-bit hardware.

`[DECISION NEEDED]` Alternative Q40.24 (more range, less precision) vs Q24.40 (sub-micron precision, smaller world). Q32.32 is a reasonable middle and matches what fighting-game engines (e.g. Skullgirls / GGPO derivatives) use in practice.

## Sources of Non-Determinism — and Their Remedies

| Source                                                  | Remedy                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Float rounding differs across CPUs                      | Fixed-point math layer; or `StrictIEEE` mode with FMA disabled.       |
| Reduction order across threads                          | Per-island serial reduction; islands themselves are an ordered set sorted by `IslandId`. |
| Iteration order of hash maps / hash sets                | Use deterministic containers (sorted vec, `IndexMap` with insertion order). No `HashMap` in state. |
| Pair generation order from broad phase                  | Sort pair list by `(handle_lo, handle_hi)` before narrow phase.        |
| Solver constraint order                                 | Constraints sorted by stable `ConstraintId` within each island.        |
| Body / collider handle reuse                            | Handles are `(index, generation)`; generation increments on free so reused index ≠ same handle. |
| Allocator addresses leaking into hashes                 | Never hash addresses. Hash entity / handle / constraint id only.       |
| `std::time::Instant` / wall-clock                       | Forbidden in physics core; only the step provides `dt` and `tick`.     |
| `rand::thread_rng`                                      | Forbidden; use seeded `WorldRng` from snapshot.                        |
| Floating-point transcendentals (`sin`, `sqrt`, ...)     | In Fixed mode: deterministic table-driven. In StrictIEEE mode: forbid platform `libm`; use shared `nexus-math::libm` implementation. |
| SIMD vs scalar producing different rounding             | Single code path per arithmetic op; SIMD only where bit-equal to scalar (Fixed: trivially equal; Float: gated). |
| Compiler `-ffast-math` / FMA contraction                | Disable globally (`#[deny(fast_math)]`, `RUSTFLAGS="-C target-feature=-fma"` for physics crate in StrictIEEE mode). |
| GPU backends (fluid, optional soft-body GPU)            | Non-deterministic by policy. Excluded from snapshot/rollback path.     |

## Snapshot Format

```
WorldSnapshot v1 {
  header {
    magic        : "NXPS"
    version      : u32        // bumped on any format change
    engine_hash  : u64        // git/SemVer hash; mismatch = refuse
    mode         : enum { FloatLocal | FloatStrict | FixedQ3232 }
    tick         : u64
    rng_state    : [u8; 32]
  }
  bodies         : Vec<RigidBodyState>     // sorted by BodyHandle.index
  colliders      : Vec<ColliderState>      // sorted by ColliderHandle.index
  joints         : Vec<JointState>         // sorted by JointHandle.index
  characters     : Vec<CharacterState>     // sorted by CharHandle.index
  contact_cache  : Vec<ManifoldState>      // sorted by (a.index, b.index)
                                           // includes warm-start λ
  deformables    : Vec<DeformableState>    // optional, may be omitted (see soft.md)
  fluids         : Vec<FluidState>         // CPU only; GPU fluid excluded
}
```

All multi-byte integers little-endian. Fixed values are raw `i64`. Floats serialize as raw `u32` / `u64` bit patterns (no formatting).

`snapshot()` is O(N) in body+collider+constraint count. `restore()` is O(N) and runs through `World::clear() + rebuild()`. No partial restore in v1.0 (`[DECISION NEEDED]` partial / per-island restore for fine-grained rollback v0.4+).

## Guarantees Table

| Property                                                    | `Float::Local` | `Float::StrictIEEE` | `Fixed::Q32_32`     |
| ----------------------------------------------------------- | -------------- | ------------------- | ------------------- |
| Same run, replayed from snapshot, bit-identical             | ✓              | ✓                   | ✓                   |
| Same machine, threads 1 vs N, bit-identical                 | ✓              | ✓                   | ✓                   |
| Different CPUs (x86 ↔ ARM), bit-identical                   | ✗              | ✓ (IEEE-compliant)  | ✓                   |
| Different OS, same CPU, bit-identical                       | maybe          | ✓                   | ✓                   |
| WASM (browser) ↔ native, bit-identical                      | ✗              | ✓ (Rapier proven)   | ✓                   |
| Across patch versions (no format bump)                      | ✗              | ✗                   | ✓ (versioned)       |

## Rollback Contract (with Networking)

The networking layer drives:

```
on_remote_input(tick):
   if tick < current_tick:
       world.restore(snapshot_at[tick])
       for t in tick..current_tick:
           world.step(inputs[t])
```

Physics must satisfy:

1. `step(s, inputs)` is a pure function of `(s, inputs, dt)`.
2. `restore(snapshot(W)) == W` for all reachable `W` (round-trip identity).
3. Two `World`s constructed identically and stepped with identical inputs are bit-identical at every tick.
4. Replays produce identical event streams (`CollisionEventStream`), including order.

These four laws are **tested every CI run** by `tests/physics/determinism_property.rs` over 1000 random scenes × 1000 ticks each. A single bit-diff fails the merge (→ `docs/guides/merge-system.md`).

## Public API

```rust
pub enum DeterminismMode { FloatLocal, FloatStrict, FixedQ3232 }

pub struct WorldConfig {
    pub determinism: DeterminismMode,    // default FixedQ3232
    pub thread_count: usize,             // 0 = auto, but result is mode-equivalent
    pub seed: u64,
    // ... see overview.md
}

impl PhysicsWorld {
    pub fn snapshot(&self) -> WorldSnapshot;
    pub fn restore(&mut self, snap: &WorldSnapshot) -> Result<(), PhysicsError>;
    pub fn determinism_mode(&self) -> DeterminismMode;
    pub fn assert_deterministic(&self, other: &Self) -> Result<(), DivergenceReport>;
}

pub struct DivergenceReport {
    pub tick: u64,
    pub kind: DivergenceKind,           // BodyPos | BodyVel | ContactSet | JointForce | ...
    pub diff: Vec<DivergenceEntry>,     // structured for agent debugging
}
```

`assert_deterministic` is the bisection primitive for agents and merge-system: run two sims to the same tick, diff their snapshots, return a structured report.

## Performance Contract

| Metric                                          | Target            | Hard limit       |
| ----------------------------------------------- | ----------------- | ---------------- |
| Fixed64 mul cost vs f32 mul                     | < 2× scalar f32   | < 4×             |
| Fixed-point physics step vs float (1k boxes)    | < 1.6× float cost | < 2.5×           |
| Snapshot (1k bodies, default settings)          | < 0.5 ms          | < 1.0 ms         |
| Restore (1k bodies)                             | < 0.3 ms          | < 0.8 ms         |
| `assert_deterministic` diff (1k bodies)         | < 0.2 ms          | < 0.6 ms         |
| Property test (1000 scenes × 1000 ticks, CI)    | < 5 min on CI box | < 15 min         |

## Error Contract

| Code                          | Meaning                                                  | Caller action                                |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `PHY_E_SNAPSHOT_VERSION`      | snapshot version / engine_hash mismatch                  | refuse playback; re-record under new version |
| `PHY_E_NONDET_FEATURE`        | non-deterministic API (GPU fluid, wall clock) in det run | swap API or change mode                      |
| `PHY_E_FIXED_OVERFLOW`        | Fixed64 saturation hit                                   | scale world / clamp impulses; investigate    |
| `PHY_E_DIVERGED`              | `assert_deterministic` failed                            | inspect `DivergenceReport`; bisect inputs    |
| `PHY_E_MODE_MISMATCH`         | restore snapshot recorded in different mode              | restart with matching mode                   |

## Integration Points

- Networking: `WorldSnapshot` is the rollback unit; `step` is replayed (→ `docs/specs/networking/rollback.md`).
- Agent SDK: scenarios capture snapshots, replay, bisect via `assert_deterministic` (→ `docs/specs/agent/scenarios.md`, `docs/specs/agent/replay.md`).
- Scripting: scripts MUST use `Fixed64` API in deterministic mode; lossy `to_f32` only for display (→ `docs/contracts/core-scripting.md`).
- Renderer: renderer is **read-only** on physics state and may use float interpolation freely — it never feeds back into sim.
- ECS: change-detection counters and entity allocation are deterministic (handled in `docs/specs/core/ecs.md`).

## Test Requirements

- Property: 1000 random scenes × 1000 ticks; `step` two `World`s in parallel with same inputs → bit-equal every tick.
- Property: snapshot(W) → restore → snapshot' = snapshot bit-equal.
- Cross-platform CI matrix: { Linux x86_64, Windows x86_64, macOS arm64, WASM } each run identical scenarios; snapshots compared byte-for-byte under `Fixed` and `StrictIEEE`.
- Thread sweep: same scenario at thread_count ∈ {1, 2, 4, 8, 16} → identical snapshots.
- Version-pin: snapshots from previous minor version load successfully iff format version unchanged; clean error otherwise.
- GPU fluid scene → snapshot includes only CPU state; explicit warning emitted; replay produces identical CPU portion.

## Prior Art

- Rapier *Determinism* docs (https://rapier.rs/docs/user_guides/rust/determinism/) — ✓ cross-platform via IEEE 754-2008. Reference for `StrictIEEE`.
- GGPO (Tony Cannon) + *Online Multiplayer the Hard Way* (Mauve / Game Developer) — ✓ rollback fundamentals; ✗ requires full sim determinism.
- Skullgirls / Rivals of Aether netcode postmortems — ✓ fixed-point physics in shipping fighting games.
- Starcraft / AoE lockstep RTS — ✓ deterministic lockstep is shipped tech, not research.
- Box2D — ✓ Catto's "Floats are not as scary as you think" GDC talks — viable to ship StrictIEEE with discipline.

## Open Questions

- `[DECISION NEEDED]` Default mode for the engine: `FixedQ3232` (proposed) vs `FloatStrict` (Rapier-style). Fixed has higher compatibility ceiling, float is faster.
- `[DECISION NEEDED]` Format versioning policy: forward-compatible (read old snapshots) vs strict (always re-record). Strict for v1.0; revisit at v2.0.
- `[DECISION NEEDED]` Partial / per-island snapshots for cheap rollback. Coordinate with `docs/specs/networking/rollback.md`.
- `[DECISION NEEDED]` Should the integration team bake nightly CI matrix to include Steam Deck (x86) + iPhone (ARM) + Nintendo Switch (ARM) hardware-in-the-loop, or trust ISA-level equivalence?
- `[BENCHMARK NEEDED]` Real cost of `Fixed64` `sin`/`sqrt` vs hardware float `sin`/`sqrtf` in a realistic mixed scene. Currently estimated < 2× — must verify.
