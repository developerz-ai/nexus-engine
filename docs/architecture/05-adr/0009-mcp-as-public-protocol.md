<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0009 — Model Context Protocol as the Public Interop Layer

## Status

`Accepted`

Date: 2026-05-17
Authors: nexus-architecture-agent-27
Reviewers: integration team, agent-api team

## Context

Nexus has a stable agent JSON-RPC surface (→ `docs/specs/agent/api.md`) and first-party Rust + Python SDKs (→ `docs/specs/agent/sdk.md`). Every other AI client in the ecosystem — Claude Desktop, Claude Code, Cursor, Zed, ChatGPT Desktop, MCP Inspector, browser-based agent UIs — speaks the Model Context Protocol natively as of 2025-2026.

Without an MCP server, integrating Nexus into each host requires either:
- a per-host plugin (engineering cost per host, drift, version skew), or
- forcing users to write glue between an MCP-aware host and our raw RPC (bad DX, leaks our protocol, makes us own each host's quirks).

MCP itself does exactly what we want: a JSON-RPC 2.0 protocol with capability negotiation, primitives (tools, resources, prompts), and standard transports (stdio + streamable HTTP). It is shaped like LSP — proven pattern. Major vendors (Anthropic, OpenAI, Microsoft, Google) ship clients against it. Reference SDKs exist in Rust, Python, and TypeScript.

Forces:
- Law 1 — AI-first; every client must reach Nexus with zero friction.
- Law 3 — module boundaries; we want one published surface, not N.
- One server, every host, zero engine-side work per new host.
- Stability — MCP spec revisions are public, dated, and negotiated.
- The agent RPC + the editor + MCP must all converge on the same operation set (per ADR 0008 + Law 13).

## Decision

`nexus-mcp-server` (→ `docs/specs/agent/mcp-server.md`) is **the public interop protocol** for third-party AI clients.

- The server WRAPS the agent JSON-RPC surface 1:1. It does NOT add capability, does NOT bypass rate limits, does NOT define a new operation set.
- Capability gating, rate limits, and audit logging stay in the agent RPC dispatcher (→ `docs/contracts/core-agent.md`). The MCP server is a thin façade with audit at its own layer.
- Transports supported: `stdio` (desktop clients, default), `streamable-http` (remote / browser), `inline` (in-proc reuse by the editor and tests).
- MCP protocol revision pinned per release; cross-MAJOR breaks rejected at handshake.
- Every MCP tool/resource/prompt is generated from the agent RPC + nexus-coder workflow registries — no hand-curated mismatches.
- The Rust + Python SDKs remain first-party for direct use; MCP is for tool integration. Both routes coexist; both go to the same dispatcher.
- Pinned MCP spec revision: `2025-11-25` at the time of this ADR. `[VERIFY — MCP spec revision]` on each release.

## Consequences

### Positive

- **One server, every client.** Claude Desktop, Claude Code, Cursor, Zed, ChatGPT Desktop, MCP Inspector, browser-based agents — all work via the same `nexus-mcp-server` process with no per-host code.
- **No engine work per new MCP host.** When the next host emerges, it works.
- **Standard discovery surface.** `tools/list`, `resources/list`, `prompts/list` give clients machine-readable enumeration with JSON Schemas — Law 1 ergonomics out of the box.
- **Audit + capability re-used.** No duplicated auth model. The MCP server's audit log layers on top of the agent dispatcher's existing one.
- **Editor compatibility.** The editor's `Inline` transport can reuse the same crate for in-proc operation, keeping it `agent_client_0` (→ ADR 0008).
- **Cross-IDE compatibility.** The future VS Code/Cursor/Zed extensions (→ `docs/specs/editor/vscode-extension.md`, → `docs/specs/editor/zed-extension.md`) require no protocol invention — they configure the MCP server and let the host's MCP client do the rest.

### Negative / costs

- **Spec-revision tracking.** MCP evolves; we track revisions, validate at handshake, and run `[VERIFY — MCP spec revision]` per release. Manageable cost; the spec is published and dated.
- **Two RPC layers in some calls** (MCP frame → agent frame → engine command). Overhead is < 200 µs target per call; acceptable except in extreme-throughput cases where direct SDK use is the right tool anyway.
- **Sampling pass-through complexity.** MCP allows the server to ask the host for an LLM completion via `sampling/createMessage`. We accept this for `semantic_command` only, with audit and user opt-in (→ `docs/specs/agent/mcp-server.md` §"Security").
- **Per-client conformance tests.** We test against every supported host (Claude Desktop, Claude Code, Cursor, Zed, ChatGPT Desktop, MCP Inspector, browser). Each is a CI matrix lane.

### Neutral

- gRPC / Protobuf rejected (binary-only, schema toolchain, no major AI host speaks it natively today).
- Raw JSON-RPC remains available for users who don't need MCP — the SDK already uses it directly.
- The editor's RPC parity (Law 13) means new MCP tools land for free when the editor lands a feature.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **gRPC-only public protocol** | binary efficiency; widely tooled in backend ecosystems | not spoken by any AI host out of the box; requires per-host gateway; toolchain weight | wrong ecosystem; no AI hosts |
| **Custom JSON over WebSocket** | full control of surface | every host needs custom client; no `tools/list` discovery; we own a protocol forever | reinvents MCP, badly |
| **Raw JSON-RPC (our agent surface) as the public protocol** | zero new work; SDK consumers already use it | each MCP host requires a per-host adapter someone has to write; no `tools/list` / `prompts/list` discovery surface; we drift from the MCP-shaped ecosystem | costs more long-term than wrapping in MCP |
| **HTTP+SSE only (older MCP transport `2024-11-05`)** | one transport | deprecated; new clients require streamable HTTP | obsolete |
| **REST + OpenAPI** | broad tooling; classic API ergonomics | request/response only; no native streaming for telemetry; no MCP-style discovery; manual schema mapping | poor fit for streaming telemetry |
| **One MCP server per host** | per-host optimization | N implementations to maintain; defeats "one server, every client" benefit | scope explosion |

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"The AI-First Mandate"
- Laws: 1, 3, 8, 11, **13** (Agent–Editor RPC Parity)
- Specs:
  - `docs/specs/agent/mcp-server.md`
  - `docs/specs/agent/mcp-clients.md`
  - `docs/specs/agent/api.md`
  - `docs/specs/agent/sdk.md`
  - `docs/specs/editor/overview.md`
  - `docs/specs/editor/rpc-parity.md`
  - `docs/specs/editor/vscode-extension.md`
  - `docs/specs/editor/zed-extension.md`
- Contracts: `docs/contracts/core-agent.md`
- Related ADRs:
  - `docs/architecture/05-adr/0006-headless-by-default.md`
  - `docs/architecture/05-adr/0007-deterministic-replay.md`
  - `docs/architecture/05-adr/0008-editor-as-agent-client-zero.md`
- External:
  - MCP specification — https://modelcontextprotocol.io/specification (revision `2025-11-25`)
  - MCP architecture — https://modelcontextprotocol.io/docs/concepts/architecture
  - MCP transports — https://modelcontextprotocol.io/docs/concepts/transports
  - MCP schema — https://github.com/modelcontextprotocol/specification
  - Rust SDK — https://github.com/modelcontextprotocol/rust-sdk
  - Python SDK — https://github.com/modelcontextprotocol/python-sdk
  - TypeScript SDK — https://github.com/modelcontextprotocol/typescript-sdk
  - LSP — https://microsoft.github.io/language-server-protocol/ (the precedent)
