<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-rts

> Proves Nexus can simulate, path, and render 100+ controllable units per side with fog of war and a real economy at RTS-grade frame times.

## Pitch

Top-down RTS in the lineage of StarCraft, Age of Empires II, and 0 A.D. One 256×256 tile map. Two players (P vs P or P vs AI). Two resources: wood + stone. One worker, one melee unit, one ranged unit, two buildings (town center + barracks). 5-minute matches. Win condition: destroy enemy town center. The point is not strategic depth; the point is to prove the ECS can hold 200+ active entities, the pathfinder can resolve 100 simultaneous queries per frame, and fog of war + per-faction visibility cull correctly — all with deterministic lockstep so replays survive forever.

## Systems Exercised

| System | Spec | Role in demo |
|--------|------|--------------|
| ECS | → `docs/specs/core/ecs.md` | 200+ units, buildings, projectiles, resources |
| Jobs | → `docs/specs/core/jobs.md` | Parallel AI think, parallel pathing |
| Math | → `docs/specs/core/math.md` | Fixed-point sim arithmetic |
| Renderer (style-agnostic) | → `docs/specs/renderer/overview.md` | 200+ animated meshes, sprites optional |
| Shadows | → `docs/specs/renderer/shadows.md` | Top-down CSM, cheap mode |
| Particles | → `docs/specs/renderer/particles.md` | Combat FX, dust, smoke |
| Collision (BVH) | → `docs/specs/physics/collision.md` | Unit vs unit, projectile vs unit |
| Determinism | → `docs/specs/physics/determinism.md` | Lockstep deterministic sim |
| Spatial audio | → `docs/specs/audio/spatial.md` | Combat, building, ambient |
| Adaptive music | → `docs/specs/audio/adaptive.md` | Peace ↔ combat layers |
| Lockstep netcode | → `docs/specs/networking/replication.md` | 1v1 lockstep, input-only sync |
| Transport | → `docs/specs/networking/transport.md` | UDP/QUIC |
| Lua scripting | → `docs/specs/scripting/lua.md` | AI opponent, unit behaviors |
| Asset registry | → `docs/specs/assets/registry.md` | Shared unit/building models |
| Pathfinding (navmesh / flow-field) | → `docs/specs/genres/rts.md` | 100+ concurrent paths |
| Agent API | → `docs/specs/agent/api.md` | Scripted AI vs AI runs |
| Telemetry | → `docs/specs/agent/telemetry.md` | Sim, path, net telemetry |
| Scenarios | → `docs/specs/agent/scenarios.md` | 100-unit battles |
| Replay | → `docs/specs/agent/replay.md` | Input-log replay (tiny files) |

Genre module: → `docs/specs/genres/rts.md`.

## Definition of Done

- [ ] 1v1 match playable end to end (human vs human via LAN, or vs Lua-scripted AI)
- [ ] 200 simultaneous active units (100 per side) sustainable for full match
- [ ] Fog of war: per-faction visibility cull on GPU + on agent API (AI cannot read fog'd state)
- [ ] Two resources (wood + stone) with full economy loop: gather → deposit → spend → build/train
- [ ] Pathfinding handles 100 concurrent queries/frame with no visible stalls; group movement avoids clumping
- [ ] Lockstep determinism: input log of one match reproduces the same end state on Linux, Windows, macOS, Web
- [ ] Replay file < 1 MB for a 5-minute match (input-only)
- [ ] Headless AI-vs-AI match for full 5 minutes runs < 30 s wall clock at sim-only speed
- [ ] Selection box, hotkeys, build/train queue UI
- [ ] All perf targets met on respective band
- [ ] 100 consecutive deterministic runs → bit-identical end-state hash

## Performance Targets

| Platform | Resolution | FPS target | Frame-time budget | Sim load |
|----------|-----------|------------|-------------------|----------|
| Low (iGPU) | 1080p low | 60 | 16.66 ms | 200 units, 100 paths/frame |
| Mid (GTX 1660 / RX 580) | 1440p medium | 60 | 16.66 ms | 200 units |
| High (RTX 3070+) | 1440p high | 144 | 6.94 ms | 200 units |
| Web (WASM, WebGPU) | 1080p medium | 60 | 16.66 ms | 200 units |
| Headless (CI, sim only) | n/a | sim only | < 1 ms sim step at 200 units | full AI vs AI |

Hard limits: p99 sim step > 4 ms at 200 units = regression. p99 pathfinder query > 2 ms = regression. All `[BENCHMARK NEEDED]`.

## Scenario Tests

Lives at `games/nexus-rts/scenarios/`. Excerpts (→ `docs/specs/agent/scenarios.md`):

```toml
# scenarios/100v100-battle.toml
[scenario]
name = "100 vs 100 melee blob collision"
demo = "nexus-rts"
seed = 0xB00B5
fixed_step_hz = 30
frames = 600       # 20 s
headless = true

[setup]
script = "scripts/spawn-100v100.lua"

[assert]
"telemetry.sim_step_ms.p99"            = { lt = 4.0 }
"telemetry.path.queries_per_frame.max" = { lt = 200 }
"telemetry.path.query_ms.p99"          = { lt = 2.0 }
"telemetry.world.hash@frame=600"       = "<pinned>"
```

```toml
# scenarios/lockstep-determinism.toml
[scenario]
name = "lockstep match replays identically across platforms"
demo = "nexus-rts"
seed = 0xABCDEF
fixed_step_hz = 30
frames = 9000     # 5 min
headless = true
replay = "fixtures/ref-match.replay"

[assert]
"telemetry.world.hash@frame=9000" = "<pinned>"
"telemetry.net.desync_count"      = 0
```

```toml
# scenarios/fog-of-war-cull.toml
[scenario]
name = "agent API respects fog of war"
demo = "nexus-rts"
seed = 1
frames = 300

[assert]
"telemetry.agent.fog_leak_count" = 0    # agent never reads entity hidden by fog
```

## Asset List

| Category | Items | Source |
|----------|-------|--------|
| Terrain | 256×256 tile heightmap, 4 biomes blended | AI-gen + hand tweak |
| Tiles / decals | Grass, dirt, stone, water | Kenney Tiny Town / Poly Haven |
| Unit meshes | 1 worker, 1 melee, 1 ranged × 2 factions | Kenney mini-character kit → AI-gen retex |
| Buildings | Town center + barracks × 2 factions | Kenney medieval kit |
| Animations | walk, attack, gather, idle, death | Mixamo (CC) retargeted |
| FX | Sword swing, arrow, building dust, explosion | Engine particles |
| Audio | Unit acks, combat SFX, ambient, 3 music stems | AI-gen TTS for acks + Freesound CC0 |
| UI | Minimap, resource bar, command card | Kenney UI pack |

## Multiplayer Spec

| Property | Value | Reference |
|----------|-------|-----------|
| Topology | Peer-to-peer lockstep (input-sync) | → `docs/specs/networking/replication.md` |
| Tickrate | 30 Hz sim, 30 Hz net | classic RTS lockstep |
| Players | 2 (demo cap; engine supports more) | — |
| Determinism | Hard requirement; fixed-point sim | → `docs/specs/physics/determinism.md` |
| Input delay | 4 frames (133 ms at 30 Hz), configurable | conservative for global play |
| Replay | Input-only log, seed + version pinned | → `docs/specs/agent/replay.md` |
| Anticheat | Trust-but-verify: hash compare each frame | mismatch = match abort |
| Lobby | Direct connect + LAN discovery for demo | full lobby deferred |

## Open Questions

- `[DECISION NEEDED]` Pathfinder: navmesh (Recast-style), grid A*, or flow fields? Flow fields scale better to 100+ units but worse for tight maps.
- `[DECISION NEEDED]` Lockstep vs server-authoritative — lockstep is the canonical RTS choice but forbids any non-deterministic operation engine-wide; that constraint affects every other demo. Confirm.
- `[DECISION NEEDED]` Camera — strict top-down or angled (AoE-style)? Affects culling + audio.
- `[DECISION NEEDED]` AI opponent depth — scripted "easy / medium" or proper utility AI? Demo wants playable, not strong.
- `[BENCHMARK NEEDED]` All numbers pending pathfinder + ECS at 200 entities.
- `[BENCHMARK NEEDED]` Group movement collision (RVO-style avoidance) feasibility budget.

## Cross-Agent Flags

- `[AGENT: 02]` Fixed-point math option (`docs/specs/core/math.md`) is REQUIRED for lockstep — confirm scope.
- `[AGENT: 05]` Deterministic physics across platforms is the hardest constraint in the entire engine. RTS is the primary test.
- `[AGENT: 07]` Lockstep + desync detection lives in replication spec — confirm input-only sync supported.
- `[AGENT: 10]` Agent API MUST honor fog of war when called by faction-bound agents (security model).
- `[AGENT: 12]` `docs/specs/genres/rts.md` owns pathfinder + formation movement; demo depends on it being concrete.
- `[AGENT: 14]` Contract `core ↔ networking` must include the deterministic input ring buffer.
