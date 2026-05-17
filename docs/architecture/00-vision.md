<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Vision

**Version:** 0.1.0-draft
**Status:** Living constitution. All AI teams, all contributors, all decisions trace back here.
**Source of truth for:** `docs/architecture/01-principles.md`, every spec under `docs/specs/`, every contract under `docs/contracts/`.

---

## What Nexus Is

Nexus is a free, open source, AI-first game engine and ecosystem — built by AI, maintained by AI, designed for both AI agents and human developers to create any game, in any style, for any platform.

It is the Linux of game engines.

Not an alternative to Unreal Engine or Unity. Their replacement.

---

## The Problem With Every Engine That Exists Today

Every game engine ever built was designed around one assumption: **a human developer sits at a keyboard.**

That assumption shaped everything:
- APIs designed for human readability, not machine parsability
- Documentation written for humans to skim, not agents to execute
- Error messages as strings, not structured data
- Editors as GUIs, not as programmable interfaces
- Licensing that extracts value from developers instead of empowering them
- Closed source that hides decades of engineering knowledge
- Monolithic architectures that resist extension

The result: making a AAA game requires a team of hundreds, years of development, and millions of dollars. A single developer cannot compete. AI agents cannot work efficiently. The barrier to creation is artificial and enormous.

Nexus removes that barrier entirely.

---

## The Nexus Thesis

**Code is now free.** AI generates high-quality code at scale, 24 hours a day, at near-zero marginal cost. The bottleneck is no longer writing code — it is architecture, integration, and design wisdom.

**AI agents are becoming the primary developers.** Not a future prediction. Happening now. Every engine that doesn't treat AI agents as first-class users will become legacy software within five years.

**Open source wins in the long run, always.** Linux defeated every proprietary Unix. PostgreSQL defeated Oracle for most use cases. Blender is defeating expensive 3D tools. Nexus will defeat Unity and Unreal because it is free, open, extensible, and built for the way software is actually developed today.

**A solo developer with AI should be able to ship a AAA game in a weekend.** This is not hyperbole. It is the design target. Every architectural decision, every API, every tool is evaluated against this benchmark.

---

## What Nexus Is Not

Nexus is not a research project. It ships.

Nexus is not a toy engine. It targets Dota 2, World of Warcraft, Black Myth: Wukong — the hardest games ever made.

Nexus is not opinionated about game genre or visual style. It supports photorealistic, cartoon, pixel art, 2D, 3D, VR — everything, through a modular style and genre system.

Nexus is not maintained by a single person or company. No bus factor. No Torvalds. AI merge systems evaluate every PR on technical merit alone.

Nexus is not locked to any platform. Linux, Windows, macOS, Android, iOS, web (WASM), and consoles. One codebase, everywhere.

---

## The Ecosystem (Layered View)

Nexus is not just an engine. It is a layered ecosystem. Each layer is independently versioned, MIT licensed, and consumable on its own.

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 7 — DISTRIBUTION                                              │
│  nexus-hub (asset/mod marketplace, free)  ·  itch.io / Steam glue    │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 6 — GAMES (proof of engine)                                   │
│  nexus-fps · nexus-rpg · nexus-rts · nexus-platformer (demos)        │
│  → docs/games/overview.md                                            │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 5 — TEMPLATE & TOOLING                                        │
│  nexus-game-template  ·  nexus-cli (`nexus new`, `nexus generate`)    │
│  → docs/game-template/overview.md  ·  docs/game-template/cli.md       │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 4 — EDITOR & AGENT INTERFACE                                  │
│  nexus-editor (Godot-inspired, OSS)  ·  nexus-agent-sdk (Rust + Py)   │
│  → docs/specs/editor/overview.md  ·  docs/specs/agent/overview.md     │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 3 — GENRE & STYLE MODULES                                     │
│  fps · rpg · rts · moba · ... (genres)                               │
│  pbr · npr · pixel · 2d · mixed (styles)                             │
│  → docs/specs/genres/  ·  docs/specs/styles/                         │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 2 — ENGINE SUBSYSTEMS                                         │
│  renderer · physics · audio · networking · scripting · assets        │
│  → docs/specs/renderer/  ·  docs/specs/physics/  ·  ...              │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 1 — CORE                                                      │
│  ECS · jobs · memory · math · HAL · events                           │
│  → docs/specs/core/                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  LAYER 0 — PLATFORM SUBSTRATE                                        │
│  Rust toolchain · wgpu · winit · CPAL · Rapier · target triples      │
│  → docs/architecture/03-tech-stack.md                                │
└──────────────────────────────────────────────────────────────────────┘
            ↑
            └── nexus-merge (AI maintainer, gates every PR into every layer)
                → docs/guides/merge-system.md
```

### Ecosystem repositories

| Repo | Purpose | License | Spec |
|---|---|---|---|
| `nexus-engine` | The core. ECS, renderer, physics, audio, networking, scripting, asset pipeline, style modules, genre modules, agent API, editor. 100M+ LOC at maturity. | MIT | this repo |
| `nexus-cli` | Rails-equivalent scaffolder. `nexus new mygame` produces a production-ready monorepo. Convention over configuration, fully ejectable. | MIT | `docs/game-template/cli.md` |
| `nexus-agent-sdk` | The AI developer toolkit. Headless sim, structured telemetry, scenario testing, state snapshots — everything an agent needs to build without a screen. | MIT | `docs/specs/agent/sdk.md` |
| `nexus-assets` | Asset layer. Bridges to Kenney, OpenGameArt, Poly Haven, ambientCG; paid AI gens (Meshy, Scenario); self-hosted FLUX. One command finds, generates, validates, imports. | MIT | `docs/specs/assets/generation.md` |
| `nexus-merge` | AI maintainer. Static analysis, test validation, architecture compliance, security audit, license check. Never burns out. | MIT | `docs/guides/merge-system.md` |
| `nexus-game-template` | The developer monorepo. Game core, server, web, mobile companion, infra, DLC, mods, AI agents. | MIT | `docs/game-template/structure.md` |
| `nexus-hub` (post-v1) | Free asset/mod marketplace. No cut, no rent. Run by community, indexed by AI. | MIT | [DECISION NEEDED] |

---

## Platform Targets

Nexus runs everywhere. Non-negotiable. One codebase, one workspace, every target.

| Platform | Target | Status | Backend | Notes |
|---|---|---|---|---|
| Linux (x86_64, aarch64) | Primary dev platform | v1.0 | wgpu → Vulkan | dev OS for all agents and CI |
| Windows 10/11 (x86_64) | Full support | v1.0 | wgpu → DX12 / Vulkan | shipping target for most indie games |
| macOS 12+ (Apple Silicon, x86_64) | Full support | v1.0 | wgpu → Metal | universal binary |
| Android (arm64-v8a, API 26+) | Full support | v1.0 | wgpu → Vulkan | ndk + jni shim |
| iOS 15+ (arm64) | Full support | v1.0 | wgpu → Metal | app-store-ready packaging from `nexus build ios` |
| Web (WASM + WebGPU) | Full support | v1.0 | wgpu → WebGPU (WebGL2 fallback) | shippable demo from any commit |
| Nintendo Switch | Best effort | v1.1 | NVN via vendor SDK shim | community port, no NDA in core repo |
| PlayStation 5 | Best effort | v1.1 | GNM via vendor SDK shim | as above |
| Xbox Series X/S | Best effort | v1.1 | DX12 (GDK) | as above |
| VR/AR (OpenXR) | Full support | v1.1 | OpenXR + wgpu | stereo render path, hand tracking |
| Steam Deck | Verified | v1.0 | wgpu → Vulkan (proton-free, native Linux build) | gold standard for handheld perf |

Rationale and per-target details → `docs/architecture/03-tech-stack.md`.

---

## Style Targets

Nexus renders everything. No engine should force a visual style.

- **Photorealistic** — PBR, ray tracing, volumetrics, Lumen-inspired dynamic GI → `docs/specs/styles/pbr.md`
- **Stylized / cartoon** — NPR, cel shading, outlines, toon lighting → `docs/specs/styles/npr.md`
- **Pixel art** — palette systems, chunky rasterization, retro CRT filters → `docs/specs/styles/pixel.md`
- **2D** — sprites, tilemaps, parallax, 2D lighting → `docs/specs/styles/2d.md`
- **Hand-drawn / painterly** — custom shader pipelines → `docs/specs/styles/npr.md`
- **Mixed** — photorealistic world + cartoon characters, fully supported → `docs/specs/styles/mixed.md`

Style is locked in `Nexus.toml`. The engine enforces consistency across the chosen style. → `docs/game-template/nexus-toml.md`.

---

## Genre Targets

Nexus ships genre modules for every major game type:

FPS · TPS · RPG · MMORPG · RTS · MOBA · Platformer · Metroidvania · Racing · Fighting · Horror · Survival · Battle Royale · Tower Defense · Puzzle · Visual Novel · Simulation · Sports · Rhythm · Roguelike · Open World

Each is a plug-in module declared in `Nexus.toml`. One line to add a full genre system. → `docs/specs/genres/`.

---

## The AI-First Mandate

Every system in Nexus must satisfy the AI-first mandate. These map 1:1 to laws in `docs/architecture/01-principles.md`.

1. **Machine-readable errors.** Every error is structured JSON with `code`, `message`, `location`, `suggested_fix`. → Law 10.
2. **Full telemetry by default.** Every system emits structured telemetry every frame. No configuration required. → Law 11.
3. **Headless operation.** Every system runs without a display, GPU optional, at simulation speed. → Law 8.
4. **Serializable state.** The complete game state — every entity, every component, every system state — is serializable and deserializable at any point. → `docs/specs/agent/replay.md`.
5. **Deterministic replay.** Given the same initial state and input sequence, the engine produces identical output. Always. → Law 9, `docs/architecture/05-adr/0007-deterministic-replay.md`.
6. **Semantic APIs.** APIs are named for what they mean, not how they work. `engine.spawn("dragon near castle")` is a valid call. → `docs/specs/agent/semantic.md`.
7. **Documented contracts.** Every public API has a machine-readable contract: inputs, outputs, side effects, performance characteristics. → `docs/contracts/`.

---

## The Open Source Mandate

Nexus is MIT licensed. Everything. Forever.

No dual licensing. No open core. No "community edition" with a paid "pro" tier. The entire engine, every module, every tool — MIT.

Why: because the community will build on it, extend it, ship games with it, and contribute back — but only if they trust that the ground under their feet will never be pulled away. Unity's 2023 runtime-fee disaster proved what happens when you don't make this commitment up front (see `docs/prior-art/unity.md`).

Contributions are welcome from anyone. AI agents, individual developers, studios, companies. All evaluated on technical merit by the AI merge system. → `docs/architecture/05-adr/0004-mit-license.md`.

---

## The Flywheel

```
            AI teams build the engine
                       │
                       ▼
         Nexus ships demo games proving it works
                       │
                       ▼
     Indie devs adopt → free, AI-native, weekend MVPs
                       │
                       ▼
        Indie games prove Nexus in production
                       │
                       ▼
   Studios notice → migrate → cut licensing costs to zero
                       │
                       ▼
   Community contributes genre modules, style packs, tools
                       │
                       ▼
   AI merge system integrates contributions in minutes not months
                       │
                       ▼
   Engine improves faster than any proprietary engine can follow
                       │
                       ▼
    More developers migrate → more contributors → faster growth
                       │
                       ▼
       Nexus becomes the default game engine for the AI era
                       │
                       └──────► (loop back to top, accelerating)
```

### Why this flywheel spins faster than Linux's did

Linux took thirty years to reach this flywheel. Nexus reaches it in two. The differentiator: the AI merge system removes the human bottleneck that throttled every open source project in history.

| Bottleneck (historic OSS) | Nexus answer |
|---|---|
| Maintainer burnout / bus factor | `nexus-merge` is the maintainer. No bus factor. |
| PR review queue (weeks-months) | Sub-hour merge median target. |
| Architectural drift across contributors | Spec-before-code (Law 2). Merge bot rejects un-spec'd PRs. |
| Documentation lag | Docs ship in the same PR as code. Merge bot enforces. |
| Hostile licensing changes | Law 7 (MIT forever). Re-licensing requires unanimous contributor vote, which is structurally impossible. |
| Platform fragmentation | Single Rust toolchain, single wgpu backend, single workspace. → `docs/architecture/04-workspace-layout.md`. |

---

## Success Metrics

Concrete, measurable, public. The flywheel is real or it is not.

### Nexus v1.0 — Foundation

- A solo developer ships a playable, polished game prototype in **48 hours** using only Nexus and AI agents. Walkthrough: `docs/game-template/weekend-mvp.md`.
- A small team (2–3 people) ships a complete indie game in **one month**.
- Demo **RPG, FPS, and RTS** built on Nexus are publicly playable on Linux, Windows, macOS, Web. → `docs/games/overview.md`.
- The engine runs on Linux, Windows, macOS, Android, iOS, and web with a single codebase. Verified by CI matrix.
- The AI merge system handles **100+ PRs/day** without human intervention.
- **1,000+** external contributors have merged at least one PR.
- **Cold-start to running game** in `nexus new mygame && nexus run`: < 60 seconds.
- **Engine cold compile** (release, full workspace): < 5 min on a 16-core dev box. [BENCHMARK NEEDED]

### Nexus v2.0 — Scale

- A team of five ships a game of **Dota 2 complexity** in under six months. → `docs/game-template/aaa-path.md`.
- **10,000+** games built on Nexus.
- Community has contributed genre modules covering every major game type.
- Nexus is the default recommendation for any AI-assisted game development project.
- **One AAA studio** (>100 staff) has migrated a shipping game.

### Anti-metrics (we explicitly do NOT measure)

- GitHub stars
- Twitter/X follower count
- Conference attendance
- Awards
- Comparison benchmarks vs Unreal/Unity in synthetic scenes

We measure shipped games. That is the only number that matters.

---

## Who This Is For

**The solo developer** who has a great game idea and a large token budget but no team, no art skills, no engine expertise. Nexus and an AI agent should be enough.

**The indie studio** that can not afford Unity or Unreal royalties and wants full control over their engine. Nexus gives them a AAA-quality engine for free.

**The AI coding agent** that needs structured, machine-readable APIs, headless operation, telemetry by default, and deterministic replay. Nexus is the only engine designed for you. → `docs/specs/agent/overview.md`.

**The established studio** that is tired of being at the mercy of Epic and Unity's pricing decisions. Nexus is MIT licensed and always will be.

**The modder and reverse engineer** who wants to understand how games work at the deepest level. Nexus is fully open source, fully documented, and built to be read.

**The community contributor** who wants to build the genre module or style pipeline they always wished existed. Nexus has a clear contribution path and an AI merge system that evaluates your work on merit alone. → `docs/guides/contribution.md`.

---

## The Commitment

Nexus will never:
- Charge royalties
- Introduce a "paid tier" to the core engine
- Change the license
- Be acquired and closed
- Have a single human maintainer as a point of failure

Nexus will always:
- Be MIT licensed
- Be fully open source
- Run on every major platform
- Treat AI agents as first-class users
- Accept contributions evaluated on technical merit alone
- Ship working software over perfect architecture

---

*This document is the constitution. When in doubt, come back here.*
*Laws derived from this constitution: `docs/architecture/01-principles.md`.*
