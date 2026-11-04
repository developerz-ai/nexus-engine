# Nexus Engine — Mastermind

Open source, AI-first, cross-platform game engine. Built BY AI, maintained BY AI, FOR AI agents + humans. MIT forever. Spec-driven. 100M LOC target. Status: Phase 0 — 41-member Cargo workspace, every member a compile-green stub; docs-first (Law 2).

## Stack
| Concern | Pin | Where |
|---|---|---|
| Rust toolchain | 1.95; MSRV per `docs/architecture/03-tech-stack.md` | `rust-toolchain.toml:6` |
| unsafe code | `forbid` workspace-wide | `Cargo.toml:41` |
| Key deps | wgpu 29 · rapier2d/3d 0.32 (enhanced-determinism) · quinn 0.11 · tokio · glam · mlua + rune · naga 29 · criterion · proptest | `Cargo.toml:49` |
| JS toolchain | Bun 1.4.4 (`scripts/.bun-version:1`) · Biome is the only TS linter/formatter (`scripts/CLAUDE.md`) | `scripts/` |

## Structure
| Path | Contents |
|---|---|
| `crates/nexus-*` (13) | core hal assets renderer physics audio net script agent editor cli merge engine — all Phase-0 stubs (`Status: stub`, e.g. `crates/nexus-cli/src/main.rs:7`) |
| `crates/styles/*` (5) + `crates/genres/*` (16) + `crates/sdks/nexus-agent-sdk-rs` | `nexus-style-{2d,pixel,pbr,npr,mixed}` · `nexus-genre-<g>` per `docs/specs/genres/<g>.md` · agent SDK (`nexus-agent-sdk-py` deferred, `.placeholder`) |
| `games/*` (4) + `tools/*` (2) | `nexus-{fps,platformer,rpg,rts}` — demo games = integration tests (`docs/games/`) · `nexus-codegen` · `nexus-scenario` |
| `scripts/` | Bun TS CLI workspace; `manifest.toml` = hand-edited source of truth → `index.json` generated via `scripts/index-scripts`; subtree brain: `scripts/CLAUDE.md` |
| `docs/` · `.claude/` | 413 md, `INDEX.md` regenerated via `scripts/sync-docs-index` · 119 agents · 14 commands · 15 skills |

## Commands
| Entry | What |
|---|---|
| `./bin/setup` | provisions the pinned toolchain: rustup (Rust 1.95), bun (per `scripts/.bun-version`), cargo-nextest, cargo-deny |
| `./bin/check` | THE gate (`bin/check:30`): `cargo fmt --all -- --check` → `cargo clippy --workspace --all-targets -- -D warnings` → `cargo check --workspace --all-targets` → `cargo nextest run --workspace --profile ci` → `cargo deny check` → `(cd scripts && bun test && bun x biome check .)` |
| `./bin/dev` | `cargo run -p nexus-cli` |
| `./bin/stop` | no-op placeholder today; replace with a command that stops what `bin/dev` starts |
| `package.json` | `check` = `bun run scripts/check` · `test` = `bun test` |

## Response Rules
- Execute. No preamble, no restating. Lead with action; reasoning only if non-obvious. Terse — fragments OK; code/commands/paths verbatim. Read before speculating — read the spec before touching code.
- Disagree when wrong — state the correction. Parallel tool calls when independent; default: dispatch many subagents at once.

## Non-Negotiables (the 15 Laws — `docs/architecture/01-principles.md`)
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
| 14 | Opt-in modularity | no game compiles code it does not declare in `Nexus.toml` |
| 15 | Extend, don't fork | engine-core src untouched without an ADR; use a crate / plugin / mod / script / RPC / editor override |

- A PR that violates a law is rejected by `nexus-merge` without human review.
- Editor narrow on purpose: quick-load + place + inspect + scrub + telemetry — NOT a code editor, NOT a long-form authoring suite. Law 13: every editor operation = one agent JSON-RPC method.
- Parity auditor spec: `docs/specs/editor/rpc-parity.md` — `scripts/check-rpc-parity` + the `nexus-merge` lint `editor_rpc_parity` are PLANNED enforcement, not installed (`docs/specs/editor/rpc-parity.md:98`). MCP server (`docs/specs/agent/mcp-server.md`) = public interop layer; code editing via VS Code / Cursor / Zed post-v1.0 extensions (`docs/specs/editor/vscode-extension.md`, `docs/specs/editor/zed-extension.md`).

## The Four-Stage Pipeline (NEVER skip a stage)
**spec → contract → impl → test** — spec-author → contract-author → domain engineer → test-author.
1. **Spec.** New behavior → `docs/specs/<system>/<file>.md` first; contract first when crossing a system boundary → `docs/contracts/<a>-<b>.md`. Format: `docs/guides/spec-format.md`.
2. **Impl.** Domain engineer reads spec + contract, writes code in the crate the spec names.
3. **Test.** `test-author` adds unit + integration + scenario + property + visual (where applicable); coverage floor: `docs/guides/testing/coverage.md`.

## Where Docs Live
| Path | Contents |
|---|---|
| `docs/architecture/` | vision, principles, system map, tech stack, workspace layout, ADRs |
| `docs/specs/` | per-system specs (core, renderer, physics, audio, networking, scripting, assets, styles, genres, agent, editor, coder) |
| `docs/contracts/` · `docs/guides/` · `docs/prior-art/` · `docs/game-template/` · `docs/games/` | A↔B interface boundaries · onboarding / PR protocol / merge system / style guide / glossary / testing / deploy / release / liveops / subagent-fleet / parallelism-doctrine · per-engine synthesis · `nexus new` scaffold spec · demo-game specs (integration tests) |

## Subagent Fleet — Routing Table
**Rule:** every task routes to a subagent. If a task touches N independent specs/crates, dispatch N subagents in **one message**. Never serialize unless a dependency forces it.
Invoke via `Agent({ subagent_type: "<name>", prompt: "<task>" })`.

| area | agents |
|---|---|
| architecture & spec | `architect` (system map, ADR calls) · `spec-author` (new `docs/specs/**`) · `contract-author` (`docs/contracts/<a>-<b>.md`) · `adr-author` (`docs/architecture/05-adr/`) · `principle-keeper` (15-law audit) |
| core | `ecs-engineer` `memory-engineer` `jobs-engineer` `hal-engineer` `math-engineer` `events-engineer` |
| renderer | `renderer-engineer` `shader-engineer` `pbr-specialist` `npr-specialist` `pixel-art-specialist` `twod-specialist` `mixed-style-specialist` |
| physics | `physics-engineer` `character-controller-specialist` `soft-body-specialist` `fluid-specialist` `determinism-auditor` |
| audio · networking | `audio-engineer` `dsp-specialist` `spatial-audio-specialist` · `network-engineer` `rollback-specialist` `replication-specialist` `transport-specialist` `anticheat-specialist` |
| assets · scripting | `asset-pipeline-engineer` `asset-import-specialist` `asset-streaming-specialist` `asset-compression-specialist` `ai-asset-gen-specialist` `asset-registry-specialist` · `scripting-engineer` `lua-specialist` `rune-specialist` `hot-reload-specialist` `mod-sandbox-specialist` |
| agent API | `agent-api-engineer` `headless-sim-specialist` `telemetry-specialist` `scenario-author` `replay-engineer` `semantic-api-specialist` `agent-sdk-specialist` `mcp-server-engineer` |
| editor | `editor-engineer` `editor-debug-specialist` `live-reload-specialist` `editor-rpc-parity-auditor` `ide-extension-engineer` |
| genres | `fps-genre` `rpg-genre` `mmorpg-genre` `rts-genre` `moba-genre` `platformer-genre` `racing-genre` `survival-genre` `horror-genre` `fighting-genre` `battleroyal-genre` `roguelike-genre` `towdef-genre` `puzzle-genre` `visualnovel-genre` `openworld-genre` — each owns `docs/specs/genres/<g>.md` + `crates/genres/<g>` |
| quality · merge · docs | `code-reviewer` (final gate) · `security-reviewer` (sandbox, anti-cheat, supply-chain, secrets) · `test-author` (unit/integration/scenario/property/visual) · `perf-engineer` (criterion benches, regression check) · `fuzz-engineer` (cargo-fuzz: packets, asset import, script VM) · `visual-regression-engineer` (golden-image diff) · `coverage-auditor` (per-crate floor) · `merge-bot` (`nexus-merge` verdict) · `ci-engineer` (GitHub Actions) · `docs-style-enforcer` (claude-code-bible ch.11) · `glossary-keeper` (`docs/guides/glossary.md`) · `prior-art-researcher` (`docs/prior-art/**`) |
| coding agent · deploy · live-ops | `nexus-coder-architect` (`docs/specs/coder/**`) · `deploy-engineer` (Fly/AWS/GCP/Azure/Render/Vercel/CF/self-host/Agones) · `release-engineer` (Steam/itch/Epic/GOG/MS Store/App Store/Play Store/Web/consoles) · `codesigning-specialist` (Authenticode, notarize, Play App Signing, iOS provisioning) · `liveops-engineer` (Sentry/Bugsnag/GlitchTip) · `crash-triager` · `feature-flag-specialist` · `canary-and-rollback-engineer` · `hotfix-engineer` · `one-month-game-shepherd` |
| template · DX · meta | `nexus-cli-engineer` (`nexus new/add/generate/build/test/deploy/agent`) · `game-template-engineer` (`docs/game-template/**`) · `onboarding-coach` · `ts-script-author` (`scripts/**`) · `orchestrator` (plans only, never writes code) · `integration-resolver` (`[AGENT: XX]` cross-refs) · `decision-log-keeper` (`docs/architecture/decisions-open.md`) · `benchmark-coordinator` (`docs/architecture/benchmarks-pending.md`) |
| modding & hub | `mod-author` (`.nxmod` end-to-end) · `mod-curator` (submission audit) · `mod-sandbox-specialist` (sandbox surface, capability registry) · `nexus-hub-operator` · `hub-mirror-operator` (federation) · `hub-crawler-engineer` · `hub-curator` · `hub-recommender` · `wasm-mod-author` [DEFERRED v2.0 → `mod-author` / `crate-author`] |

Roster: `.claude/agents/` — **119** agent files, the source of truth; invoke any agent even when not listed here.

## Parallel-Work Doctrine
- Dispatch N subagents in one message when N tasks are independent; serialize only on a real upstream artifact; after every batch dispatch `integration-resolver` (`docs/guides/parallelism-doctrine.md`).
- **Never `isolation: worktree`** — subagents share this ONE checkout; disjoint file sets per agent (crate boundaries are the natural lock); shared roots (workspace `Cargo.toml`, `Nexus.toml`, docs indexes) stay with the coordinator.

## Project Slash Commands (`.claude/commands/` — all 14)
| command | purpose |
|---|---|
| `/spec <system>` | route to `spec-author` for that system |
| `/contract <a-b>` | route to `contract-author` |
| `/impl <spec-path>` | read spec → route to right engineer → impl + tests |
| `/scenario <name>` | author or run a TOML scenario |
| `/bench <crate>` | `perf-engineer` bench + baseline compare |
| `/triage` | `crash-triager` clusters + opens fix PRs |
| `/review` | `code-reviewer` + `security-reviewer` + `docs-style-enforcer` in parallel |
| `/parallel <task>` | `orchestrator` splits and dispatches |
| `/feature <request>` | end-to-end sweep: understand → slice by crate → hive build in this checkout → gate green → hand the PR to `babysit-pr` |
| `/planx [goal]` | self-contained executor plan for another AI to implement — plan only, no impl |
| `/sync-glossary` | `glossary-keeper` sweep |
| `/release <store>` | `release-engineer` runs per-store recipe |
| `/deploy <env> <target>` | `deploy-engineer` runs per-target recipe |
| `/onboard` | `onboarding-coach` walks the user through |

## File-Edit Hygiene
- Rust: `cargo fmt --all` + `cargo clippy --all-targets -- -D warnings` before commit; never commit red — `cargo check --workspace` MUST pass.
- TS/JS: `biome check --write`. WGSL: `naga` validates. Markdown: SPDX header on every file under `docs/`; style per claude-code-bible ch.11.
- Commit message: `<system>: <imperative>` · 50/72.

## Extending the Engine — Crate or Mod?
| User wants | Route to | Lane |
|---|---|---|
| Engine extension that compiles in (genre, style, physics, netcode, telemetry, asset source, feature flag, …) | `crate-author` | third-party crate on crates.io → `docs/specs/crates/overview.md` |
| Community crate: pre-adoption evaluation · Verified-tier promotion · license/supply-chain check | `crate-consumer-advisor` · `crate-curator` · `license-compat-auditor` | recipes 1-3: `docs/guides/crates/agent-recipes.md` · 15-step playbook: `docs/specs/crates/quality-bar.md` · `cargo deny` + `cargo audit` per `docs/specs/crates/licensing.md` |
| Runtime content end users install (skins, gameplay tweaks, total conversion) | `mod-sandbox-specialist` + relevant `mod-*` agent | sandboxed `.nxmod` → `docs/specs/mods/overview.md` |

Rule of thumb: **dev installs at build time → crate. Player installs at runtime → mod.**

## Forbidden Behaviors
- Inventing performance numbers — unknown target → write `[BENCHMARK NEEDED]`.
- Law 2/10/11 violations: impl before spec; skipped contract on a boundary crossing; `anyhow!("...")`/string-only errors in shipped code; `println!`/`eprintln!` outside `examples/` and `tests/`.
- `unsafe` without a `// SAFETY:` paragraph that proves the invariants.
- Editing `docs/architecture/00-vision.md` or `01-principles.md` without an ADR; single-threaded execution when work is parallelizable.

## Quickstart for a New Task
1. Read the relevant spec under `docs/specs/`; if crossing a boundary, read the contract.
2. Choose subagents from the routing table; multiple specs touched → `/parallel <task>`.
3. After impl: dispatch `test-author`, `perf-engineer`, `code-reviewer`, `security-reviewer` in parallel; `merge-bot` gives the verdict.

## When in Doubt
- Vision → `docs/architecture/00-vision.md` · Law → `docs/architecture/01-principles.md` · Spec format → `docs/guides/spec-format.md`.
- Writing a subagent → `docs/guides/subagent-fleet-style.md` · how many to spawn → `docs/guides/parallelism-doctrine.md`.
- AI dev onboarding → `docs/guides/ai-dev-onboarding.md`.

## PR Pipeline (skills)
Every PR runs end-to-end via `.claude/skills/babysit-pr/`: the mastermind invokes it and walks away — fixes, replies, CR-thread resolution, re-runs, merge all autonomous; human escalation only on kill-switch (`docs/guides/mastermind-pr-loop.md`).

**Canonical order:**
```
/babysit-pr [PR#]
  └── /open-pr                    # title from Conventional Commits; body cites spec; draft until green
  └── /wait-for-ci                # gh pr checks --watch; required vs optional; flaky tolerated
  └── /pr-rebase-and-recover      # on red: rebase main, scoped tests, force-with-lease, restart CI
  └── /wait-for-coderabbit        # poll coderabbitai[bot]; re-trigger via @coderabbitai review
  └── /coderabbit-triage          # GraphQL reviewThreads → classify accept/reject/discuss/resolve
  └── /fix-from-coderabbit        # route by path → domain subagent; scoped build+test; one commit per thread
  └── /coderabbit-reply           # addPullRequestReviewThreadReply; reject MUST cite docs/architecture/01-principles.md#law-N
  └── /coderabbit-resolve         # GraphQL resolveReviewThread (REST cannot)
  └── /wait-for-ci                # again, after fixes
  └── /pr-merge                   # refuses if any open thread or missing spec ref
  └── /pr-changelog               # Keep-a-Changelog entry; spec ref required
```

**Skill catalogue (15):**
| Skill | Purpose |
|---|---|
| `open-pr` | open PR from current branch (CC title + spec body + scenario list + bench deltas) |
| `wait-for-ci` | block until checks finish; emit JSON verdict; handle reruns + timeout |
| `wait-for-coderabbit` | block until `coderabbitai[bot]` posts review; re-trigger if missing |
| `coderabbit-triage` | classify each CR thread; emit accept/reject/discuss/resolve plan |
| `coderabbit-reply` | post threaded replies; rejection template cites principle anchor |
| `coderabbit-resolve` | mark threads resolved via GraphQL `resolveReviewThread` |
| `fix-from-coderabbit` | apply accepted fixes via domain subagent; commit; push; resolve |
| `respond-to-cr-commands` | cheat sheet for `@coderabbitai review/full review/resolve/pause/summary` |
| `babysit-pr` | end-to-end driver; emits status JSON per tick for mastermind to parse |
| `pr-rebase-and-recover` | rebase on main; conflict heuristics; force-with-lease; restart CI |
| `pr-merge` | gate-check + squash-merge + delete branch + release-note line |
| `pr-changelog` | Keep-a-Changelog entry from Conventional Commit title + spec ref |
| `gh-graphql-helpers` | reusable `gh api graphql` snippets — single source of truth |
| `coderabbit-config` | when/how to evolve `.coderabbit.yaml` |
| `branch-conventions` | naming, base, draft, auto-merge, force-push policy (table-driven) |

- CodeRabbit posts as `coderabbitai[bot]` (or `coderabbitai` on some API surfaces — both checked). REST cannot resolve review threads — GraphQL `resolveReviewThread` per `.claude/skills/gh-graphql-helpers/SKILL.md` recipe #3. `nexus-merge` bot may approve in lieu of human review per `docs/guides/merge-system.md`.

**Kill-switch (auto-escalation to human):**
- 3 CR rounds without convergence → open `[ESCALATE]` issue, exit loop · CI red 2× same root cause → route `ci-engineer`, pause pushes.
- Merge conflict 2× same loop → route `architect`, tag `needs-design-review` · touches `00-vision.md` / `01-principles.md` → human + ADR, no auto-merge.

Config `.coderabbit.yaml` (`https://coderabbit.ai/integrations/schema.v2.json`): profile `assertive`, `request_changes_workflow: true`, auto-review on `main`; tone enforces the 15 Laws; tools: shellcheck · markdownlint · github-checks · gitleaks · actionlint · yamllint · hadolint · biome · ruff; path-instructions cover `docs/specs/**`, `docs/contracts/**`, `docs/architecture/05-adr/**`, `crates/**/src/**/*.rs`, `**/*.wgsl`, `crates/**/benches/**`, configs, `.github/workflows/**`.
Full rules: `docs/guides/mastermind-pr-loop.md` · workflow + SLOs: `docs/guides/pr-workflow.md` · CR reference: `docs/guides/coderabbit.md` · GraphQL recipes: `docs/guides/github-graphql-cookbook.md`.

## Crates ecosystem
| Topic | Where |
|---|---|
| Overview · categories · discovery · plugin trait | `docs/specs/crates/overview.md` · `docs/specs/crates/categories.md` (26 at integration: 14 original + 12 by Agent 32) · `docs/specs/crates/discovery.md` (crates.io + lib.rs primary, `nexus-hub` v1.0 secondary) · `docs/specs/crates/plugin-trait.md` · `docs/specs/crates/rails-plugin-model.md` |
| Manifestos | Law 14 opt-in modularity: `docs/architecture/06-modularity.md` · Law 15 closed-source-open-extension: `docs/architecture/07-extend-dont-fork.md` |

## nexus-hub
Federated **index + curation + verification** — not storage (crates on crates.io, mods on marketplaces, assets on CC0 libraries); adds Nexus metadata, signed verification attestations, JSON-first API; ships v1.0 (resolved 2026-05-17). Spec: `docs/specs/hub/overview.md` · federation: `docs/specs/hub/federation.md` · self-host: `docs/guides/hub/self-hosting.md` · agents: `nexus-hub-operator`, `hub-mirror-operator`.

## Scripts convention
- Every CLI under `scripts/` is tested, parameterized, JSON-emitting, registered in `scripts/manifest.toml` (hand-edited source of truth); `scripts/index.json` is generated via `scripts/index-scripts` — never hand-edit. Overview: `docs/specs/scripts/overview.md`.
- Declared, NOT implemented: `nexus-add` (`scripts/manifest.toml:341`) — resolution spec `docs/specs/scripts/nexus-add-resolution.md`; no shim, no test file exists yet. Never document or invoke it as a working CLI.

## Solved-problems catalog
Voxel, falling-sand, 100k-unit RTS, seamless MMO, GPU fluid, destruction, deformable terrain, weather, procgen, sim, rhythm, text-heavy, 4X, 2.5D, heavy particles: SOLVED, modular, composable — catalog + cost equation + decision tree: `docs/architecture/08-compose-dont-build.md`; recipes: `docs/guides/recipes/`.
"I want to make a game like X" → `onboarding-coach` → match recipe → `nexus-cli-engineer` runs `nexus new --template`. Never greenfield engine code; always compose. Specialists: `voxel-engineer` · `cellular-automata-engineer` · `massive-scale-engineer` · `heavy-particles-specialist` · `quickstart-recipe-author`.

## Modding
Every Nexus game ships moddable to 100% by default → `docs/specs/mods/overview.md`.
| Rule | Test |
|---|---|
| First-class, never bolted on | every engine API answers "is this safely mod-callable?" in its spec |
| Capability sandbox mandatory | `docs/specs/scripting/sandbox.md` is canonical; mod specs extend, never relax |
| MIT economics | engine MIT; default mod license template MIT, any OSI or proprietary; engine takes 0% of mod revenue forever (`docs/guides/mods/economy/overview.md`) |
| AI may author mods | `nexus-coder` does end-to-end: `docs/guides/mods/authoring/ai-assisted.md` |
| No lock-in, always deterministic | `nexus mod publish --to <store>` works on every channel, self-hosted first-class; same mod-set + seed + input = byte-identical state |
| 100% mod power offline solo | zero-friction install; auto-grant on user action; multiplayer is the strict path |

**Power tiers** (`mod.toml::[mod].tier`):
| Tier | Touches | Default caps |
|---|---|---|
| Skin | assets only | `AssetRead`, asset-overlay write |
| Behavior | scripts (Rune VM) + assets | Skin + `WorldRead/Write`, `EventEmit/Subscribe`, `Rng`, `Persist`, `Log` |
| Total Conversion | replaces base game wholesale | all Behavior + `SemanticSpawn` + entry-point override; own ladder/saves |

Mod docs: `docs/specs/mods/` (format, manifest, SDK, lifecycle, sandbox extension, save compat, MP sync, TC, hot reload, native v2.0, permissions, anti-cheat, accessibility, NSFW, telemetry) · `docs/guides/mods/marketplaces/` (steam-workshop, mod-io, thunderstore, nexus-mods, curseforge, itch-io-mods, self-hosted, nexus-hub [decision pending], decision-matrix) · `docs/guides/mods/authoring/` (quickstart → versioning) · `docs/guides/mods/players/` (install → sharing-saves) · `docs/guides/mods/economy/` · `docs/guides/mods/famous-mods-as-tests.md` · `docs/guides/mods/agent-recipes.md` · `docs/guides/mods/integrations-matrix.md`.

## Next-session bootstrap
1. Read this file end-to-end; read `docs/INTEGRATION-REPORT.md` (post-32-agent reconciliation, stubs, conflicts); cross-check `docs/architecture/cross-agent-flags.md` when touching multi-agent files.
2. Pick from `docs/architecture/decisions-open.md` (`[DECISION NEEDED]`) and `docs/architecture/benchmarks-pending.md` (`[BENCHMARK NEEDED]`); spawn the matching subagent.

Workspace reality: 41-member Cargo workspace, all members Phase-0 stubs — spec-first (Law 2) drives implementation forward.
