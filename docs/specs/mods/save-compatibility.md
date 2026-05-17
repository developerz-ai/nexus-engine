<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Save-Game Compatibility

> Saves declare the mod-set they were created with. Loading enforces a missing-mod policy. Mod authors ship migration hooks for schema bumps. No save ever silently corrupts because a mod changed.

## Boundaries
- Owns: save header schema for mods, missing-mod policy, migration hook spec, version-skew rules.
- Does NOT own:
  - Save file format (entity/component serialization) → `docs/specs/core/ecs.md` (assumed) and game-specific save spec.
  - Resolver → `dependencies.md`
  - Mod lifecycle → `lifecycle.md`
- Depends on: `dependencies.md`, `lifecycle.md`, `manifest.md`.

## Save Header — Mod Section

Every save embeds a `mods` block in its header:

```toml
[save.mods]
lockfile_ref = "b3:abcd...1234"        # hash of the lockfile snapshot
mod_count    = 4
required     = ["com.nexus.mod-lib@1.2.4", "com.example.healing@1.0.0"]
optional     = ["com.example.ui-kit@0.5.2"]
overlays_active = ["01HZ8XQK..."]      # base UUIDs with active overlays
persist_blobs = { "com.example.healing@1.0.0": "b3:b00b...c0de" }
```

`required` set membership = "save references state introduced by this mod (entities, components, mod-owned UUIDs, persist blob)."

Engine adds a mod to `required` automatically the first time it makes any mutation through `WorldWrite`, registers a new UUID, or writes its `Persist` blob during a save.

## Missing-Mod Policy

`Nexus.toml::[mods.save_policy]`:

```toml
[mods.save_policy]
default = "warn"                       # refuse | warn | strip
multiplayer = "refuse"                 # override for online saves
per_mod = { "com.example.healing" = "strip" }
```

Behavior per policy on load:

| Policy | Behavior |
|---|---|
| `refuse` | Save will not load. Player choices: install missing, change policy, abandon. |
| `warn` | Save loads. Missing mod's entities/components remain serialized as `Orphan`. Banner: "this save was made with mod X; reinstall to restore full functionality." Re-saving preserves the orphan block. |
| `strip` | Save loads. Engine walks `mod-effects.log` in reverse to remove the missing mod's traces. Save re-written. **Destructive.** Backup `<save>.pre-strip.bak` written. |

Per-mod overrides allowed; per-save overrides via UI ("load anyway" / "strip just this one").

## Version Skew

Save references mod at version `X.Y.Z`. Engine sees `X'.Y'.Z'` installed.

| Skew | Behavior |
|---|---|
| Identical | Load. |
| PATCH bump (`X.Y.Z'`) | Load. PATCH = bug fix, no schema change. |
| MINOR bump (`X.Y'.Z`) | Load if mod's `[save_compat]` declares `minor_compat = true` (default true). Engine calls optional `on_save_migrate(old_state) -> new_state` if present. |
| MAJOR bump (`X'.*.*`) | Save load gated on author's `on_save_migrate_major` hook. If hook absent: refuse with `MOD_E_SAVE_MAJOR_BREAK`. |
| Downgrade (installed < save) | Refuse by default; player override "load anyway, possible corruption." |

Mod author declares hooks in `mod.toml`:

```toml
[save_compat]
minor_compat        = true
on_save_migrate     = "src/migrate.rn::migrate_minor"
on_save_migrate_major = "src/migrate.rn::migrate_major"
```

Migration runs once at load; result re-serialized in place. Original saved as `<save>.pre-migrate.bak`.

## Persist Blob Compatibility

The `Persist` cap (→ `docs/specs/scripting/sandbox.md`) lets a mod store its own opaque bytes. Schema is the mod author's responsibility.

Engine guarantees:
- Blob round-trips byte-identical across save/load cycles.
- On version bump, mod's `on_persist_migrate(old_bytes, old_ver, new_ver) -> new_bytes` is called if present. Default: pass-through.
- Blob hash recorded in save header for tamper detection.

Author convention: use a self-describing format (TOML / CBOR / msgpack with a `schema_version` field).

## Mod-Owned Entities & Components

ECS state from mods is tagged with `origin = mod_id @ ver` at write time. Save format includes this tag.

On load with mod missing:
- `strip` policy: entities where `origin == missing_mod` despawned; components with that origin dropped from foreign entities.
- `warn` policy: tagged `Orphan(origin)`. Engine doesn't tick them. They're saved back unchanged.

On load with mod present at compatible version: state restored, mod's `init` called with `existing_save = true` so it can attach behavior to already-loaded entities.

## Asset Overlay & Save

Saves do not embed assets. They embed UUIDs. Overlays apply at load time; the same `Handle<T>` resolves through the current overlay stack.

If a save references a mod-introduced UUID and that mod is missing under `warn`: the UUID resolves to an engine-provided "missing asset" placeholder (magenta cube for meshes, missing-texture pink for textures, silence for audio). Banner shown.

## Multiplayer Saves

Stricter rules. In multiplayer, the server's lockfile is the canonical mod-set; clients must match. `default = "refuse"` is enforced. Joining with a save attached doesn't apply — multiplayer saves live on the server.

→ `multiplayer-sync.md` for join-time mod negotiation.

## CLI

```
nexus save inspect <save>              # JSON dump of mod section
nexus save check  <save>               # report compat against installed set
nexus save migrate <save>              # run all available hooks
nexus save strip <save> --mod ID       # explicit strip with backup
```

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_SAVE_MISSING_MOD` | Required mod not installed (policy=refuse) | Install or change policy |
| `MOD_E_SAVE_MAJOR_BREAK` | Major version bump without migration hook | Wait for compat patch or revert |
| `MOD_E_SAVE_MIGRATE_FAILED` | Migration hook returned error | Inspect; report to author; backup retained |
| `MOD_E_SAVE_DOWNGRADE` | Installed mod older than save | Manual override required |
| `MOD_E_SAVE_HASH_MISMATCH` | Persist blob hash diverges from header | Possible corruption; backup |
| `MOD_W_SAVE_ORPHANS` | Warn-mode load with orphan blocks present | None; banner only |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Save compat check (100 mods) | < 50 ms | 200 ms |
| `strip` policy walk (10k mutations) | < 200 ms | 1 s |
| `on_save_migrate` MINOR (avg) | < 50 ms | 500 ms |
| Header read (1 KB) | < 1 ms | 10 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `lifecycle.md` — disable/uninstall paths reference policy.
- `dependencies.md` — lockfile snapshot referenced by save header.
- `multiplayer-sync.md` — multiplayer-strict variant.
- `docs/specs/scripting/sandbox.md` — `Persist` cap.
- `docs/specs/scripting/rune.md` — `init(env, existing_save=true)` contract.
- `docs/specs/agent/replay.md` — replays carry mod-set; same rules apply.

## Test Requirements

- Save made with mod A, then load with A uninstalled, policy=warn: load succeeds, banner shown, re-save preserves orphans.
- `strip` policy on a 10k-mutation log yields a save the engine accepts on next load with no orphan blocks.
- MAJOR-version skew without migration hook fails with `MOD_E_SAVE_MAJOR_BREAK` and clear UI.
- Persist-blob tamper (1-bit flip) detected via hash mismatch.
- Determinism: save + reload + save produces byte-identical second save.
- Mod-introduced UUID resolves to placeholder under warn; banner shown; no crash.

## Prior Art

- Skyrim plugin-pinned saves ✓ — required-mod check; ✗ no migration framework.
- Factorio save migration scripts ✓ — explicit per-mod migration on version bump; we adopt.
- Minecraft DataFixerUpper ✓ — schema migration as data; informs our minor/major contract.
- RimWorld save with mod list ✓ — mod-set in header.
- Erlang `code_change` ✓ — pattern reused.

## Open Questions

- `[DECISION NEEDED]` Default policy: warn vs refuse for solo (current choice: warn).
- `[DECISION NEEDED]` Compact format for `mod-effects.log` in long saves.
- `[DECISION NEEDED]` Per-save UI for "treat this mod as no longer required."
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 02]` Confirm ECS origin-tag surface to participate in save serialization.
