<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Voxel Game Quick-Start

> Day 1: dig and place blocks. No engine code written.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| Rust 1.74+ | `rustc --version` |
| 16 GB RAM | recommended for view-radius 12 |
| GPU with compute (Vulkan / Metal / D3D12) | required |

## Scaffold

```
nexus new mygame --template voxel
cd mygame
nexus run
```

Day 1 result: empty flat voxel world. Walk, dig, place blocks. WASD + mouse. Left-click breaks, right-click places.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "scripting"]

[style]
preset = "pbr"

[genres]
primary = "openworld"        # any genre works; openworld is a sensible default

[voxel]
chunk_size      = 16
view_radius     = 12
mesher          = "greedy"
remesh_backend  = "gpu-compute"

[crates]
nexus-voxel-core            = "1.0"
nexus-voxel-greedy-mesh     = "1.0"
nexus-voxel-light-propagate = "1.0"
nexus-procgen-seeded-rng    = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | What it gives you |
|---|---|
| `nexus-voxel-core` | `Chunk`, palette, save format |
| `nexus-voxel-greedy-mesh` | mesher (GPU compute) |
| `nexus-voxel-light-propagate` | skylight + block light |
| `nexus-physics/collision` | voxel collider per loaded chunk |
| `nexus-net/replication` | per-edit delta sync (MP-ready) |
| `nexus-procgen-seeded-rng` | deterministic world generation |

→ Full spec: `docs/specs/voxel/overview.md`. Modularity: `docs/architecture/06-modularity.md`. Why-compose: `docs/architecture/08-compose-dont-build.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/
    main.rs                # 30 lines: app bootstrap + voxel plugin registration
  scripts/
    systems/
      block-physics.lua    # break/place handlers
    data/
      blocks.toml          # stone, dirt, grass, water definitions
  scenarios/
    voxel-place-and-dig.scenario.toml
  assets/
    blocks/                # block textures (placeholder set bundled)
```

## Opening scene

```rust
// src/main.rs (auto-generated)
use nexus_engine::prelude::*;
use nexus_voxel_core::VoxelPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(VoxelPlugin::default())
        .add_startup_system(spawn_player)
        .run();
}

fn spawn_player(mut cmd: Commands) {
    cmd.spawn((
        Player,
        Transform::from_xyz(0.0, 65.0, 0.0),
        VoxelCamera::first_person(),
    ));
}
```

Most logic is in scripts:

```lua
-- scripts/systems/block-physics.lua
function on_left_click(player)
  local hit = voxel.raycast(player.eye, player.forward, 5)
  if hit then voxel.set(hit.pos, "air") end
end

function on_right_click(player)
  local hit = voxel.raycast(player.eye, player.forward, 5)
  if hit then voxel.set(hit.adjacent, "stone") end
end
```

## Starter scenario test

`scenarios/voxel-place-and-dig.scenario.toml`:

```toml
[scene]
template = "voxel-empty-flat"
[actions]
- { tick = 10, action = "voxel_set", pos = [0, 65, 0], id = "stone" }
- { tick = 20, action = "voxel_set", pos = [0, 65, 0], id = "air" }
[asserts]
- { tick = 30, predicate = "voxel_at(0, 65, 0) == air" }
- { tick = 30, predicate = "frame_budget_ms < 16.6" }
```

Run:

```
nexus test scenarios/voxel-place-and-dig.scenario.toml
```

## Next steps

| You want | Add |
|---|---|
| Networked multiplayer | `nexus add nexus-net-quic` then set `[engine] features += ["networking"]` |
| Procedural terrain (not flat) | `nexus add nexus-procgen-wfc`; see `docs/specs/procgen-first/overview.md` |
| Destructible buildings beyond voxels | `nexus add nexus-destruction-voronoi`; see `docs/guides/recipes/destruction-quickstart.md` |
| Pretty water | `nexus add nexus-fluid-gameplay-coupling`; see `docs/specs/fluid-gameplay/overview.md` |
| Smooth-voxel (Vintage Story look) | switch `mesher = "marching-cubes"`; needs `nexus-voxel-marching-cubes` |
| Day-night + weather | `nexus add nexus-weather-time-of-day nexus-weather-precipitation` |

## Cross-links

→ `docs/specs/voxel/overview.md`
→ `docs/architecture/06-modularity.md` (why this is composable)
→ `docs/architecture/08-compose-dont-build.md` (why-not-build)
→ `docs/specs/genres/openworld.md` (default genre)
→ `docs/guides/recipes/seamless-mmorpg-quickstart.md` (scale this to MMO)

## AI-agent path

```
nexus coder bootstrap-from-recipe voxel-game-quickstart
```

`nexus-coder` reads this file, scaffolds the project, runs the scenario test, and reports green/red.
