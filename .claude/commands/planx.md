---
description: Write a concise, self-contained multi-file execution plan to docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/ for another AI to implement.
argument-hint: [what you want done]
allowed-tools: Write, Read, Glob, Grep, Bash, Agent
---

# /planx

Produce a plan another AI can execute with zero extra context. Plan only — no implementation, no code execution, no edits outside the plan dir.

## Goal
$ARGUMENTS

## Steps

1. **Resolve path.** `date +%Y`, `date +%m`, `date +%d`. Dir = `docs/plans/<YYYY>/<MM>/<DD>/`. Next number = highest existing `1NN-*` + 1, else `101`. Slug = kebab-case, ≤5 words. Plan dir: `docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/`.

2. **Explore.** Dispatch subagents (very thorough). Find: the governing `docs/specs/**` / `docs/contracts/**` paths (Law 2 — every PR cites one), the crates the specs name (Law 3), existing patterns and files to touch (`file:line`), test kinds required by `docs/guides/testing/coverage.md`, and any ADR needed for an engine-core change (Law 15). Executors work in this checkout — no worktrees, no clones.

3. **Write the plan as multiple files** — never one big `plan.md`. Always `overview.md` plus one `<NN>-<aspect>.md` per separable area. Mirror the four-stage pipeline so slices execute in order: e.g. `01-spec.md`, `02-contract.md`, `03-impl-<crate>.md`, `04-impl-<crate>.md`, `05-tests.md`.

   **`overview.md`** — Goal (1-2 sentences) · Context (Rust workspace, spec-driven, headless by default, deterministic replay, structured errors, SPDX headers, opt-in modularity via `Nexus.toml`) with reference patterns as `file:line` · Plan files in execution order · Done when (incl. `cargo check --workspace` green, coverage floor met, RPC parity if the editor surface is touched) · Risks / open questions.

   **Each `<NN>-<aspect>.md`** — Files to change (`path:line`) · Steps (ordered, concrete; `Type::method` refs) · Tests (unit + integration + scenario + property + visual where applicable) · Done when.

4. **Write a `status.yml`** in the plan dir: `plan`, `title`, `status` (not_started | in_progress | blocked | complete | superseded), `created_by`/`owner` from `git config user.name`, `worked_by: ""`, `percent`, `current_focus`, `slices` (status + percent each), `evidence: []`, `notes`, `last_updated`. Valid YAML — the only tracker; slices stay reference maps.

## Rules
- Terse. Fragments over sentences. Tables for structured data. `file:line` refs over prose. No checkboxes. Point at code, don't paste it.
- Every impl slice cites its spec/contract path. No impl slice without one — write the spec slice first.
- Respect the 15 Laws: sacred module boundaries, always compiles, performance is a spec, no `unsafe` without `// SAFETY:`, SPDX on every file, headless by default, deterministic replay, structured errors only, telemetry by default, tests ship with code, agent–editor RPC parity, opt-in modularity, extend don't fork.
- Independent slices are meant to be dispatched in parallel — say so, and keep their file sets disjoint by crate so they can share one working tree.
- Executors work directly in this checkout — never plan around git worktrees or per-agent clones.
- PR mechanics are not the plan's job: point at `.claude/skills/` (`branch-conventions`, `open-pr`, `babysit-pr`, `wait-for-ci`, `coderabbit-*`, `pr-merge`).

## Output
```
✓ docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/overview.md
  + 01-<aspect>.md, … + status.yml
Next: run an executor on overview.md.
```
