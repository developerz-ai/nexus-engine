<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Players — Conflict Resolution

> UX for "Mod A and Mod B both replace dragon.png" and "Mod A writes Health while Mod B also writes Health". One dialog, three options: pick one, auto-merge (when safe), or accept default.

## What Counts As A Conflict

| Kind | Trigger | Default behavior |
|---|---|---|
| Hard conflict | Mod A's `[conflicts]` declares Mod B | Engine refuses to enable both |
| Asset overlay overlap | Two mods overlay same UUID at same priority | Conflict dialog |
| Component-write overlap | Two mods write same `(entity, component)` in same frame | Later-loaded wins; info marker |
| Event-name overlap | Two mods emit/handle same event | Both fire; subscription order by load order |
| Cap-parameter overlap | Two mods request `WorldWrite<Health>` | OK; both granted; ordering determines outcome |

Most "conflicts" are not blocking — engine resolves deterministically. The dialog appears for cases the player should consciously resolve.

## The Dialog

```
+----------------------------------------------------------+
| Conflict: dragon.png                                     |
|                                                          |
| Two mods want to replace this asset:                     |
|                                                          |
|  (•) Healing Pack — uses default dragon                  |
|  ( ) Pixel Skin   — replaces with pixel art             |
|  ( ) Auto-Merge   — combine if possible                  |
|                                                          |
| [ Apply ]   [ Apply To All Like This ]                  |
+----------------------------------------------------------+
```

| Option | Effect |
|---|---|
| Pick one | Selected mod wins; other's overlay deactivated for this UUID |
| Auto-Merge | Engine attempts a `merge`-mode resolution (only for mergeable kinds: glTF, materials, locale) |
| Apply To All Like This | Repeat decision for all overlapping overlays from this pair |

## Bulk Conflict View

`Mods → Conflicts`:

```
Conflicts (3)
─────────────────────────────────────────────────
  Asset overlay overlap:
    01HZ8XQK... (dragon.png)
       Pixel Skin (priority 100)  ← winning
       Healing Pack (priority 0)
       [ Swap ]  [ Disable one ]  [ Merge ]

  Component write overlap:
    Health
       Healing Pack: +25 per heal
       Balance Overhaul: ×0.75 multiplier
       Order: Healing Pack → Balance Overhaul (final value = (hp + 25) × 0.75)
       [ Reorder ]  [ Disable one ]  [ Accept default ]

  Hard conflict:
    AI Behavior X vs AI Behavior Y
       Engine refuses to enable both.
       [ Disable X ]  [ Disable Y ]
```

## Priority Override

For overlay conflicts: reorder by priority.

```
+----------------------------------------------------------+
| Reorder priority — dragon.png                            |
|                                                          |
|  1.   Pixel Skin                  [priority: 100]        |
|  2.   Healing Pack                [priority:   0]        |
|                                                          |
| Drag to reorder; or edit priority numbers directly.     |
|                                                          |
| [ Apply ]                                                |
+----------------------------------------------------------+
```

Saves to your profile (not to the mods themselves). Profile-portable.

## Auto-Merge Semantics

Engine attempts merge for these asset kinds (→ `docs/specs/mods/asset-overlay.md`):

| Kind | Merge unit |
|---|---|
| glTF / scene | mesh, material, node |
| Material set | per material id |
| Localization | per key |
| Atlas | per region |
| TOML / JSON | per field |

Binary blobs (single PNG, single audio): no auto-merge possible; engine warns and falls back to `pick one`.

## Component Write Ordering

Engine never picks values for you on component writes. The deterministic rule is: last loaded mod's write wins (per load order). The dialog explains the resulting computed value:

```
Health calculation:
  Base:                     100
  After Healing Pack:       125  (+25)
  After Balance Overhaul:    93.75 (×0.75)
  Final value:               93.75
```

You can reorder load order to change the calculation.

## "Apply To All"

```
[x] Apply this decision to all overlay conflicts between these two mods.
```

Saves an entry to your profile: `"Pixel Skin" always wins over "Healing Pack" for overlay conflicts`. Future conflicts auto-resolve without prompt.

## Conflict-Free Mode

`Settings → Mods → Auto-resolve conflicts with defaults`.
- Enables only non-conflicting mods.
- Skips dialogs.
- Logs decisions to your profile so you can review later.

Useful for new players or quick playtests.

## Server-Side Conflicts (Multiplayer)

In multiplayer, conflicts can be:
- Server says "Mod X required"; player has none → install prompt (→ `install.md`).
- Player has unlisted Behavior mod → rejected with reason; player disables to join.
- Player's overlays produce different bytes than server expects → asset hash mismatch reject. → `docs/specs/mods/multiplayer-sync.md`.

The in-game dialog frames these as server policies, not conflicts you can resolve client-side.

## Reset

```
Mods → Profile → Reset conflict decisions
```

Forgets all "Apply To All" entries; next time conflicts arise, the dialog reappears.

## Pitfalls

- "Apply To All" then installing a new related mod: new conflicts may be auto-resolved unexpectedly; periodic audit recommended.
- Auto-Merge silently falling back to "pick one" on binary kind; banner explains why.
- Component-write reordering can change game balance dramatically; preview the calc before applying.

## Cross-Links

- → `install.md`
- → `profiles.md`
- → `docs/specs/mods/asset-overlay.md`
- → `docs/specs/mods/load-order.md`
- → `docs/specs/mods/multiplayer-sync.md`
