<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Zed Extension (post-v1.0)

> **Status: post-v1.0 deliverable. NOT required for engine ship.** A Rust-native Zed extension that surfaces the nexus-coder fleet, the MCP server, and the script catalogue inside Zed's Assistant. Not a code editor; not a scene editor.

## What it is — and is not

- **Is:** a Zed extension (Rust + WASM) that registers `nexus-mcp-server` as a Zed `context_server`, exposes slash-commands (`/nexus_spawn`, `/nexus_run_scenario`, …), and adds Assistant tools backed by MCP.
- **Is not:** a port of the egui editor. Not a duplication of the VS Code extension's tree views (Zed's UI model is different).

## Boundaries

- **Owns:** the Zed extension manifest, the slash-command implementations, the Assistant tool registrations, the MCP server lifecycle inside Zed.
- **Does NOT own:** the MCP server (→ `docs/specs/agent/mcp-server.md`), the egui editor, agent RPC.
- **Cross-link:** → `docs/specs/agent/mcp-server.md`, → `docs/specs/agent/mcp-clients.md`, → `docs/specs/editor/vscode-extension.md`.

## Extension manifest (sketch)

`extension.toml`:

```toml
id          = "nexus"
name        = "Nexus Engine"
version     = "0.1.0"
schema_version = 1
authors     = ["Nexus Engine contributors"]
description = "Drive the Nexus engine via MCP from Zed."
repository  = "https://github.com/sebyx07/nexus-engine"

[language_servers]
# none — Rust Analyzer / etc. are user's own choice

[context_servers.nexus]
command = { path = "nexus", args = ["mcp", "serve", "--transport", "stdio", "--profile", "dev"] }

[slash_commands]
nexus_spawn          = { description = "Spawn an entity via natural language." }
nexus_run_scenario   = { description = "Run a TOML scenario." }
nexus_snapshot       = { description = "Capture a snapshot of the running engine." }
nexus_subagent       = { description = "Dispatch a subagent from the fleet." }
nexus_audit          = { description = "Run principle-keeper + RPC parity audit." }
```

## Slash commands

| Command | Behavior |
|---|---|
| `/nexus_spawn <prompt>` | calls `semantic_command` MCP tool; inserts the structured response into the Assistant thread. |
| `/nexus_run_scenario <file>` | invokes `run_scenario`; streams progress as Assistant tool-output messages. |
| `/nexus_snapshot [label]` | `capture_snapshot`; returns snapshot URI as a clickable `resource_link`. |
| `/nexus_subagent <name> <prompt>` | spawns a subagent through the local Claude/Anthropic CLI if available; else queues via MCP `prompts/get`. |
| `/nexus_audit` | runs `principle-keeper` + `check-rpc-parity`; failures rendered with file links. |

## Assistant tools

Every MCP tool from `docs/specs/agent/mcp-server.md` surfaces in the Zed Assistant tool list automatically (Zed enumerates `context_servers.*` tools). No per-tool extension code required.

## Status

| Zed surface | Use |
|---|---|
| Editor pane | unchanged (Zed's own editor) |
| Assistant pane | primary Nexus surface — chat + MCP tool calls |
| Project panel | `Nexus.toml` highlighted with the Nexus icon; right-click → "Run Headless" |
| Status bar (right) | "Nexus: 60 fps · dev · 3 agents" |
| Notifications | live-reload events, scenario completions |

## Settings (Zed `settings.json` fragment)

```jsonc
{
  "context_servers": {
    "nexus": {
      "command": {
        "path": "nexus",
        "args": ["mcp", "serve", "--transport", "stdio", "--profile", "dev"]
      },
      "settings": {
        "workspace": "{workspace.root}",
        "telemetry_topics": ["frame", "ecs", "physics"]
      }
    }
  }
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Extension load | < 100 ms | 500 ms |
| Slash-command dispatch latency | < 50 ms | 250 ms |
| Assistant tool call overhead | < 5 ms | 30 ms |
| MCP server cold start | < 800 ms | 2 s |
| Idle CPU | < 0.1% | 1% |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `ZED_SERVER_LAUNCH_FAILED` | `nexus` binary missing | guide install |
| `ZED_SLASH_ARG_INVALID` | bad arg shape | surface usage |
| `ZED_AGENT_OFFLINE` | engine not running | offer start |
| `ZED_CAP_DENIED` | profile too narrow | suggest profile bump |

## Test Requirements

- `zed.activation_smoke`: open Nexus repo in Zed → context server registers → `nexus_spawn` available.
- `zed.slash_command_roundtrip`: `/nexus_run_scenario fps/recoil` → streams to Assistant pane → exit ok.
- `zed.tool_enumeration`: Assistant tool list contains every MCP tool from `mcp-server.md`.
- `zed.no_engine_backdoor`: extension source contains no direct engine imports.

## Prior Art

- **Zed assistant docs** — slash command + context server patterns we follow verbatim.
- **`zed-extensions/elixir-ls`, `zed-extensions/svelte`** — minimum-viable extension shape.
- **GitHub Copilot for Zed** — Assistant integration UX baseline.

## Cross-references

- → `docs/specs/agent/mcp-server.md`
- → `docs/specs/agent/mcp-clients.md`
- → `docs/specs/editor/vscode-extension.md`
- → `docs/specs/editor/jetbrains-plugin.md`

## Open Questions

- `[DECISION NEEDED]` Bundle a Nexus-tuned Assistant prompt (system message), or stay neutral?
- `[DECISION NEEDED]` Telemetry rendering in Zed — status bar only, or a dedicated panel?
- `[VERIFY — Zed extension API]` Context server lifecycle hooks at release time.
- `[AGENT: 23]` `ide-extension-engineer` owns this file.
