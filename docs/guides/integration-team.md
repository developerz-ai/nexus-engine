<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Integration Team — Charter

> The integration team is the always-on AI dev team responsible for the health of `main`. They don't ship features. They make sure features ship. Their north star: **`main` is always green, every demo game always runs, every cross-system test always passes, every perf benchmark stays inside its budget.**

---

## Boundaries

- **Owns:** `main` health, cross-system regression detection, perf baseline curation, flaky-test quarantine, demo-games CI, release-train scheduling, merge-system policy stewardship.
- **Does NOT own:** feature implementation (→ specialized AI dev teams), spec authoring (→ architects), the merge system's pipeline code (→ `docs/guides/merge-system.md`; but they propose policy bundle changes).
- **Depends on:**
  - `docs/guides/merge-system.md` — they consume audit logs.
  - `docs/guides/pr-protocol.md` — they enforce the bar.
  - `docs/specs/agent/scenarios.md` — they curate the scenario corpus.
  - `docs/games/*.md` — they run every demo game every hour.

---

## Why This Team Exists

A merge system can block bad PRs from entering `main`. It cannot, by itself:

- Detect when two PRs each green-on-rebase combine to break a demo game.
- Notice that a perf baseline has drifted 10% over 50 PRs because each one was within the +0.2% per-PR limit.
- Decide whether a newly-flaky test is the test's fault or the code's.
- Curate the scenario corpus as the engine grows.
- Schedule releases.

That's the integration team. AI agents, in standing rotations, with explicit charter. **They are not human maintainers in a costume** — they execute machine-readable checklists and file machine-readable reports. Their actions are auditable through the same log the merge system uses.

---

## The Four Promises

```
                ┌──────────────────────────────────────────────┐
                │  ALWAYS-GREEN MAIN                           │
                │  every commit on main passes the full suite  │
                │  on every supported platform, all the time   │
                └──────────────────────────────────────────────┘
                ┌──────────────────────────────────────────────┐
                │  DEMO GAMES ALWAYS RUN                       │
                │  nexus-fps, nexus-rpg, nexus-rts, nexus-plat │
                │  boot, play 5 min, exit clean — every hour   │
                └──────────────────────────────────────────────┘
                ┌──────────────────────────────────────────────┐
                │  CROSS-SYSTEM TESTS ALWAYS PASS              │
                │  the corpus that catches what unit tests     │
                │  miss — physics × renderer, net × scripting  │
                └──────────────────────────────────────────────┘
                ┌──────────────────────────────────────────────┐
                │  PERF BENCHMARKS STAY IN BUDGET              │
                │  no slow drift; quarterly hardware re-base   │
                └──────────────────────────────────────────────┘
```

A broken promise pages the on-call integration agent within 60 s and freezes the merge queue if the breakage is on `main` (not just a PR).

---

## Charter Rules

1. **`main` is sacred.** It is built every commit, on every tier-1 platform, with `--all-features`. A red `main` is the team's only P0. Drop everything; fix forward or revert.
2. **Revert beats fix-forward when the cause is unknown.** `nexus merge revert <sha>` returns `main` to green in under 5 minutes. The post-mortem follows; the user's afternoon does not get ruined.
3. **Flaky ≠ broken, but flaky is still broken.** Three cross-PR failures in 24h → auto-quarantine, P1 issue filed, assigned to integration. Quarantine ceiling: 1% of total tests. Above ceiling → freeze feature merges until cleared.
4. **Perf baselines are versioned data.** They live in `target/perf-baseline/` (committed). Updated only by merge queue success (S7 `improvement`) or by integration team via the quarterly re-baseline ritual.
5. **Demo games are the truth.** A passing unit suite with a broken demo means the unit suite is incomplete. File the missing test as part of the demo-game-fix PR.
6. **Cross-system tests are owned here, not by individual feature teams.** Feature teams contribute scenarios; integration curates and de-duplicates.
7. **No silent suppression.** Every `#[ignore]`, every `quarantine.toml` entry, every waived bench has an issue number and an owner.
8. **Policy stewardship.** Integration proposes (not dictates) changes to the merge-system policy bundle when the audit log shows systemic issues. Policy PRs follow the same pipeline as code (dogfood).

---

## Rotation Model

Integration is staffed by **N standing agents** (target: 4 at v0.1, 8 at v1.0, 16 at v2.0) in 24h rotations. Each rotation has:

| Role | Count | Responsibility |
|---|---|---|
| On-call | 1 | first responder to `main` red, demo-game red, queue stuck |
| Triage | 1 | new issues, flaky quarantine, audit-log queries |
| Perf | 1 | baseline curation, regression deep-dives |
| Backup | rest | rolling reviewers for cross-team PRs |

Rotation handoff is a machine-readable handoff doc (`audit/rotations/<date>.json`) listing open incidents, quarantined tests, perf trends, and any policy proposals in flight. No knowledge lives only in a private agent context.

---

## Always-Green Main (operational definition)

```
A commit C on main is "green" iff:
  for each platform P in {linux-x86_64, win-x86_64, mac-aarch64, wasm32}:
    cargo check     (P, C)  = ok
    cargo nextest   (P, C)  = ok
    cargo test --doc(P, C)  = ok
  AND
  for each demo D in {nexus-fps, nexus-rpg, nexus-rts, nexus-platformer}:
    nexus headless run D --scenario smoke --timeout 5m  = ok
  AND
  for each contract K in docs/contracts/*.md:
    cargo public-api --diff K..C = empty OR matches K's documented diff
```

A green check is recomputed every commit. A break → on-call paged → policy:

| Time since red | Action |
|---|---|
| 0–5 min | on-call investigates; auto-revert if no fix in flight |
| 5–15 min | merge queue **frozen** for incoming PRs (in-flight may complete) |
| 15–30 min | escalate to architect council if cause unclear |
| > 30 min | freeze becomes hard freeze; nothing merges; post-mortem starts in parallel |

[BENCHMARK NEEDED] — escalation timing once we have v0.1 incident data.

---

## Demo Games Always Run

The demo games (→ `docs/games/*.md`) are the integration test suite. They are built, run headless, and instrumented every hour, against current `main`:

| Demo | Scenario(s) | Hard time budget | What it exercises |
|---|---|---|---|
| nexus-fps | `smoke`, `2v2-bot-match` | 5 min, 10 min | core+renderer+physics+audio+input |
| nexus-rpg | `smoke`, `tutorial-finish` | 5 min, 20 min | core+renderer+scripting+assets+ai |
| nexus-rts | `smoke`, `100-unit-skirmish` | 5 min, 15 min | core+jobs+pathfinding+networking |
| nexus-platformer | `smoke`, `10-level-speedrun` | 5 min, 12 min | core+renderer+physics determinism |

`smoke` = boot, load main menu, start a level, walk 30 s, exit clean.

The runs are deterministic (snapshot replay → `docs/specs/agent/replay.md`). Hash mismatch with the prior hour's hash is a red flag even if the demo still passes — it means something nondeterministic crept in. Investigation triggered.

Demo-game CI cost is non-trivial. Budget: $[BENCHMARK NEEDED]/day. If hourly is too expensive at scale, fall back to every-merge + on-demand.

---

## Cross-System Test Corpus

These are tests no single feature team owns. They live under `tests/cross/` and are organized by the system pair they exercise:

| Path | Tests |
|---|---|
| `tests/cross/physics-renderer/` | debug-draw determinism, raycast-vs-mesh consistency |
| `tests/cross/physics-networking/` | rollback determinism with collision events |
| `tests/cross/audio-renderer/` | frame-sync between visual hits and impact sound |
| `tests/cross/scripting-ecs/` | hot-reload preserves world state |
| `tests/cross/agent-replay/` | snapshot/replay round-trip equivalence |
| `tests/cross/assets-renderer/` | streaming under memory pressure |
| `tests/cross/genres/*/` | each genre module run end-to-end with all relevant systems |

Adding a cross-system test is encouraged from any team. Removing one requires integration ack. Quarantining one requires an issue + 7d ceiling.

---

## Perf Benchmark Stewardship

Per-PR perf gating (→ `docs/guides/merge-system.md` §S7) prevents sharp regressions. The integration team prevents **drift** — a hundred PRs each at +0.2% combining to +20%.

Tools:

| Tool | Purpose |
|---|---|
| `nexus merge audit perf --since 30d --metric <m>` | timeseries of a metric across all merged PRs |
| `target/perf-baseline/` | committed criterion baselines |
| `tests/perf/macro/*.rs` | macro benchmarks beyond per-crate criterion |
| `bench-dashboard` | hosted Grafana off the audit log [DECISION NEEDED — hosting] |

Weekly: the on-call integrator runs `nexus integration perf-report --week` and files an issue for any metric showing a >5% rolling-30d drift even if every individual PR was inside threshold. The issue's fix is usually a focused `perf:` PR or an ADR explaining why the drift is acceptable (e.g. it bought a feature the spec demanded).

Quarterly: hardware re-baseline. Run the full bench corpus on the canonical runner image, replace `target/perf-baseline/`, tag the baseline commit, document the delta in an ADR.

---

## Flaky-Test Quarantine

When a test fails on PR-A's run, passes on PR-A's retry, then fails on unrelated PR-B's run within 24h, the merge system auto-flags it. Threshold = 3 cross-PR failures in 24h → auto-quarantine:

1. Test is moved to `#[ignore = "FLAKY-<issue>"]` via an automated PR by the merge system itself.
2. P1 issue filed, labelled `flaky`, assigned to integration triage.
3. Quarantined count incremented in `audit/flaky-ledger.json`.
4. If quarantined count > 1% of total tests → merge queue stops accepting `feat:` PRs until cleared. `fix:` and `chore:` still flow.
5. Integration fixes or deletes the test, removing the quarantine and closing the issue.

Quarantine ceiling enforcement: hard. Without it, flakiness ratchets up and the suite loses meaning.

---

## Release Trains

Releases are scheduled, not push-button. Cadence:

| Track | Cadence | Audience |
|---|---|---|
| `nightly` | every green commit on main | bleeding-edge contributors |
| `weekly` | Friday at 16:00 UTC | early-game developers |
| `monthly` | first Wednesday | indie studios on stable |
| `quarterly` | calendar quarter end | studios on LTS-track |

Each release passes a full demo-game suite, full cross-system suite, full bench corpus, plus a stricter S8 review with the `release` reviewer enabled. The release PR is itself a PR through the pipeline; the integration team authors it.

Versions follow semver (→ Conventional Commits → semver). Pre-1.0 mapping: see `docs/architecture/05-adr/0001-semver-pre-1.md` [DECISION NEEDED].

---

## Audit-Log-Driven Dashboards

The integration team consumes the merge audit log (→ `docs/guides/merge-system.md` §Audit Log). Standing queries:

```
nexus merge audit --since 7d --verdict fail --group-by stage
   → which stage is rejecting the most? policy tuning candidate

nexus merge audit --since 30d --verdict override --reason perf
   → are perf waivers piling up? threshold too tight?

nexus merge audit --since 24h --pr.review.cost-usd '>30'
   → which PRs are blowing the S8 budget? oversized PR? team needs help splitting

nexus merge audit --since 7d --infra-error
   → merge-system itself failing? page SRE [DECISION NEEDED — SRE role]
```

Outputs feed a public health dashboard. Transparency is a feature: external contributors should be able to see whether the pipeline is healthy before they invest in a PR.

---

## Performance Contract (for this team)

| Metric | Target | Hard limit |
|---|---|---|
| Time `main` is green per week | > 99.5% | > 98% |
| Median time-to-revert on red `main` | < 5 min | < 15 min |
| Quarantined-test count | < 0.5% of suite | < 1% of suite |
| Demo-game pass rate (rolling 7d) | 100% | 100% |
| Cross-system test pass rate (rolling 7d) | 100% | 100% |
| Perf drift on any tracked metric (rolling 30d) | < 3% | < 10% |
| On-call response time (page → first action) | < 60 s | < 5 min |
| Override rate on PRs (rolling 30d) | < 1% | < 5% |

[BENCHMARK NEEDED] — calibrate after first 90 days post-v0.1.

---

## Error Contract (integration team incident types)

| Code | Meaning | First action |
|---|---|---|
| `main/red` | `main` build/test broke | on-call investigates; revert if no fix in flight |
| `demo/red` | hourly demo run failed | reproduce locally, bisect to PR |
| `cross/red` | cross-system suite failed | bisect, file issue, freeze feature merges |
| `perf/drift` | rolling metric exceeded budget | open `perf:` issue, assign owning team |
| `flaky/ceiling` | quarantine > 1% | freeze `feat:`, all hands on flaky |
| `queue/stuck` | merge queue not progressing | inspect S10 logs, restart workers if infra; revert if PR-induced |
| `infra/down` | merge system stage unreachable | page SRE [DECISION NEEDED], failover to backup queue |
| `policy/drift` | overrides trending up | propose policy bundle PR with data |

---

## How Other Teams Interact

| You are... | Talk to integration when... | How |
|---|---|---|
| A feature team | adding a cross-system test, freezing queue for landing a multi-PR change | open issue with `integration` label |
| A spec author | a new spec implies a new perf metric to track | PR includes a metric definition in `tests/perf/macro/` |
| An external contributor | your PR was bisected out and you don't understand why | `@nexus-merge escalate stuck`; integration replies in audit log |
| An architect | proposing a principle amendment | ADR; integration weighs in on policy impact |

Integration **does not have unique override power** beyond what the escalation rules grant any maintainer (→ `docs/guides/merge-system.md` §Escalation). Their authority is the charter, not the keys.

---

## Test Requirements (for the team's own workflow)

- Synthetic-red drill: monthly, an architect lands a deliberately-bad PR with a `drill: true` label to verify revert pathway times.
- Quarantine ceiling drill: synthetic flaky test injected to assert ceiling enforcement triggers.
- Audit-log integrity check: hourly, verify signed audit entries match the queue's record.
- Handoff completeness: rotation handoff doc must list every open incident; missed = retro.

---

## Prior Art

- ✓ **rust-lang infra team** — the original "always-green main via Bors" practice; same north star, AI-staffed. (→ `github.com/rust-lang/bors`)
- ✓ **bevyengine maintainer rotation** — labelling discipline and triage cadence.
- ✓ **Google SRE error budgets** — % uptime targets, P0/P1 discipline applied to a code repo.
- ✓ **kubernetes/test-infra flaky management** — auto-quarantine, ceilings, ledger.
- ✓ **GitHub merge queue + Bors-NG** — staging-branch model for cross-PR conflict detection. (→ Mergify origin story article)
- ✓ **OPA-based policy stewardship** — the team proposes policy as code, not as memos. (→ `openpolicyagent.org`)
- ✗ **Single-maintainer release manager** — bottleneck, replaced by rotation + automation.

---

## Open Questions

- `[DECISION NEEDED]` SRE role: does Nexus have a separate AI SRE team or does integration cover infra incidents?
- `[DECISION NEEDED]` `bench-dashboard` hosting choice.
- `[DECISION NEEDED]` Pre-1.0 semver ADR.
- `[DECISION NEEDED]` Demo-game CI budget and runner pool sizing.
- `[BENCHMARK NEEDED]` Realistic perf-drift threshold based on first 90d audit data.
- `[BENCHMARK NEEDED]` Per-rotation incident rate to size team N.
