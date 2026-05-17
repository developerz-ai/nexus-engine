<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Versioning

> Strict semver. Cargo's compatibility table is the baseline; we extend it. Public-API surface = anything `pub` reachable from the crate root. Trait additions are minor; removals are major. Per-crate engine-compat matrix tracked in the index.

→ Overview: `docs/specs/crates/overview.md`.
→ Stable-API tier definitions: `docs/specs/crates/stable-api.md`.
→ semver.org: `https://semver.org/`. Cargo SemVer table: `https://doc.rust-lang.org/cargo/reference/semver.html`.

## The rule

`X.Y.Z`:
- `X` (major) — breaking change.
- `Y` (minor) — additive, backwards-compatible.
- `Z` (patch) — fix only; no API change.

For pre-1.0:
- `0.X.Y` — `X` breaks. `Y` additive. Cargo treats `^0.X` as locked to `0.X.*`.

## Public-API definition

A symbol is part of the crate's public API iff:
1. It is declared `pub` AND
2. It is reachable from `lib.rs` via `pub use` / `pub mod` chains.

`#[doc(hidden)]` items remain `pub` but are excluded by convention; do not use for stability-critical hiding (consumers can still reach them). Use `pub(crate)` or a sealed trait instead.

Tools to verify:
- `cargo public-api` — dumps the surface as text; diffable in CI.
- `cargo semver-checks` — auto-detects most breaking changes.

CI requirement: every PR runs both. A non-additive change without a major bump is a hard reject.

## Change classification

| Change | Bump | Notes |
|---|---|---|
| Add a new `pub` fn / type / const | minor | Pure additive |
| Add method to a trait, with default impl | minor | Default avoids requiring impl updates |
| Add method to a trait, no default | **major** | Existing impls fail to compile |
| Add associated type to a trait | **major** | Same |
| Add a generic parameter (no default) | **major** | Existing call sites may fail to infer |
| Add a generic parameter with default | minor | Default avoids break |
| Add a field to a struct (struct is `#[non_exhaustive]`) | minor | Construction stays gated |
| Add a field to a struct (not `#[non_exhaustive]`) | **major** | Struct literal construction breaks |
| Add a variant to an enum (`#[non_exhaustive]`) | minor | Exhaustive match still gated by `_` arm |
| Add a variant to an enum (not `#[non_exhaustive]`) | **major** | Exhaustive matches break |
| Remove `pub` item | **major** | Always |
| Rename `pub` item | **major** | `pub use old as new;` does not save you when callers use the path |
| Loosen bounds (`T: Foo` → `T:`) | minor | Less restrictive on callers |
| Tighten bounds (`T:` → `T: Foo`) | **major** | More restrictive |
| Change function signature | **major** | Type system rejects |
| Change panic to `Err` | minor | Documented; caller behavior change is opt-in |
| Change `Err` variant text | patch | Not part of contract |
| Change `Err` variant code (the `&'static str`) | **major** | Part of Error Contract (Law 10) |
| Bump MSRV | minor | Per Cargo guidance |
| Bump a dependency's major version | minor | If the change isn't visible in the crate's own public API |
| Re-export a dep's type that bumps major | **major** | Re-exports are part of the surface |
| Remove a `pub use` re-export | **major** | Re-exports = surface |

Cargo's canonical reference: `https://doc.rust-lang.org/cargo/reference/semver.html`. Where we extend (Error Contract codes), we are stricter than Cargo's table.

## Engine compatibility matrix

Each crate version declares `engine_versions = ">=A.B, <C.0"`. The index renders this as a matrix:

|  | engine 1.0 | engine 1.1 | engine 1.2 | engine 2.0 |
|---|---|---|---|---|
| `nexus-style-anime 0.3.1` | ✓ | ✓ | ✓ | via shim |
| `nexus-style-anime 0.4.0` | — | ✓ | ✓ | via shim |
| `nexus-style-anime 1.0.0` | — | — | ✓ | via shim |

"via shim" = works through `nexus-engine-compat-1` when consumed in a 2.x project. → `docs/specs/crates/stable-api.md` § Compat Shim.

## Engine major bump → crate impact

When the engine releases `2.0`:

| Crate posture | Action |
|---|---|
| `engine_versions = ">=1.0, <2.0"` + uses only Stable API | Works via compat shim. No republish needed. Health: "ok-via-shim". |
| Same but uses one Provisional API | May still work via shim; depends on whether Provisional was promoted or changed. Audit re-run required to confirm. |
| Uses Unstable API | Likely broken. Author must republish targeting `^2.0`. |
| `engine_versions = ">=1.0"` (open range) | Forbidden in Verified tier; warn in Community. The author must commit to a max-engine cap. |

## Migration guide template

Each crate ships `MIGRATIONS/X.Y.md` per major. Contents:

```markdown
# Migrating <crate> from 1.x to 2.0

## Breaking changes
- `OldType::method` removed → use `NewType::method`. Reason: rename for clarity.
- `OldEnum::Variant` renamed to `NewEnum::Variant`. Search-and-replace.
- `OldError::Code` code changed from `OLD_X` to `NEW_X`. Update match arms.

## Behavioral changes (no compile error, but semantics differ)
- `foo` now returns `Err(Empty)` instead of `Ok(0)` when input is empty.

## New required impls (if any)
- Implementors of `Trait` must now add `fn extra(&self) -> Foo;`.

## Compatibility shim
- Engine 2.x ships `nexus-engine-compat-1` re-exporting the 1.x names mapped onto 2.x.
- Crates that depend on `nexus-engine = "2.0"` and `nexus-engine-compat-1 = "1.x"` keep their 1.x-targeting consumers working.

## How to test
- `cargo update -p nexus-engine`.
- `cargo test --features compat-1`.
- Run `nexus crate test --scenarios` to confirm no behavior drift.
```

## Pre-release versions

| Suffix | Use |
|---|---|
| `-rc.N` | Release candidate. Allowed in `[dependencies]` of dev projects; not in Verified-tier deps. |
| `-alpha.N` / `-beta.N` | Experimental. Allowed only in `[dev-dependencies]` of Verified crates. |
| Numeric only (`1.2.3`) | Production. |

Cargo treats `1.0.0-rc.1` as less than `1.0.0`; `^1.0.0-rc.1` does NOT accept `1.0.0-rc.2` (gotcha). Pin exactly for pre-releases. Cite: `https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#pre-release-requirements`.

## Yank vs new version

| Situation | Action |
|---|---|
| Bug in `1.2.3` | Publish `1.2.4`. Yank `1.2.3`. |
| Critical security bug | Publish `1.2.4`. Yank `1.2.3`. File RustSec advisory. |
| Wrong file shipped | Publish `1.2.4` (you cannot republish a yanked version with the same number). Yank `1.2.3`. |
| Compromised account | Yank everything published in the compromise window. File advisory. Rotate keys. Notify Council. |

Crates.io rule: **published versions cannot be modified or deleted**. Yank is the only retraction primitive. Cite: `https://crates.io/policies`.

## Per-crate compat declaration

```toml
[package]
name = "nexus-style-anime"
version = "0.3.1"

[dependencies]
nexus-engine = ">=1.0, <2.0"             # the engine range the crate supports

[package.metadata.nexus]
engine_versions = ">=1.0, <2.0"           # MUST match the [dependencies] constraint
```

Mismatch between the dep constraint and the metadata declaration is `CR_E_VERSION_MISMATCH`.

## Cargo.lock policy

| Project type | Commit `Cargo.lock`? |
|---|---|
| Game project | Yes. Reproducible builds. |
| `nexus-*` library crate | Yes (engine workspace policy — Law 4) |
| Community library crate | Yes if it ships a binary or examples; otherwise author's choice. |
| `nexus crate publish` | Lockfile included in the tarball for reproducible CI. |

Cite: `https://doc.rust-lang.org/cargo/faq.html#why-do-binaries-have-cargolock-in-version-control-but-not-libraries`.

## Integration Points

- → `docs/specs/crates/stable-api.md` — the per-tier guarantee.
- → `docs/specs/crates/release-pipeline.md` — semver-check runs at publish.
- → `docs/specs/crates/manifest.md` — `engine_versions` field.
- → `docs/guides/crates/migrating.md` — author playbook.
- → `docs/guides/coding-style/dependencies.md` — version pinning at the engine layer.

## Prior Art

- **Cargo SemVer reference** ✓ — authoritative; we adopt without deviation, plus Error Contract code stability.
- **`cargo-semver-checks`** ✓ — automated breakage detection.
- **`cargo public-api`** ✓ — surface diffing.
- **PEP 440** — Python's versioning; informative.
- **Bevy's milestone-based major bumps** ✓ — coordinated ecosystem migration; we mirror via shim policy.

## Open Questions

- `[DECISION NEEDED]` Should we adopt Bevy-style "release trains" (major every 6 months) or ship majors as needed? Default: as needed, with a 12-month minimum spacing once 1.0 ships.
- `[DECISION NEEDED]` MSRV bump policy: every minor? Default: minor; document in CHANGELOG; never in patch.
- `[BENCHMARK NEEDED]` `cargo semver-checks` runtime on the full engine workspace.
