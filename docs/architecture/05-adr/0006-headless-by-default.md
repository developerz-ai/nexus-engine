<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0006 — Headless-By-Default Runtime

## Status

`Accepted`

Date: 2026-01-15
Authors: nexus-architecture-agent-01
Reviewers: integration team

## Context

The engine must run in environments with no display, no GPU, no audio device, no input hardware:
- **CI runners** (every PR, every push, every demo game smoke test).
- **AI agent debug loops** (the agent observes telemetry and snapshots without ever opening a window).
- **Dedicated game servers** (MMORPG zones, MOBA matches, replication authorities).
- **Cloud automated playtests** (overnight scenario sweeps).
- **Replay analyzers** (post-mortem, bisection).

Most existing engines treat headless as an afterthought retrofitted later (Unreal `-nullrhi`, Unity batchmode, Godot `--headless`), with sharp edges, missing features, and "you can't do X without a display" bugs.

Forces:
- Law 8: headless by default — non-negotiable.
- Law 9: deterministic replay requires the simulation to advance correctly regardless of frame timing.
- Law 1 + 11: agents debug via structured telemetry, not pixels.
- Vision §"Who This Is For": "The AI coding agent that needs structured, machine-readable APIs, headless operation, telemetry by default, and deterministic replay."

## Decision

Nexus's runtime is **headless-by-default**. The engine simulates correctly with no display, no GPU, no audio, no input device.

- The default `nexus run` command runs simulation with a window IF a display is available, headless otherwise.
- `nexus run --headless` is explicit and works on every target including web (Node.js + WASI).
- The renderer is an OPTIONAL subsystem. When disabled, the render schedule stages are no-ops.
- The audio system is an OPTIONAL subsystem. When disabled, mixer/spatializer state still advances (for determinism) but no I/O happens.
- The window/input HAL falls back to a virtual input device when no display is present. The agent can inject inputs via the SDK. → `docs/specs/agent/api.md`.
- Time can advance:
  - **Real-time** (default with display).
  - **Simulation-rate** (as fast as CPU allows — useful for CI and agent replays).
  - **Stepped** (one tick per command — useful for scenario tests).
  - Speed multiplier (`--speed 10x`) configurable.
- The engine emits structured telemetry every frame in all modes; the agent SDK consumes it.

Every demo game in `docs/games/` is exercised headlessly in CI on every PR (Law 4 + Law 8).

## Consequences

### Positive

- **CI cost low.** No GPU runners required for the bulk of the matrix. GPU runners reserved for visual regression tests.
- **Agent loop fast.** AI debug iteration runs at simulation speed, not wall-clock — a 10-minute gameplay scenario plays in seconds.
- **Dedicated servers free.** Same binary as the client, `--headless --server` flag. No second build target.
- **Test reliability.** No flaky display-dependent tests.
- **Replay reproducibility.** Headless replay produces the same end-state hash as windowed replay (in the deterministic subset, Law 9).
- **Cloud-native.** Nexus games run in containers without GPU passthrough by default.

### Negative / costs

- **Engineering discipline tax.** Every system must be written to advance without I/O present. Adding "but X requires a GPU" tempts shortcuts; the merge bot blocks them.
- **Some subsystems harder to test in headless** — visual fidelity, audio mixing quality — require GPU/audio CI lanes separately. Acceptable; those are visual regression tests, not gameplay correctness.
- **Window/input HAL more complex.** Must abstract over "real winit window", "virtual headless surface", and "agent-injected input". → `docs/specs/core/hal.md`.
- **Renderer must be extract-driven**, not callback-driven. The render graph reads from ECS state at extract time; the simulation never calls into the renderer. This is a constraint on the renderer's design and matches `bevyengine/bevy`'s extract/prepare/render staging.

### Neutral

- Frame budget in headless mode is computed but not constraint-enforced (no v-sync). Telemetry still reports per-system timings.
- Audio in headless mode advances internal state (for determinism + recording) but skips the CPAL output callback.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Display-required by default, `--headless` opt-in** (Unreal, Unity historical) | simpler renderer integration; less HAL complexity | violates Law 8; "headless bugs" lurk for years (every engine that does this has them); breaks agent SDK ergonomics | violates Law 8 |
| **Two binaries: `nexus-client` and `nexus-server`** | clear separation | code duplication; drift; double maintenance; harder for indies | one binary, two modes wins |
| **Always-headless, render via separate process** | extreme decoupling | massive IPC complexity; latency; serialization overhead | overkill |
| **Mock GPU in headless** (e.g., LLVM software rasterizer) | renderer code paths exercised in CI | huge runtime cost, slow CI, complex setup | only used for visual regression CI lane, not default |

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"The AI-First Mandate", §"Who This Is For"
- Laws: 1, 8, 9, 11
- Specs: `docs/specs/agent/headless.md`, `docs/specs/agent/overview.md`, `docs/specs/core/hal.md`, `docs/specs/renderer/overview.md`
- System map: `docs/architecture/02-system-map.md` §"Single-frame data flow" (note step 13 headless skip)
- External:
  - Bevy's extract/prepare/render stages: https://bevyengine.org/learn/quick-start/getting-started/ecs/
  - Godot `--headless`: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html
  - Unity `-batchmode`: https://docs.unity3d.com/Manual/PlayerCommandLineArguments.html
