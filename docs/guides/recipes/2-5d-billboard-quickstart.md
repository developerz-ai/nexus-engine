<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# 2.5D Billboard Quick-Start

> Day 1: Doom-style first-person OR Hotline Miami top-down. Sprites in a 3D world.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| GPU (any modern; Vulkan/Metal/D3D12) | required |
| Sprite assets (enemy 8-direction sheets) | placeholder set bundled |

## Scaffold

Pick a flavor:

```
nexus new mygame --template billboard-fps        # Doom 1993-style
# OR
nexus new mygame --template billboard-topdown    # Hotline Miami-style
cd mygame
nexus run
```

Day 1 result: a small 3D room with enemy sprites that always face you. Shoot or punch. Pixelation post-pass for retro look.

## Resulting `Nexus.toml` (FPS flavor)

```toml
[engine]
features = ["renderer", "physics", "audio", "scripting"]

[style]
preset = "2-5d"

[style.2-5d]
submode = "billboard-3d"

[style.2-5d.billboard]
mode             = "full"          # full billboard (Doom-style)
alpha_test       = 0.5
sprite_lighting  = "deferred"
shadows          = "capsule"
pixelation       = { enabled = true, internal_res = [640, 360] }

[genres]
primary = "fps"

[crates]
nexus-style-2-5d-billboard   = "1.0"
nexus-style-pixel            = "1.0"   # for pixelation chain
nexus-genre-fps              = "1.0"
nexus-particles-heavy        = "1.0"   # blood/gore + muzzle flashes

[scripting]
script_dirs = ["scripts/"]
```

For top-down (Hotline Miami):

```toml
[style.2-5d.billboard]
mode = "y-only"        # sprite rotates only on world-up

[genres]
primary = "openworld"  # OR a custom top-down config
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-style-2-5d-billboard` | sprite-quad-in-3D, billboarding, alpha-test, sprite-deferred-lighting |
| `nexus-style-pixel` | optional pixelation post-pass for retro look |
| `nexus-genres/fps` (or top-down equivalent) | gameplay scaffolding |
| `nexus-renderer/particles-heavy` | blood, muzzle flashes, explosions |
| `nexus-physics/character` | character controller |

→ Full spec: `docs/specs/styles/2-5d.md` (submode: `billboard-3d`).

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs
  scripts/
    enemies/
      grunt.lua            # 8-direction sprite rotation logic
    weapons/
      pistol.lua
  assets/
    sprites/
      grunt/
        0deg.png
        45deg.png
        ...                # 8 angles
      pistol/
        flash.png
    rooms/
      starter.glb
  scenarios/
    billboard-shoot-enemy.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_style_2_5d_billboard::BillboardPlugin;
use nexus_genre_fps::FpsPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(BillboardPlugin::full())
        .add_plugin(FpsPlugin)
        .add_startup_system(spawn_room)
        .run();
}

fn spawn_room(mut cmd: Commands, assets: Res<AssetServer>) {
    cmd.spawn((
        SceneRoot::load(&assets, "rooms/starter.glb"),
    ));
    cmd.spawn((
        Enemy("grunt"),
        Transform::from_xyz(5.0, 0.0, 5.0),
        SpriteSheet::eight_angles(&assets, "sprites/grunt/"),
        Billboard { mode: BillboardMode::Full },
        CapsuleCollider::new(0.4, 1.8),
    ));
}
```

## Starter scenario test

`scenarios/billboard-shoot-enemy.scenario.toml`:

```toml
[scene]
template = "billboard-starter-room"
[actions]
- { tick = 1,   action = "spawn", archetype = "player", at = [0, 1.6, 0] }
- { tick = 1,   action = "spawn", archetype = "grunt",  at = [0, 0, 5] }
- { tick = 30,  action = "fire_weapon", entity = "player", dir = [0, 0, 1] }
[asserts]
- { tick = 35,  predicate = "enemy_hp('grunt') < 100" }
- { tick = 35,  predicate = "sprite_billboarded('grunt') == true" }
- { tick = 35,  predicate = "particles_heavy_count > 0" }     # muzzle flash spawned
- { tick = 60,  predicate = "frame_budget_ms < 16.6" }
```

## Next steps

| You want | Add |
|---|---|
| Y-billboard for top-down (Hotline Miami) | set `[style.2-5d.billboard] mode = "y-only"` |
| BSP-style level format | `nexus add nexus-asset-source-bsp` (planned community crate) |
| Heavy gore | already added — see `nexus-particles-heavy` |
| Procedural levels (Spelunky/roguelike rooms) | `nexus add nexus-procgen-wfc nexus-procgen-grammar` |
| Multiplayer deathmatch | `nexus add nexus-net-rollback`; see `docs/specs/networking/rollback.md` |
| Realistic 3D enemies later | swap out billboard for full 3D — only changes asset import |

## Cross-links

→ `docs/specs/styles/2-5d.md` (billboard-3d submode)
→ `docs/specs/styles/pixel.md` (pixelation chain)
→ `docs/specs/genres/fps.md`
→ `docs/architecture/08-compose-dont-build.md` (Doom's renderer took Carmack months; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe 2-5d-billboard-quickstart
```
