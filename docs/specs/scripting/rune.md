<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Rune Scripting (Sandboxed Mod Tier)

> Rune VM (rune-rs/rune) for untrusted third-party mods. Rust-native, alloc-fallible, capability-secured, resource-capped. One VM per mod, hard isolation.

## Boundaries

- Owns: Rune VM lifecycle, mod-side ECS bridge (capability-checked), per-mod resource accounting, mod load/unload, Rune-specific error formatting.
- Does NOT own:
  - Trusted game-logic scripts → `lua.md`
  - Capability grant policy / UX → `sandbox.md` and `editor/`
  - Mod discovery / registry → `assets/registry.md` (mods are an asset class)
  - File watcher → `assets/registry.md`
- Depends on:
  - `rune-rs/rune` (latest stable)
  - `docs/specs/scripting/sandbox.md` — capability model
  - `docs/contracts/core-scripting.md` — bridge surface
  - `docs/specs/core/ecs.md`

## Why Rune

- Rust-native, no C deps; ships cleanly to every Nexus target including WASM.
- Allocations are fallible (`rune` forks `std`/`hashbrown` for try-alloc) — required for hard memory caps without process kill.
- Async-first; cooperative scheduling fits frame budget enforcement.
- Rust-like syntax keeps the cognitive distance for a Rust-using engine team minimal.
- Sandboxing is described by the upstream as "work in progress" → we own the capability layer on top of the VM (see `sandbox.md`).

inspired by: `rune-rs/rune`, capability-based security (E, Joe-E), WASM component model (as comparison)

## Isolation Model

```
+--------------------- Engine Process ---------------------+
|                                                          |
|   World                                                  |
|   +------------------------------------------------+    |
|   |  ModSubsystem (Rune)                           |    |
|   |                                                |    |
|   |  Mod A  Mod B  Mod C   ... one VM each         |    |
|   |   |       |      |                             |    |
|   |   v       v      v                             |    |
|   |  +-------+-------+-------+                     |    |
|   |  |  Capability Broker     |  ← per-mod grants  |    |
|   |  +-----------+------------+                     |   |
|   |              |                                  |   |
|   |              v                                  |   |
|   |  +-----------+------------+                     |   |
|   |  |  Script Bridge (typed) |                     |   |
|   |  +-----------+------------+                     |   |
|   +--------------|---------------------------------+    |
|                  v                                       |
|              ECS World                                   |
+----------------------------------------------------------+
```

- One Rune `Vm` per mod. No shared globals across mods.
- Inter-mod communication only via the engine event bus, mediated by capabilities.
- No raw pointers, no `unsafe` exposed. All bridge functions take typed handles owned by the broker.

## Capability Bindings (Rune-facing)

Rune mods get **no ambient authority**. Every engine interaction is reached only via a capability token passed into the mod's entry point.

```rune
// mod entry point — signature fixed by spec
pub fn init(env: ModEnv) -> Result<Mod, ModError> {
    // env carries ONLY the capabilities granted to this mod
    let world  = env.cap::<WorldRead>()?;
    let events = env.cap::<EventEmit>()?;
    Ok(Mod {
        on_step: |dt| {
            for (e, h) in world.query::<Health>() {
                if h.hp < 10 {
                    events.emit("low_health", #{entity: e});
                }
            }
        },
    })
}
```

If a mod attempts `env.cap::<WorldWrite>()?` without that grant, the call returns `CAP_DENIED` at runtime; the mod must handle it or fail to init.

Capabilities documented in `sandbox.md`. Engine-side type registry in `docs/contracts/core-scripting.md`.

## Resource Limits (per mod)

Enforced by VM hooks and the bridge:

| Resource | Default | Configurable | Enforcement |
|---|---|---|---|
| Heap memory | 32 MB | Yes | Rune fallible alloc → `SCRIPT_OOM` |
| CPU per frame | 250 µs | Yes | VM instruction budget hook |
| Calls per frame to bridge | 1024 | Yes | Bridge counter |
| Events emitted per frame | 256 | Yes | Bus counter |
| Entities spawned per frame | 64 | Yes (cap req'd) | World command buffer counter |
| Components mutated per frame | 2048 | Yes (cap req'd) | Command buffer counter |
| Total mods loaded | 256 | Yes | Subsystem cap |

Exceeding a hard cap → mod is throttled for the rest of the frame; repeated breaches → mod auto-suspended with `SCRIPT_TIMEOUT` or `SCRIPT_OOM` telemetry event.

## API Surface

The Rune API mirrors Lua semantics but each module is reached through a capability token, not a global.

```
ModEnv         -- handed to init(), holds granted capabilities + metadata
WorldRead      -- query, iter (immutable)
WorldWrite     -- spawn, despawn, mutate (queued via command buffer)
EventEmit      -- emit on event bus
EventSubscribe -- subscribe to a whitelisted set of event names
AssetRead      -- load asset by UUID (must be whitelisted in mod manifest)
AudioOneshot   -- trigger sfx by registered id
Log            -- structured log
Rng            -- seeded, deterministic
SemanticSpawn  -- nexus.spawn("...") -- requires explicit cap
```

Bridge types live in `core-scripting` contract. Same conceptual surface as Lua tier, smaller in scope: no raw file/asset paths, no arbitrary event names, no engine-internal queries.

## Mod Manifest

Every mod ships with `mod.toml`:

```toml
[mod]
id          = "com.example.healing-pack"
name        = "Healing Pack"
version     = "1.0.0"
nexus       = "^1.0"
entry       = "src/lib.rn"
license     = "MIT"

[capabilities]
world.read       = ["Health", "Transform"]
world.write      = []                  # no write requested
events.emit      = ["healing.applied"]
events.subscribe = ["item.used"]
assets.read      = ["a3f1...uuid"]     # explicit UUID whitelist
audio.oneshot    = ["heal_sfx_01"]
log              = true
rng              = true

[limits]
heap_mb       = 16
cpu_us_frame  = 100
```

Manifest is part of the capability grant proposal shown to the player/admin at install. → `sandbox.md` for grant flow.

## Hot Reload

- File watcher → `ModReloadRequested{mod_id}`.
- New source compiled to Rune bytecode in worker thread.
- On parse error → `SCRIPT_PARSE` event, old mod keeps running.
- New VM instantiated, `init(env)` called with the same capability set.
- Per-mod persistent state held in a typed `state: Persist` slot, serialized to bytes via `serde` between reloads.
- Old VM dropped after one full step on the new VM to overlap.
- Reload requires mod version to be a **patch** bump (semver) for state schema compatibility; minor/major bumps trigger cold reload.

Pipeline detail: `hotreload.md`.

## Determinism

- Same world seed + same input sequence + same mod set + same capability grants → same state snapshot.
- Mod ordering: deterministic by mod id (lexicographic) within a system bucket.
- No wall clock, no system RNG, no async I/O exposed.
- Mods that need entropy use the per-world seeded RNG via the `Rng` cap.

## Structured Errors

```json
{
  "code": "CAP_DENIED",
  "mod": "com.example.healing-pack",
  "file": "src/lib.rn",
  "line": 27,
  "col": 13,
  "snippet": "    let w = env.cap::<WorldWrite>()?;",
  "stack": [{"file":"src/lib.rn","line":27,"fn":"init"}],
  "message": "capability WorldWrite not granted to mod com.example.healing-pack"
}
```

Same envelope as Lua; only the `code` set differs.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| VM init per mod (cold) | < 10 ms | 50 ms |
| Bytecode compile (10 KB) | < 30 ms | 150 ms |
| Rust → Rune call (no args) | < 500 ns | 2 µs |
| Rune → Rust bridge call | < 600 ns | 3 µs |
| ECS query iter, 10k entities (read cap) | < 1 ms | 4 ms |
| Hot reload roundtrip | < 100 ms | 400 ms |
| Per-mod frame budget | 250 µs | 1 ms then kill |

`[BENCHMARK NEEDED]` after MVP.

## Error Contract

See `overview.md` for the unified table. Rune-specific notes:

| Code | Trigger |
|---|---|
| `SCRIPT_PARSE` | `rune::CompileError` |
| `SCRIPT_RUNTIME` | `rune::VmError` |
| `SCRIPT_TIMEOUT` | VM instruction budget exceeded |
| `SCRIPT_OOM` | Fallible alloc returned `None` |
| `CAP_DENIED` | `env.cap::<T>()` for ungranted T |
| `CAP_REVOKED` | Cap revoked between `cap()` and use; bridge returns safe default |
| `BRIDGE_TYPE_MISMATCH` | Rune value did not deserialize into bridge fn arg |

## Integration Points

- **Sandbox** (`sandbox.md`): all cap checks routed through Capability Broker.
- **ECS** (`core/ecs.md`): same command buffer as Lua tier; broker stamps origin = mod id for audit.
- **Events** (`core/events.md`): mods can only emit/subscribe on event names whitelisted in manifest.
- **Assets** (`assets/registry.md`): a mod is itself a registered asset, with `*.rn` source files as sub-assets.
- **Agent SDK** (`agent/sdk.md`): agents can install/uninstall/inspect mods via JSON-RPC; useful for fuzzing mods in CI.
- **Editor** (`editor/livereload.md`): mod hot reload uses the same UI as scripts/shaders/assets.

## Test Requirements

- A mod allocating 1 GB in a loop is killed within 100 ms; engine stays alive; other mods unaffected.
- A mod calling an ungranted capability emits `CAP_DENIED` and the call is a no-op; the mod continues.
- Two mods installed simultaneously cannot read each other's persistent state.
- Replay test: same world seed + same mod set + same input → byte-identical snapshot.
- Fuzz: 10k random mod manifests parse-or-reject cleanly; no panics.
- A mod that emits an event it has no capability for is silently dropped with `CAP_DENIED` telemetry.

## Prior Art

- `rune-rs/rune` ✓ — Rust-native, async, fallible alloc.
- E language, Joe-E ✓ — capability discipline source material.
- WASM component model — alternative we evaluated; rejected for v1.0 mod tier due to FFI cost; revisit v2.0.
- Roblox Luau ✓ — sandbox-first Lua; alternative we may add later.
- Factorio Lua mods ✗ — anti-pattern: no capabilities, no isolation, mods can crash sim.

## Open Questions

- `[DECISION NEEDED]` Mod-to-mod direct messaging API (mediated) vs. event-bus only.
- `[DECISION NEEDED]` Whether to expose async/await to mods (yes is Rune-natural, but complicates determinism).
- `[DECISION NEEDED]` Per-platform mod policy: web target may disallow mods entirely; consoles likely require signed-only mods.
- `[DECISION NEEDED]` Bytecode caching: ship .rnc next to .rn or recompile on load?
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 09]` Confirm mod-as-asset registration flow in `assets/registry.md`.
- `[AGENT: 10]` Confirm agent SDK can install/uninstall mods deterministically for testing.
- `[AGENT: 14]` Confirm capability type registry surface in `contracts/core-scripting.md`.
