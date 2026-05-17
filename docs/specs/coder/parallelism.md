<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Parallelism

> Dozens of subagents in flight at once. Work-stealing queue. Dependency DAG. One git worktree per subagent. The whole point of nexus-coder.

→ Architecture: `docs/specs/coder/architecture.md`
→ Sandbox / worktrees: `docs/specs/coder/sandbox.md`
→ Workflows: `docs/specs/coder/workflows.md`

---

## Boundaries

- **Owns:** subagent pool size, queue, DAG executor, machine-class profiles, throttles.
- **Does NOT own:** model rate-limits (OpenRouter side) · git internals · engine instance pool (→ `docs/specs/coder/architecture.md` §game-context bridge).

---

## The thesis

> A solo developer with AI should be able to ship a AAA game in a weekend.

This is impossible serially. The math:

```
AAA game ≈ 100 systems × 50 tasks/system ≈ 5,000 tasks
5,000 tasks × 2 min each = 10,000 min = ~167 hours serial
weekend = ~50 hours waking
need ≥ 4× parallelism just to fit. Aim for 16–32× to leave room for iteration.
```

Hence: throw cores + tokens at the problem.

---

## Machine classes

| Class | RAM | Cores | Network | Max subagents | Max engine instances |
|---|---|---|---|---|---|
| `laptop` | 16 GB | 8 | residential | 4 | 1 |
| `workstation` | 64 GB | 16 | gigabit | 16 | 4 |
| `beast` | 256 GB | 64 | 10 GbE | 64 | 16 |
| `cluster` | distributed | distributed | LAN | 256 | 64 |

Override: `~/.nexus/coder/machine.toml { class = "beast" }`. Default: auto-detect via `os.totalmem()` + `os.cpus()`.

---

## Subagent pool

```
┌──────────────────────────────────────────────────────────┐
│  Orchestrator                                            │
│                                                          │
│  pool: [ slot0  slot1  slot2 … slotN ]                   │
│           idle   busy   busy     idle                    │
│                                                          │
│  ready queue (work-stealing):                            │
│     [ task_a, task_b, task_c, task_d, … ]                │
│                                                          │
│  blocked queue (deps unmet):                             │
│     [ task_e ← {a,b},  task_f ← {c},  … ]                │
└──────────────────────────────────────────────────────────┘

idle slot pulls next ready task, spawns subagent, runs to completion, frees slot.
on task complete: re-evaluate blocked queue, promote unblocked tasks to ready.
```

Pool size = `min(max_subagents[class], tokens_budget_remaining / avg_task_cost)`.

---

## Work-stealing queue

```
class WorkStealingQueue:
    per-slot local deque       # LIFO local pushes, FIFO remote steals
    global submission queue    # new tasks land here

    pop(slot):
        try slot.local.pop_lifo()
        else: try other_slot.local.steal_fifo()
        else: try global.dequeue()
        else: idle
```

LIFO local → temporal locality (related subtasks reuse warm cache). FIFO steal → fairness. Pattern reference: Cilk, Rust `rayon`.

---

## Dependency DAG

Tasks declare `depends_on: [task_id, ...]`. Orchestrator builds the DAG, executes in topological order with maximum slack.

```
                    spec-read
                    ┌────────┐
                    │ task_0 │
                    └────┬───┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          ┌───────┐  ┌───────┐  ┌───────┐
          │impl_a │  │impl_b │  │impl_c │   ← parallel
          └───┬───┘  └───┬───┘  └───┬───┘
              └──────────┼──────────┘
                         ▼
                    ┌────────┐
                    │integrate│       ← waits on all impls
                    └────┬───┘
                         ▼
                    ┌────────┐
                    │scenario│        ← runs only after integrate
                    └────────┘
```

DAG is serialized to `.nexus/coder/runs/<run_id>/dag.json`. Resumable on crash.

---

## Max in-flight policy

Three independent caps, lowest wins:

| Cap | Source | Reason |
|---|---|---|
| `pool.size` | machine class | local resource bound |
| `model.rpm[model]` | OpenRouter rate limit | provider bound |
| `budget.burn_rate / avg_cost` | cost ledger | money bound |

When a cap is hit: orchestrator throttles new task launches, in-flight finish normally. Telemetry emits `throttle.applied { cap, value }`.

---

## Shared context vs isolated worktrees

| Resource | Shared? | Why |
|---|---|---|
| spec corpus (`docs/specs/`) | shared, read-only | one source of truth |
| contract corpus (`docs/contracts/`) | shared, read-only | one source of truth |
| context cache | shared | cache amortization |
| `crates/` source tree | **isolated per subagent (worktree)** | concurrent edits |
| compiled artifacts (`target/`) | shared sccache | rebuild speed |
| engine instance | pooled (K shared) | RAM bound |
| scenario fixtures | shared, read-only | determinism |
| audit log | shared, append-only | single ledger |

→ Worktree mechanics: `docs/specs/coder/sandbox.md`.

---

## DAG execution policies

| Policy | Behavior |
|---|---|
| `fail-fast` | first task failure cancels all unstarted descendants |
| `best-effort` | failures recorded, independent branches continue |
| `manual-merge` | each leaf task waits for human merge approval |
| `auto-merge` | passing leaves auto-merge to integration branch |

Set per workflow. Default: `fail-fast` for `implement-spec`, `best-effort` for `parallel`. → `docs/specs/coder/workflows.md`.

---

## Backpressure

When the orchestrator detects:

- queue depth > 4 × pool size
- OR token budget burn rate > 2× ledger target
- OR engine bridge queue depth > 50

…it stops accepting new submissions, drains, emits `backpressure.engaged { reason }`. CLI shows warning. Resumes when below 50% of trigger.

---

## Cross-subagent communication

**None by default.** Subagents do not message each other. All inter-task signal is:

1. via the DAG (output of A → input of B at orchestrator merge step), or
2. via the spec/contract corpus (A writes spec, B reads spec next task), or
3. via the engine state (A spawns entity, B observes via scenario run).

Pattern reference: Erlang process isolation. No shared mutable state ⇒ no deadlocks, no race bugs in the agent layer.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| Slot dispatch latency | < 50 ms | < 200 ms |
| Worktree allocation (warm pool) | < 500 ms | < 3 s |
| DAG re-evaluation after completion | < 10 ms (1000 tasks) | < 100 ms |
| Steady-state subagent occupancy | ≥ 80% of pool | — |
| Token throughput, beast class | ≥ 1 M tokens/min aggregate | [BENCHMARK NEEDED] |

---

## Error contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_DAG_CYCLE` | task DAG has cycle | reject submission |
| `E_DEP_UNRESOLVED` | task references unknown `depends_on` id | reject submission |
| `E_POOL_EXHAUSTED` | no slot in N seconds | apply backpressure |
| `E_STEAL_TIMEOUT` | slot idle > stall threshold | restart worker process |

---

## Prior art

- **Aider** ✓ — proves parallel agent runs are productive even with two roles. → `https://aider.chat/2024/09/26/architect.html`.
- **Claude Code subagents** ✓ — parallel pre-configured workers, each with own tool scope. → `~/workspace/sebyx07/claude-code-bible/docs/02-skills-agents-commands.md`.
- **Cilk / `rayon`** ✓ — work-stealing reference.
- **Bazel** ✓ — DAG executor for build steps, same pattern.
- **GitHub Actions matrix** ✗ — coarse, no work-stealing, no dep-DAG inside a job.

---

## Open questions

- [DECISION NEEDED] Distributed mode: orchestrator on one box, subagents on N boxes. v1.1 feature or v1.0?
- [BENCHMARK NEEDED] Real subagent count where coordination overhead overtakes throughput. Guess: 64 on a single beast.
- [DECISION NEEDED] Should subagent-to-subagent messaging exist as opt-in? Default: no, force communication through artifacts.
