<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Players — Installing Mods

> In-game browser. Search, install, update, uninstall. Federated across configured marketplaces. Offline `.nxmod` install from disk. Subscription sync from Steam Workshop / Mod.io.

## In-Game Browser

`Main menu → Mods → Browse`.

Sources shown in the configured order (game ships defaults). Each source displays its own results; engine deduplicates by `mod_id` and shows the highest-priority source on conflict.

Card:
```
+----------------------------------------------------------+
| [icon]  Healing Pack                                     |
|         by sebi · v1.0.1 · MIT · 1,247 installs          |
|                                                          |
| Adds craftable healing packs and a heal-over-time aura. |
|                                                          |
| Tier: Behavior   Caps: Health, Inventory, sound effects  |
| Source: Mod.io     Updated: 3 days ago                   |
| [Install]  [Details]  [Author]                           |
+----------------------------------------------------------+
```

## Search & Filter

| Filter | Examples |
|---|---|
| Text | "healing", "weapon", "ui" |
| Tier | Skin / Behavior / Total Conversion |
| Tags | author-supplied |
| Caps | "no internet", "no save modification" |
| Source | per-marketplace |
| NSFW | hide / mature / explicit |
| Accessibility | accessibility-flagged only |
| Verified | signed mods only |

Saved filters as profiles ("safe-for-streaming" = NSFW=hide + accessibility-on + verified-only).

## Install

Click `Install`:
1. Engine downloads `.nxmod` from the source.
2. Verifies hash + signature.
3. Resolves deps; auto-prompts if a new dep is needed.
4. Shows the consent dialog (→ `permissions-ui.md`).
5. Approve → mod installed (not yet enabled).
6. Auto-enable toggle (default on).
7. Lockfile updated.

Cancel at any step. Partial state never persisted.

## Subscription Sync

If your game's source is Steam Workshop or Mod.io with user OAuth:
- The engine syncs your subscribed list on launch.
- New subscriptions install automatically.
- Unsubscribed mods disable (preserved, not uninstalled by default; → `lifecycle.md`).
- Updates pulled when available.

CLI equivalent:
```
nexus mod sync
```

## Offline Install

```
nexus mod install path/to/mymod-1.0.0.nxmod
```

Or drag-drop the `.nxmod` onto the in-game mod manager / launcher.

Engine verifies signature; warns if unsigned. → `safety.md`.

## Updates

Browser badge shows update count. Click → choose:
- Update one
- Update all
- Update except saves-active mods (avoids mid-game save corruption)

`nexus mod update --all` from CLI.

PATCH bump: hot-swap, no restart. MINOR: warm reload (one-tick pause). MAJOR: requires save migration prompt. → `docs/specs/mods/save-compatibility.md`.

## Uninstall

`Mods → Installed → <mod> → Uninstall`.

Engine warns if:
- A save references the mod and the save policy is `refuse`.
- Other installed mods depend on this one (lists them).

Confirmation removes the `.nxmod`, side-effect-cleans the world, drops registry entry. → `docs/specs/mods/lifecycle.md`.

## Multiple Versions

Engine can keep multiple versions installed (different saves may pin different versions). View per mod:

```
Mods → Healing Pack → Versions
  • 1.0.0 (pinned by save: "Hardcore Run 2")
  • 1.0.1 (currently active)
```

`nexus mod gc` removes versions no save pins.

## Bandwidth Awareness

Browser shows download size before install. Setting: `cap downloads to N MB/s`. Useful on metered connections.

## Console / Mobile UX

Same browser, console-friendly nav. Mod.io is the practical source on consoles (other marketplaces gated by platform policy). → `docs/guides/mods/marketplaces/decision-matrix.md`.

## Anonymous vs Signed-In

- Anonymous: install, uninstall, update from public sources work.
- Signed in to marketplace: subscription sync, ratings, comments, private mods available.

Engine never forces a marketplace account.

## Browser Performance

| Metric | Target | Hard limit |
|---|---|---|
| First card visible | < 500 ms | 2 s |
| Search-as-you-type | < 100 ms incremental | 500 ms |
| Install initiation | < 100 ms after click | 500 ms |

`[BENCHMARK NEEDED]`.

## Pitfalls

- Installing a mod from an unknown source: engine prompts TOFU on first marketplace add.
- Disabling a mod while a save uses it: save next-load policy applies (warn by default).
- Subscription sync requires marketplace OAuth; without it, browse-only.
- Mods that requested caps you denied work but with reduced functionality; banner shows once.

## Cross-Links

- → `permissions-ui.md` — consent flow.
- → `safety.md` — what the engine does to keep you safe.
- → `profiles.md` — mod profiles per save / per character.
- → `conflicts.md` — when two mods overlap.
- → `sharing-saves.md` — bundled mods on save share.
- → `docs/specs/mods/lifecycle.md`
