<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-merge — AI Merge System

> The AI maintainer. Every PR to every Nexus repository runs the same deterministic pipeline. No politics. No burnout. No bus factor. Decisions cite principles; rejections cite line numbers.

---

## Boundaries

- **Owns:** PR triage, automated review, merge queue, audit log, escalation routing, branch protection enforcement, release tagging.
- **Does NOT own:** writing code (→ AI dev teams), spec authoring (→ architects), runtime infra (→ integration team, see `docs/guides/integration-team.md`).
- **Depends on:**
  - `docs/architecture/01-principles.md` — the 12 binding laws cited in every rejection.
  - `docs/contracts/*.md` — interface contracts a PR must not break.
  - `docs/specs/agent/scenarios.md` — scenario corpus used as regression gate.
  - `docs/guides/pr-protocol.md` — PR contents this system validates.

---

## Why It Exists

Every open source project in history hit the same wall: a small number of human maintainers became the bottleneck. PRs queued for weeks. Contributors lost momentum. Decisions turned political. Maintainers burned out. Bus factor → 1.

Nexus removes that wall. The merge system is an AI dev team itself, on call 24/7, evaluating every PR on technical merit alone. Targets: **100+ PRs/day at v1.0, 1000+ PRs/day at v2.0, median wall-clock from `git push` → green `main` under 30 minutes.**

The system is **deterministic and auditable**. Same PR + same `main` SHA + same policy bundle → same verdict, byte for byte. Every check returns structured JSON. Every verdict is signed and stored.

---

## Pipeline (10 Stages)

```
                       ┌──────────────────────────────────────┐
                       │  PR opened / pushed / @nexus-merge   │
                       └──────────────────┬───────────────────┘
                                          │
                                          ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ S0  INTAKE     parse PR body → JSON manifest, fail-fast on schema   │
   │ S1  PROTOCOL   pr-protocol.md compliance: spec ref, tests, bench    │
   │ S2  BUILD      cargo check --workspace --all-targets --all-features │
   │ S3  STATIC     fmt, clippy -D warnings, cargo-deny, unsafe audit    │
   │ S4  TEST       cargo nextest, doctests, miri on tagged crates       │
   │ S5  CONTRACTS  contract diff vs docs/contracts/*.md, semver check   │
   │ S6  SCENARIOS  agent scenario corpus replay, deterministic diff     │
   │ S7  PERF       criterion benches vs main baseline, regression gate  │
   │ S8  REVIEW     multi-agent semantic review (parallel reviewers)     │
   │ S9  POLICY     OPA/Rego evaluation of full evidence bundle          │
   │ S10 QUEUE      enter merge queue, rebase, re-run S2–S7, fast-fwd    │
   └─────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              ┌───────────┴───────────┐
                              │                       │
                          PASS │                       │ FAIL
                              ▼                       ▼
                    ┌─────────────────┐    ┌────────────────────┐
                    │ merge & sign    │    │ comment + label    │
                    │ tag if release  │    │ block, suggest fix │
                    │ append audit    │    │ append audit       │
                    └─────────────────┘    └────────────────────┘
```

A failure at any stage short-circuits the pipeline. Subsequent stages do not run; their slots in the audit record are `"skipped"`. Cost matters: cheap stages first, expensive AI review (~$15–25/PR at S8, per Anthropic Code Review pricing) gated on cheap stages passing.

---

## Stage Reference

Each stage is an isolated worker. Inputs are pinned: PR head SHA, `main` SHA, policy bundle SHA, toolchain SHA. Outputs are signed JSON appended to the audit log.

### S0 — Intake

Parse PR body into the manifest defined in `docs/guides/pr-protocol.md`. Reject on schema violation. No human-readable prose tolerated above the manifest.

```json
{ "stage": "intake", "verdict": "pass", "pr": 4217, "head": "a3f9...", "duration_ms": 84 }
```

### S1 — Protocol

Required fields present, spec reference resolves to a real path, changelog entry is conventional-commit-shaped (→ Conventional Commits v1.0.0).

| Check | Pass criterion |
|---|---|
| `spec_ref` | resolves to `docs/specs/**/*.md` or `docs/contracts/*.md` |
| `tests_added` | at least one new `#[test]`, `#[bench]`, or scenario file in diff |
| `changelog` | matches `^(feat\|fix\|perf\|refactor\|docs\|test\|chore)(\(.+\))?!?: .{10,}$` |
| `benchmarks` | criterion bench in diff if files under `crates/{renderer,physics,core,networking}` change |
| `breaking` | if `!` in subject → `BREAKING CHANGE:` footer present with migration note |

### S2 — Build

`cargo check --workspace --all-targets --all-features` on all target tier-1 platforms (Linux x86_64, Windows x86_64, macOS aarch64, wasm32-unknown-unknown). **Always compiles** is principle #3; a red build is a non-negotiable reject.

### S3 — Static

| Tool | Threshold |
|---|---|
| `cargo fmt --check` | zero diff |
| `cargo clippy --workspace --all-targets -- -D warnings` | zero warnings |
| `cargo deny check` | zero advisories, license = MIT/Apache-2.0/BSD-3-Clause/Zlib only |
| `cargo geiger` | zero new `unsafe` blocks without `// SAFETY:` comment and ADR link |
| Sandi Metz check | per-file: ≤ 100 LOC per struct impl block, ≤ 5 statements per function (advisory until a `#[allow(nexus::size)]` with justification) (→ Sandi Metz' Rules) |

### S4 — Test

`cargo nextest run --workspace --all-features` plus `cargo test --doc`. Crates tagged in `Nexus.toml` under `[merge.miri]` run under `miri` for UB detection. Flaky tests are auto-quarantined after 3 cross-PR failures and filed as P1 issues; quarantine list lives in `docs/guides/integration-team.md`.

| Metric | Target | Hard limit |
|---|---|---|
| Pass rate | 100% | 100% |
| Coverage delta | ≥ 0% | ≥ −0.5% (line) on changed crates |
| Wall time S4 | < 8 min | < 20 min |

### S5 — Contracts

Diff the PR's exported API surface against `docs/contracts/*.md`. Any change to a documented signature requires a matching contract diff in the same PR. SemVer enforcement (→ Conventional Commits ↔ semver):

| Surface change | Required commit prefix |
|---|---|
| add public item | `feat:` |
| remove / rename / signature change | `feat!:` or `fix!:` + `BREAKING CHANGE:` |
| internal-only | `refactor:` / `perf:` |

Tool: `cargo public-api --diff` plus a Nexus-specific contract-linter that reads the markdown `## Public API` tables.

### S6 — Scenarios

Replay the agent scenario corpus (→ `docs/specs/agent/scenarios.md`). Every scenario produces a deterministic state hash. PR must not change any hash unless its manifest declares `affects_scenarios: [...]` and updates expected hashes in the same commit.

```
scenario: dragon-vs-castle-01
  main:    state_hash = 7f3a...   tick = 18000   verdict = win
  pr:      state_hash = 7f3a...   tick = 18000   verdict = win   ✓
scenario: rts-100-unit-pathing
  main:    state_hash = c11e...   tick = 12000   verdict = win
  pr:      state_hash = b209...   tick = 12000   verdict = win   ✗ undeclared change
```

### S7 — Performance

Criterion benches vs `main` baseline stored in `target/perf-baseline/`. Regression thresholds:

| Crate class | Soft (warn) | Hard (block) |
|---|---|---|
| renderer hot path | +3% | +5% |
| physics step | +3% | +5% |
| ECS schedule | +2% | +4% |
| networking serialize | +2% | +5% |
| asset import (offline) | +10% | +25% |
| anything else | +5% | +15% |

Improvements are reported and stored as the new baseline only after S10 merge. Baseline noise floor [BENCHMARK NEEDED] — needs production hardware profile.

### S8 — Multi-Agent Review

Inspired by Anthropic's Code Review (→ `code.claude.com/docs/en/code-review`). N parallel reviewer agents, each scoped to one concern, run on the diff + surrounding context. A verification agent then re-checks each candidate finding against actual code behavior to filter false positives before posting.

| Reviewer | Scope | Cites |
|---|---|---|
| `principles` | one rejection per violated principle | `docs/architecture/01-principles.md` |
| `boundaries` | module ownership leaks | `docs/architecture/02-system-map.md` |
| `contracts` | semantic API drift, side effects | `docs/contracts/*.md` |
| `errors` | structured error compliance, no string panics | principle #10 |
| `telemetry` | every new system emits telemetry | principle #11 |
| `determinism` | no `HashMap` iteration in deterministic paths, no wall-clock | principle #9 |
| `unsafe` | every `unsafe` justified, scoped, tested | principle #6 |
| `security` | input validation on agent/script/network surfaces | `docs/specs/scripting/sandbox.md` |
| `docs` | every public item has rustdoc, every spec change has rationale | principle #7 |
| `verifier` | filters false positives from above by re-reading the code | — |

Cost budget: $25 max per PR at S8. If reviewers disagree, the highest-severity verdict wins; ties → escalate.

### S9 — Policy

The full evidence bundle (S0–S8 JSON) is evaluated by an OPA/Rego policy bundle versioned in `docs/policies/` (→ Open Policy Agent). Final verdict = policy verdict. Example rule:

```rego
package nexus.merge

default allow := false

allow if {
  input.stages.build.verdict == "pass"
  input.stages.static.verdict == "pass"
  input.stages.test.verdict == "pass"
  input.stages.contracts.verdict == "pass"
  input.stages.scenarios.verdict == "pass"
  input.stages.perf.verdict in {"pass", "improvement"}
  count([f | f := input.stages.review.findings[_]; f.severity == "block"]) == 0
}

require_escalation if {
  input.pr.touches_files[_] == "docs/architecture/01-principles.md"
}
```

Policy is itself code-reviewed via this same pipeline (dogfood). Policy changes require a policy-team label that maps to a multi-signature escalation (see Escalation).

### S10 — Merge Queue

Inspired by Bors-NG and GitHub's native merge queue: batch r+'d PRs onto a staging branch built atop `main`, re-run S2–S7, fast-forward `main` on green. Prevents semantic merge conflicts that pre-merge CI cannot catch. Batch size auto-tunes on success rate (→ GitHub 2026 merge queue branch capacity model).

```
main ──●──●──●──────────────────────────────────●──> (fast-forward)
            \                                  /
             staging-N: [PR-4217, PR-4220] ───┘  green, ff
            \
             staging-N+1: [PR-4222, PR-4225] ───✗  bisect → eject PR-4225
```

On staging failure: bisect by halving, eject the guilty PR with a `nexus-merge: bisected-out` comment quoting the failed stage, retry the rest.

---

## Decision Criteria Summary

A PR merges iff:

1. Every required stage verdict is `pass` (or `improvement` for perf).
2. Zero S8 findings of severity `block`.
3. Rebased on current `main` and re-greened inside the queue.
4. PR author (human or agent) is in `CONTRIBUTORS` after CLA-style DCO sign-off check (machine-verifiable).
5. Wall time inside policy SLO (default 30 min; release-train PRs allowed 90 min).

Otherwise the PR is **blocked**, **labelled with the failing stage**, and a structured comment is posted (see Sample Comments).

---

## Audit Log

Every verdict — pass, fail, skip, override — is appended to an append-only log. Format: one JSON object per line, signed with the merge system's per-repo Ed25519 key, mirrored to `audit/` branch and to an external object store.

```json
{
  "ts": "2026-05-17T14:22:08.412Z",
  "pr": 4217,
  "head": "a3f9c2e1...",
  "main": "0b88da10...",
  "policy_bundle": "sha256:91ab...",
  "toolchain": "rustc 1.86.0 (sha256:fe1c...)",
  "stages": {
    "intake":    { "verdict": "pass", "duration_ms": 84 },
    "protocol":  { "verdict": "pass", "duration_ms": 122 },
    "build":     { "verdict": "pass", "duration_ms": 184000 },
    "static":    { "verdict": "pass", "duration_ms": 41000 },
    "test":      { "verdict": "pass", "duration_ms": 312000, "coverage_delta": "+0.31%" },
    "contracts": { "verdict": "pass", "duration_ms": 800 },
    "scenarios": { "verdict": "pass", "duration_ms": 240000, "hashes_changed": 0 },
    "perf":      { "verdict": "improvement", "renderer.draw": "-1.8%" },
    "review":    { "verdict": "pass", "findings": [], "cost_usd": 18.42 },
    "policy":    { "verdict": "allow", "rule": "nexus.merge.allow" }
  },
  "queue": { "batch": 309, "siblings": [4220], "ff_to": "5c44a1f3..." },
  "signature": "ed25519:..."
}
```

The log is queryable: `nexus merge audit --since 7d --crate renderer --verdict fail --reason perf` returns structured rows, not grep output. Queries power the integration team's weekly health dashboard (→ `docs/guides/integration-team.md`).

Audit retention: forever. Storage cost is irrelevant compared to the value of full provenance for every line of code in Nexus.

---

## Sample PR-Bot Comments

### Protocol failure

```
nexus-merge ❌  stage: protocol

PR manifest is missing `spec_ref`.

Required by docs/guides/pr-protocol.md §2.
Every PR must reference the spec it implements or modifies.

Suggested fix:
  Add to PR body:
    ```yaml
    spec_ref: docs/specs/renderer/shadows.md
    ```

Re-trigger: push a new commit, or comment `@nexus-merge retry`.
```

### Performance regression (hard)

```
nexus-merge ❌  stage: perf

Regression in `renderer::draw::submit_pass` exceeds hard limit.

  baseline:  1.842ms   ±0.021ms   (main @ 0b88da10)
  pr:        1.947ms   ±0.019ms   (+5.7%)
  threshold: +5.0%

Cited principle: docs/architecture/01-principles.md §5 "Performance is a spec".

Options:
  1. Profile + fix. Re-push to re-measure.
  2. If the regression is intended, update the perf contract in
     docs/specs/renderer/overview.md and add ADR under
     docs/architecture/05-adr/. Then re-request review.
  3. Escalate: comment `@nexus-merge escalate perf` with rationale.
```

### Principle violation from S8 review

```
nexus-merge ❌  stage: review   reviewer: errors

crates/renderer/src/pass.rs:142
> return Err("texture not found".into());

Violates principle #10: structured errors only.
String errors are not machine-parseable.

Required shape:
  return Err(RendererError::TextureMissing {
      id: tex_id,
      pass: pass_name,
      suggested_fix: "verify asset registry has the texture loaded",
  });

See docs/contracts/renderer-assets.md §Errors for the full enum.
```

### Pass

```
nexus-merge ✅  all stages pass — queued (batch #309, position 2)

  build       184s   ✓
  static      41s    ✓  clippy clean, 0 new unsafe
  test        312s   ✓  coverage +0.31%
  contracts   <1s    ✓
  scenarios   240s   ✓  0 hashes changed
  perf        62s    ✓  renderer.draw -1.8%  (improvement)
  review      $18.42 ✓  0 findings

ETA to main: ~6 min.
Audit: audit/2026/05/17/pr-4217.json
```

---

## Escalation Rules

Humans can override. The path is documented and itself audited — there is no back channel.

| Trigger | Path | Required |
|---|---|---|
| Disputed S8 finding | comment `@nexus-merge dispute <reviewer>` with technical rationale | 1 maintainer ack |
| Soft perf regression | comment `@nexus-merge waive perf` with bench rationale | 1 maintainer ack |
| Hard perf regression | open ADR under `docs/architecture/05-adr/` | 2 maintainer acks + arch council quorum |
| Principle violation (must-be-violated case) | open ADR proposing principle amendment | 3 maintainer acks + 7-day comment window |
| Policy bundle change | PR to `docs/policies/` | 2 maintainer acks, dogfooded through pipeline |
| Security hotfix bypassing queue | label `security/critical` + signed maintainer commit | post-hoc ADR within 48h |
| Emergency `main` revert | `nexus merge revert <sha>` | 1 maintainer; auto-files post-mortem issue |

Every override appends a `"override": { "by": "...", "rationale": "...", "rule": "..." }` field to the audit record. Overrides are surfaced on the weekly health dashboard and trend-tracked — a rising override rate is a signal that policy needs tightening or loosening, not that the policy should be ignored.

**Maintainer ≠ owner.** A maintainer is any account (human or agent) granted the `merge:override` capability by the governance file `docs/governance/maintainers.toml` [DECISION NEEDED — governance file path not yet specified].

---

## Performance Contract (the merge system itself)

| Metric | Target | Hard limit |
|---|---|---|
| Median wall-clock push → verdict | < 15 min | < 30 min |
| p95 wall-clock push → verdict | < 30 min | < 60 min |
| Throughput | 100 PR/day | 1000 PR/day |
| Audit append latency | < 1 s | < 10 s |
| Policy eval time | < 200 ms | < 2 s |
| S8 cost/PR | < $20 | < $50 |
| False-block rate (overturned on escalation) | < 1% | < 5% |
| Pipeline determinism (same inputs → same verdict) | 100% | 100% |

[BENCHMARK NEEDED] — figures assume Anthropic Code Review-class agent costs. Re-baseline at v1.0 hardware.

---

## Error Contract

Every stage produces one of:

| Code | Meaning | Caller action |
|---|---|---|
| `pass` | stage succeeded | continue |
| `fail` | stage produced a blocking finding | post comment, halt pipeline |
| `improvement` | (perf only) regression negative | continue, update baseline on merge |
| `skip` | upstream stage failed; not run | record, continue to next required-of-record |
| `infra_error` | merge system itself failed (not the PR) | retry up to 3×; on persistent failure, page integration team and do **not** block PR |

`infra_error` is critical: a broken pipeline must never falsely block contributors. The merge system fails *open* on its own bugs.

---

## Integration Points

| System | Touchpoint |
|---|---|
| `nexus-agent-sdk` | scenarios run via the same SDK external contributors use (→ `docs/specs/agent/sdk.md`) |
| `docs/specs/agent/replay.md` | snapshot/replay drives S6 determinism gate |
| `docs/contracts/*` | S5 reads these as ground truth |
| `docs/architecture/01-principles.md` | S8 reviewers cite by section |
| `docs/guides/integration-team.md` | flaky-quarantine list, dashboard consumer |
| `docs/guides/pr-protocol.md` | S0/S1 schema |
| GitHub merge queue | S10 backend (→ GitHub Docs: merge queue + branch protection) |

---

## Test Requirements (for the merge system itself)

- Replay any past PR → produce byte-identical audit record.
- Inject a known-bad PR fixture for each stage → assert correct failure code and comment text.
- Inject a known-good PR → assert merge, audit record, signature validity.
- Policy bundle round-trip: load, evaluate fixture bundle, snapshot output.
- Escalation flows: every override path has a test exercising the audit field.
- Failure injection: every external dep (GitHub API, runners, model API) has a failure-mode test asserting `infra_error` not `fail`.

---

## Prior Art

- ✓ **Bors-NG / rust-lang/bors** — staging-branch model; never-red main. Adopted as S10 design. (→ `github.com/bors-ng/bors-ng`, `github.com/rust-lang/bors`)
- ✓ **GitHub Merge Queue (2026)** — branch-capacity batching, native CI integration. S10 backend. (→ GitHub Docs)
- ✓ **Mergify** — `queue_conditions` vs `merge_conditions` split; YAML conditions. Inspires our S1/S10 split. (→ `docs.mergify.com`)
- ✓ **Anthropic Code Review** — multi-agent parallel review + verification pass. Adopted at S8. (→ `code.claude.com/docs/en/code-review`)
- ✓ **Open Policy Agent / Rego** — policy-as-code with full test coverage. S9 engine. (→ `openpolicyagent.org`)
- ✓ **Conventional Commits + SemVer** — machine-readable changelog and version bump. S1/S5. (→ `conventionalcommits.org`)
- ✓ **Sandi Metz' rules** — size/complexity heuristics. S3 advisory checks. (→ thoughtbot blog)
- ✗ **Single-reviewer "LGTM" model** — non-deterministic, politicized, doesn't scale. Rejected.
- ✗ **Pre-merge CI only** — misses semantic merge conflicts. Hence S10 post-rebase re-run.

---

## Open Questions

- `[DECISION NEEDED]` Maintainer governance file: `docs/governance/maintainers.toml` not yet specified — needs schema and quorum rules.
- `[DECISION NEEDED]` Multi-repo merge: does nexus-merge atomically merge cross-repo PRs (engine + game-template + cli) or sequence them?
- `[DECISION NEEDED]` LLM provider abstraction at S8 — single-vendor lock-in vs portability cost.
- `[BENCHMARK NEEDED]` Real per-PR cost at S8 against full corpus, including verification pass.
- `[BENCHMARK NEEDED]` Perf-regression noise floor on production runner hardware.
- `[DECISION NEEDED]` Audit-log retention beyond GitHub: object store choice, signing key rotation cadence.
