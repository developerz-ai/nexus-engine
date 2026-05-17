<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Audio — Overview

> The audio engine: a lock-free graph of nodes (sources → effects → buses → output) driven on a dedicated real-time thread, with full headless and deterministic modes for AI agents.

## Boundaries
- Owns: device I/O, audio graph, mixer/bus tree, voice allocation, sample-rate conversion, master clock, audio events, telemetry per bus, headless/deterministic mix.
- Does NOT own:
  - Asset loading/decoding policy → `→ docs/specs/audio/streaming.md` + `→ docs/specs/assets/streaming.md` [AGENT: 09]
  - DSP algorithm internals → `→ docs/specs/audio/dsp.md`
  - 3D spatialisation math → `→ docs/specs/audio/spatial.md`
  - Music state machines → `→ docs/specs/audio/adaptive.md`
  - Voice chat capture/network → `→ docs/specs/audio/voice.md` + `→ docs/specs/networking/transport.md` [AGENT: 07]
- Depends on:
  - `→ docs/contracts/core-audio.md` [AGENT: 14] — entity transform feed, event triggers, ECS hooks
  - `→ docs/specs/core/jobs.md` [AGENT: 02] — decode/resample jobs off the audio thread
  - `→ docs/specs/core/hal.md` [AGENT: 02] — device enumeration, callback hosting

## Architecture

```
                            ECS / Scripts / Agent API
                                      │  (audio events: structured)
                                      ▼
                              ┌───────────────┐
                              │ Event Router  │  lock-free SPSC queues
                              └───────┬───────┘
                                      ▼
        ┌─────────────────────────────────────────────────────────────┐
        │                       Audio Graph                            │
        │                                                              │
        │  Sources               Effect Chains          Bus Tree       │
        │  ┌──────┐  ┌──────┐    ┌─────┐ ┌─────┐    ┌──────────────┐   │
        │  │static│─▶│spatl│───▶ │ EQ  ▶│comp │ ──▶ │ bus: sfx     │   │
        │  └──────┘  └──────┘    └─────┘ └─────┘    │   ├ footsteps │   │
        │  ┌──────┐  ┌──────┐    ┌─────┐            │   └ weapons   │   │
        │  │stream│─▶│ gain │───▶│verb │ ────────▶  │ bus: music    │──┐│
        │  └──────┘  └──────┘    └─────┘            │ bus: voice    │  ││
        │  ┌──────┐                                 │ bus: ui       │  ││
        │  │ proc │──────────────────────────────▶  │ bus: ambient  │  ││
        │  └──────┘                                 └──────┬───────┘   ││
        │                                                  ▼           ││
        │                                          ┌──────────────┐    ││
        │                                          │  master bus  │◀───┘│
        │                                          └──────┬───────┘     │
        │                                                 ▼              │
        │                                ┌──────────────────────────┐   │
        │                                │ Output Driver (cpal/HAL) │   │
        │                                └──────────────────────────┘   │
        └──────────────────────────────────────────────────────────────┘
                                      ▲
                                      │  (telemetry: per-bus peak/rms/clip)
                              ┌───────┴───────┐
                              │  Telemetry    │── frame-stamped JSON
                              └───────────────┘
```

- One **audio thread** owns the graph. Gameplay → audio: lock-free SPSC ring (commands). Audio → gameplay: lock-free MPSC ring (events: voice_finished, marker_hit).
- **Chunked processing** (block size 64–512 frames). Inspired by `tesselode/kira` block-based design.
- **Backend:** `cpal` for native (Linux/Win/Mac/Android/iOS), WebAudio worklet for WASM, `miniaudio` as fallback embedded backend `[DECISION NEEDED]`.

## Public API

```rust
// Engine handle (created from main thread)
pub struct AudioEngine { /* ... */ }
pub struct AudioConfig {
    pub sample_rate: u32,           // 48000 default
    pub block_size: u32,            // 256 default
    pub max_voices: u32,            // 256 default
    pub backend: Backend,           // Auto | Cpal | Miniaudio | WebAudio | Headless | Deterministic{seed:u64}
    pub channel_layout: ChannelLayout, // Mono|Stereo|Quad|Surround5_1|Surround7_1|Ambisonic1|Binaural
}
impl AudioEngine {
    pub fn new(cfg: AudioConfig) -> Result<Self, AudioError>;
    pub fn tick(&mut self, dt: Duration);                // pumps event queue; non-blocking
    pub fn shutdown(self);
}

// Buses
pub struct BusId(u32);
pub struct BusBuilder { /* name, parent, gain_db, effects */ }
impl AudioEngine {
    pub fn bus(&self, name: &str) -> Option<BusId>;
    pub fn create_bus(&mut self, b: BusBuilder) -> BusId;
    pub fn set_bus_gain(&self, bus: BusId, gain_db: f32, tween: Tween);
    pub fn mute_bus(&self, bus: BusId, muted: bool);
    pub fn solo_bus(&self, bus: BusId, solo: bool);
}

// Voices
pub struct VoiceId(u64);
pub struct PlayParams { pub bus: BusId, pub gain_db: f32, pub pitch: f32, pub loop_: bool, pub spatial: Option<SpatialParams>, pub start_time: AudioTime }
impl AudioEngine {
    pub fn play(&self, asset: SoundHandle, p: PlayParams) -> VoiceId;
    pub fn stop(&self, v: VoiceId, fade: Tween);
    pub fn set_param(&self, v: VoiceId, key: ParamKey, value: f32, tween: Tween);
}

// Audio events (structured, AI-readable)
pub struct AudioEvent { pub kind: AudioEventKind, pub voice: Option<VoiceId>, pub time: AudioTime, pub data: serde_json::Value }
pub enum AudioEventKind { Started, Stopped, LoopRestart, MarkerHit{name:String}, ClipDetected{bus:BusId}, BufferUnderrun }
impl AudioEngine {
    pub fn drain_events(&self, sink: &mut Vec<AudioEvent>);
}

// Tween (parameter smoothing — kira-inspired)
pub enum Tween { Instant, Linear(Duration), Easing{dur:Duration, curve:Easing} }
```

Full type list: `→ docs/contracts/core-audio.md` [AGENT: 14].

## Performance Contract

| Metric                                | Target          | Hard limit        |
|---------------------------------------|-----------------|-------------------|
| Output latency (desktop, 256 frames)  | ≤ 10 ms         | ≤ 20 ms           |
| Output latency (mobile)               | ≤ 20 ms         | ≤ 40 ms           |
| Output latency (web)                  | ≤ 30 ms         | ≤ 50 ms           |
| Audio thread CPU @ 128 voices         | ≤ 5 % one core  | ≤ 15 %            |
| Allocations on audio thread           | 0               | 0 (hard)          |
| Locks on audio thread                 | 0               | 0 (hard)          |
| Command latency (gameplay → audible)  | ≤ 1 block       | ≤ 2 blocks        |
| Max simultaneous voices               | 256             | 1024 `[BENCHMARK NEEDED]` |
| Glitch-free under 100 % main-thread stall | yes        | yes (mandatory)   |

## Error Contract

| Code                          | Meaning                                        | Caller action                          |
|-------------------------------|------------------------------------------------|----------------------------------------|
| `AUDIO_DEVICE_NOT_FOUND`      | No output device available                     | fall back to headless or retry         |
| `AUDIO_DEVICE_LOST`           | OS revoked device (sleep/unplug)               | engine auto-restarts; surface telemetry|
| `AUDIO_FORMAT_UNSUPPORTED`    | Requested sample-rate/channel layout invalid   | re-init with `AudioConfig::default()`  |
| `AUDIO_VOICE_LIMIT`           | `play()` would exceed `max_voices`             | use voice priority or higher limit     |
| `AUDIO_BUS_NOT_FOUND`         | Bus id invalid (likely after live edit)        | re-query `bus(name)`                   |
| `AUDIO_GRAPH_CYCLE`           | `create_bus` would create a cycle              | restructure parent chain               |
| `AUDIO_BUFFER_UNDERRUN`       | Audio thread missed deadline                   | telemetry-only, no caller action       |

All errors are structured per principle (3) — `→ docs/architecture/01-principles.md` [AGENT: 01].

## Integration Points

- **ECS** (`→ docs/contracts/core-audio.md`): `AudioListener`, `AudioEmitter`, `AudioVoice` components; transform sync each frame at variable rate (audio reads latest snapshot).
- **Scripting** (`→ docs/contracts/core-scripting.md` [AGENT: 14]): `audio.play("sword_swing", {bus="sfx"})`.
- **Agent API** (`→ docs/contracts/core-agent.md` [AGENT: 14]): subscribe to `AudioEvent` stream; mute master in headless; deterministic seed for replay tests.
- **Assets** (`→ docs/contracts/renderer-assets.md` analog `audio-assets` [AGENT: 14]): `SoundHandle` resolves through asset registry; streamed sounds bypass main RAM.
- **Networking** (`→ docs/specs/networking/replication.md` [AGENT: 07]): audio events are deterministic given replicated input + seed; voice chat audio is a separate path `→ voice.md`.
- **Editor** (`→ docs/specs/editor/debug.md` [AGENT: 11]): bus mixer panel reads telemetry stream.

## Headless & Deterministic Modes (AI-first)

| Mode                    | Device opened | Mix runs | Output written | Use                                       |
|-------------------------|---------------|----------|----------------|-------------------------------------------|
| `Backend::Cpal`         | yes           | yes      | speakers       | normal                                    |
| `Backend::Headless`     | no            | yes      | discarded      | CI, agent training, scenario runs         |
| `Backend::Deterministic{seed}` | no     | yes (fixed clock) | optional WAV file | replay tests, regression diffs    |

Deterministic mode: fixed `block_size`, fixed `sample_rate`, seeded RNG inside any effect that uses noise (e.g. reverb diffusion). Two runs with identical input streams produce **bit-identical** mix buffers. Required by principle (5) — deterministic replay.

## Telemetry

Emitted every audio block, batched per gameplay frame:

```json
{
  "t": 12345,                          // master clock sample index
  "buses": {
    "master": {"peak_db":-3.1,"rms_db":-12.4,"clip":false,"voices":47},
    "sfx":    {"peak_db":-6.8,"rms_db":-18.0,"clip":false,"voices":31},
    "music":  {"peak_db":-9.2,"rms_db":-15.7,"clip":false,"voices":4}
  },
  "voices_active": 47,
  "voices_dropped": 0,
  "underruns": 0,
  "cpu_pct": 3.2
}
```

Consumed by editor mixer panel, agent SDK, and CI assertions.

## Test Requirements

- `play` → `Started` event delivered within 2 blocks.
- 256 voices on master bus for 60 s: 0 underruns, 0 allocations on audio thread.
- `Backend::Deterministic{seed:1}` twice with identical script → bit-identical WAV.
- Bus cycle attempt rejected with `AUDIO_GRAPH_CYCLE`.
- Device unplug → reconnect: voices resume within 500 ms, no panic.
- Headless mode: full scene of 1000 events runs at ≥ 100× realtime.

## Prior Art

- `tesselode/kira` ✓ chunked processing, tween system, hybrid command/ring design.
- `mackron/miniaudio` ✓ portable backend abstraction, low-latency callback contract.
- `RustAudio/cpal` ✓ thin native device wrapper; we wrap it for hot-swap.
- FMOD Studio ✓ bus tree, events as the gameplay-facing primitive. ✗ closed source, licensing.
- Audiokinetic Wwise ✓ event/state/RTPC model, soundbank streaming. ✗ closed source.
- Web Audio API ✓ graph model. ✗ main-thread coupling (we use AudioWorklet).

## Open Questions

- `[DECISION NEEDED]` Fallback backend (miniaudio FFI vs pure-Rust `cpal` only)?
- `[DECISION NEEDED]` Default block size — 128 (latency) vs 256 (CPU headroom)?
- `[DECISION NEEDED]` Should bus topology be hot-reloadable at runtime or scene-load only?
- `[BENCHMARK NEEDED]` 1024-voice ceiling on a mid-range mobile (Snapdragon 7 Gen 1).
- `[DECISION NEEDED]` Surround formats: ship 7.1 in v1.0 or v1.1?
