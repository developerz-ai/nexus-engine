<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — JSON-RPC Wire Protocol

> Every method, every schema, every error code an AI agent uses to drive Nexus. JSON-RPC 2.0 over stdio/TCP/UDS with LSP-style framing.

## Boundaries

- **Owns:** wire format, framing, method registry, capability handshake, error code allocation.
- **Does NOT own:** what each method *does* internally — that lives in the owning system's spec.
- **Depends on:** JSON-RPC 2.0 (jsonrpc.org), LSP framing (microsoft.github.io/language-server-protocol).

## Transport

```
┌────────────────────────────────────────────────┐
│  Frame (LSP-style)                             │
│  Content-Length: <bytes>\r\n                   │
│  Content-Type: application/vscode-jsonrpc;     │
│    charset=utf-8\r\n   (optional)              │
│  \r\n                                          │
│  { "jsonrpc": "2.0", ... }                     │
└────────────────────────────────────────────────┘
```

Supported transports (negotiated at process spawn, not in-band):

| Transport | Flag | Use case |
|---|---|---|
| stdio | `--rpc=stdio` (default) | Local agent spawning engine as child process. |
| TCP | `--rpc=tcp:127.0.0.1:7700` | Remote / detached agents, multi-client. |
| Unix socket | `--rpc=unix:/tmp/nexus.sock` | Sandboxed agents, container IPC. |
| WebSocket | `--rpc=ws:127.0.0.1:7701` | Browser agents. [DECISION NEEDED] v1.0 or v1.1? |

All transports carry the same JSON-RPC 2.0 message format. Framing is identical to LSP on stream transports; WebSocket uses one message per frame.

## Lifecycle

```
Agent                          Engine
  │                              │
  │── initialize ──────────────►│   capability negotiation
  │◄───────────── result ───────│
  │── initialized (notif) ─────►│
  │                              │
  │── <any methods> ───────────►│
  │◄────────── results ─────────│
  │◄── notifications/* ─────────│   (server-push: telemetry, log, events)
  │                              │
  │── shutdown ────────────────►│   graceful cleanup, flush snapshots
  │◄───────────── result ───────│
  │── exit (notif) ────────────►│   terminate process
```

The agent MUST send `initialize` first; the engine rejects all other methods with `-32002` (server not initialized) before that. After `shutdown` the engine accepts only `exit`.

## Capability Handshake

### `initialize` (request)

```jsonc
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0",
    "clientInfo": { "name": "claude-code", "version": "0.7.2" },
    "capabilities": {
      "telemetry": { "subscribe": true, "batch": true },
      "snapshot":  { "binary": true },
      "semantic":  { "intentResolver": true }
    },
    "workspaceRoot": "/abs/path/to/game",
    "config": {
      "tickRate": 60,
      "speedMultiplier": 1.0,
      "rngSeed": 42
    }
  }
}
```

### `initialize` (result)

```jsonc
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "1.0",
    "serverInfo": { "name": "nexus-engine", "version": "0.1.0" },
    "capabilities": {
      "scene":     { "load": true, "save": true, "stream": false },
      "entity":    { "crud": true, "query": true, "watch": true },
      "system":    { "list": true, "enable": true, "tickStep": true },
      "telemetry": { "topics": ["frame","ecs","render","physics","audio","net","script","agent"] },
      "snapshot":  { "binary": true, "json": true, "diff": true },
      "scenario":  { "run": true, "batch": true },
      "semantic":  { "intentResolver": true, "vocabulary": "default-v1" }
    },
    "limits": {
      "maxEntitiesPerCall": 10000,
      "maxTelemetryBacklog": 65536,
      "maxSnapshotBytes":   1073741824
    }
  }
}
```

The engine MUST refuse methods outside its declared capabilities with error `-32601`.

## Method Registry

Methods are namespaced `<system>.<verb>`. Verbs follow REST-like semantics where possible (`create`, `read`, `update`, `delete`, `list`, `query`).

### Lifecycle

| Method | Direction | Returns | Purpose |
|---|---|---|---|
| `initialize` | A→E | `InitResult` | Handshake. |
| `initialized` | A→E (notif) | — | Agent ready for server-push. |
| `shutdown` | A→E | `null` | Flush, persist, prepare to exit. |
| `exit` | A→E (notif) | — | Terminate process. |
| `$/cancel` | A→E (notif) | — | Cancel in-flight request by id. (LSP convention) |
| `$/progress` | E→A (notif) | — | Progress token updates. |

### Scene

| Method | Params | Returns | Notes |
|---|---|---|---|
| `scene.load` | `{path, mode?}` | `{sceneId, entityCount}` | `mode`: `replace` \| `merge`. |
| `scene.save` | `{path, sceneId?}` | `{bytesWritten}` | Serializes current world. |
| `scene.unload` | `{sceneId}` | `null` | |
| `scene.list` | `{}` | `{scenes: [...]}` | Loaded scenes. |
| `scene.describe` | `{sceneId}` | `SceneDescriptor` | Hierarchy + counts. |

### Entity CRUD

| Method | Params | Returns | Notes |
|---|---|---|---|
| `entity.spawn` | `{archetype?, components, parent?}` | `{entityId}` | Single. |
| `entity.spawnBatch` | `{entities: [...]}` | `{entityIds: [...]}` | Up to `maxEntitiesPerCall`. |
| `entity.despawn` | `{entityId, cascade?}` | `null` | `cascade` removes children. |
| `entity.get` | `{entityId, components?}` | `{components: {...}}` | Subset of components. |
| `entity.update` | `{entityId, components}` | `null` | Partial component update. |
| `entity.query` | `{with: [...], without?: [...], limit?}` | `{entities: [...]}` | ECS query, see → `docs/specs/core/ecs.md`. |
| `entity.watch` | `{entityId \| query, fields?}` | `{watchId}` | Push updates via `notifications/entity.changed`. |
| `entity.unwatch` | `{watchId}` | `null` | |

### Component / Resource

| Method | Params | Returns | Notes |
|---|---|---|---|
| `component.list` | `{}` | `{types: [...]}` | All registered component types. |
| `component.schema` | `{type}` | `JSONSchema` | Validation schema for type. |
| `resource.get` | `{name}` | `{value}` | Global ECS resources. |
| `resource.set` | `{name, value}` | `null` | Subject to mutability rules. |

### System Control

| Method | Params | Returns | Notes |
|---|---|---|---|
| `system.list` | `{schedule?}` | `{systems: [...]}` | All systems in named schedule. |
| `system.enable` | `{name}` | `null` | |
| `system.disable` | `{name}` | `null` | |
| `system.tickStep` | `{count?: 1}` | `{tick, dtMs}` | Manual single-step. |
| `sim.advance` | `{ticks, untilWallMs?}` | `{ticksAdvanced, dtMs}` | Run loop N ticks. |
| `sim.pause` | `{}` | `null` | |
| `sim.resume` | `{}` | `null` | |
| `sim.setSpeed` | `{multiplier}` | `null` | `0.1`–`100.0`. → `headless.md` |

### Telemetry

| Method | Params | Returns | Notes |
|---|---|---|---|
| `telemetry.subscribe` | `{topics: [...], filter?, batchSize?}` | `{subscriptionId}` | See → `telemetry.md`. |
| `telemetry.unsubscribe` | `{subscriptionId}` | `null` | |
| `telemetry.snapshot` | `{topics?}` | `{frames: [...]}` | One-shot pull. |
| `notifications/telemetry.frame` | — (E→A notif) | `TelemetryFrame` | Push stream. |

### Snapshot / Replay

| Method | Params | Returns | Notes |
|---|---|---|---|
| `snapshot.capture` | `{format?: "binary"\|"json"}` | `{snapshotId, bytes}` | → `replay.md` |
| `snapshot.restore` | `{snapshotId}` | `null` | |
| `snapshot.export` | `{snapshotId, path}` | `{bytesWritten}` | |
| `snapshot.import` | `{path}` | `{snapshotId}` | |
| `snapshot.diff` | `{a, b}` | `SnapshotDiff` | |
| `replay.start` | `{snapshotId, inputLog?, speed?}` | `{replayId}` | |
| `replay.bisect` | `{snapshotId, predicate, range}` | `{tick, snapshotId}` | Binary search for failure. |

### Scenario

| Method | Params | Returns | Notes |
|---|---|---|---|
| `scenario.run` | `{file \| inline}` | `ScenarioResult` | → `scenarios.md` |
| `scenario.runBatch` | `{glob, parallel?}` | `BatchResult` | |
| `scenario.cancel` | `{runId}` | `null` | |

### Semantic

| Method | Params | Returns | Notes |
|---|---|---|---|
| `semantic.parse` | `{utterance, context?}` | `{intent, args, confidence}` | → `semantic.md` |
| `semantic.execute` | `{utterance, context?}` | `{result}` | Parse + dispatch. |
| `semantic.vocabulary` | `{}` | `{intents: [...]}` | List supported intents. |

### Scripting Bridge

| Method | Params | Returns | Notes |
|---|---|---|---|
| `script.eval` | `{lang, source, capabilities?}` | `{result}` | Sandboxed eval. → `docs/specs/scripting/sandbox.md` |
| `script.reload` | `{path?}` | `{reloaded: [...]}` | Hot reload. → `docs/specs/scripting/hotreload.md` |

### Assets

| Method | Params | Returns | Notes |
|---|---|---|---|
| `asset.import` | `{path, type?}` | `{assetId}` | → `docs/specs/assets/import.md` [AGENT: 09] |
| `asset.list` | `{type?, glob?}` | `{assets: [...]}` | |
| `asset.generate` | `{kind, prompt, provider?}` | `{assetId}` | AI generation. → `docs/specs/assets/generation.md` |

## Core Schemas

All schemas are JSON Schema draft 2020-12. Inline canonical forms below; machine-readable copies live in `crates/nexus-agent-sdk/schemas/`. [AGENT: 02 confirm crate path]

### `EntityId`

```jsonc
// 64-bit packed: 32-bit generation || 32-bit index, encoded as string for JS safety
{ "type": "string", "pattern": "^e[0-9a-f]{16}$" }
```

### `Components` (open map)

```jsonc
{
  "type": "object",
  "additionalProperties": true,
  "patternProperties": {
    "^[A-Z][A-Za-z0-9_]*$": { "type": "object" }
  }
}
// Example:
// { "Transform": {"pos":[1,2,3],"rot":[0,0,0,1],"scale":[1,1,1]},
//   "Health":    {"current":80, "max":100} }
```

### `TelemetryFrame` (push)

```jsonc
{
  "jsonrpc": "2.0",
  "method": "notifications/telemetry.frame",
  "params": {
    "subscriptionId": "sub_abc",
    "tick": 1234,
    "wallNs": 16683492,
    "dtMs": 16.6,
    "topics": {
      "frame":   { "renderMs": 4.1, "simMs": 8.0, "idleMs": 4.5 },
      "ecs":     { "entityCount": 1284, "archetypes": 17, "queriesRun": 142 },
      "physics": { "bodies": 421, "contacts": 67, "stepMs": 2.1 },
      "render":  { "drawCalls": 312, "triangles": 184213, "gpuMs": 0.0 },
      "agent":   { "rpcCallsHandled": 3, "pendingNotifs": 0 }
    }
  }
}
```

Full topic schemas → `telemetry.md`.

### `Error` (JSON-RPC error object)

```jsonc
{
  "code": -32001,
  "message": "Entity not found",
  "data": {
    "code":         "ENTITY_NOT_FOUND",
    "entityId":     "e0000000000003e8",
    "method":       "entity.get",
    "tick":         1234,
    "suggestedFix": "Call entity.query first; entity may have been despawned at tick 1190."
  }
}
```

Every error MUST include `data.code` (stable string), `data.method`, and optionally `data.suggestedFix`. AI agents key error handling off `data.code`, not `code` or `message`. (→ AI-First Mandate law 1)

## Error Codes

Reserved ranges (per JSON-RPC 2.0):

| Range | Owner | Use |
|---|---|---|
| -32700 | JSON-RPC | Parse error |
| -32600 | JSON-RPC | Invalid request |
| -32601 | JSON-RPC | Method not found |
| -32602 | JSON-RPC | Invalid params |
| -32603 | JSON-RPC | Internal error |
| -32000…-32099 | Server impl | Nexus-defined (see below) |
| -32002 | LSP convention | Server not initialized |

Nexus-specific codes (within -32000…-32099):

| Code | `data.code` | Meaning | Caller action |
|---|---|---|---|
| -32000 | `NOT_INITIALIZED` | Method called before `initialize` | Send `initialize` first. |
| -32001 | `ENTITY_NOT_FOUND` | Unknown entity id | Re-query; entity may have despawned. |
| -32002 | `COMPONENT_NOT_FOUND` | Component type unregistered | Call `component.list`. |
| -32003 | `SCHEMA_VIOLATION` | Component data failed validation | Inspect `data.violations`. |
| -32004 | `CAPABILITY_DENIED` | Method requires unsupported capability | Re-handshake or upgrade engine. |
| -32005 | `RATE_LIMITED` | Per-call quota exceeded | Backoff `data.retryAfterMs`. |
| -32006 | `SANDBOX_VIOLATION` | Script tried denied capability | Request capability or rewrite. |
| -32007 | `SNAPSHOT_INCOMPATIBLE` | Snapshot from incompatible build | Re-record or migrate. |
| -32008 | `SCENE_NOT_FOUND` | Scene id/path invalid | `scene.list` to enumerate. |
| -32009 | `SUBSCRIPTION_BACKPRESSURE` | Agent not draining notifications | Drain queue or unsubscribe. |
| -32010 | `DETERMINISM_BROKEN` | Replay diverged from recorded run | File bug; capture both snapshots. |
| -32011 | `SIM_PAUSED` | `sim.advance` called while paused | Call `sim.resume` first. |
| -32012 | `SEMANTIC_AMBIGUOUS` | NL utterance had multiple intent matches | Disambiguate; see `data.candidates`. |
| -32013 | `ASSET_NOT_FOUND` | Asset id/path invalid | Re-import or generate. |
| -32014 | `PERMISSION_DENIED` | Agent lacks workspace permission | Re-launch with elevated `--capabilities`. |
| -32015 | `CANCELLED` | Request cancelled via `$/cancel` | None; expected. |
| -32099 | `INTERNAL_BUG` | Unrecoverable; engine state suspect | Capture snapshot, restart. |

## Cancellation

Per LSP, `$/cancel` is a notification:

```jsonc
{ "jsonrpc": "2.0", "method": "$/cancel", "params": { "id": 42 } }
```

The engine still MUST return a response for request `42` — either a partial result or error `-32015 CANCELLED`. Notifications cannot be cancelled.

## Progress

Long-running requests (scenario batch, asset generation, replay bisect) emit `$/progress`:

```jsonc
{
  "jsonrpc": "2.0",
  "method": "$/progress",
  "params": {
    "token": "progress_xyz",
    "value": { "kind": "report", "percentage": 47, "message": "47/100 scenarios" }
  }
}
```

Agent provides the token in the originating request's `params.workDoneToken`.

## Batching

JSON-RPC 2.0 batch is supported on every transport. Engine MAY return responses out of order; agent MUST correlate by `id`. Batch upper limit: 1000 calls. Larger batches respond with `-32600`.

## Versioning

Protocol version is a `MAJOR.MINOR` string in `initialize`. Engine accepts any client with matching `MAJOR`. `MINOR` mismatch is allowed; capabilities mediate. `MAJOR` mismatch ⇒ `-32004 CAPABILITY_DENIED` with `data.requiredVersion`.

## Cross-references

- → `docs/specs/agent/headless.md` — how `sim.advance` runs
- → `docs/specs/agent/telemetry.md` — full topic schemas
- → `docs/specs/agent/snapshot` and `replay.md` — snapshot/restore semantics
- → `docs/specs/agent/scenarios.md` — `scenario.run` schema
- → `docs/specs/agent/semantic.md` — `semantic.*` resolver
- → `docs/contracts/core-agent.md` — what each system MUST expose [AGENT: 14]
- → `docs/specs/scripting/sandbox.md` — `script.eval` capability model [AGENT: 08]
- → `docs/specs/core/ecs.md` — `entity.query` semantics [AGENT: 02]

## Prior Art

- JSON-RPC 2.0 — jsonrpc.org/specification ✓ wire format adopted as-is.
- LSP 3.17 — Content-Length framing, `$/cancel`, `$/progress`, initialize/initialized lifecycle ✓.
- Model Context Protocol — capability negotiation pattern, `*/list` + `*/get` discovery ✓.
- OpenAI function calling — JSON Schema parameter description ✓ (used in `semantic.vocabulary`).
- Chrome DevTools Protocol ✓ — domain.method namespacing, bidirectional events. We mirror the shape.

## Open Questions

- [DECISION NEEDED] Should `entity.query` support a mini-DSL (`"with:Transform,Health without:Dead limit:50"`) in addition to JSON form?
- [DECISION NEEDED] Authorization model on TCP/WS: token in `initialize.params.auth`? mTLS? Defer to → `docs/specs/networking/anticheat.md`?
- [DECISION NEEDED] Whether `system.tickStep` runs *all* schedules or just `Update` schedule. Coordinate with → `docs/specs/core/ecs.md` [AGENT: 02].
