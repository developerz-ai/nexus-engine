<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Scripting

> Two VMs, one ECS: Lua 5.4 for trusted game logic, Rune for sandboxed third-party mods. Both hot-reload, both telemetered, both deterministic.

## Boundaries

- Owns: VM lifecycle, script loading, ECS bridge, hot-reload pipeline, sandbox/capability enforcement, structured script errors, script telemetry.
- Does NOT own:
  - ECS data model → `docs/specs/core/ecs.md`
  - Asset hot-reload triggers (file watch) → `docs/specs/assets/registry.md`
  - Shader hot-reload → `docs/specs/renderer/shaders.md` (uses same reload bus, see `hotreload.md`)
  - Networking input/snapshot → `docs/specs/networking/rollback.md`
  - Editor UI panels → `docs/specs/editor/livereload.md`
- Depends on:
  - `docs/contracts/core-scripting.md` — ECS access surface, event bindings, rate limits
  - `docs/specs/core/events.md` — script ↔ system event bus
  - `docs/specs/core/jobs.md` — script step scheduling

## Two-Language Rationale

| Aspect | Lua 5.4 (mlua) | Rune |
|---|---|---|
| Trust level | Trusted (shipped game code) | Untrusted (mods, UGC) |
| Audience | Game devs, designers, modders-as-author | End-user mod consumers, marketplace mods |
| Perf ceiling | LuaJIT optional, 5.4 fast enough for gameplay | Reference VM, slower; suitable for non-hot-path mods |
| Sandbox | Soft (Lua `_ENV` rewrite + mlua sandbox flag) | Hard (capability model, no ambient authority) |
| Memory safety | Rust-safe via mlua | Rust-safe via rune; alloc-fallible collections |
| Hot reload | Yes, instance-preserving | Yes, instance-preserving |
| Determinism | Yes (single-thread VM, fixed step) | Yes |
| Native interop | Tight, low overhead | Tight (Rust-native AST), low overhead |
| Maturity | 30+ years, ubiquitous in games | New, evolving, but Rust-native |
| inspired by | `mlua-rs/mlua`, LÖVE2D, Defold, Roblox Luau | `rune-rs/rune` |

**Why two and not one:**
- Lua is the de-facto standard for game logic; refusing it costs adoption.
- Lua sandbox is well-known to be leaky (debug library, metatable tricks, ffi in LuaJIT). For untrusted code we need a VM that was built sandbox-first.
- Rune is Rust-native (no C dependency), has alloc-fallible collections, async-first, and matches the Rust ergonomics of the rest of the engine.

**Why not WASM as the mod VM:**
- High FFI overhead per ECS call; mods are interface-heavy → counter-productive (`fishfolk/jumpy#489`).
- Compile step degrades author iteration loop.
- Will be revisited at v2.0: → `[DECISION NEEDED]` whether to add WASM as a third mod tier for compute-heavy mods.

## Architecture

```
+----------------------------+      +----------------------------+
|   Lua Subsystem (mlua)     |      |   Rune Subsystem           |
|   - trusted scripts/*.lua  |      |   - mods/<id>/*.rn         |
|   - one VM per "world"     |      |   - one VM per mod (iso)   |
|   - hot reload: instance   |      |   - capability tokens only |
|     state preserved        |      |   - resource limits        |
+-------------+--------------+      +-------------+--------------+
              |                                    |
              |  ScriptCall (typed)                |  CapCall (typed + cap check)
              v                                    v
       +------+------------------------------------+------+
       |              Script Bridge                       |
       |  - serialize/deserialize ECS handles             |
       |  - emit ScriptError{code, file, line, col, snip} |
       |  - per-call timing → telemetry                   |
       |  - rate limit + budget enforcement               |
       +------+------------------------------------+------+
              |                                    |
              v                                    v
       +------+----------------+         +---------+--------+
       |        ECS World      |<--------+   Event Bus      |
       | (docs/specs/core/ecs) |         | (core/events)    |
       +-----------------------+         +------------------+
```

VM ↔ ECS boundary detail in `lua.md` and `rune.md`. Hot-reload pipeline in `hotreload.md`. Capability flow in `sandbox.md`.

## Public API (engine-side, Rust)

```rust
pub trait ScriptSubsystem {
    fn load(&mut self, src: ScriptSource) -> Result<ScriptHandle, ScriptError>;
    fn unload(&mut self, h: ScriptHandle) -> Result<(), ScriptError>;
    fn reload(&mut self, h: ScriptHandle, src: ScriptSource) -> Result<ReloadReport, ScriptError>;
    fn step(&mut self, dt: Duration, world: &mut World) -> StepReport;
    fn call(&mut self, h: ScriptHandle, fn_name: &str, args: Value) -> Result<Value, ScriptError>;
    fn telemetry(&self) -> &ScriptTelemetry;
}

pub enum ScriptSource { Path(PathBuf), Inline(String), Bytecode(Vec<u8>) }
pub struct ScriptError { code: ErrCode, file: String, line: u32, col: u32, snippet: String, stack: Vec<Frame> }
pub struct StepReport { scripts_run: u32, total_us: u64, longest: Vec<(ScriptId, u64)> }
pub struct ReloadReport { state_preserved: bool, dropped_globals: Vec<String>, warnings: Vec<String> }
```

Both Lua and Rune implement `ScriptSubsystem`. The engine owns a `Box<dyn ScriptSubsystem>` per language.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Lua: empty call (Rust → Lua → Rust) | < 200 ns | < 1 µs |
| Lua: ECS component read from script | < 500 ns | < 2 µs |
| Rune: empty call | < 500 ns | < 2 µs |
| Rune: ECS component read | < 1 µs | < 5 µs |
| Hot reload of a script file | < 50 ms | < 200 ms |
| Per-frame script budget (60 Hz target) | < 2 ms | 4 ms (then yield + warn) |
| Mod resource limit: memory | 32 MB default | configurable cap, hard kill at 2× |
| Mod resource limit: CPU/frame | 250 µs default | configurable, hard kill at 1 ms |

All numbers `[BENCHMARK NEEDED]` after first prototype on reference hardware (Ryzen 7 / M2).

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SCRIPT_PARSE` | Syntax error in source | Display structured error, do not load |
| `SCRIPT_RUNTIME` | Uncaught error during call | Log, isolate script, surface to telemetry |
| `SCRIPT_TIMEOUT` | Exceeded per-call budget | Kill VM step, mark script throttled |
| `SCRIPT_OOM` | Allocator returned err (Rune) or memory cap hit | Unload script, surface |
| `CAP_DENIED` | Mod attempted ungranted capability | Log violation, no effect |
| `CAP_REVOKED` | Capability was revoked mid-call | Return safe-default value |
| `RELOAD_INCOMPATIBLE` | Hot reload would break state contract | Fall back to cold reload |
| `BRIDGE_TYPE_MISMATCH` | Script passed wrong type to engine binding | Reject call, structured error |

All errors are JSON-serializable. → `docs/specs/agent/telemetry.md` consumes them via subscription.

## Integration Points

- **ECS** (`core/ecs.md`): scripts get typed handles, not raw pointers. All access goes through `World` query API. Mutation is queued, applied at end of script step.
- **Events** (`core/events.md`): scripts subscribe via `on(event_name, handler)`. Emit via `emit(event_name, payload)`.
- **Assets** (`assets/registry.md`): file watcher emits `AssetChanged{path}`, hot-reload pipeline picks up `*.lua` and `*.rn`.
- **Renderer** (`renderer/shaders.md`): shares the hot-reload bus for `.wgsl` files. Same UX, different VM.
- **Networking** (`networking/rollback.md`): script step must be deterministic. Lua/Rune VMs declared replay-safe by spec; FFI to non-deterministic engine APIs is forbidden from script. → `sandbox.md`.
- **Agent SDK** (`agent/sdk.md`): agents can load, reload, eval, and inspect scripts via JSON-RPC. Used for headless gameplay testing.
- **Editor** (`editor/livereload.md`): editor save → reload pipeline → in-game effect, < 100 ms target.

## AI-First Affordances

1. **Structured errors**: every error carries `{code, file, line, col, snippet, stack}`. Never a bare string.
2. **Telemetry**: per-script-per-frame `{cpu_us, allocs, calls, events_emitted}` published to telemetry bus.
3. **Headless step**: scripts run identically without renderer/audio/input. `nexus run --headless` → `agent/headless.md`.
4. **Deterministic step**: VMs are single-threaded, single-instance per world. No wall-clock reads from script API; `time.now()` returns sim time.
5. **Snapshot/replay**: VM state is serializable to a snapshot blob; replay reproduces identical behavior. → `agent/replay.md`.
6. **Semantic API**: `engine.spawn("dragon near castle")` is a script binding, not magic. → `agent/semantic.md`.

## Test Requirements

- A 1000-script load completes in < 1 s; each script gets isolated error report on failure.
- Hot-reloading a Lua script preserves all `ScriptHandle.state` keys not removed in the new source.
- A Rune mod that calls an ungranted capability emits `CAP_DENIED` and continues running.
- A mod that allocates in a tight loop is killed by the memory cap within 100 ms of breach.
- Running the same script across 10,000 frames with the same input produces a byte-identical state snapshot.
- Script error JSON validates against the schema in `docs/contracts/core-scripting.md`.

## Prior Art

- `mlua-rs/mlua` ✓ — safe Rust API, async, multi-Lua-version, panic-safe handles.
- `rune-rs/rune` ✓ — Rust-native, alloc-fallible collections, async-first, Rust-like syntax.
- LÖVE2D ✓ — Lua-only, best onboarding ever, no sandboxing (single-author games).
- Defold ✓ — Lua for game logic, hot reload, headless test harness.
- Roblox Luau ✓ — sandbox-by-design Lua variant; we will keep Luau on the table for v1.1 evaluation.
- Factorio Lua mods ✗ — leaky sandbox, mods can crash the sim; we explicitly avoid this by using Rune for untrusted mods.
- WASM (Ambient, Jumpy) — high FFI overhead for ECS-style modding; deferred to v2.0 evaluation.
- E language, Joe-E ✓ — capability model basis for `sandbox.md`.

## Open Questions

- `[DECISION NEEDED]` Add Luau as a third VM tier (sandbox-first Lua) or keep Rune as the only sandboxed VM?
- `[DECISION NEEDED]` Allow LuaJIT in trusted tier on platforms that support it? (perf win, but determinism risk and iOS/WASM blocked).
- `[DECISION NEEDED]` Single VM per world or VM-per-script for Lua trusted tier? (perf vs. isolation tradeoff).
- `[BENCHMARK NEEDED]` All call/step numbers above.
- `[AGENT: 10]` Confirm JSON-RPC method names for script load/reload/eval match `agent/api.md`.
- `[AGENT: 02]` Confirm event bus delivery ordering guarantees feed `core-scripting` contract.
