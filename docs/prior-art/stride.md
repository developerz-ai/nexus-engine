<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Stride (formerly Xenko / Paradox)

> The most underrated open-source engine: full C# editor (Game Studio), node-graph PBR materials, MIT-licensed since Silicon Studio's 2018 release — proves a managed-language engine with a real editor is achievable by a small team.

## Snapshot

| | |
|---|---|
| Language | C# / .NET (both engine and user code) |
| License | MIT (since v3.0, 2018, after Silicon Studio relicense) |
| Status | Active, community-maintained (Stride Foundation) |
| Since | 2014 as Paradox → Xenko → Stride (renamed 2020) |
| Repo | https://github.com/stride3d/stride |

## What Nexus Borrows ✓

- **Game Studio: a real, integrated visual editor written *in the engine's user language*.** Proves "editor IS the engine in user code" works for C# the way Godot proved it for GDScript. Nexus editor in Rust + scripting layer → `docs/specs/editor/overview.md`.
- **Layered PBR material editor (node-based).** Designed for artist composition: base + decals + detail + emissive as layers, each with masks. Cleaner mental model than UE's giant material graph. Nexus material spec → `docs/specs/renderer/pbr.md`, `docs/specs/editor/shader.md`.
- **Asset compilation pipeline as DAG.** Every asset is a node with dependencies; rebuild only the dirty subgraph. Fast iteration even with thousands of assets. Nexus asset pipeline → `docs/specs/assets/overview.md`.
- **Cross-platform via .NET.** Single language across desktop, mobile, console targets. Demonstrates managed-code engines can be cross-platform without three render backends. Nexus parallel: single Rust core, wgpu cross-API.
- **MIT license set the trust contract.** Silicon Studio relicensing in 2018 was a model corporate-to-OSS handoff: clear license, foundation handoff, no clawback. Nexus governance models this → `docs/architecture/00-vision.md`.
- **VR-ready from the architecture.** Stride targeted VR as first-class early; OpenXR-friendly. Nexus VR target → `docs/architecture/00-vision.md`.
- **Property-based reflection via C# attributes.** `[DataMember]`, `[DataContract]` drive serialization + editor inspector + asset diffing. Cleaner than Unity's `[SerializeField]` because it leverages standard .NET. Nexus mirrors with Rust derive → `docs/specs/agent/api.md`.
- **Awesome-Stride curated list (community resource).** Pattern Nexus should adopt — curated awesome-list per major area.

## What Nexus Avoids ✗

- **Small community → small ecosystem → adoption gap.** Stride is technically excellent but has perhaps 1% of Unity's user base. Lesson: tech quality is necessary, not sufficient — needs **distribution** (CLI, templates, AI scaffolding, marketplace). Nexus addresses via `nexus-cli` + AI-generated starters → `docs/game-template/cli.md`.
- **C# / Mono / .NET dependency.** Runtime size, GC pauses, IL2CPP-equivalent maturity. Same tradeoff Unity has. Nexus chooses Rust to sidestep.
- **Windows-favored editor.** Game Studio historically Windows-only (WPF-based); cross-platform editor lags. Nexus editor must be cross-platform from v1 (egui / immediate-mode portable) → `docs/specs/editor/overview.md`.
- **Underinvestment in documentation.** Tutorials sparse vs Godot/Unity. Lesson: docs are a feature, budget them per-spec. Nexus: every spec ships with worked example → `docs/guides/ai-dev-onboarding.md`.

## Architectural Lessons

1. **A great editor + niche language ≠ adoption.** Stride has both; few use it. Distribution and onboarding matter as much as features.
2. **Material layers > monolithic graph.** Decompose into base + decals + detail with explicit blend. Easier to author, easier to debug, easier to optimize.
3. **Asset DAG with incremental rebuild is the right model.** Stale-by-content-hash beats stale-by-timestamp; rebuild minimum.
4. **OSS handoff from a corporation can work if the relicense is clean and the foundation has runway.** Silicon Studio + Stride is a positive case study (vs failed handoffs like Source SDK).
5. **VR is cheap to support *if designed in early*, expensive to retrofit.** Build the rendering API stereo-aware from day one.
6. **Reflection should ride existing language primitives.** `[Attribute]` in C#, `derive` in Rust — don't invent a new system.

## Direct Influence on Nexus

| Stride pattern | Nexus file |
|---|---|
| Editor in user language | `docs/specs/editor/overview.md` |
| Layered PBR material editor | `docs/specs/renderer/pbr.md`, `docs/specs/editor/shader.md` |
| Asset DAG incremental build | `docs/specs/assets/overview.md` |
| MIT corporate handoff model | `docs/architecture/00-vision.md` |
| VR-from-start architecture | `docs/architecture/00-vision.md` |
| `[DataMember]` style reflection | `docs/specs/agent/api.md` |
| Awesome-list community pattern | `docs/guides/contribution.md` |
| (counter-example) underinvested docs | `docs/guides/ai-dev-onboarding.md` |

## References

- Repo: https://github.com/stride3d/stride
- Official site: https://www.stride3d.net/
- Wikipedia (Xenko → Stride history): https://en.wikipedia.org/wiki/Stride_(game_engine)
- Hacker News thread (Sept 2023): https://news.ycombinator.com/item?id=37515894
- Hacker News thread (Jan 2023): https://news.ycombinator.com/item?id=34662916
- Awesome-Stride: https://github.com/Doprez/Awesome-Stride
- Stride Foundation Open Collective: https://opencollective.com/stride3d
- Svelto + Stride ECS integration example: https://www.sebaslab.com/svelto-miniexample-7-stride-engine-demo/
- "Open Worlds: Intro to FOSS Game Engines": https://www.stride3d.net/blog/open-worlds-intro-to-foss-game-engines/
