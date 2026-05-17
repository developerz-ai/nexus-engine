<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — VS Code / Cursor Extension (post-v1.0)

> **Status: post-v1.0 deliverable. NOT required for engine ship.** Spec exists so the design is in place when v1.x land. Cursor reuses the VS Code Extension API verbatim — one extension, two hosts.

## What it is — and is not

- **Is:** a thin VS Code extension that auto-launches `nexus-mcp-server`, surfaces the nexus-coder subagent fleet, exposes `scripts/` as tasks, and pipes live engine telemetry into the IDE chrome.
- **Is not:** a code editor (VS Code already is one). Not a scene editor (the native egui editor is — → `docs/specs/editor/overview.md`). Not a redo of the egui editor inside Electron.

The native editor (scenes, gizmos, asset browser, replay scrub) stays the human's tool for visual work. The IDE extension is for the textual work that already happens in VS Code/Cursor — and the agent fleet that drives the engine while the human writes code.

## Boundaries

- **Owns:** the `nexus.vsix` package, the extension's UI (sidebar, status bar, commands), the lifecycle of the auto-launched MCP server child process, telemetry rendering into IDE views.
- **Does NOT own:** the MCP server (→ `docs/specs/agent/mcp-server.md`), the agent RPC (→ `docs/specs/agent/api.md`), subagent files (→ `.claude/agents/`), engine internals.
- **Cross-link:** → `docs/specs/agent/mcp-server.md`, → `docs/specs/agent/mcp-clients.md`, → `docs/specs/coder/cli.md`, → `docs/specs/editor/zed-extension.md`.

## Surfaces

### Sidebar (Activity Bar)

```
┌─ Nexus ──────────────────────────────────┐
│ ▾ Subagents                              │
│   ▾ Running  (3)                         │
│     ⚙ orchestrator        12s · sonnet   │
│     ⚙ ecs-engineer        4s  · sonnet   │
│     ⚙ test-author         7s  · sonnet   │
│   ▾ Catalogue (97)                       │
│     ▸ Architecture                       │
│     ▸ Domain engineers                   │
│     ▸ Quality & process                  │
├──────────────────────────────────────────┤
│ ▾ Telemetry (live)                       │
│   frame.simMs       4.1                  │
│   ecs.entityCount   1,284                │
│   physics.bodies    421                  │
│   render.drawCalls  312                  │
├──────────────────────────────────────────┤
│ ▾ Scenarios                              │
│   ▸ scenarios/fps/recoil.toml      ✓     │
│   ▸ scenarios/rpg/dialog.toml      …     │
│   ▸ scenarios/net/rollback.toml    ✗     │
├──────────────────────────────────────────┤
│ ▾ MCP                                    │
│   nexus-mcp-server   ◉ stdio · dev       │
│   42 tools · 8 resources · 6 prompts     │
└──────────────────────────────────────────┘
```

### Inline (editor surface)

- **Spec ↔ impl linking.** Hover a `//! Implements: docs/specs/...` line → peek the spec block. Hover an `impl` of a trait → jump to its spec contract.
- **Contract violation diagnostics.** The extension runs `principle-keeper` on save and surfaces FAIL verdicts as VS Code diagnostics with the Law # in the source field.
- **Slash commands.** `/spec` `/impl` `/contract` `/scenario` `/review` — these mirror `.claude/commands/`; the extension dispatches them through the agent CLI or the MCP server's `prompts/*` surface.
- **Code lens.** Above each `pub fn` in `crates/**/src/**`, a `Spec` / `Tests` / `Bench` lens jumping to the matching docs/test/bench.

### Status bar

```
[Nexus dev · 60 fps · 3 agents · $0.42/hr · sonnet/opus]
```

| Segment | Source |
|---|---|
| Mode (`dev`/`headless`/`scenario`) | `engine.info` |
| Frame rate | `telemetry://frame` |
| Active agents | `nexus coder ps` |
| Spend ticker | `nexus coder usage --json` |
| Models in use | OpenRouter `engine.info.metadata.models[]` |

### Commands (Command Palette)

| Command | What it does |
|---|---|
| `Nexus: New Game` | runs `nexus new` |
| `Nexus: Run Headless` | `nexus run --headless` in integrated terminal |
| `Nexus: Run Editor` | launches the egui editor |
| `Nexus: Dispatch Subagent…` | picker over the fleet → invokes via CLI |
| `Nexus: Run Scenario…` | picker over `scenarios/**/*.toml` |
| `Nexus: Capture Snapshot` | `snapshot.capture` via MCP |
| `Nexus: Bisect Replay…` | inputs prompt → `replay.bisect` |
| `Nexus: Open MCP Inspector` | spawns `npx @modelcontextprotocol/inspector` against the running server |
| `Nexus: Audit Principles` | runs `principle-keeper`; renders FAILs as diagnostics |
| `Nexus: RPC Parity Audit` | runs `scripts/check-rpc-parity`; renders to Problems panel |

### Tasks

Every script under `scripts/` is exposed as a VS Code Task via `tasks.json` auto-generation. Categories from `scripts/manifest.toml` (→ `docs/specs/scripts/discovery.md`).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code / Cursor (Extension Host process)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  nexus.vsix (TypeScript)                              │  │
│  │  ├─ activation: workspaceContains:Nexus.toml          │  │
│  │  ├─ MCP client (spawn → stdio)                        │  │
│  │  ├─ tree view providers (subagents, telemetry, etc.)  │  │
│  │  ├─ diagnostic collection (principle-keeper, parity)  │  │
│  │  ├─ task provider (scripts/)                          │  │
│  │  └─ status bar items                                  │  │
│  └────────────────────────┬─────────────────────────────┘  │
└───────────────────────────┼────────────────────────────────┘
                            │ stdio (MCP)
                            ▼
              ┌────────────────────────────┐
              │  nexus mcp serve           │
              │  (child process)           │
              └─────────────┬──────────────┘
                            │ agent RPC (in-proc Inline)
                            ▼
                  ┌────────────────────┐
                  │  Nexus engine      │
                  │  (running / paused)│
                  └────────────────────┘
```

The extension never talks to the engine directly. Everything routes through the MCP server (which routes through agent RPC). Same constraint as the egui editor. No extension-exclusive operations.

## Activation

| Event | Trigger |
|---|---|
| `workspaceContains:Nexus.toml` | repo is a Nexus game/engine project |
| `workspaceContains:.mcp.json` | repo has MCP config |
| `onCommand:nexus.*` | user fires a command from a non-Nexus workspace |

Idle cost ≤ 30 MB RAM; CPU ≤ 0.1%.

## Settings (`settings.json` schema fragment)

```jsonc
{
  "nexus.mcp.profile": "dev",
  "nexus.mcp.serverCommand": "nexus",
  "nexus.mcp.serverArgs": ["mcp", "serve", "--transport", "stdio", "--profile", "${config:nexus.mcp.profile}"],
  "nexus.diagnostics.principleKeeper.onSave": true,
  "nexus.diagnostics.rpcParity.onSave": true,
  "nexus.statusBar.spendTicker": true,
  "nexus.openrouter.models": { "default": "sonnet-4.x", "tier.opus": "opus-4.x" }
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Activation cost | < 200 ms | 1 s |
| Idle RAM | < 30 MB | 80 MB |
| Idle CPU | < 0.1% | 1% |
| Tree refresh on telemetry frame | < 4 ms | 16 ms |
| Diagnostic refresh on save | < 300 ms | 2 s |
| Command palette latency | < 50 ms | 200 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `VSC_MCP_LAUNCH_FAILED` | `nexus` binary missing or wrong version | show install guidance |
| `VSC_MCP_HANDSHAKE_FAILED` | server initialize error | log details, prompt restart |
| `VSC_AGENT_OFFLINE` | no engine running | offer `nexus run --headless` |
| `VSC_PROFILE_DENIED` | tool needs cap not in profile | offer profile switch |
| `VSC_TELEMETRY_BACKPRESSURE` | tree view slower than stream | auto-throttle, surface badge |
| `VSC_TASK_NOT_REGISTERED` | `scripts/manifest.toml` missing entry | surface fix instruction |

## Cursor parity

Cursor implements the VS Code Extension API. The published `.vsix` MUST install in Cursor unchanged. The conformance scenario `scenarios/vscode-extension-smoke.toml` runs against both hosts. Any divergence is a `[VERIFY — Cursor compat]` flag in the changelog.

## Test Requirements

- `vscode.activation_smoke`: open the `nexus-engine` repo in VS Code → extension activates → MCP server starts → all sidebar trees populate.
- `vscode.cursor_parity`: same smoke test against Cursor; identical surface.
- `vscode.diagnostics_principle_keeper`: edit a file to violate Law 1 (string-only error) → diagnostic appears on save with `code = "LAW_1_AI_FIRST"`.
- `vscode.diagnostics_rpc_parity`: add a button without RPC → `Problems` shows `PARITY_ORPHAN_BUTTON` from `docs/specs/editor/rpc-parity.md`.
- `vscode.subagent_dispatch`: invoke "Dispatch Subagent" → picker shows all 97 + new ones → choosing one spawns it.
- `vscode.telemetry_stream`: run engine in background; sidebar shows live values updating at ≥ 30 Hz.
- `vscode.no_engine_backdoor`: extension source greps clean for any direct engine import — only MCP client paths permitted.

## Prior Art

- **GitHub Copilot extension.** Status-bar + sidebar pattern, model picker. ✓
- **GitLens.** Tree view ergonomics, hover providers, code lens density. ✓
- **Rust Analyzer.** Diagnostic + code lens flow tied to a language server (we tie to MCP). ✓
- **Roo / Continue.dev.** Subagent UX in the IDE. ✓
- **REST Client / Thunder Client.** Treating an RPC surface as first-class in the IDE. ✓
- **Tabnine, Codeium.** Status-bar cost/usage. ✓

## Cross-references

- → `docs/specs/agent/mcp-server.md` — the server this extension auto-launches.
- → `docs/specs/agent/mcp-clients.md` — config schema parity.
- → `docs/specs/editor/overview.md` — the native editor (does NOT compete).
- → `docs/specs/editor/zed-extension.md` — Zed sibling extension.
- → `docs/specs/editor/jetbrains-plugin.md` — JetBrains deferred to v2.0.
- → `docs/specs/coder/cli.md` — CLI commands the extension invokes.
- → `docs/specs/scripts/discovery.md` — script manifest the task provider reads.

## Open Questions

- `[DECISION NEEDED]` Marketplace publishing — official Microsoft Marketplace + Open VSX in lockstep, or staggered?
- `[DECISION NEEDED]` Embed MCP Inspector as a webview, or stay external (`npx`)?
- `[DECISION NEEDED]` Telemetry tree refresh rate — 30 Hz fixed, or adaptive?
- `[DECISION NEEDED]` Should the extension ship its own subagent dispatch path (calling Claude API directly) when Claude Code is not the active host?
- `[BENCHMARK NEEDED]` Activation perf on the largest Nexus monorepo (100k+ files).
- `[AGENT: 23]` `ide-extension-engineer` owns this file + the Zed/JetBrains siblings.
- `[VERIFY — VS Code Extension API]` ≥ 1.95 features used (chat participants, language model API) — gate per host version.
