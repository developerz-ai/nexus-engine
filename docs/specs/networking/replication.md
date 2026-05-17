<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Networking — Server-Authoritative Replication

> Authoritative server simulates; clients send inputs, render interpolated/predicted state from delta-compressed snapshots filtered by interest.

## Boundaries
- Owns: snapshot capture, delta compression, baseline negotiation, interest management (AOI), client-side prediction & reconciliation, entity priority queue, replication tags on components.
- Does NOT own:
  - Transport reliability → `transport.md`
  - Cheat policy → `anticheat.md`
  - ECS component definitions → `docs/specs/core/ecs.md`
  - Persistence / DB writes → game-side concern
- Depends on:
  - `docs/contracts/core-networking.md` — replicated-component registration, server tick hook.
  - `docs/specs/core/ecs.md` — change detection per component.
  - `transport.md` — unreliable+sequenced channel for snapshots, reliable channel for spawn/despawn.

## Architecture
```
Server:                                Client:
+------------------+                   +------------------+
| Game Sim (auth)  | tick N            | Local Input      |
| ECS world        |                   | predict tick N+k |
+--------+---------+                   +--------+---------+
         |                                      |
         v                                      v
+------------------+                   +------------------+
| Snapshot N       |                   | Send InputCmd(N) |
|  for each peer:  |                   +--------+---------+
|   filter by AOI  |                            |
|   delta vs ack'd |                            v
|   priority queue |       UDP/QUIC    +------------------+
|   pack → packet  |◄─────────────────►| Recv Snapshot N  |
+--------+---------+                   | Decompress delta |
         |                             | Reconcile pred.  |
         v                             | Interpolate ent. |
   send to peer                        +------------------+
```

## Public API
| Symbol | Purpose |
|---|---|
| `replicate!(Component)` macro | Marks a component as replicated. Defaults to unreliable, snapshotted. |
| `#[replicate(reliable)]` | Spawn/despawn-level events, never dropped. |
| `#[replicate(priority = 5, max_hz = 20)]` | Per-component QoS tuning. |
| `Server::start(cfg: ServerCfg)` | `{ tick_hz, snapshot_hz, max_peers, aoi_strategy }`. |
| `Server::push_snapshot(peer, frame)` | Called by replication system each snapshot tick. |
| `Client::predict_input(input)` | Local input + speculative apply. |
| `Client::reconcile(snapshot)` | Replays inputs since `snapshot.frame` over server truth. |
| `InterestSet` | Per-peer entity visibility set, updated by AOI system. |

## Wire Format
```
SnapshotPacket {
  u16  proto_id;
  u16  seq;
  u32  server_tick;
  u32  baseline_tick;        // tick this delta is against (0 = full)
  u32  ack_input_seq;        // highest client input acknowledged
  u16  entity_count;
  EntityDelta entities[];    // bit-packed
}

EntityDelta {
  varint  entity_id;          // remapped per peer
  u8      change_mask;        // 1 bit per replicated component on this entity
  ComponentDelta deltas[];    // only present where bit set
}

ComponentDelta {
  u8      field_mask;         // bits indicate which fields changed
  bytes   payload;            // packed quantized values
}
```

Quantization: per-field `#[replicate(quantize(bits=14, range=-1024..1024))]`.

## Snapshot Strategy
- Server runs at `tick_hz` (default 60).
- Snapshots emitted at `snapshot_hz` (default 20–30) per peer.
- Each peer tracks `last_ack_tick`; deltas computed against that.
- If `current_tick - last_ack_tick > MAX_HISTORY` (default 64), send full baseline.
- Snapshot history ring buffer per peer (memory budget below).

## Interest Management (AOI)
Pluggable strategies:
| Strategy | Cost | Use |
|---|---|---|
| `Everyone` | O(N) per peer | small lobbies, debug |
| `RadiusSphere(r)` | O(N) brute or O(log N) with BVH | FPS / TPS |
| `GridCell(size)` | O(1) lookup, neighbors | RTS, MMO zones |
| `Octree` | O(log N) | open world |
| `Custom(fn)` | game-defined | story-driven culling |

Sticky visibility: entity stays in set for `linger_ms` after leaving radius to mask boundary pop.

## Client-Side Prediction & Reconciliation
```
client_tick = server_tick + RTT/2 + safety_buffer

t=100  send Input(seq=100), apply locally → state'
t=104  receive Snapshot(server_tick=98, ack_input_seq=98)
       roll player entity back to snapshot[player]
       replay Input(99), Input(100), Input(101), Input(102)
       diff vs locally predicted → smooth correction over N frames
```

Only the local player entity is predicted; other entities are interpolated 100ms in the past (Quake 3 / Source-style).

## Delta Compression
- Quake-3-style: snapshot N delta-encoded against last-acked snapshot M.
- Per-field XOR or arithmetic delta; varint + bit-pack remainder.
- Optional zstd dictionary for spawn-heavy packets [DECISION NEEDED].

## Performance Contract
| Metric | Target | Hard limit |
|---|---|---|
| Snapshot pack time / 1K visible ents | <1 ms | 4 ms |
| Bandwidth per client (FPS, 20 Hz, 50 visible) | <40 KB/s | 80 KB/s |
| Bandwidth per client (MMO, 30 Hz, 200 visible) | <120 KB/s | 250 KB/s |
| Server CPU per 64-peer match | <2 cores | 4 cores |
| Snapshot history per peer | <256 KB | 1 MB |
| AOI rebuild per tick (10K entities, 64 peers) | <2 ms | 8 ms [BENCHMARK NEEDED] |
| Reconcile time per correction | <200 µs / replayed tick | 1 ms |

## Error Contract
| Code | Meaning | Caller action |
|---|---|---|
| `REPL_E_BASELINE_LOST` | Client baseline expired before ack | Server sends full snapshot |
| `REPL_E_BANDWIDTH_CAP` | Per-peer cap exceeded | Drop low-priority entities |
| `REPL_E_PEER_BACKPRESSURE` | Client ack rate falling behind | Reduce `snapshot_hz` for that peer |
| `REPL_E_FIELD_RANGE` | Quantized field out of declared range | Clamp + log, telemetry warning |

## Telemetry
Per snapshot send:
```
{ "peer": id, "tick": u32, "bytes": u16, "ents_sent": u16,
  "ents_visible": u16, "delta_vs_baseline_tick": u32,
  "compress_us": u16, "interest_us": u16 }
```
Per client reconciliation:
```
{ "tick": u32, "correction_dist": f32, "replayed_ticks": u8, "us": u16 }
```

## Integration Points
- **ECS:** component change-detection drives the per-peer dirty set (→ `docs/specs/core/ecs.md`).
- **Physics:** server runs full physics; client runs prediction-only for player avatar (→ `docs/specs/physics/character.md`).
- **Anticheat:** every client input validated server-side (→ `anticheat.md`).
- **Transport:** snapshots = unreliable-sequenced channel; spawn/despawn + RPC = reliable channel (→ `transport.md`).
- **Replay:** server records full snapshot stream; deterministic replay for debug (→ `docs/specs/agent/replay.md`).

## Test Requirements
- T1: 64-peer FPS match, 20 Hz snapshots, mean bandwidth <50 KB/s/peer over 10 min.
- T2: Bandwidth scales linearly with visible entities (no quadratic blowup).
- T3: Client reconciliation correction <1 m for 95th-percentile under 100 ms RTT, 3% loss.
- T4: AOI grid correctly culls 99% of entities for distant peer (10K-entity world, 50 m radius).
- T5: Baseline loss recovery completes within 2 snapshot intervals.
- T6: All replicated fields appear in telemetry with type + size.

## Prior Art
- ✓ Quake 3 networking model (`id-Software/Quake-III-Arena`) — snapshot delta + client prediction.
- ✓ Source Engine multiplayer wiki — interpolation 100ms, lag comp.
- ✓ Overwatch GDC 2017 (Tim Ford / Dan Reed) — ECS-replication mapping, predicted/non-predicted entity split.
- ✓ Glenn Fiedler "Snapshot Compression" / "State Synchronization" series.
- ✓ Tribes Engine networking paper (Frohnmayer & Gift, 2000) — interest management origin.
- ✗ Per-entity TCP — head-of-line blocking on snapshot stream.

## Open Questions
- [DECISION NEEDED] Default `snapshot_hz` per genre (FPS 20, MOBA 30, MMO 10–15)?
- [DECISION NEEDED] zstd dictionary support for spawn-heavy packets — worth the complexity?
- [DECISION NEEDED] Predict non-player entities owned by the client (e.g. thrown grenade)?
- [BENCHMARK NEEDED] AOI rebuild cost at 100K-entity MMO scale.
