<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Agent API

> AI agents (humans or autonomous) drive the engine over JSON-RPC + structured telemetry streams. The agent surface is a strict superset of the scripting surface plus introspection, snapshot, and scenario control.

Related specs:
- `docs/specs/core/ecs.md` · `docs/specs/core/events.md`
- `docs/specs/agent/overview.md` · `docs/specs/agent/api.md` · `docs/specs/agent/headless.md` · `docs/specs/agent/telemetry.md` · `docs/specs/agent/scenarios.md` · `docs/specs/agent/replay.md` · `docs/specs/agent/semantic.md` · `docs/specs/agent/sdk.md`
- Sibling: `docs/contracts/core-scripting.md` (capability model is shared) · `docs/contracts/core-networking.md` (snapshot composition)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (engine, ECS, telemetry source) | `nexus-core` + all subsystems | engine-wide |
| Provider (gate, transport) | `nexus-agent` | `crates/agent/src/lib.rs` |
| Consumer | external `nexus-agent-sdk` (Rust/Python) | out-of-process or in-proc |

Transport: JSON-RPC 2.0 over either (a) Unix domain socket / Named Pipe, (b) WebSocket, (c) in-process function call. NDJSON for telemetry stream. Wire format choice transparent to API contract.

Capability model is a superset of `ScriptCaps` (see `docs/contracts/core-scripting.md`), plus agent-only caps for introspection / time control. Per Bertrand Meyer DbC: every RPC has explicit pre/post conditions encoded in its JSON schema.

---

## Call flow

```
 nexus-agent-sdk (external process)
     │   JSON-RPC request:
     │   {"jsonrpc":"2.0","id":7,"method":"ecs.spawn",
     │    "params":{"components":{"Transform":{...},"Mesh":"dragon"}}}
     ▼
 transport (uds / ws / inproc)
     │
     ▼
 agent::router  ── auth(session)  ── cap-check  ── handler
     │
     ├─ READ ops: snapshot &World, return result
     ├─ WRITE ops: enqueue Command, apply at frame boundary
     ├─ CTRL ops (pause, step, snapshot, restore): main-loop coordinator
     │
     ▼
 response (same id) + (optional) telemetry stream:
   {"channel":"telemetry","schema":1,"payload":{...}}\n
   {"channel":"event:damage","schema":1,"payload":{...}}\n
```

---

## Provided API (Agent surface — JSON-RPC methods)

Naming: `domain.verb` (lowercase, dotted). All take/return JSON. Each method is contract-checked against the schema below; bad inputs → standard JSON-RPC error.

| Method | Caps required | Returns |
|---|---|---|
| `engine.info` | — | `{version, contract_versions, platform, headless, frame}` |
| `engine.pause` / `engine.resume` | `TIME_CTRL` | `{paused: bool}` |
| `engine.step(n)` | `TIME_CTRL` | `{frame}` — advance N frames synchronously |
| `engine.speed(mult)` | `TIME_CTRL` | sets sim speed (1.0 = realtime; up to 1000 in headless) |
| `engine.snapshot(label?)` | `STATE_READ` | `{snapshot_id, bytes, checksum}` |
| `engine.restore(snapshot_id)` | `STATE_WRITE` | `{frame}` |
| `engine.shutdown` | `ENGINE_CTRL` | `{}` |
| `ecs.spawn(components)` | `ECS_SPAWN` | `{entity}` |
| `ecs.despawn(entity)` | `ECS_DESPAWN` | `{}` |
| `ecs.get(entity, names[])` | `ECS_READ` | `{components: {...}}` |
| `ecs.set(entity, components)` | `ECS_WRITE` | `{}` |
| `ecs.query(filter)` | `ECS_READ` | `{entities: [{entity, components}], cursor?}` (paginated) |
| `ecs.count(filter)` | `ECS_READ` | `{n}` |
| `ecs.schema` | `ECS_READ` | `{components: [{name, fields, doc}]}` — introspection |
| `events.send(channel, payload)` | `EVENTS_SEND` | `{}` |
| `events.subscribe(channel_pattern)` | `EVENTS_RECEIVE` | `{sub_id}` — streams over NDJSON |
| `events.unsubscribe(sub_id)` | — | `{}` |
| `telemetry.subscribe(channels[], hz?)` | `TELEMETRY_READ` | `{sub_id}` |
| `assets.list(filter)` | `ASSETS_READ` | `{assets: [...], cursor?}` |
| `assets.load(path_or_uri, kind)` | `ASSETS_LOAD` | `{handle, eta_ms}` |
| `assets.generate(prompt, kind, provider?)` | `ASSETS_GEN_AI` | `{handle, job_id, eta_ms}` |
| `scripting.load(id, source, lang)` | `SCRIPT_ADMIN` | `{}` |
| `scripting.reload(id, source)` | `SCRIPT_ADMIN` | `{}` |
| `scenario.run(toml)` | `SCENARIO_RUN` | `{run_id}` |
| `scenario.status(run_id)` | — | `{state, asserts: [{name, ok, msg}]}` |
| `semantic.spawn(prompt)` | `ECS_SPAWN + SEMANTIC` | `{entity, breakdown}` |
| `semantic.resolve(prompt)` | `SEMANTIC` | `{intent, entities[], confidence}` |
| `debug.profiler.start` / `.stop` | `DEBUG` | `{trace_path}` |
| `debug.draw_overlay(kind, on)` | `DEBUG` | `{}` — physics wireframe, navmesh, etc. (see `physics-renderer.md`) |

## Required API (Core surface that Agent calls)

```rust
pub trait AgentRuntime: Send + Sync + 'static {
    fn world_snapshot_view(&self) -> WorldView<'_>;     // read-only
    fn enqueue_command(&self, cmd: AgentCommand) -> CommandToken;
    fn await_command(&self, tok: CommandToken) -> Result<CommandResult, AgentError>;
    fn subscribe(&self, sub: Subscription) -> SubscriptionId;
    fn unsubscribe(&self, id: SubscriptionId);
    fn time_control(&self, op: TimeOp) -> Result<TimeState, AgentError>;
    fn snapshot(&self, label: Option<String>) -> Result<SnapshotMeta, AgentError>;
    fn restore(&self, id: SnapshotId) -> Result<(), AgentError>;
}
```

---

## Data Schema

```rust
pub struct AgentSession {
    pub id: SessionId,
    pub principal: Principal,             // Local | RemoteUser(uuid) | Service(name)
    pub caps: AgentCaps,
    pub rate_limit: RateLimit,
    pub created: u64,                     // unix ms
}

bitflags! {
    pub struct AgentCaps: u64 {
        // Inherits scripting caps in low 32 bits.
        const ECS_READ        = 1 << 0;
        const ECS_WRITE       = 1 << 1;
        const ECS_SPAWN       = 1 << 2;
        const ECS_DESPAWN     = 1 << 3;
        const EVENTS_SEND     = 1 << 4;
        const EVENTS_RECEIVE  = 1 << 5;
        const ASSETS_READ     = 1 << 6;
        const ASSETS_LOAD     = 1 << 7;
        const ASSETS_GEN_AI   = 1 << 8;
        const PHYSICS_QUERY   = 1 << 9;
        const AUDIO_PLAY      = 1 << 11;
        // Agent-only caps (high bits)
        const TELEMETRY_READ  = 1 << 32;
        const STATE_READ      = 1 << 33;
        const STATE_WRITE     = 1 << 34;
        const TIME_CTRL       = 1 << 35;
        const ENGINE_CTRL     = 1 << 36;  // shutdown
        const SCRIPT_ADMIN    = 1 << 37;
        const SCENARIO_RUN    = 1 << 38;
        const SEMANTIC        = 1 << 39;
        const DEBUG           = 1 << 40;
    }
}

pub struct RateLimit {
    pub rpcs_per_sec: u32,                // hard token bucket
    pub burst: u32,
    pub max_inflight: u32,                // pending requests
    pub write_ops_per_sec: u32,           // ecs.set/spawn/despawn
    pub max_subscriptions: u16,
    pub max_telemetry_bytes_per_sec: u32,
}

pub enum AgentError {
    CapDenied { method: &'static str, missing: AgentCaps },
    RateLimited { retry_after_ms: u32 },
    InvalidParams { path: String, msg: String },
    NotFound { kind: &'static str, id: String },
    Engine { code: &'static str, msg: String },     // wraps subsystem errors
    Backpressure,                                   // command queue full
}
```

JSON-RPC error envelope (machine-parseable):

```json
{
  "jsonrpc":"2.0","id":7,
  "error":{
    "code":-32010,
    "message":"capability denied",
    "data":{"missing":["STATE_WRITE"],"method":"engine.restore","suggested_fix":"request session with STATE_WRITE cap"}
  }
}
```

Telemetry NDJSON frame schema:

```json
{"channel":"renderer.frame","schema":1,"ts_ns":1731012331000000123,"payload":{"frame":4123,"draw_calls":1842}}
{"channel":"physics.step","schema":1,"ts_ns":1731012331016000000,"payload":{"step":4123,"contacts":78}}
```

Default cap profiles (declared in `Nexus.toml`):

```toml
[agent.profiles.dev]
caps = ["ALL"]                         # local dev only
rate_limit = { rpcs_per_sec = 5000, burst = 10000, max_inflight = 256, write_ops_per_sec = 5000, max_subscriptions = 64, max_telemetry_bytes_per_sec = 67108864 }

[agent.profiles.ci]
caps = ["ECS_READ","ECS_WRITE","ECS_SPAWN","STATE_READ","STATE_WRITE","TIME_CTRL","SCENARIO_RUN","TELEMETRY_READ","DEBUG"]
rate_limit = { rpcs_per_sec = 1000, burst = 2000, max_inflight = 64, write_ops_per_sec = 1000, max_subscriptions = 32, max_telemetry_bytes_per_sec = 16777216 }

[agent.profiles.public_mod]
caps = ["ECS_READ","EVENTS_RECEIVE","TELEMETRY_READ"]
rate_limit = { rpcs_per_sec = 60, burst = 120, max_inflight = 8, write_ops_per_sec = 0, max_subscriptions = 4, max_telemetry_bytes_per_sec = 65536 }
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Agent | RPCs are ordered per session: response order = request order. |
| O-2 | Agent | Write RPCs are applied at the next frame boundary; reads see the World as of the start of the current frame. |
| O-3 | Agent | `engine.snapshot` is consistent with the frame counter at which it was processed (atomic w.r.t. systems). |
| O-4 | Agent | `engine.step(n)` blocks the response until exactly N frames have advanced (headless or paused). |
| O-5 | Agent | Subscriptions deliver in chronological order per channel; cross-channel ordering is not guaranteed. |
| O-6 | Core | A despawned `EntityId` returns `NotFound` until its generation is reused (never UB). |
| O-7 | Agent | Rate-limit violations return `RateLimited` and DO NOT count against the bucket again. |
| O-8 | Agent | `engine.shutdown` drains commands and emits a final `engine.shutdown` telemetry frame, then closes transport. |

---

## Threading & Concurrency Rules

- Transport thread (per session) is async; deserializes JSON, validates schema, checks caps, enqueues a `Command`.
- Read RPCs may resolve on the transport thread against a lock-free snapshot view (epoch-protected) — they do not stall the sim.
- Write RPCs are applied by the main-loop coordinator at frame boundaries.
- Telemetry publishers (subsystems) push into a broadcast channel; transport threads drain per-subscriber rings.
- Backpressure: per-session ring of N outstanding writes (`max_inflight`); excess → `Backpressure` error.
- No agent call ever holds a `&mut World` across an `.await`.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| Read RPC round-trip (local UDS) | ≤ 200 µs | 2 ms | `ecs.get` single entity |
| Write RPC round-trip | ≤ 1 frame | 3 frames | applied at frame boundary |
| `ecs.query` 10k entities (paginated 1k/page) | ≤ 5 ms/page | 20 ms | |
| `engine.snapshot` 1k entities | ≤ 5 ms | 20 ms | composes from subsystems |
| Telemetry sustained throughput | ≥ 64 MB/s | — | per session, NDJSON |
| Cap check overhead | ≤ 100 ns | 500 ns | bitmask AND |
| Max sessions per engine | 64 | 256 | |
| Memory per idle session | ≤ 64 kB | 256 kB | rings + state |

References: JSON-RPC 2.0 spec (https://www.jsonrpc.org/specification). Capability tokens / POLA: Mark S. Miller, *Robust Composition*. Liskov Substitution Principle — agents written against this contract work against any conforming engine build.

---

## Error Contract

| JSON-RPC code | Variant | Meaning | Required action |
|---|---|---|---|
| `-32700` | `ParseError` | bad JSON | client fixes |
| `-32600` | `InvalidRequest` | malformed envelope | client fixes |
| `-32601` | `MethodNotFound` | unknown method | check `engine.info` for supported set |
| `-32602` | `InvalidParams` | schema violation | error data has `path` to bad field |
| `-32010` | `CapDenied` | missing cap | request elevated session |
| `-32011` | `RateLimited` | bucket empty | wait `retry_after_ms` |
| `-32012` | `Backpressure` | queue full | retry after read |
| `-32020` | `NotFound` | entity/asset/snapshot id stale | refresh |
| `-32030` | `EngineError` | subsystem error wrapped | `data.code` carries `RND-*` / `PHY-*` / etc. |
| `-32040` | `NotPermittedHere` | method disabled by profile | use different profile or local session |

---

## Versioning Rule

`nexus-contract-agent = "MAJOR.MINOR.PATCH"`. Wire schema versioned independently as `schema: u16` on every payload.

- **MAJOR**: removing a method, changing its required params, changing capability semantics, changing error code numbers, breaking snapshot interop.
- **MINOR**: adding a method, adding an optional param (server treats missing as default), adding a capability flag (default OFF), adding a telemetry channel.
- **PATCH**: docs, perf, internal transport.

Handshake: client sends `engine.info`; server returns `contract_versions: {agent: "1.2.0", scripting: "...", ...}`. Client with incompatible MAJOR refuses to continue and reports the user.

---

## Test Matrix

`tests/contract_core_agent.rs`:

- T-01 Round-trip: `ecs.spawn → ecs.get → ecs.despawn` returns expected JSON for known component schema.
- T-02 Cap denial: session without `STATE_WRITE` calls `engine.restore` → `-32010`, no mutation.
- T-03 Rate limit: burst above `rpcs_per_sec` → after `burst` responses, next call gets `-32011` with `retry_after_ms`.
- T-04 Headless run: `engine.pause; engine.step(60); ecs.query(...)` returns post-60-frame state deterministically.
- T-05 Snapshot/restore: `engine.snapshot → ... → engine.restore` returns to same `state_hash` (see `core-networking.md`).
- T-06 Telemetry: subscribe `renderer.frame` → receive 60 ± 1 frames in 1 wall second at 60 fps.
- T-07 Backpressure: send `max_inflight + 1` writes without reading responses → `-32012`.
- T-08 Schema introspection: `ecs.schema` enumerates the same components that `components.toml` registers.
- T-09 Public-mod profile cannot call `ecs.spawn`, `engine.step`, or `assets.generate`.
- T-10 Two SDKs in parallel (Rust + Python) drive same scenario → same final `state_hash`.

---

## Open Questions

- [DECISION NEEDED] WebSocket TLS by default for non-loopback; do we ship a CA story or punt to operator? Cf. `nexus-agent-sdk`.
- [DECISION NEEDED] Should `semantic.spawn` results be deterministic (same prompt → same entity)? Likely no, but record `seed` in result for reproducibility.
- [DECISION NEEDED] Cross-session transactions (e.g., long-running scenario locks world) — feature or anti-feature?
- [DECISION NEEDED] Telemetry stream backpressure: drop oldest, drop newest, or disconnect? AGENT 10.
- [BENCHMARK NEEDED] 64 MB/s telemetry sustained on a Pi 4 / Android mid-tier.
- [AGENT: 10] Confirm `nexus-agent-sdk` Rust + Python bindings can both round-trip every method in this table.
- [AGENT: 02] Need epoch-protected read snapshot view of `World` for transport-thread reads (O-2).
- [AGENT: 08] Cap set is a strict superset of `ScriptCaps`; confirm low 32 bits align bit-for-bit.
