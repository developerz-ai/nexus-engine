---
description: End-to-end feature/bug-sweep workflow for Nexus Engine — understand, distrust the docs, explore in parallel, slice by crate, build with a hive of subagents in this ONE checkout (never worktrees), gate green, then hand the PR to the babysit-pr skills. Reads intent from the prompt.
argument-hint: <what you want built or fixed, plain language> [+ spec path or reference URL(s)]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Task, SendMessage, TaskCreate, TaskUpdate, TaskList, Skill, WebFetch
---

# /feature

You are the **mastermind** on Nexus Engine — AI-first, cross-platform, MIT-forever game engine. `CLAUDE.md` is the contract; `docs/architecture/01-principles.md` holds the 15 Laws. A PR that violates a law is rejected by `nexus-merge` without human review.

**Done means merged and green — nothing less counts.** The arc is yours end to end: understand → distrust the paperwork → explore → slice by crate → build → gate green → PR → CodeRabbit answered → **merged** → docs/indexes left true. A green `cargo check` is not done. An open PR is not done. A PR with three unresolved CodeRabbit threads is not done. Carry it to the end, and when you report, say which of those you actually verified rather than which you assume happened. The engine does not deploy — there is no prod surface behind this repo — so the arc ends at **merged**, plus `scripts/release-engine` when the change is a release.

## Request
$ARGUMENTS

**The prompt is the context — read the intent.** How autonomous to be, how big the scope, whether to confirm before merging: infer it from the words. "Do full work" / "just ship it" → run start-to-finish, decide everything yourself, merge on green, no check-ins — surface the decisions in the PR body instead of asking. A tentative or exploratory ask → clarify what is genuinely ambiguous and let the user review before you merge. Use judgment; don't make the user configure you. The flow below is a map, not a checklist to recite — skip what doesn't apply, and always stop for a true blocker: an engine-core change with no ADR (Law 15), a change that edits `00-vision.md` or `01-principles.md`, a law violation the user is asking you to commit, or an external dep you cannot satisfy.

**Pick the PR mode before you brief anyone.** It changes the commit step, not the build discipline:
- **Slice-per-PR** (default) — one crate or one concern per PR, merged one at a time. Best when slices ship independently, and it matches Law 3: a crate touches only what its spec declares.
- **One fat PR** ("do it in 1 PR") — the user's call, legitimate for a coherent sweep. Path-disjointness still governs the *build* (it is how parallel agents avoid clobbering each other), it just no longer governs the *commit*. One branch, one gate, one merge, and the PR body must carry the finding-by-finding ledger the separate PRs would have.

**Cap a PR at ~110–120 files.** Past that it stops being reviewable and starts losing the checks that catch things:

- **CodeRabbit refuses outright above 150 changed files** ("Review skipped: 278 files exceed the limit of 150") — and CodeRabbit here is configured `assertive` with `request_changes_workflow: true` and path-instructions that enforce the 15 Laws. Blowing the cap means the biggest, riskiest PR gets the *least* law enforcement. Exactly backwards.
- A human reviewer cannot hold 279 files either. Approval becomes a formality, which is the same as no review.
- One red CI job blocks everything. Seven jobs run per PR (fmt, clippy, check, test, deny, scripts test/lint, SPDX); a 279-file PR that trips `docs-spdx` on two files holds ~90 fixes hostage.
- Bisecting a later determinism or perf regression lands on one enormous commit instead of one crate.

When a sweep exceeds the cap, split it even if the user asked for one PR — and say why. Slice along the boundaries you already built for the agents: the file sets were disjoint by construction, so each becomes a PR for free. Land the shared thing first — a `docs/contracts/<a>-<b>.md`, a `nexus-core` type, a `crates/nexus-hal` trait — then the consumers.

## The Four-Stage Pipeline still governs (NEVER skip a stage)

`spec → contract → impl → test`. It is not optional and it is not something the hive gets to route around:

1. **Spec.** New behavior with no spec → `spec-author` writes `docs/specs/<system>/<file>.md` first (`docs/guides/spec-format.md`). Law 2: every PR cites a `docs/specs/**` or `docs/contracts/**` path.
2. **Contract.** Crosses a system boundary → `contract-author` writes `docs/contracts/<a>-<b>.md` first. This is the one stage you must *serialize* — impl agents read the contract, so it has to exist before they launch.
3. **Impl.** The domain specialist for that crate (routing tables in `CLAUDE.md`).
4. **Test.** `test-author` adds unit + integration + scenario + property + visual per `docs/guides/testing/coverage.md`. Law 12.

## Work as a hive mind, in one checkout

**You decide whether to hive at all — it is a judgement call, not a ritual.** Two things reliably justify it: **searching** (a broad sweep across specs and crates where you only want the conclusions, not the file dumps) and **scale** (enough independent, crate-separable work that serialising it would take hours). Everything else should not hive. A single-file fix, one clippy failure with one obvious home, a spec typo — do it yourself. Fanning out three subagents onto a two-file change costs more in briefing, collision management and report-reading than the change is worth, and you pay that cost in the one context that has to survive to the merge. `CLAUDE.md`'s "default: dispatch many subagents at once" is about *independent* work; it is not a licence to fan out onto work that isn't.

When you do hive: a big task is not one agent doing more; it is a **team sharing one working tree**, with you as the coordinator. **Never use git worktrees** — no `isolation: worktree`, no per-agent directories, no clones, ever. In this repo the cost is brutal and concrete: each worktree needs its own `target/` (tens of GB and a cold rebuild of the whole wgpu/rapier/tokio dep graph), its own `bun install`, and half-finished work becomes invisible to the final `cargo check --workspace` — which is precisely the check Law 4 exists to make meaningful. One checkout, many hands, and **the file set is the only lock**.

What makes the hive work:

- **You coordinate; you do not code.** You own git, the ledger, and the merge. You are the only participant who must survive to the end, so spend your context on routing and judgment — not on reading files an agent will report back to you. If you find yourself editing crate source, you have taken a slice away from someone who had room for it.
- **The file set is the lock.** Every brief names that agent's exclusive paths *and* the paths every other live agent holds. An agent that needs a file it does not own must **stop and report the collision** — never edit across the line, never negotiate peer-to-peer. You mediate: hand the change to the owner, or re-cut the boundary. Crate boundaries make this easy here; use them (`crates/nexus-physics/**` is one lock, `crates/genres/fps/**` is another).
- **Agents are long-lived teammates, not one-shot jobs.** New work in an area someone already holds goes to them via `SendMessage` — they keep their context, their reasoning, and their file lock. Spawning a second `renderer-engineer` onto `crates/nexus-renderer/**` is how you get two writers and a lost fix.
- **Work in waves, and let each wave re-task the next.** Explore → spec/contract → impl → test → assemble. Wave 1's findings decide wave 2's slices. Do not plan wave 3 in detail before wave 1 reports; it will be wrong. After a parallel batch, dispatch `integration-resolver` to reconcile `[AGENT: XX]` cross-refs — that is a wave of its own, not an afterthought.
- **Keep the ledger visible.** `TaskCreate`/`TaskUpdate` per slice, so progress and ownership survive a context handoff and the user can see the shape of the run without asking.
- **Expect the hive to contradict you.** Briefs built from a doc sweep contain claims the code disproves — this repo's docs are ahead of its code in places and behind it in others. A good agent reports "your premise H1 is false, here is the line." Drop the premise. Findings that survive several agents reading independently are the ones worth shipping.

**Route to the real roster, don't improvise one.** `CLAUDE.md` carries the full routing tables — architecture/spec authoring, one domain specialist per spec subtree (core, renderer, physics, audio, networking, scripting, assets, agent API, editor), the genre agents that own `crates/genres/<g>`, quality & process (`code-reviewer`, `security-reviewer`, `test-author`, `perf-engineer`, `fuzz-engineer`, `coverage-auditor`, `principle-keeper`), and meta (`orchestrator`, `integration-resolver`). Pick the agent whose charter already names the crate you are slicing; a named specialist arrives knowing the constraints you would otherwise have to write into the brief. `ts-script-author` owns `scripts/**` — a Bun/TS slice is never a Rust engineer's job.

### Who runs which checks

**Cargo takes an exclusive lock on `target/`.** Two agents running `cargo check`/`clippy`/`nextest` at the same moment do not run in parallel — the second one prints `Blocking waiting for file lock on build directory` and stalls until the first finishes. So a hive that lets every agent run a workspace-wide build converts your parallelism into a queue, at full-rebuild prices. **Never let an agent run anything `--workspace`.** `-p <crate>` is the whole discipline: it reuses the shared `target/` incrementally and finishes in seconds.

| | Agent (per iteration) | Coordinator (once, at the end) |
|---|---|---|
| format | `cargo fmt -p <its crate>` | `cargo fmt --all -- --check` |
| lint | `cargo clippy -p <its crate> --all-targets -- -D warnings` | `cargo clippy --workspace --all-targets -- -D warnings` |
| build | `cargo check -p <its crate> --all-targets` | `cargo check --workspace --all-targets` (Law 4) |
| tests | `cargo nextest run -p <its crate>` — its own crate, never the workspace | `cargo nextest run --workspace --profile ci` |
| scripts (`scripts/**`) | `bun test <its own test files>` + `bun x biome check <files it edited>`, from `scripts/` | `cd scripts && bun test && bun x biome check .` |
| everything | — | `bun run check` (fmt · clippy · biome · ruff · shellcheck · deny), in the **background** |

An agent owns *its own crate and its own tests*; whole-workspace green is the coordinator's job and nobody else's. Run the full gate **once**, at the end, in the **background** — it compiles the workspace and a foreground call looks hung. Two extra gates are easy to forget and both are hard CI failures: **`cargo deny check`** (supply chain) and the **SPDX header sweep** — every new file under `crates/`, `scripts/`, `docs/`, `.github/` needs an `SPDX-License-Identifier:` line in its first 15 lines, and agents that create files forget it constantly. Sweep for it before you commit rather than learning it from `docs / spdx` going red. Touched WGSL? `naga validate`. Touched Python? `ruff check .`.

### Two things only the coordinator can do

- **Every slice you NAME, you must dispatch.** Briefs tell each agent which other agents are live on which paths — so if you name a slice and never launch it, agents dutifully defer work to a teammate who does not exist, and the work vanishes. Keep the roster and the dispatched set as **one list**, and reconcile them before you start reading reports. A brief that says "`nexus-net` is owned by the transport agent" when you never spawned one is how six items get silently orphaned.
- **Reserve an "unowned" bucket, and expect to fill it mid-run.** The real fix often lands where no slice reaches: the workspace `Cargo.toml`, `Nexus.toml`, a `docs/contracts/**` file both sides read, `scripts/index.json`, a top-level docs index, `.github/workflows/ci.yml`. A homeless finding is the one most likely to be quietly dropped — when a report says "the real fix is outside my set", **assign it immediately** rather than filing it. Shared roots are yours by default: never let two agents edit the workspace `Cargo.toml`.
- **Look for causal chains across reports.** Individual agents see their own crate; only you see all of them. Findings compound — a determinism failure in `nexus-physics` and a replay divergence in `nexus-agent` are routinely one bug wearing two hats, and neither agent could have seen it. After the reports land, spend one pass asking "does A explain B?" It changes what you fix and what you can drop.

## The flow

1. **Understand.** Restate the goal in a line. Find the governing spec — every PR cites a `docs/specs/**` or `docs/contracts/**` path (Law 2). If the ask cites URLs (prior art, an engine's approach), `WebFetch` them and extract the *mechanism*, then translate it onto our stack: ECS in `nexus-core`, wgpu in `nexus-renderer`, rapier with `enhanced-determinism` in `nexus-physics`, quinn in `nexus-net`, the Rune/Lua VMs in `nexus-script`. `docs/prior-art/` may already hold the synthesis.

2. **Distrust the paperwork.** This repo is docs-first and its docs *rot in both directions*. Before planning work off a spec, an integration report, or an open-decisions list, **check it against the code and the git log**. Concretely: `CLAUDE.md`'s bootstrap section still says "engine source does not exist yet — the next session is still docs-driven", while `crates/` holds 16 members and ~70 `.rs` files, plus four `games/*` and two `tools/*`. Treat every such claim as a hypothesis. Merged PR titles (`git log --oneline`) are the cheapest ground truth. State plainly which claims you falsified, so nobody re-implements shipped work or "fixes" working code — and fix the doc in the same PR.

3. **Get evidence before you theorise.** There is no production behind this repo, so evidence means the local build and CI, not logs. All cheap, all read-only:
   - `cargo nextest run -p <crate> <filter>` — reproduce the failure before you explain it.
   - `gh run view <id> --log-failed` / `gh pr checks <pr>` — the actual failing job and line, not your guess about it. The junit report is uploaded as `nextest-junit-<run_id>` and lands at `logs/test/nextest-junit.xml`.
   - `git log -S'<symbol>' --oneline` — when did this change, and in which PR.
   - `cargo tree -i <crate>` for a dependency surprise; `scripts/bench` + `docs/architecture/benchmarks-pending.md` before any claim about speed. **Never invent a performance number** — unknown target → write `[BENCHMARK NEEDED]` (Forbidden Behaviors).
   A finding with a reproducing test outranks one derived from reading alone. Rank accordingly.

4. **Explore (parallel).** Fan out `Agent` explore/specialist agents to map every affected crate, its spec and contracts, the patterns to mirror (`file:line`), the tests, and the constraints. Give each a **disjoint** area so their reports don't overlap, and require of every finding: severity, `file:line`, a one-sentence defect statement, and a **concrete failure scenario** (inputs → wrong outcome). Demand two more things explicitly — the doc claims they **falsified**, and the premises in your brief that turned out **true** (so you neither re-fix working code nor re-verify settled ground). Produce a ranked worklist; log what the survey could not cover.

   **Protect your own context.** You are the only one who must survive to the merge. Do not read what an agent will report; do not re-derive a conclusion you already have. One thorough agent beats three shallow ones plus your own reading.

5. **Fold in live user reports as first-class findings.** Mid-run, the user may paste a panic backtrace, a failing CI link, a scenario replay divergence, or a CodeRabbit thread. These are *confirmed* — they outrank the sweep's own read-only findings, and several of the most valuable defects in a run arrive this way rather than from the audit. Reproduce, root-cause, rank above equal-severity read-only findings. If an in-flight agent already owns those files, extend its brief with `SendMessage` rather than spawning a second agent onto the same paths.

6. **Track in GitHub issues.** This repo has no external tracker — issues and the PR body are the record. **Search before you create**: `gh issue list --search "<area>"` including recently closed, because a closed issue may already have decided the thing you are about to re-decide. Reference existing issues rather than duplicating them. Unresolved decisions belong in `docs/architecture/decisions-open.md` (`[DECISION NEEDED]`) and missing numbers in `docs/architecture/benchmarks-pending.md` (`[BENCHMARK NEEDED]`) — that is where `decision-log-keeper` and `benchmark-coordinator` sweep. For a defect wave, `scripts/triage-issues` already clusters.

7. **Build — branch first, then fan out.** Before a single agent starts, get off `main`:

   ```bash
   git fetch origin && git status --short   # expect a clean tree
   git checkout -b <type>/<slug>            # fix/ feat/ test/ refactor/ docs/ spec/
   ```
   Do it now, while the tree is clean and the branch is free. Nobody should ever write into `main`, and by commit time the tree is dirty enough that you will not want to think about branches. (`branch-conventions` skill has the naming/base/draft policy.)

   Then fix the slice boundaries **before launching anyone**, and give each agent a file set **disjoint from every other agent's**. Two agents that must edit one file are one slice, not two — combining them is honest; splitting them invents a boundary that doesn't exist. For a multi-crate sweep, never convert N crates N ways: land one reusable primitive **first** — the contract file, the `nexus-core` type, the `nexus-hal` trait — then every crate adopts it.

   Every agent brief must carry all nine of these. Omitting any one is how a run goes wrong:
   - **its exclusive file set** (name the crate paths), and an instruction never to edit outside it — especially not the workspace `Cargo.toml`;
   - **which other agents are live and on which paths**, so a collision is *reported*, not silently resolved;
   - each finding with `file:line`, the defect, and the concrete failure scenario — plus **permission to drop any finding the code contradicts** (that is the agent working correctly);
   - **evidence first, diagnosis second.** Give the symptom, the failing test, the CI line — *then* your hypothesis, explicitly labelled **unverified**, and ask the agent to confirm or kill it *before* building. Briefs that lead with a confident root cause send agents to investigate the wrong file, and a confidently-stated wrong hypothesis is expensive to abandon;
   - **the governing spec/contract path** it must implement against, and the house constraints binding its area: structured errors only (no `anyhow!("…")`, no string-only errors — Law 10), no `println!`/`eprintln!` outside `examples/` and `tests/` (Law 11), `unsafe` is `forbid` at the workspace root and needs a `// SAFETY:` paragraph plus an ADR to relax (Law 6), SPDX header on every new file (Law 7), a Performance Contract table on every public API (Law 5), headless boot (Law 8), deterministic replay (Law 9), and a crate touches only what its spec declares (Law 3);
   - **tests ship with the code, failure case first** — for a bug, a test that fails before the fix (Law 12);
   - **checks narrowed to its own crate** — `-p <crate>`, never `--workspace`; see §Who runs which checks for why;
   - **no git operations at all** — no branch, commit, checkout, or stash. The coordinator owns all git; work is left uncommitted in the tree;
   - **never tell an agent to "ask me" — it cannot.** A subagent has no channel to the user, so a question is a dead end: it blocks or it guesses. Give it the two legal moves instead: **decide and flag** (act on the most defensible reading, state the assumption in its report, mark the artifact so you can overwrite it) or **stop and report** with the evidence when proceeding either way would be unsafe or wasted. Then *you* take the question to the user and re-task the agent with `SendMessage`, which resumes it with its full context.

   Small feature → one agent, skip the fan-out entirely.

8. **Verify.** Run the coordinator column above, once, in the **background**. Green means: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo check --workspace --all-targets` (Law 4), `cargo nextest run --workspace --profile ci`, `cargo deny check`, `scripts/` bun test + biome, SPDX sweep clean. Editor surface touched → `scripts/check-rpc-parity` (Law 13). Behavior change → the scenario runs (`scripts/scenario`) and the replay is byte-identical for the same seed (Law 9). Then dispatch `principle-keeper` over the diff against the 15 Laws, and `code-reviewer` + `security-reviewer` in parallel, **before** you open anything — it is far cheaper than learning it from CodeRabbit.

9. **Commit & merge.** Let every agent finish, then plain git. Do not commit while agents are still writing — that is the only thing that ever makes this complicated.

   **First, sweep the agents' leftovers**: scratch `.rs` probes at the repo root, debug `println!` (a Law 11 violation and a CI failure), a stray `test.ts`, files missing SPDX headers. Agents create them and rarely clean up. They must not ship.

   ```bash
   git fetch origin                        # did main move? if so, see below
   git add <the paths for this slice>      # never -A; name the paths
   git status --short                      # then READ it
   git commit && git push -u origin HEAD
   ```
   Commit message: `<system>: <imperative>`, 50/72, Conventional Commits for the PR title. Naming paths on `git add` is all the selectivity you need — **no `git stash`** (one global stack shared with every concurrent agent; you will pull in someone else's work). For slice-per-PR, repeat one slice at a time, re-`git fetch`ing after each merge.

   **Main moves under you.** Before each build, `git fetch` and intersect *files changed on main* with *files changed locally*. A real overlap must be **three-way merged** (`git merge-file -p ours base theirs`), never taken wholesale — a naive tree build drops main's lines silently, with no conflict marker. Verify both sides' symbols survive.

   **Then hand the PR lifecycle to the skills — don't reinvent them.** `.claude/skills/` already owns this end:

   | Need | Skill |
   |---|---|
   | branch name / base / draft policy | `branch-conventions` |
   | open the PR (CC title, spec ref in body, scenario list, bench deltas) | `open-pr` |
   | drive PR → merge, unattended | `babysit-pr` |
   | wait on CI / CodeRabbit | `wait-for-ci` · `wait-for-coderabbit` |
   | triage, reply, resolve, fix review threads | `coderabbit-triage` · `coderabbit-reply` · `coderabbit-resolve` · `fix-from-coderabbit` · `respond-to-cr-commands` |
   | rebase recovery, changelog, merge | `pr-rebase-and-recover` · `pr-changelog` · `pr-merge` |

   Default: hand the whole lifecycle to `babysit-pr` and walk away; it escalates on the kill-switch conditions in `docs/guides/mastermind-pr-loop.md`. `pr-merge` refuses on any open thread or a missing spec ref — that is the gate working, not an obstacle. Two gotchas whichever route you take: **CodeRabbit threads can only be resolved via GraphQL** (REST cannot), and **0 registered checks reads as "pass"** — wait until the check count is plausible *and* nothing is pending, or you merge RED right after a rebase. If everything is already green and you just need it in, `gh pr merge --squash` is fine; `claudetm merge-pr <pr>` also drives CI-fix-and-merge but operates on the **current directory**, so at most one PR is in flight at a time. Parallel *building* is fine; parallel *merging* is not.

10. **Leave the trail straight.** Update what your change invalidated: the spec if behavior moved, `docs/architecture/decisions-open.md` if you closed a `[DECISION NEEDED]`, `scripts/index.json` (`scripts/index-scripts`) if you touched `scripts/`, the glossary if you coined a term, `docs/architecture/cross-agent-flags.md` if several agents touched one file. A doc that lies costs the next session a full re-audit (see step 2). When a defect could recur, land the mechanical guard in the same PR — a CI job, a `scripts/lint-scripts` rule, an auditor — because that is where a house invariant becomes unbreakable.

## Hard rules (from CLAUDE.md — non-negotiable)

The 15 Laws bind every line. Most-violated in practice: spec before code (2); a crate touches only what its spec declares (3); `cargo check --workspace` green before push (4); a Performance Contract table on every public API (5); `// SAFETY:` on every `unsafe`, which is `forbid` at the root (6); SPDX header on every file (7); headless boot, no display, no GPU (8); byte-identical deterministic replay (9); structured errors only — never `anyhow::anyhow!("…")` or a string-only error in shipped code (10); structured telemetry, never `println!`/`eprintln!` outside `examples/`/`tests/` (11); tests ship with the impl (12); every editor button = one agent RPC (13); extend, don't fork — engine-core untouched without an ADR (15). **Never invent a performance number** — write `[BENCHMARK NEEDED]`. Never edit `docs/architecture/00-vision.md` or `01-principles.md` without an ADR. Never commit red. Never `git stash` (shared global stack). Never `--force`/`--no-verify`/`reset --hard` without permission; `force-with-lease` only via `pr-rebase-and-recover`.

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
