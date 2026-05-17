<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Networking

> Networking polls inputs, snapshots state, drives the simulation forward (and backward, for rollback). Core exposes a deterministic step + snapshot/restore surface; networking owns when each tick runs.

Related specs:
- `docs/specs/core/ecs.md` · `docs/specs/core/events.md` · `docs/specs/core/hal.md`
- `docs/specs/networking/overview.md` · `docs/specs/networking/rollback.md` · `docs/specs/networking/replication.md` · `docs/specs/networking/transport.md`
- Sibling: `docs/contracts/core-physics.md` (physics snapshot composes into world snapshot)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (deterministic sim, snapshot) | `nexus-core` (+ all sim subsystems) | `crates/core/src/sim.rs` |
| Provider (input devices) | `nexus-hal` | `crates/hal/src/input.rs` |
| Consumer / orchestrator | `nexus-networking` | `crates/networking/src/lib.rs` |

Pattern reference: GGPO callbacks (`save_game_state`, `load_game_state`, `advance_frame`) — see https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md and Rust port `ggrs` (https://docs.rs/ggrs). Server-authoritative replication patterns from `ValveSoftware/GameNetworkingSockets`.

---

## Call flow (rollback mode)

```
 every render frame (variable):
   ─► net::poll_transport()        ── receive remote input bytes
   ─► net::collect_local_input()   ── from HAL devices
   ─► net::run_frame()
        │
        ├─ predict: while local_frame < target_frame
        │     core::advance_frame(inputs[frame])         ← deterministic step
        │     core::snapshot(frame) (every K frames)
        │
        ├─ on remote input arrival for past frame F:
        │     core::restore(snapshot_at(F-1))
        │     replay frames F..local_frame with corrected inputs
        │     emit RollbackEvent { from: F, len: N }
        │
        └─ net::send_local_inputs()
```

Server-authoritative mode replaces predict/replay with `apply_state_delta(snapshot)` from server tick.

---

## Provided API (Core surface that Networking calls)

```rust
pub trait NetSimDriver: Send + Sync + 'static {
    /// Advance the entire simulation by exactly one fixed tick using these inputs.
    /// MUST be deterministic: identical (snapshot, inputs) → identical post-state.
    fn advance_frame(
        &mut self,
        frame: FrameId,
        inputs: &PlayerInputs,
    ) -> Result<AdvanceStats, NetSimError>;

    /// Serialize the full simulation state at this frame.
    fn snapshot(&self, frame: FrameId) -> Result<WorldSnapshot, NetSimError>;

    /// Restore from a prior snapshot. After this call, frame counter == snap.frame.
    fn restore(&mut self, snap: &WorldSnapshot) -> Result<(), NetSimError>;

    /// Apply an authoritative server snapshot (delta or full). Used in client-server mode.
    fn apply_state_delta(&mut self, delta: &StateDelta) -> Result<(), NetSimError>;

    /// Cheap checksum of current sim state (used to detect desync without full snapshot).
    fn state_hash(&self, frame: FrameId) -> u64;
}

pub trait NetInputSource: Send + Sync + 'static {
    fn local_player_id(&self) -> PlayerId;
    fn collect_local_input(&mut self, frame: FrameId) -> PlayerInput;
}
```

## Required API (Networking surface that Core calls)

```rust
pub trait Networking: Send + Sync + 'static {
    fn tick(&mut self) -> Result<(), NetError>;        // called every render frame
    fn connect(&mut self, peer: PeerAddr) -> Result<SessionId, NetError>;
    fn disconnect(&mut self, sid: SessionId);
    fn ready_to_advance(&self) -> bool;                // true => safe to advance
    fn current_frame(&self) -> FrameId;                // simulation frame
    fn rtt_ms(&self, sid: SessionId) -> Option<u32>;
    fn drain_events(&mut self, bus: &EventBus) -> usize;
}
```

---

## Data Schema

```rust
pub struct PlayerId(pub u8);          // 0..MAX_PLAYERS, 8 max for rollback
pub const MAX_PLAYERS: u8 = 8;
pub struct PlayerInputs<'a>(pub &'a [PlayerInput; MAX_PLAYERS as usize]);

#[repr(C)]
pub struct PlayerInput {
    pub buttons: u32,                 // bitfield, project-defined
    pub axes: [i16; 6],               // sticks, triggers; fixed-point
    pub seq: u32,                     // monotonic per player
    pub flags: InputFlags,            // Disconnected | Predicted | Confirmed
}

pub struct WorldSnapshot {
    pub frame: FrameId,
    pub schema: u16,                  // contract version
    pub checksum: u64,                // xxhash64 of payload
    pub payload: Box<[u8]>,           // flatbuffer / postcard-serialized World + subsystem snapshots
}
// payload structure (per AI-first, machine-parseable):
//   [header: 16 B][world: u32 len + bytes][physics: u32 + bytes][audio_state: u32 + bytes][...]

pub struct StateDelta {
    pub from_frame: FrameId,
    pub to_frame: FrameId,
    pub changed: Box<[ComponentDelta]>,
    pub destroyed: Box<[EntityId]>,
}

pub struct ComponentDelta {
    pub entity: EntityId,
    pub component_id: u16,
    pub op: DeltaOp,                  // Insert | Update | Remove
    pub data: Box<[u8]>,
}

pub struct AdvanceStats { pub frame: FrameId, pub cpu_us: u32, pub state_hash: u64 }

pub enum NetEvent {
    PeerConnected(SessionId, PlayerId),
    PeerDisconnected(SessionId, DisconnectReason),
    InputDropped { player: PlayerId, frame: FrameId },
    Rollback { from: FrameId, len: u16 },
    Desync { local_hash: u64, remote_hash: u64, frame: FrameId },
}
```

Snapshot header (binary, machine-parseable):

```text
offset  size  field
   0      4   magic = "NEXS"
   4      2   schema version
   6      2   subsystem count
   8      8   frame id (u64 LE)
  16      8   checksum (xxhash64 LE)
  24    var   subsystem records: [u16 id][u32 len][bytes]
```

TOML rollback config (`Nexus.toml`):

```toml
[networking.rollback]
max_rollback_frames = 8
input_delay_frames  = 2
snapshot_every_k    = 4
state_hash_every_k  = 1
desync_action       = "disconnect"   # | "log" | "force_resync"
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Core | `advance_frame(F, I)` is deterministic and pure w.r.t. (snapshot at F, I). |
| O-2 | Core | `restore(snap)` is total inverse of `snapshot()` — bit-identical state. |
| O-3 | Net | `advance_frame` is called with strictly monotonically increasing frames between rollback windows. |
| O-4 | Net | Maximum rollback distance ≤ `max_rollback_frames`; beyond that, force resync via full snapshot. |
| O-5 | Core | `snapshot(F)` does not mutate state (`&self`); `restore` is the only mutation path during rollback. |
| O-6 | Both | All subsystems contributing to snapshot honor their own snapshot/restore contract (see `docs/contracts/core-physics.md` §PhysicsSnapshot). |
| O-7 | Net | `state_hash` is cheap (< 100 µs) and deterministic across machines for given `Determinism` mode. |
| O-8 | Core | `apply_state_delta` is atomic per call: either fully applied or world unchanged. |

---

## Threading & Concurrency Rules

- Transport I/O runs on a dedicated OS thread (or async runtime task pool).
- `advance_frame` runs on the main schedule thread; takes `&mut Core`.
- `snapshot` is `&self` and reentrant; networking may snapshot from a worker if it copies cheaply.
- `restore` takes `&mut Core`; MUST stop the world (no other systems run during it).
- Rollback events are queued and drained from main thread next `tick()`.
- Send/receive buffers are SPSC between transport thread and sim thread.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| `advance_frame` (re-sim) | ≤ 4 ms | 12 ms | sim must fit `N×` in one render frame, N = rollback len |
| `snapshot()` total | ≤ 2 ms | 8 ms | 1k entities; composes subsystem snapshots |
| Snapshot size | ≤ 16 kB | 64 kB | per 1k entities; fits in 1 UDP MTU pair |
| `restore()` total | ≤ 2 ms | 8 ms | |
| `state_hash` | ≤ 50 µs | 200 µs | per-frame desync check |
| `apply_state_delta` (server mode) | ≤ 1 ms | 4 ms | 100 entity diff |
| Input → other peer latency | ≤ RTT/2 + 1 frame | RTT/2 + 4 frames | |
| Rollback length p99 | ≤ 4 frames | 8 frames | else desync action |

References: GGPO recommends snapshot < 64 kB and re-sim < frame budget × max_rollback (https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md). GameNetworkingSockets QUIC-like reliability layer informs transport-side targets.

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `NET-001` | `TransportInit` | Could not bind socket | Retry alt port; else fatal |
| `NET-010` | `PeerTimeout` | No packet for `timeout_ms` | Emit `PeerDisconnected{Timeout}` |
| `NET-020` | `RollbackOverflow` | Needed rollback > `max_rollback_frames` | Request full resync from authority |
| `NET-021` | `Desync` | `state_hash` mismatch | Per config: log / disconnect / force resync |
| `NET-030` | `SnapshotTooLarge` | snapshot > hard limit | Fragment + reliable send; warn |
| `NET-031` | `SchemaMismatch` | snapshot schema ≠ local | Drop packet; reject peer |
| `NET-040` | `NotDeterministic` | local re-sim hash != original | Bug; capture replay + report |

---

## Versioning Rule

`nexus-contract-networking = "MAJOR.MINOR.PATCH"`.

- **MAJOR**: change snapshot header layout, change `PlayerInput` size/layout, change determinism guarantees, remove `apply_state_delta`.
- **MINOR**: add subsystem snapshot record (new `subsystem id`), add `NetEvent` variant, add `PlayerInput.flags` bit.
- **PATCH**: tuning, internal protocol message format (transport-internal only).

Snapshot header carries `schema` u16; receivers reject if MAJOR differs. Cross-version play forbidden by default.

---

## Test Matrix

`tests/contract_core_networking.rs`:

- T-01 Local-only: `advance_frame` 600 frames with seed → identical `state_hash` across two runs.
- T-02 Rollback: advance to F=100, snapshot, advance to F=110, restore snapshot, replay to 110 → final hash matches first run.
- T-03 Two clients, lockstep, simulated 80 ms RTT, 1 % loss → no desync over 60 s.
- T-04 Force rollback of 8 frames every second → no perceptible stutter (frame time p99 < 18 ms).
- T-05 Snapshot/restore round-trip: serialize → deserialize → restore → snapshot → byte-equal to first.
- T-06 Server mode: deltas applied in order yield same world as full snapshot at same frame.
- T-07 Desync injection: modify one entity remotely → `Desync` event within `state_hash_every_k` frames.
- T-08 Schema mismatch: replay v1 snapshot under v2 contract → `NET-031`, no crash.

---

## Open Questions

- [DECISION NEEDED] Snapshot format: postcard (compact) vs flatbuffers (zero-copy) vs custom. Postcard wins on size, flat on restore speed. → AGENT 07 + AGENT 02.
- [DECISION NEEDED] Determinism mode required for rollback: do we hard-require `Determinism::Fixed64Q32` (see `core-physics.md`), or allow f32 cross-platform? Cross-platform f32 == "best effort". → AGENT 05 + AGENT 07.
- [DECISION NEEDED] Input MAX_PLAYERS = 8 hard, or per-genre? MOBA wants 10; BR wants 100 (but BR is server-authoritative, not rollback). Keep 8 for rollback, separate path for replication.
- [BENCHMARK NEEDED] Snapshot size at 10k entities; current 64 kB cap is for 1k.
- [AGENT: 02] Confirm ECS exposes a snapshot/restore primitive at the `World` level (not per-system).
- [AGENT: 05] Physics snapshot composition into `WorldSnapshot.payload` — confirm subsystem id allocation.
- [AGENT: 06] Audio is normally NOT snapshot/restored; confirm "audio is presentation, not sim state" boundary.
