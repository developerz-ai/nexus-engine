# Reviewer instructions — developerz-ai/nexus-engine

> Read by the developerz.ai reviewer at EVERY review of this repository, at the reviewed
> commit, as this repo's own layer of the reviewer's prompt. It refines the platform rules
> (a finding is cited or withheld) and never overrides them. `CLAUDE.md` and the 15 Laws in
> `docs/architecture/01-principles.md` are the source of truth; this file is their
> review-time distillation. Keep it under 12,000 characters — past that it is cut.

## Stack

Rust 1.95 (edition 2021, pinned in `rust-toolchain.toml`) Cargo workspace over `packages/`, `games/`, `tools/` (and `crates/`, now empty), plus a Bun 1.4.4 + TypeScript workspace under `scripts/` linted by Biome. Key deps: wgpu, naga, rapier, glam, mlua, rune, tokio, quinn, thiserror, tracing-subscriber. The gate is `./bin/check`: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo check --workspace --all-targets`, `cargo nextest run --workspace --profile ci`, `cargo deny check`, `(cd scripts; bun test; bun x biome check .)`, then a blocking SPDX-header sweep; `cargo audit` runs last as advisory. Exit 69 means a gate tool is missing (run `./bin/setup`), not a red change. A change that does not pass it is not proven, whatever its description says.

## What to reject

**Spec-driven pipeline (`CLAUDE.md` § The Four-Stage Pipeline, Law 2)**
- Impl without a spec: every PR cites a `docs/specs/**` or `docs/contracts/**` path (`CONTRIBUTING.md`). New behaviour starts at a spec in `docs/guides/spec-format.md` format.
- A change crossing a system boundary without a contract under `docs/contracts/`.
- A crate touching what its spec does not declare (Law 3, sacred module boundaries).
- An edit to engine-core source with no ADR under `docs/architecture/05-adr/` (Law 15, `docs/architecture/07-extend-dont-fork.md`): extend via a crate, plugin, mod, script, RPC or editor override.
- An edit to `docs/architecture/00-vision.md` or `docs/architecture/01-principles.md` without an ADR.
- A public API without a Performance Contract table (Law 5); an invented performance number instead of `[BENCHMARK NEEDED]`.

**Rust (`CLAUDE.md` § Conventions and § Forbidden Behaviors)**
- `unsafe` without a `// SAFETY:` paragraph proving the invariants; a crate relaxing the workspace `unsafe_code = "forbid"` lint without that justification (Law 6, `Cargo.toml`).
- `anyhow` in a `nexus-*` crate, `anyhow::anyhow!(...)` or string-only errors in shipped code: errors are `thiserror` enums (Law 10, `docs/architecture/03-tech-stack.md`).
- `println!` / `eprintln!` outside `examples/` and `tests/`: logs are structured JSON to stderr via tracing (Law 11).
- A system that does not emit structured per-frame telemetry, or a path that needs a display or GPU to boot (Law 8, headless by default).
- A change that breaks deterministic replay (Law 9: same seed + same inputs = byte-identical state, also with mods loaded).
- A dependency added outside the workspace pins in `Cargo.toml`, a version not pinned to minor, or one `cargo deny check` (`deny.toml`) would refuse.
- A game compiling code it does not declare in its `Nexus.toml` (Law 14, `docs/game-template/nexus-toml.md`).

**Editor, agent API and modding**
- An editor button or operation without exactly one agent JSON-RPC method (Law 13). The editor is quick-load + place + inspect + scrub + telemetry, never a code editor.
- A mod-callable engine API whose spec does not answer "is this safely mod-callable?", or a mod spec that relaxes the capability sandbox in `docs/specs/scripting/sandbox.md`.

**Tests (Law 12, `docs/guides/testing/coverage.md`)**
- An impl PR without unit + integration + scenario tests, or one that drops a crate below its coverage floor.
- A skipped, ignored or loosened test added to get green.

**Licence and files (Law 7, `docs/guides/file-conventions.md`)**
- A new source or doc file under `crates/`, `packages/`, `scripts/`, `docs/` or `.github/` without an SPDX MIT header in its first lines (the `docs / spdx` job and `bin/check` both enforce it). Exemptions are the lockfile, binary, JSON, snapshot and pin files `bin/check` lists.
- A dependency whose licence is not on the `[licenses]` allow-list in `deny.toml`.

**Scripts (`CLAUDE.md` § Scripts convention, `scripts/CLAUDE.md`)**
- A CLI under `scripts/` that is not tested, parameterized, JSON-emitting and registered in `scripts/manifest.toml`, or `scripts/index.json` not regenerated with it.
- A TS/JS linter other than Biome, or a Biome rule silenced to get green.

**CI and gate drift**
- A CI job added, renamed or removed in `.github/workflows/ci.yml` without the matching change to `bin/check` (they mirror each other step for step), or an SPDX scan scope that diverges between the two.
- `cargo audit` made blocking or a blocking job made `continue-on-error`: only `rust / audit` is advisory.

**PR shape (`CONTRIBUTING.md`)**
- A PR title not `<system>: <imperative>` (Conventional Commits accepted for cross-cutting `chore:`, `docs:`, `ci:`), subject over 50 characters.

## Gates that matter

- `.github/workflows/ci.yml` on every pull request: `rust / fmt`, `rust / clippy`, `rust / check`, `rust / test`, `rust / deny`, `scripts / test`, `scripts / lint`, `docs / spdx`. A PR is proven when all of them are green on its head; `./bin/check` is the local mirror.
- `rust / audit` is advisory (`continue-on-error: true`): a red audit alone does not block.
- `cargo check --workspace` green is Law 4: never accept "fixed in a follow-up" for a compile break.

## Never flag

- Formatting: `rustfmt` (`rustfmt.toml`) owns Rust, Biome (`biome.json`) owns TS/JS.
- `Cargo.lock`, `bun.lock`, `scripts/index.json` (generated by `scripts/index-scripts`), snapshots and `target/`.
- Phase 0 stub crates that declare `Status: stub (Phase 0 scaffold)`: an empty crate is the current state, not a defect.
- `[DECISION NEEDED]` and `[BENCHMARK NEEDED]` markers that are tracked in `docs/architecture/decisions-open.md` / `docs/architecture/benchmarks-pending.md`: the house way to record an open decision or an unmeasured number. A marker added without its row there is still a finding.
- Terse, fragment-style docs and the routing tables in `CLAUDE.md` and `.claude/`: chosen on purpose.
- Planned-but-absent tools the docs already label as such (`scripts/check-rpc-parity`, `nexus add`).
- Working directly in the checkout with no git worktrees: a deliberate rule.
- The `.dz/` directory's own layout, `.codegraph/`, `.mcp.json`: platform or local tooling.
