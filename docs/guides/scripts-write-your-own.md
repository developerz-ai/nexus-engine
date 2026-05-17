<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — Write Your Own Script

> Step-by-step for game devs (and their AI). Scaffolds, contract, tests, lint, ship.

## Decision Tree

| Question | Answer |
|---|---|
| Engine repo or game repo? | game repo → script goes under `scripts/custom/` |
| One-off or reusable? | one-off → don't add; script it as ad-hoc shell |
| Lang? | bash if <100 lines + mostly subprocess; python if logic-heavy; ts if part of an existing ts toolchain |
| Category? | `bootstrap / build / test / dev / deploy / release / liveops / meta` — pick one |
| Needs secrets? | yes → load via `nx_sops_decrypt`, never flag |
| Touches prod? | yes → `--env` required, `--dry-run` mandatory |

## Step 1 — Scaffold

```bash
scripts/new-script --name pull-localization --lang py --category liveops
```

Creates:

| Path | Contents |
|---|---|
| `scripts/custom/pull-localization` | python entry, argparse skeleton, envelope helpers wired |
| `scripts/custom/pull-localization.test.py` | the 4 mandatory assertions stubbed |
| `scripts/manifest.toml` | entry appended |

`--lang bash` produces `scripts/custom/<name>` + `.bats`. `--lang ts` produces `<name>` + `.test.ts`.

## Step 2 — Define the `--help` Text

Before writing logic, write the help. Forces the contract early.

```python
def build_parser():
    p = argparse.ArgumentParser(
        prog="scripts/custom/pull-localization",
        description="Pull latest strings from Lokalise into assets/i18n/.",
    )
    p.add_argument("--lang", action="append", required=True,
                   help="ISO 639-1 code; repeatable: --lang en --lang fr")
    p.add_argument("--branch", default="main",
                   help="Lokalise branch to pull from. Default: main")
    p.add_argument("--out", default="assets/i18n/",
                   help="Output dir. Default: assets/i18n/")
    nx.args.attach_base(p)   # --help --json --quiet --verbose --dry-run --env
    return p
```

Run `scripts/custom/pull-localization --help`. Read it as an agent would. Iterate.

## Step 3 — Define the `--json` Schema

Write the envelope's `data` shape in `manifest.toml`:

```toml
[script.json_schema]
type = "object"
required = ["downloaded", "files"]
properties = { downloaded = { type = "integer" }, files = { type = "array", items = { type = "string" } } }
```

`scripts/lint-scripts` validates every `--json` output against this. Schema-first → AI agents can parse blindly.

## Step 4 — Implement

```python
def main():
    args = build_parser().parse_args()
    nx.env.require("LOKALISE_TOKEN")
    if args.dry_run:
        nx.envelope.emit(data={"downloaded": 0, "files": [], "plan": _plan(args)}, dry_run=True)
        return 0
    files = _fetch(args)
    nx.envelope.emit(data={"downloaded": len(files), "files": files})
    return 0
```

Rules:
- `--dry-run` MUST short-circuit before any side effect.
- All output via `nx.envelope.emit` — never `print(...)`.
- Logs via `nx.log.info(...)` → stderr.
- Exceptions caught at the top → translated to envelope `errors[]` + exit code from `errors.sh` table.

## Step 5 — Add to Manifest

`scripts/new-script` already added the stub. Fill in flags + exit codes:

```toml
[[script]]
name        = "pull-localization"
path        = "scripts/custom/pull-localization"
lang        = "py"
category    = "liveops"
description = "Pull latest strings from Lokalise into assets/i18n/."
since       = "0.3.0"
idempotent  = true
flags = [
  { name = "lang",   type = "string", multi = true, required = true },
  { name = "branch", type = "string", default = "main" },
  { name = "out",    type = "path",   default = "assets/i18n/" },
]
exit_codes = [
  { code = 0,  meaning = "success" },
  { code = 2,  meaning = "usage error" },
  { code = 10, meaning = "Lokalise API error" },
]
required_env = ["NEXUS_ENV", "LOKALISE_TOKEN"]
test_file = "scripts/custom/pull-localization.test.py"
```

## Step 6 — Write Tests

The scaffold has the 4 mandatory cases. Add domain-specific cases:

```python
def test_dry_run_lists_planned_files():
    r = subprocess.run([SCRIPT, "--json", "--dry-run", "--env", "dev",
                        "--lang", "en", "--lang", "fr"], capture_output=True, text=True)
    env = json.loads(r.stdout)
    assert env["dry_run"] is True
    assert "plan" in env["data"]

def test_missing_required_flag_exits_two():
    r = subprocess.run([SCRIPT, "--json", "--env", "dev"],
                       capture_output=True, text=True)
    assert r.returncode == 2
```

## Step 7 — Lint and Index

```bash
scripts/lint-scripts --json
scripts/index-scripts --json     # regenerates scripts/index.json
scripts/check --json             # runs all gates
```

| Failure | Likely cause |
|---|---|
| exit 2 from lint-scripts | manifest entry malformed |
| exit 5 from lint-scripts | shellcheck / ruff / biome violation |
| exit 8 from index-scripts | declared flags don't match `--help` output |

Fix until green.

## Step 8 — Commit

```bash
git add scripts/custom/pull-localization scripts/custom/pull-localization.test.py \
        scripts/manifest.toml scripts/index.json
git commit -s -S -m "scripts: add pull-localization (#NNN)"
```

`-s` (sign-off) + `-S` (gpg-sign) required for `scripts/` changes: `→ docs/specs/scripts/security.md`.

## Step 9 — Have Your AI Use It

Reload the agent's index cache. Subagent now sees the script and can invoke it via the standard recipe: `→ docs/guides/scripts-for-ai-agents.md`.

## Tips

| Symptom | Fix |
|---|---|
| flag parsing chaotic | use `nx.args.attach_base` / `nx_args_def` |
| logs leaking into stdout JSON | switch `print` → `nx.log.info` (goes to stderr) |
| can't reproduce CI locally | run the same `scripts/check` CI does |
| script grew beyond 300 LOC | extract reusable bits into `scripts/lib/<name>.<ext>` |

## Cross-References

- `→ docs/specs/scripts/cli-contract.md` — contract reference
- `→ docs/specs/scripts/style.md` — style rules
- `→ docs/specs/scripts/testing.md` — test stack
- `→ docs/game-template/scripts/extension-rules.md` — `scripts/custom/` rules
- `→ docs/guides/scripts-for-ai-agents.md` — how your AI will call it
