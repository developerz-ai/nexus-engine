<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Permissions (Capability Consent Contract)

> What each capability actually permits, the default-deny rule, the plain-language consent UI, and the per-session audit log. Reuses the catalog from `docs/specs/scripting/sandbox.md`; defines the mod-side UX contract that surfaces it.

## Boundaries
- Owns: per-cap plain-language description, default policy table, consent UI contract, audit log surface for mods, revoke flow.
- Does NOT own:
  - Cap enforcement / broker → `docs/specs/scripting/sandbox.md` (canonical)
  - VM internals → `docs/specs/scripting/rune.md`
  - Anti-cheat use of audit → `anti-cheat.md`
- Depends on: `docs/specs/scripting/sandbox.md`, `manifest.md` `[capabilities]`.

## Default Policy

Default deny. Nothing granted without explicit player action OR explicit game-publisher pre-approval in `Nexus.toml::[mods.policy]`.

For solo offline play: the engine may auto-approve any cap on user-initiated install, because the player IS the trust root. (→ `docs/specs/mods/overview.md` consent model.)

For online / save-impacting / competitive contexts: explicit consent required.

## Capability Catalog (UX surface)

Plain-language strings used in consent dialogs. Backing semantics in `docs/specs/scripting/sandbox.md`.

| Cap | Dialog string | Risk level |
|---|---|---|
| `WorldRead<C>` | "Read game state: {component-list}" | low |
| `WorldWrite<C>` | "Change game state: {component-list}" | medium |
| `EventEmit{names}` | "Send signals: {event-list}" | low |
| `EventSubscribe{names}` | "Listen for signals: {event-list}" | low |
| `AssetRead{uuids}` | "Load specific assets ({n} items)" | low |
| `AudioOneshot{ids}` | "Play sounds: {sound-list}" | low |
| `Log` | "Write to mod logs" | trivial |
| `Rng` | "Use deterministic random" | trivial |
| `SemanticSpawn` | "Spawn entities by natural-language prompt (uses AI)" | medium-high |
| `Persist {size}` | "Save up to {n} KB of its own state with your saves" | low |
| `Net` | "Make outbound network requests" (v1.1+) | high |
| `Fs` | "Read/write files outside its own dir" | NEVER GRANTED |
| `Process` | "Run external programs" | NEVER GRANTED |

Risk level drives UI tone (color, default focus, default action). Total-conversion wildcards (`*`) collapse to "this mod will replace the game and can do anything the engine permits."

## Default Game-Publisher Policy

Game ships with `Nexus.toml::[mods.policy]`:

```toml
[mods.policy]
# Caps the player NEVER has to approve for SKIN-tier mods (these are default-on).
auto_approve_skin = ["AssetRead", "AudioOneshot", "Log"]

# Caps the player auto-approves for accessibility mods.
auto_approve_accessibility = ["WorldRead", "WorldWrite", "EventEmit", "EventSubscribe", "AudioOneshot", "Log"]

# Caps a Behavior mod can request with a single grouped dialog.
auto_approve_behavior = ["Log", "Rng"]

# Caps that always require explicit consent (per-cap line).
always_prompt = ["Persist", "SemanticSpawn", "Net"]

# Caps the publisher fully blocks.
block = []
```

Engine fields per-mod consent against this policy. Publisher can never expand the catalog (engine caps that are NEVER GRANTED stay never granted).

## Consent UI Contract

Single-cap dialog:

```
+----------------------------------------------------------+
| <mod icon>  Healing Pack 1.0.0                            |
|             by sebi (verified DID)                        |
|                                                          |
| This mod is asking permission to:                        |
|                                                          |
|   • Read your character's Health and Inventory          |
|   • Change your character's Health and Inventory        |
|   • Send signal: healing.applied                        |
|   • Play sound: heal_sfx_01                              |
|   • Save 4 KB of its own state with your saves          |
|                                                          |
| What this mod CANNOT do (engine-enforced):              |
|   ✗ Access the internet                                 |
|   ✗ Read files outside its own folder                   |
|   ✗ Run external programs                               |
|                                                          |
|  [ Allow ]   [ Allow Once ]   [ Customize ]   [ Deny ]  |
+----------------------------------------------------------+
```

Rules:
1. **Grouped.** All caps in one dialog; never per-cap drip.
2. **Plain language.** Use the strings table above; never raw cap names.
3. **Forbid list shown.** "Cannot do" reassures the player and is contractually true.
4. **Customize.** Lets the player attenuate (deny individual caps, narrow parameters).
5. **Allow Once** — grants only for this session; mod re-prompts next launch.
6. **Default focus on Deny** if any cap is "medium" or higher.
7. **Sign indicator.** Verified DID / publisher key shown if present; otherwise "unsigned" badge.
8. **No dark patterns.** No countdown timers, no pre-checked boxes for telemetry, no "remind me later."

## Customize Sub-Dialog

```
+----------------------------------------------------------+
| Customize: Healing Pack                                  |
|                                                          |
| [x] Read Health, Inventory                              |
| [x] Change Health, Inventory                            |
|     ↳ allow only on entities I control: [x]             |
| [x] Send: healing.applied                                |
| [x] Play sound: heal_sfx_01                              |
| [ ] Save 4 KB of its own state                          |
|                                                          |
|  [ Apply ]   [ Cancel ]                                  |
+----------------------------------------------------------+
```

Attenuation parameters per cap (subset of those listed in `docs/specs/scripting/sandbox.md`):
- `WorldRead/Write`: deselect components.
- `EventEmit/Subscribe`: deselect specific names.
- `AssetRead`: deselect UUIDs (or "first-party assets only" toggle).
- `Persist`: shrink size.

Engine never **expands** beyond the manifest request.

## Revoke

Player can revoke any cap at any time from the mod's settings page:

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
| Pending:                                                 |
|   • Save 4 KB                       [ Grant  ]          |
|                                                          |
| [ Revoke All ]   [ Reset to Default ]                   |
+----------------------------------------------------------+
```

Revoke takes effect within one tick; subsequent broker calls return `CAP_REVOKED` (canonical → `docs/specs/scripting/sandbox.md`).

## Audit Log (per session)

Every cap use is counted; periodic flush to a player-visible log:

```
+----------------------------------------------------------+
| Healing Pack — Activity                                  |
|                                                          |
|  Reads this session:    1,243                           |
|  Writes this session:   87                              |
|  Events emitted:        12                              |
|  Sounds played:         8                               |
|  CPU time:              14.2 ms (0.03% of session)      |
|  Memory:                2.1 MB / 16 MB                  |
|                                                          |
|  Denied attempts:       0                                |
|  Suspended events:      0                                |
|                                                          |
| [ Show Detailed Log ]   [ Export JSON ]                  |
+----------------------------------------------------------+
```

Backed by the canonical audit stream from `docs/specs/scripting/sandbox.md` § Audit Log. Players can export per-mod or per-session for sharing / forum support.

## Re-Prompt Triggers

| Trigger | Behavior |
|---|---|
| Mod version bump that adds a cap | Re-prompt grouped diff dialog |
| Mod version bump that expands a cap parameter (more components / events) | Re-prompt with diff |
| Mod version bump that shrinks caps | No prompt; auto-applied |
| Game policy update that newly blocks a cap | Mod silently degraded; banner once |
| Save context change (solo → competitive) | Re-evaluate; may re-prompt for stricter set |

## Accessibility Auto-Grant

Mods declaring `[mod].accessibility = true` (→ `accessibility.md`) auto-receive a curated set of caps without prompt, even on competitive servers. UI shows once: "An accessibility mod was granted permissions automatically."

## Solo Offline Auto-Approve

In `--offline-solo` profile (or any single-player save not flagged competitive), the engine may auto-approve ANY cap in the manifest on user-initiated install. UI shows: "Install with all requested permissions? [Yes] [Customize]."

This is the **zero-friction** modding experience the project's mandate demands. → `docs/specs/mods/overview.md`.

## Error Contract

Most errors from `docs/specs/scripting/sandbox.md`. Permission-UX-specific:

| Code | Meaning | Action |
|---|---|---|
| `PERM_E_NO_CONSENT` | Mod attempted to load before consent flow completed | UI shows blocker |
| `PERM_E_CAP_NEVER_GRANTABLE` | Manifest requested a NEVER-GRANTED cap | Reject install at verify |
| `PERM_E_PUBLISHER_BLOCKED` | Game policy blocks a requested cap | Reject install with reason |

## Integration Points

- `docs/specs/scripting/sandbox.md` — canonical cap catalog and broker.
- `manifest.md` — `[capabilities]` source.
- `lifecycle.md` — `enable` step calls into this UI.
- `accessibility.md` — auto-grant rules.
- `anti-cheat.md` — competitive-context override path.
- `docs/specs/editor/livereload.md` — re-prompt during hot reload (→ `hot-reload.md`).
- `docs/specs/agent/sdk.md` — agent SDK exposes "non-interactive grant" for fuzzing / CI.

## Test Requirements

- Cosmetic mod installs with zero prompts on solo offline.
- Behavior mod shows grouped dialog with all caps; "Customize" attenuates correctly.
- Revoke takes effect within one tick; mod continues running with safe defaults.
- Accessibility mod auto-grants on competitive server without prompt.
- Manifest requesting `Fs` is rejected at install with `PERM_E_CAP_NEVER_GRANTABLE`.
- Audit log JSON exports correctly; rows match broker telemetry.

## Prior Art

- Browser permission prompts (camera, mic, geolocation) ✓ — grouped, plain-language; we copy and trim dark patterns.
- Android runtime permissions ✓ — revoke any time; we match.
- iOS / macOS TCC ✓ — explicit, per-app, per-resource.
- Flatpak portals ✓ — broker pattern + explicit deny.
- Steam Workshop subscription ✗ — opaque permissions; we improve dramatically.
- BepInEx ✗ — no consent at all; the anti-pattern.

## Open Questions

- `[DECISION NEEDED]` Whether to show estimated perf cost per cap in the dialog (e.g., "this mod is allowed up to 250 µs/frame").
- `[DECISION NEEDED]` "Always allow from this author" — auto-grant for trusted DIDs?
- `[DECISION NEEDED]` Per-save permission set vs per-install: lean per-install with per-save overrides.
- `[AGENT: 11]` Confirm dialog shell in editor + game uses same component.
