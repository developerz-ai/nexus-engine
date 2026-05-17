<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Decisions Resolved

> One-line ledger of every cross-agent decision resolved during the post-32-agent integration pass. Pair file: `docs/architecture/decisions-open.md` (punch list for the next session).
>
> Format: `- <topic> — <resolution> — <files updated>`.
>
> Founder-approved defaults from `docs/initial/vision.md` and `CLAUDE.md` appear at the end under "Pre-integration constitutional choices".

---

## Resolved by integration pass (2026-05-17)

- **nexus-hub timing** — Ships **v1.0**. Agent 30 fully specced it; AI-first mandate requires the agent-readable index from day one. Updated: `docs/specs/crates/overview.md`, `docs/specs/crates/discovery.md` (both now cross-link `docs/specs/hub/overview.md` as the v1.0 source of truth).
- **Opt-in Modularity → Law #14** — **Ratified** via ADR `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`. Renumbered from "proposed #13" because Agent 27 took the #13 slot for RPC Parity. Appended to `docs/architecture/01-principles.md`.
- **Extend, Don't Fork → Law #15** — **Ratified** jointly via ADR `0010`. Renumbered from "proposed #14". Appended to `docs/architecture/01-principles.md`. `docs/architecture/proposed-law-14.md` updated to `Status: Ratified as Law #15 — see ADR 0010`.
- **WASM-component-model sandbox mode for crates** — **v2.0**. Updated: `docs/specs/crates/overview.md` §Open Questions; `docs/specs/crates/sandbox-mode.md` §Status; `docs/specs/crates/discovery.md` open questions.
- **GPL soft-allow** — **No** in v1.0. Revisit v2.0 only if community demand + isolation gate proven. Updated: `docs/specs/crates/licensing.md`.
- **Sigstore signing** — **Optional v1.0, mandatory v1.1**. Updated: `docs/specs/crates/security.md`.
- **Plugin trait duplication** — `docs/specs/crates/overview.md` now cross-links `docs/specs/crates/plugin-trait.md` and `docs/specs/crates/rails-plugin-model.md` (Agent 29 files). Agent 28 owns the surface; Agent 29 owns the trait + Rails analogy.
- **Verification Council composition** — **5 seats, 6-month rotation, at least 1 non-Anthropic AI maintainer**. Updated: `docs/guides/crates/community-policy.md`.
- **Reference benchmark machine** — **AMD Ryzen 9 7950X + RTX 4070 + 64 GB RAM, Linux** as the modal indie target circa 2026. Updated: `docs/architecture/03-tech-stack.md` §Reference machine. Referenced from Law 5 (`docs/architecture/01-principles.md`) and `docs/architecture/06-modularity.md`.
- **MSRV (minimum supported Rust version)** — **Rust 1.83 stable**. Updated: `docs/architecture/03-tech-stack.md` §Versioning policy.
- **Default Lua/Rune in `nexus-script`** — **Both default-on**; opt-out via Cargo features. Updated: `docs/specs/crates/categories.md` worked-example note (script-lang row); cross-referenced from `docs/architecture/06-modularity.md` honest-pitfalls section.

## Pre-integration constitutional choices (founder-approved, recorded here for completeness)

- **License** — MIT forever. No dual licensing. No open core. (`docs/initial/vision.md` §"The Open Source Mandate"; ADR `0004-mit-license.md`.)
- **Implementation language** — Rust. (ADR `0001-why-rust.md`.)
- **GPU abstraction** — wgpu. (ADR `0002-why-wgpu.md`.)
- **Engine architecture** — ECS. (ADR `0003-why-ecs.md`.)
- **Netcode default** — Rollback. (ADR `0005-rollback-netcode.md`.)
- **Headless default** — Every system runs without display, GPU, audio, input. (ADR `0006-headless-by-default.md`; Law 8.)
- **Determinism floor** — Same initial state + input sequence → bit-identical output. (ADR `0007-deterministic-replay.md`; Law 9.)
- **Editor model** — Editor is `agent_client_0` — every editor operation = one agent JSON-RPC method. (ADR `0008-editor-as-agent-client-zero.md`; Law 13.)
- **MCP** — Public interop protocol; one server fronts the agent surface. (ADR `0009-mcp-as-public-protocol.md`.)
- **Scripting** — Lua + Rune in the engine; mods sandboxed via the Rune VM by default.
- **Modding stance** — 100% moddable to total-conversion depth by default; engine takes 0% revenue forever.
- **Distribution lanes** — Dev installs at build time → crate. Player installs at runtime → mod. (Mastermind routing rule in `CLAUDE.md`.)

---

## How to use this file

- Reading: pair with `decisions-open.md` for the unresolved set and `cross-agent-flags.md` for `[AGENT: NN]` / `[VERIFY]` / `[INTEGRATION NEEDED]` flags.
- Writing: append a one-line entry when a `[DECISION NEEDED]` is resolved; update the affected files in the same PR (don't leave the spec stale).
- Amending: a resolution may be re-opened only via ADR under `docs/architecture/05-adr/`.
