<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Massive RTS — Overview

> 10k–100k unit RTS. Instanced rendering, flow-field pathing (HPA* fallback for narrow corridors), unit batching (groups of N units run as one ECS query), per-unit GPU AI evaluation. Supreme Commander, Planetary Annihilation, Ultimate General scale.

## Boundaries

- Owns: massive-unit ECS query patterns, flow-field generator + cache, HPA* fallback, instanced unit renderer, GPU AI evaluator (per-unit decisions in compute), interest-management policy at scale, group-command batching.
- Does NOT own: baseline RTS gameplay rules (→ `docs/specs/genres/rts.md`), low-level renderer (→ `docs/specs/renderer/overview.md`), navmesh-tile cooking (→ baseline character physics, `docs/specs/physics/character.md`), unit-level rigid bodies (out of scope at this scale; use volumetric collider).
- Depends on: `nexus-core/ecs`, `nexus-renderer/particles-heavy` (projectiles + impactors), `nexus-net/replication` (interest management at scale), `nexus-genres/rts` (the gameplay layer this scales up).

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-core/ecs` | per-archetype mass storage, chunk iteration |
| `nexus-renderer/particles-heavy` | bullet/laser projectiles, explosions, debris |
| `nexus-net/replication` | interest management (per-region delta, not per-unit) |
| `nexus-genres/rts` | base RTS gameplay layer (selection, build orders, resources, fog) |
| `nexus-core/jobs` | parallel flow-field generation, parallel AI batches |
| `nexus-physics/collision` | unit-vs-unit soft separation (cylinder collider only, no rigid) |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-massive-rts-flowfield` | `massive` (new) | flow-field generator + cache |
| `nexus-massive-rts-instanced-render` | `massive` | indirect-draw instanced unit renderer + LOD |
| `nexus-massive-rts-gpu-ai` | `massive` | per-unit decision compute kernel |
| `nexus-massive-rts-interest` | `massive` | spatial-hashed interest management for net |

## Architecture

```
Massive RTS frame pipeline

  Player command (e.g., "move 5000 units to point X")
                │
                ▼
  Group-command batcher
  - one command = one ECS event, applied to N units
  - flow-field requested for destination region
                │
                ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ FlowField cache (per-destination tile, LRU)                  │
  │  - on miss: parallel BFS from destination on coarse grid     │
  │  - HPA* fallback for narrow corridors (< unit_width × 2)     │
  │  - destination radius collapse: 5000 units share 1 field     │
  └──────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Sim (per tick, fixed 30 Hz)                                  │
  │  - mass ECS query: chunk-iterate 10k units, vectorized       │
  │  - sample flow-field velocity → integrate position           │
  │  - soft-separate cylinder colliders (Boids-style avoidance)  │
  │  - GPU AI eval per-unit decisions (target select, fire/move) │
  │  - apply damage events from projectiles                      │
  └──────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Render (instanced indirect)                                  │
  │  - LOD bands: full mesh / impostor / billboard / cull        │
  │  - one indirect draw per LOD band                            │
  │  - projectiles via particles-heavy                           │
  └──────────────────────────────────────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Net replication (interest-managed)                           │
  │  - spatial hash on map (256×256 cells)                       │
  │  - per-client subscribes to cells around camera + selection  │
  │  - per-cell aggregate state, NOT per-unit                    │
  └──────────────────────────────────────────────────────────────┘
```

## Unit batching pattern

10k units = 10k ECS entities, but grouped:

| Group size | Update freq | AI freq |
|---|---|---|
| 1 (hero unit, important) | every tick | every tick |
| 8 (squad) | every tick | every 2 ticks |
| 64 (formation) | every 2 ticks | every 8 ticks |
| 256 (army block) | every 4 ticks | every 16 ticks |

Sim work per tick stays bounded regardless of total unit count.

## Public API

```toml
[massive_rts]
max_units             = 50_000
tick_rate_hz          = 30
flowfield_grid        = 1024     # cells (square map)
flowfield_cache_size  = 64       # active fields
unit_batch_size       = 64       # group size for batched updates
projectile_backend    = "particles-heavy"
render_lod_distances  = [100.0, 400.0, 1500.0]
interest_cell_size    = 32.0     # world units per spatial-hash cell
```

```rust
pub struct UnitId(pub u32);

pub struct MassiveWorld { /* ECS handle, flowfield cache */ }

impl MassiveWorld {
    pub fn spawn_units(&mut self, archetype: ArchetypeId, count: u32, at: Vec2) -> UnitGroupId;
    pub fn command_move(&mut self, units: UnitGroupId, to: Vec2);
    pub fn command_attack(&mut self, units: UnitGroupId, target: UnitId);
    pub fn telemetry(&self) -> MassiveTelemetry;
}

pub struct MassiveTelemetry {
    pub alive_units: u32,
    pub active_flowfields: u32,
    pub sim_ms: f32,
    pub render_ms: f32,
    pub net_bytes_per_sec: u64,
}
```

## Performance Contract

| Metric | Target (desktop) | Target (mid-tier) | Hard limit |
|---|---|---|---|
| Sim tick (50k units, 30 Hz) | < 8 ms | < 16 ms | 25 ms |
| Flow-field gen (1024² grid) | < 5 ms parallel | < 15 ms | 30 ms |
| Render (50k units, mixed LOD) | < 4 ms | < 10 ms | 14 ms |
| Net bandwidth per client | < 30 KB/s | < 30 KB/s | 100 KB/s |
| GPU AI (50k units, 8 Hz) | < 1.5 ms | < 4 ms | 6 ms |
| Memory per unit (ECS + render) | < 256 B | — | 512 B |

`[BENCHMARK NEEDED]` — 100k unit ceiling on workstation GPU.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `MASS_E_UNIT_CAP` | `max_units` exceeded | Raise cap or despawn |
| `MASS_E_FLOWFIELD_OOM` | Cache LRU thrashing | Raise `flowfield_cache_size` or reduce concurrent commands |
| `MASS_E_NO_COMPUTE` | GPU AI requested but no compute backend | Fall back to CPU AI (sim_ms degrades) |
| `MASS_E_INTEREST_OVERLAP` | Client subscribed to > N cells | Tighten interest radius |
| `MASS_W_LOD_THRASH` | LOD oscillating frequently | Widen LOD hysteresis |

## Integration Points

- **ECS**: archetype-storage iteration over unit chunks; SIMD-friendly. → `docs/specs/core/ecs.md`.
- **Renderer**: instanced indirect MultiDraw per LOD; impostor atlas baked at asset-import time. → `docs/specs/renderer/overview.md`.
- **Particles-heavy**: projectiles, bullets, explosions. → `docs/specs/renderer/particles-heavy.md`.
- **Net replication**: interest-managed per-cell aggregate state. → `docs/specs/networking/replication.md`.
- **RTS genre**: baseline gameplay (build, harvest, tech tree). This spec scales the unit-count axis. → `docs/specs/genres/rts.md`.
- **Procgen**: map generation at scale. → `docs/specs/procgen-first/overview.md`.

## Scenario test (starter)

`scenarios/massive-rts-50k-battle.scenario.toml`:

```toml
[scene]
template = "rts-flat-map-2048"
[actions]
- { tick = 1,   action = "spawn", archetype = "soldier", count = 25000, at = [-500, 0] }
- { tick = 1,   action = "spawn", archetype = "soldier", count = 25000, at = [ 500, 0] }
- { tick = 10,  action = "command_attack_move", side = "red",  to = [ 500, 0] }
- { tick = 10,  action = "command_attack_move", side = "blue", to = [-500, 0] }
[asserts]
- { tick = 1800, predicate = "tick_ms_p99 < 16.6" }
- { tick = 1800, predicate = "render_ms_p99 < 8.0" }
- { tick = 1800, predicate = "alive_units < 50000" }       # combat resolved some
```

## Test Requirements

- Spawn 50k units split 25k/25k → frame budget held for 60 s.
- Flow-field cache hit > 90% under repeated commands to same destination.
- Net bandwidth per client < 30 KB/s during full 50k battle.
- LOD transitions visible but no popping (hysteresis verified).
- Determinism (lockstep mode): same inputs on two clients → identical end-state hash at tick 1800.

## Prior Art

- Supreme Commander (Gas Powered Games) — 1000-unit RTS, "Strategic Zoom" UI. [VERIFY — Chris Taylor talks].
- Planetary Annihilation (Uber) — planet-scale RTS. [VERIFY — Uber dev blog URL].
- Ultimate General — large-scale tactical with formation-based AI. [VERIFY — Game-Labs dev posts].
- Total War series — formation-batched unit rendering. [VERIFY — Creative Assembly tech talks].
- *Inspired by*: Elijah Emerson, "Crowd Pathfinding and Steering Using Flow Field Tiles" (Game AI Pro Vol 1, 2013).
- *Inspired by*: HPA* paper — Botea, Müller, Schaeffer, "Near Optimal Hierarchical Path-Finding" (JGT 2004).

## Open Questions

- `[DECISION NEEDED]` Default tick rate: 30 Hz (StarCraft 2) vs 10 Hz (Supreme Commander) vs 60 Hz (twitchy RTS).
- `[DECISION NEEDED]` Lockstep determinism vs server-authoritative — RTS tradition is lockstep; Nexus default should match.
- `[BENCHMARK NEEDED]` 100k unit ceiling — likely workstation-only.
- `[DECISION NEEDED]` Unit collision model: cylinder soft-separation vs grid-cell occupancy.
- `[DECISION NEEDED]` GPU AI: pure compute kernel, or hybrid (CPU coarse plan + GPU per-unit micro-decision)?
