<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Sim-Game — Overview

> Games where the simulation IS the gameplay. Tick-rate decoupled from frame-rate. Deterministic replay. Sim runs headless on the server; client is presentation only. Factorio, Dwarf Fortress, RimWorld, OpenTTD.

## Boundaries

- Owns: tick-rate / frame-rate decoupling, fixed-tick scheduler, deterministic tick contract, headless-server bootstrap, sim-client split convention, snapshot-then-stream replication, replay-from-input-log primitive.
- Does NOT own: rendering (client-only; → `docs/specs/renderer/overview.md`), input capture (→ `docs/specs/core/hal.md`), VM (→ `docs/specs/scripting/overview.md`), networking transport (→ `docs/specs/networking/transport.md`).
- Depends on: `nexus-core/ecs`, `nexus-net/replication`, `nexus-agent/replay`, `nexus-physics/determinism`.

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-core/ecs` | tick-driven system schedule |
| `nexus-net/replication` | snapshot-then-delta server→client |
| `nexus-agent/replay` | (world_seed) + (input log) replay |
| `nexus-physics/determinism` | fixed-step deterministic physics |
| `nexus-scripting` | mod/recipe sim logic |
| `nexus-procgen-seeded-rng` | deterministic generation |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-sim-tick-decoupled` | `sim` (new) | fixed-tick scheduler, interpolation-for-render |
| `nexus-sim-headless-server` | `sim` | bootstrap with no GPU, audio, or input |
| `nexus-sim-replay` | `sim` | input-log codec + replay validator |

## Architecture

```
Tick / frame decoupling

  Frame loop (variable, target 60–144 Hz)             Sim loop (fixed, e.g., 20 Hz)
  ─────────────────────────────────                  ─────────────────────────────
  while running:                                     spawn thread / task:
    dt = now - last_frame                              while running:
    accumulator += dt                                    sim_world.tick()
                                                         input_log.append(tick_inputs)
    while accumulator >= sim_dt:                         publish snapshot to render thread
      sim_world.tick()
      accumulator -= sim_dt

    alpha = accumulator / sim_dt
    render_world.interpolate(sim_world.prev, sim_world.now, alpha)
    render()

The render loop NEVER blocks the sim. The sim NEVER waits on render.

Client/server split for networked sim

  Server (headless)                          Client
  ──────────────────                          ───────
  - sim_world (authoritative)                 - render_world (presentation)
  - tick at 20 Hz                             - interpolate at 144 Hz
  - replicate state                           - send input commands
  - no GPU, no audio                          - apply server snapshots
  - replay-from-input                         - render predicted local state
```

## Public API

```toml
[sim_game]
tick_rate_hz       = 20          # default; can be 10 (DF) or 60 (Factorio)
interp_alpha_clamp = 1.5         # cap interpolation lag at 1.5 ticks
headless_supported = true
record_inputs      = true
snapshot_every_ticks = 600       # every 30 s at 20 Hz

[sim_game.server]
listen_port        = 7777
max_clients        = 32
snapshot_send_hz   = 10          # server sends snapshots half tick rate

[sim_game.replay]
log_format         = "delta+seed"  # "delta+seed" | "full-state"
log_compression    = "zstd"
```

```rust
pub struct SimGame { /* tick scheduler */ }

impl SimGame {
    pub fn new(tick_rate_hz: u32) -> Self;
    pub fn tick(&mut self) -> TickReport;
    pub fn snapshot(&self) -> Snapshot;
    pub fn restore(&mut self, snap: &Snapshot);
    pub fn record_input(&mut self, input: Input);
    pub fn replay_from(&mut self, log: &InputLog) -> ReplayReport;
    pub fn telemetry(&self) -> SimTelemetry;
}

pub struct SimTelemetry {
    pub current_tick: u64,
    pub tick_ms_p99: f32,
    pub interp_alpha: f32,
    pub snapshots_taken: u32,
    pub clients_connected: u32,
}
```

CLI:

```
nexus sim run --headless --port 7777
nexus sim replay <log.bin> --validate    # confirm replay matches recorded state
nexus sim bench --tps 20 --duration 60   # measure tick throughput
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Tick budget (per tick @ 20 Hz) | < 50 ms | 80 ms |
| Tick budget (per tick @ 60 Hz) | < 16.6 ms | 25 ms |
| Headless server CPU (32 clients, 20 Hz) | < 50% one core | 100% one core |
| Snapshot serialize (full state, 10k entities) | < 50 ms | 200 ms |
| Snapshot delta (typical) | < 4 KB | 64 KB |
| Replay validation (60 s log) | < 5× realtime | 30× realtime |
| Determinism: replay produces identical state hash | required | required |
| Client interp jitter (60 Hz render, 20 Hz sim) | < 1 frame perceptible | 2 frames |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SIM_E_TICK_OVERRUN` | Tick took > hard limit; sim falls behind | Reduce sim load or accept slowdown |
| `SIM_E_REPLAY_DESYNC` | Replay state diverges from recorded | Likely non-determinism crept in; audit RNG / floating-point |
| `SIM_E_HEADLESS_MISSING_API` | Code path needs GPU/audio in headless mode | Gate behind `cfg(not(headless))` or stub |
| `SIM_E_CLIENT_INPUT_REORDER` | Out-of-order client input | Buffer + reorder by tick; warn if persistent |
| `SIM_W_INTERP_CLAMPED` | Render interpolation lag > clamp | Network jitter; investigate |

## Integration Points

- **ECS**: schedule split into `sim_systems` (tick-driven) and `render_systems` (frame-driven). → `docs/specs/core/ecs.md`.
- **Net/replication**: server snapshots → clients; client commands → server. → `docs/specs/networking/replication.md`.
- **Physics/determinism**: fixed-step physics aligns with sim tick. → `docs/specs/physics/determinism.md`.
- **Agent/replay**: input log + seed = full replay; debugging tool. → `docs/specs/agent/replay.md`.
- **Scripting-first**: sim logic often script-driven (recipes, AI behaviors). → `docs/specs/scripting-first/overview.md`.
- **Procgen**: deterministic procgen integrates cleanly with deterministic sim. → `docs/specs/procgen-first/overview.md`.
- **Cellular automata**: CA sim can be the sim tick body. → `docs/specs/cellular-automata/overview.md`.

## Scenario test (starter)

`scenarios/sim-game-deterministic-replay.scenario.toml`:

```toml
[scene]
template = "sim-factory-basic"
[setup]
world_seed = 0x9E3779B97F4A7C15
[actions]
- { tick = 1,    action = "place", item = "assembler",    at = [0, 0] }
- { tick = 1,    action = "place", item = "iron-source",  at = [-2, 0] }
- { tick = 1,    action = "place", item = "belt",         at = [-1, 0] }
- { tick = 100,  action = "record_snapshot" }
- { tick = 1200, action = "record_snapshot" }
[asserts]
- { tick = 1200, predicate = "produced_items('iron-plate') > 100" }
- { tick = 1200, predicate = "tick_ms_p99 < 50.0" }
- { tick = 1200, predicate = "replay_from_log_matches_snapshot()" }
```

## Test Requirements

- Tick + frame decoupled: render at 144 Hz, sim at 20 Hz, no jitter on moving entities.
- Headless server: boot with `--headless`, no GPU/audio init, 32 clients connect, sim runs.
- Replay: record 60 s input log → replay produces identical final state hash.
- Snapshot size: 10k-entity factory snapshot ≤ 4 KB delta.
- 100 simultaneous clients on cloud baseline → snapshot send rate held.
- Save/load: sim state round-trips perfectly.

## Prior Art

- Factorio (Wube) — deterministic sim, headless server, replay system. [VERIFY — FFF "Determinism" posts URL].
- Dwarf Fortress (Bay 12) — sim-as-game, decades of procedural world simulation. [VERIFY — Tarn Adams interviews].
- RimWorld (Ludeon) — colony sim, replay-friendly. [VERIFY — Ludeon dev posts].
- OpenTTD — open-source transport tycoon, deterministic networked sim. https://www.openttd.org/.
- StarCraft (Blizzard) — lockstep deterministic sim. [VERIFY — Blizzard StarCraft tech].
- *Inspired by*: Glenn Fiedler, "Fix Your Timestep" — https://gafferongames.com/post/fix_your_timestep/.
- *Inspired by*: "1500 Archers on a 28.8" (Mark Terrano on Age of Empires netcode) — https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond.

## Open Questions

- `[DECISION NEEDED]` Default tick rate: 20 Hz (RTS / sim norm) vs 60 Hz (Factorio).
- `[DECISION NEEDED]` Replay log format: delta+seed (smaller, requires deterministic generators) vs full state (larger, robust to non-determinism).
- `[BENCHMARK NEEDED]` Headless server: clients-per-core under typical sim load (Factorio-like).
- `[DECISION NEEDED]` Client-side prediction: optional or required for sim games? Lean optional — many sims (Dwarf Fortress) don't need it.
- `[DECISION NEEDED]` Multithreaded sim tick: serial (deterministic-easy) vs parallel (faster, harder to keep deterministic).
