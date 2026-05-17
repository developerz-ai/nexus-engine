<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Glossary

> Every term used in the Nexus codebase, one line each. Alphabetical.

Conventions:
- One line per term. No paragraphs.
- Cross-reference with `→ docs/...`.
- Mark `[PENDING]` if the canonical source doc does not yet exist.

---

## A

| Term | Definition |
|---|---|
| **ADR** | Architecture Decision Record. One file per major decision, Nygard format. → `docs/guides/adr-format.md`. |
| **Adaptive music** | Music system that layers stems by gameplay intensity. → `docs/specs/audio/adaptive.md`. |
| **Agent API** | JSON-RPC surface AI agents use to control the engine headlessly. → `docs/specs/agent/api.md`. |
| **Anticheat** | Server-side input validation and trust boundary. → `docs/specs/networking/anticheat.md`. |
| **Archetype** | Group of entities sharing the same component set, stored contiguously. → `docs/specs/core/ecs.md`. |
| **Arena allocator** | Bump allocator with bulk-free; used for per-frame scratch. → `docs/specs/core/memory.md`. |
| **ASTC** | Adaptive Scalable Texture Compression. GPU texture format, mobile/desktop. → `docs/specs/assets/compression.md`. |
| **Asset registry** | UUID-keyed table of loaded/streamable assets with dependency tracking. → `docs/specs/assets/registry.md`. |

## B

| Term | Definition |
|---|---|
| **Backend (renderer)** | The wgpu-targeting GPU API layer (Vulkan/Metal/DX12/WebGPU). → `docs/specs/renderer/backend.md`. |
| **BCn** | Block-compression family (BC1–BC7) for desktop GPU textures. → `docs/specs/assets/compression.md`. |
| **BVH** | Bounding Volume Hierarchy. Broad-phase collision and ray accel. → `docs/specs/physics/collision.md`. |
| **Bindless** | GPU resource access model without per-draw binding. → `docs/specs/renderer/backend.md`. |
| **Bloom** | Post-process light bleed effect. → `docs/specs/renderer/post.md` [PENDING]. |
| **Broad phase** | Coarse collision pass eliminating non-pairs before narrow phase. → `docs/specs/physics/collision.md`. |
| **Bus factor** | Number of contributors whose loss kills the project. Nexus target: ∞ (AI-maintained). |

## C

| Term | Definition |
|---|---|
| **Capability (sandbox)** | Explicit permission grant to a mod/script. → `docs/specs/scripting/sandbox.md`. |
| **Cascaded shadow maps** | Multi-resolution shadow maps for directional lights. → `docs/specs/renderer/shadows.md` [PENDING]. |
| **Cel shading** | Banded toon-style lighting. → `docs/specs/styles/npr.md`. |
| **Change detection** | ECS tracking of modified components for incremental systems. → `docs/specs/core/ecs.md`. |
| **Character controller** | Kinematic body with slope/step/coyote handling. → `docs/specs/physics/character.md` [PENDING]. |
| **Contract** | Machine-readable interface boundary between two crates/systems. → `docs/guides/contract-format.md`. |
| **Coyote time** | Brief post-edge jump-grace window. → `docs/specs/genres/platformer.md` [PENDING]. |
| **Crate** | Rust compilation unit. Nexus uses one crate per subsystem. → `docs/architecture/04-workspace-layout.md` [PENDING]. |

## D

| Term | Definition |
|---|---|
| **DDS** | DirectDraw Surface texture container. → `docs/specs/assets/import.md`. |
| **Delta compression** | Send only state diffs per replication tick. → `docs/specs/networking/replication.md`. |
| **Determinism** | Identical output given identical input + state. Required for rollback. → `docs/specs/physics/determinism.md` [PENDING]. |
| **Diátaxis** | Four-mode doc framework (tutorial/how-to/reference/explanation). → `docs/guides/style-guide.md`. |
| **DSP** | Digital Signal Processing. Audio effects chain. → `docs/specs/audio/dsp.md` [PENDING]. |

## E

| Term | Definition |
|---|---|
| **ECS** | Entity-Component-System. Data-oriented runtime architecture. → `docs/specs/core/ecs.md`. |
| **EXR** | OpenEXR HDR image format. → `docs/specs/assets/import.md`. |
| **Entity** | Opaque ID identifying a set of components. → `docs/specs/core/ecs.md`. |
| **Event bus** | Typed pub-sub channel for cross-system messages. → `docs/specs/core/events.md` [PENDING]. |
| **Extract (renderer)** | Per-frame snapshot of renderable components out of the live World. → `docs/contracts/core-renderer.md`. |

## F

| Term | Definition |
|---|---|
| **FBX** | Autodesk mesh/animation interchange format. → `docs/specs/assets/import.md`. |
| **Fiber** | Cooperative-scheduled thread, used for job system. → `docs/specs/core/jobs.md` [PENDING]. |
| **FLUX** | Open-source image-generation model used self-hosted. → `docs/specs/assets/generation.md` [PENDING]. |
| **Fog of war** | Per-faction visibility mask in RTS. → `docs/specs/genres/rts.md` [PENDING]. |
| **Frame budget** | Wall-clock time per frame at target FPS (16.6 ms @ 60 fps). |
| **Frontmatter** | YAML metadata header on Markdown. Nexus does not use it; see `docs/guides/file-conventions.md`. |

## G

| Term | Definition |
|---|---|
| **GGPO** | Reference rollback-netcode library; conceptual inspiration. → `docs/prior-art/ggpo.md` [PENDING]. |
| **GI** | Global Illumination. Indirect lighting model. → `docs/specs/renderer/gi.md` [PENDING]. |
| **glTF** | Khronos open mesh/scene format. Primary import target. → `docs/specs/assets/import.md`. |

## H

| Term | Definition |
|---|---|
| **HAL** | Hardware Abstraction Layer. Window/input/fs/time/threads. → `docs/specs/core/hal.md` [PENDING]. |
| **Headless** | Engine running with no display/GPU; required for AI training and tests. → `docs/specs/agent/headless.md` [PENDING]. |
| **Hitbox / Hurtbox** | Attack volume / damageable volume in combat games. → `docs/specs/genres/fighting.md` [PENDING]. |
| **Hot reload** | Swap code/asset/shader without restart. → `docs/specs/scripting/hotreload.md` [PENDING]. |
| **HRTF** | Head-Related Transfer Function. 3D-audio spatialization. → `docs/specs/audio/spatial.md`. |

## I

| Term | Definition |
|---|---|
| **IBL** | Image-Based Lighting. Environment-map illumination for PBR. → `docs/specs/renderer/pbr.md`. |
| **Indirect draw** | GPU-fed draw call list; reduces CPU overhead. → `docs/specs/renderer/backend.md`. |
| **Input prediction** | Client-side speculative input application for rollback. → `docs/specs/networking/rollback.md`. |
| **Interest management** | Server replicates only entities relevant to a client. → `docs/specs/networking/replication.md`. |

## J

| Term | Definition |
|---|---|
| **Job graph** | DAG of parallel tasks executed by the job system. → `docs/specs/core/jobs.md` [PENDING]. |
| **Joint** | Physics constraint connecting two rigid bodies. → `docs/specs/physics/rigid.md`. |

## L

| Term | Definition |
|---|---|
| **LOD** | Level Of Detail. Reduced-fidelity asset variants. → `docs/specs/assets/lod.md` [PENDING]. |
| **Lumen** | UE5 dynamic-GI system; conceptual reference. → `docs/specs/renderer/gi.md` [PENDING]. |
| **Live reload** | Editor change propagated in < 100 ms. → `docs/specs/editor/livereload.md` [PENDING]. |

## M

| Term | Definition |
|---|---|
| **MIT license** | Permissive open-source license. Nexus uses it for everything. Forever. |
| **Mesh handle** | Weak reference into asset registry; dereffed per frame. → `docs/specs/assets/registry.md`. |
| **Mlua** | Rust crate for Lua 5.4 integration. → `docs/specs/scripting/lua.md`. |

## N

| Term | Definition |
|---|---|
| **Nanite** | UE5 virtualized geometry; conceptual reference. → `docs/specs/assets/lod.md` [PENDING]. |
| **Narrow phase** | Per-pair exact collision test after broad phase. → `docs/specs/physics/collision.md`. |
| **Navmesh** | Navigation mesh; pathfinding surface from world geometry. → `docs/specs/core/navmesh.md` [PENDING]. |
| **Nexus.toml** | Per-game config: style lock, genre modules, target platforms. → `docs/game-template/nexus-toml.md`. |
| **nexus-agent-sdk** | Python+Rust SDK every AI agent uses to drive Nexus. → `docs/specs/agent/sdk.md` [PENDING]. |
| **nexus-cli** | Scaffolding/build CLI (Rails-equivalent). → `docs/game-template/cli.md`. |
| **nexus-merge** | AI PR-evaluation system. → `docs/guides/merge-system.md` [PENDING]. |
| **NPR** | Non-Photorealistic Rendering. Cartoon/cel/sketch styles. → `docs/specs/styles/npr.md`. |

## O

| Term | Definition |
|---|---|
| **Occlusion (audio)** | Sound attenuation through geometry. → `docs/specs/audio/spatial.md`. |
| **OGG** | Free audio container (typically Vorbis/Opus). → `docs/specs/assets/import.md`. |
| **OpenXR** | Khronos VR/AR runtime API. → `docs/architecture/03-tech-stack.md` [PENDING]. |

## P

| Term | Definition |
|---|---|
| **Palette quantization** | Reduce image colors to fixed palette for pixel-art style. → `docs/specs/styles/pixel.md` [PENDING]. |
| **PBR** | Physically Based Rendering. Energy-conserving material model. → `docs/specs/renderer/pbr.md`. |
| **Plugin** | Self-contained module that registers into the core schedule. → `docs/specs/core/ecs.md`. |
| **Pool allocator** | Fixed-size-block allocator with O(1) alloc/free. → `docs/specs/core/memory.md`. |
| **Post-process stack** | Bloom/SSAO/TAA/grade chain on the final framebuffer. → `docs/specs/renderer/post.md` [PENDING]. |
| **Prepare (renderer)** | Frame stage: build GPU resources from extracted snapshot. → `docs/contracts/core-renderer.md`. |
| **PR protocol** | Required shape of every Nexus pull request. → `docs/guides/pr-protocol.md` [PENDING]. |

## Q

| Term | Definition |
|---|---|
| **QUIC** | UDP-based transport with multiplexed reliability. → `docs/specs/networking/transport.md` [PENDING]. |
| **Queue (renderer)** | Frame stage: record draw commands. → `docs/contracts/core-renderer.md`. |

## R

| Term | Definition |
|---|---|
| **Rapier** | Rust-native physics engine integrated by Nexus. → `docs/specs/physics/overview.md`. |
| **Rayon** | Rust data-parallelism crate. Used by job system. → `docs/specs/core/jobs.md` [PENDING]. |
| **Render graph** | DAG of GPU passes with auto resource lifetime. → `docs/specs/renderer/overview.md`. |
| **Replication** | Server-authoritative state mirror to clients. → `docs/specs/networking/replication.md`. |
| **Resimulation** | Replay buffered inputs after rollback. → `docs/specs/networking/rollback.md`. |
| **Rollback netcode** | Predict inputs, correct on divergence via resim. → `docs/specs/networking/rollback.md`. |
| **Rune** | Rust-native scripting language; sandboxed. → `docs/specs/scripting/rune.md` [PENDING]. |

## S

| Term | Definition |
|---|---|
| **Sandbox** | Capability-restricted execution environment for mods. → `docs/specs/scripting/sandbox.md` [PENDING]. |
| **Scenario** | TOML-defined deterministic test case for the agent runner. → `docs/specs/agent/scenarios.md` [PENDING]. |
| **Schedule** | Ordered set of system stages per frame. → `docs/specs/core/ecs.md`. |
| **Semantic API** | Natural-language → structured-call layer (`engine.spawn("dragon")`). → `docs/specs/agent/semantic.md` [PENDING]. |
| **Snapshot** | Full serializable game-state capture for replay/bisect. → `docs/specs/agent/replay.md` [PENDING]. |
| **Sparse set** | ECS storage variant; fast add/remove, less cache-friendly than archetype. → `docs/specs/core/ecs.md`. |
| **SPH** | Smoothed Particle Hydrodynamics. Fluid sim approach. → `docs/specs/physics/fluid.md` [PENDING]. |
| **Spec** | Pre-implementation contract document. No code without one. → `docs/guides/spec-format.md`. |
| **SSAO** | Screen-Space Ambient Occlusion. → `docs/specs/renderer/post.md` [PENDING]. |
| **Stem (audio)** | Individual layer of a multi-track adaptive cue. → `docs/specs/audio/adaptive.md`. |
| **Style lock** | `Nexus.toml` field pinning visual style. → `docs/specs/styles/overview.md`. |
| **Submit (renderer)** | Frame stage: GPU submission + present. → `docs/contracts/core-renderer.md`. |
| **System (ECS)** | Function operating on components per frame. → `docs/specs/core/ecs.md`. |

## T

| Term | Definition |
|---|---|
| **TAA** | Temporal Anti-Aliasing. History-buffered AA. → `docs/specs/renderer/post.md` [PENDING]. |
| **Telemetry** | Structured per-frame system metrics. → `docs/specs/agent/telemetry.md` [PENDING]. |
| **Tilemap** | Grid-based sprite map for 2D worlds. → `docs/specs/styles/2d.md` [PENDING]. |
| **Tilesheet** | Source image holding tile atlas. → `docs/specs/styles/2d.md` [PENDING]. |
| **TLSF** | Two-Level Segregated Fit allocator. O(1) real-time alloc. → `docs/specs/core/memory.md`. |
| **Tower defense** | Genre. Path-locked enemies, placed defenders. → `docs/specs/genres/towdef.md` [PENDING]. |
| **Transform** | Position + rotation + scale, hierarchical. → `docs/specs/core/ecs.md`. |

## U

| Term | Definition |
|---|---|
| **UUID** | 128-bit identifier used for asset addressing. → `docs/specs/assets/registry.md`. |

## V

| Term | Definition |
|---|---|
| **Virtual geometry** | Mesh-cluster streaming (Nanite-style). → `docs/specs/assets/lod.md` [PENDING]. |
| **Virtual shadow map** | Page-table-backed shadow atlas. → `docs/specs/renderer/shadows.md` [PENDING]. |
| **Visibility** | ECS component flag; gates renderer extract. → `docs/specs/core/ecs.md`. |
| **Voxel** | Volumetric grid sample. → `docs/specs/renderer/gi.md` [PENDING]. |

## W

| Term | Definition |
|---|---|
| **WGSL** | WebGPU Shading Language. Nexus's sole shader language. → `docs/specs/renderer/shaders.md` [PENDING]. |
| **wgpu** | Rust crate implementing WebGPU over Vulkan/Metal/DX12. → `docs/specs/renderer/backend.md`. |
| **winit** | Cross-platform Rust windowing crate used by HAL. → `docs/specs/core/hal.md` [PENDING]. |
| **World** | Top-level ECS container holding entities, components, resources. → `docs/specs/core/ecs.md`. |
