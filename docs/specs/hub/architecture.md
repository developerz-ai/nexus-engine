<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Architecture

> Stateless API in front of a write-heavy index. Crawlers feed it. Mirrors copy it. Humans browse it. Agents scrape it.

## Topology

```
                        ┌─────────────────────────────────────────────┐
                        │                  CDN edge                   │
                        │  (Cloudflare R2 / Bunny / self-host nginx)  │
                        │  caches:  GET /api/v1/**   /index.json.gz   │
                        │           HTML pages       sitemap.xml      │
                        └────────────────┬────────────────────────────┘
                                         │
                                         ▼
        ┌──────────────────────────┬──────────────────────────┐
        │      Browse UI           │           API            │
        │  (server-rendered HTML)  │     (REST + GraphQL)     │
        │     [Astro / Hono]       │       [axum + tower]     │
        └────────────┬─────────────┴────────────┬─────────────┘
                     │                          │
                     └────────────┬─────────────┘
                                  ▼
                       ┌──────────────────────┐
                       │  Search (Meilisearch)│
                       │  full-text + facets  │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │   Index store        │
                       │   (PostgreSQL 16)    │
                       │   open-data tarball  │
                       │   nightly dumped to  │
                       │   /api/v1/index.json │
                       └──────────┬───────────┘
                                  ▲
              ┌───────────────────┼───────────────────┐
              │                   │                   │
   ┌──────────┴───────┐ ┌─────────┴────────┐ ┌────────┴────────┐
   │   Crawler        │ │  Verification    │ │  Federation     │
   │   workers        │ │  attestation     │ │  sync worker    │
   │   (Tokio tasks)  │ │  signer/verifier │ │  (pulls mirrors)│
   │                  │ │  (Ed25519)       │ │                 │
   │   adapters/      │ └─────────┬────────┘ └────────┬────────┘
   │     crates_io    │           │                   │
   │     github       │           ▼                   ▼
   │     steam_ws     │     attestation-log     other nexus-hub
   │     mod_io       │     (append-only)       instances
   │     thunderstore │
   │     kenney       │
   └──────────────────┘

                       Identity provider
                       ┌──────────────────┐
                       │  GitHub OAuth    │
                       │  GitHub OIDC     │
                       │  email magic-link│
                       └──────────────────┘
```

## Components

| Component | Purpose | Tech | Spec |
|---|---|---|---|
| API | REST + GraphQL · JSON only · stateless | Rust · axum · tower-http | `api.md` |
| Browse UI | Server-rendered HTML · progressive enhancement | Astro (static + islands) | `browse-ui.md` |
| Index store | Source of truth for the index | PostgreSQL 16 | (see Storage choice below) |
| Search | Full-text + faceted | Meilisearch | (see Search choice below) |
| Crawler | Polls source-of-truth registries | Rust · Tokio · per-marketplace adapter | `crawler.md` |
| Verification | Signs / verifies attestations | Ed25519 · append-only log | `verification.md` |
| Federation sync | Pulls peer mirrors, merges public-record diffs | Rust · scheduled jobs | `federation.md` |
| Identity | GitHub OAuth (default), OIDC (orgs), email magic-link | `oauth2` crate | `identity.md` |
| Cache + CDN | Edge cache for GET responses | Cloudflare R2 / Bunny / nginx | (see CDN choice below) |

## Storage choice — PostgreSQL (not SQLite)

| Criterion | PostgreSQL | SQLite | Choice |
|---|---|---|---|
| Concurrent writes (crawler + attestation + ratings) | strong | poor (single-writer) | postgres |
| Full-text search backup if Meilisearch unavailable | tsvector | FTS5 OK | postgres ties |
| Federation sync (logical replication / WAL) | native | manual | postgres |
| Single-binary self-host | extra process | embedded | sqlite wins on simplicity |
| Open-data tarball export | `pg_dump --data-only --format=plain` | `.dump` | tie |

**Decision: PostgreSQL 16 for the official hub.** SQLite supported for tiny self-hosted mirrors via a compile-time feature flag (`--features=sqlite-mirror`) — sufficient for a single-studio internal mirror, not the federation canonical. Justification: write concurrency dominates. Crawler + 1000s of rating events + attestation log = sustained writes; SQLite serializes them.

Schema migrations: `refinery` (Rust-native, deterministic, embedded). Every migration reviewable in `migrations/*.sql`.

## Search choice — Meilisearch (not pure Postgres FTS)

| Criterion | Meilisearch | Postgres FTS | Choice |
|---|---|---|---|
| Typo tolerance out-of-the-box | yes | manual `pg_trgm` | meili |
| Faceted search (category, tier, license, engine version) | first-class | manual | meili |
| Operational cost | extra service | none | postgres wins on simplicity |
| Open-source MIT/Apache | MIT (Meilisearch core) | postgres license | both OK |

**Decision: Meilisearch.** Faceted discovery is core to the value-add (lib.rs-style — see `overview.md`). Postgres FTS as a degraded-mode fallback so the hub still answers `?q=` queries if Meili is down.

## CDN / cache choice

| Layer | Used for | Cache key | TTL |
|---|---|---|---|
| Edge (Cloudflare R2 or Bunny) | `GET /api/v1/**`, `index.json.gz`, sitemaps | URL + Accept-Encoding | 5min for hot endpoints; 24h for `/index.json` (with ETag) |
| Origin in-process cache | DB query result dedup | SQL fingerprint | 30s |
| Browser cache | static HTML, CSS, JS, images | URL hash | immutable (content-hashed) |

Self-hosted fallback: nginx in front of the API container with a 5-min `proxy_cache`. Documented in `docs/guides/hub/self-hosting.md`.

## Identity stack

```
                   ┌──────────────────────────┐
                   │  GitHub OAuth (default)  │
                   │  github.com/login/oauth  │
                   └────────────┬─────────────┘
                                │
                                ▼
                      ┌───────────────────┐
                      │  Session (cookie) │   24h sliding · httpOnly · SameSite=Lax
                      └─────────┬─────────┘
                                ▼
                      ┌───────────────────┐
                      │   User record     │   github_id · handle · email (optional)
                      │   (Postgres)      │
                      └───────────────────┘
```

Anonymous browsing: full read access without an account. Account required for: submit, attest, rate, flag, mirror-register.

Org accounts: GitHub OIDC (so a studio's existing GitHub org permissions flow through). Email magic-link as fallback for users without a GitHub account.

Details: → `identity.md`.

## Federation interface

```
mirror A (canonical: hub.nexus.engine)              mirror B (community)
   │                                                          │
   │── advertises /.well-known/nexus-hub.json ───────────────▶│
   │                                                          │
   │◄────── pulls /api/v1/index.json (ETag'd hourly) ─────────│
   │                                                          │
   │── crawler runs independently per mirror ─────────────────│
   │                                                          │
   │── attestations: canonical only (mirrors are read-only) ──│
```

Conflict resolution: the canonical source declared in each record wins. Mirrors that diverge are read-only views of canonical truth. → `federation.md`.

## Deployment shapes

| Shape | Stack | Use |
|---|---|---|
| Single-node dev | `docker-compose up` (api + postgres + meili) | local hacking, CI |
| Studio mirror | docker-compose with SQLite or shared Postgres | internal/air-gapped |
| Production mirror | K3s helm chart (link, not shipped here) | community-run mirror |
| Official hub | Same K3s chart + Cloudflare R2 + managed Postgres | hub.nexus.engine |

Self-hosting playbook: → `docs/guides/hub/self-hosting.md`.

## Performance budget

| Metric | Target | Why |
|---|---|---|
| `GET /api/v1/crates/{name}` p95 | <50ms cold cache, <5ms warm | Agent + UI latency |
| `GET /api/v1/index.json` size | <50MB gzipped at 100k crates | Downloadable by agents |
| Browse home LCP | <2s on broadband | Web vitals; → `browse-ui.md` |
| Crawler lag (crates.io → indexed) | <5min p95 | Fresh enough for discovery |
| Federation sync lag | <1h p95 | Mirrors stay current |

## Open-data dump

Every night, the full index is exported as a gzipped tarball (`index-YYYY-MM-DD.tar.gz`) and published to a public bucket. Schema: → `index-format.md`. Anyone can rehydrate a mirror from a dump in minutes.

## Cross-references

- HTTP API surface: → `api.md`
- Crawl adapters: → `crawler.md`
- Federation protocol: → `federation.md`
- Identity: → `identity.md`
- Self-host: → `docs/guides/hub/self-hosting.md`
