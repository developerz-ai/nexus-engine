<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Dependency Resolution

> Deterministic resolver. Semver. Required, optional, soft deps. Conflict detection. Diamond resolution by max-compatible. Lockfile per save. Same install on every machine.

## Boundaries
- Owns: resolver algorithm, lockfile format, conflict detection, diamond rules, error reporting.
- Does NOT own:
  - Manifest schema → `manifest.md`
  - Load order at runtime → `load-order.md`
  - Marketplace fetch → `docs/guides/mods/marketplaces/**`
- Depends on: `manifest.md` `[deps]` and `[conflicts]`.

## Inputs

```
desired_set: list of (mod_id, version_req)     ← player-enabled top-level mods
catalog:     resolver-visible mod registry      ← local cache + marketplace indices
engine_ver:  semver                             ← compat gate
sdk_range:   semver req                         ← compat gate
```

## Outputs

```
resolved:   list of (mod_id, exact_version, mod_hash)
lockfile:   .nexus/mods.lock                    ← deterministic, committed
report:     structured JSON of decisions, conflicts, warnings
```

## Algorithm

PubGrub-style backtracking resolver (Cargo / pip / Dart pub family). Deterministic.

```
1. Seed assignments from desired_set with version_req constraints.
2. Loop:
   a. Pick an undecided package by (priority desc, id asc).
   b. Choose highest version satisfying all current constraints.
   c. Add the chosen version's deps as new constraints.
   d. If unsatisfiable: derive incompatibility, backtrack to the last branch.
   e. If no branches remain: emit MOD_E_RESOLVE with derivation tree.
3. On success: emit assignment list + lockfile.
```

Properties:
- Deterministic (same inputs → same lockfile, byte-for-byte).
- Optimal (chooses highest versions that satisfy all constraints).
- Explanatory failure (derivation tree shows why it can't resolve).
- Lockfile-respecting (rerun with lockfile = no resolver, just verify).

inspired by: `pubgrub-rs/pubgrub`, Cargo resolver, Dart Pub.

## Dep Kinds (recap from `manifest.md`)

| Kind | Honored in resolver | Engine load |
|---|---|---|
| Required | Yes; resolve must succeed | Hard dep |
| Optional | Best-effort; resolver may skip if unresolvable | Loaded if present |
| Soft | No version check; "use if installed" | Discovered at load |

Soft deps are excluded from the SAT problem; they're discovered at runtime.

## Conflict Detection

A conflict (`[conflicts]` in `manifest.md`) generates a synthetic incompatibility:

```
mod A 1.0 conflicts with mod B *
  ⇔ ¬(A 1.0 ∧ B *)
```

If both are in the desired set → resolver fails with `MOD_E_CONFLICT_DIRECT` and surfaces both to the conflict UI (→ `docs/guides/mods/players/conflicts.md`).

If conflict arises transitively (A pulls B; player enables C which conflicts with B) → `MOD_E_CONFLICT_TRANSITIVE` with derivation.

## Diamond Resolution

```
   A
  / \
 B   C
  \ /
   D@?
```

If B requires `D ^1.0` and C requires `D ^1.2`, resolver picks the highest version in the intersection (`>= 1.2, < 2.0`). If intersection is empty (`B: ^1.0`, `C: ^2.0`) → `MOD_E_DIAMOND_UNRESOLVABLE`.

Player options surfaced by the resolver UI:
1. Disable one branch.
2. Use compat shim if the engine ships one for that mod range.
3. Ask the mod author to widen the version req.

## Lockfile

`.nexus/mods.lock` — TOML, line-stable, committed alongside saves and to repo if mods ship with the game.

```toml
# Auto-generated. Edit with care.
version = 1
engine = "1.4.7"
sdk = "1.4"
resolved_at = "2026-05-17T10:23:00Z"

[[mod]]
id = "com.example.healing-pack"
version = "1.0.0"
mod_hash = "b3:abcd...1234"
source = { kind = "self-hosted", url = "https://example.com/mods/healing-pack-1.0.0.nxmod" }
deps = ["com.nexus.mod-lib"]

[[mod]]
id = "com.nexus.mod-lib"
version = "1.2.4"
mod_hash = "b3:beef...5678"
source = { kind = "mod_io", game_id = 4321, mod_id = 12 }
deps = []
```

Behavior:
- Lockfile present → resolver runs in **verify** mode (no recomputation).
- Lockfile present but a desired_set member missing → recompute only that subgraph.
- Lockfile present with `mod_hash` mismatch → `MOD_E_LOCK_HASH_MISMATCH`; refuses to load (possible tamper).
- `nexus mod resolve --update` recomputes the full lockfile.

Lockfile is per game install, per save profile (→ `docs/guides/mods/players/profiles.md`). Sharing a save bundles the lockfile.

## Catalog Sources

The resolver consults, in order:
1. **Local cache** (`~/.nexus/mods/<id>/<version>/.nxmod`).
2. **Pinned marketplace indices** (lockfile `source` if present).
3. **Configured marketplaces** in `Nexus.toml::[mods.marketplaces]`.

Each source returns a per-package version list with mod-hashes; resolver compares hashes for known versions; mismatch = `MOD_E_CATALOG_HASH_MISMATCH`.

## Soft-Dep Handling at Runtime

After resolver finishes, engine boots mods in load-order (→ `load-order.md`). For each mod:
- Walk soft deps; if `target_id` is resolved, expose its `Capabilities` namespace.
- Mod can `nexus.mod.soft_dep("com.x.lib").is_present()` to branch.

Determinism: soft-dep presence is part of the input set; same mod-set → same behavior.

## CLI

```
nexus mod resolve                  # solve + write lockfile (refuses if .lock dirty)
nexus mod resolve --update         # ignore lockfile, recompute
nexus mod resolve --explain X      # show derivation tree for mod X
nexus mod resolve --dry-run        # JSON to stdout, no file change
nexus mod install <id>@<ver>       # add to desired_set + resolve
nexus mod remove  <id>             # drop + resolve
nexus mod outdated                 # report newer compatible versions
```

All commands JSON-emit with `--json`. → `docs/guides/mods/authoring/packaging.md`.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `MOD_E_RESOLVE` | No assignment satisfies constraints | Inspect derivation; widen req or remove a mod |
| `MOD_E_CONFLICT_DIRECT` | Two enabled mods directly conflict | Player picks one (UI) |
| `MOD_E_CONFLICT_TRANSITIVE` | Conflict via transitive dep chain | UI walks derivation, suggests change |
| `MOD_E_DIAMOND_UNRESOLVABLE` | Diamond with empty version intersection | Disable a branch / compat shim / widen req |
| `MOD_E_DEP_MISSING` | Required dep not in any catalog | Add catalog or install manually |
| `MOD_E_DEP_VERSION` | Required dep present but no version matches | Widen req or update dep |
| `MOD_E_LOCK_HASH_MISMATCH` | Lockfile `mod_hash` ≠ installed `.nxmod` | Re-install or `--update` |
| `MOD_E_CATALOG_HASH_MISMATCH` | Catalogs disagree on `mod_hash` for same `id@ver` | Pin source; investigate |
| `MOD_E_SDK_INCOMPAT` | Resolved mod targets SDK outside engine range | Find compat version or update engine |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Resolve 100 mods, all in cache | < 50 ms | 200 ms |
| Resolve 1000 mods, all in cache | < 1 s | 5 s |
| Verify lockfile (no recompute) | < 20 ms | 100 ms |
| Catalog fetch per marketplace (cached) | < 100 ms | 1 s |

`[BENCHMARK NEEDED]`.

## Integration Points

- `manifest.md` — `[deps]` and `[conflicts]` source-of-truth.
- `load-order.md` — consumes resolved set, applies after/before/priority.
- `multiplayer-sync.md` — lockfile is part of the cross-peer agreement payload.
- `save-compatibility.md` — saves embed lockfile reference.
- `docs/guides/mods/marketplaces/**` — each marketplace exposes a catalog adapter.

## Test Requirements

- 1k random valid mod graphs resolve identically across 100 runs.
- Diamond with empty intersection produces `MOD_E_DIAMOND_UNRESOLVABLE` with full derivation.
- Hash-mismatch attack (swap a `.nxmod` after lockfile) detected with `MOD_E_LOCK_HASH_MISMATCH`.
- Adding a mod and removing the same mod produces lockfile identical to original.
- Catalog disagreement test: two marketplaces with same id@ver, different hashes → fails fast.

## Prior Art

- `pubgrub-rs/pubgrub` ✓ — algorithm of choice; deterministic, explanatory.
- Cargo resolver ✓ — `Cargo.lock` ergonomic model.
- Thunderstore manifest deps ✓ — flat, simple; we extend with semver.
- Forge / Fabric (Minecraft) ✓ — mod loader with mandatory + optional deps.
- Skyrim load-order tools (LOOT) ✓ — informs `load-order.md`, separate spec.

## Open Questions

- `[DECISION NEEDED]` SAT solver backend (custom PubGrub port vs `pubgrub-rs` direct dep).
- `[DECISION NEEDED]` Cross-game shared library namespace (mods that work across multiple Nexus games).
- `[DECISION NEEDED]` Auto-suggest version bumps for mod authors when their dep req is too strict.
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 25]` Confirm `nexus mod resolve` CLI shape with scripts overall convention.
