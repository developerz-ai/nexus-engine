<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Scripting-First — Overview

> Game logic written in Lua/Rune BEFORE Rust. Heavy hot-reload (sub-second cycle). Capability-elevated script context (security tiers). Mod-and-game-share-the-same-API. Garry's Mod, RimWorld, Factorio.

## Boundaries

- Owns: scripting-first project layout convention (game logic lives in `scripts/`, not `src/`), heavy hot-reload pipeline (file-watch → recompile script → swap → preserve state), capability-elevation policy (game scripts vs mod scripts), mod-shares-game-API contract.
- Does NOT own: VM implementation (→ `docs/specs/scripting/overview.md`), sandbox primitives (→ `docs/specs/scripting/sandbox.md`), Rust↔script FFI (→ `docs/specs/scripting/ffi.md`), mod distribution (→ `docs/specs/mods/overview.md`).
- Depends on: `nexus-scripting`, `nexus-scripting/sandbox`, `nexus-scripting/hotreload`, `nexus-mods` (for mod-vs-game capability gate).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-scripting` | VM (Lua + Rune supported) |
| `nexus-scripting/sandbox` | capability tiers (filesystem, net, FFI) |
| `nexus-scripting/hotreload` | file-watch, atomic script swap, state preservation |
| `nexus-mods` | mod-API surface = game-API surface (same trait) |
| `nexus-core/events` | script-emitted events into engine event bus |
| `nexus-agent/telemetry` | per-script step time, hot-reload count, error rate |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-scripting-hotreload-heavy` | (extends `nexus-scripting/hotreload`) | sub-second reload + state-preserving swap |
| `nexus-scripting-shared-api` | (genre-toolkit) | the trait that game logic AND mods both implement |

## Architecture

```
Scripting-first project layout

  mygame/
    Nexus.toml
    src/                 # Rust — engine glue ONLY (event handlers, FFI)
      main.rs
    scripts/             # Lua/Rune — game logic HERE
      systems/
        ai.lua
        economy.lua
      entities/
        player.lua
      data/
        items.toml
    mods/                # community mods, same shape as scripts/
      cool-mod/
        scripts/
        Mod.toml

Hot-reload cycle

  Author edits scripts/systems/economy.lua
        │
        ▼
  inotify / FSEvents (watched dir)
        │
        ▼
  Script compiler (Lua → bytecode, Rune → AST → bytecode)
        │
        ▼
  Atomic swap in VM:
    - new module loaded
    - persistent state (script's `state` table) preserved
    - dirty methods replaced; in-flight coroutines OK
        │
        ▼
  Game continues. Sub-second from save → effect visible in game.
```

## Capability tiers

| Tier | Filesystem | Network | FFI / native calls | Used by |
|---|---|---|---|---|
| `game` | full (project root) | full | full | the game's own scripts |
| `trusted-mod` | read-only outside mod dir | http(s) only | declared FFI only | signed mods |
| `untrusted-mod` | sandboxed mod dir only | none | declared FFI only | community uploads |

Capability granted at script-load time; cannot be elevated at runtime. Enforced by sandbox (→ `docs/specs/scripting/sandbox.md`).

## Mod-shares-game-API contract

If the engine exposes `engine.spawn_enemy(...)` to game scripts, mods get the same call. No second API. The capability gate restricts what mods can DO with the API, not what they can SEE.

```rust
// One trait, both sides
pub trait GameApi {
    fn spawn(&mut self, archetype: &str, at: Vec3) -> EntityId;
    fn destroy(&mut self, e: EntityId);
    fn query<T>(&self, filter: QueryFilter) -> Vec<T>;
    fn emit(&mut self, event: Event);
    // ... etc.
}

// Game scripts and mod scripts both call GameApi.
// Capability sandbox limits which methods are allowed per tier.
```

## Public API

```toml
[scripting]
language          = "lua"          # "lua" | "rune"
script_dirs       = ["scripts/", "mods/"]
hotreload         = true
hotreload_debounce_ms = 100
preserve_state    = true           # script's `state` table survives reload

[scripting.capability]
game_tier         = "game"
default_mod_tier  = "untrusted-mod"
trusted_mods      = ["cool-mod"]   # promoted to trusted-mod tier

[scripting.limits]
step_budget_ms    = 5              # max time per frame for all scripts
memory_budget_mb  = 64             # per-VM
allow_coroutines  = true
```

```rust
pub struct ScriptingFirst { /* registry, VMs, watcher */ }

impl ScriptingFirst {
    pub fn load_dir(&mut self, dir: &Path, tier: CapabilityTier) -> Result<(), Error>;
    pub fn call(&mut self, script: &str, fn_name: &str, args: ScriptArgs) -> ScriptValue;
    pub fn telemetry(&self) -> ScriptingTelemetry;
}

pub struct ScriptingTelemetry {
    pub scripts_loaded: u32,
    pub step_ms_p99: f32,
    pub hotreloads_this_session: u32,
    pub errors_this_session: u32,
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Hot-reload cycle (save → in-game effect) | < 500 ms | 2 s |
| Per-script step (typical AI logic) | < 200 µs | 1 ms |
| All-scripts frame budget | < 5 ms | 8 ms |
| State preservation on reload | > 99% (table survives) | 100% required |
| VM memory per script (typical) | < 4 MB | 16 MB |
| Lua call overhead (Rust → Lua) | < 1 µs | 5 µs |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SCR_E_SYNTAX` | Script failed to compile | Show line + col + suggested fix |
| `SCR_E_BUDGET_EXCEEDED` | Per-frame budget overrun | Throttle / break long-running script |
| `SCR_E_CAP_DENIED` | Untrusted mod tried elevated call | Block; log; surface in mod UI |
| `SCR_E_OOM` | Script VM ran out of memory budget | Bump budget or reduce allocations |
| `SCR_W_HOTRELOAD_STATE_LOST` | State table reset due to incompatible schema change | OK; warn dev |

## Integration Points

- **Scripting (base)**: this spec is the project-organization + hot-reload + capability layer atop the base VM spec. → `docs/specs/scripting/overview.md`.
- **Mods**: mod loader uses same `ScriptingFirst::load_dir` with `untrusted-mod` tier. → `docs/specs/mods/overview.md`.
- **Hot-reload**: heavy variant of base hot-reload — sub-second + state preservation. → `docs/specs/scripting/hotreload.md`.
- **Sandbox**: capability-elevation primitives. → `docs/specs/scripting/sandbox.md`.
- **Sim-game**: sim systems often script-defined (recipe trees, AI behavior). → `docs/specs/sim-game/overview.md`.
- **Agent**: nexus-coder loops on hot-reload to iterate script logic without rebuild. → `docs/specs/agent/overview.md`.

## Scenario test (starter)

`scenarios/scripting-first-hotreload-loop.scenario.toml`:

```toml
[scene]
template = "scripting-first-basic"
[setup]
script = "scripts/systems/spawn-loop.lua"
[actions]
- { tick = 1,    action = "load_script", path = "scripts/systems/spawn-loop.lua" }
- { tick = 60,   action = "edit_script", path = "scripts/systems/spawn-loop.lua", patch = "rate=20" }
[asserts]
- { tick = 30,  predicate = "spawned_entities == 10" }   # rate=10/s pre-edit
- { tick = 120, predicate = "spawned_entities > 20" }    # rate=20/s post-edit
- { tick = 120, predicate = "hotreload_latency_ms < 500" }
- { tick = 120, predicate = "step_ms_p99 < 1.0" }
```

## Test Requirements

- Edit Lua file → in-game effect visible within 500 ms.
- Script state table survives a hot-reload that doesn't change the schema.
- Untrusted mod attempting `io.open("/etc/passwd")` → blocked, error reported.
- Script step budget enforced: infinite loop in script kills VM, surfaces error, game continues.
- Same `GameApi` callable from game scripts and mod scripts (with capability gating).

## Prior Art

- Garry's Mod — Lua-first game; mods + game share the same API. [VERIFY — Garry Newman talks].
- RimWorld — modding ecosystem; Tynan Sylvester's design diaries. [VERIFY — Ludeon dev blog].
- Factorio — Lua mod API + heavy hot-reload during development. [VERIFY — Wube FFF posts on modding].
- Roblox — Luau, capability-elevated sandboxing. [VERIFY — Roblox engineering blog].
- World of Warcraft addons — Lua + capability sandbox. [VERIFY — Blizzard addon API docs].
- *Inspired by*: Rune language — modern Rust-native scripting alternative. https://rune-rs.github.io/.
- *Inspired by*: mlua / rlua / piccolo — Rust↔Lua FFI references.

## Open Questions

- `[DECISION NEEDED]` Default scripting language: Lua (mod ecosystem, familiar) vs Rune (Rust-native, less drift).
- `[DECISION NEEDED]` Hot-reload state preservation: opt-in (explicit `state = state or {}` pattern) vs implicit (engine reflects + reattaches).
- `[BENCHMARK NEEDED]` Hot-reload cost on a 10k-LOC Lua codebase.
- `[DECISION NEEDED]` Capability tier 4 (kernel-level / admin) — needed, or refuse?
- `[DECISION NEEDED]` Should `untrusted-mod` get `os.time`? (information leak vs basic utility.) Lean: yes.
