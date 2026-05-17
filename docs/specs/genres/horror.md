<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Horror Genre Module

> Horror primitives: dynamic tension/dread score, sanity meter with perceptual effects, fear-reactive audio mix, darkness/light propagation, jump-scare director.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.horror] version = "0.1"
sanity_model = "perceptual"   # affects shaders + audio
director_mode = "adaptive"    # "scripted" | "adaptive" (AI Director)
darkness_unit = "lux"
```

## Boundaries

- Owns: tension/dread aggregator, sanity meter, fear director, perceptual effects request stream, darkness queries, hide/peek state.
- Does NOT own: lighting calculations (→ `docs/specs/renderer/gi.md`), AI behavior (game-side), audio DSP (→ `docs/specs/audio/dsp.md`).
- Depends on: renderer (post stack hooks), audio bus, telemetry, AI events.

## Architecture

```
        ┌──────────────────────────────────┐
        │  Tension/Dread aggregator        │
        │  + monster proximity             │
        │  + player isolation              │
        │  + darkness lux                  │
        │  + recent threat events          │
        │  - safe-zone proximity           │
        │  = dread ∈ [0,1]                 │
        └──────────────┬───────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   AudioMix      PostFX bus       Director
   - low rumble  - desat          - schedules scares
   - high freq   - vignette       - cools after spike
                 - chromatic ab     (Left 4 Dead-style)

   Sanity meter ── visions, audio whispers, heartbeat overlay
   Darkness grid ── lux samples (probe-based, low-res)
```

## Public API

```rust
// resources
pub struct DreadState { value: f32, components: SmolMap<DreadComp, f32> }
pub struct Sanity { value: f32, drain_rate: f32, regen_rate: f32 }   // per player
pub struct FearDirector { intensity: f32, cooldown_s: f32, beats: VecDeque<DirectorBeat> }
pub struct DarknessProbes { samples: Vec<DarknessSample> }

// components
pub struct ThreatSource { weight: f32, kind: ThreatKind, range: f32 }
pub struct SafeZone { radius: f32, calm_strength: f32 }
pub struct PerceptualState { vignette: f32, desat: f32, chroma_ab: f32, hr_overlay: f32 }

// systems
fn dread_aggregate_system();
fn sanity_tick_system();
fn director_step_system();
fn perceptual_effects_system();    // writes PerceptualState → renderer post hook
fn darkness_sample_system();

// events
pub enum HorrorEvent {
    DreadSpiked{old,new,trigger}, Scared{e,intensity}, SanityBroken{e},
    SafeReached{e,zone}, MonsterHidden{m}, MonsterRevealed{m},
}
```

## Dread Computation

```
dread = clamp01(
    0.35 * monster_proximity_norm
  + 0.20 * (1 - light_lux/max_lux)
  + 0.15 * isolation_score
  + 0.20 * recent_event_decay
  - 0.30 * safe_zone_factor
)
```
All components emitted as telemetry — designers tune coefficients per scene.

## Sanity Meter

| Trigger | Sanity delta |
|---|---|
| direct sight of entity | -8/s |
| heard scream (cue tagged) | -3 once |
| darkness > 30 s | -0.5/s |
| safe-zone lit area | +1.5/s |
| sanity item used | +20 once |

Effects below thresholds:
- <60: faint chromatic aberration, breath audio louder.
- <40: vignette + occasional whisper sting.
- <20: visual hallucinations spawned (game-defined entities, illusion tag).
- 0: `SanityBroken` event — game decides outcome (death, transform, scene change).

## Director (Adaptive)

```
state: Calm → Build → Sustain → Spike → Cooldown → Calm
        ▲                                            │
        └────────────────────────────────────────────┘

Director picks "beats" from a pool tagged by intensity.
After Spike, force Cooldown (no scares for N seconds) — prevents fatigue.
```
Inspired by Left 4 Dead's AI Director (Booth/Booth GDC).

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Dread eval per tick | <50 µs | 200 µs |
| Darkness probes (256) | <1 ms | 4 ms |
| Director step | <30 µs | 200 µs |
| Post-FX update overhead | <0.2 ms | 1 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `HORR_E001` | director beat pool empty | revert to Calm, log |
| `HORR_E002` | sanity NaN | clamp to 100, log |
| `HORR_E010` | darkness probe outside world | skip sample |

## Integration Points

- Renderer post stack: `PerceptualState` consumed by post pass → `docs/specs/renderer/post.md`.
- Audio bus: dread value drives "fear" send level + low-freq rumble layer → `docs/specs/audio/adaptive.md`.
- Lighting: darkness probes read from baked + dynamic light → `docs/specs/renderer/gi.md`.
- Agent: scenario harness to A/B-test director tuning headlessly → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"t":92.4,"sys":"horror","evt":"dread_spiked","old":0.31,"new":0.78,"trigger":"sight"}
```
Per-minute dread histogram + sanity timeline = director's training data.

## Test Requirements

- Director cooldown: no Spike beat within N seconds after a Spike (assert from log).
- Sanity broken event triggers exactly once per crossing of 0.
- Darkness grid stable in static scene (no flicker between frames).
- 30-min headless run with monster AI: dread trace within designer's target envelope (golden curve).

## Prior Art

- Left 4 Dead AI Director (Booth, GDC 2009) ✓ adaptive pacing.
- Amnesia: Dark Descent sanity ✓ first-class meter.
- Resident Evil 4 dynamic difficulty ✓ stealth tuning behind player back.
- Alien Isolation Xeno AI ✓ two-brain awareness; horror module exposes telemetry hooks for similar.
- F.E.A.R. ambient audio fear curve ✓.

## Open Questions

- [DECISION NEEDED] Sanity persistence across save/load (default: persists).
- [DECISION NEEDED] Should director have a "honesty mode" telemetry exposed to player? (speedrunners want it.)
- [BENCHMARK NEEDED] Cost of darkness sampling at large open-world scale (use probe LOD?).
