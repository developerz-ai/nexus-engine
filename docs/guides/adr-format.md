<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR Format

> Architecture Decision Records. Michael Nygard format. One file per major decision under `docs/architecture/05-adr/`.

Reference: [Michael Nygard — *Documenting Architecture Decisions*](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (2011).
Companions: `docs/guides/style-guide.md` · `docs/guides/file-conventions.md`.

---

## What an ADR is

A short document capturing one architectural decision, the context that forced it, and the consequences of choosing it.

| Is | Is not |
|---|---|
| Immutable once accepted | A spec |
| One decision per file | A debate log |
| Records context, decision, consequences | Implementation guide |
| Supersedable, never edited in place | Editable history |

---

## When you need an ADR

| Trigger | ADR required |
|---|---|
| Picking a language, framework, or major dependency | yes |
| Choosing between architectural patterns (ECS vs OOP, monolith vs plugin) | yes |
| Changing a public contract semver MAJOR | yes |
| Choosing a license, governance model | yes |
| Picking one of several mature options (rapier vs custom physics) | yes |
| Bug fix | no |
| Internal refactor with no API change | no |
| Adding a new spec | no (spec itself records) |

---

## Numbering

| Rule | Value |
|---|---|
| Format | `NNNN-kebab-title.md` |
| Digits | 4, zero-padded (`0001`, `0042`) |
| Monotonic | next free number, never reused |
| Title in filename | kebab-case, ≤ 60 chars |
| Title omits `adr-` prefix | filename starts with the number |

Examples:

```
docs/architecture/05-adr/0001-why-rust.md
docs/architecture/05-adr/0002-why-wgpu.md
docs/architecture/05-adr/0003-why-ecs-archetype.md
docs/architecture/05-adr/0004-why-mit-forever.md
docs/architecture/05-adr/0005-why-rollback-netcode.md
```

To reserve a number: open the PR. First merged wins. Subsequent open PRs renumber.

---

## Status lifecycle

```
 Proposed ──► Accepted ──► Deprecated
                  │             ▲
                  └─► Superseded by ADR-NNNN
```

| Status | Meaning | Editable? |
|---|---|---|
| Proposed | Under discussion | yes |
| Accepted | In force | Status line only |
| Deprecated | No longer apply, no replacement | Status line only |
| Superseded by ADR-NNNN | Replaced by a newer decision | Status line only |

Never edit Context / Decision / Consequences after Accepted. Write a new ADR that supersedes.

---

## Template

```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR-NNNN: <Decision in active voice>

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Deprecated / Superseded by ADR-NNNN |
| Date | YYYY-MM-DD |
| Deciders | <role(s) — e.g. Architecture Council, AI Agent 01> |
| Supersedes | ADR-NNNN (if any) |
| Superseded by | ADR-NNNN (if any) |

## Context

<What forces the decision. Constraints, prior state, problem. Cite specs, vision, principles. Imperative present tense.>

## Decision

<What we will do. One paragraph. Active voice. No hedging.>

## Consequences

### Positive
- <effect>
- <effect>

### Negative
- <effect>
- <effect>

### Neutral / Notes
- <effect>

## Alternatives Considered

| Option | Why rejected |
|---|---|
| <A> | ... |
| <B> | ... |

## References

- → `docs/initial/vision.md` §<section>
- → `docs/architecture/01-principles.md` §<principle>
- <external links, papers, blog posts>
```

---

## Section-by-section guidance

### Title

`# ADR-NNNN: <decision>` — active voice, present tense.

| Good | Bad |
|---|---|
| `# ADR-0001: Use Rust for the engine` | `# ADR-0001: Rust` |
| `# ADR-0002: Adopt wgpu as render backend` | `# ADR-0002: Choosing a renderer` |
| `# ADR-0003: ECS over OOP scene graph` | `# ADR-0003: Architecture` |

### Status table

Five fields, even when empty. Use `—` for empty.

```markdown
| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-05-17 |
| Deciders | Architecture Council |
| Supersedes | — |
| Superseded by | — |
```

### `## Context`

Why this decision is being made NOW. What problem, what constraints.

| Include | Exclude |
|---|---|
| Forces (technical, business, legal) | Implementation details |
| Prior state | Step-by-step plan |
| Cited principles from `01-principles.md` | Marketing rationale |
| Non-negotiable constraints (MIT, AI-first) | Aspirational goals |

Length: 100–300 words. If longer, the decision is too broad — split.

### `## Decision`

ONE paragraph. What we will do. Active voice.

| Good | Bad |
|---|---|
| `Nexus uses Rust for all engine and tooling code.` | `We could consider Rust as a possible option.` |
| `The render backend is wgpu.` | `wgpu seems like it might be a good fit.` |

### `## Consequences`

Three subsections: Positive, Negative, Neutral. Every decision has all three. If you can't list Negatives, you haven't thought hard enough.

Nygard's discipline: future readers need to know what you paid, not just what you gained.

### `## Alternatives Considered`

Table. Every credible option that was on the table. Why it lost.

| Required | Optional |
|---|---|
| One row per real candidate | Detailed sub-rationale (link out) |
| `Why rejected` is one line | Long pros/cons lists |

If only one option was considered, the ADR is suspect — at minimum list "Do nothing / status quo".

### `## References`

| Source | Form |
|---|---|
| Internal | `→ docs/...` |
| External | `[Title](URL)` |
| Repo | `owner/name#issue` or `owner/name@sha` |
| Paper | Author, year, title. |

---

## Example

```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR-0001: Use Rust for the engine

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-05-17 |
| Deciders | Architecture Council |
| Supersedes | — |
| Superseded by | — |

## Context

Vision (→ docs/initial/vision.md) demands a memory-safe, performant, cross-platform engine with deterministic replay and headless operation. Principles (→ docs/architecture/01-principles.md [PENDING]) require zero unsafe without justification and AI-parseable APIs. Engine targets Linux/Win/macOS/Android/iOS/Web/Console. AI agents must read and modify the codebase with low error rate.

## Decision

Nexus uses Rust for all engine, tooling, and SDK code. Game logic may additionally use Lua or Rune via the scripting layer.

## Consequences

### Positive
- Memory safety eliminates a class of bugs that plague C++ engines.
- Strong type system + cargo gives AI agents reliable compile feedback.
- Cross-platform via single toolchain (rustup + cargo).
- Mature ecosystem for the chosen subsystems (wgpu, rapier, winit).

### Negative
- Smaller talent pool than C++ for human contributors.
- Some game-industry tooling (e.g. FBX SDK) is C++-only; needs FFI shims.
- Compile times higher than C; mitigated by incremental + workspace splitting.

### Neutral / Notes
- Game scripting NOT in Rust; see ADR-NNNN on scripting language [PENDING].

## Alternatives Considered

| Option | Why rejected |
|---|---|
| C++ | Memory unsafety hurts AI agents (segfault rate); inconsistent toolchains across OS |
| Zig | Too immature for v1 ship target |
| C# | GC pauses incompatible with deterministic replay + frame budgets |
| Go | GC + lack of zero-cost abstractions; weaker FFI |

## References

- → docs/initial/vision.md §The AI-First Mandate
- → docs/architecture/01-principles.md §AI-first §Always compiles [PENDING]
- [Rust Programming Language Book](https://doc.rust-lang.org/book/)
- bevyengine/bevy — proves Rust viability for a modern game engine
```

---

## Numbering ADR-0000

Reserved for `docs/architecture/05-adr/0000-template.md` — copy this template; never accepted as a real decision.

---

## Modifying an accepted ADR

| Action | Allowed |
|---|---|
| Fix typo in Context/Decision/Consequences | ✗ |
| Update Status line | ✓ |
| Add `Superseded by` field | ✓ |
| Add `References` entry | ✓ if non-substantive (e.g. new paper) |
| Append to Consequences | ✗ — write supersession |
| Change Decision text | ✗ — write supersession |

ADRs are an audit trail. If the decision changed, the readers must see WHY and WHEN by reading the chain.

---

## Lint rules

| Rule | Failure |
|---|---|
| MIT header | hard fail |
| Filename `NNNN-kebab.md` under `docs/architecture/05-adr/` | hard fail |
| Title `# ADR-NNNN: <text>` | hard fail |
| Status table present with all 5 fields | hard fail |
| All four sections: Context / Decision / Consequences / Alternatives Considered | hard fail |
| Consequences has all three subsections | warn |
| ≤ 400 lines | warn at 200, fail at 400 |

Script: `scripts/lint-adrs.sh` [PENDING].

---

## References

- [Michael Nygard — Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — the canonical format
- [adr-tools (Nat Pryce)](https://github.com/npryce/adr-tools) — CLI for ADR management
- [Joel Parker Henderson — ADR examples](https://github.com/joelparkerhenderson/architecture-decision-record) — public collection
