<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Massive RTS Quick-Start

> Day 1: 10,000 units on screen. Click-drag select, attack-move.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| GPU with indirect MultiDraw (Vulkan/Metal/D3D12) | required |
| 16 GB RAM (for 50k-unit stretch) | recommended |

## Scaffold

```
nexus new mygame --template massive-rts
cd mygame
nexus run
```

Day 1 result: flat 2km × 2km map. Spawn 5,000 red units left, 5,000 blue right. Click and drag to select. Right-click to attack-move. Both armies clash in the middle.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "networking", "scripting"]

[style]
preset = "pbr"

[genres]
primary = "rts"

[massive_rts]
max_units             = 50_000
tick_rate_hz          = 30
flowfield_grid        = 1024
unit_batch_size       = 64
projectile_backend    = "particles-heavy"

[networking]
model = "lockstep"
transport = "quic"

[crates]
nexus-massive-rts-flowfield        = "1.0"
nexus-massive-rts-instanced-render = "1.0"
nexus-massive-rts-gpu-ai           = "1.0"
nexus-massive-rts-interest         = "1.0"
nexus-genre-rts                    = "1.0"
nexus-particles-heavy              = "1.0"
nexus-net-quic                     = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-massive-rts-flowfield` | flow-field path cache |
| `nexus-massive-rts-instanced-render` | indirect-draw unit renderer + LOD |
| `nexus-massive-rts-gpu-ai` | per-unit decision compute kernel |
| `nexus-massive-rts-interest` | spatial-hashed interest management for net |
| `nexus-genres/rts` | baseline gameplay (selection, build orders, fog) |
| `nexus-renderer/particles-heavy` | projectiles, explosions |
| `nexus-net/replication` (lockstep) | deterministic MP turn lockstep |

→ Full spec: `docs/specs/massive-rts/overview.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs
  scripts/
    units/
      soldier.lua          # basic combat
      archer.lua
    ai/
      attack-move.lua      # per-unit target acquisition
  data/
    units/
      soldier.toml
      archer.toml
  assets/
    units/
      soldier/             # mesh + LODs + impostor atlas
  scenarios/
    massive-rts-50k-battle.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_massive_rts_flowfield::FlowfieldPlugin;
use nexus_massive_rts_instanced_render::InstancedRenderPlugin;
use nexus_genre_rts::RtsPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(RtsPlugin)
        .add_plugin(FlowfieldPlugin::new(1024))
        .add_plugin(InstancedRenderPlugin)
        .add_startup_system(setup_battle)
        .run();
}

fn setup_battle(mut world: ResMut<MassiveWorld>) {
    world.spawn_units(archetype("soldier"), 5000, Vec2::new(-500.0, 0.0));
    world.spawn_units(archetype("soldier"), 5000, Vec2::new( 500.0, 0.0));
}
```

```lua
-- scripts/ai/attack-move.lua
function on_unit_idle(unit)
  local target = nearest_enemy(unit, 80.0)
  if target then
    unit:attack(target)
  else
    unit:continue_move()
  end
end
```

## Starter scenario test

`scenarios/massive-rts-50k-battle.scenario.toml`:

```toml
[scene]
template = "rts-flat-map-2048"
[actions]
- { tick = 1,    action = "spawn", archetype = "soldier", count = 25000, at = [-500, 0] }
- { tick = 1,    action = "spawn", archetype = "soldier", count = 25000, at = [ 500, 0] }
- { tick = 10,   action = "command_attack_move", side = "red",  to = [ 500, 0] }
- { tick = 10,   action = "command_attack_move", side = "blue", to = [-500, 0] }
[asserts]
- { tick = 1800, predicate = "tick_ms_p99 < 16.6" }
- { tick = 1800, predicate = "render_ms_p99 < 8.0" }
- { tick = 1800, predicate = "net_bandwidth_per_client_kbps < 30" }
```

## Next steps

| You want | Add |
|---|---|
| Supreme Commander zoom (planet-scale view) | implement `StrategicCamera` — uses `nexus-massive-rts-instanced-render` LOD bands |
| Fog of war | already in `nexus-genres/rts`; configure per-faction visibility radius |
| Resource economy | already in `nexus-genres/rts`; data-driven via TOML |
| Single-player AI opponent | `nexus add nexus-agent-sdk`; write opponent as a long-running agent |
| Replay system | already in `nexus-sim-replay`; record lockstep input log |
| Custom units (modding) | drop new TOML in `data/units/`; hot-reloads via `nexus-scripting-hotreload-heavy` |

## Cross-links

→ `docs/specs/massive-rts/overview.md`
→ `docs/specs/genres/rts.md`
→ `docs/specs/renderer/particles-heavy.md`
→ `docs/specs/sim-game/overview.md` (lockstep MP)
→ `docs/architecture/08-compose-dont-build.md` (Supreme Commander needed a custom engine; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe massive-rts-quickstart
```
