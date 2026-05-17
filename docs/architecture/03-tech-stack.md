<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Tech Stack

> The complete, opinionated list of every foundational technology Nexus depends on, with rationale, license, and link.
> Constraints: all entries MUST be MIT or MIT-compatible (Law 7). All choices MUST satisfy Laws 1, 4, 8, 9.
> Per-decision deep dives live in `docs/architecture/05-adr/`.

---

## Summary table

| Concern | Choice | License | Why | ADR |
|---|---|---|---|---|
| Systems language | Rust (edition 2024+, stable) | MIT/Apache-2.0 | memory safety without GC, fearless concurrency, single-toolchain cross-compile to every Nexus target | `05-adr/0001-why-rust.md` |
| GPU abstraction | `wgpu` | MIT/Apache-2.0 | one API → Vulkan/Metal/DX12/WebGPU/GLES; ships browser-first; mature | `05-adr/0002-why-wgpu.md` |
| Architecture pattern | ECS (archetypes + sparse-sets hybrid) | n/a | cache locality, parallel scheduling, agent-introspectable world | `05-adr/0003-why-ecs.md` |
| License | MIT | MIT | permissive, no royalties, no surprise relicense; matches Vision §"The Commitment" | `05-adr/0004-mit-license.md` |
| Multiplayer model | GGPO-style rollback netcode (genres opt in) | concept (own impl) | low input latency, peer-to-peer friendly, proven in fighting games | `05-adr/0005-rollback-netcode.md` |
| Runtime mode default | Headless | n/a | every system simulates without display; CI + AI agent runs are first-class | `05-adr/0006-headless-by-default.md` |
| Replay model | Deterministic snapshot + input log | n/a | foundation for debug, bisect, rollback, agent introspection | `05-adr/0007-deterministic-replay.md` |
| Physics | `rapier` (rapier2d, rapier3d) | Apache-2.0 | Rust-native, deterministic, integrates with ECS, no FFI cost | tech-stack §Physics |
| Windowing / input | `winit` | Apache-2.0 | de-facto Rust window crate, every Nexus target supported | tech-stack §Windowing |
| Audio I/O | `cpal` | Apache-2.0 | low-latency cross-platform audio out; pair with own DSP graph | tech-stack §Audio |
| Job system | `rayon` + custom task graph | MIT/Apache-2.0 | work-stealing, mature; ECS scheduler builds task graph on top | `docs/specs/core/jobs.md` |
| Async runtime | `tokio` (only in net + asset I/O + agent transport; never gameplay) | MIT | industry default; gameplay stays sync deterministic | tech-stack §Async |
| Serialization | `serde` + `bincode` (binary) + `serde_json` (interop) | MIT/Apache-2.0 | one trait, every format; snapshots use bincode, agent API uses JSON-RPC | tech-stack §Serde |
| Logging / tracing | `tracing` + `tracing-subscriber` | MIT | structured spans, JSON exporter, satisfies Laws 1 + 11 | tech-stack §Tracing |
| Error handling | typed enums + `thiserror`; `anyhow` banned in core | MIT/Apache-2.0 | Law 10 requires structured errors | tech-stack §Errors |
| Shader language | WGSL (canonical) + GLSL → WGSL transpile (`naga`) | MIT/Apache-2.0 | WebGPU canonical; portable | `docs/specs/renderer/shaders.md` |
| Scripting (game logic) | `mlua` (Lua 5.4) | MIT | proven game scripting, hot-reload friendly | `docs/specs/scripting/lua.md` |
| Scripting (mod sandbox) | `rune` | MIT/Apache-2.0 | Rust-native, sandboxed, capability model | `docs/specs/scripting/rune.md` |
| Math (SIMD) | `glam` | MIT/Apache-2.0 | gamedev-tuned, SIMD-by-default, no_std capable | `docs/specs/core/math.md` |
| Image I/O | `image` + `basis-universal` (BC/ETC/ASTC transcode) | MIT/Apache-2.0 | one decoder, one universal compressed format | `docs/specs/assets/compression.md` |
| Mesh I/O | `gltf` (primary), bring-your-own for FBX/OBJ at import time | MIT/Apache-2.0 | glTF is the open mesh standard | `docs/specs/assets/import.md` |
| Networking transport | `quinn` (QUIC) for replication; raw UDP for rollback inputs | MIT/Apache-2.0 | TCP-free, multiplexed, encrypted | `docs/specs/networking/transport.md` |
| Compression | `zstd` (state), `lz4` (hot path) | BSD-3 / MIT | fast, well-tuned, every platform | `docs/specs/assets/compression.md` |
| RNG | `rand` + `rand_chacha` (seeded ChaCha8) | MIT/Apache-2.0 | deterministic, fast, satisfies Law 9 | `docs/specs/core/math.md` |
| Test framework | `cargo test` + `proptest` + `cargo fuzz` + `criterion` | MIT/Apache-2.0 | property tests + fuzz + benches required by Law 5 + 12 | `docs/guides/pr-protocol.md` |
| Lints | `clippy` + `cargo deny` + `cargo geiger` + `nexus-merge` lints | MIT/Apache-2.0 | enforce Laws 3, 6, 7 | `docs/guides/merge-system.md` |
| Containerization (CI) | OCI images, `nexus/builder` toolchain image | n/a | reproducible builds across CI nodes | `docs/guides/integration-team.md` |

---

## Rust (the language)

**Choice.** Rust, stable channel, latest edition (2024 at time of writing; agents track the most recent stable edition).
**License of toolchain.** MIT / Apache-2.0 dual-licensed (https://www.rust-lang.org/).

**Why.**
1. **Memory safety without GC.** Game engines cannot tolerate GC pauses. C++ memory-unsafety is the #1 source of shipped game bugs and exploits. Rust gives both: no GC, no UAF, no double-free, no data race. Law 6.
2. **Single toolchain for every Nexus platform.** `rustup target add` covers Linux, Windows, macOS, Android (`aarch64-linux-android`), iOS (`aarch64-apple-ios`), Web (`wasm32-unknown-unknown` + `wasm32-wasi`). One repo, one workspace, all targets.
3. **`cargo` is the build system.** No CMake, no GN, no Bazel needed for v1.0. Workspace model fits Law 3 (Sacred Module Boundaries) perfectly.
4. **First-class concurrency.** `Send`/`Sync` + `rayon` makes Law 5 (perf) achievable without unsafe gymnastics.
5. **Generics + traits** model ECS contracts (`Component`, `System`, `Query`) without inheritance hierarchies.
6. **WASM-first ecosystem.** `wasm-bindgen`, `wgpu` on WebGPU, `wasm-pack`: shipping to the web is a `cargo build --target wasm32`, not a port.
7. **AI agents write Rust well.** Modern LLMs have strong Rust priors; the compiler's structured diagnostics directly satisfy Law 1 — `cargo build --message-format=json` is machine-readable out of the box.

**What we give up.** Slower compile times than Go; smaller talent pool than C++. We accept both. Compile-time mitigations: `cargo nextest`, `mold` linker, split-debuginfo, sccache.

**Full rationale & alternatives considered:** `docs/architecture/05-adr/0001-why-rust.md`.

---

## wgpu (GPU abstraction)

**Choice.** `wgpu` (https://github.com/gfx-rs/wgpu), latest stable.
**License.** MIT / Apache-2.0 dual.

**Why.**
1. **One API → all backends.** wgpu targets Vulkan, Metal, DX12, OpenGL ES 3, WebGPU, WebGL2. Covers every Nexus platform.
2. **Implements the WebGPU standard.** Means the browser is a first-class target, not an afterthought.
3. **WGSL** is the canonical shader language; `naga` transpiles WGSL → SPIR-V / MSL / HLSL / GLSL transparently. → `docs/specs/renderer/shaders.md`.
4. **Active development backed by Mozilla, Google, Microsoft, and the Rust gamedev community.** Used by Bevy, Veloren, Tauri, Servo.
5. **Validation layer** for free in debug builds — every misuse is a structured error (Law 10).
6. **Headless mode** trivially supported (Law 8): drop the surface, render to a texture, read back. → `docs/specs/agent/headless.md`.

**What we give up.** Bleeding-edge vendor extensions (e.g., DLSS, FSR-native) require manual integration. We accept this; native upscalers ship as optional plugins.

**Full rationale:** `docs/architecture/05-adr/0002-why-wgpu.md`.

---

## Rapier (physics)

**Choice.** `rapier2d` and `rapier3d` (https://github.com/dimforge/rapier).
**License.** Apache-2.0.

**Why.**
1. **Rust-native.** No FFI cost, no header-binding maintenance, no double allocator. Fits the ECS directly.
2. **Deterministic option** (`enhanced-determinism` feature) — required by Law 9 and `docs/specs/physics/determinism.md`.
3. **Mature API** — broad-phase BVH, narrow-phase contact, rigid body + joint + character controller. Comparable feature set to Bullet, Box2D.
4. **Active maintenance** by `dimforge`; cited in Bevy, Fyrox, Macroquad ecosystems.
5. **2D + 3D parity** via the same API — matters for Nexus styles `2d` and `pixel`.

**What we give up vs Jolt (jrouwe/JoltPhysics).** Jolt edges out Rapier on stacking stability and AAA-scale character physics today (used by Horizon Forbidden West). We re-evaluate at v1.1 once a Rust-native Jolt binding (with feature parity) exists. → `docs/specs/physics/overview.md` "Open Questions".

**Alternatives considered.** Bullet (C++, no Rust port we trust), Box2D (2D only), PhysX (closed source). All rejected for Law 6 (FFI = more unsafe) and/or Law 7 (license).

---

## winit (window + input)

**Choice.** `winit` (https://github.com/rust-windowing/winit), latest stable.
**License.** Apache-2.0.

**Why.**
1. **De-facto Rust windowing.** Every major Rust gamedev project uses it (Bevy, Piston, ggez).
2. **Every target.** X11, Wayland, Win32, Cocoa, UIKit, Android NDK, web (canvas), Redox.
3. **Event-loop model** abstracts each platform; HAL spec wraps it further (`docs/specs/core/hal.md`).
4. **Companion crates:** `raw-window-handle` (passes to wgpu without coupling), `accesskit` (a11y if needed later).

**What we give up.** Some platform-specific input quirks (e.g., raw mouse on Win32 with sub-pixel precision) need workarounds. Documented in `docs/specs/core/hal.md` "Open Questions".

---

## CPAL (audio I/O)

**Choice.** `cpal` (https://github.com/RustAudio/cpal).
**License.** Apache-2.0.

**Why.**
1. **Low-level cross-platform audio out.** ALSA / JACK / PulseAudio (Linux), WASAPI (Windows), CoreAudio (macOS/iOS), AAudio/OpenSL ES (Android), WebAudio (web).
2. **Minimal surface area.** CPAL handles stream lifecycle and callback; everything above (mixer, DSP, spatializer) is Nexus's own code in `nexus-audio`. → `docs/specs/audio/overview.md`.
3. **Used by `tesselode/kira` and other production Rust audio engines** — proven in shipping games.

**Alternative considered.** `miniaudio` via FFI — single-header C, fewer Rust idioms, more `unsafe`. Rejected for Law 6.

**Audio graph layer (above CPAL).** Custom; `kira` was studied but its API does not match Nexus's ECS-driven model. Borrow concepts, not code. → `docs/prior-art/` [AGENT 13: kira not yet listed].

---

## Job system

**Choice.** `rayon` (https://github.com/rayon-rs/rayon) for data-parallel; custom task graph on top for system scheduling.
**License.** MIT / Apache-2.0.

**Why.**
1. **Rayon's work-stealing scheduler** is battle-tested and fast.
2. **The ECS scheduler** builds a task graph at startup from system declarations (read-set / write-set of components), then dispatches tasks to rayon's pool. → `docs/specs/core/jobs.md`.
3. **Fiber-based scheduling** was considered (à la Naughty Dog's "Parallelizing the Naughty Dog Engine Using Fibers" GDC 2015). Rejected for v1.0: no portable Rust fiber crate that compiles on every Nexus target. Re-evaluate v1.1 once `async fn` in traits stabilizes more workflows. → `docs/specs/core/jobs.md` "Open Questions".

---

## Async runtime

**Choice.** `tokio` (https://tokio.rs/), but ONLY in:
- `nexus-net` (sockets, QUIC via `quinn`)
- `nexus-assets` (background streaming I/O)
- `nexus-agent` (JSON-RPC transport)

**Banned in.** Gameplay code, ECS systems, physics, renderer hot path. Reason: async violates Law 9 (deterministic replay) — task scheduling is non-deterministic.

**License.** MIT.

**Why tokio over alternatives.** Industry standard, best ecosystem (`quinn`, `hyper`, `tower`). `async-std` is unmaintained as of 2024; `smol` is leaner but smaller ecosystem.

---

## Serialization

**Choice.** `serde` (https://serde.rs/) as the trait. Format crates:
- `bincode` v2 — snapshots, replays, network state. Compact, fast.
- `serde_json` — agent API (JSON-RPC), human-readable configs, Nexus.toml interchange.
- `toml` — `Nexus.toml`, project manifests. → `docs/game-template/nexus-toml.md`.

**License.** MIT / Apache-2.0.

**Why.** One trait everywhere; format is a choice at the call site. Every ECS component derives `Serialize + Deserialize` (Law 9 prereq).

---

## Logging / tracing

**Choice.** `tracing` (https://github.com/tokio-rs/tracing) + `tracing-subscriber` with the JSON exporter enabled by default.
**License.** MIT.

**Why.** Structured spans, fields, levels. The JSON exporter satisfies Law 1 (machine-readable logs) and Law 11 (telemetry by default). `println!` is forbidden in shipped code; the merge bot rejects it.

---

## Error handling

**Choice.** Typed enum errors per system, derived via `thiserror`. `anyhow` is allowed in tools / examples but banned in `nexus-*` core crates. Every error implements `nexus_core::error::StructuredError` (Law 10). → `docs/specs/core/events.md` and every spec's "Error Contract".

**License.** MIT / Apache-2.0.

---

## Compile-time tooling

| Tool | Use | License |
|---|---|---|
| `cargo` | build + workspace | MIT/Apache-2.0 |
| `clippy` | lints | MIT/Apache-2.0 |
| `cargo deny` | license + dependency edge enforcement (Laws 3, 7) | Apache-2.0 |
| `cargo geiger` | `unsafe` audit (Law 6) | MIT/Apache-2.0 |
| `cargo nextest` | faster test runner | Apache-2.0/MIT |
| `cargo llvm-cov` | coverage (Law 12) | Apache-2.0/MIT |
| `cargo fuzz` | fuzz harness (Law 12) | Apache-2.0/MIT |
| `criterion` | microbenchmarks (Law 5) | Apache-2.0/MIT |
| `proptest` | property tests (Law 12) | MIT/Apache-2.0 |
| `mold` | fast linker (Linux dev loop) | MIT |
| `sccache` | distributed compile cache (CI) | Apache-2.0 |

---

## Reference machine

Pinned 2026-05-17 — see `docs/architecture/decisions-resolved.md`. Every Performance Contract (Law 5) targets this machine; CI bench gate runs here.

| Component | Spec |
|---|---|
| CPU | AMD Ryzen 9 7950X (16 cores, 32 threads, Zen 4) |
| GPU | NVIDIA GeForce RTX 4070 (12 GB VRAM) |
| RAM | 64 GB DDR5 |
| Storage | NVMe SSD (PCIe 4.0+), ≥ 1 TB |
| OS | Linux (kernel ≥ 6.6; primary dev platform per Law 4) |
| Year | Modal indie dev target circa 2026 |

Numbers from any other machine are illustrative, not contractual. → Law 5; → `docs/architecture/06-modularity.md` §"Compile-time savings target".

## Versioning policy

- **Rust edition:** pin to the latest stable edition; bump in a dedicated PR.
- **MSRV (minimum supported Rust version):** **Rust 1.83 stable** (resolved 2026-05-17 — see `docs/architecture/decisions-resolved.md`). Workspace policy: MSRV ≤ current stable, bumped only via dedicated PR with changelog + CI matrix update.
- **Foundational crates** (wgpu, winit, rapier, cpal, tokio, rayon, serde): pinned to a minor version in `Cargo.toml`. Bumps require a PR with changelog and benchmark delta. → Law 5.
- **Semver:** Nexus itself follows semver pre-1.0 (`0.x.y` breaking on `x`). Post-1.0, breaking changes require a major bump and a migration guide.

---

## Excluded technologies (and why)

| Tech | Why rejected |
|---|---|
| C++ | Law 6 (memory unsafety by default); slower iteration; CMake hell |
| Unity / Unreal as substrate | Law 7 (license), Law 1 (not AI-first), full vendor lock |
| Vulkan-only renderer | Web + macOS would require a second backend; wgpu covers it for free |
| OpenGL as primary | Deprecated on macOS; no compute path; web has WebGPU now |
| Box2D, Bullet, PhysX | License, FFI, or maintenance reasons (see Physics §) |
| GDScript / C# / JS as primary game language | Lua + Rune already cover scripting; adding a third runtime violates Law 4 (always green CI surface) |
| GPL/AGPL/SSPL/BUSL deps | Law 7 |
| Closed-source SaaS in the critical path | Law 7, Law 8 (must run headless offline) |
| `async` in gameplay | Law 9 (non-deterministic) |

---

## Cross-references

- Laws this stack must satisfy: `docs/architecture/01-principles.md`
- Workspace shape that this stack implies: `docs/architecture/04-workspace-layout.md`
- Per-decision deep dives: `docs/architecture/05-adr/`
- Per-system spec consuming each tech: `docs/specs/`
