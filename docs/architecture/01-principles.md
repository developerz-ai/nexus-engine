<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Principles (The 15 Binding Laws)

> Derived from the constitution: `docs/architecture/00-vision.md`.
> Every spec, contract, PR, ADR, and line of code MUST satisfy these laws.
> A PR that violates a law is rejected by `nexus-merge` without human review.
> → `docs/guides/merge-system.md`

These are LAWS, not guidelines. "We made an exception" is never a valid argument.
The only way to violate a law is to amend it via ADR (see `docs/architecture/05-adr/`),
which requires a documented Context, Decision, and Consequences entry.

---

## Law 1 — AI-First, Always

**Statement.** Every public API, error, log, telemetry stream, and tool surface MUST be machine-readable, structured, and consumable by an AI agent with no human in the loop.

**Test of conformance.**
- An AI agent can drive the system end-to-end via `nexus-agent-sdk` without ever opening a GUI.
- Every error returns `{ code, message, location, suggested_fix, context }`. Strings only are forbidden.
- Every log line is structured (JSON, `tracing` schema). Unstructured `println!` is forbidden in shipped code.

**Rationale.** Vision §"The Nexus Thesis", §"The AI-First Mandate".

**Enforced by.** `nexus-merge` lints: `no_unstructured_log`, `no_string_only_error`, `api_has_machine_contract`.

**Cross-refs.** → `docs/specs/agent/api.md`, `docs/specs/agent/telemetry.md`, `docs/specs/agent/sdk.md`.

---

## Law 2 — Spec Before Code

**Statement.** No code is written without an approved spec in `docs/specs/` or `docs/contracts/`. The spec is the contract; the code implements it.

**Test of conformance.**
- Every crate's `lib.rs` documents the spec it implements: `//! Implements: docs/specs/<system>/<file>.md @ <commit>`.
- Every PR references at least one spec file. PRs that add behavior not in a spec MUST add the spec in the same PR.
- The spec is the single source of truth. When implementation diverges, the spec wins or the spec is updated (in the same PR).

**Rationale.** 100M LOC at maturity. Without specs, drift kills the project before v1.0.

**Enforced by.** `nexus-merge` lints: `pr_references_spec`, `crate_declares_spec`.

**Cross-refs.** → `docs/guides/ai-dev-onboarding.md`, `docs/guides/pr-protocol.md`.

---

## Law 3 — Sacred Module Boundaries

**Statement.** Crates communicate only through their published contracts in `docs/contracts/`. Reaching across a module boundary (private types, internal modules, undocumented hooks) is forbidden.

**Test of conformance.**
- Every cross-crate dependency is declared in `docs/contracts/<a>-<b>.md`.
- `cargo deny` enforces an allow-list of edges in the workspace graph. New edges require a contract.
- A renderer change MUST NOT require a core change unless the `core-renderer.md` contract changes (and that change is its own reviewed PR).

**Rationale.** Modules must evolve independently. Boundaries decay into mud without rigid enforcement.

**Enforced by.** `cargo deny`, `nexus-merge` lint: `boundary_crossing_requires_contract`.

**Cross-refs.** → `docs/contracts/`, `docs/architecture/04-workspace-layout.md`.

---

## Law 4 — Always Compiles, Always Green

**Statement.** `main` is always green: compiles on every supported target, all tests pass, all demo games run, all benchmarks within budget.

**Test of conformance.**
- CI matrix covers Linux, Windows, macOS, Android, iOS, Web on every PR to `main`.
- A red `main` blocks all merges until restored. Median time-to-green: < 1 hour.
- Every demo game in `docs/games/` is exercised by CI as an integration test.

**Rationale.** Vision: "Ship working software over perfect architecture."

**Enforced by.** `nexus-merge` requires green CI; integration team owns regressions. → `docs/guides/integration-team.md`.

---

## Law 5 — Performance Is a Spec

**Statement.** Every public API in a spec declares a Performance Contract (target + hard limit). Regressions are bugs.

**Test of conformance.**
- Every spec has a "Performance Contract" table (see SPEC FORMAT in `docs/initial/spawn.md`).
- A continuous benchmark suite measures every contract on a reference machine on every PR.
- A regression beyond the hard limit blocks merge. A regression beyond the target requires a justification comment and is logged.

**Rationale.** Games are real-time. Perf is correctness.

**Enforced by.** `nexus-merge` runs benches; threshold violations block. Reference machine: **AMD Ryzen 9 7950X + RTX 4070 + 64 GB RAM, Linux** (modal indie target circa 2026). Pinned in `docs/architecture/03-tech-stack.md` §"Reference machine". Resolved 2026-05-17 — see `docs/architecture/decisions-resolved.md`.

**Cross-refs.** → every `docs/specs/**/*.md`.

---

## Law 6 — Zero `unsafe` Without Justification

**Statement.** `unsafe` is forbidden in Nexus crates unless accompanied by a `// SAFETY:` block citing (a) the invariant, (b) why safe alternatives are insufficient, (c) the test or fuzz that proves the invariant.

**Test of conformance.**
- `#![forbid(unsafe_code)]` is the default on every crate. Opt-out requires `#![deny(unsafe_op_in_unsafe_fn)]` and a documented exception in the crate's `Cargo.toml` metadata.
- Every `unsafe` block has a `// SAFETY:` comment with the three required parts.
- `cargo geiger` runs in CI; counts are tracked over time. Trend MUST be flat or down.

**Rationale.** Rust gives us memory safety for free. Throwing it away requires a written argument.

**Enforced by.** `nexus-merge` lint: `unsafe_requires_safety_block`.

**Cross-refs.** → `docs/architecture/05-adr/0001-why-rust.md`.

---

## Law 7 — MIT Forever

**Statement.** Nexus Engine is MIT licensed. The license never changes. Sub-projects, plugins, and tools in the official org are MIT. Dependencies introduced into the core MUST be MIT or MIT-compatible (Apache-2.0, BSD-2/3, ISC, Zlib, MPL-2.0 in isolated crates only).

**Test of conformance.**
- `cargo deny` license check passes on every PR. Allow-list documented in `deny.toml`.
- GPL, AGPL, LGPL, SSPL, BUSL, "source available", "fair source", "commons clause" — all rejected.
- Every file starts with `SPDX-License-Identifier: MIT` and `Copyright (c) 2026 Nexus Engine contributors`.

**Rationale.** Unity 2023. Vision §"The Open Source Mandate". `docs/architecture/05-adr/0004-mit-license.md`.

**Enforced by.** `cargo deny`, `nexus-merge` lint: `file_has_spdx_header`.

---

## Law 8 — Headless By Default

**Statement.** Every system runs headlessly. The renderer, audio, window, and input subsystems are optional. The engine simulates correctly with no display, no GPU, no speakers, no input device.

**Test of conformance.**
- `nexus run --headless` runs any game at simulation speed (≥ real-time, configurable multiplier).
- The CI matrix exercises every demo game in headless mode on every PR.
- A subsystem that cannot run headless is a bug. Hard failure mode is forbidden; soft no-op + telemetry warning is required.

**Rationale.** AI agents debug headlessly. CI runs headlessly. Servers run headlessly. → `docs/architecture/05-adr/0006-headless-by-default.md`.

**Enforced by.** Integration team CI; `nexus-merge` lint: `headless_smoke_passes`.

**Cross-refs.** → `docs/specs/agent/headless.md`.

---

## Law 9 — Deterministic Replay

**Statement.** Given the same initial world state and the same input sequence, the engine produces bit-identical output on the same target. Always.

**Test of conformance.**
- A snapshot + input log can be replayed and produces the same final snapshot hash.
- Cross-machine determinism is tested in CI for fixed-point physics + networking. → `docs/specs/physics/determinism.md`.
- Floating-point determinism is best-effort cross-platform; bit-exact within a single target is required. → `docs/architecture/05-adr/0007-deterministic-replay.md`.
- Sources of non-determinism (wall-clock time, thread scheduling, unseeded RNG, iteration order of hashmaps) are banned in game logic. Use `nexus_core::time::SimTime`, `nexus_core::rand::SeededRng`, ordered collections.

**Rationale.** Replay is the AI agent's debugger. Rollback netcode requires it. Bisecting bugs requires it.

**Enforced by.** `nexus-merge` lint: `no_wallclock_in_sim`, `no_unseeded_rng`, `no_unordered_collection_iteration`. Replay smoke test on every PR.

**Cross-refs.** → `docs/specs/agent/replay.md`, `docs/specs/networking/rollback.md`.

---

## Law 10 — Structured Errors Only

**Statement.** Every error type implements `nexus_core::error::StructuredError` with `code: &'static str`, `message: String`, `location: SourceLoc`, `suggested_fix: Option<String>`, `context: serde_json::Value`. String-only errors, `panic!` for control flow, and untyped `Box<dyn Error>` at API boundaries are forbidden.

**Test of conformance.**
- All public `Result<_, E>` return types use a typed enum implementing `StructuredError`.
- `panic!` is reserved for invariant violations (caller bug). Recoverable errors return `Err`.
- Every error code is documented in the system's "Error Contract" table.

**Rationale.** Law 1. Agents cannot fix what they cannot parse.

**Enforced by.** Compile-time trait bound; `nexus-merge` lint: `error_implements_structured`.

**Cross-refs.** → `docs/specs/core/events.md` (for error events), every spec's "Error Contract" section.

---

## Law 11 — Telemetry By Default

**Statement.** Every system emits structured telemetry every frame, with zero configuration. Telemetry is on; opting out is opt-out, not opt-in.

**Test of conformance.**
- Every system declares a telemetry schema in its spec (see `docs/specs/agent/telemetry.md`).
- Subscribing to a telemetry stream from `nexus-agent-sdk` requires zero code in the game.
- Overhead budget: < 1% frame time at default verbosity. → enforced by Law 5.

**Rationale.** Agents debug by observing. Observation must be free.

**Enforced by.** `nexus-merge` lint: `system_declares_telemetry_schema`.

**Cross-refs.** → `docs/specs/agent/telemetry.md`, `docs/contracts/core-agent.md`.

---

## Law 12 — Tests Ship With Code

**Statement.** Every PR that adds or changes behavior includes the tests that prove it. Untested behavior does not exist.

**Test of conformance.**
- Every public function has at least one unit test or doc-test.
- Every spec's "Test Requirements" section is implemented as integration tests.
- Coverage floor: per-crate line coverage MUST NOT decrease in a PR. New code MUST be ≥ 80% line covered.
- Property tests (via `proptest`) required for any algorithm with non-trivial invariants (ECS scheduler, physics, netcode).
- Fuzz tests (`cargo fuzz`) required for any parser or deserializer.

**Rationale.** 100M LOC. AI-generated. Tests are the only thing keeping it correct.

**Enforced by.** `nexus-merge` runs `cargo llvm-cov` and the spec-to-test mapping check. Coverage delta < 0 blocks.

**Cross-refs.** → `docs/guides/pr-protocol.md`, `docs/guides/ai-dev-onboarding.md`.

---

## Law 13 — Agent–Editor RPC Parity

**Statement.** Every editor operation has a matching agent JSON-RPC method. Every agent JSON-RPC method either has a matching editor surface or is explicitly tagged `surfaces = ["headless"]` with a justification. The editor is `agent_client_0` — same RPC, same handshake, same capability gating — never a privileged backdoor.

**Test of conformance.**
- The two registries `crates/nexus-editor/registry/editor_actions.toml` and `crates/nexus-agent/registry/rpc_methods.toml` agree under the auditor in `scripts/check-rpc-parity`.
- Every editor action `id` equals its `rpc` method name (one-to-one names; sub-namespaced by dots).
- For every action, programmatically invoking the matching RPC produces a snapshot-hash-equal world delta to the editor-driven invocation.
- A PR that adds an editor button without an RPC, or adds an editor-tagged RPC without a button, fails CI with the corresponding `PARITY_*` error code (→ `docs/specs/editor/rpc-parity.md`).
- Headless-only methods are tagged in `rpc_methods.toml` with a PR-body justification reviewed by `principle-keeper`.
- The MCP server (→ `docs/specs/agent/mcp-server.md`) exposes the same tool set generated from the same registries.

**Rationale.** AI agents must reach every operation a human can perform. Replay across humans + agents requires identical RPC paths. MCP wraps one surface, not two. Editor scope stays narrow because every feature pays an RPC tax it would have to pay anyway. → ADR 0008 (`docs/architecture/05-adr/0008-editor-as-agent-client-zero.md`).

**Enforced by.** `nexus-merge` lint `editor_rpc_parity` (auditor at `scripts/check-rpc-parity`); `editor-rpc-parity-auditor` subagent on every editor- or RPC-touching PR.

**Cross-refs.** → `docs/specs/editor/overview.md`, `docs/specs/editor/rpc-parity.md`, `docs/specs/agent/api.md`, `docs/specs/agent/mcp-server.md`, `docs/architecture/05-adr/0008-editor-as-agent-client-zero.md`, `docs/architecture/05-adr/0009-mcp-as-public-protocol.md`.

---

## Law 14 — Opt-in Modularity

**Statement.** No game compiles code it does not declare. Every genre, every style, every physics extension, every networking backend, every audio DSP pack is a separate crate OR a Cargo feature, default-off unless required by `nexus-core`. The default-features set is minimal core only; everything else opts in via `Nexus.toml`.

**Test of conformance.**
- `cargo tree -e features` on any demo game shows only declared features.
- Removing a crate from `Nexus.toml` removes it from the compile graph (verified by `cargo build --build-plan --json`).
- No crate sets `default-features = ["all"]`.
- No cyclic feature graph.

**Rationale.** 100M-LOC thesis (`docs/initial/vision.md` §"The Nexus Thesis"). Nobody compiles 100M LOC for any one game. Each game compiles the subset it asks for. Full manifesto: `docs/architecture/06-modularity.md`.

**Enforced by.** `nexus-merge` lints `no_default_all_features`, `no_cyclic_features`, `feature_gate_required_for_cross_genre_dep`; `cargo deny` edge allow-list; `principle-keeper` subagent (final gate).

**Cross-refs.** → `docs/architecture/06-modularity.md`, `docs/architecture/04-workspace-layout.md`, `docs/architecture/feature-flag-matrix.md`, `docs/specs/crates/overview.md`, `docs/specs/crates/categories.md`, `docs/specs/crates/plugin-trait.md`, `docs/specs/crates/rails-plugin-model.md`, `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`.

---

## Law 15 — Extend, Don't Fork

**Statement.** Nexus is closed for source modification, open for extension. Every public engine API is a stable extension surface. Every common need has a sanctioned plugin lane (compile-time crate, Cargo feature, runtime plugin, mod, script, agent RPC, editor override). A PR that modifies engine-core source for a feature expressible as an extension is rejected without human review.

**Test of conformance.**
- No PR touches `crates/nexus-{core,renderer,physics,audio,networking,scripting,assets,agent,editor}/src/**` without a linked `Status: Accepted` ADR. Enforced by `nexus-merge` rule `no-engine-source-mod-without-rationale` (`docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`).
- Every extension surface is documented as such: trait declared in its system spec, registered in `docs/specs/crates/categories.md`, stability tier in `docs/specs/crates/stable-api.md`.
- Every common forking motivation has a cookbook entry (`docs/guides/extend-not-fork-cookbook.md`); ≥ 14 entries at v1.0.
- Engine majors ship a compat shim crate (`nexus-engine-compat-(N-1)`) for one-major back, per `docs/specs/crates/stable-api.md` §"The Compat Shim Pattern".
- Whitelist exceptions (bug fix, perf fix, docstring, deps bump, test-only, compat-shim) are mechanically detected and bypass the gate.

**Rationale.** Every game engine fork in history died: Quake source-mods fragmented; Source SDK derivatives froze when Valve pivoted; UE5 fork-merge cost is engineer-weeks per kloc per year. The Open/Closed Principle (Meyer 1988; Martin 1996) is the structural answer. Full manifesto: `docs/architecture/07-extend-dont-fork.md`. Vision §"The Nexus Thesis", §"The Flywheel".

**Enforced by.** `nexus-merge` rule `no-engine-source-mod-without-rationale`; `principle-keeper` subagent (PR review + appeal handling); architect council (ratifies new extension surfaces via ADR).

**Cross-refs.** → `docs/architecture/07-extend-dont-fork.md`, `docs/architecture/proposed-law-14.md`, `docs/guides/extend-not-fork-cookbook.md`, `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`, `docs/specs/crates/overview.md`, `docs/specs/crates/categories.md`, `docs/specs/crates/plugin-trait.md`, `docs/specs/crates/stable-api.md`, `docs/specs/mods/overview.md`, `docs/specs/agent/api.md`, `docs/architecture/06-modularity.md`, `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`.

---

## Law summary table

| # | Law | One-line | Enforcer |
|---|---|---|---|
| 1 | AI-First, Always | Structured everything | `nexus-merge` lints |
| 2 | Spec Before Code | No code without a spec | `pr_references_spec` |
| 3 | Sacred Boundaries | Contracts gate every edge | `cargo deny` + `boundary_crossing_requires_contract` |
| 4 | Always Compiles | `main` is always green | CI matrix gate |
| 5 | Performance Is a Spec | Targets + hard limits per API | benchmark gate |
| 6 | Zero `unsafe` w/o justification | `// SAFETY:` block required | `unsafe_requires_safety_block` |
| 7 | MIT Forever | License never changes | `cargo deny` + SPDX header |
| 8 | Headless By Default | Every system runs without display | `headless_smoke_passes` |
| 9 | Deterministic Replay | Same input → same output | replay smoke + lints |
| 10 | Structured Errors | No string-only errors | `error_implements_structured` |
| 11 | Telemetry By Default | Every system observable for free | `system_declares_telemetry_schema` |
| 12 | Tests Ship With Code | Coverage floor, no regressions | `cargo llvm-cov` gate |
| 13 | Agent–Editor RPC Parity | Every editor button has an RPC; every editor-tagged RPC has a button | `editor_rpc_parity` (`scripts/check-rpc-parity`) |
| 14 | Opt-in Modularity | No game compiles code it does not declare | `no_default_all_features` + `cargo deny` edge allow-list |
| 15 | Extend, Don't Fork | Engine core closed for modification; every need has an extension lane | `no-engine-source-mod-without-rationale` |

---

## Amendment process

A law can be amended only by:
1. An ADR in `docs/architecture/05-adr/` titled `NNNN-amend-law-X.md` with full Status / Context / Decision / Consequences / Alternatives.
2. Demonstration that no existing spec or contract depends on the prior wording, OR a migration plan for every dependent spec.
3. Approval by the integration team charter process. → `docs/guides/integration-team.md`.

A law cannot be repealed if it derives directly from a constitutional commitment in `docs/architecture/00-vision.md` §"The Commitment". Those clauses are immutable for the life of the project.
