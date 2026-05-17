<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Asset Compression

> Codec selection, encoder execution, and packaging. Output is deterministic (same input + encoder version + opts → identical bytes) so artifacts are content-addressable and reproducible across CI.

## Boundaries

- Owns: texture / mesh / audio encoders, codec selection policy, encoder version pinning, deterministic settings, output framing into `.nxa` regions.
- Does NOT own: import / validation (`→ import.md`), LOD chain build (`→ lod.md`), runtime decoding (decoders live with consumers: renderer for textures, audio for sound, streaming for Zstd-framed pages).
- Depends on: `→ import.md` (IR), `→ overview.md` (pack format), `→ docs/contracts/renderer-assets.md` (GPU format declarations).

## Determinism Mandate

Every encoder MUST be deterministic. Concretely:
- No thread-count-dependent output. Multi-threaded encoders (e.g. BC7, Opus) shard input into fixed tiles/frames and merge in declared order.
- Encoder library + version pinned per release; version baked into `.nxa` header.
- No timestamps in output streams (strip OGG vendor/date fields).
- Floating-point operations rounded per IEEE-754 with strict modes.

Hash of output equals `blake3(source_hash ⊕ encoder_id ⊕ opts_json)` — verified in CI.

## Texture Compression

### Format Selection Matrix

```
            ┌────────── target platform ──────────┐
kind        │  Desktop          Mobile     Web    │  Notes
────────────┼─────────────────────────────────────┤
Color sRGB  │  BC7              ASTC 4×4   BC7    │  RGBA, max quality
Color sRGB  │  BC1              ETC2 RGB   BC1    │  RGB, mid quality (smaller)
Normal map  │  BC5              ASTC 4×4   BC5    │  RG only, reconstruct Z
HDR / IBL   │  BC6H             ASTC HDR   BC6H   │  RGB float
LUT 3D      │  uncompressed BGRA8 (small)         │  64³ ≤ 1 MB
Alpha mask  │  BC4              ETC2 R     BC4    │  single channel
Pixel art   │  uncompressed RGBA8 + Zstd          │  no block artifacts
UI atlas    │  BC7              ASTC 4×4          │  alpha + sRGB
```

Web (WebGPU) supports BCn on desktop browsers; ETC2 + ASTC on mobile browsers; per-platform variants written into the same `.nxa` (selected at load).

### Encoders

| Format | Encoder | License | Determinism |
|---|---|---|---|
| BC1/3/4/5 | `bcdec`/`bc7e` CPU; `compressonator` optional GPU | MIT / MIT-like | ✓ |
| BC6H/BC7 | `bc7enc_rdo` (rgbcx) | MIT | ✓ with fixed thread tiling |
| ASTC | `ARM-software/astc-encoder` (`astcenc`) | Apache-2.0 | ✓ with `-deterministic` |
| ETC2 | `etcpak` | MIT | ✓ |
| Basis / KTX2 | `basis_universal` | Apache-2.0 | ✓ pass-through preferred |

Pre-compressed authored input (`KHR_texture_basisu` KTX2) is preferred: a single Basis source transcodes to BCn/ASTC/ETC2 at load time per-platform, avoiding multi-encode storage cost. Reference: KHR_texture_basisu extension (KhronosGroup/glTF).

### Quality Presets

| Preset | Use | Target dB PSNR | Speed |
|---|---|---|---|
| `production` | Shipped game art | ≥ 42 dB (BC7/ASTC) | Slow |
| `dev` | Hot iteration | ≥ 36 dB | Fast |
| `preview` | Editor previews | any | Fastest (uncompressed) |

### Mip Chain & Streaming

- Mips generated with Kaiser filter (anisotropic option for normal maps).
- Each mip is an independent region in `.nxa`, streamable via `→ streaming.md`.
- sRGB textures decompressed/recompressed in linear space to avoid gamma error.

## Mesh Compression

Two layers, applied in order:

1. **Quantization** (`meshopt_quantizeVertex…`):
   - Position: 16-bit signed per axis, range from bbox.
   - Normal/tangent: 10:10:10:2 (oct or rgb10a2).
   - UV: 16-bit; UV2 (lightmap) 16-bit per axis.
   - Color: 8-bit RGBA.
   - Joints: 8 or 16-bit; weights: 8-bit normalized.
   - Output is `KHR_mesh_quantization` compatible.

2. **Codec**:
   - Default: meshopt EXT_meshopt_compression (zeux's vertex+index codec). Decoder throughput 3–6 GB/s on modern desktop CPUs per zeux's published numbers.
   - Alternative: Draco (KHR_draco_mesh_compression) — smaller ratio (better ~20–30%) but slower decode and reorders vertices, so disabled by default; opt-in for non-realtime web payloads.

Total: ~2–4× smaller than raw quantized data (meshopt), ~5–10× smaller than raw float (Draco).

```
raw mesh (f32 pos, f32 nrm, f32 uv, u32 idx)
     │
     ▼ quantize (KHR_mesh_quantization)
     │
     ▼ codec  (meshopt | draco)
     │
     ▼ zstd frame  (level 9 default; 19 for ship)
     │
     ▼ .nxa region (per LOD, per meshlet page)
```

References: zeux/meshoptimizer; KHR_draco_mesh_compression (KhronosGroup/glTF); google/draco.

## Audio Compression

| Codec | Use | Latency | Notes |
|---|---|---|---|
| **Opus** | SFX, music, voice chat (default) | 26.5 ms (5 ms low-delay) | 6–510 kbps; ~20–30% smaller than Vorbis at equal quality; required for voice. |
| **Vorbis** | Music when wider engine compat desired | ~100 ms+ | Legacy; pass-through if source is `.ogg`. |
| **PCM (WAV)** | Short SFX < 1 s | 0 | Loaded fully, no decode cost. |
| **FLAC** | Authoring master only | n/a | Not shipped to runtime. |

Defaults:
- Music: Opus 96 kbps stereo.
- 3D positional SFX: Opus 64 kbps mono.
- UI clicks (< 0.5 s): PCM s16.
- Voice chat: Opus 24 kbps mono, `low_delay` mode (`→ docs/specs/audio/voice.md`).

Determinism: Opus encoder pinned to libopus version; vendor and `comment` fields stripped from OGG container.

References: Opus (xiph), Vorbis (xiph); Opus comparison: opus-codec.org/comparison.

## Pack-Level Compression

After per-asset codec, all `.nxa` payload regions are framed with **Zstd** (default level 9; level 19 for `--ship`). Zstd dictionary trained on representative engine assets reduces small-region overhead by ~15%. [BENCHMARK NEEDED] dictionary impact on full game.

## Headless / CI

`nexus assets compress <ir-dir> --out <pack-dir> --preset production --deterministic`
- NDJSON per-asset progress for agent consumption.
- `--verify` re-runs encoder and asserts byte-identical output.
- `--platforms desktop,mobile,web` emits multi-target packs.

## Public API

```rust
fn encode_texture(ir: &TexIR, fmt: TexFormat, opts: TexOpts) -> Result<Bytes>;
fn encode_mesh(ir: &MeshIR, codec: MeshCodec, opts: MeshOpts) -> Result<Bytes>;
fn encode_audio(ir: &AudioIR, codec: AudioCodec, opts: AudioOpts) -> Result<Bytes>;
fn encoder_versions() -> EncoderVersionMap;   // baked into pack header
fn verify_deterministic(input: &[u8], encoder: EncoderId) -> bool;
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| BC7 encode 1K texture (production) | 400 ms | 2 s |
| BC7 encode 1K (dev) | 80 ms | 400 ms |
| ASTC 4×4 encode 1K (production) | 600 ms | 3 s |
| meshopt encode 100k tri | 50 ms | 250 ms |
| Draco encode 100k tri | 400 ms | 2 s |
| Opus encode 1 min audio (96 kbps) | 1 s | 4 s |
| meshopt decode | ≥ 3 GB/s aggregate | (per zeux) |
| Zstd L9 decode | ≥ 2 GB/s aggregate | platform-dependent |
| Deterministic re-encode mismatch rate | 0% | 0% (CI fails otherwise) |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_COMPRESS_FAIL` | Encoder returned error | Lower quality / different codec |
| `E_FORMAT_UNSUPPORTED` | No encoder for `(kind,platform)` combo | Choose alternate format |
| `E_NONDETERMINISTIC` | `--verify` failed | File bug; pin encoder version |
| `W_QUALITY_LOW` | PSNR below preset threshold | Accept or re-encode at higher setting |
| `W_TRANSCODE_LOSS` | Basis → BCn transcode lost alpha precision | Use UASTC source |

## Integration Points

- Renderer: declares GPU formats it can sample (`→ docs/contracts/renderer-assets.md`); compression picks intersection with platform support.
- Streaming: Zstd framing happens here so streaming layer is content-agnostic (`→ streaming.md`).
- LOD: per-LOD vertex/index buffers encoded independently for per-LOD streaming (`→ lod.md`).
- Networking: encoded blob hashes used for client/server asset validation (`→ docs/specs/networking/replication.md`).
- Agent: encoder telemetry consumable for budget tuning (`→ docs/specs/agent/telemetry.md`).

## Test Requirements

- Determinism: 100 random encodes × 3 reruns, byte-identical 100%.
- Quality: production preset PSNR > target for reference texture set.
- Cross-platform: BC7 desktop pack and ASTC mobile pack produced from same IR have ≤ 1 dB PSNR delta.
- Round-trip: encode → decode mesh has positions within `1/(2^16)·bbox_extent` error.
- Opus encode → decode preserves duration within ±1 sample.
- Reject non-deterministic encoder versions in CI.

## Prior Art

- KTX2 / Basis Universal (Khronos KHR_texture_basisu) ✓ — single source, multi-target transcode is the right model. `→ overview.md`.
- bgfx `texturec` ✓ — clean offline texture tool. Reference for CLI ergonomics.
- meshopt + gltfpack (zeux/meshoptimizer) ✓ — quantization model adopted directly.
- Draco (google/draco) ✓ — best mesh ratio. ✗ vertex reorder makes it unsuitable for default game-ready path; kept as opt-in.
- Opus (xiph.org) ✓ — superior to Vorbis at every bitrate; low latency enables voice.
- Wwise/FMOD audio compression ✓ — multi-codec per-bus selection — partial inspiration for per-bus codec choice (`→ docs/specs/audio/overview.md`).

## Open Questions

- [DECISION NEEDED] Ship a Zstd dictionary in engine, or train per-game in `nexus build`?
- [DECISION NEEDED] BC7 GPU encoder via wgpu compute for editor live iteration?
- [DECISION NEEDED] Whether to support PVRTC for older iOS — Apple has deprecated; ASTC mandatory on A8+.
- [BENCHMARK NEEDED] Demo game total pack size budgets per platform.
