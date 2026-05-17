<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Cross-Agent Flags

> Every `[AGENT: NN]`, `[INTEGRATION NEEDED]`, and `[VERIFY ...]` flag across the corpus. Grouped by status — resolved in the 2026-05-17 integration pass vs punted to the next session.
>
> Pair files: `docs/architecture/decisions-open.md`, `docs/architecture/decisions-resolved.md`, `docs/architecture/benchmarks-pending.md`.
>
> Volume at integration: `[AGENT: NN]` ≈ **321 hits**, `[INTEGRATION NEEDED]` ≈ **3 hits**, `[VERIFY ...]` ≈ **178 hits**. List dedupes by topic; raw grep is reproducible.

---

## Resolved in this pass (2026-05-17)

### `[INTEGRATION NEEDED]`

- `docs/specs/hub/overview.md:149` — Agent 30 says discovery.md MUST point to hub overview. **Resolved** — `docs/specs/crates/discovery.md` updated to cite `docs/specs/hub/overview.md` as canonical and to mark hub v1.0.
- `docs/specs/hub/verification.md:20` — depends on `docs/specs/crates/quality-bar.md` existing. **Resolved** — quality-bar.md exists (Agent 28); cross-link verified.
- `docs/specs/hub/index-format.md:102` — same dependency. **Resolved** — cross-link verified.

### `[AGENT: 23]`

- `docs/guides/mods/agent-recipes.md:218` — Author `mod-author` and `mod-curator` subagent files. **Resolved** — files created in `.claude/agents/mod-author.md` and `.claude/agents/mod-curator.md` (integration pass).

### Cross-agent overlap (Agents 28 + 29)

- `docs/specs/crates/plugin-trait.md` + `docs/specs/crates/rails-plugin-model.md` (Agent 29) vs `docs/specs/crates/overview.md` (Agent 28). **Resolved** — overview.md now cross-links both. Agent 28 owns the public surface; Agent 29 owns the trait + Rails analogy.

### Numbering collision (Agents 27 + 29 + 31)

- Agent 27 took Law #13 slot for Agent–Editor RPC Parity in `01-principles.md`. Agent 29's Opt-in Modularity (proposed as #13) and Agent 31's Extend-Don't-Fork (proposed as #14) needed renumbering. **Resolved** — ratified jointly via ADR `0010` as **Law #14** and **Law #15**. Source files updated to reflect renumbering.

### Reference machine + MSRV (Agent 01)

- Reference benchmark machine `[DECISION NEEDED]` in Law 5 of `01-principles.md` — **Resolved** — AMD Ryzen 9 7950X + RTX 4070 + 64 GB Linux; pinned in `docs/architecture/03-tech-stack.md` §"Reference machine".
- MSRV — **Resolved** — Rust 1.83 stable; pinned in `03-tech-stack.md` §"Versioning policy".

---

## Punted to next session (representative sample — full list reproducible via grep)

### `[AGENT: 03]` — Renderer

- `docs/games/nexus-fps.md:163` — Renderer must hit 144 Hz on Mid band with PBR+CSM+bloom+TAA. Owner: `renderer-engineer`.
- `docs/guides/cross-linking.md:99` — Confirm renderer extract stage tolerates exclusive World lock.

### `[AGENT: 05]` — Physics + character controller

- `docs/games/nexus-fps.md:164` — Character controller supports Q3-style strafe-jump kinematics; deterministic across platforms. Owner: `character-controller-specialist` + `determinism-auditor`.

### `[AGENT: 07]` — Networking

- `docs/games/nexus-fps.md:165` — Rollback netcode 6-player + 100 ms RTT + 5 % loss as upper-bound test. Owner: `rollback-specialist`.

### `[AGENT: 09]` — Assets

- `docs/guides/cross-linking.md:100` — Asset handle stability across frames; ref-count semantics. Owner: `asset-pipeline-engineer`.
- `docs/games/overview.md:118` — `nexus-assets` CLI must support Kenney/Poly Haven/AI-gen import before demo assets sourcable reproducibly.

### `[AGENT: 10]` — Agent SDK

- `docs/games/nexus-fps.md:166` — Scenario TOML schema match; coordinate field names. Owner: `scenario-author`.
- `docs/game-template/overview.md:69` — Agent SDK API surface; template's `ai-agents/` references it. Owner: `agent-sdk-specialist`.
- `docs/game-template/aaa-path.md:209` — Agent fleet expansion patterns (architect, live-ops, crash-triage). Owner: `architect`.
- `docs/games/overview.md:116-117` — Telemetry hooks must exist before scenario runners can validate demos; scenario format + replay determinism contract upstream.

### `[AGENT: 12]` — Genres

- `docs/games/nexus-fps.md:167` — `docs/specs/genres/fps.md` must expose surfaces used in nexus-fps. Owner: `fps-genre`.
- `docs/games/overview.md:120` — Genre specs (fps/rpg/rts/platformer) must declare public surfaces each demo consumes.
- `docs/game-template/overview.md:70` — Genre modules; template includes one selected at `nexus new` time.
- `docs/game-template/aaa-path.md:210` — MMORPG + MOBA + open-world carry most of the heavy lifting at scale.
- `docs/specs/crates/categories.md:109` — Author `docs/specs/genres/plugin-trait.md` (universal `GenrePlugin` trait).

### `[AGENT: 16]` — Merge bot

- `docs/games/overview.md:119` — AI merge system needs perf-delta tolerance config; default tolerances `[DECISION NEEDED]`.
- `docs/game-template/overview.md:71` — Template's `.github/` includes nexus-merge config.
- `docs/game-template/aaa-path.md:211` — AI merge bot SLAs at 100 commits/hour.

### `[AGENT: 17]` — Demo games + integration team

- `docs/game-template/overview.md:72` — Demo games built FROM template; serve as integration tests.
- `docs/game-template/aaa-path.md:212` — Need a demo game that walks the AAA path as an integration test.

### `[AGENT: 18]` — nexus-coder

- `docs/guides/mods/agent-recipes.md:219` — Confirm `nexus-coder` workflows `mod-from-prompt` / `mod-from-spec` shipped. Owner: `nexus-coder-architect`.
- `docs/guides/liveops/ai-triage.md:216` — Confirm `docs/specs/coder/workflows.md` defines the `submit_pr(...)` step coder uses.
- `docs/specs/crates/discovery.md:188` — Confirm `nexus-coder` tool surface includes an HTTP fetcher with allow-list for the index host.

### `[AGENT: 02]` — Telemetry

- `docs/games/overview.md:116` — Telemetry hooks must exist before scenario runners can validate demos. Owner: `telemetry-specialist`.

### `[AGENT: 28]` — Crates

- `docs/architecture/06-modularity.md` §Status — cross-touches with Agent 28's `specs/crates/*` — verified during this integration pass.

---

## `[VERIFY ...]` — facts that need re-verification at v1.0 ship date

### Marketplace + ecosystem policy

- `docs/specs/crates/licensing.md:217` — Re-verify all SPDX ids against latest list at v1.0 ship.
- `docs/specs/crates/discovery.md` + multiple files — `[VERIFY — crates.io policy changes]` for name-squatting + yank semantics.
- `docs/guides/mods/overview.md:78` — `[VERIFY — marketplace policy changes]` across the full per-marketplace matrix.
- `docs/guides/mods/marketplaces/mod-io.md` — `[VERIFY — mod.io policy changes]`, `[VERIFY — current console SDK availability]`.
- `docs/guides/mods/marketplaces/curseforge.md` — `[VERIFY — CurseForge / Overwolf policy changes]`.
- `docs/guides/release/sideloading.md:229` — `[VERIFY — Apple's sideload posture evolves]`.
- `docs/guides/deploy/region-matrix.md:129` — `[VERIFY — sanctions regimes change]`.

### Public-talk citations (Agent 32 + others)

- `docs/specs/cellular-automata/overview.md:181` — `[VERIFY — Petri Purho GDC 2019 talk]`.
- `docs/specs/rhythm-game/overview.md:204-205` — `[VERIFY — Brace Yourself dev posts]`, `[VERIFY — Beat Games tech URL]`.
- `docs/architecture/08-compose-dont-build.md` cost-equation row — `[VERIFY — Factorio FFF retrospective]`, `[VERIFY — Noita GDC 2019 talk]`.

### Single-doc verification

- `docs/architecture/proposed-law-14.md` open questions — `[VERIFY]` cookbook row count pinned at 14 (bump as new surfaces are added).

---

## How to drain this list

1. `[INTEGRATION NEEDED]` — verify the cross-link exists; either resolve (preferred) or convert to a `[DECISION NEEDED]` if the dependency itself is in flux.
2. `[AGENT: NN]` — route to the owning subagent for that domain. The subagent confirms / rejects, removing the flag and adding the conclusion inline.
3. `[VERIFY …]` — schedule a verification campaign before v1.0 ship; re-check policy + URL freshness; replace with `Verified YYYY-MM-DD` inline.

Bulk drains: `integration-resolver` subagent owns the per-batch sweep.
