<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Audio — DSP Chain & Effects

> Per-bus and per-voice signal processors: EQ, dynamics, reverb, convolution, modulation. Lock-free, block-based, deterministic.

## Boundaries
- Owns: built-in effect implementations, effect-chain ordering rules, parameter automation, oversampling policy, fixed-block processing contract for user effects.
- Does NOT own:
  - Spatial pan/HRTF (uses convolution internally) → `→ docs/specs/audio/spatial.md`
  - Bus routing → `→ docs/specs/audio/overview.md`
  - Streaming sources → `→ docs/specs/audio/streaming.md`
- Depends on:
  - Audio graph from `→ docs/specs/audio/overview.md`
  - SIMD math `→ docs/specs/core/math.md` [AGENT: 02]
  - Job system for impulse-response loading `→ docs/specs/core/jobs.md` [AGENT: 02]

## Architecture

```
   Bus or Voice input frames
            │
            ▼
   ┌──────────────────────────────────────┐
   │  Effect Chain (ordered)              │
   │   [EQ] ─▶ [Compressor] ─▶ [Reverb]   │  user-defined order
   │     │         │              │       │
   │     ▼         ▼              ▼       │  each: process(in,out,params)
   │  params    sidechain      wet/dry    │
   └────────────────┬─────────────────────┘
                    ▼
              Output frames (to bus / output)

   ┌──────────────────────────────────────┐
   │  Parameter Automation                │  per-block interpolation
   │   Tween · LFO · Envelope · Sidechain │  no per-sample callbacks from gameplay
   └──────────────────────────────────────┘
```

Every effect implements:
```rust
pub trait Effect: Send {
    fn config(&self) -> EffectConfig;        // io channels, latency, oversample
    fn reset(&mut self);                     // clear state buffers
    fn set_param(&mut self, key: ParamKey, value: f32, tween: Tween);
    fn process(&mut self, ctx: ProcessCtx, in_: &[Frame], out: &mut [Frame]);
}
```

`ProcessCtx { sample_rate, block_size, time_samples, seed }` — `seed` enables deterministic noise (e.g., reverb diffusion).

## Built-in Effects

| Effect          | Params (selected)                                      | Notes                                  |
|-----------------|--------------------------------------------------------|----------------------------------------|
| `Gain`          | gain_db                                                | trivial                                |
| `Eq` (param)    | bands[N] { type, freq, q, gain_db }                    | up to 8 bands; biquads                 |
| `LowPass`/`HighPass`/`BandPass` | freq, q                                | RBJ biquad                             |
| `Compressor`    | threshold_db, ratio, attack_ms, release_ms, knee_db, makeup_db, sidechain | feed-forward, log-domain |
| `Limiter`       | ceiling_db, lookahead_ms                               | true-peak, lookahead buffer            |
| `Expander`/`Gate` | threshold_db, ratio, attack, release, hold           |                                        |
| `Reverb`        | size, decay, damping, diffusion, mod, wet_db, dry_db   | algorithmic (FDN) by default           |
| `Convolution`   | impulse: AssetHandle, wet_db, dry_db, latency_mode     | partitioned, zero-latency option       |
| `Delay`         | time_ms, feedback, lp_cutoff, sync_to_bpm              | tap-delay variant for echoes           |
| `Chorus`/`Flanger`/`Phaser` | rate, depth, feedback, mix                 | LFO-driven                             |
| `Distortion`    | drive_db, mix, kind: Soft|Hard|Tube|Bitcrush           | oversampled internally                 |
| `Pitch`         | semitones, formant_preserve                            | granular or PSOLA `[DECISION NEEDED]`  |
| `Spectral`      | mode: Vocoder|Freeze|TimeStretch                       | v1.1                                   |

### Reverb (algorithmic) — default

Feedback Delay Network (FDN), 8×8 Hadamard matrix, with all-pass diffusers in pre-delay. Inspired by Jot/Chaigne FDN and Freeverb topology. Deterministic with seed.

```
in ─▶ pre-delay ─▶ diffusers (4× all-pass) ─▶ FDN (8 delays + matrix + damping LP) ─▶ wet
                                                       │
                                                       └▶ tap mix → stereo wet
```

### Convolution Reverb

Partitioned FFT convolution (uniform partition or non-uniform for low-latency).
- IR loading: async via job system; effect runs dry until IR ready, emits `EFFECT_IR_READY` event.
- Max IR length: 8 s @ 48 kHz `[BENCHMARK NEEDED]`.
- Use cases: cathedral IRs, speaker cabinet sims, HRIR for spatial system.

### EQ

Cascade of RBJ-style biquads. Coefficients recomputed on `set_param` (off the audio thread when possible). Smoothed via crossfade between two coefficient sets when changes exceed jump threshold (avoid zipper noise).

### Dynamics (Compressor/Limiter)

- Detector: peak + RMS (selectable), in log domain.
- Sidechain input: external bus or self.
- Lookahead (limiter only): adds latency equal to lookahead.
- Latency reporting via `EffectConfig::latency_samples` — graph compensates between parallel paths (PDC).

## Parameter Automation

| Source       | Description                                          |
|--------------|------------------------------------------------------|
| `Tween`      | linear/eased ramp over duration                      |
| `Lfo`        | sine/tri/saw/square, free or beat-synced             |
| `Envelope`   | ADSR or breakpoint, triggered by event               |
| `Sidechain`  | RMS envelope of another bus drives parameter         |
| `Curve(RTPC)`| script-driven param mapped through curve             |

All evaluated **once per block**, value held for the block (no per-sample automation in v1.0; revisit if needed).

## Oversampling Policy

- Nonlinear effects (`Distortion`, `Compressor` with hard knee, `Pitch`) auto-oversample 2× by default, 4× optional.
- FIR up/down filters precomputed; designer can disable to save CPU.

## User Effects (Plugin)

Same `Effect` trait. Loaded via:
- Native: linked in user crate.
- Scripting: Rune-sandboxed DSP `→ docs/specs/scripting/sandbox.md` [AGENT: 08] — capped by `dsp_cpu_budget_ms_per_block`.
- WASM plugin `[DECISION NEEDED]` — for community FX marketplace.

No FFI to closed-source plugins (VST/AU) in v1.0 — license incompatibility with MIT mandate.

## Performance Contract

| Metric                                       | Target            | Hard limit        |
|----------------------------------------------|-------------------|-------------------|
| EQ 4-band per block (256 frames, stereo)     | ≤ 8 µs            | ≤ 20 µs           |
| Compressor per block                         | ≤ 10 µs           | ≤ 25 µs           |
| Algorithmic reverb per block (stereo)        | ≤ 60 µs           | ≤ 150 µs          |
| Convolution reverb (2 s IR, stereo)          | ≤ 200 µs          | ≤ 500 µs          |
| Effect param change → audible                | ≤ 1 block         | ≤ 2 blocks        |
| Zipper noise on smoothed param change        | none audible      | none audible      |
| Allocations during `process`                 | 0                 | 0 (hard)          |
| Determinism (seeded, same input)             | bit-identical     | bit-identical     |

## Error Contract

| Code                       | Meaning                                              | Caller action                       |
|----------------------------|------------------------------------------------------|-------------------------------------|
| `EFFECT_PARAM_UNKNOWN`     | `set_param` with unrecognized key                    | check effect docs                   |
| `EFFECT_PARAM_OUT_OF_RANGE`| Value clamped to legal range                         | telemetry only                      |
| `EFFECT_IR_TOO_LARGE`      | Convolution IR exceeds max length                    | shorten or pre-truncate             |
| `EFFECT_IR_NOT_LOADED`     | Convolution invoked before IR loaded                 | wait `EFFECT_IR_READY` event        |
| `EFFECT_CPU_BUDGET_EXCEEDED` | User effect ran over budget                        | effect bypassed; replace impl       |
| `EFFECT_LATENCY_CHANGED`   | Latency changed mid-session                          | PDC reconfigures automatically      |

## Integration Points

- **Bus** owns ordered `Vec<Box<dyn Effect>>`. Order matters; engine does PDC across parallel routes.
- **Spatial** uses `Convolution` for HRTF and zone reverbs `→ docs/specs/audio/spatial.md`.
- **Adaptive music** uses sidechain `Compressor` for ducking `→ docs/specs/audio/adaptive.md`.
- **Voice chat** uses `HighPass`+`NoiseSuppress`+`Compressor` chain `→ docs/specs/audio/voice.md`.
- **Scripting** `audio.bus("sfx"):set_param(effect_idx, key, value)`.
- **Editor** real-time meters & param sliders per effect; preset save/load to `.audiopreset` TOML.

## Test Requirements

- EQ flat (all gains 0) → output bit-equal to input (within float epsilon).
- Compressor: 1 kHz sine at threshold+10 dB → gain reduction matches ratio formula ±0.5 dB.
- Limiter ceiling −0.1 dBFS: synthetic +6 dB peak → no sample exceeds ceiling (true peak).
- Reverb with seed=42, twice → bit-identical wet output.
- Convolution IR async load: dry passthrough until ready, no glitch on swap-in.
- Param tween Linear 100 ms from gain 0 dB to −12 dB: no zipper noise (measure THD).
- 16 effects per bus × 8 buses × 256-frame block: under desktop CPU budget.

## Prior Art

- JUCE DSP module ✓ effect API shape. Concept reference (license incompatible).
- `vst3-sdk` ✗ closed/proprietary licensing.
- Freeverb / Jot FDN ✓ algorithmic reverb topology.
- `tesselode/kira` effects module ✓ block-based effect trait.
- Tracktion Engine ✓ PDC across parallel paths.
- RBJ Audio EQ Cookbook ✓ canonical biquad coefficients.
- `mumble/opus` echo cancellation ✓ for voice path.

## Open Questions

- `[DECISION NEEDED]` Pitch-shift algorithm: PSOLA (mono-friendly), granular (polyphonic-friendly), or both?
- `[DECISION NEEDED]` Per-sample automation as opt-in for "ramps" effect?
- `[DECISION NEEDED]` WASM-plugin sandbox for community effects in v1.0?
- `[BENCHMARK NEEDED]` Convolution IR max length on mobile (target 2 s realtime).
- `[DECISION NEEDED]` Built-in match-EQ / auto-gain analyser?
- `[DECISION NEEDED]` LADSPA/LV2 host shim — license-clean and useful, or out of scope?
