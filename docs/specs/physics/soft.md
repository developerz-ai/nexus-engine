<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Soft Body, Cloth, Destruction

> XPBD-based deformables: cloth, ropes, soft volumes, fracture/destruction. One particle-and-constraint solver, many constraint types. Snapshot-friendly. Deterministic.

## Boundaries

- Owns: particle systems, distance / bending / volume / tetrahedral / attachment / collision constraints, cloth meshes, rope chains, soft-body volumes, fracture / destruction graph.
- Does NOT own: rigid solver (→ `docs/specs/physics/rigid.md`), fluid (→ `docs/specs/physics/fluid.md`), rendering of cloth (→ renderer skinning of dynamic vertex buffer).
- Depends on: `overview.md` (world step), `collision.md` (particle-vs-shape queries), `docs/specs/core/jobs.md` (graph-coloring parallel solve).

## Architecture

```
   ┌──────────────────────────────────────────────────────────┐
   │ DeformableSet                                            │
   │   particles   : { x, p, v, w (=1/m), flags }             │
   │   constraints : [ Distance | Bending | Volume | Tet |   │
   │                   Attach | Plane | ShapeMatch ]         │
   │   contacts    : [ Particle⨯Collider, Particle⨯Particle ]│
   │   groups      : graph-coloring batches for parallel solve│
   └──────────────────────────────────────────────────────────┘
                              │  per step (Δt)
                              ▼
   1. predict:    p = x + v Δt + (f_ext / m) Δt²
   2. detect:     generate particle contacts vs rigid colliders
   3. solve:      for n in 0..iters:                          (XPBD)
                     for each color in groups:
                         project constraints in parallel
                  → updates p (and λ for each constraint)
   4. update:     v = (p − x) / Δt;  x = p
   5. damping:    optional global / per-cluster
```

**Solver: XPBD** (Macklin, Müller, Chentanez 2016 — *Position-Based Simulation of Compliant Constrained Dynamics*). Reasons over plain PBD:
- Stiffness is decoupled from iteration count → tunable, time-step independent material.
- Per-constraint compliance `α̃ = α / Δt²` → stable hard and soft limits in same solver.
- Lagrange multiplier `λ` is part of state → warm-startable, snapshot-friendly, deterministic.

`[DECISION NEEDED]` Substep XPBD (small-steps method, Müller 2020, Ten Minute Physics) by default. Often 10 substeps × 1 iter beats 1 substep × 10 iters for stiffness — at the cost of one constraint pass per substep but much better convergence. Lean: yes for cloth/rope, off by default for soft volumes.

## Constraint Types

| Constraint    | Particles | Compliance       | Use                                              |
| ------------- | --------- | ---------------- | ------------------------------------------------ |
| `Distance`    | 2         | stretch stiffness | edges of cloth, rope segments                   |
| `Bending`     | 4         | bend stiffness    | cloth folds, paper stiffness                    |
| `Volume`      | 4 (tet)   | volume preservation | soft body, jelly                              |
| `Tetrahedral` | 4         | strain-limited    | FEM-like soft body, organic shapes              |
| `Attachment`  | 1         | infinite (hard)   | pin particle to rigid body / world point        |
| `Plane`       | 1         | hard              | particle never crosses plane                    |
| `ShapeMatch`  | N         | soft              | restore cluster to rest pose (Müller 2005)      |
| `Collision`   | 1 vs shape| hard              | generated per step, projects out of penetration |

## Public API

```rust
pub struct ClothDesc {
    pub vertices: Vec<Vec3>,
    pub indices: Vec<u32>,              // triangles
    pub mass_per_vertex: Fixed64,       // or compute from density × area
    pub stretch_compliance: Fixed64,    // 0 = inextensible
    pub bend_compliance: Fixed64,
    pub thickness: Fixed64,             // for self-collision
    pub pin_indices: Vec<u32>,          // pinned to current world pos
    pub attachments: Vec<(u32, BodyHandle, Vec3)>, // vert idx, rigid, local pt
    pub iterations: u8,                 // default 4 (or substeps)
    pub self_collision: bool,
}

pub struct RopeDesc {
    pub start: Vec3, pub end: Vec3, pub segments: u32,
    pub radius: Fixed64, pub mass_per_segment: Fixed64,
    pub stretch_compliance: Fixed64, pub bend_compliance: Fixed64,
}

pub struct SoftBodyDesc {
    pub tet_mesh: TetMesh,
    pub mass_per_node: Fixed64,
    pub young_modulus: Fixed64,         // → tet constraint compliance
    pub poisson_ratio: Fixed64,
    pub damping: Fixed64,
}

impl PhysicsWorld {
    pub fn spawn_cloth(&mut self, desc: ClothDesc) -> ClothHandle;
    pub fn spawn_rope(&mut self, desc: RopeDesc) -> RopeHandle;
    pub fn spawn_softbody(&mut self, desc: SoftBodyDesc) -> SoftHandle;

    pub fn cloth_vertices(&self, h: ClothHandle) -> &[Vec3];  // for skinning upload
    pub fn cut_cloth(&mut self, h: ClothHandle, plane: Plane);
    pub fn cut_rope(&mut self, h: RopeHandle, segment_index: u32);
}
```

Renderer reads `cloth_vertices(h)` post-step to upload to a dynamic vertex buffer. No copy if renderer maps the same arena slice (→ `docs/contracts/physics-renderer.md`).

## Self-Collision

Optional per cloth (`self_collision: true`). Uses spatial hash on particle positions + thickness. Particle-particle distance constraint with compliance 0 (hard).

Cost: ~2–3× single-cloth solve. Off by default; enable for capes/skirts.

## Destruction

```
   Mesh ──► VoronoiFracture(pre-baked) ──► FracturedAsset
                                                │
   on impact (impulse > threshold)              ▼
                                       activate chunks as
                                       dynamic rigid bodies
                                       + connect with breakable
                                       joints to neighbors
```

Two-phase:

1. **Authoring time** (asset pipeline → `docs/specs/assets/import.md`): mesh → Voronoi/clustered fracture → `FracturedAsset { chunks: Vec<ConvexHull>, adjacency: Graph, weak_joints: Vec<BreakableJointDesc> }`.
2. **Runtime**: spawn as compound rigid body. On contact event with impulse > `break_impulse`, walk adjacency, snap affected `weak_joints`, separate connected components into independent dynamic bodies.

Continuous fracture (runtime mesh cutting) — `[DECISION NEEDED]`. Adds CSG cost, harder determinism. Probably v0.4+, opt-in `crates/physics-fracture-runtime`.

## Snapshot / Determinism

For each cloth / soft / rope:
- particle `x, v, w, flags`
- per-constraint `λ` (XPBD Lagrange multiplier — required for warm-start + bit-identical replay)
- attachment bindings

Fixed-point particle positions in deterministic mode (→ `docs/specs/physics/determinism.md`). Order of constraint projection within a color batch is fixed (sorted by constraint id) for cross-thread determinism.

## Performance Contract

| Metric                                                   | Target          | Hard limit       |
| -------------------------------------------------------- | --------------- | ---------------- |
| 10k-vertex cloth, 4 iters or 10×1 substeps, no self-coll | < 2 ms / step   | < 5 ms / step    |
| Same cloth with self-collision                           | < 5 ms / step   | < 12 ms / step   |
| Rope, 64 segments                                        | < 30 µs / step  | < 100 µs / step  |
| Soft body, 5k tets, 4 iters                              | < 4 ms / step   | < 10 ms / step   |
| Destruction: 200 chunks, instantaneous separation        | < 1 ms event    | < 3 ms           |

`[BENCHMARK NEEDED]` Real game scenes (Wukong-class wall destruction with 1000+ chunks).

## Error Contract

| Code                       | Meaning                                                | Caller action                          |
| -------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `PHY_E_DEFORM_NAN`         | particle exploded (∞ or NaN)                           | restore snapshot, lower stiffness/dt   |
| `PHY_E_TETMESH_INVERTED`   | tet has negative volume at rest                        | retopologize at import                 |
| `PHY_E_FRACTURE_GRAPH`     | adjacency references missing chunk                     | regenerate fractured asset             |
| `PHY_E_SELFCOLL_DENSE`     | spatial-hash bucket overflow during self-collision     | raise bucket cap or lower particle density |

## Integration Points

- Renderer: cloth/soft vertex buffers; skinned mesh data path. → `docs/contracts/physics-renderer.md`.
- Rigid: attachment constraints couple particles to rigid bodies; impulses on rigid side go through the standard solver.
- Audio: fracture events emit `Destruction { chunks_released, total_mass }` → debris sound.
- Networking: deformables ARE snapshotted, but per-vertex state is expensive. Default rollback strategy: rigid + character full; cloth/soft restored only at full-resync points (interval `[DECISION NEEDED]`, default every 1 s). → `docs/specs/networking/rollback.md`.
- Agent: `physics.cloth.spawn`, `physics.softbody.spawn`, `physics.destruction.fire`. Telemetry includes vertex count, iteration count, broken joint count.

## Test Requirements

- 1×1 m cloth, 32×32 grid, pinned top edge, hangs and reaches rest within 1 s of sim with `stretch_compliance = 0`, max stretch < 1 %.
- Rope of 64 segments, attached to two static points, simulates 10 s without stretching > 2 %.
- Soft cube (5k tets) dropped 1 m, deforms and recovers, volume change < 5 %.
- Fractured wall struck by sphere — exactly the chunks within break radius separate; rest stay glued.
- Determinism: same scene, threads 1 vs 16, particle positions bit-equal in Fixed mode.
- Cloth cut by plane — vertices on either side separate cleanly; no leftover stitch constraints.

## Prior Art

- Macklin, Müller, Chentanez — *XPBD* (MIG 2016) — ✓ core algorithm.
- Müller, Heidelberger, Hennix, Ratcliff — *Position Based Dynamics* (2007) — ✓ original PBD.
- Müller — *Ten Minute Physics XPBD* (https://matthias-research.github.io/pages/tenMinutePhysics/) — ✓ small-steps trick.
- Bullet `btSoftBody` — ✓ breadth (cloth, rope, volumes), ✓ tetra-soft; ✗ stiffness/iteration coupling, accreted API.
- NVIDIA Flex / Blast — ✓ destruction graph model; ✗ proprietary.
- Houdini Vellum — ✓ XPBD-based reference for production cloth.

## Open Questions

- `[DECISION NEEDED]` GPU XPBD pipeline (compute shaders) vs CPU-only v1.0. CPU first → guaranteed deterministic. GPU as `crates/physics-gpu` opt-in for visual-only effects.
- `[DECISION NEEDED]` FEM (corotated linear, Stable Neo-Hookean) as an alternative soft-body solver alongside XPBD-tet. FEM is more physically faithful but heavier.
- `[DECISION NEEDED]` Continuous (runtime) mesh fracture vs pre-baked only. Pre-baked for v1.0.
- `[DECISION NEEDED]` Cloth rollback policy: full per-tick state in snapshot (expensive) vs keyframe + interpolate. → coordinate with `docs/specs/networking/rollback.md`.
