<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Weather as System — Overview

> Weather is a first-class subsystem, not a particle effect. Wind field, precipitation, time-of-day, atmosphere scattering — and it propagates: into physics (boats sway, leaves blow), economy (crops grow), AI (NPCs seek shelter), audio (rain layers, wind on objects). RDR2, Death Stranding, Subnautica.

## Boundaries

- Owns: global wind field, precipitation systems (rain/snow/hail/dust), time-of-day clock, atmosphere scattering model (Rayleigh/Mie), weather-state machine (clear → cloudy → rain → storm), per-system propagation hooks.
- Does NOT own: sky shader implementation (→ `docs/specs/renderer/post.md` atmospheric chain), wet-surface BRDF (→ `docs/specs/styles/pbr.md`), audio mixing (→ `docs/specs/audio/overview.md`), crop/economy simulation (→ `docs/specs/sim-game/overview.md`).
- Depends on: `nexus-renderer/post` (atmospheric scattering), `nexus-audio/adaptive` (weather audio layers), `nexus-physics/rigid` (wind force field), `nexus-core/events` (weather-change events).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-renderer/post` | sky / atmosphere / volumetric clouds |
| `nexus-renderer/particles-heavy` | rain / snow / dust at scale |
| `nexus-audio/adaptive` | weather audio layers (rain on metal vs grass, wind whoosh) |
| `nexus-physics/rigid` | wind as force field (sails, cloth, debris) |
| `nexus-core/events` | weather transitions broadcast to all subscribers |
| `nexus-core/ecs` | `WindReceiver`, `RainExposed`, `Shelter` components |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-weather-windfield` | `weather` (new) | 3D wind field (procedural curl-noise + storm overrides) |
| `nexus-weather-precipitation` | `weather` | rain/snow particle system + accumulation |
| `nexus-weather-time-of-day` | `weather` | sun/moon position, day-night clock |
| `nexus-weather-atmosphere` | `weather` | scattering parameters per time/altitude |
| `nexus-weather-statemachine` | `weather` | declarative state graph (clear→cloudy→storm) |

## Architecture

```
Weather propagation graph

  ┌────────────────────────────────────────────────────────────┐
  │ WeatherState (current condition + intensity)                │
  │   clear / cloudy / rain / storm / snow / fog / dust         │
  │   intensity 0..1; transitions via state machine             │
  └─────────┬───────────────────────────────────────────────────┘
            │ (publishes to all subscribers via Events)
            ▼
  ┌────────────────────────────────────────────────────────────┐
  │ Subscribers (each consumes WeatherState; emits own state)   │
  │                                                             │
  │ Renderer:    sky color, cloud density, scattering coeffs    │
  │ Particles:   precipitation count, type                      │
  │ Physics:     wind field magnitude + direction               │
  │ Audio:       rain layer gain, wind whoosh on objects        │
  │ AI:          NPCs evaluate Shelter component, path to cover │
  │ Sim:         crops grow at rain-dependent rate              │
  │ Net:         weather seed + time replicated, NOT per-particle│
  └────────────────────────────────────────────────────────────┘
```

## Public API

```toml
[weather]
mode              = "stateful"        # "stateful" | "scripted" | "off"
seed              = 0xFEEDFACE
time_scale        = 60.0              # game minutes per real minute
start_time        = "06:00"

[weather.states]
clear   = { duration_range_s = [600, 1800], next = ["cloudy", "clear"] }
cloudy  = { duration_range_s = [300, 900],  next = ["rain", "clear", "storm"] }
rain    = { duration_range_s = [180, 600],  next = ["cloudy"], intensity_range = [0.3, 0.8] }
storm   = { duration_range_s = [120, 300],  next = ["rain"],   intensity_range = [0.8, 1.0] }

[weather.windfield]
backend           = "curl-noise"      # "curl-noise" | "table" | "scripted"
base_speed_mps    = 5.0
storm_speed_mps   = 25.0
turbulence_scale  = 0.3

[weather.precipitation]
backend           = "particles-heavy"
max_particles     = 500_000
accumulation      = true              # snow piles up, puddles form

[weather.atmosphere]
scattering        = "rayleigh-mie"
sun_intensity     = 1.0
ozone             = "earthlike"
```

```rust
pub struct WeatherState {
    pub condition: WeatherCondition,    // Clear | Cloudy | Rain | Storm | Snow | Fog | Dust
    pub intensity: f32,
    pub time_of_day_h: f32,
    pub temperature_c: f32,
}

pub struct WindField { /* 3D vector field handle */ }

impl Weather {
    pub fn state(&self) -> WeatherState;
    pub fn wind_at(&self, pos: Vec3) -> Vec3;
    pub fn precipitation_at(&self, pos: Vec3) -> PrecipitationSample;
    pub fn force_state(&mut self, condition: WeatherCondition, intensity: f32);  // scripted
    pub fn telemetry(&self) -> WeatherTelemetry;
}

// Components for entities affected by weather
pub struct WindReceiver { pub area: f32, pub drag: f32 }
pub struct RainExposed { pub wetness: f32 }                // accumulates while exposed
pub struct Shelter { pub radius: f32 }                     // tag for AI shelter search
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Wind field sample (`wind_at`) | < 1 µs | 5 µs |
| Atmosphere scattering pass | < 1.5 ms | 4 ms |
| Volumetric clouds (1080p) | < 2.5 ms | 6 ms |
| Precipitation particles (500k) | < 1.5 ms | 4 ms |
| Weather state evaluation | < 100 µs | 500 µs |
| Net bandwidth (weather sync) | < 1 KB/s | 4 KB/s |
| Determinism (same seed + same time) | bit-exact state machine | required |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `WTHR_E_STATE_UNKNOWN` | Forced state not in registered states | Register state or use enum form |
| `WTHR_E_WIND_OOB` | `wind_at` query outside world bounds | Wraps to nearest in-bounds sample |
| `WTHR_E_NO_PARTICLES_HEAVY` | Precipitation backend requires `particles-heavy` not loaded | `nexus add nexus-particles-heavy` |
| `WTHR_W_TRANSITION_FORCED` | State forced mid-transition; previous transition cancelled | OK; telemetry only |

## Integration Points

- **Renderer/post**: weather drives sky shader uniforms (scattering, cloud density), volumetric fog. → `docs/specs/renderer/post.md`.
- **Particles-heavy**: precipitation as heavy-particle system; per-particle wind sampling. → `docs/specs/renderer/particles-heavy.md`.
- **Audio**: weather selects audio layer mix (clear → ambient, rain → rain-on-roof + wind, storm → thunder one-shots). → `docs/specs/audio/overview.md`.
- **Physics**: wind field becomes force-field for sails, leaves, cloth, smoke. Boats sway from wave-coupling + wind. → `docs/specs/physics/rigid.md`, `docs/specs/fluid-gameplay/overview.md`.
- **AI**: `Shelter` components are pathfinding goals when `WeatherState.intensity > shelter_threshold`. → `docs/specs/genres/openworld.md`.
- **Sim (crops, economy)**: rain rate is an input to crop-growth ticks. → `docs/specs/sim-game/overview.md`.
- **Seamless world**: weather state is a global, replicated by seed + time-of-day; no per-shard sync needed. → `docs/specs/seamless-world/overview.md`.

## Scenario test (starter)

`scenarios/weather-storm-shelter-seek.scenario.toml`:

```toml
[scene]
template = "openworld-village-with-shelters"
[actions]
- { tick = 1,   action = "spawn_npc", id = "villager_1", at = [10, 0, 10] }
- { tick = 30,  action = "weather_force", condition = "storm", intensity = 1.0 }
[asserts]
- { tick = 300, predicate = "npc_at_shelter(villager_1) == true" }
- { tick = 300, predicate = "tick_ms_p99 < 16.6" }
```

## Test Requirements

- Weather state machine: 1 hour game time produces transitions, no stuck states.
- Wind field: query at 1000 points → all in [0, storm_speed_mps]; deterministic per seed+time.
- Forced storm: NPCs with `Shelter` pathfind goals → reach shelter within 5 min game time.
- Net replication: client joining mid-storm sees correct state within 100 ms.
- Cross-system: rain on metal surface produces correct audio mix; rain accumulates puddles via fluid-gameplay tier-1.

## Prior Art

- Red Dead Redemption 2 — full weather subsystem, propagated to physics + audio + AI. [VERIFY — Rockstar tech blog URL].
- Death Stranding — weather (timefall) as gameplay primitive. [VERIFY — Kojima Productions GDC URL].
- Subnautica — biome-driven weather + visibility. [VERIFY — Unknown Worlds dev posts].
- The Long Dark — weather as core survival pressure. [VERIFY — Hinterland dev blog].
- Microsoft Flight Simulator 2020 — real-world weather streaming via API. [VERIFY — Asobo MeteoBlue integration URL].
- *Inspired by*: Bruneton & Neyret, "Precomputed Atmospheric Scattering" (2008) — atmosphere model reference.

## Open Questions

- `[DECISION NEEDED]` Wind field representation: 3D curl-noise (procedural, cheap) vs sparse 2D grid + interpolation (lower fidelity, gameplay-predictable).
- `[DECISION NEEDED]` Time-of-day as part of `weather` spec or its own subsystem? Lean: part of weather (sun position drives scattering).
- `[BENCHMARK NEEDED]` Volumetric cloud cost on Steam Deck and integrated GPU.
- `[DECISION NEEDED]` Weather "scripted" mode — full timeline TOML, or scripting-only?
- `[DECISION NEEDED]` Per-region microclimates — explicit feature in v1, or layered via multiple weather instances?
