<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Visual Regression Tests

Render a frame headlessly. Compare to a golden image. Fail on diff above tolerance.

Covers: renderer styles (PBR / NPR / pixel / 2D / mixed), shader changes, post-process pipeline, particle systems, terrain, UI rendering.

## Architecture

```
+----------------+   nexus run --scenario   +---------------+
|  scenario.toml |  ─────────────────────►  |  headless GPU |  → frame.png
+----------------+                          +---------------+
                                                    │
                                                    ▼
                                            +---------------+
                                            |  pixel diff   |  → diff.png
                                            +---------------+
                                                    │
                                            +---------------+
                                            |  golden.png   |
                                            +---------------+
```

## Golden image storage

| Path | Owner | Storage |
|------|-------|---------|
| `crates/<crate>/visual/<scenario>/<backend>/<resolution>.png` | engine | git LFS |
| `<game>/visual/<scenario>/<backend>/<resolution>.png` | game | git LFS |

LFS path. Never commit raw `.png` to git proper — explodes the repo.

Filename:

```
visual/render-pbr-basic/vulkan/1920x1080.png
visual/render-pbr-basic/metal/1920x1080.png
visual/render-pbr-basic/wgpu-webgpu/1280x720.png
```

One golden per (scenario × backend × resolution).

## Scenario integration

A visual scenario adds a `[capture]` block:

```toml
schema = "nexus.scenario/v1"
name   = "pbr basic sphere"
seed   = 0

[engine]
backend  = "vulkan"
audio    = "null"
clock    = "frozen"
scene    = "crates/nexus-renderer/visual/scenes/pbr-basic.gltf"

[steps]
1.run_frames = 1

[capture]
frame      = 1
output     = "frame.png"
resolution = [1920, 1080]
tolerance  = { strategy = "perceptual", max_dssim = 0.01 }

[assert]
"capture.frame.matches_golden" = true
```

→ `docs/specs/agent/scenarios.md` for `[capture]` schema.

## Diff strategies

| Strategy | When | Tooling |
|----------|------|---------|
| `exact` | UI, deterministic 2D | byte-equal |
| `perceptual` | 3D rendering | DSSIM (structural similarity) |
| `palette` | pixel-art style | per-pixel palette index diff |
| `bounded-rms` | particle / noisy | per-channel RMS bound |

Cite: github.com/kornelski/dssim · ITU-R BT.500 (perceptual metrics).

```toml
[capture.tolerance]
strategy   = "perceptual"
max_dssim  = 0.01           # 1% perceptual delta allowed
max_pixels = 100            # at most 100 pixels above per-pixel threshold
```

## Tolerance budgets per style

| Style | Strategy | Max DSSIM | Notes |
|-------|----------|-----------|-------|
| PBR / photorealistic | perceptual | 0.01 | denoised TAA = inherent jitter |
| NPR / cartoon | perceptual | 0.005 | flat shading = tighter |
| Pixel art | exact (palette) | 0 px | hard equality on quantized output |
| 2D sprite | exact | 0 px | deterministic |
| UI | exact | 0 px | deterministic |
| Particles | bounded-rms | 5 / 255 / channel | stochastic |

Per-scenario override allowed in the `[capture.tolerance]` block.

## Backend matrix

Goldens captured per backend. The same scenario yields visually-similar but byte-different outputs on Vulkan / Metal / DX12 / WebGPU.

CI matrix:

| Job | Backend | OS |
|-----|---------|-----|
| visual-vulkan | vulkan | Linux (llvmpipe SW for headless CI, real GPU for nightly) |
| visual-metal | metal | macOS |
| visual-dx12 | dx12 | Windows |
| visual-webgpu | wgpu-webgpu | Linux (Dawn) |
| visual-gles | wgpu-gles | Linux (mobile fallback) |

Each backend has its own golden. PR diff must pass on every backend the scenario lists.

→ `docs/specs/renderer/backend.md`.

## Headless GPU capture

| CI runner | GPU strategy |
|-----------|--------------|
| GitHub Actions Ubuntu | `llvmpipe` (Mesa software) — slow but deterministic |
| GitHub Actions macOS | Metal on Apple Silicon runner |
| GitHub Actions Windows | WARP (software DX12) |
| Self-hosted GPU runner (`gpu-nvidia`) | real GPU, nightly only |

`wgpu` selects backend via env: `WGPU_BACKEND=vulkan`, `WGPU_POWER_PREF=low`. Engine drives via `[engine] backend = "..."`.

Software backends are deterministic across runners — same Mesa version = same output. Pin Mesa version in CI.

## Diff workflow

```bash
nexus visual run scenarios/render/pbr-basic.toml --backend vulkan
nexus visual diff out/pbr-basic.png crates/nexus-renderer/visual/render-pbr-basic/vulkan/1920x1080.png
nexus visual report                       # opens HTML side-by-side
```

`nexus visual report` opens browser with: golden | candidate | diff | DSSIM overlay.

## Updating goldens

```bash
nexus visual update scenarios/render/pbr-basic.toml
# Captures, replaces golden in LFS, stages diff
git add -p crates/nexus-renderer/visual/
git commit -m "visual(renderer): update pbr-basic for new tonemap"
```

PR review of golden updates: reviewer (AI or human) sees side-by-side; approves if intentional, rejects if regression.

CI blocks golden updates that span unrelated scenarios in one PR — forces small reviewable diffs.

## Reporting

CI artifact on failure:

```
visual-failures/
├── pbr-basic/
│   ├── golden.png
│   ├── candidate.png
│   ├── diff.png
│   ├── dssim-overlay.png
│   └── report.json
```

`report.json`:

```json
{
  "scenario": "scenarios/render/pbr-basic.toml",
  "backend":  "vulkan",
  "resolution": [1920, 1080],
  "dssim":    0.043,
  "max_dssim": 0.01,
  "pixels_above_threshold": 4127,
  "status": "fail",
  "diff_regions": [
    { "x": 400, "y": 300, "w": 200, "h": 200, "max_delta": 0.18 }
  ]
}
```

nexus-merge consumes. Posts annotated comment on PR.

## Per-system visual suites

| Crate | Scenarios |
|-------|-----------|
| `nexus-renderer` | pbr-basic, pbr-shadows, pbr-ibl, taa-jitter, motion-blur, bloom |
| `nexus-style-pbr` | photoreal-sponza, photoreal-bistro |
| `nexus-style-npr` | cartoon-character, cel-outline, hatching |
| `nexus-style-pixel` | pixel-quantize, pixel-palette-swap |
| `nexus-style-2d` | sprite-batch, tilemap-render, 2d-lighting |
| `nexus-renderer-particles` | smoke, fire, magic |
| `nexus-renderer-terrain` | terrain-lod-near, terrain-lod-far |
| `nexus-editor` | inspector-empty, scene-graph-deep |

Per genre / game: visual scenarios specific to gameplay (HUD, menus, weapon viewmodel). → `game-tests.md`.

## Hard rules

| Rule | |
|------|--|
| Goldens in git LFS | repo size |
| One golden per (scenario × backend × resolution) | matrix |
| Tolerance documented in scenario, not in tool defaults | reviewable |
| Backend matrix in CI matches supported platforms | spec contract |
| Golden updates flagged in PR title (`visual:`) | reviewer attention |
| Diff regions emitted as JSON | nexus-merge analysis |
| Visual scenarios marked `[capture]` — opt-in, not implicit | scope clarity |
| `clock = "frozen"`, no animations sampled mid-frame | reproducibility |
| Mesa / driver versions pinned in CI | deterministic SW backend |

## Forbidden

| Pattern | Why |
|---------|-----|
| `clock = "wall"` for visual scenarios | non-determinism |
| Visual diffs in PRs unrelated to renderer changes | gaming the gate |
| Tolerance changes without ADR | drift normalization |
| Goldens committed outside LFS | repo bloat |
| One golden covering many backends | each has its own truth |
| Real animated content (TAA jitter without lock) | flake |
| Goldens > 8 MB | use lower resolution or crop |

## Cross-link

- → `docs/specs/renderer/overview.md` · → `docs/specs/renderer/backend.md`
- → `docs/specs/renderer/shaders.md` (visual catches WGSL changes)
- → `docs/specs/styles/overview.md` (style packs gated visually)
- → `scenarios.md` (`[capture]` block)
- → `snapshot.md` (replay-tied visual diff)
- → `ci.md` (visual gate placement)
