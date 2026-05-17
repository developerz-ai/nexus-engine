<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Error Contract

One error shape. Every language. Every layer. Machine-parseable.

## The universal error JSON

```json
{
  "code": "RENDERER.SHADER_COMPILE",
  "message": "shader compilation failed",
  "location": {
    "file": "assets/shaders/pbr.wgsl",
    "line": 42,
    "column": 7
  },
  "context": {
    "stage": "fragment",
    "backend": "vulkan"
  },
  "suggested_fix": "check `samp_linear` binding declaration in pbr.wgsl:42",
  "cause": null,
  "trace_id": "01HXY...K9"
}
```

Required fields: `code`, `message`. Optional: everything else. `cause` chains nested errors recursively.

Schema: `schemas/nexus-error-v1.schema.json` (workspace root). CI validates every error structure against it.

## `code` format

```
<DOMAIN>.<SPECIFIC>
```

| Domain | Owner | Examples |
|--------|-------|----------|
| `ENGINE` | core | `ENGINE.NOT_READY`, `ENGINE.FRAME_BUDGET_EXCEEDED` |
| `ECS` | core | `ECS.ENTITY_NOT_FOUND`, `ECS.COMPONENT_MISSING` |
| `RENDERER` | renderer | `RENDERER.SHADER_COMPILE`, `RENDERER.DEVICE_LOST` |
| `PHYSICS` | physics | `PHYSICS.NON_FINITE_BODY`, `PHYSICS.SOLVER_DIVERGED` |
| `AUDIO` | audio | `AUDIO.DEVICE_UNAVAILABLE`, `AUDIO.STREAM_UNDERRUN` |
| `NET` | networking | `NET.ROLLBACK_DESYNC`, `NET.TIMEOUT` |
| `ASSET` | assets | `ASSET.NOT_FOUND`, `ASSET.IMPORT_FAILED` |
| `SCRIPT` | scripting | `SCRIPT.SANDBOX_VIOLATION`, `SCRIPT.RUNTIME` |
| `AGENT` | agent SDK | `AGENT.RPC_FAILED`, `AGENT.SCENARIO_FAILED` |
| `EDITOR` | editor | `EDITOR.PROJECT_INVALID` |
| `CLI` | tooling | `CLI.INVALID_ARG`, `CLI.NETWORK` |

Codes are stable. Renames are breaking changes. Code registry: `docs/contracts/error-codes.md` (mirrors each crate's error enum) — `[AGENT: 14]` to maintain.

`SPECIFIC` is `SCREAMING_SNAKE_CASE`. Never localized. → `naming.md`

## `message` format

| Rule | Why |
|------|-----|
| Lowercase first letter | Machine string, not prose |
| No trailing period | Concatenable into logs |
| No interpolation of paths inline (use `location.file`) | Structured > strings |
| No formatting (`bold`, ANSI codes) | Renderer's job, not error's |
| Stable wording (don't churn) | Tests grep on it |

```
Good:  "shader compilation failed"
Bad:   "Shader compilation failed!"
Bad:   "Failed to compile shader at /path/to/pbr.wgsl line 42"
```

## `location`

```json
{ "file": "path", "line": 42, "column": 7, "span": [128, 156] }
```

Required when the error has a source location. `span` is byte offsets, optional.

## `context`

Free-form `{ string: scalar | array | object }`. Used for variant-specific data the renderer / debugger / agent should see.

| Rule | |
|------|--|
| Keys `snake_case` | matches engine convention |
| Values JSON-primitive or array of primitives | machine-parseable |
| No functions, no `Date` objects | serialize to ISO string instead |
| ≤ 1 KiB serialized | larger goes to telemetry, not error |

## `suggested_fix`

One sentence. Imperative. Tells the caller (human or agent) what to do.

```
Good: "increase `[renderer] frame_budget_ms` in nexus.toml"
Good: "rerun with `--allow-dirty` to bypass git check"
Bad:  "you might want to consider checking the config"
```

Omit when no obvious fix exists. Don't invent one.

## `cause`

Nested error JSON. Drill-down for layered failures.

```json
{
  "code": "ASSET.IMPORT_FAILED",
  "message": "model import failed",
  "cause": {
    "code": "ASSET.PARSE",
    "message": "gltf parse error",
    "cause": {
      "code": "IO.READ",
      "message": "unexpected eof"
    }
  }
}
```

## `trace_id`

ULID. Generated at error origin. Logged alongside every emitting span. → `logging.md`

Lets nexus-merge correlate errors to logs, telemetry, replays.

## Per-language mapping

### Rust (libraries — `thiserror`)

```rust
#[derive(thiserror::Error, Debug)]
pub enum RendererError {
    #[error("shader compilation failed: {path}")]
    ShaderCompile {
        path: PathBuf,
        line: u32,
        column: u32,
        #[source]
        source: naga::WithSpan<naga::valid::ValidationError>,
    },
}

impl IntoUniversalError for RendererError {
    fn into_universal(self) -> nexus_error::Error {
        match self {
            Self::ShaderCompile { path, line, column, source } => nexus_error::Error {
                code: "RENDERER.SHADER_COMPILE".into(),
                message: "shader compilation failed".into(),
                location: Some(nexus_error::Location { file: path, line, column, span: None }),
                context: serde_json::json!({ "stage": source.span_stage() }),
                suggested_fix: None,
                cause: None,
                trace_id: tracing::current_trace_id(),
            },
        }
    }
}
```

`nexus_error::Error` is the workspace's universal type. Every crate `From<MyError> for nexus_error::Error` via the macro `#[derive(IntoUniversalError)]`.

### Rust (binaries — `anyhow`)

```rust
fn main() -> anyhow::Result<()> {
    real_main().map_err(|e| {
        eprintln!("{}", serde_json::to_string(&e.into_universal()).unwrap());
        e.into()
    })
}
```

Top-level only. Library code uses `thiserror`.

### TypeScript

```ts
export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly location?: ErrorLocation,
    public readonly context?: Record<string, unknown>,
    public readonly suggestedFix?: string,
    public readonly cause?: EngineError | Error,
  ) {
    super(message);
    this.name = 'EngineError';
  }

  toJSON(): UniversalError {
    return {
      code: this.code,
      message: this.message,
      location: this.location,
      context: this.context,
      suggested_fix: this.suggestedFix,
      cause: this.cause instanceof EngineError ? this.cause.toJSON() : null,
      trace_id: getCurrentTraceId(),
    };
  }
}
```

Domain subclasses extend `EngineError`. → `typescript.md`

### Python

```python
@dataclass(frozen=True)
class EngineError(Exception):
    code: str
    message: str
    location: Location | None = None
    context: dict[str, Any] | None = None
    suggested_fix: str | None = None
    cause: 'EngineError | None' = None

    def to_json(self) -> dict[str, Any]:
        return {
            'code': self.code,
            'message': self.message,
            'location': asdict(self.location) if self.location else None,
            'context': self.context,
            'suggested_fix': self.suggested_fix,
            'cause': self.cause.to_json() if self.cause else None,
            'trace_id': current_trace_id(),
        }
```

### Lua

```lua
local err = nexus.error('RENDERER.SHADER_COMPILE', 'shader compilation failed', {
  location      = { file = path, line = 42, column = 7 },
  context       = { stage = 'fragment' },
  suggested_fix = nil,
})
return nil, err
```

Two-return convention: `value, err_or_nil`. → `lua.md`

### SQL

PostgreSQL `RAISE` with `ERRCODE` mapped to universal codes via a wrapper:

```sql
RAISE EXCEPTION 'shader compilation failed'
  USING ERRCODE = 'NX001',                    -- maps to RENDERER.SHADER_COMPILE
        DETAIL  = json_build_object('stage','fragment')::text,
        HINT    = 'check binding declaration';
```

Server middleware maps `ERRCODE` → universal JSON via `error_codes.toml`.

### WGSL

WGSL doesn't raise errors at runtime. Compile errors flow through `naga` and surface as `RENDERER.SHADER_COMPILE` with the location pointing into the `.wgsl` file. → `wgsl.md`

## Hard rules

| Rule | Enforced by |
|------|-------------|
| No string-only errors | type system + lint |
| No swallowed errors (`catch { }`, `_ = result;`) | lint |
| Every `pub fn -> Result` documents its error variants | `missing_errors_doc` clippy lint |
| Every error implements `IntoUniversalError` | trait bound on the `Error` super-trait |
| No `panic!()` for control flow | `panic = "deny"` |
| No HTTP 500 with empty body | server middleware always emits universal JSON |
| Error responses on the wire = universal JSON only | server middleware |
| Catching exceptions at boundaries logs + re-emits | lint warns on bare `catch`/`except` |

## Cross-boundary contract

```
+----------------+      universal JSON      +-----------------+
|  Rust engine   |  ─────────────────────►  |  TS editor UI   |
+----------------+                          +-----------------+
        │                                            │
        │      universal JSON                        │
        ▼                                            ▼
+----------------+                          +-----------------+
|  Lua game      |                          |  Python agent   |
+----------------+                          +-----------------+
```

Every boundary serializes to universal JSON. Every consumer deserializes back into its language's `EngineError` subclass. Round-trip is lossless.

## Error code registry

`docs/contracts/error-codes.md` (Agent 14 maintains) is the source of truth. Every code listed there:
- one row per code
- columns: `code`, `domain`, `meaning`, `caller_action`, `since_version`, `owning_crate`
- adding a code = updating this file = part of the PR

CI rejects PRs that emit a code not registered.

## Cross-link

- → `logging.md` (`trace_id` correlation)
- → `docs/contracts/error-codes.md` (Agent 14)
- → `docs/guides/merge-system.md` (Agent 16, error-driven gating)
- → `rust.md`, `typescript.md`, `python.md`, `lua.md`, `sql.md`
- → `docs/specs/agent/telemetry.md` (errors as telemetry events)
