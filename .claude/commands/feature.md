---
description: End-to-end feature/bug-sweep workflow for Nexus Engine — understand, distrust the docs, explore in parallel, slice by crate, build with a hive of subagents in this ONE checkout (never worktrees), gate green, then hand the PR to the babysit-pr skills. Reads intent from the prompt.
argument-hint: <what you want built or fixed, plain language> [+ spec path or reference URL(s)]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Task, SendMessage, TaskCreate, TaskUpdate, TaskList, Skill, WebFetch
---

# /feature

You are the **mastermind** on Nexus Engine. `CLAUDE.md` is the contract; `docs/architecture/01-principles.md` holds the 15 Laws. A PR that violates a law is rejected by `nexus-merge` without human review.

**Done means merged and green — nothing less counts.** understand → distrust the paperwork → explore → slice by crate → build → gate green → PR → CodeRabbit answered → **merged** → docs left true. A green `cargo check` is not done. An open PR is not done. A PR with three unresolved CodeRabbit threads is not done. When you report, say which of those you actually verified rather than which you assume happened. Nothing deploys from this repo — the arc ends at **merged**, plus `scripts/release-engine` when the change is a release.

## Request
$ARGUMENTS

**The prompt is the context — read the intent.** How autonomous to be, how big the scope, whether to confirm before merging: infer it from the words. "Do full work" / "just ship it" → run start-to-finish, decide everything yourself, merge on green, no check-ins — surface decisions in the PR body instead of asking. A tentative or exploratory ask → clarify what is genuinely ambiguous and let the user review before you merge. Don't make the user configure you. The flow below is a map, not a checklist to recite. Always stop for a true blocker: an engine-core change with no ADR (Law 15), an edit to `00-vision.md` / `01-principles.md`, a law violation you are being asked to commit, an unsatisfiable external dep.

**Pick the PR mode before you brief anyone.** It changes the commit step, not the build discipline. **Slice-per-PR** (default) — one crate or concern per PR, matching Law 3. **One fat PR** ("do it in 1 PR") — the user's call and legitimate for a coherent sweep; path-disjointness still governs the *build* (it is how parallel agents avoid clobbering each other), it just no longer governs the *commit*, and the PR body must then carry the finding-by-finding ledger the separate PRs would have.

**Cap a PR at ~110–120 files.** Past that it loses the checks that catch things. CodeRabbit refuses outright above 150 changed files ("Review skipped: 278 files exceed the limit of 150") — and here it is configured `assertive` with path-instructions enforcing the 15 Laws, so the biggest, riskiest PR gets the *least* law enforcement. A human cannot hold 279 files either; approval becomes a formality, which equals no review. One red job blocks everything — seven jobs run per PR (fmt, clippy, check, test, deny, scripts, SPDX), so a 279-file PR that trips `docs-spdx` on two files holds ~90 fixes hostage. And bisecting a later determinism regression lands on one enormous commit instead of one crate. So when a sweep exceeds the cap, **split it even if the user asked for one PR — and say why**. Slice along the boundaries you already built for the agents; they were disjoint by construction, so each becomes a PR for free. Land the shared thing first (a `docs/contracts/**` file, a `nexus-core` type, a `nexus-hal` trait), then the consumers.

## The Four-Stage Pipeline still governs (NEVER skip a stage)

`spec → contract → impl → test`. Not optional, and not something the hive routes around. New behavior with no spec → `spec-author` writes `docs/specs/<system>/<file>.md` first (Law 2: every PR cites a spec or contract path). Crosses a system boundary → `contract-author` writes `docs/contracts/<a>-<b>.md` first — this is the one stage you must **serialize**, because impl agents read the contract and it must exist before they launch. Impl → the domain specialist for that crate. Test → `test-author` adds unit + integration + scenario + property + visual per `docs/guides/testing/coverage.md` (Law 12).

## Work as a hive mind, in one checkout

**You decide whether to hive at all — it is a judgement call, not a ritual.** Two things reliably justify it: **searching** (a broad sweep across specs and crates where you want conclusions, not file dumps) and **scale** (enough independent, crate-separable work that serialising it would take hours). Everything else should not hive. A single-file fix, one clippy failure with one obvious home, a spec typo — do it yourself; fanning out three subagents onto a two-file change costs more in briefing, collision management and report-reading than the change is worth, and you pay it in the one context that has to survive to the merge. `CLAUDE.md`'s "dispatch many subagents at once" is about *independent* work — it is not a licence to fan out onto work that isn't.

When you do hive: a big task is not one agent doing more, it is a **team sharing one working tree**, with you as coordinator. **Never use git worktrees** — no `isolation: worktree`, no per-agent directories, no clones, ever. The cost here is concrete: each worktree needs its own `target/` (tens of GB and a cold rebuild of the whole wgpu/rapier/tokio dep graph) and its own `bun install`, and half-finished work becomes invisible to the final `cargo check --workspace` — precisely the check Law 4 exists to make meaningful. One checkout, many hands, and the file set is the only lock.

- **You coordinate; you do not code.** You own git, the ledger and the merge, and you are the only participant who must survive to the end — spend your context on routing and judgment, not on reading files an agent will report back. If you are editing crate source, you have taken a slice away from someone who had room for it.
- **The file set is the lock.** Every brief names that agent's exclusive paths *and* the paths every other live agent holds. An agent needing a file it does not own **stops and reports the collision** — never edits across the line, never negotiates peer-to-peer. You mediate: hand the change to the owner, or re-cut the boundary. Crate boundaries make this easy (`crates/nexus-physics/**` is one lock, `crates/genres/fps/**` another).
- **Agents are long-lived teammates, not one-shot jobs.** New work in an area someone holds goes to them via `SendMessage` — they keep their context, their reasoning and their file lock. A second `renderer-engineer` on `crates/nexus-renderer/**` is two writers and a lost fix.
- **Work in waves; each wave re-tasks the next.** Wave 1's findings decide wave 2's slices. Do not plan wave 3 before wave 1 reports — it will be wrong. After a parallel batch, dispatch `integration-resolver` to reconcile `[AGENT: XX]` cross-refs; that is a wave of its own, not an afterthought.
- **Keep the ledger visible** — `TaskCreate`/`TaskUpdate` per slice, so ownership survives a context handoff and the user can see the run's shape without asking.
- **Expect the hive to contradict you.** This repo's docs run ahead of its code in places and behind it in others, so briefs built from a doc sweep carry claims the code disproves. A good agent reports "premise H1 is false, here is the line" — drop the premise. Findings that survive several agents reading independently are the ones worth shipping.

**Route to the real roster, don't improvise one.** `CLAUDE.md` carries the full routing tables — spec authoring, one domain specialist per spec subtree (core, renderer, physics, audio, networking, scripting, assets, agent API, editor), the genre agents owning `crates/genres/<g>`, quality & process (`code-reviewer`, `security-reviewer`, `test-author`, `perf-engineer`, `fuzz-engineer`, `coverage-auditor`, `principle-keeper`) and meta (`orchestrator`, `integration-resolver`). Pick the agent whose charter already names the crate you are slicing — a named specialist arrives knowing constraints you would otherwise have to write into the brief. `ts-script-author` owns `scripts/**`; a Bun/TS slice is never a Rust engineer's job.

### Who runs which checks

**Cargo takes an exclusive lock on `target/`.** Two agents running `cargo check`/`clippy`/`nextest` at once do not run in parallel — the second prints `Blocking waiting for file lock on build directory` and stalls. A hive where every agent runs a workspace-wide build converts your parallelism into a queue, at full-rebuild prices. **Never let an agent run anything `--workspace`.** `-p <crate>` is the whole discipline: it reuses the shared `target/` incrementally and finishes in seconds.

| | Agent (per iteration) | Coordinator (once, at the end) |
|---|---|---|
| format | `cargo fmt -p <its crate>` | `cargo fmt --all -- --check` |
| lint | `cargo clippy -p <its crate> --all-targets -- -D warnings` | `cargo clippy --workspace --all-targets -- -D warnings` |
| build | `cargo check -p <its crate> --all-targets` | `cargo check --workspace --all-targets` (Law 4) |
| tests | `cargo nextest run -p <its crate>` | `cargo nextest run --workspace --profile ci` |
| `scripts/**` | `bun test <its own test files>` + `bun x biome check <files it edited>`, from `scripts/` | `cd scripts && bun test && bun x biome check .` |
| everything | — | `bun run check` (fmt · clippy · biome · ruff · shellcheck · deny), in the **background** |

An agent owns *its own crate and its own tests*; whole-workspace green is the coordinator's job and nobody else's — once, at the end, in the **background** (it compiles the workspace; a foreground call looks hung). Two gates are easy to forget and both are hard CI failures: **`cargo deny check`**, and the **SPDX sweep** — every new file under `crates/`, `scripts/`, `docs/`, `.github/` needs `SPDX-License-Identifier:` in its first 15 lines, and agents that create files forget it constantly. Sweep for it before committing rather than learning it from `docs / spdx` going red. Touched WGSL → `naga validate`; Python → `ruff check .`.

### Two things only the coordinator can do

- **Every slice you NAME, you must dispatch.** Briefs tell each agent which others are live on which paths — so a named-but-unlaunched slice makes agents dutifully defer work to a teammate who does not exist, and it vanishes. A brief saying "`nexus-net` is owned by the transport agent" when you never spawned one is how six items get orphaned. Keep the roster and the dispatched set as **one list**, and reconcile before you read any report.
- **Reserve an "unowned" bucket, and expect to fill it mid-run.** The real fix often lands where no slice reaches: the workspace `Cargo.toml`, `Nexus.toml`, a `docs/contracts/**` file both sides read, `scripts/index.json`, `.github/workflows/ci.yml`. A homeless finding is the one most likely to be quietly dropped — when a report says "the real fix is outside my set", **assign it immediately** rather than filing it. Shared roots are yours by default; never let two agents edit the workspace `Cargo.toml`.
- **Look for causal chains across reports.** Agents see their own crate; only you see all of them. A determinism failure in `nexus-physics` and a replay divergence in `nexus-agent` are routinely one bug wearing two hats, and neither agent could have seen it. After the reports land, spend one pass asking "does A explain B?" — it changes what you fix and what you can drop.

## The flow

1. **Understand.** Restate the goal in a line. Find the governing spec (Law 2). If the ask cites URLs, `WebFetch` them and extract the *mechanism*, then translate it onto our stack — ECS in `nexus-core`, wgpu in `nexus-renderer`, rapier `enhanced-determinism` in `nexus-physics`, quinn in `nexus-net`, the Rune/Lua VMs in `nexus-script`. `docs/prior-art/` may already hold the synthesis.

2. **Distrust the paperwork.** This repo is docs-first and its docs rot in both directions. Before planning work off a spec, an integration report or an open-decisions list, **check it against the code and the git log**. Concretely: `CLAUDE.md`'s bootstrap section still says "engine source does not exist yet — the next session is still docs-driven", while `crates/` holds 16 members and ~70 `.rs` files plus four `games/*` and two `tools/*`. Treat every such claim as a hypothesis; merged PR titles (`git log --oneline`) are the cheapest ground truth. State plainly which claims you falsified, so nobody re-implements shipped work or "fixes" working code — and correct the doc in the same PR.

3. **Get evidence before you theorise.** No production sits behind this repo, so evidence means the build and CI. All read-only: `cargo nextest run -p <crate> <filter>` to reproduce the failure before explaining it; `gh run view <id> --log-failed` / `gh pr checks <pr>` for the actual failing line (junit lands at `logs/test/nextest-junit.xml`, uploaded as `nextest-junit-<run_id>`); `git log -S'<symbol>' --oneline` for when it changed; `cargo tree -i <crate>` for a dependency surprise; `scripts/bench` before any claim about speed. **Never invent a performance number** — unknown target → `[BENCHMARK NEEDED]`. A finding with a reproducing test outranks one derived from reading alone.

4. **Explore (parallel).** Fan out explore/specialist agents to map every affected crate, its spec and contracts, patterns to mirror (`file:line`), tests and constraints. Give each a **disjoint** area so reports don't overlap, and require of every finding: severity, `file:line`, a one-sentence defect statement, a **concrete failure scenario** (inputs → wrong outcome). Demand two more things explicitly — the doc claims they **falsified**, and the brief premises that turned out **true** (so you neither re-fix working code nor re-verify settled ground). Produce a ranked worklist; log what the survey could not cover. **Protect your own context**: don't read what an agent will report, don't re-derive a conclusion you already have. One thorough agent beats three shallow ones plus your own reading.

5. **Fold in live user reports as first-class findings.** Mid-run the user may paste a panic backtrace, a failing CI link, a replay divergence, a CodeRabbit thread. These are *confirmed* and routinely outrank the sweep's own read-only findings. Reproduce, root-cause, rank above equal-severity read-only findings. If an in-flight agent already owns those files, extend its brief with `SendMessage` rather than spawning a second agent onto the same paths.

6. **Track in GitHub issues.** No external tracker here — issues and the PR body are the record. **Search before you create**: `gh issue list --search "<area>"` including recently closed, since a closed issue may already have decided what you are about to re-decide. Reference rather than duplicate. Unresolved decisions go to `docs/architecture/decisions-open.md` (`[DECISION NEEDED]`), missing numbers to `docs/architecture/benchmarks-pending.md` — that is where `decision-log-keeper` and `benchmark-coordinator` sweep. `scripts/triage-issues` already clusters a defect wave.

7. **Build — branch first, then fan out.** Before a single agent starts, get off `main`:

   ```bash
   git fetch origin && git status --short   # expect a clean tree
   git checkout -b <type>/<slug>            # fix/ feat/ test/ refactor/ docs/ spec/
   ```
   Do it now, while the tree is clean and the branch is free — by commit time the tree is dirty enough that you will not want to think about branches. (`branch-conventions` has the naming/base/draft policy.)

   Then fix slice boundaries **before launching anyone**, each file set **disjoint** from every other. Two agents that must edit one file are one slice, not two — combining them is honest, splitting them invents a boundary that doesn't exist. For a multi-crate sweep never convert N crates N ways: land one reusable primitive **first** (the contract file, the `nexus-core` type, the `nexus-hal` trait), then every crate adopts it.

   Every brief carries all nine of these; omitting one is how a run goes wrong:
   - **its exclusive file set**, and never edit outside it — especially not the workspace `Cargo.toml`;
   - **which other agents are live on which paths**, so a collision is *reported*, not silently resolved;
   - each finding with `file:line`, the defect and the concrete failure scenario — plus **permission to drop any finding the code contradicts** (that is the agent working correctly);
   - **evidence first, diagnosis second** — the symptom, the failing test, the CI line, *then* your hypothesis explicitly labelled **unverified**, to confirm or kill *before* building. Briefs leading with a confident root cause send agents to the wrong file, and a confidently-stated wrong hypothesis is expensive to abandon;
   - **the governing spec/contract path** plus the laws binding its area: structured errors only, no `anyhow!("…")` (10); no `println!`/`eprintln!` outside `examples/`/`tests/` (11); `unsafe` is `forbid` at the root and needs a `// SAFETY:` paragraph plus an ADR (6); SPDX header on every new file (7); Performance Contract table on every public API (5); headless boot (8); deterministic replay (9); a crate touches only what its spec declares (3);
   - **tests ship with the code, failure case first** — for a bug, a test that fails before the fix (12);
   - **checks narrowed to its own crate** — `-p <crate>`, never `--workspace`;
   - **no git operations at all** — no branch, commit, checkout or stash; the coordinator owns all git and work is left uncommitted;
   - **never tell an agent to "ask me" — it cannot.** A subagent has no channel to the user, so a question blocks or guesses. Give it the two legal moves: **decide and flag** (act on the most defensible reading, state the assumption, mark the artifact so you can overwrite it), or **stop and report** with evidence when proceeding either way would be unsafe or wasted. Then *you* take the question to the user and re-task with `SendMessage`, which resumes the agent with its full context.

   Small feature → one agent, skip the fan-out entirely.

8. **Verify.** Run the coordinator column once, in the **background**. Green means fmt, clippy, `cargo check --workspace --all-targets` (Law 4), `cargo nextest run --workspace --profile ci`, `cargo deny check`, `scripts/` bun test + biome, SPDX clean. Editor surface → `scripts/check-rpc-parity` (Law 13). Behavior change → `scripts/scenario` runs and the replay is byte-identical for the same seed (Law 9). Then dispatch `principle-keeper` over the diff, plus `code-reviewer` and `security-reviewer` in parallel, **before** opening anything — far cheaper than learning it from CodeRabbit.

9. **Commit & merge.** Let every agent finish, then plain git. Do not commit while agents are still writing — that is the only thing that ever makes this complicated. **First sweep the agents' leftovers**: scratch `.rs` probes at the repo root, debug `println!` (a Law 11 violation *and* a CI failure), a stray `test.ts`, files missing SPDX. Agents create them and rarely clean up.

   ```bash
   git fetch origin                        # did main move? if so, see below
   git add <the paths for this slice>      # never -A; name the paths
   git status --short                      # then READ it
   git commit && git push -u origin HEAD
   ```
   Commit `<system>: <imperative>`, 50/72; Conventional Commits for the PR title. Naming paths on `git add` is all the selectivity you need — **never `git stash`** (one global stack shared with every concurrent agent; you will pull in someone else's work). For slice-per-PR, repeat one slice at a time, re-`git fetch`ing after each merge.

   **Main moves under you.** Before each build, `git fetch` and intersect *files changed on main* with *files changed locally*. A real overlap is **three-way merged** (`git merge-file -p ours base theirs`), never taken wholesale — a naive tree build drops main's lines silently, with no conflict marker. Verify both sides' symbols survive.

   **Then hand the PR lifecycle to the skills — don't reinvent them:** `branch-conventions` (naming/base/draft) · `open-pr` (CC title, spec ref, scenario list, bench deltas) · `babysit-pr` (drive to merge, unattended) · `wait-for-ci` · `wait-for-coderabbit` · `coderabbit-triage`/`-reply`/`-resolve` · `fix-from-coderabbit` · `pr-rebase-and-recover` · `pr-changelog` · `pr-merge`. Default: hand the whole lifecycle to `babysit-pr` and walk away; it escalates on the kill-switch conditions in `docs/guides/mastermind-pr-loop.md`, and `pr-merge` refusing on an open thread or missing spec ref is the gate working, not an obstacle. Two gotchas whichever route you take: **CodeRabbit threads resolve only via GraphQL** (REST cannot), and **0 registered checks reads as "pass"** — wait until the check count is plausible *and* nothing is pending, or you merge RED right after a rebase. Already fully green and you just need it in → `gh pr merge --squash`. `claudetm merge-pr <pr>` also drives CI-fix-and-merge but operates on the **current directory**, so at most one PR is in flight at a time: parallel *building* is fine, parallel *merging* is not.

10. **Leave the trail straight.** Update what your change invalidated — the spec if behavior moved, `docs/architecture/decisions-open.md` if you closed a `[DECISION NEEDED]`, `scripts/index.json` (`scripts/index-scripts`) if you touched `scripts/`, the glossary if you coined a term, `docs/architecture/cross-agent-flags.md` if several agents touched one file. A doc that lies costs the next session a full re-audit (step 2). When a defect could recur, land the mechanical guard in the same PR — a CI job, a `scripts/lint-scripts` rule, an auditor. That is where a house invariant becomes unbreakable.

## Hard rules (from CLAUDE.md — non-negotiable)

The 15 Laws bind every line; most-violated in practice: spec before code (2), a crate touches only what its spec declares (3), `cargo check --workspace` green before push (4), a Performance Contract table on every public API (5), `// SAFETY:` on every `unsafe` (6), SPDX header on every file (7), headless boot with no display or GPU (8), byte-identical deterministic replay (9), structured errors only (10), structured telemetry never `println!` (11), tests ship with the impl (12), every editor button = one agent RPC (13), extend don't fork — engine-core untouched without an ADR (15). **Never invent a performance number** → `[BENCHMARK NEEDED]`. Never edit `00-vision.md` or `01-principles.md` without an ADR. Never commit red. Never `git stash`. Never `--force`/`--no-verify`/`reset --hard` without permission; `force-with-lease` only via `pr-rebase-and-recover`.

## Output

Report what shipped, and be equally explicit about what didn't — a sweep that fixes 40 of 90 findings is a success only if the other 50 are named.

```
Root cause:  <the one-line mechanism, for a bug sweep>
Pipeline:    spec <path> → contract <path> → impl <crates> → tests <kinds>
Primitive:   <name> @ <path>  (PR #NNN, merged)          [sweeps only]
Fixed:       <n> findings across <m> PRs → #… #…   crates: <…>
Deferred:    <n> — <what, and why not now>               [never omit this line]
Falsified:   <doc/spec claims that were wrong, now corrected>
Gate:        fmt · clippy · check --workspace · nextest · deny · spdx · scripts  <ok>
Laws:        principle-keeper <clean>   rpc-parity <ok / n-a>   replay <byte-identical / n-a>
Guards:      <CI job / lint rule / auditor added, or none>
PR:          #NNN <merged>   CodeRabbit: <n threads resolved>
```
