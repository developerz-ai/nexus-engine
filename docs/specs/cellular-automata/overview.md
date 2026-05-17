<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Cellular Automata — Overview

> Per-pixel CA on GPU compute. Falling-sand, fluid pixels, fire, gas, lava, electricity. Multi-element interactions (water + lava → stone). Deterministic step. Full replay. Noita built this from scratch in 4 years; Nexus ships it as a module.

## Boundaries

- Owns: 2D CA grid storage, element registry, per-element step rules, multi-element interaction table, GPU compute step kernel, deterministic seed propagation, replay snapshot format.
- Does NOT own: visual rendering of CA pixels (→ `docs/specs/renderer/particles-heavy.md` for the visual layer), rigid bodies in the CA world (→ `docs/specs/physics/rigid.md`), Lagrangian fluid (→ `docs/specs/physics/fluid.md`), voxel 3D (→ `docs/specs/voxel/overview.md`).
- Depends on: `nexus-core/jobs`, `nexus-renderer` (for visual draw), `nexus-physics/determinism` (replay), `nexus-renderer/particles-heavy` (visual layer composition).

## Composes

| Existing Nexus module | Purpose |
|---|---|
| `nexus-renderer` (compute) | per-pixel CA step kernel |
| `nexus-renderer/particles-heavy` | optional visual layer: each CA pixel as a particle |
| `nexus-physics/determinism` | replay framework + seedable step |
| `nexus-core/jobs` | CPU fallback parallelism |
| `nexus-core/events` | element-collision events (audio triggers) |
| `nexus-agent/replay` | full replay capture and playback |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-cellular-falling-sand` | `cellular` (new) | core CA grid + step scheduler |
| `nexus-cellular-noita-elements` | `cellular` | shipped element pack (water, lava, oil, gas, fire, stone, sand, blood, acid, electricity) |
| `nexus-cellular-interactions` | `cellular` | declarative interaction table DSL |
| `nexus-cellular-replay` | `cellular` | snapshot + replay codec |

## Architecture

```
CA pipeline (per game tick, default 60 Hz)

  ┌────────────────────────────────────────────────────────────┐
  │ World grid (1024×1024 active region, streamed)             │
  │ - 2 bytes per cell: u8 element + u8 properties (temp/flags)│
  └────────────┬───────────────────────────────────────────────┘
               │
               ▼
  ┌────────────────────────────────────────────────────────────┐
  │ GPU compute step kernel (4-color checkerboard pass)        │
  │ - one work-group per 8×8 cell block                        │
  │ - reads element + neighbors                                │
  │ - applies element rule (gravity, flow, react)              │
  │ - writes interaction events to ring buffer                 │
  │ - deterministic: fixed thread layout, no atomics in rules  │
  └────────────┬───────────────────────────────────────────────┘
               │
               ▼
  ┌────────────────────────────────────────────────────────────┐
  │ Interaction resolver (CPU, per frame)                      │
  │ - reads event ring buffer                                  │
  │ - applies multi-step reactions (water+lava → stone+steam)  │
  │ - publishes audio events                                   │
  └────────────┬───────────────────────────────────────────────┘
               │
               ▼
  ┌────────────────────────────────────────────────────────────┐
  │ Renderer + Replay                                          │
  │ - blit grid → visual texture (or feed particles-heavy)     │
  │ - snapshot every N ticks for replay (delta-compressed)     │
  └────────────────────────────────────────────────────────────┘
```

## Element registry

```toml
[[cellular.element]]
id           = "water"
density      = 1.0
flow_rate    = 4              # cells/tick lateral
state        = "liquid"
color        = "#4A90E2"

[[cellular.element]]
id           = "lava"
density      = 2.5
flow_rate    = 2
state        = "liquid"
color        = "#FF6B35"
emits_light  = 8

[[cellular.element]]
id           = "sand"
density      = 2.0
state        = "powder"       # falls if neighbor below is gas/liquid lighter
color        = "#E5C16A"

[[cellular.interaction]]
a            = "water"
b            = "lava"
produces     = [["stone", 0.6], ["steam", 0.4]]   # weighted outcomes
event        = "extinguish"   # audio/VFX trigger
```

## Public API

```rust
pub struct ElementId(pub u8);
pub struct Cell { pub element: ElementId, pub props: u8 }

pub struct CellularWorld { /* GPU grid handle, replay state */ }

impl CellularWorld {
    pub fn new(width: u32, height: u32, seed: u64) -> Self;
    pub fn step(&mut self);              // one tick (deterministic)
    pub fn set(&mut self, x: i32, y: i32, e: ElementId);
    pub fn get(&self, x: i32, y: i32) -> Cell;
    pub fn snapshot(&self) -> Snapshot;
    pub fn restore(&mut self, snap: &Snapshot);
    pub fn telemetry(&self) -> CellularTelemetry;
}

pub struct CellularTelemetry {
    pub active_cells: u32,
    pub interactions_this_tick: u32,
    pub step_ms: f32,
}
```

## Performance Contract

| Metric | Target (dGPU) | Target (Steam Deck) | Hard limit |
|---|---|---|---|
| Step (1024×1024, mixed elements) | < 0.8 ms | < 3.0 ms | < 2.5 ms |
| Active region streaming | 4 regions concurrent | 2 | 8 |
| Interaction events / tick | < 10k typical | < 5k | 100k |
| Snapshot delta-compressed (1024×1024) | < 50 KB | < 50 KB | 256 KB |
| Replay 60 s | < 30 MB | < 30 MB | 150 MB |
| Determinism guarantee | bit-exact same GPU model | bit-exact | per-model only |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `CELL_E_NO_COMPUTE` | Backend lacks compute (GLES3 fallback) | Use CPU step (slower; ~100×100 max practical) |
| `CELL_E_ELEMENT_LIMIT` | > 256 element types | Split into multiple worlds or use u16 feature flag |
| `CELL_E_INTERACTION_AMBIGUOUS` | Two interactions match same pair without priority | Add `priority` to interaction TOML |
| `CELL_E_REPLAY_DESYNC` | Restored snapshot diverges from recorded ticks | Cross-GPU determinism not guaranteed; record + replay on same GPU model |
| `CELL_W_ACTIVE_OVERFLOW` | Active region count > soft cap | Reduce streaming radius |

## Integration Points

- **Renderer**: CA grid blits to a 2D texture; renderer composites. For visual richness, pipe to `particles-heavy` (one particle per active cell). → `docs/specs/renderer/particles-heavy.md`.
- **Determinism / replay**: snapshot every N ticks + delta input log → full replay. → `docs/specs/physics/determinism.md`.
- **Audio**: interaction events (`extinguish`, `ignite`, `freeze`) emit audio triggers. → `docs/specs/audio/overview.md`.
- **Physics (rigid)**: rigid bodies can collide with high-density elements (stone, packed sand) via voxel-style collider rebuilt per frame in active region. → `docs/specs/physics/collision.md`.
- **Net**: CA state is high-bandwidth → ship the same way as voxel: per-edit deltas + periodic snapshot. → `docs/specs/networking/replication.md`.
- **Procgen**: initial world generated by `nexus-procgen-wfc` or custom generator. → `docs/specs/procgen-first/overview.md`.

## Scenario test (starter)

`scenarios/falling-sand-water-lava.scenario.toml`:

```toml
[scene]
template = "cellular-empty-1024"
[actions]
- { tick = 1,  action = "cell_set", region = "y=200, x=400..600", element = "water" }
- { tick = 1,  action = "cell_set", region = "y=300, x=500",      element = "lava" }
[asserts]
- { tick = 60, predicate = "cell_count(stone) > 50" }
- { tick = 60, predicate = "frame_budget_ms < 16.6" }
```

## Test Requirements

- 1024×1024 grid, 60-tick water+lava → produces stone within 60 ticks, deterministic across runs (same GPU).
- 100k active cells sustains 60 Hz on baseline.
- Replay: record 60 s of input → replay produces identical end-state.
- Element interaction: declarative TOML interaction → behavior matches at runtime without code change.
- Net delta: client edits a cell → server propagates within 100 ms.

## Prior Art

- Noita (Nolla Games) — Falling Everything Engine. [VERIFY — Petri Purho GDC 2019 talk "Exploring the tech and design of Noita"].
- The Powder Toy (Simon Robertshaw / community) — open-source CA classic. https://powdertoy.co.uk.
- Sandspiel (Max Bittker) — WebGL falling-sand. https://sandspiel.club.
- Conway's Game of Life — canonical CA reference (1970, public domain).
- Wolfram, "A New Kind of Science" — CA theoretical reference.

## Open Questions

- `[DECISION NEEDED]` Element count ceiling: u8 (256 elements — enough for Noita) vs u16 default.
- `[DECISION NEEDED]` Multi-pass step vs single-pass: 4-color checkerboard preferred for race avoidance.
- `[BENCHMARK NEEDED]` WebGPU CA step performance (storage texture roundtrip).
- `[DECISION NEEDED]` 3D CA support? Noita is 2D. 3D voxel-CA (Minecraft fluid) lives in `docs/specs/voxel/overview.md`; this spec stays 2D.
