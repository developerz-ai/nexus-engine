<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Seamless MMORPG Quick-Start

> Day 1: walk across a zone border without a loading screen.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| 16 GB RAM | recommended |
| Linux server box OR cloud VM (for the shard process) | required for MP |
| Rust 1.74+ | `rustc --version` |

## Scaffold

```
nexus new mygame --template seamless-mmorpg
cd mygame
nexus run --server-shards 2 --client-attach
```

Day 1 result: 2×2 = 4 chunks across 2 shards. Player spawns on shard 1; walks east into shard 2; handoff completes silently in < 200 ms.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "networking", "scripting"]

[style]
preset = "pbr"

[genres]
primary = "mmorpg"

[seamless]
chunk_size_m              = 256
view_radius_chunks        = 4
predict_lookahead_s       = 2.0
shard_size_chunks         = [8, 8]
handoff_protocol          = "quic-migrate"
handoff_latency_ms_target = 200

[seamless.shard]
balance_strategy = "player-count"
target_players   = 200
soft_cap         = 250
hard_cap         = 300

[networking]
model     = "client-server"
transport = "quic"

[crates]
nexus-seamless-zone-handoff       = "1.0"
nexus-seamless-predictive-stream  = "1.0"
nexus-seamless-shard-partition    = "1.0"
nexus-genre-mmorpg                = "1.0"
nexus-net-quic                    = "1.0"
nexus-net-lobby                   = "1.0"
nexus-assets-streaming            = "1.0"
nexus-weather-time-of-day         = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-seamless-zone-handoff` | cross-shard player migration protocol |
| `nexus-seamless-predictive-stream` | camera-velocity chunk preloading |
| `nexus-seamless-shard-partition` | per-zone shard assignment + balance |
| `nexus-genres/mmorpg` | MMORPG gameplay layer (party, quest, chat) |
| `nexus-net/lobby` | zone-handoff signaling |
| `nexus-net/replication` | per-chunk replication scope |
| `nexus-assets/streaming` | chunk asset LRU |
| `nexus-weather-time-of-day` | global weather replicated by seed+time |

→ Full spec: `docs/specs/seamless-world/overview.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/
    main.rs                # client + server share binary; `--server` flag selects
  scripts/
    systems/
      quest.lua
      chat.lua
  data/
    world/
      shard-1.toml         # per-shard config
      shard-2.toml
  scenarios/
    seamless-cross-shard-walk.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_seamless_zone_handoff::SeamlessPlugin;
use nexus_genre_mmorpg::MmorpgPlugin;

fn main() {
    let mode = std::env::args().any(|a| a == "--server")
        .then_some(AppMode::Server)
        .unwrap_or(AppMode::Client);

    App::with_mode(mode)
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(SeamlessPlugin::default())
        .add_plugin(MmorpgPlugin)
        .run();
}
```

```bash
# spin up 2 shards + 1 client
nexus run --server-shards 2 --client-attach
# OR
./target/release/mygame --server --shard 1 &
./target/release/mygame --server --shard 2 &
./target/release/mygame --client localhost:7777
```

## Starter scenario test

`scenarios/seamless-cross-shard-walk.scenario.toml`:

```toml
[scene]
template = "seamless-2x2-shards"
[actions]
- { tick = 1,   action = "spawn_player", id = "p1", at = [-100, 0, 0], shard = 1 }
- { tick = 10,  action = "walk", player = "p1", to = [500, 0, 0] }
[asserts]
- { tick = 600, predicate = "player_shard(p1) == 2" }
- { tick = 600, predicate = "handoff_latency_ms(p1).max < 800" }
- { tick = 600, predicate = "rubber_band_distance_m(p1).max < 0.5" }
- { tick = 600, predicate = "chunk_cache_hit_pct > 95" }
```

## Next steps

| You want | Add |
|---|---|
| Voxel world (Hytale-like) | `nexus add nexus-voxel-core nexus-voxel-greedy-mesh`; per-shard voxel terrain |
| Full procgen world (NoMan's Sky-like) | `nexus add nexus-procgen-wfc`; per-chunk gen on demand |
| Heavy weather propagation | already added; see `docs/specs/weather-as-system/overview.md` |
| Chat / party / guild | already in `nexus-genres/mmorpg` |
| Auction house | `nexus add nexus-genre-toolkit-economy` (community crate) |
| Anti-cheat | `nexus add nexus-net-anticheat` (community / commercial integration) |
| Cross-region shards | configure `[seamless]` per region; handoff supports cross-region with higher latency budget |

## Cross-links

→ `docs/specs/seamless-world/overview.md`
→ `docs/specs/genres/mmorpg.md`
→ `docs/specs/assets/streaming.md`
→ `docs/specs/networking/lobby.md`
→ `docs/architecture/08-compose-dont-build.md` (WoW + FFXIV needed years of bespoke streaming; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe seamless-mmorpg-quickstart
```
