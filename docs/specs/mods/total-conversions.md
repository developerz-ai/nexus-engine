<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Total Conversions

> A mod that replaces the base game wholesale. New entry point, new scenes, new scripts, new branding, own save namespace, own ladder. One-line `[entry]` switch in `mod.toml`. Engine treats the result as a separate game.

## Boundaries
- Owns: entry-point override semantics, branding/title rules, save namespace, ladder isolation, the elevated consent dialog.
- Does NOT own:
  - Capability sandbox (TCs still run in the sandbox) → `docs/specs/scripting/sandbox.md`
  - Multiplayer trust → `multiplayer-sync.md` (canonical)
  - Marketplace publish → `docs/guides/mods/authoring/publishing.md`
- Depends on: `manifest.md` `[entry]`, `docs/specs/scripting/rune.md`, `docs/specs/scripting/sandbox.md`.

## Why First-Class

The biggest mods in history are total conversions: Counter-Strike on HL, DotA on WC3, Tale of Two Wastelands on Fallout, Stalker mods, Garry's Mod, S.T.A.L.K.E.R Anomaly. Treating them as ordinary mods misses their reach; treating them as "fork the engine" misses their accessibility. Nexus splits the difference: a single TOML field flips a mod into TC mode.

## The Switch

```toml
[mod]
tier = "total-conversion"

[entry]
override = true
scene    = "scenes/main_menu.scn"
script   = "src/bootstrap.rn"
game_id  = "com.example.counter-tactics"     # new ladder/save namespace
brand    = { name = "Counter-Tactics", icon = "branding/icon.png" }
```

When enabled:
1. Engine's normal boot path is short-circuited; the TC's `bootstrap.rn` runs in place of the host game's entry script.
2. The TC's scene is the new main menu.
3. The window title, taskbar icon, splash, and save folder use the TC's brand and `game_id`.
4. Saves go to `~/.nexus/saves/<game_id>/...` — isolated from the host game and other TCs.
5. Multiplayer matchmaking uses `game_id` as the room key; TCs never mix with the host game.
6. Anti-cheat domain is per-TC.

## Capability Scope

TCs may request wildcard caps:

```toml
[capabilities]
world.read  = ["*"]
world.write = ["*"]
events.emit = ["*"]
events.subscribe = ["*"]
assets.read = ["*"]
persist = { size_kb = 1024 }
semantic_spawn = true
```

Wildcards rejected in `skin` and `behavior` tiers; accepted only in `total-conversion`. Player sees an **elevated consent dialog** at install:

> "Counter-Tactics will replace the entire game. It can read/write any component, emit any event, persist a large save. It runs in the engine sandbox: no filesystem outside its own dir, no network, no subprocess. Allow / Deny."

`net = true` still forbidden in v1.0 even for TCs.

## Branding Rules

| What TC may rebrand | Notes |
|---|---|
| Window title, taskbar | Yes |
| Splash screen | Yes |
| Main menu, all UI | Yes |
| Save folder name | Yes (uses `game_id`) |
| Marketplace cards | Yes (per-marketplace metadata) |
| Engine credits screen | NO — host game and engine credits must remain accessible (`F1` default) |

The host game's trademark/copyright remains visible per the engine's MIT-derived credits requirement. → `docs/guides/mods/economy/legal.md`.

## Asset Replacement

TCs typically ship a full asset set; they `replace` (rather than `merge`) most overlays. Pattern:

```toml
[capabilities]
assets.read = ["*"]

[[overlays]]
target = "*"                           # wildcard: every base asset overlaid
file   = "overlays/manifest.toml"
mode   = "replace"
priority = 100
```

A wildcard `target = "*"` is **only** legal in TC tier; engine validates. → `asset-overlay.md`.

TCs that want to share host-game assets selectively can omit them from the overlay manifest.

## Saves

- Save folder: `~/.nexus/saves/<game_id>/` (TC's own `game_id`).
- Host-game saves invisible to TC; TC's saves invisible to host.
- A player switching between host game and TC keeps both save sets intact.
- Save header still records the TC's mod-set; sub-mods can extend a TC.

## Multiplayer

- TC servers advertise `game_id = "<tc-id>"`; matchmaking partitions on `game_id`.
- A TC server CANNOT accept connections from clients running the host game's normal entry (and vice versa).
- TC sub-mods (mods that depend on a TC) follow the same whitelist negotiation (→ `multiplayer-sync.md`).

## Ladder & Telemetry Isolation

- Cloud leaderboards (if game uses any) keyed by `game_id`. TC has its own ladder.
- Achievements: TCs may declare their own; host-game achievements are not earnable from inside a TC.
- Telemetry (→ `telemetry.md`) tagged with `game_id`; never mingled with host data.

## Sub-Mods on a TC

A TC may itself accept mods. Its `mod.toml` can declare:

```toml
[mod]
accepts_submods = true

[mods.policy]
allowed_tiers = ["skin", "behavior"]
required_sdk = "^1.0"
```

Sub-mods follow the usual lifecycle, depend on the TC by id, and resolve through the same resolver. → `dependencies.md`.

## Concurrent TCs

Only one TC is active at a time per game launch. Switching TC requires returning to the launcher (or `nexus tc switch <id>`); engine refuses to load two TCs simultaneously with `MOD_E_TC_MULTIPLE_ACTIVE`.

The non-TC host game ("vanilla") is also a launch option; TCs do not erase the host.

## CLI

```
nexus tc ls                            # list installed TCs
nexus tc launch <tc-id>                # launch into TC
nexus tc launch --vanilla              # explicit host
nexus tc switch <tc-id>                # restart into TC
nexus tc info <tc-id>                  # caps, brand, save folder, ladder
```

Launcher UI exposes the same; player picks game from a list (vanilla + installed TCs).

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_TC_ENTRY_INVALID` | `[entry].script` or `scene` missing in archive |
| `MOD_E_TC_BRAND_REQUIRED` | TC enabled without `brand` block |
| `MOD_E_TC_MULTIPLE_ACTIVE` | Tried to load 2 TCs same session |
| `MOD_E_TC_GAMEID_COLLISION` | Two TCs use same `game_id` |
| `MOD_E_TC_HOST_INCOMPAT` | TC declares `nexus`/`sdk` outside engine range |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| TC cold launch (vs vanilla cold launch) | within 1.2× | within 2× |
| TC switch (no engine restart needed) | < 5 s | 20 s |
| Save namespace switch | < 100 ms | 500 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `manifest.md` — `[entry]` schema.
- `docs/specs/scripting/sandbox.md` — wildcard cap acceptance only in TC tier.
- `asset-overlay.md` — wildcard target acceptance only in TC tier.
- `multiplayer-sync.md` — `game_id` segregates matchmaking.
- `save-compatibility.md` — TC-namespaced save folder; same compat rules.
- `lifecycle.md` — TC install/enable/uninstall reuses pipeline plus brand/ladder hooks.
- `docs/specs/agent/scenarios.md` — TCs can ship their own scenario suites under `scenarios/`.

## Test Requirements

- TC launches with own title/icon/saves; vanilla saves untouched.
- Two TCs cannot run in same session; second launch refused.
- TC sub-mod resolves and loads after TC; uninstalling TC blocked while sub-mods depend on it.
- Multiplayer: TC server rejects vanilla client; vanilla server rejects TC client.
- Ladder isolation: TC achievements never leak into vanilla profile.
- Determinism: TC scenario replays byte-identical across runs.

## Prior Art

- Counter-Strike (mod → standalone) ✓ — the canonical TC story; goal: enable on day one.
- DotA (WC3 mod → spawned a genre) ✓ — TCs as innovation engines.
- Garry's Mod ✓ — TC + sandbox of sandboxes.
- Black Mesa (HL remake) ✓ — TC pipeline that became a standalone product.
- Skyrim Wabbajack TC list-installs ✓ — TC distribution UX.
- TF2 → CS:S → DoD on Source engine ✓ — engine that treated TC seriously.

## Open Questions

- `[DECISION NEEDED]` Whether TCs can ship custom genre modules (yes per spec; need workflow doc).
- `[DECISION NEEDED]` Anti-cheat domain key: `game_id` only, or include TC version range?
- `[DECISION NEEDED]` Marketplace cross-list policy: should a TC list as "game" on stores that distinguish?
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 11]` Confirm launcher UI consumes `nexus tc ls` output.
- `[AGENT: 21]` Confirm per-store TC publishing flow.
