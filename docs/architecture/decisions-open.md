<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Decisions Open

> Punch list. Every unresolved `[DECISION NEEDED]` flag across the corpus, grouped by topic, with the spec author's default proposal where one exists. The next Claude Code session picks from here.
>
> Pair files: `docs/architecture/decisions-resolved.md` (already settled), `docs/architecture/benchmarks-pending.md` (`[BENCHMARK NEEDED]`), `docs/architecture/cross-agent-flags.md` (`[AGENT: NN]` / `[VERIFY]` / `[INTEGRATION NEEDED]`).
>
> Volume note: `grep -c '\[DECISION NEEDED\]' docs/**/*.md` ≈ **810 hits in 239 files** at integration time (2026-05-17). Many are duplicates of the same topic across files; this list dedupes by topic. The full raw list is reproducible via the grep above.
>
> Format: `- [topic] — <one-line decision> — default: <proposal> — owner: <subagent or human role> — files`.

---

## Crates ecosystem (Agent 28 + 29)

- [naming-policy] Alternate registry vs read-only mirror for `nexus-hub` — default: read-only mirror (preserve crates.io as source of truth) — owner: `crate-curator` / `nexus-hub-operator` — `docs/specs/crates/discovery.md`.
- [naming-policy] Index entry retention for yanked crates: forever vs 1 year — default: forever with `health.yanked=true` filter — owner: `nexus-hub-operator` — `docs/specs/crates/discovery.md`.
- [awesome-list-host] Where the community awesome-list lives (org repo? GitHub? hub-hosted?) — default: `github.com/nexus-engine/awesome-nexus` — owner: `crate-curator` — `docs/specs/crates/awesome-nexus.md`, `docs/specs/crates/discovery.md`.
- [genre-multi] Allow multiple secondary genres per crate, or one crate per genre — default: one crate per primary genre; toolkits in `genre-toolkit` — owner: `crate-curator` — `docs/specs/crates/categories.md`.
- [script-lang-headless] Is `script-lang` headless-safe realistic for GPU-compute VMs — default: yes (script logic CPU-only) — owner: `scripting-engineer` — `docs/specs/crates/categories.md`.
- [registration-mechanism] `inventory` vs explicit `register_all!` macro vs build-script codegen — default: `inventory` v1.0; codegen fallback if WASM startup-cost > 50 ms — owner: `crate-author` + `ecs-engineer` — `docs/specs/crates/plugin-trait.md`.
- [async-register] `async fn register()` — default: NO; first-tick scheduled system covers — owner: `ecs-engineer` — `docs/specs/crates/plugin-trait.md`.
- [hot-reload-plugin] Hot-reload plugin lifecycle v1.0 or v1.1 — default: v1.1; v1.0 requires restart — owner: `hot-reload-specialist` — `docs/specs/crates/plugin-trait.md`.
- [plugin-dag-tool] `nexus plugins graph --format=dot` tooling — default: yes; track in consuming.md — owner: `nexus-cli-engineer` — `docs/specs/crates/plugin-trait.md`.
- [sandbox-host] WASM artifacts on hub mirror vs per-crate GitHub releases — default: hub mirror — owner: `nexus-hub-operator` — `docs/specs/crates/sandbox-mode.md`.
- [sandbox-required] Whether `genre` / `script-lang` REQUIRE sandbox mode — default: optional; signal in hub — owner: `security-reviewer` — `docs/specs/crates/sandbox-mode.md`.
- [sandbox-cap-parity] Capability model parity with mods: identical catalog vs crate-specific — default: identical — owner: `mod-sandbox-specialist` — `docs/specs/crates/sandbox-mode.md`.
- [mpl-namespace] Allow MPL-2.0 in `nexus-*` Verified namespace or only `nexus-community-*` — default: allow everywhere — owner: `license-compat-auditor` — `docs/specs/crates/licensing.md`.
- [license-check-wrapper] Standalone `nexus crate license-check` step vs `cargo-deny`-only — default: rely on `cargo-deny`; wrap for JSON — owner: `license-compat-auditor` — `docs/specs/crates/licensing.md`.
- [nexus-vet] Operate shared `nexus-vet` review pool (Mozilla-style) — default: yes, by v1.1 — owner: `crate-curator` — `docs/specs/crates/security.md`.
- [build-script-sandbox] `cargo-sandbox` or Bubblewrap wrapper for build-script — default: defer to v2.0; document risk — owner: `security-reviewer` — `docs/specs/crates/security.md`.
- [publish-and-forget] Auto-PR against `awesome-nexus` on publish — default: yes for Verified, no for Community — owner: `crate-author` — `docs/guides/crates/publishing.md`.
- [crate-new-scenario] `nexus crate new` enforce minimum `tests/scenarios/smoke.toml` — default: warn v1.0, enforce v1.1 — owner: `crate-author` — `docs/guides/crates/publishing.md`.
- [crate-migrate-llm] LLM-driven `nexus crate migrate <crate>` — default: yes by v1.1 via `crate-author` — owner: `crate-author` — `docs/guides/crates/migrating.md`.
- [shim-retention] Compat shim retention window: one major or two — default: one major (mirrors mod SDK) — owner: `crate-curator` — `docs/guides/crates/migrating.md`.
- [forks-register] Public registry of studios on canonical vs forks — default: NO (peer pressure as governance is unhealthy) — owner: `principle-keeper` — `docs/guides/studios/extend-vs-fork-playbook.md`.
- [community-warn] `nexus add` warn when adding `nexus-community-*` over Verified — default: yes, `--prefer-community` to silence — owner: `crate-consumer-advisor` — `docs/guides/crates/consuming.md`.
- [add-auto-pr] `nexus add` auto-PR against awesome-nexus to upvote — default: no — owner: `crate-consumer-advisor` — `docs/guides/crates/consuming.md`.
- [agent-recipes-codegen] Agent recipes as TS code vs prompts — default: code, generated from these recipes — owner: `nexus-coder-architect` — `docs/guides/crates/agent-recipes.md`.
- [mcp-crates-search] Expose MCP tool `nexus.crates.search` for foreign agents — default: yes by v1.1 — owner: `mcp-server-engineer` — `docs/guides/crates/agent-recipes.md`.

## nexus-hub (Agent 30)

- [hub-operator] Who operates the canonical reference instance — default: project foundation / steward — owner: `nexus-hub-operator` — `docs/guides/mods/marketplaces/nexus-hub.md`.
- [hub-feed-blacklist] Governance for feed blacklist (community vote vs admin discretion) — default: TBD — owner: `hub-curator` — `docs/guides/mods/marketplaces/nexus-hub.md`.
- [hub-donations] Whether mod-author donation aggregation lives at hub or marketplace — default: marketplace (hub takes 0% forever) — owner: `nexus-hub-operator` — `docs/guides/mods/marketplaces/nexus-hub.md`.
- [hub-vs-marketplace] Whether the project ships a first-party hub at all (legacy doc; superseded by nexus-hub v1.0 ratification but the marketplaces/nexus-hub.md doc still flags this) — RESOLVED (yes, v1.0) — needs file cleanup — owner: `integration-resolver` next pass — `docs/guides/mods/marketplaces/nexus-hub.md`.

## Mods (Agent 26)

- [native-mods-tier] WASM-component native mods tier — default: v2.0 (see `wasm-mod-author` agent) — owner: `mod-author` + `mod-sandbox-specialist` — `docs/specs/mods/native-mods.md`.
- [tc-cross-game-uuids] Cross-game asset namespacing for TC mods — default: UUID prefix per origin engine — owner: `mod-curator` — `docs/guides/mods/famous-mods-as-tests.md`, `docs/specs/mods/asset-overlay.md`.
- [net-cap-design] `Net` capability design for v1.1 — default: TBD per `docs/specs/scripting/sandbox.md` extension — owner: `mod-sandbox-specialist` — `docs/specs/scripting/sandbox.md`, `docs/guides/mods/famous-mods-as-tests.md`.
- [mod-curator-auto] `mod-curator` runs automatically on every PR vs opt-in — default: opt-in v1.0, auto by v1.1 — owner: `mod-curator` — `docs/guides/mods/agent-recipes.md`.
- [mod-subagent-model] Default model class per mod subagent (cost vs quality) — default: sonnet authoring, opus curating — owner: project mastermind — `docs/guides/mods/agent-recipes.md`.
- [ai-author-model-per-step] Default model class per ai-assisted authoring step — default: sonnet for most, opus for validate — owner: `nexus-coder-architect` — `docs/guides/mods/authoring/ai-assisted.md`.
- [ai-author-asset-providers] Asset-gen provider preference order (Meshy / Scenario / FLUX local) — default: FLUX local first (free), Scenario second, Meshy third — owner: `ai-asset-gen-specialist` — `docs/guides/mods/authoring/ai-assisted.md`.
- [mod-author-publish-gate] Autonomous publish to public marketplaces vs human gate — default: human gate for v1.0; autonomous gated by reputation by v1.1 — owner: `mod-curator` — `docs/guides/mods/authoring/ai-assisted.md`.
- [modio-rust-crate] Bundle `modio` Rust crate as hard dep vs HTTP-only — default: HTTP-only — owner: `crate-author` — `docs/guides/mods/marketplaces/mod-io.md`.
- [modio-ci-sandbox] Default sandbox env for mod.io CI smoke tests — default: dockerized — owner: `ci-engineer` — `docs/guides/mods/marketplaces/mod-io.md`.

## Game-template + CLI (Agent 15)

- [template-pm] Default package manager for `web/` and `mobile/` (pnpm vs bun) — default: pnpm (Turborepo-friendly) — owner: `game-template-engineer` — `docs/game-template/overview.md`, `docs/game-template/structure.md`, `docs/game-template/nexus-toml.md`.
- [template-mod-lang] Default mod scripting language (Rune vs Lua) for `mods/` — default: Rune (sandbox-friendly) — owner: `scripting-engineer` — `docs/game-template/overview.md`.
- [template-infra-iac] `infra/` ships Terraform vs Pulumi vs both — default: Terraform — owner: `deploy-engineer` — `docs/game-template/overview.md`.
- [template-scenes-format] `scenes/` TOML-first vs binary-first vs both — default: TOML-first; binary cache derived — owner: `editor-engineer` — `docs/game-template/structure.md`.
- [template-mobile-framework] `mobile/` React Native default or Flutter option — default: React Native — owner: `game-template-engineer` — `docs/game-template/structure.md`.
- [physics-default] Default physics backend (rapier vs jolt-bridge) — default: rapier — owner: `physics-engineer` — `docs/game-template/nexus-toml.md`.
- [features-enum-closed] `[features]` accept arbitrary engine features vs closed enum — default: closed enum at v1.0; open by v1.1 — owner: `architect` — `docs/game-template/nexus-toml.md`.
- [version-wildcard] Allow `version = "*"` in checked-in manifests — default: no; Cargo.lock-only — owner: `license-compat-auditor` — `docs/game-template/nexus-toml.md`.
- [deploy-schema] `[deploy]` per-provider sub-tables vs single `provider = ...` — default: per-provider sub-tables — owner: `deploy-engineer` — `docs/game-template/nexus-toml.md`.
- [deploy-atomic] `nexus deploy` multi-target atomic deploys — default: TBD; likely sequential w/ rollback — owner: `deploy-engineer` — `docs/game-template/cli.md`.
- [run-replay-snapshot] `nexus run --replay` auto-snapshot on divergence — default: yes — owner: `replay-engineer` — `docs/game-template/cli.md`.
- [agent-invoke-framing] `nexus agent invoke` NDJSON vs JSON-RPC framing — default: NDJSON for streaming, JSON-RPC for request/response — owner: `agent-api-engineer` — `docs/game-template/cli.md`.

## Merge system + governance (Agent 16)

- [maintainer-governance] Maintainer governance file (`docs/governance/maintainers.toml`) schema + quorum — default: TBD — owner: `architect` — `docs/guides/merge-system.md`.
- [multi-repo-merge] Atomic multi-repo merge (engine + game-template + cli) vs sequential — default: sequential at v1.0; atomic by v1.1 — owner: `merge-bot` — `docs/guides/merge-system.md`.
- [llm-provider-abstraction] Single-vendor lock-in vs portability for S8 LLM provider — default: abstraction layer; Anthropic primary, OpenRouter fallback — owner: `nexus-coder-architect` — `docs/guides/merge-system.md`.
- [audit-log-retention] Audit-log retention beyond GitHub: object store choice, signing key rotation — default: S3-compatible + Sigstore-rooted signing — owner: `security-reviewer` — `docs/guides/merge-system.md`.
- [pre-1-semver-adr] Pre-1.0 semver policy ADR — default: write next session — owner: `architect` — `docs/guides/pr-protocol.md`.
- [agent-name-registry] `agent.name` registry shape — embedded TOML vs external service — default: embedded TOML at v1.0 — owner: `agent-api-engineer` — `docs/guides/pr-protocol.md`.
- [depends-on-semantics] Multi-PR `Depends-On:` atomic batching at S10 — default: best-effort sequential — owner: `merge-bot` — `docs/guides/pr-protocol.md`.
- [security-channel] Security email / report channel — default: TBD — owner: `security-reviewer` — `docs/guides/contribution.md`.
- [realtime-chat] Real-time chat platform (Discord vs Matrix vs Zulip) — default: TBD — owner: project lead — `docs/guides/contribution.md`.
- [coc-file] Code of conduct file — default: adopt Rust CoC verbatim (see `community-policy.md`) — owner: `principle-keeper` — `docs/guides/contribution.md`, `docs/guides/crates/community-policy.md`.
- [funding-governance] Funding governance file — default: TBD — owner: project lead — `docs/guides/contribution.md`.
- [maintainers-governance] Maintainers governance file — default: TBD — owner: `architect` — `docs/guides/contribution.md`.

## AI dev + onboarding

- [agent-identity-registry] Agent identity registry shape and rotation policy — default: TBD — owner: `agent-api-engineer` — `docs/guides/ai-dev-onboarding.md`.
- [reputation-pii] Reputation publishing format + PII handling for human contributors — default: opt-in display name + opaque agent ID — owner: `security-reviewer` — `docs/guides/ai-dev-onboarding.md`.

## Liveops

- [stale-flag-policy] Default stale-flag policy — default: 90 days warn, 180 days hard error in CI — owner: `feature-flag-specialist` — `docs/guides/liveops/feature-flags.md`.
- [ab-stat-method] Default A/B stat method — Bayesian vs frequentist sequential — default: Bayesian — owner: `liveops-engineer` — `docs/guides/liveops/ab-testing.md`.

## Tooling

- [formatter-bump-cadence] Auto-bump cadence (Renovate weekly vs monthly batched) — default: weekly Renovate — owner: `ci-engineer` — `docs/guides/coding-style/formatting-tools.md`.

## AAA path (Agent 22)

- [aaa-revshare] Revenue-share / sponsorship model for community contributors — default: TBD per project — owner: project lead — `docs/game-template/aaa-path.md`.
- [aaa-human-required] At what point an AAA Nexus game MUST hire a human (legal? compliance? IP?) — default: TBD — owner: project lead — `docs/game-template/aaa-path.md`.
- [aaa-architect-write] Whether `architect` agent gets write-access to `Nexus.toml` itself — default: PR-suggest only — owner: `architect` — `docs/game-template/aaa-path.md`.

## Compose-don't-build (Agent 32)

- [recipe-spec-location] "engine-within-the-engine" specs under `docs/specs/<subsystem>/` vs `docs/specs/recipes/<subsystem>/` — default: current location — owner: `architect` — `docs/architecture/08-compose-dont-build.md`.
- [recipe-templates] `nexus-template-*` crates vs `nexus-cli` builtin assets — default: crates (versioned, Cargo-resolvable) — owner: `nexus-cli-engineer` — `docs/architecture/08-compose-dont-build.md`.
- [recipe-listing-order] `nexus new --help` recipe order (alpha vs popularity vs curated) — default: curated-by-difficulty — owner: `onboarding-coach` — `docs/architecture/08-compose-dont-build.md`.

## Weekend MVP

- [weekend-deploy-confirm] `nexus deploy steam --branch=default` explicit confirmation — default: require `--confirm` — owner: `release-engineer` — `docs/game-template/weekend-mvp.md`.
- [weekend-loc-human] Human-in-the-loop for LLM-only localization — default: pass-through w/ review queue — owner: `nexus-coder-architect` — `docs/game-template/weekend-mvp.md`.

---

## How to drain this list

1. Pick one topic.
2. Spawn the owner subagent (or the closest match in `.claude/agents/`) with the prompt: "Resolve the `[topic]` decision in `docs/architecture/decisions-open.md`. Read the affected files. Propose + ratify per the default OR justify a different answer."
3. The subagent updates the affected files inline (resolves the flag with `RESOLVED YYYY-MM-DD`), removes the line from THIS file, appends to `docs/architecture/decisions-resolved.md`.
4. If the decision is architecturally significant → also open an ADR under `docs/architecture/05-adr/`.

Bulk drains: `decision-log-keeper` subagent owns the periodic sweep.
