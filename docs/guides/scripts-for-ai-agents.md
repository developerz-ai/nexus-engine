<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — `scripts/` for AI Agents

> How a Claude Code / nexus-coder subagent invokes Nexus scripts. Always `--json`. Always check exit code. Never assume cwd. Always honor `NEXUS_ENV`.

## Discovery (always first)

```bash
jq '.scripts[] | {name, description, category, flags: [.flags[].name]}' scripts/index.json
```

Cache the result for the session. Re-read only if `scripts/index.json` mtime changes.

## Invocation Recipe

```bash
NEXUS_ENV=staging \
NEXUS_AGENT_ID=claude-opus-4-7 \
scripts/<name> --json --env staging [flags…]
```

| Step | Rule |
|---|---|
| 1 | resolve absolute path — never trust cwd |
| 2 | set `NEXUS_ENV` explicitly — no defaults |
| 3 | set `NEXUS_AGENT_ID` (your own ID) for telemetry attribution |
| 4 | always pass `--json` — parse, don't grep |
| 5 | always pass `--env` when the script lists it required (check index) |
| 6 | check `exit_code` — branch on it (table in index) |
| 7 | on `ok: false`, read `errors[].suggested_fix` first |
| 8 | on unknown error, escalate — do not retry blindly |

## Parsing the Envelope

```python
import json, subprocess

def run_script(name: str, *args: str) -> dict:
    r = subprocess.run(
        ["scripts/" + name, "--json", *args],
        capture_output=True, text=True, env=os.environ | {"NEXUS_AGENT_ID": "claude"}
    )
    env = json.loads(r.stdout)
    assert env["script"] == name
    assert env["exit_code"] == r.returncode
    return env

result = run_script("build", "--profile", "release", "--env", "dev")
if not result["ok"]:
    for err in result["errors"]:
        log.error(err["message"], suggested_fix=err.get("suggested_fix"))
```

## Branching on Exit Code

```python
EXIT = result["exit_code"]
match EXIT:
    case 0:  ...   # success
    case 2:  ...   # usage error — your invocation wrong, do not retry same way
    case 3:  ...   # config — fix Nexus.toml
    case 4:  ...   # precondition — run scripts/bootstrap
    case 5:  ...   # gate failed — code fix needed
    case 6:  ...   # external service — retry with backoff
    case 7:  ...   # timeout — increase --timeout or retry
    case 8:  ...   # partial — inspect errors[]
    case 10: ...   # network — retry
    case 20: ...   # not implemented — open issue
    case _:  ...   # unknown — escalate
```

Per-script extras live in `scripts/index.json` under `exit_codes[]`.

## Dry-Run First (planning)

```bash
scripts/deploy --json --dry-run --env staging
```

Returns the full envelope with `dry_run: true` and `data.plan: [...]` listing what would happen. Use this to confirm intent before live action.

## Never

| Don't | Do |
|---|---|
| `scripts/deploy` (interactive) | `scripts/deploy --json --dry-run --env staging` first |
| `bash scripts/deploy` (force interpreter) | trust the shebang |
| `cd repo/ && scripts/...` | set `NEXUS_ROOT` env var instead |
| read stdout as text | parse `--json` |
| pass secrets as flags | use env vars or sops |
| ignore exit code | branch on it |
| retry exit 2 | fix your invocation |

## Sample Agent Recipe (Claude subagent)

```markdown
---
name: build-and-test
description: Build the engine and run all gates. Triggers: build, compile, gate.
allowed-tools: [Bash, Read]
---

# Build & Test

1. Read scripts/index.json. Confirm `build`, `check`, `test` exist.
2. `scripts/bootstrap --dry-run --json` — verify toolchain. exit 4 → run for real.
3. `scripts/check --json --env dev` — fmt/clippy/lint gates. exit 5 → report and stop.
4. `scripts/build --json --env dev --profile dev` — exit 5 → compile failure, report.
5. `scripts/test --json --env dev --unit --integration` — exit 5 → test failure, report failing tests with file:line.
6. Emit one summary: passed gates, durations from envelopes.
```

## Honoring `NEXUS_ENV`

| Source (precedence high → low) | When used |
|---|---|
| `--env <name>` flag | explicit |
| `NEXUS_ENV` env var | inherited from caller |
| script default | only if manifest says optional |
| **error 2** | none of the above for required-env scripts |

Agents MUST pass `--env` explicitly when calling deploy/release/hotfix scripts. No exceptions.

## Telemetry

Every invocation emits `script.start` + `script.end` to `$NEXUS_ROOT/.cache/telemetry/scripts.jsonl`. Agent need not emit anything extra — the script handles it. Just set `NEXUS_AGENT_ID` so the audit trail attributes correctly.

## When the Index Is Stale

```bash
scripts/index-scripts --check --json
```

Exit 8 → drift. Run:

```bash
scripts/index-scripts --json
```

Commit the regenerated `scripts/index.json` in the same PR as the script change.

## Cross-References

- `→ docs/specs/scripts/cli-contract.md` — the contract you're relying on
- `→ docs/specs/scripts/discovery.md` — `index.json` schema
- `→ docs/specs/coder/tools.md` — how nexus-coder wires this into its toolbox
- `→ .claude/agents/` — subagent definitions that follow this recipe (Agent 23)
- `→ .claude/skills/` — skills that wrap scripts (Agent 24)
