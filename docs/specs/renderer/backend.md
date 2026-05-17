<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Renderer Backend

> Single GPU abstraction (wgpu) targeting Vulkan, Metal, DX12, WebGPU, with explicit capability negotiation and a thin shim layer for Nexus-specific needs.

## Boundaries

- Owns: device/adapter selection, surface creation, capability table, format negotiation, fallback policy, debug/validation layer config.
- Does NOT own:
  - Frame composition / passes → `docs/specs/renderer/overview.md`.
  - Window creation → `docs/specs/core/hal.md` [AGENT: 02].
  - Shader compilation strategy → `docs/specs/renderer/shaders.md`.
- Depends on:
  - `wgpu` (gfx-rs/wgpu) as sole graphics abstraction.
  - `winit` for window/surface handle → HAL.
  - `naga` for WGSL parsing and backend translation.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │           Nexus Backend Shim                │
                    │  (capability table, defaults, fallback)     │
                    └────────────────────┬────────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────────┐
                    │                  wgpu                       │
                    │   Device · Queue · Surface · Pipeline       │
                    └─────────────────────────────────────────────┘
                                         │
        ┌────────────────┬───────────────┼───────────────┬───────────────┐
        ▼                ▼               ▼               ▼               ▼
   ┌─────────┐      ┌─────────┐    ┌─────────┐     ┌─────────┐     ┌──────────┐
   │ Vulkan  │      │  Metal  │    │  DX12   │     │ WebGPU  │     │  GLES3   │
   │ Linux/  │      │ macOS/  │    │ Windows │     │ Browser │     │  legacy  │
   │ Win/And │      │  iOS    │    │         │     │  WASM   │     │ fallback │
   └─────────┘      └─────────┘    └─────────┘     └─────────┘     └──────────┘
```

Per-platform default backend:

| Platform | Primary  | Fallback   | Notes                                           |
|----------|----------|------------|-------------------------------------------------|
| Linux    | Vulkan   | GLES3      | Wayland + X11 both via wgpu/winit.              |
| Windows  | DX12     | Vulkan     | DX12 default (driver maturity), Vulkan opt-in.  |
| macOS    | Metal    | —          | Vulkan via MoltenVK not first-class.            |
| Android  | Vulkan   | GLES3      | Vulkan 1.1+ required; GLES3 fallback for <2018. |
| iOS      | Metal    | —          | Metal 2.0+.                                     |
| Web      | WebGPU   | WebGL2     | WebGL2 fallback gates many features off.        |
| Switch   | NVN      | —          | `[DECISION NEEDED]` wgpu-NVN backend feasibility.|
| PS5/XBSX | platform | —          | NDA backends, not in OSS tree.                  |

## Capabilities Negotiation

At init, the backend probes the adapter and produces a `CapabilityTable` consumed by every other renderer subsystem. Features fall into three tiers:

```
Tier 1 — REQUIRED (engine refuses to start without):
  · Vertex shader, fragment shader, compute shader (or graphics-only fallback path)
  · Texture sampling, mipmaps, anisotropic filter ≥ 4x
  · Depth buffer ≥ 24-bit
  · 4096x4096 texture min, 256 MB heap min
  · sRGB color attachment

Tier 2 — STANDARD (assumed; absence triggers downgrade path):
  · Compute shaders with storage textures
  · Indirect draw / dispatch
  · Push constants ≥ 128 bytes (or emulated via UBO)
  · BCn texture compression (desktop) OR ASTC (mobile)
  · MSAA 4x

Tier 3 — OPTIONAL (feature-detected per-pass):
  · Mesh shaders (Vulkan VK_EXT_mesh_shader, DX12 SM6.5+, Metal 3)
  · Ray query / ray tracing pipelines (DXR, VK_KHR_ray_tracing_pipeline)
  · Bindless / descriptor indexing
  · 16-bit float in shaders
  · Variable rate shading (VRS)
  · Cooperative matrix / wave intrinsics
  · Timestamp queries
  · Async compute queue
```

```rust
pub struct CapabilityTable {
    pub backend: Backend,
    pub adapter_name: String,
    pub vendor: GpuVendor,
    pub tier: CapabilityTier,        // T1 / T2 / T3
    pub features: FeatureFlags,      // bitset
    pub limits: Limits,              // wgpu::Limits
    pub max_texture_size: u32,
    pub max_buffer_size: u64,
    pub max_bind_groups: u32,
    pub supports_ray_query: bool,
    pub supports_mesh_shader: bool,
    pub supports_bindless: bool,
    pub supports_timestamp: bool,
    pub preferred_swap_format: TextureFormat,
    pub hdr_swap_supported: bool,
}
```

Downgrade policy: every render node declares `min_tier` and `requires` flags. At graph compile, nodes whose requirements aren't met are replaced by their declared fallback (if any) or trigger `RENDER_FEATURE_UNAVAILABLE` if no fallback exists. Style modules and post effects must always provide a Tier 2 fallback.

## Public API

```rust
pub enum Backend { Vulkan, Metal, Dx12, WebGpu, Gles3 }
pub enum BackendPref { Auto, Force(Backend), PreferList(Vec<Backend>) }
pub enum GpuVendor { Nvidia, Amd, Intel, Apple, Qualcomm, Arm, Other }

pub struct BackendInit {
    pub pref: BackendPref,
    pub power_pref: PowerPreference,    // HighPerformance | LowPower
    pub validation: ValidationMode,     // Off | On | Verbose
    pub trace_dir: Option<PathBuf>,     // wgpu API trace
    pub require_features: FeatureFlags,
}

pub struct Backend {
    pub fn init(init: BackendInit) -> Result<Self, BackendError>;
    pub fn capabilities(&self) -> &CapabilityTable;
    pub fn device(&self) -> &wgpu::Device;
    pub fn queue(&self) -> &wgpu::Queue;
    pub fn create_surface(&self, window: &Window) -> Result<Surface, BackendError>;
    pub fn list_adapters() -> Vec<AdapterInfo>;       // diagnostic
}
```

## Performance Contract

| Metric                                     | Target           | Hard limit           |
|--------------------------------------------|------------------|----------------------|
| `Backend::init` end-to-end                 | < 100 ms         | < 500 ms             |
| Adapter enumeration                        | < 10 ms          | < 50 ms              |
| Validation overhead (`On`, release build)  | ≤ 5% frame time  | ≤ 15%                |
| Validation overhead (`Off`)                | 0                | 0                    |
| Memory overhead of capability table        | < 8 KB           | < 64 KB              |

## Error Contract

| Code                          | Meaning                                  | Caller action                              |
|-------------------------------|------------------------------------------|--------------------------------------------|
| `BACKEND_NO_ADAPTER`          | No compatible GPU                        | Show install-driver hint, exit             |
| `BACKEND_BELOW_TIER1`         | Adapter cannot meet Tier 1               | Emit adapter info JSON, exit               |
| `BACKEND_FEATURE_UNAVAILABLE` | Required feature missing, no fallback    | Disable feature in `Nexus.toml`            |
| `BACKEND_DEVICE_LOST`         | TDR / driver crash                       | Recreate device, request frame replay      |
| `BACKEND_SURFACE_INVALID`     | Window minimized / surface lost          | Skip frame, await resize event             |
| `BACKEND_OUT_OF_MEMORY`       | GPU OOM                                  | Free transient pool, retry, escalate       |

## Integration Points

| System         | Contact                                                                          |
|----------------|----------------------------------------------------------------------------------|
| HAL            | Receives `RawWindowHandle` → returns `Surface`.                                  |
| Renderer       | Consumes `CapabilityTable` to gate features at graph compile.                    |
| Shaders        | Selects WGSL → SPIR-V / MSL / HLSL / WGSL via naga based on backend.             |
| Agent SDK      | Headless mode forces software adapter (`wgpu-on-vulkan-llvmpipe`) if no GPU.     |
| Editor         | "GPU Info" panel reads `CapabilityTable`.                                        |
| Test suite     | CI uses `lavapipe` (Vulkan software) and `swiftshader` (DX12) for headless runs. |

## Test Requirements

- Initialize on a machine with no GPU → returns `BACKEND_NO_ADAPTER` with structured diagnostics.
- Initialize on `lavapipe` software Vulkan → succeeds at Tier 2 (no RT, no mesh shaders).
- Force WebGPU backend in native binary → fails with clear `Backend not available on this platform`.
- Capability serialization → round-trip via JSON, equal.
- Device-lost simulation (wgpu API trace replay) → recovers, no leaked Vulkan handles.
- Each of {Vulkan, Metal, DX12, WebGPU} renders an identical reference scene to pixel-hash parity within ≤ 2% tolerance.

## Prior Art

- `gfx-rs/wgpu` ✓ unified API across all platforms; ✓ active development; ✗ feature lag behind native APIs.
- `bkaradzic/bgfx` ✓ wider backend matrix (incl. GLES2); ✗ C++ only, no WebGPU first-class.
- `DiligentGraphics/DiligentEngine` ✓ explicit capability tiers; ✗ heavyweight C++ inheritance hierarchy.
- Filament's `Engine::Backend` ✓ thin capability shim; we copy this pattern.
- Vulkan WSI extension model ✓ surface handles separated from device.

## Open Questions

- `[DECISION NEEDED]` Drop GLES3 fallback entirely? Mobile Vulkan coverage is now ≥ 90% (2026); GLES3 doubles shader maintenance.
- `[DECISION NEEDED]` Wrap wgpu in our own trait (allowing future native backend swap) vs. embrace wgpu's API surface directly?
- `[DECISION NEEDED]` Console (Switch/PS5/Xbox) backends — closed-source crates merged via private fork at v1.1?
- `[BENCHMARK NEEDED]` Validation-on overhead on Vulkan vs. DX12 vs. Metal — informs default release setting.
- `[DECISION NEEDED]` Power preference default for laptop builds — `LowPower` saves battery but picks Intel iGPU.
