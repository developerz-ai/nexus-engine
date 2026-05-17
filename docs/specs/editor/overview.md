<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Overview

> Optional, scriptable, agent-callable visual frontend over the headless engine. Every editor action is also a JSON-RPC call. The editor is a client of the engine, never the other way around.

## Scope

Editor surface = **quick-load + place + inspect + scrub + telemetry**. Not a code editor. Not a long-form authoring suite.

What the editor IS:
- Asset / level **quick-load**.
- **Place / transform** entities via gizmos.
- **Scene tree + component inspector** (the egui inspector dock).
- **Replay scrubber** + snapshot diff viewer.
- **Telemetry + perf overlays**.

What the editor is NOT:
- Not a code editor — use VS Code / Cursor / Zed via the future extensions (→ `docs/specs/editor/vscode-extension.md`, → `docs/specs/editor/zed-extension.md`).
- Not a long-form authoring suite — animation timelines, narrative graphs, cinematics live in dedicated tools or scripts.
- Not a node-graph IDE — the shader graph is a thin UI over the shader-graph RPC, not a sibling editor (→ `docs/specs/editor/shader.md`).

> **The editor is a fast human cursor over the AI's keyboard.** Mouse for pointing; chat for describing; both routes hit the same RPC.

## Non-negotiables

- **100% AI control.** Every editor button / gesture / menu = one method on the agent JSON-RPC API. Zero editor-exclusive operations.
- **The editor IS `agent_client_0`.** Same transport, same handshake, same capability gating as any external agent. No privileged backdoor.
- **Headless reaches every operation.** A PR that adds an editor action without a matching RPC is blocked by `principle-keeper` and the parity auditor.
- **Every RPC documents its editor surface** in `editor_actions.toml`, OR is explicitly marked `surfaces = ["headless"]` with a justification (→ `docs/specs/editor/rpc-parity.md`).
- **MCP wraps the same surface.** The MCP server (→ `docs/specs/agent/mcp-server.md`) exposes editor-grade operations to every MCP host with zero engine-side work.
- See `docs/architecture/01-principles.md#law-13` (Agent–Editor RPC Parity) and `docs/architecture/05-adr/0008-editor-as-agent-client-zero.md`.

## Boundaries

- Owns: panel layout, docking, command palette, undo log, gizmo rendering, in-process IPC to engine, editor-only state (selection, viewport camera, preferences).
- Does NOT own: world simulation, asset bytes, scripting VM, renderer — the editor is a thin client over the engine. → `docs/specs/agent/api.md`.
- Does NOT own: asset generation, import — triggers them via `→ docs/specs/assets/generation.md` and `→ docs/specs/assets/import.md`.
- Does NOT own: code editing, long-form authoring — use the IDE extensions (→ `docs/specs/editor/vscode-extension.md`, → `docs/specs/editor/zed-extension.md`).
- Depends on: `docs/specs/agent/api.md` (every action), `docs/specs/agent/telemetry.md` (panels subscribe), `docs/specs/core/events.md` (in-process bus), `docs/specs/scripting/hotreload.md` (live reload trigger), `docs/specs/editor/rpc-parity.md` (CI enforcement).

## Core Principle: Editor = Agent Client #0

The editor is the reference client of the agent API. Every button is a thin wrapper around a JSON-RPC method. If a thing can be done in the editor, it can be done by an agent. If it can't be done by an agent, it can't be in the editor.

Enforced by Law 13 (→ `docs/architecture/01-principles.md#law-13`) and the parity auditor (→ `docs/specs/editor/rpc-parity.md`). Same RPC surface is also exposed via MCP (→ `docs/specs/agent/mcp-server.md`).

```
human click  ─┐
agent rpc    ─┼─►  agent API (JSON-RPC over UDS/WS)  ─►  engine (headless core)
script call  ─┘                                            │
                                                           ▼
                              editor panels  ◄── telemetry bus
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  nexus-editor (binary)                                              │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  egui + egui_dock + wgpu (immediate mode, native + WASM)       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬────────┐ │
│  │ SceneDock│InspectDk │AssetDock │ShaderDk  │DebugDk   │Console │ │
│  │ scene.md │ scene.md │assets.md │shader.md │debug.md  │        │ │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴────────┘ │
│       ▲           ▲          ▲           ▲          ▲              │
│       └───────────┴──────────┴───────────┴──────────┘              │
│                        EditorCore                                   │
│       ┌─────────┬─────────────┬─────────┬──────────────┐           │
│       │ undo log│ selection   │cmd palet│  livereload  │           │
│       │         │   model     │   te    │  livereload.md│          │
│       └─────────┴─────────────┴─────────┴──────────────┘           │
│                        │                                            │
│           JSON-RPC client (UDS local · WS remote)                  │
└────────────────────────┼────────────────────────────────────────────┘
                         ▼
            ┌────────────────────────┐
            │  nexus engine (any)    │
            │  in-proc · same-host   │
            │  remote dev server     │
            └────────────────────────┘
```

- **UI layer**: `egui` immediate mode + `egui_dock` for tabs/docks. WGPU backend shared with engine renderer when in-proc.
- **Editor core**: panel-agnostic state — selection, undo, command palette, RPC client, live-reload watcher.
- **Transport**: UDS for local engine (zero-copy possible), WebSocket for remote / WASM. Same JSON-RPC schema. → `docs/specs/agent/api.md`.

## Why immediate mode (egui)

| Property | Retained (Qt/GTK) | Immediate (egui) |
|---|---|---|
| State sync | manual, error-prone | UI is a pure function of engine state |
| Hot reload of UI code | rebuild + restart | rebuild only (state lives in engine) |
| WASM port | painful | native |
| LOC for panel | 500-2000 | 50-300 |
| Agent scriptability | wrap every widget | not needed — agents skip the UI |

Trade-off: 60+ fps UI cost (~1-3ms/frame budget). Acceptable. Editor IS a frame loop.

Prior art: `emilk/egui`, `bevyengine/bevy_editor_prototypes` (egui-based), Godot's Control nodes (retained — slower iteration), Stride C# WPF (powerful but Windows-only).

## Public API

```rust
// All actions go through this trait. Editor UI calls it. Agents call it. Scripts call it.
pub trait EditorCommand {
    type Output;
    fn id(&self) -> &'static str;          // e.g. "scene.entity.spawn"
    fn execute(&self, ctx: &mut EditorCtx) -> Result<Self::Output, EditorError>;
    fn undo(&self, ctx: &mut EditorCtx) -> Result<(), EditorError>;
    fn serialize(&self) -> serde_json::Value;  // every command is JSON-roundtrippable
}

pub struct EditorCtx {
    pub rpc: AgentRpcClient,   // → docs/specs/agent/api.md
    pub selection: Selection,
    pub undo_log: UndoLog,
    pub bus: EventBus,         // → docs/specs/core/events.md
}

pub struct UndoLog { /* see undo section */ }
pub struct CommandPalette { /* see command palette section */ }
```

## Undo log

- Structured, serializable, ring buffer (configurable size, default 1024 entries).
- Each entry: `{ id, timestamp, command_json, inverse_command_json, telemetry_snapshot }`.
- Saved to `.nexus/editor/undo.log` on quit. Replayable: an agent can read the log and reproduce any human's session.
- Branches on edit-after-undo (no destructive truncation; old branch tagged `orphan`).
- `[DECISION NEEDED]` cap on snapshot size per entry, or always defer to engine state diff?

## Command palette

- Ctrl+P opens. Fuzzy search across:
  - All `EditorCommand`s
  - All RPC methods (auto-imported from `docs/specs/agent/api.md` schema)
  - Recent files, recent assets, recent entities
  - Open panels
- Every palette entry has the same JSON command form as the underlying RPC. → reproducible.

## Panel layout (default)

```
┌──────────────┬──────────────────────────────────┬────────────────┐
│              │                                  │                │
│  Scene Tree  │        Viewport (3D/2D)          │   Inspector    │
│  scene.md    │        + gizmos + grid           │   scene.md     │
│              │                                  │                │
│              ├──────────────────────────────────┤                │
│              │                                  │                │
│              │    Asset Browser                 │   Telemetry    │
│  Outliner    │    assets.md                     │   debug.md     │
│              │                                  │                │
├──────────────┴──────────────────────────────────┴────────────────┤
│  Console · Profiler · Shader Graph · Live Reload Log · NetGraph  │
└──────────────────────────────────────────────────────────────────┘
```

User-rearrangeable via `egui_dock`. Layouts saved per-project in `.nexus/editor/layout.ron`.

## Editor lifecycle

```
spawn ─► load layout ─► connect to engine RPC ─► subscribe telemetry
         │
         ▼
    paint frame ──► poll RPC events ──► dispatch to panels ──► repaint
         │                                                       ▲
         ▼                                                       │
    user input ──► command palette / panel handler ──► EditorCommand
                                                          │
                                                          ▼
                                          rpc.call() + undo_log.push()
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Editor frame time (idle) | < 2 ms | 8 ms |
| Editor frame time (busy panel) | < 8 ms | 16 ms |
| Cold start (in-proc engine) | < 1.5 s | 4 s |
| Cold start (remote engine) | < 500 ms (UI only) | 2 s |
| RPC roundtrip (local UDS) | < 200 µs | 1 ms |
| Undo/redo step | < 5 ms | 50 ms |
| Memory (no scene loaded) | < 80 MB | 200 MB |

→ `[BENCHMARK NEEDED]` on Steam Deck, Pi 5, low-end Android tablet (cloud-streamed editor).

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `ED_RPC_TIMEOUT` | engine did not respond in budget | reconnect; preserve unsaved edits |
| `ED_RPC_DISCONNECT` | transport closed | retry; switch to read-only mode |
| `ED_UNDO_EMPTY` | nothing to undo | UI hint |
| `ED_UNDO_BRANCH_LOST` | inverse command no longer applicable | offer to discard or replay forward |
| `ED_CMD_UNKNOWN` | palette command not registered | fallback: send raw RPC |
| `ED_LAYOUT_CORRUPT` | layout.ron failed to parse | restore default |
| `ED_SELECTION_STALE` | entity id no longer exists in engine | clear selection |

All errors structured JSON per `docs/specs/agent/api.md` error schema.

## Telemetry per panel

Every panel emits:
- `editor.panel.{name}.frame_ms`
- `editor.panel.{name}.rpc_calls`
- `editor.panel.{name}.repaints`
- `editor.panel.{name}.last_user_action`

Subscribed via `docs/specs/agent/telemetry.md`. Useful for agents that observe a human session to learn workflows.

## Integration Points

| Touches | How |
|---|---|
| `docs/specs/agent/api.md` | every command issued as RPC |
| `docs/specs/agent/mcp-server.md` | same RPC surface exposed via MCP to every MCP-aware host |
| `docs/specs/agent/telemetry.md` | panels subscribe to system streams |
| `docs/specs/editor/rpc-parity.md` | CI gate enforcing the agent-client-zero contract |
| `docs/specs/editor/vscode-extension.md` | post-v1.0 IDE surface for textual workflows |
| `docs/specs/editor/zed-extension.md` | post-v1.0 Zed surface |
| `docs/specs/scripting/hotreload.md` | live-reload watcher trigger |
| `docs/specs/assets/registry.md` | asset browser queries registry |
| `docs/specs/assets/generation.md` | "Generate" button invokes pipeline |
| `docs/specs/renderer/shaders.md` | shader graph compiles to WGSL |
| `docs/specs/physics/overview.md` | debug draws collected by renderer |

## Test Requirements

- `editor.headless_check`: editor binary refuses to start if engine RPC is unreachable, but exits with structured error JSON to stdout (not a panic).
- `editor.command_replay`: capture a 5-minute human session as JSON command log, replay headless, produce byte-identical scene state.
- `editor.parity`: every UI button has a corresponding RPC method. CI greps panel code for `rpc.call(` and diffs against API schema.
- `editor.no_global_state`: editor binary embeds zero engine state — restart with engine running ⇒ resumes seamlessly.
- `editor.frame_budget`: synthetic scene of 10k entities, 60 fps editor maintained.

## Prior Art

- ✓ Godot 4 editor — best OSS editor ever, plugin system, dock model, scene-as-data. ✗ retained UI slows iteration; tightly coupled to engine binary.
- ✓ Stride (C#) — node material editor, asset preview pipeline. ✗ Windows-bound, low adoption.
- ✓ `bevyengine/bevy_editor_prototypes` — egui-based, ECS-native. ✗ early stage; no remote engine.
- ✓ Unity inspector UX, drag-drop fluidity. ✗ runtime fees, opaque internals.
- ✓ UE5 — command palette, blueprint graph maturity. ✗ closed, C++ rebuild cycle.
- ✓ JetBrains Rider — debug overlay quality, command palette. (inspires the dev-tool feel.)
- ✓ Blender — node editor ergonomics, modal viewport. → shader.md.
- ✓ ShaderVine (WebGPU, 2026) — WGSL live preview + node graph for the agentic era.

## Open Questions

- `[DECISION NEEDED]` Tauri shell for native window chrome, or pure `eframe`?
- `[DECISION NEEDED]` Same binary for headless engine + editor (feature flag), or two binaries sharing a workspace?
- `[DECISION NEEDED]` Remote-engine auth model — token-in-URL, mTLS, or OS-keyring per workspace?
- `[BENCHMARK NEEDED]` egui_dock perf with > 20 simultaneous panels on integrated GPU.
- `[AGENT: 10]` confirm RPC streaming model (server-push vs client-poll) before locking telemetry subscription contract.
- `[AGENT: 16]` editor plugin packaging — same MIT-only constraint? Where do third-party panels live in the merge pipeline?
