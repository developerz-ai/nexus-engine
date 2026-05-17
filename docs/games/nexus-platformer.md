<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-platformer

> Proves Nexus's input pipeline, fixed-step physics, and 2D renderer are tight enough for frame-perfect speedrunning — the highest bar a platformer can set.

## Pitch

2D precision platformer in the lineage of Celeste, Hollow Knight, and Super Meat Boy. Ten hand-authored levels, single character with run + variable-height jump + dash + wall-jump + wall-slide. Death is instant and instant-respawn. Per-level timer; gold/silver/bronze times. Total game length: ~30 minutes for a casual player, ~3 minutes for a speedrunner. The point is not the level design; the point is to prove that input → physics → render → display latency is consistently under 32 ms, that coyote time / jump buffering / corner correction behave identically on every platform, and that deterministic replays of speedruns survive engine version bumps.

## Systems Exercised

| System | Spec | Role in demo |
|--------|------|--------------|
| ECS | → `docs/specs/core/ecs.md` | Player, hazards, collectibles, triggers |
| Math | → `docs/specs/core/math.md` | 2D kinematics, fixed-point option |
| HAL (input) | → `docs/specs/core/hal.md` | Sub-frame input timestamping |
| Events | → `docs/specs/core/events.md` | Death, checkpoint, collect events |
| Renderer 2D | → `docs/specs/styles/2d.md` | Sprite batching, tilemap, parallax |
| Pixel-art style | → `docs/specs/styles/pixel.md` | Optional pixel-art render path |
| Post-FX | → `docs/specs/renderer/post.md` | Optional CRT/scanline filter |
| Particles | → `docs/specs/renderer/particles.md` | Dash trail, death burst, dust |
| Character controller (2D) | → `docs/specs/physics/character.md` | Tight axis-aligned controller, NOT rigidbody |
| Collision (AABB) | → `docs/specs/physics/collision.md` | Swept AABB vs tilemap |
| Determinism | → `docs/specs/physics/determinism.md` | Frame-perfect determinism for replays |
| Spatial audio (2D pan) | → `docs/specs/audio/spatial.md` | Stereo pan from screen-space |
| Adaptive music | → `docs/specs/audio/adaptive.md` | Per-level themes, level-clear sting |
| Lua scripting | → `docs/specs/scripting/lua.md` | Level scripts, trigger logic |
| Hot reload | → `docs/specs/scripting/hotreload.md` | Live-tune level scripts during play |
| Asset registry | → `docs/specs/assets/registry.md` | Sprites + tilemaps |
| Agent API | → `docs/specs/agent/api.md` | TAS bot drives every scenario |
| Telemetry | → `docs/specs/agent/telemetry.md` | Input-to-photon latency telemetry |
| Scenarios | → `docs/specs/agent/scenarios.md` | TAS-replay regression |
| Replay | → `docs/specs/agent/replay.md` | Speedrun ghost replays |

Genre module: → `docs/specs/genres/platformer.md`.

## Definition of Done

- [ ] 10 distinct levels, each completable; gold-time TAS exists for each
- [ ] Player controller exposes ALL of: coyote time (default 5 frames), jump buffering (default 6 frames), variable jump height, wall jump, wall slide, ground dash, air dash (1 charge, refilled on land), corner correction (1 pixel)
- [ ] Fixed simulation step (60 Hz mandatory, 120 Hz optional)
- [ ] Input → photon latency p99 < 32 ms (≈ 2 frames) on Mid hardware at 60 Hz
- [ ] Deterministic replay: ghost runs reproduce frame-perfect across all platforms and engine versions within a major
- [ ] Headless TAS for all 10 levels runs in CI in < 60 s wall clock total
- [ ] 100 consecutive headless runs → bit-identical telemetry hash per level
- [ ] Gamepad + keyboard + touch (mobile) input parity for the controller
- [ ] All perf targets met
- [ ] Source < 3 kLOC; canonical reference for "small Nexus game"

## Performance Targets

| Platform | Resolution | FPS target | Frame-time budget | Input → photon p99 |
|----------|-----------|------------|-------------------|--------------------|
| Low (iGPU, integrated) | 1080p | 60 | 16.66 ms | < 50 ms |
| Mid (GTX 1660 / RX 580) | 1080p | 144 | 6.94 ms | < 32 ms |
| High (RTX 3070+) | 1440p | 240 | 4.16 ms | < 20 ms |
| Web (WASM, WebGPU) | 1080p | 60 | 16.66 ms | < 50 ms |
| Mobile (mid-tier Android, iOS) | native | 60 | 16.66 ms | < 50 ms |
| Headless (CI) | n/a | sim only | < 0.5 ms sim step | n/a |

Hard limits: any sim step > 1 ms = regression. Any input-to-photon p99 > 1.5× budget = regression. All `[BENCHMARK NEEDED]`.

## Scenario Tests

Lives at `games/nexus-platformer/scenarios/`. Excerpts (→ `docs/specs/agent/scenarios.md`):

```toml
# scenarios/coyote-time-window.toml
[scenario]
name = "coyote time is exactly 5 frames at 60 Hz"
demo = "nexus-platformer"
seed = 0
fixed_step_hz = 60
frames = 600

[input]
# script presses jump 5 frames after walking off ledge, then 6 frames after
script = "scripts/coyote-edge-cases.lua"

[assert]
"telemetry.player.jump_count@input=at_5_frames" = 1
"telemetry.player.jump_count@input=at_6_frames" = 0
```

```toml
# scenarios/tas-all-levels.toml
[scenario]
name = "TAS clears all 10 levels at pinned gold times"
demo = "nexus-platformer"
seed = 0
fixed_step_hz = 60
headless = true

[input]
replay = "fixtures/tas-gold-runs.replay"

[assert]
"telemetry.level[*].cleared"        = true
"telemetry.level[*].time_ms.hash"   = "<pinned>"
"telemetry.input.to_photon_ms.p99"  = { lt = 32.0 }
```

```toml
# scenarios/corner-correction.toml
[scenario]
name = "1px upward corner correction nudge fires"
demo = "nexus-platformer"
seed = 0
frames = 60
script = "scripts/jump-into-low-corner.lua"

[assert]
"telemetry.player.corner_correction_count" = 1
"telemetry.player.head_bump_count"         = 0
```

```toml
# scenarios/jump-buffer.toml
[scenario]
name = "jump buffer consumes input pressed 6 frames before landing"
demo = "nexus-platformer"
seed = 0
script = "scripts/jump-buffer-edges.lua"

[assert]
"telemetry.player.jump_count@input=press_6f_pre_land" = 1
"telemetry.player.jump_count@input=press_7f_pre_land" = 0
```

## Asset List

| Category | Items | Source |
|----------|-------|--------|
| Player sprite | 1 character, full anim set | Kenney pixel platformer pack OR AI-gen pixel |
| Tilesets | 3 themes (forest, cave, factory) | Kenney 1-bit / pixel platformer pack |
| Hazards | spikes, saws, lasers, crushers | Kenney + custom |
| Background parallax | 3 layers × 3 themes | Kenney background pack |
| VFX | dust, dash trail, death burst, level-clear | Hand-authored particles |
| Audio | jump, dash, death, collect, footstep | Freesound CC0 + sfxr-style gen |
| Music | 3 themes + clear sting | AI-gen (Suno / MusicGen, MIT-compatible) |
| Font | 1 pixel font | Kenney font pack |

All assets renderable in either pixel-perfect or smooth mode (style switch at boot).

## Multiplayer Spec

Single-player. A stretch "ghost race" mode (your replay vs a friend's replay overlaid) is feasible because replays are bit-identical; this is `[DECISION NEEDED]` and only depends on a tiny UI layer + replay subscription. No actual netcode required.

## Open Questions

- `[DECISION NEEDED]` Fixed-point physics: required for cross-platform determinism, or is f64 with strict ordering enough? Affects → `docs/specs/physics/determinism.md` scope.
- `[DECISION NEEDED]` Coyote-time, jump-buffer, corner-correction default values — pin Celeste's (5 / 6 / 1) or document as tunables only?
- `[DECISION NEEDED]` Render the sim at 60 Hz fixed and interpolate to display Hz, or render at display Hz and lerp input? Former is the Celeste/Meat Boy choice and easier to reason about.
- `[DECISION NEEDED]` Pixel-perfect mode mandatory or optional? Affects camera + renderer for the demo.
- `[DECISION NEEDED]` Touch controls for mobile: virtual stick, swipe-based, or both? Stresses → `docs/specs/core/hal.md`.
- `[BENCHMARK NEEDED]` Input-to-photon latency targets pending input + render pipeline measurement.

## Cross-Agent Flags

- `[AGENT: 02]` HAL input timestamping resolution must be ≤ 1 ms — confirm in `docs/specs/core/hal.md`.
- `[AGENT: 03]` 2D sprite batching and tilemap renderer must hit 240 Hz on High band — confirm.
- `[AGENT: 04]` Pixel-art style pipeline (→ `docs/specs/styles/pixel.md`) is the canonical test of the style system.
- `[AGENT: 05]` 2D character controller is a separate beast from 3D — `docs/specs/physics/character.md` must cover both or fork.
- `[AGENT: 10]` Replay determinism across engine versions within a major is a hard guarantee; speedrun community will notice instantly.
- `[AGENT: 12]` `docs/specs/genres/platformer.md` must declare the controller features list verbatim — this demo is the conformance suite.
