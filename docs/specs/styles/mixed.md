<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Style — Mixed

> Per-layer style routing: assign a different preset (PBR, NPR, pixel, 2D) to each render layer in one game — photoreal world with cartoon characters, 3D world with pixel-art UI, NPR sky with PBR foreground, and so on.

## Boundaries

- Owns: `[[style.layer]]` schema, layer compositor pass, per-layer render-target allocation, cross-layer compatibility matrix, depth-merge / alpha-merge / overlay strategies.
- Does NOT own: any individual preset's pipeline (→ `pbr.md`, `npr.md`, `pixel.md`, `2d.md`), render graph composition primitives (→ `docs/specs/renderer/overview.md`).
- Depends on: all four style specs above, renderer overview, style overview, ECS (layer is an `Entity` tag → `docs/specs/core/ecs.md`).

## Architecture

```
Mixed Render Graph (worked example: photoreal world + NPR characters)

  ┌─────────────────────────────────────────────────────────────────┐
  │ Frame begin                                                     │
  │   read [[style.layer]] bindings in order                        │
  └─────────────────────────────────────────────────────────────────┘
                  │
                  ▼
  Layer "world" (preset=pbr)
  ┌─────────────────────────┐
  │ G-Buffer + Lighting +   │  → writes color_world, depth_world
  │ shadows + GI            │
  └─────────────────────────┘
                  │
                  ▼
  Layer "characters" (preset=npr)
  ┌─────────────────────────┐
  │ Depth/Normal/Id prepass │  → reads depth_world for occlusion
  │ Toon shading + outline  │     (so a character behind a wall is
  └─────────────────────────┘     correctly hidden)
                  │            → writes color_chr, depth_chr
                  ▼
  Compositor (per layer: merge_mode)
  ┌─────────────────────────┐
  │ "depth"  : choose by    │  → composite color buffer
  │           min(depth)    │
  │ "overlay": layer on top │
  │ "alpha"  : src-over     │
  │ "mask"   : stencil      │
  └─────────────────────────┘
                  │
                  ▼
  Post (global, picks one preset's post chain as "primary")
  ┌─────────────────────────┐
  │ tone_map / bloom / etc  │  per [style.mixed.post_from] layer
  └─────────────────────────┘
```

## Public API

```toml
[style]
preset = "mixed"

[[style.layer]]
name        = "world"
preset      = "pbr"
merge_mode  = "depth"           # see compatibility matrix
visible_to  = ["main", "shadow_caster"]
[style.layer.pbr]               # full pbr.md overrides scoped to this layer
tone_map    = "agx"
ray_tracing = "hybrid"

[[style.layer]]
name        = "characters"
preset      = "npr"
merge_mode  = "depth"           # composited against world by depth
[style.layer.npr]
bands       = 2
[style.layer.npr.outline]
hull        = true

[[style.layer]]
name        = "ui"
preset      = "2d"
merge_mode  = "overlay"         # always on top, no depth test
[style.layer.two_d]
lighting.enabled = false

[style.mixed]
post_from         = "world"     # which layer's post chain runs globally
shared_color_space = "linear"   # all layers must agree
shared_hdr         = false
allow_cross_shadow = true       # NPR layer casts/receives PBR shadows
```

ECS-side: every drawable component carries a `Layer(SmolStr)`. Spawn API:

```rust
engine.spawn("dragon").set::<Layer>("characters");
```

Semantic API:

```rust
engine.spawn("dragon near castle in characters layer");
// → docs/specs/agent/semantic.md
```

## Compatibility Matrix

Cell value is the default `merge_mode` recommendation; ✗ means rejected at config time with `STYLE_MIX_E001`.

|              | pbr     | npr     | pixel   | 2d      |
|--------------|---------|---------|---------|---------|
| **pbr**      | depth   | depth   | overlay | overlay |
| **npr**      | depth   | depth   | overlay | overlay |
| **pixel**    | overlay | overlay | overlay | overlay |
| **2d**       | overlay | overlay | overlay | layer-order |

Rules:

- `depth` requires both layers to write linear depth in compatible ranges → enforced by linter; pixel layers write at low-res and cannot share depth with hi-res 3D layers (hence `overlay`).
- `overlay` ignores depth; later layer wins where alpha > 0.
- `alpha` always uses src-over compositing on color only.
- `mask` uses a stencil buffer; allows "punch a hole in the world for a cartoon character" effects.
- Two layers may not both request `tone_map` ≠ `"linear"` unless `post_from` picks exactly one; the rest pass through linear → enforced.

## Performance Contract

| Metric | Target | Hard limit |
|--------|--------|------------|
| Compositor pass (full-screen, N layers) | < 0.3 ms × N | 1 ms × N |
| Memory overhead per extra layer (color+depth, 1080p) | ~16 MB | 32 MB |
| Max practical layers | 4 | 8 |
| Layer switch (add/remove at runtime) | < 16 ms | 50 ms |
| Cross-layer shadow casting | adds ≤ 1 shadow map pass per casting layer | — |

`[BENCHMARK NEEDED]` — 4-layer scene on mobile + WebGPU (memory bandwidth concern).

## Error Contract

| Code | Meaning | Caller action |
|------|---------|---------------|
| `STYLE_MIX_E001` | Incompatible preset combo with `merge_mode` | See compatibility matrix above |
| `STYLE_MIX_E002` | Two layers request different `tone_map` and `post_from` ambiguous | Set `post_from` to one of them |
| `STYLE_MIX_E003` | Layer name not referenced by any entity | Either remove layer or add `set::<Layer>` to spawn |
| `STYLE_MIX_E004` | `[[style.layer]]` empty (need ≥ 1) | Add one or drop `preset = "mixed"` |
| `STYLE_MIX_E005` | Cross-layer shadow requested but layer's preset disables shadows (e.g. pixel) | Disable `allow_cross_shadow` or move entity |
| `STYLE_MIX_W001` | More than 4 layers — performance cliff likely | Consolidate or accept |

## Integration Points

- **ECS**: a `Layer(SmolStr)` tag component on every drawable. Systems iterate per layer in declaration order. → `docs/specs/core/ecs.md`.
- **Renderer**: render graph for `mixed` is dynamically composed from per-layer subgraphs at startup; recomposed on hot-reload. → `docs/specs/renderer/overview.md`.
- **Assets**: linter runs per-layer with the layer's preset rules; e.g. a mesh tagged for `characters` (NPR) is linted by `npr.md`'s rules. → `docs/specs/styles/overview.md`.
- **Editor**: layer dropdown on every entity; per-layer viewport solo / mute. → `docs/specs/editor/scene.md`.
- **Agent**: scenarios can assert per-layer screenshots (`--layer characters`) for visual regression. → `docs/specs/agent/scenarios.md`.

## Common Recipes

```
photoreal world + cartoon characters (the Genshin / Wuthering Waves model):
    [[style.layer]] world      → pbr,   depth
    [[style.layer]] characters → npr,   depth
    post_from = "world"

3D gameplay + 2D pixel UI:
    [[style.layer]] world → pbr or npr, depth
    [[style.layer]] ui    → 2d,         overlay  (lighting off)

painterly sky + PBR ground:
    [[style.layer]] sky    → npr (painterly sub-style), overlay (drawn first)
    [[style.layer]] ground → pbr, depth

pixel game world + crisp font HUD:
    [[style.layer]] world → 2d (wrapped in pixel preset), depth-skipped
    [[style.layer]] hud   → 2d (no pixel), overlay

mask cutout (cartoon hole in real world):
    [[style.layer]] world → pbr
    [[style.layer]] portal → npr, merge_mode = "mask"
```

## Cross-Layer Shadow Rules

When `allow_cross_shadow = true` (default):

- A PBR-layer light may cast on an NPR character by writing the same shadow map; the NPR layer's ramp shader samples the same map but converts the soft penumbra to a binary mask (default) before applying.
- An NPR character casts onto a PBR layer using the standard shadow-caster pass — caster mode is uniform.
- Pixel and 2D layers never participate in cross-layer 3D shadows. Their own light system (`Light2D`) is independent.

Rationale: artists routinely want "the cartoon character still casts a shadow on the photoreal floor." This must be opt-out, not opt-in.

## Test Requirements

- Boot a scene with 2 layers (pbr world + npr character); golden screenshot shows correct depth-merged composite with toon shading on the character only.
- Move character behind world geometry → character disappears (depth test across layers works).
- Add `ui` 2D layer → always renders on top regardless of world depth.
- Removing a layer at runtime via hot-reload settles in &lt; 50 ms with no leaked GPU memory.
- 4-layer stress scene runs within the perf budget on baseline hardware.
- Cross-layer shadow: NPR character standing on PBR plane shows soft shadow on plane, binary shadow on character body (per shadow ramp).
- Empty `[[style.layer]]` list → `STYLE_MIX_E004` at startup with `suggested_fix`.

## Prior Art

- *Inspired by*: Genshin Impact / Honkai Star Rail — production proof that PBR world + NPR character is shippable at scale.
- *Inspired by*: Octopath Traveler / HD-2D — 2D sprites composited into a 3D PBR world (`mixed` with pixel-tagged characters and PBR environment).
- *Inspired by*: Unity URP Camera Stack + Render Layers — ✓ multi-camera compositing idea; ✗ no declarative per-layer style system.
- *Inspired by*: Godot Viewport-as-Texture — usable for mixed-style overlays; ✗ no built-in cross-layer shadow.
- *Inspired by*: Guilty Gear Strive cinematics — separate render targets for character vs background then composited.
- *Inspired by*: `docs/specs/styles/npr.md` Guilty Gear Xrd GDC 2015 talk — for the character-only NPR path.

## Open Questions

- `[DECISION NEEDED]` Volumetrics (fog) — global, or per-layer? Per-layer is correct but doubles cost.
- `[DECISION NEEDED]` Per-layer resolution scaling (render UI at native, world at 0.75×) — v1 feature or v1.1?
- `[BENCHMARK NEEDED]` Cross-layer shadow cost on mobile when NPR characters share PBR shadow maps.
- `[DECISION NEEDED]` `merge_mode = "mask"` requires stencil buffer; some WebGPU paths constrain stencil — fallback?
- `[DECISION NEEDED]` Camera-stack model (one camera per layer, like Unity URP) vs single-camera-many-layers — pick one.
- `[DECISION NEEDED]` Color-space negotiation when a layer wants HDR and another wants SDR — auto-tonemap-before-compose, or reject?
