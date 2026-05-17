<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Fluid Simulation

> Particle-based fluids (SPH / PBF) with optional GPU acceleration. Interacts with rigid bodies via two-way coupling. Visual-quality first; deterministic CPU mode for replays.

## Boundaries

- Owns: fluid `Particle`, neighbor search, density / pressure solve, surface tension, viscosity, two-way coupling forces, fluid-vs-collider contacts, fluid telemetry.
- Does NOT own: surface reconstruction → meshing (→ renderer / asset compute pass), liquid shading (→ renderer), grid-based fluids (Eulerian) — out of v1.0 scope.
- Depends on: `overview.md`, `collision.md` (rigid shape queries for particle-vs-collider), `docs/specs/renderer/particles.md` (when rendering as point sprites), `docs/specs/core/jobs.md`.

## Architecture

```
   ┌──────────────────────────────────────────────────────────────┐
   │ FluidSystem                                                  │
   │   particles : { x, v, m, rho, p, λ_pbf, color }              │
   │   grid      : uniform spatial hash (cell = 2 · h)            │
   │   solvers   : { WCSPH | PCISPH | PBF }                       │
   │   coupling  : rigid contacts list (push to rigid solver)     │
   │   backend   : Cpu | Gpu(wgpu compute)                        │
   └──────────────────────────────────────────────────────────────┘
                              │ per step (Δt, with substeps)
                              ▼
   1. predict:   v* = v + (g + f_ext/m) Δt;  x* = x + v* Δt
   2. neighbors: rebuild spatial hash; collect N(i) within 2h
   3. density:   ρ_i = Σ m_j W(|x_i − x_j|, h)            (Müller kernel)
   4. solve:     PBF — iterate constraints C_i = ρ_i/ρ₀ − 1 = 0
                       (Macklin–Müller 2013, Position Based Fluids)
                 — OR WCSPH — p_i = k((ρ_i/ρ₀)^7 − 1); accumulate forces
   5. couple:    contacts with rigid colliders → push particle out
                 + apply opposite impulse to rigid body
   6. viscosity: XSPH or artificial viscosity term
   7. integrate: v = (x* − x)/Δt;  x = x*
   8. emit:      telemetry (active count, avg density, energy)
```

Solver: **Position-Based Fluids (PBF)** by Macklin & Müller (SIGGRAPH 2013). Reasons:

- Same XPBD-style positional solver family as soft/cloth → unified Lagrange-multiplier code path.
- More stable at low iteration counts than WCSPH → better realtime budgets.
- Vorticity confinement + XSPH viscosity add visual liveliness.

`[DECISION NEEDED]` Alternative DFSPH (Divergence-Free SPH, Bender 2015) for incompressibility — higher quality, heavier. Could ship as opt-in `FluidSolver::Dfsph`.

## Backends

| Backend           | Particles  | Determinism   | Use case                                  |
| ----------------- | ---------- | ------------- | ----------------------------------------- |
| `Cpu`             | ≤ 50k      | yes (Fixed)   | gameplay-relevant fluids, networked games |
| `Gpu(wgpu)`       | ≤ 1M       | no            | visual effects, splash, waterfalls        |
| `GpuDeterministic`| ≤ 100k     | best-effort   | `[DECISION NEEDED]`, requires fixed-pt or strict-IEEE reductions |

Default is `Cpu` with PBF. GPU backend lives in `crates/physics-fluid-gpu` and uses the wgpu compute pipeline (→ `docs/specs/renderer/backend.md`).

## Neighbor Search

Uniform spatial hash grid, cell size `2h` where `h` is the kernel radius. Build cost O(N) with parallel count-sort + prefix-scan (the same pattern Unity SPH and GPUSPH use for O(N) neighbor queries).

Determinism: hash table entries sorted by `(cell_id, particle_id)` after build → identical neighbor iteration order across threads.

## Two-Way Coupling with Rigid Bodies

For each particle within `radius + h` of a collider:

```
n        = collider.normal_at(x)
penetration = (h − distance) clamped ≥ 0
impulse_p   = m_p / Δt · penetration · n        // push particle out
v_p        -= impulse_p / m_p
PhysicsWorld::apply_impulse_at(collider.body, -impulse_p, x)
```

Submitted to the rigid solver pre-step of the **next** physics tick (deferred), so fluid and rigid solves are not interleaved per substep — keeps both deterministic and parallelizable.

## Surface Reconstruction (Rendering Aid)

Out of scope for the physics spec. Provides only `fluid.particles(h)` slice (positions + density). Renderer-side options:
- Point sprites (cheap, foamy)
- Screen-space curvature (Müller 2007, the screen-space fluids paper)
- Marching cubes mesh (offline / pre-render only)

See `docs/specs/renderer/particles.md` and `[AGENT 03 RENDERER]` for the meshing pass.

## Public API

```rust
pub struct FluidDesc {
    pub solver: FluidSolver,            // Pbf | Wcsph | Dfsph
    pub backend: FluidBackend,          // Cpu | Gpu
    pub kernel_radius: Fixed64,         // h
    pub rest_density: Fixed64,          // ρ₀, default 1000 kg/m³
    pub viscosity: Fixed64,             // XSPH coefficient
    pub surface_tension: Fixed64,
    pub iterations: u8,                 // PBF iters, default 4
    pub max_particles: u32,
    pub collide_with: CollisionGroups,
}

pub struct EmitterDesc {
    pub shape: EmitterShape,            // Point | Cone | Box
    pub rate: f32,                      // particles / s
    pub initial_velocity: Vec3,
    pub fluid: FluidHandle,
}

impl PhysicsWorld {
    pub fn create_fluid(&mut self, desc: FluidDesc) -> FluidHandle;
    pub fn add_emitter(&mut self, desc: EmitterDesc) -> EmitterHandle;
    pub fn fluid_particles(&self, h: FluidHandle) -> &[ParticleView];
    pub fn fluid_telemetry(&self, h: FluidHandle) -> FluidTelemetry;
}

pub struct ParticleView { pub position: Vec3, pub velocity: Vec3, pub density: f32 }

pub struct FluidTelemetry {
    pub active: u32,
    pub avg_density: f32,
    pub max_compression: f32,
    pub solver_iters_actual: u32,
    pub neighbor_search_ns: u64,
    pub solve_ns: u64,
}
```

## Performance Contract

| Metric                                                | Target               | Hard limit          |
| ----------------------------------------------------- | -------------------- | ------------------- |
| CPU PBF, 20k particles, 4 iters, 60 Hz                | < 4 ms / step        | < 10 ms / step      |
| GPU PBF (wgpu), 200k particles, 4 iters               | < 3 ms / step (mid-tier dGPU) | < 8 ms      |
| Neighbor rebuild (CPU, 20k)                           | < 0.6 ms             | < 1.5 ms            |
| Two-way coupling, 20k particles, ~500 contacts        | < 0.4 ms             | < 1.0 ms            |
| Particle memory                                       | < 64 B / particle    | < 96 B              |

`[BENCHMARK NEEDED]` 1M-particle GPU target on mainstream Steam Deck / mobile.

## Error Contract

| Code                       | Meaning                                          | Caller action                              |
| -------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `PHY_E_FLUID_OVERFLOW`     | emitter would exceed `max_particles`             | drop new particles or raise cap            |
| `PHY_E_FLUID_NAN`          | density / velocity exploded                      | restore snapshot, lower iterations or h    |
| `PHY_E_GPU_UNAVAILABLE`    | `Gpu` backend requested but no compute support   | fall back to CPU or surface error          |
| `PHY_E_GPU_NONDET`         | GPU backend used in deterministic-required scene | switch backend to `Cpu`                    |

## Integration Points

- Rigid: deferred two-way coupling impulses (see above).
- Renderer: `fluid.particles()` slice → particle/screen-space-fluid pipeline.
- Networking: GPU fluids are visual-only; CPU PBF can be snapshotted (every particle in state) but is heavy. Default networking policy: fluid state is **non-authoritative** — clients run their own decorative sim. Authoritative fluid only for gameplay use cases (puzzles, hydraulics) — opt-in `fluid.networked = true`. → `docs/specs/networking/rollback.md`.
- Audio: emitter → flow sound; splash events on high-impulse particle/collider contacts.
- Agent: `physics.fluid.create`, `physics.fluid.emit`, `physics.fluid.telemetry`. Particle buffer too large for JSON-RPC — exposed as binary handle / shared-memory view.

## Test Requirements

- 20k-particle dam break against static walls, water surface settles within 5 s, no leaks through walls.
- Sphere drop into PBF pool — pushes fluid out, generates ring wave, sphere bobs to surface within expected buoyancy (`F = ρ V g` ±10 %).
- 100 emitters at 100 p/s each, no overflow, no degradation > 20 % vs 1 emitter at 10k p/s.
- CPU determinism: same scene, threads 1 vs 16, particle positions bit-equal at tick 600.
- GPU backend renders without NaN over 60 s under stress (200k particles, mixed colliders).

## Prior Art

- Müller, Charypar, Gross — *Particle-Based Fluid Simulation for Interactive Applications* (SCA 2003) — ✓ baseline kernels.
- Macklin, Müller — *Position Based Fluids* (SIGGRAPH 2013) — ✓ chosen solver.
- Bender, Koschier — *DFSPH* (2015) — ✓ alternative for incompressibility.
- Harada — *SPH on GPUs* (CGI 2007) — ✓ GPU pipeline reference.
- GPUSPH (https://www.gpusph.org/) — ✓ CUDA SPH precedent.
- WebGPU SPH (jeantimex/fluid) — ✓ wgpu compute pipeline reference.

## Open Questions

- `[DECISION NEEDED]` Default solver: PBF (unified with XPBD soft) vs DFSPH (better incompressibility). Lean PBF for code-base unity; ship DFSPH later as `FluidSolver::Dfsph`.
- `[DECISION NEEDED]` GPU determinism story (atomic-sum order, FMA differences across GPUs). Probably "GPU is visual-only" forever.
- `[DECISION NEEDED]` Eulerian / grid fluids (FLIP, MAC grid) — out of v1.0. Game cases (lava flows, large rivers) — reconsider v2.0.
- `[DECISION NEEDED]` In-engine surface mesh reconstruction (marching cubes on density grid) vs leave to renderer screen-space approach.
- `[BENCHMARK NEEDED]` Steam Deck / iPhone 14 / mid-range Android targets for GPU PBF.
