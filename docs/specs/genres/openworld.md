<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Open World Genre Module

> Open-world primitives: chunked world streaming, POI registry, dynamic event director, time-of-day cycle, dynamic weather, persistent overlays.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.openworld] version = "0.1"
chunk_size_m = 256
stream_radius_chunks = 4
weather_model = "physically-plausible"
day_real_minutes = 24
```

## Boundaries

- Owns: world chunk grid, streaming budget, POI registry, dynamic event director, time-of-day clock, weather state machine, persistent world overlays (props placed, NPCs killed, etc.).
- Does NOT own: terrain LOD (→ `docs/specs/renderer/terrain.md`), AOI for multiplayer (→ `docs/specs/genres/mmorpg.md`), asset disk reads (→ `docs/specs/assets/streaming.md`).
- Depends on: assets streaming, renderer terrain, audio (ambience), networking (optional sync of world state).

## Architecture

```
                ┌──────────────────────────────────┐
                │      World Chunk Grid (NxM)      │
                │     chunk = 256m × 256m × ∞      │
                └────────────┬─────────────────────┘
                             │ view distance → set of active chunks
                             ▼
                ┌──────────────────────────────────┐
                │      ChunkStreamer (jobs)        │
                │  load / unload / prefetch        │
                └─────┬────────────────────────────┘
                      │
                      ▼
         ┌──────────────────────────────────────────┐
         │   POI Registry (per chunk, k-d index)    │
         │   tags: city, dungeon, vendor, landmark  │
         └──────────────┬───────────────────────────┘
                        │
                        ▼
                  EventDirector
                   ├ scripted (timed)
                   ├ proximity (player near tagged POI)
                   └ ambient (weather + time gated)

   Time-of-Day clock ── sun pos + ambient lookup ── shader uniforms
   Weather FSM       ── Clear ↔ Cloudy ↔ Rain ↔ Storm ↔ Snow (probabilistic)
   Persistent Overlay layer (per-chunk delta against base)
```

### Chunk Streaming Diagram

```
                north
                  ▲
   +---+---+---+---+---+---+---+
   |   | . | . | . | . | . |   |     . = prefetched (low priority)
   +---+---+---+---+---+---+---+
   | . | A | A | A | A | A | . |     A = active (high priority)
   +---+---+---+---+---+---+---+
   | . | A | A |#P#| A | A | . |     P = player chunk
   +---+---+---+---+---+---+---+
   | . | A | A | A | A | A | . |
   +---+---+---+---+---+---+---+
   |   | . | . | . | . | . |   |
   +---+---+---+---+---+---+---+
```
Activation: 5×5 around player. Prefetch ring: outer 7×7. Unload after grace (avoid thrash).

## Public API

```rust
// resources
pub struct WorldGrid { chunk_m: f32, size: IVec2, chunks: HashMap<IVec2, ChunkState> }
pub enum ChunkState { Unloaded, Loading{since:f32}, Active{ents:Vec<Entity>}, Unloading }
pub struct PoiRegistry { points: KdTree<PoiId>, by_tag: HashMap<&'static str, Vec<PoiId>> }
pub struct WorldClock { day:u32, hour_f:f32, sun_dir: Vec3, moon_dir: Vec3 }
pub struct Weather { state: WeatherState, t_in_state: f32, transition_to: Option<WeatherState> }
pub struct PersistentOverlay; // (chunk → diff entries: spawned/removed/modified)

// components (typical)
pub struct ChunkRoot { coord: IVec2 }
pub struct Poi { id: PoiId, kind: PoiKind, tags: SmallVec<[&'static str; 4]> }

// systems
fn streaming_system();           // determine active set, dispatch jobs
fn poi_query_system();
fn event_director_system();      // scheduled + proximity + ambient triggers
fn time_of_day_system();
fn weather_fsm_system();
fn ambient_audio_system();
fn overlay_apply_system();       // on chunk activation, replay diffs

// events
pub enum OwEvent {
    ChunkActivated{c}, ChunkUnloaded{c}, PoiEntered{p,poi}, PoiLeft{p,poi},
    WeatherChanged{from,to}, DayBroke, NightFell, DynamicEventTriggered{evt_id,pos},
}
```

## Time-of-Day

`hour_f ∈ [0,24)`; advanced by `real_dt * (24/day_real_minutes/60)`.
Sun direction from `solar_altitude(hour_f, latitude)` (simplified). Engine emits uniforms for renderer; designer can override (cinematic golden hour).

## Weather FSM

```
        ┌──── Clear ────┐
        │        ▲       │
        ▼        │       ▼
      Cloudy ───┴──── Rain ── Storm
        │                ▲
        └────► Snow ◄────┘
```
Transitions probabilistic per minute; biased by biome metadata of player chunk. Telemetry exposes transition matrix so designers can tune.

## Dynamic Event Director

Beats (configurable, data-driven):
- ScheduledEvent: at `world_time T`, spawn caravan path X.
- ProximityEvent: when player enters tag=`bandit_camp` within R, spawn ambush.
- AmbientEvent: at night + storm + wilderness biome, raise `wolves_attack` weight.

Director picks beats by weighted roll, with cooldowns per beat to avoid spam.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Streaming dispatch per frame | <0.5 ms | 2 ms |
| Chunk load wall-clock (warm cache) | <80 ms | 300 ms |
| POI radius query (k-d, R=500m) | <120 µs | 1 ms |
| Weather/time tick | <40 µs | 200 µs |
| Persistent overlay apply per chunk | <2 ms | 10 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `OW_E001` | chunk asset missing | spawn placeholder + warn |
| `OW_E002` | streaming budget exceeded | defer prefetch ring |
| `OW_E010` | event director beat pool empty | revert to ambient set |
| `OW_E020` | overlay corruption | rebuild from base + log |

## Integration Points

- Assets streaming → `docs/specs/assets/streaming.md` (consumes chunk asset bundles).
- Renderer terrain → `docs/specs/renderer/terrain.md` (chunked virtual heightmap).
- Audio ambience → `docs/specs/audio/adaptive.md` (biome+weather→ambience stems).
- MMORPG: combinable — `genres/mmorpg` AOI sits *on top of* the open-world chunk grid.
- Survival: hooks into day/night + weather signals → `docs/specs/genres/survival.md`.
- Agent: drive a virtual player across world to validate streaming and event director → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"t":3601.0,"sys":"ow","evt":"weather_changed","from":"Cloudy","to":"Rain","biome":"forest","chunk":[12,7]}
```

## Test Requirements

- Travel test: player follows 10 km spline → no hitch > 50 ms; memory stable.
- Chunk unload/reload preserves persistent overlay deltas.
- POI proximity event fires exactly once per entry (debounce on re-entry).
- Day/night: sun direction monotonic over a day (no jitter).
- Weather transition matrix matches designer table within ±5% over 10k samples.

## Prior Art

- Skyrim cell system ✓ — original mainstream chunked open world.
- The Witcher 3 streaming + level-of-detail ✓.
- Breath of the Wild chemistry-driven events ✓ inspiration for ambient triggers.
- Red Dead Redemption 2 weather + ambient density ✓.
- Horizon Zero Dawn dynamic placement systems ✓.
- Houdini terrain pipelines → terrain spec.

## Open Questions

- [DECISION NEEDED] Chunk size: 256 m default vs 128 m for mobile vs 512 m for sparse worlds.
- [DECISION NEEDED] Save format for persistent overlay — separate file per chunk vs single rolling log.
- [BENCHMARK NEEDED] Stream budget on Switch / mid-tier mobile.
- [DECISION NEEDED] Time-of-day model: simplified vs astronomical accuracy.
