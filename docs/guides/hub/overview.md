<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — nexus-hub Overview

> What it is. Who runs it. How to use it as a dev, as a consumer, as an AI agent.

Spec source: `docs/specs/hub/overview.md` (canonical). This guide is the narrative entrypoint.

## TL;DR

- nexus-hub indexes Nexus ecosystem artifacts (crates, mods, asset packs, demo games, templates).
- It does NOT host them. crates.io hosts crates. Marketplaces host mods. CC0 libraries host assets. nexus-hub stores **the index, the curation, and the signed verification attestations.**
- Browse it as a human at `https://hub.nexus.engine`.
- Query it as an AI agent at `https://hub.nexus.engine/api/v1`.
- Self-host a mirror: `nexus hub mirror up`.
- Federated. Anyone can run an instance. Official hub is the default, not the owner.

## Who runs it

| Operator | Role |
|---|---|
| Nexus foundation | runs `hub.nexus.engine` — the default canonical instance |
| Studios | private mirrors for internal crates; opt-in federation back to canonical |
| Communities | regional or topical mirrors (e.g. `hub.modders.example`) — opt-in federation |
| You | for testing or air-gapped use; `nexus hub mirror up` brings up a local instance |

## Who uses it

| Role | Surface |
|---|---|
| Player browsing mods | the Browse UI; clicks through to the marketplace to install |
| Indie dev picking a genre layer | the Browse UI or `nexus hub recommend --genre ...` |
| Studio CI evaluating new dep | `nexus hub eval <name> --project ./Nexus.toml` |
| AI agent (nexus-coder) | downloads `/api/v1/index.json`, queries locally, calls `/recommend` and `/eval-crate` for fresh answers |
| Crate publisher | `nexus hub submit` (only needed if the crate isn't auto-discovered via the `nexus-*` naming convention) |
| Auditor | `nexus hub attest` to publish a signed Verified-tier attestation |
| Moderator | the `/admin/queue` Browse UI; signs every action |
| Mirror operator | `nexus hub mirror up` + register |

## What you do not need an account for

Browsing. Searching. Downloading the index snapshot. Reading any record, version, or attestation. Reading the audit log. **You can do all of nexus-hub's discovery and verification work as a guest.**

Account required for: submitting, rating, flagging, attesting, mirror-registering.

## What the mastermind routes to nexus-hub

From the repo root `CLAUDE.md`, when a developer types `find me a crate that does X`, the mastermind routes the request to `crate-consumer-advisor` (Agent 28's subagent), which:

1. Translates `X` into an `intent` shape (genres, engines, requirements).
2. Calls `POST /api/v1/recommend` on the configured nexus-hub.
3. Surfaces the top 3 with `reasons[]` and `next_steps[]`.
4. Optionally calls `POST /api/v1/eval-crate/{name}` against the project's `Nexus.toml` for a fit report.
5. Returns the install command.

## How a dev publishes

```
1. Publish to crates.io as usual: `cargo publish`
2. Make sure name is `nexus-*` OR has `nexus` in keywords — the crawler picks it up automatically within ≤ 5 min
3. (optional) Open an attestation request if you want Verified tier: see `submitting.md`
4. (optional) Embed the badge on your README
```

The first step is the only one the dev does differently from publishing any crate. Everything else is automatic.

## How a consumer installs

```
nexus hub search "soulslike"
nexus hub show nexus-genre-soulslike-core
nexus hub eval nexus-genre-soulslike-core
nexus hub install nexus-genre-soulslike-core
```

`install` wraps `cargo add` + updates `Nexus.toml`. No magic — `cargo` remains the source of truth for dependency resolution.

## How an AI agent uses it

```
1. GET /api/v1/index.json (with If-None-Match for caching)
2. Local rank against decision tables (downloadable JSON)
3. POST /api/v1/recommend or /eval-crate when fresh + reasoned answer needed
4. Surface results via MCP tools (nexus-mcp-server)
```

Details: `agent-recipes.md`.

## How federation works (one paragraph)

Every mirror serves `/.well-known/nexus-hub.json`. Mirrors pull the canonical hub's snapshot hourly. Each record carries `canonical_hub` so mirrors know who's authoritative. A mirror can be canonical for its own namespace (e.g. `studio-acme-*`) while mirroring `nexus-*` from the foundation. Spec: `docs/specs/hub/federation.md`.

## Vendor honesty

| Comparable | What nexus-hub adds |
|---|---|
| crates.io alone | Nexus-specific categories, verification tier, mod/asset/template surface, AI-first JSON-index snapshot |
| lib.rs | Multi-artifact, federated, signed attestations |
| Thunderstore | Multi-artifact (not just mods), per-record canonical instead of per-community |
| awesome-list on GitHub | Programmatic API, machine-readable, signed attestations |

nexus-hub borrows from each: lib.rs's quality-signals model; Thunderstore's federation model; RubyGems's API shape; awesome-list's curation discipline.

## Cross-references

- Spec: `docs/specs/hub/overview.md`
- Self-host: `self-hosting.md`
- Submit: `submitting.md`
- Agent recipes: `agent-recipes.md`
- Ecosystem index (also see repo `README.md`)
