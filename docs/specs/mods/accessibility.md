<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Accessibility

> Accessibility mods get elevated default permissions. Audio descriptions, colorblind palettes, input remappers, subtitle expanders, screen-reader bridges. Auto-allowed even on competitive ladders. Never gated behind purchase.

## Boundaries
- Owns: `[mod].accessibility = true` semantics, auto-grant set, server-policy override rules, certification heuristic.
- Does NOT own:
  - Engine-side accessibility primitives (subtitles, contrast modes, input remapping) — those live in their own subsystem.
  - Capability catalog → `docs/specs/scripting/sandbox.md`
- Depends on: `permissions.md`, `multiplayer-sync.md`, `manifest.md`.

## The Rule

Any mod that flags itself accessibility and stays within the **accessibility scope** runs everywhere by default, including:
- Solo offline (already zero-friction).
- Co-op private.
- Public PvP / competitive ladder.
- Total conversions.

If a sham mod claims accessibility but acts otherwise, it gets revoked. Behavioral scoring and curator review handle the long tail. → `docs/guides/mods/marketplaces/decision-matrix.md`.

## Accessibility Scope

A mod is in scope if it only does the following:

| Kind | Surface |
|---|---|
| Audio description | New audio cues, narration overlays, oneshot speech via TTS hook |
| Colorblind palette / contrast | Asset overlays for UI textures and shader-param tweaks (engine-mediated) |
| Subtitle expansion | New strings, larger font, repositioned text via `nexus.mod.ui` |
| Input remapping | Read engine input bindings, expose new bindings (NOT new in-sim abilities) |
| Screen-reader bridge | Outbound TTS via platform API (engine-mediated, no raw FS) |
| Camera assistance | Smoothing, motion-reduction shader overlays |
| Reaction-time adjustments | Slow-down for menu navigation only (not sim) |
| Sound cue indicators | Visual cues for audio events (e.g., footstep direction) |
| One-handed control schemes | Input remap + UI overlay |
| Cognitive load helpers | UI simplifiers, hints |

Strict exclusions: cannot give the user a gameplay edge (no aim-assist beyond engine defaults, no wallhack, no auto-loot mechanic that nets resources faster).

## Auto-Granted Caps

When `accessibility = true` and the manifest's cap set is within the curated allowlist below:

| Cap | Default grant |
|---|---|
| `WorldRead<{Audio*, Subtitle*, Input*, UI*, Camera*}>` | auto-granted everywhere |
| `WorldWrite<{Subtitle*, UI*, Camera*}>` | auto-granted everywhere |
| `EventSubscribe<{audio.*, input.*, ui.*}>` | auto-granted |
| `AudioOneshot{tts/*}` | auto-granted |
| `AssetRead<UI/colorblind-overlay-uuids>` | auto-granted |
| `Log` | auto-granted |

Caps outside this list → mod is **not** accessibility-scope; auto-grant denied; mod treated as regular Behavior tier (still works, but with normal consent flow).

## Server Policy Override

A competitive server's anti-cheat config can EXPLICITLY block accessibility mods only by setting:

```toml
[anticheat.mods.accessibility]
allow = true                           # default: true
exception_ids = []                     # explicit IDs to block, if any
```

We strongly discourage `allow = false`. Documentation in `docs/specs/networking/anticheat.md` flags this as a red-line policy.

## Certification Heuristic

Mods declaring `accessibility = true` are scanned at install:
- Manifest cap set is a subset of the auto-grant allowlist.
- No `WorldWrite` outside the curated component set.
- No `Net`, `Persist > 64 KB`, `SemanticSpawn`.
- No outbound events that affect game-state outside accessibility namespaces.

Pass → auto-grant on next consent flow.
Fail → degrade to Behavior tier; standard consent dialog with a banner: "this mod claims accessibility but requests caps beyond the accessibility scope."

## UI / Surface

```
+----------------------------------------------------------+
| Colorblind UI Pack 1.2.0   [Accessibility mod]           |
|                                                          |
| Auto-approved on all servers, including competitive,    |
| because this mod stays within the accessibility scope.  |
|                                                          |
|  [ Disable ]   [ View Permissions ]                      |
+----------------------------------------------------------+
```

Players never see a consent dialog for in-scope accessibility mods. They DO see them listed in the mod page with the badge.

## Cross-Game Accessibility Mods

Accessibility mods often work across multiple games (e.g., one colorblind palette for any Nexus game). Declare:

```toml
[mod]
game_id = "*"                          # any game
accessibility = true
```

Engine accepts cross-game accessibility mods if every asset overlay/UUID resolves at install (often they use overlay targets like `engine:ui/text-color` — engine-namespaced UUIDs that are stable across games).

`[DECISION NEEDED]` formal engine-namespaced UUID set for accessibility.

## TTS Bridge

Engine provides a sandboxed TTS bridge:

```
nexus.mod.audio.tts(text: &str, voice: VoiceId, params: TtsParams) -> VoiceHandle
```

Bridge calls into the platform TTS (SAPI on Win, AVSpeechSynthesizer on mac/iOS, espeak/orca on Linux, Android TTS, browser SpeechSynthesis). Cap-gated under `AudioOneshot{tts/*}`. No raw network. → `docs/specs/audio/overview.md` for the bridge spec.

## Subtitle Engine Hooks

Engine exposes a subtitle stream the accessibility mod can read and rewrite:

```
nexus.mod.ui.subtitles.on_emit(handler: Fn(SubtitleEvent) -> Option<SubtitleEvent>)
```

Returning `None` drops the subtitle; returning `Some(modified)` rewrites it (e.g., expand contractions, add speaker name, increase font, position). Many small accessibility mods compose cleanly via load order.

## Input Remap API

```
nexus.mod.input.bindings.list() -> Vec<Binding>
nexus.mod.input.bindings.add(action: ActionId, key: KeySpec)
nexus.mod.input.bindings.alias(existing: ActionId, alias: ActionId)
```

Cannot add new SIM actions (those need behavior-tier caps); can map existing actions to additional keys.

## Funding & Distribution

Accessibility mods often unfunded labor. Engine encourages:
- Promoted in mod browser ("accessibility-first" filter).
- Featured shelf in first-party hub (→ `docs/guides/mods/marketplaces/nexus-hub.md` `[DECISION NEEDED]`).
- Tipping built into the browser (no platform cut → `docs/guides/mods/economy/free-mods.md`).
- Optional "verified" review by community curators (`[AGENT: 23]` mod-curator subagent).

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_A11Y_SCOPE_VIOLATION` | `accessibility = true` but cap set out of scope; degraded to Behavior |
| `MOD_W_A11Y_SERVER_OVERRIDE` | Competitive server explicitly disabled accessibility mods | Banner: "This server blocks accessibility mods. Contact server admin." |
| `MOD_E_A11Y_TTS_DENIED` | TTS bridge unavailable on platform | Use captions fallback |

## Integration Points

- `permissions.md` — auto-grant path.
- `docs/specs/scripting/sandbox.md` — same cap broker.
- `docs/specs/networking/anticheat.md` — server-override path.
- `multiplayer-sync.md` — accessibility role accepted by default whitelists.
- `docs/specs/audio/overview.md` — TTS bridge.
- `docs/guides/mods/players/safety.md` — featured shelf.

## Test Requirements

- Colorblind palette mod auto-grants and runs on competitive server with no consent dialog.
- Mod claiming `accessibility = true` while requesting `WorldWrite<Health>` is degraded to Behavior tier with warn.
- Subtitle rewriter cleanly composes when two accessibility mods both wrap subtitles.
- Input remap can add a new key for an existing action but cannot add new sim actions.
- TTS bridge call without `AudioOneshot{tts/*}` cap returns `CAP_DENIED`.
- Cross-game accessibility mod loads on two different Nexus games without re-install.

## Prior Art

- Game Accessibility Guidelines (`gameaccessibilityguidelines.com`) ✓ — feature checklist informs scope.
- Xbox Adaptive Controller + Accessibility Insights ✓ — input remap precedent.
- Microsoft Speech API / AVSpeechSynthesizer ✓ — TTS surface.
- DeepCustom Skyrim accessibility mods ✓ — community-driven existence proof.
- AbleGamers initiatives ✓ — community standards.

## Open Questions

- `[DECISION NEEDED]` Engine-namespaced UUID registry for accessibility targets.
- `[DECISION NEEDED]` Verification badge process: community vote vs publisher curator.
- `[DECISION NEEDED]` Whether server admins can require an accessibility-mod allowlist (counterproductive but technically possible).
- `[AGENT: 06]` Confirm TTS bridge in audio spec.
- `[AGENT: 11]` Confirm subtitle stream surface in editor + game UI specs.
