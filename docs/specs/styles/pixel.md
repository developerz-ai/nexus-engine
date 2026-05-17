<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Style — Pixel Art

> Low-resolution, palette-locked rendering: chunky integer-scale rasterization, fixed palette quantization, optional ordered/error-diffusion dithering, and authentic CRT post-filters for retro looks.

## Boundaries

- Owns: low-res offscreen target, integer-scale upscaler, palette quantizer + LUT bind, dither pass, CRT post-FX presets (Lottes / CRT-Royale-style / scanline-only), pixel-snap rules for sprites/cameras.
- Does NOT own: sprite drawing (→ `docs/specs/styles/2d.md`), shader compilation (→ `docs/specs/renderer/shaders.md`), post-FX framework (→ `docs/specs/renderer/post.md`), font rasterization (→ `docs/specs/assets/import.md`).
- Depends on: renderer overview, style overview, 2D style (most pixel games are 2D, but Nexus supports 3D-rendered-as-pixel à la Octopath Traveler).

## Architecture

```
Pixel Pipeline

  Game world (any                  Low-res target            Palette pass        Upscale + CRT
  3D or 2D objects)               ┌─────────────┐           ┌───────────┐       ┌──────────────┐
       │                          │ render at   │           │ quantize  │       │ integer NN   │
       ▼                          │ native res  │   ───►    │   to LUT  │  ───► │   ×N upscale │
  Camera w/ pixel_snap=true       │ (e.g.       │           │ + dither  │       │ optional CRT │
  + integer-scale viewport        │  320×180)   │           │  (ordered │       │ (Lottes /    │
       │                          │             │           │  / FS)    │       │  scanlines / │
       ▼                          └─────────────┘           └───────────┘       │  royale)     │
  Rasterize w/ nearest                                                          └──────────────┘
  texture filter, no MSAA,                                                              │
  no TAA, no mipmap blur                                                                ▼
                                                                                 backbuffer
```

Optional 3D-as-pixel mode: render 3D scene at the low resolution; vertex snap to integer grid; PS1-style. Inspired by HD-2D (Octopath) and PSX retro shaders.

## Public API

```toml
[style]
preset = "pixel"

[style.pixel]
internal_res    = [320, 180]       # logical render resolution
upscale         = "integer"        # "integer" | "integer+pad" | "fit"
                                   #   "integer" = max integer multiple, letterbox
                                   #   "integer+pad" = above + transparent pad
                                   #   "fit"     = bilinear stretch (discouraged)
filter          = "nearest"        # no other option supported
mipmaps         = false            # forced off for sprites
pixel_snap      = true             # camera + sprite snap to integer
sub_pixel_cam   = "smooth"         # "snap" | "smooth" (sub-pixel scroll via shader)

[style.pixel.palette]
mode            = "lut"            # "off" | "lut" | "nearest-rgb"
lut             = "assets/palettes/sweetie16.png"  # 1×N or N×1 PNG
colors          = 16               # info; enforced by linter
quantize_alpha  = false

[style.pixel.dither]
mode            = "ordered"        # "off" | "ordered" | "floyd-steinberg" | "blue-noise"
matrix          = "bayer8"         # "bayer2" | "bayer4" | "bayer8" | "blue-noise64"
strength        = 0.5              # 0..1

[style.pixel.crt]
preset          = "off"            # "off" | "scanlines" | "lottes" | "royale-lite" | "royale-full"
curvature       = 0.05             # barrel
mask            = "aperture"       # "aperture" | "slot" | "shadow"
phosphor_decay  = 0.4
chromatic       = 0.3

[style.pixel.three_d]
enabled         = false            # 3D rendered into the low-res target
vertex_snap     = true             # PS1-style vertex jitter
affine_uv       = false            # PS1-style perspective-incorrect UVs
```

```rust
pub struct PixelProfile {
    pub internal: Extent2D,
    pub palette: Option<PaletteLut>,
    pub dither: DitherMode,
    pub crt: CrtPreset,
}

pub struct PaletteLut {
    pub texture: TextureId,         // 1D LUT (Nx1 RGBA8)
    pub colors: u32,
    pub mode: PaletteMode,          // Lut | NearestRgb
}
```

CLI:

```
nexus pixel quantize <image> --palette <lut> [--dither <mode>]
nexus pixel make-palette <image> --colors 16 --algo median-cut
```

## Performance Contract

| Metric | Target | Hard limit |
|--------|--------|------------|
| Internal-res render (320×180) | trivially &lt; 1 ms on any GPU | 4 ms |
| Palette pass (nearest in LUT) | < 0.1 ms | 0.5 ms |
| Floyd-Steinberg dither (CPU fallback, 320×180) | < 1.5 ms | 4 ms |
| Floyd-Steinberg dither (GPU jump-flood approx) | < 0.5 ms | 1.5 ms |
| Ordered dither | < 0.05 ms | 0.2 ms |
| CRT-Royale-full pass at 1080p output | < 2.5 ms | 6 ms |
| CRT-Lottes pass at 1080p output | < 0.8 ms | 2 ms |
| Integer upscale ×6 to 1920×1080 | < 0.1 ms | 0.5 ms |
| Memory: palette LUT | < 4 KB | 64 KB |

`[BENCHMARK NEEDED]` — CRT-Royale full on mobile / WebGPU; likely demote to royale-lite by default on those targets.

## Error Contract

| Code | Meaning | Caller action |
|------|---------|---------------|
| `STYLE_PIX_E001` | Texture imported with mipmaps under `lock=true` | Re-import with `mipmaps=false` |
| `STYLE_PIX_E002` | Texture imported with linear filter | Force `nearest` or re-author |
| `STYLE_PIX_E003` | Palette LUT &gt; 256 colors (defeats the point) | Reduce or set `palette.mode="off"` |
| `STYLE_PIX_E004` | `internal_res` does not divide evenly into any common output | Pick a divisor or accept `"integer+pad"` |
| `STYLE_PIX_E005` | Normal map asset present (no lighting at this res) | Remove or switch to `2d` preset |
| `STYLE_PIX_W001` | `sub_pixel_cam="snap"` + smooth-scroll game → jitter | Switch to `"smooth"` |

## Integration Points

- **Renderer**: requires a dedicated low-res color target, blit-on-resize. → `docs/specs/renderer/overview.md` "Offscreen targets".
- **Shaders**: 4 standard perms (palette on/off × dither on/off), Bayer matrix as constant buffer; Floyd-Steinberg as GPU pass (jump-flood approximation; CPU fallback for determinism). → `docs/specs/renderer/shaders.md`.
- **Assets**: `nearest` filter + `mipmaps=false` enforced at import for textures tagged with the pixel profile. → `docs/specs/assets/import.md`.
- **2D (`docs/specs/styles/2d.md`)**: most pixel games use 2D sprites; the 2D batcher draws into the pixel profile's low-res target unchanged.
- **Editor**: viewport renders into low-res target + integer upscale matching shipped output. → `docs/specs/editor/overview.md`.
- **Agent**: golden screenshots compared post-palette (deterministic; CRT pass off in tests). → `docs/specs/agent/scenarios.md`.

## Palette & Dither Reference

- **Built-in palettes** (MIT-licensed re-distributable):
  - `gameboy-dmg` (4 colors), `pico8` (16), `sweetie16` (16), `endesga32` (32), `aap64` (64).
- **Quantization algorithms** for `nexus pixel make-palette`:
  - `median-cut` (default, fast, good general),
  - `octree` (better for photos),
  - `wu` (highest quality, slower).
- **Dither matrices**:
  - Bayer 2×2, 4×4, 8×8 (ordered; deterministic; no temporal noise),
  - Floyd-Steinberg (error diffusion, 7/16, 3/16, 5/16, 1/16),
  - Blue-noise 64² tile (least pattern artifacts; recommended default for animated content).

Per the AI-first mandate: dither is fully deterministic given `[style.seed]`.

## Test Requirements

- Round-trip: HDR-ish render → palette pass → output PNG → assert all pixels ∈ palette set.
- Integer-scale: at 1920×1080 with `internal_res=[320,180]`, upscale is exactly ×6 with zero filtering blur (sample-and-hold confirmed by edge-sharpness metric).
- Floyd-Steinberg GPU pass agrees with CPU reference within 1 LSB at 99% of pixels.
- CRT-Royale-full produces visually-correct moiré-free output at 1080p, 1440p, 4K.
- Disabling palette + dither + CRT yields plain low-res nearest-upscaled output (sanity).
- Camera `sub_pixel_cam="smooth"` produces sub-pixel scroll without per-frame jitter (shader-driven offset).

## Prior Art

- *Inspired by*: Timothy Lottes, "FixingPixelArt" shadertoy → ported to RetroArch as `crt-lottes`. Cheap, flexible, "RGB CGA arcade monitor" target.
- *Inspired by*: TroggleMonkey, `crt-royale` (RetroArch / libretro). Most feature-complete CRT shader; multi-pass; dynamic scanline intensity by brightness; shadow/aperture/slot mask. → `docs.libretro.com/shader/crt/`.
- *Inspired by*: Floyd & Steinberg 1976, "An Adaptive Algorithm for Spatial Greyscale" — error-diffusion dithering reference (Wikipedia: Floyd–Steinberg dithering).
- *Inspired by*: Surma, "Ditherpunk" (`surma.dev/things/ditherpunk/`) — modern blue-noise & matrix discussion.
- *Inspired by*: Octopath Traveler / HD-2D — sprite-on-3D rendered into a low-res target.
- ✓ All references MIT or public-domain / CC-BY compatible — no GPL shaders bundled.

## Open Questions

- `[DECISION NEEDED]` Default CRT preset on first project scaffold: `"off"` (truest pixel) or `"scanlines"` (looks "right" on LCD)?
- `[DECISION NEEDED]` Ship `crt-royale` derivative directly (MIT re-implementation) or fetch on demand from `nexus-assets`?
- `[BENCHMARK NEEDED]` Floyd-Steinberg GPU pass on WebGPU (storage texture roundtrip cost) — may need to gate on capability.
- `[DECISION NEEDED]` Per-sprite palette overrides (palette swap) — in v1 (very common need) or v1.1?
- `[DECISION NEEDED]` Affine-UV PS1 mode worth shipping or pack-only?
