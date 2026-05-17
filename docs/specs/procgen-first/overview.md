<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Procgen-First — Overview

> Procedural generation as the core game loop, not the level designer's shortcut. Seeded RNG (xoshiro256++), wave-function-collapse helpers, generator-as-system (runs as part of ECS schedule), determinism-replay friendly. Dwarf Fortress, RimWorld, Caves of Qud, NoMan's Sky.

## Boundaries

- Owns: seeded RNG primitives (xoshiro256++), generator trait (`Generator`), generator-as-ECS-system scheduling, WFC helpers, L-systems / grammars, generator caching (memoize on seed + coord), generator-as-replay step.
- Does NOT own: voxel chunk generation (→ `docs/specs/voxel/overview.md` — composes this for chunk procgen), CA elements (→ `docs/specs/cellular-automata/overview.md`), narrative procgen (→ `docs/specs/text-heavy/overview.md` — composes WFC for branch generation).
- Depends on: `nexus-core/math` (seeded RNG), `nexus-core/jobs` (parallel chunk gen), `nexus-core/ecs` (generator-as-system).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-core/math` | xoshiro256++ stream-RNG (deterministic) |
| `nexus-core/jobs` | parallel chunk / region generation |
| `nexus-core/ecs` | generators run as systems within the schedule |
| `nexus-agent/replay` | generator state + seed snapshotted for replay |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-procgen-seeded-rng` | `procgen` (new) | RNG stream-fork primitive, deterministic across platforms |
| `nexus-procgen-wfc` | `procgen` | Wave Function Collapse helpers (tile / mesh adjacency) |
| `nexus-procgen-lsystem` | `procgen` | L-system grammars (trees, dungeons, roads) |
| `nexus-procgen-grammar` | `procgen` | declarative shape grammars (city blocks, buildings) |
| `nexus-procgen-cache` | `procgen` | (seed, coord) → cached result memoization |

## Architecture

```
Procgen as a first-class scheduled system

  World seed (u64) ── stable for entire game

         │
         ▼
  Generator trait stack
  ┌──────────────────────────────────────────────────────────┐
  │ trait Generator {                                        │
  │   type Output;                                           │
  │   fn generate(&self, seed: u64, coord: Coord) -> Output  │
  │ }                                                        │
  │                                                          │
  │ Generators are pure functions of (seed, coord).          │
  │ Same inputs → same output → deterministic.               │
  │ Stream-forkable: per-feature sub-seed from world_seed.   │
  └──────────────────────────────────────────────────────────┘

         │
         ▼
  Scheduling
  ┌──────────────────────────────────────────────────────────┐
  │ Generators run as ECS systems.                           │
  │ - on chunk-load event → spawn generation job             │
  │ - parallel via nexus-core/jobs                           │
  │ - cached via nexus-procgen-cache (seed, coord) → result  │
  └──────────────────────────────────────────────────────────┘

         │
         ▼
  Replay
  ┌──────────────────────────────────────────────────────────┐
  │ Replay = (world_seed) + (input log). Generator runs are  │
  │ implicit — no need to snapshot generated content.        │
  │ Game state snapshots are smaller; generators re-run as   │
  │ needed.                                                  │
  └──────────────────────────────────────────────────────────┘
```

## Seeded RNG

```rust
pub struct Rng { state: [u64; 4] }  // xoshiro256++

impl Rng {
    pub fn from_seed(seed: u64) -> Self;
    pub fn fork(&self, sub: &str) -> Rng;       // stream-forks deterministically
    pub fn next_u64(&mut self) -> u64;
    pub fn next_f32(&mut self) -> f32;
    pub fn range(&mut self, lo: i32, hi: i32) -> i32;
    pub fn choose<'a, T>(&mut self, items: &'a [T]) -> &'a T;
}
```

Stream-forking pattern:

```rust
let world_rng = Rng::from_seed(world_seed);
let terrain_rng    = world_rng.fork("terrain");
let creature_rng   = world_rng.fork("creatures");
let item_rng       = world_rng.fork("items");

// Then per-chunk:
let chunk_terrain = terrain_rng.fork(&format!("chunk:{x},{z}"));
```

This guarantees every subsystem can be regenerated independently and deterministically.

## Wave Function Collapse helpers

```rust
pub struct WfcInput {
    pub tile_count: u32,
    pub adjacency: AdjacencyTable,    // tile A may neighbor tile B in dir D
    pub weights: Vec<f32>,
}

pub fn wfc_solve(input: &WfcInput, output_dims: UVec2, rng: &mut Rng) -> Result<TileGrid, WfcError>;
pub fn wfc_solve_3d(input: &WfcInput, output_dims: UVec3, rng: &mut Rng) -> Result<VoxelGrid, WfcError>;
```

Constraint-backtracking solver; falls back when contradictions arise. Bounded time by step limit.

## Public API

```toml
[procgen]
world_seed         = 0xCAFED00D
generator_cache    = true
cache_size_mb      = 64
parallel_chunks    = 8
deterministic_xplat = true       # use software-only xoshiro, no SIMD divergence

[procgen.replay]
record_inputs      = true
snapshot_every_s   = 60
```

```rust
pub trait Generator: Send + Sync {
    type Output: Clone + Send + 'static;
    fn generate(&self, seed: u64, coord: GeneratorCoord) -> Self::Output;
}

pub enum GeneratorCoord { World, Chunk(IVec3), Region(IVec3), Custom(u64) }

pub struct ProcgenRegistry { /* generators by name */ }

impl ProcgenRegistry {
    pub fn register<G: Generator + 'static>(&mut self, name: &str, gen: G);
    pub fn get<G: Generator>(&self, name: &str) -> Option<&G>;
    pub fn telemetry(&self) -> ProcgenTelemetry;
}

pub struct ProcgenTelemetry {
    pub generators_registered: u32,
    pub cache_hit_pct: f32,
    pub generations_this_frame: u32,
    pub generation_ms_p99: f32,
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| RNG next_u64 | < 5 ns | 20 ns |
| Generator fork cost | < 50 ns | 200 ns |
| WFC 64×64 tile solve | < 50 ms | 200 ms |
| WFC 16³ voxel solve | < 200 ms | 1 s |
| Cache hit | < 100 ns | 500 ns |
| Per-chunk gen (terrain + features) | < 10 ms | 50 ms |
| Determinism: same seed → same output | bit-exact across platforms (software RNG only) | required |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `PROC_E_WFC_CONTRADICTION` | Solver could not satisfy constraints | Retry with different seed or relax adjacency |
| `PROC_E_WFC_TIMEOUT` | Step limit hit | Raise limit or simplify input |
| `PROC_E_CACHE_OOM` | Cache exceeded `cache_size_mb` | Raise limit or accept eviction |
| `PROC_E_NONDET_RNG` | Code path used non-deterministic RNG (e.g., `rand::thread_rng()`) | Replace with `Rng::fork` |
| `PROC_W_GEN_SLOW` | Generation > soft latency budget | Profile or split work |

## Integration Points

- **Voxel**: per-chunk procgen hook (`fn generate(seed, x, z) -> Chunk`). → `docs/specs/voxel/overview.md`.
- **Seamless world**: chunk-on-demand generation for unbounded worlds. → `docs/specs/seamless-world/overview.md`.
- **Cellular automata**: initial CA state generation. → `docs/specs/cellular-automata/overview.md`.
- **Sim-game**: world history / civilization simulation as procgen (Dwarf Fortress model). → `docs/specs/sim-game/overview.md`.
- **4X-strategy**: hex/square map generation. → `docs/specs/4x-strategy/overview.md`.
- **Deformable terrain**: initial heightmap procgen. → `docs/specs/deformable-terrain/overview.md`.
- **Text-heavy**: branch / dialogue procgen via WFC over narrative tiles. → `docs/specs/text-heavy/overview.md`.
- **Agent/replay**: replay = (world_seed) + (input log); generators re-run deterministically. → `docs/specs/agent/replay.md`.

## Scenario test (starter)

`scenarios/procgen-deterministic-world.scenario.toml`:

```toml
[scene]
template = "procgen-empty"
[setup]
world_seed = 0x12345678
[actions]
- { tick = 1,   action = "load_chunk", coord = [0, 0] }
- { tick = 1,   action = "load_chunk", coord = [1, 0] }
- { tick = 1,   action = "load_chunk", coord = [0, 1] }
[asserts]
- { tick = 30,  predicate = "chunk_hash(0, 0) == 0xDEADBEEF12345678" }  # known-good
- { tick = 30,  predicate = "generation_ms_p99 < 50" }
- { tick = 30,  predicate = "cache_hit_pct > 0" }
# Second pass: reload same chunks → cache hits
- { tick = 60,  predicate = "cache_hit_pct > 90" }
```

## Test Requirements

- Two runs with same world_seed produce bit-identical chunk hashes (cross-platform if `deterministic_xplat = true`).
- WFC: 64×64 input with 16 tiles produces a valid grid 99% of the time within step budget.
- Cache: same (seed, coord) request hits cache on second call.
- Replay: record 60 s of input → replay produces identical world-state.
- Parallel: 8 simultaneous chunk gens use 8 cores; no contention crash.

## Prior Art

- Dwarf Fortress (Bay 12) — procgen world + history sim as core gameplay. [VERIFY — Tarn Adams interviews].
- RimWorld (Ludeon) — procgen biomes + story generator. [VERIFY — Tynan Sylvester dev blog].
- Caves of Qud (Freehold) — fully procgen world + history. [VERIFY — Caves of Qud dev posts].
- NoMan's Sky (Hello Games) — galaxy-scale procgen. [VERIFY — Sean Murray GDC 2017 talk].
- Spelunky — Derek Yu's room-template procgen. [VERIFY — Spelunky book].
- *Inspired by*: Maxim Gumin, "Wave Function Collapse" — https://github.com/mxgmn/WaveFunctionCollapse.
- *Inspired by*: David Blackman & Sebastiano Vigna, "xoshiro / xoroshiro generators" — https://prng.di.unimi.it/.
- *Inspired by*: Lindenmayer L-systems (1968) — public-domain grammar reference.

## Open Questions

- `[DECISION NEEDED]` Default RNG: xoshiro256++ (fast, good distribution) confirmed; ensure software-only path for cross-platform determinism.
- `[DECISION NEEDED]` WFC fallback strategy on contradiction: retry with new seed, relax constraints, or accept partial solution?
- `[BENCHMARK NEEDED]` Per-chunk gen budget for "Dwarf Fortress at world-gen" scale (10k years of history) — likely batch-async, not per-frame.
- `[DECISION NEEDED]` Generator-as-system vs generator-as-job: scheduler model?
- `[DECISION NEEDED]` Cache invalidation policy: LRU by access, or LFU, or pinned-by-distance?
