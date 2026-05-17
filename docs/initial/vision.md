<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Vision

**Version:** 0.1.0-draft  
**Status:** Living document. All AI teams, all contributors, all decisions trace back here.

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

## The Ecosystem

Nexus is not just an engine. It is a full ecosystem:

**nexus-engine** — The core. ECS, renderer, physics, audio, networking, scripting, asset pipeline, style modules, genre modules, agent API, editor. The engine itself. 100M+ LOC at maturity, built and maintained by AI teams.

**nexus-cli** — The Rails equivalent. `nexus new mygame` scaffolds a complete, production-ready game monorepo in seconds. Convention over configuration, but fully ejectable.

**nexus-agent-sdk** — The AI developer toolkit. Every AI coding agent that works on a Nexus project uses this SDK. Headless simulation, structured telemetry, scenario testing, state snapshots — everything an agent needs to build and debug without ever touching a screen.

**nexus-assets** — The asset layer. Connects to open source libraries (Kenney, OpenGameArt, Poly Haven, ambientCG), paid AI generation platforms (Meshy, Scenario), and self-hosted open source generation models (FLUX). One command finds, generates, validates, and imports any asset.

**nexus-merge** — The AI maintainer. Every PR to every Nexus repository is evaluated by an AI merge system: static analysis, test validation, architecture compliance, security audit, license check. Consistent, fast, political-free, never burns out.

**nexus-game-template** — The developer monorepo. Every game built on Nexus starts here: game core, server, web, mobile companion, infra, DLC, mods, AI agents. A single developer can manage the entire stack.

---

## Platform Targets

Nexus runs everywhere. Non-negotiable.

| Platform | Target | Status |
|---|---|---|
| Linux | Primary development platform | v1.0 |
| Windows | Full support | v1.0 |
| macOS | Full support | v1.0 |
| Android | Full support | v1.0 |
| iOS | Full support | v1.0 |
| Web (WASM) | Full support via wgpu/WebGPU | v1.0 |
| Nintendo Switch | Best effort | v1.1 |
| PlayStation 5 | Best effort | v1.1 |
| Xbox Series X | Best effort | v1.1 |
| VR (OpenXR) | Full support | v1.1 |

---

## Style Targets

Nexus renders everything. No engine should force a visual style.

- Photorealistic (PBR, ray tracing, volumetrics, Lumen-style GI)
- Stylized / cartoon (NPR, cel shading, outlines, toon lighting)
- Pixel art (palette systems, chunky rasterization, retro filters)
- 2D (sprites, tilemaps, parallax, 2D lighting)
- Hand-drawn / painterly (custom shader pipelines)
- Mixed (photorealistic world, cartoon characters — fully supported)

---

## Genre Targets

Nexus ships genre modules for every major game type:

FPS · TPS · RPG · MMORPG · RTS · MOBA · Platformer · Metroidvania · Racing · Fighting · Horror · Survival · Battle Royale · Tower Defense · Puzzle · Visual Novel · Simulation · Sports · Rhythm · Roguelike

Each is a plug-in module declared in `Nexus.toml`. One line to add a full genre system.

---

## The AI-First Mandate

Every system in Nexus must satisfy the AI-first mandate:

1. **Machine-readable errors.** Every error is structured JSON with `code`, `message`, `location`, `suggested_fix`.
2. **Full telemetry by default.** Every system emits structured telemetry every frame. No configuration required.
3. **Headless operation.** Every system runs without a display, GPU optional, at simulation speed.
4. **Serializable state.** The complete game state — every entity, every component, every system state — is serializable and deserializable at any point.
5. **Deterministic replay.** Given the same initial state and input sequence, the engine produces identical output. Always.
6. **Semantic APIs.** APIs are named for what they mean, not how they work. `engine.spawn("dragon near castle")` is a valid call.
7. **Documented contracts.** Every public API has a machine-readable contract: inputs, outputs, side effects, performance characteristics.

---

## The Open Source Mandate

Nexus is MIT licensed. Everything. Forever.

No dual licensing. No open core. No "community edition" with a paid "pro" tier. The entire engine, every module, every tool — MIT.

Why: because the community will build on it, extend it, ship games with it, and contribute back — but only if they trust that the ground under their feet will never be pulled away. Unity's 2023 pricing disaster proved what happens when you don't make this commitment up front.

Contributions are welcome from anyone. AI agents, individual developers, studios, companies. All evaluated on technical merit by the AI merge system.

---

## The Flywheel

```
AI teams build the engine
        ↓
Nexus ships demo games proving it works
        ↓
Indie devs adopt → free, AI-native, weekend MVPs
        ↓
Indie games prove Nexus in production
        ↓
Studios notice → migrate → cut licensing costs to zero
        ↓
Community contributes genre modules, style packs, tools
        ↓
AI merge system integrates contributions in minutes not months
        ↓
Engine improves faster than any proprietary engine can follow
        ↓
More developers migrate → more contributors → faster growth
        ↓
Nexus becomes the default game engine for the AI era
```

Linux took thirty years to reach this flywheel. Nexus reaches it in two, because the AI merge system removes the human bottleneck that throttled every open source project in history.

---

## Success Metrics

Nexus v1.0 is successful when:

- A solo developer ships a playable, polished game prototype in 48 hours using only Nexus and AI agents
- A small team (2-3 people) ships a complete indie game in one month
- A demo RPG, FPS, and RTS built on Nexus are publicly playable
- The engine runs on Linux, Windows, macOS, Android, iOS, and web with a single codebase
- The AI merge system handles 100+ PRs per day without human intervention
- 1,000+ external contributors have merged at least one PR

Nexus v2.0 is successful when:

- A team of five ships a game of Dota 2 complexity in under six months
- 10,000+ games are built on Nexus
- The community has contributed genre modules covering every major game type
- Nexus is the default recommendation for any AI-assisted game development project

---

## Who This Is For

**The solo developer** who has a great game idea and a large token budget but no team, no art skills, no engine expertise. Nexus and an AI agent should be enough.

**The indie studio** that can not afford Unity or Unreal royalties and wants full control over their engine. Nexus gives them a AAA-quality engine for free.

**The AI coding agent** that needs structured, machine-readable APIs, headless operation, telemetry by default, and deterministic replay. Nexus is the only engine designed for you.

**The established studio** that is tired of being at the mercy of Epic and Unity's pricing decisions. Nexus is MIT licensed and always will be.

**The modder and reverse engineer** who wants to understand how games work at the deepest level. Nexus is fully open source, fully documented, and built to be read.

**The community contributor** who wants to build the genre module or style pipeline they always wished existed. Nexus has a clear contribution path and an AI merge system that evaluates your work on merit alone.

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