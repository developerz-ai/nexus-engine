<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — Overview

> The protocol layer that turns Nexus into an executable, observable, replayable system for AI developers — headless by default, structured everywhere.

## Why This Exists

Every other game engine assumes a human at a keyboard. Nexus assumes an AI agent on a CI runner. The Agent API is the contract that makes that real:

- Spawn the engine without a window.
- Drive any subsystem over a structured RPC.
- Subscribe to every frame's telemetry as JSON.
- Snapshot any state, replay it, bisect a regression.
- Express tests as TOML scenarios, not GUI clicks.
- Lift APIs into natural language for high-bandwidth iteration.

This is not an afterthought wrapper around a GUI engine. The editor and the runtime are themselves Agent API clients. Anything the editor can do, an agent can do — and vice versa.

→ AI-First Mandate: `docs/initial/vision.md` (laws 1, 2, 3, 4, 5, 6, 7 all enforce here)
→ Core principles: `docs/architecture/01-principles.md` [AGENT: 01]
→ Contract: `docs/contracts/core-agent.md` [AGENT: 14]

## Boundaries

- **Owns:** JSON-RPC server, headless run loop driver, telemetry bus, scenario runner, snapshot/replay store, semantic NL layer, `nexus-agent-sdk` (Rust + Python).
- **Does NOT own:** ECS internals (→ `docs/specs/core/ecs.md` [AGENT: 02]), rendering (→ `docs/specs/renderer/overview.md` [AGENT: 03]), physics step (→ `docs/specs/physics/overview.md` [AGENT: 05]), scripting VM (→ `docs/specs/scripting/sandbox.md` [AGENT: 08]), editor UI (→ `docs/specs/editor/overview.md` [AGENT: 11]).
- **Depends on:** event bus (→ `docs/specs/core/events.md`), HAL time (→ `docs/specs/core/hal.md`), deterministic physics (→ `docs/specs/physics/determinism.md`), scripting sandbox capabilities (→ `docs/specs/scripting/sandbox.md`).

## Module Map

```
docs/specs/agent/
├── overview.md     ← (this file) philosophy + headless debug loop
├── api.md          ← JSON-RPC method tables, request/response schemas
├── headless.md     ← `nexus run --headless`, tick model, frame budget
├── telemetry.md    ← per-frame structured stream + subscription model
├── scenarios.md    ← TOML scenarios, assertions, batch runs
├── replay.md       ← snapshot store, replay, patch, bisect
├── semantic.md     ← NL → structured commands, intent resolver
└── sdk.md          ← nexus-agent-sdk: Rust + Python bindings, CLI
```

## The Headless Debug Loop

This is the canonical workflow an AI dev runs. Memorize it.

```
┌─────────────────────────────────────────────────────────────┐
│  1. nexus run --headless --rpc=stdio                        │
│     └─ engine boots, no window, JSON-RPC on stdio           │
│                                                             │
│  2. agent → initialize { capabilities }                     │
│     engine ← { capabilities, protocolVersion }              │
│                                                             │
│  3. agent → telemetry.subscribe { topics: ["*"] }           │
│     engine ──► notify(telemetry.frame) ──► every tick       │
│                                                             │
│  4. agent → scene.load { path: "scenes/dragon.scn" }        │
│     agent → entity.spawn { archetype: "dragon", pos: ... }  │
│                                                             │
│  5. agent → sim.advance { ticks: 600 }   (10s at 60Hz)      │
│     ◄── 600 telemetry frames stream back                    │
│                                                             │
│  6. assertion failed → agent → snapshot.capture             │
│                       → agent → replay.bisect { ... }       │
│                                                             │
│  7. fix code → agent → scenario.run { file: "regress.toml" }│
│     engine ← { passed: 47, failed: 0, duration: 2.3s }      │
│                                                             │
│  8. agent → shutdown                                        │
└─────────────────────────────────────────────────────────────┘
```

No frame is rendered. No window opens. No human watches. The loop runs at ≥10× real-time when the GPU is idle and physics is the bottleneck.

## Design Philosophy

| Principle | Consequence |
|---|---|
| Headless is default | Every system MUST run without a display. Renderer is opt-in. |
| Structured everywhere | No log strings. Every event is JSON with a schema. |
| Observable by default | Every system emits telemetry. No `--enable-debug` flag. |
| Snapshotable always | State is serializable at any tick boundary. No exceptions. |
| Deterministic given inputs | Same seed + same inputs → byte-identical state. (→ `docs/specs/physics/determinism.md`) |
| Single transport, many bindings | JSON-RPC 2.0 over stdio/TCP/IPC. Rust, Python, anything-with-stdin. |
| Editor uses the same API | The editor has zero privileged calls. It is just another agent. |

## Transport Choice

JSON-RPC 2.0 + LSP-style `Content-Length` framing over stdio (default), TCP, or Unix domain socket. Same wire format everywhere.

Why not gRPC? AI agents read and write JSON natively. Schema is self-describing. Curl works.

Why not REST? Bidirectional notifications (telemetry push, server-to-agent events) require persistent connection. Request/response is too narrow.

Why not raw protobuf? Opacity. An agent should be able to log a session, diff two transcripts, and understand both with no decoder.

→ Full transport spec: `docs/specs/agent/api.md`

## Prior Art

- **Language Server Protocol (LSP)** ✓ — JSON-RPC + Content-Length framing, capability negotiation, server-push notifications. We adopt the framing and lifecycle wholesale.
- **Model Context Protocol (MCP)** ✓ — capability-negotiated tools/resources/prompts over JSON-RPC. We adapt the primitives idea (`engine.tools/list`, `engine.resources/read`).
- **OpenAI function calling** ✓ — JSON-Schema-described tools the agent picks. Our semantic layer emits the same shape.
- **Bevy `ScheduleRunnerPlugin`** ✓ — proves a real game engine runs in pure headless mode at any tickrate. We do the same. (→ `docs/specs/agent/headless.md`)
- **GGPO** ✓ — save-state + resimulation as a first-class engine primitive. Our replay system is the offline cousin. (→ `docs/specs/agent/replay.md`)
- **Godot `--headless` and `--script`** ✓ — proves running an editor-class engine headless for CI. We go further: the editor itself is an agent client.
- **Unity / Unreal editor scripting** ✗ — bolted on, GUI-coupled, undocumented contracts. Exactly what we avoid.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| RPC roundtrip (local stdio) | < 1 ms | < 5 ms |
| Telemetry frame serialization | < 0.2 ms @ 1k entities | < 1 ms |
| Headless tick overhead vs windowed | 0% | < 2% |
| Snapshot capture (10k entities) | < 10 ms | < 50 ms [BENCHMARK NEEDED] |
| Scenario boot time | < 200 ms | < 1 s |

## Open Questions

- [DECISION NEEDED] Do we expose a WebSocket transport for browser-based agents in v1.0 or defer to v1.1?
- [DECISION NEEDED] Rate-limit policy when an agent floods `entity.spawn`. → `docs/contracts/core-agent.md` [AGENT: 14]
- [DECISION NEEDED] Multi-agent: can two agents drive the same headless instance simultaneously? Lock model?

## Reading Order

1. This file.
2. `api.md` — the wire.
3. `headless.md` — the runtime.
4. `telemetry.md` — the observation.
5. `scenarios.md` — the tests.
6. `replay.md` — the debugging superpower.
7. `semantic.md` — the high-level shortcut.
8. `sdk.md` — what you actually code against.
