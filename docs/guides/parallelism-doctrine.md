<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Parallelism Doctrine

A solo dev on Nexus is never bottlenecked by single-threaded AI. The default is **dozens of subagents in flight**. The orchestrator plans, engineers work, reviewers gate.

## The Rule

> If N tasks are independent, dispatch N subagents in **one message**.

Serialize only when:
- The downstream task literally needs the upstream artifact (file path, generated symbol, contract draft).
- A merge conflict is provably guaranteed.
- A reviewer must see a fixed snapshot.

Everything else parallelizes.

## Dispatch Patterns

| pattern | use when | how |
|---|---|---|
| **fan-out** | new spec touches N genres | one message, N `Agent` calls, one per `<g>-genre` |
| **pipeline** | spec → contract → impl → test | four sequential dispatches |
| **map-reduce** | audit N crates → one report | parallel agents, then `integration-resolver` aggregates |
| **race** | two strategies for an open question | parallel agents, `architect` picks winner |
| **swarm** | full review (code + sec + style + perf) | one message, four `Agent` calls |

## Worktrees

`isolation: worktree` in the subagent definition gives each agent a clean copy of the repo. Required when ≥3 agents write concurrently. The orchestrator collects per-worktree PRs and resolves merge order.

| set worktrees | skip worktrees |
|---|---|
| ≥3 parallel writers | sequential work |
| benchmarks (need clean state) | read-only audits |
| edits overlap files | edits in disjoint crates |
| long-running impl (>30 min) | quick fixes |

Worktree feature docs: https://code.claude.com/docs/en/worktrees

## After Every Batch — The Resolver Sweep

Always dispatch (in parallel) after any fan-out:

1. `integration-resolver` — resolves `[AGENT: XX]` cross-references.
2. `decision-log-keeper` — sweeps `[DECISION NEEDED]` into `docs/architecture/decisions-open.md`.
3. `benchmark-coordinator` — sweeps `[BENCHMARK NEEDED]` into `docs/architecture/benchmarks-pending.md`.
4. `glossary-keeper` — syncs new terms into `docs/guides/glossary.md`.
5. `docs-style-enforcer` — claude-code-bible ch.11 conformance.

Then dispatch `merge-bot` for the verdict.

## Token Budget — Solo Dev Per Session

Rough envelope (Claude + OpenRouter combined, per 4-hour solo session):

| tier | agent count | avg tokens / agent | session total |
|---|---|---|---|
| Opus (orchestrator, architect, reviewers) | 2–3 | 30k | ~75k |
| Sonnet (engineers, authors) | 8–15 | 50k | ~600k |
| Haiku (sweepers) | 5–10 | 10k | ~80k |
| **Session envelope** | | | **~750k tokens** |

Tactics to stay in budget:
- Narrow `tools` aggressively. Fewer tools = smaller system prompt = cheaper invocations.
- Use Haiku for any agent that doesn't reason about architecture.
- Have engineers emit **structured artifacts** (the spec, the diff, the bench JSON) — not chat.
- `orchestrator` plans once at top of session; engineers execute without re-planning.
- After a batch, free context — don't keep transcripts in the main thread.

## Routing By OpenRouter (for `nexus-coder`)

When running outside Claude Code (in production via `nexus-coder`):

| task | route to |
|---|---|
| codegen impl | Sonnet-class via OpenRouter |
| architecture / review | Opus-class |
| spec sweep / glossary | Haiku-class or Llama-class |
| asset-gen prompt drafting | Sonnet-class |

See `docs/specs/coder/models.md` for the routing matrix.

## Anti-Patterns

| ✗ avoid | ✓ do |
|---|---|
| serial Sonnet calls when independent | one message, N `Agent` calls |
| Opus for mechanical sweeps | Haiku |
| broad `tools: ` (inherit all) | narrow allowlist |
| keeping subagent transcripts in main thread | summarize, drop |
| re-planning per agent | plan once in `orchestrator`, hand off |
| skipping the resolver sweep | always run it after fan-out |

## Worked Example — "Implement rollback netcode"

Task: full impl across networking + determinism + scenario tests.

```
1. /spec rollback                    → spec-author writes docs/specs/networking/rollback.md
2. /contract core-networking         → contract-author updates docs/contracts/core-networking.md
3. ONE message, parallel dispatch:
   - rollback-specialist (impl)
   - determinism-auditor (audit math + RNG paths)
   - test-author (scenario tests for desync, late-join, mid-match disconnect)
   - perf-engineer (resimulation bench)
4. After batch, parallel dispatch:
   - integration-resolver
   - decision-log-keeper
   - benchmark-coordinator
   - merge-bot
```

Total wall-clock: ~minutes. Total agent count: 8. Serial would take hours.

## Worked Example — "Sweep glossary across all specs"

Pure fan-out, all Haiku, no dependencies:

```
ONE message, parallel dispatch:
- glossary-keeper × N (one per docs/specs/<system>/ subtree)

Then:
- integration-resolver (merge per-tree diffs)
- docs-style-enforcer (final pass)
```
