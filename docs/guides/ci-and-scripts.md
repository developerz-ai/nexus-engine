<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — CI and `scripts/`

> CI YAML is thin. Logic lives in scripts. A dev runs the same commands locally that CI runs. Local-CI parity is the goal.

## The Rule

```
.github/workflows/*.yml → calls scripts/<name>
```

Never inline build/test/deploy logic in YAML. If a CI step is more than `setup → install → scripts/<name> --json --env <env>`, the script is wrong — push the logic down.

## Why

| Goal | Achieved by |
|---|---|
| local-CI parity | same scripts |
| portable across CI providers | logic not bound to GitHub Actions DSL |
| AI-agent reproducibility | agent runs the same `scripts/check` |
| audit trail | every CI run = telemetry envelope per script |

## Required CI Workflows (engine repo)

| Workflow | Trigger | Scripts called |
|---|---|---|
| `check.yml` | PR, push to main | `scripts/check --json` |
| `test.yml` | PR, push, nightly | `scripts/test --json --unit --integration` |
| `scenario.yml` | PR, nightly | `scripts/scenario --batch --json` |
| `bench.yml` | nightly, on `bench:` label | `scripts/bench --json --baseline main` |
| `lint-scripts.yml` | any `scripts/**` change | `scripts/lint-scripts --json` |
| `release.yml` | tag push `v*` | `scripts/release-engine --json --version $TAG --channel stable` |
| `symbols.yml` | post-release | `scripts/symbols-upload --json --release $TAG` |
| `triage.yml` | every 4h cron | `scripts/triage-issues --json` |
| `docs-index.yml` | PR | `scripts/sync-docs-index --json --check` |

## Required CI Workflows (game repo, seeded by template)

| Workflow | Trigger | Scripts called |
|---|---|---|
| `check.yml` | PR | `scripts/check --json` |
| `test.yml` | PR | `scripts/test --json` |
| `scenario.yml` | PR | `scripts/scenario --batch --json` |
| `deploy-staging.yml` | merge to main | `scripts/deploy --json --env staging` |
| `deploy-prod.yml` | tag push | `scripts/deploy --json --env prod` |
| `crash-fetch.yml` | 1h cron | `scripts/crash-fetch --json --since 1h` |
| `triage-crashes.yml` | after crash-fetch | `scripts/triage-crashes --json` |

## Skeleton: `.github/workflows/check.yml`

```yaml
name: check
on: [pull_request, push]
jobs:
  check:
    runs-on: ubuntu-latest
    env:
      NEXUS_ENV: dev
      NEXUS_AGENT_ID: gh-actions
    steps:
      - uses: actions/checkout@v4
      - run: scripts/bootstrap --minimal --json
      - run: scripts/check --json
```

Three lines of logic. Everything else is in `scripts/check`.

## Local-CI Parity Test

Any dev (or their AI) reproduces CI:

```bash
NEXUS_ENV=dev NEXUS_AGENT_ID=$USER scripts/check --json
NEXUS_ENV=dev NEXUS_AGENT_ID=$USER scripts/test --json
```

If CI passes and local fails (or vice versa) — bug in the script, not the YAML.

## Caching

CI caches:

| Path | Key |
|---|---|
| `~/.cargo/registry` | `cargo-${{ hashFiles('Cargo.lock') }}` |
| `~/.cache/sccache` | `sccache-${{ runner.os }}` |
| `~/.bun/install/cache` | `bun-${{ hashFiles('bun.lockb') }}` |
| `~/.cache/pip` | `pip-${{ hashFiles('requirements*.txt') }}` |

`scripts/bootstrap` already knows where these live — CI just passes the path.

## Telemetry from CI

Every CI step that calls a script captures the JSON envelope:

```yaml
- id: check
  run: scripts/check --json | tee /tmp/check.json
- run: jq -e '.ok == true' /tmp/check.json
```

Envelopes shipped to nexus-merge for PR scoring: `→ docs/guides/merge-system.md`.

## Forbidden in CI YAML

| Anti-pattern | Replacement |
|---|---|
| `run: cargo build --workspace` | `run: scripts/build --workspace --json` |
| `run: cargo test` | `run: scripts/test --json` |
| `run: cargo fmt --check && cargo clippy` | `run: scripts/check --json` |
| inline bash > 5 lines | extract to a script |
| secrets in plaintext step | use `secrets.*` → script reads from env |
| different commands in dev vs CI | violates parity — fix the script |

## Cross-References

- `→ docs/specs/scripts/cli-contract.md`
- `→ docs/specs/scripts/testing.md` (CI calls test stack)
- `→ docs/guides/testing/ci.md` (Agent 20)
- `→ docs/guides/deploy/cicd.md` (Agent 21)
- `→ docs/guides/merge-system.md`
