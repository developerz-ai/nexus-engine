<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Networking — Overview

> Unified netcode layer offering three replication models (rollback, server-authoritative, P2P) over a single QUIC/UDP transport, chosen per-game in `Nexus.toml`.

## Boundaries
- Owns: transport (UDP, QUIC), reliability layer, replication models, lobby/matchmaking, relay, anti-cheat hooks, packet telemetry, snapshot/replay capture of wire traffic.
- Does NOT own:
  - Simulation tick / fixed timestep → `docs/specs/core/jobs.md`, `docs/specs/physics/determinism.md`
  - Deterministic math (fixed-point) → `docs/specs/physics/determinism.md`
  - ECS state serialization → `docs/specs/core/ecs.md`
  - Voice chat codecs → `docs/specs/audio/voice.md`
  - Cryptographic identity beyond session keys → `[DECISION NEEDED]` (likely OAuth + Ed25519 session keys)
- Depends on:
  - `docs/contracts/core-networking.md` — input collection, state snapshot, rollback callbacks
  - `docs/specs/physics/determinism.md` — required for rollback
  - `docs/specs/core/events.md` — wire events use the same typed event bus
  - `docs/specs/agent/telemetry.md` — every packet category is a telemetry channel

## Architecture
```
+----------------------------------------------------------+
|  Game Code (ECS systems, scripts)                        |
+----------------------------------------------------------+
|  Replication Model (pick one per session)                |
|  +---------------+ +-----------------+ +--------------+  |
|  |  Rollback     | | Server-Auth     | |  P2P State   |  |
|  |  (GGPO-like)  | | (Snapshot+Delta)| |  Sync        |  |
|  +---------------+ +-----------------+ +--------------+  |
|        |                  |                   |          |
+--------v------------------v-------------------v----------+
|  Reliability Layer (sequencing, ack, frag, congestion)   |
|  → rollback.md / replication.md call here                |
+----------------------------------------------------------+
|  Transport: QUIC (default)  |  Raw UDP (fast path)       |
+----------------------------------------------------------+
|  OS Sockets / WebTransport (web target)                  |
+----------------------------------------------------------+
```

## Public API
| Symbol | Purpose |
|---|---|
| `nexus_net::Session` | Top-level handle. `Session::connect(addr, cfg)`, `Session::host(cfg)`. |
| `nexus_net::SessionConfig` | `{ model: Rollback | ServerAuth | P2P, tick_hz, max_players, transport, telemetry }`. |
| `nexus_net::ReplicationModel` | Enum selecting rollback / server-auth / P2P. |
| `nexus_net::PeerId(u64)` | Stable per-session peer identifier. |
| `nexus_net::Frame(u32)` | Simulation tick, monotonic. |
| `nexus_net::Input<T>` | Per-peer input slot, type-parameterized. |
| `nexus_net::poll() -> Vec<NetEvent>` | Pull events: PeerJoin, PeerLeave, Desync, RollbackTo(frame), SnapshotReceived. |
| `nexus_net::send_input(frame, input)` | Submit local input for current tick. |
| `nexus_net::stats() -> NetStats` | RTT, loss, bandwidth, rollback depth distribution. |

## When To Use Which Model

| Model | Use when | Players | Latency tolerance | Examples |
|---|---|---|---|---|
| **Rollback** | Frame-perfect inputs matter; deterministic sim available; small player count | 2–8 | <100ms one-way | Fighting games, twitch platformers, GGPO-style versus |
| **Server-Authoritative** | Cheating is a concern; >8 players; sim non-deterministic; persistent world | 8–10k | 50–200ms with interpolation | FPS, MOBA, MMO, RTS, BR |
| **P2P State Sync** | Cooperative/casual; no central server; LAN | 2–16 | 100ms+ | Co-op puzzles, party games, mods |

Decision algorithm:
```
if game.requires_anticheat || game.players > 8 || !sim.deterministic:
    use ServerAuth (→ replication.md)
elif game.players <= 8 && sim.deterministic && game.frame_perfect:
    use Rollback (→ rollback.md)
else:
    use P2P
```

## Performance Contract
| Metric | Target | Hard limit |
|---|---|---|
| Idle wire overhead per peer | <2 KB/s | 8 KB/s |
| RTT measurement accuracy | ±2 ms | ±10 ms |
| Packet processing CPU per peer @ 60Hz | <50 µs | 200 µs |
| Max simulated peers (server) | 1024 | 4096 [BENCHMARK NEEDED] |
| Cold connect handshake | <300 ms LAN, <1 s WAN | 3 s |
| Telemetry overhead | <3% wall time | 8% |

## Error Contract
| Code | Meaning | Caller action |
|---|---|---|
| `NET_E_TRANSPORT_DOWN` | Socket failure | Retry with backoff, surface to UI |
| `NET_E_PROTOCOL_MISMATCH` | Peer wire version differs | Disconnect, prompt update |
| `NET_E_DESYNC` | Hash divergence between peers/server | Rollback session → snapshot, log replay |
| `NET_E_AUTH_REJECTED` | Session key invalid / banned | Surface to lobby, do not retry |
| `NET_E_TIMEOUT` | Peer silent past `timeout_ms` | Kick peer, continue session |
| `NET_E_CAPACITY` | Server at max peers | Lobby reroutes to next shard |

## Integration Points
- **Core / ECS:** replication tags components for sync (→ `docs/contracts/core-networking.md`).
- **Physics:** rollback requires `physics::step_deterministic(seed, dt)` (→ `docs/specs/physics/determinism.md`).
- **Scripting:** scripts may register replicated state; rate-limited writes (→ `docs/contracts/core-scripting.md`).
- **Agent SDK:** every packet emits a telemetry record; snapshot/replay captures wire stream for offline debug (→ `docs/specs/agent/replay.md`).
- **Editor:** live netgraph overlay, RTT/loss/jitter sparklines, rollback depth histogram (→ `docs/specs/editor/debug.md`).

## Test Requirements
- T1: All three models pass a 60-second smoke session with simulated 100ms RTT, 2% loss.
- T2: Rollback session resimulates without divergence under 10% packet loss between two peers for 5 min.
- T3: Server-auth session with 100 simulated bots holds <60 KB/s per peer outbound.
- T4: P2P session with 8 peers establishes within 2s on LAN, 10s over relay.
- T5: All packets categorized in telemetry; no `UNKNOWN_PACKET` over 1-hour fuzz run.
- T6: Snapshot+replay reproduces a 1-min recorded session bit-identical when sim is deterministic.

## Prior Art
- ✓ Valve `GameNetworkingSockets` — reliability over UDP, congestion, fragmentation (`inspired by: ValveSoftware/GameNetworkingSockets`).
- ✓ Tony Cannon's GGPO — rollback model.
- ✓ Glenn Fiedler "Gaffer On Games" — virtual connection, reliability, snapshot interpolation.
- ✓ Quake 3 — snapshot/delta + client-side prediction.
- ✓ Overwatch GDC 2017 (Tim Ford / Dan Reed) — server-authoritative with rewind, ECS replication.
- ✓ QUIC (RFC 9000) — modern multiplexed transport, 0-RTT resume, congestion built-in.
- ✗ TCP for game traffic — head-of-line blocking, unacceptable jitter.

## Open Questions
- [DECISION NEEDED] Mandate QUIC for all production sessions, keep raw UDP only as `--unsafe-fastpath`?
- [DECISION NEEDED] Identity/session-key provider: roll our own vs. integrate Steamworks/EOS shim?
- [DECISION NEEDED] WebTransport vs. WebRTC DataChannel for web target.
- [BENCHMARK NEEDED] Sustained peer count per relay node before CPU saturation.
