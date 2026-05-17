<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Physics — Collision Detection

> Two-phase pipeline: BVH (DAABB) broad phase → GJK/EPA + SAT narrow phase → contact manifolds. Filters via 32-bit layer/mask. Deterministic pair ordering. Structured events.

## Boundaries

- Owns: shape definitions, `ColliderSet`, broad phase (BVH), narrow phase, contact manifold generation, queries (raycast, shapecast, point, AABB), collision filters, materials.
- Does NOT own: solver / impulse application (→ `docs/specs/physics/rigid.md`), character resolution (→ `docs/specs/physics/character.md`), debug rendering (→ `docs/contracts/physics-renderer.md`).
- Depends on: `overview.md`, `docs/specs/core/math.md` (AABB, ray, isometry), `docs/specs/core/jobs.md` (parallel build).

## Architecture

```
                  +-----------------------+
   colliders ---> |  Broad Phase (BVH)    | --- pairs ---> Narrow Phase
                  |  dynamic + static     |                 │
                  +-----------------------+                 ▼
                          ▲                       per-pair dispatcher
                          │                        │
                          │ DAABB updates          ├─► Sphere⨯Sphere      (analytic)
                  +-----------------------+        ├─► Box⨯Box            (SAT)
   queries    ---►|  AcceleratorView      |◄───────┤
   (ray,         |  read-only snapshot   |        ├─► Convex⨯Convex      (GJK + EPA)
   shapecast,    +-----------------------+        ├─► Compound⨯*         (recurse)
   AABB, point)                                   ├─► Heightfield⨯*      (cell walk)
                                                   ├─► TriMesh⨯Convex     (BVH walk + GJK)
                                                   └─► Capsule⨯* (mixed)

                                          manifold (≤ 4 contacts) ──► Solver
```

### Broad Phase

**Dynamic AABB tree (BVH).** Inspirations:

- Catto Box2D `b2DynamicTree` — incremental, surface-area heuristic refit.
- Jolt `BroadPhaseQuadTree` — lock-free quad tree, two-tree split (dynamic + static), background rebuild (Rouwé, GDC 2022).
- Rapier — DBVT with proxy reordering.

Two trees:
- `dynamic_tree` — moving/kinematic; fat AABBs with margin; refit on body move > margin.
- `static_tree` — built once at level load; SAH-optimal; immutable.

Pair generation: `dynamic ⨯ dynamic` (overlap query in dynamic tree, dedup by `(id_lo, id_hi)`) + `dynamic ⨯ static` (overlap query each moving body against static tree). Pair list is sorted lexicographically by `(id_lo, id_hi)` → deterministic order → deterministic narrow-phase work order → deterministic solver islands.

`[DECISION NEEDED]` BVH vs quad-tree vs hierarchical hash grid. BVH default; expose `BroadPhaseKind` enum so a scene can pick. Open worlds may prefer Jolt-style quad-tree for streaming.

### Narrow Phase

Per-pair dispatcher selects algorithm by shape combination. Manifold cap = 4 contacts (Catto convention) — picked by SAT for boxes, by contact-clipping for convex pairs (GJK distance ≤ 0 → EPA penetration → manifold via incident/reference face).

Persistent manifolds: contacts keyed by pair of feature IDs `(featA, featB)`. Cached `λ` (normal + friction) reused next step for warm-starting — crucial for stable stacks.

### Queries

```rust
pub enum QueryFilter {
    All,
    Mask { groups: u32, mask: u32 },
    Predicate(fn(ColliderHandle) -> bool),
    Exclude(Vec<ColliderHandle>),
}

impl PhysicsWorld {
    pub fn raycast(&self, ray: Ray, max_toi: Fixed64, solid: bool, f: &QueryFilter)
        -> Option<RayHit>;
    pub fn raycast_all(&self, ray: Ray, max_toi: Fixed64, solid: bool, f: &QueryFilter,
        cb: impl FnMut(RayHit) -> bool);
    pub fn shapecast(&self, shape: &Shape, start: Isometry, dir: Vec3,
        max_toi: Fixed64, f: &QueryFilter) -> Option<ShapeHit>;
    pub fn aabb_query(&self, aabb: Aabb, f: &QueryFilter,
        cb: impl FnMut(ColliderHandle));
    pub fn point_test(&self, p: Vec3, solid: bool, f: &QueryFilter) -> Vec<ColliderHandle>;
}
```

Queries run against the most recent post-step `AcceleratorView` — read-only, safe to call from worker threads in parallel with the **next** step preparation (Jolt model).

## Shape Types

| Shape          | Class       | Notes                                                       |
| -------------- | ----------- | ----------------------------------------------------------- |
| `Sphere`       | analytic    | cheapest pair against everything                            |
| `Capsule`      | analytic    | preferred for characters                                    |
| `Box`          | convex      | SAT pair                                                    |
| `Cylinder`     | convex      | GJK / SAT-hybrid                                            |
| `Cone`         | convex      | GJK                                                         |
| `ConvexHull`   | convex      | from N points, ≤ 256 verts default                          |
| `Compound`     | composite   | array of (child_shape, local_isometry); recursive dispatch  |
| `TriMesh`      | concave     | static only; internal BVH; one triangle ≠ a contact normal — needs edge convexity flags (Rapier 0.17+) |
| `Heightfield`  | concave     | regular grid; cell walk; static only                        |
| `Polyline`     | 2D-concave  | static only                                                 |
| `Voxel`        | concave     | sparse grid; **[DECISION NEEDED]** ship in v0.1?            |

Dynamic concave is **forbidden**. Convex decomposition (V-HACD-style) belongs in asset pipeline (→ `docs/specs/assets/import.md`).

Edge-convexity flag for tri-meshes (Rapier "internal edges") suppresses ghost contacts when a body slides across mesh seams.

## Materials

```rust
pub struct PhysicsMaterial {
    pub friction: Fixed64,                 // 0..1, default 0.5
    pub restitution: Fixed64,              // 0..1, default 0
    pub friction_combine: CombineRule,     // Avg | Min | Max | Multiply
    pub restitution_combine: CombineRule,
    pub density: Fixed64,                  // kg/m^3, default 1000
    pub sound_id: SoundMaterialId,         // → audio mapping
}
```

`SoundMaterialId` is opaque here; audio binds to it via collision events.

## Layers & Masks (Filtering)

Two 16-bit fields per collider (Jolt-style ObjectLayer + BroadPhaseLayer split is `[DECISION NEEDED]`):

```rust
pub struct CollisionGroups {
    pub memberships: u32,   // which groups this collider belongs to
    pub filter: u32,        // which groups it collides with
}
```

Pair filter test: `(a.memberships & b.filter) != 0 && (b.memberships & a.filter) != 0`.

Sensors (`is_sensor: true`) emit `Sensor::Entered/Exited` events but generate no contact impulses.

## Public API (Colliders)

```rust
pub struct ColliderDesc {
    pub shape: Shape,
    pub local_isometry: Isometry,      // relative to parent body, identity if no parent
    pub material: PhysicsMaterial,
    pub density_or_mass: MassMode,     // Density(d) | Mass(m) | ComputedFromShape
    pub is_sensor: bool,
    pub groups: CollisionGroups,
    pub active_events: EventMask,      // ContactStart | ContactEnd | Sensor | None
    pub user_data: u64,
}

impl PhysicsWorld {
    pub fn add_collider(&mut self, desc: ColliderDesc, parent: Option<BodyHandle>)
        -> ColliderHandle;
    pub fn remove_collider(&mut self, h: ColliderHandle);
}
```

## Contact Event Stream

Per-step structured stream — see `docs/contracts/core-physics.md` for the canonical schema:

```rust
pub enum CollisionEvent {
    ContactStarted { tick, a, b, manifold_id, points: [ContactPoint; 4], normal, impulse },
    ContactPersisted { tick, a, b, manifold_id, points, normal, impulse },
    ContactEnded { tick, a, b, manifold_id },
    SensorEntered { tick, sensor, other },
    SensorExited  { tick, sensor, other },
}
```

`tick` is the discrete sim step. Iteration order is deterministic (sorted by `(manifold_id)`).

## Performance Contract

| Metric                                                    | Target          | Hard limit      |
| --------------------------------------------------------- | --------------- | --------------- |
| Broad-phase update (1k dyn + 100k static)                 | < 0.5 ms        | < 1.2 ms        |
| Narrow-phase, 5k pairs, mixed shapes                      | < 1.5 ms        | < 3.5 ms        |
| Raycast, 100k static triangles (BVH)                      | < 30 µs         | < 100 µs        |
| Shapecast capsule, same scene                             | < 80 µs         | < 250 µs        |
| Pair re-ordering / dedup overhead                         | < 5 % of NP cost | < 15 %         |

## Error Contract

| Code                          | Meaning                                       | Caller action                             |
| ----------------------------- | --------------------------------------------- | ----------------------------------------- |
| `PHY_E_SHAPE_NOT_CONVEX`      | claimed convex hull is concave                | re-run convex decomposition               |
| `PHY_E_TRIMESH_DYNAMIC`       | trimesh attached to dynamic body              | use compound of convex children           |
| `PHY_E_QUERY_DURING_STEP`     | query called mid-step from worker thread      | queue query for post-step                 |
| `PHY_E_FILTER_OVERFLOW`       | layer index ≥ 32                              | reduce layer count or use predicate filter|

## Integration Points

- ECS: `Collider` and `Sensor` components map 1:1 to `ColliderHandle`. Parent body resolved from `RigidBody` on same entity (or its `Parent`).
- Renderer: debug-draw emits per-shape wireframe + manifold contact arrows. → `docs/contracts/physics-renderer.md`.
- Audio: `ContactStarted` → impact sound dispatch keyed by `(mat_a.sound_id, mat_b.sound_id, impulse)`. → `docs/contracts/core-audio.md`.
- Networking: contact events are also snapshot-deterministic; rollback resimulates → identical event stream. → `docs/specs/networking/rollback.md`.
- Agent: `physics.raycast`, `physics.subscribe_events`, `physics.collider.spawn` JSON-RPC.

## Test Requirements

- Two trees (dynamic + static) produce identical pair set as a single-tree reference build, for 10 random scenes.
- Box-box SAT: ground-truth manifold matches reference (Bullet `btBoxBoxDetector`) within 1e-4 for 1000 random poses.
- GJK distance returns 0 when shapes interpenetrate, EPA recovers penetration depth ±5 %.
- Raycast through 1M-tri mesh: result identical regardless of BVH build order in deterministic mode.
- Pair iteration order bit-identical across thread counts 1 / 4 / 16.
- Sensor enter/exit events fire exactly once per crossing for fast traversals (no flicker).
- Ghost contact suppression: capsule slides across grid of triangles without spurious vertical impulses.

## Prior Art

- Catto, `b2DynamicTree` (Box2D) — ✓ refit + fat AABBs.
- Catto, *Computing Distance with GJK* (GDC 2010) — ✓ GJK reference.
- Rouwé, *Architecting Jolt Physics* (GDC 2022) — ✓ lock-free broad-phase quadtree, ✓ two-tree split, ✓ background batch insertion.
- Rapier — ✓ persistent manifold + warm-start API, ✓ internal-edge handling.
- Bullet — ✓ btDbvt, ✓ GJK/EPA reference implementation.

## Open Questions

- `[DECISION NEEDED]` Single ObjectLayer (32-bit groups+filter) vs Jolt's split (ObjectLayer + BroadPhaseLayer). Jolt's split halves broad-phase work for "never collide" pairs.
- `[DECISION NEEDED]` Voxel collider in v0.1 (Minecraft-style) — yes opens survival/sandbox use cases; cost is non-trivial dynamic AABB tracking.
- `[DECISION NEEDED]` Default CCD = Speculative for high-velocity bodies (Rapier-style auto-promotion) vs explicit opt-in.
- `[BENCHMARK NEEDED]` 1M-triangle level raycast targets on web (WASM) — likely 5-10× desktop.
