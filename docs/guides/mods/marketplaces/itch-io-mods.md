<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — itch.io as Mod Host

> Loose convention: mods as itch.io "games" or as project assets. Open API (`itch.io/api`), `butler` CLI for uploads. Best for indie / experimental mods, jam-style releases. `[VERIFY — itch.io policy]`.

## When To Use
- Game ships on itch.io.
- Modder wants the same itch.io presence they already have.
- Free or pay-what-you-want pricing model.
- Quick experimental releases.

## When NOT To Use
- Need launcher integration (use Workshop / Mod.io).
- Need browser-based install at scale (itch.io doesn't auto-subscribe).

## Convention

itch.io has no formal mod system. Engine adopts:
- Mod = an itch.io project tagged `nexus-mod` and `for-<game-slug>`.
- Project page links to the `.nxmod` directly (channel = `nxmod`).
- Players install via `nexus mod install itch:author/project-slug`.

## Engine Integration

`mod.toml`:

```toml
[marketplace.itch]
project = "sebi/healing-pack"           # author/slug
channel = "nxmod"
visibility = "public"
price = "pay-what-you-want"             # free | paid | pay-what-you-want
```

## Auth

itch.io API key (per account):
- Get from `itch.io/user/settings/api-keys`.
- Storage: `~/.nexus/auth/itch.toml`.

```toml
[token]
api_key = "..."
```

Or use `butler` (itch.io's official CLI) with its own auth.

## Upload Recipe

Via `butler`:

```
nexus mod publish --to itch --use-butler
```

Engine wraps:
```
butler push target/mymod-1.0.0.nxmod sebi/healing-pack:nxmod \
  --userversion 1.0.0
```

Via API (no butler):

```
nexus mod publish --to itch
```

Engine POSTs to itch.io API directly. `[VERIFY]` — current upload-via-API endpoint; butler is the recommended path.

## Player Install

Engine adapter polls the project's API for the latest `nxmod` channel build and downloads the `.nxmod`. Players see updates as engine-side notifications.

No subscription model on itch.io; engine maintains its own subscription list locally.

## Monetization

itch.io is famous for flexible pricing:
- Free.
- Pay-what-you-want (PWYW).
- Fixed price.
- Bundles.

Per itch.io's optional revenue share: author chooses how much itch.io takes (0–100%, default 10%). Engine surfaces this in the mod card.

→ `docs/guides/mods/economy/paid-mods.md` for paid-mod flow.

## Moderation

itch.io community guidelines. NSFW handled by itch.io's adult content classification. Engine respects per `docs/specs/mods/nsfw-and-moderation.md`.

## CLI Reference

```
nexus mod publish --to itch --use-butler
nexus mod search itch --tag nexus-mod --tag for-mygame
nexus mod fetch itch:sebi/healing-pack --out path/
nexus mod auth itch --api-key XXX
nexus mod auth itch --butler                            # delegate to butler
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
          BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}
        run: |
          curl -L -o butler.zip https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default
          unzip butler.zip && ./butler push target/*.nxmod sebi/healing-pack:nxmod --userversion ${GITHUB_REF#refs/tags/mod-v}
```

## Pitfalls

- No subscription sync; players don't auto-update unless engine polls.
- Convention-based discovery (tag scraping); fragile if itch.io tag policies change.
- Pay-what-you-want gates: engine should not "play" the payment dialog; route to itch.io browser.

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_ITCH_AUTH` | API key invalid |
| `MOD_E_ITCH_PROJECT_NOT_FOUND` | Slug wrong |
| `MOD_E_ITCH_BUTLER_NOT_FOUND` | --use-butler set but binary missing |
| `MOD_E_ITCH_UPLOAD` | Upload failed |

## Integration Points

- `docs/specs/mods/manifest.md` `[marketplace.itch]`.
- `docs/guides/mods/economy/paid-mods.md`.
- `docs/guides/mods/marketplaces/decision-matrix.md`.

## Open Questions

- `[VERIFY]` Current API upload endpoint vs butler-only.
- `[DECISION NEEDED]` Whether engine ships butler as a vendored binary.
- `[DECISION NEEDED]` Standardize the `nexus-mod` and `for-<slug>` tags as the official convention; suggest itch.io adopt as official metadata.

## Sources

- `itch.io/docs/itch/` — itch user docs.
- `itch.io/docs/api/` — public API.
- `itch.io/docs/butler/` — butler CLI.
- `itch.io/user/settings/api-keys` — API key management.
