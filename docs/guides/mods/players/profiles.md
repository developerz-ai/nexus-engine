<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Players — Mod Profiles

> One game, many mod loadouts. Swap profiles instantly. Per save, per character, per mood. No accidental cross-contamination.

## Concept

A **profile** = a named set of enabled mods + their settings + a lockfile snapshot.

You can have:
- "Vanilla" — no mods.
- "Hardcore" — survival + perma-death + difficulty + UI overhaul.
- "Story mode" — quality-of-life + UI clarifier + accessibility.
- "Cinematic" — graphics overhauls + cinematic camera mod.
- "Speedrun" — minimal HUD + frame counter.

Switch by name. Engine swaps the active set in one action.

## CLI

```
nexus mod profile ls
nexus mod profile create hardcore
nexus mod profile activate hardcore
nexus mod profile export hardcore --out hardcore.toml
nexus mod profile import hardcore.toml
nexus mod profile delete hardcore
```

## In-Game

`Main menu → Mods → Profiles → [Create / Switch / Edit]`.

Switch is instant in main menu. Mid-game switch:
- Cosmetic-only changes: hot.
- Behavior changes: warm reload (one-tick pause) or cold reload depending on what changed.
- Switching while save loaded prompts: "switch mods will affect your save; backup automatic; continue?"

## Save Binding

Each save records which profile was active. On load:
- Active profile = save's profile → engine swaps if different (with prompt).
- Active profile = same → continue.
- Player can opt out of binding per save (advanced).

Useful for multi-character RPG saves: one char on Hardcore, another on Story.

## Profile File Format

`~/.nexus/profiles/<game-id>/hardcore.toml`:

```toml
version = 1
name = "hardcore"
description = "Survival + perma-death + UI overhaul"
created = "2026-05-17T10:23:00Z"
game_id = "com.nexus.fps-demo"

[mods]
"com.nexus.mod-lib"        = { version = "^1.0",  enabled = true }
"com.example.survival"     = { version = "^2.0",  enabled = true }
"com.example.perma-death"  = { version = "^1.0",  enabled = true }
"com.example.hud-clean"    = { version = "^0.5",  enabled = true }

[lockfile]
ref = "b3:abcd...1234"      # snapshot

[config."com.example.survival"]
difficulty = "hardcore"
hunger_multiplier = 2.0

[config."com.example.perma-death"]
delete_save_on_death = true
```

Portable: export to share with friends; import to receive.

## Per-Character Profiles (within one save game)

For RPGs with multiple characters in one save:
- Each character can have a sub-profile.
- Engine swaps cosmetic + UI mods when switching characters.
- Behavior mods are save-global (can't be per-character).

```toml
[characters.alice]
mod_overrides = { "com.example.ui-theme-blue" = true, "com.example.ui-theme-red" = false }

[characters.bob]
mod_overrides = { "com.example.ui-theme-red" = true, "com.example.ui-theme-blue" = false }
```

## Profile Sharing

```
nexus mod profile export hardcore --out hardcore.toml
```

Export contains the mod list and configs but NOT the mods themselves. The receiver runs:

```
nexus mod profile import hardcore.toml
```

Engine resolves dependencies, downloads missing mods, applies configs.

For modpack-style sharing (bundle the actual `.nxmod` files), see `sharing-saves.md`.

## A/B Testing Mods

```
nexus mod profile clone hardcore --out hardcore-test
nexus mod profile add hardcore-test com.example.new-mod
nexus mod profile diff hardcore hardcore-test
```

Easy to try a new mod without disturbing your main profile.

## Storage

Profiles are local. Cloud sync is optional (game can declare in `Nexus.toml` whether to sync profiles via the game's account system).

`[DECISION NEEDED]` first-party cloud-sync via `nexus-hub`?

## Profile Conflicts

Switching profiles with very different mod sets while save is loaded:
- Engine computes diff: what's added, removed, changed.
- Save policy from `docs/specs/mods/save-compatibility.md` applies.
- For destructive changes: prompt + auto-backup.

## CLI Power Use

```
nexus mod profile show hardcore                          # what's in it
nexus mod profile validate hardcore                      # resolver dry-run
nexus mod profile lock hardcore                          # snapshot lockfile
nexus mod profile diff hardcore vanilla                  # textual diff
nexus mod profile install-missing hardcore               # download all deps
```

## Pitfalls

- Switching profiles mid-save without backup → save can become inconsistent if you skip the prompt; engine always offers backup; default accept.
- Exporting profile but not the mods themselves: receiver needs marketplace access to those mods.
- Per-character overrides only work for cosmetic mods; engine warns if you try to scope a behavior mod.

## Cross-Links

- → `install.md`
- → `permissions-ui.md` — caps re-applied on profile switch.
- → `sharing-saves.md` — full modpack share.
- → `docs/specs/mods/save-compatibility.md`
- → `docs/specs/mods/lifecycle.md`
