<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Publishing Guide

> End-to-end author flow. Scaffold → implement trait → test → audit → publish. Verified tier needs Council attestation; non-Verified ships with one command.

→ Pipeline spec: `docs/specs/crates/release-pipeline.md`.
→ Manifest spec: `docs/specs/crates/manifest.md`.
→ Council and Verified flow: `docs/guides/crates/community-policy.md`.

## Prerequisites

| Tool | Install |
|---|---|
| Rust stable + cargo | `https://rustup.rs` |
| `nexus` CLI | `curl -fsSL https://nexus-engine.dev/install.sh | bash` |
| `cargo-deny` | `cargo install cargo-deny --locked` |
| `cargo-audit` | `cargo install cargo-audit --locked` |
| `cargo-public-api` | `cargo install cargo-public-api --locked` |
| `cargo-semver-checks` | `cargo install cargo-semver-checks --locked` |
| `cargo-cyclonedx` | `cargo install cargo-cyclonedx --locked` |
| `cargo-vet` (Verified only) | `cargo install cargo-vet --locked` |
| `cosign` (Verified only) | `https://docs.sigstore.dev/system_config/installation` |

One-shot: `nexus doctor --crate-author` checks every prereq, prints structured JSON of missing pieces.

## Step 0 — Pick a category

Read `docs/specs/crates/categories.md`. Pick exactly one. Your crate name and trait choice follow.

## Step 1 — Scaffold

```
nexus crate new nexus-style-anime --category style
```

Produces:

```
nexus-style-anime/
├── Cargo.toml                       ← [package.metadata.nexus] block prefilled
├── LICENSE                          ← MIT default
├── README.md                        ← template with category + trait
├── CHANGELOG.md                     ← Keep-a-Changelog header
├── CONTRIBUTING.md                  ← contribution checklist
├── deny.toml                        ← cargo-deny config from licensing.md
├── .github/
│   └── workflows/ci.yml             ← CI template per testing.md
├── src/
│   ├── lib.rs                       ← SPDX header + trait impl skeleton
│   └── style.rs                     ← StylePipeline impl stub
├── tests/
│   ├── integration.rs               ← integration test skeleton
│   └── scenarios/
│       └── smoke.toml               ← scenario test stub
├── benches/                         ← criterion stub (only if perf claim)
└── fuzz/                            ← cargo-fuzz harness (only for parsers)
```

`--category style` enables the `style`-specific extras: visual-regression dirs, shader skeleton, golden image placeholder.

## Step 2 — Implement the trait

`src/style.rs` opens with the trait skeleton from `docs/specs/styles/overview.md`:

```rust
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 You <you@example.com>
//! Anime / cel-shaded StylePipeline for Nexus Engine.
//!
//! Implements: docs/STYLE.md
#![forbid(unsafe_code)]
#![warn(missing_docs)]

use nexus_engine::style::{StylePipeline, StyleContext, StyleError};

/// Cel-shaded anime style.
pub struct AnimeStyle { /* ... */ }

impl StylePipeline for AnimeStyle {
    const ID: &'static str = "nexus-style-anime";
    const ENGINE_COMPAT: &'static str = ">=1.0, <2.0";

    fn build(&self, ctx: &mut StyleContext) -> Result<(), StyleError> { todo!() }
}
```

Write the impl. Run `cargo check` between edits. Use the engine traits documented in their owning spec — never reach for `pub(crate)` items.

## Step 3 — Test

```
nexus crate test                     # full pack: unit + doc + scenarios + headless + coverage
nexus crate test --scenarios         # just scenarios
nexus crate test --coverage --json   # JSON output for CI
```

Per category test floor: `docs/specs/crates/testing.md` § Coverage floors.

Categories with extra requirements (visual regression for `style`, determinism replay for `physics`, etc.) get a banner from `nexus crate test` listing what's still missing.

## Step 4 — Pre-publish dry run

```
nexus crate publish --dry-run --json
```

Runs every step of the pipeline up to (but not including) `cargo publish`. Catches:
- Missing manifest fields.
- License mismatches.
- Naming-policy violations.
- Failed semver check.
- `cargo-deny` / `cargo-audit` failures.
- Coverage below floor.

Fix issues. Re-run. Iterate until JSON output reports `ok: true`.

## Step 5 — Crates.io auth

First-time:

```
cargo login                          # paste token from crates.io account settings
```

Stored at `~/.cargo/credentials.toml`. CI uses `CARGO_REGISTRY_TOKEN` env. Cite: `https://doc.rust-lang.org/cargo/reference/publishing.html`.

## Step 6 — Publish

```
nexus crate publish
```

JSON-streamed output of all 12 steps. On success:
- Crate on crates.io.
- GitHub release tagged.
- SBOM published.
- `nexus-hub` index entry created.

On failure: structured error per step. Re-run after fix. Already-published versions can't be modified; bump the version and retry.

## Step 7 — Verified-tier promotion (optional)

`nexus crate publish` ships you as Community by default. To promote:

1. Open a Verification Request:
   ```
   nexus crate audit nexus-style-anime --request-verification
   ```
   Files an issue against the Verification Council queue.

2. A `crate-curator` subagent (or human Council member) runs the 15-step audit playbook (`docs/specs/crates/quality-bar.md`).

3. On pass: Council member runs `nexus crate audit <name> --attest`. Attestation uploads to `nexus-hub`; your entry flips to Verified tier within 5 minutes.

4. Future patch releases preserve Verified status if `cargo-semver-checks` reports no breaking change. Minor and major releases require re-audit.

## Step 8 — Maintenance

| Event | Action |
|---|---|
| Engine ships a new minor | `nexus crate test --engine=<new>` to confirm compat |
| Engine ships a new major | Migrate per `docs/guides/crates/migrating.md` |
| CVE in your dep tree | `cargo audit` fires in CI; bump dep, publish patch |
| User opens an issue | Conventional Commit fix → publish patch |
| You add a new trait method | Bump minor (with default impl) or major (without) |
| You change error codes | Bump major |

## CI template (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        engine: ["1.0", "1.1", "1.2"]
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cargo test --workspace --no-fail-fast
      - run: cargo test --doc
      - run: nexus crate test --headless --frames=60 --engine=${{ matrix.engine }}
      - run: nexus crate test --scenarios --engine=${{ matrix.engine }}
      - run: nexus crate test --coverage --engine=${{ matrix.engine }} --json
      - run: cargo deny check
      - run: cargo audit --deny=warnings
      - run: cargo semver-checks check-release
      - if: matrix.engine == '1.2' && matrix.os == 'ubuntu-latest'
        run: cargo public-api --diff-git-checkouts main HEAD

  publish:
    needs: test
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: nexus crate publish
        env:
          CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}
```

## Common pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Forgot `[package.metadata.nexus]` | `CR_E_CATEGORY_UNKNOWN` on publish | Add the block; see `docs/specs/crates/manifest.md` |
| License in `Cargo.toml` differs from LICENSE file | `CR_E_LICENSE_MISMATCH` | Make them match |
| `engine_versions` open-ended (`>=1.0`) | Warn; refused under `--verified` | Cap with `<2.0` |
| `git` dep in release | `cargo-deny` fails | Publish the dep to crates.io first |
| MSRV bump in patch release | `cargo-semver-checks` warns | Bump minor; document in CHANGELOG |
| Naming collision with existing Verified crate | Index rejects | Rename; consult `docs/specs/crates/naming.md` |
| First publish of `nexus-*` name | Squat alert | Reserve via `nexus crate reserve` before initial publish |
| Forgot to bump version | `cargo publish` rejects (version exists) | Bump per Conventional Commit footer |
| Tried to republish a yanked version | crates.io rejects | Bump and republish; don't re-yank |

## What "good" looks like

The first time a stranger runs `nexus add nexus-style-anime` and it works, the package is good. The first time `nexus-coder` autonomously picks it from the index, evaluates it, installs it, and ships a feature using it without human intervention, it's great. The bar is autonomous AI consumption with zero human handholding.

## Cross-references

- → `docs/specs/crates/overview.md`
- → `docs/specs/crates/release-pipeline.md` — every CLI step explained.
- → `docs/specs/crates/quality-bar.md` — what the audit checks.
- → `docs/guides/crates/migrating.md` — engine major bumps.
- → `docs/guides/crates/community-policy.md` — Verification Council.
- → `docs/guides/coding-style/dependencies.md` — engine-wide dep hygiene.

## Open Questions

- `[DECISION NEEDED]` Whether a "publish-and-forget" mode auto-PRs against `awesome-nexus`. Default: yes for Verified, no for Community.
- `[DECISION NEEDED]` Should `nexus crate new` enforce a `tests/scenarios/smoke.toml` minimum, or just warn? Default: warn in v1.0, enforce in v1.1.
