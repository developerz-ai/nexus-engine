<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — Steam Workshop

> Default channel for Steam games. Free hosting. Built-in subscription sync. Players install with one click. Paid mods are mostly discontinued (2015 debacle). Source-of-truth: `partner.steamgames.com/doc/features/workshop/implementation` and `partner.steamgames.com/doc/api/ISteamUGC`. `[VERIFY — Steamworks policy changes]`.

## When To Use
- Game ships on Steam.
- Most of player base on Steam.
- Want subscription sync for free.

## When NOT To Use
- Game not on Steam.
- Need cross-platform (Steam Workshop is Steam-only).
- Need paid mods at scale (use Mod.io or self-hosted).

## Engine Integration

`mod.toml`:

```toml
[marketplace.steam]
app_id = 1234567
workshop_visibility = "public"            # public | unlisted | friends | private
tags = ["weapons", "balance"]
preview = "branding/preview.jpg"
description = "Adds craftable healing packs and a heal-over-time aura."
change_note = "1.0.1: rebalanced cooldown."
```

The engine maps these onto `ISteamUGC::SetItem*` calls during `nexus mod publish --to steam`.

## Auth

Steam Workshop uses Steam account auth via `steamcmd` or the Steamworks SDK. Engine supports both paths:

- **steamcmd path** (CI, headless): `nexus mod publish --to steam --auth steamcmd:<user>` — requires steamcmd installed; engine wraps `workshop_build_item` with a generated descriptor file.
- **SDK path** (interactive): requires Steamworks SDK linked into the game; uses player's authenticated session.

Setup: `partner.steamgames.com/doc/sdk/steamworks_sdk_overview`. `[VERIFY]`.

## Upload Recipe

```
nexus mod publish --to steam --auth steamcmd:USERNAME
```

Engine:
1. Verifies `.nxmod`.
2. Generates descriptor:
   ```vdf
   "workshopitem"
   {
     "appid" "1234567"
     "publishedfileid" "0"                  // 0 = new item
     "contentfolder" "/abs/path/to/staging"
     "previewfile" "/abs/path/to/preview.jpg"
     "visibility" "0"
     "title" "Healing Pack"
     "description" "..."
     "changenote" "..."
     "tags" "weapons,balance"
   }
   ```
3. Runs `steamcmd +login USERNAME +workshop_build_item descriptor.vdf +quit`.
4. Parses `published_file_id` from output.
5. Records mapping in `~/.nexus/publish/steam-<app_id>.json` for future updates.

Subsequent publishes update in place by reading the file id from the local map.

## Subscription Sync

Players subscribe via Steam Workshop UI. Steam downloads to `<SteamLibrary>/workshop/content/<app_id>/<file_id>/`. Engine:
1. Watches that directory.
2. Discovers `.nxmod` (or unpacked equivalent: Steam Workshop sometimes stores extracted).
3. Verifies hash + sig.
4. Adds to local registry as `installed`.
5. Honors subscription removal as "uninstall offered to player."

Engine's federated browser shows Workshop items inline.

## Version Control

Per Steam announcement (Jan 2026 `[VERIFY]`), Workshop supports versioning of items. Engine stores `published_file_id` per `mod_id`; each publish bumps the Steam-side version. Players opt into `subscribe-to-latest` or `pin-version` per Steam UI.

## Visibility

`public` / `unlisted` / `friends` / `private` map to Steam's enum directly. Engine doesn't try to abstract this — the dialog uses Steam terminology.

## Limits

`[VERIFY — Steam Workshop limits]`:
- File size limit ≈ 200 MB to 8 GB depending on game configuration (set in Steamworks partner site per app).
- Preview image: PNG/JPG up to 1 MB.
- Description: Steam-flavored BBCode supported.

Engine refuses publish if `.nxmod` exceeds the per-app limit with `MOD_E_STEAM_SIZE_OVER`.

## Paid Mods

Steam discontinued the paid-mods Workshop experiment in 2015 after community backlash. Currently:
- Some games (Skyrim Creation Club) host paid mods, but that's first-party curated, not open Workshop.
- Engine does NOT enable paid-mod flow on Steam Workshop by default.
- Recommendation: monetize via Mod.io or self-hosted with `[paid]` tier per `docs/guides/mods/economy/paid-mods.md`.

`[VERIFY]` if Valve revises this; the lessons of 2015 inform the engine's default-free stance.

## Moderation

Steam-side TOS applies. NSFW respects Steam's content filter (`docs/specs/mods/nsfw-and-moderation.md`). Reports to Steam, not to engine.

## Anti-Cheat Compat

Workshop items can be cosmetic-only (always trusted) or behavior (server whitelist). Engine extracts the manifest's `[multiplayer].role` and surfaces it in the Workshop description automatically.

## CLI Reference

```
nexus mod publish --to steam --auth steamcmd:USER
nexus mod publish --to steam --update                    # explicit update; new version
nexus mod inspect --remote steam:1234567:9876543210      # remote workshop item
nexus mod fetch steam:1234567:9876543210 --out path/
nexus mod auth steam --steamguard CODE                   # 2FA helper
```

## Per-Mod CI Recipe

```yaml
# .github/workflows/publish-mod.yml
on: { push: { tags: ['mod-v*'] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: nexus mod pack
      - run: nexus mod verify target/*.nxmod
      - uses: CyberAndrii/setup-steamcmd@v1
      - env:
          STEAM_USER:     ${{ secrets.STEAM_USER }}
          STEAM_PASSWORD: ${{ secrets.STEAM_PASSWORD }}
          STEAM_TOTP:     ${{ secrets.STEAM_TOTP }}
        run: nexus mod publish --to steam --auth steamcmd:$STEAM_USER
```

Secrets stored in repo or org GitHub secrets. Steam Guard handled via TOTP secret (steamcmd-compatible).

## Pitfalls

- 2015 paid-mods disaster: keep mods free on Workshop. Surface this in publishing docs.
- Subscription sync is asynchronous; engine UI should reflect "downloading" state per Steam.
- Workshop files extracted on Steam side: engine handles both packed (.nxmod present) and extracted (loose dir) layouts.
- `steamcmd` flaky in CI: retry with backoff.

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_STEAM_AUTH` | steamcmd auth failed |
| `MOD_E_STEAM_2FA` | 2FA required |
| `MOD_E_STEAM_SIZE_OVER` | File exceeds per-app workshop limit |
| `MOD_E_STEAM_VISIBILITY` | Invalid visibility enum |
| `MOD_E_STEAM_UPLOAD` | Generic upload failure; check log |

## Integration Points

- `docs/specs/mods/manifest.md` `[marketplace.steam]`.
- `docs/guides/release/steam.md` — engine release pipeline.
- `docs/guides/mods/authoring/publishing.md`.
- `docs/guides/mods/marketplaces/decision-matrix.md` — comparison.

## Open Questions

- `[VERIFY]` Whether Workshop versioning APIs are GA in 2026 for all partner games.
- `[VERIFY]` Per-app size caps.
- `[VERIFY]` Whether Workshop accepts `.nxmod` natively or expects extracted layout.
- `[DECISION NEEDED]` Should engine ship a polished `steamcmd` wrapper or rely on partner-installed binary.

## Sources

- `partner.steamgames.com/doc/features/workshop/implementation`
- `partner.steamgames.com/doc/api/ISteamUGC`
- Steam Workshop Implementation Guide
- Steam Community guide: "Uploading workshop items via SteamCMD"
