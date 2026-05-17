<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Cross-Linking

> How to reference other files, anchors, external repos, and not-yet-existing targets across the Nexus docs tree.

Companions: `docs/guides/style-guide.md` · `docs/guides/file-conventions.md`.

---

## The rule

| Context | Syntax | Example |
|---|---|---|
| Inside a sentence | `[text](path)` | `The [ECS](docs/specs/core/ecs.md) owns entities.` |
| Standalone "see" line | `→ path` | `→ docs/specs/core/ecs.md` |
| Multiple in one line | `→ a · → b · → c` | `→ docs/specs/core/ecs.md · → docs/specs/core/jobs.md` |
| Anchor | `path#section-name` | `docs/foo.md#performance-contract` |
| External repo (issue/PR) | `owner/name#NNN` | `bevyengine/bevy#1234` |
| External repo (commit) | `owner/name@sha` | `bevyengine/bevy@a1b2c3d` |
| External repo (file) | `owner/name:path/to/file` | `bevyengine/bevy:crates/bevy_ecs/src/lib.rs` |
| External URL | `[text](https://...)` | `[wgpu](https://wgpu.rs)` |
| Not-yet-existing | append ` [PENDING]` | `→ docs/specs/core/events.md [PENDING]` |
| Cross-agent flag | `[AGENT: NN]` | `[AGENT: 03] confirm renderer extract stage` |

---

## Path conventions

All paths are **repo-root-relative**. Never use `../`.

| Wrong | Right |
|---|---|
| `./ecs.md` | `docs/specs/core/ecs.md` |
| `../../contracts/core-renderer.md` | `docs/contracts/core-renderer.md` |
| `/docs/foo.md` (leading slash) | `docs/foo.md` |
| `~/workspace/...` | repo-root-relative path |

Why: docs are read by AI agents from any cwd; relative paths break grep + tooling.

---

## Inline vs standalone

### Inline `[text](path)`

Use when the link is part of a sentence and reading flow matters.

```markdown
Extract runs in exclusive World access; see the [Core ⇄ Renderer contract](docs/contracts/core-renderer.md) for ordering guarantees.
```

### Standalone `→ path`

Use when listing references at the top, bottom, or as bullet items.

```markdown
Related specs:
- → docs/specs/core/ecs.md
- → docs/specs/core/events.md
- → docs/contracts/core-renderer.md
```

Rule of thumb: prose → inline. Lists → standalone arrow.

---

## Anchors

GitHub auto-anchors every heading. Form:

| Heading | Anchor |
|---|---|
| `## Performance Contract` | `#performance-contract` |
| `## Public API` | `#public-api` |
| `### Why it matters` | `#why-it-matters` |
| `## A & B` | `#a--b` (double dash from `&`) |

Rules:
- Lowercase.
- Spaces → `-`.
- Punctuation stripped (except dashes).
- Use exact GitHub algorithm — test by clicking in GitHub preview.

Example:

```markdown
See [extract semantics](docs/contracts/core-renderer.md#call-flow).
```

---

## Cross-agent flags

When an agent writes a spec that depends on another agent's output, mark it.

```markdown
[AGENT: 03] Confirm renderer extract stage tolerates exclusive World lock.
[AGENT: 09] Asset handle stability across frames — confirm ref-count semantics.
```

| Marker | Meaning | Resolved by |
|---|---|---|
| `[AGENT: NN]` | Cross-agent dependency | Named agent must confirm/reject |
| `[DECISION NEEDED]` | Architect input | ADR or architecture council |
| `[BENCHMARK NEEDED]` | Number is a guess | Performance team measures |
| `[PENDING]` | Referenced file does not yet exist | Author once the file lands |

These markers are grep-able: `grep -rn '\[AGENT:' docs/`.

---

## External repo references

Compact form preferred. Reserve full URLs for non-GitHub or when context demands it.

| Form | Use |
|---|---|
| `owner/name` | repo, no issue/PR/file |
| `owner/name#NNN` | issue OR PR (GitHub merges the namespace) |
| `owner/name@sha` | specific commit |
| `owner/name@vX.Y.Z` | specific tag/release |
| `owner/name:path/to/file` | specific file at HEAD |
| `owner/name@sha:path/to/file` | specific file at commit (most stable) |

Examples:

```markdown
Inspired by: bevyengine/bevy#1234 · SanderMertens/flecs · skypjack/entt
Pattern: bevyengine/bevy:crates/bevy_render/src/extract_resource.rs
Algorithm: erincatto/box2d@v3.0.0:src/dynamics/b2_island.cpp
```

---

## External URLs

Use full Markdown link when the source is non-GitHub or the title carries information.

| When | Example |
|---|---|
| Spec / RFC | `[WebGPU spec](https://www.w3.org/TR/webgpu/)` |
| Paper / blog post | `[Lumen — Dynamic GI in UE5](https://...)` |
| Tool docs | `[wgpu Queue docs](https://docs.rs/wgpu/latest/wgpu/struct.Queue.html)` |
| Vendor docs | `[Apple Metal Best Practices](https://...)` |

Avoid bare URLs in prose. Always wrap.

---

## Not-yet-existing targets

When you must reference a file that another agent will write:

```markdown
→ docs/specs/core/events.md [PENDING]
```

Rules:
- Always link the eventual path, not a placeholder.
- Always append ` [PENDING]` (one space before bracket).
- Remove the marker in the PR that lands the target file.
- CI lint: `[PENDING]` count is reported on every doc PR. Trending down is healthy.

---

## Linking to ADRs

| Form | When |
|---|---|
| `ADR-NNNN` | Inline, casual reference |
| `→ docs/architecture/05-adr/NNNN-kebab.md` | Standalone, exact link |
| `[ADR-0001: Use Rust](docs/architecture/05-adr/0001-why-rust.md)` | Inline with title |

Always preferable to over-link ADRs — readers should reach the decision context in one click.

---

## Linking to specs and contracts

| Target | Preferred form |
|---|---|
| Whole spec | `→ docs/specs/<area>/<topic>.md` |
| Section of spec | `docs/specs/<area>/<topic>.md#<anchor>` |
| Contract | `→ docs/contracts/<a>-<b>.md` |
| Specific API in spec | `docs/specs/<area>/<topic>.md#public-api` |
| Specific ordering guarantee | `docs/contracts/<a>-<b>.md#ordering--lifetime-guarantees` |

---

## Linking inside the same file

GitHub-flavored anchors work for same-file references:

```markdown
See [§Performance Contract](#performance-contract) above.
```

Use sparingly. If a section needs to be referenced from inside the same file more than twice, the file should probably split.

---

## Do not

| Don't | Why |
|---|---|
| Use relative paths (`./`, `../`) | Breaks from non-doc cwd |
| Use bare URLs in prose | No title, no context, harder to scan |
| Link inside a heading | Anchor confusion, render variance |
| Footnote-style numeric refs (`[1]`, `[2]`) | Doubles file lookups, breaks grep |
| Wrap every mention in a link | Link fatigue; first occurrence per section is enough |
| Use HTML `<a href>` tags | Markdown links only |

---

## Self-check

- [ ] All paths repo-root-relative
- [ ] Inline links inside sentences; arrow form in lists
- [ ] Anchors match GitHub's auto-form
- [ ] `[PENDING]` on every link to a file that does not yet exist
- [ ] `[AGENT: NN]` on every cross-agent dependency
- [ ] No bare URLs, no relative paths, no footnote refs
