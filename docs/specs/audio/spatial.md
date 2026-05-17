<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Audio — Spatial / 3D

> Position, distance, direction, occlusion, and HRTF binaural rendering of audio sources in world space.

## Boundaries
- Owns: distance attenuation, panning (stereo/surround/ambisonic), Doppler, HRTF binaural rendering, reverb zone resolution, occlusion ray queries against physics, air absorption.
- Does NOT own:
  - Graph/voice lifecycle → `→ docs/specs/audio/overview.md`
  - Reverb DSP itself → `→ docs/specs/audio/dsp.md`
  - Ray-cast implementation → `→ docs/specs/physics/collision.md` [AGENT: 05]
  - Transform replication → `→ docs/contracts/core-audio.md` [AGENT: 14]
- Depends on:
  - Listener + emitter components via `→ docs/contracts/core-audio.md` [AGENT: 14]
  - Physics scene query API `→ docs/contracts/core-physics.md` [AGENT: 14]

## Architecture

```
   Emitter(pos,vel)                   Listener(pos,vel,orientation)
        │                                       │
        ▼                                       ▼
   ┌───────────────────────────────────────────────┐
   │       Spatial Solver  (per voice, per block)  │
   │                                               │
   │   distance ─▶ attenuation curve ─▶ gain       │
   │   delta vel ─▶ doppler shift     ─▶ pitch     │
   │   direction ─▶ panner OR HRTF    ─▶ stereo    │
   │   physics  ─▶ occlusion ray      ─▶ lp filter │
   │   zone     ─▶ reverb send level  ─▶ aux send  │
   │   distance ─▶ air absorption     ─▶ lp slope  │
   └───────────────┬───────────────────┬───────────┘
                   │                   │
                   ▼                   ▼
            Direct (L/R/...)     Reverb Aux Sends
                   │                   │
                   ▼                   ▼
              Bus Tree            Reverb Buses (zones)
```

Solver runs per voice each audio block. Parameters are interpolated per block (zip-free). Listener-emitter pairs farther than a per-emitter `cull_distance` skip mixing entirely.

## Public API

```rust
pub struct SpatialParams {
    pub position: Vec3,
    pub velocity: Vec3,
    pub orientation: Option<Quat>,    // for directional sources
    pub min_distance: f32,            // full gain inside this radius
    pub max_distance: f32,            // silent beyond
    pub attenuation: AttenuationCurve,// Inverse | Linear | Logarithmic | Custom(Curve)
    pub directivity: Option<Directivity>, // cardioid/cone for emitters with facing
    pub doppler_factor: f32,          // 0..2, 1=physical
    pub spread: f32,                  // 0..1 — point↔sphere; 1 = bypass panning
    pub occlusion: OcclusionMode,     // None | Geometric{layers:LayerMask} | Manual(f32)
    pub reverb_send: ReverbSend,      // Auto(zone) | Manual{bus:BusId, level_db:f32}
    pub cull_distance: Option<f32>,
}

pub struct Listener {
    pub position: Vec3,
    pub velocity: Vec3,
    pub forward: Vec3,
    pub up: Vec3,
    pub rendering: SpatialRenderer,   // Pan2D | Pan5_1 | Pan7_1 | Ambisonic1 | Hrtf(HrtfProfile)
}

pub enum HrtfProfile { Mit, Cipic, Custom(AssetHandle) }

pub struct ReverbZone {
    pub aabb_or_sphere: ZoneShape,
    pub bus: BusId,                   // bus that hosts the reverb DSP
    pub send_db_inside: f32,
    pub send_db_outside: f32,
    pub blend_distance: f32,
}

impl AudioEngine {
    pub fn set_listener(&self, idx: u8, l: Listener);   // up to 4 listeners (split-screen)
    pub fn add_reverb_zone(&self, z: ReverbZone) -> ZoneId;
    pub fn set_air_absorption(&self, coeffs: AirAbsorption); // freq-dependent dB/m
}
```

## Distance & Attenuation

| Curve         | Formula                                  | Use                          |
|---------------|------------------------------------------|------------------------------|
| `Inverse`     | `gain = min / max(d, min)` (FMOD-style)  | physical default             |
| `Linear`      | `gain = 1 − (d − min) / (max − min)`     | UI, predictable              |
| `Logarithmic` | `gain = 1 − log10(1 + 9·(d−min)/(max−min))` | natural curve             |
| `Custom`      | sampled curve, 32 points                 | designer override            |

## Doppler

`pitch_shift = (c + listener_vel·dir) / (c + emitter_vel·dir)` clamped to `[0.5, 2.0]`. `c` = speed of sound, default 343 m/s (configurable for sci-fi). Per-voice toggle.

## HRTF (Binaural)

Two convolutions (left/right ear) per voice using an interpolated HRIR pair from the listener-relative direction.

- Default dataset: **MIT KEMAR** (compact, free; cite Gardner & Martin 1994).
- Optional **CIPIC** database (45 subjects, broader generalization).
- HRIR length: 256 taps default; ITD encoded as fractional delay.
- Implementation: partitioned convolution in DSP block `→ docs/specs/audio/dsp.md`.
- Cost: ~0.3 % CPU per voice on desktop `[BENCHMARK NEEDED]`; voice budget for HRTF: 32 voices default.
- Bypass: voices beyond budget fall back to amplitude panning.

`[DECISION NEEDED]` ship custom HRTF measurement loader (SOFA file format) in v1.0 or v1.1?

## Occlusion

```
Emitter ●────── ray ──────● Listener
              │  hit
              ▼
        material.absorption ─▶ low-pass cutoff + gain reduction
```

Modes:
- `None` — no query.
- `Geometric { layers }` — single ray each `occlusion_update_hz` (10 Hz default), optionally 3-ray (head + ears) for higher quality. Costs go through physics job queue, not audio thread.
- `Manual(f32)` — gameplay or scripts set 0..1; useful for stylized games.

Result is smoothed (200 ms slew) and applied as: gain attenuation (`−12 dB` max default) + low-pass cutoff (`22 kHz → 800 Hz` max). Configurable per emitter material.

`[DECISION NEEDED]` obstruction (sound bends around obstacles) — explicit mode or always derived from occlusion?

## Reverb Zones

Listener position selects the active zone(s). Up to **N=4** concurrent zone sends (blended at boundaries by `blend_distance`). Each zone's send goes to its dedicated reverb bus → `→ docs/specs/audio/dsp.md#reverb`.

Cathedral example:
```
zones: [Outdoor(small plate), Cathedral(long hall), Crypt(short dark)]
listener walks Outdoor → Cathedral over 2 m blend:
    outdoor_send_db: 0 → -∞ (linear over 2 m)
    cathedral_send_db: -∞ → 0
```

## Air Absorption

Frequency-dependent attenuation over distance — high frequencies roll off faster. Default ISO-9613-1 coefficients at 20 °C / 50 % RH. Implemented as 2nd-order low-pass per voice with cutoff = `f(distance)`.

## Performance Contract

| Metric                                       | Target            | Hard limit        |
|----------------------------------------------|-------------------|-------------------|
| Spatial solve per voice per block            | ≤ 5 µs            | ≤ 15 µs           |
| Occlusion ray budget per frame               | ≤ 64 rays         | ≤ 256             |
| HRTF voices (desktop)                        | 32 simultaneous   | 64                |
| HRTF voices (mobile)                         | 8                 | 16                |
| Listener update latency (transform → mix)    | ≤ 1 block         | ≤ 2 blocks        |
| Doppler discontinuity on velocity step       | 0 (slewed)        | inaudible click   |

## Error Contract

| Code                              | Meaning                                          | Caller action                |
|-----------------------------------|--------------------------------------------------|------------------------------|
| `AUDIO_SPATIAL_HRTF_MISSING`      | Requested HRTF dataset asset not loaded          | fall back to pan or load it  |
| `AUDIO_SPATIAL_LISTENER_OVERFLOW` | >4 listeners set                                 | reuse slot index             |
| `AUDIO_SPATIAL_ZONE_OVERLAP_HARD` | >N zones overlap at listener (config N=4)        | telemetry only; clip to N    |
| `AUDIO_SPATIAL_DEGENERATE`        | Listener up/forward parallel                     | reject; keep previous basis  |

## Integration Points

- ECS components: `AudioListener`, `AudioEmitter { params: SpatialParams }`, `AudioReverbZone`. Transform sync at `transform_sync_hz` (60 default). Velocity derived from positional delta if not explicitly set.
- Physics: occlusion uses `PhysicsScene::raycast(layers)`; results delivered through a lock-free channel back to the audio thread (no blocking).
- Scripting: `audio.emitter(entity).set_min_distance(2.0)`.
- Agent API: spatial state queryable per voice (position, gain, occlusion factor) for assertions and debugging.

## Test Requirements

- Source at min_distance: gain unity; at max_distance: −∞ dB; at midpoint: matches curve table.
- Source moving at 100 m/s past listener → Doppler audibly shifts; no clicks at transition.
- HRTF: source rotated 360° in azimuth — perceived continuous motion; no zero-crossings in output gain.
- Occlusion ray: wall inserted between emitter/listener → low-pass cutoff drops within 300 ms, no pop.
- Zone blend across 2 m boundary → equal-power crossfade, RMS within 0.5 dB of monotonic.
- 4-listener split-screen at 256 voices: CPU < spatial budget × 4.
- Deterministic mode: identical positions/velocities/seed → bit-identical spatial gains.

## Prior Art

- Steam Audio (Valve) ✓ HRTF + geometric occlusion + path tracing reverb. Concept reference.
- Resonance Audio (Google) ✓ ambisonic encoder, open formats. ✗ archived, but lessons remain.
- FMOD Studio 3D ✓ designer-friendly emitter params.
- Wwise Spatial Audio ✓ portal/room model — `[DECISION NEEDED]` adopt portal abstraction?
- MIT KEMAR HRTF (Gardner & Martin 1994) ✓ canonical free dataset.
- CIPIC HRTF database ✓ subject diversity.

## Open Questions

- `[DECISION NEEDED]` Adopt Wwise-style portal/room model on top of zones?
- `[DECISION NEEDED]` Path-traced reverb (Steam Audio style) as opt-in v1.1?
- `[BENCHMARK NEEDED]` HRTF voice ceiling on Snapdragon mobile + WebAudio worklet.
- `[DECISION NEEDED]` Default ambisonic order — 1st or 3rd for surround→binaural decode?
- `[DECISION NEEDED]` Up to N=4 reverb sends — is that enough for stacked geometry?
