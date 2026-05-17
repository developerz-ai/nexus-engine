<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# 2.5D HD-2D Quick-Start

> Day 1: Octopath Traveler look. 3D world, 2D sprite characters, tilt-shift bokeh.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| GPU with PBR-grade compute (Vulkan/Metal/D3D12) | required |
| Sprite assets (character sheets w/ optional normal maps) | bundled placeholder set |

## Scaffold

```
nexus new mygame --template hd-2d
cd mygame
nexus run
```

Day 1 result: small village scene with a 3D environment + a 2D sprite character that walks. Tilt-shift makes the look pop.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "scripting"]

[style]
preset = "2-5d"

[style.2-5d]
submode = "hd-2d"

[style.2-5d.hd_2d]
camera             = "orthographic"
camera_pitch       = 45.0
sprite_normal_maps = true
sprite_shadows     = "planar"
tilt_shift         = { strength = 0.6, focus_y = 0.4 }

[genres]
primary = "rpg"

[crates]
nexus-style-2-5d-hd2d         = "1.0"
nexus-style-pbr               = "1.0"   # 3D world shading
nexus-genre-rpg               = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-style-2-5d-hd2d` | HD-2D submode: ortho cam, sprite-in-3D depth, sprite normal-map lighting, tilt-shift |
| `nexus-style-pbr` | 3D environment shading |
| `nexus-genres/rpg` | RPG gameplay scaffolding (party, dialogue, inventory) |
| `nexus-renderer` | shared render graph |
| `nexus-physics/character` | 2D character controller in 3D world |

→ Full spec: `docs/specs/styles/2-5d.md` (submode: `hd-2d`).

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs                 # ~30 LOC bootstrap
  scripts/
    systems/
      party-movement.lua
    dialogue/
      tavern.dialogue
  assets/
    sprites/
      hero/
        idle.png              # 8-direction sheet
        idle-normal.png       # normal map (autogen if missing)
        walk.png
    environment/
      tavern.glb              # 3D scene
  scenarios/
    hd-2d-walk-and-shadow.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_style_2_5d_hd2d::Hd2dPlugin;
use nexus_genre_rpg::RpgPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(Hd2dPlugin::default())
        .add_plugin(RpgPlugin)
        .add_startup_system(spawn_party)
        .run();
}

fn spawn_party(mut cmd: Commands, assets: Res<AssetServer>) {
    cmd.spawn((
        Hero,
        Transform::from_xyz(0.0, 0.0, 0.0),
        SpriteSheet::load(&assets, "sprites/hero/idle.png"),
        SpriteIn3D { depth: AlphaTest(0.5) },
        Billboard { mode: BillboardMode::YAxisOnly },   // faces camera on Y only
    ));
}
```

Most game logic in scripts:

```lua
-- scripts/systems/party-movement.lua
function on_input(player)
  local move = input.axis_2d("move")
  player.pos = player.pos + move * speed * dt
  if move.x > 0 then player.sprite.flip_x = false
  elseif move.x < 0 then player.sprite.flip_x = true end
end
```

## Starter scenario test

`scenarios/hd-2d-walk-and-shadow.scenario.toml`:

```toml
[scene]
template = "hd-2d-tavern"
[actions]
- { tick = 1,   action = "spawn", archetype = "hero", at = [0, 0, 0] }
- { tick = 10,  action = "move", entity = "hero", delta = [1, 0, 0] }
[asserts]
- { tick = 50,  predicate = "entity_pos('hero').x > 0.5" }
- { tick = 50,  predicate = "sprite_shadow_visible('hero') == true" }
- { tick = 50,  predicate = "frame_budget_ms < 16.6" }
- { tick = 50,  predicate = "golden_screenshot_match('hd-2d-tavern.png', 99.5)" }
```

## Next steps

| You want | Add |
|---|---|
| Pixel-art HD-2D (Octopath style proper) | switch to `[style] preset = "mixed"`; layer pixel sprites over PBR world; see `docs/specs/styles/mixed.md` |
| Day-night + weather | `nexus add nexus-weather-time-of-day nexus-weather-precipitation` |
| Heavy VFX (boss spells) | `nexus add nexus-particles-heavy`; see `docs/guides/recipes/heavy-particles-quickstart.md` |
| Dialogue trees (Octopath story scenes) | `nexus add nexus-text-dialogue-dsl`; see `docs/guides/recipes/text-heavy-quickstart.md` |
| Procedural towns | `nexus add nexus-procgen-grammar`; see `docs/specs/procgen-first/overview.md` |

## Cross-links

→ `docs/specs/styles/2-5d.md` (HD-2D submode)
→ `docs/specs/styles/mixed.md` (combine layers)
→ `docs/specs/styles/pbr.md` (3D environment)
→ `docs/specs/genres/rpg.md`
→ `docs/architecture/08-compose-dont-build.md` (Octopath took 4 yr; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe 2-5d-hd-2d-quickstart
```
