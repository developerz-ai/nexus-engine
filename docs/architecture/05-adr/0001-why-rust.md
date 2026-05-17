<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0001 — Rust as the Primary Implementation Language

## Status

`Accepted`

Date: 2026-01-15 (initial)
Authors: nexus-architecture-agent-01
Reviewers: integration team

## Context

Nexus targets 100M LOC at maturity, primarily written by AI agents, shipped across Linux, Windows, macOS, Android, iOS, Web, and consoles, with hard real-time performance budgets (Law 5) and a zero-tolerance stance on memory unsafety (Law 6). The implementation language is the most foundational technical decision: it propagates into every spec, every crate, every CI pipeline, and every contributor's onboarding experience.

Forces:
- Vision §"The Nexus Thesis": code is now free, but architecture is not. The language must let AI generate correct code under strict structural enforcement.
- Law 6: zero `unsafe` without justification. The language must give safety by default.
- Law 4: always compiles, always green across every platform from one source tree.
- Law 5: hard performance budgets. Soft real-time at 60 FPS minimum, hard real-time at 144 FPS in competitive genres.
- Law 1: machine-readable errors. The compiler's output must be a first-class API for AI agents.
- Law 7: every dependency MIT-compatible.
- Web is a first-class target. WASM compile must be a `--target` flag, not a port.
- The language must be teachable to LLMs from public training data circa 2026.

## Decision

**Rust** is the primary implementation language for `nexus-engine` and all crates in its workspace. Stable channel only. Latest stable edition.

- All engine, system, genre, and style crates: Rust.
- Scripting layer (game logic, mods): Lua 5.4 via `mlua`, Rune via `rune`. → `docs/architecture/05-adr/` will get a future ADR on scripting if/when challenged.
- Tooling (CLI scaffolds, codegen, scenario runner): Rust.
- Editor: Rust + WGSL.
- AI agent SDK: Rust core, Python bindings via `pyo3`.
- Bindings to non-Rust libraries (vendor console SDKs, e.g.) live behind `#[cfg(target_os = "…")]` modules and are subject to Law 6.

## Consequences

### Positive

- **Memory safety by default.** No UAF, no double-free, no data race in safe code. Removes the dominant class of game-engine bugs (see id Tech, Source, Unity engine bug trackers historically).
- **One toolchain, every target.** `rustup target add aarch64-linux-android` is the entire port. No second build system. → `docs/architecture/03-tech-stack.md`.
- **Structured compiler diagnostics.** `cargo build --message-format=json` emits parseable JSON errors with location, code, level. Satisfies Law 1 with zero glue. AI agents iterate without a parser.
- **Cargo workspace** maps 1:1 to Nexus's modular architecture; per-crate boundaries align with Law 3 (sacred module boundaries).
- **`forbid(unsafe_code)` at the lint level** turns Law 6 into a compiler error.
- **Generics + traits** model ECS contracts (`Component`, `System`, `Query`) without inheritance hierarchies.
- **Ecosystem maturity for game tech.** `wgpu`, `rapier`, `cpal`, `winit`, `bevy_ecs` (study target) all exist and are MIT/Apache-2.0. Same constellation as Bevy proves the stack is gamedev-ready.
- **WASM-first.** `wasm-bindgen`, `wasm32-unknown-unknown`, `wasm32-wasi` are first-class. Web port is a flag.
- **LLM proficiency in Rust is strong as of 2026** and improving. Idiomatic Rust output is high quality from frontier models.
- **No GC pauses.** Real-time scheduling is predictable.

### Negative / costs

- **Compile times** are slower than Go or interpreted languages. Mitigations: `cargo nextest`, `mold` linker (Linux dev loop), `sccache` (CI), split-debuginfo, many small crates for incremental compilation. Cold full-workspace compile target: < 5 min on a 16-core box [BENCHMARK NEEDED].
- **Talent pool smaller than C++** historically. Nexus is built by AI agents primarily; this matters less than for human-team-led engines.
- **Steeper learning curve** for human contributors not already in Rust. Onboarding doc (`docs/guides/ai-dev-onboarding.md`) addresses this.
- **Async story split** (sync game loop vs async I/O). We address by banning async in gameplay code (Law 9 deterministic replay) and confining it to `nexus-net`, `nexus-assets`, `nexus-agent` only. → `docs/architecture/03-tech-stack.md` §"Async runtime".
- **Some vendor SDKs (consoles) are C/C++.** FFI bindings live in feature-gated, isolated crates with documented `unsafe` boundaries.

### Neutral

- Cargo lockfile committed (`Cargo.lock`); we treat this as a binary-distribution concern. Required by Law 4 reproducibility.
- Editor distance from "AAA shipping engine in language X" (where X = C++): Nexus is taking a position that the next AAA engine in production circa 2030 will be in Rust. No proof exists yet; we are betting on it.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **C++ (20 or later)** | mature gamedev ecosystem; existing engine talent; performant | memory-unsafe by default (violates Law 6 baseline); slow iteration via CMake/MSBuild; no built-in package manager; FFI to LLM-generated code unsafe | Law 6 + iteration speed for AI-generated codebases |
| **Zig** | C-interop, comptime, low-friction FFI | pre-1.0, ecosystem too small for gamedev, smaller LLM training corpus, no equivalent of `cargo deny`/`clippy` | maturity & ecosystem |
| **Go** | fast compiles, simple, large ecosystem | GC pauses incompatible with real-time rendering; generics late-arriving; no SIMD story; web target weaker than Rust's WASM | GC + perf |
| **C#** (with .NET 9+ AOT) | great editor history (Unity, Stride, Godot C# binding); MS investing in AOT | .NET runtime baggage on consoles; GC; license/closed-source tooling history; less native to WASM | runtime baggage + AOT story still maturing for gamedev |
| **Jai** (Jonathan Blow) | gamedev-optimized | closed beta, no public release, no LLM corpus | not publicly available |
| **Carbon** (Google) | C++-interop story | experimental, no stable, tiny ecosystem | not production-ready |
| **Swift** | mature, native on Apple platforms | poor non-Apple platform support; no WASM target; smaller LLM corpus for cross-platform gamedev | platform parity |
| **TypeScript / JS** (V8 / Bun runtime) | mass dev pool, hot reload native | GC, runtime engine size for ship targets, web-only strong | not native enough for engine core |

Revisit conditions: if Zig hits 1.0 with a gamedev ecosystem comparable to Rust's, or if Carbon ships a stable 1.0 with proven AAA usage, we re-open this ADR.

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"The AI-First Mandate", §"The Commitment"
- Laws: 1, 3, 4, 5, 6, 7, 9, 10, 12
- Tech stack: `docs/architecture/03-tech-stack.md` §"Rust"
- Workspace shape: `docs/architecture/04-workspace-layout.md`
- External:
  - Rust home: https://www.rust-lang.org/
  - Edition guide: https://doc.rust-lang.org/edition-guide/
  - Bevy as Rust-gamedev existence proof: https://github.com/bevyengine/bevy
  - `cargo deny`: https://github.com/EmbarkStudios/cargo-deny
  - `cargo geiger`: https://github.com/rust-secure-code/cargo-geiger
