<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Networking — Lobby, Matchmaking, Relay

> Coordinator service that authenticates players, groups them into sessions, exchanges connection candidates, and supplies a fallback relay when direct NAT traversal fails.

## Boundaries
- Owns: player auth handshake, lobby state machine, queue/matchmaking, session ticket issuance, peer discovery (ICE-style), STUN/TURN-equivalent relay service, room metadata.
- Does NOT own:
  - In-game replication or input → `replication.md`, `rollback.md`
  - Game-session simulation → core/genre
  - Persistent player profile / inventory DB → game-side
  - Account creation / billing → external IdP
- Depends on:
  - `transport.md` — opens a reliable control channel between client and coordinator.
  - `anticheat.md` — issues short-lived signed session tickets.

## Architecture
```
                +----------------------------+
                |     Lobby Coordinator      |
                |  (stateless HTTP+WS shard) |
                |  - auth                    |
                |  - matchmaker              |
                |  - room registry           |
                +------+----------+----------+
                       |          |
        REST/WSS       |          | reliable UDP/QUIC
                       v          v
              +--------+--+   +---+--------+
              | Client A  |   | Client B   |
              +--+--------+   +--------+---+
                 \                    /
                  \  ICE candidates  /
                   \  exchanged via /
                    \  coordinator  /
                     v             v
                  Direct P2P (preferred)
                     |             |
                     +------ X ----+   (if NAT/firewall blocks)
                            |
                      +-----v------+
                      | Relay Node | (TURN-like)
                      +------------+
```

```
Lobby state machine (per session):

  Forming -> Filling -> Locked -> InGame -> PostMatch -> Closed
     ^           |          |         |
     +----timeout/leave---+ |         +-> Rematch -> Forming
                            +-> aborts
```

## Public API
### Client side
| Symbol | Purpose |
|---|---|
| `lobby::Client::connect(coordinator_url, token)` | Auth + open control channel. |
| `Client::create_room(cfg: RoomCfg) -> RoomId` | Host a new lobby. |
| `Client::join_room(id_or_code)` | Direct join by ID/invite code. |
| `Client::queue(playlist: PlaylistId, prefs)` | Enter matchmaker. |
| `Client::ready(true/false)` | Lobby readiness toggle. |
| `Client::start_session() -> SessionTicket` | Host call; coordinator issues tickets to all peers. |
| `Client::events() -> Stream<LobbyEvent>` | RoomUpdated, PeerJoined, PeerLeft, MatchFound, SessionReady, Kicked. |

### Coordinator side (server SDK)
| Symbol | Purpose |
|---|---|
| `Coordinator::run(cfg)` | Spin up shard. |
| `Coordinator::on_authenticate(fn)` | Pluggable IdP (OAuth, Steam, EOS, custom). |
| `Coordinator::on_matchmake(fn)` | Pluggable matchmaker (rating, latency-buckets, region). |
| `Coordinator::register_relay(addr, capacity)` | Add relay node to pool. |

## Wire Schema (control plane)
JSON over WSS during lobby; switches to binary over the transport's reliable channel after session start. Every message:
```
{ "v": 1, "t": "msg_type", "id": "<msg_id>", "ts": <ns>, "payload": {...} }
```
Core types: `auth`, `create_room`, `room_update`, `queue_enter`, `match_found`, `ice_candidate`, `session_ticket`, `relay_assign`, `error`.

## Authentication Flow
```
client                          coordinator                IdP
  | --- auth(provider, idtoken) ---> |
  |                                  | --- verify idtoken ---> |
  |                                  | <-- profile ------------|
  | <-- session_jwt (15 min) ------- |
  | --- open WSS w/ Bearer JWT ----> |
  | <-- player_id, region, rating -- |
```

Session JWT signed Ed25519, contains `{ player_id, exp, region, scope }`.

## Matchmaking
Default matchmaker = latency-buckets + rating Glicko-2 [DECISION NEEDED rating system]:
```
1. Bucket players by region + ping band (e.g. <30, <60, <100 ms).
2. Sort each bucket by rating; sliding window groups of N players.
3. Within window: if rating spread ≤ Δ and queue time > T, form a match.
4. Δ grows with queue time (relaxation curve).
5. Backfill in-progress matches if a peer drops.
```
Game-side override: `Coordinator::on_matchmake` receives the queue and returns groupings.

## Peer Discovery & NAT Traversal
ICE-lite flow (not full ICE spec; subset):
```
1. Each client gathers candidates:
   - host (LAN IPs)
   - server-reflexive (via coordinator's seen-from address — acts as STUN)
   - relay-reflexive (allocated TURN-equivalent address)
2. Coordinator forwards candidate list to all peers in session.
3. Peers attempt direct connectivity in priority order: host > srflx > relay.
4. First channel to establish wins; others torn down.
5. On failure (all candidates timeout in 5 s): fall back to relay allocation.
```

## Relay Server
Lightweight TURN-equivalent:
- Each relay node registers with coordinator with `{ region, capacity }`.
- Coordinator assigns a relay per session based on peer regions (lowest combined RTT).
- Relay forwards opaque encrypted UDP datagrams; cannot read payload (E2E crypto from `transport.md`).
- Relay enforces per-session bandwidth cap; reports usage telemetry.
- Stateless: relay can be restarted; sessions reconnect within `reconnect_window_ms`.

```
peer A --(enc UDP)--> relay --(enc UDP)--> peer B
        session_id + auth_tag in header
```

Relay packet header:
```
u8  version;
u32 session_id;
u16 src_peer;
u16 dst_peer;
u32 nonce;
u8  auth_tag[16];   // proves sender holds session key, NOT decryption
payload (opaque, E2E encrypted)
```

## Room Configuration
```
RoomCfg {
  visibility: Public | Unlisted | InviteOnly,
  max_peers: u8,
  region_hint: Option<RegionCode>,
  game_mode: String,
  custom: Map<String, JsonValue>,   // game-specific
  rematch_on_close: bool,
}
```

## Performance Contract
| Metric | Target | Hard limit |
|---|---|---|
| Coordinator auth roundtrip | <100 ms | 500 ms |
| Match found latency (warm queue) | <5 s | 60 s |
| ICE establishment (direct) | <500 ms | 2 s |
| Relay fallback latency overhead | <30 ms regional | 100 ms |
| Coordinator shard QPS | 5K msgs/s/core | 20K |
| Relay throughput per node | 500 Mbps | 1 Gbps [BENCHMARK NEEDED] |
| Sessions per coordinator shard | 10K concurrent | 50K |

## Error Contract
| Code | Meaning | Caller action |
|---|---|---|
| `LOBBY_E_AUTH` | Token invalid/expired | Reauth via IdP |
| `LOBBY_E_ROOM_FULL` | Capacity reached | Try another room |
| `LOBBY_E_KICKED` | Removed by host or anti-cheat | Show reason; do not auto-reconnect |
| `LOBBY_E_REGION_UNAVAILABLE` | No relay capacity | Try alternate region |
| `LOBBY_E_TICKET_INVALID` | Session ticket signature bad/expired | Re-request from coordinator |
| `LOBBY_E_TIMEOUT` | No match within max queue time | Surface to UI, requeue |

## Telemetry
Per match:
```
{ "match_id": uuid, "players": [...], "queue_time_s": f32,
  "rating_spread": u16, "region": str, "p2p_ratio": f32,
  "relay_assigned": bool, "ttf_session_ready_ms": u32 }
```
Per relay node:
```
{ "node_id": str, "active_sessions": u32, "in_bps": u64, "out_bps": u64,
  "cpu_pct": f32, "dropped_pkts": u32 }
```

## Integration Points
- **Transport:** coordinator hands clients a session ticket; transport handshake validates ticket. Relay forwards transport packets without inspection.
- **Anticheat:** session ticket is the trust root; revocation list checked on every reconnect (→ `anticheat.md`).
- **Replication / Rollback:** lobby triggers `Session::host` or `Session::connect` once SessionReady fires.
- **Agent SDK:** headless agent can run a coordinator + relay locally for scenario tests (→ `docs/specs/agent/scenarios.md`).
- **Editor:** lobby state visible in debug panel; can spawn mock peers for testing (→ `docs/specs/editor/debug.md`).

## Test Requirements
- T1: 1000 concurrent queued players matched within 95th-percentile <30 s.
- T2: NAT-restricted dual-symmetric peers fall back to relay within 5 s, session continues.
- T3: Coordinator restart mid-lobby: clients reconnect with cached JWT and resume room state.
- T4: Relay node failure mid-session: clients migrate to alternate relay within `reconnect_window_ms` (default 10 s).
- T5: Spoofed session ticket rejected (signature mismatch) within 1 packet.
- T6: Bandwidth cap enforced: peer exceeding 1 MB/s throttled, telemetry warning emitted.

## Prior Art
- ✓ Photon Realtime / Photon Quantum — lobby + relay model.
- ✓ Steamworks P2P (`ISteamNetworkingSockets`) — relay network design.
- ✓ Epic Online Services Lobby — feature surface reference.
- ✓ libdatachannel / libjuice — ICE candidate gathering implementation reference.
- ✓ STUN (RFC 5389) / TURN (RFC 8656) — relay protocol semantics, lite-subset.
- ✗ Full WebRTC SDP/ICE for native — too heavy; ICE-lite custom protocol is enough.

## Open Questions
- [DECISION NEEDED] Default IdP integrations shipped (Steam, EOS, Discord, custom email)?
- [DECISION NEEDED] Rating algorithm: Glicko-2 vs TrueSkill 2 vs custom.
- [DECISION NEEDED] Self-hostable coordinator distro (Docker compose vs k8s helm)?
- [DECISION NEEDED] Relay billing model for hosted Nexus Cloud (free tier limits)?
- [BENCHMARK NEEDED] Coordinator shard horizontal scaling: sessions/shard before sharding key collisions.
