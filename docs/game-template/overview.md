<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-game-template — Overview

> The Rails-equivalent developer monorepo. One command (`nexus new mygame`) scaffolds a complete, production-ready game stack: client, server, web, mobile, infra, DLC, mods, AI agents.

## Boundaries
- Owns: the **game project layout**, the `Nexus.toml` manifest, the `nexus` CLI scaffold/build/deploy pipeline, the `.claude/agents/` config bundled into every new game.
- Does NOT own: the engine itself (`→ docs/architecture/04-workspace-layout.md`), genre logic (`→ docs/specs/genres/`), the agent SDK (`→ docs/specs/agent/sdk.md`), the AI merge bot (`→ docs/guides/merge-system.md`).
- Depends on: `nexus-engine` crates (consumed via Cargo), `nexus-agent-sdk` (consumed via Rust + Python bindings), `nexus-assets` (asset generation/resolution).

## Relation to nexus-engine

```
nexus-engine repo (engine source, 100M LOC at maturity)
        │
        │  published as Cargo crates + binaries
        ▼
nexus CLI (nexus new, nexus build, nexus deploy)
        │
        │  scaffolds
        ▼
nexus-game-template (THIS SPEC) ──► your-game/ monorepo
        │
        │  declares
        ▼
Nexus.toml ──► pulls engine modules, style, genres, platforms
```

Engine is upstream. Template is the **downstream contract** that every game built on Nexus shares — same layout, same manifest, same CLI, same agent surface.

## Design Goals

| Goal | Mechanism |
|---|---|
| Solo dev ships AAA in a weekend | Convention over configuration; sensible defaults for every subsystem |
| AI agents are first-class users | `.claude/agents/` shipped in-repo; every CLI command has `--json` |
| One codebase → every platform | `nexus build --target` covers Linux/Win/Mac/Android/iOS/Web/Console |
| Full stack in one repo | game + server + web + mobile + infra + dlc + mods + ai-agents |
| Ejectable | No magic; every generated file is human-readable and overridable |
| Spec-driven | Template enforces the spec layout: `specs/`, `tests/`, `benchmarks/` per feature |

## What a Nexus Game Is

A Nexus game is a **Cargo workspace + asset tree + Nexus.toml manifest + ai-agents config**. It is:
- A monorepo (Turborepo-style apps/packages discipline, Cargo-native, polyglot for the web/mobile sub-apps)
- A spec-driven project (every feature has a spec before code)
- A headless-by-default simulation (the binary runs without a display for CI, agents, scenarios)
- A deployable bundle (platform-specific binaries + asset packs + server image + web build + mobile companion)

→ See `docs/game-template/structure.md` for the full tree.
→ See `docs/game-template/nexus-toml.md` for the manifest spec.
→ See `docs/game-template/cli.md` for the CLI reference.
→ See `docs/game-template/weekend-mvp.md` for the 48h walkthrough.
→ See `docs/game-template/aaa-path.md` for the multi-year scale path.

## Prior Art

| Reference | What we take | What we change |
|---|---|---|
| Rails `rails new` | Convention over configuration, generators, opinionated layout | AI-first: every generator emits structured JSON when `--json` |
| `cargo new` / Bevy workspace | Cargo workspace as the spine; modular crates per feature | Bundle non-Rust apps (web, mobile, infra) in the same monorepo |
| Turborepo apps/packages | apps/* + packages/* discipline | Use it for the web/mobile/infra sub-apps; Cargo workspace for engine code |
| Nx polyglot | Single project graph across Rust/TS/Swift/Kotlin | Project graph is implicit via `Nexus.toml`, not a separate config |
| Vercel/Netlify deploy spec | One manifest declares deploy targets | `Nexus.toml [deploy]` is the single source |

## Cross-Agent Flags
- `[AGENT: 10]` agent SDK API surface — template's `ai-agents/` references it
- `[AGENT: 12]` genre modules — template includes one selected at `nexus new` time
- `[AGENT: 16]` AI merge system — template's `.github/` includes nexus-merge config
- `[AGENT: 17]` demo games — built FROM this template; serve as integration tests for it

## Open Questions
- `[DECISION NEEDED]` Default package manager for `web/` and `mobile/` sub-apps: pnpm (Turborepo-friendly) vs bun
- `[DECISION NEEDED]` Should `mods/` use Rune or Lua by default → see `docs/specs/scripting/overview.md`
- `[DECISION NEEDED]` Whether `infra/` ships Terraform, Pulumi, or both
