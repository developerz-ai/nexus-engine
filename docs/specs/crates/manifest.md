<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Manifest

> Every crate claiming a Nexus category ships a machine-readable manifest in `Cargo.toml::[package.metadata.nexus]` (Cargo standard for tool metadata) or a sibling `nexus-crate.toml` (preferred when the block exceeds 50 lines).

→ Overview: `docs/specs/crates/overview.md`.
→ Categories enum: `docs/specs/crates/categories.md`.
→ Cargo metadata reference: `https://doc.rust-lang.org/cargo/reference/manifest.html#the-metadata-table`.

## Why a separate manifest

`Cargo.toml` describes the crate to Cargo. `[package.metadata.nexus]` describes it to:
- `nexus add` (compat check on consume).
- `nexus crate audit` (curator playbook).
- `nexus-hub` index (discovery).
- `nexus-coder` (machine-readable filter input).
- `cargo-deny` (license enforcement integration).

Cargo ignores anything under `[package.metadata.*]`, so adding the block is zero-cost to crates.io and `cargo build`.

## Schema (Cargo.toml inline form)

```toml
[package]
name = "nexus-style-anime"
version = "0.3.1"
license = "MIT"
description = "Anime / cel-shaded StylePipeline for Nexus Engine."
repository = "https://github.com/sebyx07/nexus-style-anime"
documentation = "https://docs.rs/nexus-style-anime"
homepage = "https://nexus-style-anime.dev"
readme = "README.md"
keywords = ["nexus", "nexus-style", "anime", "cel-shading", "npr"]
categories = ["game-engines", "graphics", "rendering"]
rust-version = "1.83"

[package.metadata.nexus]
# Required fields
category         = "style"                    # one of docs/specs/crates/categories.md
engine_versions  = ">=1.0, <2.0"              # semver range engine versions supported
implements       = ["StylePipeline"]          # traits implemented
license          = "MIT"                      # MUST match [package].license + LICENSE file
spec             = "docs/STYLE.md"            # author-side spec (Law 2 spirit)

# Behavior flags
mods_compat      = true                       # safe to run alongside loaded mods
headless_safe    = true                       # no-op cleanly without display
deterministic    = true                       # opts into lockstep ladders
agent_friendly   = true                       # ships machine-readable surface (rustdoc JSON + JSON-schema for public types)

# Provenance + trust
repo             = "https://github.com/sebyx07/nexus-style-anime"
docs             = "https://docs.rs/nexus-style-anime"
homepage         = "https://nexus-style-anime.dev"
audit_log_url    = "https://github.com/sebyx07/nexus-style-anime/security/advisories"

# Optional declarations
default_features = ["headless-stub"]          # crate features the consumer should enable by default
recommended_with = ["nexus-genre-platformer"] # crates known to compose well
incompatible_with = ["nexus-style-pbr"]       # cannot coexist; resolver errors
nsfw             = false
accessibility    = ["color-blind-safe-palette"]
locale           = ["en", "ja", "fr"]
sbom             = "sbom.cdx.json"            # path inside crate to a CycloneDX SBOM
vet_attestation  = ".cargo-vet/attestations.toml"
```

## Schema (sibling `nexus-crate.toml`)

When the metadata block exceeds 50 lines or includes structured tables (per-trait surface descriptions), use `nexus-crate.toml` next to `Cargo.toml`. Cargo never reads it; Nexus tools do.

```toml
# nexus-crate.toml
schema_version = "1.0"

[crate]
name = "nexus-style-anime"
version = "0.3.1"
category = "style"
engine_versions = ">=1.0, <2.0"
implements = ["StylePipeline"]
license = "MIT"

[behavior]
mods_compat = true
headless_safe = true
deterministic = true
agent_friendly = true

[surface]
# Per-trait declared surface; checked by `nexus crate audit`
[surface.StylePipeline]
since = "0.1.0"
public_types = ["AnimeStyle", "CelShadeConfig"]
public_fns = ["AnimeStyle::new", "AnimeStyle::with_palette"]
shader_files = ["shaders/cel.wgsl", "shaders/outline.wgsl"]

[provenance]
repo = "https://github.com/sebyx07/nexus-style-anime"
docs = "https://docs.rs/nexus-style-anime"
audit_log_url = "https://github.com/sebyx07/nexus-style-anime/security/advisories"
sbom = "sbom.cdx.json"
vet_attestation = ".cargo-vet/attestations.toml"
```

The two forms are mutually exclusive. `nexus crate audit` rejects crates that ship both.

## Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `category` | enum | yes | one of `docs/specs/crates/categories.md` registry |
| `engine_versions` | semver req | yes | parses via `semver` crate; must include at least one supported major |
| `implements` | array<string> | yes for categories with a trait | trait name(s); `nexus crate audit` verifies via `rustdoc --output-format json` |
| `license` | SPDX id | yes | MUST match `[package].license` and LICENSE file content |
| `spec` | path \| URL | recommended | author's spec file; mirrors Law 2 spirit for community crates |
| `mods_compat` | bool | yes | `false` triggers a warning when consumer enables mods |
| `headless_safe` | bool | yes | `false` blocks inclusion in headless CI; warn on consume |
| `deterministic` | bool | yes | required `true` for lockstep ladder participation |
| `agent_friendly` | bool | default `false` | when `true`, crate MUST publish `rustdoc --output-format json` and JSON-schema for public types |
| `repo` / `docs` / `homepage` | URL | recommended | surfaced in `nexus add` output and index |
| `audit_log_url` | URL | recommended | GitHub Security Advisories or equivalent |
| `default_features` | array<string> | optional | Cargo features `nexus add` enables by default |
| `recommended_with` | array<crate> | optional | resolver hint |
| `incompatible_with` | array<crate> | optional | resolver hard-error |
| `nsfw` | bool | default `false` | per `docs/specs/mods/nsfw-and-moderation.md` policy mirroring |
| `accessibility` | array<string> | optional | declared accessibility features |
| `locale` | array<BCP-47> | optional | UI / string locales bundled |
| `sbom` | path | recommended | CycloneDX SBOM inside the crate |
| `vet_attestation` | path | required for Verified tier | `cargo-vet` attestation TOML |

## Worked examples per category

### `genre` — `nexus-genre-spaceflight`

```toml
[package.metadata.nexus]
category = "genre"
engine_versions = ">=1.0, <2.0"
implements = ["GenrePlugin"]
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true
agent_friendly = true
recommended_with = ["nexus-physics-verlet", "nexus-net-webtransport"]
```

### `physics` — `nexus-physics-jolt-bridge`

```toml
[package.metadata.nexus]
category = "physics"
engine_versions = ">=1.0, <2.0"
implements = ["PhysicsBackend"]
license = "MIT"            # the bridge crate MIT; jolt-physics-rs underneath ZLIB-compatible
mods_compat = true
headless_safe = true
deterministic = true       # MUST be true for physics category (Law 9)
incompatible_with = ["nexus-physics-verlet"]
audit_log_url = "https://github.com/example/nexus-physics-jolt-bridge/security/advisories"
```

### `style` — `nexus-style-watercolor`

```toml
[package.metadata.nexus]
category = "style"
engine_versions = ">=1.0, <2.0"
implements = ["StylePipeline"]
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = false      # rendering output not lockstep-relevant
```

### `net` — `nexus-net-webtransport`

```toml
[package.metadata.nexus]
category = "net"
engine_versions = ">=1.0, <2.0"
implements = ["NetTransport"]
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true
recommended_with = ["nexus-genre-fps"]
```

### `audio` — `nexus-audio-dsp-reverb-convolution`

```toml
[package.metadata.nexus]
category = "audio"
engine_versions = ">=1.0, <2.0"
implements = ["DspPack"]
license = "MIT"
mods_compat = true
headless_safe = true       # DSP runs on CPU; headless = stub out
deterministic = false      # audio not in determinism scope
```

### `asset-source` — `nexus-asset-source-meshy`

```toml
[package.metadata.nexus]
category = "asset-source"
engine_versions = ">=1.0, <2.0"
implements = ["AssetSource"]
license = "MIT"            # bridge is MIT; Meshy API ToS lives outside
mods_compat = false        # paid API; not shipped with games
headless_safe = true
deterministic = false      # generation is non-deterministic by nature
```

### `telemetry-sink` — `nexus-telemetry-sink-honeycomb`

```toml
[package.metadata.nexus]
category = "telemetry-sink"
engine_versions = ">=1.0, <2.0"
implements = ["TelemetrySink"]
license = "MIT"
mods_compat = false
headless_safe = true
deterministic = false
```

### `feature-flag` — `nexus-feature-flag-growthbook`

```toml
[package.metadata.nexus]
category = "feature-flag"
engine_versions = ">=1.0, <2.0"
implements = ["FlagProvider"]
license = "MIT"
mods_compat = false
headless_safe = true
deterministic = false
```

### `input` — `nexus-input-eye-tracker-tobii`

```toml
[package.metadata.nexus]
category = "input"
engine_versions = ">=1.0, <2.0"
implements = ["InputDevice"]
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true       # input is recorded for replay
accessibility = ["eye-tracking", "no-keyboard-required"]
```

### `platform` — `nexus-platform-steamdeck`

```toml
[package.metadata.nexus]
category = "platform"
engine_versions = ">=1.0, <2.0"
implements = ["PlatformBackend"]
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true
```

### `script-lang` — `nexus-script-lang-wren`

```toml
[package.metadata.nexus]
category = "script-lang"
engine_versions = ">=1.0, <2.0"
implements = ["ScriptVm"]
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true        # required for game logic VMs
```

### `genre-toolkit` — `nexus-genre-toolkit-quests`

```toml
[package.metadata.nexus]
category = "genre-toolkit"
engine_versions = ">=1.0, <2.0"
implements = []             # no trait — helper library
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true
```

### `tools` — `nexus-tools-shader-permutation-gen`

```toml
[package.metadata.nexus]
category = "tools"
engine_versions = ">=1.0, <2.0"
implements = []
license = "MIT"
mods_compat = false
headless_safe = true        # tools always headless
deterministic = false
```

### `test-fixtures` — `nexus-test-fixtures-determinism-suite`

```toml
[package.metadata.nexus]
category = "test-fixtures"
engine_versions = ">=1.0, <2.0"
implements = []
license = "MIT"
mods_compat = true
headless_safe = true
deterministic = true
```

## Validation

`nexus crate audit` enforces:

| Rule | Error code |
|---|---|
| `category` present and in registry | `CR_E_CATEGORY_UNKNOWN` |
| `engine_versions` parses as valid semver req | `CR_E_VERSION_INVALID` |
| `implements` traits exist in current engine when `engine_versions` matches | `CR_E_TRAIT_MISSING` |
| `license` matches `[package].license` and LICENSE file | `CR_E_LICENSE_MISMATCH` |
| `license` ∈ allow-list (`docs/specs/crates/licensing.md`) | `CR_E_LICENSE_FORBIDDEN` |
| Category-required flags set correctly (e.g., `physics` requires `deterministic = true`) | `CR_E_CATEGORY_RULES` |
| `recommended_with` / `incompatible_with` resolve to real crates on crates.io | `CR_E_REF_MISSING` |
| `agent_friendly = true` ⇒ `rustdoc --output-format json` ships in `target/doc/` artifact | `CR_E_AGENT_SURFACE_MISSING` |
| `sbom` path exists and parses as CycloneDX | `CR_E_SBOM_INVALID` |

All errors emit structured JSON. → Law 10.

## Backwards compatibility

A crate published before `schema_version = "1.0"` (i.e., no `nexus` metadata block) is treated as `category = "unknown"`, Community tier, with a warning on consume. Old crates can add the block in a patch release.

## Cross-references

- → `docs/specs/crates/categories.md` — category enum + per-category requirements.
- → `docs/specs/crates/licensing.md` — license allow-list.
- → `docs/specs/crates/quality-bar.md` — fields consumed by curator.
- → `docs/specs/crates/discovery.md` — fields consumed by index.
- → `docs/specs/coder/tools.md` — `nexus-coder` parses this block.

## Open Questions

- `[DECISION NEEDED]` `schema_version` evolution policy: pin to a single version forever, or allow `1.x` additive evolution? Default proposal: additive `1.x`, breaking `2.x` triggers Council review.
- `[DECISION NEEDED]` Should `engine_versions` accept `*` for prototypes? Default proposal: yes, warn but allow; `nexus crate publish --verified` requires a real range.
- `[BENCHMARK NEEDED]` `nexus crate audit` parse cost on a 100-crate workspace.
