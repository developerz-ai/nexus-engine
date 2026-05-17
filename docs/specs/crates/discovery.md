<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Discovery

> Three tiers of discovery. Primary is crates.io + lib.rs (always available). Secondary is the optional `nexus-hub` federated index. Tertiary is the community awesome-list. Each emits the same JSON shape.

→ Overview: `docs/specs/crates/overview.md`.
→ Naming policy (drives prefix filter): `docs/specs/crates/naming.md`.
→ crates.io: `https://crates.io`. lib.rs: `https://lib.rs`.

## Tiers

| Tier | Source | Trust | Latency | Coverage |
|---|---|---|---|---|
| Primary | crates.io + lib.rs | Source of truth | Real-time on publish | Everything |
| Secondary | `nexus-hub` federated index | Curated mirror | ≤ 5 min sync | Indexed Nexus-categorized crates |
| Tertiary | `awesome-nexus` repo | Hand-curated | Manual PR | Editor's-choice list |

## Primary: crates.io + lib.rs

Out-of-the-box discovery uses existing infrastructure. Conventions:

- Keywords: `keywords = ["nexus", "nexus-<category>"]` — crates.io supports up to 5; consumers query via crates.io API or `lib.rs/keywords/nexus-style`.
- Crates.io category: `categories = ["game-engines"]` (closest official taxonomy).
- Description starts with `[<category>]` tag for grep readability in `cargo search`:
  ```
  [style] Anime / cel-shaded StylePipeline for Nexus Engine.
  ```

Programmatic API:

- crates.io: `https://crates.io/api/v1/crates?q=nexus-style&per_page=100` (JSON). Rate-limited; see policy.
- lib.rs: rich search via `https://lib.rs/keywords/<keyword>` with HTML+RSS feeds.

Limitations:
- No native filter by `[package.metadata.nexus].category`. Consumers must fetch `Cargo.toml` to read the block.
- No verification badge.
- Crates.io does not delete; yanks only. → `docs/specs/crates/release-pipeline.md`.

For most consumers and `nexus-coder`, primary is enough. → `docs/guides/crates/consuming.md`.

## Secondary: `nexus-hub` Federated Index

**Ships v1.0.** Canonical spec: `docs/specs/hub/overview.md` (Agent 30). Resolution: `docs/architecture/decisions-resolved.md`.

A federated index that mirrors crates.io's `nexus-*` and `nexus-community-*` namespaces plus tracked third-party crates, enriched with:
- The `[package.metadata.nexus]` block parsed at index time.
- Verification tier (Verified / Community / Quarantine — see `docs/specs/crates/quality-bar.md`).
- Health signals (download trend, dep tree depth, last release, CVE count).
- Compat matrix vs known engine versions.

```
crates.io ──publish──▶ nexus-hub indexer ──▶ search.nexus-engine.dev (web UI)
                                          └──▶ index.nexus-engine.dev/v1/  (JSON API)
                                          └──▶ awesome-nexus (auto-PR new entries)
```

Federation: anyone can run a `nexus-hub` mirror. The reference instance is operated by the Verification Council. `nexus add` accepts a `--registry` flag.

### Index entry — JSON shape

```json
{
  "schema_version": "1.0",
  "name": "nexus-style-anime",
  "version": "0.3.1",
  "category": "style",
  "implements": ["StylePipeline"],
  "engine_versions": ">=1.0, <2.0",
  "license": "MIT",
  "tier": "verified",
  "behavior": {
    "mods_compat": true,
    "headless_safe": true,
    "deterministic": false,
    "agent_friendly": true
  },
  "provenance": {
    "repo": "https://github.com/sebyx07/nexus-style-anime",
    "docs": "https://docs.rs/nexus-style-anime",
    "homepage": "https://nexus-style-anime.dev",
    "audit_log_url": "https://github.com/sebyx07/nexus-style-anime/security/advisories",
    "sbom_url": "https://nexus-hub.dev/sbom/nexus-style-anime/0.3.1.cdx.json"
  },
  "audit": {
    "tier": "verified",
    "verified_at": "2026-05-10T12:00:00Z",
    "verifier": "council:5",
    "playbook_version": "1.0",
    "score": 0.94,
    "findings": []
  },
  "health": {
    "downloads_30d": 12480,
    "last_release_at": "2026-05-01T08:11:00Z",
    "dep_count": 14,
    "cve_count_open": 0,
    "rustdoc_coverage": 0.91,
    "scenario_pass_rate": 1.0
  },
  "compat": {
    "engine_1_0": "ok",
    "engine_1_1": "ok",
    "engine_1_2": "ok-via-shim"
  },
  "recommended_with": ["nexus-genre-platformer"],
  "incompatible_with": ["nexus-style-pbr"]
}
```

This shape is consumed by:
- `nexus add` for compat checks.
- `nexus-coder` for filter/rank. → `docs/guides/crates/agent-recipes.md`.
- The web UI search.
- CI tooling (`cargo-deny` integration).

### Index endpoints

| Endpoint | Returns |
|---|---|
| `GET /v1/crate/{name}` | latest version entry |
| `GET /v1/crate/{name}/{version}` | specific version entry |
| `GET /v1/search?category=style&engine=^1.0&tier=verified` | filtered list |
| `GET /v1/category/{key}` | all crates in a category |
| `GET /v1/feed/new` | RSS of newly indexed crates |
| `POST /v1/attest` | upload audit attestation (Council members only) |

All endpoints emit structured JSON. No HTML on the index host; the web UI is a separate static site that consumes the API.

### Indexer rules

| Rule | Action on violation |
|---|---|
| `[package.metadata.nexus]` missing | Index as `category = "unknown"`, Community tier |
| `category` invalid | Refuse to index; surface error in publisher dashboard |
| `license` not in allow-list | Index with `tier = "quarantine"` and license banner |
| Name fails `naming.md` rules | Index with banner; surface conflict |
| `vet_attestation` missing for Verified tier | Downgrade to Community |
| Yanked on crates.io | Mark `health.yanked = true`, retain entry for audit trail |

## Tertiary: `awesome-nexus`

→ `docs/specs/crates/awesome-nexus.md`. Hand-curated, PR-driven, hosted at `https://github.com/nexus-engine/awesome-nexus` (or wherever the community list lives — `[DECISION NEEDED]`).

For humans skimming. The index is the machine surface.

## Discovery via `nexus add` and `nexus-coder`

```
$ nexus add --search "anime style"
querying index.nexus-engine.dev …
found 3 verified, 1 community, 0 quarantined

VERIFIED:
  nexus-style-anime          0.3.1  StylePipeline  MIT  ~12.5k dl/30d  ✓ compat 1.0–1.2
  nexus-style-cel-shading    0.1.4  StylePipeline  MIT  ~3.1k dl/30d   ✓ compat 1.0–1.2
  nexus-style-toon-outline   1.2.0  StylePipeline  MIT  ~8.0k dl/30d   ✓ compat 1.0–1.2

COMMUNITY (no audit):
  nexus-community-style-manga 0.0.3 StylePipeline  MIT  ~120 dl/30d   ⚠ no audit
```

Subagent flow: `nexus-coder` calls the JSON API with category + engine compat + license filter, ranks by score (verified > community), then proceeds to evaluation. → `docs/guides/crates/agent-recipes.md`.

## Integration Points

- → `docs/specs/crates/manifest.md` — the metadata block the indexer parses.
- → `docs/specs/crates/quality-bar.md` — verification tier source.
- → `docs/specs/crates/awesome-nexus.md` — the curated list.
- → `docs/specs/mods/overview.md` § Open Questions — `nexus-hub` also indexes mods (same infrastructure).

## Prior Art

- **crates.io** ✓ — the foundation. We don't replace; we federate. Policy: `https://crates.io/policies`.
- **lib.rs** ✓ — better discovery UX over crates.io; we mirror their tagging convention.
- **Bevy assets** (`https://bevyengine.org/assets/`) ✓ — hand-curated index per category; lighter than `nexus-hub` but mirrors the shape we want.
- **Awesome-Rust** ✓ — community-curated list pattern.
- **npm advisories / RustSec** ✓ — health signals.
- **Maven Central** ✗ — heavyweight, requires sign-up to publish; we want the crates.io zero-friction publish.

## Open Questions

- **RESOLVED 2026-05-17** — `nexus-hub` ships **v1.0**. Canonical spec: `docs/specs/hub/overview.md`.
- `[DECISION NEEDED]` Whether `nexus-hub` runs an alternate registry (publish destination) or is read-only mirror of crates.io. Default proposal: **read-only mirror** to preserve crates.io as source of truth.
- `[DECISION NEEDED]` Index entry retention for yanked crates: forever (audit trail) vs 1 year. Default: forever, with `health.yanked = true` filter.
- `[BENCHMARK NEEDED]` Indexer cold-start cost; target full crates.io scan ≤ 1 hour.
- `[AGENT: 18]` Confirm `nexus-coder` tool surface includes an HTTP fetcher with allow-list for the index host.
