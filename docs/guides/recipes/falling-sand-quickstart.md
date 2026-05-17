<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Falling-Sand Quick-Start

> Day 1: Noita-style per-pixel CA. Water flows, lava melts, fire spreads.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| GPU with compute (Vulkan / Metal / D3D12) | required |
| Rust 1.74+ | `rustc --version` |

## Scaffold

```
nexus new mygame --template falling-sand
cd mygame
nexus run
```

Day 1 result: 1024×1024 sandbox. Click to add water, hold shift for lava, hold ctrl for sand. Watch interactions.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "scripting"]

[style]
preset = "pixel"
[style.pixel]
internal_res = [1024, 768]
upscale      = "integer"

[cellular]
grid_width   = 1024
grid_height  = 1024
elements_pack = "noita-elements"
seed         = 0xCAFE

[crates]
nexus-cellular-falling-sand    = "1.0"
nexus-cellular-noita-elements  = "1.0"
nexus-cellular-interactions    = "1.0"
nexus-cellular-replay          = "1.0"
nexus-particles-heavy          = "1.0"    # for sparkle / smoke visual
nexus-procgen-seeded-rng       = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-cellular-falling-sand` | core GPU CA grid + step scheduler |
| `nexus-cellular-noita-elements` | water, lava, oil, gas, sand, stone, fire, blood, acid, electricity |
| `nexus-cellular-interactions` | declarative interaction TOML |
| `nexus-cellular-replay` | snapshot + replay |
| `nexus-renderer/particles-heavy` | visual sparkle / smoke layer |
| `nexus-physics/determinism` | replay framework |

→ Full spec: `docs/specs/cellular-automata/overview.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/
    main.rs                  # ~30 LOC bootstrap
  scripts/
    elements/
      custom.lua             # add your own elements
    interactions/
      custom.toml            # add your own reactions
  data/
    elements/                # noita pack bundled
    interactions/
  scenarios/
    falling-sand-water-lava.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_cellular_falling_sand::CellularPlugin;
use nexus_cellular_noita_elements::NoitaElementsPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(CellularPlugin::default())
        .add_plugin(NoitaElementsPlugin)
        .add_startup_system(setup_sandbox)
        .run();
}

fn setup_sandbox(mut world: ResMut<CellularWorld>) {
    // Floor
    for x in 0..1024 { world.set(x, 0, element("stone")); }
    // Ceiling reservoir of water
    for x in 200..600 { for y in 700..720 { world.set(x, y, element("water")); } }
}
```

## Starter scenario test

`scenarios/falling-sand-water-lava.scenario.toml`:

```toml
[scene]
template = "cellular-empty-1024"
[actions]
- { tick = 1,  action = "cell_set", region = "y=200, x=400..600", element = "water" }
- { tick = 1,  action = "cell_set", region = "y=300, x=500",      element = "lava" }
[asserts]
- { tick = 60, predicate = "cell_count(stone) > 50" }       # water+lava→stone reaction
- { tick = 60, predicate = "frame_budget_ms < 16.6" }
- { tick = 60, predicate = "deterministic_hash() == expected_hash" }
```

## Add your own element

```toml
# data/elements/custom.toml
[[element]]
id        = "honey"
density   = 1.4
flow_rate = 1
state     = "liquid"
color     = "#FFC107"
```

```toml
# data/interactions/custom.toml
[[interaction]]
a        = "honey"
b        = "fire"
produces = [["smoke", 1.0]]
event    = "burn"
```

Save → hot-reload picks it up. New element available immediately.

## Next steps

| You want | Add |
|---|---|
| Rigid bodies in the CA world (Noita boxes) | `nexus add nexus-physics-rigid` and tag chunks of high-density elements |
| Sparkle/smoke effects | already added — see `nexus-particles-heavy` integration in `docs/specs/renderer/particles-heavy.md` |
| Procgen cave system | `nexus add nexus-procgen-wfc`; see `docs/guides/recipes/voxel-game-quickstart.md` for cave-gen reference |
| Networked sandbox | `nexus add nexus-net-quic`; CA replication is per-edit delta + periodic snapshot |
| Replay | `nexus cellular replay --record my-session.bin` then `nexus cellular replay --play my-session.bin` |

## Cross-links

→ `docs/specs/cellular-automata/overview.md`
→ `docs/specs/renderer/particles-heavy.md`
→ `docs/specs/physics/determinism.md`
→ `docs/architecture/08-compose-dont-build.md` (Noita took 4 yr; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe falling-sand-quickstart
```
