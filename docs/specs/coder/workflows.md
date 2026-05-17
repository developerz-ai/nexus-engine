<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Workflows

> Canonical DAGs of subagent invocations. Each workflow is a recipe the orchestrator executes. Workflows are data, not code.

→ Parallelism + DAG mechanics: `docs/specs/coder/parallelism.md`
→ Tools each step uses: `docs/specs/coder/tools.md`
→ Models each step picks: `docs/specs/coder/models.md`

---

## Boundaries

- **Owns:** workflow definitions (TOML), DAG generation, success/failure criteria per workflow.
- **Does NOT own:** subagent runtime, model choice (per-task table does that), git mechanics.

---

## Workflow file shape

```toml
# .nexus/coder/workflows/implement-spec.toml
name = "implement-spec"
description = "Take a spec, produce code + tests + PR."
inputs = ["spec_path"]

[[task]]
id = "read"
role = "coder"
type = "code.impl"
prompt = "system/impl-read.md"
tools = ["ReadSpec", "ListContracts", "ReadSpec"]

[[task]]
id = "scaffold"
role = "coder"
depends_on = ["read"]
type = "code.impl"
tools = ["EditCrate", "GrepCodebase"]

[[task]]
id = "tests"
role = "coder"
depends_on = ["read"]
type = "test.scenario-write"
tools = ["EditCrate"]

[[task]]
id = "validate"
role = "reviewer"
depends_on = ["scaffold", "tests"]
type = "merge.gate"
tools = ["ValidateAgainstSpec", "RunHeadlessScenario", "BenchPerfContract"]

[[task]]
id = "pr"
role = "coder"
depends_on = ["validate"]
type = "pr.summary"
tools = ["OpenPR"]
```

Workflows live in `.nexus/coder/workflows/*.toml`. User-extensible.

---

## Workflow: `implement-spec`

> Given a spec path, produce a complete implementation + tests + PR.

```
       read(spec)
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
 scaffold tests benches
    │      │      │
    └──────┼──────┘
           ▼
       validate ──fail──► fix-loop ──► validate
           │
           ▼
         pr
```

| Step | Role | Model class | Notes |
|---|---|---|---|
| `read` | coder | sonnet | Load spec + every contract it references |
| `scaffold` | coder | sonnet | Write the public API surface from the spec |
| `tests` | coder | sonnet | Write scenarios + replay fixtures |
| `benches` | bencher | sonnet | Translate Performance Contract table → harness |
| `validate` | reviewer | opus | `ValidateAgainstSpec` + `RunHeadlessScenario` + `BenchPerfContract` |
| `fix-loop` | coder | sonnet, escalates to opus on retry | bounded retries (default 3) |
| `pr` | coder | haiku | `OpenPR` with merge-bot template |

Failure policy: `fail-fast` — first validate-fail without fix triggers abort + report.

Run: `nexus coder implement docs/specs/physics/rigid.md`.

---

## Workflow: `fix-contract-violation`

> A merge bot or local check flagged that code diverges from a contract; reconcile.

```
       triage(violation_report)
              │
         ┌────┴────┐
         ▼         ▼
   read-spec   read-code
         └────┬────┘
              ▼
        propose-fix ──► branch A: amend code
              │     ──► branch B: amend spec
              ▼
         arbitrate (architect role, opus)
              │
              ▼
        chosen branch executes ──► validate ──► pr
```

| Step | Role | Notes |
|---|---|---|
| `triage` | triager | classify: code-bug vs spec-stale vs missing-test |
| `propose-fix` | parallel coders | two subagents, two hypotheses |
| `arbitrate` | architect | opus picks one; rejects both → ask human |
| `validate` | reviewer | hard gate |

Why two parallel proposals: contract bugs are often ambiguous. Cheap to run both, expensive to guess wrong.

Run: `nexus coder fix --contract=docs/contracts/core-physics.md --report=path/to/report.json`.

---

## Workflow: `perf-regression`

> A scheduled bench shows a hot path got slower; bisect, fix, prove.

```
       bench-current ──► confirm regression
              │
              ▼
         git-bisect (replay snapshots as fixtures)
              │
              ▼
         identify-commit
              │
              ▼
         hypothesize-fix (parallel × 3 models)
              │
              ▼
         apply-and-bench (each in own worktree)
              │
              ▼
         pick-winner (lowest p99, no regression elsewhere)
              │
              ▼
         pr
```

| Step | Role | Notes |
|---|---|---|
| `bench-current` | bencher | `BenchPerfContract` |
| `git-bisect` | coder | uses `ReplaySnapshot` as deterministic regression input |
| `hypothesize-fix` | 3 parallel coders | distinct models: opus, sonnet, deepseek |
| `apply-and-bench` | bencher × 3 | one per hypothesis, isolated worktrees |
| `pick-winner` | architect | structured comparison |
| `pr` | coder | includes before/after bench table |

Why 3 parallel hypotheses: perf fixes are creative. Spread the bet, pay 3× tokens, save 3× wall time.

Run: `nexus coder bench --regression=docs/specs/physics/rigid.md`.

---

## Workflow: `new-genre-module`

> Spec + ship a new genre module (e.g. survival, horror).

```
       study-existing (read all docs/specs/genres/*.md)
              │
              ▼
         draft-spec (architect, opus, WriteSpec)
              │
              ▼
         human-review-gate ◄── nexus coder accepts or rejects spec
              │
              ▼
         expand-spec → child specs (sub-systems)
              │
       ┌──────┼──────┬──────┬──────┐
       ▼      ▼      ▼      ▼      ▼
    impl_a  impl_b  impl_c  impl_d  impl_e   ← parallel implement-spec sub-workflows
       └──────┼──────┴──────┴──────┘
              ▼
         integration-scenario (a demo mini-game)
              │
              ▼
         pr (one large PR or per-system PRs)
```

Why explicit human-gate after spec draft: genre choice is creative direction. Cheap to gate before throwing 50 subagents at the implementation.

Run: `nexus coder parallel --workflow=new-genre-module --genre=survival`.

---

## Workflow: `weekend-mvp`

> The vision-statement workflow. Take a game idea → ship playable in 48 hours.

```
Friday 18:00
  └── intake: user types `nexus coder weekend-mvp "co-op cozy horror"`
        │
        ▼
  game-concept (architect, opus, 1 call)
        │
        ▼
  game-template-pick + Nexus.toml gen (architect)
        │
        ▼
  spec-tree-generation (architect, opus, parallel)
        │  produces ~20 mini-specs in docs/specs/games/<slug>/
        ▼
  parallel implement-spec × 20 (mixed model classes)
        │
        ▼
  asset-fetch (assets workflow → Kenney/OpenGameArt/AI gen)
        │
        ▼
  integration-loop:
     while not (all scenarios green AND walkthrough scenario passes):
         identify-failing
         fix-loop (parallel)
         re-run
        │
        ▼
  polish-pass (audio, juice, balance)
        │
        ▼
  build-cross-platform (Linux + Win + WASM)
        │
        ▼
  Sunday 18:00 — shippable artifacts in `dist/`
```

Throughput math: 20 specs × ~2 hours wall = serial 40 h. At 16-wide on a beast: < 3 h critical path + ~10 h iteration loops. Comfortably under 48 h.

Run: `nexus coder weekend-mvp "co-op cozy horror" --class=beast --cap=2000`.

→ Linked walkthrough: `docs/game-template/weekend-mvp.md` [AGENT: 15].

---

## Workflow: `review`

> Human pushes PR-style draft; coder reviews like a senior dev.

```
   load-diff
       │
   ┌───┴───┬───────────┬───────────────┐
   ▼       ▼           ▼               ▼
spec-ref contract-ref test-coverage perf-impact
   │       │           │               │
   └───────┴────┬──────┴───────────────┘
                ▼
          synthesize-comments
                ▼
          post-to-pr  OR  print
```

Used by `nexus-merge` (the merge bot, → AGENT 16) and locally via `nexus coder review <pr#>`.

---

## Workflow: `parallel`

> Generic: take a list of tasks, run them all, report.

```
   for task in input.tasks:
       enqueue(task)
   wait_all → report
```

Use case: rename a symbol across 30 crates, refactor 50 error sites, regenerate 80 docs files. Workflow is the trivial fan-out.

Run: `nexus coder parallel --from=tasks.jsonl`.

---

## Workflow customization

Users add `.nexus/coder/workflows/<name>.toml`; `nexus coder run <name>` loads it. Workflows compose: a workflow may invoke another workflow as a single task node (`type = "workflow"; ref = "implement-spec"`).

---

## Performance contract

| Workflow | Target wall-clock (beast class) | Target token spend |
|---|---|---|
| `implement-spec` (one mid-size spec) | < 15 min | < $5 |
| `fix-contract-violation` | < 10 min | < $3 |
| `perf-regression` | < 30 min | < $20 |
| `new-genre-module` | < 4 hours | < $200 |
| `weekend-mvp` | < 48 hours | < $2000 |
| `review` (one PR) | < 3 min | < $0.50 |

All [BENCHMARK NEEDED] — refresh from telemetry once dogfooded.

---

## Open questions

- [DECISION NEEDED] Should `weekend-mvp` be guarded behind a paid-OpenRouter check (won't accidentally torch a free-tier key)? Default: warn if `cap < 100` and burn rate suggests overrun.
- [DECISION NEEDED] `fix-loop` retry budget. Default: 3 attempts, escalate model each retry.
- [DECISION NEEDED] Should workflows be Turing-complete (loops, conditions in TOML) or stay declarative DAGs? Default: declarative; if-branches encoded via parallel-then-pick.
