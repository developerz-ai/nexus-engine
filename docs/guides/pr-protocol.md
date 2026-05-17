<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# PR Protocol

> The contract between a contributor (human or AI agent) and `nexus-merge`. A PR that follows this protocol is machine-verifiable end-to-end. A PR that doesn't is rejected at stage S1.

---

## Boundaries

- **Owns:** PR body schema, branch naming, commit message shape, required artifacts.
- **Does NOT own:** how the merge system evaluates the PR (→ `docs/guides/merge-system.md`), how an AI team produces the PR (→ `docs/guides/ai-dev-onboarding.md`).
- **Depends on:** `docs/architecture/01-principles.md`, `docs/contracts/*.md`, `docs/specs/agent/scenarios.md`.

---

## TL;DR

1. One spec change or one implementation slice per PR. Don't bundle.
2. Branch: `<type>/<scope>-<slug>` (e.g. `feat/renderer-vsm-cascades`).
3. PR body **starts with** a YAML manifest (below). Prose goes after.
4. Commits follow Conventional Commits (→ `conventionalcommits.org/v1.0.0`).
5. Tests-first. Bench-first for any hot path. Contract diff in the same PR if you touch a public API.
6. Empty diff outside the declared scope → rejected.

---

## Manifest Schema

Every PR body must open with a fenced ```yaml nexus-pr block. Anything before it is ignored. The schema is versioned; current is `v1`.

````markdown
```yaml nexus-pr
version: 1
spec_ref: docs/specs/renderer/shadows.md          # required, must resolve
contracts_touched:                                # optional, list paths
  - docs/contracts/renderer-assets.md
crates_touched:                                   # required if any code changes
  - nexus-renderer
  - nexus-core
change_type: feat                                 # feat|fix|perf|refactor|docs|test|chore
breaking: false                                   # if true, BREAKING CHANGE footer required
tests_added:                                      # required: at least one
  - crates/nexus-renderer/tests/shadows_vsm.rs
  - crates/nexus-renderer/benches/shadows.rs
scenarios_touched: []                             # list scenario IDs whose hash changes
perf_claims:                                      # optional, parsed and verified at S7
  - "renderer.shadows.cascade_split: -8% vs baseline"
agent:                                            # required for AI-authored PRs
  name: claude-opus-4-7
  role: implementer
  team: renderer-team-A
  reviewed_by:                                    # peer agents in the same team
    - claude-sonnet-4-7
risk: low                                         # low|med|high — sets reviewer count at S8
rollback: "revert this commit; no data migration"
```
````

| Field | Type | Required | Validated by |
|---|---|---|---|
| `version` | int | yes | must equal current schema version |
| `spec_ref` | path | yes | file exists under `docs/specs/` or `docs/contracts/` |
| `contracts_touched` | path[] | if any contract changes | each exists |
| `crates_touched` | string[] | if `crates/` diff non-empty | matches diff set exactly |
| `change_type` | enum | yes | matches commit subject prefix |
| `breaking` | bool | yes | if `true`, every commit subject has `!` and footer `BREAKING CHANGE:` present |
| `tests_added` | path[] | yes | each path in PR diff with at least one new test fn |
| `scenarios_touched` | string[] | yes | each scenario's expected-hash file updated in same PR |
| `perf_claims` | string[] | optional | parsed `<metric>: <delta>` and checked at S7 |
| `agent.name` | string | for AI PRs | matches model id; checked against allowed list |
| `agent.role` | enum | for AI PRs | implementer / reviewer / integrator / fixer |
| `agent.team` | string | for AI PRs | known team id |
| `agent.reviewed_by` | string[] | for AI PRs | ≥ 1 distinct peer at risk=low, ≥ 2 at med, ≥ 3 at high |
| `risk` | enum | yes | low / med / high; high forces extra reviewers and arch council label |
| `rollback` | string | yes | non-empty; what to do if the merge causes incident |

Manifest parses must succeed. If it doesn't, S1 fails with `protocol/manifest-invalid`.

---

## Commit Message Shape

(→ Conventional Commits v1.0.0, → semver.org)

```
<type>(<scope>): <subject ≤ 72 chars>

<body — wrap at 100, explain why not what>

<footers>
```

Allowed `type`: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`, `revert`. Anything else → S1 fail.

`<scope>` is the crate or doc area: `renderer`, `physics`, `core`, `agent`, `specs/audio`, etc.

Breaking change forms:

```
feat(renderer)!: replace VSM with virtual shadow tiles

BREAKING CHANGE: removes `ShadowMapKind::VSM` from the public API.
Migration: see docs/architecture/05-adr/0042-virtual-shadow-tiles.md.
```

Footers we recognize:
- `BREAKING CHANGE: ...` → triggers MAJOR bump on next release
- `Closes #123` / `Fixes #123` → auto-closes the issue on merge
- `Co-Authored-By: ...` → multi-agent or human+agent collaboration
- `Spec-Ref: docs/specs/...` → echoes manifest, for git-log grep
- `ADR: docs/architecture/05-adr/0042-...` → required if `breaking: true`

Squash policy: the merge queue squashes a PR into one commit whose subject = the PR title (which must itself be conventional) and whose body concatenates each commit body, deduplicated. Authors can request `merge: rebase` via PR label for chains where each commit must stand alone (e.g. multi-stage refactors).

---

## Required Artifacts by PR Type

The merge system enforces a minimum bar per `change_type`. More is fine; less is rejected.

| change_type | Spec | Unit tests | Integration scenario | Bench | Docs |
|---|---|---|---|---|---|
| `feat` | new or updated spec section | ≥ 1 new test | required if cross-system | required if hot path crate | rustdoc on every new public item |
| `fix` | bug section in spec OR ADR | regression test that fails on `main` and passes on PR | optional | required if perf-sensitive crate | none if no API change |
| `perf` | none new | none new | required: scenario for the path being optimized | **required** with criterion | comment explaining the technique |
| `refactor` | none | existing tests must remain | none | must not regress | none unless API moves |
| `docs` | the doc itself | none | none | none | n/a |
| `test` | none | the new tests | optional | optional | none |
| `chore` | none | none | none | none | none |
| `build` / `ci` | none | none | none | none | none |

Hot path crates (where bench is mandatory on `feat`/`perf`): `nexus-core`, `nexus-renderer`, `nexus-physics`, `nexus-networking`, `nexus-assets` (streaming path only).

---

## Tests-First Rule

The PR diff must show tests added **before** implementation in the commit history — or in a single squashed commit where the test file appears in the diff. The merge system enforces by examining the commit-by-commit diff for `feat:` and `fix:` types:

```
✓ commit A:  test(renderer): add failing test for cascade split bias
✓ commit B:  feat(renderer): cascade-split bias correction
```

```
✗ commit A:  feat(renderer): cascade-split bias correction
✗ commit B:  test(renderer): add test for cascade split bias    # too late
```

Rationale: a test added after the fact often tests what the code does, not what the spec requires. This is principle #12 ("tests ship with code") combined with the AI-first need for verifiable intent.

Exemption: `risk: low` `refactor:` PRs may rely on existing tests; the manifest must list which existing tests cover the change.

---

## Spec Reference

Every implementation PR must point at a spec section. The form `docs/specs/<area>/<file>.md#<anchor>` is preferred. If the spec doesn't yet specify what the PR implements, the PR must:

1. Open a separate spec PR first.
2. Wait for spec PR to merge.
3. Reference the now-existing section.

Or, for trivial gaps, include the spec edit in the same PR with `change_type: feat` and the spec edit as the first commit. The merge system accepts both shapes; what it rejects is implementation without a spec it can point at.

---

## Contract Discipline

If your PR changes any item exported from a Nexus crate, you must update the matching contract under `docs/contracts/`. The contract diff lives in the same PR. Mismatch → S5 fail.

Contracts are authoritative. The implementation must conform to the contract, not the other way around. If the implementation forces a contract change, the PR splits:

- PR-A: contract change + ADR, `change_type: docs` + `breaking: true` if applicable.
- PR-B: implementation change, blocked on PR-A.

Cross-link both with `Depends-On:` footers.

---

## Benchmarks

Benches live next to code: `crates/<crate>/benches/<area>.rs`. Use `criterion`. Every `perf:` PR includes both the bench and the criterion baseline file as a diff vs `target/perf-baseline/`. Sample manifest entry:

```yaml
perf_claims:
  - "renderer.shadows.cascade_split: -8% vs baseline"
  - "renderer.shadows.draw_cascade_3: +1.5% vs baseline (acceptable, see body)"
```

The merge system parses each line as `<metric>: <delta>` and verifies at S7. A claim the PR fails to deliver → `protocol/perf-claim-unmet`.

Anti-pattern: claiming a regression to make the gate pass. The S7 threshold is fixed; claims are checked but don't override thresholds.

---

## Changelog

The squashed commit subject IS the changelog entry. No separate `CHANGELOG.md` edit in the PR. `standard-version`/`semantic-release`-style tooling (→ Conventional Commits ↔ semver) regenerates `CHANGELOG.md` from git history at release time.

| Commit prefix | Section in generated changelog | Version bump |
|---|---|---|
| `feat:` | Features | MINOR |
| `fix:` | Bug Fixes | PATCH |
| `perf:` | Performance | PATCH |
| `refactor:`, `test:`, `chore:`, `build:`, `ci:`, `docs:` | (hidden by default) | none |
| `*!:` or `BREAKING CHANGE:` footer | Breaking Changes | MAJOR |

Pre-1.0 (current): breaking changes are MINOR. Documented in `docs/architecture/05-adr/0001-semver-pre-1.md` [DECISION NEEDED — ADR not yet drafted].

---

## Sample Valid PR Body

````markdown
```yaml nexus-pr
version: 1
spec_ref: docs/specs/renderer/shadows.md#cascade-split
contracts_touched: []
crates_touched:
  - nexus-renderer
change_type: perf
breaking: false
tests_added:
  - crates/nexus-renderer/tests/shadows_cascade_split.rs
  - crates/nexus-renderer/benches/shadows.rs
scenarios_touched: []
perf_claims:
  - "renderer.shadows.cascade_split: -8% vs baseline"
agent:
  name: claude-opus-4-7
  role: implementer
  team: renderer-team-A
  reviewed_by: [claude-sonnet-4-7]
risk: low
rollback: "revert; no migration"
```

## Why

Cascade split bias was computing depth in view space then re-projecting,
costing ~8% of the shadow pass. Recomputing in NDC eliminates the round-trip.

## What changed

- New helper `cascade_split_ndc()` replacing `cascade_split_view()`.
- Old path kept under `#[deprecated]` for one release.
- Bench shows -8.2% mean, -7.9% p99 on the `dragon-vs-castle-01` scene.

## How to verify

  cargo bench -p nexus-renderer --bench shadows -- cascade_split

## Risk

Low. Visual output identical (snapshot test green). Old path retained.
````

---

## Sample Invalid PR Bodies (and what S1 says)

**Missing manifest:**
```
nexus-merge ❌ protocol/manifest-missing
Open PR body must begin with ```yaml nexus-pr ... ``` block.
See docs/guides/pr-protocol.md §Manifest Schema.
```

**spec_ref doesn't resolve:**
```
nexus-merge ❌ protocol/spec-ref-unresolved
spec_ref: docs/specs/renderer/shdows.md  (file not found)
Did you mean: docs/specs/renderer/shadows.md ?
```

**Breaking change without footer:**
```
nexus-merge ❌ protocol/breaking-footer-missing
breaking: true declared in manifest, but no commit carries `BREAKING CHANGE:` footer.
See docs/guides/pr-protocol.md §Commit Message Shape.
```

**Tests not first:**
```
nexus-merge ❌ protocol/tests-after-impl
feat: commit f00b1234 adds src/pass.rs:+48 -3 with no matching test file changes.
First test for this change appears in commit a3f9c2e1, two commits later.
Reorder commits or squash with the test commit ahead of impl.
```

---

## Performance Contract (this protocol)

| Metric | Target | Hard limit |
|---|---|---|
| Time to parse + validate manifest | < 100 ms | < 500 ms |
| % of first-time AI agent PRs passing S1 on first submit | > 90% | > 75% |
| % of human contributor PRs passing S1 on first submit | > 70% | > 50% |
| Manifest schema version churn | ≤ 1 breaking change / year | ≤ 2 / year |

---

## Error Contract (S1 codes)

| Code | Meaning | Suggested fix |
|---|---|---|
| `protocol/manifest-missing` | no `yaml nexus-pr` block | add one per schema |
| `protocol/manifest-invalid` | parse error | check YAML syntax |
| `protocol/schema-version` | unknown `version` | upgrade or downgrade |
| `protocol/spec-ref-unresolved` | path doesn't exist | check spelling, verify spec merged |
| `protocol/crates-mismatch` | declared crates differ from diff | reconcile |
| `protocol/commit-shape` | non-conventional commit | rewrite history or squash |
| `protocol/breaking-footer-missing` | `breaking: true` without footer | add `BREAKING CHANGE:` footer |
| `protocol/tests-after-impl` | tests-first violated | reorder commits |
| `protocol/tests-missing` | none of `tests_added` paths in diff | add tests |
| `protocol/bench-missing` | hot-path PR without bench | add `crates/*/benches/*.rs` |
| `protocol/perf-claim-unmet` | claim not met at S7 | re-measure or remove claim |
| `protocol/contract-mismatch` | API diff w/o contract diff | edit `docs/contracts/*.md` |
| `protocol/scenarios-undeclared` | scenario hash changed without manifest entry | declare and update expected hashes |
| `protocol/risk-reviewers` | reviewers fewer than risk tier requires | add agent reviewers |
| `protocol/agent-unknown` | `agent.name` not in allowed list | register the agent or use alias |

---

## Prior Art

- ✓ **Conventional Commits v1.0.0** — lifted wholesale; subject prefixes, footers, breaking-change markers. (→ `conventionalcommits.org/v1.0.0`)
- ✓ **SemVer 2.0.0** — mapping of commit type → version bump.
- ✓ **`standard-version` / `semantic-release`** — auto-changelog from git history. (→ `github.com/conventional-changelog/standard-version`)
- ✓ **Bevy PR template** — required-section discipline.
- ✓ **rust-lang/rust `T-`/`A-` label taxonomy** — inspires our `risk` field.
- ✗ **Free-form PR templates** — non-machine-parseable, can't gate.
- ✗ **Separate `CHANGELOG.md` edits per PR** — merge conflicts, drift, manual labor.

---

## Open Questions

- `[DECISION NEEDED]` Pre-1.0 semver policy ADR not yet written.
- `[DECISION NEEDED]` `agent.name` registry shape — embedded TOML or external service?
- `[DECISION NEEDED]` Multi-PR `Depends-On:` semantics — does S10 batch dependents atomically?
- `[BENCHMARK NEEDED]` First-submit S1 pass rate per agent model — needs telemetry from first 30 days post-v0.1.
