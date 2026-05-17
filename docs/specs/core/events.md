<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Core / Events

> Typed, frame-scoped, ordered event bus. Cross-system messaging without coupling, without allocation in the hot path, with deterministic replay.

## Boundaries

- **Owns**
  - Typed event bus: one `EventChannel<E>` per registered event type `E`.
  - Frame-scoped double-buffering: events written this frame are visible to all readers next frame (Bevy model) — eliminates "did I read this already?" ambiguity.
  - Reader cursors per consumer (system or external subscriber).
  - Ordering metadata: per-event `EventId(seq: u64, frame: u32, source: SourceTag)`.
  - Cross-thread submission (lock-free MPSC shards, drained at frame boundary).
  - External subscription (agent API, editor inspectors, telemetry exporters).
  - Replay sink: every event logged structurally for `docs/specs/agent/replay.md`.
  - Built-in event types from HAL pump (KeyPressed, GamepadConnected, …) and ECS lifecycle (EntitySpawned, ComponentAdded, …).
- **Does NOT own**
  - Components — events are NOT components. ECS may host an `EventReader<E>` system param for ergonomics, but storage lives here.
  - Persistent message queues across sessions — events expire after `MAX_RETAIN_FRAMES` (default 2).
  - Network packet delivery — networking has its own wire format. Network code may *publish* events locally after receiving packets.
  - RPC / request-response — events are one-way. Request-response is a separate concern (scripting bridge, agent API).
  - Audio events / animation events in the asset sense (those are timestamped data inside assets; this bus carries *runtime* events).
- **Depends on**
  - `core::memory` for per-channel `PoolAllocator` and per-thread `Arena` for write batching.
  - `core::jobs` for thread identity; reading from multiple threads coordinated by job system.
  - `core::math` (only for events that carry math types in payload).

## Architecture

```
   Producers (any thread)                Consumers (systems, agents, editor)
        │                                       ▲
        ▼                                       │
   ┌─────────────────────────┐   per-frame swap │
   │ EventChannel<E>         │                  │
   │   ┌─────────────────┐   │                  │
   │   │ buf[FRAME]      │   │ ← writes here    │
   │   ├─────────────────┤   │                  │
   │   │ buf[PREV]       │   │ ← read here ─────┘
   │   └─────────────────┘   │
   │   reader cursors[]      │
   │   per-thread shards[N]  │ ← MPMC writes
   └────────┬────────────────┘
            │ frame_end()
            ▼
   1. drain per-thread shards → merge into FRAME buf, assign seq#
   2. swap FRAME ↔ PREV
   3. clear new FRAME
   4. advance reader cursors that were stale (drop unread? warn? — policy)
   5. emit logged events to replay sink
```

**Double-buffering rule (key).** An event written in frame F is visible to readers in frame F+1 only. This:
- Removes "race to consume" ambiguity within a frame.
- Lets all systems in a frame agree on the same event set.
- Makes parallel reads from many systems trivially safe (PREV buffer is read-only).
- Costs one frame of latency. Acceptable for game logic; networking and input frame-coupling handled via dedicated "immediate event" channel (`docs/specs/networking/rollback.md` requirements).

**Immediate channel option.** A specific event type can be declared `Event::IMMEDIATE = true` — same-frame visibility. Required for:
- Input events bridged from HAL when scripts react in the same frame.
- Damage / hit events when game design demands same-frame chain reactions.

Immediate channels lose double-buffer safety: readers must use a `try_drain` API and order is "as committed", with explicit reordering hazards. Default is *not* immediate; opt-in must be justified.

**Ordering.** Within a single thread, writes preserve order. Across threads, the merge at `frame_end` sorts by `(producer_seq, thread_id)` using a stable deterministic rule (low thread_id first) so replay is reproducible. This means cross-thread order is NOT real-time order; it is a deterministic canonical order. Documented; required for replay.

**Reader model.** Two ergonomics:

1. **Pull (`EventReader<E>`)** — system param; holds a cursor; iter yields unread events. Most ECS systems use this.
2. **Push (`EventSubscriber<E>`)** — closure-callback; called inline at `frame_end` drain. Used by agent API and editor inspectors that listen across the FFI boundary.

**Cross-system communication rules.**
- Systems **must not** mutate state that other systems read in the same frame via events. Use commands or next-frame events instead.
- Events are the only sanctioned way to communicate between systems that do not share ECS access (i.e. cross-stage or cross-thread without overlap).
- Direct `&mut OtherSystemResource` access is allowed only when the systems are explicitly ordered.
- Networking, scripting, audio, renderer all consume events; only ECS systems and HAL pump produce them in v1.0. Scripting can produce — capability-gated (`docs/specs/scripting/sandbox.md`).
- Event payloads are POD-preferred: `Send + Sync + Clone + Serialize + Deserialize + 'static`. The `Serialize` bound is required for replay logging.

## Public API

```rust
// === Event trait ===
pub trait Event: Send + Sync + Clone + Serialize + DeserializeOwned + 'static {
    /// Default false. Set true to make events same-frame visible.
    const IMMEDIATE: bool = false;
    /// Frames to retain after first visible (default 1; immediate uses 1).
    const RETAIN_FRAMES: u32 = 1;
    /// For ordering across producers within a frame. Default = type name.
    const SOURCE_TAG: &'static str = "user";
}

// === Bus ===
pub struct EventBus { /* private */ }
impl EventBus {
    pub fn new(cfg: EventBusConfig) -> EventBus;
    pub fn register<E: Event>(&self);                            // idempotent
    pub fn writer<E: Event>(&self) -> EventWriter<'_, E>;
    pub fn reader<E: Event>(&self) -> EventReader<'_, E>;
    pub fn subscribe<E: Event, F>(&self, cb: F) -> SubscriptionId
        where F: Fn(&E, EventMeta) + Send + Sync + 'static;
    pub fn unsubscribe(&self, id: SubscriptionId);
    pub fn frame_end(&self);                                     // engine calls once per frame
    pub fn telemetry(&self) -> EventTelemetry;
    pub fn drain_for_replay<F>(&self, mut visit: F)
        where F: FnMut(&'static str /*type name*/, &[u8] /*payload*/, EventMeta);
}
pub struct EventBusConfig {
    pub per_channel_capacity: usize,        // default 1024
    pub per_thread_shard_capacity: usize,   // default 256
    pub overflow_policy: OverflowPolicy,    // DropOldest | DropNewest | Reject | Grow
    pub log_for_replay: bool,
}

// === Writer / Reader ===
pub struct EventWriter<'b, E: Event> { /* private */ }
impl<'b, E: Event> EventWriter<'b, E> {
    pub fn send(&self, e: E);
    pub fn send_batch(&self, es: impl IntoIterator<Item = E>);
}

pub struct EventReader<'b, E: Event> { /* private */ }
impl<'b, E: Event> EventReader<'b, E> {
    pub fn iter(&mut self) -> impl Iterator<Item = &E>;
    pub fn iter_with_meta(&mut self) -> impl Iterator<Item = (&E, EventMeta)>;
    pub fn len(&self) -> usize;
    pub fn clear(&mut self);                                     // skip remaining
    pub fn try_drain_immediate(&mut self) -> impl Iterator<Item = &E>;  // only IMMEDIATE channels
}

// === Metadata ===
#[derive(Copy, Clone)]
pub struct EventMeta {
    pub id: EventId,           // (seq, frame, source_tag_id)
    pub frame: u32,
    pub seq: u64,
    pub producer_thread: u16,
    pub source: SourceTag,
    pub tick_engine_ns: u64,
}
pub struct EventId(u128);     // canonical 128-bit id for replay/debug
pub struct SourceTag(pub &'static str);   // "hal", "ecs", "script:user.lua", "agent"

// === Telemetry ===
pub struct EventTelemetry {
    pub channels: Vec<ChannelStat>,
    pub events_published_last_frame: u64,
    pub events_dropped_last_frame: u64,
    pub immediate_writes_last_frame: u64,
}
pub struct ChannelStat {
    pub type_name: &'static str,
    pub backlog: u32,
    pub written_last_frame: u32,
    pub read_last_frame: u32,
    pub dropped_last_frame: u32,
    pub readers: u8,
}

// === Built-in events (registered at engine init) ===
pub struct EvKeyPressed { pub key: KeyCode, pub mods: ModState }
pub struct EvKeyReleased { pub key: KeyCode }
pub struct EvMouseMoved { pub x: f32, pub y: f32, pub dx: f32, pub dy: f32 }
pub struct EvGamepadButton { pub id: GamepadId, pub button: GpButton, pub down: bool }
pub struct EvEntitySpawned { pub entity: Entity, pub archetype: ArchetypeId }
pub struct EvEntityDespawned { pub entity: Entity }
pub struct EvComponentAdded { pub entity: Entity, pub component: ComponentId }
pub struct EvComponentRemoved { pub entity: Entity, pub component: ComponentId }
pub struct EvCollision { pub a: Entity, pub b: Entity, pub point: Vec3, pub normal: Vec3, pub impulse: f32 }
pub struct EvAssetLoaded { pub handle: AssetId, pub kind: AssetKind, pub bytes: u64 }
pub struct EvAssetFailed { pub handle: AssetId, pub error: ErrAsset }
pub struct EvNetPacketArrived { pub peer: PeerId, pub channel: u8, pub bytes: u32 }
pub struct EvScriptLoaded { pub script: ScriptId }
pub struct EvLowMemory { /* mirrors HAL */ }
pub struct EvAppPause; pub struct EvAppResume;
// (Full list extends per system; each system declares its own in its spec.)
```

## Performance Contract

| Operation | Target | Hard limit |
|---|---|---|
| `EventWriter::send` (hot thread) | ≤ 30 ns | 120 ns |
| `EventWriter::send_batch` (per item amortized) | ≤ 8 ns | 25 ns |
| `EventReader::iter` per event | ≤ 4 ns + payload deref | 12 ns |
| `frame_end` merge & swap (1 k events, 8 threads) | ≤ 25 µs | 100 µs |
| Channel register (one-time per type) | ≤ 1 µs | 10 µs |
| Cross-thread shard contention p99 (16 producers) | ≤ 300 ns | 1.5 µs |
| Subscription callback dispatch | ≤ 80 ns + callback time | 300 ns |
| Replay log encode (per event) | ≤ 200 ns + payload size | 1 µs |
| Memory per channel idle | ≤ 8 KiB | 32 KiB |
| Total bus overhead per frame (no events) | ≤ 2 µs | 10 µs |
| Determinism: same input → same ordering | bit-identical merge order | n/a |

`[BENCHMARK NEEDED]` — especially shard contention on 16+ cores.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `EVT.E001` | Event type not registered before use | Call `bus.register::<E>()` at startup |
| `EVT.E002` | Channel capacity exceeded under `OverflowPolicy::Reject` | Caller backs off; increase capacity in config |
| `EVT.E003` | `IMMEDIATE` channel read outside producing frame | Refactor to use deferred; bug surfaces in debug |
| `EVT.E004` | Subscriber callback panicked | Caught; subscription auto-removed; logged at error level |
| `EVT.E005` | Replay decode failed (schema mismatch on type) | Skip event; surface to replay tool; do not abort replay |
| `EVT.E006` | Frame-end called while writer still alive | Compile-time prevented for `EventWriter<'b, E>` borrow; runtime check on FFI paths |
| `EVT.E007` | Cross-thread reader created (readers are `!Sync`) | Compile-time error; ensure one reader per thread per channel |
| `EVT.E008` | Capability denied (scripting attempted to publish non-allowlisted event) | Surface to script as recoverable; → `docs/specs/scripting/sandbox.md` |

## Integration Points

- **`core::hal`** — HAL pump translates each `HalEvent` into a typed engine event (`EvKeyPressed`, `EvGamepadConnected`, …) and publishes via the bus. → `docs/specs/core/hal.md`
- **`core::ecs`** — ECS publishes lifecycle events (spawn / despawn / component add-remove). ECS exposes `EventReader<E>` / `EventWriter<E>` as system params, thin wrappers over this bus. → `docs/specs/core/ecs.md`
- **`core::jobs`** — multi-thread producers write to per-thread shards. `frame_end` runs as a `Critical` lane job at end of frame. → `docs/specs/core/jobs.md`
- **`core::memory`** — each registered channel allocates a `PoolAllocator<E>` of declared capacity, plus per-thread `Arena`-backed shards. Total tracked under `MemTag("events")`. → `docs/specs/core/memory.md`
- **`physics`** — emits `EvCollision`, `EvTriggerEnter`, `EvTriggerExit` at end of physics step. → `docs/contracts/core-physics.md`
- **`networking`** — translates inbound packets into typed events (`EvPlayerJoined`, `EvChatMessage`, …); outbound events that need replication are explicitly tagged. → `docs/contracts/core-networking.md`
- **`audio`** — listens for `EvCollision`, `EvFootstep`, music-cue events to trigger sounds. → `docs/specs/audio/overview.md`
- **`scripting`** — Lua/Rune scripts can subscribe to allowlisted events; can publish events declared in their manifest. → `docs/contracts/core-scripting.md`
- **`agent`** — agent API exposes the event bus as a JSON-RPC subscription. Every event is also fed to the replay log if `log_for_replay` is true. → `docs/contracts/core-agent.md`, `docs/specs/agent/telemetry.md`, `docs/specs/agent/replay.md`
- **`editor`** — inspector subscribes to lifecycle events for live updates; debug panel subscribes to selected channels for "event timeline" view. → `docs/specs/editor/debug.md`

## Test Requirements

1. `register_idempotent` — `register::<E>()` twice does not double-allocate; second call is a no-op.
2. `unregistered_use_returns_E001` — using a writer for an unregistered event surfaces `EVT.E001` (debug-panics; release returns error).
3. `double_buffer_visibility` — event sent in frame F not visible in F; visible in F+1; gone in F+2.
4. `immediate_channel_same_frame` — events on `IMMEDIATE` channels appear in `try_drain_immediate` within the same frame.
5. `multi_thread_writes_no_loss` — 8 threads × 100 k sends → exact total visible to readers next frame.
6. `cross_thread_order_deterministic` — same producer sequence on same thread layout → same `EventId.seq` ordering across 100 runs.
7. `reader_cursor_independent` — two readers of same channel iterate same events independently; no consumption interference.
8. `overflow_drop_oldest` — capacity 100, send 150 → reader sees newest 100.
9. `overflow_reject_returns_err` — `OverflowPolicy::Reject` after capacity returns `EVT.E002`; bus state unchanged.
10. `subscriber_panic_isolated` — panicking subscriber removed; other subscribers unaffected; bus continues.
11. `replay_log_roundtrip` — every event written goes to replay log; decoding the log yields identical events in identical order.
12. `replay_schema_skew` — event type schema change between record / replay → `EVT.E005` per event, replay continues.
13. `script_capability_enforced` — scripting attempt to publish an unallowed event returns `EVT.E008`.
14. `frame_end_idempotent_on_empty` — no events → `frame_end` cost ≤ 2 µs.
15. `telemetry_accurate` — `events_published_last_frame` exactly matches send count.
16. `no_alloc_in_hot_path_steady_state` — once channels at capacity, `send` performs zero allocations (allocation counter delta = 0 over 10 k sends).
17. `loom_concurrency_model` — `loom` test on shard merge & swap finds no data race, no lost write.
18. `fuzz_payloads` — `cargo-fuzz` 24 h on send-then-decode-replay: no panic, no leak.
19. `hal_pump_to_bus` — synthesized HAL events appear as typed engine events with `source = SourceTag("hal")`.
20. `cross_system_no_same_frame_mutation` — clippy/architecture lint asserts no system reads an event and mutates shared state another system in the same stage reads (best-effort static check).

## Prior Art

- **Bevy events** (`bevy_ecs::event`)
  - ✓ Double-buffered, frame-scoped, typed.
  - ✓ `EventReader<E>` cursor as system param.
  - ✗ Single-threaded send into the channel (Bevy serializes via system access control); we add lock-free MPSC shards because non-ECS producers (HAL, networking, scripting) live outside the schedule.
- **EnTT dispatcher** (`skypjack/entt`)
  - ✓ Typed events, sink/source separation.
  - ✗ Single-threaded; immediate by default. Our default is deferred.
- **flecs observers** — events as a structural feature of ECS (every component change is observable).
  - ✓ Observation primitives for "when this component changes…".
  - ✗ Too tightly coupled to ECS; we keep events orthogonal to component change-detection (which lives in `core::ecs`).
- **Unreal `FGameplayMessageSubsystem`** — global typed event broker.
  - ✓ Decouples gameplay systems cleanly.
  - ✗ Reflection-heavy; our typed-Rust approach is lighter.
- **Disruptor pattern (LMAX)** — ring buffer with sequence-numbered cursors; informs our shard + merge design at frame boundary.
- **Tokio / async-channel bounded MPSC** — informs the lock-free shard implementation choice; we likely depend on `crossbeam-channel` or `flume` for the shard, or roll a minimal SPSC ring per thread.
  - Bias: SPSC ring per thread + single-consumer drain in `frame_end`.
- **Godot `signal`** — pattern of "publisher declares signal, consumer connects". Inspires `subscribe<E>` API, but we keep typed-Rust at compile time.
- **GGPO event delivery** — informs the "events that need to be replicable must be serializable and replayable" stance.

## Open Questions

1. `[DECISION NEEDED]` — `EventReader<E>` location: lives in `core::events` (and ECS uses it via `SystemParam` impl) vs. lives in `core::ecs` (and wraps the bus). Bias: lives here; ECS provides the `SystemParam` impl in a separate adapter module. Cross-impact: `docs/specs/core/ecs.md` Open Question 5.
2. `[DECISION NEEDED]` — Default overflow policy. `DropOldest` matches gameplay-event expectations ("I only care about recent damage"). `Reject` is safer for billing-critical paths (RPC ack). Bias: `DropOldest` default, configurable.
3. `[DECISION NEEDED]` — Cross-thread ordering: deterministic canonical order (low thread_id first) vs. timestamp order. Canonical is replayable; timestamp is closer to real-time intuition. Bias: canonical; timestamp is in metadata for debug.
4. `[BENCHMARK NEEDED]` — All perf numbers.
5. `[DECISION NEEDED]` — Subscriber callbacks run on `frame_end` thread only (simple, can stall frame) or on a dedicated "subscriber" worker (parallelizable, callbacks must be `Send + Sync` already). Bias: `frame_end` thread, with a cap on per-callback time (warn if exceeded).
6. `[DECISION NEEDED]` — Allow event payload sizes > 256 B (boxed) or cap small? Bias: cap at 256 B; larger payloads must hold a handle / pointer with separate ownership. Keeps cache lines tight.
7. `[DECISION NEEDED]` — Replay log: binary (postcard / bincode) vs. JSON (per AI-first mandate). Binary is faster, JSON is agent-friendly. Bias: binary by default, JSON tap available for agents (cross-ref `docs/specs/agent/replay.md`).
8. `[DECISION NEEDED]` — Should the bus survive a `World::restore(snapshot)` (cross-ref `core::ecs`)? Restoring world state mid-stream leaves in-flight events ambiguous. Bias: `restore` flushes the bus; declare in contract.
9. `[DECISION NEEDED]` — Should networking-replicated events have a dedicated channel kind (`ReplicatedEvent`) with built-in serialization-and-send semantics? Cross-impact: `[AGENT: 07]` networking. Bias: yes, as a thin layer atop this bus.
