<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Docs Style Guide

> Every doc in `docs/` follows this. AI agents and humans both read these files. Token cost is permanent.

Upstream: `docs/initial/vision.md` · `docs/initial/spawn.md` (RULES section).
Canonical style source: [claude-code-bible ch.11 — Compressed Config](https://github.com/sebyx07/claude-code-bible/blob/main/docs/11-compressed-config.md).

---

## The rule

Lead with the rule. Fragments over sentences. Tables for structured data. No meta-framing. No trailing summaries. No filler.

This file eats its own cooking.

---

## Top ten

1. **Lead with the rule, not the reason.** `Spec required before code.` not `In Nexus, it is important that we first write a spec...`
2. **Fragments over sentences.** `Tests: cargo test. Bench: cargo bench.` not `To run tests, use cargo test...`
3. **Tables > paragraphs** for ≥3 rows of structured data.
4. **File paths > descriptions.** `→ docs/specs/core/ecs.md` beats a paragraph.
5. **Drop filler.** `just`, `really`, `basically`, `in order to`, `it is important to note`, `as mentioned`, `please note`.
6. **No meta-framing.** Skip `This section covers...`. Get to it.
7. **No rhetoric.** Drop `critical`, `the single most important`, `not optional`. Show it in the rule.
8. **No trailing summaries.** Last section is content, not recap.
9. **One rule per line** in rule lists. Grep-friendly.
10. **Why only when non-obvious.** If removing it doesn't confuse, drop it.

---

## Forbidden

| Banned | Why |
|---|---|
| Emojis (except ✓ ✗) | Token cost, render variance, locale issues |
| Meta paragraphs | `This document describes...` adds zero info |
| Trailing summaries | `In conclusion...` is recap of what's above |
| Hedges | `might`, `generally`, `in most cases` unless load-bearing |
| Throat-clearing | `Now let's look at...`, `Next we'll cover...` |
| Marketing voice | `powerful`, `seamless`, `robust`, `cutting-edge` |
| HTML in markdown | except license header comment and ASCII fences |
| Trailing exhortations | `Let's build the future!` |
| Apologies / disclaimers | `Note that this may change`, `WIP` (use frontmatter) |

---

## Mandatory

| Rule | Form |
|---|---|
| MIT header | First two lines of every `.md`. See `docs/guides/file-conventions.md`. |
| Summary block on specs | First content line: `> One sentence: what + why.` |
| ASCII diagrams for relationships | Inside ```` ``` ```` fences. No Mermaid in v1. |
| Cross-links | `→ docs/...` or inline `[text](docs/...)`. See `docs/guides/cross-linking.md`. |
| Performance numbers real or flagged | `[BENCHMARK NEEDED]`, never invented. |
| Unknowns flagged | `[DECISION NEEDED]`, `[AGENT: NN]`. |

---

## Document types (Diátaxis-aligned)

Nexus docs split into four modes. Pick one per file. Don't mix.

| Mode | Purpose | Voice | Lives in |
|---|---|---|---|
| Tutorial | Learn by doing | Lead reader step by step | `docs/game-template/weekend-mvp.md`, `docs/guides/ai-dev-onboarding.md` |
| How-to | Solve a specific problem | Imperative, terse | `docs/guides/pr-protocol.md`, `docs/guides/contribution.md` |
| Reference | Lookup, exhaustive | Tables, signatures, no narrative | `docs/specs/**`, `docs/contracts/**`, `docs/guides/glossary.md` |
| Explanation | Why a decision was made | Argument, prior art, tradeoffs | `docs/architecture/05-adr/**`, `docs/prior-art/**` |

Source: [Diátaxis framework](https://diataxis.fr).

---

## Section ordering

Specs and contracts: fixed templates. See `docs/guides/spec-format.md` and `docs/guides/contract-format.md`. Do not reorder.

Other docs: lead with the rule. Then exceptions. Then examples. No introduction section.

---

## Before / after

### Before (fluff — 88 words)

```markdown
# ECS

## Overview

The Entity Component System is one of the most important parts of the
Nexus Engine. It is responsible for managing all entities and components
in the game world. The ECS follows the data-oriented design pattern
which is becoming the dominant approach in modern game engines. Inspired
by Bevy and Flecs, it uses archetypes to store components contiguously
in memory for cache efficiency. In this document we will explore...
```

### After (signal — 28 words)

```markdown
# ECS

> Archetype-based entity/component storage with parallel system scheduling and change detection.

Inspiration: bevy ✓ archetypes · flecs ✓ relationships.
Contracts: → docs/contracts/core-renderer.md · → docs/contracts/core-physics.md.
```

Same information density. 3× less to read every session.

---

## Before / after — list

### Before

```markdown
## Performance

The ECS should be very fast. We aim for the ability to handle a large
number of entities efficiently. Specifically, we want to be able to
iterate over 1 million entities in under 1 millisecond on modern
hardware. Memory usage should also be kept low.
```

### After

```markdown
## Performance

| Metric | Target | Hard limit |
|---|---|---|
| Iterate 1M entities | < 1 ms | 2 ms |
| Per-entity memory | 64 B | 128 B |
| Spawn 10k entities | < 100 µs | 500 µs |
```

---

## Before / after — link

### Before

> For more information about the rendering system, you can read the renderer overview document which is located in the docs/specs/renderer directory.

### After

> → `docs/specs/renderer/overview.md`.

---

## ASCII diagrams

Required for any relationship of ≥3 nodes. No exceptions, no Mermaid.

Rules:
- Inside ```` ``` ```` fence.
- Arrows: `→ ← ↑ ↓ ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` (box-drawing OK, monospace assumed).
- ASCII-only fallback: `-> <- | + -`.
- Label every box.
- Label every arrow that isn't obvious.
- Max width 80 chars (96 hard).

Example:

```
 ┌──────────┐  extract   ┌──────────┐  submit  ┌──────────┐
 │  World   │ ─────────► │ Renderer │ ───────► │  Surface │
 └──────────┘            └──────────┘          └──────────┘
       ▲                        │
       │      events            │
       └────────────────────────┘
```

---

## Tables

Use when ≥3 rows of structured data. Don't use for 2 items.

Rules:
- Header row always present.
- Align with markdown pipes — pad for source readability.
- Short headers. `Code` not `Error Code`.
- Code/paths in backticks within cells.
- One concept per row.
- Sort meaningfully (alphabetical, numerical, severity).

---

## Code blocks

| Block | Use |
|---|---|
| Triple-backtick + lang | Always specify language: ` ```rust `, ` ```toml `, ` ```bash `. |
| Inline backticks | Identifiers, paths, commands, types. |
| No prose in code | Code blocks are exact. Pseudo-code allowed only with `// pseudo` comment. |

API signatures may appear in specs (5-line max). Implementation does not. → `docs/initial/spawn.md` RULES §5.

---

## Voice and tense

- Imperative for instructions. `Run cargo test.` not `You should run cargo test.`
- Present indicative for facts. `Renderer owns the GPU surface.`
- Future tense only for explicit unimplemented work. `v1.1 will ship console backends.`
- No `we`, no `our`, no `let's`. Nexus is a system, not a team rallying cry.

---

## Cross-links

| When | Syntax |
|---|---|
| Inline, prose | `[text](docs/path/to/file.md)` |
| Standalone reference | `→ docs/path/to/file.md` |
| External repo | `bevyengine/bevy#1234` or full URL |
| Not-yet-existing target | `→ docs/path/to/file.md [PENDING]` |
| Anchor | `docs/foo.md#section-name` |

Full rules: `docs/guides/cross-linking.md`.

---

## File names

kebab-case. `.md` extension. No spaces, no caps, no underscores. → `docs/guides/file-conventions.md`.

---

## Length budgets

| File type | Soft cap | Hard cap |
|---|---|---|
| Spec | 600 lines | 1000 lines |
| Contract | 400 lines | 600 lines |
| ADR | 200 lines | 400 lines |
| Guide | 400 lines | 600 lines |
| Prior-art entry | 200 lines | 400 lines |
| README / index | 200 lines | 400 lines |

Over hard cap → split. See `docs/guides/file-conventions.md` §Splitting.

---

## AI-parseability mandate

Every spec MUST have:
1. MIT header (lines 1–2).
2. `# Title` (line 4).
3. `> One sentence summary.` (line 6) — single line, ends with period. Parseable by `grep -A0 '^> '`.
4. Sections in fixed order per `docs/guides/spec-format.md`.

Every contract MUST have the structure in `docs/guides/contract-format.md` §Template.

---

## Self-check before commit

- [ ] MIT header present
- [ ] First content line after title is `> ` summary (specs only)
- [ ] No emojis except ✓ ✗
- [ ] No meta paragraphs / trailing summaries
- [ ] All filler removed (`just`, `really`, `basically`)
- [ ] Tables for ≥3 structured rows
- [ ] ASCII diagrams for ≥3-node relationships
- [ ] All cross-links resolve or marked `[PENDING]`
- [ ] Code blocks have language tag
- [ ] File ≤ length budget
- [ ] kebab-case filename
- [ ] No `we` / `our` / `let's`

---

## Compression is not cryptic

Terse ≠ unreadable. Reader gains info per second, not loses it. If a cut hurts parsing, restore it. Target: high info density, not low word count.

Breath test: read a section in one breath, know what to do. Yes → compressed enough. No → too dense; add structure (bullets, headers, one more sentence).

---

## References

| Source | Use |
|---|---|
| [claude-code-bible ch.11](https://github.com/sebyx07/claude-code-bible/blob/main/docs/11-compressed-config.md) | Canonical compressed style (founder-named). |
| [claude-code-bible ch.10](https://github.com/sebyx07/claude-code-bible/blob/main/docs/10-planning-and-docs.md) | Planning + docs discipline. |
| [claude-code-bible ch.03](https://github.com/sebyx07/claude-code-bible/blob/main/docs/03-code-quality.md) | Code-quality conventions (mirror in docs). |
| [Diátaxis](https://diataxis.fr) | Four-mode doc taxonomy. |
| [Stripe docs style](https://stripe.com/docs) | Reference-doc voice, table-heavy. |
| [Rust API guidelines / RFC 1574](https://rust-lang.github.io/api-guidelines/) | Rustdoc structure for spec API sections. |
| [Google developer documentation style guide](https://developers.google.com/style) | Imperative voice, present tense. |
| [Michael Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | ADR format. |
