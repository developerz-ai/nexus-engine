<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Rhythm Game — Overview

> Frame-perfect audio sync. Latency-calibrated input. Beat-grid as data, not as code. Crypt of the NecroDancer, Beat Saber, Friday Night Funkin', osu!.

## Boundaries

- Owns: beat-grid data model + DSL, latency-calibration UI flow, input timestamp pipeline, audio-clock-as-canonical-time, judgment windows (perfect/great/good/miss), chart authoring format.
- Does NOT own: audio playback / DSP (→ `docs/specs/audio/overview.md`), audio streaming (→ `docs/specs/audio/streaming.md`), input device polling (→ `docs/specs/core/hal.md`), score / progression (→ game-specific).
- Depends on: `nexus-audio/streaming` (gapless music playback), `nexus-core/hal` (input timestamping), `nexus-core/events`.

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-audio/streaming` | gapless, low-latency music + DSP-based timestamp |
| `nexus-core/hal` | hardware input timestamping (microsecond precision) |
| `nexus-core/events` | beat events broadcast to gameplay |
| `nexus-agent/replay` | input-log replay (frame-perfect by design) |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-rhythm-beat-grid` | `rhythm` (new) | beat-grid data + DSL parser (.chart files) |
| `nexus-rhythm-latency-calibrate` | `rhythm` | calibration UI flow + per-device offsets |
| `nexus-rhythm-input-timestamp` | `rhythm` | high-precision input timestamp pipeline |
| `nexus-rhythm-judgment` | `rhythm` | hit-window classifier (perfect/great/good/miss) |

## Architecture

```
Frame-perfect rhythm pipeline

  Audio clock (the canonical time source — NOT system clock)
  ─────────────────────────────────────────────────
  The DSP returns a sample-accurate playhead position
  (number of samples since playback started). This is
  the only "now" that matters for rhythm timing.

  audio_now_ms = (samples_played / sample_rate) * 1000

  Input pipeline
  ─────────────────────────────────────────────────
  HAL polls input device with hardware timestamp:
    input_event { time: HardwareTimestamp, kind: KeyDown('a') }

  Convert to audio-clock domain via per-device latency offset:
    rhythm_time = audio_now_ms - input_latency_ms - device_offset_ms

  Compare against expected beat:
    expected = chart.beat_at(rhythm_time)
    delta    = rhythm_time - expected.time
    judgment = classify(delta)   // |delta| < 16 ms → Perfect, etc.

  Calibration flow
  ─────────────────────────────────────────────────
  User taps to a steady beat for 10 s.
  Average tap-vs-expected delta = per-device offset.
  Stored in user settings.
```

## Beat grid (.chart) format

```toml
[chart]
title          = "Test Song"
bpm            = 128
offset_ms      = 200             # song-level offset
difficulty     = "hard"
lanes          = 4

# Notes are (time_ms, lane, kind, duration_ms?)
[[chart.note]] time = 469   lane = 0  kind = "tap"
[[chart.note]] time = 938   lane = 1  kind = "tap"
[[chart.note]] time = 1406  lane = 2  kind = "hold"  duration = 469
[[chart.note]] time = 1875  lane = 3  kind = "tap"

# OR: declarative beat-pattern DSL
[[chart.pattern]]
start_beat     = 16
length_beats   = 8
pattern        = "x . x . x x . ."   # 8 sixteenths
lane           = 0
```

## Public API

```toml
[rhythm]
sample_rate           = 48000      # must match audio
hit_window_perfect_ms = 16         # ± window
hit_window_great_ms   = 32
hit_window_good_ms    = 64
# beyond good → miss

[rhythm.calibration]
required              = true       # force on first launch per device
default_offset_ms     = 0

[rhythm.input]
poll_rate_hz          = 1000       # hardware poll at 1 kHz minimum
hardware_timestamp    = true       # use device-reported timestamp
```

```rust
pub struct Chart { /* notes, bpm, offset */ }
pub struct AudioClock { /* DSP playhead */ }

pub enum Judgment { Perfect, Great, Good, Miss }

impl Rhythm {
    pub fn load_chart(&mut self, path: &Path) -> Result<ChartHandle, Error>;
    pub fn play(&mut self, chart: ChartHandle);
    pub fn on_input(&mut self, lane: u8, time_ms: f64) -> Judgment;
    pub fn audio_now_ms(&self) -> f64;
    pub fn telemetry(&self) -> RhythmTelemetry;
}

pub struct RhythmTelemetry {
    pub audio_latency_ms: f32,
    pub input_latency_ms: f32,
    pub user_offset_ms: f32,
    pub judgments: [u32; 4],            // perfect/great/good/miss
    pub p99_judgment_delta_ms: f32,
}
```

CLI:

```
nexus rhythm calibrate            # interactive calibration
nexus rhythm chart-validate <file>
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Audio-clock precision | ≤ 1 sample (~21 µs at 48 kHz) | ≤ 4 samples |
| Input timestamp precision | < 1 ms | < 4 ms |
| End-to-end input → judgment latency | < 5 ms | < 16 ms |
| Audio output latency (with DSP) | < 10 ms desktop / < 30 ms web | < 20 / < 60 ms |
| Judgment classifier cost | < 1 µs | 10 µs |
| Beat-grid lookup (time → note) | < 5 µs (binary search) | 50 µs |
| Calibration accuracy (10 s tap session) | ± 5 ms standard deviation | ± 15 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `RHY_E_AUDIO_DROPOUT` | DSP underrun; audio clock stalls | Pause game; resume after buffer refill |
| `RHY_E_NO_HARDWARE_TS` | Device doesn't report hardware timestamp | Fall back to poll timestamp; warn user |
| `RHY_E_CALIBRATION_FAILED` | Tap variance too high | Re-run calibration |
| `RHY_E_CHART_BPM_MISMATCH` | Chart bpm * note times don't align | Show offending note + suggested time |
| `RHY_W_HIGH_LATENCY` | Audio latency > target but < limit | Tighten audio buffer (degrades dropout margin) |

## Integration Points

- **Audio/streaming**: gapless music + sample-accurate playhead. → `docs/specs/audio/streaming.md`.
- **HAL**: hardware-timestamped input. → `docs/specs/core/hal.md`.
- **Events**: beat-events broadcast to gameplay systems (e.g., enemies move on beat in NecroDancer). → `docs/specs/core/events.md`.
- **Agent/replay**: rhythm is naturally replayable — replay input log + same chart + same audio = identical judgments. → `docs/specs/agent/replay.md`.
- **Editor**: chart authoring UI → `docs/specs/editor/overview.md` (chart editor as plugin).
- **Net**: not natively a multiplayer concern; PVP rhythm games sync judgments not state. Out of scope for v1.

## Scenario test (starter)

`scenarios/rhythm-frame-perfect.scenario.toml`:

```toml
[scene]
template = "rhythm-test-chart"
[setup]
chart           = "assets/charts/test-128bpm.chart"
audio           = "assets/music/test-128bpm.ogg"
device_offset_ms = 0
[actions]
- { tick = 1,   action = "play_chart" }
- { tick = 100, action = "input", lane = 0, audio_time_ms = 469.0 }     # exact note
- { tick = 200, action = "input", lane = 1, audio_time_ms = 940.0 }     # +2 ms
- { tick = 300, action = "input", lane = 2, audio_time_ms = 1450.0 }    # +44 ms
[asserts]
- { tick = 100, predicate = "judgment(0) == Perfect" }
- { tick = 200, predicate = "judgment(1) == Perfect" }
- { tick = 300, predicate = "judgment(2) == Good" }
- { tick = 300, predicate = "audio_latency_ms < 10" }
```

## Test Requirements

- Audio clock advances sample-accurately; never jumps backward.
- Input at exact note time → Perfect judgment.
- Input at +20 ms → Great; +50 ms → Good; +100 ms → Miss.
- Audio dropout (forced) → game pauses, resumes correctly after recovery.
- Calibration: 10 s of taps at known offset → engine recovers within ± 5 ms.
- 1000 simultaneous notes (stress) → no judgment lookup > 10 µs.
- Replay: record session → replay produces identical judgments.

## Prior Art

- Crypt of the NecroDancer — rhythm-roguelike (gameplay is rhythm-locked). [VERIFY — Brace Yourself dev posts].
- Beat Saber — VR rhythm; sub-frame timing required. [VERIFY — Beat Games tech URL].
- osu! — open-source rhythm game; canonical .osu chart format. https://osu.ppy.sh.
- StepMania / DDR community — chart authoring conventions. https://www.stepmania.com.
- Friday Night Funkin' — open-source rhythm game (Haxe). https://github.com/FunkinCrew/Funkin.
- *Inspired by*: "Audio Programming for Games" (Phil Burk) — audio-clock-as-time pattern.
- *Inspired by*: PortAudio / RtAudio low-latency conventions.

## Open Questions

- `[DECISION NEEDED]` Chart format: invent (.chart TOML) vs adopt .osu (huge community) vs both (parser per format).
- `[DECISION NEEDED]` Hit-window defaults: stricter (Beat Saber-style 16 ms) vs friendlier (osu!-style 50 ms standard).
- `[BENCHMARK NEEDED]` End-to-end latency on web (WebAudio + browser input latency) — likely worst-case 50 ms+.
- `[DECISION NEEDED]` Latency calibration per-device (keyboard, controller, touch) or one global offset?
- `[DECISION NEEDED]` Multiplayer rhythm — defer or include? Lean defer; PVP rhythm is niche.
