<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Flecs

> The most theoretically complete ECS in production — first to ship full entity relationships, proves an ECS can model hierarchies, prefabs, and arbitrary graphs without leaving the data model.

## Snapshot

| | |
|---|---|
| Language | C (core), C++ API |
| License | MIT |
| Status | Active, v4.x (4.1+ as of 2026) |
| Since | 2017 (Sander Mertens) |
| Repo | https://github.com/SanderMertens/flecs |

## What Nexus Borrows ✓

- **Entity relationships as first-class.** A `(Likes, Bob)` pair is just a component-shaped thing on an entity. Hierarchies (`ChildOf`), inventories (`Holding`), factions (`AllyOf`) all reduce to the same primitive. Nexus ECS spec → `docs/specs/core/ecs.md`.
- **Hierarchies without a separate tree.** `ChildOf` relationship + query traversal modes (`up`, `cascade`, `descend`) replace dedicated scene-tree code. Nexus uses ECS as the spatial+logical hierarchy → `docs/specs/core/ecs.md`, `docs/specs/editor/scene.md`.
- **Two hierarchy storage modes.** `ChildOf` (fragmenting, deep traversal cheap) vs `Parent` (non-fragmenting, queries unaffected). Flecs 4.x measured >10× speedups switching prefab-heavy hierarchies to `Parent`. Nexus must expose both, default to non-fragmenting → `docs/specs/core/ecs.md`.
- **Query DSL with traversal operators.** `Position, ChildOf($parent), Health($parent)` — query the parent's health while iterating children. Nexus query API mirrors → `docs/specs/core/ecs.md`.
- **Cached vs uncached queries.** Cached: O(1) iteration, mutation rebuilds cache. Uncached: O(archetypes), no rebuild cost. Pick per-system. Nexus exposes both → `docs/specs/core/ecs.md`.
- **Reflection from ECS itself.** Components are entities; their metadata is queryable. Single mechanism for introspection, serialization, editor. Nexus designs reflection as ECS-native → `docs/specs/agent/api.md`.
- **Prefabs as entities with the `Prefab` tag.** Instantiation is `IsA(prefab)` relationship. No separate prefab subsystem. Nexus uses the same → `docs/specs/editor/scene.md`.
- **Modules as namespaces + system bundles.** Maps cleanly to Nexus plugin/module concept → `docs/specs/genres/*.md`.
- **Excellent ECS-FAQ as design documentation.** Sander Mertens has set the bar for ECS pedagogy; Nexus copies the doc shape.

## What Nexus Avoids ✗

- **C-first API surface.** Macros (`ECS_COMPONENT`, `ECS_SYSTEM`) carry historical baggage; type erasure means every read goes through a void* cast. Nexus is Rust-first; types are honest → `docs/specs/core/ecs.md`.
- **Fragmentation footgun.** Many small prefab subtrees with `ChildOf` create 1-entity tables → 1000-table iteration is 10× slower than 1-table. The fix (`Parent`) exists but users must know. Nexus picks the safe default; documents the override.
- **Query rematching cost** (largely fixed in 4.1): adding/removing entities used to trigger query rebuilds → lag spikes. Nexus contract: query matching must be amortized O(1) on entity churn.
- **No first-party renderer/editor/physics.** Flecs is a library, not an engine. Nexus is the engine; this section is just about borrowing the ECS ideas.

## Architectural Lessons

1. **Relationships generalize hierarchies, prefabs, inventories, and graphs into one mechanism.** Build it once, well, and stop writing hierarchy code per-subsystem.
2. **Storage layout matters more than algorithm choice** at ECS scale. A 10× speedup from `ChildOf` → `Parent` is a layout change, not a code change.
3. **Cached vs uncached queries should be a per-query choice**, not a global engine policy.
4. **Reflection should live in the ECS, not next to it.** If components-are-entities, then component metadata is just more components.
5. **Document the data model better than the API.** Flecs's relationships docs taught the entire ECS community how to think about pairs.
6. **A C core wins portability but loses ergonomics.** Nexus inverts: Rust core, C ABI for bindings.

## Direct Influence on Nexus

| Flecs concept | Nexus file |
|---|---|
| Pair-based relationships | `docs/specs/core/ecs.md` |
| Hierarchy via `ChildOf` / `Parent` | `docs/specs/core/ecs.md`, `docs/specs/editor/scene.md` |
| Query traversal (`up`/`cascade`/`descend`) | `docs/specs/core/ecs.md` |
| Cached vs uncached queries | `docs/specs/core/ecs.md` |
| Components-are-entities reflection | `docs/specs/agent/api.md` |
| Prefab via `IsA` | `docs/specs/editor/scene.md` |
| Modules as system bundles | (parallels Bevy plugin) `docs/specs/core/ecs.md` |

## References

- Repo: https://github.com/SanderMertens/flecs
- Relationships manual: https://www.flecs.dev/flecs/md_docs_2Relationships.html
- Hierarchies manual: https://www.flecs.dev/flecs/md_docs_2HierarchiesManual.html
- Queries: https://github.com/SanderMertens/flecs/blob/master/docs/Queries.md
- Designing with Flecs: https://www.flecs.dev/flecs/md_docs_2DesignWithFlecs.html
- ECS FAQ: http://www.flecs.dev/ecs-faq/
- Flecs 4.0 release notes: https://ajmmertens.medium.com/flecs-v4-0-is-out-58e99e331888
- Flecs 4.1 release notes: https://ajmmertens.medium.com/flecs-4-1-is-out-fab4f32e36f6
