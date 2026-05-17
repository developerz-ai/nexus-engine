<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-rpg

> Proves Nexus can stream a contiguous open world with NPC AI, dialogue, inventory, and save/load — the spine of every action RPG.

## Pitch

Single-player open-world action RPG in the lineage of Skyrim and Outer Wilds. One 4 km² island. Player wakes on the beach, no exposition. ~30 NPCs scattered across one village + three points of interest, each with branching dialogue and a stake in one of three interlocking quests. Real-time combat with melee + ranged + one magic school. Inventory, equipment, durability, crafting at one workbench. Day/night + weather. The point is not the story; the point is to prove streaming, AI, dialogue, inventory, audio, and save/load all integrate without seams.

## Systems Exercised

| System | Spec | Role in demo |
|--------|------|--------------|
| ECS | → `docs/specs/core/ecs.md` | NPCs, items, world entities, quests |
| Jobs | → `docs/specs/core/jobs.md` | World streaming, AI think jobs |
| Renderer PBR | → `docs/specs/renderer/pbr.md` | Outdoor PBR + foliage |
| GI | → `docs/specs/renderer/gi.md` | Dynamic time-of-day lighting |
| Shadows | → `docs/specs/renderer/shadows.md` | CSM + indoor shadows |
| Terrain | → `docs/specs/renderer/terrain.md` | Streamed virtual terrain |
| Post-FX | → `docs/specs/renderer/post.md` | Bloom, color grading, weather |
| Character controller | → `docs/specs/physics/character.md` | Player + humanoid NPC locomotion |
| Collision | → `docs/specs/physics/collision.md` | World, props, combat |
| Spatial audio | → `docs/specs/audio/spatial.md` | NPC voices, ambience, footsteps |
| Adaptive music | → `docs/specs/audio/adaptive.md` | Exploration / combat / village layers |
| Streaming audio | → `docs/specs/audio/streaming.md` | Voice barks, music stems |
| Asset streaming | → `docs/specs/assets/streaming.md` | Open-world LODs, audio, dialogue |
| LOD | → `docs/specs/assets/lod.md` | Distant terrain + meshes |
| Lua scripting | → `docs/specs/scripting/lua.md` | Quest logic, NPC schedules, dialogue |
| Hot reload | → `docs/specs/scripting/hotreload.md` | Tune dialogue/quests live |
| Save/load | (RPG genre) → `docs/specs/genres/rpg.md` | Full deterministic serialization |
| Semantic agent API | → `docs/specs/agent/semantic.md` | `spawn("bandit near village")` for designers/agents |
| Telemetry | → `docs/specs/agent/telemetry.md` | Streaming, AI, memory telemetry |
| Scenarios | → `docs/specs/agent/scenarios.md` | World traversal regression |
| Replay | → `docs/specs/agent/replay.md` | Bisect quest-state bugs |

Genre module: → `docs/specs/genres/rpg.md`. Also touches → `docs/specs/genres/openworld.md`.

## Definition of Done

- [ ] Player can walk the full 4 km² without a loading screen
- [ ] All 3 quests completable; main quest reaches credits in < 90 min for a directed playthrough
- [ ] ≥30 NPCs with daily schedules (work → eat → sleep), driven by Lua scripts
- [ ] Inventory with ≥40 items, equipment slots, durability, drop/pickup, stack semantics
- [ ] One craftable item per material tier; recipe data declarative (TOML)
- [ ] Branching dialogue tree with ≥3 outcomes per major NPC
- [ ] Save anywhere; load restores world bit-identical (full deterministic serialization)
- [ ] Day/night cycle (full cycle = 30 min real time, configurable) with weather (clear, rain, fog)
- [ ] Adaptive music transitions exploration ↔ combat without audible cut
- [ ] Headless 60-minute scripted playthrough as a scenario test
- [ ] Perf targets met on respective hardware band
- [ ] Replay file reproduces final world state across 100 runs

## Performance Targets

| Platform | Resolution | FPS target | Frame-time budget | Memory budget |
|----------|-----------|------------|-------------------|---------------|
| Mid (GTX 1660 / RX 580) | 1080p medium | 60 | 16.66 ms | 4 GB RAM, 3 GB VRAM |
| High (RTX 3070+) | 1440p high | 90 | 11.11 ms | 6 GB RAM, 5 GB VRAM |
| Low (iGPU) | 720p low | 30 | 33.33 ms | 3 GB RAM, 2 GB VRAM |
| Web (WASM, WebGPU) | 1080p low | 30 | 33.33 ms | 2 GB total |
| Headless (CI) | n/a | sim only | < 4 ms sim step | < 1.5 GB |

Streaming budget: a 5 m/s player must never trigger > 5 ms of mainthread work for any single streaming event. Cell-load latency p99 < 16 ms (target). All numbers `[BENCHMARK NEEDED]`.

## Scenario Tests

Lives at `games/nexus-rpg/scenarios/`. Excerpts (→ `docs/specs/agent/scenarios.md`):

```toml
# scenarios/world-traversal.toml
[scenario]
name = "circumnavigate island at sprint speed"
demo = "nexus-rpg"
seed = 0xA11CE
frames = 36000   # 10 min @ 60 Hz
headless = true

[input]
script = "scripts/walk-perimeter.lua"

[assert]
"telemetry.streaming.cell_load_ms.p99"  = { lt = 16.0 }
"telemetry.streaming.hitches"           = 0
"telemetry.memory.peak_mb"              = { lt = 4096 }
"telemetry.frame_time_ms.p99"           = { lt = 18.0 }
```

```toml
# scenarios/quest-main-deterministic.toml
[scenario]
name = "main quest scripted playthrough hashes to known state"
demo = "nexus-rpg"
seed = 42
script = "scripts/main-quest-speedrun.lua"
headless = true

[assert]
"telemetry.world.hash@event=credits_roll" = "<pinned>"
"telemetry.quest.completed_count"         = 3
"telemetry.save.roundtrip_diff"           = 0
```

```toml
# scenarios/save-load-roundtrip.toml
[scenario]
name = "save mid-combat, load, identical state"
demo = "nexus-rpg"
seed = 7
script = "scripts/fight-then-save.lua"

[assert]
"telemetry.serialization.bytes_per_frame.p99" = { lt = 100_000 }
"telemetry.save.load_state_diff"              = 0
```

## Asset List

| Category | Items | Source |
|----------|-------|--------|
| Terrain heightmap | 1 island (4 km²) | AI-gen via World Machine-equivalent → hand-tweaked |
| Foliage | ~10 species (trees, shrubs, grass) | Poly Haven + Kenney Nature kit |
| Buildings | ~12 unique structures | Kenney medieval kit → AI-gen variation |
| Characters | 1 player + ~10 unique NPC bodies + outfit variants | AI-gen (Meshy / Scenario) |
| Animations | locomotion, combat, idle, schedule activities | Mixamo (CC) + AI-gen retarget |
| Props | ~80 (weapons, containers, food, books, tools) | Kenney + Poly Haven |
| Audio | ~200 voice barks, 5 music stems, 50 SFX, ambient beds | AI-gen voices (TTS, MIT-compatible) + Freesound CC0 |
| HDRIs | 4 (dawn, noon, dusk, night) | Poly Haven |
| Dialogue text | ~300 lines | Hand-authored or AI-drafted, MIT |

## Multiplayer Spec

Single-player. Coop spec is out of scope for the demo. The save format and ECS topology MUST be designed such that adding peer-replicated coop later is a non-breaking change (→ `docs/specs/networking/replication.md`). `[DECISION NEEDED]` whether a stretch "shared world coop" mode is added once the engine stabilizes.

## Open Questions

- `[DECISION NEEDED]` Combat camera — first-person, third-person, or both? Affects character controller + animation pipeline.
- `[DECISION NEEDED]` Dialogue UI — classic branching menu, radial wheel, or skill-check (Disco Elysium style)? Stresses different UI subsystems.
- `[DECISION NEEDED]` AI driver — pure Lua behavior trees, GOAP, or utility AI? Genre spec must pick one.
- `[DECISION NEEDED]` Voice acting: AI-TTS in shipped build, or barks only with text-only dialogue? Licensing matters.
- `[DECISION NEEDED]` World size — 4 km² is the target; could be reduced to 2 km² if streaming budget slips.
- `[BENCHMARK NEEDED]` All fps + streaming numbers pending renderer + asset pipeline.
- `[BENCHMARK NEEDED]` Save file size budget and serialization throughput.

## Cross-Agent Flags

- `[AGENT: 03]` Terrain virtualization (→ `docs/specs/renderer/terrain.md`) must support 4 km² streaming.
- `[AGENT: 06]` Adaptive music transitions are the primary test of `docs/specs/audio/adaptive.md`.
- `[AGENT: 08]` Lua hot reload must work for quest scripts mid-session, no state loss.
- `[AGENT: 09]` Streaming priority queue is the upper-bound test of `docs/specs/assets/streaming.md`.
- `[AGENT: 10]` `engine.spawn("bandit near village")` semantic API is exercised here first.
- `[AGENT: 12]` `docs/specs/genres/rpg.md` must declare full save/load contract; demo depends on it.
- `[AGENT: 14]` Save/load contract spans core ↔ scripting ↔ assets; needs explicit contract doc.
