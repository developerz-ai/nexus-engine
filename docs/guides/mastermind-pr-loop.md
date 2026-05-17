<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mastermind PR Loop — Orchestration Rules

How the mastermind (`/CLAUDE.md` at repo root) invokes the PR-pipeline skills, delegates to subagents, and decides when to escalate.

Skills: `.claude/skills/babysit-pr/` (driver) and siblings. Subagent fleet: `CLAUDE.md` § Subagent Fleet.

---

## Invocation order (per PR)

```
/babysit-pr
  │
  ├── /open-pr
  ├── /wait-for-ci
  │     └── red → /pr-rebase-and-recover  ─┐
  ├── /wait-for-coderabbit                  │
  ├── /coderabbit-triage                    │
  ├── /fix-from-coderabbit  (dispatches subagents — see below)
  ├── /coderabbit-reply                     │
  ├── /coderabbit-resolve                   │
  ├── /wait-for-ci  ◀──────────────────────┘
  ├── /pr-merge
  └── /pr-changelog
```

`babysit-pr` is the driver — invoke it once per PR. It calls the others in order and emits a status JSON on every tick the mastermind can parse to decide whether to keep waiting, spawn parallel work, or escalate.

---

## Subagent delegation inside fix-from-coderabbit

`fix-from-coderabbit` routes each accepted thread to the subagent that owns the file path (see the routing table in `.claude/skills/fix-from-coderabbit/SKILL.md`).

Independent fixes → dispatch in parallel in one message:
```
Agent({ subagent_type: "renderer-engineer", prompt: "Fix CR thread PRRT_a in crates/renderer/src/shadow.rs:142 — accepted, summary: …" })
Agent({ subagent_type: "network-engineer",  prompt: "Fix CR thread PRRT_b in crates/networking/src/replication.rs:88 — accepted, summary: …" })
Agent({ subagent_type: "spec-author",       prompt: "Add missing section to docs/specs/renderer/shadows.md per CR thread PRRT_c — accepted, summary: …" })
```

Three subagents in one message → three crates fixed concurrently. The mastermind never serializes independent fixes.

Sequential dependencies (rare):
- contract change → wait for `contract-author`, then dispatch downstream-engineer.
- spec change → wait for `spec-author`, then re-dispatch impl engineer with updated spec.

---

## When to escalate to a human (kill-switch)

| Condition | Detected by | Mastermind action |
|---|---|---|
| 3 CR rounds without convergence | `babysit-pr` counter `ROUND >= 3` | open `[ESCALATE]` GitHub issue with PR link, ping `@<repo-owner>`, exit loop |
| CR triage produced `discuss` thread CR did not address | `coderabbit-triage` `counts.discuss > 0` for 2 rounds | escalate to `architect`, file `[DECISION NEEDED]` in `docs/architecture/decisions-open.md` |
| CI red 2× from same root cause | check name appears in `wait-for-ci.failing_checks` twice | route to `ci-engineer`, hold further pushes |
| Merge conflict twice in same loop | `pr-rebase-and-recover.conflicts` non-empty twice | route to `architect`; tag PR `needs-design-review` |
| PR touches `docs/architecture/00-vision.md` or `01-principles.md` | detected by `open-pr` precondition | require human review + ADR; skip auto-merge |
| Security suggestion from CR (path: `crates/scripting/sandbox/**` or `crates/networking/anticheat/**`) | path glob | route to `security-reviewer` before any fix |
| `nexus-merge` bot rejects | `pr-merge.refuse_code` from merge bot | restart pipeline at the failed stage; if same rejection twice → human |

---

## Parallel PR handling

The mastermind may have N PRs in flight (each `babysit-pr` is its own loop). No cross-PR coordination — `nexus-merge` (see `docs/guides/merge-system.md`) serializes main-branch landings.

Default: one `babysit-pr` per open authored PR. The mastermind invokes them all in one message at the start of a tick, parses each status JSON, dispatches the next stage in parallel where possible.

Cap: 8 concurrent `babysit-pr` loops. Beyond that, queue (CR rate limits + reviewer attention become bottlenecks).

---

## Status object schema (what the mastermind parses on each tick)

```json
{
  "pr": 123,
  "round": 2,
  "stage": "wait-for-coderabbit",
  "ci_verdict": "green",
  "cr_state": "complete",
  "open_threads": 3,
  "approvals": 1,
  "mergeable": true,
  "next_action": "coderabbit-triage",
  "escalate": null
}
```

`escalate` non-null → mastermind opens an issue + pings human + stops the loop.

---

## When to invoke skills directly (not via babysit-pr)

| Scenario | Skill | Why |
|---|---|---|
| editing `.coderabbit.yaml` | `coderabbit-config` | one-shot config evolution |
| writing the CHANGELOG manually | `pr-changelog` | after a hotfix where babysit was bypassed |
| force-resolving stuck threads | `coderabbit-resolve` | post-mortem cleanup |
| triaging a long-stale PR | `coderabbit-triage` standalone | before re-running babysit |
| naming a new branch | `branch-conventions` | reference lookup |

---

## Forbidden behaviors

- Skipping `wait-for-ci` between `fix-from-coderabbit` and `pr-merge`. Fixes can break things.
- Auto-merging a PR that touches `01-principles.md`. Constitutional change requires human.
- Resolving a thread before posting the reply that explains the resolution. Audit trail matters.
- Force-pushing during a CR review in flight. Wait for the review, then push.
- Plain `git push --force`. Always `--force-with-lease` (see `branch-conventions`).

---

## Refs

- `.claude/skills/babysit-pr/SKILL.md`
- `docs/guides/pr-workflow.md`
- `docs/guides/merge-system.md` (Agent 16)
- `CLAUDE.md` § Subagent Fleet (Agent 23)
- `docs/architecture/01-principles.md`
