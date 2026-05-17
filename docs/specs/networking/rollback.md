<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Networking — Rollback Netcode

> GGPO-inspired rollback: send inputs only, predict remote inputs locally, rewind and resimulate when the truth arrives.

## Boundaries
- Owns: input ring buffer, prediction, confirmation, rollback trigger, resimulation driver, sync test, save/load state hooks.
- Does NOT own:
  - The deterministic sim itself → `docs/specs/physics/determinism.md`, `docs/specs/core/ecs.md`
  - State serialization format → `docs/contracts/core-networking.md`
  - Transport/reliability → `transport.md`
- Depends on:
  - `docs/specs/physics/determinism.md` — fixed-point math, deterministic step.
  - `docs/contracts/core-networking.md` — `save_state(frame) -> StateHandle`, `load_state(StateHandle)`, `advance_frame(inputs)`.
  - `docs/specs/core/math.md` — fixed-point primitives.

## Architecture
```
Frame timeline (peer A, 60 Hz):

frame:    96    97    98    99   100   101   102
local in:  L96   L97   L98   L99  L100  L101  L102
remote:   R96   R97    ?    ?    ?     ?      ?      ← network in flight
predict:               R97  R97  R97   R97   R97    ← repeat last confirmed

sim:      ✔     ✔     ✓pre ✓pre ✓pre  ✓pre  ✓pre   ← speculative state

[t = 102, packet R98..R100 arrives]

  rollback target = 98   (earliest changed frame)
  load_state(snapshot[98])
  for f in 98..=102:
      advance_frame(real_inputs_if_known_else_predict)
  emit telemetry { rollback_depth = 4 }
```

```
Per-frame loop:

  ┌─────────────┐
  │ poll input  │
  └──────┬──────┘
         │ local_input
  ┌──────v────────┐         ┌────────────────┐
  │ send_input(f) │────────►│ peers (UDP)    │
  └──────┬────────┘         └──────┬─────────┘
         │                         │ remote_inputs
  ┌──────v────────────┐    ┌──────v─────────┐
  │ predict missing   │◄───┤ recv & ack     │
  └──────┬────────────┘    └──────┬─────────┘
         │                        │
  ┌──────v────────────┐    ┌──────v──────────────────┐
  │ advance_frame()   │    │ detect divergence?      │
  │ save_state(f)     │    │  yes → rollback(target) │
  └───────────────────┘    └─────────────────────────┘
```

## Public API
| Symbol | Purpose |
|---|---|
| `rollback::Session<I, S>` | Generic over input type `I` and state handle `S`. |
| `Session::new(cfg: RollbackCfg)` | `{ peers, local_index, input_delay, max_rollback, sync_test_interval }`. |
| `Session::add_local_input(i: I)` | Submit input for current frame. |
| `Session::advance(callbacks: &mut dyn SessionCallbacks<I,S>)` | Drives sim; may call `save_state`, `load_state`, `advance_frame` multiple times. |
| `SessionCallbacks::save_state(frame) -> S` | Engine returns a serialized state snapshot. |
| `SessionCallbacks::load_state(handle: &S)` | Restore sim to that snapshot. |
| `SessionCallbacks::advance_frame(inputs: &[I])` | Run one deterministic tick. |
| `SessionCallbacks::on_event(ev: RollbackEvent)` | Synchronizing, Synchronized, Disconnected, ConnectionInterrupted, Desync. |

## Wire Format (rollback input packet)
```
struct InputPacket {
  u16  protocol_id;            // versioning
  u16  peer_seq;               // packet seq for ack
  u32  ack_frame;              // highest frame i have confirmed
  u32  start_frame;            // first frame included
  u8   count;                  // 1..=MAX_INPUTS_PER_PACKET (typ 8)
  Input inputs[count];         // bit-packed; XOR delta vs prev common
  u32  state_hash;             // optional, only on sync_test frames
  u64  send_timestamp_ns;
}
```

## Performance Contract
| Metric | Target | Hard limit |
|---|---|---|
| Tick rate | 60 Hz | 30 Hz minimum |
| `save_state` time | <100 µs / 1K entities | 500 µs |
| `load_state` time | <100 µs / 1K entities | 500 µs |
| `advance_frame` time | <2 ms / 1K entities | 6 ms (one tick budget at 60 Hz = 16.6 ms; rollback of 8 frames must fit) |
| Max rollback depth (default) | 8 frames | 16 frames |
| Input packet size | <64 B typical | 512 B |
| Per-frame input bandwidth (2p) | <8 KB/s | 16 KB/s |

Worst-case resim budget: `max_rollback × advance_frame_time + 2 × save/load ≤ tick_budget`.

## Determinism Requirements
Rollback REQUIRES bit-exact determinism. Enforced contracts:
1. All sim math uses fixed-point (`Fx32`, `Fx64`) — see `docs/specs/core/math.md`.
2. RNG seeded per frame from `(session_seed, frame)`.
3. No `f32`/`f64` in sim path (linter rule, CI-enforced).
4. No iteration over `HashMap` — use `BTreeMap` or `IndexMap`.
5. Sim ticks run in a single thread OR with a deterministic job graph (→ `docs/specs/core/jobs.md`).
6. Asset loads complete before sim start; no lazy loads mid-session.
7. Physics: → `docs/specs/physics/determinism.md` (fixed-point Rapier fork or in-house solver).

## Input Prediction
- Default: repeat last known remote input.
- Optional: per-game predictor callback `predict(history: &[I]) -> I` (e.g. clamp analog stick decay).
- Predicted inputs flagged; resim on confirmation only if predicted != actual.

## Sync Test (anti-desync)
- Every `sync_test_interval` frames (default 60), each peer hashes its state and embeds in input packet.
- Mismatch → emit `RollbackEvent::Desync { frame, local_hash, remote_hash }`.
- Engine auto-captures snapshot + input log for replay (→ `docs/specs/agent/replay.md`).
- CI mode: dual-instance same-process run with cross-checked hashes every frame.

## Error Contract
| Code | Meaning | Caller action |
|---|---|---|
| `RB_E_NOT_DETERMINISTIC` | sync_test hash mismatch | Capture replay, kill session, file bug |
| `RB_E_ROLLBACK_OVERFLOW` | needed rollback > max | Force-resync from remote snapshot |
| `RB_E_PEER_LAGGING` | peer hasn't ack'd in N frames | Stall (frame freeze) until ack or timeout |
| `RB_E_INPUT_TOO_LATE` | local input arrived after frame closed | Drop, log telemetry |

## Telemetry (per frame)
```
{
  "ts": ns,
  "frame": u32,
  "rollback_depth": u8,
  "predicted_inputs": u8,
  "rtt_ms": { "peer_id": f32 },
  "input_delay_frames": u8,
  "save_state_us": u32,
  "load_state_us": u32,
  "resim_us": u32,
  "state_hash": u32?  // only on sync_test frames
}
```

## Integration Points
- **Core ECS:** `save_state` serializes replicated components only (tag-based) → `docs/contracts/core-networking.md`.
- **Physics:** must implement `physics::step_deterministic(dt_fx)` and `physics::snapshot()` → `docs/specs/physics/determinism.md`.
- **Audio:** sounds triggered during predicted frames are tagged "speculative"; on rollback, mute + restart if event still valid (→ `docs/specs/audio/overview.md`).
- **Renderer:** never rolled back; reads latest state, interpolates → `docs/specs/renderer/overview.md`.
- **Agent SDK:** desync events trigger automatic replay capture (→ `docs/specs/agent/replay.md`).

## Test Requirements
- T1: 2-peer match runs 10 min with 50 ms RTT, 0% loss — zero desyncs.
- T2: 2-peer match with 100 ms RTT, 5% loss — desync rate = 0; mean rollback depth ≤ 3.
- T3: 4-peer match with mixed RTTs (50/80/120/200 ms) — frame stalls ≤ 1% of frames.
- T4: Deliberate non-determinism injection (use `HashMap` iter) — caught by sync_test within 60 frames.
- T5: Save/load round trip preserves all replicated state bit-identical, 10K random entities.
- T6: Rollback depth 16 completes resim within 16.6 ms on reference hardware [BENCHMARK NEEDED].

## Prior Art
- ✓ Tony Cannon's GGPO (`pond3r/ggpo`) — model, callback shape, `save/load/advance`.
- ✓ GGPO white paper / "Confirming Frames" pattern.
- ✓ `rollback-rs` / `backroll-rs` — Rust GGPO ports; reference for callback ergonomics.
- ✓ Skullgirls / Street Fighter V postmortems — input delay tuning (`input_delay = 2..=4` typical).
- ✓ Guilty Gear Strive — hybrid delay+rollback UX.
- ✗ Lockstep (peer waits for slowest input) — unacceptable latency; rejected.

## Open Questions
- [DECISION NEEDED] Default `input_delay`: 0 (pure rollback) vs. 2 (hybrid)?
- [DECISION NEEDED] Snapshot storage: ring buffer of full clones vs. copy-on-write archetype pages?
- [DECISION NEEDED] Support >4 peer rollback? GGPO traditionally peer-to-peer mesh; relay-assisted variant may extend.
- [BENCHMARK NEEDED] `save_state` cost at 10K entities — feasibility of 16-frame rollback.
