<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0007 — Deterministic Replay as a Foundational Capability

## Status

`Accepted`

Date: 2026-01-15
Authors: nexus-architecture-agent-01
Reviewers: integration team, networking team, agent-api team

## Context

Many of Nexus's other commitments depend on the same underlying capability: given the same initial world state and the same input sequence, the engine produces the same output. This single property enables:

- **Rollback netcode** (`docs/architecture/05-adr/0005-rollback-netcode.md`). Without determinism, rollback is impossible.
- **AI agent debug loops.** The agent captures a bug-producing scenario once, then iterates on a fix offline; each replay is the same world. → `docs/specs/agent/replay.md`.
- **Bisection.** Find the frame the bug appeared on; the replay narrows down to a single tick.
- **Time-travel debugging.** Step backward in a recorded run.
- **CI regression tests.** A recorded gameplay scenario can run on every PR and assert end-state hash equality.
- **Cheat detection.** Server replays client inputs; mismatch = tampered client.
- **Tiny replay files.** Snapshot + input log is kilobytes per minute. No video capture needed.

Sources of non-determinism in game engines that must be eliminated:
- Wall-clock time (`std::time::Instant::now`).
- Unseeded RNG (`rand::random`).
- Iteration order of hash maps (`HashMap`'s default hasher is randomized per-process).
- Thread scheduling order (parallel system results merged in arbitrary order).
- Floating-point cross-architecture drift (x87 80-bit vs SSE 32-bit, fused multiply-add availability, transcendental implementations).
- Async task scheduling (a major reason async is banned in gameplay code, per `docs/architecture/03-tech-stack.md`).
- Uninitialized memory.

## Decision

Deterministic replay is a **foundational engine capability**, encoded as Law 9 and enforced by the merge bot and CI.

Scope of determinism:
- **Bit-exact within a single target** (same OS, same CPU arch, same toolchain, same binary): mandatory. Replay produces identical end-state hash on every run on the same machine. Verified by CI replay test on every PR.
- **Bit-exact cross-target**: required for the **rollback-netcode** subset of simulation (fixed-point physics path + ECS systems flagged `#[deterministic]`). → `docs/specs/physics/determinism.md`. Achieved via:
  - Fixed-point math (`fixed` crate) on the netcode-deterministic data path.
  - Rapier with `enhanced-determinism` feature.
  - Explicit ban on floating-point in netcode-replicated state (for fighting genre); softer guarantees for FPS/MOBA via tolerance windows.
- **Bit-exact cross-platform for general game logic**: NOT promised. Best-effort; floating-point cross-platform parity is a research problem we do not solve in v1.0.

Mechanisms (Law 9 enforcement):
- `nexus_core::time::SimTime` is the ONLY time API for gameplay code. Wall-clock access in gameplay code is banned (lint: `no_wallclock_in_sim`).
- `nexus_core::rand::SeededRng` (ChaCha8) is the ONLY RNG for gameplay code. Seeds are part of the world snapshot.
- `nexus_core::collections::OrderedMap` and `BTreeMap` for any state that participates in iteration order. Banned: iterating `std::collections::HashMap` in gameplay.
- ECS scheduler executes systems in a topologically sorted order; intra-system parallelism is constrained to commutative reductions or explicit barriers.
- `async` is banned in `nexus-core`, `nexus-physics`, gameplay ECS systems, and any genre crate. Confined to `nexus-net`, `nexus-assets`, `nexus-agent`.
- Snapshot format: `bincode`-serialized world + resource state + RNG state + SimTime. Replay = snapshot + input log.
- Sync hash: per-tick, blake3 hash of the deterministic subset of state. Mismatch in replay = test failure.

Engine-wide tests:
- Every demo game (`docs/games/`) has a recorded replay smoke test in CI; replays MUST match end-state hash.
- `cargo test -p nexus-net --features rollback-determinism` runs a multi-machine determinism CI lane (linux + windows + macos same input sequence → same end hash on the fixed-point subset).
- New ECS systems must declare whether they are `#[deterministic]` (default) or `#[render_only]` (excluded from replay hash).

## Consequences

### Positive

- **Rollback netcode becomes feasible.** → ADR 0005.
- **AI agents debug without re-running games live.** Capture once, iterate on the fix locally at simulation speed.
- **Replay is a free debugging tool.** Already structural; no separate "recording mode".
- **Server-side cheat detection** by replaying client inputs and comparing snapshots.
- **Tiny replay artifacts.** Compared to video capture: orders of magnitude smaller.
- **CI regression detection.** A "regression" is a replay that no longer ends in the same state.
- **Bisection** of bugs becomes mechanical.

### Negative / costs

- **API discipline.** Gameplay code can never reach for `Instant::now`, `rand::random`, `HashMap::iter`. Mitigated by compile-time lints (merge bot) and clear ergonomic alternatives in `nexus-core`.
- **Floating-point cross-platform** is hard. Mitigated by isolating the cross-platform-determinism requirement to the netcode-replicated subset (fixed-point), leaving general game logic at within-target bit-exactness only.
- **Snapshot size**. World state can be large. Mitigated by per-component serialization opt-in/opt-out, `zstd` compression, and delta encoding for replay frames.
- **Banning async in gameplay** restricts the "ergonomic" choices a Rust developer might reach for. We accept and document — async lives in I/O subsystems only.
- **Parallel system scheduler** must be deterministic. Requires care: explicit ordering constraints, no relying on whichever thread happens to win.

### Neutral

- The renderer is explicitly excluded from determinism requirements (Law 9 applies to simulation, not rendering). Render-only systems are flagged `#[render_only]`.
- Replays are stored under `replays/` in the game template. Format documented in `docs/specs/agent/replay.md`.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **No determinism guarantee** | maximum freedom for gameplay code | rollback impossible; replay impossible; cheat detection harder; agent debug loop weaker | violates ADRs 0005, agent SDK premises |
| **Determinism only when explicitly opted in** | less developer friction | leaks non-determinism over time; opt-in becomes opt-out via drift; defeats the property | not robust to a 100M-LOC AI-written codebase |
| **Fully bit-exact cross-platform for everything** (ban floats entirely) | maximum portability | huge perf cost; physics, graphics, audio all rely on floats; ecosystem-incompatible | unrealistic; we scope to "netcode-replicated subset uses fixed-point" |
| **Snapshot every frame** (no input-log replay) | simpler reasoning | massive storage; same logical guarantee as input-log; we want input-log for cheat detection too | input-log + sparse snapshots is strictly better |

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"The AI-First Mandate" item 5
- Laws: 9 (primary), 1, 8, 11
- Related ADRs: `0005-rollback-netcode.md`, `0006-headless-by-default.md`
- Specs: `docs/specs/agent/replay.md`, `docs/specs/agent/headless.md`, `docs/specs/agent/scenarios.md`, `docs/specs/physics/determinism.md`, `docs/specs/core/ecs.md`, `docs/specs/core/jobs.md`, `docs/specs/networking/rollback.md`
- Tech stack: `docs/architecture/03-tech-stack.md` §"Async runtime", §"RNG"
- System map: `docs/architecture/02-system-map.md` §"Determinism boundary"
- External:
  - Blake3 hash: https://github.com/BLAKE3-team/BLAKE3
  - `fixed` crate: https://crates.io/crates/fixed
  - Rapier `enhanced-determinism`: https://rapier.rs/docs/user_guides/rust/determinism/
  - Glenn Fiedler "Floating Point Determinism": https://gafferongames.com/post/floating_point_determinism/
  - bincode: https://github.com/bincode-org/bincode
