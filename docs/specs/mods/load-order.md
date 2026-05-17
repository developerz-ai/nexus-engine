<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Load Order

> Stable topological sort. Default: alphabetical by id. Manifest priority, before/after constraints, then deterministic tiebreak. Same mod set → same order on every machine, every run.

## Boundaries
- Owns: ordering algorithm, conflict-marker generation, cycle detection, overlay priority arithmetic.
- Does NOT own:
  - Dependency resolution → `dependencies.md`
  - Asset overlay merge → `asset-overlay.md`
  - Runtime VM init → `docs/specs/scripting/rune.md`
- Depends on: `manifest.md` `[load-order]`, `dependencies.md` (resolved set).

## Inputs

```
resolved_set: ordered list from resolver
constraints:  per-mod [load-order] { priority, before[], after[] }
```

## Algorithm

```
1. Build DAG:
   - Edge after[a→b] means a depends on b (b before a).
   - Edge before[a→c] means a before c (a → c reversed: c after a → add c→a edge).
   - Required deps from [deps] also generate edges (dep before dependent).
2. Detect cycles. Any cycle → MOD_E_ORDER_CYCLE with cycle path.
3. Kahn's algorithm with priority-then-id ordering for choosing among nodes with no remaining incoming edges:
   - When the frontier has multiple candidates, pick min by (priority asc, id asc).
   - Higher priority loads later (priority 100 sits after priority 0).
4. Emit deterministic load order.
```

Properties:
- Same DAG → same order on every machine (no randomness, no map iteration order).
- Cycles surfaced with full path.
- Priority breaks ties only; never overrides an explicit `before`/`after`.

## Priority Convention

| Range | Use | Example |
|---|---|---|
| -100..0 | Core libraries that other mods build on | `com.nexus.mod-lib` |
| 0 | Default for most mods | most |
| 1..50 | Content mods | new weapons, quests |
| 51..99 | Tweak/balance mods that override content | balance overhaul |
| 100 | Final-pass mods that wrap everything | UI theme |

Engine warns if many mods share the same priority and have no explicit `before`/`after` — they're ordered by id, which the author may not have intended.

## Conflict Markers

Two mods writing to the same component (`world.write` overlap) → engine emits an info-level marker at boot:

```json
{
  "kind": "OverlapWrite",
  "component": "Health",
  "mods": ["com.a.healing-pack", "com.a.balance-overhaul"],
  "order": ["com.a.healing-pack", "com.a.balance-overhaul"],
  "winner_default": "com.a.balance-overhaul",
  "note": "Later mod's writes occur after earlier mod's, in deterministic order."
}
```

Player can resolve in UI (→ `docs/guides/mods/players/conflicts.md`):
1. Reorder via priority override.
2. Disable one.
3. Accept default.

Asset overlay conflicts: separate priority rule → `asset-overlay.md`.

## Mod-A-Overrides-Mod-B Rules

The "later wins" principle:
- For same-component writes in the same frame: later mod's writes occur after earlier mod's. Final value seen by query is the later one.
- For event subscribers: both fire; subscription order matches load order.
- For asset overlays: highest `priority` wins, ties broken by load-order index.
- For genre module extensions: composed in load order; conflicting hooks logged.

This is **deterministic but not magical**. The engine never auto-merges conflicting writes; the last writer wins.

## Cycle Detection

```
mod A: [load-order] after = ["B"]
mod B: [load-order] after = ["A"]
```

Boot fails with:
```json
{
  "code": "MOD_E_ORDER_CYCLE",
  "cycle": ["com.example.a", "com.example.b", "com.example.a"]
}
```

Player resolution: disable one, or edit manifest.

## Lockfile Integration

The lockfile (→ `dependencies.md`) embeds the computed order:

```toml
[order]
# Deterministic, computed at last `nexus mod resolve`. Do not edit.
sequence = [
  "com.nexus.mod-lib",
  "com.example.healing-pack",
  "com.example.balance-overhaul",
]
```

Hot-loading a mod at runtime recomputes the affected suffix; full lockfile rewrite on `nexus mod resolve`.

## CLI

```
nexus mod order                    # print sequence
nexus mod order --explain          # JSON tree of constraints, edges, decisions
nexus mod order --simulate add ID  # what would change?
```

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_ORDER_CYCLE` | Cycle in DAG | Resolve manually |
| `MOD_E_ORDER_UNKNOWN` | `before`/`after` references unknown mod id | Auto-warn if soft-target; error if hard |
| `MOD_E_ORDER_NONDETERMINISTIC` | Detected ordering instability across runs (CI gate) | Bug; report |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Sort 100 mods | < 1 ms | 10 ms |
| Sort 1000 mods | < 10 ms | 50 ms |
| Cycle check | O(V+E), < 1 ms / 100 nodes | 10 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `dependencies.md` — required deps generate ordering edges automatically.
- `asset-overlay.md` — overlay priority resolved per this order's index as tiebreak.
- `docs/specs/scripting/rune.md` — VM init walks the resolved sequence.
- `multiplayer-sync.md` — the load order is part of the cross-peer agreement (different orders = different state).

## Test Requirements

- Same input on Linux/Win/Mac/iOS/Android/web produces identical sequence.
- Cycle correctly detected with full path.
- Priority correctly breaks ties without violating explicit constraints.
- Adding a mod recomputes only the affected suffix; unchanged prefix preserved byte-for-byte in lockfile.

## Prior Art

- LOOT (Skyrim load-order tool) ✓ — community sort heuristics; we replace with explicit per-mod constraints.
- BepInEx `[BepInDependency]` ✓ — before/after model.
- Forge `@Mod.EventBusSubscriber` ordering ✓.
- Cargo `[build-dependencies]` ordering — informs DAG approach.
- Linux init systems (systemd `After=` / `Before=`) ✓ — exact source of our keywords.

## Open Questions

- `[DECISION NEEDED]` Whether to expose a community-curated default ordering layer (analogous to LOOT masterlist) — opt-in, signed.
- `[DECISION NEEDED]` UI for "I want mod X to override mod Y" without editing manifests (one-click reorder).
- `[BENCHMARK NEEDED]` all perf numbers.
- `[AGENT: 14]` Confirm contract for component-write conflict telemetry.
