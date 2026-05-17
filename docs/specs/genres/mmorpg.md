<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# MMORPG Genre Module

> Massively multiplayer world primitives: zone streaming, sharding, interest management at scale, instance servers, party/raid/guild membership, cross-shard messaging.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.mmorpg]
version = "0.1"
zone_size_m = 512
shard_strategy = "geo+hash"   # geographic + load hash
max_players_per_shard = 1000
```

Builds on `genres/rpg.md`. Stats, inventory, quests inherit from RPG module.

## Boundaries

- Owns: zone server topology, interest management (AOI), party/raid/guild data, instance creation, cross-shard RPC.
- Does NOT own: per-character stats/items (→ `docs/specs/genres/rpg.md`), low-level transport (→ `docs/specs/networking/transport.md`), persistence DB (game-side).
- Depends on: networking replication, RPG module, asset streaming, jobs.

## Architecture

```
                ┌────────────────┐
                │  Login/Gateway │  (auth, character select)
                └────────┬───────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
        ┌───────┐   ┌───────┐    ┌─────────┐
        │ World │   │ World │... │ Instance│   (dungeons, raids)
        │ Shard │◄─►│ Shard │◄──►│ Server  │
        └───┬───┘   └───────┘    └─────────┘
            │ zone grid (NxN)
            ▼
        ┌─────────────┐
        │ AOI Grid    │  cell = 64 m, interest = 3x3 cells
        └─────────────┘
```

## Public API

```rust
pub struct ZoneId(u32); pub struct ShardId(u32); pub struct InstanceId(u64);

pub struct Zone { id: ZoneId, bounds: Aabb, grid: AoiGrid, pop: u32 }
pub struct AoiGrid { cell_m: f32, cells: Vec<Cell> } // Cell holds entity ids

pub struct Party { id: PartyId, members: SmallVec<[PlayerId;8]>, leader: PlayerId }
pub struct Raid  { id: RaidId, groups: SmallVec<[Party;8]>, loot_rule: LootRule }
pub struct Guild { id: GuildId, members: Vec<GuildMember>, perms: PermMatrix }

// systems
fn aoi_update_system(...);            // recompute interest sets each tick
fn replication_diff_system(...);      // delta per subscriber
fn instance_lifecycle_system(...);    // spawn/teardown instance servers
fn cross_shard_router_system(...);

// events
pub enum MmoEvent {
    ZoneEntered{p,zone}, ZoneLeft{p,zone},
    InterestGained{p,e}, InterestLost{p,e},
    InstanceCreated(InstanceId), InstanceDestroyed(InstanceId),
    PartyJoined{p,party}, GuildChat{from,text},
}
```

## Zone Streaming

```
client at (x,y) → fetches zone metadata 3x3 around
                ↳ assets stream priority: own cell > adjacent > diagonal
                ↳ NPC spawn deferred until cell in interest
                ↳ static geometry pre-baked per cell, BC7 textures
```
Background prefetch on movement vector projection (1 cell ahead).

## Interest Management

| Tier | Range | Update rate | Detail |
|---|---|---|---|
| Self/party | always | 30 Hz | full state |
| Near (1 cell) | 0–64 m | 20 Hz | position + anim |
| Mid (adjacent) | 64–128 m | 10 Hz | position only |
| Far (visual range only) | 128–256 m | 2 Hz | id + crude pos |
| Beyond | — | events only | guild/chat |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Players per shard | 1,000 | 2,000 |
| Entities per zone (NPCs+players) | 10,000 | 20,000 |
| AOI recompute per tick | <2 ms | 5 ms |
| Zone handoff latency | <80 ms | 250 ms |
| Cross-shard RPC RTT | <30 ms | 100 ms |
| Bandwidth per client (typical) | <30 KB/s | 100 KB/s |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `MMO_E001` | shard at capacity | route to overflow / queue |
| `MMO_E002` | zone unknown | reject teleport |
| `MMO_E010` | instance spawn failed | retry with backoff |
| `MMO_E020` | cross-shard timeout | mark unreachable, queue retry |

## Integration Points

- Networking: replication delta + interest sets → `docs/specs/networking/replication.md`.
- Assets: streaming priority feeds asset queue → `docs/specs/assets/streaming.md`.
- Agent: headless shard simulation for load test → `docs/specs/agent/scenarios.md`.
- Editor: zone designer overlay → `docs/specs/editor/scene.md`.

## Instance Servers

- Spawned on demand for parties/raids.
- Lifecycle: `RequestInstance(dungeon_id, party)` → server allocates → returns join token → party joins → on empty + grace period (300 s) → teardown.
- State persisted to game DB only on completion events (boss kill, quest complete).

## Telemetry

```json
{"sys":"mmo","evt":"interest_gained","shard":3,"zone":7,"viewer":1042,"target":98712,"dist":47.2}
```

## Test Requirements

- 1,000 bot clients on one shard, 60-min walk-around, <0.5% packet drop, <40 KB/s avg per client.
- Zone handoff: client crosses boundary, never sees pop / desync (telemetry asserts continuous interest set diff).
- Instance teardown after empty: memory returns to baseline within 60 s.
- Cross-shard whisper delivered <100 ms p95.

## Prior Art

- WoW realm/sharding model ✓ shard-by-zone; ✗ early monolithic DB bottleneck.
- EVE Online single-shard ✓ Stackless Python time dilation; reference, not target.
- New World server mesh ✓ seamless zone handoff.
- ESO megaserver phasing ✓ instance-of-many concept.
- GameNetworkingSockets (Valve) ✓ as transport.

## Open Questions

- [DECISION NEEDED] Seamless vs zoned-with-portal default — engine supports both, default?
- [DECISION NEEDED] Persistence: ECS state → SQL? Document store? Event sourcing?
- [BENCHMARK NEEDED] AOI grid vs kd-tree at 20k entities.
- [DECISION NEEDED] Hot-migration of player entity across shards mid-action.
