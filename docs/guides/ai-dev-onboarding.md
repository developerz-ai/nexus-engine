<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# AI Dev Team Onboarding

> How an AI coding agent (or a small team of them) goes from cold start to merged PR on Nexus. The same process applies whether you are Claude, GPT, Gemini, or an open-weight model. The merge system does not care which model authored the PR — only whether the PR meets the bar.

---

## TL;DR (the only-thing-you-need-to-read version)

1. Read `docs/initial/vision.md`.
2. Read `docs/architecture/01-principles.md`.
3. Read the spec you intend to implement (`docs/specs/<area>/<file>.md`).
4. Read every contract that spec depends on (`docs/contracts/*.md`).
5. Read `docs/guides/pr-protocol.md`.
6. Write the failing test first.
7. Implement the minimum to make it pass.
8. Add bench if you touched a hot path.
9. Open the PR with a valid manifest.
10. Respond to `nexus-merge` findings until green.

Skip any step → S1 or S8 rejects you. There is no shortcut.

---

## Who This Is For

- Autonomous AI coding agents picking up issues from the queue.
- AI dev teams (multiple agents collaborating in roles: implementer, reviewer, integrator).
- AI agents driven by a human contributor as a force multiplier.
- Future agent kinds we don't yet know about.

If you are a human reading this — you can follow the same process; the merge system treats you identically. See `docs/guides/contribution.md` for human ergonomics on top.

---

## The Mental Model

Nexus is **spec-driven**. The spec is law. Code is the spec rendered into Rust. If the spec is wrong, you fix the spec first (separate PR). You never invent behavior the spec doesn't describe. You never leave the spec lying about what the code does.

Three artifacts always travel together:

```
   ┌───────────┐       ┌───────────┐       ┌───────────┐
   │   SPEC    │◄─────►│   TESTS   │◄─────►│   CODE    │
   └───────────┘       └───────────┘       └───────────┘
        ▲                   ▲                    ▲
        │                   │                    │
        └─── if any drifts from the others, your PR fails ───┘
```

This is the same invariant every reviewer at S8 will check. Internalize it before you touch a keyboard.

---

## The Read List (in order, every time)

You will be tempted to skim. Don't. The merge system can tell when you skipped step 3 — your PR will violate a contract you didn't read, S5 will fail you, you'll waste a review cycle.

| # | File | Why |
|---|---|---|
| 1 | `docs/initial/vision.md` | What Nexus is for. Frames every later decision. |
| 2 | `docs/architecture/01-principles.md` | The 12 binding laws. S8 reviewers cite these by section number. |
| 3 | `docs/architecture/02-system-map.md` | Where your work fits in the whole. Stops you from leaking responsibility into the wrong crate. |
| 4 | `docs/specs/<area>/<file>.md` | The spec you implement. **Read in full.** Not just the section you think you need. |
| 5 | `docs/contracts/*.md` | Every contract listed under "Depends on" in your spec. These are exact API shapes. |
| 6 | `docs/guides/pr-protocol.md` | The form your PR must take. |
| 7 | `docs/guides/merge-system.md` | Optional but recommended. Knowing how the pipeline judges you lets you self-check before submit. |
| 8 | `docs/prior-art/<engine-the-spec-cites>.md` | If your spec calls out a prior art doc. Often contains the "✗ pitfalls" that explain why your spec is shaped the way it is. |

Total read budget: ~15k–40k tokens depending on system. Smaller than your context window. Do not summarize away the constraints.

---

## The Workflow

```
read vision ──► read principles ──► claim issue ──► read spec ──► read contracts
                                                                       │
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ branch off main│
                                                              └────────┬───────┘
                                                                       │
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ write failing  │
                                                              │ test (RED)     │
                                                              └────────┬───────┘
                                                                       │
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ implement min  │
                                                              │ (GREEN)        │
                                                              └────────┬───────┘
                                                                       │
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ refactor; add  │
                                                              │ bench if hot   │
                                                              └────────┬───────┘
                                                                       │
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ self-check     │
                                                              │ (see §below)   │
                                                              └────────┬───────┘
                                                                       │
                                                                       ▼
                                                              ┌────────────────┐
                                                              │ open PR with   │
                                                              │ manifest       │
                                                              └────────┬───────┘
                                                                       │
                                                       ┌───────────────┴───────────────┐
                                                       ▼                               ▼
                                                  ┌─────────┐                    ┌─────────┐
                                                  │ green   │──► merged          │ findings│──► fix, push, repeat
                                                  └─────────┘                    └─────────┘
```

---

## Claiming an Issue

Issues live in the repo's tracker, labelled by area and `good-first-agent-task` for onboarding. To claim:

```
gh issue comment <id> --body "@nexus-merge claim agent=<your-id> team=<team>"
```

The merge system assigns you, sets a 48h soft deadline (renewable), and prevents double-assignment. If you don't push a draft PR within 48h, the claim auto-releases.

You may also work without an issue (spec gap you noticed, perf improvement you spotted). The PR-protocol manifest still requires a `spec_ref`; if the spec doesn't cover what you're doing, open a spec PR first.

---

## Reading the Spec (the part agents most often skip)

When you open `docs/specs/<area>/<file>.md`, read sections in this order:

1. **Boundaries** — first paragraph. Tells you what you cannot touch.
2. **Public API** — the exact symbols. Memorize them; do not invent variants.
3. **Performance Contract** — the table at the top. Your bench must beat the soft limit and never approach the hard limit.
4. **Error Contract** — every error you can return is listed. If you need a new one, add it to the table in the same PR.
5. **Integration Points** — pointers to other systems. Open each linked contract.
6. **Test Requirements** — the scenarios you must pass. Often there are bench scenarios listed by ID — those drive your S6/S7 work.
7. **Prior Art** — the ✗ entries. They are warnings.
8. **Open Questions** — if your work touches one of these, you cannot just "decide". Open an ADR.

If after reading you have a question that the spec doesn't answer — that's an `[DECISION NEEDED]` you discovered. Open an issue with that label; don't guess.

---

## Tests First — Operationally

You will write the test before the implementation. Not because of dogma; because of the merge system. S1 enforces commit ordering (→ `docs/guides/pr-protocol.md` §Tests-First Rule).

The cheapest legal commit sequence:

```
# 1
git checkout -b feat/renderer-cascade-bias
$EDITOR crates/nexus-renderer/tests/shadows_cascade_split.rs
cargo test -p nexus-renderer cascade_split   # RED, expected
git add -A && git commit -m "test(renderer): cascade split bias regression case"

# 2
$EDITOR crates/nexus-renderer/src/shadows.rs
cargo test -p nexus-renderer cascade_split   # GREEN
git add -A && git commit -m "feat(renderer): correct cascade split bias in NDC"

# 3 (if hot path)
$EDITOR crates/nexus-renderer/benches/shadows.rs
cargo bench -p nexus-renderer -- cascade_split
git add -A && git commit -m "perf(renderer): bench for cascade split path"
```

The first commit must show RED→GREEN. If `cargo test` was already passing when you added the test, the test is not testing what the spec requires — rewrite it.

---

## Self-Check Before You Submit

Run this checklist against your branch. It's the same set of checks `nexus-merge` will run; failing locally is free, failing in the queue costs throughput.

```
# build (S2)
cargo check --workspace --all-targets --all-features

# static (S3)
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo deny check
# unsafe audit: every `unsafe` block has a // SAFETY: comment + ADR link

# test (S4)
cargo nextest run --workspace --all-features
cargo test --doc

# contracts (S5)
cargo public-api --diff-git-checkouts main HEAD
# every diffed item must match an edit under docs/contracts/

# scenarios (S6) — only if your manifest declares any
nexus agent scenario run --all --diff-hashes

# perf (S7) — only if a hot crate is touched
cargo bench -p <crate> -- --save-baseline pr
# compare with target/perf-baseline/ — must respect thresholds
```

If all of the above pass, your S1–S7 verdict is predictable. S8 is the only stage you can't fully predict; minimize surface by following the principles document literally.

---

## Multi-Agent Teams

You may operate in a team. Common shapes:

| Team shape | Roles | When to use |
|---|---|---|
| Solo agent | `implementer` | small `fix:` / `perf:` / `refactor:` |
| Pair | `implementer` + `reviewer` | normal `feat:` work |
| Triple | `implementer` + `reviewer` + `integrator` | cross-crate `feat:` |
| Squad | + `fixer` + `spec-author` | new subsystem |

`reviewer` agents review the diff before submit and are listed in `agent.reviewed_by`. They catch the cheap principle violations so you don't waste S8 cycles. Manifest enforces minimums:

| risk | min `reviewed_by` |
|---|---|
| `low` | 1 |
| `med` | 2 |
| `high` | 3 |

A reviewer that LGTM'd a PR that S8 then blocks loses reviewer reputation; persistent reviewer-vs-S8 drift gets the reviewer down-weighted by the merge system. Reputation is published in the audit log.

---

## The Loop with `nexus-merge`

Your PR opens. Within ~5 minutes, the system either greens the early stages or comments on the first failure. Read the comment **literally** — it tells you exactly which file, line, principle, and suggested fix. Push a new commit; the pipeline re-runs from the failed stage forward.

Patterns that waste cycles:

- Pushing "let's see if it works now" without re-running the local self-check. Costs minutes per attempt at S2; minutes turn into hours after three rounds.
- Re-litigating a finding without new evidence. The reviewer agent will recite the same principle. Either provide a counter-spec, an ADR proposal, or fix it.
- Ignoring `infra_error` comments — those are not your fault, but please report once via `@nexus-merge infra-error` so integration team can investigate. Don't keep pushing the same commit.

Patterns that compress cycles:

- Address every comment in one push. Don't drip-fix.
- Use `@nexus-merge explain <stage>` to ask for a deeper rationale on any finding. The system will quote the cited principle or contract section.
- When stuck, downgrade the PR's scope and split. Two small PRs through the pipeline beat one big PR stuck in revisions.

---

## Working on a Spec (not code)

Sometimes the bottleneck is the spec, not the code. Pure spec PRs follow the same protocol with `change_type: docs` and a relaxed minimum (no tests, no bench). But spec PRs go through S8 with extra weight — the `principles` and `contracts` reviewers read every word and challenge ambiguous claims. A good spec PR:

- Cites the prior art it borrows from (✓ and ✗).
- Includes performance numbers as targets, not guesses (or `[BENCHMARK NEEDED]`).
- Marks `[DECISION NEEDED]` for anything not yet decided.
- Updates `docs/contracts/` in the same PR if the spec implies a new interface.
- Touches one spec at a time.

After a spec PR merges, the corresponding implementation PR can claim it via `spec_ref`. You may be the same agent on both.

---

## When You're Stuck

Stuck = pushed three iterations, still blocked, still not converging.

1. Re-read the spec section. The constraint you missed is almost always there.
2. Re-read the cited principle. The reviewer's wording is verbatim from the principles doc.
3. Open the prior-art file linked from the spec. The "✗" entries are why the constraint exists.
4. If still stuck: comment `@nexus-merge escalate stuck` on the PR. An integration-team agent (→ `docs/guides/integration-team.md`) will triage within one business day and either pair, redirect, or open an ADR.

Do not silently abandon a PR. The claim system will free the issue, but the PR stays in the queue as a teaching example unless you close it explicitly.

---

## Reputation, Not Authority

The merge system maintains a per-agent reputation score derived from the audit log:

- + first-submit pass rate
- + low rework cycles
- + bench improvements landed
- − reverted commits (within 14 days of merge)
- − overturned reviewer LGTMs (your review was wrong)
- − escalations resolved against you

Reputation does **not** grant override. It influences:

- Whether you can pick `risk: high` issues solo.
- Whether your reviews count toward higher risk tiers.
- Display order in the contributors list.

A new agent starts at neutral and earns up. There is no "trusted committer" bypass. The pipeline is the same for everyone.

---

## What "Done" Looks Like

You picked an issue. You wrote tests first. You implemented to spec. You added a bench. You submitted a valid PR. The system greened every stage. The queue merged you. Your name (or your team's name) is in the audit record forever, with a signed JSON receipt of every check that passed. You closed the issue. Total wall-clock: usually <2 hours for a small `fix:`, half a day for a `feat:`.

Now pick the next issue.

---

## Prior Art

- ✓ **TDD (Kent Beck)** — red/green/refactor; embedded as the commit-ordering rule.
- ✓ **bevyengine/bevy contributing guide** — "small PRs, often" cadence; we adopt and enforce it.
- ✓ **rust-lang RFC process** — spec-before-code; we adapt the ADR flow under `docs/architecture/05-adr/`.
- ✓ **Anthropic Claude Code review** — `CLAUDE.md` per-repo tuning informs how `docs/guides/*` tunes our reviewers (→ `code.claude.com/docs/en/code-review`).
- ✗ **"Move fast, break main"** — incompatible with always-green main; the merge queue makes it unnecessary.
- ✗ **Single-maintainer LGTM** — bottleneck removed by S8.

---

## Open Questions

- `[DECISION NEEDED]` Agent identity registry shape and rotation policy.
- `[DECISION NEEDED]` Reputation publishing format and PII handling for human contributors.
- `[BENCHMARK NEEDED]` Real onboarding time-to-first-merge per agent model.
