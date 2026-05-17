<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Rhythm Quick-Start

> Day 1: Beat Saber-style frame-perfect input. Tap to the beat, score per judgment.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| Low-latency audio backend (CoreAudio / WASAPI / PipeWire) | required |
| Hardware-timestamped input (USB keyboard or controller) | recommended |

## Scaffold

```
nexus new mygame --template rhythm
cd mygame
nexus rhythm calibrate         # one-time per-device latency calibration
nexus run
```

Day 1 result: a 4-lane chart at 128 BPM. Notes scroll down. Hit the matching lane key at the right time. Perfect/Great/Good/Miss feedback per hit.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "audio", "scripting"]

[style]
preset = "2d"

[genres]
primary = "platformer"   # rhythm not yet a canonical genre; platformer fits enough

[rhythm]
sample_rate           = 48000
hit_window_perfect_ms = 16
hit_window_great_ms   = 32
hit_window_good_ms    = 64

[rhythm.calibration]
required          = true
default_offset_ms = 0

[rhythm.input]
poll_rate_hz       = 1000
hardware_timestamp = true

[audio]
backend       = "lowlatency"
buffer_size   = 256          # ~5 ms at 48 kHz

[crates]
nexus-rhythm-beat-grid          = "1.0"
nexus-rhythm-latency-calibrate  = "1.0"
nexus-rhythm-input-timestamp    = "1.0"
nexus-rhythm-judgment           = "1.0"
nexus-audio-streaming           = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-rhythm-beat-grid` | beat-grid data + .chart parser |
| `nexus-rhythm-latency-calibrate` | calibration UI flow + per-device offsets |
| `nexus-rhythm-input-timestamp` | high-precision input timestamp pipeline |
| `nexus-rhythm-judgment` | hit-window classifier |
| `nexus-audio/streaming` | gapless music + sample-accurate playhead |
| `nexus-core/hal` | hardware-timestamped input |

→ Full spec: `docs/specs/rhythm-game/overview.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs
  scripts/
    ui/
      score-display.lua
      hit-feedback.lua    # "PERFECT!" pop-up logic
  assets/
    charts/
      test-128bpm.chart
      song-easy.chart
      song-hard.chart
    music/
      test-128bpm.ogg
      song.ogg
  scenarios/
    rhythm-frame-perfect.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_rhythm_beat_grid::RhythmPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(RhythmPlugin::default())
        .add_startup_system(load_chart)
        .add_system(handle_input)
        .run();
}

fn load_chart(mut r: ResMut<Rhythm>, assets: Res<AssetServer>) {
    let chart = r.load_chart("charts/test-128bpm.chart").unwrap();
    r.play(chart);
}

fn handle_input(mut r: ResMut<Rhythm>, input: Res<Input>) {
    for ev in input.key_events_with_timestamps() {
        match ev.key {
            Key::D => { let j = r.on_input(0, ev.audio_time_ms); /* ... */ },
            Key::F => { let j = r.on_input(1, ev.audio_time_ms); /* ... */ },
            Key::J => { let j = r.on_input(2, ev.audio_time_ms); /* ... */ },
            Key::K => { let j = r.on_input(3, ev.audio_time_ms); /* ... */ },
            _ => {}
        }
    }
}
```

## Chart authoring

```toml
# assets/charts/test-128bpm.chart
[chart]
title       = "Test Song"
bpm         = 128
offset_ms   = 200
difficulty  = "easy"
lanes       = 4

# 4-on-the-floor for 4 bars
[[chart.pattern]]
start_beat   = 0
length_beats = 16
pattern      = "x . . . x . . . x . . . x . . ."
lane         = 0
```

## Starter scenario test

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
- { tick = 100, action = "input", lane = 0, audio_time_ms = 469.0 }
- { tick = 200, action = "input", lane = 1, audio_time_ms = 940.0 }
- { tick = 300, action = "input", lane = 2, audio_time_ms = 1450.0 }
[asserts]
- { tick = 100, predicate = "judgment(0) == Perfect" }
- { tick = 200, predicate = "judgment(1) == Perfect" }
- { tick = 300, predicate = "judgment(2) == Good" }
- { tick = 300, predicate = "audio_latency_ms < 10" }
```

## Calibration flow

```
nexus rhythm calibrate
```

Plays a click track at 120 BPM. User taps with the beat for 10 s. Engine computes per-device latency offset, stores in user profile. Auto-applied on every game launch.

## Next steps

| You want | Add |
|---|---|
| 3D rhythm (Beat Saber sabers in VR) | `nexus add nexus-platform-openxr` and switch camera to VR |
| Custom chart editor | nexus has built-in chart editor in `docs/specs/editor/overview.md` |
| Voice / lyric sync (karaoke) | `nexus add nexus-text-rich-render`; sync lyric reveal to beat |
| Multiplayer score race | `nexus add nexus-net-quic`; send per-judgment events |
| Online song library | `nexus add nexus-asset-source-rhythm-charts` (community) |

## Cross-links

→ `docs/specs/rhythm-game/overview.md`
→ `docs/specs/audio/streaming.md`
→ `docs/specs/core/hal.md`
→ `docs/architecture/08-compose-dont-build.md` (frame-perfect timing is a from-scratch nightmare; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe rhythm-quickstart
```
