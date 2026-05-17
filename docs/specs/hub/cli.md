<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — CLI

> The `nexus hub` subcommand. Wraps every hub API in a shell-friendly + agent-friendly surface. `--json` everywhere. Install resolves through `cargo` + `Nexus.toml`. Mirror operations supported.

→ Top-level CLI contract: `docs/specs/coder/cli.md` and `docs/guides/scripts-for-ai-agents.md`
→ HTTP API: `api.md`
→ Self-host playbook: `docs/guides/hub/self-hosting.md`

## Global flags

| Flag | Default | Purpose |
|---|---|---|
| `--json` | off | machine-readable output on every command |
| `--hub <url>` | from `~/.nexus/hub.toml::default_hub` or `https://hub.nexus.engine` | target a specific hub/mirror |
| `--token <env-or-file>` | `NEXUS_HUB_TOKEN` env | bearer token for write actions |
| `--quiet` / `-q` | off | suppress progress |
| `--no-color` | follows `NO_COLOR` | disable ANSI in TTY |
| `--timeout <secs>` | 30 | per-request timeout |

`--json` produces stable, schemaed output suitable for `jq` and for agent parsing. Schema published at `GET /api/v1/cli/schemas/{command}.json`.

## Command table

| Command | Wraps | Auth |
|---|---|---|
| `nexus hub search <query>` | `GET /api/v1/search` | none |
| `nexus hub show <name>` | `GET /api/v1/{kind}/{name}` (auto-detect kind) | none |
| `nexus hub list` | `GET /api/v1/crates` etc. | none |
| `nexus hub categories` | `GET /api/v1/categories` | none |
| `nexus hub recommend [--for <category>] [--genre ...] [--style ...] [--engine ...]` | `POST /api/v1/recommend` | optional |
| `nexus hub eval <name>` | `POST /api/v1/eval-crate/{name}` | optional |
| `nexus hub install <name>` | `cargo add` + `Nexus.toml` update | none for install; opt-in telemetry |
| `nexus hub submit` | `POST /api/v1/submit` | token |
| `nexus hub attest` | `POST /api/v1/attest` | token + signing key |
| `nexus hub rate <name>` | `POST /api/v1/rate` | token |
| `nexus hub flag <name> --reason ...` | `POST /api/v1/flag` | token |
| `nexus hub index sync` | `GET /api/v1/index.json` (ETag-aware) | none |
| `nexus hub mirror up` | brings up local mirror via docker-compose | none |
| `nexus hub mirror down` | stops local mirror | none |
| `nexus hub mirror status` | reads local mirror health | none |
| `nexus hub mirror register` | `POST /api/v1/mirrors/register` | token |
| `nexus hub login` | OAuth dance | — |
| `nexus hub logout` | drops cached token | — |
| `nexus hub whoami` | echoes account | session |

## search

```
nexus hub search <query> [--type crate|mod|asset|template|game] [--tier verified|community]
                         [--category <slug>] [--license <spdx>]
                         [--engine <semver-req>] [--limit N] [--json]
```

```
$ nexus hub search "soulslike"
crate  nexus-genre-soulslike-core            v0.3.1   verified  ★4.7 (28)  12k DL
crate  nexus-style-grimdark                  v0.1.8   community ★4.1 (12)  3k  DL
mod    [steam] Dark Souls 1 Combat for ...   —        —         ★4.4 (210) 8k  DL
```

`--json` mode:

```
$ nexus hub search "soulslike" --json
{"results": [{"type": "crate", "name": "...", "score": 0.93, ...}, ...]}
```

## show

```
nexus hub show <name> [--version <v>] [--json]
```

Auto-detect: tries crate, then mod, then asset, then template, then game. `--type` to override.

Default human-friendly view groups: identity → manifest → versions → ratings → reviews tail → dependencies → install hint.

## recommend

```
nexus hub recommend --genre moba --style stylized --engine '^0.4' --tier-min verified --json
```

Wraps `POST /api/v1/recommend`. Output is a ranked list with reasons and `next_steps`.

`--for <category>` is shorthand for `--categories-wanted <category>`.

## eval

```
nexus hub eval nexus-genre-soulslike-core --project ./Nexus.toml --json
```

Reads project's `Nexus.toml` to populate the `project` field. Output is the structured `EvalResponse` (→ `agent-api.md`).

## install

```
nexus hub install nexus-genre-soulslike-core [--version '^0.3'] [--features ...]
```

Wraps `cargo add` then registers the crate in `Nexus.toml` per Agent 29's resolution (→ `docs/specs/crates/nexus-add-resolution.md`, to be authored by Agent 29). Steps:

```
1. Resolve crate version satisfying --version (or latest verified)
2. Run pre-install eval (eval-crate): on do_not_adopt → refuse + show alternatives
3. cargo add <crate>@<version> [--features ...]
4. Update Nexus.toml [extensions] table (if applicable per Agent 29's contract)
5. Run `cargo check` to verify resolution
6. Emit install_complete event (opt-out per telemetry.md)
```

`--allow-quarantined` required to install a quarantined crate. `--allow-community` required if user's policy is `tier_min: verified`.

`--dry-run` shows what would happen.

## submit

Interactive:

```
nexus hub submit
> kind: crate
> origin_url: https://crates.io/crates/nexus-genre-survival-extreme
> manifest_url: <auto-detected from repo>
> category: genre/survival
```

Non-interactive (for CI):

```
nexus hub submit --json << EOF
{ "kind": "crate", "origin_url": "...", "manifest_url": "...", "category": "..." }
EOF
```

Output is the `SubmitResponse` (poll URL).

## attest

Auditor flow:

```
nexus hub attest \
  --target crate:nexus-genre-survival-extreme:0.4.2 \
  --result license_ok=true,no_known_cves=true,headless_safe=true,deterministic=true,scenarios_passed=true,perf_contract_met=true \
  --signing-key ~/.nexus/keys/audit-council-01-2026.ed25519 \
  --notes 'Re-audit after engine 0.5.'
```

- Hashes the attestation per RFC 8785.
- Signs locally.
- Calls `POST /api/v1/attest`.
- Outputs the attestation id and audit log offset.

Refuses to run if the signing key isn't an active key for an `auditor` role on the target hub.

## rate / flag

```
nexus hub rate nexus-genre-survival-extreme --stars 5 --review 'Solid hunger system.'
nexus hub flag nexus-evil-malware --reason malware --details 'Calls /tmp/eval after install.'
```

Refuses `rate` without a verified-install for the target version (suggests `nexus hub install` first, then re-run rate). Override: `--unverified` for the user's profile-only rating.

## index sync

```
nexus hub index sync [--out ~/.cache/nexus-hub/index.json]
```

ETag-aware. Skip on 304. Emits the local cached snapshot path on stdout — useful for agents that want to query offline.

## mirror

```
nexus hub mirror up                # docker-compose -f deploy/mirror.yml up -d
nexus hub mirror down              # ... down
nexus hub mirror status            # health endpoints, sync lag, disk usage
nexus hub mirror register \
   --hub https://hub.nexus.engine \
   --contact ops@studio-acme.example \
   --token $NEXUS_HUB_TOKEN
```

Operational details: `docs/guides/hub/self-hosting.md`.

## login / logout / whoami

```
nexus hub login                          # opens GitHub OAuth in browser, captures token
nexus hub logout                         # forgets token + revokes via API
nexus hub whoami [--json]                # echoes the authenticated account
```

Token lives in `~/.nexus/credentials.toml` with `0600` perms. Never logged. Never echoed to terminal except by `--show-token` (off by default).

## Exit codes (stable contract)

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | generic failure |
| 2 | usage error |
| 3 | network failure |
| 4 | authentication failure |
| 5 | not found (search returned 0 / show 404) |
| 6 | refused (eval verdict `do_not_adopt`; quarantined; license incompatible) |
| 7 | rate-limited (with `Retry-After` echoed) |
| 8 | mirror operation failure |

Exit codes are part of the CLI contract — change requires a major version bump of `nexus hub`. Matches the convention in `docs/guides/scripts-for-ai-agents.md`.

## `--json` shape stability

Every command's `--json` output validates against the schema at `GET /api/v1/cli/schemas/{command}.json`. Adding a field is additive; renaming or removing requires a major-version bump. Same discipline as `api.md` versioning.

## Worked agent examples

```bash
# Find verified MOBA-suitable crates for engine 0.4
nexus hub recommend --genre moba --engine '^0.4' --tier-min verified --json \
  | jq '.recommendations[] | {name: .target.name, score, reasons}'

# Install the top pick after a clean eval
top=$(nexus hub recommend --genre moba --engine '^0.4' --json | jq -r '.recommendations[0].target.name')
nexus hub eval "$top" --json > /tmp/eval.json
verdict=$(jq -r '.verdict' /tmp/eval.json)
if [ "$verdict" = "adopt" ]; then
  nexus hub install "$top"
fi

# Refresh local snapshot, then offline-search
nexus hub index sync --out ~/.cache/nexus-hub/index.json
jq '.crates[] | select(.summary | test("rng"))' ~/.cache/nexus-hub/index.json
```

These examples become the basis of `docs/guides/hub/agent-recipes.md`.

## Cross-references

- Top-level CLI: `docs/specs/coder/cli.md`, `docs/guides/scripts-for-ai-agents.md`
- Install resolution: `docs/specs/crates/nexus-add-resolution.md` (Agent 29 — may not yet exist)
- HTTP API: `api.md`
- Authentication: `identity.md`
- Telemetry on install: `telemetry.md`
