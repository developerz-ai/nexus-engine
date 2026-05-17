<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Subagent Fleet — House Style

Rules for writing a new subagent file under `.claude/agents/`. Conform or `nexus-merge` rejects the PR.

## File Format

```
---
name: kebab-case-name
description: One sentence. When Claude should route to this subagent. Specific enough that routing is unambiguous.
tools: Read, Edit, Write, Bash, Grep, Glob       # narrow as appropriate
model: sonnet                                    # opus | sonnet | haiku
---

{system prompt — bullets, fragments, ≤ 80 lines}
```

## Required Frontmatter Fields

| field | rule |
|---|---|
| `name` | kebab-case. Matches filename. Unique across the fleet. |
| `description` | one sentence. Names the trigger ("Use when X"). No fluff. |

## Optional Fields We Use

| field | when |
|---|---|
| `tools` | narrow. Default is "inherit all" — almost never what you want. |
| `model` | always set explicitly. Tier per the table below. |
| `disallowedTools` | use to subtract from inherited set (e.g. read-only auditor: `Write, Edit`). |
| `permissionMode` | leave default unless the agent must run unattended (`acceptEdits`). |
| `isolation` | `worktree` for any agent that runs in a parallel batch. |
| `color` | optional. Helps UI scanning. |

## Tool Narrowing Rules

| agent class | tools |
|---|---|
| research / audit | `Read, Grep, Glob, WebSearch, WebFetch` |
| spec / contract / doc author | `Read, Write, Edit, Grep, Glob` |
| domain engineer (impl) | `Read, Write, Edit, Bash, Grep, Glob` |
| reviewer | `Read, Grep, Glob, Bash` (no Write/Edit) |
| orchestrator | `Agent, Read, Grep, Glob` (NEVER Edit/Write) |
| sweeper (glossary, style) | `Read, Edit, Grep, Glob` |

WebSearch/WebFetch only on agents that explicitly need the web (research, prior-art, ci-engineer for upstream docs).

## Model Tiers

| tier | use for |
|---|---|
| `opus` | architecture, orchestration, final review, ADRs, principle-keeping |
| `sonnet` | every domain engineer, spec/contract/test authors, deploy/release/liveops |
| `haiku` | docs sweeps, glossary, coverage audit, mechanical bulk edits |

## Body Style (the System Prompt)

| rule | example |
|---|---|
| Persona = one sentence | "You own the rollback netcode subsystem." |
| Owns/Does-not-own block | mirror the spec format |
| Non-negotiables = bullets | one rule per line |
| Reference files by absolute path | `docs/specs/networking/rollback.md` |
| Success criteria = checklist | "[ ] tests pass [ ] bench ≥ baseline" |
| No filler | drop "as an expert in…", "make sure to…" |

### Required body sections (in order)

```
## Owns
- {spec paths this agent is responsible for}
- {crate paths this agent edits}

## Does not own
- {explicit exclusions, with the agent that does}

## Non-negotiables
- {one rule per line, imperative}

## Workflow
1. {step}
2. {step}
…

## Success criteria
- [ ] {assertion}
- [ ] {assertion}
```

≤ 80 lines body total. If longer, the agent's scope is too wide — split it.

## Description-Field Routing

Claude routes on the `description` field alone. Bad descriptions cause mis-routing.

| ✗ vague | ✓ specific |
|---|---|
| "Helps with rendering." | "Implements WGSL shaders and material permutations per `docs/specs/renderer/shaders.md`. Use for shader bugs, PBR/NPR material work, or hot-reload pipeline changes." |
| "Does physics." | "Owns rigid-body dynamics, joints, motors per `docs/specs/physics/rigid.md`. Use for collision response, constraint solver tuning, or rapier integration changes." |

Start with the **verb** the agent does. Follow with the **spec path**. End with **"Use when X."**

## Naming Conventions

| pattern | use |
|---|---|
| `<system>-engineer` | primary owner of a `docs/specs/<system>/` subtree |
| `<topic>-specialist` | narrow expertise inside a system (e.g. `rollback-specialist` inside networking) |
| `<genre>-genre` | owns one `docs/specs/genres/<g>.md` |
| `<role>-author` | writes a class of doc (`spec-author`, `adr-author`) |
| `<role>-reviewer` | reviews, never writes impl |
| `<role>-keeper` | maintains a registry / glossary / log |
| `<role>-coordinator` | aggregates a class of flag (`benchmark-coordinator`) |

## Validation Checklist

Before merging a new subagent:

- [ ] frontmatter has `name`, `description`, `tools`, `model`
- [ ] `description` names the verb, the spec path, and the trigger
- [ ] tools narrowed (no "inherit all" unless justified)
- [ ] model tier matches the table above
- [ ] body ≤ 80 lines
- [ ] body has Owns / Does not own / Non-negotiables / Workflow / Success criteria sections
- [ ] no emojis (✓/✗ allowed)
- [ ] no SPDX header (subagents are config, not docs)
- [ ] added to the routing table in `/CLAUDE.md`
- [ ] added to the routing table in `docs/guides/subagent-fleet.md` if novel category
