<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-game-template — Directory Structure

> The full on-disk layout produced by `nexus new mygame`. Every directory has one owner, one purpose, one spec.

## Boundaries
- Owns: the directory tree, conventions, naming rules.
- Does NOT own: the contents of each subsystem (those live in their own specs).
- Depends on: `→ docs/game-template/nexus-toml.md`, `→ docs/game-template/cli.md`.

## Top-Level Tree

```
mygame/
├── Nexus.toml                  # the manifest — single source of truth
├── Cargo.toml                  # virtual workspace for all Rust crates
├── README.md                   # generated; project tagline + quickstart
├── LICENSE                     # MIT by default; switchable at `nexus new --license`
├── .gitignore
├── .nexusignore                # excluded from asset packing / agent indexing
├── .github/                    # CI, nexus-merge config, PR templates
│   ├── workflows/
│   │   ├── nexus-ci.yml        # nexus test + nexus build per platform
│   │   └── nexus-merge.yml     # AI merge bot hook → docs/guides/merge-system.md
│   └── pull_request_template.md
│
├── game/                       # the playable client (Rust, links nexus-engine)
├── server/                     # authoritative game server (Rust, headless)
├── web/                        # marketing site + web build host (TS, web client wrapper)
├── mobile/                     # companion app: friends, stats, push (TS / native)
├── infra/                      # IaC: cloud, k8s, edge, CDN, relay servers
├── dlc/                        # downloadable content packs (assets + scripts)
├── mods/                       # first-party mods + community mod loader spec
├── ai-agents/                  # .claude/agents config + scenario runners
├── assets/                     # source-of-truth game assets (pre-pipeline)
├── scenes/                     # scene files (TOML or .nxscene binary)
├── scripts/                    # gameplay scripts (Lua / Rune)
├── shaders/                    # WGSL shader source
├── specs/                      # per-feature specs (spec-driven dev)
├── tests/                      # integration + scenario tests
├── benchmarks/                 # perf benchmarks (criterion)
├── tools/                      # one-off dev tools, asset converters
└── target/                     # Cargo build output (gitignored)
```

## game/ — Client Crate

```
game/
├── Cargo.toml                  # depends on nexus-engine, nexus-genre-{...}
├── src/
│   ├── main.rs                 # 30 lines: setup app + plugins, run
│   ├── lib.rs                  # re-exports for tests + scenario runner
│   ├── plugins/                # one Bevy-style plugin per feature
│   │   ├── mod.rs
│   │   ├── player.rs
│   │   ├── world.rs
│   │   └── ui.rs
│   ├── systems/                # ECS systems
│   ├── components/             # ECS components
│   ├── events/                 # typed events
│   └── prelude.rs
├── tests/                      # unit + integration tests for this crate
└── benches/                    # criterion benchmarks
```

## server/ — Authoritative Server Crate

```
server/
├── Cargo.toml                  # depends on nexus-engine (headless features), tokio
├── src/
│   ├── main.rs                 # `nexus run --headless --role=server`
│   ├── lib.rs
│   ├── auth.rs                 # token validation, session
│   ├── lobby.rs                # → docs/specs/networking/lobby.md
│   ├── relay.rs                # → docs/specs/networking/transport.md
│   ├── replication.rs          # → docs/specs/networking/replication.md
│   └── persistence.rs          # save state, leaderboards, accounts
├── migrations/                 # SQL migrations for persistence layer
├── tests/
└── Dockerfile                  # production container; `nexus deploy server`
```

## web/ — Web Client Wrapper + Marketing Site

```
web/
├── package.json                # pnpm workspace member
├── turbo.json                  # task graph for web sub-monorepo
├── apps/
│   ├── play/                   # WASM client wrapper; loads game/ via wgpu/WebGPU
│   │   ├── src/
│   │   ├── public/
│   │   └── vite.config.ts
│   └── marketing/              # landing page, blog, docs (Next.js or Astro)
│       ├── src/
│       └── content/
├── packages/
│   ├── ui/                     # shared React components
│   ├── api-client/             # typed client for server/ REST/gRPC
│   └── analytics/              # privacy-respecting telemetry
└── README.md
```

## mobile/ — Companion App

```
mobile/
├── package.json                # React Native or Expo
├── app.config.ts
├── src/
│   ├── screens/                # friends, profile, leaderboards, news
│   ├── components/
│   ├── api/                    # uses web/packages/api-client
│   └── push/                   # push notifications
├── ios/                        # native iOS shell
├── android/                    # native Android shell
└── README.md
```

> Mobile is the **companion**, not the game itself. The game runs on mobile via `nexus build --target=android|ios` from `game/`. Mobile companion exists for out-of-game social/stats features.

## infra/ — Infrastructure as Code

```
infra/
├── terraform/                  # cloud resources: VPC, k8s, CDN, DB
│   ├── modules/
│   ├── envs/
│   │   ├── dev.tfvars
│   │   ├── staging.tfvars
│   │   └── prod.tfvars
│   └── main.tf
├── k8s/                        # game server + matchmaker + relay manifests
│   ├── base/
│   └── overlays/{dev,staging,prod}/
├── edge/                       # CDN cache rules, edge functions
├── relay/                      # relay server topology (multi-region)
└── README.md
```

## dlc/ — Downloadable Content Packs

```
dlc/
├── manifest.toml               # registry of all DLC packs
├── packs/
│   ├── halloween-2026/
│   │   ├── Pack.toml           # name, version, dependencies, signing key
│   │   ├── assets/
│   │   ├── scripts/
│   │   ├── scenes/
│   │   └── README.md
│   └── season-1/
└── README.md
```

> Each pack is a sandboxed bundle. Loaded at runtime via `nexus-engine`'s asset registry → `docs/specs/assets/registry.md`.

## mods/ — Mod Support

```
mods/
├── manifest.toml               # mod loader config, capability defaults
├── api/                        # exposed mod API surface (Rune / Lua bindings)
│   ├── README.md               # → docs/specs/scripting/sandbox.md
│   └── bindings.toml
├── official/                   # first-party mods (act as exemplars)
│   └── starter-mod/
│       ├── Mod.toml
│       ├── src/
│       └── assets/
└── community/                  # gitignored; community installs land here
```

## ai-agents/ — Agent-First Configuration

```
ai-agents/
├── .claude/
│   ├── agents/                 # per-task agent prompts
│   │   ├── gameplay-dev.md
│   │   ├── balance-tuner.md
│   │   ├── content-designer.md
│   │   ├── qa-runner.md
│   │   └── perf-engineer.md
│   ├── skills/                 # reusable skills mounted into all agents
│   │   ├── nexus-sdk.md
│   │   └── scenario-author.md
│   └── settings.json           # hooks, allowlists, env
├── scenarios/                  # TOML scenarios → docs/specs/agent/scenarios.md
│   ├── smoke.toml
│   ├── balance/
│   └── regression/
├── replays/                    # snapshots + input streams → docs/specs/agent/replay.md
├── telemetry/                  # collected telemetry samples for analysis
└── README.md                   # agent onboarding for THIS game
```

## assets/ — Source Assets

```
assets/
├── models/                     # .gltf, .fbx source; pipeline emits .nxmesh
├── textures/                   # .png, .exr source; pipeline emits compressed
├── audio/                      # .wav, .ogg, .flac source
├── fonts/
├── shaders/                    # (symlinked from /shaders/ for convenience)
├── animations/
├── vfx/                        # particle defs
├── locales/                    # i18n strings
└── generated/                  # AI-generated assets (Meshy/Scenario/FLUX cache)
```

> Source assets live here. Built/compressed assets land in `target/assets/` (gitignored).

## specs/ — Spec-Driven Development

```
specs/
├── README.md                   # spec format → mirrors docs/initial/spawn.md SPEC FORMAT
├── features/
│   ├── player-movement.md
│   ├── inventory.md
│   └── boss-fight-01.md
├── balance/
│   ├── damage-curves.md
│   └── economy.md
└── content/
    ├── act-1.md
    └── act-2.md
```

> No code without a spec. AI agents read these before generating implementation.

## tests/ — Integration + Scenario Tests

```
tests/
├── integration/                # Rust integration tests across crates
├── scenarios/                  # `nexus test --scenarios` runs these headlessly
│   ├── new-game-flow.toml
│   ├── multiplayer-handshake.toml
│   └── save-load-roundtrip.toml
└── fixtures/                   # canned save files, replay inputs
```

## tools/ — Project-Specific Tooling

```
tools/
├── asset-importer/             # custom asset converter (Rust binary)
├── balance-sim/                # standalone Monte Carlo balance simulator
└── localization-sync/          # i18n sync with translation service
```

## Generated / Gitignored

| Path | Purpose |
|---|---|
| `target/` | Cargo build artifacts |
| `node_modules/` | web/ + mobile/ deps |
| `.nexus/` | local cache: asset hashes, agent state, scenario cache |
| `dist/` | `nexus build` output bundles |
| `.env*` | secrets (never committed) |

## Conventions

| Rule | Enforcement |
|---|---|
| Every Rust crate has `tests/` and `benches/` | `nexus lint` fails if missing |
| Every feature has a spec in `specs/features/` | `nexus lint --spec` checks |
| Every scenario is reproducible (seed pinned) | scenario runner asserts |
| Every CLI command accepts `--json` | `nexus lint --cli` verifies |
| Every asset is content-addressed (BLAKE3) | asset pipeline emits manifest |

## Cross-Agent Flags
- `[AGENT: 02]` `core/` crate names in `game/Cargo.toml` deps depend on final ECS crate naming
- `[AGENT: 09]` asset pipeline output paths in `target/assets/` mirror registry spec
- `[AGENT: 10]` `ai-agents/` directory schema mirrors agent SDK config
- `[AGENT: 16]` `.github/workflows/nexus-merge.yml` references merge bot config

## Open Questions
- `[DECISION NEEDED]` `scenes/`: TOML-first vs binary-first vs both
- `[DECISION NEEDED]` `web/` package manager: pnpm vs bun
- `[DECISION NEEDED]` Whether `mobile/` ships React Native default or Flutter option
