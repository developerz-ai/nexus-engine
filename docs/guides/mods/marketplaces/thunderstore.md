<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — Thunderstore

> Community-driven, open API, ZIP packages with `manifest.json`. Excellent for non-Steam games and PC-first communities (Risk of Rain 2, Lethal Company, Northstar, R.E.P.O.). Source: `thunderstore.io/package/create/docs/`. GH Action: `github.com/marketplace/actions/upload-thunderstore-package`. `[VERIFY — Thunderstore policy changes]`.

## When To Use
- PC-first game.
- Want a community-of-record with active mod culture.
- Want a simple, scriptable API that's well-loved by modders.
- Want a launcher (e.g., r2modman) that already understands the format.

## When NOT To Use
- Console-targeted (Thunderstore is PC).
- Need built-in subscription-sync at Steam scale (Workshop better here).

## Format Mapping

Thunderstore packages = ZIP with `manifest.json`. Engine's `.nxmod` superset; adapter generates a Thunderstore-compatible wrapper:

```
package.zip
├── manifest.json                       ← Thunderstore-required
├── README.md
├── icon.png                            ← 256x256, required
└── plugins/
    └── mymod-1.0.0.nxmod              ← engine pkg sits here
```

`manifest.json` generated from `mod.toml`:

```json
{
  "name": "HealingPack",
  "version_number": "1.0.0",
  "website_url": "https://github.com/example/healing-pack",
  "description": "Adds craftable healing packs.",
  "dependencies": [
    "ModLib-NexusModLib-1.2.4"
  ]
}
```

Notes:
- `name`: must match `^[A-Za-z0-9_]{1,128}$` (Thunderstore convention).
- `description`: 250 char max.
- `dependencies`: `Author-Name-Version` triplets. Engine maps `[deps]` entries to Thunderstore IDs via `[marketplace.thunderstore.dep_map]` in `mod.toml`.
- `icon.png`: exactly 256x256.

## Engine Integration

`mod.toml`:

```toml
[marketplace.thunderstore]
community = "lethal-company"            # or "risk-of-rain-2", etc.
author = "sebi"                         # Thunderstore author name
team_id = "<uuid>"                      # optional team upload
categories = ["weapons"]
nsfw = false

[marketplace.thunderstore.dep_map]
"com.nexus.mod-lib" = "NexusEngine-ModLib"   # engine id → Thunderstore id
```

## Auth

Thunderstore uses an API token per account. `~/.nexus/auth/thunderstore.toml`:

```toml
[token]
api_token = "tss_..."
```

Get from `thunderstore.io/settings/api-tokens`.

## Upload Recipe

```
nexus mod publish --to thunderstore --community lethal-company
```

Engine:
1. Verifies `.nxmod`.
2. Generates Thunderstore wrapper ZIP with `manifest.json` + icon + README.
3. Calls Thunderstore API (V1 experimental endpoint at the time of writing; `[VERIFY]`):
   - `POST https://thunderstore.io/api/experimental/package/upload/` with multipart form (file + author + community + categories).
4. Returns package URL.

CI option via official GH Action:

```yaml
- uses: GreenTF/upload-thunderstore-package@v4
  with:
    namespace: sebi
    name: HealingPack
    version: 1.0.0
    file: target/package.zip
    community: lethal-company
    token: ${{ secrets.THUNDERSTORE_TOKEN }}
```

Engine's `nexus mod publish` wraps the same call from CLI for parity.

## Dependencies & Resolution

Thunderstore's dependency model is simple flat list. Engine's `[deps]` (semver) is richer. Adapter:
- Resolves engine deps via `dependencies.md`.
- Pins exact versions in the Thunderstore manifest.
- If a transitive engine dep doesn't exist on Thunderstore, publish fails with `MOD_E_TS_DEP_NOT_ON_TS`; author must either publish the dep or remap.

## Communities

Thunderstore is per-game (called "community"). Each community has its own catalog. Engine adapter requires `community` slug per publish; defaults from `[marketplace.thunderstore].community` if unset.

## Versioning

Per package. Thunderstore disallows re-uploading the same version. Engine refuses re-publish at the same version with `MOD_E_TS_VERSION_EXISTS`.

## Moderation

Per-community moderators + Thunderstore-wide TOS. Engine surfaces removal events per `docs/specs/mods/nsfw-and-moderation.md`.

NSFW handling: Thunderstore flags packages and partitions visibility per its rules. `[VERIFY]` exact policy.

## Player Install

Most Thunderstore communities have a launcher (r2modman / Thunderstore Mod Manager). Engine also supports direct install via `nexus mod install thunderstore:lethal-company:Author-Name-Version`.

## CLI Reference

```
nexus mod publish --to thunderstore --community lethal-company
nexus mod search thunderstore --community lethal-company --tag weapons
nexus mod fetch thunderstore:lethal-company:Author-Name-Version --out path/
nexus mod auth thunderstore --token tss_...
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
          THUNDERSTORE_TOKEN: ${{ secrets.THUNDERSTORE_TOKEN }}
        run: nexus mod publish --to thunderstore --community lethal-company
```

## Pitfalls

- Cannot re-publish same version; bump every time.
- `manifest.json::name` must avoid hyphens (use underscores or CamelCase).
- Icon size is exact; engine validates before upload.
- Per-community categories vary; pull list from the community's API to validate.
- `description` 250-char cap; engine truncates with warn.

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_TS_AUTH` | Token invalid |
| `MOD_E_TS_VERSION_EXISTS` | Version already uploaded |
| `MOD_E_TS_DEP_NOT_ON_TS` | Engine dep not present on Thunderstore |
| `MOD_E_TS_ICON_SIZE` | Icon not exactly 256x256 |
| `MOD_E_TS_NAME_FORMAT` | Name doesn't match Thunderstore regex |
| `MOD_E_TS_RATE_LIMITED` | 429; back off |

## Integration Points

- `docs/specs/mods/manifest.md` `[marketplace.thunderstore]`.
- `docs/specs/mods/dependencies.md` — resolved versions pinned to TS manifest.
- `docs/guides/mods/marketplaces/decision-matrix.md`.

## Open Questions

- `[VERIFY]` Whether the experimental upload endpoint stabilizes; switch to stable when announced.
- `[VERIFY]` Whether icon size requirement is enforced for all communities or per-community.
- `[DECISION NEEDED]` Whether engine writes dep map automatically by scraping Thunderstore catalog at publish time.

## Sources

- `thunderstore.io/package/create/docs/` — package format.
- `thunderstore.io/c/lethal-company/create/docs/` — community-specific.
- `github.com/marketplace/actions/upload-thunderstore-package` — official GH Action.
- `thunderstore.io/api/experimental/` — current API root.
