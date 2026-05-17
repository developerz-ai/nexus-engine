<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Index Format

> The canonical record shape every endpoint emits and every mirror copies. JSON-schema'd. Forward-compatible (additive-only inside a major version). The full index snapshot at `/api/v1/index.json` is an array of these records.

→ HTTP API that returns these: `api.md`
→ How records get created: `crawler.md`
→ Verification field: `verification.md`

## Schema versioning

| Field | Where | Use |
|---|---|---|
| `schema_version` | top-level of `/api/v1/index.json` | `"1.<minor>"`; minor bumps additive-only |
| `X-Hub-Schema` | response header on every endpoint | same string |
| `record.schema_version` | omitted from individual records (read from envelope) | — |

Breaking change → bump major → `/api/v2/...`.

## Record kinds

| Kind | Record schema id | Source-of-truth example |
|---|---|---|
| crate | `Crate` | `crates.io/crates/nexus-genre-survival-extreme` |
| mod | `Mod` | `steamcommunity.com/workshop/.../12345`, `mod.io/g/.../m/...` |
| asset | `AssetPack` | `kenney.nl/assets/...`, `polyhaven.com/a/...` |
| game | `Game` | `itch.io/game/...`, `store.steampowered.com/app/...` |
| template | `Template` | `github.com/nexus-engine/template-...` |
| user | `User` | hub-internal |
| attestation | `Attestation` | hub-internal (signed) |

## Common substructures

### Identity

```json
{
  "$id": "https://hub.nexus.engine/schemas/Identity.json",
  "type": "object",
  "required": ["kind", "id", "slug", "canonical_url"],
  "properties": {
    "kind": {"enum": ["crate", "mod", "asset", "game", "template", "user", "attestation"]},
    "id":   {"type": "string", "description": "stable ULID, hub-issued"},
    "slug": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$"},
    "name": {"type": "string"},
    "version": {"type": "string", "description": "semver for crates; opaque for mods/assets"},
    "canonical_url": {"type": "string", "format": "uri", "description": "the hub's URL for this record"},
    "json_url":      {"type": "string", "format": "uri", "description": "parallel .json URL"}
  }
}
```

### Origin

Where the actual artifact lives. Hub never serves the artifact.

```json
{
  "$id": "https://hub.nexus.engine/schemas/Origin.json",
  "type": "object",
  "required": ["host", "url"],
  "properties": {
    "host": {
      "enum": [
        "crates.io", "alt-registry",
        "steam_workshop", "mod_io", "thunderstore", "self_hosted",
        "kenney", "polyhaven", "opengameart", "ambientcg", "flux", "ipfs",
        "github", "itch.io", "steam"
      ]
    },
    "url": {"type": "string", "format": "uri"},
    "source_repo":     {"type": ["string", "null"], "format": "uri"},
    "last_commit_sha": {"type": ["string", "null"]},
    "build_hash":      {"type": ["string", "null"], "description": "blake3:… of reproducible build"}
  }
}
```

### Verification

The signed-attestation reference. Full attestation blob lives at `/api/v1/attestations/{id}`.

```json
{
  "$id": "https://hub.nexus.engine/schemas/Verification.json",
  "type": "object",
  "required": ["tier"],
  "properties": {
    "tier": {"enum": ["verified", "community", "quarantine"]},
    "attestation_id": {"type": ["string", "null"]},
    "audited_at":     {"type": ["string", "null"], "format": "date-time"},
    "expires_at":     {"type": ["string", "null"], "format": "date-time"},
    "auditor":        {"type": ["string", "null"], "description": "auditor identity (e.g. audit-council-01)"},
    "signing_key_id": {"type": ["string", "null"]},
    "audit_log_url":  {"type": ["string", "null"], "format": "uri"}
  }
}
```

Tier definitions live in `docs/specs/crates/quality-bar.md` (the Verified / Community / Quarantine tiers). [INTEGRATION NEEDED] — once Agent 28's `quality-bar.md` lands, cross-link.

### Compat

```json
{
  "$id": "https://hub.nexus.engine/schemas/Compat.json",
  "type": "object",
  "properties": {
    "engine_versions": {"type": "string", "description": "semver req, e.g. >=0.4.0, <0.5.0"},
    "platforms": {
      "type": "array",
      "items": {"enum": ["linux", "windows", "macos", "android", "ios", "web-wasm", "switch", "ps5", "xbox"]}
    },
    "license":          {"type": "string", "description": "SPDX expression"},
    "rust_msrv":        {"type": ["string", "null"]},
    "headless_safe":    {"type": "boolean"},
    "deterministic":    {"type": "boolean"}
  }
}
```

### Telemetry (aggregate, anonymous)

```json
{
  "$id": "https://hub.nexus.engine/schemas/Telemetry.json",
  "type": "object",
  "properties": {
    "downloads": {
      "type": "object",
      "properties": {
        "total":         {"type": "integer", "minimum": 0},
        "recent_90d":    {"type": "integer", "minimum": 0},
        "by_day":        {"type": "array", "items": {"type": "integer", "minimum": 0}, "minItems": 90, "maxItems": 90},
        "weekly_trend":  {"type": "number"}
      }
    },
    "stars":        {"type": ["integer", "null"], "description": "GitHub stars if applicable"},
    "rating": {
      "type": "object",
      "properties": {
        "mean":      {"type": ["number", "null"], "minimum": 0, "maximum": 5},
        "count":     {"type": "integer", "minimum": 0},
        "histogram": {"type": "array", "items": {"type": "integer"}, "minItems": 5, "maxItems": 5},
        "wilson_lower_bound": {"type": ["number", "null"]}
      }
    }
  }
}
```

### Provenance

```json
{
  "$id": "https://hub.nexus.engine/schemas/Provenance.json",
  "type": "object",
  "properties": {
    "git_repo":         {"type": "string", "format": "uri"},
    "last_commit_sha":  {"type": "string"},
    "last_commit_at":   {"type": "string", "format": "date-time"},
    "build_reproducible_hash": {"type": ["string", "null"]},
    "submitted_by":     {"type": "string", "description": "hub user handle"},
    "first_indexed_at": {"type": "string", "format": "date-time"},
    "last_indexed_at":  {"type": "string", "format": "date-time"}
  }
}
```

### Moderation

```json
{
  "$id": "https://hub.nexus.engine/schemas/Moderation.json",
  "type": "object",
  "required": ["status"],
  "properties": {
    "status":         {"enum": ["clean", "under_review", "quarantined", "removed_by_author", "delisted_by_moderator"]},
    "flag_count":     {"type": "integer", "minimum": 0},
    "active_flags":   {"type": "array", "items": {"type": "string"}},
    "removal_reason": {"type": ["string", "null"]},
    "nsfw":           {"type": "boolean"}
  }
}
```

---

## Crate record

```json
{
  "$id": "https://hub.nexus.engine/schemas/Crate.json",
  "type": "object",
  "required": ["identity", "manifest", "compat", "verification", "origin", "moderation"],
  "properties": {
    "identity":    {"$ref": "Identity.json"},
    "summary":     {"type": "string", "maxLength": 280},
    "category":    {"type": "string", "description": "from docs/specs/crates/categories.md"},
    "tags":        {"type": "array", "items": {"type": "string"}},
    "manifest": {
      "type": "object",
      "description": "Parsed [package.metadata.nexus] from Cargo.toml or sibling nexus-crate.toml",
      "properties": {
        "category":         {"type": "string"},
        "engine_compat":    {"type": "string"},
        "traits_implemented": {"type": "array", "items": {"type": "string"}},
        "headless_safe":    {"type": "boolean"},
        "deterministic":    {"type": "boolean"},
        "agent_readable":   {"type": "boolean"},
        "audit_url":        {"type": ["string", "null"], "format": "uri"}
      }
    },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "req", "kind"],
        "properties": {
          "name": {"type": "string"},
          "req":  {"type": "string"},
          "kind": {"enum": ["normal", "dev", "build"]},
          "optional": {"type": "boolean"},
          "target":   {"type": ["string", "null"]}
        }
      }
    },
    "readme_excerpt":  {"type": "string", "maxLength": 4000},
    "changelog_tail":  {"type": "string", "maxLength": 4000},
    "compat":          {"$ref": "Compat.json"},
    "verification":    {"$ref": "Verification.json"},
    "telemetry":       {"$ref": "Telemetry.json"},
    "origin":          {"$ref": "Origin.json"},
    "provenance":      {"$ref": "Provenance.json"},
    "moderation":      {"$ref": "Moderation.json"}
  }
}
```

## Mod record

```json
{
  "$id": "https://hub.nexus.engine/schemas/Mod.json",
  "type": "object",
  "required": ["identity", "manifest", "marketplace", "install_url", "compat", "moderation"],
  "properties": {
    "identity":    {"$ref": "Identity.json"},
    "summary":     {"type": "string"},
    "tier_power":  {"enum": ["skin", "behavior", "total_conversion"], "description": "from docs/specs/mods/overview.md"},
    "marketplace": {"enum": ["steam_workshop", "mod_io", "thunderstore", "self_hosted"]},
    "install_url": {"type": "string", "format": "uri", "description": "deep-link to marketplace"},
    "manifest": {
      "type": "object",
      "description": "parsed mod.toml — see docs/specs/mods/manifest.md",
      "properties": {
        "id":               {"type": "string"},
        "tier":             {"enum": ["skin", "behavior", "total_conversion"]},
        "capabilities":     {"type": "array", "items": {"type": "string"}},
        "engine_compat":    {"type": "string"}
      }
    },
    "screenshots": {"type": "array", "items": {"type": "string", "format": "uri"}},
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {"slug": {"type": "string"}, "req": {"type": "string"}}
      }
    },
    "compat":          {"$ref": "Compat.json"},
    "verification":    {"$ref": "Verification.json"},
    "telemetry":       {"$ref": "Telemetry.json"},
    "origin":          {"$ref": "Origin.json"},
    "moderation":      {"$ref": "Moderation.json"}
  }
}
```

## AssetPack record

```json
{
  "$id": "https://hub.nexus.engine/schemas/AssetPack.json",
  "type": "object",
  "required": ["identity", "kind", "license", "origin"],
  "properties": {
    "identity": {"$ref": "Identity.json"},
    "summary":  {"type": "string"},
    "kind":     {"enum": ["sprite", "texture", "model", "audio", "shader", "fx", "font", "ui"]},
    "format":   {"type": "string", "description": "e.g. glTF, PNG, OGG, WAV"},
    "polygon_count": {"type": ["integer", "null"]},
    "resolution":    {"type": ["string", "null"], "description": "e.g. 4096x4096"},
    "asset_count":   {"type": ["integer", "null"]},
    "style_tags":    {"type": "array", "items": {"type": "string"}, "description": "pixel-art, painterly, photorealistic, …"},
    "license":   {"type": "string", "description": "SPDX; CC0/CC-BY/etc."},
    "preview":   {"type": "string", "format": "uri"},
    "origin":    {"$ref": "Origin.json"},
    "telemetry": {"$ref": "Telemetry.json"},
    "moderation":{"$ref": "Moderation.json"}
  }
}
```

## Game record

```json
{
  "$id": "https://hub.nexus.engine/schemas/Game.json",
  "type": "object",
  "required": ["identity", "genres", "platforms", "origin"],
  "properties": {
    "identity": {"$ref": "Identity.json"},
    "summary":  {"type": "string"},
    "genres":   {"type": "array", "items": {"type": "string"}, "description": "from vision §Genre Targets"},
    "styles":   {"type": "array", "items": {"type": "string"}, "description": "from vision §Style Targets"},
    "platforms": {"type": "array", "items": {"type": "string"}},
    "engine_compat": {"type": "string"},
    "screenshots":   {"type": "array", "items": {"type": "string", "format": "uri"}},
    "video_url":     {"type": ["string", "null"], "format": "uri"},
    "license":       {"type": "string"},
    "open_source":   {"type": "boolean"},
    "source_repo":   {"type": ["string", "null"], "format": "uri"},
    "is_demo":       {"type": "boolean"},
    "origin":        {"$ref": "Origin.json"},
    "telemetry":     {"$ref": "Telemetry.json"},
    "moderation":    {"$ref": "Moderation.json"}
  }
}
```

## Template record

```json
{
  "$id": "https://hub.nexus.engine/schemas/Template.json",
  "type": "object",
  "required": ["identity", "git_url", "engine_compat", "license"],
  "properties": {
    "identity": {"$ref": "Identity.json"},
    "summary":  {"type": "string"},
    "genres":   {"type": "array", "items": {"type": "string"}},
    "styles":   {"type": "array", "items": {"type": "string"}},
    "git_url":  {"type": "string", "format": "uri"},
    "engine_compat": {"type": "string"},
    "license":  {"type": "string"},
    "stars":    {"type": "integer"},
    "telemetry":{"$ref": "Telemetry.json"},
    "moderation":{"$ref": "Moderation.json"}
  }
}
```

## User record

```json
{
  "$id": "https://hub.nexus.engine/schemas/User.json",
  "type": "object",
  "required": ["identity", "handle", "joined_at"],
  "properties": {
    "identity":  {"$ref": "Identity.json"},
    "handle":    {"type": "string"},
    "display_name": {"type": "string"},
    "avatar_url":   {"type": ["string", "null"], "format": "uri"},
    "bio":          {"type": ["string", "null"], "maxLength": 1000},
    "github_handle": {"type": ["string", "null"]},
    "linked_crates": {"type": "array", "items": {"type": "string"}},
    "linked_mods":   {"type": "array", "items": {"type": "string"}},
    "reputation":    {"type": "number", "description": "0..1 composite score"},
    "joined_at":     {"type": "string", "format": "date-time"}
  }
}
```

## Attestation record (the only thing nexus-hub fully owns)

Signed Ed25519 blob. → `verification.md` for signing scheme + canonicalization.

```json
{
  "$id": "https://hub.nexus.engine/schemas/Attestation.json",
  "type": "object",
  "required": ["id", "target", "version", "audited_at", "auditor", "results", "signature"],
  "properties": {
    "id":            {"type": "string", "description": "ULID, hub-issued"},
    "target": {
      "type": "object",
      "required": ["kind", "name"],
      "properties": {
        "kind": {"enum": ["crate", "mod", "asset"]},
        "name": {"type": "string"}
      }
    },
    "version":     {"type": "string"},
    "audited_at":  {"type": "string", "format": "date-time"},
    "expires_at":  {"type": "string", "format": "date-time"},
    "auditor":     {"type": "string"},
    "signing_key_id": {"type": "string"},
    "results": {
      "type": "object",
      "properties": {
        "license_ok":           {"type": "boolean"},
        "no_known_cves":        {"type": "boolean"},
        "headless_safe":        {"type": "boolean"},
        "deterministic":        {"type": "boolean"},
        "scenarios_passed":     {"type": "boolean"},
        "perf_contract_met":    {"type": "boolean"},
        "notes":                {"type": "string"}
      }
    },
    "signature":      {"type": "string", "description": "base64 Ed25519 over canonical-JSON of all other fields"},
    "revoked":        {"type": "boolean", "default": false},
    "revoked_reason": {"type": ["string", "null"]}
  }
}
```

---

## Forward compatibility rules

| Allowed inside `v1` | Not allowed |
|---|---|
| add new optional field | rename a field |
| add new enum value | remove an enum value |
| add new endpoint | change a field type |
| add a new record kind | remove a record kind |

Consumers MUST ignore unknown fields. Producers MUST NOT remove fields without bumping major.

## Canonicalization

For signed records (attestations), JSON is canonicalized per RFC 8785 (JSON Canonicalization Scheme) before signing. Avoids the "two valid JSON encodings, two signatures" supply-chain trap.

## Size budget

The full `/api/v1/index.json.gz` snapshot target: **<50MB gzipped** at 100k records. Achieved by:
- Truncating `readme_excerpt` and `changelog_tail` to 4000 chars (full content available via the dedicated endpoint).
- Omitting `by_day` from the snapshot (available only via `/api/v1/crates/{name}/downloads`).
- Sharing strings via gzip dictionary (auto via `Content-Encoding`).

If the snapshot exceeds budget, the hub falls back to **sharded snapshots**: `/api/v1/index/crates.json.gz`, `/api/v1/index/mods.json.gz`, etc. The single-file snapshot redirects to the index of shards.

## Cross-references

- Crate manifest schema: `docs/specs/crates/manifest.md`
- Mod manifest schema: `docs/specs/mods/manifest.md`
- Categories: `docs/specs/crates/categories.md`
- Verification process: `verification.md`
