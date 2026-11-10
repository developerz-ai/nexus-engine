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
| `check` | run six default gates in order: fmt, clippy, biome, ruff, shellcheck, deny; naga opt-in via `--only naga` |
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

## Local CI-Parity Contract (`bin/check`)

`./bin/check` mirrors the quality checks in `.github/workflows/ci.yml`; that workflow is authoritative. It is distinct from `scripts/check`, whose six defaults remain defined in `scripts/bin/check.ts:33`. Naga is opt-in there, not a default gate or a CI-parity addition. Do not add ruff, shellcheck, or naga to `bin/check` to achieve parity.

The historical baseline comprised seven blocking checks: fmt, clippy, cargo check, nextest, deny, script tests, and Biome. The resumed working tree already includes the two parity additions: a blocking SPDX sweep and advisory audit. This describes local source, not verified execution or the state of remote main. The table maps all nine CI checks to their current `bin/check` counterparts: eight block; audit is advisory.

| CI check | CI source anchor | Current local policy | `bin/check` source anchor |
|---|---|---|---|
| rust-fmt: `cargo fmt --all -- --check` | [L68](../../../.github/workflows/ci.yml#L68) | Blocking | [L30](../../../bin/check#L30) |
| rust-clippy: `cargo clippy --workspace --all-targets -- -D warnings` | [L92](../../../.github/workflows/ci.yml#L92) | Blocking | [L31](../../../bin/check#L31) |
| rust-check: `cargo check --workspace --all-targets` | [L115](../../../.github/workflows/ci.yml#L115) | Blocking | [L32](../../../bin/check#L32) |
| rust-test: `cargo nextest run --workspace --profile ci` | [L143](../../../.github/workflows/ci.yml#L143) | Blocking | [L33](../../../bin/check#L33) |
| rust-deny: `cargo deny check` | [L179](../../../.github/workflows/ci.yml#L179) | Blocking | [L34](../../../bin/check#L34) |
| rust-audit: `cargo audit` | [L181–204](../../../.github/workflows/ci.yml#L181-L204) | Advisory attempt, nonblocking | [L79–86](../../../bin/check#L79-L86) |
| scripts-test: `bun test` in `scripts/` | [L245–247](../../../.github/workflows/ci.yml#L245-L247) | Blocking | [L35–37](../../../bin/check#L35-L37) |
| scripts-lint: `bun x biome check .` in `scripts/` | [L281–286](../../../.github/workflows/ci.yml#L281-L286) | Blocking | [L35–38](../../../bin/check#L35-L38) |
| docs-spdx: tracked-file header sweep | [L297–334](../../../.github/workflows/ci.yml#L297-L334) | Blocking | [L41–77](../../../bin/check#L41-L77) |

Checkout, tool installation, caches, frozen dependency installation, and artifact upload are infrastructure steps, not additional quality gates. Parity concerns gate membership and blocking policy, not a rewrite of CI environments or matrices. Neither `.github/workflows/ci.yml` nor `scripts/bin/check.ts` changes for these additions.

### Failure and provisioning semantics

- Preserve nonzero failure from every existing hard gate and from the SPDX sweep, stopping before later checks or audit. A later successful command or advisory audit must never replace a hard-gate failure with exit 0; appending commands after an unguarded `&&` chain is not sufficient.
- Preserve existing required-tool preflight failures: exit 69 with guidance to run `./bin/setup`.
- Attempt `cargo audit` after all blocking checks pass, retaining its diagnostics and reporting success or its nonzero exit status. Report audit failure or unavailability visibly, but neither may fail an otherwise clean gate. Cargo-audit is not a required preflight tool; these additions do not change setup, dependencies, or lockfiles.

### SPDX acceptance policy

Match CI's tracked-file scope with NUL-delimited enumeration:

```sh
git ls-files -z -- 'crates/**' 'packages/**' 'scripts/**' 'docs/**' '.github/**'
```

Use exactly CI's case-pattern exemptions ([L309–321](../../../.github/workflows/ci.yml#L309-L321)):

```text
*.lock|*.png|*.jpg|*.jpeg|*.webp|*.ico|*.gif|*.svg|*.wasm|*.bin
*.json|*/bun.lock|*/Cargo.lock|*/package-lock.json
*/node_modules/*|*/target/*|*/.git/*
*.snap|*/snapshots/*
*/.placeholder|*/.bun-version|*/.keep|*/.nvmrc
```

Every remaining file must contain `SPDX-License-Identifier:` within its first 15 lines. This is the CI marker-presence rule, not an additional license-value or copyright check. Missing headers or failed file enumeration must exit nonzero; an enumeration error must not be mistaken for an empty successful scan. Preserve filenames containing spaces or newlines through enumeration, inspection, and diagnostics. Regression tests use isolated temporary fixtures, not mutations of the real Git index.

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
