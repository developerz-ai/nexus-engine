<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Sim-Game Quick-Start

> Day 1: Factorio-style deterministic sim. Place a miner, place a belt, watch iron flow.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| 8 GB RAM | recommended |
| Headless server box (optional, for MP) | optional |

## Scaffold

```
nexus new mygame --template sim-factory
cd mygame
nexus run
```

Day 1 result: 200×200 grid. Place miner, belt, assembler. Iron ore flows through belts into the assembler, becomes iron plates. Tick runs at fixed 20 Hz; render at 144 Hz.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "networking", "scripting"]

[style]
preset = "2d"

[genres]
primary = "openworld"   # sim games don't fit standard genres; openworld is generic

[sim_game]
tick_rate_hz       = 20
interp_alpha_clamp = 1.5
headless_supported = true
record_inputs      = true
snapshot_every_ticks = 600

[sim_game.server]
listen_port      = 7777
max_clients      = 32
snapshot_send_hz = 10

[networking]
model     = "client-server"
transport = "quic"

[crates]
nexus-sim-tick-decoupled    = "1.0"
nexus-sim-headless-server   = "1.0"
nexus-sim-replay            = "1.0"
nexus-procgen-seeded-rng    = "1.0"
nexus-style-2d              = "1.0"
nexus-scripting-hotreload-heavy = "1.0"

[scripting]
language = "lua"
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-sim-tick-decoupled` | fixed-tick scheduler + interpolation-for-render |
| `nexus-sim-headless-server` | bootstrap with no GPU/audio/input |
| `nexus-sim-replay` | input-log codec + replay validator |
| `nexus-net/replication` | snapshot-then-delta server→client |
| `nexus-physics/determinism` | fixed-step deterministic physics |
| `nexus-scripting-hotreload-heavy` | recipe + machine logic hot-reload |
| `nexus-procgen-seeded-rng` | deterministic world generation |

→ Full spec: `docs/specs/sim-game/overview.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs
  scripts/
    machines/
      miner.lua            # tick logic: extract ore
      belt.lua             # tick logic: move items
      assembler.lua        # tick logic: combine ingredients
    recipes/
      iron-plate.toml      # 1 iron-ore → 1 iron-plate
  scenarios/
    sim-game-deterministic-replay.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_sim_tick_decoupled::SimGamePlugin;

fn main() {
    let headless = std::env::args().any(|a| a == "--headless");

    let mut app = App::new();
    app.add_plugin(SimGamePlugin::new(20));   // 20 Hz tick

    if !headless {
        app.add_plugins(NexusDefaultPlugins);
    } else {
        app.add_plugins(NexusHeadlessPlugins); // no renderer, no audio, no input
    }

    app.add_startup_system(setup_factory).run();
}

fn setup_factory(mut world: ResMut<SimWorld>) {
    world.place("iron-source", IVec2::new(-2, 0));
    world.place("belt",        IVec2::new(-1, 0));
    world.place("assembler",   IVec2::new( 0, 0));
}
```

```lua
-- scripts/machines/assembler.lua
function on_tick(machine)
  local input = machine.input_buffer
  if input:has("iron-ore", 1) then
    input:remove("iron-ore", 1)
    machine.output_buffer:add("iron-plate", 1)
  end
end
```

## Starter scenario test

`scenarios/sim-game-deterministic-replay.scenario.toml`:

```toml
[scene]
template = "sim-factory-basic"
[setup]
world_seed = 0x9E3779B97F4A7C15
[actions]
- { tick = 1,    action = "place", item = "assembler",   at = [0, 0] }
- { tick = 1,    action = "place", item = "iron-source", at = [-2, 0] }
- { tick = 1,    action = "place", item = "belt",        at = [-1, 0] }
- { tick = 100,  action = "record_snapshot" }
- { tick = 1200, action = "record_snapshot" }
[asserts]
- { tick = 1200, predicate = "produced_items('iron-plate') > 100" }
- { tick = 1200, predicate = "tick_ms_p99 < 50.0" }
- { tick = 1200, predicate = "replay_from_log_matches_snapshot()" }
```

Replay your session:

```
nexus sim replay logs/session-2026-05-17.bin --validate
```

## Next steps

| You want | Add |
|---|---|
| Multiplayer co-op (Factorio-like) | already added — start with `mygame --server` then clients connect |
| Pretty 2.5D look (Factorio's PR look) | switch to `[style] preset = "2-5d"` with `submode = "billboard-3d"` and Y-only billboards |
| Mod support | `nexus add nexus-mods nexus-scripting-shared-api`; see `docs/specs/scripting-first/overview.md` |
| Cellular-automata sim layer | `nexus add nexus-cellular-falling-sand`; integrate CA as part of tick |
| Procgen biomes | `nexus add nexus-procgen-wfc`; see `docs/specs/procgen-first/overview.md` |
| Headless server bench | `nexus sim bench --tps 20 --clients 32 --duration 300` |

## Cross-links

→ `docs/specs/sim-game/overview.md`
→ `docs/specs/physics/determinism.md`
→ `docs/specs/agent/replay.md`
→ `docs/specs/scripting-first/overview.md`
→ `docs/architecture/08-compose-dont-build.md` (Wube spent ~3yr on Factorio's engine; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe sim-game-quickstart
```
