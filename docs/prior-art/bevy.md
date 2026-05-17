<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Bevy

> Rust-native, refreshingly modular ECS-first engine — proves a community-driven OSS engine can iterate faster than commercial ones, and shows where pure-Rust friction bites.

## Snapshot

| | |
|---|---|
| Language | Rust |
| License | MIT / Apache-2.0 |
| Status | Active, pre-1.0 (0.16 series as of 2026) |
| Since | 2020 (Carter "cart" Anderson) |
| Repo | https://github.com/bevyengine/bevy |

## What Nexus Borrows ✓

- **ECS as the spine, not a feature.** Every Bevy subsystem (render, UI, audio) is just systems over components. Same in Nexus → `docs/specs/core/ecs.md`.
- **Plugin trait as the composition unit.** A `Plugin` is the only way to mutate `App`. Nexus genre/style modules adopt the same single-entry-point shape → `docs/specs/genres/*.md`.
- **Hybrid archetype + sparse-set storage.** Table storage for hot iteration, sparse-set for high-churn components. Bevy fixed the "one sparse component poisons iteration" bug in 0.15 — Nexus codifies the policy up front. [VERIFY: bevy PR for the 0.15 sparse iteration fix]
- **Required Components (0.15).** Inserting `Mesh` auto-inserts `Transform`, `Visibility`, etc. Eliminates the "forgot a component, silent bug" class. Mirror in Nexus component bundles.
- **Stageless scheduler (0.10+).** Replaces hard-coded `CoreStage::*` with `SystemSet` + `before`/`after`/`chain`. Nexus inherits this; cf. → `docs/specs/core/jobs.md`.
- **Change detection (`Changed<T>`, `Added<T>`).** Zero-cost generational ticks. Nexus extends to network delta replication → `docs/specs/networking/replication.md`.
- **`bevy_reflect` runtime type info.** Drives serialization, scripting bridges, editor inspector. Nexus needs the same for the agent API → `docs/specs/agent/api.md`.
- **WGSL-everywhere, wgpu backend.** Validates the bet Nexus also makes → `docs/specs/renderer/backend.md`.
- **Public roadmap + RFCs in the open.** Cart's discussions (#1375, #2259, #867) are the actual design log — model for Nexus ADRs.

## What Nexus Avoids ✗

- **No editor at v1.** Bevy spent 5+ years without an official editor; community filled the void inconsistently (`bevy_inspector_egui`, `space_editor`). Nexus ships editor in v1.0 → `docs/specs/editor/overview.md`.
- **Breaking changes every minor.** 0.14 → 0.15 migration guide is hundreds of lines. Tolerable pre-1.0 but burns ecosystem trust. Nexus commits to semver from v1.0; deprecate-then-remove minimum 2 minors.
- **Schedule ambiguities are user-facing.** Plugin authors must manually order systems against unknown other plugins, and tooling can't detect stale orderings (#2747). Nexus contract: every system declares read/write component sets; scheduler proves DAG correctness or refuses to run.
- **No headless-first story.** Bevy can run headless, but it's an opt-out via feature flags, not the default mode. Nexus inverts: headless is canonical → `docs/specs/agent/headless.md`.
- **`Commands` queue invisibility.** Deferred mutations are easy to write but invisible in profilers and ordering. Nexus exposes command-buffer flushes as explicit sync points.
- **Slow incremental builds.** Heavy generic monomorphization. Nexus splits crates aggressively + uses `#[inline]` budget audits → `docs/architecture/04-workspace-layout.md`.
- **Asset v2 churn.** Three asset systems in five years. Nexus designs once against the requirements doc → `docs/specs/assets/overview.md`.

## Architectural Lessons

1. **ECS is the contract, not the implementation.** When every system shares one data model, plugins compose. When they don't (Unity GameObjects + DOTS coexisting), they fight.
2. **Schedules must be provable, not described.** "Add this system to `Update` before `physics`" is a comment, not a constraint. Make the scheduler reject ambiguity.
3. **Plugins are the unit of distribution AND the unit of breakage.** Force versioning at the plugin boundary, not the crate boundary.
4. **Public RFCs > private design docs.** Bevy's discussion-driven design produces better architecture than closed-door engines. Nexus enshrines this.
5. **Refactor budget is real.** Bevy's freedom to keep redesigning is a feature now and a liability at v1.0. Lock contracts early, refactor internals freely.
6. **Type-system ergonomics matter more than perf in OSS engines.** Bevy's adoption tracks API ergonomics improvements (system params, derive macros) more than perf wins.

## Direct Influence on Nexus

| Bevy pattern | Nexus file |
|---|---|
| `Plugin` trait | `docs/specs/core/ecs.md` (Module trait) |
| Stageless scheduler | `docs/specs/core/jobs.md` |
| Required Components | `docs/specs/core/ecs.md` (Bundles) |
| `bevy_reflect` | `docs/specs/agent/api.md` (introspection) |
| WGSL + wgpu | `docs/specs/renderer/backend.md` |
| Change detection | `docs/specs/networking/replication.md` |
| RFC-driven design | `docs/architecture/05-adr/` |

## References

- Repo: https://github.com/bevyengine/bevy
- Stageless scheduler discussion: https://github.com/bevyengine/bevy/discussions/1375
- Scheduler ergonomics critique: https://github.com/bevyengine/bevy/discussions/2747
- Dataflow scheduling RFC: https://github.com/bevyengine/bevy/discussions/2259
- 0.15 release notes: https://bevy.org/news/bevy-0-15/
- 0.14 → 0.15 migration: https://bevy.org/learn/migration-guides/0-14-to-0-15/
- Archetypes/storage internals: https://deepwiki.com/bevyengine/bevy/2.7-archetypes-and-storage
- Bevy ECS quickstart: https://bevy.org/learn/quick-start/getting-started/ecs/
