<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Seamless World — Overview

> MMORPG-grade open world. Spatial-hashed chunk grid, predictive streaming, instance partition (per-zone shards), seamless borders (cross-server handoff). WoW, FFXIV, Guild Wars 2 territory — without writing the streaming + handoff layer from scratch.

## Boundaries

- Owns: spatial-hash chunk grid (XZ), predictive streaming policy (camera + velocity), per-zone shard partition, cross-zone handoff protocol, server-side player-state migration, client-side prediction continuity across handoff.
- Does NOT own: low-level asset I/O (→ `docs/specs/assets/streaming.md`), low-level networking transport (→ `docs/specs/networking/transport.md`), zone-specific gameplay (→ `docs/specs/genres/mmorpg.md`), terrain rendering (→ `docs/specs/renderer/terrain.md`).
- Depends on: `nexus-assets/streaming`, `nexus-net/lobby` (zone-handoff signaling), `nexus-net/replication`, `nexus-genres/mmorpg`, `nexus-core/ecs`.

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-assets/streaming` | underlying chunk asset LRU |
| `nexus-net/lobby` | zone-handoff signaling channel |
| `nexus-net/replication` | per-chunk replication scope |
| `nexus-genres/mmorpg` | MMORPG gameplay layer |
| `nexus-core/ecs` | per-chunk entity scope |
| `nexus-agent/telemetry` | handoff latency, chunk cache hit rate |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-seamless-zone-handoff` | `seamless` (new) | cross-server player migration protocol |
| `nexus-seamless-predictive-stream` | `seamless` | camera-velocity-aware chunk preloading |
| `nexus-seamless-shard-partition` | `seamless` | per-zone shard assignment + balance |

## Architecture

```
Seamless world topology

         Game world: spatial-hashed chunks (e.g., 256m × 256m XZ)
         ┌─────────┬─────────┬─────────┬─────────┬─────────┐
         │ Chunk A │ Chunk B │ Chunk C │ Chunk D │ Chunk E │
         │ shard 1 │ shard 1 │ shard 1 │ shard 2 │ shard 2 │
         ├─────────┼─────────┼─────────┼─────────┼─────────┤
         │ Chunk F │ Chunk G │ Chunk H │ Chunk I │ Chunk J │
         │ shard 1 │ shard 1 │ shard 1 │ shard 2 │ shard 2 │
         └─────────┴─────────┴─────────┴─────────┴─────────┘
                              │
                shard boundary (handoff zone)
                              │
                              ▼
         Cross-shard handoff (player walks E→ across border)
              ┌─────────────────────────────────────┐
              │ 1. Client predicts continued motion  │
              │ 2. Source shard sends player state   │
              │ 3. Dest shard accepts + acks         │
              │ 4. Client gets handoff token         │
              │ 5. Client reconnects to dest (TCP)   │
              │     OR keeps QUIC stream open and    │
              │     migrates session                 │
              │ 6. Dest replicates surroundings      │
              │ 7. Source releases player            │
              └─────────────────────────────────────┘
         Target latency end-to-end: < 200 ms
```

## Predictive streaming

```
For each frame:
  predicted_position = camera.pos + camera.velocity * lookahead_seconds
  required_chunks    = chunks_around(predicted_position, view_radius + predict_margin)
  loaded_chunks      = streaming.loaded()
  to_load            = required_chunks - loaded_chunks
  to_unload          = loaded_chunks - required_chunks - hysteresis

  for each chunk in to_load (priority = distance to predicted_position):
    streaming.request(chunk, priority)
  for each chunk in to_unload:
    streaming.release_after(chunk, dwell_seconds = 5)
```

Lookahead default: `2 s` for foot, `8 s` for vehicle/mount.

## Public API

```toml
[seamless]
chunk_size_m         = 256           # XZ side length, world units
view_radius_chunks   = 4             # 1024 m view at 256 m chunks
predict_lookahead_s  = 2.0
hysteresis_dwell_s   = 5.0
shard_size_chunks    = [8, 8]        # 8×8 = 64 chunks per shard
handoff_protocol     = "quic-migrate" # "quic-migrate" | "reconnect"
handoff_latency_ms_target = 200

[seamless.shard]
balance_strategy     = "player-count" # "player-count" | "load" | "fixed"
target_players       = 200
soft_cap             = 250
hard_cap             = 300
```

```rust
pub struct ChunkCoord(pub i32, pub i32);
pub struct ShardId(pub u32);

pub struct SeamlessWorld { /* registry, shard map */ }

impl SeamlessWorld {
    pub fn shard_for(&self, pos: Vec3) -> ShardId;
    pub fn loaded_chunks(&self) -> &[ChunkCoord];
    pub fn request_handoff(&mut self, player: PlayerId, to: ShardId) -> HandoffFuture;
    pub fn telemetry(&self) -> SeamlessTelemetry;
}

pub struct SeamlessTelemetry {
    pub loaded_chunks: u32,
    pub cache_hit_pct: f32,
    pub stream_in_ms_p99: f32,
    pub handoff_latency_ms_p99: f32,
    pub players_per_shard: HashMap<ShardId, u32>,
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Chunk stream-in p99 | < 500 ms | 2000 ms |
| Chunk cache hit rate | > 95% | > 80% |
| Predictive streaming lookahead accuracy | > 90% (preloaded before needed) | > 70% |
| Cross-shard handoff p99 | < 200 ms | 800 ms |
| Player perceived continuity (no rubber-band on handoff) | yes | yes |
| Shard player capacity (default config) | 200 active | 300 |
| Memory per loaded chunk | < 8 MB | 32 MB |

`[BENCHMARK NEEDED]` — handoff latency on cross-region datacenter (e.g., US-EU).

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SEAM_E_HANDOFF_REFUSED` | Dest shard full or unreachable | Re-route to overflow shard or fall back to instanced copy |
| `SEAM_E_CHUNK_LOAD_TIMEOUT` | Chunk stream-in > hard limit | Block player at chunk border, show loading UI |
| `SEAM_E_SHARD_OVERLOAD` | Player count > hard cap | Trigger emergency rebalance |
| `SEAM_E_PREDICT_DRIFT` | Predicted position diverges > 50 m from actual | Drop predict; force reactive streaming |
| `SEAM_W_HANDOFF_SLOW` | Handoff > target but < limit | Telemetry warning; no action required |

## Integration Points

- **Assets/streaming**: chunk-keyed LRU. → `docs/specs/assets/streaming.md`.
- **Net/lobby**: zone-handoff signaling rides on lobby protocol. → `docs/specs/networking/lobby.md`.
- **Net/replication**: per-chunk replication scope; player only sees entities in nearby chunks. → `docs/specs/networking/replication.md`.
- **MMORPG genre**: this spec is the spatial substrate for `docs/specs/genres/mmorpg.md`.
- **Procgen**: chunk-procgen hook for fully procedural worlds (NoMan's Sky model). → `docs/specs/procgen-first/overview.md`.
- **Voxel**: voxel worlds are seamlessly streamable using the same primitives. → `docs/specs/voxel/overview.md`.
- **Weather as system**: weather propagates across shards via shared global wind field. → `docs/specs/weather-as-system/overview.md`.

## Scenario test (starter)

`scenarios/seamless-cross-shard-walk.scenario.toml`:

```toml
[scene]
template = "seamless-2x2-shards"
[actions]
- { tick = 1,    action = "spawn_player", id = "p1", at = [-100, 0, 0], shard = 1 }
- { tick = 10,   action = "walk", player = "p1", to = [500, 0, 0] }   # crosses shard 1→2
[asserts]
- { tick = 600,  predicate = "player_shard(p1) == 2" }
- { tick = 600,  predicate = "handoff_latency_ms(p1).max < 800" }
- { tick = 600,  predicate = "rubber_band_distance_m(p1).max < 0.5" }
```

## Test Requirements

- Walk player across shard border → handoff completes < 200 ms, no visible teleport.
- Mount at high speed → predictive streaming preloads chunks; stream-in cache hit > 95%.
- Saturate shard with 200 players, add 100 more → rebalance kicks in, no shard exceeds hard cap.
- Cross-region handoff (artificial 100 ms RTT) → still < 800 ms.
- Memory: 64-chunk view radius stays under 512 MB on client.

## Prior Art

- World of Warcraft — seamless continents within a server; cross-server "Sharding" added later. [VERIFY — Blizzard tech blog URL].
- Final Fantasy XIV — zone-handoff with brief loading; later iterations seamless. [VERIFY — FFXIV CEDEC talks].
- Guild Wars 2 — megaserver dynamic sharding. [VERIFY — ArenaNet blog URL].
- EVE Online — single-shard galaxy with time-dilation. [VERIFY — CCP TechCon talks].
- Star Citizen — server meshing R&D. [VERIFY — CIG Server Meshing Q&A URL].
- Linden Lab Second Life — region-grid handoff (the original seamless world tech). [VERIFY — SL technical docs URL].
- *Inspired by*: NoMan's Sky GDC 2017 "Continuous World Generation" talk.

## Open Questions

- `[DECISION NEEDED]` Handoff protocol: QUIC connection migration (clean, requires QUIC backend) vs explicit reconnect (works everywhere, adds latency).
- `[DECISION NEEDED]` Default shard partition granularity — fixed grid (simpler) vs dynamic AABB (denser load balance).
- `[BENCHMARK NEEDED]` Per-shard player cap on cloud baseline (8-vCPU node).
- `[DECISION NEEDED]` Server meshing (Star Citizen model): handle in v1, or defer until shard model proven?
- `[DECISION NEEDED]` Cross-shard combat / interaction (player A on shard 1 shoots player B on shard 2 across border) — supported or forbidden in v1?
