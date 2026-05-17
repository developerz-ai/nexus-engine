<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — `scripts/` Overview (for game devs)

> When you run `nexus new mygame`, you get a `scripts/` directory wired to the engine's conventions. Same shape, same flags, same exit codes as the engine repo itself.

## The Promise

Every Nexus repo — engine, every game built from `nexus new`, every demo — ships:

- a `scripts/` directory of executable, parameterized CLIs
- a `scripts/lib/` of shared utilities (sourced, never run)
- a `scripts/manifest.toml` (source of truth)
- a `scripts/index.json` (machine-readable, AI-agent consumed)
- a sibling test next to every script

A dev (with their AI) opens any Nexus project and finds the same commands in the same place.

## What You Get on `nexus new`

| Script | What it does | Spec |
|---|---|---|
| `scripts/dev` | run game with hot reload | `→ docs/game-template/scripts/seed-list.md` |
| `scripts/dev-server` | local lobby/relay server | same |
| `scripts/build` | production build per platform | same |
| `scripts/test` | nextest + scenarios + script-tests | same |
| `scripts/scenario` | run a TOML scenario | same |
| `scripts/bench` | criterion benches | same |
| `scripts/replay` | deterministic snapshot replay | same |
| `scripts/gen-asset` | AI asset gen (mesh/tex/sfx/music) | same |
| `scripts/db-migrate` | backend migrations | same |
| `scripts/secrets-pull` / `secrets-push` | sops wrappers | same |
| `scripts/deploy` | wraps `nexus deploy` | same |
| `scripts/release` | wraps `nexus release` | same |
| `scripts/hotfix-push` | live-content patch | same |
| `scripts/crash-fetch` | pull recent crashes | same |
| `scripts/triage-crashes` | crash-triager subagent feed | same |
| `scripts/canary-promote` / `canary-rollback` | canary controls | same |
| `scripts/feature-flag` | get/set flag | same |
| `scripts/dashboard-open` | open Grafana/PostHog | same |
| `scripts/agent-run` | invoke nexus-coder workflow | same |
| `scripts/onboard` | first-run dev setup | same |

Full table with flags and exit codes: `→ docs/game-template/scripts/seed-list.md`.

## The Contract

Every script:

| Flag | Always works |
|---|---|
| `--help` | print usage, exit 0 |
| `--json` | structured output |
| `--dry-run` | safe planning |
| `--quiet` / `--verbose` | log level |
| `--env <name>` | required for env-touching scripts |

Full contract: `→ docs/specs/scripts/cli-contract.md`.

## Discovery (the agent-first move)

Don't memorize names. Ask the index:

```bash
jq '.scripts[] | {name, description, category}' scripts/index.json
```

Your AI does the same. `→ docs/guides/scripts-for-ai-agents.md`.

## Add Your Own

```bash
scripts/new-script --name pull-localization --lang py --category liveops
```

Generates:
- `scripts/custom/pull-localization` (executable)
- `scripts/custom/pull-localization.test.py`
- entry in `scripts/manifest.toml`

Then write `--help` text, implement, write tests, run `scripts/check`.

Walkthrough: `→ docs/guides/scripts-write-your-own.md`.

## Why `scripts/custom/`

`nexus upgrade` (template upgrade) overwrites `scripts/*` but never touches `scripts/custom/*`. Your stuff stays yours. Extension rules: `→ docs/game-template/scripts/extension-rules.md`.

## CI Uses Your Scripts

Your `.github/workflows/*.yml` is a thin caller. The logic lives in scripts so you can reproduce CI locally:

```bash
scripts/check
scripts/test
scripts/scenario --batch
```

`→ docs/guides/ci-and-scripts.md`.

## Game Template Context

The full template overview (agent fleet, monorepo layout, etc.) is at `→ docs/game-template/overview.md`. This guide focuses on the script-set seed; that doc covers the rest.

## Cross-References

- `→ docs/specs/scripts/overview.md` — the convention itself
- `→ docs/specs/scripts/cli-contract.md` — flag + exit-code contract
- `→ docs/specs/scripts/discovery.md` — manifest + index format
- `→ docs/specs/scripts/testing.md` — test stack per language
- `→ docs/guides/scripts-for-ai-agents.md` — agent invocation recipe
- `→ docs/guides/scripts-write-your-own.md` — adding a script
- `→ docs/game-template/scripts/seed-list.md` — every seeded game-repo script
- `→ docs/game-template/cli.md` — the `nexus` CLI itself (Agent 15)
- `→ docs/specs/coder/cli.md` — nexus-coder subagent CLI (Agent 18)
