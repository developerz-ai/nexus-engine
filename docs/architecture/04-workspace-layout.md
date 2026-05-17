<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Workspace Layout

> The complete Cargo workspace for `nexus-engine`. Every crate, its purpose, its dependency boundary, its spec.
> Authoritative for Law 3 (Sacred Module Boundaries) and Law 4 (Always Compiles).
> Inspired by `bevyengine/bevy`'s workspace layout — many small focused crates, one root workspace.

---

## Top-level repository layout

```
nexus-engine/
├── Cargo.toml                       # workspace root, members + resolver=2
├── Cargo.lock                       # committed (per Law 4 — reproducible builds)
├── deny.toml                        # cargo-deny config: licenses + edge allow-list
├── rust-toolchain.toml              # pin to stable channel
├── rustfmt.toml                     # style; enforced by merge bot
├── clippy.toml                      # lints; merge bot rejects warnings
├── LICENSE                          # MIT
├── README.md
├── docs/                            # ALL specs, ADRs, contracts, prior-art, guides
│   ├── architecture/
│   ├── specs/
│   ├── contracts/
│   ├── prior-art/
│   ├── guides/
│   ├── game-template/
│   ├── games/
│   └── initial/
├── crates/                          # all engine crates (one per system + sub-crates)
│   ├── nexus-core/
│   ├── nexus-hal/
│   ├── nexus-assets/
│   ├── nexus-renderer/
│   ├── nexus-physics/
│   ├── nexus-audio/
│   ├── nexus-net/
│   ├── nexus-script/
│   ├── nexus-agent/
│   ├── nexus-editor/
│   ├── nexus-cli/
│   ├── nexus-merge/                 # the AI maintainer's lint/check library
│   ├── nexus-engine/                # facade re-export crate (the public umbrella)
│   ├── styles/
│   │   ├── nexus-style-pbr/
│   │   ├── nexus-style-npr/
│   │   ├── nexus-style-pixel/
│   │   ├── nexus-style-2d/
│   │   └── nexus-style-mixed/
│   ├── genres/
│   │   ├── nexus-genre-fps/
│   │   ├── nexus-genre-rpg/
│   │   ├── nexus-genre-mmorpg/
│   │   ├── nexus-genre-rts/
│   │   ├── nexus-genre-moba/
│   │   ├── nexus-genre-platformer/
│   │   ├── nexus-genre-racing/
│   │   ├── nexus-genre-survival/
│   │   ├── nexus-genre-horror/
│   │   ├── nexus-genre-fighting/
│   │   ├── nexus-genre-battleroyal/
│   │   ├── nexus-genre-roguelike/
│   │   ├── nexus-genre-towdef/
│   │   ├── nexus-genre-puzzle/
│   │   ├── nexus-genre-visualnovel/
│   │   └── nexus-genre-openworld/
│   └── sdks/
│       ├── nexus-agent-sdk-rs/      # Rust SDK
│       └── nexus-agent-sdk-py/      # Python bindings via pyo3
├── games/                           # demo games — integration tests
│   ├── nexus-fps/
│   ├── nexus-rpg/
│   ├── nexus-rts/
│   └── nexus-platformer/
├── tools/                           # dev tools (CLI helpers, codegen, scenario runners)
│   ├── nexus-codegen/               # spec → boilerplate generator
│   └── nexus-scenario/              # scenario runner CLI (uses nexus-agent-sdk)
├── benches/                         # workspace-level benches (cross-crate)
├── fuzz/                            # cargo-fuzz harnesses
└── ci/                              # CI configs, container definitions, lint policies
```

---

## Workspace root `Cargo.toml` (shape only)

```toml
# Cargo.toml
[workspace]
resolver = "2"
members = [
  "crates/nexus-core",
  "crates/nexus-hal",
  "crates/nexus-assets",
  "crates/nexus-renderer",
  "crates/nexus-physics",
  "crates/nexus-audio",
  "crates/nexus-net",
  "crates/nexus-script",
  "crates/nexus-agent",
  "crates/nexus-editor",
  "crates/nexus-cli",
  "crates/nexus-merge",
  "crates/nexus-engine",
  "crates/styles/*",
  "crates/genres/*",
  "crates/sdks/*",
  "games/*",
  "tools/*",
]

[workspace.package]
version = "0.1.0"
edition = "2024"          # bump as edition stabilizes
license = "MIT"
authors = ["Nexus Engine contributors"]
repository = "https://github.com/sebyx07/nexus-engine"
rust-version = "1.83"     # MSRV [DECISION NEEDED — pin once toolchain locked]

[workspace.lints.rust]
unsafe_code = "forbid"     # Law 6 — opt-out per crate with documented justification
missing_docs = "warn"      # Law 1 / Law 2 — public API must be documented
unused = "warn"

[workspace.lints.clippy]
all = "deny"
pedantic = "warn"
nursery = "warn"

[workspace.dependencies]
# Foundational — pin minor, every member uses the workspace version
wgpu = "*"                 # [DECISION NEEDED — pin once initial integration done]
winit = "*"
rapier3d = { version = "*", features = ["enhanced-determinism"] }
rapier2d = { version = "*", features = ["enhanced-determinism"] }
cpal = "*"
rayon = "*"
tokio = { version = "*", features = ["rt-multi-thread", "net", "io-util"] }
quinn = "*"
serde = { version = "*", features = ["derive"] }
serde_json = "*"
bincode = "*"
toml = "*"
glam = { version = "*", features = ["serde", "bytemuck"] }
tracing = "*"
tracing-subscriber = { version = "*", features = ["json", "env-filter"] }
thiserror = "*"
mlua = { version = "*", features = ["lua54", "vendored", "send"] }
rune = "*"
image = "*"
gltf = "*"
zstd = "*"
lz4_flex = "*"
rand = "*"
rand_chacha = "*"
proptest = "*"
criterion = "*"
```

---

## Crate-by-crate

Every crate lists: **purpose**, **spec**, **public surface**, **internal deps**, **external deps** (subset of workspace deps), **features**, **forbidden edges**.

### `nexus-core`

- **Purpose.** ECS, scheduler, jobs, memory, math, events, error type, telemetry bus. The substrate.
- **Spec.** `docs/specs/core/ecs.md`, `docs/specs/core/jobs.md`, `docs/specs/core/memory.md`, `docs/specs/core/math.md`, `docs/specs/core/events.md`.
- **Public surface.** `World`, `Entity`, `Component`, `System`, `Schedule`, `Query`, `Event`, `StructuredError`, `SimTime`, `SeededRng`, `Telemetry`.
- **Internal deps.** none.
- **External deps.** `serde`, `bincode`, `glam`, `rayon`, `tracing`, `thiserror`, `rand_chacha`.
- **Features.** `headless` (default ON), `parallel` (default ON), `serde` (default ON).
- **Forbidden.** depending on any other `nexus-*` crate. ever.

### `nexus-hal`

- **Purpose.** Hardware abstraction layer. Wraps `winit` (window+input), filesystem, time, threads.
- **Spec.** `docs/specs/core/hal.md`.
- **Public surface.** `Window`, `Input`, `Filesystem`, `Clock`, `ThreadPool`.
- **Internal deps.** `nexus-core`.
- **External deps.** `winit`, `raw-window-handle`, `tracing`.
- **Features.** `wayland`, `x11`, `wasm`, `android`, `ios` — feature-gated platform code.
- **Forbidden.** depending on renderer/physics/audio.

### `nexus-assets`

- **Purpose.** Asset registry, import, streaming, compression, LOD, AI generation bridge.
- **Spec.** `docs/specs/assets/overview.md` (and siblings).
- **Public surface.** `AssetServer`, `AssetId`, `Handle<T>`, `Importer`, `StreamRequest`.
- **Internal deps.** `nexus-core`, `nexus-hal`.
- **External deps.** `image`, `gltf`, `zstd`, `lz4_flex`, `serde`, `tokio`.
- **Features.** `import-fbx`, `import-obj`, `gen-meshy`, `gen-scenario`, `gen-flux`, `kenney`, `polyhaven`.
- **Forbidden.** depending on renderer (uploads happen via `docs/contracts/renderer-assets.md`).

### `nexus-renderer`

- **Purpose.** Render graph, wgpu backend, PBR materials, shaders, post-processing, particles, terrain.
- **Spec.** `docs/specs/renderer/overview.md` (and siblings).
- **Public surface.** `RenderGraph`, `Pipeline`, `Material`, `Mesh`, `Texture`, `Shader`, `Camera`, `Light`.
- **Internal deps.** `nexus-core`, `nexus-hal`, `nexus-assets`.
- **External deps.** `wgpu`, `naga`, `bytemuck`, `glam`, `tracing`.
- **Features.** `headless` (no surface), `wasm`, `vulkan`, `metal`, `dx12`, `gles`.
- **Forbidden.** depending on physics/audio/net/script (consumed via ECS only).

### `nexus-physics`

- **Purpose.** Physics world, rigid bodies, collision, character controller, soft body, fluid, determinism.
- **Spec.** `docs/specs/physics/overview.md` (and siblings).
- **Public surface.** `PhysicsWorld`, `RigidBody`, `Collider`, `Joint`, `CharacterController`.
- **Internal deps.** `nexus-core`.
- **External deps.** `rapier3d`, `rapier2d`, `glam`, `tracing`.
- **Features.** `enhanced-determinism` (default ON — required by Law 9), `fluid`, `soft-body`.
- **Forbidden.** depending on renderer (debug draw via event contract `docs/contracts/physics-renderer.md`).

### `nexus-audio`

- **Purpose.** Audio graph, spatial audio, DSP, streaming, adaptive music, voice.
- **Spec.** `docs/specs/audio/overview.md` (and siblings).
- **Public surface.** `AudioGraph`, `Source`, `Listener`, `Bus`, `Effect`, `Track`.
- **Internal deps.** `nexus-core`, `nexus-hal`, `nexus-assets`.
- **External deps.** `cpal`, `symphonia` (decoders), `tracing`.
- **Features.** `voice-chat`, `hrtf`, `convolution`.
- **Forbidden.** depending on renderer/physics/net.

### `nexus-net`

- **Purpose.** Rollback netcode, replication, transport, lobby, anti-cheat.
- **Spec.** `docs/specs/networking/overview.md` (and siblings).
- **Public surface.** `NetWorld`, `Replicate`, `Predict`, `Snapshot`, `Lobby`, `Transport`.
- **Internal deps.** `nexus-core`.
- **External deps.** `quinn` (QUIC), `tokio`, `bincode`, `zstd`, `tracing`.
- **Features.** `quic`, `udp-raw`, `relay`.
- **Forbidden.** depending on renderer/physics/audio.

### `nexus-script`

- **Purpose.** Lua + Rune integration, hot reload, sandbox.
- **Spec.** `docs/specs/scripting/overview.md` (and siblings).
- **Public surface.** `Script`, `ScriptHost`, `Capability`, `Sandbox`.
- **Internal deps.** `nexus-core`.
- **External deps.** `mlua`, `rune`, `notify` (file watcher), `tracing`.
- **Features.** `lua` (default ON), `rune` (default ON), `hot-reload`.
- **Forbidden.** depending on any other nexus crate.

### `nexus-agent`

- **Purpose.** Agent API: JSON-RPC server, headless driver, telemetry stream, scenario runner, replay, semantic API.
- **Spec.** `docs/specs/agent/overview.md` (and siblings).
- **Public surface.** `AgentServer`, `Command`, `TelemetrySubscription`, `Snapshot`, `Replay`, `Scenario`.
- **Internal deps.** `nexus-core`, `nexus-script`, `nexus-net` (transport reuse).
- **External deps.** `tokio`, `serde_json`, `tracing`, `jsonrpsee` or equivalent.
- **Features.** `python-bindings` (via pyo3 in a separate sub-crate).
- **Forbidden.** mutating ECS state outside the documented agent contract `docs/contracts/core-agent.md`.

### `nexus-editor`

- **Purpose.** Visual editor: scene tree, inspector, asset browser, shader graph, debug overlays, live reload.
- **Spec.** `docs/specs/editor/overview.md` (and siblings).
- **Public surface.** `Editor`, `Panel`, `Inspector`, `SceneView`, `ShaderGraph`.
- **Internal deps.** `nexus-agent` (write-side; never bypass), `nexus-renderer` (draw-side), `nexus-hal`.
- **External deps.** `egui` (immediate-mode UI) [DECISION NEEDED — alt: `iced`, `dioxus`], `wgpu`, `winit`.
- **Features.** `live-reload`, `debug-overlays`, `shader-graph`.

### `nexus-cli`

- **Purpose.** `nexus new`, `nexus add`, `nexus generate`, `nexus build`, `nexus test`, `nexus deploy`, `nexus agent`. Rails-style scaffolder.
- **Spec.** `docs/game-template/cli.md`.
- **Public surface.** binary only.
- **Internal deps.** none (it scaffolds files; it does NOT link the engine).
- **External deps.** `clap`, `serde`, `toml`, `walkdir`, `git2`, `reqwest`.

### `nexus-merge`

- **Purpose.** Library of lint rules used by the AI maintainer pipeline (Law enforcement: 1, 2, 3, 6, 7, 9, 10, 11, 12).
- **Spec.** `docs/guides/merge-system.md`.
- **Public surface.** `LintRule`, `Pipeline`, `Decision`, `AuditEntry`.
- **Internal deps.** none.
- **External deps.** `syn`, `quote`, `proc-macro2` (AST analysis), `serde`, `tracing`.

### `nexus-engine`

- **Purpose.** Public umbrella facade crate. Re-exports curated public surface of all engine crates so games can `use nexus_engine::prelude::*;`.
- **Spec.** N/A — derived from per-system specs.
- **Public surface.** `prelude` module re-exports.
- **Internal deps.** all `nexus-*` engine crates.
- **External deps.** none direct.

### `crates/styles/nexus-style-*`

- **Purpose.** Style modules (PBR, NPR, pixel, 2D, mixed). Plug into renderer.
- **Spec.** `docs/specs/styles/<style>.md`.
- **Internal deps.** `nexus-core`, `nexus-renderer`, `nexus-assets`.
- **External deps.** WGSL files; minimal Rust.
- **Forbidden.** mutual deps between styles.

### `crates/genres/nexus-genre-*`

- **Purpose.** Genre modules (FPS, RPG, RTS, …). Bundle of ECS components, systems, prefabs, and Lua scripts.
- **Spec.** `docs/specs/genres/<g>.md`.
- **Internal deps.** `nexus-core`, `nexus-script`.
- **External deps.** none.
- **Forbidden.** depending on renderer/physics/audio/net DIRECTLY. They depend on ECS components published by those systems; the systems own the behavior.

### `crates/sdks/nexus-agent-sdk-rs`

- **Purpose.** Rust client for the agent API. Used by external tools and by `tools/nexus-scenario`.
- **Spec.** `docs/specs/agent/sdk.md`.
- **Internal deps.** none (talks to a running engine via JSON-RPC).
- **External deps.** `tokio`, `serde_json`, `jsonrpsee` client.

### `crates/sdks/nexus-agent-sdk-py`

- **Purpose.** Python bindings to the Rust SDK via `pyo3` / `maturin`.
- **Spec.** `docs/specs/agent/sdk.md` §Python.
- **External deps.** `pyo3`, `maturin`.

### `tools/nexus-codegen`

- **Purpose.** Read a spec file, emit boilerplate (types, error enums, telemetry schemas).
- **Spec.** [AGENT 16 to extend in `docs/guides/merge-system.md`].

### `tools/nexus-scenario`

- **Purpose.** CLI runner for scenarios in `docs/specs/agent/scenarios.md`. Drives engine via SDK.

### `games/nexus-*`

- **Purpose.** Demo games — integration tests of the entire stack. → `docs/games/overview.md`.
- **Internal deps.** `nexus-engine`, the appropriate `nexus-genre-*`, the chosen `nexus-style-*`.

---

## Dependency boundary enforcement (`deny.toml` sketch)

```toml
# deny.toml
[licenses]
unlicensed = "deny"
allow = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib", "Unicode-DFS-2016"]
copyleft = "deny"
default = "deny"

[bans]
multiple-versions = "warn"
wildcards = "deny"

# Edge enforcement — see also: docs/architecture/02-system-map.md
# nexus-core must depend on no nexus-* crate.
# nexus-genre-* must NOT depend on renderer / physics / audio / net directly.
# nexus-physics must NOT depend on nexus-renderer.
# (Implemented as custom cargo-deny "graph" rules; see ci/deny-rules.md [DECISION NEEDED].)
```

---

## Crate `Cargo.toml` template

Every crate uses this skeleton — agents copy and fill.

```toml
# crates/<name>/Cargo.toml
[package]
name = "<name>"
version.workspace = true
edition.workspace = true
license.workspace = true
description = "<one-line purpose>"
documentation = "https://docs.rs/<name>"
readme = "README.md"

# Spec-before-code (Law 2): declare which spec this crate implements
[package.metadata.nexus]
spec = "docs/specs/<system>/<file>.md"
laws = ["1", "3", "5", "8", "9", "10", "11", "12"]   # adjust per crate

[lints]
workspace = true

[features]
default = ["headless"]
headless = []
# ... per-crate

[dependencies]
nexus-core = { path = "../nexus-core" }
# ... per-crate

[dev-dependencies]
proptest.workspace = true
criterion.workspace = true

[[bench]]
name = "<system>_bench"
harness = false
```

Every `lib.rs` MUST start with:

```rust
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//! Implements: docs/specs/<system>/<file>.md @ <commit-hash>
#![forbid(unsafe_code)]
#![warn(missing_docs)]
```

---

## CI matrix (Law 4)

Every PR runs:

| Job | Targets |
|---|---|
| `cargo check` | linux-x86_64, linux-aarch64, windows-x86_64, macos-aarch64, macos-x86_64, android-aarch64, ios-aarch64, wasm32 |
| `cargo test --workspace` | linux-x86_64, windows-x86_64, macos-aarch64 |
| `cargo test --features headless` | every target |
| `cargo clippy --workspace -- -D warnings` | linux-x86_64 |
| `cargo deny check` | linux-x86_64 |
| `cargo geiger` | linux-x86_64 (trend tracked) |
| `cargo llvm-cov` (coverage gate) | linux-x86_64 |
| `cargo bench` (regression gate) | reference machine |
| `nexus run --headless` per demo game | linux-x86_64 |
| `nexus-merge` lint pack | linux-x86_64 |

Reference machine spec: [DECISION NEEDED — see Law 5 in `docs/architecture/01-principles.md`].

---

## Cross-references

- System ownership table: `docs/architecture/02-system-map.md`
- Tech rationale (per dep): `docs/architecture/03-tech-stack.md`
- Why so many small crates: inspired by `bevyengine/bevy` workspace; see `docs/prior-art/bevy.md` (AGENT 13).
- Game-template workspace shape (separate repo): `docs/game-template/structure.md` (AGENT 15).
