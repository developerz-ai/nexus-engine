<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — Telemetry

> Every system emits structured JSON every frame. No log strings. No printf. The agent subscribes to topics and pulls a complete observation stream.

## Boundaries

- **Owns:** telemetry bus, topic registry, subscription matcher, frame assembly, push notification delivery, ring buffer / backpressure policy.
- **Does NOT own:** the *content* of each topic — that's defined by the owning system's spec, validated against the topic schema.
- **Depends on:** event bus (→ `docs/specs/core/events.md` [AGENT: 02]), RPC notifications (→ `api.md`).

## Why

A human watches a debugger. An AI agent reads JSON. Telemetry is the agent's eyes. Every system that runs MUST emit a frame's worth of structured observation, with zero configuration, so the agent can reason about what happened without grep, screenshot, or guesswork.

This satisfies AI-First Mandate law 2: **Full telemetry by default.**

## Data Model

```
┌─────────────────────────────────────────────────────────────┐
│  TelemetryFrame                                             │
│    tick: u64                                                │
│    wallNs: u64                                              │
│    dtMs: f32                                                │
│    topics: {                                                │
│       <topic-name>: <topic-schema>                          │
│       ...                                                   │
│    }                                                        │
│    events: [TelemetryEvent, ...]   // non-per-frame events  │
└─────────────────────────────────────────────────────────────┘
```

Two kinds of payloads:

1. **Per-frame topics** — sampled metrics, one object per tick (e.g. `physics.bodies`, `render.drawCalls`).
2. **Events** — discrete occurrences (e.g. `entity.spawned`, `collision`, `script.error`). Carried in `events[]` of the frame in which they occurred.

## Subscription Model

```
Agent                                  Engine
  │                                       │
  │── telemetry.subscribe ──────────────►│
  │    { topics:["frame","physics.*"],   │
  │      filter:{tickRate:1},            │
  │      batchSize:10 }                  │
  │◄────────── { subscriptionId } ───────│
  │                                       │
  │◄── notifications/telemetry.frame ────│ tick N
  │◄── notifications/telemetry.frame ────│ tick N+1
  │◄── notifications/telemetry.batch ────│ tick N+2..N+11 (batched)
  │                                       │
  │── telemetry.unsubscribe ───────────►│
  │◄───────────── null ──────────────────│
```

### `telemetry.subscribe` params

```jsonc
{
  "topics":   ["frame", "physics.*", "ecs.entityCount", "events.collision"],
  "filter": {
    "tickRate": 1,           // 1 = every tick, 10 = every 10th tick
    "minDeltaMs": 0.0,       // skip frames faster than this
    "entityIds": ["e0..."],  // restrict entity-scoped topics
    "componentTypes": []     // restrict component-scoped topics
  },
  "batchSize":   1,          // 1 = single notif per frame; >1 = `telemetry.batch`
  "format":      "json",     // json | msgpack (compact, opt-in)
  "include":     ["topics","events"],
  "ringBufferOnDisconnect": 1024
}
```

Topic patterns support `*` (any segment) and `**` (recursive). `"*"` alone subscribes to everything; agents SHOULD avoid this in production due to backpressure cost.

### Notifications

```jsonc
// Per-frame (batchSize == 1)
{
  "jsonrpc": "2.0",
  "method":  "notifications/telemetry.frame",
  "params":  { "subscriptionId":"sub_abc", /* TelemetryFrame */ }
}

// Batched (batchSize > 1)
{
  "jsonrpc": "2.0",
  "method":  "notifications/telemetry.batch",
  "params":  {
    "subscriptionId":"sub_abc",
    "frames": [ /* TelemetryFrame, ... */ ]
  }
}
```

### Pull mode

For agents that prefer polling:

```jsonc
{ "method": "telemetry.snapshot",
  "params": { "topics": ["physics","render"], "sinceTick": 1200 } }
// → { "frames": [TelemetryFrame, ...] }
```

The engine retains the last `N` frames (default 1024, configurable via `--telemetry-buffer`) in a ring buffer per topic.

## Topic Registry

Topics are namespaced `<system>.<name>`. Every system owns one or more namespaces. Registration is static (compile time); list at runtime via:

```jsonc
{ "method": "telemetry.topics" }
// → { "topics": [
//      { "name":"frame", "schema":"#/defs/Frame", "perFrame":true },
//      { "name":"physics.bodies", "schema":"#/defs/PhysicsBodies", "perFrame":true },
//      { "name":"events.collision", "schema":"#/defs/CollisionEvent", "event":true },
//      ...
//   ]}
```

### Standard Topics (v1.0)

| Topic | Owner | Per-frame? | Schema (inline below) |
|---|---|---|---|
| `frame` | runtime | yes | `Frame` |
| `ecs.counts` | core/ecs | yes | `EcsCounts` |
| `ecs.queries` | core/ecs | yes | `EcsQueries` |
| `physics.world` | physics | yes | `PhysicsWorld` |
| `physics.bodies` | physics | yes | `PhysicsBodies` |
| `render.pass` | renderer | yes | `RenderPass` |
| `render.gpu` | renderer | yes | `RenderGpu` |
| `audio.mixer` | audio | yes | `AudioMixer` |
| `net.session` | networking | yes | `NetSession` |
| `script.vm` | scripting | yes | `ScriptVm` |
| `agent.rpc` | agent | yes | `AgentRpc` |
| `events.collision` | physics | event | `CollisionEvent` |
| `events.entity.spawned` | core/ecs | event | `EntitySpawned` |
| `events.entity.despawned` | core/ecs | event | `EntityDespawned` |
| `events.script.error` | scripting | event | `ScriptError` |
| `events.log` | runtime | event | `LogEvent` |
| `events.agent.input` | agent | event | `AgentInput` |

→ Each system spec lists additional topics it owns.

## Schemas (canonical, inline)

### `Frame`

```jsonc
{
  "tick": 1234,
  "wallNs": 16683492,
  "dtMs": 16.6,
  "simMs": 8.0,
  "renderMs": 4.1,
  "telemetryMs": 0.2,
  "idleMs": 4.5,
  "budgetMs": 16.6,
  "budgetExceeded": false
}
```

### `EcsCounts`

```jsonc
{
  "entities": 1284,
  "archetypes": 17,
  "components": 42,
  "resources": 12,
  "spawnedThisTick": 4,
  "despawnedThisTick": 1
}
```

### `EcsQueries`

```jsonc
{
  "queriesRun": 142,
  "totalMatched": 24813,
  "slowestQueryUs": 84,
  "slowestQueryName": "TransformPropagate"
}
```

### `PhysicsWorld`

```jsonc
{
  "stepMs": 2.1,
  "substepCount": 4,
  "bodies": 421,
  "awakeBodies": 87,
  "contacts": 67,
  "joints": 12,
  "broadphasePairs": 1043
}
```

### `PhysicsBodies` (sample, capped)

```jsonc
{
  "sampled": 50,
  "totalBodies": 421,
  "samples": [
    { "entity":"e0...001", "pos":[1.0,2.0,3.0], "vel":[0.0,-9.8,0.0],
      "awake":true, "sleepingFor":0.0 }
  ]
}
```

### `RenderPass`

```jsonc
{
  "passes": 7,
  "drawCalls": 312,
  "triangles": 184213,
  "verticesUploaded": 0,
  "materialSwitches": 18,
  "shaderRecompiles": 0
}
```

### `RenderGpu`

```jsonc
{
  "gpuMs": 4.0,
  "memUsedMb": 287.4,
  "memBudgetMb": 2048.0,
  "textureCount": 142,
  "available": true
}
```

In headless mode: `available: false`, all numeric fields `0`.

### `AudioMixer`

```jsonc
{
  "voicesActive": 18,
  "voicesCapped": 0,
  "mixMs": 0.4,
  "underrunsThisSecond": 0,
  "buses": [ { "name":"sfx", "rms":0.18, "peakDb":-12.4 } ]
}
```

### `NetSession`

```jsonc
{
  "role": "server",
  "clients": 4,
  "tick": 1234,
  "rttMs": { "p50":42, "p95":71 },
  "inputDelayFrames": 3,
  "rollbacksThisSecond": 2,
  "bandwidthKbps": { "in": 18.4, "out": 142.1 }
}
```

→ `docs/specs/networking/rollback.md` [AGENT: 07]

### `ScriptVm`

```jsonc
{
  "lang": "lua",
  "scriptsLoaded": 27,
  "callsPerFrame": 184,
  "gcMs": 0.1,
  "memKb": 412.0,
  "hotReloadsThisSecond": 0
}
```

### `AgentRpc`

```jsonc
{
  "callsHandledThisTick": 3,
  "pendingRequests": 0,
  "pendingNotifications": 12,
  "subscriptions": 2,
  "bytesIn": 482,
  "bytesOut": 14302
}
```

### Event schemas

```jsonc
// events.collision
{ "tick":1234, "a":"e0...001", "b":"e0...042",
  "point":[1.0,2.0,3.0], "normal":[0,1,0], "impulse":12.4 }

// events.entity.spawned
{ "tick":1234, "entity":"e0...001", "archetype":"Dragon", "by":"agent"|"script"|"system" }

// events.entity.despawned
{ "tick":1234, "entity":"e0...001", "cause":"agent.despawn"|"script"|"timeout"|"physics" }

// events.script.error
{ "tick":1234, "lang":"lua", "script":"npc/ai.lua", "line":42,
  "code":"NIL_INDEX", "message":"attempt to index nil value 'target'",
  "trace":["ai.lua:42","main.lua:18"] }

// events.log  (structured replacement for printf)
{ "tick":1234, "level":"info"|"warn"|"error",
  "module":"renderer", "message":"shader 'pbr.wgsl' recompiled",
  "fields":{"compileMs":3.1} }

// events.agent.input  (record of agent-initiated state change)
{ "tick":1234, "method":"entity.spawn", "id":42, "ok":true, "durMs":0.3 }
```

## Backpressure

The engine MUST NOT block the simulation on a slow agent. Policy:

```
per-subscription ring buffer (default 65536 frames worth of notifications)
on overflow:
    1. Drop oldest unsent notifications.
    2. Emit one `notifications/telemetry.dropped` carrying:
         { subscriptionId, droppedCount, oldestTick, newestTick }
    3. Increment `agent.rpc.notificationsDroppedTotal`.
    4. If overflow rate > 10/s for 3s straight → unsubscribe + error -32009.
```

Agents MUST drain notifications promptly. The `batchSize` knob is the primary tuning lever.

## Filtering Performance

Topic + filter matching happens in a hot path; cost MUST be sublinear in topic count:

| Subscriptions | Match cost per frame |
|---|---|
| 1 | < 1 µs |
| 100 | < 50 µs |
| 1000 | < 500 µs |

Implementation: precompiled prefix-trie of topic patterns, hashed by namespace.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Frame serialization (json, 8 topics, 1k entities) | < 0.2 ms | < 1 ms |
| Frame serialization (msgpack) | < 0.1 ms | < 0.5 ms |
| Subscription match (100 subs) | < 50 µs | < 200 µs |
| Ring buffer push | O(1) lock-free | — |
| Telemetry off (no subscribers) overhead | 0% | < 0.1% |

When zero subscribers exist for a topic, the system MAY skip generation entirely. Implementations SHOULD check `bus.has_subscribers("topic")` before doing expensive sampling work.

## Recording

`--record PATH` writes the full telemetry stream to a newline-delimited JSON (or msgpack) file. Format:

```
{"v":1,"engine":"0.1.0","seed":42,"startedAt":"2026-05-17T10:11:12Z"}
{"tick":0, ...TelemetryFrame...}
{"tick":1, ...}
...
```

The file is replay-able by `nexus replay PATH` (→ `replay.md`) and grep-able with `jq`.

## Test Requirements

- An empty scene with one subscription to `frame` emits exactly one notification per tick.
- Subscribing to `physics.*` while physics is disabled returns the subscription but emits no frames for those topics.
- Dropping all notifications for 4 s with overflow set to 65536 produces exactly one `telemetry.dropped` event with `droppedCount == observed`.
- `telemetry.snapshot { topics:["frame"], sinceTick: T }` returns frames `[T, currentTick)`.
- Recording 60 s of headless `--speed 0.0` then replaying yields byte-identical reconstruction of every frame.
- Per-frame topics with zero subscribers consume < 0.1% CPU overhead (validated by `nexus bench telemetry-off`).

## Cross-references

- → `docs/specs/agent/api.md` — `telemetry.*` methods + push notifications
- → `docs/specs/agent/replay.md` — telemetry recording + replay
- → `docs/specs/agent/scenarios.md` — assertions read telemetry topics
- → `docs/specs/core/events.md` — underlying typed event bus [AGENT: 02]
- → `docs/contracts/core-agent.md` — what each system MUST publish [AGENT: 14]

## Prior Art

- OpenTelemetry ✓ — topic naming, structured fields, sampling. We strip the OTLP overhead; this is in-process.
- Tracy profiler ✓ — frame-by-frame per-system timing. We adopt the per-tick model, deliver as JSON.
- DataDog StatsD ✓ — gauge/counter conventions inform numeric topic shape.
- Bevy diagnostics plugin ✓ — proves per-frame metric collection at engine level; we make it default-on with JSON.
- Chrome trace event format ✓ — record format inspiration for `--record`.

## Open Questions

- [DECISION NEEDED] msgpack vs cbor for compact format. Default still JSON.
- [DECISION NEEDED] Per-entity component sampling — sampler API for "give me 20 random entities matching query" without full enumeration each frame.
- [BENCHMARK NEEDED] Acceptable per-frame size for 10k entities with full subscription before backpressure dominates.
