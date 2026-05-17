<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Destruction Quick-Start

> Day 1: Red Faction Guerrilla-style. Blow up a building, debris flies, save survives the destruction.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| GPU with compute (Vulkan/Metal/D3D12) | required |
| V-HACD asset import enabled (default) | required |

## Scaffold

```
nexus new mygame --template destruction
cd mygame
nexus assets fracture assets/buildings/warehouse.glb --cells 24
nexus run
```

Day 1 result: small map with a warehouse. Shoot rockets; chunks separate, fall, settle. Save → reload → wall stays destroyed.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "networking", "scripting"]

[style]
preset = "pbr"

[genres]
primary = "fps"

[destruction]
enabled                = true
chunk_cap              = 5000
debris_lifetime_s      = 30.0
persistent             = true
net_sync               = "events"

[destruction.fracture]
default_cells          = 24
stress_map_bias        = 0.4
seed                   = 0xDEADBEEF

[crates]
nexus-destruction-voronoi      = "1.0"
nexus-destruction-persistent   = "1.0"
nexus-destruction-events       = "1.0"
nexus-physics-rigid            = "1.0"
nexus-physics-soft             = "1.0"
nexus-assets-import            = "1.0"   # V-HACD
nexus-particles-heavy          = "1.0"   # dust clouds
nexus-genre-fps                = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-destruction-voronoi` | Voronoi cell pre-fracture pipeline |
| `nexus-destruction-persistent` | save/load destruction state |
| `nexus-destruction-events` | destruction event stream + network codec |
| `nexus-physics/rigid` | chunks become rigid bodies |
| `nexus-physics/soft` | optional bend / crumple |
| `nexus-assets/import` | V-HACD convex decomposition at import time |
| `nexus-renderer/particles-heavy` | dust + debris cloud |
| `nexus-genres/fps` | gameplay (weapons, damage) |

→ Full spec: `docs/specs/destruction-first/overview.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs
  scripts/
    weapons/
      rocket.lua           # damage application
    persistence/
      destruction-save.lua # save/load hook
  assets/
    buildings/
      warehouse.glb        # source mesh
      warehouse.destruct   # baked by `nexus assets fracture`
    weapons/
      rocket.glb
  scenarios/
    destruction-explosion-on-wall.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_destruction_voronoi::DestructionPlugin;
use nexus_genre_fps::FpsPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(DestructionPlugin::default())
        .add_plugin(FpsPlugin)
        .add_startup_system(spawn_warehouse)
        .run();
}

fn spawn_warehouse(mut cmd: Commands, assets: Res<AssetServer>) {
    cmd.spawn((
        Destructible::load(&assets, "buildings/warehouse.destruct"),
        Transform::from_xyz(0.0, 0.0, 10.0),
    ));
}
```

```lua
-- scripts/weapons/rocket.lua
function on_rocket_impact(pos)
  physics.apply_damage_radius(pos, radius = 3.0, magnitude = 500)
end
```

## Bake fracture (asset import)

```bash
nexus assets fracture assets/buildings/warehouse.glb \
    --cells 24 \
    --stress-bias 0.4 \
    --seed 0xDEADBEEF \
    --output assets/buildings/warehouse.destruct
```

`.destruct` file holds chunk meshes, convex hulls, mass, material IDs. Cached.

## Starter scenario test

`scenarios/destruction-explosion-on-wall.scenario.toml`:

```toml
[scene]
template = "destruction-test-room"
[actions]
- { tick = 1,   action = "spawn", asset = "wall_brick.destruct", at = [0, 0, 0] }
- { tick = 30,  action = "apply_damage", entity = "wall", point = [0, 1, 0], magnitude = 500 }
[asserts]
- { tick = 60,  predicate = "destruction_events_count > 5" }
- { tick = 60,  predicate = "free_chunks > 5 && free_chunks < 30" }
- { tick = 600, predicate = "free_chunks == 0" }
- { tick = 60,  predicate = "frame_budget_ms < 16.6" }
```

## Next steps

| You want | Add |
|---|---|
| Voxel destruction (Teardown-style) | switch to `docs/guides/recipes/voxel-game-quickstart.md` — voxel destruction is simpler |
| Crater terrain on explosion | `nexus add nexus-deformable-heightmap`; rocket impacts auto-dig craters |
| Networked persistent destruction | already added — `destruction.net_sync = "events"` + `persistent = true` |
| Bent-metal soft-debris | tag chunks with `soft = true` in `.destruct`; uses `nexus-physics/soft` |
| Camera shake on big breaks | `nexus add nexus-genre-toolkit-cameraeffects` |

## Cross-links

→ `docs/specs/destruction-first/overview.md`
→ `docs/specs/physics/soft.md`
→ `docs/specs/voxel/overview.md` (alternative path for voxel destruction)
→ `docs/specs/deformable-terrain/overview.md` (craters)
→ `docs/architecture/08-compose-dont-build.md` (Volition's GeoMod took years; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe destruction-quickstart
```
