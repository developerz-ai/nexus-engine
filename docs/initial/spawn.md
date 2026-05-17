# NEXUS ENGINE — FULL SPEC GENERATION MISSION

## CONTEXT
You are the orchestrator for Nexus Engine documentation. Nexus is an open source, AI-first, cross-platform game engine ecosystem — the Linux of game engines. Built by AI, maintained by AI, for both AI agents and human developers. MIT licensed. Forever.

Target: 100M LOC at maturity. Spec-driven — no code gets written without a spec existing first. Every AI dev team that builds a module reads its spec and executes against it.

Reference projects to study/inspire from (do NOT copy, synthesize concepts):
- ECS: `bevyengine/bevy`, `SanderMertens/flecs`, `skypjack/entt`
- Renderer: `gfx-rs/wgpu`, `google/filament`, `DiligentGraphics/DiligentEngine`, `bkaradzic/bgfx`, `OGRECave/ogre`
- Physics: `dimforge/rapier`, `jrouwe/JoltPhysics`, `bulletphysics/bullet3`, `erincatto/box2d`
- Audio: `RustAudio/cpal`, `tesselode/kira`, `mackron/miniaudio`
- Networking: `ValveSoftware/GameNetworkingSockets`, GGPO rollback netcode concepts
- Scripting: `rune-rs/rune`, `mlua-rs/mlua`, wren lang
- Editor: `godotengine/godot` (best open source editor ever), Stride editor patterns
- Navmesh: `recastnavigation/recastnavigation`
- CLI/scaffold: Rails conventions, `bevyengine/bevy` workspace layout
- Asset gen: Meshy, Scenario, FLUX models, Kenney.nl, OpenGameArt, Poly Haven

## MONOREPO STRUCTURE TO DOCUMENT
```
nexus-engine/
├── docs/
│   ├── architecture/     ← system-wide decisions
│   ├── specs/            ← per-system specs (AI teams execute these)
│   │   ├── core/         ← ECS, memory, jobs, HAL, math
│   │   ├── renderer/     ← wgpu backend, render graph, shaders, PBR, NPR
│   │   ├── physics/      ← rapier integration, collision, joints, fluids
│   │   ├── audio/        ← spatial, mixing, DSP, adaptive music
│   │   ├── networking/   ← rollback netcode, replication, lobby, relay
│   │   ├── scripting/    ← lua/rune VM, hot reload, sandbox
│   │   ├── assets/       ← import, streaming, compression, LOD
│   │   ├── styles/       ← pbr, npr/cartoon, pixel, 2d, mixed
│   │   ├── genres/       ← fps, rpg, rts, moba, platformer, racing...
│   │   ├── agent/        ← AI agent API, headless sim, telemetry, replay
│   │   └── editor/       ← visual editor, inspector, live reload, debug
│   ├── contracts/        ← exact interface boundaries between systems
│   ├── prior-art/        ← what each reference engine got right/wrong
│   ├── guides/           ← ai-dev-onboarding, pr-protocol, integration
│   └── game-template/    ← nexus-game monorepo spec
├── crates/               ← (spec only, no impl yet)
└── games/                ← demo games spec (integration tests)
```

## AGENT SPAWN LIST
Spawn one agent per task below. All run in parallel. Each agent writes ONLY its assigned files.

---

### AGENT 01 — ARCHITECTURE FOUNDATION
**Files to write:**
- `docs/architecture/00-vision.md` — already drafted, EXPAND: platforms (Linux/Win/Mac/Android/iOS/Web/Console), ecosystem layers, the flywheel, success metrics
- `docs/architecture/01-principles.md` — 12 binding laws: AI-first, spec-before-code, sacred module boundaries, always compiles, performance is a spec, zero unsafe without justification, MIT forever, headless by default, deterministic replay, structured errors only, telemetry by default, tests ship with code
- `docs/architecture/02-system-map.md` — ASCII diagram of ALL systems + relationships, data flow, ownership table
- `docs/architecture/03-tech-stack.md` — Rust, wgpu, Rapier, winit, CPAL, full rationale per choice
- `docs/architecture/04-workspace-layout.md` — full Cargo workspace, every crate, every dependency boundary
- `docs/architecture/05-adr/` — one ADR per major decision: why Rust, why wgpu, why ECS, why MIT, why rollback netcode

---

### AGENT 02 — CORE SYSTEMS SPEC
**Files to write:**
- `docs/specs/core/ecs.md` — entity/component/system, archetypes, sparse sets, parallel system scheduling, change detection, inspiration: bevy ECS + flecs
- `docs/specs/core/memory.md` — allocators, arena allocator, pool allocator, TLSF, memory budget per system
- `docs/specs/core/jobs.md` — task graph, work stealing, fiber-based or thread-based, rayon integration
- `docs/specs/core/hal.md` — hardware abstraction: window, input, filesystem, time, threads — inspiration: SDL3, winit, sokol
- `docs/specs/core/math.md` — vec2/3/4, mat3/4, quat, SIMD, coordinate systems (right-handed Y-up), fixed-point option for netcode
- `docs/specs/core/events.md` — event bus, typed events, ordering guarantees, cross-system communication rules

---

### AGENT 03 — RENDERER SPEC
**Files to write:**
- `docs/specs/renderer/overview.md` — render graph architecture, frame lifecycle, inspiration: filament + wgpu
- `docs/specs/renderer/backend.md` — wgpu abstraction over Vulkan/Metal/DX12/WebGPU, capabilities negotiation
- `docs/specs/renderer/pbr.md` — physically based rendering, material system, IBL, inspiration: filament PBR
- `docs/specs/renderer/shadows.md` — cascaded shadow maps, virtual shadow maps (UE5 Nanite-inspired concept)
- `docs/specs/renderer/gi.md` — global illumination, Lumen-inspired dynamic GI concept, baked fallback
- `docs/specs/renderer/particles.md` — GPU particle system, VFX graph concept
- `docs/specs/renderer/post.md` — post-processing stack: bloom, SSAO, TAA, motion blur, color grading
- `docs/specs/renderer/shaders.md` — WGSL shader pipeline, hot reload, permutation system
- `docs/specs/renderer/terrain.md` — virtual terrain, streaming, LOD

---

### AGENT 04 — STYLE PIPELINES SPEC
**Files to write:**
- `docs/specs/styles/overview.md` — style system architecture, style lock in Nexus.toml, style consistency enforcement
- `docs/specs/styles/pbr.md` — photorealistic style: full PBR, ray tracing path, reference quality
- `docs/specs/styles/npr.md` — cartoon/cel/toon: outline detection, toon shading, hatching, inspiration: guilty gear xrd tech docs
- `docs/specs/styles/pixel.md` — pixel art: palette quantization, chunky rasterization, retro CRT filters
- `docs/specs/styles/2d.md` — 2D: sprite batching, tilemaps, normal map 2D lighting, parallax
- `docs/specs/styles/mixed.md` — combining styles, per-layer style, photorealistic world + cartoon characters

---

### AGENT 05 — PHYSICS SPEC
**Files to write:**
- `docs/specs/physics/overview.md` — physics world, timestep, substep, inspiration: rapier + jolt
- `docs/specs/physics/rigid.md` — rigid body dynamics, constraints, joints, motors
- `docs/specs/physics/collision.md` — broad phase (BVH), narrow phase, shape types, collision layers/masks
- `docs/specs/physics/character.md` — character controller, slope handling, step climbing, coyote time
- `docs/specs/physics/soft.md` — soft body, cloth simulation, destruction (inspired by bullet)
- `docs/specs/physics/fluid.md` — fluid simulation overview, SPH approach, GPU acceleration
- `docs/specs/physics/determinism.md` — fixed-point physics for netcode, determinism guarantees

---

### AGENT 06 — AUDIO SPEC
**Files to write:**
- `docs/specs/audio/overview.md` — audio graph, bus system, inspiration: FMOD/Wwise concepts
- `docs/specs/audio/spatial.md` — 3D positional audio, HRTF, reverb zones, occlusion
- `docs/specs/audio/adaptive.md` — adaptive/dynamic music: stems, transitions, intensity layers
- `docs/specs/audio/dsp.md` — DSP chain, effects: reverb, EQ, compressor, convolution
- `docs/specs/audio/streaming.md` — audio streaming, memory-mapped decoding, format support (ogg, mp3, wav, flac)
- `docs/specs/audio/voice.md` — voice chat integration, encoding, noise suppression

---

### AGENT 07 — NETWORKING SPEC
**Files to write:**
- `docs/specs/networking/overview.md` — networking model choices, when to use each
- `docs/specs/networking/rollback.md` — GGPO-inspired rollback netcode: input prediction, state rollback, resimulation
- `docs/specs/networking/replication.md` — server-authoritative replication, delta compression, interest management
- `docs/specs/networking/transport.md` — UDP + QUIC, GameNetworkingSockets-inspired reliability layer
- `docs/specs/networking/lobby.md` — matchmaking, lobby, peer discovery, relay server
- `docs/specs/networking/anticheat.md` — server-side validation, client trust model, input sanitation

---

### AGENT 08 — SCRIPTING SPEC
**Files to write:**
- `docs/specs/scripting/overview.md` — scripting philosophy: Lua for game logic, Rune for safe sandboxed systems
- `docs/specs/scripting/lua.md` — Lua 5.4 integration via mlua, API surface, hot reload
- `docs/specs/scripting/rune.md` — Rune (Rust-native) for mod sandboxing, capability model
- `docs/specs/scripting/hotreload.md` — hot reload system: game logic, scripts, shaders, assets — all without restart
- `docs/specs/scripting/sandbox.md` — mod sandboxing, capability grants, resource limits, safe API surface

---

### AGENT 09 — ASSET PIPELINE SPEC
**Files to write:**
- `docs/specs/assets/overview.md` — asset pipeline: import → process → compress → stream
- `docs/specs/assets/import.md` — format support: glTF, FBX, OBJ, PNG, EXR, OGG, WAV, TTF
- `docs/specs/assets/streaming.md` — async asset streaming, priority queue, memory budget
- `docs/specs/assets/lod.md` — automatic LOD generation, nanite-inspired virtual geometry concept
- `docs/specs/assets/compression.md` — texture compression (BCn, ASTC, ETC2), mesh compression, audio compression
- `docs/specs/assets/generation.md` — AI asset generation integration: Meshy API, Scenario API, FLUX local, Kenney library, OpenGameArt, Poly Haven
- `docs/specs/assets/registry.md` — asset registry, UUID-based addressing, hot reload, dependency tracking

---

### AGENT 10 — AI AGENT API SPEC (THE CROWN JEWEL)
**Files to write:**
- `docs/specs/agent/overview.md` — why this exists, the headless debug loop, agent SDK philosophy
- `docs/specs/agent/api.md` — full JSON-RPC API: scene manipulation, entity CRUD, system control, telemetry subscription
- `docs/specs/agent/headless.md` — headless simulation: `nexus run --headless`, speed multiplier, frame budget
- `docs/specs/agent/telemetry.md` — telemetry schema: every frame, every system, structured JSON, subscription model
- `docs/specs/agent/scenarios.md` — scenario runner: TOML-defined test scenarios, assertions, pass/fail, batch runs
- `docs/specs/agent/replay.md` — deterministic snapshot/replay: capture, store, replay, patch variables, bisect
- `docs/specs/agent/semantic.md` — semantic API layer: `engine.spawn("dragon near castle")`, NL → structured commands
- `docs/specs/agent/sdk.md` — nexus-agent-sdk: Rust + Python bindings, all CLI commands, integration examples

---

### AGENT 11 — EDITOR SPEC
**Files to write:**
- `docs/specs/editor/overview.md` — editor architecture, inspiration: Godot editor (best OSS editor), immediate mode UI
- `docs/specs/editor/scene.md` — scene graph editor, entity/component inspector, drag-drop
- `docs/specs/editor/assets.md` — asset browser, import flow, preview, AI generation trigger
- `docs/specs/editor/shader.md` — visual shader/material editor, node graph, live preview
- `docs/specs/editor/debug.md` — in-editor debug: physics wireframes, navmesh overlay, telemetry panels, profiler
- `docs/specs/editor/livereload.md` — live reload: change script/shader/asset → see result in <100ms without restart

---

### AGENT 12 — GENRE MODULES SPEC
**Files to write (one per genre, same structure each):**
- `docs/specs/genres/fps.md` — character controller, weapon system, ballistics, hit detection, ADS, recoil
- `docs/specs/genres/rpg.md` — stat system, inventory, dialogue trees, quest system, save/load
- `docs/specs/genres/mmorpg.md` — zone streaming, massive entity counts, instance system, party/guild
- `docs/specs/genres/rts.md` — unit AI, pathfinding at scale, fog of war, resource system, formation movement
- `docs/specs/genres/moba.md` — lanes, towers, jungle, ability system (inspired by DOTA2 architecture)
- `docs/specs/genres/platformer.md` — precise physics, coyote time, input buffering, wall jump, ledge grab
- `docs/specs/genres/racing.md` — vehicle physics, track system, lap counting, rubber band AI
- `docs/specs/genres/survival.md` — hunger/thirst/temperature, crafting, base building, day/night
- `docs/specs/genres/horror.md` — tension system, sanity meter, dynamic audio fear, darkness mechanics
- `docs/specs/genres/fighting.md` — frame data system, hitbox/hurtbox, GGPO rollback, input buffer
- `docs/specs/genres/battleroyal.md` — shrinking zone, loot system, 100-player scale, drop pod
- `docs/specs/genres/roguelike.md` — procedural generation, permadeath, run state, meta progression
- `docs/specs/genres/towdef.md` — tower placement grid, wave system, pathing, economy
- `docs/specs/genres/puzzle.md` — state machine puzzles, undo stack, hint system
- `docs/specs/genres/visualnovel.md` — dialogue engine, branching, sprite/bg system, save anywhere
- `docs/specs/genres/openworld.md` — world streaming, POI system, dynamic events, day/night/weather

---

### AGENT 13 — PRIOR ART ANALYSIS
**Files to write (synthesis, not copy):**
- `docs/prior-art/bevy.md` — ECS architecture wins, scheduler design, plugin system ✓ / pitfalls ✗
- `docs/prior-art/godot.md` — scene system ✓, editor ✓, GDScript ✓ / renderer limitations ✗
- `docs/prior-art/ogre.md` — 30yr render wisdom ✓, material system ✓ / C++ complexity ✗
- `docs/prior-art/ue5.md` — Nanite concept ✓, Lumen concept ✓, Blueprint ✓ / closed ✗, C++ friction ✗
- `docs/prior-art/unity.md` — inspector UX ✓, asset store model ✓ / runtime fee disaster ✗, ECS late ✗
- `docs/prior-art/flecs.md` — query performance ✓, relationships ✓, hierarchical ECS ✓
- `docs/prior-art/rapier.md` — Rust-native ✓, determinism ✓, API clarity ✓
- `docs/prior-art/ggpo.md` — rollback model ✓, input delay tradeoffs, implementation notes
- `docs/prior-art/stride.md` — C# editor ✓, node material ✓, underrated lessons
- `docs/prior-art/love2d.md` — simplicity ✓, Lua integration ✓, best onboarding ever ✗ (3D missing)

---

### AGENT 14 — CONTRACTS (SYSTEM INTERFACES)
**Files to write:**
- `docs/contracts/core-renderer.md` — exact API: what core provides renderer, what renderer needs from core
- `docs/contracts/core-physics.md` — transform sync, collision event delivery, timestep contract
- `docs/contracts/core-audio.md` — entity position → audio system, event triggers
- `docs/contracts/core-networking.md` — input collection, state snapshot, rollback interface
- `docs/contracts/core-scripting.md` — ECS access from scripts, safe API surface, event bindings
- `docs/contracts/core-agent.md` — agent API access to ECS, what agents can read/write, rate limits
- `docs/contracts/renderer-assets.md` — texture/mesh/shader upload contract, streaming protocol
- `docs/contracts/physics-renderer.md` — debug draw interface, physics wireframe rendering

---

### AGENT 15 — NEXUS-GAME TEMPLATE SPEC
**Files to write:**
- `docs/game-template/overview.md` — the developer monorepo: what it is, how it relates to nexus-engine
- `docs/game-template/structure.md` — full directory layout: game/, server/, web/, mobile/, infra/, dlc/, mods/, ai-agents/
- `docs/game-template/nexus-toml.md` — complete Nexus.toml spec: every field, every option, defaults, examples
- `docs/game-template/cli.md` — nexus CLI: `new`, `add`, `generate`, `build`, `test`, `deploy`, `agent`
- `docs/game-template/weekend-mvp.md` — walkthrough: Friday 6pm → Sunday 8pm → shipped game. Step by step.
- `docs/game-template/aaa-path.md` — how a 1-person team scales a weekend MVP to a Dota2-complexity game

---

### AGENT 16 — AI MERGE SYSTEM SPEC
**Files to write:**
- `docs/guides/merge-system.md` — how nexus-merge works: pipeline stages, decision criteria, audit log
- `docs/guides/pr-protocol.md` — what a valid PR contains: spec reference, tests, benchmarks, changelog
- `docs/guides/ai-dev-onboarding.md` — how an AI dev team starts: read vision → read principles → read spec → read contracts → write tests first → implement → PR
- `docs/guides/integration-team.md` — integration team charter: always-green main, demo games always run, cross-system tests, perf benchmarks
- `docs/guides/contribution.md` — external contributor guide: humans and AI agents, same process

---

### AGENT 17 — DEMO GAMES SPEC
**Files to write:**
- `docs/games/overview.md` — why demo games exist: they ARE the integration tests
- `docs/games/nexus-fps.md` — demo FPS: feature list, what systems it exercises, win condition for "done"
- `docs/games/nexus-rpg.md` — demo RPG: open world, NPC AI, dialogue, inventory, what systems it exercises
- `docs/games/nexus-rts.md` — demo RTS: 100-unit battles, fog of war, resource system
- `docs/games/nexus-platformer.md` — demo platformer: precise controls, 10 levels, physics edge cases

---

## SPEC FORMAT (ALL AGENTS FOLLOW THIS)

Every spec file uses this structure. Concise. Dense. No fluff.

```markdown
# [System Name]

> One sentence: what this system does and why it exists.

## Boundaries
- Owns: [what this system is responsible for]
- Does NOT own: [explicit exclusions, with pointer to who does]
- Depends on: [other systems, with contract reference]

## Architecture
[ASCII diagram or concise description of internal structure]

## Public API
[Every public type, function, constant — with types and one-line doc]

## Performance Contract
| Metric | Target | Hard limit |
|--------|--------|-----------|
| ... | ... | ... |

## Error Contract
| Code | Meaning | Caller action |
|------|---------|--------------|
| ... | ... | ... |

## Integration Points
[How this system connects to each system it touches]

## Test Requirements
[Scenarios that must pass. Written as assertions.]

## Prior Art
[What inspired this design, with ✓/✗ notes]

## Open Questions
[Unresolved decisions, flagged for human architect review]
```

---

## RULES FOR ALL AGENTS

1. **Concise.** No filler sentences. If a symbol or reference works, use it over a paragraph.
2. **Use references.** `→ see docs/contracts/core-renderer.md`, `inspired by: bevyengine/bevy#1234`.
3. **Use ASCII diagrams** for system relationships. Don't describe what you can draw.
4. **Flag unknowns.** Don't invent. Mark `[DECISION NEEDED]` for anything requiring architect input.
5. **No implementation code** in specs unless it's a 5-line API signature example.
6. **Cross-link aggressively.** Every spec references the contracts it depends on.
7. **Performance numbers are real.** If you don't know the target, write `[BENCHMARK NEEDED]` not a guess.
8. **One file per concept.** Don't merge two systems into one file.
9. **MIT license header** on every file.
10. **All files land in `docs/`** — no crate code, no Cargo.toml changes. Spec only.

---

## START COMMAND

Spawn all 17 agents in parallel. Each agent:
1. Reads `docs/architecture/00-vision.md` (the constitution)
2. Reads `docs/architecture/01-principles.md` (the laws)
3. Writes only its assigned files
4. Cross-references other agents' output paths even if files don't exist yet
5. Marks `[AGENT: XX]` for any cross-agent dependency it needs resolved

Integration agent (Agent 01) runs last pass to ensure all cross-references resolve.

**Output:** Complete `docs/` folder. Every AI dev team that builds any Nexus system reads their spec and executes. No ambiguity. No gaps.