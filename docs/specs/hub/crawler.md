<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Crawler

> How records enter the index. Polls source-of-truth registries on a schedule. Validates manifests. Rejects junk. Writes to Postgres. Backs off when upstreams complain. Never serves the artifact itself.

→ Records produced: `index-format.md`
→ Endpoint that triggers a fresh crawl: `POST /api/v1/submit` in `api.md`
→ Federation pulls (different worker): `federation.md`

## Topology

```
       ┌────────────────────────────────────────────────┐
       │           Scheduler (cron-like, Tokio)          │
       └───────────────────┬────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌──────────┐     ┌─────────────┐    ┌─────────────┐
   │ adapters/│     │  manifest   │    │ submission  │
   │ poll all │     │  fetcher    │    │ queue (PG)  │
   │ upstream │     │  (HTTP)     │    │ from /submit│
   └────┬─────┘     └──────┬──────┘    └──────┬──────┘
        │                  │                  │
        └─────────┬────────┴──────────────────┘
                  ▼
         ┌─────────────────┐
         │   Validator     │   schema · license · deps · spam
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │    Indexer      │   write to Postgres · push to Meili
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │  Rejection log  │   public · queryable
         └─────────────────┘
```

## Adapters

One per upstream. Adapter contract:

```rust
#[async_trait]
pub trait Adapter {
    fn name(&self) -> &'static str;          // e.g. "crates_io"
    fn schedule(&self) -> CronSpec;          // e.g. "every 5 min"
    async fn list_changed_since(&self, cursor: &Cursor) -> Result<Vec<UpstreamRef>>;
    async fn fetch_record(&self, r: &UpstreamRef) -> Result<RawRecord>;
}
```

| Adapter | Polls | Schedule | Filter |
|---|---|---|---|
| `crates_io` | `https://crates.io/api/v1/crates?q=nexus-` and `?keyword=nexus` | every 5 min | name prefix `nexus-*` OR keyword `nexus` OR submitted via `/submit` |
| `github_releases` | GitHub Search API for repos with topic `nexus-template` / `nexus-game-demo` | every 15 min | topic match |
| `steam_workshop` | Steam Workshop API per game-id (those that opt into nexus-hub federation) | every 10 min | game-id list maintained in `crawler.toml` |
| `mod_io` | mod.io API per game-id | every 10 min | game-id list |
| `thunderstore` | Thunderstore community APIs | every 10 min | community-slug list |
| `kenney` | Sitemap + RSS | every 24 h | all asset packs (CC0 by default) |
| `polyhaven` | Asset list API | every 24 h | all |
| `opengameart` | RSS | every 24 h | license filter (CC0 / CC-BY only) |
| `ambientcg` | Asset list API | every 24 h | all |
| `flux_self_hosted` | Submitted via `/submit`; no automatic crawl | on submit | manual |
| `ipfs` | Submitted via `/submit`; pin status checked weekly | on submit + weekly | manual |
| `itch_io` | Submitted via `/submit`; metadata refreshed weekly | on submit + weekly | manual |

Default: an upstream not listed here is reachable only via manual `POST /submit`. Adapters live in `crates/nexus-hub-crawler/src/adapters/`. Adding a new adapter is a separate PR — owned by **`hub-crawler-engineer`** subagent.

## Cursors

Each adapter tracks a cursor in `crawler_cursor` (Postgres). Examples:

| Adapter | Cursor shape |
|---|---|
| `crates_io` | `{ "updated_after": "2026-05-16T03:00:00Z" }` |
| `github_releases` | `{ "since": "2026-05-16T03:00:00Z" }` |
| `steam_workshop` | per game-id: `{ "page": N, "last_seen_id": ... }` |
| `mod_io` | per game-id: `{ "date_added_gte": ... }` |

On adapter crash, restart resumes from the persisted cursor. No double-indexing — `(origin.host, origin.url)` is a unique key in Postgres.

## Fetch pipeline

```
list_changed_since(cursor)
    └─► for each UpstreamRef:
           ├─ fetch_record   (HTTP GET, Etag-aware)
           ├─ fetch_manifest (the nexus-crate.toml or mod.toml)
           ├─ fetch_readme   (raw.githubusercontent if Github)
           ├─ validate (next §)
           ├─ index   (next §)
           └─ emit ActivityEvent (→ /api/v1/activity)
    └─► advance cursor
```

## Validator

A record must pass ALL of these to be indexed:

| Check | Rule | On fail |
|---|---|---|
| schema | manifest parses, required fields present | rejection: `bad_manifest` |
| naming | `nexus-*` / `nexus-community-*` / `nx-*` per `docs/specs/crates/naming.md` | rejection: `bad_name` (allowed-list exception via `/submit` w/ admin token) |
| license | SPDX expression resolvable; not in forbidden-list (→ `docs/specs/crates/licensing.md`) | rejection: `bad_license` |
| deps | every dependency resolvable on crates.io; no cycles | rejection: `unresolvable_deps` |
| engine_compat | parseable semver req; intersects ≥1 living engine version | rejection: `engine_incompat` |
| url | `origin.url` returns 200; not redirected to obvious 404 | rejection: `dead_url` |
| repo | if `source_repo` declared, accessible and matches the artifact | warning only |
| size | `readme_excerpt` and `changelog_tail` fit budget | truncate, no rejection |
| spam | adapter-specific heuristics (e.g. duplicate-text crates) | rejection: `spam_suspected` → moderation queue |
| nsfw | if marked NSFW upstream, mark `moderation.nsfw=true` | flag only, no rejection |

Rejection table is **public** at `GET /api/v1/rejections` (paginated, filterable). Authors see why their crate didn't make it.

## Indexer

Transactional write to Postgres:

```sql
BEGIN;
  INSERT INTO records (...) ON CONFLICT (origin_host, origin_url) DO UPDATE SET ...;
  INSERT INTO record_history (...) VALUES (...);  -- append-only audit
  NOTIFY meili_resync, '<record_id>';
COMMIT;
```

Meili gets the document via a `LISTEN` worker. Search index lag target: < 30s p95 after Postgres commit.

## Retry + backoff

| Failure | Policy |
|---|---|
| 429 from upstream | exponential backoff with jitter, cap 1h; respect `Retry-After` |
| 5xx from upstream | exponential backoff, cap 15min; alert at 10 consecutive failures |
| network timeout | linear retry 3× then defer to next schedule |
| validation fail | record in rejection table; do not retry; author may re-submit after fix |
| signature fail (federation pull) | do not index; alert; do not retry |

All retries logged with structured spans (`tracing` crate). Adapter health dashboards at `/admin/crawler/health` (admin-only).

## Rate-limit etiquette per upstream

| Upstream | Documented limit | Our policy |
|---|---|---|
| crates.io | 1 req/sec recommended (→ crates.io community guidelines) | hard-cap 1 req/sec; `User-Agent: nexus-hub-crawler/<version> (+https://hub.nexus.engine)` |
| github | 5000/hr authenticated | cap 1000/hr; use conditional requests (ETag) |
| steam | per-game throttle | one in-flight req per game-id |
| mod.io | 60/min user-token (→ `https://docs.mod.io/restapiref/`) | cap 50/min per game-id |
| thunderstore | not strictly documented | cap 30/min per community |
| kenney / polyhaven / opengameart / ambientcg | static sites; CDN-served | 1 req/sec each |

`User-Agent` always identifies us with a contact URL so upstream maintainers can complain. We respect every robots.txt.

## Reproducibility hash

For crates from crates.io, we record the `Cargo.lock`-resolved `build_hash` (blake3 over the canonical `Cargo.toml` + `Cargo.lock` + source tree) when the source repo is open. This is **not** a build attestation — that's `verification.md`'s job — it's a "did anything material change since last index" cheap fingerprint.

## Failure-injection tests

Adapter test suite includes:
- Upstream returns 500 for N requests, then recovers.
- Upstream returns malformed JSON.
- Manifest claims `engine_compat = ">=99.0.0"`.
- Manifest declares a license not in SPDX.
- Two different upstream URLs claim the same `origin.url` (collision).
- Crate gets yanked between `list` and `fetch`.

Test scenarios in `crates/nexus-hub-crawler/tests/scenarios/`.

## Concurrency model

| Limit | Value |
|---|---|
| Adapters in parallel | unbounded (each is its own Tokio task) |
| In-flight HTTP per adapter | 4 |
| Indexer concurrent writes | 8 (bounded channel feeding Postgres) |
| Memory budget per crawl cycle | 256 MiB hard cap; OOM → restart adapter, alert |

## Lifecycle events

The crawler emits an event for every record change to `pg_notify('hub_events', json)`. Consumers:

| Consumer | Reads | Purpose |
|---|---|---|
| Meili indexer | record updates | search freshness |
| `/api/v1/activity` writer | publish, update, yank | activity feed |
| federation outbox | record updates | pushed to peer mirrors (→ `federation.md`) |
| email-digest worker | author opt-in events | "your crate was indexed" |

## Submitter-driven flow

When a user calls `POST /api/v1/submit`:

```
1. submission queued (PG row)
2. queue worker picks up within ≤5 min
3. worker invokes the appropriate adapter's fetch_record(url)
4. validator runs
5. if pass → index; if fail → rejection row
6. submitter gets webhook notification (if registered) and email (opt-in)
```

Same code path as the scheduled poll — guarantees consistency between submit and crawl.

## Dead-package detection

A nightly job:
- Marks records with `origin.url` 404 for ≥ 7 days as `moderation.status = "delisted_by_moderator"` with `removal_reason: "upstream_404"`.
- Marks records with `last_commit_at` older than 18 months and zero downloads in the last 90 days as `tags += ["abandonware"]`. Not a removal — a discovery signal.
- Marks crates with new known CVEs (cross-referencing `rustsec/advisory-db`) → `tags += ["cve"]`, `moderation.status = "under_review"` if severity ≥ high.

## Cross-references

- Validator policy details: `moderation.md`
- License allow-list: `docs/specs/crates/licensing.md`
- Naming policy: `docs/specs/crates/naming.md`
- Manifest schema: `docs/specs/crates/manifest.md`
- Crawler subagent: `.claude/agents/hub-crawler-engineer.md`
