<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Rust Style

Rust is the engine's first language. Every native crate (engine + game template `game/`, `server/`, native plugins) uses this exact config.

Edition: `2024`. MSRV: `1.85`. → `docs/architecture/03-tech-stack.md`

## `rustfmt.toml`

Drop at workspace root. Identical in engine and game template.

```toml
edition = "2024"
max_width = 100
hard_tabs = false
tab_spaces = 4
newline_style = "Unix"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
imports_granularity = "Crate"
group_imports = "StdExternalCrate"
format_code_in_doc_comments = true
format_macro_matchers = true
format_strings = false
normalize_comments = true
normalize_doc_attributes = true
wrap_comments = true
comment_width = 100
fn_params_layout = "Tall"
use_field_init_shorthand = true
use_try_shorthand = true
```

Rationale: follows Rust Style Guide RFC defaults where sane. Overrides: `imports_granularity = "Crate"` (smaller diffs), `group_imports = "StdExternalCrate"` (greppable order), `wrap_comments` (doc-comments stay ≤100 cols for AI parsing).

Cite: rust-lang/rustfmt config docs · rust-lang/style-team RFCs.

## `clippy.toml`

```toml
avoid-breaking-exported-api = false
disallowed-methods = [
  { path = "std::env::var", reason = "use nexus_core::config::env" },
  { path = "std::thread::sleep", reason = "use nexus_core::time::sleep" },
]
disallowed-types = [
  { path = "std::sync::Mutex", reason = "use parking_lot::Mutex" },
]
cognitive-complexity-threshold = 25
too-many-arguments-threshold = 6
type-complexity-threshold = 250
```

## Workspace `Cargo.toml` lint table

```toml
[workspace.lints.rust]
unsafe_code = "deny"                  # opt-in per crate with #[allow] + SAFETY comment
missing_docs = "warn"                 # deny on public crates (override per-crate)
unreachable_pub = "warn"
unused_lifetimes = "warn"
unused_qualifications = "warn"
rust_2018_idioms = { level = "warn", priority = -1 }
rust_2024_compatibility = { level = "warn", priority = -1 }

[workspace.lints.clippy]
all          = { level = "warn", priority = -1 }
pedantic     = { level = "warn", priority = -1 }
nursery      = { level = "warn", priority = -1 }
cargo        = { level = "warn", priority = -1 }
unwrap_used  = "deny"                 # tests override with #[allow]
expect_used  = "deny"                 # ditto
panic        = "deny"                 # ditto
todo         = "deny"
unimplemented= "deny"
dbg_macro    = "deny"
print_stdout = "deny"                 # use tracing
print_stderr = "deny"
mem_forget   = "deny"
indexing_slicing = "warn"
missing_errors_doc = "warn"
missing_panics_doc = "warn"
module_name_repetitions = "allow"     # nexus_core::core_loop is fine
must_use_candidate = "allow"          # too noisy
```

Cite: rust-lang/api-guidelines (C-FAILURE, C-DEBUG, C-COMMON-TRAITS) · rust-clippy lint index.

## Error handling

| Crate type | Crate | Pattern |
|------------|-------|---------|
| Library / engine crate | `thiserror` | Concrete `enum Error` per crate. Variants carry structured data, not strings. |
| Binary / CLI / build script | `anyhow` | `anyhow::Result` only at the outermost layer. |
| Cross-language boundary | `nexus_error::Error` | Universal error JSON. → `errors.md` |

```rust
// nexus-renderer/src/error.rs
#[derive(thiserror::Error, Debug)]
pub enum RendererError {
    #[error("shader compilation failed: {path}")]
    ShaderCompile { path: PathBuf, source: naga::WithSpan<naga::valid::ValidationError> },

    #[error("device lost (vendor={vendor_id:#x})")]
    DeviceLost { vendor_id: u32 },
}
```

Forbidden:
- `Box<dyn Error>` in lib crates (use enum)
- `String` errors (use variant)
- `unwrap()` / `expect()` outside `#[cfg(test)]` (deny lint)
- `panic!()` outside `unreachable!()` proof points
- Silent `let _ = result;` (must log or propagate)

## Panic policy

Panics = engine bug. Production builds set `panic = "abort"` (workspace `[profile.release]`). Tests use `panic = "unwind"`.

Allowed panic sites:
1. `unreachable!()` with a `// Proof:` comment
2. `assert!()` in debug-only paths (`#[cfg(debug_assertions)]`)
3. `#[cfg(test)]` blocks

Every other failure → `Result<T, RendererError>`. Period.

## Module layout

```
nexus-renderer/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # re-exports only, no logic
│   ├── error.rs               # crate error enum
│   ├── backend/
│   │   ├── mod.rs             # trait + factory
│   │   ├── vulkan.rs
│   │   ├── metal.rs
│   │   └── wgpu.rs
│   ├── graph/
│   │   ├── mod.rs
│   │   ├── node.rs
│   │   └── pass.rs
│   └── shader/
│       ├── mod.rs
│       └── hot_reload.rs
├── benches/                   # criterion
├── tests/                     # integration tests
└── README.md                  # → docs/specs/renderer/overview.md
```

Rules:
- `lib.rs` ≤ 50 lines. Re-exports + `mod` declarations only.
- Every file ≤ 500 LOC. Split into submodules.
- One public type per file when the type is non-trivial.
- `error.rs` per crate. Always.
- `tests/` for integration. `src/` for unit (`#[cfg(test)] mod tests`).

## Naming (Rust-specific)

| Item | Convention | Example |
|------|-----------|---------|
| Crate | `kebab-case` | `nexus-renderer` |
| Module | `snake_case` | `render_graph` |
| Type / trait | `PascalCase` | `RenderGraph`, `Renderable` |
| Function / method | `snake_case` | `submit_frame` |
| Constant / static | `SCREAMING_SNAKE_CASE` | `MAX_DRAW_CALLS` |
| Lifetime | short lowercase | `'a`, `'frame` |
| Type param | `PascalCase` single | `T`, `Vertex` |
| Builder method | `with_*` / `set_*` | `.with_backend(b)` |
| Conversion | `from_*` / `into_*` / `as_*` | `Mat4::from_quat(q)` |
| Boolean | `is_*` / `has_*` / `can_*` | `is_visible` |

→ `naming.md` (cross-language)

Cite: rust-lang/api-guidelines C-CASE, C-CONV.

## Doc comments

Every public item: `///` with at least one sentence + `# Examples` block if non-trivial.

```rust
/// Submits a frame to the render graph executor.
///
/// Blocks until the GPU acknowledges submission. Returns once the
/// frame is queued — not when rendering completes.
///
/// # Errors
///
/// Returns [`RendererError::DeviceLost`] if the GPU was reset since
/// the previous frame.
///
/// # Examples
///
/// ```
/// # use nexus_renderer::*;
/// let frame = renderer.begin_frame()?;
/// renderer.submit(frame)?;
/// # Ok::<(), RendererError>(())
/// ```
pub fn submit(&mut self, frame: Frame) -> Result<(), RendererError> { ... }
```

Mandatory sections (where applicable):
- `# Errors` — every `Result`-returning public fn
- `# Panics` — every fn that can panic (rare; usually `unreachable!`)
- `# Safety` — every `unsafe fn`
- `# Examples` — every public fn unless trivial

Crate-level: `//!` in `lib.rs` cross-links the spec. Mandatory.

```rust
//! Render graph and GPU command submission.
//!
//! Spec: <https://github.com/nexus-engine/nexus-engine/blob/main/docs/specs/renderer/overview.md>
```

Cite: rust-lang/api-guidelines C-CRATE-DOC, C-EXAMPLE, C-FAILURE, C-LINK.

## `#[deny(missing_docs)]` policy

| Crate kind | Policy |
|------------|--------|
| `nexus-*` public crates | `#![deny(missing_docs)]` in `lib.rs` |
| Genre / style modules | `#![deny(missing_docs)]` |
| Internal `*-internal` crates | `#![warn(missing_docs)]` |
| Benchmarks / examples | none |
| Tests | none |

## `unsafe` policy

`unsafe_code = "deny"` workspace-wide. Per-block opt-in:

```rust
#![cfg_attr(feature = "ffi", allow(unsafe_code))]

// SAFETY: pointer originates from CPAL callback, valid for `frames * channels`
// f32s, exclusive for the duration of the closure (CPAL contract).
unsafe { std::slice::from_raw_parts_mut(ptr, len) }
```

Rules:
- One `SAFETY:` comment per `unsafe` block. Mandatory.
- `SAFETY:` block names the invariant being upheld.
- No `unsafe fn` without `# Safety` doc section.
- `cargo-geiger` runs in CI. Per-crate unsafe count tracked.

## File header

Every `.rs` file (including generated, including tests):

```rust
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
```

Pre-commit hook adds it. CI rejects missing.

## Forbidden patterns

| Pattern | Why | Use instead |
|---------|-----|-------------|
| `println!` / `eprintln!` | Unstructured | `tracing::info!` → `logging.md` |
| `dbg!` | Debug noise | `tracing::debug!` |
| `.unwrap()` outside tests | Hidden panic | `?` or `expect_or_log` |
| `Box<dyn Error>` in libs | Erased type | `thiserror` enum |
| `Rc<RefCell<T>>` in hot path | Runtime cost | `&mut T` or job system |
| `std::sync::Mutex` | Slow on contention | `parking_lot::Mutex` |
| `lazy_static!` | Old idiom | `std::sync::LazyLock` |
| `Vec<Box<dyn Trait>>` in ECS | Allocation per | typed component arrays |

## Async

| Use case | Runtime |
|----------|---------|
| Engine frame loop | sync, job system → `docs/specs/core/jobs.md` |
| Asset I/O | `tokio` (single-threaded, current-thread runtime) |
| Networking | `tokio` (multi-threaded) → `docs/specs/networking/transport.md` |
| Editor tools | `tokio` |

Never spawn `tokio` from inside the frame loop. Cross-boundary uses `flume` channels.

## Cross-link

- → `comments.md` (doc-comment grammar)
- → `errors.md` (universal error JSON)
- → `logging.md` (`tracing` macros)
- → `formatting-tools.md` (rustfmt / clippy versions)
- → `naming.md` (cross-language naming)
- → `dependencies.md` (vetted Rust crates)
- → `docs/guides/testing/unit.md` (`cargo test`)
