<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Lua Scripting (Trusted Tier)

> Lua 5.4 embedded via mlua. Trusted game-logic code authored by the game developer. Hot-reloadable, telemetered, deterministic, ECS-bridged.

## Boundaries

- Owns: mlua VM lifecycle, Lua API surface for game logic, Lua-side ECS bridge, Lua hot-reload state preservation, Lua-specific error formatting.
- Does NOT own:
  - Untrusted mod execution → `rune.md`
  - Capability enforcement (Lua tier is trusted) → see `sandbox.md` for opt-in
  - File watcher → `assets/registry.md`
  - Reload orchestration → `hotreload.md`
- Depends on:
  - `mlua-rs/mlua` (Lua 5.4 default feature)
  - `docs/contracts/core-scripting.md`
  - `docs/specs/core/ecs.md`

## Why Lua 5.4

- Lua 5.4 is the current upstream reference (`https://www.lua.org/manual/5.4/`). Integer subtype, generational GC, `<close>` variables.
- Default in mlua, broad community knowledge, stable C ABI.
- Smaller surface than 5.1 + LuaJIT extensions; easier to bound determinism.
- LuaJIT path remains an optional feature flag for x86_64/aarch64 desktop targets; disabled on iOS, web, and consoles.

inspired by: `mlua-rs/mlua`, Lua 5.4 Reference Manual, Defold, LÖVE2D

## VM Model

```
World (one per game instance)
  └── LuaSubsystem
        ├── mlua::Lua  (single VM per world)
        ├── ScriptRegistry<ScriptHandle, LoadedScript>
        ├── HotReloadQueue
        ├── BridgeRegistry  (Rust fns exposed to Lua)
        └── Telemetry
```

- One VM per world (not per script). Lua tables namespace scripts. Rationale: low per-call FFI cost, shared interop, predictable GC.
- Multiple worlds (e.g. headless test runner with N parallel sims) → N independent VMs, no shared state.
- All VM access is single-threaded. Job system (`core/jobs.md`) schedules the script step on the main world thread; parallel-system work runs around it.

## API Surface (Lua-facing)

All Lua-callable engine bindings live under a single global `nexus` table. Submodules grouped by system. Full contract: `docs/contracts/core-scripting.md`.

```
nexus.world       -- ECS query/spawn/despawn
nexus.components  -- registered component constructors
nexus.events      -- emit / on / off
nexus.time        -- sim time, dt, frame index (no wall clock)
nexus.input       -- input snapshot (read-only at script-step boundary)
nexus.assets      -- load by UUID, async handles
nexus.audio       -- one-shot triggers, parameter set
nexus.physics     -- raycast, query (mutation goes via components)
nexus.log         -- structured log: nexus.log.info("msg", {k=v})
nexus.rng         -- seeded, deterministic; never math.random for sim
nexus.semantic    -- nexus.spawn("dragon near castle") → see agent/semantic.md
```

### ECS Bridge

```lua
-- spawn
local e = nexus.world:spawn{
  Transform = { pos = vec3(0,0,0) },
  Health    = { hp = 100 },
}

-- query
for e, transform, health in nexus.world:query("Transform", "Health"):iter() do
  if health.hp <= 0 then nexus.world:despawn(e) end
end

-- system: function called every fixed step
nexus.system("damage_over_time", function(dt)
  for e, h in nexus.world:query("Poisoned", "Health"):iter() do
    h.hp = h.hp - 5 * dt
  end
end)
```

Spawn/despawn/component mutations are **queued** during a query iteration and applied at script-step boundary. → matches Bevy CommandBuffer pattern.

### Lua-side Conventions

- Module per file. `require("game.combat.damage")` loads `scripts/game/combat/damage.lua`.
- Scripts return a table of exported functions; no top-level side effects beyond `nexus.system(...)` registration.
- Persistent per-script state lives in `script.state` (a reserved table mlua preserves across hot reload).
- No `require` of arbitrary paths; loader is sandboxed to the scripts root.

## Standard Library Policy

Lua stdlib modules, allow/deny in trusted tier:

| Module | Trusted tier | Notes |
|---|---|---|
| `string` | allow | safe |
| `table` | allow | safe |
| `math` | allow except `math.random*` | `math.random` shadowed by `nexus.rng` for determinism |
| `io` | deny | use `nexus.assets` |
| `os` | deny except `os.clock` (perf only, never sim) | wall clock breaks replay |
| `debug` | deny in production, allow in dev builds | leaks engine internals |
| `package` | deny | replaced by sandboxed `require` |
| `coroutine` | allow | used by async patterns |
| `utf8` | allow | safe |
| `ffi` (LuaJIT) | deny | escapes VM |

Sandbox is enforced by replacing `_G` with a curated env at VM init.

## Hot Reload

Detailed pipeline in `hotreload.md`. Lua-specific contract:

1. File watcher emits `ScriptChanged{path}`.
2. Subsystem parses the new source in an isolated chunk; on parse error, emits `SCRIPT_PARSE`, keeps old version live.
3. New module table replaces the old in `package.loaded`.
4. `script.state` table is preserved by identity (same Lua table object reattached to new module).
5. `on_reload(old_module, new_module)` hook invoked if defined; allows custom migration.
6. Systems re-register; orphaned subscriptions GC'd at next step.
7. `ReloadReport` emitted to telemetry.

Cold-reload fallback: if the script declares `--! reload: cold` directive, the world is paused, VM cleared, snapshot restored.

## Structured Errors

mlua's `Error` is normalized into the engine `ScriptError` struct:

```json
{
  "code": "SCRIPT_RUNTIME",
  "file": "scripts/game/combat/damage.lua",
  "line": 42,
  "col": 17,
  "snippet": "  h.hp = h.hp - dmg\n            ^^^^",
  "stack": [
    {"file":"...damage.lua","line":42,"fn":"apply_damage"},
    {"file":"...combat.lua","line":13,"fn":"on_hit"}
  ],
  "message": "attempt to perform arithmetic on a nil value (field 'hp')"
}
```

Errors are also written to telemetry stream → `agent/telemetry.md`.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| VM init (cold) | < 5 ms | 20 ms |
| Script load + first run | < 2 ms / KB | 10 ms / KB |
| Rust → Lua call (no args) | < 200 ns | 1 µs |
| Lua → Rust call via binding | < 250 ns | 1 µs |
| ECS query iter, 10k entities | < 500 µs | 2 ms |
| Hot reload roundtrip | < 50 ms | 200 ms |
| Per-frame script budget | 2 ms | 4 ms |

`[BENCHMARK NEEDED]` All numbers verified on reference hardware after MVP.

## Telemetry

Per script, per frame:

```json
{
  "script": "scripts/game/combat/damage.lua",
  "frame": 12345,
  "cpu_us": 87,
  "allocs": 4,
  "alloc_bytes": 256,
  "calls_in": 3,
  "calls_out": 41,
  "events_emitted": 2,
  "errors": 0
}
```

Aggregated per second into `script.summary` topic. Top-N hot scripts surfaced to profiler panel (`editor/debug.md`).

## Determinism Rules

- No wall clock from script: `nexus.time.now()` returns sim time only.
- No `math.random`: use `nexus.rng:next()` seeded per world.
- Table iteration order: scripts must use `ipairs` for ordered iteration; `pairs` is allowed but flagged for warning when used over a table whose contents affect sim state.
- GC: incremental GC, step size pinned per frame; full GC scheduled at frame boundaries only.
- → `docs/specs/networking/rollback.md` and `docs/specs/physics/determinism.md` for the broader determinism contract.

## Error Contract

See `overview.md` table. Lua-specific codes:

| Code | Trigger |
|---|---|
| `SCRIPT_PARSE` | `mlua::Error::SyntaxError` |
| `SCRIPT_RUNTIME` | `mlua::Error::RuntimeError`, `CallbackError` |
| `SCRIPT_TIMEOUT` | mlua hook fired at instruction budget |
| `BRIDGE_TYPE_MISMATCH` | `mlua::Error::FromLuaConversionError` |

## Integration Points

- **ECS**: per `docs/contracts/core-scripting.md` — query handles, command buffer, system registration.
- **Events**: `nexus.events.on(name, fn)` registers; `emit(name, payload)` enqueues for next bus tick.
- **Assets**: `nexus.assets.load(uuid)` returns an async handle; `await handle` via Lua coroutine.
- **Renderer**: scripts cannot draw directly. They tag entities with render components; the renderer reads them. → `contracts/core-renderer.md`.
- **Agent SDK**: `agent.script.eval(src)` runs a snippet in a sandboxed scope; useful for headless probing.

## Test Requirements

- 10k registered systems execute in < 2 ms total per frame (representative no-op load).
- Hot reload of a 5 KB script preserves `script.state` byte-identical for unchanged keys.
- A script that loops infinitely is killed within 4 ms by the instruction-count hook and reports `SCRIPT_TIMEOUT`.
- A script calling a denied stdlib function (e.g. `os.execute`) fails with `CAP_DENIED` at load time.
- Replay test: identical inputs → identical world snapshot over 10k frames, with Lua participating in sim.

## Prior Art

- `mlua-rs/mlua` ✓ — safe API, async support, all Lua versions, panic-safe.
- LÖVE2D ✓ — Lua-first engine; onboarding model.
- Defold ✓ — script-per-entity model; we generalize to script-per-system.
- Roblox Luau ✓ — sandbox-first Lua; we may adopt for trusted tier in v1.1.
- Factorio ✗ — single-VM Lua with weak isolation; mods can break sim.

## Open Questions

- `[DECISION NEEDED]` `script.state` preservation: deep-clone vs. identity-swap. Identity-swap is faster, deep-clone is safer.
- `[DECISION NEEDED]` Allow per-script VM as opt-in for isolation-critical scripts?
- `[DECISION NEEDED]` Luau adoption for trusted tier — separate spec or merge here?
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 02]` Confirm command-buffer flush semantics match ECS spec.
- `[AGENT: 14]` Confirm `nexus.world` Lua signatures map 1:1 to `core-scripting` contract.
