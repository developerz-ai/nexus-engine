<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Coding Style — Overview

One style. Engine and game template. Identical. No exceptions.

## The meta-rule

A dev running `nexus new mygame` inherits this style preconfigured. They write code. They never configure a linter, formatter, or test runner.

| Layer | Same config in |
|-------|----------------|
| `nexus-engine/crates/*` | engine source |
| `nexus-game-template/game/` | scaffolded game core |
| `nexus-game-template/server/` | scaffolded server |
| `nexus-game-template/web/` · `mobile/` | scaffolded clients |
| `nexus-game-template/dlc/` · `mods/` | scaffolded extensions |
| `nexus-game-template/ai-agents/` | scaffolded agents |

→ `docs/game-template/structure.md` · → `docs/architecture/01-principles.md`

## Rationale

| Why | Outcome |
|-----|---------|
| Zero bikeshedding | No PR thread debates tabs vs spaces |
| AI-friendly grep | Every codebase looks the same to a subagent |
| Reviewable by any agent | nexus-merge applies identical rules everywhere |
| Onboarding ≈ 0 | Open repo → run `nexus fmt` → ship |
| Style drift = bug | CI rejects deviation; no human-judgment loophole |

## Per-language files

| Language | File |
|----------|------|
| Rust | `rust.md` |
| TypeScript | `typescript.md` |
| WGSL | `wgsl.md` |
| Lua | `lua.md` |
| Python | `python.md` |
| SQL | `sql.md` |
| TOML/JSON | `toml-json.md` |

## Cross-cutting files

| Concern | File |
|---------|------|
| Comment policy | `comments.md` |
| Naming (universal) | `naming.md` |
| Error contract | `errors.md` |
| Structured logging | `logging.md` |
| Dependency policy | `dependencies.md` |
| Tool versions / CI gates | `formatting-tools.md` |

## Hierarchy when rules conflict

1. `errors.md` (machine contract — overrides all)
2. `naming.md` (cross-language grep)
3. `comments.md` (doc-comment mandates)
4. Per-language file
5. `formatting-tools.md` (tool-enforced default)

Lower wins only if higher is silent.

## The AI-first lens

| Style choice | AI benefit |
|--------------|-----------|
| `thiserror` enum codes | Parseable by nexus-merge |
| `tracing` JSON spans | Queryable by agents |
| `#[deny(missing_docs)]` | Every public symbol has machine-readable doc |
| `kebab-case` files | Stable grep targets |
| `biome` (one tool) | One JSON output for nexus-merge to parse |

## Hard rules

- All lint errors → structured JSON. No prose-only diagnostics.
- All formatters auto-fix on save (editor) and on commit (hook).
- CI gate: `fmt → lint → unit → integration → scenario → perf → visual`. → `docs/guides/testing/ci.md`
- License: MIT/Apache-2/BSD/MPL only. → `dependencies.md`
- File length: ≤500 LOC. Split larger files into nested modules. → `rust.md`, `typescript.md`

## What this is NOT

- Not a guideline. Not a suggestion. Hooks block deviation.
- Not negotiable per-project. The template ships locked.
- Not ejectable in v1.0. [DECISION NEEDED] — eject path for v2.0?

## Cross-link

- → `docs/guides/style-guide.md` (Agent 19, prose style)
- → `docs/specs/agent/scenarios.md` (test-runner contract)
- → `docs/architecture/01-principles.md` (binding laws)
