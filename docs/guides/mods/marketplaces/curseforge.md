<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — CurseForge

> Minecraft-style modpack and launcher ecosystem. Reference channel for games that want a CurseForge App / Overwolf-style launcher integration. REST API. `[VERIFY — CurseForge / Overwolf policy changes]`.

## When To Use
- Game is a Minecraft modding-target equivalent.
- Want modpack distribution UX (combine many mods into a curated list).
- Want CurseForge App distribution.

## When NOT To Use
- Game is not in CurseForge's supported games list (mostly Minecraft, World of Warcraft, World of Tanks, RuneScape style).
- Want minimum vendor lock-in (Overwolf-owned platform).

## Status

Reference / lower priority. Engine ships the adapter for completeness, but recommends Mod.io or Thunderstore for new games unless community insists.

## Format Mapping

CurseForge packages = ZIP with a per-game manifest (e.g., Minecraft uses `manifest.json` for modpacks, `pack.toml` for individual mods in Forge era). Engine adapter wraps `.nxmod` with the appropriate per-game wrapper at publish time.

## Engine Integration

`mod.toml`:

```toml
[marketplace.curseforge]
project_id = 1234567
game_slug = "minecraft"                # or whatever
visibility = "public"
release_type = "release"               # release | beta | alpha
```

## Auth

CurseForge API key (per Overwolf developer account):
- Read access: anonymous OK for browse.
- Write (upload): requires user-level API token from CurseForge author dashboard.

Storage:
```toml
# ~/.nexus/auth/curseforge.toml
[token]
api_token = "cf_..."
```

## Upload Recipe

```
nexus mod publish --to curseforge --project-id 1234567 --game-slug minecraft
```

Flow:
1. Verifies `.nxmod`.
2. Generates per-game wrapper (game-slug-specific).
3. POST to CurseForge author API upload endpoint.
4. Receives file id; records mapping.

`[VERIFY]` — exact upload endpoint and per-game wrapper format. CurseForge documentation is gated behind the developer dashboard; consult Overwolf docs at publish time.

## Modpack Distribution

CurseForge's strength is modpack curation. Engine's "Collections-style" pack format can be emitted to CurseForge:

```
nexus mod pack-collection my-pack/ --to curseforge
```

Generates a CurseForge-compatible modpack ZIP including resolved mod ids + versions. Players install via CurseForge App or direct.

## Moderation

CurseForge / Overwolf TOS. Project takedowns honored per `docs/specs/mods/nsfw-and-moderation.md`.

## Player Install

CurseForge App (Overwolf-based) is the standard install path on supported platforms. Engine supports direct install via:

```
nexus mod install curseforge:1234567:9876
```

## CLI Reference

```
nexus mod publish --to curseforge --project-id 1234567 --game-slug GAME
nexus mod search curseforge --game-slug minecraft --category world-gen
nexus mod fetch curseforge:1234567:9876 --out path/
nexus mod auth curseforge --token cf_...
```

## Pitfalls

- Per-game wrapper schemas vary; engine maintains a small per-game table; community can contribute new ones.
- Overwolf integration may add binary footprint on Windows (their launcher).
- API rate limits per Overwolf tier; respect 429.
- Monetization on CurseForge is per Overwolf rules; `[VERIFY]` current revenue split (historically a portion is paid to authors via points system).

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_CF_AUTH` | API token invalid |
| `MOD_E_CF_PROJECT_NOT_FOUND` | Project id wrong |
| `MOD_E_CF_GAME_NOT_SUPPORTED` | Game-slug not in supported list |
| `MOD_E_CF_UPLOAD` | Upload failed |
| `MOD_E_CF_RATE_LIMITED` | 429; back off |

## Integration Points

- `docs/specs/mods/manifest.md` `[marketplace.curseforge]`.
- `docs/guides/mods/marketplaces/decision-matrix.md`.

## Open Questions

- `[VERIFY]` Current public upload API surface; engine may need to use Overwolf's web automation if no API.
- `[VERIFY]` Per-game wrapper schema for non-Minecraft games.
- `[DECISION NEEDED]` Whether to invest beyond a minimum-viable adapter; Mod.io covers most use-cases.

## Sources

- `console.curseforge.com` — author console (login required).
- `support.curseforge.com` — public docs.
- `dev.overwolf.com` — Overwolf developer docs.
- `[VERIFY]` exact public REST surface.
