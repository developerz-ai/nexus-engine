<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Stable API Promise

> The engine ships a public stable API. Community crates target it. Semver discipline keeps them working across engine releases. Compat shims cover the one-major-back window.

→ Overview: `docs/specs/crates/overview.md`.
→ Mirror discipline for mods: `docs/specs/mods/sdk.md`.
→ Semver: `https://semver.org`. Rust API guidelines: `https://rust-lang.github.io/api-guidelines/`.

## Stability Tiers

Every public item in every `nexus-*` engine crate carries one of four tiers, declared via doc-comment header and tracked in the per-system spec.

| Tier | Promise | When to use | Removal policy |
|---|---|---|---|
| **Stable** | Won't break in any `1.x` release. Breaking change requires `2.0` + one-major shim. | Default for items used by community crates and games. | Deprecation → one major overlap → remove |
| **Provisional** | May change in a minor release with a `CHANGELOG` entry. Community use allowed with warning. | New API graduating to Stable; under field validation. | Deprecation → one minor overlap → remove |
| **Unstable** | May change or vanish in any patch. Hidden behind feature `nexus-unstable`. | Experimental; no SLA. | No notice required |
| **Internal** | `pub(crate)` or sealed trait. Not part of public surface. | Implementation detail. | N/A |

Tier declaration shape:

```rust
/// Render a frame.
///
/// # Stability
/// **Stable** since `nexus-renderer 1.0`. Part of the public renderer API consumed by `nexus-style-*` crates.
pub fn render(&mut self, world: &World) -> Result<(), RenderError> { … }
```

## Per-System Trait Registry

The traits a third-party crate implements. Each is declared canonically in one spec. Adding a trait = additive minor. Removing a trait = breaking major.

| Trait | Canonical spec | Stability tier | Category |
|---|---|---|---|
| `GenrePlugin` | `docs/specs/genres/plugin-trait.md` `[NEW]` | Stable | `genre` |
| `StylePipeline` | `docs/specs/styles/overview.md` | Stable | `style` |
| `PhysicsBackend` | `docs/specs/physics/overview.md` | Stable | `physics` |
| `NetTransport` | `docs/specs/networking/transport.md` | Stable | `net` |
| `AudioBackend` | `docs/specs/audio/overview.md` | Stable | `audio` |
| `DspPack` | `docs/specs/audio/overview.md` | Provisional v1.0 → Stable v1.2 | `audio` |
| `AssetSource` | `docs/specs/assets/generation.md` | Stable | `asset-source` |
| `TelemetrySink` | `docs/specs/agent/telemetry.md` | Stable | `telemetry-sink` |
| `FlagProvider` | `docs/guides/liveops/feature-flags.md` | Provisional v1.0 → Stable v1.1 | `feature-flag` |
| `InputDevice` | `docs/specs/core/hal.md` | Stable | `input` |
| `PlatformBackend` | `docs/specs/core/hal.md` | Stable | `platform` |
| `ScriptVm` | `docs/specs/scripting/overview.md` | Provisional v1.0 → Stable v1.3 | `script-lang` |

`[AGENT: 04, 07, 09, 10, 12]` Confirm trait location and tier in your owning specs.

## Semver Discipline

| Change | Engine bump | Notes |
|---|---|---|
| Add trait | minor (`1.0` → `1.1`) | Existing impls unaffected |
| Add method with default impl to trait | minor | Default avoids break |
| Add method without default to trait | **major** | Existing impls fail to compile |
| Add associated type | **major** | Same |
| Add struct field (non-`#[non_exhaustive]`) | **major** | Construction breaks |
| Add struct field (struct is `#[non_exhaustive]`) | minor | Mark structs `#[non_exhaustive]` early |
| Add enum variant (non-`#[non_exhaustive]`) | **major** | Match exhaustiveness breaks |
| Add enum variant (enum is `#[non_exhaustive]`) | minor | Mark enums `#[non_exhaustive]` |
| Tighten function bounds | **major** | Caller code may fail to typecheck |
| Loosen function bounds | minor | Caller code unaffected |
| Rename public item | **major** | `pub use old as new;` shim doesn't help — see "rename" below |
| Remove `pub use` re-export | **major** | Treat re-exports as part of the public surface |
| Change panic to `Err` | minor (in our discipline) | Documented; existing callers tolerate |
| Change `Err` variant message text | patch | Not part of the public contract |
| Change `Err` variant code (the `&'static str`) | **major** | Codes are part of the Error Contract (Law 10) |

Cite: `https://doc.rust-lang.org/cargo/reference/semver.html` (Cargo's canonical SemVer compatibility table — extend, do not contradict).

## Public-API surface (the definition)

A symbol is part of the public API if **either**:
1. It is `pub` and reachable from the crate root via `pub` re-exports, OR
2. It appears in the signature of a `pub` item that satisfies (1).

Tools:
- `cargo public-api` — emit the surface as text; diff in CI. → `https://github.com/cargo-public-api/cargo-public-api`.
- `cargo semver-checks` — detect breaking changes pre-publish. → `https://github.com/obi1kenobi/cargo-semver-checks`.

`nexus crate publish --verified` runs both; non-additive change without major bump is a hard reject.

## Minimum supported engine version per crate

Every crate's `[package.metadata.nexus].engine_versions` declares the supported semver range. `nexus add` refuses to install a crate whose range excludes the project's engine version (with override flag `--force-compat`).

Example: `engine_versions = ">=1.2, <2.0"` says "needs at least 1.2 (uses an API added in 1.2), works through 1.x but not 2.x".

When 2.0 ships, the crate continues to work via the **compat shim** (below) without a republish.

## The Compat Shim Pattern

For one major version back, engine `N.x` ships a shim crate that re-exports the previous major's surface mapped onto the current implementation.

```
engine 2.x
  └── nexus-engine-compat-1/      ← shim crate
        └── re-exports the 1.x trait set, types, and free fns
        └── crates targeting engine_versions ">=1.0, <2.0" depend on this shim
        └── ships in the workspace; community crates declare it as the bridge
```

Author flow with shim:

```toml
# Cargo.toml — crate works on engine 1.x and 2.x via shim
[dependencies]
nexus-engine = "2.0"
nexus-engine-compat-1 = "1.x"     # re-exports 1.x names mapped onto 2.x

[package.metadata.nexus]
engine_versions = ">=1.0, <3.0"   # widened by virtue of shim
```

Shim policy:
- Shim is shipped in `crates/nexus-engine-compat-N/` (the engine workspace).
- Shim documented in `MIGRATION.md` per major.
- Shim retired one major after introduction: engine `3.0` drops the `1.x` shim.
- Crates running through a shim get a `warn`-level structured log event each session — visible to the author via `nexus crate health <name>`.

Cite mods discipline: `docs/specs/mods/sdk.md` § Compatibility Shim — same policy applies symmetrically.

## Deprecation Policy

Standard Rust `#[deprecated]` attribute, extended with machine-readable note:

```rust
#[deprecated(
    since = "1.4",
    note = "Use `RenderGraph::add_node_v2`. Removal: 2.0. Migration: docs/MIGRATIONS/1.4-render-graph.md"
)]
pub fn add_node(&mut self, …) { … }
```

| Phase | Action |
|---|---|
| `1.4` | Mark `#[deprecated(since="1.4", note="…", removal="2.0")]`. Call sites warn at compile time. |
| `1.5..1.99` | API still works. `nexus crate audit` lists deprecated-API users per crate. |
| `2.0` | API removed from primary surface. Shim crate (`nexus-engine-compat-1`) still re-exports it. |
| `2.x` | Shim still works. Community crates have one major to migrate. |
| `3.0` | Shim retired. Crates that never migrated fail to compile on `3.x`. |

Machine-readable deprecation notes: `nexus crate audit` parses the `removal` and `note` keys; surfaces upgrade guidance to `nexus-coder`. (The `removal` key is a Nexus convention parsed by our tooling — Cargo ignores it, which is fine.)

## What "stable" does NOT cover

| Out of scope | Why |
|---|---|
| MSRV bumps within the same engine major | We bump MSRV in minor releases; crates pin via `rust-version` |
| Internal panic messages | Not part of API |
| Bench wall-clock numbers | Performance Contract (Law 5) is in the spec, not the API |
| Wgpu / winit / tokio versions | Foundational deps may bump under semver-major hide via patch versions; we pin in workspace |
| The exact composition of the `prelude` module | Items in prelude have their own per-item tier |

## Integration Points

- → `docs/specs/crates/versioning.md` — the consumer-side semver discipline.
- → `docs/specs/crates/manifest.md` — `engine_versions` field.
- → `docs/specs/crates/release-pipeline.md` — pre-publish semver check.
- → `docs/guides/crates/migrating.md` — author playbook for cross-major migration.
- → `docs/specs/mods/sdk.md` — mirrored policy on the runtime side.

## Open Questions

- `[DECISION NEEDED]` Whether to ship `nexus-engine-compat-1` from day one (cost: workspace bloat) or generate on demand (cost: complexity). Default proposal: ship from day one once 2.0 lands; absent from 1.x.
- `[DECISION NEEDED]` Provisional tier graduation cadence: every minor, or batched? Default: batched at minor boundaries.
- `[BENCHMARK NEEDED]` `cargo public-api` + `cargo semver-checks` run-time on the full engine workspace.
- `[AGENT: 02, 04, 07, 09, 10, 12]` Author the trait specs the registry table references.
