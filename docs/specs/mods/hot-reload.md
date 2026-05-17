<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Hot Reload

> Modder edits a `.rn` source, an asset, or the manifest; result visible in the running game in under 100 ms. Reuses the engine reload pipeline. Mod-specific gotchas (state migration, asset re-bake, manifest-cap change) handled here.

## Boundaries
- Owns: mod-specific reload hooks, manifest-change gating, cap-change re-prompt rules, mod state migration contract.
- Does NOT own:
  - Reload orchestrator → `docs/specs/scripting/hotreload.md` (canonical)
  - Rune VM bytecode swap → `docs/specs/scripting/rune.md`
  - Asset hot-reload → `docs/specs/assets/registry.md`
- Depends on: `docs/specs/scripting/hotreload.md`, `docs/specs/scripting/rune.md`, `docs/specs/assets/registry.md`.

## What Reloads

| Change | Default reload kind (→ `hotreload.md`) | Mod-side hook |
|---|---|---|
| `src/**/*.rn` (PATCH bump or dev) | `hot` | `on_reload(prev_state)` |
| `assets/*.nxa` content | `hot` (asset registry path) | none; refs auto-update |
| `overlays/*.overlay.toml` | `hot` (overlay re-resolve) | none |
| `locale/*.ftl` | `hot` | none; strings re-fetched on next `t()` |
| `mod.toml` — non-cap fields | `warm` (one-tick pause) | re-resolve |
| `mod.toml` — cap added/expanded | `cold` + consent re-prompt | mod re-init with new env |
| `mod.toml` — cap removed | `warm` + telemetry | re-init |
| `[deps]` change | `cold` + resolver re-run | full lifecycle re-enable |
| Mod version bumped to MINOR | `warm` | `on_reload` |
| Mod version bumped to MAJOR | `cold` | `on_save_migrate_major` if save loaded |
| New file added under `src/` | `hot` | none unless required |
| Bytecode mismatch (`.rnc` ≠ `.rn`) | `hot` after recompile | none |

Pipeline: file watcher → debounce 50 ms → classify (mod-source, mod-manifest, mod-asset, mod-overlay) → handler → ReloadReport. Same as canonical pipeline; the mod system is just another subscriber.

## State Migration

Mods declare a `Persist` typed state via the `Persist` cap (→ `docs/specs/scripting/sandbox.md`). Hot reload preserves it by serializing → re-instantiating VM → deserializing.

```rune
// src/lib.rn
pub fn init(env: ModEnv) -> Result<Mod, ModError> {
    let state = env.cap::<Persist>()?.read::<MyState>().unwrap_or(MyState::default());
    Ok(Mod { state, ... })
}

pub fn on_reload(prev: MyStatePrev) -> Result<MyState, ReloadError> {
    Ok(MyState {
        version: 2,
        count: prev.count,
        added_field: 0,
    })
}
```

Engine calls `on_reload(prev_bytes)` if present; if not present, deserialize directly. Decode failure → fall back to `warm` reload with empty state and emit `MOD_W_RELOAD_STATE_RESET`.

## Cap-Change Gating

A mod that hot-reloads with the manifest declaring **new** caps cannot silently gain them. Engine:

1. Detects diff: `new_caps = manifest.caps - granted.caps`.
2. If `new_caps` non-empty: pauses the mod's reload until player approves via consent dialog.
3. On approve: VM re-init with the new `ModEnv`.
4. On deny: reload aborted; old version keeps running.

Cap-shrink path (mod requests fewer caps): silently applied; new VM gets the smaller env. No prompt.

## Asset Re-bake

Editing a source asset (e.g., `assets/dragon.png` before pack) triggers the engine's normal asset pipeline (`docs/specs/assets/registry.md`). The mod-system layer adds:

- Re-emit overlay manifest re-resolve when an overlay's source bytes change.
- `mod_hash` is **not** recomputed during dev hot-reload (perf); recomputed only on `nexus mod pack`.
- In multiplayer dev sessions: hot-reload of sim-affecting assets broadcast to peers if explicitly enabled in dev config; otherwise warn.

## Manifest Change Handling

| Field changed | Reload kind |
|---|---|
| `[mod].version` patch | `hot` |
| `[mod].version` minor | `warm` |
| `[mod].version` major | `cold` (save-compat re-check) |
| `[mod].name`, `summary`, `description` | `hot` (metadata only) |
| `[capabilities].*` add | `cold` + re-prompt |
| `[capabilities].*` remove | `warm` |
| `[capabilities].*` parameter expand (e.g., add a component name) | `cold` + re-prompt |
| `[deps]` add required | `cold` (resolver + install) |
| `[deps]` change version req | `warm` (resolver re-run; refuse if breaks) |
| `[conflicts]` add | `warm` |
| `[load-order]` change | `warm` (re-sort) |
| `[entry]` change (TC) | `cold` (full TC restart) |
| `[build]` change | rebuild; no in-game reload |

## ReloadReport (mod fields)

Extends the canonical `ReloadReport` from `docs/specs/scripting/hotreload.md`:

```json
{
  "kind": "RuneMod",
  "mod_id": "com.example.healing",
  "old_version": "1.0.0",
  "new_version": "1.0.1",
  "frame": 12345,
  "duration_us": 78000,
  "outcome": "hot",
  "state_preserved": true,
  "state_migration_called": false,
  "caps_changed": false,
  "new_caps_requested": [],
  "warnings": []
}
```

Surfaced in editor (`docs/specs/editor/livereload.md`) and agent SDK (`docs/specs/agent/sdk.md`).

## Multiplayer Hot-Reload

Default: hot-reload is **dev-only** for sim-affecting mods. → `docs/specs/scripting/hotreload.md` Open Questions.

Dev mode flow:
- Server reloads first.
- Server broadcasts `ModHotReload { id, new_hash }` to clients.
- Clients fetch (or are pushed) new bytes, reload.
- During the broadcast window, server pauses sim for one tick.
- On client reload failure: client drops; reconnect re-issues mod-set negotiation.

`--ship` builds: hot-reload disabled by default. Operators may enable it explicitly with banner: "this server will hot-reload mods; sessions may briefly pause."

## CLI

```
nexus mod watch [id]                   # explicit dev-mode watch loop
nexus mod reload <id>                  # force reload now
nexus mod reload --all                 # all enabled
```

Same JSON-RPC under `mods.reload` for the agent SDK.

## Error Contract

Extends `docs/specs/scripting/hotreload.md`:

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_RELOAD_CAP_NEEDED` | New caps requested; awaiting consent | Wait for user |
| `MOD_E_RELOAD_CAP_DENIED` | User denied new caps | Keep old version |
| `MOD_W_RELOAD_STATE_RESET` | State decode failed; reset to default | Inspect; report |
| `MOD_E_RELOAD_INCOMPAT_SAVE` | Major bump while save loaded; no migration hook | Refuse; player picks |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| `.rn` edit → in-game visible | < 100 ms | 500 ms |
| Overlay edit → asset re-resolved | < 200 ms | 1 s |
| Manifest cap add → consent dialog open | < 100 ms | 500 ms |
| State migration (1 KB blob) | < 5 ms | 50 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `docs/specs/scripting/hotreload.md` — pipeline canonical.
- `docs/specs/scripting/rune.md` — VM swap mechanics.
- `docs/specs/assets/registry.md` — asset hot-reload path.
- `asset-overlay.md` — overlay re-resolve trigger.
- `dependencies.md` — `[deps]` change re-runs resolver.
- `save-compatibility.md` — major bump triggers save check.
- `multiplayer-sync.md` — dev-mode broadcast path.
- `docs/specs/editor/livereload.md` — UI surface.

## Test Requirements

- Editing a mod's `.rn` source and saving shows effect in < 100 ms (reference hardware).
- Adding a cap to the manifest triggers consent dialog; old version stays running until user clicks.
- Editing an overlay source bumps the affected UUID through the reload bus exactly once.
- State migration: bump MINOR with `on_reload`; persist blob preserved per author's mapping.
- Decode failure on state migration falls back gracefully with `MOD_W_RELOAD_STATE_RESET`.
- Dev multiplayer: server-led reload broadcast keeps all clients in lockstep.

## Prior Art

- Erlang/OTP `code_change` ✓ — explicit migration hook (already adopted in `hotreload.md`).
- Defold script live update ✓ — UX target for "save and see it."
- LÖVE2D `lurker` / hot-reload patterns ✓ — community quality of life.
- Roblox Studio Play-Solo live edit ✓ — UX target for modders.
- Skyrim Creation Kit (no hot-reload) ✗ — anti-target.

## Open Questions

- `[DECISION NEEDED]` Whether to expose `nexus mod attach <process>` for editing a running game's mods externally (gaming-attached IDE flow).
- `[DECISION NEEDED]` Auto-recompute `mod_hash` on dev reload for sanity, or skip for perf.
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 11]` Confirm editor exposes the consent dialog at hot-reload.
