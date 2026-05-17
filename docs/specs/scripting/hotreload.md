<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Hot Reload

> One pipeline reloads game logic, scripts, shaders, and assets without restart. Target: < 100 ms from save → visible in game. State preserved by default.

## Boundaries

- Owns: file watcher abstraction, reload event bus, reload orchestrator, per-kind reload handlers (script, shader, asset), state preservation contract.
- Does NOT own:
  - Lua-specific reload semantics → `lua.md`
  - Rune-specific reload semantics → `rune.md`
  - Shader compilation → `docs/specs/renderer/shaders.md`
  - Asset import → `docs/specs/assets/import.md`
- Depends on:
  - `docs/specs/core/events.md`
  - `docs/specs/assets/registry.md`
  - `docs/specs/renderer/shaders.md`
  - `docs/specs/editor/livereload.md` (UI consumer)

## Pipeline

```
   [editor / fs watcher]
            |
            v
   +--------+---------+
   |  FileChange event |   path, kind, hash, timestamp
   +--------+----------+
            |
            v
   +--------+---------+
   |   Classifier      |  → kind ∈ {LuaScript, RuneMod, Shader, Asset, Manifest}
   +--------+----------+
            |
            v
   +--------+----------+
   |   Debouncer       |  coalesces edits within 50 ms window
   +--------+----------+
            |
            v
   +--------+----------+
   |   Reload Bus       |  fan-out to all subscribers
   +---+---+---+---+---+
       |   |   |   |
       v   v   v   v
     Lua Rune Sh Asset
     handlers...
            |
            v
   +--------+----------+
   |   ReloadReport     |  per-kind, ok/fail/fallback, timing, warnings
   +--------+----------+
            |
            v
   [telemetry] [editor UI] [agent SDK]
```

## Triggers

| Kind | Trigger source | Handler |
|---|---|---|
| Lua script | fs watcher on `scripts/**/*.lua` | `lua.md` |
| Rune mod | fs watcher on `mods/**/*.rn` and `mods/**/mod.toml` | `rune.md` |
| Shader | fs watcher on `shaders/**/*.wgsl` | `renderer/shaders.md` |
| Texture/mesh/audio | asset registry hash change | `assets/registry.md` |
| Material | inspector save | renderer material reload |
| Scene | editor save | scene patcher |
| `Nexus.toml` | manifest change | partial subsystem restart (warn) |

Triggers fire identically whether the source is fs watcher, editor save, or `nexus agent reload --path X` from the agent SDK.

## State Preservation Contract

Every reload handler declares one of three behaviors:

| Behavior | Meaning | Default for |
|---|---|---|
| `hot` | World keeps running. State preserved by handler. | scripts, shaders, textures, audio, materials |
| `warm` | World pauses one tick. State preserved via snapshot. | scene patches, asset graph changes |
| `cold` | World snapshot → reload → world restore. | manifest changes, module-set changes |

Handlers degrade upward (hot → warm → cold) and emit `RELOAD_INCOMPATIBLE` warning explaining why.

### Script State Preservation

- Each script declares a persistent slot:
  - Lua: `script.state` table preserved by identity across reload.
  - Rune: typed `Persist` struct serialized via serde, reattached after re-init.
- New code that removed fields gets a warning listing dropped keys.
- New code that added fields sees them at default values.
- Optional migration hook: `on_reload(prev_state) -> new_state` runs before first step on new version.

### Shader State Preservation

- WGSL recompiled in background; on success, pipeline atomically swapped.
- Uniform buffer layout change → triggers warm reload (one-frame pause).
- Permutation cache (`renderer/shaders.md`) invalidated only for affected entries.

### Asset State Preservation

- Asset registry replaces bytes behind the same UUID; all `Handle<T>` remain valid.
- Streaming positions, refcounts, GPU residency preserved where possible.
- Mesh/texture format change → handler emits `RELOAD_INCOMPATIBLE`, falls back to warm.

## Determinism Guarantees

Hot reload is NOT replay-safe by default. Recorded inputs do not include reload events. Two modes:

- **Live mode**: reloads fire whenever fs watcher emits. Used in dev. Snapshots taken before each reload for rollback.
- **Replay mode**: fs watcher disabled. Reloads only via explicit `ReloadAt{frame, kind, path}` events embedded in the replay stream. This makes replay reproduce a dev session including its reloads.

→ `docs/specs/agent/replay.md` for the snapshot/replay schema.

## Agent SDK Hooks

```
nexus agent reload --path scripts/game/combat/damage.lua
nexus agent reload --shader shaders/postfx/bloom.wgsl
nexus agent reload --asset 3f1a...uuid
nexus agent reload --all          # warm reload everything
```

JSON-RPC equivalents in `agent/api.md`. Every reload returns a `ReloadReport`:

```json
{
  "kind": "LuaScript",
  "path": "scripts/game/combat/damage.lua",
  "frame": 12345,
  "duration_us": 12300,
  "outcome": "hot",
  "state_preserved": true,
  "dropped_keys": [],
  "warnings": [],
  "errors": []
}
```

## Performance Contract

| Step | Target | Hard limit |
|---|---|---|
| fs event → classifier | < 1 ms | 10 ms |
| Debouncer window | 50 ms | 200 ms |
| Lua reload (5 KB) | < 30 ms | 100 ms |
| Rune reload (5 KB) | < 80 ms | 300 ms |
| Shader reload (typical) | < 40 ms | 200 ms |
| Texture reload (1024² RGBA) | < 30 ms | 150 ms |
| End-to-end save → in-game | < 100 ms | 500 ms |

`[BENCHMARK NEEDED]` all numbers.

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `RELOAD_INCOMPATIBLE` | Handler cannot hot-reload these changes | Fall back to warm/cold; warn |
| `RELOAD_FAILED` | Handler errored mid-reload | Restore prior version; surface |
| `RELOAD_TIMEOUT` | Handler exceeded budget | Abort, keep prior version |
| `WATCHER_LOST` | fs watcher dropped events | Re-scan; warn; possible missed edits |

Errors are JSON, surfaced to telemetry, editor UI, and agent SDK.

## Integration Points

- **Lua / Rune** consume the reload bus and apply script-specific semantics.
- **Renderer shaders** subscribe to `.wgsl` reloads.
- **Asset registry** is both producer (hash change) and consumer (handle relink).
- **Editor** (`editor/livereload.md`) surfaces reload reports as toasts and diff views.
- **Agent SDK** can trigger reloads for fuzz testing and feedback loops.
- **Networking** (`networking/replication.md`): in multiplayer, reloads on the authoritative server are broadcast to clients; clients sync via the same pipeline. `[DECISION NEEDED]` whether this is enabled outside dev builds.

## Test Requirements

- Editing a script file and saving → in-game effect visible in < 100 ms on reference hardware.
- Saving a malformed script does not crash the world; prior version keeps running.
- Reloading a shader that breaks a pipeline rolls back atomically; frame is rendered with old shader; error surfaced.
- 1000 file edits in 1 second collapse into ≤ 20 reload events thanks to debouncer.
- A script reload preserves all `script.state` keys present in both old and new source.
- Replay-mode reload events reproduce deterministically across runs.

## Prior Art

- `bevyengine/bevy` hot-reload of assets ✓ — handle-based reload model.
- Defold hot-reload ✓ — script state preservation by message.
- LÖVE2D hot reload (community patterns) ✓ — module table replacement.
- Unity domain reload ✗ — full reload, multi-second pause; opposite of what we want.
- Erlang/OTP code_change ✓ — explicit migration hook; we adopt the pattern as optional `on_reload`.

## Open Questions

- `[DECISION NEEDED]` Hot reload in multiplayer: dev-only, never, or with broadcast?
- `[DECISION NEEDED]` Debouncer window default (50 ms vs 100 ms) — depends on editor save patterns.
- `[DECISION NEEDED]` Allow user-defined classifier rules in `Nexus.toml`?
- `[BENCHMARK NEEDED]` all perf numbers.
- `[AGENT: 09]` Confirm asset registry change-detection surface matches what we subscribe to.
- `[AGENT: 11]` Confirm editor reload UI consumes `ReloadReport` schema.
- `[AGENT: 10]` Confirm JSON-RPC reload method names align with `agent/api.md`.
