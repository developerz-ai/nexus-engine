<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Players — Sharing Saves (With Required Mods)

> Save files declare the mods they need. Sharing a save bundles a lockfile. One-click "install all required" UX. Friends play your file with the right mods, automatically.

## What Gets Bundled

When you export a save:

```
my-game-save.nxsave        ← deterministic ZIP
├── save.bin               ← serialized world state
├── header.toml            ← metadata + lockfile snapshot
├── mods.lock              ← deterministic resolved set
└── profile.toml           ← (optional) profile settings + configs
```

The save itself does NOT bundle the mods. It bundles their identities (id, version, hash) and where to fetch them.

## Export

```
nexus save export my-game --out share/my-game.nxsave
```

Or `Main menu → Saves → <save> → Export`. Drag-drop result anywhere.

## Import

```
nexus save import share/my-game.nxsave
```

Engine:
1. Reads `mods.lock`.
2. Compares to your installed set.
3. Lists missing mods.
4. Offers "Install all required" — one click → resolver runs → downloads from each mod's recorded source.
5. Imports the save into your game's save folder.
6. Optionally imports profile.

UI:

```
+----------------------------------------------------------+
| Import Save — my-game.nxsave                             |
|                                                          |
| This save needs 4 mods you don't have:                  |
|                                                          |
|   • Healing Pack 1.0.1            (mod.io)              |
|   • Survival Overhaul 2.0.0       (self-hosted)         |
|   • UI Theme Blue 0.5.2           (Thunderstore)        |
|   • Modding Library 1.2.4         (Steam Workshop)      |
|                                                          |
| Total download: 42.3 MB                                  |
|                                                          |
| Caps these mods will request (you'll see the dialog):   |
|   Read/write: Health, Inventory, Stats, UI              |
|   Send: healing.applied, save.modified                  |
|   No internet access.                                    |
|                                                          |
|  [ Install all + Import ]  [ Customize ]  [ Cancel ]    |
+----------------------------------------------------------+
```

## Modpack Bundle (offline)

For full self-contained sharing (no internet, no marketplace accounts):

```
nexus save export-bundle my-game --out share/my-game.nxbundle
```

`.nxbundle` contains:
- The save file.
- All required `.nxmod` files.
- A manifest listing them.

```
my-game.nxbundle           ← can be large; contains everything
├── save/
│   └── my-game.nxsave
├── mods/
│   ├── com.example.healing-pack/1.0.1.nxmod
│   ├── com.example.survival/2.0.0.nxmod
│   ├── com.example.ui-theme-blue/0.5.2.nxmod
│   └── com.nexus.mod-lib/1.2.4.nxmod
└── BUNDLE.toml
```

Recipient:

```
nexus save import-bundle share/my-game.nxbundle
```

Engine installs all `.nxmod` files locally (with the usual consent dialogs) and imports the save. No internet needed.

Useful for:
- LAN parties.
- Air-gapped machines.
- Time-capsule saves (mods may not be on marketplaces years later).

## Signed Bundles

```
nexus save export-bundle my-game --sign --key keys/signing.key --out share/my-game.nxbundle
```

The bundle is Ed25519-signed; recipients can verify provenance.

## Bundle Size

Bundles can be large (TC + mods can run gigabytes). Engine compresses with zstd by default. `--compression none|fast|max` available.

## Mod Sources in Lockfile

Each mod entry in `mods.lock` records `source` (marketplace + ids). On import, engine respects the recorded source. If you import from a friend whose source you don't have configured:

- Engine prompts: "Add 'mods.exampleserver.com/' as a self-hosted source? [Yes/No/Always trust this source]"
- TOFU per source (→ `docs/guides/mods/marketplaces/self-hosted.md`).
- Pinned sources persist across imports.

## Save Compatibility

The save's mod versions are exact (lockfile-precise). If you have a newer compatible version installed:
- PATCH bump auto-OK.
- MINOR bump: engine asks to upgrade in place.
- MAJOR bump: refuse-by-default; player picks (install older version OR migrate).

→ `docs/specs/mods/save-compatibility.md`.

## Multiplayer Saves

Multiplayer saves live on the server. Sharing them:
- Server admin export → `nexus server save export ...`.
- Recipient must be running a compatible server (same mod-set whitelist).
- Players' mod sets must match (handshake gate at join time).

## Privacy

`.nxsave` includes game state. It does NOT include:
- Your account credentials.
- Your purchase history.
- Multiplayer chat logs (unless your game stores those in the save, separately).

Profile bundles include configs you set; review the export with `nexus save inspect` before sharing if unsure.

## Pitfalls

- Sharing a save with mods that aren't published anywhere (you authored them locally): use `.nxbundle` instead of `.nxsave`.
- Sharing a save that depends on a delisted mod: recipient gets `MOD_E_DEP_MISSING` unless the mod is in their local cache; bundle if uncertain.
- Sharing with NSFW mods to someone whose profile hides them: recipient sees the mods skipped at load with a banner.

## Pro Tip — "Time Capsule"

For games you love, periodically bundle:

```
nexus save export-bundle my-favorite-run --out time-capsule/year-2026/run.nxbundle
```

Years later when marketplaces have shifted: the bundle still loads. Mods inside, save inside, signed. Open it, play.

## Cross-Links

- → `install.md`
- → `profiles.md` — sharing profiles separately.
- → `docs/specs/mods/save-compatibility.md`
- → `docs/specs/mods/dependencies.md` — lockfile format.
- → `docs/specs/mods/package-format.md` — `.nxmod` format.
- → `docs/guides/mods/marketplaces/self-hosted.md` — TOFU source addition.
