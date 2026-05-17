<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0002 — wgpu as the GPU Abstraction Layer

## Status

`Accepted`

Date: 2026-01-15
Authors: nexus-architecture-agent-01
Reviewers: integration team

## Context

Nexus must render on Vulkan (Linux, Android), Metal (macOS, iOS), DirectX 12 (Windows, Xbox), WebGPU (modern browsers), with a WebGL2 fallback for older browsers. It must also run **headless** (Law 8) and **deterministically** (Law 9, for replays and CI). Maintaining a separate backend per API is prohibitive for an AI-built engine with a small (zero-human) maintainer count.

Forces:
- Law 4: every target must compile and run on every PR.
- Law 7: MIT-compatible.
- Law 1: validation errors must be machine-parseable structured output.
- Vision: web (WASM) is a first-class shipping target on day one.
- Reference: `gfx-rs/wgpu`, `google/filament`, `bkaradzic/bgfx`, `DiligentGraphics/DiligentEngine`, `OGRECave/ogre`.

## Decision

Use **`wgpu`** (https://github.com/gfx-rs/wgpu) as the single GPU abstraction layer for the renderer.

- Canonical shader language: **WGSL**. Transpiled to SPIR-V (Vulkan), MSL (Metal), HLSL (DX12), GLSL (WebGL2) via `naga`.
- Renderer crate (`nexus-renderer`) is the ONLY crate that depends on `wgpu` and `naga`. Every other system requests rendering via the renderer's public API (Law 3 + `docs/contracts/`).
- Validation layer is enabled in debug builds; validation errors are translated into `StructuredError` per Law 10.
- WebGPU is treated as the conceptual baseline; features available only on Vulkan/DX12/Metal are feature-gated and reported via capability negotiation (`docs/specs/renderer/backend.md`).

## Consequences

### Positive

- **One renderer source tree** → all 6+ targets. The hardest engineering win of the stack.
- **WebGPU-native.** Shipping demo games to itch.io, GitHub Pages, or arbitrary web hosts is a `cargo build --target wasm32-unknown-unknown` away.
- **Open standard.** wgpu implements the WebGPU spec (W3C). Long-term durability.
- **Active ecosystem** (Bevy, Veloren, Fyrox, Tauri, Servo) means fixes propagate fast.
- **Headless rendering** trivially supported: drop the surface, render to an off-screen texture, read back. Critical for Law 8 and `docs/specs/agent/headless.md`.
- **Validation in debug** gives free correctness checks on every test run.
- **MIT/Apache-2.0** dual license. Satisfies Law 7.

### Negative / costs

- **Lowest-common-denominator features.** Bleeding-edge things like hardware ray tracing, mesh shaders, work graphs are not yet uniformly exposed (varies by wgpu version). Mitigation: feature-gate behind capability bits; ship fallbacks.
- **Vendor-specific upscalers** (DLSS, FSR-native, XeSS) require manual native integration. Acceptable: ship as optional plugins behind feature flags; not on the v1.0 critical path.
- **WGSL is younger than HLSL/GLSL.** Tooling gap (debuggers, profilers) closing rapidly. Mitigation: `naga` transpiles to native shader languages for vendor tools like RenderDoc / PIX / Xcode GPU Frame Capture.
- **One extra abstraction layer** vs writing directly to Vulkan. Performance overhead is small in practice (wgpu is a thin command translator) and benchmarks (`criterion`) will guard regressions per Law 5.
- **Console support is not native to wgpu.** Switch/PS5/Xbox renderer paths are vendor-SDK-shim crates (closed by NDA outside the public repo).

### Neutral

- **WGSL is the canonical shader language** — see `docs/specs/renderer/shaders.md`. Imports of HLSL/GLSL go through a `naga` reverse-transpile at import time.
- **WebGL2 fallback** for older browsers ships behind the `gles` feature. Lower visual quality acceptable for accessibility.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Vulkan-only** (`ash`, `erupt`) | full feature access, single API | macOS via MoltenVK only; no web; massive boilerplate; multi-backend re-invented | breaks Law 4 (every target) |
| **Direct per-platform backends** (Vulkan + Metal + DX12 + WebGPU hand-written) | maximum perf, vendor features | maintenance impossible for our team size; massive surface area; constant cross-platform parity bugs | infeasible |
| **`bgfx`** (C++) | mature, AAA-used, many backends | C++ FFI (Law 6), license is BSD-2 but C++ dependency complicates Cargo workspace; no WebGPU | FFI burden + iteration speed |
| **`Filament`** (Google, C++) | beautiful renderer, great PBR | C++ FFI; tightly Google-controlled; no first-class web | FFI + governance |
| **`DiligentEngine`** | many backends, modern API | C++ FFI; less Rust ecosystem alignment | FFI |
| **`gfx-hal`** (predecessor to wgpu) | very low-level | deprecated in favor of wgpu | superseded |
| **`sokol_gfx`** (C, single header) | tiny, simple, multiple backends | C FFI, fewer modern features, no compute on every backend | FFI + compute gaps |
| **`miniquad`** (Rust) | extremely small footprint | feature-poor, no PBR-tier capability | feature gap |

Revisit conditions: if wgpu pauses development for 12+ months OR if a Rust-native ray-tracing-native cross-platform alternative reaches 1.0 with browser support, we re-open.

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"Platform Targets"
- Laws: 1, 3, 4, 7, 8, 10
- Tech stack: `docs/architecture/03-tech-stack.md` §"wgpu"
- Renderer specs: `docs/specs/renderer/overview.md`, `docs/specs/renderer/backend.md`, `docs/specs/renderer/shaders.md`
- Headless: `docs/specs/agent/headless.md`
- External:
  - wgpu: https://github.com/gfx-rs/wgpu
  - WebGPU spec: https://www.w3.org/TR/webgpu/
  - WGSL spec: https://www.w3.org/TR/WGSL/
  - naga: https://github.com/gfx-rs/wgpu/tree/trunk/naga
  - Filament docs (reference): https://github.com/google/filament
