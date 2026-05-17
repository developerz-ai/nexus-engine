<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Demo Games — Overview

> Demo games are not toys. They ARE the integration tests, the adoption demos, and the benchmark suite for Nexus Engine.

## Why Demo Games Exist

Three jobs, one artifact:

1. **Integration tests.** Unit tests prove a function works. Demo games prove the engine works. If `nexus-fps` does not boot at 144fps on commodity hardware, the engine is broken — regardless of what the unit suite says.
2. **Adoption demos.** A new developer cloning Nexus runs `nexus run --demo fps` and within 30 seconds sees a polished, playable game. No screenshots. No marketing. Just proof.
3. **Benchmark suite.** Each demo ships a deterministic benchmark scenario. CI runs them every PR. Regressions in frame time, memory, or load time block merge.

A unit test that passes while the demo regresses is a useless unit test.

## The Demo Roster

| Game | Genre | Primary purpose | Spec |
|------|-------|-----------------|------|
| `nexus-fps` | Arena FPS | Renderer + physics + netcode under load | [nexus-fps.md](nexus-fps.md) |
| `nexus-rpg` | Open-world action RPG | Streaming + AI + dialogue + save/load | [nexus-rpg.md](nexus-rpg.md) |
| `nexus-rts` | RTS | Entity scale + pathfinding + fog of war | [nexus-rts.md](nexus-rts.md) |
| `nexus-platformer` | 2D precision platformer | Deterministic physics + input fidelity | [nexus-platformer.md](nexus-platformer.md) |

Together they exercise every spec under `docs/specs/`. Any system not touched by a demo is an unproven system.

## Non-Negotiable Properties

Every demo MUST:

- **Run headlessly.** `nexus run --demo <name> --headless --frames N` produces telemetry. No display, no GPU required (renderer in null backend).
- **Be a scenario test.** A canonical `scenarios/<demo>.toml` runs in CI as a deterministic replay. See → `docs/specs/agent/scenarios.md`.
- **Emit telemetry every frame.** Structured JSON per → `docs/specs/agent/telemetry.md`. CI parses it.
- **Be snapshot/replay safe.** Bisectable regressions per → `docs/specs/agent/replay.md`.
- **Ship MIT.** Code, scripts, scenario files. Assets either MIT, CC0, or generated under MIT-compatible terms per → `docs/specs/assets/generation.md`.
- **Hit perf targets.** Each demo declares targets. CI enforces them. Targets unknown → `[BENCHMARK NEEDED]`.

## Asset Sourcing

Demos pull from three buckets, in priority order:

| Source | License | Use |
|--------|---------|-----|
| Kenney.nl | CC0 | Placeholder + final for stylized demos |
| Poly Haven | CC0 | PBR textures, HDRIs, hero props |
| AI generation (Meshy, Scenario, FLUX) | MIT-compatible terms | Hero characters, set dressing at scale |

No demo ships proprietary or restrictively-licensed assets. Ever.

→ `docs/specs/assets/generation.md`

## How CI Uses Them

```
PR opened
  ↓
unit tests pass
  ↓
nexus run --demo fps --headless --frames 10000 --scenario regression
nexus run --demo rpg --headless --frames 10000 --scenario regression
nexus run --demo rts --headless --frames  5000 --scenario regression
nexus run --demo platformer --headless --frames 10000 --scenario regression
  ↓
telemetry parsed → perf deltas vs main computed
  ↓
regression > tolerance → merge blocked, AI merge system files comment
```

The AI merge system (→ `docs/guides/merge-system.md`) treats demo regressions as P0.

## Definition of "Demo Done"

A demo is done when ALL of the following hold:

- [ ] Playable end-to-end by a human with no instructions beyond a one-line tutorial overlay
- [ ] All declared perf targets hit on the reference hardware band (see per-game spec)
- [ ] All declared scenario tests pass deterministically across 100 consecutive runs (bit-identical telemetry hashes)
- [ ] Headless boot < 5s, headless 10k-frame run < 2 min wall clock
- [ ] Memory budget honored (no leaks across full play session per → `docs/specs/core/memory.md`)
- [ ] Replay file from any session re-runs to identical end state
- [ ] Cross-platform: builds and runs on Linux, Windows, macOS, Web (WASM). Mobile per-demo discretion.
- [ ] Source readable as a tutorial — every non-obvious decision commented with a `// why:` line

## Reference Hardware Bands

| Band | CPU | GPU | RAM | Used by |
|------|-----|-----|-----|---------|
| Low | 4-core x86_64 ~2020 (e.g. Ryzen 3 3100) | Intel UHD 630 / iGPU | 8 GB | `nexus-platformer`, `nexus-rts` |
| Mid | 8-core x86_64 ~2022 (e.g. Ryzen 5 5600) | GTX 1660 / RX 580 | 16 GB | `nexus-fps`, `nexus-rpg` low settings |
| High | 12-core ~2024 (e.g. Ryzen 7 7700X) | RTX 3070 / RX 6700 XT | 32 GB | `nexus-rpg` high, `nexus-fps` ultra |

Numbers above are target bands; exact thresholds `[BENCHMARK NEEDED]` once the renderer (→ `docs/specs/renderer/overview.md`) lands.

## Prior Art Inspirations

| Demo | Inspirations | What we steal |
|------|--------------|---------------|
| nexus-fps | Quake 3 Arena, Q3DM17, Diabotical | Movement feel, 125/144/333 Hz physics determinism, arena loops |
| nexus-rpg | Skyrim, Diablo IV, Outer Wilds | World streaming, inventory, dialogue UX, ambient audio |
| nexus-rts | StarCraft, Age of Empires II, 0 A.D. | 100+ unit micro, fog of war, resource economy |
| nexus-platformer | Celeste, Hollow Knight, Super Meat Boy | Coyote time, jump buffering, frame-precise input |

Also studied: Bevy `breakout` example (minimal demo as integration test pattern), Godot TPS demo (asset polish bar). → `docs/prior-art/bevy.md`, `docs/prior-art/godot.md`.

## Open Questions

- `[DECISION NEEDED]` Should a fifth demo (`nexus-puzzle` or `nexus-roguelike`) be added to exercise scripting (→ `docs/specs/scripting/overview.md`) at depth? Current demos under-test Lua/Rune.
- `[DECISION NEEDED]` Mobile build targets per demo — universal or opt-in?
- `[DECISION NEEDED]` Should demos live in `nexus-engine/games/` (current plan) or be split to separate `nexus-demos` repo? Current plan ties them to engine for atomic CI; separate repo proves the public CLI flow.
- `[BENCHMARK NEEDED]` Concrete fps/frame-time numbers for every "Mid" and "High" target once the renderer ships.

## Cross-Agent Flags

- `[AGENT: 02]` Telemetry hooks must exist before scenario runners can validate demos.
- `[AGENT: 10]` Scenario format and replay determinism contract are upstream dependencies.
- `[AGENT: 09]` `nexus-assets` CLI must support Kenney/Poly Haven/AI-gen import before demo assets can be sourced reproducibly.
- `[AGENT: 16]` AI merge system needs perf-delta tolerance config; default tolerances `[DECISION NEEDED]`.
- `[AGENT: 12]` Genre specs (`fps.md`, `rpg.md`, `rts.md`, `platformer.md`) must declare the public surfaces each demo consumes.
