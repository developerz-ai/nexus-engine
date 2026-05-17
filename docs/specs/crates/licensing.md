<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Licensing

> MIT preferred. Apache-2.0 / BSD / MPL-2.0 / Zlib / Unicode-DFS-2016 / CC0 allowed. GPL/AGPL/SSPL/BUSL forbidden. License is enforced at audit and via `cargo-deny` in every consumer's CI.

→ Overview: `docs/specs/crates/overview.md`.
→ Engine-side dep policy (informs this): `docs/guides/coding-style/dependencies.md`.
→ SPDX list: `https://spdx.org/licenses/`. OSI: `https://opensource.org/licenses`.

## Policy summary

| Tier | Policy |
|---|---|
| `nexus-*` (Verified) | MIT-only for the crate. Dependencies MUST be allow-list. |
| `nexus-community-*` | Allow-list licenses. MIT preferred. Allowed dual-license forms. |
| `nx-*` | Author-scoped. Allow-list still enforced for consumer-side compat. |

## License allow-list

| SPDX id | Notes |
|---|---|
| MIT | Preferred. Default for everything in `nexus-*`. |
| Apache-2.0 | Allowed. Pair with MIT for max compat (`MIT OR Apache-2.0`). |
| `Apache-2.0 WITH LLVM-exception` | Allowed (matches LLVM-derived tooling). |
| BSD-2-Clause | Allowed. |
| BSD-3-Clause | Allowed. |
| MPL-2.0 | Allowed (file-level copyleft only; compatible with MIT distribution). |
| ISC | Allowed (functionally equivalent to BSD-2). |
| Zlib | Allowed. |
| Unicode-DFS-2016 | Allowed (Unicode data tables). |
| CC0-1.0 | Allowed (public-domain equivalent). |
| Unlicense | Allowed-with-note (some jurisdictions reject; prefer CC0). |

## Forbidden

| SPDX id | Reason |
|---|---|
| GPL-2.0-only / GPL-2.0-or-later / GPL-3.0-only / GPL-3.0-or-later | Copyleft contagion — incompatible with MIT-base engine + game distribution. |
| AGPL-1.0 / AGPL-3.0 | Same + network-use trigger; especially toxic for server crates. |
| LGPL-2.1 / LGPL-3.0 | Allowed only via dynamic-link boundary; static linking (Rust default) violates. Effectively forbidden in `nexus-*`. |
| SSPL-1.0 | Source-available, not open source. |
| BUSL-1.1 | Source-available. |
| Elastic-2.0 | Source-available. |
| Commons Clause | Source-available. |
| CC-BY-NC-* | "Non-commercial" violates game distribution. |
| CC-BY-SA-* | "Share-alike" copyleft contagion via assets. |
| "Custom" / no SPDX id | Cannot be audited automatically; requires legal review. Reject. |

**RESOLVED 2026-05-17 — No in v1.0.** GPL soft-allow rejected for v1.0 to preserve the MIT-base safety story end-to-end. Revisit in v2.0 only if community demand warrants AND we can isolate GPL crates behind a feature gate that flips the entire game's effective license. See `docs/architecture/decisions-resolved.md`.

## Why the forbidden list

- **GPL/AGPL** make every downstream game GPL/AGPL. The vision (MIT forever, no licensing surprises) demands the floor stay clean.
- **Source-available licenses** (SSPL, BUSL, Elastic, Commons Clause) are not open source per OSI definition. They impose use restrictions inconsistent with Vision §"The Open Source Mandate".
- **CC-NC / CC-SA** create asset-licensing landmines (a single asset can taint a release).

References:
- OSI definition: `https://opensource.org/osd`.
- FSF GPL FAQ: `https://www.gnu.org/licenses/gpl-faq.html`.
- Tidelift / BlueOak Council ratings: `https://blueoakcouncil.org/list`.

## License compatibility matrix

For a `nexus-*` crate (effective MIT) consuming a dependency:

| Dep license | Direct dep allowed | Transitive allowed | Notes |
|---|---|---|---|
| MIT | yes | yes | identity |
| Apache-2.0 | yes | yes | MIT-compatible |
| BSD-2 / BSD-3 / ISC | yes | yes | permissive |
| Zlib | yes | yes | permissive |
| MPL-2.0 | yes | yes | file-level copyleft; allowed |
| Unicode-DFS-2016 | yes | yes | data tables |
| CC0 / Unlicense | yes | yes | public-domain equivalents |
| LGPL-2.1 / LGPL-3.0 | **no** | **no** | static-link contagion |
| GPL-* / AGPL-* | **no** | **no** | copyleft contagion |
| SSPL / BUSL / Elastic / Commons Clause | **no** | **no** | not open source |
| "Custom" | **no** | requires legal review | unauditable |
| Unknown / missing | **no** | **no** | `cargo-deny` rejects |

`cargo-deny` enforces this on every consumer's `cargo check`. → `docs/specs/crates/security.md`.

## Dual licensing

`nexus-*` crates SHOULD dual-license under `MIT OR Apache-2.0` (the Rust ecosystem default). This:
- Mirrors the standard library and the foundational crates.
- Lets downstream pick whichever fits their context.
- Adds Apache's explicit patent grant without contagion.

In `Cargo.toml`:

```toml
[package]
license = "MIT OR Apache-2.0"
```

Ship both `LICENSE-MIT` and `LICENSE-APACHE` files at the repo root. → `https://rust-lang.github.io/api-guidelines/necessities.html#crate-and-its-public-functions-have-useful-documentation-c-doc`.

## `cargo-deny` config (copy-paste)

Drop into the crate's `deny.toml`:

```toml
[graph]
all-features = true

[advisories]
db-path  = "~/.cargo/advisory-db"
db-urls  = ["https://github.com/rustsec/advisory-db"]
vulnerability = "deny"
unmaintained  = "warn"
unsound       = "deny"
yanked        = "deny"
notice        = "warn"

[licenses]
unlicensed         = "deny"
allow-osi-fsf-free = "neither"
copyleft           = "deny"
default            = "deny"
allow = [
  "MIT",
  "Apache-2.0",
  "Apache-2.0 WITH LLVM-exception",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "Zlib",
  "Unicode-DFS-2016",
  "CC0-1.0",
  "Unlicense",
]
exceptions = []                          # any exception requires ADR

[bans]
multiple-versions = "warn"
wildcards         = "deny"
deny = [
  { name = "openssl",     reason = "use rustls" },
  { name = "openssl-sys", reason = "use rustls" },
]

[sources]
unknown-registry = "deny"
unknown-git      = "deny"
allow-git        = []                    # no git deps in release
```

Cite: `https://github.com/EmbarkStudios/cargo-deny`.

## License declaration in the crate

| Place | What |
|---|---|
| `Cargo.toml` `[package].license` | SPDX expression: `"MIT"` or `"MIT OR Apache-2.0"` |
| `Cargo.toml` `[package.metadata.nexus].license` | MUST match `[package].license` |
| `LICENSE` (root) | Full license text |
| `LICENSE-MIT` + `LICENSE-APACHE` (when dual) | Full text per license |
| Source files | `// SPDX-License-Identifier: MIT` header on every `.rs` / `.wgsl` |

`nexus crate audit` checks all four. Mismatch = `CR_E_LICENSE_MISMATCH`.

## Asset licensing

Assets shipped *inside* a crate (textures, audio, shaders, font glyphs) inherit the crate's license unless declared otherwise. Per-asset overrides via `assets/LICENSES.toml`:

```toml
[[asset]]
path     = "assets/textures/sample.png"
license  = "CC0-1.0"
source   = "https://kenney.nl"
author   = "Kenney"

[[asset]]
path     = "assets/audio/click.ogg"
license  = "CC-BY-4.0"
attribution = "freesound.org/u/foo"
```

`CC-BY-*` (attribution-only) is allowed for assets but NOT for code. `CC-BY-NC` and `CC-BY-SA` remain forbidden everywhere.

## Game-side implications

A game built on Nexus inherits no license obligations from the engine (MIT). Each crate the game pulls adds its license. The cumulative obligation is the union — typically MIT + Apache-2.0 attribution notices.

Compile-time license bundle:

```
nexus crate license-bundle > THIRD_PARTY_LICENSES.md
```

Generates the attribution file `THIRD_PARTY_LICENSES.md` from `Cargo.lock`. Ship it next to the game binary.

## Integration Points

- → `docs/guides/coding-style/dependencies.md` — engine-side enforcement (the parent policy).
- → `docs/specs/crates/security.md` — `cargo-deny` is the joint enforcer.
- → `docs/specs/crates/quality-bar.md` — license is the most-rejected audit step.
- → `docs/specs/crates/manifest.md` — `license` field.

## Prior Art

- **Rust standard library** — `MIT OR Apache-2.0` dual. The ecosystem default.
- **Apache Software Foundation** — Apache-2.0 only; we accept it as a dep but don't require it.
- **Bevy Engine** — `MIT OR Apache-2.0` dual; same policy we adopt.
- **Linux kernel** — GPLv2 only; the cautionary tale of copyleft contagion we avoid.
- **MongoDB → SSPL** ✗ — the cautionary tale of source-available drift.

## Open Questions

- **RESOLVED** — GPL opt-in for GPL-licensed games: **no in v1.0**; revisit v2.0.
- `[DECISION NEEDED]` Whether to allow MPL-2.0 in `nexus-*` Verified namespace or only in `nexus-community-*`. Default: allow everywhere; the file-level copyleft is well-understood.
- `[DECISION NEEDED]` Whether to maintain a `nexus crate license-check <Cargo.lock>` standalone CI step or rely on `cargo-deny` exclusively. Default: rely on `cargo-deny`; wrap for nicer JSON output.
- `[VERIFY — SPDX list]` Re-verify all SPDX ids against latest list at v1.0 ship date.
