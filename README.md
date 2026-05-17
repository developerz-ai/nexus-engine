<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# 🌌 Nexus Engine

> **The Linux of game engines.** Open source. AI-first. Cross-platform. Built by AI, maintained by AI, for AI agents and human developers — together.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built with AI](https://img.shields.io/badge/built%20by-AI-blueviolet)](docs/initial/vision.md)
[![Spec-driven](https://img.shields.io/badge/spec--driven-yes-brightgreen)](docs/guides/spec-format.md)
[![Status](https://img.shields.io/badge/status-pre--alpha%20·%20docs--first-orange)](docs/initial/vision.md)

---

## ⚡ The Pitch

Every game engine ever built assumed a human developer sat at a keyboard. **Nexus is the first one that doesn't.**

A solo developer with AI should ship a AAA game in a weekend. A small team should ship a Dota-complexity game in months. Fans should extend the best games of all time within days of release. The barrier between *idea* and *shipped multiplayer game* should be measured in token budget, not man-years.

That is the design target. Every line of every spec is judged against it.

---

## 🧱 The Ecosystem

| Layer | What it is |
|---|---|
| 🎮 **nexus-engine** | The core. ECS · renderer · physics · audio · networking · scripting · assets · editor. 100M LOC at maturity. |
| 🛠 **nexus-cli** | `nexus new mygame` — Rails-style scaffolding. Convention over configuration, ejectable. |
| 🤖 **nexus-coder** | In-house AI coding agent. Vercel AI SDK + OpenRouter. Massively parallel. Model-swappable mid-project. |
| 🧪 **nexus-agent-sdk** | The headless API every AI dev tool executes against. Telemetry · scenarios · snapshots · replay. |
| 🔌 **nexus-mcp-server** | Model Context Protocol server wrapping the agent RPC. One server, every MCP host (Claude Desktop · Claude Code · Cursor · Zed · ChatGPT Desktop · browser). |
| 🎨 **nexus-assets** | One command finds, generates, validates, imports. Meshy · Scenario · FLUX local · Kenney · Poly Haven. |
| 🔀 **nexus-merge** | AI maintainer. Reviews every PR. No politics. No burnout. No bus factor. |
| 📦 **nexus-game-template** | The monorepo every game starts from. Game · server · web · mobile · DLC · mods · ai-agents. |
| 🦀 **nexus-crates ecosystem** | The Rust-native compile-time extension layer (genres, styles, physics, netcode, telemetry sinks, asset sources, …). → [`docs/specs/crates/overview.md`](docs/specs/crates/overview.md) |
| 🛰 **nexus-hub** | Federated **index + curation + verification** layer over crates.io / mod marketplaces / asset libraries. JSON-first. Self-hostable. → [`docs/specs/hub/overview.md`](docs/specs/hub/overview.md) |

**Editor scope.** The native editor is narrow on purpose: asset/level quick-load, place/transform, scene tree + inspector, replay scrubber, telemetry overlays. Not a code editor. Every editor button = one agent RPC. The editor is a fast human cursor over the AI's keyboard.

---

## 🚀 Quick Start *(target — pre-alpha)*

```bash
# install
curl -fsSL https://nexus-engine.dev/install.sh | bash

# scaffold a new game
nexus new mygame --genre fps --style npr
cd mygame

# run with hot reload
nexus dev

# let an AI subagent build a feature for you
nexus coder implement docs/specs/genres/fps.md#weapon-system

# ship it
nexus release --to steam,itch,web
```

---

## 🧠 AI-First, Not AI-Bolted-On

Every system in Nexus satisfies the **AI-First Mandate**:

| ✓ | Capability |
|---|---|
| ✅ | Machine-readable errors — every error is structured JSON with `code`, `location`, `suggested_fix` |
| ✅ | Telemetry by default — every system streams structured events per frame |
| ✅ | Headless operation — every system runs without a display, deterministic replay |
| ✅ | Serializable state — full game state captureable and patchable at any frame |
| ✅ | Semantic APIs — `engine.spawn("dragon near castle")` is a valid call |
| ✅ | Documented contracts — every public API has a machine-readable shape |

---

## 🧩 Modding — 100% Power, Out of the Box

Every Nexus game is **moddable to total-conversion depth** by default. Cosmetic mods are zero-friction. Gameplay mods get capability prompts. Total conversions are first-class. The engine takes **zero cut** of any creator economy. Skyrim · DotA · GMod · Factorio · Minecraft modpacks — all of it, supported.

→ [`docs/specs/mods/overview.md`](docs/specs/mods/overview.md)

---

## 🖥 Platform Targets

| Platform | Status |
|---|---|
| 🐧 Linux | v1.0 — primary dev platform |
| 🪟 Windows | v1.0 |
| 🍎 macOS | v1.0 |
| 🤖 Android | v1.0 |
| 📱 iOS | v1.0 |
| 🌐 Web (WASM + WebGPU) | v1.0 |
| 🎮 Switch / PS5 / Xbox | v1.1 (best-effort, NDA-gated) |
| 🥽 VR (OpenXR) | v1.1 |

---

## 📚 Documentation

Nexus is **spec-driven** — no code is written until its spec exists. The complete spec tree lives in [`docs/`](docs/).

- 📜 [**Vision**](docs/initial/vision.md) — the constitution
- 🧭 [**docs/README.md**](docs/README.md) — entrypoint by role (new contributor · AI dev · game dev · modder · maintainer)
- 🗂 [**docs/INDEX.md**](docs/INDEX.md) — flat index of every doc
- 🧷 [**docs/INTEGRATION-REPORT.md**](docs/INTEGRATION-REPORT.md) — post-32-agent integration state (conflicts resolved, decisions open, what's safe to start on)
- 🧪 **Solved-problems catalog** (voxel · falling-sand · 2.5D · massive RTS · seamless world · destruction · weather · procgen · sim · rhythm · text-heavy · 4X · heavy particles) → [`docs/architecture/08-compose-dont-build.md`](docs/architecture/08-compose-dont-build.md)
- 🏛 [**Architecture**](docs/architecture/) — system map · principles · tech stack · ADRs
- 🔧 [**Specs**](docs/specs/) — every subsystem, AI dev teams execute against these
- 🤝 [**Contracts**](docs/contracts/) — exact boundaries between systems
- 🎯 [**Genre modules**](docs/specs/genres/) — fps · rpg · rts · moba · platformer · racing · ...
- 🛠 [**Guides**](docs/guides/) — coding style · testing · deploy · release · liveops · modding · PR workflow

---

## 🤖 For AI Agents Working in This Repo

The repo ships a complete `.claude/` orchestration layer.

| Path | Purpose |
|---|---|
| 🧠 [`CLAUDE.md`](CLAUDE.md) | Mastermind orchestrator — read first |
| 🎭 `.claude/agents/` | 118 specialist subagents (architect · network-engineer · rollback-specialist · crash-triager · mcp-server-engineer · ide-extension-engineer · editor-rpc-parity-auditor · mod-author · mod-curator · nexus-hub-operator · ...) |
| ⚡ `.claude/commands/` | Project slash commands (`/spec /contract /impl /scenario /bench /triage /review /parallel`) |
| 🔧 `.claude/skills/` | PR-workflow skills (`open-pr / wait-for-ci / babysit-pr / coderabbit-triage / coderabbit-resolve`) |
| 🐰 [`.coderabbit.yaml`](.coderabbit.yaml) | CodeRabbit config tuned for Nexus principles |
| 📜 `scripts/` | Tested, parameterized CLIs designed for agents to read · execute · trust |

The default expectation: dozens of subagents in flight, in parallel, all the time. The dev orchestrates; the agents work; the reviewers gate.

---

## 🤝 Contributing

Humans and AI agents follow the **same process**. Read [`docs/guides/contribution.md`](docs/guides/contribution.md) and [`docs/guides/ai-dev-onboarding.md`](docs/guides/ai-dev-onboarding.md).

The TL;DR:
1. Read [`docs/initial/vision.md`](docs/initial/vision.md) (the constitution).
2. Read [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) (the 15 binding laws).
3. Find or write the spec for what you're changing.
4. Write tests first.
5. Implement.
6. Open PR — the [merge-bot](docs/guides/merge-system.md) reviews on technical merit alone.

---

## 📜 License

**MIT. Forever.** No dual licensing. No open core. No "community edition" with a paid pro tier. The entire engine, every module, every tool — MIT. [Why](docs/architecture/05-adr/0004-mit-license.md).

---

## ⭐ The Commitment

Nexus will never:
- ❌ Charge royalties
- ❌ Introduce a paid tier
- ❌ Change the license
- ❌ Be acquired and closed
- ❌ Have a single human maintainer as a point of failure

Nexus will always:
- ✅ Be MIT
- ✅ Be fully open source
- ✅ Run on every major platform
- ✅ Treat AI agents as first-class users
- ✅ Accept contributions on technical merit alone
- ✅ Ship working software over perfect architecture

---

*Built by AI. Maintained by AI. For everyone who ever wanted to ship a game.* 🚀
