<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Godot

> The best fully-open-source game editor ever shipped, proving an OSS engine can rival commercial UX — held back by a renderer that perpetually plays catch-up.

## Snapshot

| | |
|---|---|
| Language | C++ core, GDScript / C# / GDExtension for users |
| License | MIT |
| Status | Active, 4.x stable |
| Since | 2007 (Juan Linietsky & Ariel Manzur), public 2014 |
| Repo | https://github.com/godotengine/godot |

## What Nexus Borrows ✓

- **Editor IS the engine.** Godot's editor is a Godot game. Eats its own dogfood — UI bugs surface immediately. Nexus editor follows → `docs/specs/editor/overview.md`.
- **Scene = reusable, nestable, instanceable file.** A `.tscn` is both a prefab AND a level. Nexus adopts: scenes are first-class assets, not editor-only data → `docs/specs/editor/scene.md`.
- **Node tree with signals.** Composition + observer pattern, no boilerplate. Nexus exposes signals as typed events → `docs/specs/core/events.md`.
- **GDScript design rationale.** Linietsky designed a language because embedding others fought the engine; ergonomic indent-based, gradually typed, hot-reload friendly. Nexus uses Lua/Rune but takes the lesson: scripting must be **engine-shaped**, not language-shaped → `docs/specs/scripting/overview.md`.
- **Single-binary editor on every desktop.** ~50MB download, no dependencies, no installer. Nexus matches → `docs/game-template/cli.md`.
- **Servers architecture** (`RenderingServer`, `PhysicsServer`). Engine subsystems expose stable RIDs; the scene tree is a *client* of servers. Lets Godot swap rendering backends without breaking gameplay code. Nexus formalizes as contracts → `docs/contracts/`.
- **MIT forever, no corporate owner.** Foundation governance. Nexus models its governance after Godot + Blender.
- **Excellent documentation tooling.** In-editor F1 docs, machine-generated from C++ macros. Nexus does the same but emits JSON schemas for AI agents → `docs/specs/agent/api.md`.

## What Nexus Avoids ✗

- **Renderer always one generation behind.** No Nanite-equivalent, no proper Lumen, mobile renderer is a separate codepath. Per official docs, Godot's 3D rendering has many limitations stemming from focus on broad device support. Nexus targets modern GPU only (wgpu/WebGPU baseline) → `docs/specs/renderer/overview.md`.
- **Three rendering backends fragment effort.** Forward+, Mobile, Compatibility — each with subtly different shader semantics. Nexus: one backend (wgpu) targeting Vulkan/Metal/DX12/WebGPU with capability negotiation, not separate codepaths → `docs/specs/renderer/backend.md`.
- **Nodes-for-everything overhead.** Even pure data wants to be a Node. Per-node tree-traversal allocations hurt at 10k+ entity scales. Nexus uses ECS for sim, scene tree only for editor/spatial hierarchy → `docs/specs/core/ecs.md`.
- **GDScript is interpreted, no JIT.** Fine for prototypes, hits a wall on tight loops. Nexus pushes hot logic to Rust systems; scripts orchestrate → `docs/specs/scripting/lua.md`.
- **C# integration is second-class.** .NET version lag, no iOS export until recently, separate build. Nexus picks two scripting layers (Lua + Rune) and commits.
- **No first-party agent/headless story.** Headless mode exists but is not the canonical operation mode. Nexus inverts.
- **C++ core means slow contribution loop.** PRs require C++ build expertise. Nexus core in Rust + spec-driven means a wider contributor pool.

## Architectural Lessons

1. **Editor parity is the adoption multiplier.** Bevy has better tech, Godot has the editor — Godot has 10× the user base. Editor is not optional.
2. **Servers + RIDs decouple gameplay from backends.** This is the right shape for a multi-backend engine; Nexus contracts formalize it.
3. **Single-binary, zero-install matters more than features.** Godot's download-and-run beats Unity's Hub-and-installer every time for new users.
4. **A custom scripting language costs less than fighting an existing one** — but only if you commit to tooling for it. GDScript debugger and autocomplete required years.
5. **MIT + foundation governance produces a stable trust contract.** No Unity-style pricing surprise can ever happen to Godot. Nexus copies the structure.
6. **Catch-up rendering is a permanent treadmill.** If you can't lead, you'll lag forever. Nexus targets modern GPU only and accepts the exclusion.

## Direct Influence on Nexus

| Godot pattern | Nexus file |
|---|---|
| Editor-is-the-engine | `docs/specs/editor/overview.md` |
| Scene as reusable file | `docs/specs/editor/scene.md` |
| Signals | `docs/specs/core/events.md` |
| Servers + RIDs | `docs/contracts/core-renderer.md`, `docs/contracts/core-physics.md` |
| In-editor docs | `docs/specs/editor/overview.md`, `docs/specs/agent/api.md` |
| Foundation governance | `docs/architecture/00-vision.md` |
| Single binary CLI | `docs/game-template/cli.md` |

## References

- Repo: https://github.com/godotengine/godot
- 3D rendering limitations: https://docs.godotengine.org/en/stable/tutorials/3d/3d_rendering_limitations.html
- Internal rendering architecture: https://docs.godotengine.org/en/stable/engine_details/architecture/internal_rendering_architecture.html
- Design philosophy: https://docs.godotengine.org/en/stable/getting_started/introduction/godot_design_philosophy.html
- Wikipedia (history, Linietsky): https://en.wikipedia.org/wiki/Godot_(game_engine)
- Scene tree internals: https://deepwiki.com/godotengine/godot-docs/6.1-nodes-and-scene-tree
- GDScript origin (Linietsky on Pascal influence): https://docs.godotengine.org/en/stable/getting_started/introduction/godot_design_philosophy.html
