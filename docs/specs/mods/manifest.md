<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — `mod.toml` Manifest Schema

> Every `.nxmod` declares identity, dependencies, capabilities, and entry points in one TOML file. Parsed once at install; cached in the registry; surfaced in every consent dialog.

## Boundaries
- Owns: every field, type, default, validation rule, example.
- Does NOT own:
  - Capability semantics → `docs/specs/scripting/sandbox.md`
  - Resolver logic → `dependencies.md`
  - Load-order arithmetic → `load-order.md`
  - Archive layout → `package-format.md`
- Depends on: `docs/specs/scripting/sandbox.md` (cap names), `docs/specs/assets/registry.md` (UUIDs).

## Top-Level Sections

| Section | Required | Purpose |
|---|---|---|
| `[mod]` | ✓ | Identity, tier, entry, license, engine compat |
| `[author]` | ✓ | Display name, contact, optional DID |
| `[capabilities]` | mostly | What the mod asks the player to grant |
| `[deps]` | optional | Required and optional dependencies |
| `[conflicts]` | optional | Hard incompatibilities |
| `[load-order]` | optional | `before` / `after` / `priority` constraints |
| `[entry]` | total-conv only | Entry-point override |
| `[overlays]` | optional | Asset overlay declarations |
| `[locale]` | optional | Default language + supported list |
| `[build]` | ✓ | Toolchain pins (→ `package-format.md`) |
| `[telemetry]` | optional | Opt-in author analytics (→ `telemetry.md`) |
| `[marketplace]` | optional | Per-store metadata for `nexus mod publish` |

## `[mod]`

| Field | Type | Required | Default | Validation |
|---|---|---|---|---|
| `id` | string | ✓ | — | Reverse-DNS, `^[a-z0-9_.-]{3,128}$`, must contain at least one `.` |
| `name` | string | ✓ | — | 1..64 chars, no control chars |
| `version` | semver | ✓ | — | `MAJOR.MINOR.PATCH[-prerelease][+build]` |
| `tier` | enum | ✓ | — | `skin` \| `behavior` \| `total-conversion` |
| `entry` | path | depends | `src/lib.rn` if behavior; n/a if skin | Path inside archive |
| `license` | SPDX id | ✓ | — | OSI-approved or `LicenseRef-Proprietary` |
| `nexus` | semver req | ✓ | — | Engine compat, e.g. `^1.0` |
| `sdk` | semver req | ✓ | — | SDK compat, → `sdk.md` |
| `game_id` | string | optional | inherits | Reverse-DNS of target game; `*` = any |
| `summary` | string | ✓ | — | ≤ 140 chars; marketplace card |
| `description` | string | optional | — | Markdown, ≤ 8000 chars |
| `tags` | string[] | optional | `[]` | Marketplace filtering |
| `nsfw` | bool | optional | `false` | → `nsfw-and-moderation.md` |
| `accessibility` | bool | optional | `false` | → `accessibility.md`; elevates default caps |
| `homepage` | url | optional | — | https only |
| `repository` | url | optional | — | https only |

## `[author]`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✓ | Display name |
| `email` | string | optional | Surfaced only with author consent |
| `did` | DID | optional | `did:key:` for signature → `package-format.md` |
| `donation` | url[] | optional | Ko-fi / Patreon / GitHub Sponsors / Liberapay |

## `[capabilities]`

Mirrors the catalog in `docs/specs/scripting/sandbox.md` (canonical). Manifest fields:

```toml
[capabilities]
world.read       = ["Health", "Transform"]           # component allowlist
world.write      = ["Health"]                        # component allowlist
events.emit      = ["healing.applied"]               # exact event names
events.subscribe = ["item.used", "combat.hit"]
assets.read      = ["01HZ8XQK...", "01HZ8YGT..."]    # UUID allowlist
audio.oneshot    = ["heal_sfx_01"]
log              = true
rng              = true
persist          = { size_kb = 16 }                  # max blob size
semantic_spawn   = false
net              = false                             # disabled v1.0
```

Validation:
- Component names must exist in the engine's registry or in a declared dep mod.
- Event names: `^[a-z][a-z0-9._]{1,63}$`.
- Asset UUIDs: ULID format. Engine resolves at install; missing UUID = `MOD_E_DEP_MISSING`.
- `persist.size_kb` ≤ 1024.
- `net = true` = manifest rejected in v1.0 with `MOD_E_CAP_UNSUPPORTED`.

The set declared here is the **upper bound** of what the mod can ask for. Player can attenuate at install (deny individual caps); cannot expand.

## `[deps]`

```toml
[deps]
"com.nexus.mod-lib"     = { version = "^1.2",   required = true }
"com.example.ui-kit"    = { version = "~0.5",   required = false }
"com.example.shared"    = { version = "*",      required = false, soft = true }
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `version` | semver req | — | npm-style: `^`, `~`, `>=`, `*` |
| `required` | bool | `true` | If `false`, optional; mod loads without |
| `soft` | bool | `false` | If `true`, no version check; "use if present" |
| `repo` | string | — | Marketplace hint: `steam` / `mod.io` / `thunderstore` / URL |

Diamond and conflict resolution → `dependencies.md`.

## `[conflicts]`

```toml
[conflicts]
"com.evil.broken-stats" = "*"           # any version
"com.example.old-ai"    = "<2.0"        # only old versions
```

If both this mod and a conflict are enabled, `MOD_E_CONFLICT` is raised and the player picks one. → `load-order.md`.

## `[load-order]`

```toml
[load-order]
priority = 0                            # higher = later; default 0
before = ["com.example.cleanup"]
after  = ["com.nexus.mod-lib"]
```

Algorithm: stable topological sort, ties broken by (priority desc, id asc). → `load-order.md`.

## `[entry]` (total conversion only)

```toml
[entry]
override = true                         # replace base game entry
scene    = "scenes/main_menu.scn"       # or
script   = "src/bootstrap.rn"           # one or both
game_id  = "com.example.cs-on-hl"       # new game identity for ladders/saves
brand    = { name = "Counter-Strike", icon = "branding/icon.png" }
```

Allowed only when `tier = "total-conversion"`. Engine treats this mod as a different `game_id` for save-game segregation, ladder isolation, and anti-cheat domain. → `total-conversions.md`.

## `[overlays]`

```toml
[[overlays]]
target = "01HZ8XQK..."                  # base asset UUID
file   = "overlays/01HZ8XQK.overlay.toml"
mode   = "replace"                      # replace | patch | merge
priority = 100
```

Mode semantics: → `asset-overlay.md`.

## `[locale]`

```toml
[locale]
default = "en-US"
supported = ["en-US", "fr-FR", "de-DE", "ja-JP", "zh-Hans"]
```

Fluent files live at `locale/<lang>.ftl`. → `docs/guides/mods/authoring/i18n.md`.

## `[build]`

→ `package-format.md` § Build.

## `[telemetry]`

```toml
[telemetry]
enabled = false                          # author opt-in; default off
endpoint = "https://telemetry.example.com/v1/ingest"   # author-owned
schema = "nexus-mod-telemetry-v1"
```

Players see this in the consent dialog. → `telemetry.md`.

## `[marketplace]`

```toml
[marketplace.steam]
app_id = 1234567
workshop_visibility = "public"          # public | unlisted | friends | private
tags = ["weapons", "balance"]

[marketplace.mod_io]
game_id = 4321
visibility = "public"

[marketplace.thunderstore]
community = "lethal-company"
categories = ["weapons"]

[marketplace.nexus_mods]
game_domain = "skyrimspecialedition"
category_id = 41
```

Used by `nexus mod publish`. → `docs/guides/mods/authoring/publishing.md`.

## Example 1 — Cosmetic skin (zero friction)

```toml
[mod]
id      = "com.example.pixel-fonts"
name    = "Pixel Font Pack"
version = "1.0.0"
tier    = "skin"
license = "MIT"
nexus   = "^1.0"
sdk     = "^1.0"
summary = "Six retro pixel fonts for the UI."

[author]
name = "anon"
donation = ["https://ko-fi.com/anon"]

[build]
rune = "1.0.4"
nxa-encoder = "1.0.0"
sdk = "nexus-1.0"
deterministic = true

[[overlays]]
target = "01HZ8XQK..."
file   = "overlays/font_main.overlay.toml"
mode   = "replace"
```

No `[capabilities]` (only asset-overlay implied by tier). No prompt at install.

## Example 2 — Gameplay (Behavior tier)

```toml
[mod]
id      = "com.example.healing-pack"
name    = "Healing Pack"
version = "1.0.0"
tier    = "behavior"
entry   = "src/lib.rn"
license = "MIT"
nexus   = "^1.0"
sdk     = "^1.0"
summary = "Adds craftable healing packs and a heal-over-time aura."
tags    = ["gameplay", "items"]

[author]
name = "sebi"
did  = "did:key:z6Mk..."

[capabilities]
world.read       = ["Health", "Transform", "Inventory"]
world.write      = ["Health", "Inventory"]
events.emit      = ["healing.applied"]
events.subscribe = ["item.used"]
assets.read      = ["01HZ8XQK...", "01HZ8YGT..."]
audio.oneshot    = ["heal_sfx_01"]
log              = true
rng              = true
persist          = { size_kb = 4 }

[deps]
"com.nexus.mod-lib" = { version = "^1.0" }

[load-order]
after = ["com.nexus.mod-lib"]

[build]
rune = "1.0.4"
nxa-encoder = "1.0.0"
sdk = "nexus-1.0"
deterministic = true
```

## Example 3 — Total conversion

```toml
[mod]
id      = "com.example.cs-on-nexus"
name    = "Counter-Tactics"
version = "0.9.0"
tier    = "total-conversion"
license = "MIT"
nexus   = "^1.0"
sdk     = "^1.0"
game_id = "*"
summary = "Tactical hostage-rescue total conversion."

[author]
name = "fan-team"
repository = "https://github.com/example/counter-tactics"

[entry]
override = true
scene    = "scenes/main_menu.scn"
script   = "src/bootstrap.rn"
game_id  = "com.example.counter-tactics"
brand    = { name = "Counter-Tactics", icon = "branding/icon.png" }

[capabilities]
world.read       = ["*"]
world.write      = ["*"]
events.emit      = ["*"]
events.subscribe = ["*"]
assets.read      = ["*"]
log              = true
rng              = true
persist          = { size_kb = 1024 }
semantic_spawn   = true

[build]
rune = "1.0.4"
nxa-encoder = "1.0.0"
sdk = "nexus-1.0"
deterministic = true
```

Wildcards (`"*"`) allowed only in `tier = "total-conversion"`. Player still confirms once via the elevated consent dialog. → `permissions.md`.

## Validation

`nexus mod verify` enforces:
- Schema parses; unknown fields = `MOD_E_MANIFEST_UNKNOWN_FIELD` (warn in dev, error in `--ship`).
- All required fields present.
- All cross-refs (UUIDs, dep ids, component names) resolvable in current engine + dep set.
- `tier` consistent with `[capabilities]` (e.g., wildcards reject under `behavior`).
- `entry` block present iff `tier = "total-conversion"`.
- License file matches declared SPDX id (byte-compare against SPDX text catalog).

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_MANIFEST_PARSE` | TOML parse error |
| `MOD_E_MANIFEST_SCHEMA` | Required field missing / type wrong |
| `MOD_E_MANIFEST_UNKNOWN_FIELD` | Unknown field; warn or error per build profile |
| `MOD_E_CAP_UNSUPPORTED` | Cap not available in this engine version (e.g., `net`) |
| `MOD_E_TIER_MISMATCH` | `[capabilities]` exceeds what `tier` allows |
| `MOD_E_DEP_MISSING` | Referenced UUID / dep id not resolvable |
| `MOD_E_CONFLICT` | Conflicting mod enabled (at runtime) |
| `MOD_E_LICENSE_MISMATCH` | LICENSE content ≠ SPDX text |

## Integration Points

- `docs/specs/scripting/sandbox.md` — `[capabilities]` field set MUST be a subset of the canonical catalog.
- `dependencies.md` — `[deps]` and `[conflicts]` consumed by resolver.
- `load-order.md` — `[load-order]` consumed by sort.
- `asset-overlay.md` — `[overlays]` consumed by overlay system.
- `package-format.md` — `[build]` consumed by packer/verifier.
- `total-conversions.md` — `[entry]` consumed by boot path.

## Test Requirements

- Every example above parses successfully and round-trips via TOML.
- Fuzz: 10k malformed manifests yield only structured errors.
- Schema drift CI: adding a field to engine must update this doc.
- `[capabilities].world.write = ["*"]` rejects in `tier = "behavior"`.
- Wildcard caps in total-conversion correctly trigger elevated consent dialog.

## Prior Art

- `Cargo.toml` ✓ — TOML schema, `[deps]` style.
- `Cargo.toml::[features]` ✓ — soft/optional pattern reused for `[deps].soft`.
- `package.json` ✓ — semver `^` / `~` familiar to creators.
- BepInEx `BepInPlugin` attribute ✗ — runtime metadata, no static schema; what we avoid.
- Thunderstore `manifest.json` ✓ — minimalism we beat with explicit caps.

## Open Questions

- `[DECISION NEEDED]` Whether to support per-platform overrides (`[platform.web]` disables certain caps).
- `[DECISION NEEDED]` Whether `[mod].game_id = "*"` is allowed for behavior mods (cross-game library mods).
- `[AGENT: 14]` Confirm component-name registry surface for manifest validation.
