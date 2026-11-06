<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Mastermind

Open source, AI-first, cross-platform game engine. Built BY AI, maintained BY AI, FOR AI agents + humans. MIT forever. Spec-driven. 100M LOC target.

## Response Rules
- Execute. No preamble. No restating.
- Lead with action. Reasoning after, only if non-obvious.
- Parallel tool calls when independent. Default: dispatch many subagents at once.
- Read before speculating. Read the spec before touching code.
- Disagree when wrong. State the correction.
- Terse. Fragments OK. Drop articles, filler, hedging.
- Code/commands/paths verbatim. Only prose gets compressed.

## Stack
| Tool | Version | Pin |
|---|---|---|
| Rust | 1.95 | `rust-toolchain.toml:6` (channel + rustfmt/clippy) |
| Bun | 1.4.4 | `scripts/.bun-version:1` |
| Biome | 1.9.4 | `scripts/package.json:14` |
| TypeScript | ^5.6.3 | `scripts/package.json:15` |
| cargo-nextest | 0.9.85 | `scripts/lib/versions.toml:11` |
| cargo-deny | 0.16.2 | `scripts/lib/versions.toml:12` |

Rust 1.95 · edition 2021 · MSRV 1.95 (`Cargo.toml:33,38`) — key deps, pinned to minor (`Cargo.toml:49-85`): wgpu 29 · rapier2d/3d 0.32 · glam 0.32 · mlua 0.11 · rune 0.14 · thiserror 2 · tokio 1 · quinn 0.11 · serde/serde_json · bincode 3 · toml 1.1 · tracing-subscriber 0.3 (json) · naga 29 · criterion 0.8 · proptest 1 · clap 4 · syn 2 · image 0.25 · gltf 1.4 · zstd 0.13.

## Commands
| Command | Effect |
|---|---|
| `./bin/setup` | rustup + channel from `rust-toolchain.toml`, bun (floor `scripts/.bun-version`), cargo-nextest/cargo-deny from `scripts/lib/versions.toml`, `bun install --frozen-lockfile`. Exit 69 = tool missing. |
| `./bin/check` | THE gate. Exit 69 = gate tool missing. |
| `./bin/dev` | `cargo run -p nexus-cli --` (`bin/dev:8`) |
| `./bin/stop` | no-op (`bin/stop:7`) |
| `bun run scripts/check` | TS gate set (`scripts/bin/check.ts:33`) |
| `bun test` | script tests (`package.json:8`) |

`./bin/check` chain (`bin/check:30`), verbatim:
```
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo check --workspace --all-targets && cargo nextest run --workspace --profile ci && cargo deny check && (cd scripts && bun test && bun x biome check .)
```
`bun run scripts/check` gates (`scripts/bin/check.ts:33`): fmt · clippy · biome · ruff · shellcheck · deny. naga is opt-in via `--only naga`, not in the default set.

## Structure
| Path | Count | Contents |
|---|---|---|
| `crates/` | 29 | 12 system + `crates/genres/` 16 + `crates/sdks/nexus-agent-sdk-rs` 1 · 58 `.rs` files |
| `packages/` | 6 | `packages/nexus-hal` system crate + `packages/styles/` 5 · 12 `.rs` files · HAL private Bun workspace adapter |
| system crates | 13 | `crates/nexus-core` `packages/nexus-hal` `crates/nexus-assets` `crates/nexus-renderer` `crates/nexus-physics` `crates/nexus-audio` `crates/nexus-net` `crates/nexus-script` `crates/nexus-agent` `crates/nexus-editor` `crates/nexus-cli` `crates/nexus-merge` `crates/nexus-engine` |
| `games/` | 4 | `games/nexus-fps` `games/nexus-platformer` `games/nexus-rpg` `games/nexus-rts` |
| `tools/` | 2 | `tools/nexus-codegen` `tools/nexus-scenario` |
| `scripts/` | 62 | Bun workspace · 14 scripts under `scripts/bin/` · one test per bin · count excludes `scripts/CLAUDE.md` |
| `docs/` | 413 `.md` | `docs/architecture/` · `docs/specs/` · `docs/contracts/` · `docs/guides/` · `docs/prior-art/` · `docs/game-template/` · `docs/games/` |
| `.claude/` | 119 / 14 / 15 | agents / commands / skills |

Cargo workspace = `crates/` + `packages/nexus-hal/` + `packages/styles/*` + `games/` + `tools/` (`Cargo.toml:10-30`). Bun workspace = `scripts/` + `packages/nexus-hal/` + `packages/styles/*` (`package.json:5`); HAL's private adapter adds no JS implementation, and styles remain Rust-only.

## Conventions
| Rule | Where |
|---|---|
| SPDX MIT header, first two lines, no blank line before | `docs/guides/file-conventions.md:12-21` · CI scans `crates/`, `packages/nexus-hal/`, `scripts/`, `docs/`, `.github/` (`.github/workflows/ci.yml:322`) |
| Rust: `#![forbid(unsafe_code)]`; every `unsafe` needs a `// SAFETY:` paragraph | `Cargo.toml:41` · Law 6 |
| Errors & logs: thiserror only; `anyhow` banned in `nexus-*`; no string-only errors; structured JSON to stderr, never `println!` outside `examples/`/`tests/` | `docs/architecture/03-tech-stack.md:185` · Law 10 · Law 11 |
| Rust hygiene: `cargo fmt --all` + `cargo clippy --all-targets -- -D warnings` before commit | `bin/check:30` |
| TS/JS: Biome is the only linter — `bun x biome check .` from `scripts/` | `scripts/CLAUDE.md:37` |
| WGSL: `naga` validates manually; the repo ships no shader sources and no gate runs one | `bin/setup:176` |
| Commit `<system>: <imperative>` · 50/72 | `CONTRIBUTING.md:21` |
| Branch `<system>/<short-desc>` | `CONTRIBUTING.md:17` |
| Never commit red — `cargo check --workspace` green | Law 4 · `Cargo.toml:5` |

## Non-Negotiables
The 15 Laws — `docs/architecture/01-principles.md`.

| # | Law | One-line test |
|---|---|---|
| 1 | AI-first | structured errors + JSON telemetry + headless drivable |
| 2 | Spec before code | every PR cites a `docs/specs/**` or `docs/contracts/**` path |
| 3 | Sacred module boundaries | crate touches only what its spec declares |
| 4 | Always compiles | `cargo check --workspace` green before push |
| 5 | Performance is a spec | every public API has a Performance Contract table |
| 6 | Zero unsafe without justification | `unsafe` block requires `// SAFETY:` paragraph |
| 7 | MIT forever | every source file has SPDX header |
| 8 | Headless by default | engine boots and runs with no display, no GPU |
| 9 | Deterministic replay | same seed + same inputs = byte-identical state |
| 10 | Structured errors only | no string-only errors in shipped code |
| 11 | Telemetry by default | every system emits per-frame structured trace |
| 12 | Tests ship with code | PR adds impl → PR adds unit + integration + scenario |
| 13 | Agent–Editor RPC parity | every editor button = one agent RPC; auditor blocks orphans |
| 14 | Opt-in modularity | no game compiles code it does not declare in `Nexus.toml` (manifest spec: `docs/game-template/nexus-toml.md`) |
| 15 | Extend, don't fork | engine-core src untouched without an ADR; use a crate / plugin / mod / script / RPC / editor override |

A PR that violates a law is rejected by `nexus-merge` without human review.

**Editor scope, MCP, and parity.** Editor narrow on purpose — quick-load + place + inspect + scrub + telemetry. NOT a code editor. NOT a long-form authoring suite. Every editor operation = one agent JSON-RPC method; the CI auditor that blocks orphan buttons and orphan editor-surface RPCs (Law 13) is **PLANNED, not installed** — `scripts/check-rpc-parity` is absent from this checkout, the `scripts/check` gate set has no parity gate (`scripts/bin/check.ts:33`), and the spec that promises the binary (`docs/specs/editor/rpc-parity.md:98`) describes a tool the repo has not landed. The MCP server (`docs/specs/agent/mcp-server.md`) is the public interop layer — one server, every MCP host. Code editing lives in VS Code / Cursor / Zed via post-v1.0 extensions (`docs/specs/editor/vscode-extension.md`, `docs/specs/editor/zed-extension.md`).

## The Four-Stage Pipeline (NEVER skip a stage)
`spec → contract → impl → test` · spec-author → contract-author → domain-engineer → test-author

1. **Spec.** New behavior → a spec under `docs/specs/` first. Use `docs/guides/spec-format.md`.
2. **Contract.** Crosses a system boundary → a contract under `docs/contracts/` first.
3. **Impl.** Domain engineer reads spec + contract, writes code in the crate the spec names.
4. **Test.** `test-author` adds unit + integration + scenario + property + visual (where applicable). Coverage floor per `docs/guides/testing/coverage.md`.

## Subagent Fleet
119 agents · 14 commands · 15 skills. Every task routes to a subagent; the routing table below names all 119. Independent tasks → dispatch N subagents in **one message**. Never serialize unless a downstream task literally needs an upstream artifact (impl needs the contract file written first).

Invoke via `Agent({ subagent_type: "<name>", prompt: "<task>" })`. The frontmatter `description` is the routing key (`docs/guides/subagent-fleet.md:68`).

**Never `isolation: worktree`.** Parallel subagents share this one checkout; give each a disjoint file set — crate boundaries are the natural lock — and keep shared roots (workspace `Cargo.toml`, docs indexes, and the per-game manifest `Nexus.toml` — schema `docs/game-template/nexus-toml.md`) with the coordinator. After every parallel batch → `integration-resolver`. Full doctrine: `docs/guides/parallelism-doctrine.md`.

## Subagent Fleet — Routing Table
| group | agents — when to delegate |
|---|---|
| architecture & spec authoring | `architect` (top-level architecture, ADR-worthy) · `spec-author` (new spec file or rewrite) · `contract-author` (new/revised contract) · `adr-author` (Nygard-format ADR) · `principle-keeper` (audit against the 15 laws) |
| core | `ecs-engineer` `memory-engineer` `jobs-engineer` `hal-engineer` `math-engineer` `events-engineer` · `massive-scale-engineer` (10k-100k RTS, seamless MMO) · `cellular-automata-engineer` (falling-sand, fluid pixels) · `voxel-engineer` (chunk, greedy mesh, light propagation) |
| renderer | `renderer-engineer` `shader-engineer` `pbr-specialist` `npr-specialist` `pixel-art-specialist` `twod-specialist` `mixed-style-specialist` · `two-and-a-half-d-specialist` (HD-2D, parallax-2D, billboard-3D) · `heavy-particles-specialist` (10M-100M GPU particles) |
| physics | `physics-engineer` `character-controller-specialist` `soft-body-specialist` `fluid-specialist` `determinism-auditor` |
| audio | `audio-engineer` `dsp-specialist` `spatial-audio-specialist` |
| networking | `network-engineer` `rollback-specialist` `replication-specialist` `transport-specialist` `anticheat-specialist` |
| scripting | `scripting-engineer` `lua-specialist` `rune-specialist` `hot-reload-specialist` · `mod-sandbox-specialist` (engine-side capability registry) |
| assets | `asset-pipeline-engineer` `asset-import-specialist` `asset-streaming-specialist` `asset-compression-specialist` `ai-asset-gen-specialist` `asset-registry-specialist` |
| agent API | `agent-api-engineer` `headless-sim-specialist` `telemetry-specialist` `scenario-author` `replay-engineer` `semantic-api-specialist` `agent-sdk-specialist` `mcp-server-engineer` |
| editor | `editor-engineer` `editor-debug-specialist` `live-reload-specialist` `ide-extension-engineer` · `editor-rpc-parity-auditor` (Law 13 — never approves a FAIL) |
| genres | `fps-genre` `rpg-genre` `mmorpg-genre` `rts-genre` `moba-genre` `platformer-genre` `racing-genre` `survival-genre` `horror-genre` `fighting-genre` `battleroyal-genre` `roguelike-genre` `towdef-genre` `puzzle-genre` `visualnovel-genre` `openworld-genre` — each owns its `docs/specs/genres/` spec + `crates/genres/` crate |
| quality & process | `code-reviewer` (final gate) · `security-reviewer` · `test-author` · `perf-engineer` · `fuzz-engineer` · `visual-regression-engineer` · `coverage-auditor` · `merge-bot` (full `nexus-merge` verdict) · `ci-engineer` · `docs-style-enforcer` · `glossary-keeper` · `prior-art-researcher` |
| coding agent, deploy, live-ops | `nexus-coder-architect` (owns `docs/specs/coder/`) · `deploy-engineer` · `release-engineer` · `codesigning-specialist` · `liveops-engineer` · `crash-triager` · `feature-flag-specialist` · `canary-and-rollback-engineer` · `hotfix-engineer` · `one-month-game-shepherd` |
| template & DX | `nexus-cli-engineer` (`nexus new/add/generate/build/test/deploy/agent`) · `game-template-engineer` · `onboarding-coach` · `quickstart-recipe-author` (`docs/guides/recipes/`) · `ts-script-author` (owns `scripts/`) |
| crates & supply chain | `crate-author` (author + publish on crates.io) · `crate-consumer-advisor` (pick a crate; build-vs-adopt) · `crate-curator` (audit + tier) · `license-compat-auditor` (`cargo deny` + `cargo audit`) |
| meta / orchestration | `orchestrator` (plan → parallel dispatch; never writes code) · `integration-resolver` (`[AGENT: XX]` cross-refs) · `decision-log-keeper` (`[DECISION NEEDED]`) · `benchmark-coordinator` (`[BENCHMARK NEEDED]`) |
| modding & hub | `mod-author` (`.nxmod` end-to-end) · `mod-curator` (submission audit) · `nexus-hub-operator` (run/operate a hub) · `hub-mirror-operator` (federation, identity-key TOFU) · `hub-crawler-engineer` (ingestion adapters) · `hub-curator` (moderation, badges) · `hub-recommender` (ranking) · `wasm-mod-author` ([DEFERRED v2.0] → `mod-author`/`crate-author`) |

## Project Slash Commands (`.claude/commands/`)
| command | purpose |
|---|---|
| `/spec <system>` | route to `spec-author` for that system |
| `/contract <a-b>` | route to `contract-author` |
| `/impl <spec-path>` | read spec → route to right engineer → impl + tests |
| `/feature <ask>` | end-to-end feature/bug sweep: understand → slice by crate → build → gate → PR → merge |
| `/planx <ask>` | write a self-contained execution plan for another AI — plan only, no implementation |
| `/scenario <name>` | author or run a TOML scenario |
| `/bench <crate>` | `perf-engineer` bench + baseline compare |
| `/triage` | `crash-triager` clusters + opens fix PRs |
| `/review` | `code-reviewer` + `security-reviewer` + `docs-style-enforcer` in parallel |
| `/parallel <task>` | `orchestrator` splits and dispatches |
| `/sync-glossary` | `glossary-keeper` sweep |
| `/release <store>` | `release-engineer` runs per-store recipe |
| `/deploy <env> <target>` | `deploy-engineer` runs per-target recipe |
| `/onboard` | `onboarding-coach` walks the user through |

## PR Pipeline (skills)
Every PR is driven end-to-end by `.claude/skills/babysit-pr/`. The mastermind invokes it and walks away — fixes, replies, CR-thread resolution, re-runs, merge all happen autonomously. Escalates to human only on kill-switch conditions (`docs/guides/mastermind-pr-loop.md`).

Canonical order: `/babysit-pr [PR#]` → `/open-pr` → `/wait-for-ci` → `/pr-rebase-and-recover` → `/wait-for-coderabbit` → `/coderabbit-triage` → `/fix-from-coderabbit` → `/coderabbit-reply` → `/coderabbit-resolve` → `/wait-for-ci` → `/pr-merge` → `/pr-changelog`.

| Skill | Purpose |
|---|---|
| `open-pr` | open PR from current branch (CC title + spec body + scenario list + bench deltas); draft until green |
| `wait-for-ci` | block until checks finish; emit JSON verdict; handle reruns + timeout |
| `wait-for-coderabbit` | block until `coderabbitai[bot]` posts review; re-trigger via @coderabbitai review |
| `coderabbit-triage` | classify each CR thread; emit accept/reject/discuss/resolve plan |
| `coderabbit-reply` | post threaded replies; rejection template cites principle anchor |
| `coderabbit-resolve` | mark threads resolved via GraphQL `resolveReviewThread` (REST cannot) |
| `fix-from-coderabbit` | apply accepted fixes via domain subagent; commit; push; resolve |
| `respond-to-cr-commands` | cheat sheet for `@coderabbitai review/full review/resolve/pause/summary` |
| `babysit-pr` | end-to-end driver; emits status JSON per tick for mastermind to parse |
| `pr-rebase-and-recover` | rebase on main; conflict heuristics; force-with-lease; restart CI |
| `pr-merge` | gate-check + squash-merge + delete branch + release-note line |
| `pr-changelog` | Keep-a-Changelog entry from Conventional Commit title + spec ref |
| `gh-graphql-helpers` | reusable `gh api graphql` snippets — single source of truth |
| `coderabbit-config` | when/how to evolve `.coderabbit.yaml` |
| `branch-conventions` | naming, base, draft, auto-merge, force-push policy (table-driven) |

CodeRabbit posts as `coderabbitai[bot]` (or `coderabbitai` on some API surfaces — both checked). **REST cannot resolve review threads** — use GraphQL `resolveReviewThread` (`.claude/skills/gh-graphql-helpers/SKILL.md` recipe #3). `nexus-merge` bot may approve in lieu of human review (`docs/guides/merge-system.md`).

Kill-switch (auto-escalation to human): 3 CR rounds without convergence → open `[ESCALATE]` issue, exit loop · CI red 2× same root cause → route to `ci-engineer`, pause pushes · merge conflict 2× same loop → route to `architect`, tag `needs-design-review` · touches `docs/architecture/00-vision.md` or `docs/architecture/01-principles.md` → require human + ADR, no auto-merge.

Full rules: `docs/guides/mastermind-pr-loop.md`. Workflow + SLOs: `docs/guides/pr-workflow.md`. CR reference: `docs/guides/coderabbit.md`. GraphQL recipes: `docs/guides/github-graphql-cookbook.md`.

CodeRabbit config: `.coderabbit.yaml` — schema `https://coderabbit.ai/integrations/schema.v2.json`; profile `assertive`; `request_changes_workflow: true`; auto-review on `main`; tone enforces the 15 Laws. Path-instructions cover `docs/specs/`, `docs/contracts/`, `docs/architecture/05-adr/`, `crates/**/src/**/*.rs`, `packages/nexus-hal/src/**/*.rs`, `*.wgsl`, `crates/**/benches/`, configs, `.github/workflows/`. Tools: shellcheck · markdownlint · github-checks · gitleaks · actionlint · yamllint · hadolint · biome · ruff.

## Crates ecosystem
Rust-native, compile-time extension lane (Law 14). Categories canonical in `docs/specs/crates/categories.md` (26 at integration: 14 original + 12 added by Agent 32). Discovery: `docs/specs/crates/discovery.md` (crates.io + lib.rs; secondary `nexus-hub` v1.0). Plugin trait + Rails analogy: `docs/specs/crates/plugin-trait.md`, `docs/specs/crates/rails-plugin-model.md`. Overview: `docs/specs/crates/overview.md`. Manifestos: `docs/architecture/06-modularity.md` (Law 14), `docs/architecture/07-extend-dont-fork.md` (Law 15).

## nexus-hub
Federated **index + curation + verification** layer — not storage. Crates live on crates.io, mods on marketplaces, assets on CC0 libraries. Hub indexes them all, adds Nexus-specific metadata, hosts signed verification attestations, serves JSON-first API. Ships **v1.0** (resolved 2026-05-17). Spec: `docs/specs/hub/overview.md`. Federation protocol: `docs/specs/hub/federation.md`. Self-host: `docs/guides/hub/self-hosting.md`.

## Scripts convention
Every CLI under `scripts/` is tested, parameterized, JSON-emitting, registered in `scripts/manifest.toml`. The agent-readable index is `scripts/index.json` (regenerate with `scripts/index-scripts`). Overview: `docs/specs/scripts/overview.md`. `nexus add` is **declared, not implemented** — manifest entry `scripts/manifest.toml:341` + `scripts/index.json:1283`; no shim and no `bin/` script in this checkout. Pipeline spec: `docs/specs/scripts/nexus-add-resolution.md`.

## Solved-problems catalog
Voxel, falling-sand, 100k-unit RTS, seamless MMO, GPU fluid, destruction, deformable terrain, weather, procgen, sim, rhythm, text-heavy, 4X, 2.5D, heavy particles — SOLVED, modular, composable. The dev composes; the engine work is already done. Catalog + cost equation + decision tree: `docs/architecture/08-compose-dont-build.md`. Recipes: `docs/guides/recipes/`. "I want a game like X" → `onboarding-coach` → match recipe → `nexus-cli-engineer` runs `nexus new --template`. Never greenfield engine code; always compose.

## Modding
Every Nexus game ships moddable to 100% by default → `docs/specs/mods/overview.md`. Docs map: `docs/specs/mods/` (format, manifest, SDK, lifecycle, sandbox, save compat, MP sync, TC, hot reload, native v2.0, permissions, anti-cheat, accessibility, NSFW, telemetry) · `docs/guides/mods/marketplaces/` (steam-workshop, mod-io, thunderstore, nexus-mods, curseforge, itch-io, self-hosted, nexus-hub, decision-matrix) · `docs/guides/mods/authoring/` (quickstart, templates, editor, test-harness, debugging, perf, i18n, ai-assisted, packaging, publishing, versioning) · `docs/guides/mods/players/` (install, profiles, conflicts, permissions-ui, safety, sharing-saves) · `docs/guides/mods/economy/` (overview, free-mods, paid-mods, marketplace-cut-comparison, legal) · `docs/guides/mods/famous-mods-as-tests.md` (aspirational bar) · `docs/guides/mods/agent-recipes.md` (decision tables for `nexus-coder` mod-authoring) · `docs/guides/mods/integrations-matrix.md` (per-marketplace × per-capability).

| Rule | Test |
|---|---|
| Modding is first-class, never bolted on | Every engine API has "is this safely mod-callable?" answered in its spec |
| Capability sandbox is mandatory | `docs/specs/scripting/sandbox.md` is canonical; mod specs extend, never relax |
| MIT default | Engine MIT. Default mod license template MIT. Authors pick any OSI license or proprietary |
| Engine takes 0% of mod revenue | Forever. `docs/guides/mods/economy/overview.md` |
| AI may author mods | `nexus-coder` does end-to-end: `docs/guides/mods/authoring/ai-assisted.md` |
| No marketplace lock-in | `nexus mod publish --to <store>` works on every channel; self-hosted is first-class |
| Deterministic with mods loaded | Same mod-set + seed + input = byte-identical state |
| 100% mod power offline solo | Zero-friction install; auto-grant on user action; multiplayer is the strict path |

Power tiers — declared in `mod.toml::[mod].tier`:
| Tier | Touches | Default caps |
|---|---|---|
| Skin | Assets only | `AssetRead`, asset-overlay write |
| Behavior | Scripts (Rune VM) + assets | Skin + `WorldRead/Write`, `EventEmit/Subscribe`, `Rng`, `Persist`, `Log` |
| Total Conversion | Replaces base game wholesale | All Behavior + `SemanticSpawn` + entry-point override; own ladder/saves |

## Extending the Engine — Crate or Mod?
- New engine extension that compiles in (genre, style, physics, netcode, telemetry, asset source, feature flag, …) → `crate-author`; third-party crate on crates.io → `docs/specs/crates/overview.md`.
- New community crate evaluated before adoption → `crate-consumer-advisor`; Recipes 1-3 in `docs/guides/crates/agent-recipes.md`.
- Community crate audit (Verified tier promotion) → `crate-curator`; 15-step playbook in `docs/specs/crates/quality-bar.md`.
- License / supply-chain check across the dep tree → `license-compat-auditor`; `cargo deny` + `cargo audit` per `docs/specs/crates/licensing.md`.
- Runtime content end users install in their copy of the game (skins, gameplay tweaks, total conversion) → `mod-sandbox-specialist` + the relevant `mod-*` agent; sandboxed `.nxmod` packages → `docs/specs/mods/overview.md`.

Rule of thumb: **dev installs at build time → crate. Player installs at runtime → mod.**

## Forbidden Behaviors
- Inventing performance numbers. Unknown target → write `[BENCHMARK NEEDED]`.
- Skipping the contract step when the change crosses a system boundary.
- Writing impl before the spec exists.
- Generic errors (`anyhow::anyhow!("...")` in shipped code, or string-only error returns).
- Unstructured logs (`println!`, `eprintln!`) outside `examples/` and `tests/`.
- `unsafe` without a `// SAFETY:` paragraph that proves the invariants.
- Editing `docs/architecture/00-vision.md` or `docs/architecture/01-principles.md` without an ADR.
- Single-threaded execution when work is parallelizable. Default is N subagents in flight.

## Quickstart for a New Task
1. Read the relevant spec under `docs/specs/`; if the change crosses a boundary, read the contract.
2. Choose the subagent from the routing table; multiple specs touched → `/parallel <task>` (or dispatch the subagents directly in one message).
3. After impl: dispatch `test-author`, `perf-engineer`, `code-reviewer`, `security-reviewer` in parallel; `merge-bot` gives the verdict.

When in doubt: vision → `docs/architecture/00-vision.md` · law → `docs/architecture/01-principles.md` · spec format → `docs/guides/spec-format.md` · writing a subagent → `docs/guides/subagent-fleet-style.md` · how many subagents → `docs/guides/parallelism-doctrine.md` · onboarding → `docs/guides/ai-dev-onboarding.md`.

## Next-session bootstrap
1. Read `CLAUDE.md` end-to-end, then `docs/INTEGRATION-REPORT.md` (post-32-agent state — what was reconciled, where stubs/conflicts remain).
2. Pick from `docs/architecture/decisions-open.md` (`[DECISION NEEDED]`) and `docs/architecture/benchmarks-pending.md` (`[BENCHMARK NEEDED]`); spawn the relevant subagent from the routing table above.
3. Cross-check `docs/architecture/cross-agent-flags.md` if the task touches a file authored by multiple agents.

Engine source exists but is Phase 0 scaffold — 35 crates, 70 `.rs` files across `crates/` (29 crates, 58 files) and `packages/` (HAL + 5 styles, 6 crates, 12 files), 4 games, 2 tools; every crate, game and tool declares `Status: stub (Phase 0 scaffold)` (`crates/nexus-core/src/lib.rs:7`). The tree stays spec-driven (Law 2): new behavior starts at a spec.

## Note
No git worktrees — work directly in this checkout. If a task needs subagents, run them as a team in this same checkout: split the work into disjoint pieces so no two agents touch the same files.
