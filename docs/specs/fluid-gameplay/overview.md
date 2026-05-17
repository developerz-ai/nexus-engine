<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Fluid as Gameplay — Overview

> Fluid is a gameplay primitive, not a visual effect. SPH on GPU, two-way rigid coupling, fluid-driven AI, fluid-as-puzzle. Sea of Thieves waves, Where Cards Fall water, Florence-style ink, From Dust terraforming.

## Boundaries

- Owns: gameplay-oriented fluid contracts (volume queries, flow direction sampling, fluid-event hooks), fluid-driven AI primitives (boat sway, current-following NPCs), puzzle-fluid helpers (water-rises-by-X-when-block-placed).
- Does NOT own: the SPH solver itself (→ `docs/specs/physics/fluid.md`), heavy-particle visual fluid (→ `docs/specs/renderer/particles-heavy.md`), 2D pixel-fluid (→ `docs/specs/cellular-automata/overview.md`).
- Depends on: `nexus-physics/fluid` (SPH solver), `nexus-renderer/particles-heavy` (visual), `nexus-core/ecs`, `nexus-core/events`, `nexus-net/replication` (for authoritative fluid-puzzle modes).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-physics/fluid` | SPH simulation (CPU deterministic or GPU visual) |
| `nexus-renderer/particles-heavy` | visual layer; 2D-grid coupling for cheap interactions |
| `nexus-core/events` | fluid-collision events → audio + gameplay reactions |
| `nexus-core/ecs` | `FluidVolume`, `FluidBuoyant`, `FluidSensor` components |
| `nexus-net/replication` | authoritative-fluid mode for puzzle networking |
| `nexus-audio/adaptive` | flow / splash audio |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-fluid-gameplay-coupling` | (no new category — lives in `genre-toolkit`) | gameplay-side helpers (buoyancy, current-follow, puzzle volume) |
| `nexus-fluid-gameplay-waves` | (genre-toolkit) | gerstner wave sea (Sea of Thieves model) |

## Architecture

```
Fluid-as-gameplay layering

  Tier 1 — Visual fluid (cheap, decorative)
  ┌──────────────────────────────────────────────┐
  │ particles-heavy + 2D-grid SPH                │
  │ no authority, runs per-client                │
  │ use: ambient splash, atmosphere rain pool    │
  └──────────────────────────────────────────────┘

  Tier 2 — Coupled fluid (rigid interaction)
  ┌──────────────────────────────────────────────┐
  │ nexus-physics/fluid PBF + two-way coupling    │
  │ boats float, characters wade                  │
  │ deterministic CPU OR authoritative GPU+server │
  │ use: vehicle, character buoyancy              │
  └──────────────────────────────────────────────┘

  Tier 3 — Authoritative-gameplay fluid (puzzles)
  ┌──────────────────────────────────────────────┐
  │ nexus-physics/fluid CPU PBF, server-auth      │
  │ snapshot-replicated each tick                 │
  │ use: puzzle water levels, hydraulic systems   │
  └──────────────────────────────────────────────┘

  Tier 4 — Wave-driven (procedural, not particle)
  ┌──────────────────────────────────────────────┐
  │ Gerstner wave function (closed-form, cheap)   │
  │ deterministic by world-time + position        │
  │ use: open-sea sailing (Sea of Thieves model)  │
  └──────────────────────────────────────────────┘
```

## Public API

```toml
[fluid_gameplay]
tier             = "coupled"     # "visual" | "coupled" | "authoritative" | "waves"

[fluid_gameplay.coupled]
solver           = "pbf"
backend          = "cpu"         # use "gpu" for visual-only
max_particles    = 50000

[fluid_gameplay.waves]
spectrum         = "gerstner-4"  # 4 superposed wave trains
amplitude_m      = 1.5
period_s         = 6.0
wind_direction_deg = 45.0
deterministic_seed = 0xCAFEBABE
```

```rust
// gameplay components
pub struct FluidVolume { pub fluid: FluidHandle }              // tag entities sitting in fluid
pub struct FluidBuoyant { pub displaced_volume: f32 }          // computes buoyant force
pub struct FluidSensor { pub on_enter: EventId, pub on_exit: EventId }
pub struct WaveSurface { pub spectrum: WaveSpectrum }          // tier-4 closed-form surface

// queries
impl FluidGameplay {
    pub fn level_at(&self, world_xz: Vec2) -> f32;            // height of fluid surface
    pub fn flow_at(&self, world_pos: Vec3) -> Vec3;           // local velocity
    pub fn is_submerged(&self, aabb: Aabb) -> SubmergeReport; // for AI/puzzle queries
    pub fn raise_level(&mut self, volume: VolumeId, by_m: f32); // puzzle helper
}

// AI primitives
pub struct CurrentFollow { pub strength: f32 }                 // NPC drifts with current
pub struct ShoreSeek;                                          // NPC moves toward nearest shore
```

## Wave surface (tier 4)

Closed-form Gerstner wave is the right primitive for open-water games — no particles needed:

```
For each point P on the sea plane:
  h = sum_{i=1..N} amplitude_i * sin(k_i · P + omega_i · time + phase_i)
  // k is wavenumber (direction + freq), omega is angular freq
```

Deterministic: given `time` + `seed`, the surface is identical everywhere → networking is trivial (clients compute locally, no sync needed).

Boat buoyancy: sample surface at the boat's hull mesh sample points; apply buoyant force = `displaced_volume_per_sample * g * water_density`.

## Performance Contract

| Tier | Cost | Particles | Use case |
|---|---|---|---|
| Visual | < 1 ms | 1M+ | ambient splashes |
| Coupled CPU | < 4 ms | 20k | character wading, boat in pond |
| Coupled GPU | < 3 ms | 200k | river, large body, visual-dominant |
| Authoritative | < 4 ms CPU + < 8 KB/s net per puzzle | 20k | water puzzle, dam game |
| Waves (gerstner-4) | < 0.2 ms (closed-form, GPU vertex eval) | 0 | open sea, no network cost |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `FLG_E_TIER_MISMATCH` | Authoritative tier requested without networking enabled | Enable `nexus-net/replication` or downgrade tier |
| `FLG_E_VOLUME_OOB` | `level_at` query outside fluid volume | Return ground level + warn |
| `FLG_E_WAVE_SPECTRUM_INVALID` | Spectrum amplitudes sum > seaworthy threshold | Reduce or accept boats may capsize |
| `FLG_W_PUZZLE_DESYNC` | Authoritative fluid step took > tick budget | Reduce particle count or split puzzle into sub-volumes |

## Integration Points

- **Physics/fluid**: this is the gameplay-facing layer atop the SPH solver. → `docs/specs/physics/fluid.md`.
- **Particles-heavy**: visual splash on impact, surface foam particles. → `docs/specs/renderer/particles-heavy.md`.
- **Audio**: flow loops, splash one-shots, underwater muffling. → `docs/specs/audio/overview.md`.
- **AI**: `CurrentFollow`, `ShoreSeek` components. → `docs/specs/genres/openworld.md` AI hooks.
- **Net (puzzle mode)**: snapshot replication per puzzle volume. → `docs/specs/networking/replication.md`.
- **Weather**: rain accumulates in fluid volumes (small effect, gameplay-relevant for survival). → `docs/specs/weather-as-system/overview.md`.

## Scenario test (starter)

`scenarios/fluid-puzzle-rising-water.scenario.toml`:

```toml
[scene]
template = "fluid-puzzle-basin"
[actions]
- { tick = 1,   action = "place_block", pos = [3, 0, 0] }   # diverts flow
- { tick = 100, action = "open_valve", id = "valve_a" }
[asserts]
- { tick = 600, predicate = "fluid_level_at([0,0,0]) > 5.0" }
- { tick = 600, predicate = "tick_ms_p99 < 16.6" }
- { tick = 600, predicate = "authoritative_desync_count == 0" }
```

## Test Requirements

- Boat-on-waves: spawn boat on gerstner sea, no input → bobs realistically, no NaN over 60 s.
- Coupled CPU determinism: same seed + same inputs → bit-identical particle positions at tick 1800.
- Puzzle rising water: block diverts flow → reservoir fills, replicates to second client < 200 ms.
- Visual+coupled hybrid: 1M visual + 20k coupled particles, frame budget held.

## Prior Art

- Sea of Thieves (Rare) — gerstner sea + sailing physics. *Inspired by*: SIGGRAPH 2018 "Ships at Sea: The Tech Behind Sea of Thieves" by Stephen Walters. [VERIFY URL].
- Where Cards Fall (Snowman) — water as puzzle element. [VERIFY — Snowman dev posts].
- From Dust (Ubisoft Montpellier) — fluid as terraforming. [VERIFY — Eric Chahi GDC talk].
- Florence (Mountains) — ink fluids in narrative game. [VERIFY — Mountains dev posts].
- *Inspired by*: Tessendorf, "Simulating Ocean Water" (SIGGRAPH 2001) — wave spectrum reference.
- *Inspired by*: Macklin & Müller, "Position Based Fluids" (SIGGRAPH 2013) — solver for coupled tier.

## Open Questions

- `[DECISION NEEDED]` Default tier when dev says "I want water" — coupled CPU (safe) vs visual (cheap).
- `[DECISION NEEDED]` Authoritative-fluid bandwidth ceiling — does it fit in standard replication budget?
- `[BENCHMARK NEEDED]` Gerstner-4 at 4K LOD distances on integrated GPU.
- `[DECISION NEEDED]` Ship `nexus-fluid-gameplay-waves` as `genre-toolkit` or as its own category?
