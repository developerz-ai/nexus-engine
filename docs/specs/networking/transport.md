<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Networking — Transport & Reliability

> QUIC by default for production; raw UDP with a GameNetworkingSockets-inspired reliability layer for ultra-low-latency paths. Same `Channel` abstraction over both.

## Boundaries
- Owns: socket I/O, packet framing, sequencing, acks, retransmit, fragmentation/reassembly, congestion control, MTU discovery, encryption handshake, channel multiplexing, NAT-aware send.
- Does NOT own:
  - Replication semantics → `replication.md`
  - Rollback semantics → `rollback.md`
  - Lobby / matchmaking / NAT traversal coordination → `lobby.md`
  - Identity issuance → `anticheat.md`, `lobby.md`
- Depends on:
  - OS sockets (UDP, `setsockopt`, `recvmmsg` where available) → `docs/specs/core/hal.md`
  - QUIC implementation: candidate `quinn` (Rust, RFC 9000) — `[DECISION NEEDED]`

## Architecture
```
+------------------------------------------+
|  Channel API (typed, async or polled)    |
|  - Unreliable                            |
|  - UnreliableSequenced                   |
|  - Reliable (ordered)                    |
|  - ReliableUnordered                     |
+----+-------------------+----------------+
     |                   |
     v                   v
+----------+      +----------------+
| QUIC     |      | Raw UDP +      |
| (quinn)  |      | reliability    |
| streams  |      | (GNS-inspired) |
+----+-----+      +-------+--------+
     |                    |
     v                    v
   UDP sockets (IPv4/IPv6, dual-stack)
```

## Public API
| Symbol | Purpose |
|---|---|
| `transport::Endpoint::bind(addr, cfg)` | Open a socket; multiplexes many `Connection`s. |
| `transport::Connection` | Logical link to one peer. Holds channels. |
| `Connection::open_channel(id, mode: ChannelMode)` | Allocates a typed channel. |
| `ChannelMode` | `Unreliable`, `UnreliableSequenced`, `Reliable`, `ReliableUnordered`. |
| `Channel::send(bytes)` / `Channel::recv() -> Option<Bytes>` | Non-blocking I/O. |
| `Connection::stats() -> ConnStats` | `{ rtt, rttvar, loss, send_bw, recv_bw, cwnd, mtu }`. |
| `Connection::close(code: u16, reason: &str)` | Graceful or abortive. |

## Channel Modes
| Mode | Order | Retransmit | Use |
|---|---|---|---|
| Unreliable | none | no | Voice frames, redundant input packets |
| UnreliableSequenced | drop-stale | no | Snapshots (only newest matters) |
| Reliable | strict | yes | Spawn/despawn, chat, RPC, lobby control |
| ReliableUnordered | none | yes | Independent reliable events (achievements) |

## Packet Header (raw UDP path)
```
Header (variable, 8–20 B):
  u8   version_flags;        // hi nibble = version, lo nibble = flags
  u16  channel_id;
  u16  seq;                  // per-channel sequence
  u16  ack;                  // highest seq received on this channel
  u32  ack_bits;             // bitfield of prior 32 acks (Fiedler-style)
  u16  frag_id;              // if fragment flag set
  u8   frag_idx;
  u8   frag_total;
  payload...
Trailer: u32 crc OR auth tag (16 B if encrypted)
```

QUIC path: native stream IDs replace channel_id; ack/loss handled by QUIC itself.

## Reliability (raw UDP)
- **Sequencing:** monotonic per channel.
- **Ack:** newest seq + 32-bit ack history (Glenn Fiedler model).
- **Retransmit:** RTO = `srtt + 4·rttvar`, doubled per retry, capped at 1 s; max 5 retries → connection drop.
- **Fragmentation:** if payload > `mtu - header`, split into ≤16 frags; reassemble on recv. Drop on incomplete after 1 s.
- **Duplicate detection:** sliding window of seen seqs per channel.

## Congestion Control
- QUIC: defer to QUIC's CC (CUBIC default, BBR optional). [DECISION NEEDED] BBR vs CUBIC default.
- Raw UDP: GNS-inspired — measure pings, classify connection quality (Good / OK / Bad), throttle send rate:
```
quality = f(rtt_jitter, loss_pct)
if Bad:   send_rate = min(send_rate * 0.5, floor)
if OK:    hold
if Good:  send_rate += linear_step until cap or worse
```

## MTU Discovery
- Start at 1200 B (QUIC safe default).
- Probe upward by 100 B every N seconds until loss.
- Hard cap 1452 B (Ethernet 1500 − IPv6 40 − UDP 8).
- Re-probe after route change (RTT step).

## Encryption
- QUIC: TLS 1.3 built in (RFC 9001).
- Raw UDP: noise-protocol handshake (`Noise_XX_25519_ChaChaPoly_BLAKE2s`) → per-packet ChaCha20-Poly1305.
- Session keys rotated every 1 GB or 1 hour.
- `[DECISION NEEDED]` allow unencrypted mode for LAN dev only?

## NAT Traversal Hooks
Transport exposes:
- `Connection::local_candidates() -> Vec<SocketAddr>`
- `Endpoint::set_relay_route(peer, relay_addr)` — coordinator (lobby) supplies relay.
- Hole-punch driver lives in `lobby.md`; transport just sends/receives.

## Performance Contract
| Metric | Target | Hard limit |
|---|---|---|
| Per-packet enqueue cost | <2 µs | 10 µs |
| `recvmmsg` batched recv | 64 packets / syscall | — |
| RTT overhead vs raw UDP | QUIC: +0.2 ms, raw: +0.05 ms | +1 ms |
| Handshake (QUIC, 1-RTT) | <1 RTT + 1 round | 2 RTT |
| Handshake (QUIC, 0-RTT resume) | 0 RTT | 1 RTT |
| Max channels per connection | 256 | 1024 |
| Loss before forced disconnect | 30% sustained 5 s | 50% sustained 1 s |

## Error Contract
| Code | Meaning | Caller action |
|---|---|---|
| `TX_E_MTU_BLACKHOLE` | Packets above N silently dropped | Lower MTU, re-probe |
| `TX_E_HANDSHAKE_FAIL` | Crypto handshake rejected | Surface to lobby, log |
| `TX_E_VERSION_MISMATCH` | Protocol byte differs | Disconnect, prompt update |
| `TX_E_RATE_LIMITED` | Outbound queue full | Backoff, drop low-priority |
| `TX_E_PEER_TIMEOUT` | No packets in `keepalive_ms × 4` | Close connection |
| `TX_E_CRC_FAIL` | Packet integrity check failed | Drop, count toward fail budget |

## Telemetry (per connection, per second)
```
{
  "peer": id,
  "rtt_ms": f32, "rttvar_ms": f32,
  "loss_in_pct": f32, "loss_out_pct": f32,
  "send_bw_bps": u32, "recv_bw_bps": u32,
  "cwnd_bytes": u32, "in_flight_bytes": u32,
  "mtu": u16,
  "retx_count": u32,
  "channel_stats": [...]
}
```
Per packet (sampled at `telemetry.sample_rate`):
```
{ "ts_ns": u64, "dir": "in|out", "channel": u16, "seq": u16,
  "size": u16, "category": "snapshot|input|rpc|lobby|voice",
  "retx": bool }
```

## Integration Points
- **Replication:** opens UnreliableSequenced (snapshots) + Reliable (spawn/RPC) channels.
- **Rollback:** opens Unreliable channel with redundant input packets (sends current + N prior frames).
- **Lobby:** opens Reliable channel for lobby control plane; coordinates NAT punch.
- **Anticheat:** authenticated session token bound to crypto handshake; replay attack rejection via seq window.
- **Agent SDK:** snapshot/replay records every send/recv with metadata for offline replay (→ `docs/specs/agent/replay.md`).

## Test Requirements
- T1: 1 Gbps loopback throughput on unreliable channel; <5% CPU per core [BENCHMARK NEEDED].
- T2: 100 ms RTT + 5% loss + 20 ms jitter: reliable channel delivers all messages within 4× RTT.
- T3: MTU blackhole at 1300 B detected within 2 s; recovers to functional MTU.
- T4: QUIC handshake completes in 1 RTT over loopback; 0-RTT resume on reconnect.
- T5: Fuzz: 1M random malformed packets → zero panics, all rejected with telemetry.
- T6: Channel ordering: Reliable channel preserves order under 30% loss for 10K messages.

## Prior Art
- ✓ `ValveSoftware/GameNetworkingSockets` — reliability layer model, connection quality classification.
- ✓ Glenn Fiedler "Reliability & Flow Control" / "Virtual Connection over UDP" articles.
- ✓ QUIC (RFC 9000) / QUIC-TLS (RFC 9001) — modern transport baseline.
- ✓ `quinn` crate — Rust QUIC impl, current top candidate.
- ✓ `laminar` / `renet` — Rust game-net reliability crates; reference for channel API ergonomics.
- ✓ ENet — classic UDP reliability lib; ergonomic but no congestion control.
- ✗ TCP — head-of-line blocking.
- ✗ WebRTC DataChannel (server-side) — overkill SCTP/DTLS stack; reserve for browser only.

## Open Questions
- [DECISION NEEDED] QUIC impl: `quinn` vs `s2n-quic` vs in-house.
- [DECISION NEEDED] Allow raw-UDP mode in shipped builds or restrict to LAN/dev?
- [DECISION NEEDED] Web target: WebTransport (QUIC) vs WebRTC DataChannel; WebTransport browser support gating.
- [DECISION NEEDED] Default congestion controller (CUBIC vs BBRv2).
- [BENCHMARK NEEDED] `recvmmsg` vs `io_uring` recv path on Linux at 10K pps.
