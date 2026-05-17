<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Unity

> Defined the modern indie engine UX, then taught the entire industry — in one September weekend of 2023 — why you must never trust a proprietary engine with your business.

## Snapshot

| | |
|---|---|
| Language | C++ core, C# (Mono/IL2CPP) for users |
| License | Proprietary, seat-based subscription (post-2024 walk-back) |
| Status | Unity 6, Runtime Fee cancelled Sept 2024 |
| Since | 2005 |
| Repo | Closed (reference source program only) |

## What Nexus Borrows ✓

- **The Inspector.** Drop a component on a GameObject, see every public field as an editable widget, with type-aware editors (color picker for `Color`, slider for `Range`, dropdown for enums). The reason indies picked Unity over Unreal for a decade. Nexus inspector requirement → `docs/specs/editor/scene.md`.
- **`[SerializeField]` reflection pattern.** Author scripts in code, expose to editor by annotation. Nexus uses Rust derive macros to the same effect → `docs/specs/agent/api.md`.
- **PlayMode in editor.** Press play, mutate scene live, stop and discard. Iteration loop measured in seconds. Nexus live-edit → `docs/specs/editor/livereload.md`.
- **Asset Store / Marketplace.** Existence proof that a curated marketplace creates a flywheel: more assets → more devs → more assets. Nexus needs the OSS equivalent → `docs/specs/assets/generation.md`.
- **Cross-platform build matrix.** "Click to switch from Windows to Switch." The aspiration even when the reality leaks. Nexus targets the same matrix from day one → `docs/architecture/00-vision.md`.
- **AssetBundles / Addressables.** Async asset streaming with priority + memory budgeting. Nexus asset spec borrows the model → `docs/specs/assets/streaming.md`.
- **ScriptableObject pattern.** Pure-data assets that are not GameObjects. Lets designers author config without scenes. Nexus equivalent: typed data assets in registry → `docs/specs/assets/registry.md`.
- **Burst + Job System + DOTS.** When Unity finally took ECS+SIMD seriously (2018+), it produced a credible high-perf path. Validated the bet Bevy/Nexus also make.

## What Nexus Avoids ✗

- **The Runtime Fee disaster (Sept 12, 2023).** Per-install fee with retroactive applicability, threatened to invoice studios for pirated installs. Forced a CEO exit, full retraction Sept 2024 — but indie trust is permanently damaged. Nexus charter: **license never changes**, in writing, MIT forever → `docs/architecture/00-vision.md`.
- **GameObject + Component is not ECS.** OOP composition with `transform.GetComponent<T>()` lookups everywhere. Hot loops are cache-hostile. DOTS arrived ~10 years late and coexists awkwardly with the old model. Nexus is ECS from day one → `docs/specs/core/ecs.md`.
- **Two coexisting paradigms (GameObject + ECS).** "Hybrid" entities, conversion workflow, two sets of physics packages, two sets of rendering packages. Decision fatigue, integration bugs. Nexus picks one model and commits.
- **Mono GC pauses.** C# garbage collector causes frame hitches in tight gameplay. Workarounds (object pooling, structs, Burst) are user-facing burden. Nexus uses Rust ownership; no GC, no pause budget.
- **Closed source on the core.** When Mono's GC misbehaves, when IL2CPP miscompiles, when the renderer leaks — you wait for Unity Engineering. Nexus is fully open; ship a patch yourself.
- **Three render pipelines (Built-in / URP / HDRP) with incompatible shaders.** Asset Store fragmentation, tutorial confusion, migration tax forever. Nexus: one renderer, capability-gated features → `docs/specs/renderer/overview.md`.
- **Editor instability.** Crashes on .meta corruption, hangs on script recompile, freezes on package import. PIE-vs-build mismatches. Nexus editor is a separate process talking to a deterministic engine instance.
- **Per-seat pricing on collaborators.** Each artist needs a Unity Pro seat to open the project. Nexus is free for every contributor forever.

## Architectural Lessons

1. **UX, not tech, drives engine adoption among non-engineers.** Unity won designers and artists with the Inspector. Out-tech them all you want; you lose without UX.
2. **A trust contract is one-way.** Once broken (Runtime Fee), no amount of walkbacks restores the original trust. Engineer the *inability* to break trust into the license, not just the policy.
3. **Late ECS retrofit is a permanent tax.** Unity will carry GameObject baggage forever now. Greenfield engines must commit to a data model before v1.
4. **GC in a hot path is technical debt with compounding interest.** Pick a memory model and live with its constraints.
5. **One render pipeline.** Two is two ecosystems. Three is no ecosystem.
6. **Marketplace > package manager** for non-programmer adoption. Build the marketplace; build it OSS-friendly so contributors aren't extracting rent.
7. **Asset import determinism matters more than features.** Unity's per-platform asset reimports, .meta file conflicts, library/ corruption — they cost more dev-hours than any feature gain. Nexus: deterministic, content-addressed asset pipeline → `docs/specs/assets/overview.md`.

## Direct Influence on Nexus

| Unity pattern | Nexus file |
|---|---|
| Inspector w/ `[SerializeField]` | `docs/specs/editor/scene.md` |
| PlayMode iteration | `docs/specs/editor/livereload.md` |
| Asset Store flywheel | `docs/specs/assets/generation.md` |
| ScriptableObject | `docs/specs/assets/registry.md` |
| Addressables streaming | `docs/specs/assets/streaming.md` |
| Burst + DOTS (validation) | `docs/specs/core/ecs.md`, `docs/specs/core/jobs.md` |
| (counter-example) Runtime Fee | `docs/architecture/00-vision.md`, `docs/architecture/01-principles.md` |
| (counter-example) GC pauses | `docs/architecture/03-tech-stack.md` (Rust rationale) |

## References

- Unity Runtime Fee aftermath (StraySpark, 2026): https://www.strayspark.studio/blog/unity-engine-2026-state-comeback-runtime-fee-aftermath
- Runtime Fee cancellation (Slashdot): https://tech.slashdot.org/story/24/09/12/1615225/unity-is-killing-its-controversial-runtime-fee
- Original HN thread (Sept 2023): https://news.ycombinator.com/item?id=37493028
- DOTS development status (Unity forums): https://forum.unity.com/threads/dots-development-status-and-next-milestones-march-2022.1253355/
- Unity pricing controversy retrospective: https://www.bairesdev.com/blog/unity-pricing-controversy/
- Unity Inspector docs: https://docs.unity3d.com/Manual/InspectorOptions.html
