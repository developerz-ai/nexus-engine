<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — System Map

> Every system in Nexus, its owner crate, its dependencies, and how data flows through the engine for a single frame.
> Source of truth for: workspace layout (`docs/architecture/04-workspace-layout.md`) and contracts (`docs/contracts/`).

---

## Top-level system diagram

```
                                  ┌──────────────────────────────────────────────┐
                                  │              nexus-agent-sdk                 │
                                  │    (Rust + Python; drives engine headless)   │
                                  │  → docs/specs/agent/sdk.md                   │
                                  └───────────────┬──────────────────────────────┘
                                                  │ JSON-RPC + telemetry stream
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              NEXUS-ENGINE  (single binary or lib)                   │
│                                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────────┐       │
│   │                          AGENT API LAYER                                │       │
│   │  scene CRUD · system control · telemetry · semantic NL → command       │       │
│   │  → docs/specs/agent/api.md, docs/specs/agent/semantic.md               │       │
│   └────────────────────────────────┬────────────────────────────────────────┘       │
│                                    │ typed events + ECS commands                    │
│                                    ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────────┐       │
│   │                       EDITOR (in-process)                               │       │
│   │  scene · inspector · shader graph · debug overlays · live reload        │       │
│   │  → docs/specs/editor/overview.md                                       │       │
│   └────────────────────────────────┬────────────────────────────────────────┘       │
│                                    │                                                │
│   ┌────────────────────────────────▼────────────────────────────────────────┐       │
│   │                    GENRE MODULES         STYLE MODULES                  │       │
│   │   fps · rpg · rts · moba · ...        pbr · npr · pixel · 2d · mixed   │       │
│   │  → docs/specs/genres/                 → docs/specs/styles/             │       │
│   └────────────────────────────────┬────────────────────────────────────────┘       │
│                                    │ ECS components + systems                       │
│   ┌────────────────────────────────▼────────────────────────────────────────┐       │
│   │                       SCRIPTING (Lua + Rune)                            │       │
│   │   game logic · mods · hot reload · sandbox                              │       │
│   │  → docs/specs/scripting/overview.md                                    │       │
│   └────────────────────────────────┬────────────────────────────────────────┘       │
│                                    │                                                │
│ ┌──────────────────────┬───────────┴───────────┬──────────────────────┐             │
│ ▼                      ▼                       ▼                      ▼             │
│┌─────────┐      ┌─────────────┐         ┌─────────────┐        ┌─────────────┐      │
││RENDERER │      │  PHYSICS    │         │   AUDIO     │        │ NETWORKING  │      │
││  wgpu   │      │   Rapier    │         │    CPAL     │        │ QUIC + GGPO │      │
││→specs/  │      │ →specs/     │         │ →specs/     │        │ →specs/     │      │
││renderer │      │ physics/    │         │ audio/      │        │ networking/ │      │
│└────┬────┘      └──────┬──────┘         └──────┬──────┘        └──────┬──────┘      │
│     │                  │                       │                      │             │
│     └──────────┬───────┴──────────┬────────────┴───────────┬──────────┘             │
│                ▼                  ▼                        ▼                        │
│   ┌─────────────────────────────────────────────────────────────────────┐           │
│   │                        ASSET PIPELINE                                │           │
│   │  import · streaming · compression · LOD · registry · AI generation  │           │
│   │  → docs/specs/assets/overview.md                                    │           │
│   └─────────────────────────────────┬───────────────────────────────────┘           │
│                                     │                                               │
│   ┌─────────────────────────────────▼───────────────────────────────────┐           │
│   │                              CORE                                    │           │
│   │   ECS (archetypes + sparse sets) · jobs (work-stealing) · memory    │           │
│   │   math · HAL · events                                                │           │
│   │  → docs/specs/core/                                                  │           │
│   └─────────────────────────────────┬───────────────────────────────────┘           │
│                                     │                                               │
│   ┌─────────────────────────────────▼───────────────────────────────────┐           │
│   │                       PLATFORM SUBSTRATE                             │           │
│   │   winit · wgpu · cpal · rapier · rayon · serde · tracing             │           │
│   │  → docs/architecture/03-tech-stack.md                                │           │
│   └──────────────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Single-frame data flow

```
 t=0 ────────────────────────────────────────────────────────────────────► t=1/60s
 │
 │  1. HAL.tick()                                  ── poll OS events, advance SimTime
 │     → core::hal::input + core::hal::time
 │
 │  2. Networking.collect_inputs()                 ── local input + predicted remote inputs
 │     → docs/specs/networking/rollback.md
 │
 │  3. Scripting.pre_update()                      ── game logic (Lua) reads world
 │     → docs/specs/scripting/lua.md
 │
 │  4. ECS.run_schedule(PreUpdate)                 ── parallel system schedule
 │     → docs/specs/core/ecs.md
 │
 │  5. Physics.step(fixed_dt)                      ── may run 0..N times per frame
 │     → docs/specs/physics/overview.md
 │     ↳ emits CollisionEvents → ECS event bus
 │
 │  6. ECS.run_schedule(Update)                    ── gameplay systems consume physics
 │
 │  7. Audio.update(positions)                     ── spatial sources sync from ECS
 │     → docs/specs/audio/spatial.md
 │
 │  8. Networking.send_outputs()                   ── delta-compressed state out
 │     → docs/specs/networking/replication.md
 │
 │  9. Scripting.post_update()
 │
 │ 10. ECS.run_schedule(PostUpdate)                ── transforms finalize
 │
 │ 11. Renderer.extract(world)                     ── ECS → render graph data
 │     → docs/specs/renderer/overview.md
 │
 │ 12. Renderer.prepare()                          ── GPU buffers, descriptors
 │
 │ 13. Renderer.render(frame)                      ── execute render graph
 │     ↳ in headless mode (Law 8): skipped, frame budget freed
 │
 │ 14. Telemetry.flush(frame)                      ── push structured frame data
 │     → docs/specs/agent/telemetry.md
 │
 │ 15. HAL.present()                               ── swap chain or no-op
 │
 ▼  frame complete
```

**Determinism boundary (Law 9):** steps 1–10 are deterministic. Step 11 onward is render-only and may be non-deterministic without affecting simulation. → `docs/architecture/05-adr/0007-deterministic-replay.md`.

---

## Ownership table

Maps each system to its owning crate, the contract that gates access to it, and the spec that defines it. Authoritative for Law 3 (Sacred Module Boundaries) and Law 5 (Performance Is a Spec).

| System | Owning crate | Spec | Inbound contracts | Outbound contracts |
|---|---|---|---|---|
| ECS | `nexus-core` | `docs/specs/core/ecs.md` | (none — substrate) | all systems consume |
| Jobs / scheduler | `nexus-core` | `docs/specs/core/jobs.md` | (none) | renderer, physics, audio, net |
| Memory | `nexus-core` | `docs/specs/core/memory.md` | (none) | all crates |
| Math | `nexus-core` | `docs/specs/core/math.md` | (none) | all crates |
| HAL (window, input, fs, time) | `nexus-hal` | `docs/specs/core/hal.md` | (none — wraps OS) | core, editor, agent |
| Events | `nexus-core` | `docs/specs/core/events.md` | (none) | all systems |
| Renderer | `nexus-renderer` | `docs/specs/renderer/overview.md` | `docs/contracts/core-renderer.md`, `docs/contracts/renderer-assets.md`, `docs/contracts/physics-renderer.md` | editor (debug draw) |
| Physics | `nexus-physics` | `docs/specs/physics/overview.md` | `docs/contracts/core-physics.md` | `docs/contracts/physics-renderer.md` (debug) |
| Audio | `nexus-audio` | `docs/specs/audio/overview.md` | `docs/contracts/core-audio.md` | (none outbound) |
| Networking | `nexus-net` | `docs/specs/networking/overview.md` | `docs/contracts/core-networking.md` | (none outbound) |
| Scripting (Lua, Rune) | `nexus-script` | `docs/specs/scripting/overview.md` | `docs/contracts/core-scripting.md` | (none outbound) |
| Assets | `nexus-assets` | `docs/specs/assets/overview.md` | `docs/contracts/renderer-assets.md` | renderer, audio (asset upload) |
| Styles (pbr, npr, pixel, 2d, mixed) | `nexus-styles-*` | `docs/specs/styles/overview.md` | renderer contract | (plug into renderer) |
| Genres (fps, rpg, …) | `nexus-genre-*` | `docs/specs/genres/<g>.md` | ECS + scripting contracts | (consume only) |
| Agent API | `nexus-agent` | `docs/specs/agent/api.md` | `docs/contracts/core-agent.md` | sdk binding |
| Editor | `nexus-editor` | `docs/specs/editor/overview.md` | every read-side contract; write via agent API | (none) |
| CLI | `nexus-cli` | `docs/game-template/cli.md` | none (uses engine as library) | scaffolds projects |

Workspace dependency graph and per-crate `Cargo.toml` shape: `docs/architecture/04-workspace-layout.md`.

---

## Allowed dependency edges (DAG, enforced by `cargo deny`)

```
nexus-core ─────────────────────────────────────────────────────►  (depends on: nothing internal)
nexus-hal     ──► nexus-core
nexus-assets  ──► nexus-core, nexus-hal
nexus-renderer──► nexus-core, nexus-hal, nexus-assets
nexus-physics ──► nexus-core
nexus-audio   ──► nexus-core, nexus-hal, nexus-assets
nexus-net     ──► nexus-core
nexus-script  ──► nexus-core
nexus-styles-*──► nexus-core, nexus-renderer, nexus-assets
nexus-genre-* ──► nexus-core, nexus-script  (NEVER renderer/physics directly — go through ECS)
nexus-agent   ──► nexus-core, nexus-script, nexus-net  (read-only access to all systems via telemetry contracts)
nexus-editor  ──► nexus-agent, nexus-renderer  (consumes agent API for write; renderer for draw)
nexus-cli     ──► (no engine deps — scaffolds project files only)
```

**Forbidden edges (rejected by `cargo deny`):**
- Anything → `nexus-genre-*` or `nexus-styles-*` (genres/styles are leaf plugins)
- `nexus-physics` → `nexus-renderer` (physics never knows about rendering; debug draw goes through `physics-renderer.md` event contract)
- `nexus-core` → anything else
- Cycles, period.

---

## Telemetry & error flow (cross-cutting, Law 10 + 11)

```
   ┌────────────────────────────────────────────────────────────────────┐
   │ Every system emits per-frame telemetry into nexus_core::telemetry  │
   │ Every system returns StructuredError on failure                    │
   └───────────────────────────────┬────────────────────────────────────┘
                                   ▼
                  ┌────────────────────────────────┐
                  │  nexus_core::telemetry::Bus    │
                  │  (lock-free SPMC ring buffer)  │
                  └────────────────┬───────────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        ▼                          ▼                           ▼
   tracing crate           nexus-agent stream            file sink
   (stdout JSON)           (JSON-RPC subscribe)          (replay capture)
   → all systems          → docs/specs/agent/         → docs/specs/agent/
                            telemetry.md                replay.md
```

---

## Cross-references

- Constitution: `docs/architecture/00-vision.md`
- Laws: `docs/architecture/01-principles.md`
- Tech stack rationale: `docs/architecture/03-tech-stack.md`
- Workspace + crate boundaries: `docs/architecture/04-workspace-layout.md`
- Per-system specs: `docs/specs/`
- Per-edge contracts: `docs/contracts/`
- Prior-art studies (what each reference engine got right/wrong): `docs/prior-art/`
