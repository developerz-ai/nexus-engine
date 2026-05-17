<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — Nexus Mods

> Largest established mod community for Bethesda-style RPGs (Skyrim, FO4) and many others. GraphQL v2 + REST v1 APIs. OAuth 2.0 for client apps. Manual upload + API. Source: `api-docs.nexusmods.com`, `graphql.nexusmods.com`. `[VERIFY — Nexus Mods policy changes]`.

## When To Use
- Game has a Nexus Mods presence (legacy or new title).
- Targeting modder community with established Vortex (Nexus's manager) users.
- Want Collections (curated mod lists) integration.
- Donation Points program for free mods.

## When NOT To Use
- Game ships exclusively on Steam with no Nexus presence (Workshop is enough).
- Heavy console focus (Mod.io better).

## API Surface

| API | Used for |
|---|---|
| GraphQL V2 (`graphql.nexusmods.com`) | Listing, querying mod info, collections |
| REST V1 (`api-docs.nexusmods.com`) | Legacy + some endpoints still REST-only |
| OAuth 2.0 + PKCE | App auth (public / private clients) |

Engine adapter prefers GraphQL V2 for reads; REST for some writes; OAuth for any user-action endpoint.

## Auth

OAuth 2.0:
- **Public clients** (the engine itself, Vortex-like apps): PKCE flow.
- **Private clients** (server-side automation): client secret.

Setup:
1. Email Nexus Mods support to register OAuth client. (`[VERIFY]` — no public registration UI in 2026.)
2. Receive `client_id` (and `client_secret` if private).
3. Store at `~/.nexus/auth/nexus_mods.toml`.

```toml
[oauth]
client_id = "..."
client_secret = "..."           # only for private clients
access_token = "..."
refresh_token = "..."
```

Token refresh handled by adapter; refresh on expiry, re-prompt on revoke.

## Engine Integration

`mod.toml`:

```toml
[marketplace.nexus_mods]
game_domain = "skyrimspecialedition"   # game URL slug
category_id = 41                       # per-game category id
nsfw = false
preview = "branding/preview.jpg"
```

## Upload

Nexus Mods upload is partially manual (web form for new mod records). Engine supports:
- **First upload**: opens browser to the `Add a new mod` page with manifest pre-filled into the URL query (best-effort UX).
- **Subsequent updates**: REST API endpoint for file update on an existing mod page.

```
nexus mod publish --to nexus-mods --game-domain skyrimspecialedition
```

Flow:
1. Verifies `.nxmod`.
2. Checks for existing mod id mapping in `~/.nexus/publish/nexus-mods-<domain>.json`.
3. If first publish: opens browser to upload page with metadata pre-filled.
4. Otherwise: PUTs new file version via REST.
5. Records returned `mod_id` + `file_id`.

## Player Install

Player flow via Vortex or direct:
- Vortex: handles Nexus Mods download via deep links; engine reads Vortex's staging dir if installed.
- Direct: `nexus mod install nexus-mods:skyrimspecialedition:12345` → downloads via OAuth user token, installs.

For non-premium Nexus Mods accounts: download throttling applies; engine respects rate.

## Collections

Nexus Mods Collections = curated mod lists (analogous to a Wabbajack list). Engine supports installing a Collection:

```
nexus mod install nexus-mods-collection:skyrimspecialedition:slug-abcd
```

Resolves the collection's mod list, runs the engine resolver, installs in order. Useful for total-conversion-style packs.

`[VERIFY]` — Collections fee structure / premium gating.

## Donation Points

Nexus Mods runs a Donation Points (DP) program: free mod authors earn cash from a monthly pool sized by Nexus Mods. Engine surfaces a "Donate via DP" badge in the mod card; players opt in.

`[VERIFY]` — DP eligibility rules.

## Moderation

Nexus Mods moderators + per-game admins. Author tools include hidden status, takedown requests.

NSFW: account-level adult-content toggle on Nexus Mods filters visibility. Engine's `[mod].nsfw` maps directly.

## CLI Reference

```
nexus mod publish --to nexus-mods --game-domain skyrimspecialedition
nexus mod search nexus-mods --game-domain skyrimspecialedition --category 41
nexus mod fetch nexus-mods:skyrimspecialedition:12345 --file 67890 --out path/
nexus mod auth nexus-mods --oauth                       # PKCE flow
nexus mod collection install nexus-mods:skyrimspecialedition:slug
```

## CI Recipe

For updates (not first publish, which is manual):

```yaml
on: { push: { tags: ['mod-v*'] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: nexus mod pack
      - env:
          NEXUS_MODS_OAUTH: ${{ secrets.NEXUS_MODS_OAUTH }}
        run: nexus mod publish --to nexus-mods --game-domain skyrimspecialedition --update
```

## Pitfalls

- OAuth client registration is manual via email; build into your release setup early.
- Download throttling for non-premium accounts; engine respects and shows progress.
- Premium content / Collections may not be re-shareable; check per-mod license.
- First upload requires web form; budget the time.
- GraphQL V2 still expanding; some endpoints may need REST V1 fallback. `[VERIFY]`.

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_NEXUS_AUTH` | OAuth invalid/expired |
| `MOD_E_NEXUS_THROTTLED` | Download rate limited (non-premium) |
| `MOD_E_NEXUS_GAME_DOMAIN` | Invalid game domain |
| `MOD_E_NEXUS_UPLOAD` | Upload failed; check log |
| `MOD_E_NEXUS_FIRST_UPLOAD_MANUAL` | First upload requires browser flow |

## Integration Points

- `docs/specs/mods/manifest.md` `[marketplace.nexus_mods]`.
- `docs/guides/mods/marketplaces/decision-matrix.md`.
- `docs/specs/mods/dependencies.md` — Collections feed pinned versions.

## Open Questions

- `[VERIFY]` Public OAuth registration UI when it lands.
- `[VERIFY]` Collections fee structure and whether engine should embed.
- `[DECISION NEEDED]` Whether engine ships a Vortex-style local manager or stays CLI-only and integrates with Vortex.

## Sources

- `api-docs.nexusmods.com` — REST V1.
- `graphql.nexusmods.com` — GraphQL V2 (some auth needed).
- `modding.wiki/en/api/oauth2-guide` — OAuth 2.0 + PKCE walkthrough.
- `github.com/Nexus-Mods/node-nexus-api` — Node client reference.
- `forums.nexusmods.com/topic/13522339-graphql-examples/` — community GraphQL examples.
