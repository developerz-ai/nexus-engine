<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Audio — Voice Chat

> Real-time peer voice: microphone capture → noise suppression → Opus encode → network transport → Opus decode → spatial playback. End-to-end ≤ 100 ms.

## Boundaries
- Owns: capture device handling, voice activity detection (VAD), noise suppression (RNNoise), Opus encode/decode, jitter buffer, packetization, voice-chat-specific channels in audio graph.
- Does NOT own:
  - Network transport → `→ docs/specs/networking/transport.md` [AGENT: 07]
  - Match/lobby session → `→ docs/specs/networking/lobby.md` [AGENT: 07]
  - Spatialisation → `→ docs/specs/audio/spatial.md`
  - Auth / user identity → out of audio scope
- Depends on:
  - HAL audio input device `→ docs/specs/core/hal.md` [AGENT: 02]
  - Networking session API `→ docs/contracts/core-networking.md` [AGENT: 14]
  - Audio graph `→ docs/specs/audio/overview.md`
  - Spatial system (for proximity / positional voice) `→ docs/specs/audio/spatial.md`

## Architecture

```
   ┌─────────────────────────── LOCAL  (sender) ───────────────────────────┐
   │  Mic device ─▶ capture ring ─▶ resample 48k ─▶ HighPass(80Hz)         │
   │                                              │                         │
   │                                              ▼                         │
   │                                          NoiseSuppress (RNNoise)       │
   │                                              │                         │
   │                                              ▼                         │
   │                                          AGC + Compressor              │
   │                                              │                         │
   │                                              ▼                         │
   │                                          VAD (Opus or built-in)        │
   │                                              │ gated                   │
   │                                              ▼                         │
   │                                          Opus encoder (20 ms frames)   │
   │                                              │                         │
   │                                              ▼                         │
   │                                          packetize ─▶ network          │
   └────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────── REMOTE (receiver) ─────────────────────────┐
   │  network ─▶ depacketize ─▶ jitter buffer ─▶ Opus decoder              │
   │                                                       │                │
   │                                                       ▼                │
   │                                                  PLC (on loss)         │
   │                                                       │                │
   │                                                       ▼                │
   │                                            voice-chat source           │
   │                                                       │                │
   │                                                       ▼                │
   │                                       Spatializer (proximity mode)     │
   │                                                       │                │
   │                                                       ▼                │
   │                                                 voice bus              │
   └────────────────────────────────────────────────────────────────────────┘
```

## Public API

```rust
pub struct VoiceConfig {
    pub capture_device: Option<DeviceId>,
    pub sample_rate_capture: u32,         // 48000 recommended
    pub frame_ms: u8,                     // 10 | 20 | 40 | 60 (Opus); default 20
    pub bitrate_bps: u32,                 // 24_000 default
    pub fec: bool,                        // Opus inband FEC
    pub dtx: bool,                        // discontinuous transmission
    pub vad: VadConfig,                   // built-in | opus | always_on | push_to_talk
    pub noise_suppression: NoiseSuppression, // None | RNNoise | Custom
    pub agc: bool,
    pub bus: BusId,                       // default "voice"
    pub spatial: VoiceSpatialMode,        // Stereo | Proximity{ entity_lookup } | None
}

pub enum NoiseSuppression { None, RNNoise, Custom(Box<dyn DenoiseFn>) }

pub enum VoiceSpatialMode {
    Stereo,                                // 2D pan; lobby/menu
    Proximity { entity: EntityId, params: SpatialParams }, // emitter follows entity
    None,
}

impl AudioEngine {
    pub fn voice_start(&self, cfg: VoiceConfig) -> VoiceSession;
    pub fn voice_set_mute(&self, s: &VoiceSession, muted: bool);
    pub fn voice_push_to_talk(&self, s: &VoiceSession, active: bool);
    pub fn voice_peer_attach(&self, s: &VoiceSession, peer: PeerId, mode: VoiceSpatialMode) -> PeerVoiceHandle;
    pub fn voice_peer_detach(&self, h: PeerVoiceHandle);
    pub fn voice_telemetry(&self, s: &VoiceSession) -> VoiceTelemetry;
}

// Inbound packets from networking layer
pub trait VoicePacketSink {
    fn submit(&self, peer: PeerId, seq: u16, ts_ms: u32, opus_payload: &[u8]);
}
```

The networking layer hands raw Opus payloads to the audio engine via `VoicePacketSink`. The audio engine returns encoded outbound payloads via a callback registered at session start. **No direct socket I/O happens in the audio engine.**

## Encoding — Opus

- RFC 6716 reference.
- Modes: SILK (≤ 8 kHz speech), Hybrid (12 kHz), CELT (full-band music). Default: **VoIP application mode**, 24 kbps, 20 ms frames → 48 kbps headroom.
- Inband FEC enabled when network reports loss > 1 %.
- DTX (discontinuous transmission): silence frames suppressed; receiver fills with comfort noise.
- Encoder pacing: 20 ms frame budget ⇒ exactly one packet per frame.

## Noise Suppression — RNNoise

- `xiph/rnnoise` (Valin 2018, arXiv 1709.08243). Hybrid DSP + small recurrent NN.
- Operates at 48 kHz, 10 ms frames; we feed 20 ms Opus frames as two 10 ms hops.
- CPU: ~0.5 % single core desktop, ~3 % mobile `[BENCHMARK NEEDED]`.
- Pre-trained model bundled (MIT-compatible weights — confirm distribution license `[DECISION NEEDED]`).
- Bypass: `NoiseSuppression::None` for music streaming use cases.
- Custom: user supplies callback (e.g., for hosted ML denoise).

## Voice Activity Detection (VAD)

| Mode             | Trigger                                        | Use                         |
|------------------|------------------------------------------------|-----------------------------|
| `Opus`           | Opus internal VAD flag in encoded payload      | low CPU                     |
| `BuiltIn`        | RNNoise voice probability > threshold          | shares NS computation       |
| `PushToTalk`     | external boolean                               | competitive games           |
| `AlwaysOn`       | always transmit                                | streaming / debugging       |

VAD hysteresis: open at >0.6 probability, close after 300 ms below 0.4 — avoids word-clipping.

## Jitter Buffer

Adaptive jitter buffer per peer:
- Target depth = `2 × measured_jitter + safety`. Bounded `[min=20 ms, max=300 ms]`.
- On detected loss → Opus inband FEC if available, else PLC (packet loss concealment).
- Out-of-order packets reinserted up to depth window.
- Late packets dropped; counted in telemetry.

## Echo Cancellation

`[DECISION NEEDED]` AEC scope in v1.0:
- Option A: ship `speexdsp` AEC (BSD-3) for headset-less play.
- Option B: rely on OS-provided AEC (macOS/Win/Android voice mode).
- Most game players use headsets — Option B may be enough for v1.0.

## Spatial Voice (Proximity Chat)

When `VoiceSpatialMode::Proximity { entity }`:
- Per-peer audio is routed to a per-peer voice emitter component attached to `entity`.
- Standard spatial pipeline applies: distance attenuation, occlusion, optional reverb send.
- Optional **range filter**: voice fully audible inside 10 m, silent beyond 30 m (configurable).
- Disable voice routing if peer is muted globally or in radius 0 (privacy guardrails).

## Performance Contract

| Metric                                   | Target            | Hard limit         |
|------------------------------------------|-------------------|--------------------|
| Capture → encode → submit latency        | ≤ 25 ms           | ≤ 40 ms            |
| Decode → mix → output latency            | ≤ 25 ms           | ≤ 40 ms            |
| End-to-end (excl. network RTT)           | ≤ 50 ms           | ≤ 80 ms            |
| End-to-end (incl. 50 ms RTT)             | ≤ 100 ms          | ≤ 130 ms           |
| CPU per peer (decode + spatial)          | ≤ 0.5 %           | ≤ 1.5 %            |
| Max concurrent peers (desktop)           | 64                | 128 `[BENCHMARK NEEDED]` |
| Max concurrent peers (mobile)            | 16                | 32                 |
| Bitrate per peer (mid quality)           | 24 kbps           | 64 kbps            |
| Underrun on 5 % packet loss              | 0 audible         | 0 audible          |

## Error Contract

| Code                              | Meaning                                            | Caller action                  |
|-----------------------------------|----------------------------------------------------|--------------------------------|
| `VOICE_DEVICE_NOT_FOUND`          | No capture device selected/available               | switch device or mute capture  |
| `VOICE_DEVICE_PERMISSION_DENIED`  | OS denied mic access                               | prompt user to grant           |
| `VOICE_OPUS_ENCODER_FAILED`       | Encoder init failed (bad sample rate/channels)     | reconfigure session            |
| `VOICE_DECODE_ERROR`              | Bad payload from peer                              | drop packet, count in telemetry|
| `VOICE_JITTER_BUFFER_OVERFLOW`    | Peer flooding faster than playback                 | tighten buffer, kick peer      |
| `VOICE_JITTER_BUFFER_UNDERRUN`    | Peer too sparse                                    | PLC engaged, telemetry only    |
| `VOICE_PEER_UNATTACHED`           | Submitted packet for unknown peer                  | ignore                          |

## Integration Points

- **Networking** (`→ docs/contracts/core-networking.md` [AGENT: 14]): voice runs over an unreliable, unordered channel (separate from gameplay reliability). Encrypted by transport layer. Sequence number + sender ts in each packet.
- **ECS**: optional `VoiceEmitter { peer: PeerId }` component for proximity mode auto-attaches/detaches with entity lifecycle.
- **Scripting**: `voice.set_mode("ptt")`, `voice.set_peer_volume(peer_id, 0.5)`.
- **Agent API** (`→ docs/contracts/core-agent.md` [AGENT: 14]):
  - Agents may *receive* voice (read peers' transcribed text — separate STT system out of scope here).
  - Agents may *send* synthesized voice (TTS PCM → bypass capture, feed straight to encoder).
  - Agents never need a mic device.
- **Anti-cheat / abuse** (`→ docs/specs/networking/anticheat.md` [AGENT: 07]): bitrate caps, per-peer mute lists, server-side relay can record for moderation if game opts in.
- **Privacy**: capture is opt-in per session; status indicator surfaced via telemetry for HUD display.

## Telemetry

```json
{
  "session_id": "v-7a3",
  "capture": {"device": "default", "level_dbfs": -32.4, "vad": true},
  "encode": {"bitrate_bps": 23800, "frames_dropped_dtx": 142},
  "peers": {
    "peer-42": {
      "jitter_ms": 8.1, "loss_pct": 0.4, "fec_used": 12,
      "buffer_ms": 38, "underruns": 0, "spatial_distance": 4.7
    }
  }
}
```

## Test Requirements

- Capture → encode → decode → playback loopback < 50 ms (excluding network).
- 5 % synthetic packet loss + FEC enabled: no audible gaps in test phrase.
- 30 % loss: PLC engages; intelligibility preserved (subjective; MOS ≥ 3 `[BENCHMARK NEEDED]`).
- 64 simultaneous peers decode + spatialise on desktop within CPU budget.
- Mute toggle: outbound payloads stop within 1 frame; resume within 1 frame.
- Proximity mode: peer moves 0→30 m → audible attenuation curve matches spatial spec.
- Device disconnect mid-call: capture pauses, reconnect resumes without crash.
- RNNoise on a noisy speech sample: SNR improves by ≥ 10 dB measured against reference.
- Agent TTS injection: same Opus stream is produced regardless of real capture.

## Prior Art

- Opus codec — RFC 6716, `xiph/opus`. Industry standard for low-latency voice + music.
- `xiph/rnnoise` — Valin 2018 hybrid DSP/RNN denoiser, MIT-compatible.
- Mumble — open-source voice with positional support. ✓ low-latency design.
- Discord Krisp ✗ proprietary, license-incompatible.
- Vivox (Unity) ✗ closed.
- WebRTC NetEQ ✓ jitter buffer design reference.
- VoIP echo cancellation: `speexdsp` BSD-3.

## Open Questions

- `[DECISION NEEDED]` Bundle AEC (speexdsp) by default or rely on OS AEC?
- `[DECISION NEEDED]` Distribute RNNoise weights — bundled binary blob acceptable under MIT mandate?
- `[DECISION NEEDED]` First-class TTS/STT integration, or leave to external systems and just provide PCM injection hooks?
- `[BENCHMARK NEEDED]` MOS for PLC at 30 % loss; verify FEC threshold defaults.
- `[DECISION NEEDED]` Recording for moderation — opt-in API surface for relay servers?
- `[DECISION NEEDED]` WebAssembly mic capture path — `MediaStreamTrack` → AudioWorklet capture; verify cross-browser latency.
- `[DECISION NEEDED]` Spatial voice in v1.0 or v1.1?
