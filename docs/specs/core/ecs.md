<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Core / ECS

> The single source of truth for game state. Entities are IDs, components are POD data, systems are pure functions over queries — scheduled in parallel by data dependency.

## Boundaries

- **Owns**
  - Entity allocator (`Entity = (index: u32, generation: u32)`).
  - Component storage (archetype tables + sparse-set side-storage for hot toggles).
  - World registry: type ids, component metadata, resource singletons.
  - System scheduler: dependency graph build, parallel execution, change detection.
  - Query engine: archetype matching, iteration, filter combinators.
  - Commands buffer (deferred structural mutation).
  - Hierarchy / `Parent`/`Children` relationship as a built-in component (not a separate scene graph; scene graph is a view → `docs/specs/editor/scene.md`).
- **Does NOT own**
  - Job execution primitives → `docs/specs/core/jobs.md` (ECS submits to the job system; does not run threads itself).
  - Allocators → `docs/specs/core/memory.md` (ECS receives an `Arena` per frame and a `PoolAllocator` for component tables).
  - Event delivery → `docs/specs/core/events.md` (events are *not* components; ECS may carry an `EventReader<T>` resource as syntactic sugar but the bus is separate).
  - Math types → `docs/specs/core/math.md`.
  - Serialization wire format → `docs/specs/agent/replay.md` (ECS exposes `snapshot()`/`restore()`; agent layer defines the schema).
  - Scripting bridge → `docs/contracts/core-scripting.md`.
- **Depends on**
  - `core::memory` for `Arena`, `PoolAllocator`, `TLSF` (per-system budgets).
  - `core::jobs` for `Scope::spawn`, `JobGraph::submit`.
  - `core::math` (only for built-in `Transform` / `GlobalTransform` components).
  - `core::events` (one-way: ECS may publish lifecycle events).

## Architecture

```
                        World
        ┌──────────────────────────────────────────┐
        │  EntityAllocator   ComponentRegistry     │
        │  Resources<R>      Archetypes[]          │
        │  CommandQueue      SparseSetSide[]       │
        └────┬─────────────────────────────────────┘
             │
   ┌─────────┴─────────┐
   │ Storage strategy  │
   ├───────────────────┴─────────────────────────┐
   │ ArchetypeTable                              │
   │   ┌────────────────────────────────────┐    │
   │   │ ComponentColumn<A> (SoA, packed)   │    │
   │   │ ComponentColumn<B> (SoA, packed)   │    │
   │   │ EntityColumn (Entity ids)          │    │
   │   │ ChangeTicks (per column, per row)  │    │
   │   └────────────────────────────────────┘    │
   │ SparseSetSide<T>                            │
   │   - dense Vec<T> + sparse [u32 -> u32]      │
   │   - for high-churn / optional flag comps    │
   └─────────────────────────────────────────────┘

   Scheduler
   ┌─────────────────────────────────────────────┐
   │ Stage[Pre, Update, Post, Render, Cleanup]   │
   │   each stage = DAG of Systems               │
   │     edges = (R-set ∩ W-set) ∪ explicit ord  │
   │   execution = work-steal on core::jobs      │
   └─────────────────────────────────────────────┘
```

**Storage hybrid.** Default: archetype tables (Bevy/flecs style) for fast cache-coherent iteration of stable component sets. Opt-in: per-component sparse-set side storage (EnTT style) for components that toggle every frame (e.g. `Selected`, `Frustum::Visible`). The choice is declared at component registration; not auto-detected (v1.0).

**Archetype identity.** A sorted set of `ComponentId`s (BLAKE3 of the sorted byte string → 128-bit `ArchetypeId`). Add/remove operations move the entity to a neighbor archetype via an edge cache (`ArchetypeGraph`). Inspired by `flecs` archetype graph and `bevy_ecs::archetype::ArchetypeGeneration`.

**Change detection.** Each `ComponentColumn` carries two `u32` ticks per row: `added_tick`, `changed_tick`. The world owns `last_tick: u32` and increments at the start of every system run. `Changed<T>` / `Added<T>` filters compare per-row ticks against the requesting system's `last_run_tick`. Tick wrap handled by relative comparison (Bevy-style `tick.is_newer_than(other, world_tick)`).

**Parallel scheduling.** A stage builds its DAG once per topology change (system add/remove). Nodes are systems, edges are:
1. RAW/WAR/WAW conflicts on component types (compile-time-derived read/write sets).
2. Resource conflicts (`Res<T>` / `ResMut<T>`).
3. Explicit `.after(...)` / `.before(...)` / `.in_set(...)` constraints.
4. `Exclusive` systems (`&mut World`) — serialize against everything in their stage.

Cycles are a hard error at schedule build (`ErrSchedule::Cycle`). The DAG is executed by `core::jobs` as a fork-join: each system is a job, scheduler tracks completed predecessors, releases successors when ready.

**Commands.** Mutations during system run (spawn, despawn, add/remove component) are appended to a thread-local `CommandQueue`. Commands flush at the next sync point (end of stage by default; `apply_deferred` system can be inserted mid-stage). Flushing is single-threaded against `&mut World`.

## Public API

```rust
// === Entity ===
pub struct Entity { index: u32, generation: u32 }
impl Entity {
    pub const PLACEHOLDER: Entity;
    pub fn index(self) -> u32;
    pub fn generation(self) -> u32;
    pub fn to_bits(self) -> u64;
    pub fn from_bits(bits: u64) -> Entity;
}

// === Component ===
pub trait Component: Send + Sync + 'static {
    const STORAGE: StorageKind;       // Table | SparseSet
    fn register(reg: &mut ComponentRegistry);
}
pub enum StorageKind { Table, SparseSet }

// === World ===
pub struct World { /* private */ }
impl World {
    pub fn new() -> World;
    pub fn spawn(&mut self) -> EntityBuilder<'_>;
    pub fn despawn(&mut self, e: Entity) -> Result<(), ErrEcs>;
    pub fn get<T: Component>(&self, e: Entity) -> Option<&T>;
    pub fn get_mut<T: Component>(&mut self, e: Entity) -> Option<Mut<'_, T>>;
    pub fn insert<T: Component>(&mut self, e: Entity, c: T) -> Result<(), ErrEcs>;
    pub fn remove<T: Component>(&mut self, e: Entity) -> Result<Option<T>, ErrEcs>;
    pub fn query<Q: WorldQuery>(&self) -> Query<'_, Q>;
    pub fn resource<R: Resource>(&self) -> &R;
    pub fn resource_mut<R: Resource>(&mut self) -> Mut<'_, R>;
    pub fn snapshot(&self) -> Snapshot;             // → docs/specs/agent/replay.md
    pub fn restore(&mut self, s: &Snapshot) -> Result<(), ErrEcs>;
    pub fn telemetry(&self) -> EcsTelemetry;       // → docs/specs/agent/telemetry.md
}

// === Query ===
pub trait WorldQuery { /* fetch, filter, change-detect */ }
pub struct Query<'w, Q: WorldQuery> { /* private */ }
impl<'w, Q: WorldQuery> Query<'w, Q> {
    pub fn iter(&self) -> QueryIter<'_, Q>;
    pub fn iter_mut(&mut self) -> QueryIterMut<'_, Q>;
    pub fn par_iter(&self) -> ParQueryIter<'_, Q>;    // → core::jobs
    pub fn get(&self, e: Entity) -> Result<Q::Item<'_>, ErrEcs>;
    pub fn len(&self) -> usize;
    pub fn single(&self) -> Result<Q::Item<'_>, ErrEcs>;
}

// Filters
pub struct With<T>;          pub struct Without<T>;
pub struct Added<T>;         pub struct Changed<T>;
pub struct Or<F>;            pub struct And<F>;

// === System ===
pub trait System: Send + Sync + 'static {
    fn run(&mut self, world: UnsafeWorldCell<'_>);
    fn access(&self) -> &Access;       // RW set, used by scheduler
    fn name(&self) -> &'static str;
}
pub type SystemFn = fn(/* ...params */);  // converted via IntoSystem trait

// === Scheduler ===
pub struct Schedule { /* private */ }
impl Schedule {
    pub fn new() -> Schedule;
    pub fn add_system<M>(&mut self, s: impl IntoSystem<M>) -> SystemId;
    pub fn add_stage(&mut self, id: StageId);
    pub fn configure(&mut self, id: SystemId, cfg: SystemConfig);
    pub fn run(&mut self, world: &mut World) -> Result<StageReport, ErrEcs>;
}
pub struct SystemConfig {
    pub stage: StageId,
    pub after: Vec<SystemId>,
    pub before: Vec<SystemId>,
    pub in_set: Vec<SystemSetId>,
    pub exclusive: bool,
    pub run_condition: Option<Box<dyn Fn(&World) -> bool + Send + Sync>>,
}

// === Commands ===
pub struct Commands<'w, 's> { /* private */ }
impl<'w, 's> Commands<'w, 's> {
    pub fn spawn<B: Bundle>(&mut self, b: B) -> EntityCommands<'_>;
    pub fn entity(&mut self, e: Entity) -> EntityCommands<'_>;
    pub fn insert_resource<R: Resource>(&mut self, r: R);
}

// === Resources ===
pub trait Resource: Send + Sync + 'static {}

// === Telemetry ===
pub struct EcsTelemetry {
    pub entities_alive: u64,
    pub archetypes: u32,
    pub components_registered: u32,
    pub last_stage_ms: [f32; 8],
    pub commands_flushed_last_frame: u64,
    pub change_tick: u32,
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| `World::spawn(EmptyBundle)` | ≤ 80 ns | 250 ns |
| `World::insert<T>` (existing entity, table move) | ≤ 200 ns | 1 µs |
| `World::get<T>` (table) | ≤ 12 ns | 30 ns |
| `World::get<T>` (sparse-set) | ≤ 18 ns | 40 ns |
| `Query::iter` per matched entity | ≤ 6 ns/comp | 15 ns/comp |
| `Query::par_iter` scaling | linear to 16 cores on 1M entities | ≥ 0.7× linear at 16 cores |
| Archetype edge cache hit | ≥ 99 % under steady state | 95 % |
| Scheduler graph build (1k systems) | ≤ 4 ms | 20 ms |
| `Schedule::run` overhead (excl. systems) | ≤ 50 µs / frame | 200 µs |
| Snapshot of 1M entities, 8 comps | ≤ 25 ms | 100 ms |
| Memory / entity (avg, 5 comps) | ≤ 96 B | 256 B |
| Max entities | 2^31 − 1 (≈ 2.1 B) | n/a |

All targets `[BENCHMARK NEEDED]` on reference hardware (`docs/architecture/03-tech-stack.md` reference rig) before v1.0.

## Error Contract

All errors are `enum ErrEcs` — structured, JSON-serializable, carry `code`, `entity?`, `component?`, `system?`, `suggested_fix`. Per AI-first mandate (vision §AI-First Mandate).

| Code | Meaning | Caller action |
|---|---|---|
| `ECS.E001` | Entity not alive (despawned or never spawned) | Re-query; use `World::contains(e)` before access |
| `ECS.E002` | Component not present on entity | Use `get` (returns `Option`) or assert `With<T>` filter |
| `ECS.E003` | Component already present on entity | Use `insert` (overwrites) intentionally or remove first |
| `ECS.E004` | Archetype move would orphan unique component | Remove conflicting component first |
| `ECS.E005` | Schedule contains cycle | Inspect `ErrEcs::cycle_path`; remove edge |
| `ECS.E006` | Concurrent RW conflict at runtime (bug in `Access` derive) | File ECS bug; fall back to exclusive system |
| `ECS.E007` | Snapshot version mismatch on restore | Migrate snapshot or refuse load |
| `ECS.E008` | Component not registered before use | Call `world.register::<T>()` at startup |
| `ECS.E009` | Resource not present | `insert_resource` before any system reads it |
| `ECS.E010` | Query::single found 0 or >1 matches | Use `iter().next()` or constrain spawn |
| `ECS.E011` | Commands flush failed (entity died mid-queue) | Idempotent: warn + drop; check `StageReport.dropped_commands` |
| `ECS.E012` | Generation overflow (entity index reused 2^32 times) | Engine reseeds index; log + telemetry alert |

Errors NEVER panic in release builds. Debug builds may panic on `E006`/`E008` to surface programmer errors fast.

## Integration Points

- **`core::jobs`** — `Schedule::run` calls `JobGraph::submit(systems_dag)`. Each system becomes one job; `par_iter` chunks call `Scope::spawn`. Contract: ECS does not own threads. → `docs/specs/core/jobs.md`
- **`core::memory`** — `World` constructs each `ArchetypeTable` from a per-world `PoolAllocator`; per-frame `CommandQueue` uses an `Arena` reset every frame. → `docs/specs/core/memory.md`
- **`core::events`** — `EventReader<T>` / `EventWriter<T>` system params wrap an external event bus. ECS does not store events as components. → `docs/specs/core/events.md`
- **`core::math`** — built-in components `Transform { translation, rotation, scale }` and `GlobalTransform(Mat4)` use `core::math` types. → `docs/specs/core/math.md`
- **`renderer`** — pulls `(GlobalTransform, MeshHandle, MaterialHandle)` queries every frame in `Stage::Render`. Contract: → `docs/contracts/core-renderer.md`
- **`physics`** — bidirectional sync of `Transform` ↔ `RigidBody`. Contract: → `docs/contracts/core-physics.md`
- **`networking`** — replication system queries `Changed<T>` against last-snapshot tick to build delta. → `docs/contracts/core-networking.md`
- **`scripting`** — scripts access ECS through capability-scoped handles, no direct `&mut World`. → `docs/contracts/core-scripting.md`
- **`agent`** — agent API exposes ECS over JSON-RPC: entity CRUD, query subscription, snapshot/restore, telemetry stream. → `docs/contracts/core-agent.md`

## Test Requirements

Assertions that must hold (functional + perf). Each becomes a named test in `crates/nexus-ecs/tests/`.

1. `spawn_then_get_returns_inserted_value` — round-trip every primitive component kind.
2. `despawned_entity_returns_E001` — after despawn, `get` returns `Err(ECS.E001)` not stale data.
3. `generation_increments_on_recycle` — re-spawned slot has `generation` strictly greater.
4. `archetype_move_preserves_other_components` — `insert<C>` on entity with `(A,B)` keeps `A`, `B` intact and at correct row.
5. `query_iter_visits_all_and_only_matching` — over 100 archetypes, sum of `iter().count()` == number of entities matching the signature.
6. `par_iter_equivalence` — `par_iter().sum()` == `iter().sum()` for any `Copy` numeric component across 1M entities.
7. `changed_filter_correctness` — `Changed<T>` visits exactly entities whose `T` was mutated since the requesting system's last run, across 3 schedule runs.
8. `added_filter_visits_once` — `Added<T>` visits each insertion exactly once.
9. `scheduler_runs_in_dependency_order` — observed write order matches declared `.after()` constraints (deterministic seed).
10. `scheduler_parallelism_no_data_race` — TSAN clean over 10k schedule runs with 50 systems, random RW sets.
11. `scheduler_detects_cycle` — adding `A.after(B), B.after(A)` returns `ECS.E005` at build time.
12. `commands_apply_at_sync_point` — `Commands::spawn` not visible until `apply_deferred` runs.
13. `snapshot_restore_is_bit_identical` — `restore(snapshot(w)) == w` byte-for-byte under stable component layout hash.
14. `headless_run_no_renderer` — `Schedule::run` with no render stage produces zero GPU calls (link-time check via `cfg(feature = "headless")`).
15. `determinism_across_runs` — same seed, same input event log → identical snapshot hash after N frames. (Cross-ref: `docs/specs/physics/determinism.md` for physics half.)
16. `telemetry_emitted_every_frame` — `EcsTelemetry` populated and pushed to bus per frame; zero allocs in release build.
17. `100k_entity_spawn_under_budget` — spawning 100k `(Transform, Velocity)` entities in < 8 ms.
18. `1M_entity_query_under_budget` — iterating 1M `(Transform, Velocity)` entities in < 6 ms single-threaded.
19. `sparse_set_toggle_no_archetype_move` — adding/removing a `SparseSet` component leaves the archetype id unchanged.
20. `fuzz_world_ops` — 24 h cargo-fuzz on `(spawn|despawn|insert|remove|query)*` produces no panics, no leaks, no double-frees.

## Prior Art

- **bevyengine/bevy** (`crates/bevy_ecs`)
  - ✓ Archetype storage + change ticks; `SystemParam` derive for ergonomic system fns; stages + sets; `apply_deferred` model.
  - ✓ `UnsafeWorldCell` pattern for sound parallel access without `&mut World`.
  - ✗ Schedule build cost grows non-trivially with system count; we cache the DAG aggressively and only rebuild on topology change.
  - ✗ `Resource` vs `Component` split surfaces; we keep the split (clearer mental model) but unify storage internally.
- **SanderMertens/flecs**
  - ✓ Archetype graph with edge cache for O(1) add/remove transitions.
  - ✓ Hierarchical relationships as first-class (`(ChildOf, parent)` pairs). We adopt the *pattern* but keep the simpler `Parent`/`Children` API for v1.0; relationship pairs `[DECISION NEEDED]` for v2.0.
  - ✓ Query DSL compiled once, iterated cheap.
  - ✗ C API ergonomics; we keep Rust-native typed queries.
- **skypjack/entt**
  - ✓ Sparse-set storage as default — wins on entity-component churn-heavy patterns (toggles, tags).
  - ✗ All-sparse-set loses cache density when iterating wide component sets. → we adopt sparse-set as *opt-in* side storage, archetype as default.
- **bitsquid / Our Machinery** blog posts on archetype design — informed the edge cache and "move bundle" approach.

## Open Questions

1. `[DECISION NEEDED]` — Relationships as first-class pairs (flecs model) vs. dedicated `Parent`/`Children` components? Pairs are more powerful (any directed relation, queryable) but explode component-id space. Defer to v2.0?
2. `[DECISION NEEDED]` — Allow `&mut World` in user systems (Bevy `Exclusive`) or require all mutation via `Commands`? Exclusive wins simplicity, loses parallelism for that system.
3. `[DECISION NEEDED]` — Component versioning: ship a per-component schema hash inside snapshots for forward-compat replay, or require explicit migration scripts? Cross-impact: `docs/specs/agent/replay.md`.
4. `[BENCHMARK NEEDED]` — All numbers in *Performance Contract* must be validated on the reference rig before v1.0 lock.
5. `[DECISION NEEDED]` — Should `EventReader<T>` live in ECS as a `SystemParam` (Bevy) or only in `core::events`? Cross-impact: `docs/specs/core/events.md` and `docs/contracts/core-scripting.md`.
6. `[DECISION NEEDED]` — Max component types per world: hard-cap at 2048 (cheap bitsets) or 65 536 (wide bitsets)? Affects archetype id width and query matcher cost. `[AGENT: 03]` renderer needs ≥ 256 alone.
7. `[DECISION NEEDED]` — Determinism mode (`World::with_determinism(true)`) — forbids parallel `par_iter` order-sensitive ops, forces fixed archetype iteration order? Required by `docs/specs/networking/rollback.md`.
