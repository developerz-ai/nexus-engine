<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Post-Processing Stack

> Ordered chain of screen-space passes between scene HDR output and swapchain: TAA, SSAO, SSR, motion blur, depth of field, bloom, exposure, ACES tonemap, color grading, output transform. Every pass toggleable per-camera.

## Boundaries

- Owns: all post passes, pass ordering, full-screen quad infrastructure, ACES color pipeline.
- Does NOT own:
  - Scene rendering / GBuffer creation → `docs/specs/renderer/overview.md`.
  - HUD / UI compositing → `docs/specs/editor/overview.md` [AGENT: 11] (UI is its own pass).
  - HDR display surface format → `docs/specs/renderer/backend.md`.
- Depends on:
  - Linear HDR scene color, depth, motion vectors, GBuffer normals as inputs.
  - Render graph (`overview.md`) for pass declaration.

## Architecture — Canonical Pass Order

```
Scene HDR (RGBA16F)
   │
   ├─► [SSAO]            — half-res AO buffer
   │
   ├─► [SSR]             — half-res reflection buffer
   │
   ├─► [Apply AO + SSR]  — composited back into scene color
   │
   ├─► [Motion Blur]     — per-object + camera, velocity-buffer-driven
   │
   ├─► [Depth of Field]  — bokeh circle, near/far blur
   │
   ├─► [TAA]             — temporal accumulation, jitter inverse
   │
   ├─► [Auto Exposure]   — histogram-based, EV100 average
   │
   ├─► [Bloom]           — physical, dual-filter downsample/upsample
   │
   ├─► [Tonemap]         — ACES RRT+ODT (default) or alternatives
   │
   ├─► [Color Grade]     — LUT + lift/gamma/gain + per-channel curves
   │
   ├─► [Output Transform]— sRGB | Rec.709 | Rec.2020 PQ / scRGB for HDR display
   │
   ├─► [Vignette/Grain/FXAA] — optional final touches
   │
   ▼
Swapchain
```

Order is fixed in v1.0. Each pass exposes "enabled" + parameters; disabled passes are dropped at graph compile.

## Passes

### TAA — Temporal Anti-Aliasing

- Jitter camera projection each frame (Halton 2,3 sequence, 8-frame loop).
- Reproject prior frame via motion vectors.
- Neighborhood clamp (3×3 min/max OR variance clip — variance clip default) to suppress ghosting.
- Disocclusion mask via depth + normal mismatch → rejects history.
- Sharpen mip-bias to counter softening: -0.5 LOD bias on texture sampling during scene pass.
- Anti-flicker: luminance weighting in resolve.
- Reference: Karis "High-Quality Temporal Supersampling" (UE4), MJP TAA starter pack.

```
[DECISION NEEDED] DLSS/FSR2/XeSS integration as TAAU (TAA upsample)?
                  Vendor-specific; consider neutral super-resolution layer.
```

### SSAO

- HBAO+ style: horizon-based AO with multi-bounce approximation.
- Half-res buffer, bilateral upsample to full res.
- 8 directions × 4 steps default; quality presets scale to 16×6.
- Alternative: GTAO (Activision 2016) — `[DECISION NEEDED]` default.

### SSR

- Hi-Z raymarch.
- Falls back to IBL specular or Lumen specular (`gi.md`) on miss.
- Half-res; jittered for TAA accumulation.

### Motion Blur

- Per-object velocity buffer (R16G16) written during GBuffer pass.
- Tile-based max-velocity blur (McGuire et al. 2012).
- Camera motion blur derived from prev/cur view-projection delta.

### Depth of Field

- Bokeh DoF: scatter-as-gather, hexagonal aperture by default.
- Near + far CoC half-res, composite with alpha-weighted full-res.

### Auto Exposure

- 256-bin compute histogram of luminance.
- Target middle-gray luminance configurable; EV bias.
- Eye adaptation: exponential decay with separate up/down speeds.

### Bloom

- Physical bloom (Jimenez "Next Generation Post Processing in CoD AW" 2014).
- 6-stage downsample with 13-tap, 9-tap upsample with 3×3 tent.
- Energy-conserving combine; intensity in EV.

### Tonemap — ACES Pipeline

Two implementations selectable:

| Variant            | Notes                                                                  |
|--------------------|------------------------------------------------------------------------|
| `aces_fitted`      | Krzysztof Narkowicz curve fit; 1 madd per channel; default for mobile. |
| `aces_full`        | RRT + ODT via 3D LUTs; reference quality, used in editor / cinematics. |
| `agx`              | AgX alternative (better hue handling); opt-in.                         |
| `none`             | Linear → clamp (debug only).                                           |

Display pipeline:

```
Linear scene (RGBA16F, scene-referred)
       │
       ▼
   Exposure (multiply by 2^EV)
       │
       ▼
   ACES RRT (scene-linear → ACEScg working)
       │
       ▼
   Color grade in ACEScg / ACEScc (lift/gamma/gain, sat, contrast, LUT)
       │
       ▼
   ACES ODT for target:
     sRGB / Rec.709          (SDR)
     Rec.2020 PQ (HDR10)     (HDR; uses ODT_2020_1000nit etc.)
     scRGB linear            (Windows HDR FreeSync2)
       │
       ▼
   Swapchain format (BGRA8 sRGB / RGBA16F / RGB10A2)
```

### Color Grading

- Pre-tonemap: temperature/tint, exposure, contrast.
- Post-tonemap: lift/gamma/gain, channel mixer, hue/sat curves, 3D LUT (32³ default).
- LUTs authored in DaVinci/Photoshop, imported as `.cube`.

## Public API

```rust
pub struct PostStack {
    pub taa:       Option<TaaConfig>,
    pub ssao:      Option<SsaoConfig>,
    pub ssr:       Option<SsrConfig>,
    pub motion_blur: Option<MotionBlurConfig>,
    pub dof:       Option<DofConfig>,
    pub bloom:     Option<BloomConfig>,
    pub exposure:  ExposureConfig,
    pub tonemap:   TonemapConfig,    // mode + lut handle
    pub grade:     GradeConfig,
    pub output:    OutputTransform,  // sRGB / Rec709 / Rec2020PQ / scRGB
    pub vignette:  Option<VignetteConfig>,
    pub grain:     Option<GrainConfig>,
    pub fxaa:      bool,
}

pub enum TonemapMode { None, AcesFitted, AcesFull, AgX, Custom(ShaderHandle) }
```

Per-camera `PostStack` component overrides world default.

## Performance Contract

| Metric                                  | Target          | Hard limit         |
|-----------------------------------------|-----------------|--------------------|
| Full stack default-on (1080p, mid GPU)  | < 2.5 ms        | < 5.0 ms           |
| Full stack default-on (4K, high GPU)    | < 5.0 ms        | < 10.0 ms          |
| TAA alone                               | < 0.5 ms        | < 1.0 ms           |
| Bloom alone (1080p)                     | < 0.5 ms        | < 1.2 ms           |
| Tonemap + grade (1080p)                 | < 0.15 ms       | < 0.4 ms           |
| Auto-exposure histogram                 | < 0.1 ms        | < 0.25 ms          |
| Mobile (1080p, Adreno 740)              | < 4.0 ms total  | < 8.0 ms           |

## Error Contract

| Code                          | Meaning                          | Caller action                       |
|-------------------------------|----------------------------------|-------------------------------------|
| `POST_LUT_INVALID`            | LUT dims ≠ 32³ / 64³ etc.        | Reject import                       |
| `POST_HDR_UNSUPPORTED`        | Display not HDR-capable          | Switch to SDR output transform      |
| `POST_TAA_HISTORY_RESET`      | First frame / camera teleport    | Treat as info, not error            |
| `POST_PASS_INPUT_MISSING`     | Required input texture absent    | Disable dependent passes            |

## Integration Points

| System     | Contact                                                                              |
|------------|--------------------------------------------------------------------------------------|
| Renderer   | Inputs declared: HDR color, depth, motion, GBuffer normals.                          |
| Camera     | TAA reads camera jitter; exposure reads EV bias.                                     |
| ECS        | `PostStack` is a component; default world resource for global config.                |
| Editor     | Live tweaks; A/B split-screen comparison; LUT browser.                               |
| Styles     | Pixel style replaces tonemap with palette quantizer; NPR may force `aces_fitted`.    |
| Agent SDK  | Headless captures pre- and post-stack images for diff testing.                       |

## Test Requirements

- Static scene + camera, TAA on, 64 frames → output converges; pixel hash stable past frame 8.
- ACES reference: render Macbeth chart, compare to OpenColorIO reference → ΔE < 1.0.
- Bloom energy test: render white pixel, integrate output → energy preserved within 2%.
- LUT identity: apply 32³ identity LUT → output equals input within 1/255.
- Motion blur: stationary camera, fast object → blur extends along velocity vector.
- HDR display path: render PQ output, sample → values map correctly to nits.

## Prior Art

- ACES (AMPAS) ✓ industry color pipeline; RRT/ODT documented.
- Narkowicz ACES fit ✓ cheap approximation; widely used in real-time.
- UE5 filmic tonemapper (ACES-based) ✓.
- Jimenez "Next Generation Post Processing in CoD AW" ✓ dual-filter bloom, motion blur tile.
- MJP TAA Starter Pack ✓ variance clipping, neighborhood sampling references.
- Activision GTAO 2016 ✓ AO option.
- AgX (Troy Sobotka) ✓ alternative tonemap with superior hue stability.

## Open Questions

- `[DECISION NEEDED]` Super-resolution layer (DLSS/FSR2/XeSS) as plugin slot vs. omit for v1.0.
- `[DECISION NEEDED]` Default AO: HBAO+ vs. GTAO (GTAO faster + cleaner; HBAO+ better-known name).
- `[DECISION NEEDED]` AgX as default for v2.0? Better than ACES Fitted for skin tones.
- `[DECISION NEEDED]` Full 3D-LUT tonemap (ACES full) cost on mobile — likely too expensive, keep fitted-only on mobile.
- `[BENCHMARK NEEDED]` TAA cost on Mali / Adreno — temporal accumulation can stall mobile tiled GPUs.
- `[DECISION NEEDED]` Sharpening: CAS (AMD) vs. simple unsharp mask after TAA.
