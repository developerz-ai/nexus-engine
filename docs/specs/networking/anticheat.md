<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Networking — Anti-Cheat & Trust Model

> Server-authoritative validation as the trust root; client treated as adversarial; layered checks (transport, input, behavior) with structured telemetry feeding an offline detection pipeline.

## Boundaries
- Owns: trust-zone model, server-side input validation, rate limits, plausibility checks, ban list, session ticket revocation, cheat telemetry schema, replay-based forensics hooks.
- Does NOT own:
  - Kernel-level driver / process scanning — explicitly OUT OF SCOPE (closed-source, OS-specific, hostile to MIT and to mod community).
  - Login/account security → `lobby.md` + external IdP.
  - Punishment policy (timeouts, perma-bans) → game-side admin tooling.
  - Sim determinism enforcement → `docs/specs/physics/determinism.md`.
- Depends on:
  - `lobby.md` — issues signed session tickets; receives revocation events.
  - `transport.md` — authenticated, encrypted channel; replay protection via seq window.
  - `replication.md` — server simulates truth.
  - `docs/specs/agent/replay.md` — flagged sessions auto-capture for forensic analysis.

## Trust Model
```
+----------------------------------------------------+
|             SERVER (trust root)                    |
|   - simulates authoritative state                  |
|   - validates every input                          |
|   - signs all snapshots                            |
+--------------------+-------------------------------+
                     | encrypted, authenticated      |
                     v                               |
+----------------------------------------------------+
|             CLIENT (untrusted)                     |
|   - inputs are HINTS, not commands                 |
|   - any client computation is suggestion only      |
|   - mods/scripts run in sandbox (see scripting)    |
+----------------------------------------------------+
```

Rules:
1. **Never trust client state.** Client may declare its position, but server overrides on mismatch beyond tolerance.
2. **Validate every input.** All inputs pass `is_plausible()` server-side before applying.
3. **Server signs outputs.** Replay/snapshot signed → tamper detection in spectator/recording.
4. **Symmetric P2P games use sync-test (→ `rollback.md`)** instead of server validation; cheating in P2P is a known limit, documented to users.

## Session Trust Lifecycle
```
issue ticket --> connect --> validate ticket --> in-session --> revoke
   (lobby)      (transport)    (anticheat)      (game loop)    (anticheat)
                                                      |
                                                      +--> behavioral score
                                                      +--> flag/kick/ban
```

## Public API
| Symbol | Purpose |
|---|---|
| `anticheat::Validator` | Server-side trait; one impl per input/event category. |
| `Validator::validate(ctx, input) -> Result<(), Violation>` | Called before applying input. |
| `anticheat::Violation` | `{ code, severity: Info|Warn|Kick|Ban, evidence: JsonValue }`. |
| `anticheat::RateLimiter::check(peer, bucket, cost) -> bool` | Token bucket per peer per category. |
| `anticheat::Ledger::record(peer, violation)` | Persisted; thresholds trigger actions. |
| `anticheat::TicketAuthority` | Issues, validates, revokes session tickets. |
| `anticheat::Forensic::capture(peer, window)` | Snapshots inputs+state around suspicious event. |

## Built-In Validators
| Validator | Checks |
|---|---|
| `MovementSanity` | Velocity, accel, teleport distance vs. last tick. |
| `InputCadence` | Rate of inputs per second; bot-like uniformity score. |
| `AimSnap` | Angular velocity spikes vs. baseline distribution. |
| `WeaponFire` | Fire rate, ammo state, cooldowns vs. server state. |
| `Interaction` | Range/LoS to interacted entity. |
| `ResourceClaim` | Pickups, currency, XP — server-recomputed; client claim ignored. |
| `ChatRate` | Message rate, length, repetition. |
| `StatePoke` | Reject any client packet claiming to set replicated state. |

## Input Sanitation Pipeline (server)
```
recv packet
  └─> transport: decrypt, auth-verify, dedupe, in-window
       └─> ticket valid? not revoked?
            └─> per-channel rate limit
                 └─> deserialize -> typed Input
                      └─> field bounds (saturated arithmetic)
                           └─> Validator chain (see table)
                                └─> apply to sim
```
Any failure: increment violation counter, emit telemetry, drop input. Soft failures degrade score; hard failures kick.

## Rate Limits (defaults)
| Bucket | Rate | Burst |
|---|---|---|
| Movement inputs | tick_hz | 2× tick_hz |
| Fire / ability | game-defined per ability | 2× |
| Chat | 5 msgs / 10 s | 3 |
| Interact | 10 / s | 5 |
| Lobby control | 20 / min | 10 |

Bucket overrun → `AC_E_RATE_LIMITED` (soft) or kick after N overruns in window (hard).

## Behavioral Scoring
Per session, server aggregates anomaly signals:
```
score = w1 * input_cadence_zscore
      + w2 * aim_snap_frequency
      + w3 * impossible_action_rate
      + w4 * peer_report_weight
```
Score crosses threshold → flag for offline review (forensic capture + queue for human/AI auditor). Direct auto-ban only on cryptographic violations (bad signature, replayed packet, revoked ticket).

## Forensic Capture
On flag:
1. Capture last N seconds of: server snapshot stream, client inputs, RNG seed, peer telemetry.
2. Bundle as `.nexus-replay` (→ `docs/specs/agent/replay.md`).
3. Push to forensic bucket; auditor (human or AI) can re-run server-side deterministically.

## Wire Additions
Every reliable command from client carries an `anti_replay_nonce` (monotonic per session) plus the transport-layer auth tag from `transport.md`. Server rejects nonces outside the window.

## Performance Contract
| Metric | Target | Hard limit |
|---|---|---|
| Per-input validation cost | <5 µs | 30 µs |
| Rate-limit check | <0.5 µs | 2 µs |
| Forensic capture overhead | <1% CPU | 5% |
| Ticket validation (cached) | <1 µs | 10 µs |
| Ticket revocation propagation | <2 s globally | 10 s |
| Score evaluation cadence | every 60 ticks | every 10 ticks |

## Error Contract
| Code | Meaning | Server action |
|---|---|---|
| `AC_E_TICKET_INVALID` | Bad/expired/revoked ticket | Disconnect, no resume |
| `AC_E_REPLAY_DETECTED` | Nonce outside window | Drop + ledger entry |
| `AC_E_RATE_LIMITED` | Bucket overflowed | Drop, increment soft counter |
| `AC_E_INPUT_IMPLAUSIBLE` | Validator chain failed | Drop input, log evidence |
| `AC_E_STATE_POKE` | Client tried to write authoritative state | Disconnect, hard ban candidate |
| `AC_E_SIGNATURE_INVALID` | Forged packet auth tag | Disconnect, hard ban candidate |

## Telemetry
Per violation:
```
{ "ts_ns": u64, "peer": id, "session": uuid, "code": str,
  "severity": str, "evidence": {...},
  "validator": str, "tick": u32 }
```
Per session aggregate (each minute):
```
{ "peer": id, "behav_score": f32, "violation_counts": {...},
  "captured_replays": u8 }
```
All anti-cheat telemetry tagged `category=anticheat` so the agent SDK and observability stack can subscribe (→ `docs/specs/agent/telemetry.md`).

## Integration Points
- **Lobby:** consumes ban list; refuses queue entry for banned `player_id`.
- **Transport:** auth-tag verification is the first gate; failed packets never reach validators.
- **Replication:** validators run between recv and apply; rejected inputs never alter authoritative state.
- **Scripting:** mod sandbox API is the only client surface that can affect sim; rate-limited & capability-gated (→ `docs/specs/scripting/sandbox.md`).
- **Agent SDK:** auto-replay capture pipes to forensic store (→ `docs/specs/agent/replay.md`).
- **Editor:** flagged-session viewer; replays the suspect window with overlay markers (→ `docs/specs/editor/debug.md`).

## Open-Source-Friendly Design
- All anti-cheat code is MIT and visible.
- Strength comes from: server authority, encryption, validators, behavioral aggregation, AI-driven offline analysis — NOT from obscurity.
- Studios needing kernel anti-cheat may layer proprietary solutions on top via a `Validator` plugin; not shipped by Nexus core.

## Test Requirements
- T1: Scripted bot with uniform input cadence flagged within 5 minutes.
- T2: Teleport hack (position jump >max_velocity·dt) rejected on first input; ledger entry created.
- T3: Replayed packet (old nonce) dropped, never applied.
- T4: Revoked ticket: peer kicked within 2 s of revocation event on any shard.
- T5: Forensic bundle reproduces flagged sim window deterministically (→ `docs/specs/physics/determinism.md`).
- T6: Validator chain holds <30 µs p99 on 64-peer FPS at 60 Hz.
- T7: No false-positive disconnects across 10K legitimate session-hours in soak test.

## Prior Art
- ✓ Valve VAC architecture (the server-side parts) — input-pattern detection.
- ✓ Riot Vanguard / EasyAntiCheat — what NOT to mirror in an open-source engine (kernel intrusion).
- ✓ Overwatch GDC 2017 — server-authoritative model + lag compensation that doesn't trust client.
- ✓ FairFight (behavioral) — pure-telemetry analysis; matches Nexus open-source stance.
- ✓ Quake 3 / Tribes — server-side movement validation patterns.
- ✗ Security-through-obscurity client checks — bypassable, hostile to modders.

## Open Questions
- [DECISION NEEDED] Behavioral model: rules + thresholds vs. ML classifier on telemetry stream.
- [DECISION NEEDED] Ban list distribution: per-game vs. cross-game federation under Nexus Cloud.
- [DECISION NEEDED] Default action on flag: auto-kick at score X, or always queue for review?
- [DECISION NEEDED] Plugin ABI for proprietary anti-cheat add-ons (kernel modules) — allow but isolate?
- [BENCHMARK NEEDED] Validator chain p99 latency at 256-peer scale.
