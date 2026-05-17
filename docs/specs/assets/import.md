<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Asset Import

> Normalize every supported source format into a single intermediate representation (`nxa-ir`) so downstream processing is format-agnostic and deterministic.

## Boundaries

- Owns: format readers, source validation, `ImportOpts` parsing, sidecar `<file>.import.toml` persistence, source-hash computation, header/manifest writing.
- Does NOT own: encoding/compression (`→ compression.md`), LOD chain build (`→ lod.md`), upload (`→ docs/contracts/renderer-assets.md`).
- Depends on: `→ docs/specs/core/jobs.md` (one task per source), `→ docs/specs/core/hal.md` (file I/O), `→ overview.md` (pack format).

## Supported Formats (v1.0)

| Kind | Format | Reader | Notes |
|---|---|---|---|
| Mesh / scene | glTF 2.0 (.gltf / .glb) | native | **Primary**. Full PBR, animations, skins, morph targets, extensions below. |
| Mesh | FBX (.fbx) | OpenFBX-based | Lossy convert → glTF IR. Triangulate, Y-up convert. |
| Mesh | OBJ (.obj + .mtl) | native | Static mesh only. No animation. |
| Texture | PNG (.png) | native (png crate) | 8/16-bit, sRGB flag preserved. |
| Texture | EXR (.exr) | OpenEXR-rs | HDR, scanline + tiled. For IBL, lightmaps. |
| Texture | KTX2 (.ktx2) | native | Pass-through if already Basis/BCn. **Preferred** authored format. |
| Texture | JPEG (.jpg) | native | sRGB only, no alpha. UI/preview use. |
| Audio | OGG Vorbis (.ogg) | lewton | Pass-through to `compression.md`. |
| Audio | WAV (.wav) | hound | PCM source for re-encode. |
| Audio | FLAC (.flac) | claxon | Lossless source. |
| Font | TTF / OTF (.ttf .otf) | ttf-parser | Glyph extraction; atlas built at runtime. |

Out of scope v1.0 (flagged for plugin extension): USD, Alembic, BVH, Collada.

### glTF 2.0 (Primary)

Reference: Khronos glTF 2.0 spec (registry.khronos.org/glTF/specs/2.0).

Required extension support:
- `KHR_mesh_quantization` — accept pre-quantized vertex streams from `gltfpack`.
- `KHR_draco_mesh_compression` — decode at import time; re-encode via meshopt by default. See `→ compression.md`.
- `KHR_texture_basisu` — pass KTX2/Basis textures through to transcoder selector. See `→ compression.md`.
- `KHR_materials_pbrSpecularGlossiness` — convert to metallic-roughness at import.
- `KHR_lights_punctual`, `KHR_animation_pointer`, `KHR_materials_emissive_strength` — preserve.

Optional / pass-through: `EXT_meshopt_compression`, `KHR_materials_clearcoat`, `_sheen`, `_transmission`, `_volume`, `_anisotropy`.

### nxa-ir (Intermediate Representation)

In-memory normalized form before compression. One per asset.

```
Mesh:    { vertices:[pos,nrm,tan,uv0,uv1,color,joints,weights],
           indices:u32, primitives:[{mat, range}], skin?, morphs?, bbox }
Texture: { kind: Color2D|Normal|HDR|LUT|Cube|Volume,
           dims:(w,h,d), color_space:Linear|SRGB,
           channel_count, source_bits, mip0_pixels }
Audio:   { sample_rate, channels, frames, pcm_f32_or_passthrough }
Anim:    { duration, tracks:[{node, path, sampler}] }
Font:    { tables, glyph_count, hinting, kern_pairs }
Scene:   { nodes:[{parent, transform, mesh?, light?, camera?}], extras }
```

## Architecture

```
 source ─┐
         │  detect_kind (magic + ext)
         ▼
   ┌──────────┐    ┌──────────────┐    ┌─────────────┐
   │ READER   │───▶│ VALIDATE     │───▶│ NORMALIZE   │
   │ (per fmt)│    │ (spec rules) │    │ → nxa-ir    │
   └──────────┘    └──────────────┘    └──────┬──────┘
                                              │
                  hash(source_bytes ⊕ opts) ──┤
                                              ▼
                                       ┌─────────────┐
                                       │ MANIFEST    │ ← writes <src>.import.toml
                                       │ (uuid,opts) │
                                       └──────┬──────┘
                                              ▼
                                     → compress / lod / pack
```

## Public API

```rust
fn import(src: &Path, opts: ImportOpts) -> Result<AssetUuid, ImportError>;
fn detect_kind(src: &Path) -> Option<AssetKind>;            // magic+ext sniff
fn validate(src: &Path, opts: &ImportOpts) -> ValidationReport;
fn list_loaders() -> &'static [LoaderInfo];                  // for agent introspection
fn register_loader<L: Loader>(loader: L);                    // plugin hook
```

`ImportOpts` is asset-kind tagged. Persisted as `<src>.import.toml` next to source.

```toml
# example: hero.gltf.import.toml
uuid = "01HZ8X..."
kind = "mesh"
[mesh]
generate_tangents = true
weld_vertices = 0.0001
lod_levels = 4
virtual_geometry = true
[texture_overrides."diffuse"]
encoder = "bc7"
srgb = true
```

## Validation Rules (subset)

- glTF: JSON conforms to schema; all `bufferView`/`accessor` ranges in-bounds; index count matches primitive mode; no NaN in float accessors; UV in `[0,1]` warned (not errored).
- PNG: dims ≤ 16384; bit depth in {8,16}; sRGB chunk respected.
- EXR: scanline or tiled; pixel type half/float; non-finite values clamped, logged.
- OGG/WAV/FLAC: sample rate in {8000..192000}; channels ≤ 8 (surround); duration > 0.
- TTF: present `cmap`, `glyf` or `CFF`/`CFF2`; reject if `head.magic` invalid.

Validation reports are structured arrays — caller may proceed on warnings, must fix errors.

```json
{ "errors":[{"code":"E_IMPORT_VALIDATION","path":"accessors[3]",
             "msg":"byteOffset+count out of range"}],
  "warnings":[{"code":"W_NON_TANGENT","msg":"tangents missing, will generate"}] }
```

## Headless / CI

`nexus assets import <glob> --headless --jobs N --out <dir>`

- Runs without GPU; GPU-only encoders (BC7 GPU path) fall back to CPU encoder, flagged in telemetry.
- Stdout: NDJSON (one JSON per asset) for AI agent consumption.
- Exit: 0 success, 1 validation errors, 2 fatal IO, 3 partial (use `--strict` to fail on warnings).

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| glTF 10 MB parse + IR | 50 ms | 250 ms |
| PNG 4K decode → IR | 80 ms | 400 ms |
| EXR 2K float decode | 60 ms | 300 ms |
| OGG 3 min decode → PCM f32 | 200 ms | 1 s |
| Per-source memory peak | ≤ 4× source size | 8× |
| Per-thread loader overhead | < 50 µs | 200 µs |

## Error Contract

Inherits codes from `overview.md`. Stage-specific:

| Code | Meaning | Caller action |
|---|---|---|
| `E_IMPORT_FORMAT` | Magic/ext unrecognized | Add loader or convert source |
| `E_IMPORT_VALIDATION` | Spec violation (see `details.errors[]`) | Fix source |
| `E_IMPORT_PARAMS` | `ImportOpts` field invalid | Check `details.field` |
| `E_IMPORT_DEP_MISSING` | glTF refs external `.bin` or texture not found | Provide file or fix URI |
| `W_NON_TANGENT` | Tangents absent, generated via mikktspace | None (warning) |
| `W_LOSSY_CONVERT` | FBX→IR is lossy | Use glTF source if possible |

## Integration Points

- `→ compression.md` consumes nxa-ir.
- `→ lod.md` consumes mesh IR.
- `→ registry.md` receives `(uuid, source_hash, deps)` after import.
- `→ docs/specs/agent/api.md` exposes `assets.import` JSON-RPC mirroring CLI.
- `→ docs/specs/editor/assets.md` triggers import on drag-drop into browser.

## Test Requirements

- Round-trip: glTF → IR → re-export glTF preserves topology and materials within float epsilon.
- Reimport of unchanged source + opts produces identical `source_hash`.
- All glTF-Sample-Models reference assets import without errors on Linux/Win/Mac.
- EXR with NaN pixels imports with warning, no panic.
- Malformed PNG (truncated IDAT) returns `E_IMPORT_VALIDATION`, not panic.
- Headless mode produces NDJSON parseable by `jq`.

## Prior Art

- glTF 2.0 (Khronos) ✓ — chosen as primary because it's the open, well-specified, royalty-free, runtime-friendly format.
- Assimp ✓ — supports everything ✗ — large C++ dep, non-deterministic. Reject as core dep; available as plugin.
- gltfpack (zeux/meshoptimizer) ✓ — quantization model used directly.
- Unreal `.uasset` ✗ — opaque, vendor-locked. Anti-pattern.
- Godot `.import` sidecar ✓ — pattern adopted for `<src>.import.toml`.

## Open Questions

- [DECISION NEEDED] Ship FBX loader in core or as `nexus-import-fbx` plugin? (License concerns w/ Autodesk SDK; OpenFBX is MIT.)
- [DECISION NEEDED] USD support timing — post-v1.0?
- [DECISION NEEDED] Default tangent generator: mikktspace vs. lengyel. mikktspace is the de facto standard.
- [BENCHMARK NEEDED] FBX import perf vs glTF on reference set.
