<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — Mod.io

> Cross-platform, console-friendly. REST API + Rust SDK (`docs.rs/modio`). Game-agnostic mod hosting that works on PC, Mac, Linux, mobile, and consoles via SDK Access. The default for cross-platform games and console mod support. Source: `docs.mod.io/restapi`. `[VERIFY — mod.io policy changes]`.

## When To Use
- Game ships cross-platform.
- Want consoles to support mods (Mod.io is the practical answer).
- Want a REST API to integrate beyond Steam.
- Don't want to be Steam-locked.

## When NOT To Use
- Steam-only game with no cross-platform plans (Workshop is fine).
- Need a community-of-record like Thunderstore or Nexus Mods has built up.

## Engine Integration

`mod.toml`:

```toml
[marketplace.mod_io]
game_id = 4321
visibility = "public"               # public | hidden
tags = ["weapons", "balance"]
preview = "branding/preview.jpg"
description_html = "..."
maturity_option = "none"            # none | alcohol | drugs | violence | explicit
metadata_blob = "{ \"slot\": \"weapon\" }"
```

## Auth

mod.io uses an API key + OAuth-style flow. Two modes:
- **API key** (read + per-game admin): server-side automation, CI publishing.
- **OAuth user token**: in-game publish-from-editor, player-side subscribe/install.

Setup:
1. Register your game on `mod.io`.
2. Get the API key from your game's admin dashboard.
3. For OAuth: send the user through the mod.io email-link or service-account flow.

Engine config:
```
~/.nexus/auth/mod_io.toml
[token]
api_key = "..."
oauth = "..."             # optional
```

## REST API

Base URL: `https://api.mod.io/v1` (per `docs.mod.io/restapi`).

Engine's adapter wraps the calls below. All responses are JSON.

| Endpoint | Used for |
|---|---|
| `POST /games/{id}/mods` | Create mod entry |
| `PUT /games/{id}/mods/{mod_id}` | Update metadata |
| `POST /games/{id}/mods/{mod_id}/files` | Upload `.nxmod` |
| `GET /games/{id}/mods` | List + search |
| `GET /games/{id}/mods/{mod_id}` | Read full record |
| `POST /games/{id}/mods/{mod_id}/subscribe` | Player subscribe |
| `POST /games/{id}/mods/{mod_id}/files/{file_id}` | Set live file (versioning) |

The engine adapter uses the Rust `modio` crate (`docs.rs/modio`) where possible; falls back to direct `reqwest` for endpoints not covered.

## Upload Recipe

```
nexus mod publish --to mod-io --game-id 4321
```

Engine:
1. Verifies `.nxmod`.
2. If first publish: `POST /games/{id}/mods` with manifest metadata; receives `mod_id`.
3. `POST /games/{id}/mods/{mod_id}/files` with the `.nxmod` blob.
4. `PUT /games/{id}/mods/{mod_id}/files/{file_id}` to set live.
5. Stores mapping in `~/.nexus/publish/mod-io-<game_id>.json`.
6. Logs returned `mod.io` URL for sharing.

## Subscription & Install

Player flow:
1. In-game browser shows mod.io mods (engine-side fetched via API).
2. Subscribe → `POST /games/{id}/mods/{mod_id}/subscribe` with user token.
3. Engine downloads `.nxmod`, verifies, installs.
4. On next launch, engine asks mod.io for subscribed list, syncs.

Without user OAuth: player can install via direct URL with a one-click confirmation; not added to their subscription list.

## Console SDK Access

Console builds (PlayStation, Xbox, Switch) require mod.io's per-platform SDKs:
- Console-friendly UI surface bundled in their SDK.
- Cert-friendly: mod.io has been through console certification.

Reference: `docs.mod.io/platforms/console-sdks`. `[VERIFY — current console SDK availability]`.

Engine integration: link the Mod.io console SDK in the platform-specific build; engine adapter falls through to native calls.

## Versioning

Per file id. Author uploads new file, sets live → players auto-update (if subscribed). Engine respects file id changes via the subscription sync loop.

## Maturity / NSFW

`maturity_option` field maps to engine's `[mod].nsfw` per:

| Engine | mod.io |
|---|---|
| `false` | `none` |
| `true` (mature) | `violence` (or relevant tag) |
| `"mature"` | `violence` |
| `"explicit"` | `explicit` |

mod.io enforces age verification per its policies. Engine respects the marketplace's "verified" flag. → `docs/specs/mods/nsfw-and-moderation.md`.

## Moderation

mod.io moderators + game admin tools.
- Game admins can remove mods from their game's catalog.
- Engine subscribes to mod.io's removal feed; honors per `docs/specs/mods/nsfw-and-moderation.md` § Takedown.

## Rate Limits

`[VERIFY]` — current limits per `docs.mod.io`. Engine adapter respects `429 Too Many Requests` headers and backs off; never burst-publishes.

## Test Sandbox

mod.io provides a test sandbox (per docs). Engine supports `--env test`:

```
nexus mod publish --to mod-io --env test --game-id 4321
```

Hits the sandbox endpoint; useful for CI integration tests without polluting production.

## CLI Reference

```
nexus mod publish --to mod-io [--env test]
nexus mod publish --to mod-io --update                   # explicit update
nexus mod search mod-io --game-id 4321 --tag weapons
nexus mod fetch mod-io:4321:12 --out path/
nexus mod auth mod-io --api-key XXX
nexus mod auth mod-io --oauth                            # opens email-link flow
```

## CI Recipe

```yaml
on: { push: { tags: ['mod-v*'] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: nexus mod pack
      - run: nexus mod verify target/*.nxmod
      - env:
          MOD_IO_API_KEY: ${{ secrets.MOD_IO_API_KEY }}
        run: nexus mod publish --to mod-io --game-id 4321
```

## Pitfalls

- API key vs OAuth confusion: API key cannot subscribe on behalf of a user.
- Console SDK adds binary size and per-platform cert review; budget for it.
- Test sandbox data is separate; remember to flip env on real publish.
- HTML description: sanitize to avoid layout breakage.

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_MOD_IO_AUTH` | API key invalid or OAuth expired |
| `MOD_E_MOD_IO_RATE_LIMITED` | 429; back off |
| `MOD_E_MOD_IO_UPLOAD` | Generic upload failure; check log |
| `MOD_E_MOD_IO_NOT_FOUND` | Mod id not in game catalog |
| `MOD_E_MOD_IO_MATURITY_REJECTED` | Maturity option flagged for review |

## Integration Points

- `docs/specs/mods/manifest.md` `[marketplace.mod_io]`.
- `docs/specs/mods/multiplayer-sync.md` — fetch sources point to mod.io for installed mods.
- `docs/guides/release/playstation.md`, `docs/guides/release/switch.md` — console SDKs.
- `docs/guides/mods/marketplaces/decision-matrix.md`.

## Open Questions

- `[VERIFY]` Current rate limits and tier pricing if any.
- `[VERIFY]` Console SDK availability matrix in 2026.
- `[DECISION NEEDED]` Whether engine ships the Rust `modio` crate as a hard dep or HTTP-only.
- `[DECISION NEEDED]` Default sandbox env for CI smoke tests.

## Sources

- `docs.mod.io/restapi` — REST API root.
- `docs.mod.io/restapi/introduction` — basics.
- `docs.mod.io/restapi/docs/restapi-getting-started/` — getting started.
- `docs.mod.io/platforms/console-sdks` — console SDKs.
- `docs.rs/modio` — Rust SDK.
