<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — Headless Runtime

> `nexus run --headless` — the engine boots with no window, no GPU surface, no audio device, and a deterministic fixed-step loop. This is the default mode for AI agents and CI.

## Boundaries

- **Owns:** headless run loop driver, tick scheduler integration, speed multiplier, frame budget enforcement.
- **Does NOT own:** what runs each tick (→ `docs/specs/core/ecs.md` [AGENT: 02]), the renderer (which becomes a no-op in headless), the RPC server (→ `api.md`).
- **Depends on:** HAL clock (→ `docs/specs/core/hal.md`), ECS schedule (→ `docs/specs/core/ecs.md`), physics fixed timestep (→ `docs/specs/physics/overview.md` [AGENT: 05]).

## CLI

```
nexus run [OPTIONS]

Headless options:
  --headless                 No window, no GPU surface, no audio device.
                             Renderer registers as no-op.
  --tick-rate <HZ>           Simulation rate. Default 60.
  --speed <MULT>             Wall-clock multiplier (0.0 = max, 1.0 = real, 10.0 = 10×).
                             Default 1.0 windowed, 0.0 (uncapped) headless.
  --max-ticks <N>            Exit after N ticks (CI / scenarios).
  --frame-budget-ms <MS>     Hard cap per tick. Default 16.6 (60Hz).
  --rpc <TRANSPORT>          stdio | tcp:HOST:PORT | unix:PATH | ws:HOST:PORT
                             Default: none (no agent control). 
                             `--headless` implies `--rpc=stdio` if unset.
  --seed <U64>               Master RNG seed. Default 0 (or random if windowed).
  --record <PATH>            Record input + telemetry log (→ replay.md).
  --replay <PATH>            Replay recorded log; rejects all agent inputs.
  --capabilities <LIST>      Comma-separated agent capability grants.
  --scene <PATH>             Load scene on boot.
  --scenario <PATH>          Run scenario file then exit (→ scenarios.md).
```

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Clean exit (max-ticks reached or `exit` received). |
| 1 | Initialization failure. |
| 2 | Scenario assertion failed. |
| 3 | Determinism violation during replay. |
| 4 | Agent disconnected unexpectedly while owning the loop. |
| 137 | Killed (frame budget repeatedly exceeded — see watchdog). |

## Run Modes

| Mode | When | Loop driver |
|---|---|---|
| **Windowed** | `--rpc` unset, no `--headless` | `winit` event loop drives ticks at vsync. |
| **Headless paced** | `--headless --speed 1.0` | Sleep to maintain `tickRate`; mirrors windowed timing. |
| **Headless uncapped** | `--headless --speed 0.0` (default) | Run as fast as possible; tick when previous returns. |
| **Headless stepped** | `--headless --rpc=stdio` w/o `sim.resume` | No auto-advance. Engine ticks only on `sim.advance` / `system.tickStep`. |
| **Replay** | `--replay PATH` | Inputs come from log; loop driven by recorded dt. Drift triggers `-32010 DETERMINISM_BROKEN`. |

The stepped mode is the canonical agent debug mode. The engine boots, performs `initialize`, then sits idle. The agent decides when time advances.

## Tick Model

```
       wall clock ──►
       │
       ▼
┌──────────────────┐
│  tick N          │
│  ┌────────────┐  │
│  │ Input      │  │  ◄── agent.input, recorded log, or empty
│  │ FixedSim   │  │  ◄── physics fixed-step, deterministic
│  │ Update     │  │  ◄── ECS systems (game logic, scripts)
│  │ LateUpdate │  │  ◄── transform propagation, animation final
│  │ Render*    │  │  ◄── SKIPPED in --headless (no-op stub)
│  │ Telemetry  │  │  ◄── flush frame to subscribed agents
│  └────────────┘  │
└──────────────────┘
       │
       ▼  (pace via --speed, or immediately if uncapped)
   tick N+1
```

`FixedSim` runs at a fixed substep (e.g. 120 Hz physics inside a 60 Hz tick); `Update` runs once per tick. → `docs/specs/core/ecs.md` for schedule definitions [AGENT: 02].

## Speed Multiplier

`--speed M` and `sim.setSpeed { multiplier: M }` control wall-clock pacing:

| `M` | Behavior |
|---|---|
| `0.0` | Uncapped. Next tick fires when prior returns. CI / batch scenarios. |
| `0.1` | Slow-motion. Wall sleep of `(1/tickRate - dt) × (1/0.1)`. |
| `1.0` | Real time. Equivalent to windowed pacing. |
| `10.0` | 10× speed. Useful for long sim runs (e.g. NPC training). |
| `100.0` | Max documented multiplier. Engine still enforces frame budget. |

Determinism is preserved: tick `dt` passed to systems is always `1/tickRate` regardless of `M`. Only wall-clock pacing changes. (→ AI-First Mandate law 5)

## Frame Budget

```
budget_ms = --frame-budget-ms (default 1000 / tickRate)

if tick_duration > budget_ms:
    telemetry.frame.budgetExceeded = true
    warn(structured)
    if exceeded 10 consecutive ticks:
        emit notifications/log.budget_violation
        if --strict-budget: exit(137)
```

The watchdog runs in a separate thread monitoring `Sim::current_tick_started_at`. Headless mode does not relax the budget — a CI run that exceeds budget is a regression.

## Headless Renderer Behavior

When `--headless`:

- `wgpu` instance is **not** created.
- `Renderer` registers as a no-op system that publishes empty telemetry under the `render` topic.
- Asset textures still decompress to CPU memory if requested (for compute / agent inspection).
- Shader hot reload still validates (parses + cross-compiles to SPIR-V) but never uploads.
- Calls that require a GPU (e.g. `entity.spawn` with `ImageProbe`) return `-32004 CAPABILITY_DENIED` with `data.code = "GPU_REQUIRED"`.

→ Contract: `docs/contracts/core-renderer.md` defines the `RendererBackend::Null` impl [AGENT: 14].

## Headless Audio Behavior

CPAL device is not opened. The audio mixer still runs in software, producing samples to a discard buffer (so DSP timing is identical) or to a WAV file when `--record-audio PATH` is set. → `docs/specs/audio/overview.md` [AGENT: 06].

## Determinism

Headless mode is the determinism reference. Two runs with identical:

- engine version
- `--seed`
- `--scene`
- input log
- enabled systems

MUST produce byte-identical:

- final ECS state (snapshot bytes)
- telemetry log
- recorded input log

This is verified by `nexus determinism-check` (→ `sdk.md`). Any deviation is a bug.

→ Physics determinism: `docs/specs/physics/determinism.md` [AGENT: 05]
→ Network rollback shares this guarantee: `docs/specs/networking/rollback.md` [AGENT: 07]

## RPC Interaction

In `--headless --rpc=stdio` the loop integrates with the RPC server:

```
┌────────────────────────────────────────────────┐
│  Main thread:                                  │
│    loop {                                      │
│       rpc.drain_inbox(deadline = next_tick);   │
│       if sim.is_running() {                    │
│         tick();                                │
│         telemetry.flush();                     │
│       }                                        │
│       rpc.drain_outbox();                      │
│    }                                           │
│                                                │
│  RPC I/O thread:                               │
│    reads framed JSON-RPC from transport,       │
│    parses, enqueues to inbox;                  │
│    drains outbox, writes framed responses.     │
└────────────────────────────────────────────────┘
```

The main thread NEVER blocks on the agent. `drain_inbox` has a hard deadline of the next tick boundary; any unhandled request waits one more tick.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Boot to `initialize` reply | < 100 ms | < 500 ms |
| Headless tick overhead vs windowed (no GPU work) | 0% | < 2% |
| Stepped mode `sim.advance(1)` overhead | < 0.1 ms above tick cost | < 0.5 ms |
| Speed `100×` correctness | identical state vs `1×` | byte-identical |
| RPC drain budget per tick | < 5% of frame budget | < 10% |

## Test Requirements

- `nexus run --headless --max-ticks 600 --scene smoke.scn` exits 0 in < 10 s.
- `--seed 42` twice → identical final snapshot bytes.
- `--speed 0.0` with empty scene → ≥ 100k ticks/sec [BENCHMARK NEEDED].
- `sim.advance { ticks: 1000 }` advances exactly 1000 ticks, returns `ticksAdvanced: 1000`.
- Headless + windowed run of the same scenario → identical telemetry stream (ignoring `render` topic).
- Killing the agent process during `sim.advance` causes engine to exit 4 within 1 s.

## Cross-references

- → `docs/specs/agent/api.md` — `sim.*` and `system.*` methods
- → `docs/specs/agent/telemetry.md` — what gets emitted per tick
- → `docs/specs/agent/replay.md` — `--record` / `--replay` semantics
- → `docs/specs/agent/scenarios.md` — `--scenario` mode
- → `docs/specs/core/ecs.md` — schedule definitions [AGENT: 02]
- → `docs/specs/core/hal.md` — clock source [AGENT: 02]
- → `docs/specs/physics/determinism.md` — fixed step [AGENT: 05]

## Prior Art

- Bevy `ScheduleRunnerPlugin::run_loop(Duration)` ✓ — proves a real engine runs windowless with a custom tick rate. We adopt the pattern at the schedule level.
- Godot `--headless --script` ✓ — proves an editor-class engine in CI. We go further: stepped mode + RPC.
- Unity batch mode `-batchmode -nographics` ✓ — but only one-shot. We are persistent + interactive.
- GGPO save-state-and-resimulate ✓ — same determinism contract we enforce on every run.
- Dedicated game servers (CS:GO, Valheim) ✓ — headless authoritative sim is mainstream; we standardize it.

## Open Questions

- [DECISION NEEDED] Should `--headless` allow an offscreen wgpu context (for screenshot tests)? If yes, separate flag `--headless --offscreen-render`. Coordinate with [AGENT: 03].
- [BENCHMARK NEEDED] Max sustainable `--speed` with a 1000-entity scene before the budget watchdog trips.
- [DECISION NEEDED] Whether to support `SIGUSR1` for snapshot capture (Unix convention) in addition to RPC `snapshot.capture`.
