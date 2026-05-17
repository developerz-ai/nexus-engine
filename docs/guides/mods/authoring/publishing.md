<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Publishing

> `nexus mod publish --to <store>`. One command per marketplace. Parallel multi-publish. Per-marketplace recipes below; canonical details in `docs/guides/mods/marketplaces/<store>.md`.

## One-Liner

```
nexus mod publish --to steam --to mod-io --to thunderstore --to self-hosted
```

Engine fans out, uploads in parallel, returns aggregated receipt JSON.

## Per-Store Recipes

### Steam Workshop

```
nexus mod publish --to steam --auth steamcmd:USERNAME
```

→ `docs/guides/mods/marketplaces/steam-workshop.md`. Requires Steamworks app id in `mod.toml::[marketplace.steam]`.

### Mod.io

```
nexus mod publish --to mod-io --game-id 4321
# OR test sandbox:
nexus mod publish --to mod-io --env test --game-id 4321
```

→ `docs/guides/mods/marketplaces/mod-io.md`.

### Thunderstore

```
nexus mod publish --to thunderstore --community lethal-company
```

→ `docs/guides/mods/marketplaces/thunderstore.md`.

### Nexus Mods

```
nexus mod publish --to nexus-mods --game-domain skyrimspecialedition
```

First upload may open browser for the new-mod form. Updates pure API. → `docs/guides/mods/marketplaces/nexus-mods.md`.

### CurseForge

```
nexus mod publish --to curseforge --project-id 1234567 --game-slug minecraft
```

→ `docs/guides/mods/marketplaces/curseforge.md`.

### itch.io

```
nexus mod publish --to itch --use-butler
```

→ `docs/guides/mods/marketplaces/itch-io-mods.md`.

### Self-hosted

```
nexus mod publish --to self-hosted --url https://mods.mygame.com/ --key keys/signing.key
```

→ `docs/guides/mods/marketplaces/self-hosted.md`.

## Auth Setup (one-time)

```
nexus mod auth steam --steamguard CODE
nexus mod auth mod-io --api-key XXX
nexus mod auth mod-io --oauth                    # email-link flow
nexus mod auth thunderstore --token tss_...
nexus mod auth nexus-mods --oauth                # PKCE flow
nexus mod auth curseforge --token cf_...
nexus mod auth itch --api-key XXX
```

Tokens stored under `~/.nexus/auth/<marketplace>.toml`, mode 600. CI uses env vars instead (each marketplace doc lists the exact var names).

## Dry Run

```
nexus mod publish --to steam --dry-run
```

Verifies, generates upload payload, prints what would be sent. No network calls.

## Per-Marketplace Metadata

Declare once in `mod.toml`:

```toml
[marketplace.steam]
app_id = 1234567
workshop_visibility = "public"
tags = ["weapons"]

[marketplace.mod_io]
game_id = 4321
visibility = "public"

[marketplace.thunderstore]
community = "lethal-company"
categories = ["weapons"]

[marketplace.nexus_mods]
game_domain = "skyrimspecialedition"
category_id = 41

[marketplace.curseforge]
project_id = 1234567
game_slug = "minecraft"

[marketplace.itch]
project = "sebi/healing-pack"
channel = "nxmod"

[marketplace.self-hosted]
url = "https://mods.mygame.com/"
```

`nexus mod publish` reads the right block per `--to` target.

## Output

```json
{
  "schema": "nexus-publish-report-v1",
  "mod_id": "com.example.healing-pack",
  "version": "1.0.1",
  "mod_hash": "b3:abcd...1234",
  "targets": [
    { "to": "steam",         "ok": true,  "url": "https://steamcommunity.com/sharedfiles/filedetails/?id=9876543210", "duration_ms": 12450 },
    { "to": "mod_io",        "ok": true,  "url": "https://mod.io/g/.../m/...",                                    "duration_ms": 5400 },
    { "to": "thunderstore",  "ok": true,  "url": "https://thunderstore.io/c/.../p/...",                            "duration_ms": 8210 },
    { "to": "self-hosted",   "ok": true,  "url": "https://mods.mygame.com/mods/com.example.healing-pack/1.0.1.nxmod", "duration_ms": 1100 }
  ]
}
```

Persistent receipts at `~/.nexus/publish/<mod-id>-history.json` for audit + rollback.

## Update vs New

Engine auto-detects via stored per-marketplace mappings (`~/.nexus/publish/<marketplace>-*.json`):
- Mapping exists → update path.
- No mapping → new-publish path.

Force either with `--update` or `--new`.

## Versioning Gate

Engine refuses to publish a version that's already live on a target marketplace (causes confusion + violates immutability principle). Bump `mod.toml::[mod].version` per `versioning.md`.

## Multi-Tag CI

Standard pattern: tag `mod-v1.0.1` triggers full publish.

```yaml
on:
  push:
    tags: ['mod-v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: nexusengine/setup-nexus@v1
      - run: nexus mod pack --profile ship
      - run: nexus mod verify target/*.nxmod
      - env:
          STEAM_USER:         ${{ secrets.STEAM_USER }}
          STEAM_PASSWORD:     ${{ secrets.STEAM_PASSWORD }}
          STEAM_TOTP:         ${{ secrets.STEAM_TOTP }}
          MOD_IO_API_KEY:     ${{ secrets.MOD_IO_API_KEY }}
          THUNDERSTORE_TOKEN: ${{ secrets.THUNDERSTORE_TOKEN }}
          NEXUS_SIGNING_KEY:  ${{ secrets.NEXUS_SIGNING_KEY }}
        run: |
          echo "$NEXUS_SIGNING_KEY" > /tmp/signing.key
          nexus mod sign --key /tmp/signing.key target/*.nxmod
          nexus mod publish --to steam --to mod-io --to thunderstore --to self-hosted --json > publish-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: publish-report
          path: publish-report.json
```

## Marketplace-Selection Heuristics

| Game / mod profile | Recommended initial targets |
|---|---|
| Steam-first AAA | `--to steam --to self-hosted` |
| Cross-platform / consoles | `--to mod-io --to self-hosted` |
| PC modding community focus | `--to thunderstore --to self-hosted` |
| Bethesda-style RPG | `--to nexus-mods --to steam --to self-hosted` |
| Minecraft-style | `--to curseforge --to self-hosted` |
| Indie / experimental | `--to itch --to self-hosted` |
| Maximum reach | `--to steam --to mod-io --to thunderstore --to self-hosted` |

Self-hosted in every list because it's free, no lock-in, fastest update cycle.

## Pitfalls

- Publishing without bumping version: refused.
- Thunderstore: cannot re-upload same version (their rule); must bump.
- Steam Workshop: file id mapping lives in `~/.nexus/publish/`; back it up.
- Nexus Mods: first publish may need browser interaction; budget time.
- itch.io: pay-what-you-want flows route through itch.io's purchase UI; never bypass.

## Error Contract

Aggregated from per-marketplace specs. Engine's report includes per-target outcome; one failure doesn't block other targets (unless `--fail-fast`).

| Code | Meaning |
|---|---|
| `PUBLISH_E_NO_AUTH` | Auth not configured for target |
| `PUBLISH_E_VERSION_EXISTS` | Target already has this version |
| `PUBLISH_E_NETWORK` | Transport-level failure |
| `PUBLISH_E_REJECTED` | Marketplace returned a structured rejection |

## Cross-Links

- → `packaging.md` — pack/sign first.
- → `versioning.md` — bump correctly.
- → `docs/guides/mods/marketplaces/decision-matrix.md` — pick channels.
- Per-marketplace docs in `docs/guides/mods/marketplaces/`.
