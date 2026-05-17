<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Scripting

> Scripts (Lua via mlua, Rune for sandboxed mods) read ECS state, queue commands, and bind to events. All access goes through a capability-gated wrapper — never raw `&mut World`.

Related specs:
- `docs/specs/core/ecs.md` · `docs/specs/core/events.md`
- `docs/specs/scripting/overview.md` · `docs/specs/scripting/lua.md` · `docs/specs/scripting/rune.md` · `docs/specs/scripting/sandbox.md` · `docs/specs/scripting/hotreload.md`
- Sibling: `docs/contracts/core-agent.md` (agent uses the same gated surface, different transport)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (ECS, events, time) | `nexus-core` | `crates/core/src/lib.rs` |
| Consumer / VM host | `nexus-scripting` | `crates/scripting/src/lib.rs` |
| Capability gate | `nexus-scripting::caps` | `crates/scripting/src/caps.rs` |

Pattern reference: Bevy `World::resource_scope` (scoped exclusive access), mlua `UserData` registration, Rune `ContextBuilder`. Capability model from POLA (Principle of Least Authority); references `capnproto` and Pony actor capabilities. Per Nexus principle: "zero unsafe without justification".

---

## Call flow

```
 ECS schedule
   │
   ├─► script_system.update(world, dt)
   │     │
   │     ├─ open ScriptContext { world: &mut World, ev: &EventBus, caps }
   │     ├─ for each enabled script:
   │     │    vm.call("on_update", dt)
   │     │      │
   │     │      ▼
   │     │   script makes calls into bound API:
   │     │     ecs.spawn(...), ecs.get(entity, "Health"), ecs.set(...)
   │     │     events.send("damage", {target=42, amount=5})
   │     │     world.time(), world.input()
   │     │
   │     │   ── all routed through Capability gate ──
   │     │       if denied → returns Lua error, never panics core
   │     │
   │     └─ drain command queue → apply to World atomically
   │
   └─► hot-reload: file watcher → vm.reload(script_id) → on_reload() called
```

---

## Provided API (Core surface that Scripting binds into VMs)

All names are the canonical script-side names (Lua dotted, Rune `::`).

```text
ecs.spawn(components_table)              -> Entity
ecs.despawn(entity)
ecs.exists(entity)                       -> bool
ecs.get(entity, "ComponentName")         -> table | nil
ecs.set(entity, "ComponentName", table)
ecs.remove(entity, "ComponentName")
ecs.query("Pos", "Vel")                  -> iterator of (entity, Pos, Vel)
ecs.parent(entity)                       -> Entity | nil
ecs.children(entity)                     -> iterator

events.send(channel_name, payload_table)
events.on(channel_name, function)        -> handler_id     (subscription)
events.off(handler_id)

time.dt()                                -> number          (seconds, frame delta)
time.frame()                             -> number          (FrameId u64)
time.fixed_dt()                          -> number

input.button(name)                       -> bool
input.axis(name)                         -> number          (-1..1)

assets.load(path_or_id, kind)            -> AssetHandle
assets.is_ready(handle)                  -> bool

log.info(msg, table?)
log.warn(msg, table?)
log.error(msg, table?)

physics.raycast(origin, dir, max)        -> { entity, point, normal, distance } | nil
audio.play(asset_id, { bus, gain_db, pitch, spatial=entity })

agent.tag(entity, "tag_name")             -- semantic hints for nexus-agent-sdk
```

Rust binding signatures (host side):

```rust
pub struct ScriptHost<'w> {
    world: &'w mut World,
    bus: &'w EventBus,
    caps: ScriptCaps,
    cmds: CommandQueue,
}
impl<'w> ScriptHost<'w> {
    pub fn register_lua(&self, lua: &Lua) -> Result<(), ScriptError>;
    pub fn register_rune(&self, ctx: &mut rune::Context) -> Result<(), ScriptError>;
    pub fn flush_commands(self) -> Result<CmdStats, ScriptError>;
}
```

## Required API (Scripting surface that Core calls)

```rust
pub trait ScriptingBackend: Send + Sync + 'static {
    fn init(&mut self, cfg: &ScriptingConfig) -> Result<(), ScriptError>;
    fn load(&mut self, id: ScriptId, source: &str, lang: ScriptLang) -> Result<(), ScriptError>;
    fn reload(&mut self, id: ScriptId, source: &str) -> Result<(), ScriptError>;
    fn unload(&mut self, id: ScriptId);
    fn call_lifecycle(&mut self, host: &mut ScriptHost, hook: Lifecycle) -> Result<(), ScriptError>;
    fn dispatch_event(&mut self, host: &mut ScriptHost, ch: &str, payload: &EventPayload) -> Result<(), ScriptError>;
}

pub enum Lifecycle { OnLoad, OnStart, OnUpdate(f32), OnFixedUpdate, OnReload, OnUnload }
pub enum ScriptLang { Lua54, Rune }
```

---

## Data Schema

```rust
pub struct ScriptId(pub u32);

pub struct ScriptingConfig {
    pub lua_enabled: bool,                // default true
    pub rune_enabled: bool,               // default true
    pub default_caps: ScriptCaps,         // default = TRUSTED_GAME
    pub mod_caps: ScriptCaps,             // default = SANDBOXED
    pub mem_budget_kb: u32,               // per-script soft cap (default 8 MB)
    pub call_budget_us: u32,              // per-update wall budget (default 2000 us)
    pub instruction_budget: u64,          // Lua: count via debug.sethook; Rune: per VM cap
}

bitflags! {
    pub struct ScriptCaps: u32 {
        const ECS_READ        = 1 << 0;
        const ECS_WRITE       = 1 << 1;
        const ECS_SPAWN       = 1 << 2;
        const ECS_DESPAWN     = 1 << 3;
        const EVENTS_SEND     = 1 << 4;
        const EVENTS_RECEIVE  = 1 << 5;
        const INPUT_READ      = 1 << 6;
        const ASSETS_LOAD     = 1 << 7;
        const ASSETS_GEN_AI   = 1 << 8;   // very expensive; off by default
        const PHYSICS_QUERY   = 1 << 9;
        const PHYSICS_MUTATE  = 1 << 10;
        const AUDIO_PLAY      = 1 << 11;
        const NETWORK_SEND    = 1 << 12;
        const FILE_READ       = 1 << 13;
        const FILE_WRITE      = 1 << 14;
        const SHELL_EXEC      = 1 << 15;  // never enabled for mods
        const TRUSTED_GAME = 0xFFFF_FFFF & !(1<<14) & !(1<<15) & !(1<<8);
        const SANDBOXED    = Self::ECS_READ.bits() | Self::EVENTS_RECEIVE.bits()
                           | Self::INPUT_READ.bits() | Self::PHYSICS_QUERY.bits();
    }
}

pub enum ScriptError {
    SyntaxError { id: ScriptId, line: u32, msg: String },
    Runtime { id: ScriptId, msg: String, stack: String },
    CapabilityDenied { id: ScriptId, cap: ScriptCaps, attempted: &'static str },
    BudgetExceeded { id: ScriptId, kind: BudgetKind },
    TypeError { expected: &'static str, got: &'static str },
    EntityStale { id: ScriptId, entity: EntityId },
}
```

Component table marshalling (Lua-side) — machine-parseable schema:

```toml
# components.toml — registry, scripting reads this to validate set/get
[components.Health]
fields = [
  { name = "current", type = "f32" },
  { name = "max",     type = "f32" },
]

[components.Velocity]
fields = [
  { name = "linear",  type = "vec3" },
  { name = "angular", type = "vec3" },
]
```

Event payload schema (JSON-coerced, agent + script interop):

```json
{"channel":"damage","schema":1,"payload":{"target":42,"amount":5.0,"source":17,"kind":"fire"}}
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Scripting | Script never holds a Rust reference into `World` across `await`/yield. All access is per-call via `ScriptHost`. |
| O-2 | Scripting | Mutations through `ecs.spawn/set/remove` are queued; applied atomically at `flush_commands` boundary. |
| O-3 | Core | Event handlers registered via `events.on` fire in registration order per `channel`. |
| O-4 | Core | `OnUpdate` runs every frame; `OnFixedUpdate` runs every physics step (see `core-physics.md`). |
| O-5 | Scripting | `OnReload` is called after source replaces; previous handler ids are invalidated. |
| O-6 | Scripting | A stale `EntityId` (despawned) yields `EntityStale` error, never UB. |
| O-7 | Both | Script cannot create unbounded recursion: instruction budget enforced via Lua hook / Rune fuel. |
| O-8 | Core | Component get/set is by-name; name must exist in components registry, else `TypeError`. |

---

## Threading & Concurrency Rules

- Each script VM is `!Send`; pinned to the ECS thread it was loaded on.
- One VM per script unless the user opts into shared VM (`shared_vm = true` in config).
- `ScriptHost` is constructed per-frame around `&mut World` — never stored.
- Command queue is single-producer (current VM) / single-consumer (flush at end of frame).
- Hot reload runs from a file-watcher worker; reload calls are dispatched onto the ECS thread.
- Scripts MUST NOT spawn OS threads. `coroutine` (Lua) is allowed and budgeted.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| Lua call overhead (call into Rust binding) | ≤ 0.3 µs | 2 µs | mlua, release |
| `ecs.get` single component | ≤ 1 µs | 10 µs | per call |
| `ecs.query` iteration | ≤ 50 ns/entity | 500 ns/entity | over 10k entities |
| Per-frame script CPU (1 script) | ≤ 200 µs | `call_budget_us` | budget breach → `BudgetExceeded` |
| Hot reload latency | ≤ 50 ms | 200 ms | source change → new code live |
| VM memory per script | ≤ 256 kB | `mem_budget_kb` | else `BudgetExceeded{Memory}` |
| Bound API surface size | ≤ 200 fns | 500 fns | larger = harder for AI agents to learn |

References: mlua benchmarks (`mlua-rs/mlua`), Rune VM fuel (https://rune-rs.github.io), Lua `debug.sethook` instruction counting.

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `SCR-001` | `BackendInit` | VM lib failed to init | Disable scripting; engine continues |
| `SCR-010` | `SyntaxError` | Compile failed | Report via bus; previous version kept |
| `SCR-011` | `Runtime` | Lua/Rune runtime error | Unhandled exception in handler; script disabled until reload |
| `SCR-020` | `CapabilityDenied` | Missing cap | Lua error returned to caller; logged |
| `SCR-030` | `BudgetExceeded{Cpu}` | Per-frame budget hit | Script paused 1 frame; warning |
| `SCR-031` | `BudgetExceeded{Memory}` | Heap cap | Script unloaded; emit event |
| `SCR-032` | `BudgetExceeded{Instr}` | Instruction count | Script aborted current call; resumes next frame |
| `SCR-040` | `EntityStale` | EntityId despawned | Return `nil`/error; never crash |
| `SCR-041` | `TypeError` | Wrong component shape | Validate against registry; error |

---

## Versioning Rule

`nexus-contract-scripting = "MAJOR.MINOR.PATCH"`.

- **MAJOR**: removing a bound function, changing its signature, removing/renaming a capability flag, changing component marshalling schema semantics.
- **MINOR**: adding a bound function, adding a capability flag (default OFF for `SANDBOXED`), adding a lifecycle hook.
- **PATCH**: error message text, perf tuning.

Scripts declare `--! nexus-script-api = "X"` header; loader rejects MAJOR mismatch and surfaces `SCR-010` with `suggested_fix` pointing to migration doc.

---

## Test Matrix

`tests/contract_core_scripting.rs`:

- T-01 Lua: spawn → set Health → get Health → assert equals.
- T-02 Lua: `ecs.query("Pos", "Vel")` over 10k entities → iteration < 5 ms.
- T-03 Cap denial: SANDBOXED script calls `ecs.spawn` → `CapabilityDenied`, no spawn.
- T-04 Hot reload: change script during play → `OnReload` fires; gameplay continues.
- T-05 Runtime error in `on_update` → script disabled; engine frame budget unaffected; bus event emitted.
- T-06 Instruction budget: script with `while true do end` → `BudgetExceeded{Instr}` within `call_budget_us`.
- T-07 Stale entity: despawn(e); next frame script calls `ecs.get(e, "X")` → `EntityStale` error, no crash.
- T-08 Rune: same bound API works under Rune VM; T-01 passes in Rune source as well.
- T-09 Determinism: identical inputs + scripts → identical World state hash (see `core-networking.md`).
- T-10 Event ordering: 3 handlers on same channel, registered A, B, C → invoked A, B, C.

---

## Open Questions

- [DECISION NEEDED] Should `events.on` handlers persist across `OnReload`, or all handlers cleared and re-registered? Persisting risks leaks; clearing forces re-registration boilerplate.
- [DECISION NEEDED] Coroutine budget accounting: count yielded coroutines against the script's `call_budget_us` or separately? AGENT 08.
- [DECISION NEEDED] Whether Rune is shipped enabled-by-default in core, or as opt-in feature (binary size). AGENT 08.
- [BENCHMARK NEEDED] `ecs.query` 10k entities real cost in mlua vs direct Rust query.
- [AGENT: 02] Confirm components registry (`components.toml` or generated) is the source of truth for the marshalling layer.
- [AGENT: 10] Agent API capability flags must be a strict superset of script caps — see `core-agent.md`.
