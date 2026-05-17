<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — `awesome-nexus`

> Hand-curated community list. PR-driven. Hosted in a separate repo. The human-readable counterpart to the `nexus-hub` JSON index.

→ Overview: `docs/specs/crates/overview.md`.
→ Machine-readable discovery: `docs/specs/crates/discovery.md`.
→ Awesome-list convention: `https://github.com/sindresorhus/awesome`.

## Location

`[DECISION NEEDED]` Where the community list lives.

| Option | Pros | Cons |
|---|---|---|
| `https://github.com/nexus-engine/awesome-nexus` | Org-owned; canonical | Requires `nexus-engine` GitHub org creation |
| `https://github.com/sebyx07/awesome-nexus` | Lives next to engine | Author-scoped; bus-factor |
| `https://github.com/awesome-nexus-engine/awesome-nexus` | Independent org | Federation overhead |

Default proposal: **`github.com/nexus-engine/awesome-nexus`** once the `nexus-engine` GitHub org exists. Until then: a placeholder file at `docs/specs/crates/curated-list-bootstrap.md` `[NEW — to be authored]` carries the curated entries inline.

## Scope

| Included | Excluded |
|---|---|
| Verified `nexus-*` crates | Quarantined crates |
| Mature `nexus-community-*` crates (≥ 100 downloads / 30d, ≥ 3 months active, ≥ 1 audit) | Unmaintained crates (no commit in 12 months) |
| Selected `nx-*` crates with cross-game utility | NSFW crates (have own listing per `nsfw-and-moderation` policy) |
| Tutorials, blog posts, sample games | Closed-source crates |
| Conference talks, podcasts | Marketing fluff |

## Entry shape

```markdown
- [nexus-style-anime](https://crates.io/crates/nexus-style-anime) — Anime / cel-shaded StylePipeline. MIT. ✓ verified. [docs](https://docs.rs/nexus-style-anime) · [repo](https://github.com/sebyx07/nexus-style-anime) · [audit](https://nexus-hub.dev/audit/nexus-style-anime)
```

One line per entry. Format:
```
- [<name>](<crates.io url>) — <one-line description>. <SPDX-id>. <tier-badge>. [docs](<url>) · [repo](<url>) · [audit](<url>)
```

## Sections (mirrors `docs/specs/crates/categories.md`)

```markdown
# Awesome Nexus

> Community-curated list of Nexus Engine crates, tools, learning resources, and games.

## Genres
- ...

## Styles
- ...

## Physics
- ...

## Networking
- ...

## Audio
- ...

## Asset sources
- ...

## Telemetry sinks
- ...

## Feature flags
- ...

## Input devices
- ...

## Platforms
- ...

## Script languages
- ...

## Genre toolkits
- ...

## Tools
- ...

## Test fixtures
- ...

## Games built on Nexus
- ...

## Tutorials
- ...

## Blog posts
- ...

## Talks & podcasts
- ...
```

## PR rules

| Rule |
|---|
| One entry per PR (easy review) |
| Entry MUST follow the shape above |
| Entry MUST link to a working crates.io page |
| Entry MUST cite license (allow-list only) |
| Entry MUST cite verification tier when known |
| New entries default to alphabetical within their section |
| Removals require a reason (unmaintained / quarantined / superseded) |

CI: `awesome-lint` (`https://github.com/sindresorhus/awesome-lint`) plus a custom check that every linked crates.io URL resolves.

## Automation

`nexus-hub` opens auto-PRs against `awesome-nexus` when:
- A crate reaches Verified tier.
- A crate exceeds 1k downloads/30d for the first time.
- A crate is published in a category that has no existing entries.

Maintainer reviews; merges or rejects.

## Cross-references

- → `docs/specs/crates/discovery.md` — the JSON index complements this human-readable list.
- → `docs/specs/crates/quality-bar.md` — Verified badge source.
- → `docs/specs/crates/naming.md` — bad-name policy applies to entries.
- → `docs/guides/crates/curated-list.md` — the starter crates shipped day one (subset of the awesome-list).

## Open Questions

- `[DECISION NEEDED]` Final URL once `nexus-engine` GitHub org exists. Track in `docs/architecture/decisions-open.md`.
- `[DECISION NEEDED]` Whether to gate inclusion on the Verified tier (stricter) or accept Community with a banner (more open). Default: accept Community with banner; reject Quarantine.
- `[DECISION NEEDED]` Multilingual sections (Japanese, French, Spanish)? Default: defer to per-language forks linked from root.
