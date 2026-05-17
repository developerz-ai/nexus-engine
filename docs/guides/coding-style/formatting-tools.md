<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Formatting Tools

Exact versions. One way to invoke. Pre-commit hook. CI gate.

Engine and game template share `rust-toolchain.toml`, `.tool-versions`, and the pre-commit config. Pinning is part of the engineering contract — drift = bug.

## Pinned versions

| Tool | Version | Pinned in | Purpose |
|------|---------|-----------|---------|
| `rustc` | `1.85.0` | `rust-toolchain.toml` | compiler |
| `rustfmt` | bundled | `rust-toolchain.toml` | Rust format |
| `clippy` | bundled | `rust-toolchain.toml` | Rust lint |
| `cargo-deny` | `0.16.x` | `.tool-versions` | Rust supply-chain |
| `cargo-nextest` | `0.9.x` | `.tool-versions` | Rust test runner |
| `cargo-llvm-cov` | `0.6.x` | `.tool-versions` | Rust coverage |
| `naga-cli` | `0.20.x` | `.tool-versions` | WGSL validate |
| `biome` | `2.0.x` | `package.json` | TS/JS format + lint |
| `pnpm` | `9.x` | `package.json` `packageManager` | TS/JS PM |
| `vitest` | `2.x` | `package.json` | TS test |
| `ruff` | `0.7.x` | `pyproject.toml` | Python format + lint |
| `pyright` | `1.1.x` | `pyproject.toml` | Python types |
| `uv` | `0.5.x` | `.tool-versions` | Python PM |
| `pytest` | `8.x` | `pyproject.toml` | Python test |
| `stylua` | `0.20.x` | `.tool-versions` | Lua format |
| `selene` | `0.27.x` | `.tool-versions` | Lua lint |
| `busted` | `2.x` | vendored | Lua test |
| `sqlfluff` | `3.2.x` | `pyproject.toml` (dev) | SQL format + lint |
| `taplo` | `0.9.x` | `.tool-versions` | TOML format |
| `actionlint` | `1.7.x` | `.tool-versions` | GH Actions lint |
| `ajv-cli` | `5.x` | `package.json` | JSON Schema validate |
| `pre-commit` | `3.8.x` | `.tool-versions` | hook runner |

Cite: rust-lang.org/toolchain · biomejs.dev/internals/versioning · docs.astral.sh/ruff/versioning.

## Single command, every tool

`nexus fmt` and `nexus lint` are the engine's universal entrypoints. The game template ships the same commands. Underneath:

```bash
# nexus fmt
cargo fmt --all
biome format --write .
ruff format .
stylua .
taplo format
sqlfluff format --dialect postgres .

# nexus lint
cargo clippy --workspace --all-targets --all-features -- -D warnings
biome check .
ruff check .
selene .
sqlfluff lint --dialect postgres .
naga-cli validate $(git ls-files '*.wgsl')
actionlint
ajv validate -s schemas/<schema>.json -d <data>.{json,toml}     # per pair
cargo deny check
pnpm audit --prod --audit-level=moderate
uv run pip-audit --strict
```

Both commands exit non-zero on any failure. Both emit JSON output to nexus-merge.

## Pre-commit (`.pre-commit-config.yaml`)

Drop at workspace root. Identical in engine and game template.

```yaml
default_install_hook_types: [pre-commit, commit-msg]
fail_fast: false
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-merge-conflict
      - id: check-added-large-files
        args: [--maxkb=2048]
      - id: mixed-line-ending
        args: [--fix=lf]

  - repo: https://github.com/doublify/pre-commit-rust
    rev: v1.0
    hooks:
      - id: fmt
        args: [--all, --]
      - id: clippy
        args: [--workspace, --all-targets, --, -D, warnings]

  - repo: https://github.com/biomejs/pre-commit
    rev: v2.0.0
    hooks:
      - id: biome-check
        args: [--write]

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.7.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/JohnnyMorganz/StyLua
    rev: v0.20.0
    hooks:
      - id: stylua

  - repo: https://github.com/Kampfkarren/selene
    rev: 0.27.1
    hooks:
      - id: selene

  - repo: https://github.com/tamasfe/taplo-pre-commit
    rev: 0.9.3
    hooks:
      - id: taplo-format
      - id: taplo-lint

  - repo: https://github.com/sqlfluff/sqlfluff
    rev: 3.2.0
    hooks:
      - id: sqlfluff-fix
      - id: sqlfluff-lint

  - repo: local
    hooks:
      - id: wgsl-validate
        name: WGSL validate (naga-cli)
        entry: scripts/validate-wgsl.sh
        language: script
        files: \.wgsl$

      - id: license-header
        name: SPDX MIT header check
        entry: scripts/check-license-header.sh
        language: script
        types_or: [rust, ts, tsx, python, lua, wgsl, sql, toml]

      - id: conventional-commit
        name: Conventional Commits
        entry: scripts/check-commit-msg.sh
        language: script
        stages: [commit-msg]
```

Setup: `nexus init` (in template) or `pre-commit install` (engine) runs once. Every commit downstream is gated.

## CI (`/.github/workflows/style.yml`)

```yaml
name: style
on: [push, pull_request]

jobs:
  fmt-lint:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@1.85.0
        with: { components: rustfmt, clippy }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: astral-sh/setup-uv@v3
      - uses: JohnnyMorganz/setup-stylua@v2
        with: { version: 0.20.0 }

      - run: nexus fmt --check          # diff-only, fail if changes needed
      - run: nexus lint --json | tee lint.json
      - uses: actions/upload-artifact@v4
        with: { name: lint-report, path: lint.json }
```

`nexus lint --json` produces structured output:

```json
{
  "tool": "clippy",
  "file": "crates/nexus-renderer/src/lib.rs",
  "line": 42,
  "column": 7,
  "severity": "error",
  "code": "clippy::unwrap_used",
  "message": "used `.unwrap()` on a `Result` value",
  "suggested_fix": "use `?` operator"
}
```

nexus-merge parses this directly. → `docs/guides/merge-system.md`

## Editor integration

| Editor | Setup |
|--------|-------|
| VS Code / Cursor | `.vscode/extensions.json` recommends: rust-analyzer, biomejs.biome, charliermarsh.ruff, sumneko.lua, taplo, sqlfluff. `settings.json` sets `formatOnSave: true`. |
| Zed | `.zed/settings.json` enables format-on-save per language. |
| Helix | `.helix/config.toml` (vendored) per language. |
| Neovim | `.nvim.lua` (optional) — uses LSPs for the above tools. |

Engine ships `.vscode/`, `.zed/`, `.helix/` configs. Game template inherits them. No per-developer setup.

## Drift detection

CI runs `nexus tools verify` every PR:

```bash
nexus tools verify
# Checks:
# - rust-toolchain.toml matches CI rust version
# - .tool-versions matches CI installs
# - package.json `packageManager` matches CI pnpm
# - pyproject.toml dev-deps match the pinned table above
```

Fails on any drift. Forces deliberate version bumps.

## Upgrading tools

1. Update the version table in this doc.
2. Bump pins in `rust-toolchain.toml`, `.tool-versions`, `package.json`, `pyproject.toml`.
3. Bump `.pre-commit-config.yaml` rev tags.
4. Run `nexus fmt && nexus lint` locally. Fix any new warnings.
5. PR with conventional commit `chore(deps): bump <tool> to <version>`.
6. nexus-merge runs full matrix and gates.

[DECISION NEEDED] — auto-bump cadence: weekly Renovate / monthly batched?

## Cross-link

- → `rust.md`, `typescript.md`, `python.md`, `lua.md`, `wgsl.md`, `sql.md`, `toml-json.md`
- → `dependencies.md` (supply-chain audits)
- → `docs/guides/merge-system.md` (Agent 16, JSON parsing)
- → `docs/guides/testing/ci.md` (CI pipeline contract)
