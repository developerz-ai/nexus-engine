<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0008 — Editor as `agent_client_0`

## Status

`Accepted`

Date: 2026-05-17
Authors: nexus-architecture-agent-27
Reviewers: integration team, agent-api team, editor team

## Context

The Nexus editor must exist (designers, level-builders, gizmo work are non-negotiable affordances for humans), but every other principle (Law 1 AI-first, Law 8 headless-by-default, Law 11 telemetry-by-default, Law 9 deterministic replay) demands that AI agents have full parity with whatever humans can do in that editor.

Conventional engines (Unity, Unreal, Godot ≤ 3) treat the editor as the primary interface and bolt automation on later as a sidecar API. The result: features ship with editor buttons that have no equivalent script/RPC; agents can never reach them; reproducibility breaks; the editor and the engine drift apart.

The editor's scope itself was at risk of expanding into a "everything app" (code editing, asset authoring, long-form scripting, prefab orchestration UI, animation timelines). Each addition raised the parity-debt cost and slowed agent integration.

Forces:
- Law 1 — every operation must be invocable from an agent.
- Law 8 — the engine must work without the editor at all.
- Law 9 — replay requires that human and agent paths produce identical state.
- The need for a fast human cursor for visual work (placing, transforming, scrubbing).
- The need to keep editor scope narrow enough for one small team to maintain.
- The need for one canonical surface — the agent RPC — so MCP, SDKs, scripts, and the editor all converge.

## Decision

The editor is **agent_client_0**: a reference implementation of an agent client, not a privileged backdoor.

- Every editor operation MUST be implemented as a call to one agent JSON-RPC method (→ `docs/specs/agent/api.md`).
- The editor MUST NOT have a privileged path into the engine. Same transport, same handshake, same capability gating as any external agent.
- The editor's scope is narrowed to: **asset/level quick-load, place/transform, scene tree + component inspector, replay scrubber, telemetry + perf overlays.** Nothing else. The native editor is NOT a code editor and is NOT a long-form authoring suite.
- The shader node graph is a thin UI over the shader-graph RPC, not a separate IDE.
- Code editing happens in the user's preferred IDE (the future VS Code/Cursor/Zed extensions surface the subagent fleet there; see → `docs/specs/editor/vscode-extension.md`, → `docs/specs/editor/zed-extension.md`).
- A new binding law (Law 13 — Agent–Editor RPC Parity, → `docs/architecture/01-principles.md#law-13`) enforces this at the merge gate.
- A CI auditor (→ `docs/specs/editor/rpc-parity.md`) diffs `editor_actions.toml` against `rpc_methods.toml` on every PR. Orphan buttons and orphan editor-surface RPCs block merge.
- Headless-only RPCs (e.g. `scenario.runBatch`) are explicitly tagged and exempt from the button requirement.

## Consequences

### Positive

- **Zero parity debt.** No editor feature can ship without its RPC. No RPC can quietly skip the editor it claims to expose.
- **Replay across humans + agents.** Editor sessions record as the same JSON-RPC command log an agent would emit; replay produces identical state.
- **MCP for free.** Because everything is one RPC surface, the MCP server (→ `docs/specs/agent/mcp-server.md`) wraps it without inventing any new capability.
- **Editor stays small.** Tight scope means a small team can ship it well. Long-form authoring stays in the IDE where it belongs.
- **Test ergonomics.** Every editor button is testable via raw RPC, headless, deterministic.
- **Cross-IDE compatibility.** The same RPC surface drives Claude Code, Cursor, Zed, ChatGPT Desktop, and future hosts (→ `docs/specs/agent/mcp-clients.md`).

### Negative / costs

- **Discipline tax on editor PRs.** Every editor PR now touches at least two registries (`editor_actions.toml`, `rpc_methods.toml`) and the underlying spec. CI auditor catches misses, but the friction is real.
- **Some UI-side state needs RPC wrapping** (dock layout, preferences). Wrapping these as `editor.preferences.*` headless-tagged RPCs adds methods that have no agent use case. Acceptable cost.
- **Latency floor.** Even local editor operations pay the RPC framing cost. Mitigated by the `Inline` (in-proc) transport (→ `docs/specs/agent/sdk.md`).
- **No native code editor.** Users get their IDE; this is a feature, not a bug. May surprise designers who expected a Unity-style monolith.

### Neutral

- The shader node graph is a UI over RPC, not a new sub-IDE. Authors of advanced shaders use `custom.wgsl` (→ `docs/specs/editor/shader.md`).
- The editor binary continues to ship; nothing about this ADR removes it.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Editor with privileged in-process API** (Godot, Unity historical) | low-latency editor; simple wiring | violates Law 1; agents permanently second-class; parity debt unbounded | violates Law 1 |
| **Headless-only; no editor at all** | maximum AI-first purity; smallest team | unusable for designers; visual work pays a 10× tax; replay scrubbing has no surface | violates "for AI agents + humans" mandate |
| **Custom code editor inside the engine** (Stride, UE Blueprint workflow) | seamless feel; one app | massive scope creep; duplicates VS Code/Cursor/Zed; never matches a real IDE | scope explosion; not our circle of competence |
| **Electron-only / web editor primary** | cross-platform UI for free; trivial remote-engine story | heavy memory footprint; poor native gizmo perf; competes with the egui editor we already have | egui + WGPU wins on perf and scope |
| **Two divergent surfaces — agent API for AI, editor API for UI** | feels easy in the short term | guaranteed drift; double maintenance; replay broken; MCP needs two adapters | the exact failure mode this ADR exists to prevent |

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"The AI-First Mandate", §"Who This Is For"
- Laws: 1, 8, 9, 11, **13** (new — Agent–Editor RPC Parity)
- Specs:
  - `docs/specs/editor/overview.md`
  - `docs/specs/editor/scene.md`
  - `docs/specs/editor/assets.md`
  - `docs/specs/editor/shader.md`
  - `docs/specs/editor/debug.md`
  - `docs/specs/editor/livereload.md`
  - `docs/specs/editor/rpc-parity.md`
  - `docs/specs/agent/api.md`
  - `docs/specs/agent/sdk.md`
  - `docs/specs/agent/mcp-server.md`
- Contracts: `docs/contracts/core-agent.md`
- Related ADRs:
  - `docs/architecture/05-adr/0006-headless-by-default.md`
  - `docs/architecture/05-adr/0007-deterministic-replay.md`
  - `docs/architecture/05-adr/0009-mcp-as-public-protocol.md`
- External:
  - LSP architecture (https://microsoft.github.io/language-server-protocol/) — the precedent for "tool is one client of many over a structured protocol".
