<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# File Conventions

> Naming, headers, layout, and link rules for every file under `docs/`.

Companion: `docs/guides/style-guide.md` (prose) · `docs/guides/cross-linking.md` (links).

---

## License header

First two lines of EVERY `.md` file. No blank line before.

```
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->
```

Then one blank line, then `# Title`.

| Rule | Why |
|---|---|
| HTML comment, not visible text | Renders nowhere; tooling parses |
| SPDX line first | Standard scanner format ([SPDX](https://spdx.dev)) |
| `Nexus Engine contributors` | Never a single author; matches MIT mandate |
| Year fixed at 2026 | Project start; do not increment per file |
| Exact text | Lint will fail on drift |

CI lint: `scripts/lint-headers.sh` (→ `docs/guides/pr-protocol.md` [PENDING]).

---

## Filenames

| Rule | Form | Example |
|---|---|---|
| Lowercase | required | `ecs.md` |
| kebab-case for multi-word | required | `core-renderer.md` |
| `.md` extension | required | `glossary.md` |
| No spaces | forbidden | ✗ `Core Renderer.md` |
| No underscores | forbidden | ✗ `core_renderer.md` |
| No caps | forbidden (exceptions below) | ✗ `ECS.md` → `ecs.md` |
| ADR prefix | `NNNN-kebab.md` | `0001-why-rust.md` |
| Architecture prefix | `NN-kebab.md` | `02-system-map.md` |
| Index files | `README.md`, `INDEX.md` | UPPERCASE allowed for these two only |

---

## Directory names

| Rule | Form |
|---|---|
| Lowercase | required |
| kebab-case for multi-word | `game-template/`, `prior-art/` |
| Singular when collection of one type | `architecture/` (decisions about THE arch) |
| Plural when collection of peers | `specs/`, `contracts/`, `games/`, `guides/` |
| No nesting > 4 deep under `docs/` | hard cap |

---

## File layout (specs)

Fixed order. Enforce per `docs/guides/spec-format.md`.

```
<license header>

# Title

> One-sentence summary.

## Boundaries
## Architecture
## Public API
## Performance Contract
## Error Contract
## Integration Points
## Test Requirements
## Prior Art
## Open Questions
```

---

## File layout (contracts)

Fixed order. Enforce per `docs/guides/contract-format.md`.

```
<license header>

# Contract: A ⇄ B

> One-sentence summary.

Related specs: ...

## Parties
## Call flow
## Provided API
## Required API
## Data Schema
## Ordering & Lifetime Guarantees
## Threading & Concurrency Rules
## Performance Contract
## Error Contract
## Versioning Rule
## Test Matrix
## Open Questions
```

---

## File layout (ADRs)

Nygard format. See `docs/guides/adr-format.md`.

```
<license header>

# ADR-NNNN: Title

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Deprecated / Superseded by ADR-XXXX |
| Date | YYYY-MM-DD |
| Deciders | [role(s)] |

## Context
## Decision
## Consequences
## Alternatives Considered
## References
```

---

## Frontmatter

Nexus does NOT use YAML frontmatter in `docs/`. All metadata is either:

| Metadata type | Where it lives |
|---|---|
| Title | `# Heading` on line 4 |
| Summary | `> ` block on line 6 |
| Status (specs) | First row of a `## Status` table when needed |
| Status (ADRs) | First row of header table (Status field) |
| License | HTML comment lines 1–2 |
| Last-updated | git history, not in-file |
| Authors | git history, not in-file |

Rationale: frontmatter doubles parse cost (YAML + Markdown), adds tooling dependency, drifts from git truth.

---

## ASCII diagrams

| Rule | Form |
|---|---|
| Fence | Triple backticks, no language tag (or ` ```text `) |
| Charset | Box-drawing (`┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼ ► ◄ ▲ ▼`) preferred; ASCII fallback OK |
| Width | ≤ 80 chars (96 hard cap) |
| Labels | Every box; every non-obvious arrow |
| Direction | Top-to-bottom or left-to-right, never diagonal |
| No Mermaid | v1 — no GitHub-only render assumptions |

Bad:

```
Core->Renderer->GPU
```

Good:

```
 ┌──────┐  extract  ┌──────────┐  submit  ┌─────┐
 │ Core │ ────────► │ Renderer │ ───────► │ GPU │
 └──────┘           └──────────┘          └─────┘
```

---

## Tables

| Rule | Form |
|---|---|
| Header row | always present |
| Alignment | left by default; numeric right via `---:` |
| Padding for source readability | yes — pad cells for readable diff |
| Short headers | `Code` not `Error Code Identifier` |
| Backticks for code/path in cells | yes |
| Threshold for use | ≥ 3 rows of structured data |

---

## Cross-linking

Summary — full spec in `docs/guides/cross-linking.md`.

| When | Syntax |
|---|---|
| Inside a sentence | `[ECS](docs/specs/core/ecs.md)` |
| Standalone "see" line | `→ docs/specs/core/ecs.md` |
| Anchor | `docs/foo.md#section-name` |
| Not-yet-existing | append `[PENDING]` |
| External repo | `bevyengine/bevy#1234` or full URL |
| Specific file in external repo | `bevyengine/bevy:crates/bevy_ecs/src/lib.rs` |

All link paths are repo-root-relative. Never `../`.

---

## Length budgets

| File type | Soft | Hard |
|---|---|---|
| Spec | 600 | 1000 |
| Contract | 400 | 600 |
| ADR | 200 | 400 |
| Guide | 400 | 600 |
| Prior-art | 200 | 400 |
| Index / README | 200 | 400 |

Lines counted by `wc -l` including blanks.

---

## Splitting

When you exceed the hard cap:

1. Identify natural seams (sections that don't reference each other).
2. New file under same dir: `<area>/<topic>.md`.
3. Original file links to children: `→ docs/specs/renderer/shaders/wgsl.md`.
4. Update `docs/INDEX.md`.

Example:

```
Before: docs/specs/renderer/shaders.md  (1200 lines)

After:  docs/specs/renderer/shaders.md           (overview, 200 lines)
        docs/specs/renderer/shaders/wgsl.md      (400 lines)
        docs/specs/renderer/shaders/hotreload.md (350 lines)
        docs/specs/renderer/shaders/permute.md   (300 lines)
```

---

## Encoding

| Rule | Value |
|---|---|
| Charset | UTF-8 |
| BOM | none |
| Line endings | LF (`\n`) — `.gitattributes` enforces |
| Trailing whitespace | none |
| Final newline | required |
| Tabs vs spaces in code blocks | match source language convention |
| Indent in YAML/TOML examples | 2 spaces |

---

## Self-check (file conventions only)

- [ ] License header present, exact text
- [ ] kebab-case filename, `.md` extension
- [ ] Title on line 4, summary on line 6 (specs/contracts)
- [ ] No YAML frontmatter
- [ ] LF line endings, final newline
- [ ] No trailing whitespace
- [ ] All links repo-root-relative
- [ ] Diagrams ≤ 80 col
- [ ] File ≤ hard cap
