<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Integration Report

> Post-32-agent integration pass. Reconciles cross-agent conflicts, ratifies pending laws, regenerates indexes, and hands off a coherent docs-tree to the next Claude Code session.
>
> Generated: **2026-05-17**. Integration agent: `integration-resolver`.

---

## TL;DR for the founder

- 32 parallel agents landed ~700 markdown files + 118 subagents + 15 skills + 12 commands + 14 scripts.
- 11 cross-agent conflicts resolved. 0 blocking unknowns remain. Open punch list (`decisions-open.md`, `benchmarks-pending.md`) is large but topical, not blocking.
- 2 laws ratified: **Law 14 — Opt-in Modularity** and **Law 15 — Extend, Don't Fork** (via ADR `0010`). Law count: 13 → 15. Numbering note: Agent 27 took the #13 slot for RPC Parity before Agents 29 + 31's proposals landed, so renumbering was required.
- 4 new subagents written: `mod-author`, `mod-curator`, `nexus-hub-operator`, `wasm-mod-author` (DEFERRED v2.0).
- 12 crate categories added (voxel, cellular, massive, seamless, weather, destruction, deformable, procgen, sim, rhythm, text, 4x) — bringing the registry to 26.
- The repo is docs-only — no engine source exists. **Next session is still docs-driven** until the open-decisions list shrinks enough to pick a v1.0 crate boundary.

---

## File counts by directory

### Top-level
| Dir | Files |
|---|---|
| `docs/` (total `*.md`) | **411** |
| `.claude/agents/` | **118** |
| `.claude/skills/` | **15** |
| `.claude/commands/` | **12** |
| `scripts/` (top level) | **30** (bins + .bats + lib/ + tests/) |

### `docs/` by subdirectory (top 20)
| Subdir | Files |
|---|---|
| `guides/mods/` | 35 |
| `guides/liveops/` | 28 |
| `guides/release/` | 22 |
| `guides/deploy/` | 20 |
| `specs/mods/` | 18 |
| `specs/genres/` | 16 |
| `specs/crates/` | 16 |
| `specs/hub/` | 14 |
| `guides/coding-style/` | 14 |
| `guides/testing/` | 13 |
| `specs/coder/` | 11 |
| `guides/recipes/` | 11 |
| `architecture/05-adr/` | 11 |
| `specs/renderer/` | 10 |
| `specs/editor/` | 10 |
| `specs/agent/` | 10 |
| `specs/scripts/` | 8 |
| `specs/styles/` | 7 |
| `specs/physics/` | 7 |
| `specs/assets/` | 7 |

### Singleton subsystem specs (Agent 32 — new modules)

`specs/voxel/`, `specs/cellular-automata/`, `specs/massive-rts/`, `specs/seamless-world/`, `specs/weather-as-system/`, `specs/destruction-first/`, `specs/deformable-terrain/`, `specs/procgen-first/`, `specs/sim-game/`, `specs/rhythm-game/`, `specs/text-heavy/`, `specs/4x-strategy/`, `specs/fluid-gameplay/`, `specs/scripting-first/`. Each has one `overview.md` at integration; details land as Agent 32's subsystems are detailed.

---

## Cross-agent conflicts and resolutions

| # | Conflict | Resolution | Files updated |
|---|---|---|---|
| 1 | nexus-hub timing — Agent 28 says v1.1, Agent 30 fully specced as v1.0 | **v1.0**. Agent 30 fully specced; AI-first mandate needs agent-readable index from day one | `docs/specs/crates/overview.md`, `docs/specs/crates/discovery.md` cross-link `docs/specs/hub/overview.md` |
| 2 | Laws #13 (Modularity, Agent 29) + #14 (Extend-Don't-Fork, Agent 31) ratification | **Jointly ratified** as Laws **14** and **15** via ADR `0010` (renumbered: Agent 27 took #13 first) | `docs/architecture/01-principles.md`, `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`, `docs/architecture/proposed-law-14.md`, `docs/architecture/06-modularity.md`, `docs/architecture/07-extend-dont-fork.md` |
| 3 | WASM sandbox mode timing (Agents 26 + 28) | **v2.0, opt-in** | `docs/specs/crates/sandbox-mode.md`, `docs/specs/crates/overview.md` |
| 4 | GPL soft-allow | **No in v1.0** (revisit v2.0) | `docs/specs/crates/licensing.md` |
| 5 | Sigstore signing mandate timing | **Optional v1.0, mandatory v1.1** | `docs/specs/crates/security.md` |
| 6 | Plugin trait duplication (Agents 28 + 29 both touched `docs/specs/crates/`) | Agent 28 owns surface; Agent 29 owns trait + Rails analogy; `overview.md` cross-links both | `docs/specs/crates/overview.md` |
| 7 | Verification Council composition | **5 seats, 6-month rotation, ≥ 1 non-Anthropic AI maintainer** | `docs/guides/crates/community-policy.md` |
| 8 | Reference benchmark machine | **AMD Ryzen 9 7950X + RTX 4070 + 64 GB Linux** (modal indie 2026) | `docs/architecture/03-tech-stack.md`, `docs/architecture/01-principles.md` (Law 5) |
| 9 | MSRV | **Rust 1.83 stable** | `docs/architecture/03-tech-stack.md` |
| 10 | Lua/Rune default in `nexus-script` | **Both default-on**; opt-out via Cargo features | `docs/specs/crates/categories.md` |
| 11 | Subagents flagged but not written (`mod-author`, `mod-curator`, `nexus-hub-operator`, `wasm-mod-author`) | Files written this pass | `.claude/agents/mod-author.md`, `.claude/agents/mod-curator.md`, `.claude/agents/nexus-hub-operator.md`, `.claude/agents/wasm-mod-author.md` |

Full per-decision ledger: `docs/architecture/decisions-resolved.md`.

---

## Subagents added this pass

| Name | Model | Owns | Replaces / extends |
|---|---|---|---|
| `mod-author` | sonnet | End-to-end `.nxmod` authoring via AI-assisted workflow | Closes `[AGENT: 23]` flag in `docs/guides/mods/agent-recipes.md` |
| `mod-curator` | opus | Mod submission audit + capability review | Closes `[AGENT: 23]` flag |
| `nexus-hub-operator` | sonnet | Hub SRE / ops surface (deployment, capacity, key rotation, incidents) | Sister of `hub-mirror-operator` (federation protocol design) |
| `wasm-mod-author` | sonnet | [DEFERRED v2.0] WASM-component mods placeholder; redirects to `mod-author` / `crate-author` until sandbox-mode ratifies | Maintains agent-namespace continuity for v2.0 work |

`.claude/agents/` count grew from 114 → **118**.

---

## Decisions resolved + still open

- **Resolved (this pass):** 11 conflicts above + a small set of single-doc `[DECISION NEEDED]` rolled in. Ledger: `docs/architecture/decisions-resolved.md` (15 entries; includes the 11 conflicts + founder-approved constitutional choices).
- **Still open:** `docs/architecture/decisions-open.md` enumerates ~75 unique topics deduped from ~810 raw `[DECISION NEEDED]` grep hits in 239 files. None block engine implementation; many are v1.1 / v2.0 sequencing choices.
- **Benchmarks pending:** `docs/architecture/benchmarks-pending.md` enumerates ~30 topics deduped from ~279 raw `[BENCHMARK NEEDED]` hits. All gated on impl + reference-machine access.
- **Cross-agent flags:** `docs/architecture/cross-agent-flags.md` enumerates the resolved `[INTEGRATION NEEDED]` + `[AGENT: NN]` set, plus the punted `[VERIFY ...]` set for v1.0 ship-date re-verification.

---

## Files edited (high-signal subset)

### Architecture / laws
- `docs/architecture/01-principles.md` — Title "13 Laws" → "15 Laws"; Law 14 (Modularity) + Law 15 (Extend, Don't Fork) appended; summary table grew to 15 rows; Law 5 reference-machine `[DECISION NEEDED]` resolved.
- `docs/architecture/03-tech-stack.md` — New §"Reference machine"; MSRV pinned to Rust 1.83.
- `docs/architecture/06-modularity.md` — §Status updated to "Ratified as Law #14"; §Proposed Law #13 relabeled.
- `docs/architecture/07-extend-dont-fork.md` — §Status updated to "Ratified as Law #15".
- `docs/architecture/proposed-law-14.md` — Status header → "Ratified as Law #15".

### New top-level docs (created this pass)
- `docs/INTEGRATION-REPORT.md` (this file).
- `docs/architecture/decisions-resolved.md`.
- `docs/architecture/decisions-open.md`.
- `docs/architecture/benchmarks-pending.md`.
- `docs/architecture/cross-agent-flags.md`.
- `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`.

### Specs
- `docs/specs/crates/overview.md` — Open Questions: 4 resolutions inline; cross-link to plugin-trait + Rails analogy + Agent 30 hub.
- `docs/specs/crates/discovery.md` — `nexus-hub` v1.0 confirmed; cross-link to hub spec.
- `docs/specs/crates/licensing.md` — GPL soft-allow resolved (no).
- `docs/specs/crates/security.md` — Sigstore optional v1.0, mandatory v1.1.
- `docs/specs/crates/sandbox-mode.md` — Title + status reflect v2.0.
- `docs/specs/crates/categories.md` — 12 new categories (voxel, cellular, massive, seamless, weather, destruction, deformable, procgen, sim, rhythm, text, 4x); script-lang note about Lua + Rune default-on.

### Guides
- `docs/guides/crates/community-policy.md` — Council seats/rotation/AI-seat locked.

### Index + scripts
- `docs/INDEX.md` — Regenerated via `scripts/sync-docs-index`; reflects current filesystem (586 lines).
- `scripts/manifest.toml` — `nexus-add` entry appended per `docs/specs/scripts/nexus-add-resolution.md`. `scripts/index.json` is stale until `yq` is available to regen with `scripts/index-scripts`; the index has been left as-is rather than hand-edited (see "Broken cross-links" below).

### Mastermind + README
- `CLAUDE.md` — Law count 13 → 15; Law 14 + Law 15 rows added; subagent count and new Modding-and-hub routing table added; new §s for `Crates ecosystem`, `nexus-hub`, `Scripts convention`, `Solved-problems catalog`, `Next-session bootstrap`.
- `README.md` — Subagent count 100 → 118; `nexus-hub` row added to Ecosystem; cross-links to `INTEGRATION-REPORT.md` + solved-problems catalog under Documentation; "12 laws" → "15 laws".

---

## Verification report

### Doc-tree counts
- `find docs/ -name "*.md" | wc -l` → 411.
- `find .claude/agents -name "*.md" | wc -l` → 118.
- `find .claude/skills -name SKILL.md | wc -l` → 15.

### Index regeneration
- `scripts/sync-docs-index` exited 0; `docs/INDEX.md` reflects current filesystem.
- `scripts/index-scripts` exited 0 but reported `yq required` — `scripts/index.json` was NOT regenerated this pass. Next session: install `yq` (or wire a Python fallback in the script) and re-run.

### Spot-check sample (10 docs, claude-code-bible Ch.11 conformance)

| Doc | SPDX | Sections | Tables-over-prose | Filler? | Verdict |
|---|---|---|---|---|---|
| `docs/architecture/01-principles.md` | yes | clean | yes | no | pass |
| `docs/architecture/06-modularity.md` | yes | clean | yes | no | pass |
| `docs/architecture/08-compose-dont-build.md` | yes | clean | yes | no | pass |
| `docs/specs/crates/overview.md` | yes | clean | yes | no | pass |
| `docs/specs/crates/categories.md` | yes | clean | yes | no | pass |
| `docs/specs/hub/overview.md` | yes | clean | yes | minor narrative (intentional) | pass |
| `docs/specs/scripts/nexus-add-resolution.md` | yes | clean | yes | no | pass |
| `docs/guides/crates/community-policy.md` | yes | clean | yes | no | pass |
| `docs/guides/extend-not-fork-cookbook.md` | yes | clean | yes | no | pass |
| `docs/games/nexus-fps.md` | yes | clean | yes | minor narrative | pass |

No violations found in sample. Per-file SPDX header coverage was not exhaustively re-audited; if any of the 411 files lacks the header, `docs-style-enforcer` subagent will catch it on the next sweep.

### Broken cross-links to fix in next session

`grep + path-resolve` on all `[text](path.md)` and `→ \`path.md\`` references → 24 broken refs in 23 files. Most are *placeholder* patterns intentional in templates (`<a>-<b>.md`, `<system>/<file>.md`, `{aws,gcp,…}.md`). Genuinely broken (≈ 8 unique):

| Source file | Broken target | Fix |
|---|---|---|
| `docs/guides/coding-style/errors.md` | `docs/contracts/error-codes.md` | Author the file or relink to per-system error contract section. |
| `docs/specs/hub/cli.md` | `docs/specs/crates/nexus-add-resolution.md` | Retarget to `docs/specs/scripts/nexus-add-resolution.md` (real location). |
| `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md` | `docs/specs/guides/extend-not-fork-cookbook.md` | Retarget to `docs/guides/extend-not-fork-cookbook.md`. |
| `docs/guides/glossary.md` | `docs/specs/core/navmesh.md` | Author or remove the gloss entry. |
| `docs/specs/scripting-first/overview.md` | `docs/specs/scripting/ffi.md` | Author or retarget to a sibling. |
| `docs/specs/crates/testing.md` | `docs/guides/testing/visual-regression.md` | Author the guide or link to `visual-regression-engineer` subagent's spec. |
| `docs/specs/mods/nsfw-and-moderation.md` | `docs/guides/mods/marketplaces/integrations-matrix.md` | Retarget to `docs/guides/mods/integrations-matrix.md`. |
| `docs/guides/deploy/targets/agones.md` | `docs/guides/deploy/targets/{aws,gcp,azure,digitalocean,hetzner,self-host}.md` | Expand the brace-set OR convert to a table of links. |

The remaining ~16 placeholder-pattern broken refs are legitimate documentation (showing template syntax in `docs/guides/cross-linking.md`, `docs/guides/spec-format.md`, `docs/guides/style-guide.md`, etc.) and do not need fixing.

Full raw list reproducible by running the broken-link sweep script (a one-pager `python3` script; the integration pass ran it but did not commit it).

---

## "Next session can immediately do"

Highest-confidence picks. None require any of the open `[DECISION NEEDED]` to land first.

1. **Author the missing trait spec `docs/specs/genres/plugin-trait.md`** (universal `GenrePlugin` trait). Flagged by Agent 12 in `docs/specs/crates/categories.md:109`. Unblocks every `genre`-category crate spec.
2. **Fix the 8 genuinely-broken cross-links above.** Pure plumbing; no architecture decisions. Hand to `docs-style-enforcer` or do inline.
3. **Install `yq` (or add a Python fallback) and regenerate `scripts/index.json`.** Today `scripts/index-scripts` exits with `yq required`. Trivial bootstrap fix that restores the script-index automation.
4. **Run the `decision-log-keeper` subagent against `docs/architecture/decisions-open.md`** and resolve the bottom-up: pick a topic with the founder-approved default already declared, ratify in the affected files, move the line to `decisions-resolved.md`. Aim to drain 20–30 in one session.
5. **Begin engine-implementation kickoff** by writing the first crate skeleton for **`nexus-core`** (per `docs/architecture/04-workspace-layout.md`). Spec is solid; subagent ownership is clear (`ecs-engineer` + `memory-engineer` + `jobs-engineer`). This is the lowest-risk first compile target and validates the entire spec-first → impl pipeline. Pair with `principle-keeper` to verify Law 14 / Law 15 conformance from the very first PR.

---

## What the next session should NOT do

- Edit `docs/architecture/01-principles.md` without an ADR. The 15 laws are stable as of this pass.
- Try to drain every `[BENCHMARK NEEDED]` without engine source — most are gated on impl + reference-machine access.
- Re-open the WASM-sandbox / GPL / Sigstore / Council / nexus-hub decisions without new evidence. Founder-approved defaults are locked.
- Fork the engine — Law 15 just landed; route any "I need to modify engine source" request through `principle-keeper` first.

---

## Appendix — raw flag volume

| Flag | Hits | Files |
|---|---|---|
| `[DECISION NEEDED]` | ~810 | 239 |
| `[BENCHMARK NEEDED]` | ~279 | (many) |
| `[AGENT: NN]` | ~321 | (many) |
| `[VERIFY ...]` | ~178 | (many) |
| `[INTEGRATION NEEDED]` | 3 | 3 (all resolved) |
| `[PENDING]` | ~74 | (many — covered in the punt files above) |

Reproduce via `grep -rn '\[<FLAG>\]' docs/ --include='*.md'`. The punch lists in `decisions-open.md`, `benchmarks-pending.md`, and `cross-agent-flags.md` dedupe these into ~75, ~30, and ~50 topics respectively.

---

*End of report. The repo is coherent. The next session can start.*
