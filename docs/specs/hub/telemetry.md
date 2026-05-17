<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Telemetry

> Opt-in for authors. Anonymous for users. Counts downloads, geographies (country only), engine versions, platforms. No PII. Per-crate analytics only the crate's owner can query.

→ Privacy stance from vision §"AI-First Mandate" + §"Open Source Mandate" applied
→ Aggregate fields in `Telemetry` substructure: `index-format.md`

## What we track

| Datum | Granularity | Public? | Owner-only? | Default |
|---|---|---|---|---|
| Download count (per record version) | per-day | yes (aggregate) | — | always on |
| Country (ISO 3166) of downloader | per-day, per-country | yes (top-5) | full breakdown | on |
| Engine version of downloader | per-day | yes (distribution) | full breakdown | on |
| Platform | per-day | yes (distribution) | full breakdown | on |
| User agent class | per-day | no | yes (CLI vs browser vs agent) | on |
| Referrer (browse → click) | per-day | no | yes | on |
| Search queries that led to install | per-day | no | yes | on |

What we do NOT track:

| Datum | Why not |
|---|---|
| IP addresses (raw) | PII. We anonymize at ingest (hash + 24h salt rotation; never stored). |
| User account on a download | unless they're logged in AND opt-in; default = anonymous |
| Cross-record sessions | we don't build user trails |
| Exact GeoIP coordinates | country granularity only |
| Time-of-day patterns finer than per-day | not needed; risks identification of small-country installs |

## Where the events come from

| Source | Reliability | Triggers |
|---|---|---|
| `nexus hub install <crate>` (our CLI) | high | install starts → ping `/api/v1/events/install`; install completes → ping `/api/v1/events/install_complete` |
| `nexus hub download <asset>` redirect | high | the redirector logs the redirect |
| Mod marketplace webhook | medium | per-marketplace; rate of arrival varies |
| crates.io download stats sync | medium | we periodically GET crates.io counts and store deltas; this is the only "phone-home-less" source |
| Browser "Install" button click | low (no proof of completion) | client-side beacon; deduplicated by 24h cookie |

For crates whose users never run our CLI and never click our buttons, the only signal is the crates.io sync. We show this with a `source: ["crates_io_sync"]` tag in author analytics so authors know which numbers are noisy.

## Author analytics

A logged-in publisher of crate `X` sees, at `GET /api/v1/crates/X/analytics`:

```json
{
  "window": "last_90d",
  "downloads": {
    "total": 12480,
    "by_day": [/* 90 ints */],
    "by_source": {"nexus_cli": 8100, "crates_io_sync": 4200, "browser_click": 180}
  },
  "geo": {
    "top": [
      {"country": "US", "count": 4321, "pct": 0.34},
      {"country": "DE", "count": 1820, "pct": 0.15},
      {"country": "BR", "count": 1102, "pct": 0.09}
    ],
    "total_countries": 47,
    "other_pct": 0.42
  },
  "engine_versions": [
    {"version": "0.4.x", "pct": 0.81},
    {"version": "0.3.x", "pct": 0.16},
    {"version": "0.5.x-rc", "pct": 0.03}
  ],
  "platforms": [
    {"platform": "linux",    "pct": 0.51},
    {"platform": "windows",  "pct": 0.32},
    {"platform": "macos",    "pct": 0.13},
    {"platform": "web-wasm", "pct": 0.04}
  ],
  "referrers": [
    {"kind": "search", "top_terms": ["survival genre", "hunger system"], "pct": 0.42},
    {"kind": "category_browse", "pct": 0.31},
    {"kind": "direct_link", "pct": 0.18},
    {"kind": "recommend_endpoint", "pct": 0.09}
  ]
}
```

Public view (anyone): just `downloads.total`, `downloads.recent_90d`, `downloads.by_day` (smoothed), top-5 countries (no exact counts below the top-5 threshold), engine-version distribution. Everything else is owner-only.

## k-anonymity gates

| Field | Minimum bucket size to display |
|---|---|
| Country | k=5 — countries with < 5 downloads in the window are bucketed into `other` |
| Engine version | k=10 |
| Platform | k=3 (we have only ~6 categories; weaker threshold OK) |
| Search term | k=10 over a 30-day window |

Below the threshold → bucketed into `other_*`. Prevents "who's the one publisher in Liechtenstein using my crate?" privacy leaks.

## IP anonymization

```
event arrives:
  ip = request.peer_ip
  salt = current 24h salt    # rotated daily, never persisted past rotation
  hashed = blake3(salt || ip)
  geo = ip_to_country(ip)    # done in-memory, ip discarded
  store(event_id, geo, ...)  # NO ip; NO hashed
```

Hashed IP is used in-memory for ≤ 24h to deduplicate (same client downloading 5×/day counts once). Then the salt rotates and the hash becomes uncorrelatable.

## Opt-out for users

The `nexus hub install` CLI honors:

| Env var | Effect |
|---|---|
| `NEXUS_HUB_NO_TELEMETRY=1` | no install event sent |
| `NEXUS_HUB_NO_TELEMETRY_GEO=1` | install event sent, but with `geo` deliberately stripped |

Browser: a "Do Not Track" header is honored — no client beacon fires.

Author analytics fall back to crates.io sync only for opted-out installs; the count is approximate but not zero.

## Opt-out for authors

A crate author may set `[package.metadata.nexus.telemetry]` to:

```toml
[package.metadata.nexus.telemetry]
collect = false    # default true; if false, we don't store events for this crate
```

The crate then has no analytics page (and no per-crate aggregates exposed). Downloads still happen; we just don't index events. Re-enable any time.

## Retention

| Datum | Retention |
|---|---|
| Per-day event aggregates | 24 months |
| Per-hour event aggregates | none (we always roll up to per-day at ingest) |
| Salted IP hash | 24h max (in-memory only) |
| Raw IP | never (discarded at ingest) |
| Author analytics dashboard cache | 1h |
| Pre-rollup event log | 7 days (for backfill / debugging) |

## Event schema

```json
{
  "$id": "https://hub.nexus.engine/schemas/Event.json",
  "type": "object",
  "required": ["kind", "target", "at"],
  "properties": {
    "kind": {"enum": ["install_start", "install_complete", "redirect", "browser_install_click", "search_click"]},
    "target": {
      "type": "object",
      "properties": {
        "kind": {"enum": ["crate", "mod", "asset", "game", "template"]},
        "name": {"type": "string"},
        "version": {"type": ["string", "null"]}
      }
    },
    "at": {"type": "string", "format": "date-time"},
    "geo": {"type": ["string", "null"], "description": "ISO 3166-1 alpha-2"},
    "platform": {"type": ["string", "null"]},
    "engine_version": {"type": ["string", "null"]},
    "ua_class": {"enum": ["cli", "browser", "agent", "unknown"]},
    "referrer_kind": {"enum": ["search", "category_browse", "direct_link", "recommend_endpoint", "none"]}
  }
}
```

## Agent identification

Agent traffic (e.g. `nexus-coder`, MCP clients) sets `User-Agent: nexus-coder/<version> (+https://...)`. We classify as `ua_class: agent` and surface separately in author analytics ("X% of your installs are agents"). Useful for authors to know.

## Crates.io sync

Once a day, we GET `https://crates.io/api/v1/crates/{name}/downloads` and store the delta versus yesterday. Tagged `source: "crates_io_sync"` so authors can see hub-side install events vs ambient crates.io downloads. Two columns in the analytics dashboard.

## Public-aggregate API surface

```
GET /api/v1/crates/{name}/downloads        # 90d series, smoothed
GET /api/v1/crates/{name}/analytics        # owner-only, full breakdown
GET /api/v1/stats/global                   # aggregate across the hub (artifact count, install count, etc.)
```

`/api/v1/stats/global` is fully public and uncontroversial:

```json
{
  "as_of": "2026-05-17T00:00:00Z",
  "counts": { "crates": 1284, "mods": 5621, "assets": 412, "games": 38, "templates": 24, "users": 9420 },
  "downloads_last_30d": 1284560,
  "verified_attestations": 312,
  "active_mirrors": 7
}
```

## Pitfalls explicitly named

| Pitfall | Mitigation |
|---|---|
| "Anonymous" data re-identifiable via cross-fielding | k-anonymity gates per field; never publish low-bucket numbers |
| Author dashboards leak users' install patterns | owner-only access; rate-limited; signed access logs so users can audit who looked |
| Geo data resolves to one user in small countries | k=5 country gate; collapse to `other` |
| Telemetry becomes the load-bearing reason the hub exists | We commit: telemetry NEVER required to publish, install, or rate; it's a courtesy signal, not a payment |
| Marketing teams scraping bulk telemetry | Owner-only auth on author analytics; global stats are coarse |

## Cross-references

- Tracked telemetry → `index-format.md` §Telemetry
- CLI install events: `cli.md`
- Recommendation engine consumes aggregates: `agent-api.md`
- Vision: privacy-respecting open ecosystem (`docs/initial/vision.md`).
