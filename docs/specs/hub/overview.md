<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Overview

> Index. Discovery. Curation. Verification. Ratings. **Not storage.** nexus-hub is the rubygems-discovery layer without the rubygems-storage layer — for humans AND for AI agents.

## What nexus-hub IS

- A federated **index** over the existing artifact homes (crates.io, mod marketplaces, asset libraries, GitHub).
- A **discovery + curation** layer: categories, search, leaderboards, badges.
- A **verification registry**: signed attestations from auditors (the Verified tier from `docs/specs/crates/quality-bar.md`).
- A **ratings + reviews** service from verified installers.
- A **JSON API first**, HTML second. Every page has a parallel `.json` URL.
- **Federated.** Anyone can run a mirror. The official hub is the default, not the owner.
- **Self-hostable.** `docker-compose up` brings up a working hub in minutes (→ `docs/guides/hub/self-hosting.md`).
- **MIT.** Code, schema, and the full index snapshot are open.

## What nexus-hub IS NOT

- Not a code host. Crates live on **crates.io**. Forks live on GitHub. nexus-hub never serves a `.crate` tarball.
- Not a mod CDN. Mods live on Steam Workshop / Mod.io / Thunderstore / self-hosted. nexus-hub links out for install.
- Not an asset CDN. Asset packs live on Kenney / Poly Haven / OpenGameArt / ambientCG / IPFS.
- Not a Cargo alternative-registry (→ `https://doc.rust-lang.org/cargo/reference/registries.html`). Do NOT point `cargo` at it. The single source of truth for Rust dependency resolution is crates.io.
- Not a payment processor. No royalties. No revenue share. Ever (vision §"The Commitment").

## Artifact storage table

| Artifact type | Source-of-truth storage | Indexed by nexus-hub |
|---|---|---|
| Rust crates | crates.io | yes — aggregated, tagged, scored |
| Mods | Steam Workshop · Mod.io · Thunderstore · self-host | yes — federated index |
| Asset packs (CC0) | Kenney · Poly Haven · OpenGameArt · ambientCG · FLUX · IPFS | yes |
| Demo games | itch.io · Steam · GitHub releases | yes |
| Templates | GitHub repos | yes |
| Verified attestations | **nexus-hub itself** (signed JSON blobs) | yes — primary store |

nexus-hub owns only the last row. Everything else is a pointer.

## Why this split

| Concern | Owned by | Why |
|---|---|---|
| Code hosting | crates.io | Rust ecosystem already trusts it; we don't fragment dependency resolution |
| Mod hosting | marketplaces | Each has its own moderation + CDN + monetization; we don't compete |
| Asset hosting | CC0 libraries | Already free, already large; we link |
| Curation + verification | nexus-hub | The thing actually missing from the ecosystem |

Curation is the value-add. Hosting is a commodity. Don't conflate them.

## Federation principle

Anyone can run a mirror. The protocol (→ `federation.md`) is open. Mirrors publish a `/.well-known/nexus-hub.json` manifest, crawl the canonical hub, and serve their own communities. The official hub at `hub.nexus.engine` is the most popular instance, not the owner.

Precedent: Thunderstore federates per-community (`docs/specs/mods/marketplaces/decision-matrix.md`). ActivityPub federates per-actor (`https://activitypub.rocks`). WebFinger federates per-domain (`https://www.rfc-editor.org/rfc/rfc7033`). nexus-hub federates per-mirror.

## AI-first principle

- Every endpoint emits JSON. Every HTML page has a parallel `.json` URL.
- The full index ships as a gzipped snapshot at `/api/v1/index.json` (ETag'd, agent-cacheable).
- `nexus-coder` queries the hub for discovery + evaluation (→ `agent-api.md`, → `docs/specs/coder/tools.md`).
- MCP wrapper exposes hub queries as tools to any MCP-aware client (→ `docs/specs/agent/mcp-server.md`).
- The mastermind routes `find me a crate that does X` to `crate-consumer-advisor` (Agent 28 fleet — see project root `CLAUDE.md` mastermind routing), which queries nexus-hub.

## Role in the ecosystem

```
                ┌─────────────────────────┐
                │   nexus-coder (AI)      │
                │   nexus CLI · MCP host  │
                │   browser (humans)      │
                └────────────┬────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │   nexus-hub   │   ← index + curation + verification
                    │  (this spec)  │
                    └───┬───────────┘
                        │  links + crawls
        ┌───────────────┼────────────────┬──────────────┐
        ▼               ▼                ▼              ▼
    crates.io      Steam Workshop    Kenney /        GitHub
    (code)         Mod.io            Poly Haven      (templates,
                   Thunderstore      (assets)         demos)
                   (mods)
```

nexus-hub recommended as the canonical discovery mechanism declared in `docs/specs/crates/discovery.md`.

## Vendor honesty — alternatives table

| Option | What it gives | What it lacks vs nexus-hub |
|---|---|---|
| crates.io alone | Authoritative Rust registry, downloads | No Nexus-specific category, no verification tier, no mod/asset/template surface, no AI-first JSON-index snapshot |
| lib.rs (https://lib.rs) | Better ranking + quality signals over crates.io | Rust-only; not federated; no mod/asset/attestation layer; not AI-first per se |
| Thunderstore-style federated hub | Per-community federation; mod-focused | Mod-only; no crate/asset/template surface; no signed attestations |
| ActivityPub federation | Generic actor/inbox model | Wrong abstraction for package index; high implementation cost; no canonical index |
| Cargo alternative-registry | Native `cargo` integration | Fragments dependency resolution; we want crates.io to remain canonical |
| Awesome-list on GitHub | Zero infra | Manual; no search API; no ratings; no machine-readable index |

nexus-hub takes lib.rs's quality-signals model, Thunderstore's federation model, RubyGems API's response shape (`https://guides.rubygems.org/rubygems-org-api/`), and adds a multi-artifact surface (crates + mods + assets + templates + games) with signed verification attestations.

## Pitfalls — explicitly named

| Pitfall | Mitigation |
|---|---|
| Spam submissions | Crawl `nexus-*` keyword + signed manifest; manual moderation queue for outliers (→ `moderation.md`) |
| Rating manipulation / brigading | Verified-installer-only ratings; Wilson interval ranking; rate limits (→ `ratings-reviews.md`) |
| Dead-package rot | Auto-flag on last-commit > 18mo + broken deps; "abandonware" badge (→ `moderation.md`) |
| RubyGems-takeover-style supply-chain attack | Signed attestations; key rotation; revocation log (→ `verification.md`); we don't host artifacts so the attack surface is the index, not the binary |
| Index drift across mirrors | Canonical-source field on every record; sync protocol with conflict resolution (→ `federation.md`) |
| Hub becomes the bottleneck | Self-hostable from day one; full index is downloadable; no lock-in |
| Account takeover | OAuth-only by default; hardware-key MFA for attestation-signing accounts (→ `identity.md`) |

## Doc map

```
docs/specs/hub/
├── overview.md              ← you are here
├── architecture.md          ← topology, components, choices
├── api.md                   ← full HTTP API + JSON schemas
├── index-format.md          ← canonical record schema
├── crawler.md               ← how content enters the index
├── verification.md          ← signed attestations + audit log
├── federation.md            ← mirror protocol
├── moderation.md            ← flags, queue, appeals
├── identity.md              ← accounts, OAuth, reputation
├── ratings-reviews.md       ← stars + reviews
├── telemetry.md             ← opt-in author analytics
├── agent-api.md             ← AI-agent surface
├── cli.md                   ← `nexus hub …` subcommand
└── browse-ui.md             ← human-facing site

docs/guides/hub/
├── overview.md              ← narrative entrypoint
├── submitting.md            ← author guide
├── self-hosting.md          ← run your own mirror
└── agent-recipes.md         ← nexus-coder hub recipes
```

## Cross-references

- Ecosystem index: see also the repo `README.md`.
- Crates discovery declared the hub canonical: `docs/specs/crates/discovery.md`.
- Mods marketplace decision matrix: `docs/specs/mods/marketplaces/decision-matrix.md`.
- nexus-coder tool surface: `docs/specs/coder/tools.md`.
- MCP wrapper: `docs/specs/agent/mcp-server.md`.

[INTEGRATION NEEDED] When Agent 28 finalizes `docs/specs/crates/discovery.md`, it MUST point to this overview as the canonical discovery spec. When Agent 26 publishes `docs/specs/mods/marketplaces/nexus-hub.md`, the two must agree on the federation contract; this spec is the source of truth for index format and federation protocol.
