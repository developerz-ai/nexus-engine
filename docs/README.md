<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Docs

AI-first, MIT, cross-platform game engine. Built by AI, for AI agents and humans. Spec-driven.

Upstream sources of truth: `docs/initial/vision.md` (constitution) · `docs/initial/spawn.md` (mission + spec format).

---

## Tree

| Path | Purpose |
|---|---|
| `docs/initial/` | Original founder docs. Vision (constitution). Spawn (orchestrator mission). |
| `docs/architecture/` | System-wide decisions. Vision expansion, 12 principles, system map, tech stack, workspace layout, ADRs. |
| `docs/specs/` | Per-system specs. AI dev teams execute against these. One subdir per subsystem. |
| `docs/specs/core/` | ECS, memory, jobs, HAL, math, events. |
| `docs/specs/renderer/` | wgpu backend, render graph, PBR, shadows, GI, particles, post, shaders, terrain. |
| `docs/specs/physics/` | Rapier integration, rigid, collision, character, soft, fluid, determinism. |
| `docs/specs/audio/` | Audio graph, spatial, adaptive music, DSP, streaming, voice. |
| `docs/specs/networking/` | Rollback, replication, transport, lobby, anticheat. |
| `docs/specs/scripting/` | Lua, Rune, hot reload, sandbox. |
| `docs/specs/assets/` | Import, streaming, LOD, compression, AI generation, registry. |
| `docs/specs/styles/` | PBR, NPR, pixel, 2D, mixed. |
| `docs/specs/genres/` | FPS, RPG, MMORPG, RTS, MOBA, platformer, racing, etc. |
| `docs/specs/agent/` | Agent API, headless sim, telemetry, scenarios, replay, semantic, SDK. |
| `docs/specs/editor/` | Scene editor, asset browser, shader graph, debug, live reload. |
| `docs/contracts/` | Exact interface boundaries between subsystems. One file per pair. |
| `docs/prior-art/` | What each reference engine got right (✓) / wrong (✗). Synthesis, not copy. |
| `docs/guides/` | Style guide, glossary, formats, contribution, merge system, onboarding. |
| `docs/game-template/` | nexus-game monorepo spec — what `nexus new` scaffolds. |
| `docs/games/` | Demo games. They ARE the integration tests. |

ASCII map:

```
docs/
├── initial/              constitution + mission
├── architecture/         decisions, principles, ADRs
├── specs/                what to build (AI executes these)
│   ├── core/ renderer/ physics/ audio/ networking/
│   ├── scripting/ assets/ styles/ genres/
│   ├── agent/ editor/
├── contracts/            interface boundaries
├── prior-art/            ✓ / ✗ from existing engines
├── guides/               how to write/contribute
├── game-template/        nexus new mygame scaffold
└── games/                demo games = integration tests
```

---

## Reading order by role

### New human contributor
1. `docs/initial/vision.md` — what Nexus is, why it exists
2. `docs/architecture/01-principles.md` — the 12 binding laws
3. `docs/guides/style-guide.md` — how to write docs
4. `docs/guides/glossary.md` — vocabulary
5. `docs/guides/contribution.md` — how to land a PR
6. `docs/guides/pr-protocol.md` — PR shape (spec ref, tests, benchmarks, changelog)
7. Pick one `docs/specs/<area>/overview.md` matching your interest

### AI dev team (building a subsystem)
1. `docs/initial/vision.md`
2. `docs/architecture/01-principles.md`
3. `docs/architecture/02-system-map.md`
4. `docs/guides/ai-dev-onboarding.md`
5. Your assigned spec(s) — `docs/specs/<area>/*.md`
6. Every contract you depend on — `docs/contracts/*-<your-area>.md`
7. `docs/guides/spec-format.md` + `docs/guides/contract-format.md` if revising
8. Write tests first → implement → PR per `docs/guides/pr-protocol.md`

### Game developer (building on Nexus)
1. `docs/initial/vision.md` (skim)
2. `docs/game-template/overview.md`
3. `docs/game-template/cli.md` — `nexus new`, `add`, `generate`, `build`
4. `docs/game-template/nexus-toml.md` — config surface
5. `docs/game-template/weekend-mvp.md` — end-to-end walkthrough
6. `docs/specs/genres/<your-genre>.md`
7. `docs/specs/styles/<your-style>.md`
8. `docs/game-template/aaa-path.md` — when you grow past MVP

### Modder
1. `docs/initial/vision.md` (skim)
2. `docs/specs/scripting/overview.md` — Lua vs Rune
3. `docs/specs/scripting/sandbox.md` — capability model
4. `docs/specs/scripting/lua.md` or `rune.md`
5. `docs/specs/scripting/hotreload.md`
6. `docs/specs/assets/registry.md` — how to override/replace
7. `docs/game-template/structure.md` `mods/` section

### External maintainer (reviewing PRs, triaging)
1. `docs/initial/vision.md`
2. `docs/architecture/01-principles.md`
3. `docs/architecture/02-system-map.md`
4. `docs/architecture/05-adr/` — every major decision
5. `docs/guides/merge-system.md` — how nexus-merge decides
6. `docs/guides/pr-protocol.md`
7. `docs/guides/integration-team.md` — always-green main mandate
8. `docs/guides/adr-format.md` — when to require a new ADR

---

## Cross-cutting indexes

- `docs/INDEX.md` — flat alphabetical index of every doc file
- `docs/guides/glossary.md` — every term in one place
- `docs/guides/cross-linking.md` — how to reference other files

---

## Non-negotiable rules for docs

| Rule | See |
|---|---|
| MIT header on every `.md` | `docs/guides/file-conventions.md` |
| Ch.11 compressed style | `docs/guides/style-guide.md` |
| One-sentence summary block on every spec | `docs/guides/spec-format.md` |
| ASCII diagrams over prose for relationships | `docs/guides/style-guide.md` |
| No emojis except ✓ / ✗ | `docs/guides/style-guide.md` |
| Cross-link with `→ docs/...` | `docs/guides/cross-linking.md` |

---

## When in doubt

→ `docs/initial/vision.md` (constitution).
