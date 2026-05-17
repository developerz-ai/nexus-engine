<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Subagent Fleet — How To Use It

The fleet lives at `.claude/agents/*.md`. The mastermind routing table lives at `/CLAUDE.md`. This doc is the narrative — when to chain, when to parallelize, when to escalate.

## The Four-Stage Pipeline
```
spec  →  contract  →  impl  →  test
```
Every change passes through every stage. Skipping a stage = `nexus-merge` rejects.

| stage | subagent | output |
|---|---|---|
| spec | `spec-author` | `docs/specs/<system>/<file>.md` |
| contract | `contract-author` | `docs/contracts/<a>-<b>.md` |
| impl | domain engineer (see routing table) | code in `crates/<crate>/` |
| test | `test-author` | unit + integration + scenario + property + visual |

## Routing — Task Type → Subagent

| task type | subagent |
|---|---|
| new system | `architect` → `spec-author` → `contract-author` → domain engineer |
| existing system change | domain engineer (read spec first) |
| cross-system change | `contract-author` then both domain engineers in parallel |
| genre module | matching `<g>-genre` subagent |
| renderer perf bug | `renderer-engineer` + `perf-engineer` (parallel) |
| network desync | `rollback-specialist` + `determinism-auditor` |
| asset import bug | `asset-import-specialist` |
| AI asset gen | `ai-asset-gen-specialist` |
| crash from prod | `crash-triager` → relevant domain engineer |
| security finding | `security-reviewer` → relevant domain engineer |
| docs sweep | `docs-style-enforcer` + `glossary-keeper` (parallel) |
| ADR | `adr-author` |
| principle audit | `principle-keeper` |
| full review | `/review` (parallel: code + security + style) |
| deploy | `deploy-engineer` |
| store release | `release-engineer` |
| live-ops incident | `crash-triager` + `liveops-engineer` |
| anything ambiguous | `orchestrator` |

## Chain vs Parallel

**Chain** (one after another) when:
- A literal dependency exists. Impl needs the contract file written first.
- The next stage's prompt requires the previous stage's artifact path.

**Parallel** (single message, many `Agent` calls) when:
- The tasks touch independent crates or specs.
- A spec rewrite affects multiple genre modules.
- A review pass (code + security + style + docs).
- A fleet-wide audit (`principle-keeper` across N crates).

Default is parallel. Solo dev on Nexus is never bottlenecked by single-threaded AI.

## Invoking a Subagent

```text
Agent({
  subagent_type: "rollback-specialist",
  prompt: "Implement input-prediction in crates/networking/rollback per docs/specs/networking/rollback.md. Add scenario tests. Open PR.",
  description: "Rollback impl"
})
```

The mastermind `CLAUDE.md` lists every subagent. The frontmatter `description` is the routing key — keep it specific.

## Worktrees

Long parallel work → set `isolation: worktree` in the subagent definition (or per-invocation). Each subagent gets its own copy of the repo; merges happen via PR.

| use worktrees when | skip worktrees when |
|---|---|
| ≥3 subagents writing in parallel | sequential or read-only work |
| edits overlap the same files | edits touch disjoint crates |
| benchmarks need clean repo state | quick spec edit |

## After Every Parallel Batch

1. Dispatch `integration-resolver` — sweeps for `[AGENT: XX]` cross-refs and resolves them.
2. Dispatch `decision-log-keeper` — moves `[DECISION NEEDED]` into `docs/architecture/decisions-open.md`.
3. Dispatch `benchmark-coordinator` — moves `[BENCHMARK NEEDED]` into `docs/architecture/benchmarks-pending.md`.
4. Dispatch `merge-bot` — final verdict.

## When To Escalate To `architect`

- The task requires a new top-level system (new `docs/specs/<system>/`).
- Two specs disagree and the conflict can't be resolved by `contract-author`.
- An ADR-worthy decision is needed (irreversible, cross-cutting).
- A principle (`01-principles.md`) needs to be amended.

`architect` runs on Opus. Engineers run on Sonnet. Sweepers (glossary, style) run on Haiku.

## Cost Discipline

| tier | use for |
|---|---|
| Opus | architect, orchestrator, code-reviewer, security-reviewer, principle-keeper, nexus-coder-architect |
| Sonnet | every domain engineer, spec-author, contract-author, test-author |
| Haiku | docs-style-enforcer, glossary-keeper, coverage-auditor, mechanical sweepers |

See `parallelism-doctrine.md` for token budgeting per session.
