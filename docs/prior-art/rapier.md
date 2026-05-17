<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Rapier

> The Rust-native physics engine that proves you don't need C++ for AAA-grade physics — designed with determinism, multithreading, and clean API as first-class goals.

## Snapshot

| | |
|---|---|
| Language | Rust |
| License | Apache-2.0 |
| Status | Active, production-stable; used in Bevy, Veloren, dimforge demos |
| Since | 2020 (Dimforge / Sébastien Crozet, successor to nphysics) |
| Repo | https://github.com/dimforge/rapier |

## What Nexus Borrows ✓

- **Rust-native, no FFI tax.** Direct integration with Nexus ECS, no `extern "C"` shim, no parallel build system. Nexus physics integration → `docs/specs/physics/overview.md`.
- **Multithreaded from day one** (rather than retrofitted). Per dimforge announcement, 5-8× faster than nphysics in release. Nexus jobs system feeds rapier islands → `docs/specs/core/jobs.md`.
- **Optional `enhanced-determinism` feature.** Bit-level cross-platform reproducibility — serialize world state, get identical bytes on x86_64 and aarch64. Foundation of Nexus deterministic rollback → `docs/specs/physics/determinism.md`, `docs/specs/networking/rollback.md`.
- **Non-generic data structures = fast compile.** Dimforge explicitly chose monomorphization-free design to keep incremental compile reasonable. Nexus core follows the same rule → `docs/architecture/01-principles.md`.
- **Clean handle-based API.** Bodies/colliders are `RigidBodyHandle` / `ColliderHandle` indices into typed sets — no raw pointers, no lifetimes that infect game code. Nexus handle pattern across systems → `docs/specs/core/ecs.md`, `docs/specs/assets/registry.md`.
- **2D + 3D in one design.** `rapier2d` and `rapier3d` share architecture, differ only in vector dimension. Nexus styles (2D + 3D) → `docs/specs/styles/2d.md`, `docs/specs/styles/pbr.md`.
- **Production-quality docs at https://rapier.rs**. User guide, API docs, examples — single site, kept current. Nexus docs site mirrors the structure.
- **JS/WASM bindings shipped first-class.** `@dimforge/rapier3d` proves Rust → WASM is viable for game-grade physics. Validates Nexus web target → `docs/architecture/00-vision.md`.

## What Nexus Avoids ✗

- **Soft body / cloth / fluids are not yet first-class.** Issues open (e.g., #588 for particle physics). Nexus needs to either contribute upstream, integrate complementary crates, or fall back to custom soft-body for advanced styles → `docs/specs/physics/soft.md`, `docs/specs/physics/fluid.md`.
- **No GPU acceleration.** CPU-only solver. Acceptable for most games; insufficient for AAA fluid demos. Nexus must layer GPU SPH/PIC for fluid spec → `docs/specs/physics/fluid.md`.
- **API churn between minor versions.** Pre-1.0 Rust crate norms; breaking changes per release. Nexus pins a known-good Rapier version per release line and contracts the wrapper → `docs/contracts/core-physics.md`.

## Architectural Lessons

1. **Determinism must be a feature flag, not an assumption.** Rapier ships fast-by-default and bit-deterministic-on-opt-in. Network/replay code opts in; single-player perf code doesn't pay the cost. Nexus exposes the same flag → `docs/specs/physics/determinism.md`.
2. **Avoid generics in core hot paths.** Compile times and binary bloat trump elegance. Type-erase at boundaries, monomorphize at the edges.
3. **Handles over references.** Lifetimes are great for safety, miserable for ECS-style sims with many cross-pointers. Handle + typed set is the right shape.
4. **2D and 3D should share architecture.** Don't write two physics engines. Generic over vector dimension, specialize the bare minimum.
5. **First-party WASM bindings expand the platform reach for free.** If your core is Rust + no_std-friendly, the web target is mostly compilation.
6. **Single-vendor, single-language stack reduces integration cost dramatically.** Nexus + Rapier share allocator, share threading runtime, share types.

## Direct Influence on Nexus

| Rapier pattern | Nexus file |
|---|---|
| Handle-based API | `docs/specs/physics/overview.md`, `docs/specs/assets/registry.md` |
| `enhanced-determinism` opt-in | `docs/specs/physics/determinism.md`, `docs/specs/networking/rollback.md` |
| Multithreaded islands | `docs/specs/physics/overview.md`, `docs/specs/core/jobs.md` |
| 2D/3D shared core | `docs/specs/styles/2d.md`, `docs/specs/styles/pbr.md` |
| Non-generic hot path | `docs/architecture/01-principles.md` |
| WASM-first bindings | `docs/architecture/00-vision.md` |
| `rapier.rs` doc structure | `docs/architecture/00-vision.md` (docs strategy) |

## References

- Repo: https://github.com/dimforge/rapier
- Announcement (Aug 2020): https://dimforge.com/blog/2020/08/25/announcing-the-rapier-physics-engine/
- Docs site: https://rapier.rs/
- About Rapier (docs): https://rapier.rs/docs/
- Deterministic 2D NPM build: https://www.npmjs.com/package/@dimforge/rapier2d-deterministic
- Rapier 3D NPM: https://www.npmjs.com/package/@dimforge/rapier3d
- Sponsorship/Dimforge: https://github.com/sponsors/dimforge
- Particle physics issue (gap analysis): https://github.com/dimforge/rapier/issues/588
