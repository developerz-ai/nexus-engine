<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Templates

> Starter templates shipped with `nexus mod new`. One per power tier plus common pattern variants. Pick the closest, edit from there.

## Listing

```
nexus mod new --list
```

Output:

| Template | Tier | Use |
|---|---|---|
| `skin-pack` | skin | Texture/audio/font swaps |
| `gameplay-tweak` | behavior | Stat changes, balance |
| `new-content` | behavior | New items, weapons, enemies |
| `quest-pack` | behavior | New quests/storylines |
| `ai-behavior` | behavior | NPC behavior overrides |
| `genre-layer` | behavior | New systems on top of existing genre |
| `accessibility` | behavior (a11y flagged) | Accessibility helpers |
| `total-conversion` | total-conversion | New game on the engine |
| `library` | behavior | Shared lib for other mods to dep on |

## Usage

```
nexus mod new myskin --template skin-pack --game com.nexus.fps-demo
```

Generates a ready-to-pack mod with all the boilerplate filled.

## Template: `skin-pack`

Zero scripts. Pure asset overlays.

```
myskin/
├── mod.toml                 ← tier="skin", no [capabilities] script-related
├── overlays/
│   └── README.md            ← guide: drop PNGs in assets/, declare here
├── assets/
└── LICENSE
```

`mod.toml`:
```toml
[mod]
id   = "com.you.myskin"
name = "My Skin Pack"
version = "0.1.0"
tier = "skin"
license = "MIT"
nexus = "^1.0"
sdk = "^1.0"
summary = "A pack of N skins for the dragon."

[author]
name = "you"

[build]
rune = "1.0.4"
nxa-encoder = "1.0.0"
sdk = "nexus-1.0"
deterministic = true

# Add per-asset overlays below; see overlays/README.md for examples.
```

Zero friction at install (no consent dialog). → `docs/specs/mods/overview.md` consent model.

## Template: `gameplay-tweak`

Small Behavior mod. Hooks one or two systems, edits stats.

```
mytweak/
├── mod.toml                 ← tier="behavior"
├── src/lib.rn               ← stat-tweak system
├── scenarios/smoke.toml     ← assertion: stat was changed
└── LICENSE
```

`src/lib.rn`:
```rune
pub fn init(env: ModEnv) -> Result<Mod, ModError> {
    let w = env.cap::<WorldWrite>()?;
    Ok(Mod {
        on_step: |dt| {
            for (e, h) in w.query::<Health>() {
                if !w.has::<Tweaked>(e) {
                    h.max = h.max * 1.25;
                    h.hp  = h.hp  * 1.25;
                    w.add(e, Tweaked {});
                }
            }
        },
    })
}
```

`[capabilities]`:
```toml
world.read = ["Health", "Tweaked"]
world.write = ["Health", "Tweaked"]
log = true
```

## Template: `new-content`

Adds new entities. Spawns at game start.

```
mycontent/
├── mod.toml
├── src/
│   ├── lib.rn
│   └── content/
│       └── weapon_rocket.rn
├── assets/
│   ├── source/
│   │   ├── rocket_mesh.gltf
│   │   ├── rocket_albedo.png
│   │   └── rocket_normal.png
│   └── README.md
├── overlays/
└── scenarios/
    └── rocket_spawn.toml
```

`src/lib.rn` registers content; `weapon_rocket.rn` defines the new weapon's per-tick behavior.

## Template: `quest-pack`

Includes:
- `quests/<id>.toml` for each quest (declarative).
- `src/lib.rn` runs the engine's quest system from the cap-gated API.
- `locale/en-US.ftl` with quest strings.
- Scenarios that complete each quest end-to-end.

## Template: `ai-behavior`

Replaces or augments NPC behavior. Cap `WorldWrite<Brain>` etc. Often loads after the base AI mod via `[load-order].after`.

## Template: `genre-layer`

Adds a new genre system (e.g., adds parkour movement to an FPS). Hooks input + physics. Sample uses `nexus.mod.physics.raycast` and writes Movement components.

## Template: `accessibility`

`[mod].accessibility = true` set. Pre-wired with:
- Subtitle expander hook (`docs/specs/mods/accessibility.md`).
- Colorblind palette overlay slot.
- TTS bridge usage example.

Auto-grant ready. Cap set stays within the accessibility scope so it's never gated on competitive servers.

## Template: `total-conversion`

```
mytc/
├── mod.toml                 ← tier="total-conversion", [entry] set
├── src/
│   ├── bootstrap.rn         ← new game entry point
│   └── ...
├── scenes/
│   └── main_menu.scn
├── assets/
├── branding/
│   ├── icon.png
│   └── splash.png
├── scenarios/
└── LICENSE
```

`mod.toml::[entry]`:
```toml
[entry]
override = true
scene = "scenes/main_menu.scn"
script = "src/bootstrap.rn"
game_id = "com.you.mytc"
brand = { name = "My TC", icon = "branding/icon.png" }
```

Capabilities wildcarded (TC tier permits); elevated consent at install. → `docs/specs/mods/total-conversions.md`.

## Template: `library`

A mod other mods depend on. Exports a public API and registers nothing by default.

```
mylib/
├── mod.toml                 ← tier="behavior"
├── src/
│   ├── lib.rn               ← only exports; no on_step
│   └── api.rn
└── LICENSE
```

Marked as `[mod].kind = "library"` (hint to mod browsers to deprioritize standalone). Players generally install transitively, never directly.

## Common Add-Ons (apply to most templates)

`nexus mod add <feature>`:

| Feature | What it adds |
|---|---|
| `localization` | `locale/*.ftl` + `nexus.mod.locale` usage |
| `config-schema` | `config/schema.json` + `defaults.toml` |
| `telemetry` | `[telemetry]` block + sample author endpoint stub |
| `marketplace-steam` | `[marketplace.steam]` block + CI workflow |
| `marketplace-mod-io` | `[marketplace.mod_io]` block + CI workflow |
| `marketplace-thunderstore` | `[marketplace.thunderstore]` block |
| `marketplace-self-hosted` | `[marketplace]` blank + S3 backend stub |
| `scenario-suite` | Multi-scenario `scenarios/` set + perf tests |
| `signing-keys` | Generates Ed25519 keypair under `keys/` |

## Pitfalls

- Picking `total-conversion` when you want `gameplay-tweak`: TC tier means elevated consent and own ladder. Most mods are Behavior.
- `library` template with no exports: players will install and see nothing; mark `kind = "library"` to deprioritize in browsers.
- Editing `mod.toml::[mod].tier` after starting: requires re-running scaffold or manually adjusting; safer to scaffold fresh.

## Cross-Links

- → `quickstart.md` — first-mod walkthrough.
- → `editor.md` — same templates available from inside the editor.
- → `docs/specs/mods/manifest.md` — what each field means.
- → `docs/specs/mods/overview.md` — tier choice.
