<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Style — NPR (Cartoon / Cel / Toon)

> Non-photoreal profile for cel-shaded, anime-style, and hand-drawn looks: ramp-based toon shading, screen-space + mesh outlines, hatching/screentones, painterly post-FX — engineered around the Guilty Gear Xrd "2D-looking 3D" approach.

## Boundaries

- Owns: toon ramp materials, outline pass config (inverted-hull + screen-space Sobel), hatching / screen-tone overlays, NPR-specific post-FX (color flatten, bloom-without-bleed), vertex-normal authoring rules.
- Does NOT own: shader compilation → `docs/specs/renderer/shaders.md`, depth/normal prepass → `docs/specs/renderer/overview.md`, mesh asset format → `docs/specs/assets/import.md`.
- Depends on: renderer overview (`docs/specs/renderer/overview.md`), shaders (`docs/specs/renderer/shaders.md`), post-FX (`docs/specs/renderer/post.md`), style overview (`docs/specs/styles/overview.md`).

## Architecture

```
NPR Render Graph

  Depth/Normal prepass          Shading pass               Outline pass            Post
  ┌──────────────────┐          ┌──────────────────┐       ┌──────────────────┐    ┌───────────┐
  │ depth (linear)   │   ───►   │ N · L → ramp LUT │  ───► │ inverted-hull    │ ─► │ no TAA    │
  │ world normal     │          │ (1-3 cel bands)  │       │   (back faces,   │    │ no bloom  │
  │ object id        │          │ rim term         │       │    expanded along│    │  bleed    │
  │ shadow mask      │          │ shadow as mask   │       │    vertex normal)│    │ flatten   │
  │ (vertex-normal-  │          │ (no penumbra)    │       │ + screen-space   │    │ tone curve│
  │  authored        │          │ specular = step()│       │   Sobel(depth,N, │    │ optional  │
  │  → see asset     │          │ ramp texture id  │       │   id, color)     │    │   hatch   │
  │  rules)          │          │ per material     │       │ → composite      │    │   overlay │
  └──────────────────┘          └──────────────────┘       └──────────────────┘    └───────────┘
```

Two outline strategies, used together by default:

1. **Inverted-hull mesh outline.** Render back-faces of the mesh extruded along (authored) vertex normals; solid color; cheap; ideal for character silhouettes. *Inspired by*: Guilty Gear Xrd GDC 2015 (Motomura).
2. **Screen-space Sobel.** Edge detection on depth + world-normal + object-id buffers; catches interior creases inverted hull misses (rounded surfaces, intersections). *Inspired by*: GDC NPR talks, Godot `Normal/Depth Sobel` shaders, `ameye.dev/notes/edge-detection-outlines`.

## Public API

```toml
[style]
preset = "npr"

[style.npr]
sub_style       = "cel"            # "cel" | "anime" | "hatch" | "painterly" | "flat"
bands           = 2                # 1, 2, or 3 cel-shade tiers
ramp_texture    = "assets/ramps/skin.png"   # 1xN LUT, optional per-material
rim_light       = true
rim_strength    = 0.6
specular        = "step"           # "step" | "smooth" | "off"
shadow_style    = "binary"         # "binary" | "soft" | "off"

[style.npr.outline]
hull            = true             # inverted-hull pass
hull_width_px   = 1.5
hull_color      = [0.05, 0.05, 0.05, 1.0]
screen_space    = true             # Sobel pass
sobel_depth     = 0.6              # weight on depth gradient
sobel_normal    = 0.6              # weight on normal gradient
sobel_id        = 1.0              # weight on object-id gradient
constant_width  = true             # screen-space pixel width regardless of distance

[style.npr.post]
tone_map        = "linear"         # NPR prefers linear or "filmic-flat"
bloom           = "soft"           # "off" | "soft" | "anime-cross"
taa             = false            # TAA blurs NPR outlines
hatching        = "off"            # "off" | "screentone" | "manga" | "cross-hatch"
hatch_texture   = "assets/hatch/cross64.png"
```

```rust
pub struct NprMaterial {
    pub base_color:   Texture | Color,      // flat color or hand-painted
    pub ramp:         Texture,              // 1xN, replaces lambert
    pub shadow_mask:  Option<Texture>,      // baked AO / hand-painted shadow,
                                            //   composited with ramp
    pub outline_color: Color,               // per-material outline tint
    pub rim_color:    Color,
    pub spec_threshold: f32,                // 0..1, where step() fires
    pub vertex_normals_authored: bool,      // linter-enforced metadata
}
```

## The Vertex-Normal Authoring Rule

Inspired by Xrd: under `lock=true`, character meshes intended for NPR must carry **artist-authored vertex normals** baked into the glTF (`NORMAL` attribute), NOT auto-recomputed. Importer flag:

```toml
[asset.<id>]
preserve_normals = true
```

Why: Lambert (N·L) on auto-generated smooth normals produces blotchy cel bands on faces and clothing. Xrd's team manually edits normals (often by projecting from a low-poly proxy or sculpted "shading skull") so that N·L produces a clean anime-style shadow shape from any light angle. The linter checks the import metadata and emits `STYLE_NPR_W001` if absent on characters.

## Performance Contract

| Metric | Target | Hard limit |
|--------|--------|------------|
| Frame time, 1080p, mid-scene, integrated GPU | < 8.3 ms | 16.6 ms |
| Inverted-hull pass per character | < 0.2 ms | 1 ms |
| Screen-space Sobel pass, 1080p | < 0.4 ms | 1.5 ms |
| Ramp texture sample | 1 tex fetch | — |
| Memory per NPR material | < 2 MB | 8 MB |
| Outline pixel-width stability | ±0.5 px across distance | ±1.5 px |

## Error Contract

| Code | Meaning | Caller action |
|------|---------|---------------|
| `STYLE_NPR_E001` | `ramp_texture` not 1×N or wrong format | Re-export ramp as 1×N RGBA8 sRGB |
| `STYLE_NPR_E002` | Bands &gt; 3 (un-cel-like, perf cliff) | Reduce to 1, 2, or 3 |
| `STYLE_NPR_E003` | Sub-style `painterly` requested without `hatch_texture` | Provide overlay or change sub-style |
| `STYLE_NPR_W001` | Character mesh imported without `preserve_normals=true` | Re-export from DCC, keep authored normals |
| `STYLE_NPR_W002` | TAA enabled with outlines (blurs them) | Disable TAA or accept blur |

## Integration Points

- **Renderer**: requires depth + normal + object-id targets in the prepass. → `docs/contracts/renderer-assets.md` (`G-Buffer feature set "NPR"`).
- **Shaders**: ramp-LUT permutation + Sobel kernel are standard shader perms in `ShaderPermSet`. → `docs/specs/renderer/shaders.md`.
- **Assets**: `preserve_normals` glTF importer flag; ramp textures imported as `Texture1D` flagged `nearest` filter. → `docs/specs/assets/import.md`.
- **Editor**: ramp editor + outline-preview overlay. → `docs/specs/editor/shader.md`.
- **Mixed (`docs/specs/styles/mixed.md`)**: most common combo is photoreal world + NPR characters; this profile is the "characters" layer.

## Asset Constraints (lock = true)

| Asset | Rule |
|-------|------|
| Character meshes | `preserve_normals=true` required |
| Albedo textures | sRGB, may be flat / hand-painted; no PBR roughness/metallic required |
| Ramp LUTs | 1×N, N ∈ {2,3,4,8,16}, point sampling |
| Normal maps | optional; if present, only used for rim term, not lighting |
| HDR IBL | rejected (NPR is not energy-conservative) |

## Test Requirements

- Render a Suzanne mesh under a rotating directional light → cel bands rotate cleanly, no z-fighting on outlines.
- Vertex-normal-authored character vs auto-normals: golden image diff shows the difference; CI rejects regression.
- Outline pixel width measured by image analysis stays within tolerance across 0.5×–4× camera distance.
- Hatching overlay aligns to screen space (not world space) — confirmed by camera motion test.
- Switching `bands` 1 → 2 → 3 produces visibly distinct golden images; `bands > 3` rejected.

## Prior Art

- *Inspired by*: Junya C. Motomura, "Guilty Gear Xrd's Art Style: The X Factor Between 2D and 3D", GDC 2015 (Internet Archive: `archive.org/details/GDC2015Motomura`; ASW write-ups: `arcsystemworks.com/guilty-gear-xrd-art-talk-at-game-developers-conference-2015`). ✓ vertex-normal authoring; ✓ no normal maps for lighting; ✓ baked shadow masks composited into the ramp; ✗ team accepted "no dynamic shadow" — Nexus keeps shadow_mask optional so games can opt in.
- *Inspired by*: `ameye.dev/notes/edge-detection-outlines` — clean overview of depth/normal/id Sobel.
- *Inspired by*: Godot Shaders community ("Normal-based Edge Detection with Sobel Operator – Screenspace").
- Borderlands / Jet Set Radio — inverted-hull outline lineage. ✓ cheap; ✗ doesn't catch interior creases (hence Sobel addition).

## Open Questions

- `[DECISION NEEDED]` Stroke-based / hand-drawn outline (line-art texture along edges) as v1 sub-style or pack?
- `[BENCHMARK NEEDED]` Object-id buffer cost on mobile (extra MRT) — fall back to depth+normal Sobel only?
- `[DECISION NEEDED]` Provide built-in ramp library (skin / metal / cloth) or require the project to bring its own?
- `[DECISION NEEDED]` Anime-style "specular highlight as shape" (Xrd eyes/hair) — built-in feature or material-author responsibility?
