<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Game Template — Seeded `scripts/`

> Every `nexus new`'d game ships these scripts. Same names, same flags, same exit codes — across every game built on Nexus.

## Index (by category)

| Category | Scripts |
|---|---|
| dev | `dev`, `dev-server`, `onboard` |
| build | `build` |
| test | `test`, `scenario`, `bench`, `replay` |
| assets | `gen-asset` |
| deploy | `deploy`, `db-migrate`, `secrets-pull`, `secrets-push` |
| release | `release` |
| liveops | `hotfix-push`, `crash-fetch`, `triage-crashes`, `canary-promote`, `canary-rollback`, `feature-flag`, `dashboard-open` |
| meta | `agent-run` |

Engine-side base set (also present): `bootstrap`, `check`, `index-scripts`, `new-script`, `lint-scripts`. `→ docs/specs/scripts/overview.md`.

---

## `scripts/dev` — run game with hot reload

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--platform` | enum:native\|web\|android\|ios | no | `native` | target platform for dev session |
| `--scene` | string | no | (manifest default) | initial scene id |
| `--no-reload` | switch | no | off | disable hot reload watchers |
| `--port` | int | no | `7777` | dev server port (when --platform=web) |
| (base flags) | — | — | — | `→ docs/specs/scripts/cli-contract.md` |

| Exit | Meaning |
|---|---|
| 0 | clean shutdown |
| 4 | missing toolchain → run `scripts/bootstrap` |
| 6 | dev server crashed |
| 130 | SIGINT |

---

## `scripts/dev-server` — local lobby/relay server

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--port` | int | no | `7878` | bind port |
| `--bind` | string | no | `127.0.0.1` | bind address |
| `--rooms` | int | no | `32` | max concurrent rooms |
| `--protocol` | enum:udp\|quic | no | `quic` | transport |

| Exit | Meaning |
|---|---|
| 0 | clean shutdown |
| 2 | port in use |
| 10 | bind failed |

---

## `scripts/build` — production build per platform

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--platform` | enum:native\|web\|android\|ios\|switch\|ps5\|xsx | yes | — | target |
| `--profile` | enum:dev\|release\|dist | no | `release` | optimization level |
| `--feature` | string (multi) | no | — | enable cargo features |
| `--out` | path | no | `dist/<platform>/` | output dir |

| Exit | Meaning |
|---|---|
| 0 | success |
| 4 | missing toolchain |
| 5 | compile error |

---

## `scripts/test` — unit, integration, scenarios, lua, scripts-tests

Mirrors engine `scripts/test`. See engine seed list in `→ docs/specs/scripts/overview.md` (same flags).

---

## `scripts/scenario` — run TOML scenario(s)

Mirrors engine. `--file`, `--batch`, `--parallel N`, `--record`, `--json`.

---

## `scripts/bench` — criterion benches

Mirrors engine. `--baseline`, `--save`, `--package`, `--json`.

---

## `scripts/replay` — replay deterministic snapshot

Mirrors engine. `--snapshot`, `--from-frame`, `--patch`, `--bisect`.

---

## `scripts/gen-asset` — AI asset generation

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--kind` | enum:mesh\|texture\|sfx\|music | yes | — | what to generate |
| `--prompt` | string | yes | — | NL prompt |
| `--style` | string | no | (from Nexus.toml) | style override |
| `--provider` | enum:meshy\|scenario\|flux\|kenney | no | (best per kind) | source |
| `--out` | path | yes | — | output file/dir |
| `--seed` | int | no | random | reproducibility |
| `--budget-cents` | int | no | `100` | max cost ceiling |

| Exit | Meaning |
|---|---|
| 0 | asset written |
| 6 | provider error |
| 8 | budget exceeded → partial result |
| 10 | network |

`→ docs/specs/assets/generation.md`.

---

## `scripts/db-migrate` — backend migrations

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--env` | enum:dev\|staging\|prod | yes | — | DB target |
| `--direction` | enum:up\|down\|status | no | `up` | |
| `--steps` | int | no | (all) | bounded migration |
| `--lock-timeout` | int | no | `30` | seconds |

| Exit | Meaning |
|---|---|
| 0 | applied |
| 5 | migration failed |
| 7 | lock timeout |

Only present when backend module enabled in `Nexus.toml`.

---

## `scripts/secrets-pull` / `scripts/secrets-push` — sops wrappers

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--env` | enum:dev\|staging\|prod | yes | — | which env |
| `--file` | path | no | (per-env default) | specific sops file |
| `--key-ring` | string | no | `default` | which age/gpg keys |

| Exit | Meaning |
|---|---|
| 0 | success |
| 4 | missing sops |
| 6 | decrypt/encrypt failed |

`secrets-pull` writes plaintext to `tmpfs` only — never to repo. `secrets-push` re-encrypts in place.

---

## `scripts/deploy` — wraps `nexus deploy`

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--env` | enum:staging\|prod | yes | — | target env |
| `--target` | string (multi) | no | (all from Nexus.toml) | specific deploy target |
| `--skip-migrations` | switch | no | off | run only app deploy |
| `--canary` | int (0–100) | no | `0` | percent traffic to new version |

| Exit | Meaning |
|---|---|
| 0 | deployed + healthy |
| 5 | health check failed → auto-rolled back |
| 6 | provider error |

`→ docs/guides/deploy/cicd.md` (Agent 21).

---

## `scripts/release` — wraps `nexus release`

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--store` | enum:steam\|itch\|appstore\|playstore\|self | yes | — | distribution channel |
| `--channel` | enum:internal\|beta\|prod | yes | — | release ring |
| `--track` | string | no | (per-store default) | store-specific track |
| `--notes` | path | no | `CHANGELOG.md` | release notes source |

| Exit | Meaning |
|---|---|
| 0 | uploaded |
| 5 | validation rejected |
| 6 | store API error |

`→ docs/guides/release/` (Agent 21).

---

## `scripts/hotfix-push` — live-content patch

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--env` | enum:staging\|prod | yes | — | target |
| `--kind` | enum:scripts\|shaders\|assets\|config | yes | — | what's being patched |
| `--path` | path (multi) | yes | — | files to push |
| `--canary` | int | no | `0` | rollout % |
| `--reason` | string | yes | — | required for audit |

| Exit | Meaning |
|---|---|
| 0 | live |
| 5 | validation failed |
| 6 | CDN error |

`→ docs/guides/liveops/` (Agent 22).

---

## `scripts/crash-fetch` — pull recent crashes

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--provider` | enum:sentry\|glitchtip\|bugsnag | no | (from Nexus.toml) | crash source |
| `--since` | string | no | `24h` | duration window |
| `--top` | int | no | `50` | N most-frequent |
| `--env` | enum | no | `prod` | filter by env |

| Exit | Meaning |
|---|---|
| 0 | fetched |
| 6 | provider error |
| 10 | network |

Output `data.crashes[]` schema: `→ docs/guides/liveops/crash-format.md`.

---

## `scripts/triage-crashes` — feed crash-triager subagent

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--input` | path | no | (stdin via --stdin) | output of `crash-fetch` |
| `--stdin` | switch | no | off | read crash JSON from stdin |
| `--threshold` | int | no | `10` | min occurrences to triage |

Spawns the crash-triager subagent with the clustered JSON.

| Exit | Meaning |
|---|---|
| 0 | triage filed |
| 7 | subagent timeout |

---

## `scripts/canary-promote` / `scripts/canary-rollback`

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--env` | enum:staging\|prod | yes | — | target |
| `--release` | string | yes | — | release id |
| `--percent` | int (0–100) | promote only | `100` | new traffic share |

| Exit | Meaning |
|---|---|
| 0 | applied |
| 5 | guardrail failed (error rate / p99 latency over budget) |

---

## `scripts/feature-flag` — get/set a feature flag

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--get` | string | (one of) | — | flag name to read |
| `--set` | string | (one of) | — | flag name to write |
| `--value` | string | with --set | — | `true` \| `false` \| `0..100` |
| `--target` | string | no | `all` | cohort / env / user |

| Exit | Meaning |
|---|---|
| 0 | success |
| 2 | neither --get nor --set |
| 6 | provider error |

---

## `scripts/dashboard-open` — open the team dashboard

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--board` | enum:grafana\|posthog\|liveops\|crashes | no | `grafana` | which board |
| `--url` | switch | no | off | print URL instead of opening |

Reads dashboard URLs from `Nexus.toml [dashboards]`.

| Exit | Meaning |
|---|---|
| 0 | opened (or printed) |
| 3 | URL not configured in Nexus.toml |

---

## `scripts/agent-run` — invoke nexus-coder

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--workflow` | enum:implement-spec\|fix-bug\|new-genre\|review-pr | yes | — | which workflow |
| `--spec` | path | conditional | — | required for implement-spec / new-genre |
| `--issue` | int | conditional | — | required for fix-bug |
| `--pr` | int | conditional | — | required for review-pr |
| `--model` | string | no | (from `.claude/`) | model override |

| Exit | Meaning |
|---|---|
| 0 | workflow complete, artifacts written |
| 5 | subagent gates failed |
| 7 | timeout |

`→ docs/specs/coder/workflows.md` (Agent 18).

---

## `scripts/onboard` — first-run setup

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--profile` | enum:solo\|team\|ci | no | `solo` | which sign-ins to prompt |
| `--skip` | string (multi) | no | — | skip a setup step by id |
| `--interactive` | switch | no | off | enable prompts; off → fail on missing config |

| Exit | Meaning |
|---|---|
| 0 | onboarded |
| 2 | missing required config and not `--interactive` |
| 6 | provider sign-in failed |

Runs: bootstrap → sops keyring init → provider sign-ins → registers `.claude/` agent fleet → smoke test (`scripts/check --json`).

---

## Cross-References

- `→ docs/game-template/scripts/overview.md` — the seed-set overview
- `→ docs/game-template/scripts/extension-rules.md` — `scripts/custom/` rules
- `→ docs/specs/scripts/cli-contract.md` — flag + exit-code contract
- `→ docs/game-template/cli.md` — the `nexus` CLI (Agent 15)
- `→ docs/guides/deploy/` (Agent 21)
- `→ docs/guides/release/` (Agent 21)
- `→ docs/guides/liveops/` (Agent 22)
- `→ docs/specs/coder/workflows.md` (Agent 18)
