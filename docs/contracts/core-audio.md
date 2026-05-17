<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Audio

> Core feeds entity positions + sound-trigger events; audio system mixes, spatializes, and pushes samples to the OS in real time on its own thread.

Related specs:
- `docs/specs/core/ecs.md` · `docs/specs/core/events.md` · `docs/specs/core/hal.md`
- `docs/specs/audio/overview.md` · `docs/specs/audio/spatial.md` · `docs/specs/audio/adaptive.md` · `docs/specs/audio/streaming.md`
- Sibling: `docs/contracts/renderer-assets.md` (asset upload shares the streaming protocol)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (ECS, events) | `nexus-core` | `crates/core/src/lib.rs` |
| Provider (audio device) | `nexus-hal` | `crates/hal/src/audio.rs` (CPAL wrapper) |
| Consumer / mixer | `nexus-audio` | `crates/audio/src/lib.rs` (impl `Plugin`) |

Pattern reference: CPAL stream callback model (`RustAudio/cpal`) + Kira's lock-free command queue (`tesselode/kira`). Audio thread MUST NEVER block or allocate.

---

## Call flow

```
 ECS thread (variable rate)
   │
   ├── audio::extract(&World) ── snapshot Listener + Emitter components
   │           │
   │           ▼ (lock-free SPSC ring: AudioCmd)
   │   ┌─────────────────┐
   │   │  command ring   │
   │   └─────────────────┘
   │           ▲
   │           │ push() (also: play(asset_id), set_param, stop, fade)
   │           │
   │           │
 ──────────────┼──────────────────────── thread boundary ───────────────
   │           │
   │           ▼
   │   audio thread (CPAL callback, real-time priority)
   │     drain commands → mixer state
   │     mix N samples → spatialize (HRTF) → DSP chain → device buffer
   │           │
   │           ▼ (lock-free SPSC ring: AudioEvent)
   ECS thread drains AudioEvents next frame → EventBus
```

---

## Provided API (Audio surface that Core calls)

```rust
pub trait AudioBackend: Send + Sync + 'static {
    fn init(&mut self, cfg: &AudioConfig) -> Result<(), AudioError>;

    /// Snapshot Listener + Emitter components and push position/orientation
    /// updates into the audio thread's command ring.
    /// MUST be wait-free; never blocks if ring is full (drops oldest update).
    fn extract(&mut self, world: &World) -> Result<(), AudioError>;

    /// Drain events the audio thread published (clip ended, stream underrun).
    fn drain_events(&mut self, bus: &EventBus) -> Result<usize, AudioError>;

    // --- Direct, callable from any ECS system ---
    fn play(&self, req: PlayRequest) -> Result<VoiceHandle, AudioError>;
    fn stop(&self, voice: VoiceHandle, fade_ms: u32);
    fn set_param(&self, voice: VoiceHandle, p: VoiceParam, v: f32);
    fn set_bus_volume(&self, bus: BusId, gain_db: f32);
    fn post_music_intensity(&self, intensity: f32);     // see adaptive.md
}
```

## Required API (Core surface that Audio calls)

```rust
pub fn world(&self) -> &World;
pub fn events(&self) -> &EventBus;
pub fn time(&self) -> Time;
pub fn assets(&self) -> &AssetRegistry;       // for streamed audio
```

Components audio reads:

| Component | Access | Notes |
|---|---|---|
| `Transform` (global) | R | position + forward/up for spatialization |
| `Listener { gain_db, hrtf: bool }` | R | exactly one is "primary"; tag `PrimaryListener` |
| `Emitter { voice: Option<VoiceHandle>, attenuation, dop_factor }` | R | |
| `Velocity` (optional) | R | Doppler input |
| `SoundOccluder` (optional) | R | for occlusion ray queries |

---

## Data Schema

```rust
pub struct AudioConfig {
    pub sample_rate_hz: u32,           // 48000 default
    pub channels: u16,                 // 2 stereo, 6 = 5.1
    pub buffer_frames: u32,            // 256 / 512 / 1024
    pub max_voices: u32,               // 256 default
    pub spatial_model: SpatialModel,   // None | Pan | Hrtf
    pub master_gain_db: f32,
}

pub struct PlayRequest {
    pub clip: AssetId,                 // see docs/contracts/renderer-assets.md (shared AssetId)
    pub bus: BusId,                    // Master | Sfx | Music | Voice | Custom(u16)
    pub gain_db: f32,
    pub pitch: f32,                    // 1.0 = normal
    pub spatial: Option<EntityId>,     // None = 2D
    pub loop_: bool,
    pub fade_in_ms: u32,
    pub priority: u8,                  // 0 = lowest, voice stealing target
}

pub struct VoiceHandle { gen: u32, slot: u16 }    // generational, stable across frames

pub enum VoiceParam { Gain, Pitch, LowPass, HighPass, ReverbSend }

pub enum AudioEvent {
    VoiceStarted { voice: VoiceHandle, clip: AssetId, frame: FrameId },
    VoiceEnded   { voice: VoiceHandle, reason: EndReason },
    StreamUnderrun { count: u32, ts_ns: u64 },     // SLO violation
    DeviceLost { reason: String },
}

pub enum EndReason { Natural, Stopped, Stolen, Error }
```

Lock-free command type sent ECS → audio thread:

```rust
#[repr(C)] pub enum AudioCmd {
    Play(PlayRequest, VoiceHandle),
    Stop { voice: VoiceHandle, fade_ms: u32 },
    SetParam { voice: VoiceHandle, p: VoiceParam, v: f32 },
    UpdateEmitter { voice: VoiceHandle, pos: Vec3, vel: Vec3 },
    UpdateListener { pos: Vec3, fwd: Vec3, up: Vec3, vel: Vec3 },
    SetBusGain { bus: BusId, db: f32 },
    MusicIntensity(f32),
}
```

JSON wire fragment (telemetry `channel: "audio.frame"`):

```json
{"schema":1,"frame":4122,"voices_active":48,"voices_capped":0,"underruns":0,"cpu_load_pct":3.2,"bus_peak_db":{"master":-6.1,"sfx":-12.4,"music":-9.0}}
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Audio | `play()` returns a `VoiceHandle` synchronously; `VoiceStarted` event arrives ≤ 2 audio buffers later. |
| O-2 | Audio | If `max_voices` exceeded, lowest-`priority` voice is stolen; `VoiceEnded{Stolen}` is emitted. |
| O-3 | Audio | Generational `VoiceHandle`: stale handles silently no-op on `stop`/`set_param`. |
| O-4 | Audio | Command ring is SPSC, bounded; on overflow, `UpdateEmitter` may be coalesced (latest wins). `Play`/`Stop` are never dropped. |
| O-5 | Core | `Listener` position is read at `extract` time; per-buffer interpolation done in audio thread (no popping). |
| O-6 | Audio | Audio callback never holds a lock that ECS may also acquire. |
| O-7 | Audio | Spatialization is causal: a sound queued at frame N may not be audible until samples after N are mixed. |

---

## Threading & Concurrency Rules

- Audio callback runs on an OS-managed real-time thread (CPAL).
- ZERO allocations in the audio callback. ZERO mutex acquisitions. ZERO syscalls (other than the device write).
- Streamed clips use a separate disk-IO worker thread that fills decoder ring buffers; underrun is reported, never blocks.
- `play()` MAY allocate on the ECS thread (pre-allocated voice pool preferred).
- All cross-thread state uses SPSC ring buffers (one for commands, one for events) or atomic counters (peak meters).
- Audio thread sees `Arc<dyn AudioAsset>` decoded data; ref-count only — no reallocation in callback.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| Output latency (input event → audible) | ≤ 20 ms | 50 ms | 48kHz, 256-frame buffer |
| Audio CPU @ 64 voices, HRTF on | ≤ 5 % | 15 % | one core |
| Audio CPU @ 256 voices, pan only | ≤ 8 % | 20 % | |
| `extract` per frame | ≤ 0.1 ms | 0.5 ms | 1000 emitters |
| `play()` call | ≤ 5 µs | 50 µs | enqueue only |
| Stream underrun rate | 0 | < 0.01/min | else `AUD-020` |
| Command ring overflow | 0/sec | bursts dropped | only `UpdateEmitter` may drop |
| Voice pool memory | ≤ 4 MB | 16 MB | 256 voices × DSP state |

References: CPAL real-time callback contract (`RustAudio/cpal`), Kira lock-free command pattern (`tesselode/kira`), Tracktion Engine "no lock no malloc" rule.

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `AUD-001` | `DeviceInit` | No audio device | Fall back to null device, log; engine continues silently |
| `AUD-002` | `FormatUnsupported` | sample rate/format not available | Auto-resample to nearest; log |
| `AUD-010` | `AssetMissing` | clip `AssetId` not loaded | Drop play request; emit error to bus |
| `AUD-011` | `AssetWrongType` | asset is not audio | Drop; log |
| `AUD-020` | `Underrun` | output underran | Telemetry; recover next buffer |
| `AUD-021` | `VoiceStarvation` | priority too low, never plays | `VoiceEnded{Stolen}` immediately |
| `AUD-030` | `DeviceLost` | OS device disappeared | Re-init on next `extract`; pause voices |

---

## Versioning Rule

`nexus-contract-audio = "MAJOR.MINOR.PATCH"`.

- **MAJOR**: change `AudioCmd` layout (binary across thread boundary), change `VoiceHandle` semantics, change `SpatialModel` meaning.
- **MINOR**: new `AudioCmd` variant (non-exhaustive enum), new bus types, new optional component fields, new `VoiceParam`.
- **PATCH**: default sample rate, mixer internals.

`AudioCmd` is `#[repr(C)]` and binary-stable within a MAJOR; both crates pin the same MAJOR via Cargo.

---

## Test Matrix

`tests/contract_core_audio.rs`:

- T-01 Spawn emitter, `play()` → `VoiceStarted` arrives within 2 frames; clip audible (offline render, RMS > -60 dB).
- T-02 Spawn 1000 emitters with looping clips → CPU < hard limit, no underruns.
- T-03 Listener teleport across world → no clicks/pops (interpolation works).
- T-04 Headless mode → `NullAudio` backend; `play()` succeeds, `VoiceStarted` fires; no device.
- T-05 Determinism: with `--headless --deterministic`, offline-rendered output is bit-identical across runs.
- T-06 Stress: 10k `set_param` calls per frame → ring never overflows for `Play`, only `UpdateEmitter` coalesces.
- T-07 Stale `VoiceHandle` → `stop()` is a no-op, no panic.
- T-08 Voice stealing: spawn `max_voices + 10` low-priority sounds → exactly 10 `Stolen` events.

---

## Open Questions

- [DECISION NEEDED] HRTF dataset: vendor MIT KEMAR public domain set, or ship a custom one? License must remain MIT-compatible.
- [DECISION NEEDED] Music adaptivity API: simple `intensity: f32` (Kira-style) or stem-based (FMOD-style)? AGENT 06.
- [DECISION NEEDED] Whether `play()` from inside a Lua/Rune script should go through the same `AudioCmd` ring or through the agent API. → AGENT 08, `docs/contracts/core-scripting.md`.
- [BENCHMARK NEEDED] Real CPU at 256 voices on Android mid-tier (Pixel 6a class).
- [AGENT: 09] Confirm `AssetId` and ref-count semantics for streamed audio match the shared asset model.
- [AGENT: 02] Confirm `EventBus` supports cross-thread push with the bounded SPSC semantics this contract requires.
