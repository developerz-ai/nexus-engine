<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0003 — Entity Component System (ECS) as the Core Architecture Pattern

## Status

`Accepted`

Date: 2026-01-15
Authors: nexus-architecture-agent-01
Reviewers: integration team

## Context

The engine needs an architecture that:
- Scales to massive entity counts (MMORPG zones, RTS unit swarms, MOBA replication).
- Is parallel-friendly on every CPU we target (4–96 cores).
- Is **introspectable** by AI agents — every entity, every component, every system visible and queryable (Law 1, Law 11).
- Is **serializable** end-to-end (Law 9).
- Has explicit data dependencies so a scheduler can prove parallelism safety.
- Is teachable in one page to a new contributor (human or AI).

Forces:
- Vision targets games of Dota 2 / WoW / Black Myth complexity.
- Law 1 + 11: every game state observable as structured data.
- Law 5: performance contracts. Cache-friendly memory layout is the difference between 60 FPS and 144 FPS.
- Law 9: deterministic system ordering required.
- Prior art: `bevyengine/bevy`, `SanderMertens/flecs`, `skypjack/entt`.

OO inheritance and "GameObject + components" patterns (Unity-style scene tree) suffer from:
- Pointer-chasing scattered allocations → poor cache behavior.
- Implicit method overrides → hard for AI to reason about.
- Hierarchy fragility → refactors cascade.
- Hard to parallelize without locks.

## Decision

Nexus uses an **Entity Component System** as its core data architecture.

- Hybrid storage: **archetype-based** for hot iteration paths (most components), **sparse-set** for sparse/rare components and tags. Inspired by Bevy's archetype model and flecs's storage variants.
- **Systems** declare their data access (read/write component sets, resource access) via Rust types. A static scheduler builds a parallel task graph at startup (`docs/specs/core/jobs.md`).
- **Queries** are typed: `Query<(&Transform, &mut Velocity), With<Player>>`.
- **Change detection** is built in: components track per-tick mutation; systems can opt to iterate only changed entities.
- **Events** are a separate typed bus (`docs/specs/core/events.md`); not arbitrary entity messaging.
- **Resources** (singletons) live alongside the world but outside the entity table.
- **Determinism** (Law 9): system execution order is deterministic given the schedule; intra-system parallelism is constrained to commutative operations or explicit synchronization barriers.
- **Hierarchies** (scene-graph "parent/child") are modeled as relationship components (`Parent`, `Children`), not a separate tree structure — inspired by flecs relationships.

ECS is the **non-negotiable foundation**. Genre modules, style modules, scripting, networking, and rendering all consume the ECS as their world model. → `docs/specs/core/ecs.md`.

## Consequences

### Positive

- **Data-oriented design.** Cache-coherent iteration on hot components. Scales to hundreds of thousands of entities per frame on commodity hardware.
- **Parallel by construction.** Scheduler proves safety via declared access sets; no manual locking in user code.
- **Introspectable.** Every component, every entity, every system has a name, schema, and content. `nexus-agent` exposes them directly. → `docs/specs/agent/api.md`.
- **Serializable.** Every component derives `Serialize + Deserialize`; world snapshot is a structured dump.
- **Composition over inheritance.** Adding "is now flammable" to any entity is `world.insert(entity, Flammable)`; no class hierarchy to refactor.
- **Hot reload friendly.** Replace systems and component schemas at runtime without rebuilding the world.
- **Network-replication friendly.** Per-component replication granularity matches the storage model. → `docs/specs/networking/replication.md`.

### Negative / costs

- **Mental model shift** for OO-trained contributors. Mitigated by onboarding doc, examples, and the fact that LLMs handle ECS idiomatically when prompted.
- **Initial scheduler complexity.** Writing the parallel scheduler with change-detection is non-trivial. Bevy + flecs have proven the design space; we adapt, we don't invent.
- **Some operations less natural** (e.g., "walk up the scene-graph parents") cost an extra query hop. Mitigated by indices.
- **Tooling discoverability** — finding "what touches Component X" requires query analysis. The editor's "system graph" view (→ `docs/specs/editor/debug.md`) addresses this.

### Neutral

- Hybrid archetype + sparse-set storage adds complexity vs picking one. The win is hot-path perf without paying for rare-tag overhead. flecs proves the model.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Unity-style GameObject + components** (OO tree) | familiar to many devs; rich tooling | poor cache behavior, hard to parallelize, hard for AI to introspect statically, hierarchy fragility | violates Laws 1, 5, 9 in practice |
| **Pure archetype ECS** (Bevy original) | maximum cache locality on hot queries | archetype thrash when components added/removed; sparse component cost high | hybrid (this ADR) wins |
| **Pure sparse-set ECS** (EnTT-style) | flexible; cheap component add/remove | weaker iteration locality than archetypes | hybrid wins |
| **Actor model** (Akka, Erlang-style) | great for distributed systems | message-passing overhead in tight loops; harder determinism guarantees | wrong fit for in-process real-time |
| **Functional / immutable world** | trivial replay & undo | allocation pressure; GC if not careful; cache cost | perf cost too high in Rust without arena tricks not yet proven |
| **DOTS-style separate world for everything** (Unity ECS / Unity DOTS) | mature lessons | Unity-specific patterns; complexity tax | we pick our own, learning from DOTS not copying |

Revisit conditions: only a major data-orientation breakthrough or hardware shift (e.g., dataflow accelerators going mainstream for game logic) would re-open this.

## Cross-references

- Constitution: `docs/architecture/00-vision.md`
- Laws: 1, 3, 5, 9, 11
- Core spec: `docs/specs/core/ecs.md`
- Scheduler spec: `docs/specs/core/jobs.md`
- Events spec: `docs/specs/core/events.md`
- Agent introspection: `docs/specs/agent/api.md`
- Prior art (to be filled by AGENT 13):
  - `docs/prior-art/bevy.md`
  - `docs/prior-art/flecs.md`
- External references:
  - Bevy ECS: https://github.com/bevyengine/bevy/tree/main/crates/bevy_ecs
  - flecs: https://github.com/SanderMertens/flecs
  - EnTT: https://github.com/skypjack/entt
  - Mike Acton, "Data-Oriented Design and C++", CppCon 2014: https://www.youtube.com/watch?v=rX0ItVEVjHc
