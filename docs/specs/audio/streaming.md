<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Audio — Streaming & Decoding

> Async decode of audio assets into ring buffers consumed by the audio thread, with memory-mapped file access for low-overhead streaming of large stems and music.

## Boundaries
- Owns: decoder registry (per format), decoder workers, streaming ring buffer per voice, prefetch policy, memory-mapped file handles, seek/loop logic for streamed sources, audio-asset cache.
- Does NOT own:
  - File I/O primitives → `→ docs/specs/core/hal.md` [AGENT: 02]
  - Asset registry / UUID resolution → `→ docs/specs/assets/registry.md` [AGENT: 09]
  - General asset streaming infra → `→ docs/specs/assets/streaming.md` [AGENT: 09]
  - Voice playback / spatial → `→ docs/specs/audio/overview.md`, `→ docs/specs/audio/spatial.md`
- Depends on:
  - `→ docs/specs/core/jobs.md` [AGENT: 02] — decoder worker pool
  - `→ docs/specs/core/memory.md` [AGENT: 02] — pooled ring buffers
  - `→ docs/contracts/core-audio.md` [AGENT: 14]

## Architecture

```
   Asset path / UUID
         │
         ▼
   ┌─────────────────┐         ┌──────────────────────┐
   │ Asset Registry  │────────▶│ Audio Asset Cache    │
   └─────────────────┘         └──────────┬───────────┘
                                          │
                  ┌───────────────────────┼─────────────────────────┐
                  ▼                       ▼                         ▼
        SoundData::Static          SoundData::Streaming      SoundData::Procedural
        (fully decoded             (mmap + chunked decode)    (callback / synth)
         into RAM)
                  │                       │                         │
                  ▼                       ▼                         ▼
            shared PCM             ring buffer per voice      no buffer
                  │                       ▲                         │
                  │                       │ refill                  │
                  │                       │                         │
                  │              ┌────────┴─────────┐                │
                  │              │ Decoder Workers  │ (job pool)     │
                  │              │  ogg/mp3/wav/    │                │
                  │              │  flac/opus       │                │
                  │              └──────────────────┘                │
                  ▼                       ▼                         ▼
                          Audio Thread (consumes frames, never blocks)
```

## Static vs Streaming

| Property       | Static                          | Streaming                              |
|----------------|---------------------------------|----------------------------------------|
| Decode         | once at load                    | incremental, on worker thread          |
| RAM            | full PCM resident               | ring buffer only (~64–256 KB)          |
| Voice cost     | very low                        | low (worker schedules refills)         |
| Seek latency   | free                            | one block + decoder seek               |
| Use for        | one-shots, SFX, short stingers  | music, dialogue, ambience              |
| Default cutoff | ≤ 5 s asset → static            | > 5 s → streaming `[DECISION NEEDED]`  |

## Public API

```rust
pub enum SoundData {
    Static(Arc<StaticSound>),
    Streaming(StreamingSoundDescriptor),
    Procedural(Arc<dyn ProceduralSource>),
}

pub struct StaticSound {
    pub channels: u16,
    pub sample_rate: u32,
    pub frames: Arc<[Frame]>,   // shared, immutable, cache-friendly
}

pub struct StreamingSoundDescriptor {
    pub asset: AssetHandle,
    pub buffer_seconds: f32,      // default 2.0
    pub prefetch_seconds: f32,    // default 1.0
    pub loop_region: Option<(SamplePos, SamplePos)>,
    pub start_offset: SamplePos,
}

pub trait ProceduralSource: Send + Sync {
    fn channels(&self) -> u16;
    fn sample_rate(&self) -> u32;
    fn generate(&mut self, out: &mut [Frame], ctx: ProcessCtx);
}

impl AudioEngine {
    pub fn load_static(&self, asset: AssetHandle) -> SoundHandle;       // blocks decode? no — returns handle, ready event when done
    pub fn load_streaming(&self, asset: AssetHandle) -> SoundHandle;    // opens mmap, starts prefetch
    pub fn unload(&self, h: SoundHandle);
    pub fn cache_budget(&self) -> CacheStats;
}
```

## Decoder Registry

```rust
pub trait Decoder: Send {
    fn open(reader: Box<dyn ReadSeekSend>) -> Result<Self, AudioError>;
    fn info(&self) -> StreamInfo;                 // channels, rate, total_frames
    fn seek(&mut self, frame: SamplePos) -> Result<(), AudioError>;
    fn decode(&mut self, out: &mut [Frame]) -> usize; // frames written
}
```

Built-in decoders (v1.0):

| Format | Library                  | License notes                                  |
|--------|--------------------------|------------------------------------------------|
| WAV    | in-tree (trivial)        | n/a                                            |
| FLAC   | `claxon` or `symphonia`  | Apache-2.0/MIT — compatible                    |
| OGG/Vorbis | `lewton` or `symphonia` | MIT/Apache — compatible                     |
| Opus (file) | `audiopus`/`symphonia`/native opus crate | BSD-3 — compatible                |
| MP3    | `symphonia-bundle-mp3`   | MPL 2.0 — `[DECISION NEEDED]` MIT-only stance? |
| AAC    | not in v1.0              | patent risk → defer                            |

`[DECISION NEEDED]` Unify on **Symphonia** (single crate, multi-format, MIT/Apache) vs cherry-pick per-format.

## Memory-Mapped Decoding

For large assets:
1. HAL opens file as mmap (`mmap` on POSIX, `MapViewOfFile` on Windows, `<file>` over `fetch` for WASM).
2. Decoder wraps the mmap as `ReadSeekSend`.
3. Worker reads + decodes a chunk (e.g., 256 KB compressed → ~1 MB PCM), pushes into the voice's ring buffer.
4. Audio thread pops frames; if underrun risk, telemetry warns and the worker priority bumps.

Web/WASM: no mmap; uses chunked Fetch + `ReadableStream` backed by `IndexedDB` cache.

## Sample-Rate Conversion (SRC)

- Source sample rate may differ from engine rate.
- Default: high-quality polyphase resampler (libsamplerate-style) `[DECISION NEEDED]` build vs depend.
- Cost amortized in decoder worker, not on audio thread.
- Pitch-shift (variable rate during playback) handled separately by DSP `→ docs/specs/audio/dsp.md`.

## Memory Budget

| Setting                     | Default            |
|-----------------------------|--------------------|
| Per streaming voice buffer  | 2 s × 48 kHz × 2 ch × 4 B = 768 KB |
| Static cache (desktop)      | 256 MB             |
| Static cache (mobile)       | 64 MB              |
| Decoder worker count        | min(4, hw_threads) |
| Max concurrent streams      | 32 (desktop) / 8 (mobile) |

Eviction: LRU. Streaming sound never evicted while voice references it.

## Prefetch & Loop

- On `play`, decoder seeks to `start_offset`; refill primes `prefetch_seconds`.
- Loop region: decoder seeks back when `loop_end` is reached; seamless if loop point is at a sample boundary in source.
- Crossfade looping option for non-sample-accurate loops.

## Performance Contract

| Metric                                | Target          | Hard limit      |
|---------------------------------------|-----------------|-----------------|
| Streaming refill latency              | < 1 ms median   | < 5 ms p99      |
| Underruns at 32 streams (desktop)     | 0 over 60 min   | 0               |
| Decode CPU (OGG, 48 kHz stereo)       | < 1 % per stream | < 3 %          |
| Seek-to-first-frame                   | < 50 ms         | < 200 ms        |
| Static load time (10 MB OGG)          | < 200 ms async  | < 1 s           |
| Allocations on audio thread           | 0               | 0 (hard)        |
| Mmap fault on audio thread            | 0               | 0 (hard — buffered through worker) |

## Error Contract

| Code                          | Meaning                                       | Caller action                  |
|-------------------------------|-----------------------------------------------|--------------------------------|
| `STREAM_FORMAT_UNSUPPORTED`   | No decoder registered for asset MIME/extension| add decoder or reject asset    |
| `STREAM_DECODE_ERROR`         | Decoder failed mid-stream                     | engine inserts silence + event |
| `STREAM_FILE_NOT_FOUND`       | mmap target missing                           | check asset registry           |
| `STREAM_BUFFER_UNDERRUN`      | Worker missed refill deadline                 | telemetry; engine inserts silence |
| `STREAM_SEEK_OUT_OF_RANGE`    | `start_offset` past EOF                       | clamp to total_frames          |
| `STREAM_CACHE_FULL`           | Static load exceeded cache budget             | unload or raise budget         |

## Integration Points

- **Asset pipeline** (`→ docs/specs/assets/streaming.md` [AGENT: 09]): audio assets are streamed through the shared async I/O scheduler; audio system uses a *dedicated lane* with realtime priority.
- **Voice playback** (`→ docs/specs/audio/overview.md`): each streaming voice owns a `RingConsumer<Frame>`; refill worker owns `RingProducer<Frame>`.
- **Adaptive music** (`→ docs/specs/audio/adaptive.md`): stems are streamed, kept warm in cache while music graph is loaded.
- **Voice chat** (`→ docs/specs/audio/voice.md`): network voice packets are an *inbound* streaming source (Opus decode), routed through the same `Decoder` trait pattern.
- **Headless / deterministic** modes still decode and mix; only output device is bypassed.

## Test Requirements

- 32 concurrent streaming voices, 10 minutes: 0 underruns.
- Static cache fills to budget → LRU evicts oldest unreferenced sounds; current voices unaffected.
- Mid-stream decode error → silence inserted, `STREAM_DECODE_ERROR` event emitted, voice keeps running and recovers at next sync point.
- Seek to arbitrary loop point in 60-minute OGG: < 200 ms.
- Mmap'd 500 MB FLAC: only ~1 MB resident PCM per voice (verify with RSS sampling).
- Web/WASM target: chunked fetch + IndexedDB caching; works offline after first load.
- Deterministic mode: identical decode output across runs given same seeded SRC dithering.

## Prior Art

- `pdeljanov/Symphonia` ✓ pure-Rust, multi-format, demuxer+decoder split.
- `RustAudio/lewton` ✓ Vorbis-only, mature, MIT.
- `xiph/opus` ✓ canonical Opus encoder/decoder, BSD.
- `tesselode/kira` `StreamingSoundData` ✓ ring-buffer + worker model.
- `mackron/miniaudio` ✓ multi-format integrated approach.
- FMOD sample bank streaming ✓ bank format concept (consider `.nxbank`).

## Open Questions

- `[DECISION NEEDED]` Standardize on Symphonia, or per-format crates for smaller WASM bundle?
- `[DECISION NEEDED]` Include MP3 (MPL-2.0 dep) given MIT-everything mandate? Workaround: feature-flag MP3 off by default.
- `[DECISION NEEDED]` Custom soundbank format (`.nxbank`) — pack many sounds + metadata in one file?
- `[BENCHMARK NEEDED]` 32-stream worst-case on iOS w/ system file cache.
- `[DECISION NEEDED]` Opus-in-Ogg as recommended default format for VO and music (lower size than Vorbis)?
- `[DECISION NEEDED]` Lossy decode → fixed-point pipeline for deterministic mode?
