<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Style System — Overview

> A declarative, lockable visual-style layer that picks shader pipelines, asset constraints, and post-processing chains from a single `Nexus.toml` field so the engine renders any game in any style without per-scene plumbing.

## Boundaries

- Owns: style registry, `Nexus.toml [style]` schema, pipeline selection, style-consistency linter, asset constraint enforcement, post-FX preset bundles, per-layer style routing.
- Does NOT own: low-level draw API → `docs/specs/renderer/backend.md`, render graph passes → `docs/specs/renderer/overview.md`, asset import → `docs/specs/assets/import.md`, material authoring tools → `docs/specs/editor/shader.md`.
- Depends on: renderer (`docs/contracts/renderer-assets.md`), assets (`docs/specs/assets/registry.md`), agent (`docs/specs/agent/scenarios.md`) for headless visual regression.

## Architecture

```
                    Nexus.toml
                  [style] block
                       │
                       ▼
            ┌──────────────────────┐
            │  StyleRegistry       │  built-ins: pbr | npr | pixel | 2d | mixed
            │  (lookup by id)      │  external: style packs (MIT)
            └──────────┬───────────┘
                       │ resolves
                       ▼
            ┌──────────────────────┐
            │   StyleProfile       │
            │  - render_graph_id   │
            │  - shader_perms      │
            │  - post_chain        │
            │  - asset_rules       │
            │  - tone_map / gamut  │
            │  - clear_color       │
            └──────────┬───────────┘
                       │ binds at frame start
                       ▼
            ┌──────────────────────┐
            │  Renderer            │  picks render graph + permutation set
            │  → docs/specs/       │  per layer (mixed.md splits this)
            │    renderer/overview │
            └──────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  StyleLinter         │  asset import + CI hook:
            │  (offline + import)  │  rejects assets violating profile
            └──────────────────────┘
```

## Public API

```toml
# Nexus.toml — minimal form
[style]
preset = "pbr"            # built-in id OR "pack:my-studio/cel"
lock   = true             # error on style-violating assets/shaders
```

```toml
# Nexus.toml — full form
[style]
preset      = "npr"
lock        = true
color_space = "srgb"      # "srgb" | "rec2020" | "display-p3"
tone_map    = "aces"      # see pbr.md / npr.md per-preset list
hdr         = false
seed        = 0xC0FFEE    # deterministic noise / dither seed

[style.overrides]
outline_px  = 1.5
palette     = "assets/palettes/sweetie16.png"

[[style.layer]]            # per-layer (mixed.md)
name   = "world"
preset = "pbr"
[[style.layer]]
name   = "characters"
preset = "npr"
```

```rust
// engine-facing (read-only at runtime)
pub struct StyleProfile {
    pub id: StyleId,
    pub render_graph: RenderGraphId,
    pub permutations: ShaderPermSet,
    pub post_chain: PostFxChain,
    pub asset_rules: AssetConstraints,
    pub tone_map: ToneMap,
    pub layers: Vec<LayerBinding>,
}

pub trait StylePack: Send + Sync {
    fn id(&self) -> StyleId;
    fn build(&self, cfg: &toml::Table) -> Result<StyleProfile, StyleError>;
    fn lint_asset(&self, kind: AssetKind, meta: &AssetMeta) -> LintReport;
}

pub fn registry() -> &'static StyleRegistry;
```

CLI:

```
nexus style list                    # built-ins + installed packs
nexus style validate                # lint repo against [style.lock]
nexus style screenshot --scene X    # deterministic golden image
nexus style diff <a> <b>            # pixel-diff two profiles
```

## Performance Contract

| Metric | Target | Hard limit |
|--------|--------|------------|
| Style switch (cold) | < 250 ms | 1 s |
| Style switch (warm, cached perms) | < 16 ms | 33 ms |
| Linter pass on 10k assets | < 5 s | 30 s |
| Per-frame style binding cost | < 50 µs | 200 µs |
| Shader permutation count per style | < 64 | 256 |

## Error Contract

| Code | Meaning | Caller action |
|------|---------|---------------|
| `STYLE_E001` | Unknown preset id | Fix `Nexus.toml`; `nexus style list` |
| `STYLE_E002` | Asset violates locked style | Re-import / adjust asset to rule set |
| `STYLE_E003` | Layer preset incompatible (e.g. 2d + ray-trace) | See `mixed.md` compatibility table |
| `STYLE_E004` | Override key unknown for preset | Remove key or switch preset |
| `STYLE_E005` | Style pack failed to load (MIT check, hash) | Reinstall pack |
| `STYLE_W001` | Tone-map mismatch HDR/SDR display | Warn; auto-fallback |

All errors structured JSON (`code`, `message`, `location`, `suggested_fix`) per the AI-first mandate.

## Integration Points

- **Renderer**: each profile maps to one `RenderGraphId` + a fixed shader-permutation set. → `docs/contracts/renderer-assets.md`.
- **Assets**: import pipeline calls `StylePack::lint_asset` on every imported texture/mesh/material when `lock = true`. → `docs/specs/assets/import.md`.
- **Agent**: `nexus run --headless --screenshot` produces deterministic PNGs for visual regression. → `docs/specs/agent/scenarios.md`.
- **Editor**: style picker in project settings; live-reloads profile in viewport. → `docs/specs/editor/overview.md`.
- **Scripting**: `engine.style.current()` read-only handle; runtime style swaps require restart of the render graph (cost in perf table). → `docs/contracts/core-scripting.md`.

## Style Consistency Enforcement

When `lock = true`:

1. Import-time linter rejects assets outside rule set (e.g. 32-bit PBR textures in `pixel` profile, normal maps in `pixel`, &gt;palette colors in `pixel`, hand-painted albedo in `pbr`).
2. CI hook (`nexus style validate`) re-runs linter across whole repo on every PR.
3. Headless screenshot diff against golden images flags style drift before merge. → `docs/specs/agent/scenarios.md`.
4. Shader compiler rejects permutations outside the profile's `ShaderPermSet`.

Rationale: AI agents need a single declarative source of truth. A locked style means an agent can generate or fetch an asset and trust it either passes the linter or returns a structured fix.

## Test Requirements

- Switching `preset` in `Nexus.toml` regenerates render graph and produces a different golden screenshot.
- `lock = true` + bad asset import → `STYLE_E002` with `suggested_fix`.
- All 5 built-ins build a valid `StyleProfile` from an empty `[style]` block (defaults applied).
- Per-layer mixed profile renders both layers in one frame (see `mixed.md`).
- Deterministic: same scene + same `style.seed` → byte-identical PNG across runs and platforms (within wgpu rasterization tolerance, → `docs/specs/agent/replay.md`).
- Hot reload of `[style.overrides]` updates viewport in < 100 ms (`docs/specs/editor/livereload.md`).

## Prior Art

- Filament — clean PBR material model and tone-mapping pipeline ✓; no NPR / pixel paths ✗.
- Godot — multi-renderer (Forward+ / Mobile / Compatibility) selectable per project ✓; no declarative style lock ✗.
- Unity URP/HDRP — pipeline-as-asset model ✓; closed extension surface, no asset-time linting ✗.
- Guilty Gear Xrd — proves an entire AAA game can be one locked style. *Inspired by*: GDC 2015 talk by Junya C. Motomura, "Guilty Gear Xrd's Art Style: The X Factor Between 2D and 3D" (Internet Archive: GDC2015Motomura).

## Open Questions

- `[DECISION NEEDED]` Per-camera style override (split-screen with two presets) — supported in v1 or deferred?
- `[DECISION NEEDED]` Style packs distribution: cargo crate vs git submodule vs `nexus-assets` registry?
- `[BENCHMARK NEEDED]` Shader permutation count when 4 layers each pick a different preset on Switch / mobile GPU.
- `[DECISION NEEDED]` Is `display-p3` tone-map a v1 requirement (macOS / iOS) or v1.1?
