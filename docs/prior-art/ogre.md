<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# OGRE / OGRE-Next

> 25+ years of rendering wisdom in OSS form — every modern engine borrows something from it; every modern engine also avoids its C++ baroque.

## Snapshot

| | |
|---|---|
| Language | C++ |
| License | MIT (since 1.7, ~2010) |
| Status | OGRE 1.x maintenance; OGRE-Next (2.x/3.x) active |
| Since | 2001 (Steve Streeting) |
| Repo | https://github.com/OGRECave/ogre · https://github.com/OGRECave/ogre-next |

## What Nexus Borrows ✓

- **Materials as data, not code.** OGRE `.material` scripts predate GLSL becoming universal; the idea of a declarative material file with techniques/passes/LODs is now ubiquitous. Nexus material format adopts → `docs/specs/renderer/pbr.md`, `docs/specs/styles/overview.md`.
- **HLMS (High Level Material System).** Template + permutation system: hand-written shader templates, runtime-stripped of unused features (no skeletal data → no skinning code), hashed for cache, batch-compiled on worker threads. Nexus shader permutation strategy → `docs/specs/renderer/shaders.md`.
- **Compositor framework.** Declarative post-processing graph (bloom → SSAO → TAA → tonemap) as composable nodes. Direct ancestor of modern render graphs (Filament, Bevy). Nexus render graph → `docs/specs/renderer/overview.md`, `docs/specs/renderer/post.md`.
- **Scene manager abstraction.** Pluggable spatial structure (octree, BSP, terrain). Nexus uses ECS + queries but borrows the plugin shape → `docs/specs/core/ecs.md`.
- **Plugin loading as the extension model.** Render system, scene manager, codec — all hot-loaded DLLs. Nexus replaces with cargo features + dynamic mod loading → `docs/specs/scripting/sandbox.md`.
- **Multithreaded shader compilation done right.** OGRE-Next batches PSO creation requests, returns a valid (not-yet-ready) handle, processes more renderables while workers compile. No stalls on first-frame hitches. Nexus mirrors → `docs/specs/renderer/shaders.md`.
- **LOD as a first-class material concept.** Material LOD, mesh LOD, both declarative. Nexus inherits but extends with Nanite-style virtual geometry → `docs/specs/assets/lod.md`.

## What Nexus Avoids ✗

- **C++ OOP maximalism.** Deep virtual hierarchies (`Renderable` → `MovableObject` → `Node` → ...). Every system has a `Manager`. CppDepend's case study counts thousands of classes. Nexus prefers data + free functions; inheritance only for trait objects with one indirection.
- **`Ogre::String`, `Ogre::vector<>`, ...** Custom containers fighting STL for two decades. Nexus uses `std` + `glam` + `bevy_ecs` types; no NIH containers.
- **Singleton everywhere.** `Root::getSingleton()`, `MaterialManager::getSingleton()`, ... Hostile to testing, headless, multi-instance. Nexus: every system is a value passed through ECS resources.
- **No editor in 25 years.** Many community attempts (OgreMax, ogitor) all dead. Nexus editor is mandatory v1 → `docs/specs/editor/overview.md`.
- **OGRE 1 vs OGRE-Next fork.** Backward-compat hell forced a parallel codebase. Nexus avoids by versioning contracts, refactoring internals → `docs/architecture/01-principles.md`.
- **String-based everything.** Materials, resources, parameters all looked up by string. Slow, typo-prone, no compile-time safety. Nexus uses typed handles with debug names → `docs/specs/assets/registry.md`.
- **Render system abstractions leak GL-isms.** Designed pre-Vulkan; concepts like immediate state-setting don't map cleanly to modern explicit APIs. Nexus designs around explicit/PSO-first APIs from day one.

## Architectural Lessons

1. **Materials must be declarative data.** Code-in-engine for shaders died with OGRE generation; never go back.
2. **Permutation explosion is unavoidable — manage it as a hash cache, not a build-time matrix.** HLMS proved this.
3. **Compositor / render graph is the right abstraction for post-FX.** Don't hard-code the pipeline; let users compose passes.
4. **C++ inheritance trees are write-once, refactor-never.** They calcify. Use composition; pay the indirection.
5. **Singletons are seductive and corrosive.** Every singleton is a future headless-mode bug, a future test-isolation bug, a future multi-window bug.
6. **Multithreaded shader compile must be async-by-default**, with valid-but-pending handles. Synchronous compile = first-frame stutters forever.
7. **No editor → no users.** Tech excellence does not substitute for tooling.

## Direct Influence on Nexus

| OGRE pattern | Nexus file |
|---|---|
| Declarative material files | `docs/specs/renderer/pbr.md` |
| HLMS template + permutation hash | `docs/specs/renderer/shaders.md` |
| Compositor framework | `docs/specs/renderer/post.md`, `docs/specs/renderer/overview.md` |
| Async PSO compile | `docs/specs/renderer/shaders.md` |
| Material LOD | `docs/specs/assets/lod.md` |
| Plugin loading | `docs/specs/scripting/sandbox.md` |
| Scene manager abstraction | `docs/specs/core/ecs.md` |

## References

- OGRE main repo: https://github.com/OGRECave/ogre
- OGRE-Next: https://github.com/OGRECave/ogre-next
- HLMS documentation: https://ogrecave.github.io/ogre-next/api/2.3/hlms.html
- Multithreaded shader compilation: https://ogrecave.github.io/ogre-next/api/latest/_hlms_threading.html
- Wikipedia (history): https://en.wikipedia.org/wiki/OGRE
- Compositor framework deep-dive: https://deepwiki.com/OGRECave/ogre-next/5-compositor-framework
- OGRE OOP case study: https://cppdepend.com/blog/ogre-engine-case-study-on-oop-principles/
- "Pro OGRE 3D Programming" (Junker, Apress 2006) [VERIFY publisher]
