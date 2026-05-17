<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Live Reload

> File save (script, shader, asset, scene) → visible in running game in under 100 ms. No restart, no scene reload, no state loss. Same pipeline whether triggered by editor save, external editor save, agent RPC, or git pull.

## RPC parity

Live reload itself is RPC-driven. The watcher classifies the change and dispatches one of `script.reload` / `shader.recompile` / `asset.reimport` / `scene.reload` / `reload.apply` agent RPCs. An agent can drive the entire reload pipeline headlessly via `reload.*` — the editor adds the file-watch trigger and the status overlay; the engine apply path is shared. Enforced by `docs/specs/editor/rpc-parity.md` and Law 13 (→ `docs/architecture/01-principles.md#law-13`). MCP exposes the same surface (→ `docs/specs/agent/mcp-server.md`).

## Boundaries

- Owns: file-watch in the editor process, in-editor "saved" event dispatch, reload-status overlay, conflict resolution UI.
- Does NOT own: script hot-swap semantics (→ `docs/specs/scripting/hotreload.md`), shader recompile (→ `docs/specs/renderer/shaders.md`), asset reimport (→ `docs/specs/assets/import.md`), asset registry update (→ `docs/specs/assets/registry.md`).
- Depends on: `docs/specs/editor/overview.md`, `docs/specs/scripting/hotreload.md`, `docs/specs/renderer/shaders.md`, `docs/specs/assets/registry.md`, `docs/specs/agent/api.md`.

## Architecture

```
   ┌─────────────────────────────────────────────────────────────────┐
   │   Source of change                                              │
   │   ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐    │
   │   │ editor    │ │ external  │ │ agent    │ │ git pull /   │    │
   │   │ save      │ │ editor    │ │ rpc      │ │ branch chg   │    │
   │   └─────┬─────┘ └─────┬─────┘ └─────┬────┘ └──────┬───────┘    │
   └─────────┼─────────────┼─────────────┼─────────────┼────────────┘
             │             │             │             │
             ▼             ▼             ▼             ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Watcher (notify crate; inotify/kqueue/ReadDirectoryChangesW)    │
   │   debounce 30 ms · coalesce within same path                    │
   └────────────────────────┬────────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Classifier — by extension + magic bytes                         │
   │   .lua/.rn  → script   .wgsl/.nxshader → shader                 │
   │   .png/.ktx/.exr → texture   .gltf/.fbx → mesh                  │
   │   .ogg/.wav → audio   .nxscene/.nxprefab → scene/prefab         │
   │   .toml (Nexus.toml) → project config                           │
   └────────────────────────┬────────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Dispatcher — calls the right pipeline                           │
   │   ┌────────┐ ┌────────┐ ┌─────────┐ ┌───────┐ ┌──────────────┐ │
   │   │script. │ │shader. │ │asset.   │ │scene. │ │config.reload │ │
   │   │reload  │ │recompil│ │reimport │ │reload │ │              │ │
   │   └────┬───┘ └───┬────┘ └────┬────┘ └───┬───┘ └──────┬───────┘ │
   └────────┼─────────┼───────────┼──────────┼────────────┼─────────┘
            ▼         ▼           ▼          ▼            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Engine applies the swap — state preserved                       │
   │   ▸ swap VM closure tables · keep coroutines                    │
   │   ▸ swap shader module · re-bake materials · keep entity refs   │
   │   ▸ replace asset bytes · bump registry version · notify users  │
   │   ▸ diff scene · apply patch to running world · keep dynamic   │
   │     entities                                                   │
   └────────────────────────┬────────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Reload-status overlay in editor    ✓ orc_ai.lua  18 ms          │
   │                                    ✓ water.wgsl  47 ms          │
   │                                    ✗ scene_01    rollback (err) │
   └─────────────────────────────────────────────────────────────────┘
```

## End-to-end budget

| Stage | Target | Hard limit |
|---|---|---|
| FS event → debounced dispatch | < 30 ms | 80 ms |
| Classify + RPC to engine | < 5 ms | 20 ms |
| Engine apply (script) | < 20 ms | 100 ms |
| Engine apply (shader, cached permutation) | < 30 ms | 150 ms |
| Engine apply (shader, cold compile) | < 200 ms | 1 s |
| Engine apply (texture 4k, BCn cached) | < 40 ms | 200 ms |
| Engine apply (mesh, no LOD regen) | < 60 ms | 300 ms |
| Engine apply (scene patch) | < 50 ms | 200 ms |
| Overlay update | < 5 ms | 16 ms |
| **Total: edit → visible (typical small file)** | **< 100 ms** | **300 ms** |

`[BENCHMARK NEEDED]` confirm on Steam Deck (slower IO + slower GPU compile).

## What gets preserved across reload

| Kind | Preserved | Reset |
|---|---|---|
| Script | locals on call stack, coroutines, registered timers, ECS handles | nothing if no shape change; transient closures only if shape changes |
| Shader | bound materials, parameter values, GPU resources | compiled WGSL module (recompiled) |
| Texture | binding slots, sampler state | GPU bytes |
| Mesh | entity refs, transforms | GPU buffers, BVH |
| Audio clip | playing voices keep playing (cross-fade option) | sample data |
| Prefab | linked instances (overrides preserved) | source bytes |
| Scene | dynamic entities spawned at runtime (tagged `keep_on_reload`); transforms of moved authored entities | replaced authored entities |
| Project config | runtime-tunable values | feature flags (some require restart — flagged) |

Reload is **stateful patch**, not "kill + load". When a patch is not possible (e.g. shape change in a component layout), the engine returns `RL_REQUIRES_FULL_RELOAD` and the editor offers a one-click full reload that snapshots+restores world state via `docs/specs/agent/replay.md`.

## Conflict handling

Editor save + external save of same file within debounce window:
- If contents identical: silently dedup.
- If contents differ:
  1. detect via hash, raise `RL_CONFLICT`,
  2. open three-way merge dialog (base = last-known good, ours = editor buffer, theirs = on-disk),
  3. user resolves; resolved bytes written; reload pipeline runs.

Git branch switch (mass file change): batched as one transactional reload — all changes classified, sorted by dependency, applied in a single engine pause window (< 1 frame ideal).

## Reload status overlay

```
┌──────────────────────────────────────────────┐
│  Live Reload                       last 60 s │
│  ✓ orc_ai.lua            18 ms   12:04:13   │
│  ✓ water.wgsl            47 ms   12:04:15   │
│  ✓ rock_01.gltf         112 ms   12:04:17   │
│  ⚠ ui_theme.png       cache miss 280 ms     │
│  ✗ scene_01.nxscene  RL_CONFLICT             │
│       [diff] [keep ours] [keep theirs]      │
└──────────────────────────────────────────────┘
```

Floating, dismissible, persists in dock when expanded. Click row → jumps to file or to offending node.

## Public API (commands)

```rust
pub struct ReloadFile          { pub path: PathBuf }                  // explicit trigger
pub struct ReloadAll           { pub kinds: Vec<ReloadKind> }         // mass refresh
pub struct SetWatcher          { pub enabled: bool, pub roots: Vec<PathBuf>, pub ignore: Vec<Glob> }
pub struct ResolveConflict     { pub path: PathBuf, pub resolution: ConflictResolution }
pub struct ForceFullReload     { pub snapshot_state: bool }
pub struct SubscribeReloadEvents { pub since: Option<EventId> }
```

RPC counterparts under `reload.*` in `docs/specs/agent/api.md`. The watcher itself runs in-editor; engine offers `reload.apply { path, bytes_or_disk }` to perform the swap. Agents can drive reload without using the editor.

## Watcher configuration

- Default roots: project root (`Nexus.toml` parent), plus any `[workspace.members]` paths.
- Default ignores: `.git/`, `target/`, `.nexus/cache/`, OS noise (`.DS_Store`, `*~`, `*.swp`).
- Editable in editor preferences and `Nexus.toml` (`[editor.livereload]`).
- Symlinks: followed once (no cycles).
- Network filesystems: warn — debounce raised to 300 ms; suggest mirroring locally.
- WSL2: confirmed works via Windows-side `notify` polling fallback (`[BENCHMARK NEEDED]` quantify latency penalty).

## Event ordering & dependency graph

Reloads are not always independent. The dispatcher builds a mini-DAG per batch:
- script depends on its referenced assets (via parsed `require`/`use`)
- shader depends on subgraph dependencies and uniform layout
- scene depends on prefabs + scripts + assets

Apply order = topological sort. If an upstream apply fails, downstream items are deferred and the user notified.

## Failure & rollback

Per file:
- Apply runs in a "shadow" object first (compiled shader module, parsed script chunk, decoded texture).
- Only on success does the engine atomically swap.
- Failure ⇒ keep the previously-good version live, surface structured error.
- Repeated failures (3 in 30 s) ⇒ pause watcher for that path, show prompt.

Global rollback: editor keeps last N reloads (default 32); Ctrl+Shift+Z in the reload dock undoes the most recent reload (re-uploads previous bytes).

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Watcher CPU at idle (10k files) | < 0.1% | 1% |
| Memory overhead | < 20 MB | 80 MB |
| Concurrent reloads handled | 32 | 256 |
| Batched git-switch (500 files) | < 2 s end-to-end | 10 s |
| Editor jank during reload | none (no frame > 20 ms) | one frame > 33 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `RL_REQUIRES_FULL_RELOAD` | structural change, hot-swap impossible | offer full reload (with snapshot/restore) |
| `RL_CONFLICT` | editor buffer vs disk diverged | open merge dialog |
| `RL_DEPENDENCY_BROKEN` | upstream item failed, this one deferred | retry when upstream fixed |
| `RL_APPLY_FAILED` | shadow object failed validation (e.g. shader compile) | keep prev version, show diag |
| `RL_WATCHER_OVERFLOW` | OS event queue saturated | rescan, warn |
| `RL_NETWORK_FS_SLOW` | latency over network FS threshold | suggest local mirror |
| `RL_PATH_IGNORED` | path matched ignore globs but caller forced reload | inform user |

## Integration Points

| System | Interaction |
|---|---|
| `docs/specs/scripting/hotreload.md` | actual VM hot-swap (Lua / Rune) |
| `docs/specs/renderer/shaders.md` | WGSL recompile + module swap |
| `docs/specs/assets/import.md` | reimport pipeline reused for asset reloads |
| `docs/specs/assets/registry.md` | bumps asset version, notifies subscribers |
| `docs/specs/editor/scene.md` | scene patch application; preserve dynamic entities |
| `docs/specs/editor/shader.md` | graph edit triggers shader pipeline |
| `docs/specs/agent/replay.md` | snapshot + restore for forced full reload |
| `docs/specs/agent/api.md` | `reload.*` RPC surface |

## Test Requirements

- `livereload.budget`: 100 randomized small edits (mixed kinds) — P95 edit-to-visible ≤ 100 ms.
- `livereload.no_restart`: 1-hour soak — script + shader + texture reloads at 1/s, engine never restarts, memory stable.
- `livereload.state_preserved`: scripted timer running, reload its script — timer continues from same phase.
- `livereload.shader_recompile_safety`: bad WGSL save → `RL_APPLY_FAILED`, previous material still rendering, error structured.
- `livereload.git_switch`: branch change altering 500 files — all reloads applied in dependency order, no frame > 33 ms.
- `livereload.conflict_dialog`: simulate divergent edits → merge dialog appears with three-way diff.
- `livereload.headless_parity`: same reloads driven entirely via `reload.*` RPC produce identical engine state hash as editor-driven session.
- `livereload.full_reload_snapshot`: shape-changing component edit triggers `RL_REQUIRES_FULL_RELOAD`; chosen rollback restores prior snapshot byte-identical.

## Prior Art

- ✓ Unity script reload — preserves Inspector state, but not running coroutines; we aim higher.
- ✓ Unreal Live Coding (`hot reload` → `live coding`) — fast C++ patch; conceptually our target for Rust too (`[DECISION NEEDED]`).
- ✓ Godot — script & shader hot reload, scene partial reload via `EditorPlugin`; one of the cleanest in OSS.
- ✓ Bevy `bevy_asset` hot reload + community shader hot-reload plugins.
- ✓ Blenvy (Blender → Bevy) — full-level hot reload demonstrates the pattern over GLTF.
- ✓ ShaderToy — sub-100 ms shader iteration is proven feel.
- ✓ React / Vite HMR — patterns for dependency-aware partial reload, error overlays, "last known good" fallback.
- ✗ "kill + reload" engines — break flow state; we never do this implicitly.

## Open Questions

- `[DECISION NEEDED]` Rust gameplay code hot reload — dylib swap (cargo-watch + libloading) or out-of-scope (scripts only)?
- `[DECISION NEEDED]` Cross-process reload coordination — when editor + headless tester + dedicated server all watch same project, who owns the file watch?
- `[DECISION NEEDED]` Should reload events be replayable as a "session" for agent learning (record + replay file-saves)?
- `[DECISION NEEDED]` Mass-reload pause strategy — single frame stall vs. interleaved over N frames (jank vs. consistency).
- `[BENCHMARK NEEDED]` WSL2 inotify-from-Windows latency penalty.
- `[BENCHMARK NEEDED]` Network-FS reload latency on a typical NAS / SSHFS.
- `[AGENT: 08]` confirm script hot-swap shape-change rules (what counts as structural).
- `[AGENT: 03]` shader permutation cache key stability across edits (so common edits hit cache).
- `[AGENT: 09]` asset registry version-bump notification fan-out cost at 100k subscribers.
- `[AGENT: 10]` `reload.*` RPC surface lock-in.
- `[AGENT: 14]` contract for "engine apply" — strict atomicity guarantees.
