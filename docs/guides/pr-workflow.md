<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# PR Workflow — The Babysit Loop

How a Nexus PR moves from `git push` to merged, driven by the mastermind without a human in the loop.

Constitution: `docs/architecture/00-vision.md` · Laws: `docs/architecture/01-principles.md` · Skills: `.claude/skills/babysit-pr/` and siblings.

---

## Swim lanes

```
 Author                CI                CodeRabbit            Mastermind             Reviewer               Merge
 (subagent)         (GH Actions)        (bot)                (orchestrator)         (human / nexus-merge)  (gh)
 ─────────          ─────────────       ─────────────        ─────────────────      ──────────────────     ───────
   push     ──▶  build/test/clippy
     │              │
     │              ├── green ───────────────────────────────▶ wait-for-coderabbit
     │              │                                                 │
     │              └── red  ─────────────────────────────▶ pr-rebase-and-recover
     │                                                              │
     │                                                          (push again)
     │                                                              │
     │                                            review ───▶ coderabbit-triage
     │                                                              │
     │                                          ┌─── accept ──▶ fix-from-coderabbit ─┐
     │                                          │                                     │
     │                                          ├── reject ───▶ coderabbit-reply       │
     │                                          │             (cite Law)              │
     │                                          │                                     │
     │                                          └── outdated ─▶ coderabbit-resolve    │
     │                                                                                │
     │                                                          (push fixes) ◀────────┘
     │                                                              │
     │                                                          wait-for-ci
     │                                                              │
     │                                                       ┌── green ──┐
     │                                                       │           │
     │                                                       ▼           ▼
     │                                            request review ─▶ approve ─▶ pr-merge ─▶ pr-changelog
     │                                                       │
     │                                                  (nexus-merge bot
     │                                                   may approve per
     │                                                   docs/guides/merge-system.md)
```

The mastermind owns orchestration. Every stage emits a JSON status the orchestrator parses to choose the next move.

---

## Stages

| Stage | Skill | Output |
|---|---|---|
| 1. Open | `open-pr` | `{pr_url, pr_number, draft:true}` |
| 2. Wait CI | `wait-for-ci` | `{verdict, failing_checks, duration_s}` |
| 3. Rebase if red | `pr-rebase-and-recover` | `{rebased_onto, conflicts, force_pushed}` |
| 4. Mark ready | `gh pr ready` | none |
| 5. Wait CR | `wait-for-coderabbit` | `{cr_state, thread_count}` |
| 6. Triage | `coderabbit-triage` | `{threads:[…], counts}` |
| 7. Fix accepted | `fix-from-coderabbit` | `{applied, resolved_threads, commits}` |
| 8. Reply rejected | `coderabbit-reply` | `{reply_id, principle_cited}` |
| 9. Resolve outdated | `coderabbit-resolve` | `{resolved}` |
| 10. Wait CI (again) | `wait-for-ci` | `{verdict}` |
| 11. Merge | `pr-merge` | `{merged, merge_sha}` |
| 12. Changelog | `pr-changelog` | `{section, line}` |

`babysit-pr` is the driver that calls 1–12 in sequence with loop-back on stages 6→10.

---

## SLOs

| Metric | Target | Hard cap | Escalation |
|---|---|---|---|
| CI green (required checks) | ≤15 min | 30 min | `ci-engineer` |
| CR posts review | ≤5 min after ready | 20 min | `liveops-engineer` |
| Triage → reply round | ≤5 min | 15 min | `code-reviewer` |
| PR open → merged (non-architectural) | ≤1 h | 4 h | `architect` |
| Architectural PR (ADR required) | 7 days | 14 days | `architect` |

Misses are logged to `docs/architecture/sla-misses.md` (manually maintained until `liveops-engineer` automates it).

---

## Kill-switch — when to break the loop

| Condition | Action |
|---|---|
| 3 CR rounds with new threads each cycle | open `[ESCALATE]` issue, ping human reviewer, exit loop |
| Same CI check red 2× from same root cause | route to `ci-engineer`, do not re-push blindly |
| Merge conflict ≥2× in same loop | route to `architect` for spec/design resolution |
| Touches `docs/architecture/00-vision.md` or `01-principles.md` | force human review, no auto-merge |
| Touches `docs/contracts/**` and breaks downstream test | route to `contract-author` + `integration-resolver` |

Defined in `docs/guides/mastermind-pr-loop.md`.

---

## Parallelism

Many PRs run in parallel. The mastermind dispatches one `babysit-pr` per PR; they do not coordinate. CodeRabbit handles ordering on its side. `nexus-merge` (see `docs/guides/merge-system.md`) handles main-branch serialization.

Within one PR, fixes for independent threads can be applied in parallel by dispatching one `fix-from-coderabbit` invocation per crate (route by path → subagent table inside that skill).

---

## Refs

- `.claude/skills/babysit-pr/SKILL.md`
- `docs/guides/merge-system.md` (Agent 16)
- `docs/guides/pr-protocol.md` (Agent 16)
- `docs/guides/coderabbit.md`
- `docs/guides/github-graphql-cookbook.md`
- `docs/guides/mastermind-pr-loop.md`
