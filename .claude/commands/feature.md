---
description: End-to-end feature workflow for Nexus Engine — spec → contract → impl → test, then hand the PR to the existing PR skills. Reads intent from the prompt.
argument-hint: <what you want built, plain language> [+ spec path or reference URL]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, WebFetch
---

# /feature

You are the **mastermind** on Nexus Engine — AI-first, cross-platform, MIT-forever game engine. `CLAUDE.md` is the contract; `docs/architecture/01-principles.md` holds the 15 Laws. A PR that violates a law is rejected by `nexus-merge` without human review.

## Request
$ARGUMENTS

**The prompt is the context.** Infer scope and autonomy from the words. Stop for a true blocker (an engine-core change with no ADR, a law violation, an unsatisfiable external dep).

## No worktrees

**Do not use git worktrees.** Work directly in this checkout. The parallelism doctrine still holds — dispatch many subagents in one message — but they all share this one working tree:

- Never pass `isolation: worktree`. No per-agent worktree dirs, no clones.
- Fan out by **crate and spec subtree** so file sets are disjoint (Law 3: a crate touches only what its spec declares). One agent per crate.
- Serialize anything touching shared roots: workspace `Cargo.toml`, `Nexus.toml`, top-level docs indexes.
- Run `cargo check --workspace` once from the shared tree after the fan-out rejoins (Law 4: always compiles).

## The flow

1. **Understand.** Restate the goal in a line. Find the governing spec — every PR cites a `docs/specs/**` or `docs/contracts/**` path (Law 2).
2. **Stage the pipeline — never skip a stage.** `spec → contract → impl → test`:
   - New behavior with no spec → `spec-author` writes `docs/specs/<system>/<file>.md` first (`docs/guides/spec-format.md`).
   - Crosses a system boundary → `contract-author` writes `docs/contracts/<a>-<b>.md` first.
   - Impl → the domain specialist for that crate (routing table in `CLAUDE.md`).
   - Test → `test-author` adds unit + integration + scenario + property + visual per `docs/guides/testing/coverage.md`.
3. **Dispatch.** N independent specs/crates → N subagents in **one message**. Serialize only when a real dependency forces it.
4. **Verify.** `cargo check --workspace` green. Structured errors only, SPDX header on every file, `// SAFETY:` on every `unsafe`, Performance Contract table on every public API, headless boot, deterministic replay. Editor surface → `scripts/check-rpc-parity` (Law 13).
5. **Audit.** Run `principle-keeper` over the diff against the 15 Laws before opening anything.
6. **PR — reuse the skills, don't reinvent them.** `.claude/skills/` already owns this end of the flow:

   | Need | Skill |
   |---|---|
   | branch name / base / draft policy | `branch-conventions` |
   | open the PR | `open-pr` |
   | drive PR → merge, unattended | `babysit-pr` |
   | wait on CI / CodeRabbit | `wait-for-ci` · `wait-for-coderabbit` |
   | triage, reply, resolve, fix review threads | `coderabbit-triage` · `coderabbit-reply` · `coderabbit-resolve` · `fix-from-coderabbit` · `respond-to-cr-commands` |
   | rebase recovery, changelog, merge | `pr-rebase-and-recover` · `pr-changelog` · `pr-merge` |

   Default: hand the whole PR lifecycle to `babysit-pr` and walk away.

## Output

```
Pipeline: spec <path> → contract <path> → impl <crates> → tests <kinds>
Check:    cargo check --workspace <ok>   rpc-parity <ok / n-a>
Laws:     principle-keeper <clean>
PR:       #NNN (driven by babysit-pr)
```
