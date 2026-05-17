<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-fps

> Proves the renderer, physics, and netcode can sustain competitive-FPS frame times under combat load on commodity hardware.

## Pitch

Arena FPS in the lineage of Quake III Arena and Diabotical. Six-player free-for-all on a single symmetrical map. Strafe-jump movement, hitscan rail + projectile rocket, instant respawn, weapon-pickup economy. No progression, no metagame — every match a clean slate. Round timer: 10 minutes. The point is not the game design; the point is to prove Nexus can render 6 players slinging rockets at 144 fps with sub-30ms rollback netcode while a CI scenario replays the same demo bit-for-bit forever.

## Systems Exercised

| System | Spec | Role in demo |
|--------|------|--------------|
| ECS | → `docs/specs/core/ecs.md` | Players, projectiles, pickups, audio sources |
| Math | → `docs/specs/core/math.md` | Strafe-jump kinematics, hitscan rays |
| Jobs | → `docs/specs/core/jobs.md` | Parallel projectile sim, audio mixdown |
| Renderer (PBR or hybrid) | → `docs/specs/renderer/pbr.md` | Map + weapons + FX at 144 Hz |
| Shadows | → `docs/specs/renderer/shadows.md` | CSM at high frame rate |
| Particles | → `docs/specs/renderer/particles.md` | Rocket trails, explosions, blood |
| Post-FX | → `docs/specs/renderer/post.md` | TAA, motion blur (toggleable), bloom |
| Character controller | → `docs/specs/physics/character.md` | Strafe-jump movement, slope sliding |
| Collision | → `docs/specs/physics/collision.md` | Hitscan + projectile vs map vs player |
| Determinism | → `docs/specs/physics/determinism.md` | Fixed-point sim for rollback |
| Spatial audio | → `docs/specs/audio/spatial.md` | Gunshots, footsteps, rocket whoosh |
| Rollback netcode | → `docs/specs/networking/rollback.md` | 6-player rollback at ≤8 frames |
| Transport | → `docs/specs/networking/transport.md` | UDP/QUIC reliability layer |
| Anticheat | → `docs/specs/networking/anticheat.md` | Server-side hit validation |
| Lua scripting | → `docs/specs/scripting/lua.md` | Game mode (FFA/TDM), pickup logic |
| Asset streaming | → `docs/specs/assets/streaming.md` | Map + weapon meshes + audio |
| Agent API | → `docs/specs/agent/api.md` | Headless bot players |
| Telemetry | → `docs/specs/agent/telemetry.md` | Frame, net, hit telemetry |
| Scenarios | → `docs/specs/agent/scenarios.md` | Regression scenarios |
| Replay | → `docs/specs/agent/replay.md` | Match recording / bisect |

Genre module: → `docs/specs/genres/fps.md`.

## Definition of Done

- [ ] 6-player FFA match playable end to end on Linux, Windows, macOS, Web (WASM)
- [ ] Strafe-jump movement reproduces Q3-style "magic number" feel at 125 / 144 / 333 Hz fixed-step (Quake-engine physics quirk acknowledged and made explicit, not accidental)
- [ ] Hitscan rail + projectile rocket both server-validated; client prediction within tolerance
- [ ] Rollback netcode tolerates 100 ms RTT and 5 % packet loss without visible warp
- [ ] All perf targets met on respective hardware band (table below)
- [ ] Scenario suite (below) passes 100 consecutive runs with bit-identical telemetry hashes
- [ ] Headless 6-bot match for 10 000 frames < 90 s wall clock
- [ ] Zero unsafe blocks in demo crate (engine-internal unsafe allowed per → `docs/architecture/01-principles.md`)
- [ ] One-line tutorial overlay; otherwise pick-up-and-play
- [ ] Source < 5 kLOC; reads as a tutorial

## Performance Targets

| Platform | Resolution | FPS target | Frame-time budget | Net target |
|----------|-----------|------------|-------------------|-----------|
| Mid (RX 580 / GTX 1660) | 1080p | 144 | 6.94 ms | 6 players, 50 ms RTT, 0 % loss |
| High (RTX 3070+) | 1440p | 240 | 4.16 ms | 6 players, 100 ms RTT, 5 % loss |
| Low (iGPU) | 720p low | 60 | 16.66 ms | 6 players, 50 ms RTT |
| Web (WASM, WebGPU) | 1080p medium | 90 | 11.11 ms | 6 players, 100 ms RTT |
| Headless (CI, null renderer) | n/a | sim-only | < 2 ms sim step | bot vs bot |

All numbers `[BENCHMARK NEEDED]` — bands listed are targets, not measurements. Confirmation gated on renderer + physics landing.

Hard limits (regression auto-blocks merge): any frame > 2× budget on its band, p99 sim step > 5 ms, p99 net rollback rewind > 8 frames.

## Scenario Tests

Lives at `games/nexus-fps/scenarios/`. Excerpts (referencing → `docs/specs/agent/scenarios.md`):

```toml
# scenarios/strafe-jump-determinism.toml
[scenario]
name = "strafe-jump determinism at 125 Hz"
demo = "nexus-fps"
seed = 0xDEADBEEF
fixed_step_hz = 125
frames = 10000
headless = true

[input]
script = "scripts/strafe-jump-loop.lua"   # one bot, scripted strafe-jump

[assert]
"telemetry.player[0].pos.hash@frame=10000" = "<pinned>"
"telemetry.frame_time_ms.p99"              = { lt = 2.0 }
"telemetry.sim_step_ms.p99"                = { lt = 5.0 }
```

```toml
# scenarios/6-bot-ffa.toml
[scenario]
name = "6-bot FFA, 10k frames, rollback under loss"
demo = "nexus-fps"
seed = 0xCAFEBABE
fixed_step_hz = 60
frames = 10000
bots = 6
headless = true

[network]
simulated_rtt_ms = 100
simulated_loss_pct = 5

[assert]
"telemetry.net.rollback_frames.p99"   = { lt = 8 }
"telemetry.net.desync_count"          = 0
"telemetry.frame_time_ms.p99"         = { lt = 7.0 }
"telemetry.memory.peak_mb"            = { lt = 1024 }
```

```toml
# scenarios/rocket-jump-physics.toml
[scenario]
name = "rocket jump arc matches reference"
demo = "nexus-fps"
seed = 1
frames = 600

[assert]
"telemetry.player[0].max_height@event=rocket_jump" = { eq = "<pinned>", tolerance = 0.001 }
```

Telemetry hash pins regenerated only via explicit `nexus scenarios bless <name>`.

## Asset List

| Category | Items | Source |
|----------|-------|--------|
| Map | 1 symmetrical arena (Q3DM17-ish) | AI-gen (Meshy) blockout → Poly Haven PBR textures |
| Weapons | Rail + rocket launcher (FP + WP meshes) | Kenney (placeholder) → AI-gen final |
| Characters | 2 player models, rigged | AI-gen (Meshy / Scenario), MIT terms verified |
| VFX | Muzzle flash, rocket trail, explosion, blood | Engine particle system, hand-authored |
| Audio | Footsteps, gunshots, ambient, voice grunts | Freesound CC0 + AI-gen via → `docs/specs/assets/generation.md` |
| HUD | Crosshairs, ammo, score | Kenney UI pack |
| Skybox | 1 HDRI | Poly Haven |

All assets re-importable via `nexus assets reimport` — no binary blobs in source tree.

## Multiplayer Spec

| Property | Value | Reference |
|---------|-------|-----------|
| Topology | Authoritative server (relay optional) | → `docs/specs/networking/overview.md` |
| Netcode | Rollback, GGPO-inspired | → `docs/specs/networking/rollback.md` |
| Max players | 6 (demo cap; engine supports more) | — |
| Tickrate | 60 Hz sim, 60 Hz net | matches fixed step |
| Input delay | 2 frames default, configurable | rollback budget |
| Anticheat | Server-validated hits, sanitized input | → `docs/specs/networking/anticheat.md` |
| Matchmaking | None — direct connect + LAN discovery for the demo | lobby spec deferred |
| Replay | Server records inputs + initial seed only | → `docs/specs/agent/replay.md` |

## Open Questions

- `[DECISION NEEDED]` Embrace the Q3 framerate-dependent physics quirk explicitly (offer 125 / 144 / 333 modes) or normalize via fixed timestep only? Quirk has speedrunner appeal but is a footgun.
- `[DECISION NEEDED]` Bot AI implementation language — Lua (hot-reloadable, slower) or Rust (faster, rebuild)? Bots are also the scenario drivers.
- `[DECISION NEEDED]` TAA at 144 Hz vs FXAA — TAA quality wins, but motion clarity matters in arena FPS.
- `[DECISION NEEDED]` Web build: WebGPU only (modern browsers), or WebGL2 fallback?
- `[BENCHMARK NEEDED]` All fps numbers above pending renderer + physics landing.
- `[BENCHMARK NEEDED]` Headless sim ceiling — how many simultaneous matches per CI runner?

## Cross-Agent Flags

- `[AGENT: 03]` Renderer must hit 144 Hz on Mid band with PBR + CSM + bloom + TAA — confirm feasibility.
- `[AGENT: 05]` Character controller must support Q3-style strafe-jump kinematics; confirm deterministic across platforms.
- `[AGENT: 07]` Rollback netcode 6-player with 100 ms RTT + 5 % loss is the upper-bound test of `docs/specs/networking/rollback.md`.
- `[AGENT: 10]` Scenario TOML schema above must match — coordinate field names.
- `[AGENT: 12]` `docs/specs/genres/fps.md` must expose the surfaces used here (weapons, ballistics, hit detection, ADS-less hipfire).
