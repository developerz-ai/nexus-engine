<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Architecture

> Orchestrator dispatches typed tasks → subagent pool → each subagent runs a Vercel AI SDK tool loop against an OpenRouter model → tools bridge into the live Nexus engine via `nexus-agent-sdk`.

→ Overview: `docs/specs/coder/overview.md`
→ Engine bridge: `docs/specs/agent/sdk.md` [AGENT: 10]
→ Agent contract: `docs/contracts/core-agent.md` [AGENT: 14]

---

## Boundaries

- **Owns:** orchestrator process, subagent worker processes, in-memory task queue, model client pool, tool runtime, game-context bridge.
- **Does NOT own:** the LLMs (OpenRouter) · the engine state (engine process) · git remote (gh CLI) · the spec corpus (it reads, doesn't write).
- **Depends on:** Vercel AI SDK ≥ 6 (`ai` npm) · OpenRouter HTTPS · `nexus-agent-sdk` JSON-RPC client · `git` ≥ 2.40 (worktrees) · Node ≥ 20.

---

## Layer diagram

```
                ┌────────────────────────────────────────────────┐
                │              nexus coder CLI                   │
                │   `implement` `fix` `bench` `review` `parallel` │
                └───────────────┬────────────────────────────────┘
                                │ task spec (JSON)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │                    Orchestrator                            │
   │  • parses task → DAG of subagent invocations               │
   │  • model router (per-task model pick)                      │
   │  • cost ledger + kill switch                               │
   │  • work-stealing queue                                     │
   │  • shared context cache (spec/contract chunks)             │
   └──────┬──────────┬──────────┬──────────┬──────────┬─────────┘
          │          │          │          │          │
          ▼          ▼          ▼          ▼          ▼
       Subagent  Subagent  Subagent  Subagent  Subagent       (N in flight)
       ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
       │ AI   │  │ AI   │  │ AI   │  │ AI   │  │ AI   │   each:
       │ SDK  │  │ SDK  │  │ SDK  │  │ SDK  │  │ SDK  │   • own worktree
       │ loop │  │ loop │  │ loop │  │ loop │  │ loop │   • own model
       └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘   • own tool set
           │         │         │         │         │
           ▼         ▼         ▼         ▼         ▼
   ┌────────────────────────────────────────────────────────────┐
   │                    Tool Runtime                            │
   │  ReadSpec · GrepCodebase · EditCrate · OpenPR              │
   │  RunHeadlessScenario · ReplaySnapshot · BenchPerfContract  │
   │  ValidateAgainstSpec  (all JSON-schema-typed)              │
   └──────┬─────────────────────────────────────────┬───────────┘
          │ file ops                                │ engine ops
          ▼                                         ▼
   ┌──────────────────┐                  ┌────────────────────────┐
   │ git worktrees    │                  │ nexus-agent-sdk client │
   │  + filesystem    │                  │ (Rust binding)         │
   └──────────────────┘                  └───────────┬────────────┘
                                                     │ JSON-RPC 2.0
                                                     ▼
                                          ┌────────────────────────┐
                                          │ nexus run --headless   │
                                          │ (engine subprocess)    │
                                          └────────────────────────┘
          ▲                                         ▲
          │ HTTPS                                   │
          │                                         │
   ┌──────┴──────────────────────────────────────────┐
   │              OpenRouter API                     │
   │  models[]: opus, sonnet, haiku, deepseek, …     │
   │  automatic provider fallback                    │
   └─────────────────────────────────────────────────┘
```

---

## Components

| Component | Process | Lang | Role |
|---|---|---|---|
| CLI | foreground | Node/TS | parse argv → emit task JSON |
| Orchestrator | long-running daemon | Node/TS | DAG, router, ledger, queue |
| Subagent worker | child process per slot | Node/TS | Vercel AI SDK tool loop |
| Tool runtime | in-proc library | Node/TS | JSON-schema-described functions |
| Engine bridge | child of orchestrator | Rust (or Python) | calls `nexus-agent-sdk` |
| Engine | child of bridge | Rust | `nexus run --headless` |

Each subagent runs in its own OS process for isolation (crash containment, memory bound, kill switch). Communication: stdio JSON lines.

---

## Subagent lifecycle

```
spawn  → load system prompt + context pack + tool schemas
       → call AI SDK streamText({ model, tools, maxSteps })
       → tool call ◄──► tool runtime (file or engine op)
       → repeat until model emits final structured output
       → emit { result, tokens, cost, files_changed } to orchestrator
       → orchestrator merges worktree OR queues review subagent
       → exit
```

Subagents are **single-task, single-shot**. No memory across tasks. State persists in the worktree + the spec/code corpus. → `docs/specs/coder/context.md`.

---

## Orchestrator internals

```
┌────────────────────────────────────────────┐
│ Orchestrator                               │
│ ┌────────────────────────────────────────┐ │
│ │ Task DAG (in-memory + JSONL on disk)   │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Work-stealing queue (per machine class)│ │  → parallelism.md
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Model Router (per-task policy table)   │ │  → models.md
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Cost Ledger (token tally, hard cap)    │ │  → telemetry.md
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Context Cache (spec/contract chunks)   │ │  → context.md
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Sandbox Mgr (git worktree pool)        │ │  → sandbox.md
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Audit Log (append-only JSONL)          │ │  → telemetry.md
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

---

## Why Vercel AI SDK

| Need | AI SDK feature |
|---|---|
| Provider-agnostic (OpenRouter is one of many) | `LanguageModel` interface, drop-in providers |
| Streaming structured output | `streamObject`, `experimental_output` on `streamText` |
| Multi-step tool loops | `maxSteps`, `stopWhen`, `ToolLoopAgent` (SDK 6+) |
| Type-safe tool schemas | Zod schemas → JSON Schema automatically |
| Cancellable streams | `AbortSignal` plumbed end-to-end |
| Telemetry hooks | `onStepFinish`, `onFinish` callbacks |

→ AI SDK 6 announcement: `https://vercel.com/blog/ai-sdk-6`
→ Docs: `https://ai-sdk.dev/docs/introduction`

---

## Why OpenRouter

| Need | OpenRouter feature |
|---|---|
| One API key, many models | unified `chat/completions` endpoint |
| Swap mid-project | change one string in config |
| Automatic failover | `models: [primary, fallback, ...]` |
| Provider transparency | `provider.order`, `provider.allow_fallbacks` |
| Cost visibility | per-request usage + price headers |
| Free-tier grunt work | `:free` suffix models |

→ Model fallbacks: `https://openrouter.ai/docs/guides/routing/model-fallbacks`
→ Provider routing: `https://openrouter.ai/docs/guides/routing/provider-selection`

---

## Game-context bridge

The bridge is a long-lived Rust process that:

1. Holds a `nexus-agent-sdk` client.
2. Multiplexes calls from N subagents onto 1 (or M) headless engine instances.
3. Exposes engine ops as JSON-schema tool definitions (`RunHeadlessScenario`, `ReplaySnapshot`, etc.).
4. Returns structured results (pass/fail + telemetry frame counts + perf metrics).

Subagents never speak JSON-RPC to the engine directly. They call tools; the bridge does protocol.

Pattern: same separation as Bevy `Plugin` vs app. Pattern reference: Liskov substitutability — swap engine binary, tool schema unchanged.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| Subagent spawn → first model token | < 2 s | < 5 s |
| Tool call dispatch overhead | < 10 ms | < 50 ms |
| Worktree create + populate | < 500 ms (warm pool) | < 3 s (cold) |
| Orchestrator scheduling latency | < 50 ms | < 200 ms |
| Max concurrent subagents (workstation class) | 16 sustained | 32 burst [BENCHMARK NEEDED] |
| Engine bridge throughput | 100 RPC/s/subagent | 500 RPC/s aggregate |

---

## Error contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_NO_SPEC` | task references missing `docs/specs/...` | suggest writing spec first |
| `E_CONTRACT_VIOL` | code diverges from `docs/contracts/...` | block PR, surface diff |
| `E_TOKEN_CAP` | session cost cap hit | pause queue, prompt user |
| `E_MODEL_DOWN` | OpenRouter primary + fallbacks all failed | retry w/ backoff, then halt |
| `E_SANDBOX_BREAK` | tool tried to escape worktree | kill subagent, audit |
| `E_SCENARIO_FAIL` | `RunHeadlessScenario` returned non-zero | feed report back to subagent or halt DAG |

---

## Open questions

- [DECISION NEEDED] Is the bridge a Rust process or are subagents linked against `nexus-agent-sdk` (Node bindings)? Default: Rust process, lower memory per subagent.
- [DECISION NEEDED] One headless engine per subagent, or shared engine pool? Default: shared pool of K engines, K ≪ N subagents, with per-request snapshot/restore.
- [BENCHMARK NEEDED] Memory cost per idle subagent. Target ≤ 200 MB.
