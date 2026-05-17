<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Renderer

> The ECS world feeds renderable component data to the renderer once per frame; the renderer hands back GPU timing + presentation events.

Related specs:
- `docs/specs/core/ecs.md` · `docs/specs/core/events.md` · `docs/specs/core/jobs.md` · `docs/specs/core/hal.md`
- `docs/specs/renderer/overview.md` · `docs/specs/renderer/backend.md` · `docs/specs/renderer/shaders.md`
- Sibling contracts: `docs/contracts/renderer-assets.md` · `docs/contracts/physics-renderer.md`

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (data) | `nexus-core` | `crates/core/src/lib.rs` (ECS world, schedule) |
| Provider (window/surface) | `nexus-hal` | `crates/hal/src/window.rs` |
| Consumer | `nexus-renderer` | `crates/renderer/src/lib.rs` (impl `Plugin`) |

Pattern reference: Bevy `Plugin` trait — renderer registers itself into the core schedule, not the other way around. Cf. `bevyengine/bevy` `RenderPlugin`. Liskov-substitutable: any backend that satisfies `RendererBackend` (see §Provided API) is swappable. (Bertrand Meyer, *Object-Oriented Software Construction*, 2nd ed., ch. 11 — Design by Contract.)

---

## Call flow

```
 frame N
  core::schedule -> stage::Extract  ──► renderer::extract(&World) ──► RenderWorld N
                                              │
                                              ▼  (jobs pool, parallel)
                          renderer::prepare(RenderWorld) ─► GPU resources
                                              │
                                              ▼
                          renderer::queue(...) ─► draw commands
                                              │
                                              ▼
                          renderer::submit() ─► wgpu::Queue::submit + surface.present()
                                              │
                                              ▼
                          core::events <── FramePresented { frame, gpu_us, present_us }
```

Extract is the only stage that touches the live `World`. After Extract, the renderer owns its `RenderWorld` snapshot for the remainder of the frame; core may advance to frame N+1 in parallel. Pattern: Bevy render-app extraction.

---

## Provided API (Renderer surface that Core calls)

```rust
pub trait RendererBackend: Send + Sync + 'static {
    /// Called once during engine boot, after HAL window exists.
    fn init(&mut self, ctx: &RendererInitCtx<'_>) -> Result<(), RendererError>;

    /// Snapshot renderable components out of the live World.
    /// MUST NOT mutate World. MUST complete in < extract_budget_us.
    fn extract(&mut self, world: &World, frame: FrameId) -> Result<(), RendererError>;

    /// Build GPU resources from the extracted snapshot. May run in parallel with core update().
    fn prepare(&mut self, frame: FrameId) -> Result<(), RendererError>;

    /// Record draw commands.
    fn queue(&mut self, frame: FrameId) -> Result<(), RendererError>;

    /// Submit to GPU and present. Emits FramePresented event on core::EventBus.
    fn submit(&mut self, frame: FrameId, bus: &EventBus) -> Result<FrameStats, RendererError>;

    /// Surface resize (driven by HAL Resized event).
    fn on_resize(&mut self, w: u32, h: u32) -> Result<(), RendererError>;

    /// Hot path query for ECS systems that need viewport.
    fn viewport(&self) -> Viewport;

    /// Capability negotiation; deterministic for a given (adapter, surface).
    fn capabilities(&self) -> &RendererCaps;
}
```

## Required API (Core surface that Renderer calls)

```rust
// nexus-core
pub fn world(&self) -> &World;
pub fn events(&self) -> &EventBus;
pub fn jobs(&self) -> &JobScope;            // parallel-for inside prepare/queue
pub fn time(&self) -> Time;                 // delta_s, frame_id, monotonic_ns
pub fn config(&self) -> &EngineConfig;

// nexus-hal (re-exported via core)
pub fn raw_window_handle(&self) -> RawWindowHandle;
pub fn raw_display_handle(&self) -> RawDisplayHandle;
```

Components the renderer reads (queries must be registered in `extract` only):

| Component | Module | Notes |
|---|---|---|
| `Transform` | `nexus-core::transform` | global, post-hierarchy resolve |
| `Visibility` | `nexus-core::visibility` | culled meshes skipped |
| `MeshHandle` | `nexus-renderer::mesh` | weak handle into asset registry |
| `MaterialHandle` | `nexus-renderer::material` | weak handle |
| `Camera`, `Projection` | `nexus-renderer::camera` | one or more cameras per frame |
| `Light` (Directional/Point/Spot) | `nexus-renderer::light` | |
| `SkinnedMesh` | `nexus-renderer::skin` | bone palette in core::skeleton |

---

## Data Schema

```rust
pub struct FrameId(pub u64);                // monotonic, never reused
pub struct Time { pub frame: FrameId, pub delta_s: f32, pub monotonic_ns: u64 }
pub struct Viewport { pub x: u32, pub y: u32, pub w: u32, pub h: u32, pub scale: f32 }

pub struct RendererCaps {
    pub backend: Backend,                   // Vulkan | Metal | Dx12 | WebGpu | Gl
    pub max_texture_2d: u32,
    pub max_uniform_buffer_binding: u32,
    pub timestamp_query: bool,
    pub ray_tracing: bool,
    pub bindless: bool,
}

pub struct FrameStats {
    pub frame: FrameId,
    pub cpu_extract_us: u32,
    pub cpu_prepare_us: u32,
    pub cpu_queue_us: u32,
    pub gpu_total_us: u32,                  // 0 if timestamp_query == false
    pub draw_calls: u32,
    pub triangles: u64,
    pub vram_used_mb: u32,
}

pub enum RendererEvent {
    FramePresented(FrameStats),
    DeviceLost { reason: DeviceLostReason },
    SurfaceResized { w: u32, h: u32 },
    ShaderReloaded { id: ShaderId, ok: bool, log: Option<String> },
}
```

JSON/TOML wire fragment (machine-parseable for `nexus-agent-sdk`, see `docs/specs/agent/telemetry.md`):

```json
{
  "channel": "renderer.frame",
  "schema": 1,
  "payload": {
    "frame": 4123,
    "cpu_extract_us": 120, "cpu_prepare_us": 410, "cpu_queue_us": 220,
    "gpu_total_us": 6500, "draw_calls": 1842, "triangles": 4310221,
    "vram_used_mb": 612
  }
}
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Core | `extract` runs in exclusive-World access; no other system mutates World during it. |
| O-2 | Renderer | After `extract` returns, renderer holds no `&World` reference past the frame. |
| O-3 | Renderer | `prepare → queue → submit` strict order per frame, no skipping. |
| O-4 | Core | At most 2 frames in flight (extract N+1 may begin while submit N runs). |
| O-5 | Renderer | `FramePresented` for frame N fires before `extract` for frame N+2 begins. |
| O-6 | Both | `RendererBackend::init` happens-before any `extract`; `drop` happens-after last `submit`. |
| O-7 | Core | Asset handles passed in components stay live until next `extract` boundary. See `docs/contracts/renderer-assets.md`. |

---

## Threading & Concurrency Rules

- `extract` runs on the main schedule thread; assumed `!Sync` for World.
- `prepare`/`queue` may dispatch to `JobScope`; renderer's internal data is `Send + Sync`.
- `wgpu::Queue::submit` is single-threaded by contract: only `submit()` calls it.
- Renderer MUST NOT call `World::get_resource_mut` from any stage. Read-only access via `extract` snapshot.
- Renderer MAY write directly to `EventBus` via `bus.send(RendererEvent)`. EventBus is MPMC (see `docs/specs/core/events.md`).

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| `extract` CPU per frame | ≤ 0.5 ms | 2.0 ms | 10k visible entities, M2 / Ryzen 7 [BENCHMARK NEEDED] |
| `prepare` CPU per frame | ≤ 1.5 ms | 4.0 ms | parallel over jobs |
| `queue` CPU per frame | ≤ 1.0 ms | 3.0 ms | indirect draws preferred |
| `submit` wall | ≤ 0.2 ms | 1.0 ms | API call overhead only |
| GPU frame budget @ 60 fps | 12 ms | 16.6 ms | leaves 4 ms for OS compositor |
| GPU frame budget @ 144 fps | 5 ms | 6.9 ms | |
| Steady-state VRAM | per-game cap | adapter advertised | OOM → `DeviceLost{Oom}` |
| Frames in flight | 2 | 3 | matches wgpu present mode |

References: wgpu `Queue::write_buffer` / `Queue::write_texture` staging semantics — data is copied immediately, GPU upload deferred to next `submit`. See https://docs.rs/wgpu/latest/wgpu/struct.Queue.html.

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `RND-001` | `BackendInit` | No compatible adapter | Core retries lower tier; if all fail → fatal |
| `RND-010` | `SurfaceLost` | Window/surface gone | Core re-creates surface from HAL, calls `on_resize` |
| `RND-011` | `DeviceLost{Oom}` | GPU out of memory | Core evicts streamed assets, retries `prepare` |
| `RND-012` | `DeviceLost{Reset}` | GPU reset / driver crash | Core re-runs `init`, scene reloaded from snapshot |
| `RND-020` | `ExtractOverBudget` | extract > hard limit | Logged; non-fatal; profiler flags entity count |
| `RND-021` | `ShaderCompile` | WGSL compile failure | Renderer keeps last good shader; emits `ShaderReloaded{ok:false}` |
| `RND-030` | `AssetMissing` | Mesh/texture handle stale | Substitute pink-checker; emit `AssetMissing` to bus |

All errors are `#[non_exhaustive]` structs with `code: &'static str`, `message: String`, `frame: FrameId`, `suggested_fix: &'static str`. Per AI-first mandate (vision §AI-First).

---

## Versioning Rule

Contract is semver'd as `nexus-contract-renderer = "MAJOR.MINOR.PATCH"`. See https://semver.org.

- **MAJOR** bump: removing or changing the type signature of any trait method, removing a component the renderer reads, changing an Ordering guarantee, changing a `FrameStats` field type.
- **MINOR** bump: adding a new trait method with a provided default, adding a new optional component the renderer reads (renderer must tolerate absence), adding a new variant to `RendererEvent` (mark enum `#[non_exhaustive]`).
- **PATCH**: docs, perf targets, internal-only changes.

Both crates MUST declare `nexus-contract-renderer = "X"` and CI fails on mismatch.

---

## Test Matrix

Assertions both crates must pass in `tests/contract_core_renderer.rs`:

- T-01 Spawn 10k entities with Mesh+Transform → `FramePresented` fires within 2 frames.
- T-02 Drop visible entity mid-frame → no use-after-free; renderer survives.
- T-03 Resize window 1080p→4k→1080p in 10 frames → no panics, no leaks.
- T-04 Force `DeviceLost{Reset}` → engine recovers within 60 frames, scene identical.
- T-05 Headless mode (`--headless`) → `RendererBackend` is `NullRenderer`; `FramePresented` still fires with `gpu_total_us = 0`.
- T-06 Determinism: with fixed inputs, `FrameStats.draw_calls` is identical across two runs (cpu_*_us is not asserted).
- T-07 Two backends (wgpu, null) both satisfy `RendererBackend` and the integration suite passes on each. (LSP.)
- T-08 Renderer over-budget extract emits `RND-020` but next frame still presents.

---

## Open Questions

- [DECISION NEEDED] Is `RenderWorld` a full clone, a copy-on-write, or column-extracted? Bevy chose extracted columns; cost/benefit unclear for our archetype layout. → owner: AGENT 02 + AGENT 03.
- [DECISION NEEDED] Do we expose `wgpu::Device` directly to user plugins, or wrap behind `RendererCtx`? Bevy wraps; users want raw for custom passes. → AGENT 03.
- [DECISION NEEDED] Multi-window: one `RendererBackend` instance per window, or one backend with N surfaces? → AGENT 11 (editor needs multi-window).
- [BENCHMARK NEEDED] Real extract cost at 10k / 100k entities on baseline hardware matrix.
- [AGENT: 02] Confirm `World` exposes the read-only snapshot view this contract assumes (`extract` cannot tolerate `&mut World`).
- [AGENT: 09] Asset handle stability across frames: confirm `MeshHandle` ref-count semantics survive O-7.
