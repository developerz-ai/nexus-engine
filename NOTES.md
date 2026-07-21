# nexus-engine

Nexus Engine is an open-source (MIT), AI-first, cross-platform game engine designed to be built and maintained primarily by AI agents, for both AI agents and human developers. It is spec-driven: behavior is written as a spec under `docs/specs/**`, then a contract, then implementation, then tests — a PR that skips a stage or violates one of the project's 15 architectural laws is rejected by the `nexus-merge` pipeline. The repo is pre-alpha and docs-first; the editor is deliberately narrow (load, place, inspect, scrub, telemetry) and every editor action must have a matching agent JSON-RPC method.

- **Stack:** Rust (Cargo workspace, pinned via `rust-toolchain.toml`), with a Bun/Node layer for scripts and tooling (`bun.lock`, `biome.json`). Quality tooling: clippy, rustfmt, cargo-deny, cargo-fuzz, tarpaulin, criterion benches, ruff for Python helpers. CI via GitHub Actions; no single deploy target (engine + CLI + SDKs).
- **Key commands:** `cargo check --workspace` (Law 4 — must be green before push), plus the `scripts/` entry points (`scripts/build`, `scripts/check`, `scripts/test`, `scripts/bench`, `scripts/lint-scripts`, `scripts/scenario`, `scripts/replay`, `scripts/check-rpc-parity` for editor/RPC parity).
- **Layout:**
  - `crates/` — the workspace: `nexus-core`, `nexus-renderer`, `nexus-physics`, `nexus-audio`, `nexus-net`, `nexus-script`, `nexus-assets`, `nexus-agent`, `nexus-editor`, `nexus-cli`, `nexus-merge`, `nexus-hal`, plus `genres/`, `styles/`, `sdks/`.
  - `docs/specs/` and `docs/contracts/` — the source of truth; code must cite one.
  - `docs/architecture/` — vision, the 15 principles, system map, ADRs.
  - `docs/guides/`, `docs/prior-art/`, `docs/games/`, `docs/game-template/` — process guides, per-engine research, demo-game specs, `nexus new` scaffold.
  - `scripts/`, `ci/`, `benches/`, `fuzz/` — tooling, CI config, benchmarks, fuzz harnesses.
  - `.claude/` — a large subagent fleet (domain, genre, quality, deploy/liveops agents) plus commands and skills.
- **State as of 2026-07-21:** branch `main`, working tree was clean when this note was written. Remote `origin` is `developerz-ai/nexus-engine`.
