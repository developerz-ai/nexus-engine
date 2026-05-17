<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Logging

Structured JSON. Always. Every language.

## One logger per language

| Language | Logger | Output format |
|----------|--------|---------------|
| Rust | `tracing` + `tracing-subscriber` (JSON layer) | JSON |
| TypeScript | `pino` | JSON |
| Python | `structlog` (JSONRenderer) | JSON |
| Lua | `nexus.log` (wraps engine `tracing`) | JSON |

Forbidden: `println!`, `eprintln!`, `dbg!`, `console.log`, `console.error`, `print`, `logging.basicConfig`, raw `io.write`. → `rust.md`, `typescript.md`, `python.md`, `lua.md`.

Cite: docs.rs/tracing · getpino.io · structlog.org · opentelemetry.io/docs/specs/semconv.

## Event schema

Every log event is a JSON object with these reserved fields:

```json
{
  "ts":       "2026-05-17T09:00:00.123Z",
  "level":    "info",
  "msg":      "spawned entity",
  "target":   "nexus_ecs::world",
  "span":     "frame[42]",
  "trace_id": "01HXY...K9",
  "span_id":  "00FZA...3",

  "entity_id":  4294967296,
  "archetype":  "Player",
  "frame":      42
}
```

| Field | Required | Source |
|-------|----------|--------|
| `ts` | yes | logger (RFC 3339, UTC, `Z` suffix) |
| `level` | yes | logger |
| `msg` | yes | call site (lowercase, no period) |
| `target` | yes | module path |
| `span` | when in span | active span name |
| `trace_id` | yes | OpenTelemetry trace ID (ULID) |
| `span_id` | when in span | OpenTelemetry span ID |
| `err` | on error logs | universal error JSON → `errors.md` |
| `<domain>` | as needed | call-site key-value pairs |

Reserved keys (cannot be overridden): `ts`, `level`, `msg`, `target`, `span`, `trace_id`, `span_id`.

## Levels

| Level | Use | Hot-path? |
|-------|-----|-----------|
| `trace` | per-frame internal events, fine-grained debug | no (disabled in release) |
| `debug` | dev-only diagnostics, scenario step traces | no (disabled in release) |
| `info` | lifecycle (boot, scene load, connect) | OK |
| `warn` | recoverable problem, degraded mode | yes |
| `error` | failed operation (with `err` payload) | yes |
| `fatal` | unrecoverable; process will exit | yes |

Default level: `info` in release, `debug` in dev.

`trace` and `debug` compile out in release builds for Rust (`#[cfg(debug_assertions)]`-guarded macro path).

## Span conventions

| Span name | Used at | Required attributes |
|-----------|---------|---------------------|
| `frame[N]` | engine frame entry | `frame_number` |
| `system[<name>]` | each ECS system | `system_name`, `frame_number` |
| `pass[<name>]` | each render-graph pass | `pass_name`, `frame_number` |
| `scenario[<name>]` | each scenario run | `scenario_path`, `seed` |
| `rpc[<method>]` | each agent SDK RPC | `method`, `caller` |
| `replay[<id>]` | replay session | `replay_id` |

Span names use brackets to carry the discriminant. Greppable.

## Rust example

```rust
use tracing::{info, instrument, warn, error};

#[instrument(skip(self), fields(frame = self.frame_number))]
pub fn submit_frame(&mut self) -> Result<(), RendererError> {
    info!(draw_calls = self.draw_calls.len(), "submitting frame");
    if self.draw_calls.is_empty() {
        warn!("empty frame");
    }
    self.queue.submit(&self.commands).map_err(|e| {
        error!(err = ?e, "submission failed");
        RendererError::Submit { source: e }
    })?;
    Ok(())
}
```

Subscriber config (every binary):

```rust
tracing_subscriber::fmt()
    .json()
    .with_current_span(true)
    .with_span_list(false)
    .with_timer(tracing_subscriber::fmt::time::UtcTime::rfc_3339())
    .with_writer(std::io::stderr)
    .init();
```

stdout is reserved for protocol output (JSON-RPC, scenarios). stderr is for logs.

## TypeScript example

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (b) => ({ target: b.name ?? 'app' }),
  },
});

logger.info({ entityId, frame: 42 }, 'spawned entity');
logger.error({ err: e.toJSON() }, 'rpc failed');
```

## Python example

```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt='iso', utc=True),
        structlog.processors.dict_tracebacks,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # info
)

log = structlog.get_logger()
log.info('spawned', entity_id=entity_id, frame=42)
log.error('rpc_failed', err=e.to_json())
```

## Lua example

```lua
local log = nexus.log.channel('enemy_spawner')
log:info({ count = 5, frame = nexus.time.frame() }, 'wave spawned')
log:error({ err = err }, 'wave failed')
```

`nexus.log` forwards to the engine's `tracing` subscriber. JSON output is identical to native Rust logs.

## Hot-path rule

In code that runs once per frame or more often:

| Rule | |
|------|--|
| Use `trace!` / `debug!` only behind `tracing::enabled!(Level::DEBUG)` | avoid format allocation |
| No interpolated strings in `msg` | use kv pairs |
| No `format!`/`.to_string()` in event args | logger handles serialization |
| Pre-compute span attributes once per frame | not per call |

```rust
// Good
trace!(entity = e.id, "queued");

// Bad — allocates every call even when filtered out
trace!("queued entity {}", e.id);
```

## OpenTelemetry compatibility

Field names follow OTel semantic conventions where applicable:

| Concept | OTel key |
|---------|----------|
| Service | `service.name` |
| HTTP method | `http.request.method` |
| Network peer | `network.peer.address` |
| Exception | `exception.type`, `exception.message`, `exception.stacktrace` |

Engine domain extends with `nexus.*` namespace:

| Concept | Key |
|---------|-----|
| Frame number | `nexus.frame` |
| ECS entity | `nexus.entity.id` |
| ECS archetype | `nexus.entity.archetype` |
| Scenario | `nexus.scenario.path` |
| Replay | `nexus.replay.id` |

Cite: opentelemetry.io/docs/specs/semconv/general/attributes.

## Telemetry vs logs

| | Logs | Telemetry |
|--|------|-----------|
| Cardinality | low (lifecycle) | high (every frame) |
| Schema | per-event ad hoc + reserved | strict typed → `docs/specs/agent/telemetry.md` |
| Transport | stderr / file | binary stream over IPC |
| Sampling | level filter | by event-type subscription |
| Retention | log shipper | scenario-bounded |

Same fields, different channels. The agent SDK consumes telemetry. Humans (and nexus-merge audits) read logs.

## Forbidden

| Pattern | Why |
|---------|-----|
| `println!` / `console.log` / `print` in committed code | Unstructured |
| String concatenation in log messages | Loses keys |
| Logging secrets (tokens, passwords, PII) | Compliance |
| `info!` in per-frame hot path | Log spam |
| `error!` without `err` payload | No context to debug |
| Custom logger per crate | Inconsistent output |
| Wrapping the logger in your own macro | Hides call site |

## Cross-link

- → `errors.md` (`err` payload + `trace_id`)
- → `docs/specs/agent/telemetry.md` (typed telemetry stream)
- → `rust.md`, `typescript.md`, `python.md`, `lua.md`
- → `docs/guides/testing/scenarios.md` (scenarios assert on log events)
