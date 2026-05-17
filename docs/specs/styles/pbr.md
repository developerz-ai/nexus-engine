<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Style — PBR (Photorealistic)

> Physically-based rendering profile: Disney-principled BRDF, image-based lighting, optional hardware ray tracing path, reference-quality tone mapping — the photoreal preset for Nexus.

## Boundaries

- Owns: PBR material schema, IBL setup, tone-map presets, ray-tracing pass toggles, photoreal post-FX chain (TAA, bloom, SSAO defaults), reference golden-image suite.
- Does NOT own: PBR shader implementation → `docs/specs/renderer/pbr.md`, shadow algorithms → `docs/specs/renderer/shadows.md`, GI implementation → `docs/specs/renderer/gi.md`, post-FX kernels → `docs/specs/renderer/post.md`.
- Depends on: renderer overview (`docs/specs/renderer/overview.md`), assets (`docs/specs/assets/compression.md` — BCn / ASTC for HDR), style overview (`docs/specs/styles/overview.md`).

## Architecture

```
PBR Render Graph (photoreal preset)

  G-Buffer pass         Lighting pass            Post pass
  ┌────────────┐        ┌───────────────┐        ┌─────────────┐
  │ albedo     │   ───► │ direct (BRDF) │   ───► │ SSAO        │
  │ normal     │        │ indirect (IBL)│        │ Bloom       │
  │ rough/met  │        │ shadow lookup │        │ TAA         │
  │ ao/emit    │        │ optional RT   │        │ Motion blur │
  │ depth      │        │   reflection  │        │ Color grade │
  └────────────┘        │   shadow      │        │ Tone map    │
                        │   GI bounce   │        │   (ACES dflt)│
                        └───────────────┘        └─────────────┘

  When [style.pbr.ray_tracing="full"]:
      G-Buffer ──► RT GI ──► RT Shadows ──► RT Reflections ──► Post
  When [style.pbr.ray_tracing="hybrid"]:
      G-Buffer ──► Lumen-style probe GI ──► RT Reflections only ──► Post
  When [style.pbr.ray_tracing="off"]:
      classic raster + SDFGI/SSGI fallback (see docs/specs/renderer/gi.md)
```

## Public API

```toml
[style]
preset = "pbr"

[style.pbr]
material_model   = "disney"       # "disney" | "filament" | "unreal4"
tone_map         = "aces"         # "aces" | "agx" | "reinhard" | "khr-pbr-neutral"
exposure_ev      = 0.0            # f32, EV stops
ray_tracing      = "hybrid"       # "off" | "hybrid" | "full"
gi               = "lumen"        # "lumen" | "sdfgi" | "baked" | "ssgi"
shadows          = "vsm"          # "vsm" | "csm" | "rt"
ibl              = "assets/sky/kloppenheim.hdr"
ibl_intensity    = 1.0
ssao             = true
taa              = true
motion_blur      = true
sharpening       = 0.3
hdr_output       = true           # display HDR if device supports
```

```rust
pub struct PbrMaterial {
    pub base_color:    Texture | Color,    // sRGB linear
    pub metallic:      Texture | f32,      // 0..1, linear
    pub roughness:     Texture | f32,      // 0..1, perceptual
    pub normal:        Texture | None,     // tangent-space, BC5
    pub ao:            Texture | f32,      // 0..1
    pub emissive:      Texture | Color,    // HDR
    pub emissive_ev:   f32,                // brightness in EV
    pub clearcoat:     f32,                // Disney clearcoat 0..1
    pub clearcoat_rough: f32,
    pub sheen:         f32,
    pub transmission:  f32,                // refraction 0..1
    pub ior:           f32,                // default 1.5
}
```

Material schema serializes to / from glTF 2.0 `KHR_materials_*` extensions for AI-friendly interop (`docs/specs/assets/import.md`).

## Performance Contract

| Metric | Target | Hard limit |
|--------|--------|------------|
| Frame time, mid-scene, 1080p, RT off, RTX 3060-class | < 8.3 ms | 16.6 ms |
| Frame time, RT hybrid, same | < 16.6 ms | 33 ms |
| Frame time, RT full, same | < 33 ms | 50 ms |
| Material draw call (instanced) | < 5 µs | 20 µs |
| IBL convolution (one-time bake) | < 500 ms | 2 s |
| Tone-map pass | < 0.3 ms | 1 ms |
| TAA pass | < 0.6 ms | 2 ms |
| Memory budget per material | < 24 MB (BC compressed) | 64 MB |

`[BENCHMARK NEEDED]` — actual numbers on Switch / iOS / WebGPU once `docs/specs/renderer/backend.md` lands.

## Error Contract

| Code | Meaning | Caller action |
|------|---------|---------------|
| `STYLE_PBR_E001` | IBL HDR missing or wrong format | Provide `.hdr` / `.exr` at `[style.pbr.ibl]` |
| `STYLE_PBR_E002` | Material missing required map under `lock=true` | Re-import; PBR requires albedo + roughness + metallic |
| `STYLE_PBR_E003` | RT requested, device lacks support | Auto-fallback to `hybrid`/`off`; warn once |
| `STYLE_PBR_E004` | Non-linear color data in linear slot | Re-import texture with correct color space |
| `STYLE_PBR_W001` | sRGB-encoded normal map (likely user error) | Force linear sampling, warn |

## Integration Points

- **Renderer (`docs/specs/renderer/pbr.md`)**: this style locks in the Disney-principled BRDF permutations; renderer owns the shader source.
- **Assets**: requires BC5 normal maps, BC7 albedo (or ASTC on mobile), HDR EXR for IBL. Linter enforces under `lock=true`. → `docs/specs/assets/compression.md`.
- **Shadows (`docs/specs/renderer/shadows.md`)**: VSM default; CSM fallback; RT shadows when `ray_tracing != "off"`.
- **GI (`docs/specs/renderer/gi.md`)**: Lumen-style dynamic probe field + SDF trace by default; baked fallback for low-end.
- **Editor**: material inspector exposes the `PbrMaterial` schema 1:1. → `docs/specs/editor/shader.md`.
- **Agent**: golden screenshot tests pin tone-map + exposure; pixel-diff threshold `[BENCHMARK NEEDED]` per platform.

## Asset Constraints (lock = true)

| Asset | Required | Format | Notes |
|-------|----------|--------|-------|
| Base color | yes | sRGB, BC7 / ASTC 6x6 | 1024² minimum, 4096² max default |
| Roughness/Metallic | yes | linear, BC5 (RG) packed | R = roughness, G = metallic |
| Normal | recommended | linear, BC5 | tangent-space, OpenGL convention (+Y up) |
| AO | optional | linear, BC4 (R) | bake from mesh; may pack into RM map B-channel |
| Emissive | optional | HDR, BC6H | EV scaled by `emissive_ev` |
| IBL | yes (one) | RGBA16F EXR equirect | min 2048×1024, max 8192×4096 |

Hand-painted "flat" textures (e.g. no PBR maps) → `STYLE_PBR_E002`. Author intends NPR? Switch preset.

## Test Requirements

- Cornell-Box equivalent scene renders within `[BENCHMARK NEEDED]` LAB ΔE of reference (compared against Mitsuba 3 ground truth).
- Switching `tone_map` between presets changes output but preserves scene linear energy (sanity test).
- `ray_tracing = "full"` on device without RT cores → falls back to `off`, emits `STYLE_PBR_E003`, scene still renders.
- Removing required map under `lock=true` → import fails with `STYLE_PBR_E002`.
- Deterministic golden-image regression on glTF Damaged Helmet, FlightHelmet, Sponza scenes.

## Prior Art

- *Inspired by*: Burley, "Physically-Based Shading at Disney", SIGGRAPH 2012 (`media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf`). ✓ artist-friendly parameters.
- *Inspired by*: Google Filament — material model docs (`google.github.io/filament/Materials.md.html`). ✓ clean lit/cloth/sub-surface separation; ✗ no NPR fallback.
- *Inspired by*: Unreal Engine 5 Lumen — concept only, not code; → `docs/specs/renderer/gi.md`.
- ACES tone mapping — Academy reference. AgX (Troy Sobotka) for film-like neutral; `khr-pbr-neutral` glTF spec tone map for asset-pipeline parity.

## Open Questions

- `[DECISION NEEDED]` Default tone map: ACES (looks "cinematic", crushes saturation) vs AgX (neutral) vs Khronos PBR Neutral (asset-pipeline match)?
- `[DECISION NEEDED]` Support OpenPBR (Autodesk/Adobe 2024 spec) as `material_model = "openpbr"` in v1 or v1.1?
- `[BENCHMARK NEEDED]` Cost of Lumen-style probe-GI on WebGPU — feasible or force `baked` on web?
- `[DECISION NEEDED]` Normal-map convention: +Y (OpenGL) or -Y (DirectX)? Pick one, enforce at import.
