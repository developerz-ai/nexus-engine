<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Comment Policy

Write **WHY**, never **WHAT**.

The code says what. Only humans (and AI maintainers) need the why: business constraint, performance tradeoff, source citation, edge case, non-obvious math, capability boundary.

## The one-line rule

If the comment restates the code, delete it.

```rust
// BAD — restates the code
// increment frame counter
self.frame += 1;

// BAD — adds nothing
/// Returns the user's name.
pub fn name(&self) -> &str { &self.name }

// GOOD — captures WHY
// MSAA target is freed here instead of on the next frame: the resolve pass
// already wrote out to swapchain; holding it costs 32 MiB until next vblank.
drop(self.msaa_target);
```

## Doc comments — mandatory on public items

Every `pub` item in every language has a doc comment.

| Language | Marker | Enforced by |
|----------|--------|-------------|
| Rust | `///` (item), `//!` (module) | `#![deny(missing_docs)]` |
| TypeScript | `/** ... */` (TSDoc) | review, no lint |
| Python | `"""..."""` (Google style) | `ruff D` rules |
| Lua | `--- @field`, `--- @param` (LuaCATS) | review |
| WGSL | `//` block above item | review |
| SQL | `COMMENT ON ...` for tables, columns, fns | review |

→ `rust.md`, `typescript.md`, `python.md`, etc. for per-language grammar.

## What a public doc-comment must contain

1. **One-line summary.** Verb-first, present tense. ≤100 chars.
2. **Why this exists** (if non-obvious from the name).
3. **Errors / exceptions / failure modes.**
4. **Performance characteristics** if non-trivial (`O(n)`, allocates, syscalls).
5. **Example** if the call shape is non-obvious.
6. **Spec link** for items implementing a spec: `→ docs/specs/<system>.md`.

Example (Rust):

```rust
/// Submits a frame to the GPU.
///
/// Queues the frame for the next vsync. Returns when queued, not when
/// rendering completes. Allocates at most one command buffer per call.
///
/// # Errors
///
/// Returns [`RendererError::DeviceLost`] if the GPU was reset since the
/// last call.
///
/// # Examples
///
/// ```
/// # use nexus_renderer::*;
/// let frame = renderer.begin_frame()?;
/// renderer.submit(frame)?;
/// # Ok::<(), RendererError>(())
/// ```
///
/// → `docs/specs/renderer/overview.md`
pub fn submit(&mut self, frame: Frame) -> Result<(), RendererError> { ... }
```

## What a non-public comment must contain

Only one of:

- **WHY a non-obvious choice was made.** Tradeoff, benchmark, history.
- **Source citation** (paper, RFC, vendor doc, GH issue): `// Reference: <url>`
- **Capability boundary**: `// SAFETY: ...`, `// SECURITY: ...`, `// SANDBOX: ...`
- **Math derivation** when the code is the result of an equation.
- **`TODO`/`FIXME`/`HACK`** with an owner tag and tracking link.

## TODO / FIXME / HACK

```rust
// TODO(@nexus-bot): replace with virtual shadow maps once VSM lands. #1234
// FIXME(@nexus-bot): allocation in hot path. #5678
// HACK(@nexus-bot): driver bug workaround for AMD < 24.4.1. Revisit Q3 2026. #9012
```

Rules:
- Must include `(@owner)` — `@nexus-bot` for AI-merge tracked, `@human-team` for escalation.
- Must include issue link or `#<number>`.
- Audit job exports all TODOs/FIXMEs as structured JSON to nexus-merge.
- `XXX` is forbidden — use `FIXME`.

## Forbidden comment patterns

| Pattern | Why banned |
|---------|-----------|
| Restating the code | Token waste, drifts from truth |
| Commented-out code | Use git history |
| `// changed by X on Y` | Use git blame |
| `// MIT licensed - see LICENSE` (per-fn) | File header carries it once |
| AI-generated waffle ("This function performs the operation of...") | Adds nothing |
| Apologetic ("This is ugly but...") without a fix-link | Useless |
| Future tense unsupported ("Will eventually...") without a TODO | Phantom promise |
| Emojis in comments | Grep noise |
| ASCII banners (`// ============`) | Visual noise; use headings + tooling |

## Section delimiters

Use a `// ---- name ----` single line. No box-drawing.

```rust
// ---- PBR: GGX specular ----
fn brdf_ggx(...) { ... }

// ---- PBR: lambert diffuse ----
fn brdf_lambert(...) { ... }
```

In Markdown documentation: use headings (`##`, `###`). Never ASCII art.

## Comment density

| Code kind | Density target |
|-----------|----------------|
| Public API | ≥1 doc-block per public item (mandatory) |
| Internal logic | 1 WHY-comment per non-obvious decision |
| Math / shader code | 1 reference link per algorithm |
| `unsafe` / `unsafe_op` | 1 `SAFETY:` per block (mandatory) |
| Tests | Test name = its description. Comments only for setup quirks. |

Over-commented code: review rejects. Under-commented public API: lint rejects.

## AI-generated comments

When AI agents add comments, they must:

1. State a WHY humans cannot infer from the code.
2. Cite the source (paper, doc, ticket) for any algorithm.
3. Never apologise, summarize, or hedge.
4. Never use first person.

nexus-merge's prose audit flags AI-tell phrases:
- "as an AI"
- "I have implemented"
- "the code above"
- "this function basically"
- "simply", "just"
- "comprehensive", "robust", "leveraged"

CI emits a structured warning per occurrence. → `docs/guides/merge-system.md`

## Cross-link

- → `rust.md`, `typescript.md`, `python.md`, `lua.md`, `wgsl.md`, `sql.md`, `toml-json.md`
- → `docs/guides/style-guide.md` (Agent 19, prose style)
- → `docs/guides/merge-system.md` (Agent 16, AI-tell audit)
