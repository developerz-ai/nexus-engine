<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — nexus-hub `[DECISION NEEDED]`

> Proposed first-party federated index. No vendor lock. Optional, never required. Discovery + signed mirror feed for self-hosted mods. Implementation deferred pending decision.

## Status

`[DECISION NEEDED]` — whether the project ships a first-party hub at all. This document captures the design so the decision can be made.

## Motivation

- Self-hosted gives total freedom but zero discovery.
- Existing marketplaces give discovery but vendor lock + occasional policy whiplash.
- A federated, MIT-licensed, signed index aggregator could bridge the two without becoming the next single point of failure.

## Non-Negotiable Constraints (if accepted)

- MIT licensed.
- Optional. The engine works without it. The CLI works without it. Games work without it.
- Federated. No central control. Anyone can run a node.
- No mod hosting at the hub level — hub stores only signed pointers (index.toml URLs + hashes).
- No moderation policy at the hub level — moderation is per-feed.
- Zero revenue extraction.

## Design Sketch

```
nexus-hub instance
├── /api/v1/feeds                   ← list of subscribed feeds (URLs)
├── /api/v1/search?q=...            ← cross-feed search (cached aggregates)
├── /api/v1/feed/{url-hash}         ← per-feed cached metadata
└── /api/v1/peers                   ← other hub instances this one peers with
```

Operates as a thin layer over `docs/guides/mods/marketplaces/self-hosted.md` indices. Hub fetches each subscribed feed's `index.toml`, validates signatures, aggregates into a search index, exposes via REST + a small GraphQL surface.

Hubs peer with each other (gossip-style) so a search query at one hub returns results from feeds others have indexed.

## Why "Hub" not "Marketplace"

Hubs do not:
- Host bytes.
- Take payments.
- Run moderation.
- Issue takedowns.
- Sign mods themselves.

Hubs do:
- Aggregate signed feeds.
- Provide search.
- Cache metadata.
- Notify subscribers of updates.

## Identity & Trust

Each hub:
- Has a DID and Ed25519 signing key.
- Signs its aggregate responses.
- Publishes its peer list signed.

Clients pin trusted hubs. TOFU on first contact. Multiple hubs can be configured; engine merges results.

## API (sketch)

```
GET /api/v1/search?q=healing&game=*&nsfw=false
→ { items: [{mod_id, latest_version, feed_url, mod_hash, ...}], total: N }

POST /api/v1/feed/subscribe   { url, pubkey }
GET  /api/v1/feed             { url } → cached index.toml + provenance
GET  /api/v1/peers            → signed list of peer hub URLs
```

All endpoints CORS-enabled for web-target games.

## Engine Adapter

`Nexus.toml::[mods.marketplaces]`:

```toml
[mods.marketplaces.hub]
url = "https://nexus-hub.example/"
trust = "pinned"
pinned_key = "z6Mk..."
```

`nexus mod search hub:nexus-hub.example healing` → REST query → results aggregated across all subscribed feeds.

## Anti-Spam

- Feeds must be cryptographically signed.
- Hub charges no fees but rate-limits anonymous adds.
- Reputation system: feeds that produce frequent takedowns or hash-blocklist hits decay in search ranking.
- Hub admin can blacklist individual feeds for legal reasons (court order, CSAM); blacklist is signed and propagated to peers.

## Anti-Capture

To avoid the hub becoming the next gatekeeper:
- Encoded principle: engine warns players if any feed is **only** reachable through one hub. Self-hosted feeds should always be accessible directly.
- Reference impl is MIT and trivial to fork; spinning up a competing hub is the explicit expectation.
- Engine ships zero default hub URL. Players add hubs explicitly. Game studios may pre-add their own.

## Cost Model

Hub operators pay hosting. The engine project explicitly does NOT run "the" hub. If contributors run hubs, they're community resources.

Optional features that might justify a hub (with `[DECISION NEEDED]` per item):
- AI-driven mod recommendation (consent-required).
- Curated featured shelves (community curators or DAO).
- Analytics dashboards for mod authors (opt-in by author, see `docs/specs/mods/telemetry.md`).
- Mod-author donation aggregation (no platform cut; pass-through to Ko-fi etc.).

## Trade-offs

| For | Against |
|---|---|
| Discovery for self-hosted mods | Yet another piece of infrastructure |
| Federation = no single point of failure | Federation = complexity |
| Aggregates community-curated lists | Adds a hub admin role; potential governance drama |
| Opens donation aggregation flows | Risks becoming a de-facto gatekeeper |
| MIT signal preservation | Effort to maintain |

## Recommendation

`[DECISION NEEDED]` — recommend deferring to engine v1.1, after:
1. The self-hosted experience is widely used.
2. Community signals demand for cross-feed discovery.
3. A volunteer (or org) commits to running a reference hub.

In the interim: invest in `self-hosted.md` UX (TOFU prompts, sane defaults, easy backend setup); ship `nexus mod serve` for LAN dev; document the federation hooks in `index.toml`.

## Implementation Notes (if accepted)

- Backend: Rust + Axum + SQLite (small instances) or Postgres (large).
- Aggregator: cron-style polling of subscribed feeds; respects `Cache-Control`.
- Search: simple full-text + tag filter; pluggable for fancier ranking.
- Federation: Activity-Streams-flavored peer announce; small JSON-LD subset.
- Deploy story: single Docker image; fly.toml / k8s manifest example.

## Open Questions

- `[DECISION NEEDED]` Ship or not?
- `[DECISION NEEDED]` If ship: who operates the reference instance?
- `[DECISION NEEDED]` Governance for feed blacklist (community vote? hub-admin discretion?).
- `[DECISION NEEDED]` Whether mod-author donation aggregation belongs at hub or stays at marketplace.
- `[AGENT: 23]` Subagent `nexus-hub-operator` if accepted.

## Integration Points

- `docs/guides/mods/marketplaces/self-hosted.md` — hub aggregates these.
- `docs/specs/mods/nsfw-and-moderation.md` — hub respects per-feed moderation; can blacklist by hash.
- `docs/specs/mods/telemetry.md` — optional aggregation surface (opt-in).
- `docs/guides/mods/overview.md` — hub one option among many.

## Sources / Prior Art

- ActivityPub / Mastodon federation ✓ — model for peering.
- Cargo alternative registries ✓ — multi-source pattern.
- Helm chart museum ✓ — index-as-data model.
- F-Droid repos ✓ — community-run indices, signed.
- Funkwhale / PeerTube ✓ — federated content discovery without hosting.
