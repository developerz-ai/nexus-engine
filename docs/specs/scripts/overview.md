<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `scripts/` Convention — Overview

> Every Nexus repo ships a `scripts/` directory of tested, parameterized CLIs that AI agents can read, execute, and trust. Same shape in the engine repo and every game built from `nexus new`.

## Core Principle

AI agents work best with stable, parameterized, tested CLIs. The `scripts/` convention is identical across the engine repo and every game repo — a dev (with their AI) walks into any Nexus project and finds the same commands in the same place.

## Boundaries
- Owns: the `scripts/` directory layout, the CLI contract, `scripts/lib/` shared utilities, the discovery manifest, the script-tests stack.
- Does NOT own: CI YAML (calls scripts but doesn't replace them → `docs/guides/ci-and-scripts.md`), engine internals, agent prompts.
- Depends on: `→ docs/specs/coder/cli.md` (nexus-coder dispatches scripts), `→ docs/specs/agent/sdk.md` (scripts emit telemetry).

## Two Categories

| Category | Where | Who writes it |
|---|---|---|
| Seeded | `scripts/<name>` | Nexus contributors. Ships with engine + `nexus new`. |
| Custom | `scripts/custom/<name>` | Game dev (or their AI). `nexus upgrade` never overwrites. |

## Directory Layout

```
scripts/
├── manifest.toml         # source of truth: every script, every flag, every exit code
├── index.json            # generated from manifest.toml + --help; agent reads this
├── lib/                  # shared utilities, SOURCE-ONLY (never executed)
│   ├── log.sh
│   ├── log.py
│   ├── json.sh
│   ├── env.sh
│   ├── args.sh           # universal bash parser
│   ├── errors.sh
│   ├── telemetry.sh
│   ├── versions.toml     # pinned tool versions
│   ├── gh.sh
│   └── cargo.sh
├── tests/                # helpers shared across script tests
│   └── helpers.bash
├── custom/               # game-dev additions (template-side); empty in engine repo
├── <script-name>         # canonical entry, no extension, chmod +x
├── <script-name>.bats    # OR <script-name>.test.py / .test.ts — sibling test
└── ...
```

## The AI-Agent Contract (binding)

| Rule | Why |
|---|---|
| `--help` always exits 0, prints non-empty | agent discovery |
| `--json` always produces parseable JSON on stdout | agent parsing |
| `--quiet` suppresses stdout, leaves stderr for errors only | clean piping |
| `--verbose` adds debug to stderr | troubleshooting |
| `--dry-run` shows what would happen, no side effects | safe planning |
| no interactive prompts unless `--interactive` | agent-non-blocking |
| stable exit codes per script (table in `manifest.toml`) | agent branching |
| no positional args without `--help` docs | self-documenting |
| no stdin read unless `--stdin` passed | agent-safe |
| idempotent where physically possible | retries are free |

Full contract: `→ docs/specs/scripts/cli-contract.md`.

## Seeded Scripts (engine repo)

| Script | One-line purpose |
|---|---|
| `bootstrap` | install toolchains (rustup, nextest, bun, ruff, sccache) |
| `check` | run all gates: fmt, clippy, biome, ruff, shellcheck, naga, cargo-deny |
| `build` | wrap `cargo build` with sccache + features |
| `test` | nextest + scripts-tests + lua tests |
| `scenario` | run a TOML scenario via `nexus run --scenario` |
| `bench` | criterion benches with baseline compare |
| `replay` | `nexus replay <snapshot>` |
| `index-scripts` | regenerate `scripts/index.json` (pre-commit hook) |
| `new-script` | scaffold a new script + test + manifest entry |
| `lint-scripts` | shellcheck + ruff + bats lint + manifest consistency |
| `release-engine` | tag, build artifacts, sign, upload to GitHub release |
| `symbols-upload` | upload PDB/dSYM/source-maps |
| `triage-issues` | fetch GitHub issues, cluster by tag, JSON for crash-triager subagent |
| `sync-docs-index` | regenerate `docs/INDEX.md` from filesystem |

Game-repo seeded set: `→ docs/game-template/scripts/seed-list.md`.

## Discovery

Agents read `scripts/index.json` rather than guessing names. Schema + regeneration: `→ docs/specs/scripts/discovery.md`.

## Testing

Every seeded script ships a sibling test asserting `--help` exit 0 + non-empty, `--json --dry-run` produces valid JSON, bad-flag exits >1. Stack per language: `→ docs/specs/scripts/testing.md`.

## Style + Security

- Bash style + Python style + TS style: `→ docs/specs/scripts/style.md`
- Secrets, supply chain, signed commits under `scripts/`: `→ docs/specs/scripts/security.md`
- `scripts/lib/` architecture: `→ docs/specs/scripts/lib-architecture.md`

## Cross-References

- nexus-coder subagent dispatches scripts: `→ docs/specs/coder/cli.md`, `→ docs/specs/coder/tools.md`
- CI invokes scripts (never inlines logic): `→ docs/guides/ci-and-scripts.md`
- Agent-side recipe for invoking scripts: `→ docs/guides/scripts-for-ai-agents.md`
- Writing a new script: `→ docs/guides/scripts-write-your-own.md`
- Game-template seed list: `→ docs/game-template/scripts/seed-list.md`
- Extension rules for game devs: `→ docs/game-template/scripts/extension-rules.md`

## References

- POSIX Utility Conventions — https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html
- GNU Coding Standards (long options) — https://www.gnu.org/prep/standards/standards.html#Command_002dLine-Interfaces
- Unofficial Bash Strict Mode — http://redsymbol.net/articles/unofficial-bash-strict-mode/
