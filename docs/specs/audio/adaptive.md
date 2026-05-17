<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Audio — Adaptive / Dynamic Music

> A declarative music graph (stems + layers + states + transitions) driven by gameplay parameters, with sample-accurate beat-synced transitions and stinger interjections.

## Boundaries
- Owns: music state machine, vertical layering (intensity stems), horizontal sequencing (segment transitions), tempo/beat clock, marker/cue sync, sidechain ducking sources.
- Does NOT own:
  - Audio decoding/streaming → `→ docs/specs/audio/streaming.md`
  - Reverb / mastering DSP → `→ docs/specs/audio/dsp.md`
  - Output device routing → `→ docs/specs/audio/overview.md`
- Depends on:
  - Master audio clock `→ docs/specs/audio/overview.md`
  - Game state inputs via `→ docs/contracts/core-audio.md` [AGENT: 14]
  - Scripting `→ docs/contracts/core-scripting.md` [AGENT: 14]

## Architecture

```
   Game State (RTPCs, switches, events)
            │
            ▼
   ┌─────────────────────────────────┐
   │  Music Director                 │
   │  ┌──────────────────────────┐   │
   │  │ State Machine            │   │   states: Explore, Combat, Boss, Win
   │  │  Explore ─▶ Combat       │   │   transitions: rules (params, time)
   │  │  Combat  ─▶ Boss         │   │
   │  └──────────────────────────┘   │
   │  ┌──────────────────────────┐   │
   │  │ Beat / Bar / Section Clk │   │   bpm, time-sig, loop markers
   │  └──────────────────────────┘   │
   └──────────────────┬──────────────┘
                      ▼
   ┌─────────────────────────────────┐
   │  Active Segment                  │
   │   ┌─────────┐ ┌─────────┐        │   horizontal:
   │   │ intro   │▶│ loop A  │▶...    │   segments queued at markers
   │   └─────────┘ └─────────┘        │
   │   ┌─────────────────────────┐    │   vertical:
   │   │ stem: drums  (always)   │────│
   │   │ stem: bass   (intensity>0.3)│──▶ mixer → music bus
   │   │ stem: lead   (intensity>0.7)│
   │   │ stem: strings(state=Boss)   │
   │   └─────────────────────────┘    │
   └─────────────────────────────────┘
                      ▲
                      │ (markers fire MarkerHit events)
                      ▼
                  Gameplay (sync FX, cutscenes)
```

## Public API

```rust
pub struct MusicSegment {
    pub asset: SoundHandle,         // single multi-stem file or array of stem assets
    pub bpm: f32,
    pub time_sig: (u8, u8),         // (4,4), (6,8) etc.
    pub markers: Vec<Marker>,       // beat, bar, custom
    pub loop_region: Option<(BeatTime, BeatTime)>,
    pub stems: Vec<Stem>,
}

pub struct Stem {
    pub name: String,
    pub channel_range: Range<usize>, // which channels of asset
    pub activation: Activation,      // Always | OnState(StateId) | OnParam{key, range}
    pub gain_db: f32,
    pub fade: Tween,
}

pub struct Marker { pub name: String, pub at: BeatTime } // BeatTime = bar.beat.sixteenth

pub struct Transition {
    pub from: StateMatcher,        // any | exact | tag
    pub to:   StateId,
    pub trigger: TransitionTrigger, // Param>0.5 | Event("boss_seen") | TimerExpires
    pub sync:    TransitionSync,    // Immediate | NextBeat | NextBar | NextMarker(name) | EndOfSegment
    pub crossfade: Tween,
    pub stinger: Option<SoundHandle>, // optional bridge sample
}

pub struct MusicGraph {
    pub states: HashMap<StateId, Vec<MusicSegment>>, // many possible variants per state
    pub transitions: Vec<Transition>,
    pub params: HashMap<String, f32>, // RTPCs: intensity, danger, location_id
}

impl AudioEngine {
    pub fn music_load(&self, graph: MusicGraph) -> MusicHandle;
    pub fn music_set_state(&self, h: MusicHandle, state: StateId);
    pub fn music_set_param(&self, h: MusicHandle, key: &str, val: f32, tween: Tween);
    pub fn music_post_event(&self, h: MusicHandle, event: &str); // discrete trigger
    pub fn music_play_stinger(&self, h: MusicHandle, s: SoundHandle, sync: TransitionSync);
    pub fn music_query(&self, h: MusicHandle) -> MusicTelemetry; // bar, beat, state, stems
}
```

## Transition Sync — sample accurate

```
audio block size: 256 samples = 5.33 ms @ 48 kHz
beat at 120 bpm: 24000 samples = 500 ms
transition queued at "NextBeat":
    director computes target sample index → next beat boundary
    at that exact block boundary: crossfade begins
    accuracy: sub-block via partial fade-in within the block
```

`TransitionSync::NextMarker("drop")` waits for a designer-placed marker even mid-bar — used for risers and pre-chorus pickups.

## Vertical Layering Patterns

| Activation              | Example use                            |
|-------------------------|----------------------------------------|
| `Always`                | base loop drums                        |
| `OnParam{intensity,>0.3}` | bass enters at low danger             |
| `OnParam{intensity,>0.7}` | strings/lead enter at high danger     |
| `OnState(Boss)`         | brass section unique to boss          |
| `OnEvent(low_hp)`       | heartbeat stem layered in             |

Each stem fades with its own tween; activations are evaluated per audio block; debounce hysteresis prevents flicker.

## Horizontal Sequencing Patterns

- **Intro → loop A → loop B → outro** chains.
- **Variants** picked round-robin or weighted random (deterministic when seeded → principle 5).
- **Stingers** layered on top, sample-accurate, non-blocking.
- **End-of-segment switch**: queues next segment to begin at loop point, no audible seam.

## Sidechain Ducking

Music bus listens to a sidechain source (e.g., dialogue bus envelope). When source RMS exceeds threshold, music gain ducks with attack/release. Spec: `Compressor::Sidechain` chain entry on music bus, configured via `→ docs/specs/audio/dsp.md`.

## Performance Contract

| Metric                                | Target          | Hard limit       |
|---------------------------------------|-----------------|------------------|
| Max simultaneous stems                | 16              | 32               |
| Transition decision latency           | ≤ 1 block       | ≤ 2 blocks       |
| Beat-grid accuracy                    | ±1 sample       | ±1 sample        |
| Crossfade glitch (any transition)     | none            | none             |
| Stem activation toggle CPU            | < 50 µs         | < 200 µs         |
| Graph load (typical 6-state graph)    | ≤ 50 ms async   | ≤ 200 ms         |

## Error Contract

| Code                          | Meaning                                            | Caller action                  |
|-------------------------------|----------------------------------------------------|--------------------------------|
| `MUSIC_STATE_UNKNOWN`         | `set_state` referenced undeclared state            | fix graph                      |
| `MUSIC_MARKER_NOT_FOUND`      | Transition sync references missing marker          | fall back to NextBar           |
| `MUSIC_GRAPH_INVALID`         | Cycle in transitions of type `Immediate`           | reject load                    |
| `MUSIC_STEM_CHANNEL_OOB`      | Stem channel_range exceeds asset channel count     | reject load                    |
| `MUSIC_TEMPO_DRIFT`           | External tempo source diverged > 1 ms              | telemetry; resync at next bar  |

## Integration Points

- **Scripting** (`→ docs/contracts/core-scripting.md` [AGENT: 14]):
  ```lua
  music.set_param("intensity", combat_meter)
  if boss.spotted then music.set_state("Boss") end
  ```
- **ECS hooks**: components `MusicConductor`, `MusicTrigger { event = "boss_seen" }` on world entities.
- **Genres** (`→ docs/specs/genres/horror.md` [AGENT: 12]): tension system feeds `intensity` RTPC.
- **Agent API**: telemetry includes `{state, bar, beat, intensity, stems_active[]}`. Scenario tests assert state machine transitions.
- **Editor** (`→ docs/specs/editor/overview.md` [AGENT: 11]): node-graph view of states/transitions; live preview with parameter sliders.

## Telemetry

```json
{
  "music_handle": 7,
  "state": "Combat",
  "segment": "combat_loop_a",
  "bar": 14, "beat": 2.75,
  "params": {"intensity": 0.82, "danger": 0.4},
  "stems_active": ["drums", "bass", "lead"],
  "next_transition": {"to": "Boss", "in_samples": 12800}
}
```

## Test Requirements

- Set state Explore→Combat with `NextBar` sync: transition occurs at exact next bar boundary (verify by marker timestamp).
- Vertical: increase intensity from 0 to 1 over 4 s — stems enter at thresholds with no clicks.
- Stinger triggered mid-segment: plays on top, segment continues uninterrupted.
- Round-robin variants with seed: same seed → same sequence over 10 selections.
- Sidechain duck: dialogue plays → music drops by configured amount, recovers in release time.
- Determinism: identical input event log + seed → identical mix output (principle 5).

## Prior Art

- Wwise Interactive Music ✓ segment/playlist/switch container model. Concept reference.
- FMOD Studio scatterer + transition regions ✓ designer ergonomics. Concept reference.
- iMUSE (LucasArts, 1991) ✓ marker-based sync, still influential.
- `tesselode/kira` ✓ clock + tween primitives; we extend with state machine.
- Elias Studio ✓ vertical/horizontal split. Concept reference.

## Open Questions

- `[DECISION NEEDED]` Multi-stem asset packaging — one multi-channel file vs separate stems? Trade-off: streaming vs sync.
- `[DECISION NEEDED]` Expose music graph as TOML scene asset, or runtime-only construction?
- `[DECISION NEEDED]` MIDI/score-driven music as v1.1 (modulate notes by intensity)?
- `[BENCHMARK NEEDED]` 32-stem worst-case mix on mobile.
- `[DECISION NEEDED]` Built-in support for procedural music (generative beds) — or leave to user DSP?
