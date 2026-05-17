<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Asset Overlay

> Virtual filesystem over the asset registry. Mods replace, patch, or merge assets by UUID. The base asset registry remains canonical; overlays are layered at lookup time. → `docs/specs/assets/registry.md`.

## Boundaries
- Owns: overlay manifest, UUID remap table, priority arithmetic, per-mode merge semantics, lookup interceptor.
- Does NOT own:
  - UUID generation / base registry → `docs/specs/assets/registry.md` (canonical)
  - Asset decode → `docs/specs/assets/streaming.md`
  - Mod load order → `load-order.md`
- Depends on: `docs/specs/assets/registry.md`, `docs/specs/assets/overview.md`.

## Model

```
mod_handle.load(uuid)
        │
        ▼
+-------+-----------------+
| Overlay Stack (ordered) | ← sorted by (priority desc, load_order index asc)
+-------+-----------------+
        │
        ▼  apply mode (replace/patch/merge) per layer until satisfied
+-------+-----------------+
|   Base Registry Lookup  | ← canonical bytes
+-------+-----------------+
        │
        ▼
   Resolved bytes / sub-resources
```

Lookup is cap-checked (`AssetRead` for the requesting mod) but overlay resolution itself is engine-internal; mods cannot poke into other mods' overlays.

## Modes

| Mode | Behavior |
|---|---|
| `replace` | Overlay bytes wholly substitute base. Hash of result = overlay hash. |
| `patch` | Binary delta (bsdiff) applied to base. Result hash recomputed. Used for small tweaks to large assets. |
| `merge` | Structured merge for known asset kinds (glTF, scene, material set, TOML/JSON). |

`merge` is the heart of partial replacement (e.g., swap one mesh inside a glTF without re-shipping the whole scene).

### `merge` per asset kind

| Asset kind | Merge unit | Tool |
|---|---|---|
| glTF / `.nxa-scene` | mesh, material, node | engine glTF reader |
| Material set (`.mat` collection) | per material id | TOML merge |
| Animation set | per clip id | glTF animation merge |
| Texture atlas | per region by id | atlas re-pack |
| Localization (Fluent) | per key | Fluent append + override |
| Sound bank | per id | bank merge |
| Prefab tree | per node path | scene patcher |
| Material params | per param key | TOML merge |

Binary blobs (raw textures, audio samples, meshes without sub-ids) cannot be `merge`d; resolver falls back to `replace` with `MOD_W_MERGE_FELL_BACK_TO_REPLACE` warning.

## Overlay File

`overlays/<base-uuid>.overlay.toml`:

```toml
[overlay]
target_uuid = "01HZ8XQK..."
target_kind = "scene"               # MUST match base
mode        = "merge"
priority    = 100                   # higher = wins over lower

[remap]
# Optional: rebind sub-resources by id to new UUIDs.
"meshes/dragon-body"   = "01HZ8YGT..."   # new UUID points to overlay-provided mesh
"materials/dragon-skin" = "01HZ8YHU..."

[patch]
# Optional: structured diffs for known kinds.
"nodes/Dragon/transform.scale" = [2.0, 2.0, 2.0]
"materials/dragon-skin.albedo_tint" = [1.0, 0.5, 0.5, 1.0]

[merge]
# Optional: append/insert hooks.
"nodes/Dragon/children" = { append = ["overlay://nodes/Saddle"] }
```

Validation: every sub-id must exist in the base (or in another stacked overlay). Missing = `MOD_E_OVERLAY_TARGET_MISSING`.

## UUID Remap

A mod can declare:

```toml
[remap]
"01HZ8XQK..." = "01HZ8YGT..."        # globally swap base → mod-owned UUID for THIS mod's queries
```

Scope: only the requesting mod's `assets.load(old)` calls see the remap. Other mods and the engine still see the base. Used for "I want my own version of asset X without breaking the world for everyone else."

Engine-wide remaps (rare) require `tier = "total-conversion"` and explicit player consent.

## Priority & Tiebreak

```
effective_priority = (overlay.priority, load_order_index)
```

Sort descending by `priority`; within equal priority, lower `load_order_index` wins (loaded earlier = lower index = wins). This means:

- A mod loaded later can override an earlier mod **only** by declaring a higher priority.
- Default priority is `0`; conflict UI surfaces if two mods at priority `0` overlay the same target.

The conflict UI offers: pick one, reorder priorities, or accept default. → `docs/guides/mods/players/conflicts.md`.

## Dependency Tracking

When an overlay is added/removed:
- Asset registry's reverse-deps walk fires `AssetEvent::Reloaded(target_uuid)` (→ `docs/specs/assets/registry.md`).
- All `Handle<T>` remain valid (UUIDs unchanged).
- Streaming layer atomically swaps GPU residency.

When a mod is disabled, its overlays are removed; the registry re-resolves and broadcasts reload for affected UUIDs. Players never see torn frames; → `lifecycle.md`.

## Mod-Internal Asset UUIDs

Mods may ship new assets with new UUIDs. Namespacing:
- ULID generation at `nexus mod pack` time; collision odds vanishing.
- Engine validates collision at install against current registry. Collision (extreme rare) = `MOD_E_UUID_COLLISION`; author re-mints.
- Mod-introduced UUIDs are removed when the mod is uninstalled (refcount-aware → `lifecycle.md`).

## Cross-Mod Overlays

Mod B can overlay an asset shipped by Mod A only if:
- Mod B declares Mod A in `[deps]` (so dep order ensures A loaded first).
- Mod B's `assets.read` includes A's UUID (cap-gated).
- Otherwise: `MOD_E_OVERLAY_CROSS_MOD_NO_DEP`.

This makes "patch packs" first-class. Common pattern: Mod A ships a balance overhaul; Mod B patches one number; both coexist deterministically.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Overlay resolve, cache hit (1 layer) | < 1 µs | 10 µs |
| Overlay resolve, merge (3 layers, glTF) | < 100 µs | 500 µs |
| Patch apply (bsdiff, 1 MB target) | < 10 ms | 50 ms |
| Reload broadcast on overlay add/remove | < 100 ms p99 | 500 ms |

`[BENCHMARK NEEDED]`.

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_OVERLAY_TARGET_MISSING` | Overlay UUID not in registry | Install missing base / fix manifest |
| `MOD_E_OVERLAY_KIND_MISMATCH` | Overlay declared kind ≠ base kind | Fix manifest |
| `MOD_E_OVERLAY_MERGE_UNSUPPORTED` | `mode=merge` on unmergeable kind | Use `replace` or `patch` |
| `MOD_W_MERGE_FELL_BACK_TO_REPLACE` | Warning; merge failed cleanly | None; advisory |
| `MOD_E_OVERLAY_CROSS_MOD_NO_DEP` | Cross-mod overlay without `[deps]` entry | Add dep |
| `MOD_E_UUID_COLLISION` | New mod-introduced UUID clashes with existing | Re-mint at pack |
| `MOD_E_PATCH_APPLY` | bsdiff patch failed | Check base hash; re-pack |

## Integration Points

- `docs/specs/assets/registry.md` — UUID, refcount, DAG; canonical.
- `docs/specs/assets/streaming.md` — GPU residency swap on reload.
- `load-order.md` — index used as tiebreak.
- `multiplayer-sync.md` — overlay hash agreement; if two clients resolve different bytes, session rejected.
- `lifecycle.md` — overlay add/remove on enable/disable.
- `docs/specs/scripting/sandbox.md` — `AssetRead{uuids}` cap-gates which UUIDs a mod can load (overlays don't bypass).

## Test Requirements

- Replace a leaf texture; all dependent materials re-resolve within 500 ms; no torn frames.
- Merge a sub-mesh in a glTF; remaining meshes byte-identical to base.
- Two overlays at equal priority surface to conflict UI; not silently composed.
- Cross-mod overlay without dep rejected with `MOD_E_OVERLAY_CROSS_MOD_NO_DEP`.
- Removing a mod removes its overlays; reverse-dep walk fires expected events.
- Determinism: same overlay stack → byte-identical resolved bytes across machines.

## Prior Art

- Skyrim `.esp` plugin record merge ✓ — canonical "many mods edit one record" model.
- OpenMW VFS ✓ — clean overlay-by-priority approach in an OSS engine.
- Doom mods (WADs) ✓ — append-and-override pattern, primitive but proven.
- Web CSS cascade ✓ — priority + specificity model informs our tiebreak rules.
- Linux overlayfs ✓ — direct technical inspiration.

## Open Questions

- `[DECISION NEEDED]` Sub-id schemes for emerging asset kinds (e.g., signed-distance-field text atlases).
- `[DECISION NEEDED]` Whether `patch` supports VCDiff in addition to bsdiff (smaller patches for some kinds).
- `[DECISION NEEDED]` Engine-wide remap policy: should it require signing + reviewed by curator?
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 09]` Confirm sub-resource id schemes for each `.nxa` asset kind.
