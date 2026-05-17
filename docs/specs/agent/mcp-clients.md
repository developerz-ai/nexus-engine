<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — MCP Client Integration Guide

> Per-client config snippets and a capability matrix. Every MCP-aware tool drives Nexus with zero engine-side code. The server is one (`nexus-mcp-server`); the clients are many.

## Boundaries

- **Owns:** install + config recipes per client, a JSON capability matrix nexus-coder reads to pick a client, troubleshooting per client, the conformance scenario each client passes.
- **Does NOT own:** the MCP server (→ `docs/specs/agent/mcp-server.md`), the underlying agent RPC (→ `docs/specs/agent/api.md`), the client implementations themselves.
- **Cross-link:** → `docs/specs/agent/mcp-server.md`, → `docs/contracts/core-agent.md`, → `docs/specs/coder/integration-with-engine.md`.

## Quick reference — capability matrix

Machine-readable mirror at `crates/nexus-mcp-server/schemas/clients.json`. Schema-validated in CI.

| Client | Transport | Stdio config path | Streaming | Sampling | Elicitation | Roots | Best use |
|---|---|---|---|---|---|---|---|
| Claude Desktop | stdio | `~/Library/Application Support/Claude/claude_desktop_config.json` (mac) · `%APPDATA%\Claude\claude_desktop_config.json` (win) | ✓ via SSE notifications | ✓ | ✓ | ✓ | Daily design + agent driving |
| Claude Code | stdio | `~/.claude.json` (user) or `.mcp.json` (repo) | ✓ | ✓ | ✓ | ✓ | CLI agent loops in this repo |
| Cursor | stdio (reuses VS Code MCP infra) | `~/.cursor/mcp.json` | ✓ | ✓ | partial | ✓ | Inline coding against scene |
| Zed | stdio | `~/.config/zed/settings.json` → `context_servers` | ✓ | ✓ | ✓ | ✓ | Rust-native editor users |
| ChatGPT Desktop | stdio + streamable-http | OpenAI app settings → "MCP servers" | partial `[VERIFY — MCP spec revision]` | partial | partial | ✓ | Cross-LLM workflows |
| MCP Inspector | stdio + streamable-http | CLI flag | ✓ | ✓ | ✓ | ✓ | Debugging the server itself |
| Browser / web | streamable-http (SSE) | runtime config in app | ✓ | per host | per host | per host | Cloud dashboards, agent UIs |
| VS Code (post-v1.0 extension) | stdio | `.vscode/mcp.json` | ✓ | ✓ | ✓ | ✓ | After `docs/specs/editor/vscode-extension.md` ships |

`[VERIFY — MCP spec revision]` Re-check the per-client matrix on each MCP spec cut — client capabilities lag the spec by weeks.

## Claude Desktop

Config (`claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "nexus": {
      "command": "nexus",
      "args": ["mcp", "serve", "--transport", "stdio", "--profile", "dev"],
      "env": {
        "NEXUS_WORKSPACE": "/abs/path/to/your-game"
      }
    }
  }
}
```

Restart Claude Desktop. Verify by typing `/mcp` — `nexus` server lists tools.

Troubleshooting:
- Server fails to launch → `nexus mcp doctor` prints diagnostics + exits non-zero.
- Tools missing → run with `--log-level debug`; check `~/.nexus/mcp-server.log`.
- Capability denied on a tool → wrong `--profile` (use `dev` for local).

## Claude Code

Repo-local config (`.mcp.json` at repo root) — checked into the project:

```jsonc
{
  "mcpServers": {
    "nexus": {
      "command": "nexus",
      "args": ["mcp", "serve", "--transport", "stdio", "--profile", "dev"]
    }
  }
}
```

User-local (`~/.claude.json`) — same shape, applies across projects.

Inside a Claude Code session: `/mcp` enables the server; the subagent fleet (→ `docs/guides/subagent-fleet.md`) picks tool calls via the standard Tool protocol.

## Cursor

Cursor reuses the VS Code MCP API. Config (`~/.cursor/mcp.json`):

```jsonc
{
  "mcpServers": {
    "nexus": {
      "command": "nexus",
      "args": ["mcp", "serve", "--transport", "stdio", "--profile", "dev"]
    }
  }
}
```

Note: extensions written against the VS Code Extension API run unchanged in Cursor. The future `docs/specs/editor/vscode-extension.md` ships once, runs in both.

## Zed

`~/.config/zed/settings.json`:

```jsonc
{
  "context_servers": {
    "nexus": {
      "command": {
        "path": "nexus",
        "args": ["mcp", "serve", "--transport", "stdio", "--profile", "dev"]
      },
      "settings": {
        "workspace": "/abs/path/to/your-game"
      }
    }
  }
}
```

Zed exposes MCP tools via the Assistant slash-command surface (`/nexus_spawn`, etc.). Same backing crate as the future Zed extension (→ `docs/specs/editor/zed-extension.md`).

## ChatGPT Desktop

Settings → "MCP servers" → Add. Two modes:

- **Stdio (recommended on macOS):** same `command` + `args` as Claude Desktop.
- **Streamable HTTP (remote workspace):** point at `https://<host>/mcp` with a bearer token; the server must run with `nexus mcp serve --transport http --bind 0.0.0.0:7777 --auth-token-file …`.

`[VERIFY — MCP spec revision]` — ChatGPT MCP support is newer; per-feature flags may not match Claude Desktop yet.

## MCP Inspector

The official debugging UI from `modelcontextprotocol/inspector`. Launch:

```
npx @modelcontextprotocol/inspector nexus mcp serve --transport stdio --profile dev
```

Opens a web UI on `http://localhost:6274`. Use it to:
- Enumerate `tools/list`, `resources/list`, `prompts/list`.
- Hand-craft a `tools/call` to debug a parity-test failure.
- Tail server logs.
- Validate the schema of every tool's `inputSchema`.

## Browser / web

Streamable HTTP transport at a public endpoint. The Nexus side:

```
nexus mcp serve \
  --transport http \
  --bind 127.0.0.1:7777 \
  --allowed-origin https://your-app.example \
  --auth oauth \
  --profile public_mod
```

Client side (TypeScript using `@modelcontextprotocol/sdk`):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "browser-app", version: "0.1.0" }, { capabilities: {} });
await client.connect(new StreamableHTTPClientTransport(new URL("https://your-app.example/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } }
}));
const tools = await client.listTools();
```

Origin validation is enforced server-side — DNS-rebinding hardening per MCP spec §"Security Warning".

## Future: VS Code extension

Once `docs/specs/editor/vscode-extension.md` ships (post-v1.0), the extension auto-registers the MCP server, exposes the subagent fleet as commands, and pipes telemetry to the status bar. The extension is a thin layer; it does NOT replace the editor — humans still get the egui editor for scene work.

## How nexus-coder picks a client

`crates/nexus-coder/src/mcp/client_select.rs` reads the capability matrix and chooses the first installed client that satisfies the required-features set for the active workflow. Heuristic:

```
weekend_mvp        → prefer Claude Desktop (sampling + roots + elicitation)
implement_spec     → Claude Code (repo-local config, CLI)
triage_crash       → MCP Inspector (raw access for debugging)
agent_observation  → browser (read-only public_mod profile)
```

Override per project in `Nexus.toml`:

```toml
[mcp.client_preference]
default = "claude-desktop"
workflows.implement_spec = "claude-code"
```

## Conformance scenario

Every supported client passes `scenarios/mcp-client-smoke.toml`:

1. `initialize` → capability set echoes server defaults.
2. `tools/list` → contains `spawn`, `step_frames`, `capture_snapshot`, `subscribe_telemetry`.
3. `tools/call spawn` → returns an `EntityId`.
4. `resources/subscribe telemetry://frame` → ≥ 59 updates in 60 ticks.
5. `tools/call capture_snapshot` → snapshot bytes round-trip via `restore_snapshot`.
6. Disconnect → audit log shows clean shutdown.

CI runs each scenario behind a matrix tag. Failures block release.

## Cross-references

- → `docs/specs/agent/mcp-server.md` — the server every client talks to.
- → `docs/specs/coder/integration-with-engine.md` — how nexus-coder bridges into MCP.
- → `docs/specs/coder/cli.md` — `nexus mcp serve` subcommand contract.
- → `docs/specs/editor/vscode-extension.md` — post-v1.0 IDE plugin (uses this config shape).
- → `docs/specs/editor/zed-extension.md` — Zed plugin (uses this config shape).

## Open Questions

- `[DECISION NEEDED]` Bundle `nexus-mcp-server` config templates in `nexus new`?
- `[DECISION NEEDED]` Auto-detect installed MCP clients and prompt to install configs (`nexus mcp install --client claude-desktop`)?
- `[DECISION NEEDED]` First-class support for non-MCP IDEs (Sublime, Helix) — gateway via stdio shim, or skip?
- `[VERIFY — MCP spec revision]` Each client's elicitation + sampling support — refresh quarterly.
- `[AGENT: 23]` `mcp-server-engineer` owns this file alongside `mcp-server.md`.
