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

A PR that violates a law is rejected by `nexus-merge` without human review.

**Editor scope, MCP, and parity.** Editor narrow on purpose — quick-load + place + inspect + scrub + telemetry. NOT a code editor. NOT a long-form authoring suite. Every editor operation = one agent JSON-RPC method; CI auditor (`scripts/check-rpc-parity`) blocks orphan buttons and orphan editor-surface RPCs (Law 13). The MCP server (`docs/specs/agent/mcp-server.md`) is the public interop layer — one server, every MCP host. Code editing lives in VS Code / Cursor / Zed via post-v1.0 extensions (`docs/specs/editor/{vscode,zed}-extension.md`).

## The Four-Stage Pipeline (NEVER skip a stage)
```
spec  →  contract  →  impl  →  test
 ↑          ↑          ↑        ↑
spec-     contract-  domain-   test-
author    author     engineer  author
```
1. **Spec.** New behavior → `docs/specs/<system>/<file>.md` first. Use `docs/guides/spec-format.md`.
2. **Contract.** Crosses a system boundary → `docs/contracts/<a>-<b>.md` first.
3. **Impl.** Domain engineer reads spec + contract, writes code in the crate the spec names.
4. **Test.** `test-author` adds unit + integration + scenario + property + visual (where applicable). Coverage floor per `docs/guides/testing/coverage.md`.

## Where Docs Live
| Path | Contents |
|---|---|
| `docs/architecture/` | vision, principles, system map, tech stack, workspace layout, ADRs |
| `docs/specs/` | per-system specs (core, renderer, physics, audio, networking, scripting, assets, styles, genres, agent, editor, coder) |
| `docs/contracts/` | exact A↔B interface boundaries |
| `docs/guides/` | onboarding, PR protocol, merge system, style guide, glossary, testing, deploy, release, liveops, subagent-fleet, parallelism-doctrine |
| `docs/prior-art/` | per-engine synthesis (bevy, godot, ue5, …) |
| `docs/game-template/` | the `nexus new` scaffold spec |
| `docs/games/` | demo-game specs (integration tests) |

## Subagent Fleet — Routing Table
**Rule:** every task routes to a subagent. If a task touches N independent specs/crates, dispatch N subagents in **one message**. Never serialize unless a dependency forces it.

Invoke via `Agent({ subagent_type: "<name>", prompt: "<task>" })`.

### Architecture & spec authoring
| name | when to delegate |
|---|---|
| `architect` | top-level architecture, system-map edits, ADR-worthy decisions |
| `spec-author` | new `docs/specs/**` file or large spec rewrite |
| `contract-author` | new or revised `docs/contracts/<a>-<b>.md` |
| `adr-author` | log a Nygard-format ADR under `docs/architecture/05-adr/` |
| `principle-keeper` | audit a PR/file against the 12 laws |

### Engine domain specialists (one per spec subtree)
| domain | subagent(s) |
|---|---|
| core | `ecs-engineer` `memory-engineer` `jobs-engineer` `hal-engineer` `math-engineer` `events-engineer` |
| renderer | `renderer-engineer` `shader-engineer` `pbr-specialist` `npr-specialist` `pixel-art-specialist` `twod-specialist` `mixed-style-specialist` |
| physics | `physics-engineer` `character-controller-specialist` `soft-body-specialist` `fluid-specialist` `determinism-auditor` |
| audio | `audio-engineer` `dsp-specialist` `spatial-audio-specialist` |
| networking | `network-engineer` `rollback-specialist` `replication-specialist` `transport-specialist` `anticheat-specialist` |
| scripting | `scripting-engineer` `lua-specialist` `rune-specialist` `hot-reload-specialist` `mod-sandbox-specialist` |
| assets | `asset-pipeline-engineer` `asset-import-specialist` `asset-streaming-specialist` `asset-compression-specialist` `ai-asset-gen-specialist` `asset-registry-specialist` |
| agent API | `agent-api-engineer` `headless-sim-specialist` `telemetry-specialist` `scenario-author` `replay-engineer` `semantic-api-specialist` `agent-sdk-specialist` `mcp-server-engineer` |
| editor | `editor-engineer` `editor-debug-specialist` `live-reload-specialist` `editor-rpc-parity-auditor` `ide-extension-engineer` |

### Genre specialists (own `docs/specs/genres/<g>.md` + the `crates/genres/<g>` crate)
`fps-genre` `rpg-genre` `mmorpg-genre` `rts-genre` `moba-genre` `platformer-genre` `racing-genre` `survival-genre` `horror-genre` `fighting-genre` `battleroyal-genre` `roguelike-genre` `towdef-genre` `puzzle-genre` `visualnovel-genre` `openworld-genre`

### Quality & process
| name | when to delegate |
|---|---|
| `code-reviewer` | final-gate review before merge |
| `security-reviewer` | sandbox, anti-cheat, supply-chain, secrets |
| `test-author` | unit, integration, scenario, property, visual tests |
| `perf-engineer` | criterion benches + perf regression check |
| `fuzz-engineer` | cargo-fuzz harnesses (packets, asset import, script VM) |
| `visual-regression-engineer` | golden-image pixel diff |
| `coverage-auditor` | per-crate coverage floor |
| `merge-bot` | run the full `nexus-merge` pipeline and verdict |
| `ci-engineer` | GitHub Actions matrices, caches, runners |
| `docs-style-enforcer` | claude-code-bible ch.11 conformance sweep |
| `glossary-keeper` | sync `docs/guides/glossary.md` with repo usage |
| `prior-art-researcher` | WebSearch heavy; update `docs/prior-art/**` |

### Coding agent, deploy, live-ops
| name | when to delegate |
|---|---|
| `nexus-coder-architect` | own `docs/specs/coder/**` (Vercel AI SDK + OpenRouter) |
| `deploy-engineer` | Fly/AWS/GCP/Azure/Render/Vercel/CF/self-host/Agones |
| `release-engineer` | Steam/itch/Epic/GOG/MS Store/App Store/Play Store/Web/consoles |
| `codesigning-specialist` | Authenticode, notarize, Play App Signing, iOS provisioning |
| `liveops-engineer` | Sentry/Bugsnag/GlitchTip, dashboards, alerts |
| `crash-triager` | cluster incoming crashes, rank, draft fix PRs |
| `feature-flag-specialist` | GrowthBook / LaunchDarkly / Unleash wiring |
| `canary-and-rollback-engineer` | staged rollout + auto-rollback |
| `hotfix-engineer` | live-content + OTA delivery |
| `one-month-game-shepherd` | end-to-end solo-dev 1-month playbook |

### Template & DX
| name | when to delegate |
|---|---|
| `nexus-cli-engineer` | `nexus new / add / generate / build / test / deploy / agent` |
| `game-template-engineer` | `docs/game-template/**` + scaffold contents |
| `onboarding-coach` | walk a new contributor through spec-first workflow |
| `ts-script-author` | owns `scripts/**` — Bun TypeScript scripts + tests |

### Meta / orchestration
| name | when to delegate |
|---|---|
| `orchestrator` | plan a task → split into parallel subagent invocations (NEVER writes code) |
| `integration-resolver` | resolve `[AGENT: XX]` cross-refs after a parallel batch |
| `decision-log-keeper` | sweep `[DECISION NEEDED]` → `docs/architecture/decisions-open.md` |
| `benchmark-coordinator` | sweep `[BENCHMARK NEEDED]` → `docs/architecture/benchmarks-pending.md` |

### Modding & hub
| name | when to delegate |
|---|---|
| `mod-author` | author a `.nxmod` end-to-end (manifest + scripts + tests + publish) |
| `mod-curator` | audit a mod submission; capability + script review |
| `mod-sandbox-specialist` | engine-side sandbox surface, capability registry |
| `nexus-hub-operator` | run / operate a hub instance (deployment, capacity, incidents, key rotation) |
| `hub-mirror-operator` | federation protocol changes (mirror sync, identity-key TOFU, sneakernet) |
| `hub-crawler-engineer` | ingestion adapters for crates.io / marketplaces / asset libs |
| `hub-curator` | moderation queue, badges, abuse handling |
| `hub-recommender` | ranking / discovery surface |
| `wasm-mod-author` | [DEFERRED v2.0] WASM-component mods — until then routes to `mod-author` or `crate-author` |

Subagent fleet total: **118** files in `.claude/agents/`.

## Parallel-Work Doctrine
- Default: dispatch N subagents in **one message** whenever N tasks are independent.
- Serialize only when a downstream task literally needs an upstream artifact (e.g., impl needs the contract file written first).
- Long-running parallel work → use `isolation: worktree` on the subagent so file conflicts vanish.
- After every parallel batch, dispatch `integration-resolver` to reconcile cross-refs.
- Full doctrine: `docs/guides/parallelism-doctrine.md`.

## Project Slash Commands (`.claude/commands/`)
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
| `/sync-glossary` | `glossary-keeper` sweep |
| `/release <store>` | `release-engineer` runs per-store recipe |
| `/deploy <env> <target>` | `deploy-engineer` runs per-target recipe |
| `/onboard` | `onboarding-coach` walks the user through |

## File-Edit Hygiene
- Rust: `cargo fmt --all` + `cargo clippy --all-targets -- -D warnings` before commit.
- TS/JS: `biome check --write` before commit.
- WGSL: `naga` validates before commit.
- Markdown: SPDX header on every file under `docs/`. Style: claude-code-bible ch.11.
- Never commit red (`cargo check --workspace` MUST pass).
- Every commit message: `<system>: <imperative>` · 50/72.

## Extending the Engine — Crate or Mod?

| User wants | Route to | Lane |
|---|---|---|
| A new engine extension that compiles in (genre, style, physics, netcode, telemetry, asset source, feature flag, …) | `crate-author` | Third-party crate on crates.io. → `docs/specs/crates/overview.md` |
| A new community crate evaluated before adoption | `crate-consumer-advisor` | Recipes 1-3 in `docs/guides/crates/agent-recipes.md` |
| A community crate audit (Verified tier promotion) | `crate-curator` | 15-step playbook in `docs/specs/crates/quality-bar.md` |
| License / supply-chain check across the dep tree | `license-compat-auditor` | `cargo deny` + `cargo audit` per `docs/specs/crates/licensing.md` |
| Runtime content end users install in their copy of the game (skins, gameplay tweaks, total conversion) | `mod-sandbox-specialist` + relevant `mod-*` agent | Sandboxed `.nxmod` packages → `docs/specs/mods/overview.md` |

Rule of thumb: **dev installs at build time → crate. Player installs at runtime → mod.**

## Forbidden Behaviors
- Inventing performance numbers. Unknown target → write `[BENCHMARK NEEDED]`.
- Skipping the contract step when the change crosses a system boundary.
- Writing impl before the spec exists.
- Generic errors (`anyhow::anyhow!("...")` in shipped code, or string-only error returns).
- Unstructured logs (`println!`, `eprintln!`) outside `examples/` and `tests/`.
- `unsafe` without a `// SAFETY:` paragraph that proves the invariants.
- Editing `docs/architecture/00-vision.md` or `01-principles.md` without an ADR.
- Single-threaded execution when work is parallelizable. Default is N subagents in flight.

## Quickstart for a New Task
1. Read the relevant spec under `docs/specs/`.
2. If crossing a boundary, read the contract.
3. Choose subagent from the table above.
4. If multiple specs touched → `/parallel <task>` (or dispatch the subagents directly in one message).
5. After impl: dispatch `test-author`, `perf-engineer`, `code-reviewer`, `security-reviewer` in parallel.
6. `merge-bot` gives the verdict.

## When in Doubt
- Vision question → `docs/architecture/00-vision.md`.
- Law question → `docs/architecture/01-principles.md`.
- Spec format → `docs/guides/spec-format.md`.
- How to write a subagent → `docs/guides/subagent-fleet-style.md`.
- How many subagents to spawn → `docs/guides/parallelism-doctrine.md`.
- AI dev onboarding → `docs/guides/ai-dev-onboarding.md`.

## PR Pipeline (skills)

Every PR is driven end-to-end by `.claude/skills/babysit-pr/`. The mastermind invokes it and walks away — fixes, replies, CR-thread resolution, re-runs, merge all happen autonomously. Escalates to human only on kill-switch conditions (`docs/guides/mastermind-pr-loop.md`).

### Canonical invocation order
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

### Skill catalogue
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

### Bot identity & GraphQL note
- CodeRabbit posts as `coderabbitai[bot]` (or `coderabbitai` in some API surfaces — both checked).
- **REST cannot resolve review threads.** Use GraphQL `resolveReviewThread` (see `.claude/skills/gh-graphql-helpers/SKILL.md` recipe #3).
- `nexus-merge` bot may approve in lieu of human review per `docs/guides/merge-system.md`.

### Kill-switch (auto-escalation to human)
| Condition | Effect |
|---|---|
| 3 CR rounds without convergence | open `[ESCALATE]` issue; exit loop |
| CI red 2× same root cause | route to `ci-engineer`; pause pushes |
| Merge conflict 2× same loop | route to `architect`; tag `needs-design-review` |
| Touches `00-vision.md` or `01-principles.md` | require human + ADR; no auto-merge |

Full rules: `docs/guides/mastermind-pr-loop.md`. Workflow narrative + SLOs: `docs/guides/pr-workflow.md`. CR reference: `docs/guides/coderabbit.md`. GraphQL recipes: `docs/guides/github-graphql-cookbook.md`.

### CodeRabbit config
- `/.coderabbit.yaml` — schema: `https://coderabbit.ai/integrations/schema.v2.json`
- Profile: `assertive`. `request_changes_workflow: true`. Auto-review on `main`.
- Tone: enforces 12 Laws; rejects suggestions that violate them.
- Path-instructions cover `docs/specs/**`, `docs/contracts/**`, `docs/architecture/05-adr/**`, `crates/**/src/**/*.rs`, `**/*.wgsl`, `crates/**/benches/**`, configs, `.github/workflows/**`.
- Tools on: shellcheck · markdownlint · github-checks · gitleaks · actionlint · yamllint · hadolint · biome · ruff.

## Crates ecosystem

Rust-native, compile-time extension lane. The bulk of Nexus's surface area at maturity lives in third-party crates on crates.io. Categories canonical in `docs/specs/crates/categories.md` (26 categories at integration: 14 original + 12 added by Agent 32). Discovery: `docs/specs/crates/discovery.md` (primary: crates.io + lib.rs; secondary: `nexus-hub` v1.0). Plugin trait + Rails analogy: `docs/specs/crates/plugin-trait.md`, `docs/specs/crates/rails-plugin-model.md`. Overview: `docs/specs/crates/overview.md`. Manifesto for opt-in compile-time modularity (Law 14): `docs/architecture/06-modularity.md`. Manifesto for closed-source-open-extension (Law 15): `docs/architecture/07-extend-dont-fork.md`.

## nexus-hub

Federated **index + curation + verification** layer. Not storage — crates live on crates.io, mods on marketplaces, assets on CC0 libraries. Hub indexes them all, adds Nexus-specific metadata, hosts signed verification attestations, serves JSON-first API. Ships **v1.0** (resolved 2026-05-17). Spec: `docs/specs/hub/overview.md`. Federation protocol: `docs/specs/hub/federation.md`. Self-host: `docs/guides/hub/self-hosting.md`. Operator subagent: `nexus-hub-operator`. Federation subagent: `hub-mirror-operator`.

## Scripts convention

Every CLI under `scripts/` is tested, parameterized, JSON-emitting, and registered in `scripts/manifest.toml`. The agent-readable index is `scripts/index.json` (regenerate with `scripts/index-scripts`). Overview spec: `docs/specs/scripts/overview.md`. Crate-resolution pipeline (`nexus add`): `docs/specs/scripts/nexus-add-resolution.md`. Lint / new-script / sync-docs-index workflow lives in `scripts/`.

## Solved-problems catalog

The hard problems of engine construction (voxel, falling-sand, 100k-unit RTS, seamless MMO, GPU fluid, destruction, deformable terrain, weather, procgen, sim, rhythm, text-heavy, 4X, 2.5D, heavy particles) are SOLVED, modular, composable. The dev composes; the engine work is already done. Catalog + cost equation + decision tree: `docs/architecture/08-compose-dont-build.md`. Quick-start recipes: `docs/guides/recipes/`. Mastermind rule: "I want to make a game like X" routes to `onboarding-coach` → match recipe → `nexus-cli-engineer` runs `nexus new --template`. Never greenfield engine code; always compose.

## Modding

Every Nexus game ships moddable to 100% by default. → `docs/specs/mods/overview.md`.

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

### Power tiers (declared in `mod.toml::[mod].tier`)
| Tier | Touches | Default caps |
|---|---|---|
| Skin | Assets only | `AssetRead`, asset-overlay write |
| Behavior | Scripts (Rune VM) + assets | Skin + `WorldRead/Write`, `EventEmit/Subscribe`, `Rng`, `Persist`, `Log` |
| Total Conversion | Replaces base game wholesale | All Behavior + `SemanticSpawn` + entry-point override; own ladder/saves |

### Where mod docs live
| Path | Contents |
|---|---|
| `docs/specs/mods/` | Format, manifest, SDK, lifecycle, sandbox extension, save compat, MP sync, TC, hot reload, native (v2.0), permissions, anti-cheat, accessibility, NSFW, telemetry |
| `docs/guides/mods/marketplaces/` | Per-store recipes: steam-workshop, mod-io, thunderstore, nexus-mods, curseforge, itch-io-mods, self-hosted, nexus-hub (decision pending), decision-matrix |
| `docs/guides/mods/authoring/` | quickstart, templates, editor, test-harness, debugging, perf, i18n, ai-assisted, packaging, publishing, versioning |
| `docs/guides/mods/players/` | install, profiles, conflicts, permissions-ui, safety, sharing-saves |
| `docs/guides/mods/economy/` | overview, free-mods, paid-mods, marketplace-cut-comparison, legal |
| `docs/guides/mods/famous-mods-as-tests.md` | Aspirational bar: every famous-mod precedent → required engine capability |
| `docs/guides/mods/agent-recipes.md` | Decision tables (JSON) for `nexus-coder` mod-authoring |
| `docs/guides/mods/integrations-matrix.md` | Per-marketplace × per-capability table (JSON variant included) |

## Next-session bootstrap

A new Claude Code session opening this repo should:

1. Read `CLAUDE.md` (this file) end-to-end.
2. Read `docs/INTEGRATION-REPORT.md` for the post-32-agent state, what was reconciled, and where stubs/conflicts remain.
3. Pick from `docs/architecture/decisions-open.md` (unresolved `[DECISION NEEDED]`) and `docs/architecture/benchmarks-pending.md` (open `[BENCHMARK NEEDED]`).
4. Spawn the relevant subagent from the routing tables above.
5. Cross-check `docs/architecture/cross-agent-flags.md` if the task touches a file that was authored by multiple agents.

Engine source does not exist yet — the next session is still docs-driven. Engine implementation begins after the open-decisions list is small enough to pick a v1.0 crate boundary and start coding under the spec-first workflow (Law 2).
