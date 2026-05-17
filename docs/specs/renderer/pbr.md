<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# PBR & Material System

> Filament-aligned physically based shading model with a unified `lit` material, IBL, and a small `lit_anisotropic` / `lit_cloth` / `lit_subsurface` family. Single source of truth for photoreal lighting.

## Boundaries

- Owns: BRDF math, material parameter schema, IBL precompute, light evaluation, material runtime.
- Does NOT own:
  - Shadow generation → `docs/specs/renderer/shadows.md`.
  - Indirect diffuse beyond IBL → `docs/specs/renderer/gi.md`.
  - Non-photoreal shading → `docs/specs/styles/npr.md` [AGENT: 04].
  - Shader compilation / variants → `docs/specs/renderer/shaders.md`.
- Depends on:
  - `docs/contracts/renderer-assets.md` [AGENT: 14] for texture/material handles.
  - `docs/specs/styles/pbr.md` [AGENT: 04] for photoreal style profile bindings.

## Architecture

```
Material (asset)                                            inspired by: google/filament
  ├─ shading_model : Lit | LitAnisotropic | LitCloth | LitSubsurface | Unlit
  ├─ blend_mode    : Opaque | Mask(α) | Transparent | Additive
  ├─ params        : base_color, metallic, roughness, normal, ao, emissive, ...
  └─ uniforms      : packed std140-compatible block (≤ 256 B per material)

                       │
                       ▼
              MaterialInstance (runtime)
                       │ binds textures + uniform buffer
                       ▼
              ┌────────────────────────────────────────┐
              │             Lighting Loop              │
              │                                        │
              │   for each light L visible to pixel:   │
              │     direct = brdf(L) * shadow(L)       │
              │   indirect_diffuse  = ibl_diffuse(N)   │
              │   indirect_specular = ibl_spec(R, α)   │
              │                       + GI (gi.md)     │
              │   color = direct + indirect + emissive │
              └────────────────────────────────────────┘
                       │
                       ▼
              HDR linear ──► post.md (tonemap, grade)
```

Light culling: clustered forward (24×16×24 froxels default) — Tier 2 fallback to tiled forward at 16×16 px.

## BRDF Definition

Standard `lit` model — exact equations match Filament documentation:

```
f(v,l) = f_d(v,l) + f_r(v,l)

Diffuse:
  f_d = (1 - F) * (1/π) * baseColor * (1 - metallic)
  (Lambert; option for Disney burley behind cargo feature)

Specular (Cook–Torrance microfacet):
  f_r = D(h,α) * V(v,l,α) * F(v,h,f0) / (4 (n·v)(n·l))

Distribution     D : GGX (Trowbridge-Reitz)
Visibility       V : Height-correlated Smith-GGX
Fresnel          F : Schlick approximation
f0               : 0.04 lerp(·, baseColor, metallic)
α (linear)       : roughness²   (perceptual → linear remap)

Energy compensation:
  multiscatter = (1 - DFG.r) / DFG.r        // from prefiltered LUT
  f_r *= 1 + f0 * multiscatter              // Kulla–Conty
```

Variants:

```
LitAnisotropic  : split α into αT/αB along tangent; D = GGX_aniso, V = SmithGGX_aniso
LitCloth        : Charlie (Ashikhmin/Sheen) D + cloth visibility, optional subsurface tint
LitSubsurface   : Lambert + Burley diffusion profile (cheap), or screen-space SSS pass
Unlit           : emissive * baseColor; bypasses lighting (UI, gizmos, billboards)
```

## Material Schema

```toml
# author-facing TOML, compiled to packed uniform block
[material]
shading_model = "lit"
blend_mode    = "opaque"

[material.params]
base_color    = { rgb = [1.0, 1.0, 1.0], tex = "T_albedo" }
metallic      = { value = 0.0, tex = "T_metallic_roughness", channel = "b" }
roughness     = { value = 0.5, tex = "T_metallic_roughness", channel = "g" }
normal        = { tex = "T_normal", scale = 1.0 }
ao            = { value = 1.0, tex = "T_ao" }
emissive      = { rgb = [0,0,0], intensity = 0.0, tex = "T_emissive" }
clear_coat    = { value = 0.0, roughness = 0.0 }      # optional layer
```

Packed runtime uniform block (std140-friendly, ≤ 256 B):

```c
struct MaterialParams {
    vec4  base_color;          // rgb + alpha
    vec4  emissive;            // rgb + intensity
    vec4  mr_normal_ao;        // metallic, roughness, normal_scale, ao_strength
    vec4  clearcoat;           // strength, roughness, _, _
    uint  flags;               // shading_model | has_normal | has_ao | ...
    uint  tex_indices[6];      // bindless indices (or atlas indices)
};
```

Bindless textures used when capability tier supports them; otherwise per-material bind group (slower path).

## Lights

| Type        | Params                                              | Falloff               |
|-------------|-----------------------------------------------------|-----------------------|
| Directional | direction, color, intensity (lux), shadow on/off    | none                  |
| Point       | position, color, intensity (cd), range              | inverse-square + window |
| Spot        | + inner/outer cone, axis                            | inverse-square + cone |
| Area Rect   | position, axes, color, intensity                    | LTC (Heitz et al.)    |
| Area Disk   | position, normal, radius, color, intensity          | LTC                   |
| Tube        | endpoints, radius, color, intensity                 | LTC                   |
| IBL         | cubemap handle, intensity, rotation                 | precomputed split-sum |

Photometric units: lumens / lux / candela; converted to radiometric internally. Exposure handled by camera (EV100) → post.

## IBL Pipeline

Offline (or background) precompute, per environment cubemap:

```
HDR equirect / cubemap (input, 2048² typical)
        │
        ├─► Diffuse irradiance map      (32² or 64², cosine-convolved)
        │
        ├─► Prefiltered specular map    (256², mip chain, GGX importance-sampled per mip)
        │     mip i ↔ roughness  α_i = i / (mip_count - 1)
        │
        └─► BRDF LUT                     (256² shared, RG16F: scale + bias)
                                           split-sum integration (Karis 2013)
```

Runtime evaluation (split-sum):

```
N_diffuse  = irradiance.sample(normal)
N_specular = prefiltered.sample(reflect(v, n), α * (mips-1))
LUT        = brdf_lut.sample(n·v, α)
specular   = N_specular * (f0 * LUT.r + LUT.g)
```

Multiple IBL probes per scene: probe volumes with smooth blending; static or per-frame relight (capture pass).

## Public API

```rust
pub struct Material { /* asset */ }
pub struct MaterialInstance { /* runtime, params override */ }

pub enum ShadingModel { Lit, LitAnisotropic, LitCloth, LitSubsurface, Unlit }
pub enum BlendMode { Opaque, Mask(f32), Transparent, Additive }

pub struct IblProbe {
    pub diffuse: TextureHandle,
    pub specular: TextureHandle,    // mip chain
    pub brdf_lut: TextureHandle,    // shared
    pub intensity: f32,
    pub rotation_y: f32,
    pub bounds: Aabb,
}

impl Renderer {
    pub fn precompute_ibl(&mut self, env: &Image) -> Result<IblProbe, RendererError>;
    pub fn set_active_ibl(&mut self, probe: IblProbe);
}
```

## Performance Contract

| Metric                                          | Target           | Hard limit          |
|-------------------------------------------------|------------------|---------------------|
| IBL precompute (2048² env, GPU)                 | < 30 ms          | < 200 ms            |
| Material switch cost                            | 1 bind group set | ≤ 2                 |
| BRDF eval (full lit, 1 dir light, 1 IBL)        | < 60 ALU         | < 100 ALU           |
| Clustered light list build (32 lights, 1080p)   | < 0.3 ms GPU     | < 1.0 ms            |
| Max lights per cluster                          | 64               | 256                 |
| Material uniform block size                     | ≤ 256 B          | ≤ 512 B             |

## Error Contract

| Code                            | Meaning                              | Caller action                       |
|---------------------------------|--------------------------------------|-------------------------------------|
| `PBR_MATERIAL_INVALID`          | Required param missing               | Surface validation diff to author    |
| `PBR_TEXTURE_FORMAT_UNSUPPORTED`| e.g. uncompressed albedo on mobile   | Re-import with correct compression  |
| `PBR_IBL_PRECOMPUTE_FAIL`       | Compute dispatch failed              | Fallback to ambient color            |
| `PBR_TOO_MANY_LIGHTS`           | Cluster overflow                     | Drop lowest-intensity lights         |

## Integration Points

| System       | Contact                                                                              |
|--------------|--------------------------------------------------------------------------------------|
| Assets       | Material TOML → packed runtime block during import.                                  |
| Shadows      | Each light's shadow handle attached to light uniform → shadows.md.                   |
| GI           | Diffuse indirect can come from IBL probe OR Lumen-style cache → gi.md decides.       |
| Post         | Output is HDR linear scene color; tonemap+grade in post.md.                          |
| Styles       | Photoreal style binds full lit pipeline; NPR style swaps shaders.                    |
| Editor       | Material editor → shader.md (visual graph) compiles to same uniform layout.          |
| Agent SDK    | `engine.spawn("rough red metal sphere")` resolves to a `MaterialInstance` template.  |

## Test Requirements

- White furnace test: lit sphere under uniform white IBL, metallic=0, roughness=anything → output ≈ baseColor.
- Energy conservation: integrate BRDF over hemisphere for roughness ∈ {0.1, 0.5, 1.0} → ≤ 1.0 ± 0.02 (multiscatter on).
- IBL precompute output equals reference (Filament cmgen) within RMSE 0.5%.
- Material round-trip TOML → packed → TOML produces identical content.
- Clustered light culling on 1k random lights → correct list against brute-force reference.
- Render glTF "DamagedHelmet" reference asset → pixel-hash within 1% of Filament reference (RGB8 sRGB).

## Prior Art

- `google/filament` ✓ canonical reference; we adopt model verbatim where licenses permit math reuse.
- UE4/UE5 Disney BRDF ✓ widely understood, glTF-compatible.
- Frostbite "Moving Frostbite to PBR" (Lagarde, de Rousiers) ✓ unit consistency.
- Kulla & Conty multiscatter compensation ✓ energy conservation at high roughness.
- Heitz "Real-Time Polygonal-Light Shading with LTCs" ✓ area light approximation.
- Karis "Real Shading in UE4" (split-sum) ✓ IBL pipeline.

## Open Questions

- `[DECISION NEEDED]` Default diffuse model: Lambert (Filament) vs. Burley/Disney. Burley is prettier; Lambert is cheaper.
- `[DECISION NEEDED]` Anisotropy parameterization: tangent-frame vs. flow map. Flow map nicer for authoring.
- `[DECISION NEEDED]` Bindless materials by default — falls back hard on WebGPU which lacks descriptor indexing.
- `[BENCHMARK NEEDED]` Cluster grid resolution sweep on mobile (Adreno/Mali) — 24×16×24 may be excessive.
- `[DECISION NEEDED]` IBL probe blending: trilinear vs. SH-based fallback for low-end.
- `[DECISION NEEDED]` Hair/eye shading model in v1.0 or punt to v1.1?
