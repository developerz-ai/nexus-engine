<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Physics ⇄ Renderer (Debug Draw)

> Physics emits per-step debug primitives (lines, triangles, text labels) into a transient buffer. Renderer drains and draws them as an overlay pass. Zero runtime cost when overlay disabled.

Related specs:
- `docs/specs/physics/overview.md` · `docs/specs/physics/collision.md` · `docs/specs/physics/character.md`
- `docs/specs/renderer/overview.md` · `docs/specs/renderer/post.md` · `docs/specs/editor/debug.md`
- Sibling: `docs/contracts/core-physics.md` (debug draw rides the physics step) · `docs/contracts/core-renderer.md` (overlay pass slots into render graph) · `docs/contracts/core-agent.md` (`debug.draw_overlay`)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Producer | `nexus-physics` | `crates/physics/src/debug.rs` |
| Consumer | `nexus-renderer` | `crates/renderer/src/debug_pass.rs` |
| Buffer | shared crate | `nexus-debug-draw` (`crates/debug-draw/src/lib.rs`) |

Pattern reference: Bullet `btIDebugDraw`, Rapier `DebugRenderPipeline`, Box2D `b2Draw`. The shared buffer crate ensures the producer (physics) does not depend on the renderer — both depend on `nexus-debug-draw`. (Acyclic dependency principle, Robert C. Martin.)

---

## Call flow

```
 physics step (if DebugFlags != 0)
   │
   ├─► physics::debug_render(&world, &mut DebugBuffer)
   │      pushes:
   │        Line { a, b, color }
   │        Tri  { a, b, c, color }
   │        Text { pos_ws, text, color }
   │        AABB { min, max, color }
   │
   ▼
 DebugBuffer (double-buffered: front for render, back for next physics step)

 renderer prepare:
   ├─► debug_buffer.swap()       ── front <-> back
   ├─► upload front to GPU vertex buffer (single dynamic VBO)
   └─► record overlay pass after main 3D pass, before UI
```

When `DebugFlags::empty()`, physics skips `debug_render`; renderer skips the pass entirely (zero overhead).

---

## Provided API (DebugBuffer — shared crate that both call)

```rust
pub struct DebugBuffer { /* opaque */ }

impl DebugBuffer {
    pub fn new(initial_capacity: usize) -> Self;
    pub fn clear(&mut self);
    pub fn line(&mut self, a: Vec3, b: Vec3, color: Color);
    pub fn line_thick(&mut self, a: Vec3, b: Vec3, color: Color, world_thickness: f32);
    pub fn tri(&mut self, a: Vec3, b: Vec3, c: Vec3, color: Color);
    pub fn aabb(&mut self, min: Vec3, max: Vec3, color: Color);
    pub fn obb(&mut self, center: Vec3, half: Vec3, rot: Quat, color: Color);
    pub fn sphere(&mut self, center: Vec3, radius: f32, color: Color);
    pub fn capsule(&mut self, a: Vec3, b: Vec3, radius: f32, color: Color);
    pub fn arrow(&mut self, from: Vec3, to: Vec3, color: Color, head_size: f32);
    pub fn text(&mut self, pos_ws: Vec3, txt: &str, color: Color);
    pub fn stats(&self) -> DebugBufferStats;
}

pub trait DebugDraw {                       // physics implements; renderer calls
    fn flags(&self) -> DebugFlags;
    fn set_flags(&self, flags: DebugFlags);
    fn render_into(&self, world: &World, buf: &mut DebugBuffer);
}
```

## Required API (Renderer surface)

```rust
pub trait DebugOverlayPass {
    fn enable(&self, on: bool);
    fn is_enabled(&self) -> bool;
    /// Renderer pulls front-buffer from physics' DebugDraw impl during `prepare`.
    fn ingest(&self, buf: &DebugBuffer);
    /// Camera matrix for screen-space text positioning.
    fn camera_vp(&self) -> Mat4;
}
```

---

## Data Schema

```rust
bitflags! {
    pub struct DebugFlags: u32 {
        const COLLIDERS         = 1 << 0;   // wireframe collision shapes
        const AABB              = 1 << 1;   // broadphase AABBs
        const CONTACTS          = 1 << 2;   // contact points + normals
        const JOINTS            = 1 << 3;
        const VELOCITIES        = 1 << 4;   // linear/angular as arrows
        const ISLAND_COLORS     = 1 << 5;   // tint by solver island
        const CHARACTER_CTRL    = 1 << 6;   // grounded ray, slope normal
        const RAYCASTS          = 1 << 7;   // last frame's raycasts
        const NAVMESH           = 1 << 8;   // (deferred; see navmesh spec)
        const SLEEPING          = 1 << 9;   // tint sleeping bodies grey
        const LABELS            = 1 << 10;  // entity ids as text
    }
}

#[repr(C, packed)]
pub struct DebugVertex {                    // GPU layout
    pub pos: [f32; 3],                      // world space
    pub color: u32,                         // RGBA8
    pub flags: u32,                         // bit 0 = is_text_billboard, bit 1 = thick
}
// Vertex buffer: lines + tris as separate ranges; renderer draws in two indexed batches.

pub struct Color(pub u8, pub u8, pub u8, pub u8);
impl Color {
    pub const RED: Color = Color(255,0,0,255);
    pub const GREEN: Color = Color(0,255,0,255);
    pub const BLUE: Color = Color(0,0,255,255);
    pub const YELLOW: Color = Color(255,255,0,255);
    pub const WHITE: Color = Color(255,255,255,255);
}

pub struct DebugBufferStats {
    pub lines: u32,
    pub tris: u32,
    pub labels: u32,
    pub vertex_bytes: u32,
    pub capacity_bytes: u32,
}
```

Toggle/RPC schema (used by `nexus-agent::debug.draw_overlay`, see `core-agent.md`):

```json
{"jsonrpc":"2.0","id":1,"method":"debug.draw_overlay",
 "params":{"kind":"physics","flags":["COLLIDERS","CONTACTS","VELOCITIES"]}}
```

`Nexus.toml` defaults:

```toml
[debug.physics]
enabled        = false              # never on in shipped builds
flags          = ["COLLIDERS"]
capacity_lines = 65536
capacity_tris  = 16384
capacity_text  = 1024
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Physics | `render_into` is called exactly once per physics step when any `DebugFlags` bit is set. |
| O-2 | Physics | Coordinates are world-space at the end of the step (post-`write_back`). |
| O-3 | Buffer | Double-buffered: physics writes to back-buffer; renderer reads front-buffer; swap atomic at frame boundary. |
| O-4 | Renderer | If multiple physics steps occurred between renders (catch-up), only the latest step's debug data is drawn (others discarded — debug is presentational). |
| O-5 | Renderer | Overlay pass runs after main 3D pass and before UI overlay; depth tested but not depth written by default. |
| O-6 | Buffer | Out-of-capacity: drop newest primitives; increment `DebugBufferStats.dropped` (telemetry). Never reallocate during physics step. |
| O-7 | Both | Disabling all flags + disabling overlay pass = exactly zero CPU and zero GPU cost. |

---

## Threading & Concurrency Rules

- `DebugBuffer` back-buffer is owned exclusively by the physics step thread during `step`.
- Front-buffer is exclusively read by the renderer's `prepare` stage.
- Atomic pointer swap on step→frame boundary; no locks.
- `set_flags` is `&self` and atomic (single `AtomicU32`); safe from any thread (e.g., editor toggle, agent RPC).
- Text rendering: physics pushes UTF-8 bytes into an arena; renderer rasterizes via existing text system at draw time.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| `render_into` CPU @ 1k bodies, COLLIDERS only | ≤ 0.3 ms | 1 ms | wireframe primitive gen |
| `render_into` CPU @ 1k bodies, ALL flags | ≤ 1 ms | 4 ms | |
| Overlay pass GPU @ 65k lines | ≤ 0.2 ms | 1 ms | desktop dGPU |
| Overlay pass GPU @ 65k lines | ≤ 1 ms | 3 ms | mid-tier mobile |
| Vertex buffer upload | ≤ 0.1 ms | 0.5 ms | `wgpu::Queue::write_buffer` |
| Disabled overhead | 0 cycles | 0 | branch on `flags.is_empty()` |
| Capacity defaults | 65k lines, 16k tris | configurable | enough for 1k visualized bodies |

References: Rapier debug-render pipeline, Bullet `btIDebugDraw::flushLines`, wgpu dynamic buffer upload semantics.

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `DBG-001` | `CapacityExceeded` | dropped primitives | warn once per second; suggest larger capacity |
| `DBG-010` | `OverlayPipelineMissing` | renderer hasn't built the line-list pipeline | enable pipeline on first ingest; one-frame delay |
| `DBG-020` | `TextSystemUnavailable` | text system disabled (headless) | drop `text()` calls; bit-flag `LABELS` ignored |
| `DBG-030` | `FlagsUnknown` | RPC requested unknown flag | reject params; `-32602` from agent |

---

## Versioning Rule

`nexus-contract-physics-renderer = "MAJOR.MINOR.PATCH"`. The shared `nexus-debug-draw` crate is the schema's authority.

- **MAJOR**: change `DebugVertex` layout, change `DebugFlags` bit positions (would break replay overlays + agent RPCs), remove a primitive method.
- **MINOR**: add `DebugFlags` bit (default OFF), add new primitive method (e.g., `frustum`), add `Color` constants.
- **PATCH**: default capacities, defaults for thickness.

Both producer and consumer pin the same MAJOR via Cargo; replay files referencing flags use the schema version stamp from the recording session.

---

## Test Matrix

`tests/contract_physics_renderer.rs`:

- T-01 No flags set → physics's `render_into` is never called; renderer's overlay pass is skipped; CPU baseline unchanged.
- T-02 `COLLIDERS` only → 1k boxes produce ≤ 12k line primitives (12 edges each); fits default capacity.
- T-03 `CONTACTS` flag → after a known collision, exactly one contact-point primitive appears at the contact's world position (within 1 mm).
- T-04 Capacity exceeded → newest primitives dropped, `DBG-001` emitted at most once per second.
- T-05 Hot toggle: RPC `debug.draw_overlay` flips `COLLIDERS` on/off mid-frame → next frame reflects the change; no lost frames.
- T-06 Catch-up: physics runs 3 substeps in one render frame → only last step's debug data is drawn (O-4).
- T-07 Headless: overlay pass is a no-op; `render_into` still callable for test introspection.
- T-08 Determinism: same input + same flags → identical `DebugBufferStats.lines/tris/labels` count.

---

## Open Questions

- [DECISION NEEDED] Should debug draw also be available from scripts/agents (not just physics)? An `Im3d`-style general API would be useful for game-side debug. → AGENT 03 + AGENT 08 + AGENT 10.
- [DECISION NEEDED] Per-camera vs global overlay (editor multi-viewport)? Currently global. AGENT 11.
- [DECISION NEEDED] Thick-line implementation: geometry shader (not portable on WebGPU), instanced quads, or screen-space line shader? Recommend instanced quads for portability. AGENT 03.
- [DECISION NEEDED] Persisting frames of debug data for the agent's replay scrubber: store raw `DebugBuffer` snapshots? Memory cost. AGENT 10.
- [BENCHMARK NEEDED] Mobile GPU cost at 65k lines (current target may be optimistic on Mali / Adreno entry tier).
- [AGENT: 03] Confirm overlay pass slot in render graph (after opaque, before UI) and depth state.
- [AGENT: 05] Confirm Rapier's `DebugRenderPipeline` output maps cleanly to `DebugBuffer` primitives, or we re-walk colliders ourselves.
- [AGENT: 11] Editor wants per-component-type color customization; should this live in the debug draw schema or in the editor's settings layer?
