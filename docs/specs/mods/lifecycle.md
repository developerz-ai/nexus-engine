<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Lifecycle

> Install → enable → configure → update → disable → uninstall. Each transition is atomic, deterministic, telemetered, and side-effect-clean.

## Boundaries
- Owns: state machine, side-effect log, registry mutations, GC of mod-owned assets, "mod missing on next launch" policy.
- Does NOT own:
  - Resolver → `dependencies.md`
  - Asset overlay attach/detach → `asset-overlay.md`
  - Save migration → `save-compatibility.md`
  - VM init → `docs/specs/scripting/rune.md`
- Depends on: `dependencies.md`, `asset-overlay.md`, `save-compatibility.md`, `docs/specs/assets/registry.md`.

## States

```
+-----------+        +---------+        +----------+
| NotKnown  | install| Installed| enable | Enabled  |
+-----+-----+ -----> +----+----+ -----> +----+-----+
      ^               |                       |
      | uninstall     | disable               | configure (loops)
      |               v                       v
      +------- Installed <------- Disabled <--+
```

Transitions are state-machine guards in `nexus-mod-manager`. Invalid transitions emit `MOD_E_LIFECYCLE_INVALID`.

| State | Disk state | Registry state | Runtime |
|---|---|---|---|
| NotKnown | absent | absent | absent |
| Installed | `.nxmod` cached, unpacked metadata in `~/.nexus/mods/<id>/<ver>/` | listed, not in active set | inactive |
| Enabled | unpacked | listed, in active set | VM running, overlays active |
| Disabled | unpacked | listed, not in active set | inactive, persist preserved |

## Install

```
nexus mod install <source>            # path / url / marketplace ref
```

Steps:
1. Fetch `.nxmod` to staging dir.
2. `mod verify` (hash, sig, layout → `package-format.md`).
3. Resolve deps (`dependencies.md`); install missing deps recursively (with explicit player confirmation if new).
4. Unpack into `~/.nexus/mods/<id>/<ver>/`.
5. Register in mod registry (`~/.nexus/registry/mods.bin`).
6. Add to "Installed" set. **Not enabled yet.**
7. Emit `ModInstalled { id, ver, mod_hash }`.

Idempotent. Re-installing same `id@ver` with matching `mod_hash` is no-op. Mismatching hash = `MOD_E_INSTALL_HASH_MISMATCH`.

## Enable

```
nexus mod enable <id>
```

Steps:
1. Check `Installed` state.
2. Resolve current active set + this mod (dependency check; may pull required deps).
3. Show capability consent dialog (→ `permissions.md`); skip if all caps already granted at same scope.
4. Apply load-order recompute (`load-order.md`).
5. Spawn Rune VM (→ `docs/specs/scripting/rune.md`).
6. Attach asset overlays (→ `asset-overlay.md`).
7. Call mod's `init(env)` with the granted ModEnv.
8. If save loaded: run save-compat check (→ `save-compatibility.md`).
9. Emit `ModEnabled { id, ver, caps_granted }`.

Atomicity: a failure at any step rolls back; mod remains `Installed`. Engine never half-enables.

## Configure

Each mod can declare a `[config]` schema in `mod.toml` (optional, JSON Schema). Player edits via mod settings UI; values persist per profile.

```toml
[config]
schema = "config/schema.json"
defaults = "config/defaults.toml"
```

Changing config → `ModConfigChanged { id, ver, diff }` event; mod's `on_config(new)` hook called. Hot-reload by default (no restart).

## Update

```
nexus mod update <id>                 # check + install + replace
nexus mod update --all                # check all
```

Steps:
1. Check marketplace / source for newer compatible version.
2. Fetch + verify new `.nxmod`.
3. Resolver re-runs with the new version pinned.
4. Run save-compat check if save loaded:
   - PATCH bump: hot-swap in place (state-preserving, → `docs/specs/scripting/hotreload.md`).
   - MINOR bump: warm reload (one-tick pause).
   - MAJOR bump: cold reload + save migration prompt.
5. Old version unpinned; eligible for GC if no save references it.
6. Emit `ModUpdated { id, old_ver, new_ver }`.

## Disable

```
nexus mod disable <id>
```

Steps:
1. Suspend VM (graceful: drain pending events, persist `Persist` blob).
2. Detach asset overlays (`asset-overlay.md`); reload broadcast.
3. Remove from active set; recompute load order.
4. **Preserve** mod-owned ECS entities by default (so re-enable restores). `[DECISION NEEDED]` on opt-in for "strip on disable."
5. Save flagged "modded-disabled-X"; re-enable available without data loss.
6. Emit `ModDisabled { id, ver }`.

## Uninstall

```
nexus mod uninstall <id>              # all versions
nexus mod uninstall <id>@<ver>        # one version
```

Steps:
1. Disable first if enabled.
2. Run side-effect cleanup:
   - Despawn mod-owned entities (those spawned via this mod's `WorldWrite`; tracked by origin tag).
   - Drop mod-owned components from foreign entities (those added by this mod via `WorldWrite<C>`; component-origin tag).
   - Remove mod-introduced asset UUIDs (refcount-checked; held UUIDs gracefully unload).
   - Delete persist blob (with confirmation).
3. Remove from registry.
4. Delete `~/.nexus/mods/<id>/<ver>/`.
5. Save compatibility re-check: save may now declare this mod was required → re-prompt next load.
6. Emit `ModUninstalled { id, ver }`.

## Side-Effect Tracking

Every mod-induced mutation carries an origin tag:

```
Mutation { mod_id: "com.example.healing-pack", kind: SpawnEntity { e: 1234 } }
Mutation { mod_id: "com.example.healing-pack", kind: AddComponent { e: 5678, c: "Buff" } }
Mutation { mod_id: "com.example.healing-pack", kind: AssetIntro { uuid: "01HZ..." } }
```

Stored in a per-save `mod-effects.log`. Disable/uninstall walks this log in reverse to unwind. Stored deterministically (sim-frame order).

`[DECISION NEEDED]` log size cap and rotation policy for long-running saves.

## "Mod Was Enabled But Missing On Next Launch"

Player removed `.nxmod` from disk (or marketplace 404). Save references mod. On next load:

| Save policy (from `save-compatibility.md`) | Behavior |
|---|---|
| `refuse` | Save will not load; player prompted: install / change policy |
| `warn` | Save loads; entities/components from missing mod marked as `Orphan`; on-screen banner |
| `strip` | Save loads; mod-effects.log replayed in reverse to remove the mod's traces; save written back |

Default is `warn` for solo, `refuse` for multiplayer.

## CLI

```
nexus mod ls                          # all known with state
nexus mod ls --enabled
nexus mod ls --installed
nexus mod ls --json
nexus mod install <src>
nexus mod enable <id>
nexus mod disable <id>
nexus mod uninstall <id>[@<ver>]
nexus mod update <id|--all>
nexus mod gc                          # remove versions not pinned by any save
nexus mod info <id>                   # caps, deps, deps-by, overlays, persist size
```

Every command also exposed via JSON-RPC for the agent SDK (→ `docs/specs/agent/api.md`).

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_LIFECYCLE_INVALID` | Illegal state transition | Caller bug; report |
| `MOD_E_INSTALL_HASH_MISMATCH` | Re-install with different hash same id@ver | Possible tamper; refuse |
| `MOD_E_ENABLE_DEPS_MISSING` | Required dep not installed | Auto-prompt install |
| `MOD_E_ENABLE_CONFIRM_DENIED` | Player denied capability grant | None; mod stays installed |
| `MOD_E_UNINSTALL_IN_USE` | Save pins this mod and policy = refuse | Disable save policy or remove ref |
| `MOD_E_GC_PINNED` | Save pins this version | Excluded from GC |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Install (verify + unpack, 100 MB) | < 2 s | 10 s |
| Enable cold (VM init + overlay) | < 200 ms | 1 s |
| Disable | < 100 ms | 500 ms |
| Update PATCH (hot-swap) | < 100 ms | 500 ms |
| Uninstall + side-effect cleanup (1k tracked mutations) | < 100 ms | 1 s |
| `mod ls` (100 mods) | < 50 ms | 200 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `package-format.md` — `mod verify` invoked on install.
- `dependencies.md` — resolver invoked on install / enable / update.
- `asset-overlay.md` — attach/detach + reload broadcast.
- `save-compatibility.md` — missing-mod policy on save load.
- `docs/specs/scripting/rune.md` — VM lifecycle attach/suspend.
- `docs/specs/scripting/hotreload.md` — update path uses same pipeline.
- `multiplayer-sync.md` — enable/disable triggers server-side mod-set renegotiation.
- `docs/specs/agent/sdk.md` — every command exposed for fuzzing/testing.

## Test Requirements

- Install → enable → disable → re-enable preserves persist blob byte-identical.
- Uninstall removes 100% of mod-tagged mutations from world; verified by snapshot diff.
- "Mod missing on next launch" with `warn` policy: save loads, banner shown, no crash.
- Atomic enable: simulated failure mid-step rolls back to `Installed`; no partial state.
- 1000 install/uninstall cycles leave disk usage identical (no leak).
- Concurrent enable/disable from agent SDK and UI is race-free.

## Prior Art

- BepInEx enable/disable UX ✓ — flat folder, no origin tracking; we add it.
- Steam Workshop subscription sync ✓ — auto install/update model.
- Cargo `install` / `uninstall` ✓ — atomic, version-pinned.
- Skyrim Mod Organizer 2 ✓ — VFS-based isolation; informs our overlay model.
- Vortex (Nexus Mods manager) ✓ — profile concept (→ `docs/guides/mods/players/profiles.md`).

## Open Questions

- `[DECISION NEEDED]` Per-mod "strip on disable" opt-in default.
- `[DECISION NEEDED]` `mod-effects.log` rotation strategy for long saves.
- `[DECISION NEEDED]` Auto-update policy: on, off, prompt; per mod or global.
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 22]` Confirm feature-flag system can disable a mod server-side per `liveops/feature-flags.md`.
