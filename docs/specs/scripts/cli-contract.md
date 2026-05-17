<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `scripts/` — CLI Contract

> Every script in `scripts/` (engine + every game repo) conforms to this contract. Non-negotiable. Tested in CI by `scripts/lint-scripts`.

## Required Flags (every script)

| Flag | Short | Type | Required | Default | Description |
|---|---|---|---|---|---|
| `--help` | `-h` | switch | no | — | print help, exit 0. Respects `--json`. |
| `--json` | — | switch | no | off | structured JSON on stdout. No prose. |
| `--quiet` | `-q` | switch | no | off | suppress stdout. Errors still go to stderr. |
| `--verbose` | `-v` | switch | no | off | debug logs to stderr. |
| `--dry-run` | `-n` | switch | no | off | print plan, perform no side effects. |
| `--no-color` | — | switch | no | off | strip ANSI from TTY output. |
| `--version` | — | switch | no | — | print `name version` and exit 0. |

## Conditionally-Required Flags

| Flag | When required | Description |
|---|---|---|
| `--env <name>` | any script that touches env-scoped resources | `dev` \| `staging` \| `prod`. No magical default. |
| `--target <triple>` | any script that emits per-platform artifacts | rust triple or platform tag. |
| `--interactive` | any script that wants stdin/tty prompts | otherwise prompts are forbidden. |
| `--stdin` | any script that reads stdin | otherwise stdin is ignored. |
| `--config <path>` | any script that consumes a config file | override default `./Nexus.toml`. |
| `--out <path>` | any script that writes a file | required if multiple targets possible. |
| `--format <fmt>` | any script with multiple output formats | `json` \| `text` \| `csv` \| `toml`. |

## Forbidden

| Anti-pattern | Why |
|---|---|
| magical defaults for `--env` | silent prod actions |
| reading stdin without `--stdin` | breaks agent pipelines |
| interactive prompts without `--interactive` | blocks subagents |
| positional args without `--help` documentation | undiscoverable |
| writing to absolute paths outside repo | sandbox escape |
| `echo $SECRET` anywhere | leak risk |
| `curl … \| sh` | supply chain |
| network calls without `--allow-network` opt-in for `--dry-run` | dry-run must be offline |

## Standard Exit Codes (base)

| Code | Meaning | Caller action |
|---|---|---|
| 0 | success | proceed |
| 1 | generic failure | inspect stderr |
| 2 | usage error (bad flag, missing required) | fix invocation |
| 3 | config / manifest error | fix `Nexus.toml` |
| 4 | precondition failed (missing tool, wrong state) | run `bootstrap` |
| 5 | gate failed (lint, test, check) | fix code |
| 6 | external service error | retry, escalate |
| 7 | timeout | retry with `--timeout` |
| 8 | partial success | inspect `errors[]` in `--json` |
| 10 | network / IO error | retry |
| 20 | not-yet-implemented | open issue |
| 124 | killed by timeout signal | as above |
| 130 | SIGINT (Ctrl-C) | user cancel |

Each script MAY extend with codes 30–99. Codes documented in `scripts/manifest.toml` and exposed in `--help`.

## `--json` Output Schema (universal envelope)

Every script invoked with `--json` produces exactly one JSON object on stdout:

```json
{
  "script": "build",
  "version": "0.1.0",
  "schema": "1",
  "ok": true,
  "exit_code": 0,
  "started_at": "2026-05-17T08:00:00Z",
  "ended_at": "2026-05-17T08:00:42Z",
  "duration_ms": 42000,
  "dry_run": false,
  "env": "dev",
  "data": { /* script-specific payload */ },
  "errors": [
    { "code": 5, "message": "clippy failed", "location": "crates/core/src/ecs.rs:42", "suggested_fix": "run scripts/check --fix" }
  ],
  "warnings": [],
  "telemetry": { "duration_ms": 42000, "agent_id": "claude-opus-4-7" }
}
```

Error envelope schema: `→ docs/specs/scripts/lib-architecture.md` (`scripts/lib/errors.sh`).

## Standard Environment Variables

| Var | Default | Used by |
|---|---|---|
| `NEXUS_ROOT` | repo root (autodetect) | every script — never `cd` relative |
| `NEXUS_ENV` | unset | overrides `--env` if flag omitted; missing → error |
| `NEXUS_AGENT_ID` | `human` | telemetry attribution |
| `NEXUS_LOG_FORMAT` | `text` if TTY else `json` | log lines |
| `NEXUS_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `NEXUS_DRY_RUN` | unset | global dry-run override |
| `NEXUS_NO_TELEMETRY` | unset | opt out of telemetry emission |
| `NEXUS_CACHE_DIR` | `$NEXUS_ROOT/.cache` | sccache, downloads |

`scripts/lib/env.sh` loads `.env`, `.env.<NEXUS_ENV>`, then `.env.local`. Validates required keys per-script.

## Standard Log Format

Text mode (TTY, non-`--json`):

```
HH:MM:SS  LEVEL  script  message  key=value …
```

JSON mode (`--json` OR non-TTY OR `NEXUS_LOG_FORMAT=json`):

```json
{"ts":"2026-05-17T08:00:00Z","level":"info","script":"build","msg":"compiling","kv":{"crate":"core","feature":"gpu"}}
```

Logs go to **stderr**. Only the result envelope goes to stdout. Always.

## Idempotency

Scripts that touch state SHOULD be idempotent. If they can't:

| Marker | Meaning |
|---|---|
| `idempotent = true` (manifest) | safe to re-run |
| `idempotent = false` (manifest) | document why in `--help` |

## Help-Text Format

Every `--help` MUST include, in order:

1. one-line description (matches `manifest.toml`)
2. usage line: `Usage: scripts/<name> [FLAGS]`
3. flag table
4. exit-code table
5. examples (at least one with `--json`, one with `--dry-run`)
6. `See also:` cross-links to related scripts

With `--help --json`, output is the entry from `scripts/index.json` for this script.

## Compliance Test

`scripts/lint-scripts` enforces, per script:

- `--help` exits 0, prints non-empty
- `--help --json` validates against the index schema
- `--json --dry-run` produces a parseable envelope
- unknown flag exits 2
- no `read` without `--stdin` documented
- no `echo` of any var matching `*KEY*|*TOKEN*|*SECRET*|*PASS*`

Test details: `→ docs/specs/scripts/testing.md`.

## References

- POSIX 12.2 Utility Syntax Guidelines — https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html
- GNU Long Options — https://www.gnu.org/prep/standards/standards.html#Command_002dLine-Interfaces
- 12-Factor CLI (Heroku) — https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46
