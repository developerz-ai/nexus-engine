<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Players — Permissions UI

> Plain-language consent dialogs. What the mod can do (and CAN'T do). Revoke any time. No dark patterns. → `docs/specs/mods/permissions.md` for the canonical contract.

## When You'll See A Dialog

| Trigger | Dialog |
|---|---|
| Install a Behavior-tier mod | Grouped consent dialog |
| Install a Total Conversion | Elevated dialog (replaces game) |
| Update a mod that requests new caps | Re-prompt (diff highlighted) |
| Switch from solo to competitive context for a save | Re-evaluate prompt |
| Hot-reload of a mod (in dev) that adds caps | Pause-and-prompt |

You will NOT see a dialog for:
- Cosmetic / Skin mods.
- Mods marked accessibility-scope.
- Updates with no new caps requested.
- Mods you've previously approved at the same scope.

## Anatomy

```
+----------------------------------------------------------+
| [icon]  Healing Pack 1.0.1                                |
|         by sebi (signed: did:key:z6Mk...)                |
|                                                          |
| This mod is asking permission to:                        |
|                                                          |
|   • Read your character's Health and Inventory          |
|   • Change your character's Health and Inventory        |
|   • Send the signal "healing.applied"                    |
|   • Play sound: heal_sfx_01                              |
|   • Save 4 KB of its own state with your saves          |
|                                                          |
| The engine guarantees this mod CANNOT:                  |
|   ✗ Access the internet                                 |
|   ✗ Read files outside its own folder                   |
|   ✗ Run external programs                               |
|                                                          |
|  [ Allow ]   [ Allow Once ]   [ Customize ]   [ Deny ]  |
+----------------------------------------------------------+
```

- **Allow**: grant the requested caps; persisted across sessions.
- **Allow Once**: grant for this session only; re-prompt at next launch.
- **Customize**: open the attenuation sub-dialog (below).
- **Deny**: refuse; mod stays installed but won't run.

Default focus is on Deny for any "medium" or higher risk cap. No countdown, no pre-checked boxes.

## Customize Sub-Dialog

```
+----------------------------------------------------------+
| Customize: Healing Pack                                  |
|                                                          |
| [x] Read Health, Inventory                              |
| [x] Change Health, Inventory                            |
|     ↳ Only on entities I control: [x]                   |
| [x] Send: healing.applied                                |
| [x] Play sound: heal_sfx_01                              |
| [ ] Save 4 KB                                            |
|                                                          |
|  [ Apply ]   [ Cancel ]                                  |
+----------------------------------------------------------+
```

You can:
- Deselect individual caps.
- Narrow component lists (e.g., grant `WorldRead<Health>` but not `WorldRead<Inventory>`).
- Narrow event names or asset UUIDs.
- Shrink `Persist` size.

You CAN'T grant more than the mod requested.

## Per-Mod Permission Page

`Mods → <mod> → Permissions`:

```
+----------------------------------------------------------+
| Healing Pack — Permissions                               |
|                                                          |
| Granted:                                                 |
|   • Read Health, Inventory          [ Revoke ]          |
|   • Change Health, Inventory        [ Revoke ]          |
|   • Send: healing.applied           [ Revoke ]          |
|   • Play sound: heal_sfx_01         [ Revoke ]          |
|                                                          |
| Pending (mod requested but not granted):                 |
|   • Save 4 KB                       [ Grant  ]          |
|                                                          |
| [ Revoke All ]   [ Reset to Default ]                   |
+----------------------------------------------------------+
```

Revoke takes effect within one tick. Mod continues running with safe defaults; affected calls return `CAP_DENIED` silently → mod handles gracefully or its functionality degrades.

## Activity / Audit

`Mods → <mod> → Activity`:

```
+----------------------------------------------------------+
| Healing Pack — Activity (this session)                   |
|                                                          |
|  Reads this session:    1,243                            |
|  Writes this session:   87                               |
|  Events emitted:        12                               |
|  Sounds played:         8                                |
|  CPU time:              14.2 ms (0.03% of session)       |
|  Memory:                2.1 MB / 16 MB                   |
|                                                          |
|  Denied attempts:       0                                |
|  Suspended events:      0                                |
|                                                          |
| [ Show Detailed Log ]   [ Export JSON ]                  |
+----------------------------------------------------------+
```

Backed by the canonical audit log (→ `docs/specs/scripting/sandbox.md`). Export for sharing with author on bug reports.

## Solo Auto-Approve

For `--offline-solo` save profiles, a banner offers:

> "Install with all requested permissions? [Yes] [Customize]"

One-click flow. This is the zero-friction modding mandate. → `docs/specs/mods/overview.md`.

You can opt out of auto-approve globally: `Settings → Mods → Always show consent dialog`.

## Multiplayer Context

Joining a competitive server may downgrade your grants:

```
+----------------------------------------------------------+
| Joining "PvP Ranked Server"                              |
|                                                          |
| This server allows:                                      |
|   ✓ Healing Pack (cosmetic effects only)                |
|                                                          |
| This server blocks:                                      |
|   ✗ Balance Overhaul (sim-affecting, not whitelisted)   |
|                                                          |
| Continue with reduced mod set?                           |
|                                                          |
|  [ Yes ]  [ No, choose different server ]                |
+----------------------------------------------------------+
```

→ `docs/specs/mods/multiplayer-sync.md`.

## Re-Prompt On Update

```
+----------------------------------------------------------+
| Healing Pack — Update to 1.1.0                           |
|                                                          |
| This update requests new permissions:                    |
|                                                          |
|   + Read your XP and Skills                              |
|   + Save 8 KB (was: 4 KB)                                |
|                                                          |
| Existing permissions are unchanged.                      |
|                                                          |
|  [ Allow ]   [ Customize ]   [ Skip update ]            |
+----------------------------------------------------------+
```

The diff is shown explicitly. You can update without granting the new caps; mod runs with the prior set; banner explains the missing functionality.

## Verified / Signed Indicators

- Signed mod with DID: `signed: did:key:z6Mk...` — pubkey shown; click for details.
- Unsigned: badge "unsigned"; engine warns at install in `--ship` build.
- Marketplace-verified author: store-specific badge (e.g., "Mod.io verified").

## Privacy

The engine does NOT report your permission decisions to mod authors or marketplaces unless you've explicitly opted into telemetry for that mod (→ `docs/specs/mods/telemetry.md`).

## Pitfalls

- Denying core caps then wondering why a feature doesn't work; check Activity → Denied attempts.
- Revoking mid-session caps that the mod's `init` relies on: mod may suspend itself. Re-enable after revoke if you want it back to full function.
- Customize attenuation that's too narrow can cascade-break dependent mods.

## Cross-Links

- → `docs/specs/mods/permissions.md` — canonical contract.
- → `docs/specs/scripting/sandbox.md` — cap catalog.
- → `install.md`
- → `safety.md`
- → `docs/specs/mods/lifecycle.md`
