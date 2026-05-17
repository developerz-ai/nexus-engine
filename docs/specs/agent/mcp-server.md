<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — MCP Server (`nexus-mcp-server`)

> Model Context Protocol server that wraps the Nexus agent JSON-RPC API. One server, every MCP-aware client. Adds no capability — every MCP call resolves to one underlying `docs/specs/agent/api.md` method, gated by the capability/rate-limit contract in `docs/contracts/core-agent.md`.

## Boundaries

- **Owns:** the MCP protocol surface (resources, tools, prompts, notifications, sampling pass-through), the wire transport, MCP-side session state, MCP→agent-RPC dispatcher, MCP-specific telemetry.
- **Does NOT own:** the agent JSON-RPC methods themselves (→ `docs/specs/agent/api.md`), the capability/rate-limit model (→ `docs/contracts/core-agent.md`), telemetry topic schemas (→ `docs/specs/agent/telemetry.md`), the engine.
- **Depends on:** Model Context Protocol revision `2025-11-25` (`[VERIFY — MCP spec revision]`), JSON-RPC 2.0, the agent RPC dispatcher, the structured error envelope.
- **Cross-link:** → `docs/specs/agent/api.md`, → `docs/specs/agent/sdk.md`, → `docs/contracts/core-agent.md`, → `docs/architecture/01-principles.md#law-13`, → `docs/specs/editor/overview.md`.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  MCP Host (Claude Desktop · Claude Code · Cursor · Zed · ChatGPT)    │
│  └── MCP Client (one per server connection)                          │
└───────────────────────┬──────────────────────────────────────────────┘
                        │ JSON-RPC 2.0 over MCP transport
                        ▼
        ┌───────────────────────────────────────┐
        │   nexus-mcp-server (crate)            │
        │   ├─ transport (stdio · streamable    │
        │   │             HTTP w/ SSE)          │
        │   ├─ session  (id, caps, audit log)   │
        │   ├─ primitives                       │
        │   │    resources/* · tools/* · prompts/*
        │   ├─ MCP↔agent dispatcher              │
        │   │    (one MCP call → one nexus RPC) │
        │   └─ telemetry bridge (push as MCP    │
        │      resource updates)                │
        └──────────────────┬────────────────────┘
                           │ in-proc (Inline transport) OR
                           │ JSON-RPC over UDS/TCP/WS
                           ▼
                ┌─────────────────────────┐
                │  Nexus agent RPC server │
                │  (→ docs/specs/agent/   │
                │     api.md dispatcher)  │
                └────────────┬────────────┘
                             ▼
                        Nexus engine
```

The MCP server is a stateless façade over the agent RPC server in every respect that matters for capability checking: the agent dispatcher remains the only place that consults the capability bitset and rate-limit bucket.

## Crate layout

```
crates/
└── nexus-mcp-server/
    ├── src/
    │   ├── lib.rs              # public crate entry
    │   ├── transport/          # stdio, streamable-http
    │   ├── session.rs          # MCP session state
    │   ├── dispatcher.rs       # MCP name → agent RPC method
    │   ├── primitives/
    │   │   ├── resources.rs    # resources/{list,read,subscribe}
    │   │   ├── tools.rs        # tools/{list,call}
    │   │   └── prompts.rs      # prompts/{list,get}
    │   ├── audit.rs            # per-call structured audit record
    │   └── error.rs            # MCP error code mapping
    ├── schemas/                # canonical MCP capability snapshots
    └── tests/                  # per-client conformance (see Test Requirements)
```

Companion binary: `nexus mcp serve [--transport stdio|http] [--bind …] [--profile dev|ci|public_mod]`. Same `--profile` selector as the agent server — capability bundle from `Nexus.toml`.

## Lifecycle

```
MCP client                                  nexus-mcp-server
   │                                                 │
   │── initialize(protocolVersion, capabilities) ──►│
   │                                                 │── (lazy connect to engine RPC)
   │◄────────────  initialize result  ───────────────│   serverInfo + capabilities
   │── notifications/initialized ──────────────────►│
   │                                                 │
   │── tools/list ────────────────────────────────►│
   │◄──  { tools: [ spawn, despawn, … ] }  ─────────│
   │── tools/call { name: "spawn", args: {…} } ───►│── agent.rpc("entity.spawn", …)
   │◄──  { content: [...] }  ───────────────────────│
   │                                                 │
   │── resources/subscribe { uri: "telemetry://" } ►│── agent.rpc("telemetry.subscribe")
   │◄──  notifications/resources/updated ◄──────────│   push every frame
   │                                                 │
   │── shutdown / transport close ────────────────►│── agent shutdown + audit flush
```

Protocol-version field: pinned at `2025-11-25` on initialize; older clients negotiated down per MCP §"Backwards Compatibility". `[VERIFY — MCP spec revision]` against the schema each release.

## Transports

| Transport | When | Auth | Concurrency cap |
|---|---|---|---|
| `stdio` | Desktop clients launching the server as a child (Claude Desktop, Claude Code, Cursor, Zed). Default. | OS process boundary; profile fixed by command-line. | 1 client per process. |
| `streamable-http` | Remote / browser clients, multi-tenant, cloud deployments. POST + optional SSE on a single MCP endpoint. | OAuth 2.1 bearer token (recommended), API key, or mTLS. `Origin` header validated. Local mode MUST bind `127.0.0.1`. | `[DECISION NEEDED]` default 16 concurrent sessions; tune via `Nexus.toml`. |
| `inline` (in-proc) | Editor uses the same `nexus-mcp-server` crate as a library — no IPC, no framing — to remain the same "agent client #0" as the editor's direct RPC path. | N/A; same address space. | 1 per editor. |

`[VERIFY — MCP spec revision]` legacy HTTP+SSE (`2024-11-05`) supported only in compatibility mode; defer to `[DECISION NEEDED]`.

## Public API — Resources

URI schemes are stable. Reads/subscriptions resolve to `entity.*` / `scene.*` / `telemetry.*` / `replay.*` RPCs.

| MCP resource URI | RPC method | Caps | Cost band | Notes |
|---|---|---|---|---|
| `scene://current` | `scene.describe` (active sceneId) | `ECS_READ` | low | Tree + counts. |
| `scene://{sceneId}` | `scene.describe` | `ECS_READ` | low | |
| `entity://{entityId}` | `entity.get` (all components) | `ECS_READ` | low | |
| `entity://{entityId}?components=Transform,Health` | `entity.get` (subset) | `ECS_READ` | low | |
| `asset://{uuid}` | `asset.list` filtered + metadata | `ASSETS_READ` | low | Includes thumbnail URL. |
| `asset://{uuid}/bytes` | streamed via SSE | `ASSETS_READ` | high | Binary, base64-content blocks. |
| `telemetry://{topic}` | `telemetry.subscribe { topics: [topic] }` | `TELEMETRY_READ` | streaming | Push as `notifications/resources/updated`. |
| `replay://{snapshotId}` | `snapshot.export` | `STATE_READ` | medium | Resource exposes manifest; full bytes via subresource. |
| `replay://{snapshotId}/frame/{tick}` | `replay.start` + `replay.seek` | `STATE_READ + TIME_CTRL` | medium | One-shot read returns world snapshot at tick. |
| `scenario://{name}` | `scenario.run --dry-run` (status) | `SCENARIO_RUN` (read-only sub-cap) | low | |

Listing: `resources/list` enumerates a curated set (e.g. `scene://current`, every loaded scene, every live subscription). Wildcard URIs are documented but NOT enumerated.

## Public API — Tools

Every tool wraps exactly one agent RPC. Tool name = the RPC method with `.` replaced by `_`. Inputs forward verbatim; outputs are framed as MCP `content[]` (typically a single `text` block with the JSON-RPC `result` payload, plus optional `resource_link` for produced artifacts).

| MCP tool | RPC method | Cap required | Cost band | Frame-budget impact |
|---|---|---|---|---|
| `spawn` | `entity.spawn` | `ECS_SPAWN` | low | 1 frame |
| `spawn_batch` | `entity.spawnBatch` | `ECS_SPAWN` | medium | up to `maxEntitiesPerCall` |
| `despawn` | `entity.despawn` | `ECS_DESPAWN` | low | 1 frame |
| `set_component` | `entity.update` | `ECS_WRITE` | low | 1 frame |
| `get_component` | `entity.get` | `ECS_READ` | low | none (snapshot read) |
| `query_entities` | `entity.query` | `ECS_READ` | medium | none |
| `watch_entity` | `entity.watch` | `ECS_READ` | streaming | push |
| `pause` / `resume` | `sim.pause` / `sim.resume` | `TIME_CTRL` | low | n/a |
| `step_frames` | `sim.advance` | `TIME_CTRL` | medium | blocks N ticks |
| `set_speed` | `sim.setSpeed` | `TIME_CTRL` | low | n/a |
| `load_scene` | `scene.load` | `STATE_WRITE` | high | yields, async |
| `save_scene` | `scene.save` | `STATE_READ` | medium | |
| `capture_snapshot` | `snapshot.capture` | `STATE_READ` | medium | atomic at frame boundary |
| `restore_snapshot` | `snapshot.restore` | `STATE_WRITE` | medium | |
| `diff_snapshots` | `snapshot.diff` | `STATE_READ` | medium | |
| `run_scenario` | `scenario.run` | `SCENARIO_RUN` | high | yields, async |
| `cancel_scenario` | `scenario.cancel` | `SCENARIO_RUN` | low | |
| `subscribe_telemetry` | `telemetry.subscribe` | `TELEMETRY_READ` | streaming | push only |
| `unsubscribe_telemetry` | `telemetry.unsubscribe` | — | low | |
| `semantic_command` | `semantic.execute` | `SEMANTIC` (+ downstream caps) | medium | parse + dispatch |
| `eval_script` | `script.eval` | `SCRIPT_ADMIN` | medium | sandboxed |
| `reload_script` | `script.reload` | `SCRIPT_ADMIN` | low | |
| `import_asset` | `asset.import` | `ASSETS_LOAD` | high | async |
| `generate_asset` | `asset.generate` | `ASSETS_GEN_AI` | high | async, $ |
| `screenshot` | `engine.screenshot` `[DECISION NEEDED]` — confirm method exists in `api.md` | `STATE_READ + DEBUG` | medium | one frame extract |
| `set_overlay` | `debug.overlay.set` | `DEBUG` | low | |
| `replay_scrub` | `replay.seek` | `TIME_CTRL + STATE_READ` | medium | |
| `replay_bisect` | `replay.bisect` | `TIME_CTRL + STATE_READ` | high | long-running, progress |
| `engine_info` | `engine.info` | — | low | handshake echo |

Tools that may be long-running emit MCP `notifications/progress` mapped from agent `$/progress`.

## Public API — Prompts

Prompts wrap the canonical nexus-coder workflows (→ `docs/specs/coder/workflows.md`). Each prompt template is a parameterized message the client can render and submit back through its own LLM (or via `sampling/createMessage` if the client offers sampling).

| Prompt name | Wraps workflow | Arguments | Purpose |
|---|---|---|---|
| `implement_spec` | `coder.implement-spec` | `spec_path: string`, `model?: string`, `tier?: opus\|sonnet\|haiku` | Drive a spec → impl → test loop. |
| `fix_contract_violation` | `coder.fix-contract` | `contract_path: string`, `pr_number?: number` | Resolve a flagged contract drift. |
| `triage_crash` | `coder.triage-crash` | `crash_id: string`, `dump_path?: string` | Cluster, rank, propose fix PR. |
| `weekend_mvp` | `coder.weekend-mvp` | `genre: string`, `style: string`, `pitch: string` | End-to-end solo-dev scaffold + play loop. |
| `audit_principles` | `coder.audit-principles` | `paths: string[]` | Run `principle-keeper` against a path set. |
| `rpc_parity_audit` | `editor-rpc-parity-auditor` | — | One-shot audit emitting parity report. |

Prompts deliberately do NOT execute on the server — they return structured message templates per MCP spec.

## Notifications

Mapped 1:1 between MCP and agent RPC:

| MCP notification | Source | Maps to |
|---|---|---|
| `notifications/resources/updated` | server → client | agent `telemetry.frame`, `entity.changed`, `scene.changed`, etc. — re-tagged by resource URI. |
| `notifications/tools/list_changed` | server → client | engine capability re-handshake (e.g. plugin loaded). |
| `notifications/prompts/list_changed` | server → client | nexus-coder workflow registry changed. |
| `notifications/progress` | server → client | agent `$/progress`. |
| `notifications/cancelled` | client → server | agent `$/cancel`. |
| `notifications/message` (log) | server → client | structured engine log lines, filtered. |

## Capability negotiation

Server-advertised capability set on `initialize`:

```jsonc
{
  "capabilities": {
    "tools":     { "listChanged": true },
    "resources": { "subscribe": true, "listChanged": true },
    "prompts":   { "listChanged": true },
    "logging":   {}
  }
}
```

Client capabilities consumed:

| Client capability | Effect |
|---|---|
| `sampling` | Server MAY use `sampling/createMessage` to ask the host LLM for an inference (e.g., to plan a complex `semantic_command`). Server NEVER samples without a tool call originating it. |
| `elicitation` | Server MAY ask user to confirm destructive ops (e.g. `restore_snapshot` over uncommitted edits) via `elicitation/create`. |
| `roots` | Server scopes file URIs (asset paths, scene paths) to the declared workspace roots. |

## Security

- **Session-scoped capabilities.** The agent profile passed at server boot (`--profile dev|ci|public_mod`) is the upper bound. A tool call requiring a cap NOT in the profile fails with the MCP error `-32602` and a structured `data.cap_denied`.
- **Audit log.** Every tool/resource invocation records `{ session_id, ts_ns, mcp_method, agent_method, caps_required, principal, latency_ms, status }` to `.nexus/mcp-audit.ndjson`. Rotated daily.
- **Kill-switch.** A SIGUSR2 (Unix) or `nexus mcp kill <session>` immediately drops all sessions, severs the underlying agent RPC connection, and writes a terminal audit record.
- **Origin guard.** Streamable HTTP rejects requests whose `Origin` header is not in `[server.mcp.allowed_origins]` (`Nexus.toml`). Default: empty in production, `["http://localhost"]` in dev.
- **No tool description trust.** Tool annotations are server-generated from `docs/specs/agent/api.md` only; user-supplied descriptions are forbidden (`docs/architecture/01-principles.md` Law 1 + MCP §"Tool Safety").
- **Sampling controls.** When the server invokes `sampling/createMessage`, the message body is recorded into the audit log and tagged `sampled`. Users may disable sampling per session.

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| `tools/call` overhead vs raw agent RPC | < 200 µs | 1 ms | dispatcher + framing |
| `resources/read` (entity, single component) | < 500 µs | 2 ms | stdio |
| `resources/subscribe` (telemetry, 60 Hz) | sustained 60 fps with < 0.5 ms server CPU | 1 ms | |
| Concurrent sessions (streamable-http) | 16 | 64 | per server process; `[BENCHMARK NEEDED]` |
| Initialize handshake | < 50 ms | 200 ms | includes engine connect |
| Audit-log write | < 20 µs amortized | 100 µs | append-only NDJSON |
| Cold start (stdio launch) | < 800 ms | 2 s | matches agent SDK |

## Error Contract

| MCP `error.code` | `data.code` (Nexus) | Source agent code | Meaning |
|---|---|---|---|
| `-32700` | `MCP_PARSE_ERROR` | — | Bad JSON |
| `-32600` | `MCP_INVALID_REQUEST` | — | Malformed envelope |
| `-32601` | `MCP_METHOD_NOT_FOUND` | — | Tool/resource/prompt unknown |
| `-32602` | `MCP_INVALID_PARAMS` | `-32602` `INVALID_PARAMS` | Schema violation; `data.path` to bad field |
| `-32603` | `MCP_INTERNAL` | `-32603` | Server bug; capture and report |
| `-32010` | `CAP_DENIED` | `-32004` `CAPABILITY_DENIED` | Profile lacks required cap |
| `-32011` | `RATE_LIMITED` | `-32005` `RATE_LIMITED` | `data.retryAfterMs` set |
| `-32012` | `BACKPRESSURE` | `-32009` `SUBSCRIPTION_BACKPRESSURE` | Drain or unsubscribe |
| `-32020` | `NOT_FOUND` | `-32001` / `-32008` / `-32013` | Entity / scene / asset id stale |
| `-32030` | `ENGINE_ERROR` | wrapped | `data.subsystem_code` carries `RND-*` / `PHY-*` etc. |
| `-32040` | `NOT_PERMITTED_HERE` | — | Method disabled by profile (e.g. `public_mod`) |
| `-32099` | `INTERNAL_BUG` | `-32099` | Engine state suspect; restart |

Every error payload follows `docs/contracts/core-agent.md` shape: structured `data` with `code`, `method`, optional `suggested_fix`, optional `cap_denied[]`.

## Versioning

| Axis | Rule |
|---|---|
| MCP protocol version | Pinned per release in `crates/nexus-mcp-server/Cargo.toml` metadata. Client `initialize.protocolVersion` mismatch triggers negotiation per MCP §"Version Negotiation"; cross-MAJOR refused with `-32600`. |
| Agent RPC contract version | Reported on `initialize` under `serverInfo.metadata.nexus_agent_contract`. Same compatibility rules as `docs/contracts/core-agent.md` (MAJOR/MINOR/PATCH). |
| MCP↔nexus mapping table version | Bumped when any tool/resource/prompt name or input schema changes. Published in `crates/nexus-mcp-server/schemas/mapping-v{N}.json`. |

Compatibility matrix (filled per release):

| nexus-mcp-server | MCP protocol | nexus-agent | Notes |
|---|---|---|---|
| 0.1.x | 2025-11-25 | 0.1.x | initial pre-alpha |
| 1.0.x | 2025-11-25 + LTS predecessors | 1.0.x | v1.0 stability target |

`[VERIFY — MCP spec revision]` on each upstream cut.

## Test Requirements

- `mcp.initialize_handshake`: server responds to `initialize` with the declared capability set; protocolVersion echoes pinned value.
- `mcp.tools_list_completeness`: every entry in the Tools table above appears in `tools/list` output and has a JSON Schema. Diff against `docs/specs/agent/api.md` registry; missing/orphan rows fail CI.
- `mcp.resources_subscribe_telemetry`: subscribe to `telemetry://frame`, advance 60 ticks, receive ≥ 59 update notifications.
- `mcp.tools_call_parity`: for every tool, an MCP call and the equivalent raw agent RPC produce byte-identical engine state hashes.
- `mcp.error_mapping`: trigger every row of the Error Contract table; assert MCP code + `data.code` per the mapping.
- `mcp.audit_log`: every successful and every failed call writes one NDJSON record; record schema validates against `schemas/audit-record.schema.json`.
- `mcp.kill_switch`: SIGUSR2 mid-session terminates within 500 ms and writes a terminal audit record.
- `mcp.client_conformance` (one test per supported client):
  - Claude Desktop · Claude Code · Cursor · Zed · ChatGPT Desktop · MCP Inspector · browser (web SSE).
  - Each runs scenario `scenarios/mcp-client-smoke.toml`: connect, list tools, call `spawn`, subscribe telemetry for 60 ticks, capture snapshot, disconnect.

## Prior Art

| Project | Take |
|---|---|
| Language Server Protocol (Microsoft) | Same architectural pattern — protocol-over-JSON-RPC as universal IDE/editor integration. MCP is explicitly LSP-shaped. ✓ |
| JSON-RPC 2.0 | Wire format. ✓ |
| OpenAPI / Swagger | Schema-first tool description — same shape as MCP `inputSchema`. ✓ |
| gRPC reflection | Server-described schema discovery. ✓ for `tools/list` pattern. ✗ binary protocol mismatch. |
| Chrome DevTools Protocol | Domain/method namespacing, bidirectional events. Inspires error and notification shape. |
| MCP reference servers (`modelcontextprotocol/servers`) | Filesystem, Sentry, Postgres — our integration shape. We use the same SDK patterns. ✓ |

## Cross-references

- → `docs/specs/agent/api.md` — every RPC this server wraps.
- → `docs/specs/agent/sdk.md` — first-party clients; the SDK is a sibling, not a layer above this.
- → `docs/specs/agent/mcp-clients.md` — per-client integration recipes.
- → `docs/specs/agent/telemetry.md` — topic schemas exposed as `telemetry://` URIs.
- → `docs/contracts/core-agent.md` — capability model, rate limits, error envelope.
- → `docs/specs/editor/overview.md` — editor uses the inline transport.
- → `docs/specs/editor/rpc-parity.md` — every editor button has a matching RPC, therefore a matching MCP tool.
- → `docs/architecture/05-adr/0009-mcp-as-public-protocol.md` — the decision record.
- → `docs/architecture/01-principles.md#law-13` — RPC parity binding law.

## Open Questions

- `[DECISION NEEDED]` Default concurrent-session cap on streamable HTTP — 16 vs 64 vs unlimited-with-bucket.
- `[DECISION NEEDED]` Whether `engine.screenshot` is part of the v1.0 agent RPC surface (the MCP `screenshot` tool depends on it).
- `[DECISION NEEDED]` Backwards compatibility with the deprecated HTTP+SSE transport — ship it or refuse.
- `[DECISION NEEDED]` Sampling pass-through default — opt-in per session, or per server profile.
- `[DECISION NEEDED]` Whether the `inline` transport is published as a public crate API (editor reuse) or kept internal.
- `[BENCHMARK NEEDED]` Per-call overhead of the MCP→agent dispatcher at 10k tools/sec sustained.
- `[BENCHMARK NEEDED]` SSE stream stability over Cloudflare / VPN-of-the-day for `telemetry://` subscriptions.
- `[VERIFY — MCP spec revision]` Each release: confirm the pinned `protocolVersion` matches the latest stable schema.
- `[AGENT: 10]` Confirm agent RPC dispatcher exposes the in-process `Inline` transport handle used by the editor and the MCP inline transport.
- `[AGENT: 14]` Confirm the capability bitset shape this server forwards — any new MCP-specific cap (e.g. `MCP_SAMPLING`) needed?
- `[AGENT: 23]` Routing entry for `mcp-server-engineer` in the subagent fleet table (added in this PR).
