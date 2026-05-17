<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — HTTP API

> REST + JSON. Every response shape is JSON-schema'd inline. Every list endpoint paginates. Every write endpoint authenticates. The full index also ships as a single gzipped snapshot for agents.

→ Canonical record schema: `index-format.md`
→ Agent-specific endpoints: `agent-api.md`
→ Rate limits + auth: §Rate limits below

## Versioning

- Path-prefixed: `/api/v1/...`.
- Major version (`v1` → `v2`) only for breaking shape changes. Additive fields are not breaking.
- Schema-version header: every response includes `X-Hub-Schema: 1.<minor>` so clients can branch.
- Deprecation: old fields retained ≥ 12 months, marked `"deprecated": true` in OpenAPI doc.

## Transport

| Property | Value |
|---|---|
| Base URL (official) | `https://hub.nexus.engine/api/v1` |
| Content-Type | `application/json; charset=utf-8` |
| Compression | gzip + br (Accept-Encoding negotiated) |
| HTTP version | HTTP/2 minimum; HTTP/3 where edge supports |
| CORS | `*` for `GET`; same-origin for write methods |

## Authentication

| Scheme | When | Header |
|---|---|---|
| anonymous | all `GET` endpoints | none |
| API token | `POST /submit`, `POST /rate`, `POST /flag` | `Authorization: Bearer nx_pat_…` |
| Signed attestation | `POST /attest` | `Authorization: Bearer nx_pat_…` + `X-Hub-Sig-Ed25519: <sig>` |
| GitHub OAuth (browser) | Browse UI session | session cookie (`nx_session`) |

Token shapes:
- `nx_pat_<base32>` — personal access token, scoped (`submit`, `rate`, `flag`, `attest`, `admin`), revocable from `/account/tokens`.
- Token never appears in URLs. Never logged. → `identity.md`.

## Rate limits

| Caller class | Limit | Bucket |
|---|---|---|
| anonymous | 60/min | per IP |
| authenticated read | 600/min | per token |
| authenticated write | 60/min for `/rate` + `/flag`; 10/min for `/submit`; 20/min for `/attest` | per token |
| federation peer | 6000/min (declared in `/.well-known/nexus-hub.json`) | per mirror identity |

Response headers on every call:
```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 542
X-RateLimit-Reset: 1736942400
```
On 429: `Retry-After: <seconds>` per the same convention mod.io and GitHub use.

## Pagination

List endpoints accept `?page=N&per_page=M` (default `per_page=30`, max `100`). Response envelope:

```json
{
  "data": [/* items */],
  "meta": {
    "page": 1,
    "per_page": 30,
    "total": 1248,
    "total_pages": 42
  },
  "links": {
    "self": "https://hub.nexus.engine/api/v1/crates?page=1",
    "next": "https://hub.nexus.engine/api/v1/crates?page=2",
    "prev": null,
    "first": "https://hub.nexus.engine/api/v1/crates?page=1",
    "last":  "https://hub.nexus.engine/api/v1/crates?page=42"
  }
}
```

`Link:` header also populated per RFC 8288. RubyGems-style precedent: `https://guides.rubygems.org/rubygems-org-api/`.

## Error envelope

Every 4xx/5xx response:

```json
{
  "error": {
    "code": "crate_not_found",
    "message": "no crate with name 'nexus-genre-soulslike'",
    "doc_url": "https://hub.nexus.engine/docs/errors#crate_not_found",
    "request_id": "01J9YH4W5GZ8Q3JK0X2VBNRPTM"
  }
}
```

JSON-schema:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["error"],
  "properties": {
    "error": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code": {"type": "string", "pattern": "^[a-z][a-z0-9_]*$"},
        "message": {"type": "string"},
        "doc_url": {"type": "string", "format": "uri"},
        "request_id": {"type": "string"}
      }
    }
  }
}
```

Error code catalog (excerpt): `crate_not_found`, `unauthorized`, `forbidden`, `rate_limited`, `validation_failed`, `signature_invalid`, `mirror_not_registered`, `moderation_pending`.

---

## Endpoint catalog

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/v1/crates` | none | list crates, filterable |
| GET  | `/api/v1/crates/{name}` | none | full crate record |
| GET  | `/api/v1/crates/{name}/versions` | none | version timeline + compat matrix |
| GET  | `/api/v1/crates/{name}/reverse_dependencies` | none | who depends on this |
| GET  | `/api/v1/crates/{name}/downloads` | none | download stats (last 90d) |
| GET  | `/api/v1/mods` | none | list mods (federated) |
| GET  | `/api/v1/mods/{slug}` | none | mod detail |
| GET  | `/api/v1/assets` | none | asset-pack listings |
| GET  | `/api/v1/assets/{slug}` | none | asset detail |
| GET  | `/api/v1/games` | none | demo / sample games |
| GET  | `/api/v1/games/{slug}` | none | game detail |
| GET  | `/api/v1/templates` | none | starter templates |
| GET  | `/api/v1/templates/{slug}` | none | template detail |
| GET  | `/api/v1/categories` | none | taxonomy tree |
| GET  | `/api/v1/users/{handle}` | none | public profile |
| GET  | `/api/v1/users/{handle}/published` | none | user-published artifacts |
| GET  | `/api/v1/search` | none | global search (faceted) |
| GET  | `/api/v1/index.json` | none | full index snapshot (gzipped, ETag'd) |
| GET  | `/api/v1/attestations/{id}` | none | single signed attestation |
| GET  | `/api/v1/attestations` | none | append-only audit log |
| GET  | `/api/v1/activity` | none | recent events (publish, attest, flag) |
| GET  | `/api/v1/leaderboards/{kind}` | none | top-downloaded, top-rated, etc. |
| GET  | `/.well-known/nexus-hub.json` | none | mirror manifest (→ `federation.md`) |
| POST | `/api/v1/submit` | bearer | author registers a new artifact (URL + manifest) |
| POST | `/api/v1/attest` | bearer + sig | verified-tier attestation upload |
| POST | `/api/v1/rate` | bearer | user rating + review |
| POST | `/api/v1/flag` | bearer | flag for moderation |
| POST | `/api/v1/recommend` | bearer (opt) | AI-recommendation query (→ `agent-api.md`) |
| POST | `/api/v1/eval-crate/{name}` | bearer | eval-against-project (→ `agent-api.md`) |
| DELETE | `/api/v1/crates/{name}/listing` | bearer (owner) | hide listing (artifact stays on crates.io) |

GraphQL endpoint: `POST /api/v1/graphql`. Same data, single round-trip queries for the UI. Schema in `schema/graphql.sdl`. REST is the canonical surface; GraphQL is convenience.

---

## GET /api/v1/crates

List crates with filters.

Query params:

| Param | Type | Default | Purpose |
|---|---|---|---|
| `page` | int | 1 | pagination |
| `per_page` | int | 30 (max 100) | pagination |
| `category` | string | — | one of `categories.md` slugs (multiple: comma) |
| `tier` | enum | — | `verified` · `community` · `quarantine` |
| `engine_version` | semver req | — | `^0.4` etc. |
| `license` | spdx | — | `MIT`, `Apache-2.0`, etc. (multiple: comma) |
| `sort` | enum | `relevance` | `downloads` · `recent` · `updated` · `rating` · `alpha` |
| `q` | string | — | free-text (passed through to search) |

Response (envelope as above, `data[]` is `CrateSummary`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hub.nexus.engine/schemas/CrateSummary.json",
  "type": "object",
  "required": ["name", "version", "tier", "engine_compat", "license", "origin"],
  "properties": {
    "name": {"type": "string", "pattern": "^[a-z][a-z0-9-]*$"},
    "version": {"type": "string"},
    "summary": {"type": "string", "maxLength": 280},
    "tier": {"enum": ["verified", "community", "quarantine"]},
    "category": {"type": "string"},
    "engine_compat": {"type": "string"},
    "license": {"type": "string"},
    "downloads_total": {"type": "integer", "minimum": 0},
    "downloads_recent_90d": {"type": "integer", "minimum": 0},
    "rating": {"type": ["number", "null"], "minimum": 0, "maximum": 5},
    "rating_count": {"type": "integer", "minimum": 0},
    "updated_at": {"type": "string", "format": "date-time"},
    "origin": {
      "type": "object",
      "required": ["host", "url"],
      "properties": {
        "host": {"enum": ["crates.io", "github", "alt-registry"]},
        "url": {"type": "string", "format": "uri"}
      }
    }
  }
}
```

## GET /api/v1/crates/{name}

Full crate record. Includes manifest, dependencies, README excerpt, changelog tail.

Response: a single `Crate` object — full schema in `index-format.md`. Inline preview:

```json
{
  "name": "nexus-genre-survival-extreme",
  "version": "0.4.2",
  "summary": "Hardcore survival genre layer with hunger, temperature, sanity.",
  "tier": "verified",
  "category": "genre/survival",
  "engine_compat": ">=0.4.0, <0.5.0",
  "license": "MIT",
  "manifest": { /* parsed [package.metadata.nexus] — see index-format.md */ },
  "dependencies": [
    {"name": "nexus-core", "req": "^0.4", "kind": "normal"},
    {"name": "nexus-ecs",  "req": "^0.4", "kind": "normal"}
  ],
  "downloads": { "total": 12480, "recent_90d": 3210, "by_day": [/* 90 ints */] },
  "rating": { "mean": 4.6, "count": 38, "histogram": [1, 0, 2, 5, 30] },
  "verification": {
    "tier": "verified",
    "attestation_id": "att_01J9YH...",
    "audited_at": "2026-03-12T14:22:00Z",
    "expires_at": "2026-09-12T14:22:00Z",
    "auditor": "audit-council-01"
  },
  "origin": {
    "host": "crates.io",
    "url": "https://crates.io/crates/nexus-genre-survival-extreme",
    "source_repo": "https://github.com/example/nexus-genre-survival-extreme",
    "last_commit_sha": "8f3a2c1...",
    "build_hash": "blake3:..."
  },
  "readme_excerpt": "...",
  "changelog_tail": "...",
  "moderation": { "status": "clean", "flags": 0 }
}
```

## GET /api/v1/crates/{name}/versions

Version timeline and engine-compat matrix.

```json
{
  "data": [
    {
      "version": "0.4.2",
      "yanked": false,
      "engine_compat": ">=0.4.0, <0.5.0",
      "license": "MIT",
      "published_at": "2026-04-01T10:00:00Z",
      "downloads": 1230
    },
    {
      "version": "0.4.1",
      "yanked": false,
      "engine_compat": ">=0.4.0, <0.5.0",
      "license": "MIT",
      "published_at": "2026-03-15T10:00:00Z",
      "downloads": 980
    }
  ],
  "compat_matrix": {
    "engine_versions": ["0.3.x", "0.4.x", "0.5.x"],
    "crate_versions":  ["0.4.2", "0.4.1", "0.3.0"],
    "table": [
      ["✗", "✓", "✗"],
      ["✗", "✓", "✗"],
      ["✓", "✗", "✗"]
    ]
  }
}
```

## GET /api/v1/mods

Federated mod listing. Each entry's `origin.host` discloses the marketplace. nexus-hub never serves the mod payload; install links go out to the marketplace.

Query params: `page`, `per_page`, `category`, `marketplace` (`steam_workshop` · `mod_io` · `thunderstore` · `self_hosted`), `engine_version`, `nsfw=include|exclude` (default `exclude`).

```json
{
  "$id": "https://hub.nexus.engine/schemas/ModSummary.json",
  "type": "object",
  "required": ["slug", "name", "marketplace", "engine_compat", "install_url"],
  "properties": {
    "slug": {"type": "string"},
    "name": {"type": "string"},
    "summary": {"type": "string"},
    "tier_power": {"enum": ["skin", "behavior", "total_conversion"]},
    "marketplace": {"enum": ["steam_workshop", "mod_io", "thunderstore", "self_hosted"]},
    "install_url": {"type": "string", "format": "uri"},
    "engine_compat": {"type": "string"},
    "downloads_total": {"type": "integer"},
    "rating": {"type": ["number", "null"]},
    "nsfw": {"type": "boolean"}
  }
}
```

## GET /api/v1/mods/{slug}

Full mod record — manifest (parsed from `mod.toml` → `docs/specs/mods/manifest.md`), screenshots, dependencies, install instructions, deep-link to marketplace.

## GET /api/v1/assets

Asset-pack listings (Kenney, Poly Haven, OpenGameArt, ambientCG, FLUX-generated, IPFS-pinned).

```json
{
  "$id": "https://hub.nexus.engine/schemas/AssetPack.json",
  "type": "object",
  "required": ["slug", "kind", "license", "origin"],
  "properties": {
    "slug": {"type": "string"},
    "name": {"type": "string"},
    "kind": {"enum": ["sprite", "texture", "model", "audio", "shader", "fx", "font", "ui"]},
    "format": {"type": "string"},
    "polygon_count": {"type": ["integer", "null"]},
    "resolution": {"type": ["string", "null"]},
    "license": {"type": "string"},
    "origin": {
      "type": "object",
      "properties": {
        "host": {"enum": ["kenney", "polyhaven", "opengameart", "ambientcg", "flux", "ipfs", "github", "self"]},
        "url": {"type": "string", "format": "uri"}
      }
    }
  }
}
```

## GET /api/v1/games

Demo + sample games (itch.io, Steam, GitHub releases). Same envelope. Schema in `index-format.md`.

## GET /api/v1/templates

Starter templates (cloneable GitHub repos). Used by `nexus new <template>`.

```json
{
  "slug": "moba-2v2-starter",
  "name": "MOBA 2v2 starter",
  "genres": ["moba"],
  "styles": ["stylized"],
  "engine_compat": "^0.4",
  "git_url": "https://github.com/nexus-engine/template-moba-2v2",
  "license": "MIT",
  "stars": 412
}
```

## GET /api/v1/categories

Returns the taxonomy tree. Source of truth lives at `docs/specs/crates/categories.md` for crates; mod categories mirror Steam Workshop conventions where possible.

```json
{
  "data": [
    {
      "slug": "genre",
      "name": "Genre layer",
      "children": [
        {"slug": "genre/fps", "name": "FPS"},
        {"slug": "genre/rpg", "name": "RPG"},
        {"slug": "genre/survival", "name": "Survival"}
      ]
    },
    {
      "slug": "style",
      "name": "Visual style",
      "children": [/* ... */]
    }
  ]
}
```

## GET /api/v1/search

Global faceted search across all artifact kinds.

Query params: `q` (required), `type` (`crate`|`mod`|`asset`|`game`|`template`|`all`), `facets` (comma-sep facet names), plus filters above.

```json
{
  "data": [
    {"type": "crate", "ref": "/api/v1/crates/nexus-genre-soulslike", "score": 0.93, "summary": "..."},
    {"type": "mod",   "ref": "/api/v1/mods/dark-fantasy-pack",       "score": 0.71, "summary": "..."}
  ],
  "facets": {
    "category": [{"value": "genre/rpg", "count": 8}],
    "tier":     [{"value": "verified",  "count": 3}]
  },
  "meta": { /* pagination */ }
}
```

## GET /api/v1/index.json

The **agent's primary entrypoint**. The full index, gzipped.

| Header | Value |
|---|---|
| Content-Type | `application/json` |
| Content-Encoding | `gzip` |
| ETag | `"sha256-…"` |
| Cache-Control | `public, max-age=600` |

Body shape:

```json
{
  "schema_version": "1.4",
  "generated_at": "2026-05-17T03:00:00Z",
  "hub_origin": "https://hub.nexus.engine",
  "counts": { "crates": 1284, "mods": 5621, "assets": 412, "games": 38, "templates": 24 },
  "crates":    [/* Crate[] */],
  "mods":      [/* Mod[] */],
  "assets":    [/* AssetPack[] */],
  "games":     [/* Game[] */],
  "templates": [/* Template[] */]
}
```

Agents cache by ETag and refresh hourly. Full schema: → `index-format.md`.

## GET /api/v1/attestations / GET /api/v1/attestations/{id}

The append-only audit log. Public. → `verification.md` for the signed-blob format.

## GET /api/v1/leaderboards/{kind}

| `kind` | What |
|---|---|
| `most-downloaded` | top-100 by recent-90d downloads (per artifact type) |
| `top-rated` | top-100 by Wilson-interval rating |
| `rising` | week-over-week growth leaders |
| `most-verified` | publishers with most verified-tier attestations |
| `new` | last 50 published |

---

## POST /api/v1/submit

Author registers a new artifact for indexing. Body is metadata only — actual artifact stays on its source-of-truth host.

Request body:

```json
{
  "kind": "crate",
  "origin_url": "https://crates.io/crates/nexus-genre-survival-extreme",
  "manifest_url": "https://raw.githubusercontent.com/example/nexus-genre-survival-extreme/main/nexus-crate.toml",
  "category": "genre/survival"
}
```

```json
{
  "$id": "https://hub.nexus.engine/schemas/SubmitRequest.json",
  "type": "object",
  "required": ["kind", "origin_url"],
  "properties": {
    "kind": {"enum": ["crate", "mod", "asset", "game", "template"]},
    "origin_url": {"type": "string", "format": "uri"},
    "manifest_url": {"type": "string", "format": "uri"},
    "category": {"type": "string"}
  }
}
```

Response: `202 Accepted` with `{ "submission_id": "...", "status": "queued", "poll_url": "/api/v1/submissions/{id}" }`. Crawler picks up within ≤ 5 min. → `crawler.md`.

## POST /api/v1/attest

Verified-tier attestation upload. Signed Ed25519. Body is a signed JSON blob (canonical-JSON serialized, signed, base64'd). Full attestation format and signature scheme: → `verification.md`.

Request body:

```json
{
  "attestation_blob_b64": "eyJjcmF0ZSI6Im5leHVz...",
  "signature_b64": "MEUCIQDf...",
  "signing_key_id": "audit-council-01-2026"
}
```

Response: `201 Created` with attestation id, audit-log offset, canonical URL.

## POST /api/v1/rate

User rating + optional review.

```json
{
  "target": {"kind": "crate", "name": "nexus-genre-survival-extreme"},
  "stars": 5,
  "review": "Solid hunger system, deterministic, ships with bench harness.",
  "verified_install": true
}
```

Constraints: `stars ∈ {1..5}`; review ≤ 4000 chars; `verified_install` proof required for rating to be weighted (→ `ratings-reviews.md`).

## POST /api/v1/flag

Open a moderation ticket.

```json
{
  "target": {"kind": "crate", "name": "nexus-evil-malware"},
  "reason": "malware",
  "details": "Calls /tmp/eval after install."
}
```

`reason` enum: `malware` · `license_violation` · `dead_url` · `cve` · `nsfw_unflagged` · `spam` · `impersonation` · `other`. → `moderation.md`.

## POST /api/v1/recommend / POST /api/v1/eval-crate/{name}

AI-agent endpoints. → `agent-api.md`.

## DELETE /api/v1/crates/{name}/listing

Owner-only. Removes the **listing** in the hub. The crate stays on crates.io (we can't and don't want to remove it there). Marks the hub record `moderation.status = "delisted_by_author"`. Reversible via `POST /submit` again.

---

## OpenAPI

The full machine-readable spec lives at:

```
GET /api/v1/openapi.json     # OpenAPI 3.1 JSON
GET /api/v1/openapi.yaml     # same, YAML
```

Use it to generate client SDKs. `nexus hub` CLI ships a generated client (→ `cli.md`).

## Cross-references

- Record schema: `index-format.md`
- Agent endpoints: `agent-api.md`
- Auth + tokens: `identity.md`
- Federation handshake: `federation.md`
- Rate-limit precedent: mod.io (`https://docs.mod.io/restapiref/`), RubyGems (`https://guides.rubygems.org/rubygems-org-api/`).
