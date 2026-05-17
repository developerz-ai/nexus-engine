<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Renderer ⇄ Assets

> Asset pipeline streams CPU-side mesh, texture, and shader bytes to the renderer's GPU upload queue, on demand and on a priority budget. Renderer holds weak handles; assets own residency.

Related specs:
- `docs/specs/renderer/overview.md` · `docs/specs/renderer/backend.md` · `docs/specs/renderer/shaders.md`
- `docs/specs/assets/overview.md` · `docs/specs/assets/import.md` · `docs/specs/assets/streaming.md` · `docs/specs/assets/lod.md` · `docs/specs/assets/compression.md` · `docs/specs/assets/registry.md`
- Sibling: `docs/contracts/core-renderer.md` (handles flow through ECS)

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider (asset registry, IO, decode) | `nexus-assets` | `crates/assets/src/lib.rs` |
| Consumer (GPU uploader, samplers, pipelines) | `nexus-renderer` | `crates/renderer/src/gpu_upload.rs` |
| Shared | `nexus-core` | `AssetId` defined in `crates/core/src/asset_id.rs` |

Pattern reference: wgpu `Queue::write_buffer` / `Queue::write_texture` (data copied immediately to staging, GPU upload deferred to next `submit`) — see https://docs.rs/wgpu/latest/wgpu/struct.Queue.html. UE5 virtual texture / streaming page server. bgfx "memory" lifetime model.

---

## Call flow

```
 game / scene loads
   │
   ├─► renderer holds GpuHandle (weak); component carries AssetId
   │
 every frame:
   ├─► assets::tick_streaming()  ── enqueue priority loads, evict
   │      │ disk IO worker pool
   │      ▼
   │   decoded CPU resource ready
   │      │
   │      ▼ (lock-free queue: UploadRequest)
   ├─► renderer::poll_uploads(budget_bytes_per_frame)
   │      ├─ pop requests until budget exhausted
   │      ├─ wgpu::Queue::write_buffer / write_texture
   │      └─ mark GpuHandle ready; emit AssetReady event
   │
   └─► renderer reads only handles with `is_ready() == true`; missing handles
        render with substitute (pink-checker / fallback mesh)
```

---

## Provided API (Assets surface that Renderer calls)

```rust
pub trait AssetRegistry: Send + Sync + 'static {
    fn get_mesh(&self, id: AssetId) -> Option<MeshCpu>;        // decoded, ready-to-upload
    fn get_texture(&self, id: AssetId) -> Option<TextureCpu>;
    fn get_shader(&self, id: AssetId) -> Option<ShaderSource>;
    fn get_material(&self, id: AssetId) -> Option<MaterialDef>;

    /// Pop up to `max_bytes` worth of pending upload requests.
    fn drain_uploads(&self, max_bytes: u64, out: &mut Vec<UploadRequest>) -> usize;

    /// Hint that this asset is wanted at given screen importance (0..1).
    fn touch(&self, id: AssetId, importance: f32, lod: u8);

    /// Notify registry that this GPU resource is resident.
    fn mark_resident(&self, id: AssetId, lod: u8, vram_bytes: u32);

    /// Asks for eviction of LRU resources to free at least `bytes`.
    fn evict(&self, bytes: u64) -> Vec<AssetId>;

    /// Live count of in-flight load requests (telemetry).
    fn stats(&self) -> AssetStats;
}
```

## Required API (Renderer surface that Assets calls)

```rust
pub trait RendererUploader: Send + Sync + 'static {
    /// Allocate a GPU buffer + return opaque handle. Assets calls this when CPU bytes are ready
    /// but the upload is too big to fit `poll_uploads` budget — assets owns staging then drives upload itself.
    fn alloc_buffer(&self, size: u64, usage: BufferUsage) -> GpuBufferHandle;
    fn alloc_texture(&self, desc: TextureDesc) -> GpuTextureHandle;
    fn destroy_buffer(&self, h: GpuBufferHandle);
    fn destroy_texture(&self, h: GpuTextureHandle);

    /// Compile shader source (WGSL). Returns ready handle or error.
    fn compile_shader(&self, src: &ShaderSource) -> Result<GpuShaderHandle, RendererError>;

    /// Synchronous backdoor for small assets (< 64 KB) — bypasses streaming budget.
    fn upload_small(&self, dst: GpuBufferHandle, data: &[u8], offset: u64);
}
```

---

## Data Schema

```rust
pub struct AssetId(pub u128);                 // UUID v7; stable across runs

pub struct UploadRequest {
    pub id: AssetId,
    pub lod: u8,
    pub kind: AssetKind,                      // Mesh | Texture | Shader | Material | AudioBlob
    pub priority: u16,                        // higher = uploaded first
    pub bytes: UploadBytes,                   // borrowed CPU bytes; live until upload acks
}

pub enum UploadBytes<'a> {
    MeshBlob { vertices: &'a [u8], indices: &'a [u8], layout: VertexLayout },
    Texture2D { mip0: &'a [u8], mips: &'a [&'a [u8]], format: TextureFormat, w: u32, h: u32 },
    Cube { faces: [&'a [u8]; 6], format: TextureFormat, size: u32 },
    Volume { data: &'a [u8], format: TextureFormat, w: u32, h: u32, d: u32 },
    ShaderWgsl { source: &'a str },
}

pub struct TextureDesc {
    pub w: u32, pub h: u32, pub d: u32,
    pub mips: u8, pub array_layers: u32,
    pub format: TextureFormat,                // BC7, ASTC_6x6, RGBA8, R11G11B10F, ...
    pub usage: TextureUsage,                  // SAMPLED | STORAGE | RENDER_TARGET
    pub sampler_hint: SamplerHint,
}

pub struct VertexLayout {
    pub stride: u16,
    pub attrs: SmallVec<[VertexAttr; 8]>,     // semantic + format + offset
}

pub struct MaterialDef {                      // resolved, GPU-uploadable
    pub shader: AssetId,
    pub bindings: SmallVec<[Binding; 16]>,    // texture or constant
    pub uniforms: SmallVec<[u8; 256]>,        // packed
    pub keywords: Bitset64,                   // shader permutation key
}

pub struct AssetStats {
    pub resident_count: u32,
    pub resident_vram_mb: u32,
    pub pending_load: u32,
    pub pending_upload_bytes: u64,
    pub evictions_this_sec: u32,
    pub misses_this_sec: u32,
}
```

On-disk pack format header (`*.nxa`, machine-parseable):

```text
offset  size   field
   0      4    magic = "NXA1"
   4      2    version
   6      2    kind (Mesh=1, Texture=2, Shader=3, Material=4, Audio=5)
   8     16    uuid (AssetId, v7)
  24      8    payload length
  32      4    checksum (xxhash32, of payload)
  36      4    flags (compressed? streaming? ...)
  40    var    type-specific header (mesh layout, texture format, ...)
   N    var    payload bytes
```

Asset manifest (TOML, generated; consumed by renderer and assets crates):

```toml
[[assets]]
id    = "0193a8f7-5e02-7000-8000-1c5b4d2a9001"
path  = "meshes/dragon.gltf"
kind  = "Mesh"
lods  = 4
size  = 8_421_376
deps  = ["0193a8f7-5e02-7000-8000-1c5b4d2a9020"]  # dragon_albedo.bc7
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Assets | `AssetId` is stable across processes, builds, and content versions (UUID v7). |
| O-2 | Assets | A decoded CPU resource stays alive until the matching `mark_resident` or explicit `cancel`. |
| O-3 | Renderer | `drain_uploads` results MUST all be uploaded within the same frame (call `mark_resident` on success). |
| O-4 | Renderer | Until `mark_resident(id, lod, ...)`, `GpuHandle::is_ready(id, lod)` returns `false` and renderer uses fallback. |
| O-5 | Assets | Eviction never blocks; selects LRU not-referenced-this-frame; calls `destroy_buffer/texture`. |
| O-6 | Both | A `MaterialDef.shader` reference implies the shader is loaded first; assets enforces topological order in `drain_uploads`. |
| O-7 | Renderer | `upload_small` is synchronous; allowed only for resources < 64 KB and uniform/constant data. |
| O-8 | Assets | Hot-reload: changing source file produces a NEW `UploadRequest` with same `AssetId`; old GPU resource is replaced atomically at frame boundary. |

---

## Threading & Concurrency Rules

- Disk IO + decode runs on an asset worker pool (`rayon` for CPU-heavy: image decode, mesh process).
- `drain_uploads` is called from the renderer's `prepare` stage (single-threaded, see `core-renderer.md`).
- `wgpu::Queue::write_*` calls happen only on the renderer's submit thread.
- `touch` / `mark_resident` are `&self` and lock-free (uses atomics + sharded maps).
- `compile_shader` MAY run on a worker (naga is thread-safe); result handed back via channel.

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| Streaming budget per frame | 16 MB | 64 MB | configurable per device tier |
| `drain_uploads` CPU | ≤ 0.5 ms | 2 ms | for 16 MB of requests |
| `get_mesh` / `get_texture` | ≤ 100 ns | 1 µs | hashmap shard lookup |
| Shader compile (cold) | ≤ 50 ms | 500 ms | WGSL → SPIR-V/Metal |
| Shader compile (cached) | ≤ 1 ms | 5 ms | pipeline cache hit |
| Texture decode (1024² BC7) | ≤ 10 ms | 50 ms | on worker |
| LOD switch latency | ≤ 2 frames | 4 frames | from `touch(importance↑)` to ready |
| Eviction CPU | ≤ 0.2 ms | 1 ms | per call |
| Missing-asset overhead | 0 (fallback) | — | render must never block |

References: wgpu staging buffer semantics, UE5 virtual texturing budget heuristics, ASTC encoder throughput.

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `AST-001` | `NotFound` | AssetId unknown | renderer uses fallback; emit event |
| `AST-010` | `DecodeFail` | bytes corrupt / format unsupported | mark asset failed; report to bus |
| `AST-011` | `WrongKind` | requested mesh, got texture | typed error, log |
| `AST-020` | `OutOfVram` | upload would exceed budget | request eviction; retry next frame |
| `AST-021` | `OutOfRam` | decode buffer cap exceeded | back off load; retry |
| `AST-030` | `ShaderCompile` | naga error | keep last-good; emit `ShaderReloaded{ok:false}` (see core-renderer.md) |
| `AST-031` | `ShaderMissingFeature` | requires unsupported wgpu feature | skip permutation; fall back |
| `AST-040` | `DependencyMissing` | material → missing texture | upload material with pink-checker substitute |

---

## Versioning Rule

`nexus-contract-renderer-assets = "MAJOR.MINOR.PATCH"`. On-disk pack format `*.nxa` versioned independently in its header.

- **MAJOR**: change `UploadRequest` enum layout, change `AssetId` size, remove an `AssetKind`, change pack header.
- **MINOR**: add `AssetKind` variant, add `TextureFormat`, add `SamplerHint`, add fields to `AssetStats`.
- **PATCH**: defaults, decoder internals, compression backend swap (e.g., new BC7 encoder) that preserves output.

`*.nxa` files declare their format version; readers refuse mismatched MAJOR and log `AST-010` with `suggested_fix: "re-bake assets with current nexus-cli"`.

---

## Test Matrix

`tests/contract_renderer_assets.rs`:

- T-01 Spawn entity with `MeshHandle` for not-yet-loaded mesh → first frame renders fallback; within N frames `is_ready` true and real mesh rendered.
- T-02 Streaming budget: queue 100 MB of textures with budget 16 MB/frame → all uploaded in ≤ 7 frames, no over-budget.
- T-03 Eviction: fill VRAM to cap → spawning new asset triggers eviction of LRU; no panics.
- T-04 Material → Shader dependency: load material whose shader is missing → material uploaded with pink-shader; on shader arrival, atomically swaps.
- T-05 Hot reload: edit `dragon.wgsl` → recompile within budget; next frame uses new shader.
- T-06 Headless: assets pipeline runs without GPU; `upload_*` is no-op; `mark_resident` still fires (for tests).
- T-07 Stale handle: asset evicted while a draw call references it → renderer detects `is_ready==false`, falls back, no crash.
- T-08 Pack version skew: load a `*.nxa` from older MAJOR → `AST-010` with migration hint.
- T-09 Determinism: same asset bytes → same `mark_resident(vram_bytes)`; useful for snapshot diff.

---

## Open Questions

- [DECISION NEEDED] Do we expose a "bindless" upload path on Vulkan/DX12 (skip per-material binding cost), and gate it behind `RendererCaps::bindless`? AGENT 03 + AGENT 09.
- [DECISION NEEDED] Streaming priority function: pure screen-space coverage, or also designer-set hints in component? AGENT 09.
- [DECISION NEEDED] Should assets register a "fallback registry" (pink-checker, error-mesh) or is that the renderer's job? Currently the renderer owns it.
- [DECISION NEEDED] Mesh skinning palette upload: per-frame uniform vs storage buffer? affects MAJOR for `MeshCpu` if changed later.
- [BENCHMARK NEEDED] Real `drain_uploads` cost at 64 MB/frame with mixed BC7 + mesh.
- [AGENT: 03] Confirm renderer `prepare` stage can absorb `drain_uploads` within its CPU budget (`core-renderer.md` performance table).
- [AGENT: 09] Confirm UUID v7 generator is shared across `nexus-cli`, runtime, and editor.
