<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — nexus-agent-sdk

> The client library and CLI an AI dev actually codes against. Rust as the source of truth; Python as the daily driver for orchestration and notebooks. One protocol, ergonomic in both.

## Boundaries

- **Owns:** transport, framing, codegen from RPC schemas, typed client API in Rust + Python, the `nexus agent` and related CLI subcommands, example integrations.
- **Does NOT own:** the JSON-RPC server inside the engine (→ `api.md`), the engine binary (`nexus-engine` crate), scenario semantics (→ `scenarios.md`).
- **Depends on:** wire protocol (→ `api.md`), headless runtime (→ `headless.md`), telemetry schemas (→ `telemetry.md`), snapshot format (→ `replay.md`).

## Crate / Package Layout

```
nexus-engine/
└── crates/
    ├── nexus-agent-proto/   # wire types, JSON-Schema → Rust structs (codegen)
    ├── nexus-agent-sdk/     # Rust client: transports, typed methods, async
    ├── nexus-agent-cli/     # the `nexus` binary (subset for agent ops)
    └── nexus-agent-py/      # PyO3 bindings: `pip install nexus-agent`
```

[AGENT: 01 confirm Cargo workspace layout matches `docs/architecture/04-workspace-layout.md`]

Both Rust and Python clients are generated from the canonical schema set in `crates/nexus-agent-proto/schemas/`. The schemas are the source of truth; SDK code that diverges fails CI.

## Rust SDK

### Quick start

```rust
use nexus_agent_sdk::{Engine, Transport, SpawnArgs, EntityId, telemetry::Topic};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Spawn engine as child process, stdio transport.
    let mut engine = Engine::launch(Transport::Stdio {
        binary: "nexus".into(),
        args:   vec!["run", "--headless", "--rpc=stdio", "--seed", "42"].into(),
    }).await?;

    engine.initialize_default().await?;
    engine.scene_load("scenes/demo.scn").await?;

    let dragon: EntityId = engine.entity_spawn(SpawnArgs::archetype("Dragon")
        .at([10.0, 0.0, 0.0])).await?;

    // Subscribe to telemetry; consume as a stream.
    let mut frames = engine.telemetry_subscribe(&[Topic::Frame, Topic::Physics]).await?;
    let advance = engine.sim_advance(600); // 10 s @ 60Hz
    tokio::pin!(advance);

    loop {
        tokio::select! {
            f = frames.next() => {
                let f = f?;
                println!("tick {} simMs {}", f.tick, f.topics.frame.sim_ms);
            }
            r = &mut advance => { r?; break; }
        }
    }

    let snap = engine.snapshot_capture_binary().await?;
    snap.export("artifacts/final.snap")?;

    engine.shutdown().await?;
    Ok(())
}
```

### Surface

| Module | Contents |
|---|---|
| `nexus_agent_sdk::Engine` | Top-level client. `launch`, `connect`, `initialize`, `shutdown`. |
| `nexus_agent_sdk::scene` | `scene_load`, `scene_save`, `scene_unload`, `scene_describe`. |
| `nexus_agent_sdk::entity` | CRUD + query. Typed via `Components` builder. |
| `nexus_agent_sdk::system` | `system_list`, `enable`, `disable`, `tick_step`. |
| `nexus_agent_sdk::sim` | `advance`, `pause`, `resume`, `set_speed`. |
| `nexus_agent_sdk::telemetry` | Subscriptions return `Stream<Item = TelemetryFrame>`. |
| `nexus_agent_sdk::snapshot` | `capture`, `restore`, `export`, `import`, `diff`, `patch`. |
| `nexus_agent_sdk::replay` | `start`, `pause`, `seek`, `bisect`, `verify`. |
| `nexus_agent_sdk::scenario` | `run`, `run_batch`, `validate`. |
| `nexus_agent_sdk::semantic` | `parse`, `execute`, `vocabulary`. |
| `nexus_agent_sdk::script` | `eval`, `reload`. |
| `nexus_agent_sdk::asset` | `import`, `list`, `generate`. |
| `nexus_agent_sdk::transport` | `Stdio`, `Tcp`, `UnixSocket`, `WebSocket`. |
| `nexus_agent_sdk::error::AgentError` | Single error enum, variant per `data.code`. |

All methods are `async`. Cancellation via `tokio::select!` issues `$/cancel`.

### Typed errors

```rust
match engine.entity_get(id, &["Transform"]).await {
    Ok(comps) => { /* ... */ }
    Err(AgentError::EntityNotFound { entity_id, tick, suggested_fix, .. }) => {
        eprintln!("entity {entity_id:?} gone at tick {tick}: {suggested_fix:?}");
    }
    Err(AgentError::RateLimited { retry_after_ms, .. }) => {
        tokio::time::sleep(Duration::from_millis(retry_after_ms)).await;
    }
    Err(e) => return Err(e.into()),
}
```

Every error variant carries the same fields as the JSON-RPC `data` object. Agents pattern-match on variants, not strings.

### Features

| Feature flag | Effect |
|---|---|
| `tokio` (default) | async runtime. |
| `smol` | alternative runtime. |
| `blocking` | synchronous wrappers (`engine.blocking()`). |
| `msgpack` | enable msgpack telemetry format. |
| `recording` | helpers to record sessions to disk. |
| `mock` | in-memory mock engine for unit tests. |

## Python SDK

### Quick start

```python
import asyncio
from nexus_agent import Engine, Topic

async def main():
    async with Engine.launch(args=["run", "--headless", "--rpc=stdio", "--seed", "42"]) as engine:
        await engine.initialize()
        await engine.scene.load("scenes/demo.scn")

        dragon = await engine.entity.spawn(archetype="Dragon", at=(10.0, 0.0, 0.0))

        async for frame in engine.telemetry.subscribe([Topic.FRAME, Topic.PHYSICS]):
            print(f"tick {frame.tick} sim {frame.topics.frame.sim_ms:.2f} ms")
            if frame.tick >= 600:
                break

        snap = await engine.snapshot.capture()
        snap.export("artifacts/final.snap")

asyncio.run(main())
```

### Sync convenience

```python
from nexus_agent.sync import Engine

with Engine.launch(args=["run","--headless"]) as engine:
    engine.initialize()
    engine.scene.load("scenes/demo.scn")
    engine.sim.advance(600)
    engine.snapshot.capture().export("artifacts/final.snap")
```

### Surface

Mirrors the Rust SDK 1:1. Submodules: `engine.scene`, `engine.entity`, `engine.system`, `engine.sim`, `engine.telemetry`, `engine.snapshot`, `engine.replay`, `engine.scenario`, `engine.semantic`, `engine.script`, `engine.asset`.

Types are dataclasses + pydantic models, generated from the same JSON Schemas. Frames are streamed via `async for`.

### Notebook / REPL

`pip install nexus-agent[notebook]` adds Jupyter helpers:

```python
from nexus_agent.notebook import live_engine, watch_topic

eng = live_engine()  # launches, attaches, registers shutdown
eng.scene.load("scenes/demo.scn")
watch_topic(eng, "physics.world")  # plots in-cell
eng.sim.advance(600)
```

## CLI: `nexus agent` and related subcommands

The `nexus` binary is the operator surface. Agent-relevant subcommands:

```
nexus run [...]                        # Boot engine (→ headless.md).
nexus agent connect <TRANSPORT>        # REPL against a running engine.
nexus agent eval <FILE.py|FILE.rs>     # Run an agent script against a fresh engine.

nexus scenario run <FILE>              # → scenarios.md
nexus scenario run-batch <GLOB>
nexus scenario validate <FILE>
nexus scenario list <DIR>

nexus snapshot capture                 # capture from running engine
nexus snapshot show <FILE>             # human/JSON view of snapshot
nexus snapshot diff <A> <B>
nexus snapshot patch <FILE> -p '...'

nexus replay <LOG>                     # replay recorded input log
nexus replay verify <LOG> <EXPECTED>
nexus replay bisect <SNAPSHOT> <LOG> --predicate '...' --range 0..10000

nexus telemetry tail [--topics ...]    # stream telemetry from running engine
nexus telemetry record <PATH>          # → ndjson
nexus telemetry replay <PATH>          # pretty-print

nexus semantic try "spawn a dragon near the castle"   # parse + show plan
nexus semantic vocab                                  # list intents

nexus determinism-check                # run smoke scenario twice, diff
```

All commands emit structured JSON when `--json` is set (CI-friendly).

## Reference Wire Examples

### Bare-metal stdio session (no SDK, for transparency)

```
→ Content-Length: 152\r\n\r\n
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1.0","clientInfo":{"name":"raw","version":"0"},"capabilities":{}}}

← Content-Length: 233\r\n\r\n
  {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1.0","serverInfo":{"name":"nexus-engine","version":"0.1.0"},"capabilities":{...},"limits":{...}}}

→ Content-Length: 64\r\n\r\n
  {"jsonrpc":"2.0","method":"initialized"}

→ {"jsonrpc":"2.0","id":2,"method":"sim.advance","params":{"ticks":60}}
← {"jsonrpc":"2.0","id":2,"result":{"ticksAdvanced":60,"dtMs":16.6}}
```

Any agent on any language can do this with two functions: a Content-Length writer and a Content-Length reader.

## Integration Recipes

### Headless CI

```yaml
# .github/workflows/scenarios.yml
- name: Scenarios
  run: nexus scenario run-batch 'scenarios/**/*.toml' --parallel 8 --junit junit.xml
```

### Claude Code agent loop

```python
# agent.py
from nexus_agent.sync import Engine

eng = Engine.launch(args=["run","--headless","--seed","42"]).enter()
eng.initialize()
eng.scene.load("scenes/playground.scn")

# The AI does its thing, calling structured RPCs:
result = eng.semantic.execute("spawn 10 goblins near the player")
plan   = result.dispatched     # show me what you did
eng.sim.advance(120)
snap = eng.snapshot.capture()
# If anything looks wrong:
hit  = eng.replay.bisect(snap.id, input_log="logs/run.ndjson",
                          predicate={"telemetry":"frame.simMs","op":">","value":10.0},
                          range=(0, 600))
print("budget exceeded first at tick", hit.tick)

eng.shutdown()
```

### Editor as agent

The Nexus editor uses the same SDK in-process (via `Transport::Inline` — a direct function-pointer transport that skips framing). The same code that scripts the engine from outside debugs it from inside. (→ `docs/specs/editor/overview.md` [AGENT: 11])

### Mod author

Mods that need to introspect the world during development use the Python SDK from a sidecar process. Production mods use scripting (→ `docs/specs/scripting/sandbox.md` [AGENT: 08]) — the agent SDK is dev-time tooling.

## Compatibility Matrix

| SDK | Min engine | Max engine | Notes |
|---|---|---|---|
| nexus-agent-sdk 1.x | 1.0 | 1.x | Same MAJOR. |
| nexus-agent-py 1.x | 1.0 | 1.x | Same. |
| Hand-written JSON-RPC client | 1.0 | 1.x | Honor capability negotiation. |

`MINOR` differences are absorbed by capability negotiation; the SDK exposes `engine.capabilities()` for runtime branching.

## Performance Contract

| Operation | Rust SDK | Python SDK | Notes |
|---|---|---|---|
| Roundtrip (local stdio, small) | < 1 ms | < 2 ms | |
| Roundtrip (local UDS) | < 0.5 ms | < 1 ms | |
| Sustained throughput (calls/sec, 1KB params) | > 10k | > 5k | [BENCHMARK NEEDED] |
| Telemetry stream sustained (frames/sec) | > 5k | > 2k | |

## Test Requirements

- SDK + engine compiled from same commit MUST pass `nexus determinism-check`.
- Rust and Python clients running the same scenario sequence MUST produce byte-identical artifacts.
- `Engine::launch` then immediate `Drop` MUST cleanly terminate engine child within 1 s.
- Cancellation via tokio drop MUST emit `$/cancel` before connection teardown.
- Mock transport (`features=["mock"]`) supports all SDK methods without spawning engine.

## Cross-references

- → `docs/specs/agent/api.md` — wire protocol
- → `docs/specs/agent/headless.md` — flags consumed by `Engine::launch`
- → `docs/specs/agent/telemetry.md` — `TelemetryFrame` type
- → `docs/specs/agent/snapshot` and `replay.md` — types reused by SDK
- → `docs/specs/agent/scenarios.md` — `nexus scenario` commands
- → `docs/specs/agent/semantic.md` — `engine.semantic.*`
- → `docs/specs/editor/overview.md` — editor reuses SDK [AGENT: 11]
- → `docs/specs/scripting/sandbox.md` — `script.eval` capability surface [AGENT: 08]
- → `docs/contracts/core-agent.md` — capability surface contract [AGENT: 14]
- → `docs/architecture/04-workspace-layout.md` — crate placement [AGENT: 01]
- → `docs/game-template/cli.md` — `nexus new`, integration with template [AGENT: 15]

## Prior Art

- **LSP client libraries (`tower-lsp`, `pygls`)** ✓ — proven async JSON-RPC clients in Rust + Python; we model ergonomics after these.
- **MCP SDKs (`@modelcontextprotocol/sdk-python`, `mcp` Rust)** ✓ — capability negotiation + typed tool calls.
- **PyO3** ✓ — clean Rust → Python binding, what we use for the Python package.
- **Playwright** ✓ — same API in many languages, driven by codegen from a single schema. Our exact model.
- **Bevy `App` builder** ✗ — not a client model but informs typed-fluent API for setup args.
- **Anthropic SDK** ✓ — typed errors, stream consumption ergonomics.

## Open Questions

- [DECISION NEEDED] Whether to ship a TypeScript / Node SDK in v1.0 for web tooling, or defer.
- [DECISION NEEDED] Whether `Engine::launch` should auto-detect the `nexus` binary on PATH or require an explicit path. Probably both with fallback.
- [DECISION NEEDED] How aggressively to constrain async runtimes in Rust (tokio only? trait-based?). Coordinate with [AGENT: 02] `jobs.md`.
- [BENCHMARK NEEDED] Python SDK overhead per call vs raw Rust (target ≤ 2× to stay viable for hot loops).
