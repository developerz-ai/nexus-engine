<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates Ecosystem — Overview

> Nexus is Rust-native. The primary way community contributors extend the engine is by publishing **third-party crates** to crates.io that plug into the engine or game template at compile time. This lane is distinct from modding (runtime content, sandboxed) and from the engine's own workspace crates.

## Boundaries
- Owns: the crates-ecosystem spec tree (`docs/specs/crates/**`), publishing/consuming guides, naming and verification policy, manifest schema.
- Does NOT own:
  - Engine workspace layout → `docs/architecture/04-workspace-layout.md`
  - Runtime mod system → `docs/specs/mods/overview.md`
  - Dependency hygiene for engine itself → `docs/guides/coding-style/dependencies.md`
  - `Nexus.toml` schema → `docs/game-template/nexus-toml.md`
- Depends on: `docs/architecture/03-tech-stack.md`, `docs/architecture/01-principles.md` (Laws 3, 5, 7, 10, 11, 12), `docs/specs/mods/sdk.md` (stable-API discipline applies here too).

## The Three Distribution Layers

| Layer | Distribution | Trust | Sandbox | Engine API | Examples |
|---|---|---|---|---|---|
| Engine crates | This monorepo | Full | None | Internal | `crates/nexus-core`, `crates/nexus-renderer` |
| **Third-party crates** (this spec) | **crates.io / alt registries** | **Full (source-visible)** | **None** | **Public stable** | **`nexus-genre-survival-extreme`, `nexus-style-anime`, `nexus-telemetry-honeycomb`** |
| Mods → `docs/specs/mods/overview.md` | Mod marketplaces | Capability-gated | Rune / Lua VM | Mod SDK | Skins, gameplay tweaks, total conversions |

Restate this table in every overview that touches the crates ecosystem.

## When to ship as a crate vs a mod

| Need | Ship as | Why |
|---|---|---|
| New engine extension that compiles in (renderer style, physics integrator, netcode transport) | crate | Native speed; full engine API; no sandbox overhead |
| New genre layer (ECS components + systems + prefabs) reused across games | crate | Compiled, type-checked, semver-stable |
| Telemetry / asset-source / feature-flag backend | crate | Native I/O, native auth, no cap gate |
| Reusable helper library (math, AI behavior trees, RNG) | crate | Linked, optimized, deterministic |
| Player-installable content (skins, gameplay tweaks, total conversion) | mod | Runtime install, capability-gated, no rebuild |
| Anything end-users distribute peer-to-peer | mod | Sandbox required |

Rule of thumb: **dev installs at build time → crate. Player installs at runtime → mod.**

## The 100M-LOC Thesis

The engine ships finite. The ecosystem is unbounded. Most of Nexus's surface area at maturity is **community crates**, not engine code. Vision §"The Flywheel" depends on it.

Implication: every public engine API is a stable contract. Semver discipline is hard. Breakage compounds across thousands of downstream crates.

→ `docs/specs/crates/stable-api.md` for the stability tiers.

## AI-First (Law 1) Applied to Crates

Every crate in the Nexus ecosystem ships a machine-readable manifest in `Cargo.toml::[package.metadata.nexus]` (or sibling `nexus-crate.toml`). The manifest declares: category, engine compatibility, traits implemented, headless-safety, determinism, license, audit URL, agent-readable surface.

`nexus-coder` queries the index (JSON) → filters by category + engine compat + license + verification tier → runs scenario tests → installs. → `docs/guides/crates/agent-recipes.md`.

## Doc Map

```
docs/specs/crates/
├── overview.md            ← you are here
├── categories.md          ← canonical extension surfaces + trait registry
├── naming.md              ← nexus-* / nexus-community-* / nx-* policy
├── manifest.md            ← [package.metadata.nexus] schema
├── stable-api.md          ← tiers, semver, deprecation, shim policy
├── discovery.md           ← crates.io, lib.rs, nexus-hub, awesome-list
├── quality-bar.md         ← Verified / Community / Quarantine tiers + audit
├── licensing.md           ← allow-list, forbidden list, compat matrix
├── security.md            ← cargo-deny, cargo-audit, cargo-vet, SBOM
├── versioning.md          ← semver discipline, public-API definition
├── testing.md             ← coverage floor, scenario + bench requirements
├── release-pipeline.md    ← nexus crate publish flow
├── sandbox-mode.md        ← [DECISION NEEDED] WASM-component-model opt-in (v2.0?)
└── awesome-nexus.md       ← placeholder pointing to community awesome-list

docs/guides/crates/
├── publishing.md          ← author flow end-to-end
├── consuming.md           ← consumer flow + troubleshooting
├── migrating.md           ← cross-major migration playbook
├── curated-list.md        ← starter crates that ship day one
├── agent-recipes.md       ← nexus-coder discovery / evaluation / authoring
└── community-policy.md    ← governance, verification council
```

## Wiring Into `Nexus.toml`

The `[crates]` and `[plugins]` sections of `Nexus.toml` consume crates from this ecosystem. Schema lives in `docs/game-template/nexus-toml.md` (Agent 15 — not owned by us). The category enum used by those sections is canonical in `docs/specs/crates/categories.md`.

## CLI Surface

| Command | Owned by | Purpose |
|---|---|---|
| `nexus add <crate>` | `docs/game-template/cli.md` | resolve manifest, check compat, add to `Cargo.toml` + `Nexus.toml` |
| `nexus crate new <name>` | `docs/specs/crates/release-pipeline.md` | scaffold a category template |
| `nexus crate test` | `docs/specs/crates/testing.md` | run the crate's category-required test pack |
| `nexus crate publish` | `docs/specs/crates/release-pipeline.md` | `cargo publish` + index register + audit attestation |
| `nexus crate audit <name>` | `docs/specs/crates/quality-bar.md` | run the curator playbook |

Full consumer flow: → `docs/guides/crates/consuming.md`. Full author flow: → `docs/guides/crates/publishing.md`.

## Non-Negotiables

1. **MIT default.** `nexus-*` namespace MUST ship under MIT (Law 7). Other approved licenses allowed in `nexus-community-*` and `nx-*`.
2. **Stable public API.** Every engine trait a third-party crate implements is in a documented stability tier.
3. **Machine-readable manifest.** The `[package.metadata.nexus]` block is mandatory for crates claiming a Nexus category.
4. **Semver discipline.** Breakage that ripples across the ecosystem triggers a compat shim, not a community-wide migration crunch.
5. **Supply-chain hygiene by default.** `cargo-deny` + `cargo-audit` mandatory in CI; `cargo-vet` for Verified tier. → `docs/specs/crates/security.md`.
6. **AI-first.** `nexus-coder` is a first-class participant in authoring, consuming, and auditing crates.

## Aspirational Bar

| Crate ecosystem | What we learn |
|---|---|
| Bevy plugins (`bevy_*`) ✓ | Plugin trait + community discovery via `lib.rs/bevy` |
| Tokio ecosystem ✓ | Foundational crate + huge halo (axum, hyper, tower) |
| Embassy ✓ | Coherent embedded async story; clear contribution path |
| Ruby on Rails gems ✓ | Convention-over-config + Rails-aware gems |
| async-std vs tokio split ✗ | Cautionary: ecosystem split when stability is unclear |
| node-gyp / native modules ✗ | Cautionary: cross-platform binary deps are a tax |

## Integration Points

- → `docs/architecture/04-workspace-layout.md` — internal vs external crate boundary.
- → `docs/specs/mods/overview.md` — the runtime-content lane (mutually exclusive distribution).
- → `docs/specs/mods/sdk.md` — stable-API discipline; applies symmetrically here.
- → `docs/game-template/cli.md` — `nexus add` / `nexus crate *` surface.
- → `docs/game-template/nexus-toml.md` — `[crates]` / `[plugins]` consumer-side wiring.
- → `docs/guides/coding-style/dependencies.md` — license filter, version pinning, supply chain.
- → `docs/specs/coder/tools.md` — tools `nexus-coder` calls when authoring/consuming/auditing.

## Open Questions

- **RESOLVED 2026-05-17** — `nexus-hub` federated index ships **v1.0**. Canonical spec: `docs/specs/hub/overview.md` (Agent 30). Discovery cross-link in `docs/specs/crates/discovery.md`. See `docs/architecture/decisions-resolved.md`.
- **RESOLVED 2026-05-17** — WASM-component-model sandbox mode for crates: **v2.0, opt-in**. Design doc: `docs/specs/crates/sandbox-mode.md`.
- **RESOLVED 2026-05-17** — GPL soft-allow: **no in v1.0**. Revisit v2.0. Locked in `docs/specs/crates/licensing.md`.
- **RESOLVED 2026-05-17** — Verification Council: **5 seats, 6-month rotation, ≥ 1 non-Anthropic AI maintainer**. Locked in `docs/guides/crates/community-policy.md`.
- `[VERIFY — crates.io policy changes]` confirm name-squatting rules (https://crates.io/policies) and yank semantics current at v1.0 ship date.

Cross-link: plugin trait + Rails analogy live in `docs/specs/crates/plugin-trait.md` and `docs/specs/crates/rails-plugin-model.md` (Agent 29). Manifesto: `docs/architecture/06-modularity.md`. Workspace exemplars: `docs/architecture/04-workspace-layout.md`.
