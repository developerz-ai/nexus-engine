<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Core / Jobs

> One global work-stealing thread pool. Every parallel workload in Nexus — ECS schedule, par-iter, asset decode, physics islands, render command building — runs on it. No engine code spawns its own threads.

## Boundaries

- **Owns**
  - Worker thread pool (N = physical-cores − 1 by default, configurable).
  - Per-thread deques (Chase-Lev work-stealing).
  - Global injector queue (entry point for off-pool submissions).
  - Job graph executor (`JobGraph`): nodes = closures, edges = dependencies; topological release on completion.
  - `Scope` API (`rayon`-style structured concurrency).
  - Parallel iterator adapters (`par_iter`, `par_chunks`, `par_join`).
  - Priority lanes: `Critical`, `Frame`, `Background`.
  - Cancellation tokens.
  - Telemetry per worker: utilization, steals, queue depth.
- **Does NOT own**
  - OS thread spawning beyond pool init (no engine subsystem may `std::thread::spawn`; lints enforced).
  - Async I/O — that is a separate "I/O reactor" inside `core::hal` (`docs/specs/core/hal.md`) that posts results back as job completion notifications.
  - Fiber stacks — v1.0 is thread-based; fibers `[DECISION NEEDED]` (see Open Questions).
  - GPU command submission ordering (renderer owns its own GPU queue; uses jobs only for CPU-side command building) → `docs/specs/renderer/backend.md`.
  - Memory allocation policy → `core::memory` (jobs uses thread-local `Arena`s registered with the memory subsystem).
- **Depends on**
  - `core::hal` for thread creation, CPU affinity hints, thread-local storage, monotonic clock.
  - `core::memory` for thread-local arenas and pool allocation of `JobNode`s.

## Architecture

```
   Submitters (ECS scheduler, asset loader, agent API, scripting…)
        │
        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                    GlobalInjector (MPMC)                     │
   └──────────────────────────────────────────────────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   ┌─────────┐             ┌─────────┐             ┌─────────┐
   │Worker 0 │  steals     │Worker 1 │  steals     │Worker N │
   │ Deque   │◄───────────►│ Deque   │◄───────────►│ Deque   │
   │ TLS Arena│             │TLS Arena│             │TLS Arena│
   └─────────┘             └─────────┘             └─────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ JobGraph runner: when job J completes, decrements indegree   │
   │ of each successor; on indegree == 0 pushes successor to the  │
   │ worker's own deque (cache-locality bias) or injector if hot. │
   └──────────────────────────────────────────────────────────────┘

   Priority lanes (each worker checks in order):
     1. Critical  (frame-blocking, e.g. render barrier ack)
     2. Frame     (default; ECS systems, par_iter, command building)
     3. Background(asset decode, AI agent batch, telemetry export)

   Backpressure: Background lane has a per-frame quantum
   (default 2 ms) so long-running jobs cannot starve frame work.
```

**Work-stealing.** Chase-Lev deque per worker (lock-free, single-producer / multi-consumer-steal). Local push/pop is LIFO (cache-warm); stealers take FIFO (oldest = likely largest task). Published algorithm: Chase & Lev, "Dynamic Circular Work-Stealing Deque" (SPAA 2005). Reference impls studied: `crossbeam-deque`, Rayon's internal scheduler. We will likely depend on `crossbeam-deque` directly to avoid reimplementing a well-trodden lock-free structure (`[DECISION NEEDED]` in Open Questions).

**JobGraph executor.** A `JobGraph` is a DAG built once and executed many times (the ECS schedule uses this pattern: build per topology change, execute per frame). Nodes carry: payload (`Box<dyn FnOnce(JobCtx) + Send>`), indegree counter (`AtomicU32`), successor list (`SmallVec<[JobId; 4]>`). When a job finishes, its successors' indegrees decrement; the worker pushes any newly-ready successor onto its own deque. Root nodes go into the injector.

**Scopes** (`rayon` style). `Scope::spawn` allows fire-and-join semantics inside a synchronous function. The scope blocks the calling thread on exit until every spawned job completes; the calling thread *participates* in stealing while waiting (no idle blocking).

**Threading model.** Threads pinned to physical cores via `core::hal` affinity hints (best effort; ignored on platforms without affinity API — web, iOS). Hyperthreads NOT used by default (cache contention dominates the throughput gain in measured ECS workloads; opt-in via config).

**Determinism mode.** When `JobGraph::deterministic` is set, jobs execute in topological order on a single worker (no stealing, no parallelism). Required by rollback netcode and replay (cross-ref `docs/specs/networking/rollback.md`, `docs/specs/agent/replay.md`). Cost: throughput equal to serial.

**Cancellation.** `CancelToken` is a shared `AtomicBool`; jobs poll cooperatively at well-defined points (the `JobCtx::should_cancel()` API). No forced thread kill.

**Rayon interop.** The pool exposes a `rayon::ThreadPool` compatibility view (`as_rayon()`) so third-party crates that hard-code rayon (e.g. some asset libs) run on our pool, not their own. We may also choose to embed rayon directly as our backend (`[DECISION NEEDED]`); current bias is "own the scheduler, expose a rayon view" because we need priority lanes and determinism mode that rayon does not provide.

## Public API

```rust
// === Pool ===
pub struct JobSystem { /* private */ }
impl JobSystem {
    pub fn init(cfg: JobSystemConfig) -> Result<&'static JobSystem, ErrJob>;
    pub fn shutdown();
    pub fn workers(&self) -> usize;
    pub fn submit<F>(&self, lane: Lane, f: F) -> JobHandle
        where F: FnOnce(JobCtx) + Send + 'static;
    pub fn scope<'s, F, R>(&'s self, f: F) -> R
        where F: for<'a> FnOnce(&'a Scope<'s>) -> R + Send, R: Send;
    pub fn telemetry(&self) -> JobTelemetry;
    pub fn as_rayon(&self) -> &rayon::ThreadPool;
}

pub fn pool() -> &'static JobSystem;     // panics if not init

pub struct JobSystemConfig {
    pub workers: Option<usize>,           // None = physical_cores - 1
    pub use_hyperthreads: bool,           // default false
    pub stack_bytes: usize,               // default 1 MiB
    pub pin_to_cores: bool,               // default true
    pub background_quantum_ms: u32,       // default 2
}

pub enum Lane { Critical, Frame, Background }

// === Handle / Wait ===
pub struct JobHandle { /* private */ }
impl JobHandle {
    pub fn wait(self);                    // blocks; participates in stealing
    pub fn is_done(&self) -> bool;
    pub fn cancel(&self);
    pub fn id(&self) -> JobId;
}

// === Scope ===
pub struct Scope<'s> { /* private */ }
impl<'s> Scope<'s> {
    pub fn spawn<F>(&self, f: F)
        where F: FnOnce(JobCtx) + Send + 's;
    pub fn spawn_lane<F>(&self, lane: Lane, f: F)
        where F: FnOnce(JobCtx) + Send + 's;
}

// === JobGraph ===
pub struct JobGraph { /* private */ }
impl JobGraph {
    pub fn new() -> Self;
    pub fn add<F>(&mut self, f: F) -> JobId
        where F: FnOnce(JobCtx) + Send + 'static;
    pub fn edge(&mut self, from: JobId, to: JobId) -> Result<(), ErrJob>;
    pub fn set_deterministic(&mut self, on: bool);
    pub fn submit(self, pool: &JobSystem) -> JobGraphHandle;  // executes
}

// === Cancellation & Context ===
pub struct CancelToken { /* private */ }
impl CancelToken {
    pub fn new() -> Self;
    pub fn cancel(&self);
    pub fn is_cancelled(&self) -> bool;
}
pub struct JobCtx<'a> { /* private */ }
impl<'a> JobCtx<'a> {
    pub fn worker_id(&self) -> u16;
    pub fn arena(&self) -> &Arena;            // thread-local frame arena
    pub fn should_cancel(&self) -> bool;
    pub fn yield_now(&self);                  // poll cancellation, allow steal
}

// === Parallel iteration ===
pub trait IntoParIter { type Iter; fn into_par_iter(self) -> Self::Iter; }
pub trait ParIter: Send {
    fn for_each<F: Fn(Self::Item) + Sync>(self, f: F);
    fn map<F, R>(self, f: F) -> /* impl ParIter */;
    fn sum<S>(self) -> S where /* ... */;
    fn chunks(self, n: usize) -> /* impl ParIter */;
    type Item: Send;
}

// === Telemetry ===
pub struct JobTelemetry {
    pub workers: u16,
    pub per_worker: [WorkerTelemetry; 64],
    pub jobs_run_last_frame: u64,
    pub steals_last_frame: u64,
    pub injector_depth: u32,
}
pub struct WorkerTelemetry {
    pub utilization_pct: f32,           // 0..100, EMA over last 64 frames
    pub steals_attempted: u64,
    pub steals_succeeded: u64,
    pub local_pops: u64,
    pub queue_depth_avg: f32,
}
```

## Performance Contract

| Operation | Target | Hard limit |
|---|---|---|
| `submit` (cold queue) | ≤ 40 ns | 200 ns |
| `submit` (hot, local push) | ≤ 25 ns | 80 ns |
| Steal attempt (success) | ≤ 200 ns | 1 µs |
| Steal attempt (fail) | ≤ 80 ns | 300 ns |
| `Scope::spawn` + drain N=16 trivial jobs | ≤ 6 µs total | 25 µs |
| `JobGraph::submit` overhead (graph of 256 nodes) | ≤ 30 µs | 150 µs |
| Worker wake latency (parked → first job) | ≤ 12 µs | 50 µs |
| `par_iter` over 1 M items, 32 ns/item work | ≥ 14× speedup on 16 cores | ≥ 10× |
| ECS schedule (50 systems) total scheduling overhead | ≤ 50 µs / frame | 200 µs |
| Deterministic mode overhead vs sequential | ≤ 2 % | 10 % |
| `JobTelemetry` snapshot | ≤ 1 µs | 5 µs |
| Worker idle CPU (frame-bound game @ 60 fps) | ≤ 4 % per worker | 15 % |

`[BENCHMARK NEEDED]` on reference rig (16-core desktop, 8-core Apple silicon, 8-core Switch-class).

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `JOB.E001` | Pool not initialized | Call `JobSystem::init` once at startup |
| `JOB.E002` | Pool already initialized | Idempotent; ignore or reconfigure via dedicated API |
| `JOB.E003` | Shutdown in progress; submission refused | Stop submitting; await `shutdown` |
| `JOB.E004` | Graph cycle detected at `edge` or `submit` | Inspect `cycle_path`; remove offending edge |
| `JOB.E005` | Graph dangling job (no path from a root) | Caller bug; add edge or remove node |
| `JOB.E006` | Submit lane queue overflow (`Background` capped) | Backoff; submit later; consider raising quantum |
| `JOB.E007` | Job panicked (caught at worker boundary) | Panic re-raised on `JobHandle::wait`; stack captured for telemetry |
| `JOB.E008` | OS thread spawn failed (init time only) | Surface `os_errno`; fall back to reduced worker count |
| `JOB.E009` | Stack overflow detected (best-effort, guarded page) | Job aborted; raise `stack_bytes` config |
| `JOB.E010` | Cancellation requested but job uncooperative | Telemetry only; we never force-kill |
| `JOB.E011` | Determinism violation (parallel op used in det mode) | Replace with serial path; debug-build panic |

All errors carry `job_id`, `lane`, `worker_id`, structured JSON.

## Integration Points

- **`core::ecs`** — `Schedule::run` builds a `JobGraph` per topology change, calls `JobGraph::submit(pool())` per frame. `Query::par_iter` uses `Scope::spawn`. Contract: ECS never spawns threads. → `docs/specs/core/ecs.md`
- **`core::memory`** — each worker registers its TLS `Arena` with `MemTag("scratch.thread-N")` at init. Job system calls `Arena::reset` after each job-graph completion. → `docs/specs/core/memory.md`
- **`core::hal`** — thread spawn, CPU affinity, `Instant::now()`, futex/park primitives, page-guard for stack overflow detection. → `docs/specs/core/hal.md`
- **`core::events`** — events fire from any thread; bus is MPSC backed by per-thread shards; reading happens on the thread that subscribed. → `docs/specs/core/events.md`
- **`renderer`** — render command building uses `par_chunks` over visible draws; the final submission to the GPU queue is serialized to a dedicated render thread (the renderer's contract; jobs only feed it). → `docs/contracts/core-renderer.md`
- **`physics`** — physics islands solved in parallel via `Scope::spawn` per island. → `docs/contracts/core-physics.md`
- **`assets`** — async decode/compress jobs on `Background` lane; foreground awaits via `JobHandle::wait`. → `docs/specs/assets/streaming.md`
- **`agent`** — agent API batches LLM-driven scenario runs on `Background` lane; respects quantum so a heavy batch never drops a frame. → `docs/specs/agent/scenarios.md`
- **`networking`** — input collection and snapshot serialization run as `Critical` lane jobs to meet send-tick deadlines. → `docs/specs/networking/rollback.md`
- **`scripting`** — script callbacks run on the submitting worker; long script work must yield via `JobCtx::yield_now`. → `docs/contracts/core-scripting.md`

## Test Requirements

1. `submit_and_complete_trivial` — submit 10 k no-op jobs; all `is_done` true within deadline; result count exact.
2. `scope_join_waits_all` — `pool.scope(|s| { for _ in 0..1000 { s.spawn(...) } })` returns only after all 1000 ran (atomic counter assertion).
3. `panic_caught_at_boundary` — a panicking job does not crash the worker; `JobHandle::wait` re-raises with original message and a captured backtrace.
4. `workstealing_balances` — pinned producer on worker 0 submits 100 k jobs; final per-worker job counts within ±15 % of uniform.
5. `priority_lanes_respected` — under saturation, `Critical` jobs preempt deque scan order; their p99 latency < `Frame` p50.
6. `background_quantum_enforced` — background workload of 10 ms / frame is bounded to ≤ 2 ms of foreground worker time per frame.
7. `cancel_token_observed` — long-running job exits within 1 ms of `cancel()` when calling `should_cancel` in its loop.
8. `graph_topological_order` — for a fixed seed, observed execution order is a valid topological sort of the declared edges.
9. `graph_cycle_rejected` — adding `a→b, b→a` returns `JOB.E004` at `edge()` time.
10. `determinism_mode_serial` — `set_deterministic(true)` produces identical job order across 100 runs with the same seed; throughput within 2 % of serial.
11. `par_iter_equivalence` — sum-reduce of 1 M ints via `par_iter` equals serial sum.
12. `par_iter_scaling` — speedup ≥ 10× on a 16-core box for 1 M items × 32 ns work each.
13. `tsan_clean_under_load` — TSAN run of `cargo test --features tsan` over 10 min finds zero data races.
14. `loom_pool_model` — `loom` model of submit / steal / shutdown with 4 workers finds no deadlock or lost-wakeup.
15. `no_engine_thread_spawns` — clippy lint forbids `std::thread::spawn` outside `core::jobs`; CI gate.
16. `rayon_interop_runs_on_our_pool` — a `rayon::scope` via `as_rayon()` executes on our workers (telemetry confirms).
17. `worker_idle_low` — 60 fps frame-bound workload, idle workers stay parked ≥ 95 % of unused time (no busy spin beyond a short spin-wait window).
18. `stack_overflow_caught` — deeply recursive job hits guard page → `JOB.E009`, worker recovers.
19. `cross_platform_init` — pool initializes successfully on linux-x86_64, macos-aarch64, windows-x86_64, ios-aarch64, wasm (single-threaded fallback), android-aarch64.
20. `telemetry_jitter_low` — `JobTelemetry::utilization_pct` jitter over 5 s flat-rate workload ≤ 3 %.

## Prior Art

- **Chase & Lev (2005), "Dynamic Circular Work-Stealing Deque"** — algorithmic foundation; `crossbeam-deque` is a faithful Rust port. We adopt the deque, build the scheduler on top.
- **Rayon** (`rayon-rs/rayon`)
  - ✓ Scope ergonomics, work-stealing global pool, `par_iter` extension trait.
  - ✗ No priority lanes; no determinism mode; no cancellation tokens. Inadequate for game-engine frame work.
  - We expose `as_rayon()` for compatibility but own the scheduler ourselves.
- **Naughty Dog "Parallelizing the Naughty Dog Engine using Fibers"** (Christian Gyrling, GDC 2015) — the canonical reference for fiber-based job systems. Argument: fibers allow blocking sync primitives without OS context switches.
  - We start thread-based for simplicity / portability (wasm and consoles have varied fiber support) and revisit fibers post-v1.0 (`[DECISION NEEDED]`).
- **Bevy `bevy_tasks`** (`crates/bevy_tasks`)
  - ✓ Thread-pool + scope; `IoTaskPool` / `AsyncComputeTaskPool` split is similar to our lanes.
  - ✗ Built on `async-executor` (async/await throughout); we choose closure-based jobs for lower overhead and easier integration with the ECS scheduler's DAG model.
- **Intel TBB** — original modern task-graph design; informs our `JobGraph` API shape.
- **Sony `JobMgr`** (PS4 publication, "Multithreading the Entire Destiny Engine", Bungie GDC 2015) — informs priority lanes and the "background lane has quantum" rule.
- **Go runtime scheduler** — taught us that work-stealing + LIFO local + FIFO steal is the right default; that hierarchical / NUMA-aware variants are premature for our targets.
- **Apple `dispatch_queue` / GCD** — informed the "global default queue + named priority queues" mental model exposed to users.

## Open Questions

1. `[DECISION NEEDED]` — Embed `rayon` as the work-stealing backend (and layer lanes + graph on top) vs. own implementation on `crossbeam-deque`. Pro-rayon: less code, battle-tested. Pro-own: priority lanes and determinism without forking. Bias: own.
2. `[DECISION NEEDED]` — Fibers vs threads (v2.0 question). Fibers permit "wait on sync primitive inside a job" without OS context switch; cost is platform porting (wasm has no fibers; iOS / consoles vary). Defer to v1.1 with a benchmark-driven decision.
3. `[DECISION NEEDED]` — Should `par_iter` ordering be deterministic by default in deterministic mode? Easy yes; cost is loss of any reduction reordering. Probable: yes, document the cost.
4. `[DECISION NEEDED]` — Wasm target: single-threaded (current bias) or use `wasm-bindgen-rayon` / Web Workers? Cross-impact: `docs/architecture/03-tech-stack.md` and `[AGENT: 03]` renderer wasm path.
5. `[DECISION NEEDED]` — Default `workers` count: `physical - 1` (reserve one for OS / audio thread) vs. `physical` (max throughput). Audio team `[AGENT: 06]` needs a guaranteed thread — if audio owns a dedicated pinned thread, then `physical - 1` for job pool, plus 1 for audio.
6. `[DECISION NEEDED]` — Async I/O integration: reactor lives in `core::hal`; how do completion callbacks land? Options: (a) post a job to `Critical` lane, (b) wake a parked future, (c) signal a `CancelToken`-style flag. Bias: (a).
7. `[BENCHMARK NEEDED]` — All performance contract numbers.
8. `[DECISION NEEDED]` — Stack size per worker default: 1 MiB (our current) vs 2 MiB. Recursion in scripting and physics islands may hit 1 MiB; consoles often default to 1 MiB; tradeoff is RSS.
9. `[DECISION NEEDED]` — Should the scheduler honor `taskset` / cgroup CPU masks on Linux automatically, even when `pin_to_cores` is true? Containers and CI runners commonly restrict cores; pinning to an unavailable core is silently broken.
