<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Unreal Engine 5

> The technical state of the art for AAA rendering, ruined as a developer tool by closed source + royalty extraction + C++ macro hell — Nexus borrows the rendering ideas and avoids the business model.

## Snapshot

| | |
|---|---|
| Language | C++ core, Blueprint VM, Verse (Fortnite) |
| License | Custom EULA, source-available, 5% royalty above $1M/yr (per title) [VERIFY current threshold] |
| Status | UE 5.x stable, used in Fortnite/Black Myth: Wukong/etc. |
| Since | UE5 announced 2020, shipped 2022 (UE1: 1998) |
| Repo | https://github.com/EpicGames/UnrealEngine (gated) |

## What Nexus Borrows ✓ (the **ideas**, not the code)

- **Nanite virtualized geometry.** Cluster-based mesh streaming, software rasterizer for sub-pixel triangles, GPU-driven culling. Karis et al. SIGGRAPH 2021. Nexus targets a Nanite-class concept → `docs/specs/assets/lod.md`, `docs/specs/renderer/terrain.md`.
- **Lumen dynamic GI.** Hybrid hardware-RT + screen-space + distance-field surface cache. SIGGRAPH 2022 Wright et al. Nexus GI module → `docs/specs/renderer/gi.md`.
- **Virtual Shadow Maps.** Page-tabled cached shadows that pair with Nanite's stable IDs. Nexus shadow spec → `docs/specs/renderer/shadows.md`.
- **Blueprint visual scripting.** Graph-based, type-safe, performant enough for prototyping, debuggable, integrated with C++ via UFUNCTION/UPROPERTY reflection. Best-in-class visual scripter. Nexus mirrors the *integration* pattern, not the visual format, via Lua/Rune ↔ ECS bindings → `docs/specs/scripting/overview.md`.
- **Reflection system (UObject + UPROPERTY).** Drives serialization, editor inspector, network replication, Blueprint, garbage collection. Single reflection layer powering everything. Nexus needs equivalent via `bevy_reflect`-style derive → `docs/specs/agent/api.md`.
- **Property replication with predicted rollback hints.** UE's network replication graph + RepNotify model. Nexus replication → `docs/specs/networking/replication.md`.
- **MetaSounds.** Audio as a node graph with sample-accurate scheduling. Nexus adaptive audio → `docs/specs/audio/adaptive.md`.
- **World Partition + One File Per Actor.** Streaming large worlds with merge-friendly persistence. Nexus open-world spec → `docs/specs/genres/openworld.md`.
- **Marketplace / Fab.** Existence proof that asset marketplaces drive engine adoption. Nexus needs an OSS-compatible equivalent (Kenney, Poly Haven federation) → `docs/specs/assets/generation.md`.

## What Nexus Avoids ✗

- **Source-available is not open source.** UE's EULA restricts redistribution, requires acceptance, forbids certain use cases. Nexus is MIT, no asterisks → `docs/architecture/00-vision.md`.
- **Royalty extraction.** 5% above $1M/title means every successful indie pays Epic forever. Nexus charges nothing, ever → vision constitution.
- **C++ + macros + reflection codegen.** UHT (Unreal Header Tool) generates code from `UCLASS`/`UPROPERTY` macros. Builds are slow (10+ min from clean), hot reload crashes, IDE tooling lags. Nexus uses Rust derive macros, single-pass compile.
- **Garbage-collected C++.** UObject is GC'd, primitive C++ is not — two memory models in one language. Crashes happen at the boundary. Nexus: one ownership model (Rust borrow checker).
- **Blueprint scalability cliff.** Spaghetti graphs at scale; profiler-blind; merge-hostile (binary asset). Nexus scripting is text-first; visual graphs are a *view*, not the source → `docs/specs/editor/shader.md`.
- **Editor + runtime coupled.** Editor IS the engine but with a different build configuration. PIE (Play In Editor) bugs that don't repro in packaged builds are infamous. Nexus editor is a *client* of a headless engine instance → `docs/specs/editor/overview.md`.
- **Closed Nanite/Lumen.** No spec, no paper covers every detail; community reimplementations (Bevy's `bevy_solari`, others) reverse-engineer. Nexus implementations ship with full specs.
- **iteration friction.** Every "Hot Reload" gamble. Cook times. Shader compilation stalls. Nexus targets <100ms reload from source change → `docs/specs/editor/livereload.md`.

## Architectural Lessons

1. **Rendering tech is the most-copied IP in the industry.** Nanite, Lumen, VSM — published at SIGGRAPH, then re-implemented within 18 months by everyone. Open source is on the winning side of this curve.
2. **A single reflection system that powers serialization + editor + network + scripting + GC is non-negotiable** for a multi-modal engine. Build it once, correctly.
3. **Visual scripting wins users, loses programmers.** Provide both; never make either second-class. Make them *interop* trivially.
4. **C++ + macros + codegen + GC is the worst-case compounding of complexity.** Each is tolerable; together they make the dev loop hostile. Nexus picks one language with one paradigm.
5. **Royalty pricing is a one-time trust transaction.** Once a company chooses to extract, no engineering improvement repairs the relationship. Don't extract.
6. **Editor-as-the-engine has a "PIE bug" tax.** Editor-as-client-of-engine is cleaner, costs IPC but pays for itself in determinism.

## Direct Influence on Nexus

| UE5 idea | Nexus file |
|---|---|
| Nanite cluster geometry | `docs/specs/assets/lod.md`, `docs/specs/renderer/terrain.md` |
| Lumen dynamic GI | `docs/specs/renderer/gi.md` |
| Virtual Shadow Maps | `docs/specs/renderer/shadows.md` |
| Blueprint ↔ C++ reflection bridge | `docs/specs/scripting/overview.md` |
| MetaSounds graph | `docs/specs/audio/adaptive.md` |
| World Partition | `docs/specs/genres/openworld.md` |
| Replication graph | `docs/specs/networking/replication.md` |
| (counter-example) royalty model | `docs/architecture/00-vision.md` |

## References

- Nanite: A Deep Dive (Karis/Stubbe/Wihlidal, SIGGRAPH 2021): https://advances.realtimerendering.com/s2021/Karis_Nanite_SIGGRAPH_Advances_2021_final.pdf
- Lumen (Wright et al., SIGGRAPH 2022): https://advances.realtimerendering.com/s2022/SIGGRAPH2022-Advances-Lumen-Wright%20et%20al.pdf
- Lumen technical docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine
- Nanite for educators (Epic PDF): https://cdn2.unrealengine.com/nanite-for-educators-and-students-2-b01ced77f058.pdf
- Technical review of UE5: https://arxiv.org/html/2507.08142v1
- Blueprint vs C++ programmer critique synthesis: https://www.wholetomato.com/blog/c-versus-blueprints-which-should-i-use-for-unreal-engine-game-development/
