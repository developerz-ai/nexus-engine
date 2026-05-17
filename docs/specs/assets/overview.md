<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Asset Pipeline — Overview

> Deterministic, headless-capable pipeline that takes a source file (or AI-gen request), produces GPU-ready, compressed, streamable artifacts addressed by stable UUIDs.

## Boundaries

- Owns: import, processing, compression, LOD generation, virtual-geometry build, registry, async streaming, hot reload, AI-gen integration.
- Does NOT own:
  - GPU upload / texture residency → renderer. See `→ docs/contracts/renderer-assets.md`.
  - Disk/network I/O primitives → core HAL. See `→ docs/specs/core/hal.md`.
  - Decoded audio playback → audio. See `→ docs/specs/audio/streaming.md`.
  - Script bytecode caching → scripting. See `→ docs/specs/scripting/hotreload.md`.
- Depends on:
  - `→ docs/specs/core/jobs.md` (task graph for parallel import/decode)
  - `→ docs/specs/core/memory.md` (budgeted arenas per stream tier)
  - `→ docs/specs/core/events.md` (asset lifecycle events)

## Pipeline Stages

```
 ┌────────┐   ┌────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐
 │ SOURCE │──▶│ IMPORT │──▶│ PROCESS │──▶│COMPRESS │──▶│ PACK   │
 └────────┘   └────────┘   └─────────┘   └─────────┘   └────────┘
   .gltf        parse        meshopt        BCn/ASTC      .nxa
   .png        validate      tangents       Draco         (cas
   .ogg        manifest      LOD chain      Opus           blob)
   ai-gen      hash src      mip chain      Zstd
                              meshlets
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │ REGISTRY (UUID) │
                                                    │  + dep graph    │
                                                    └─────────────────┘
                                                              │
              hot reload watcher ─────────────────────────────┤
                                                              ▼
                                                    ┌─────────────────┐
                                                    │ STREAM SCHEDULER│
                                                    │ priority queue  │
                                                    │ memory budget   │
                                                    └────────┬────────┘
                                                             ▼
                                                    ┌─────────────────┐
                                                    │ DECODE + UPLOAD │
                                                    │ (renderer/audio)│
                                                    └─────────────────┘
```

Stage details:
- `import.md` — format readers, normalization to `nxa-ir` (intermediate rep).
- `compression.md` — texture/mesh/audio encoders, deterministic output.
- `lod.md` — discrete LOD chain + virtual geometry meshlet build.
- `streaming.md` — async load, priority queue, budget eviction.
- `generation.md` — AI source providers (Meshy, Scenario, FLUX) treated as imports.
- `registry.md` — UUID addressing, dep graph, hot reload.

## Pack Format (`.nxa`)

Content-addressable blob. One source → one or many `.nxa` files. Header is fixed-size; payload is Zstd-framed.

```
+0   magic "NXA1" (4B)
+4   version (u32)
+8   asset_kind (u32)   // 0=mesh 1=texture 2=audio 3=anim 4=font 5=scene
+12  uuid (16B)
+28  source_hash (32B blake3)  // hash of normalized source + import params
+60  flags (u32)               // streaming tier, srgb, mip_streamed, ...
+64  toc_offset (u64)          // table of contents (regions, mips, lods)
+72  toc_size (u32)
+76  payload[...]              // zstd-framed; per-region cas
```

Determinism: identical `(source_bytes, import_params, encoder_version)` → identical `.nxa` byte-for-byte. Enables caching, content-addressable storage, reproducible CI artifacts.

## Public API (sketch)

```rust
// 5-line signature only. Full surface in registry.md.
fn import(src: &Path, opts: ImportOpts) -> Result<AssetUuid, ImportError>;
fn load<T: Asset>(uuid: AssetUuid) -> Handle<T>;          // returns immediately
fn load_blocking<T>(uuid: AssetUuid) -> Result<T, LoadError>;
fn watch(uuid: AssetUuid, cb: fn(Event));                  // hot reload
fn unload(uuid: AssetUuid);
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Cold import 1MB glTF | 80 ms | 500 ms |
| Cold import 4K PNG → BC7 | 200 ms (GPU encode) | 2 s (CPU fallback) |
| Streamed mesh page (64KB) decode | 0.5 ms | 2 ms |
| Streamed texture mip (1MB BCn) decode | 0.2 ms | 1 ms |
| Hot-reload propagation (edit → frame) | < 100 ms | 500 ms |
| Registry lookup by UUID | O(1), < 1 µs | 10 µs |
| Headless import throughput (CI) | ≥ 100 MB/s aggregate | [BENCHMARK NEEDED] |
| Streaming budget overshoot | 0 frames | 1 frame |

## Error Contract

All errors are structured JSON (AI-first mandate, principle 10). Codes:

| Code | Meaning | Caller action |
|---|---|---|
| `E_ASSET_NOT_FOUND` | UUID unknown to registry | Re-import or fix manifest |
| `E_IMPORT_FORMAT` | Unsupported extension/magic | Convert source or add loader |
| `E_IMPORT_VALIDATION` | Source violates format spec | Fix source; see `details.errors[]` |
| `E_IMPORT_PARAMS` | `ImportOpts` invalid | Fix opts; `details.field` |
| `E_COMPRESS_FAIL` | Encoder error | Lower quality / fallback codec |
| `E_BUDGET_EXCEEDED` | Stream budget hit, eviction blocked | Raise budget or unload |
| `E_DEP_CYCLE` | Cyclic dependency in registry | Break cycle (see `details.path[]`) |
| `E_HASH_MISMATCH` | `.nxa` content hash invalid | Re-import; possible disk corruption |
| `E_GEN_PROVIDER` | AI-gen provider failure | Retry / change provider |

Schema: `{ code, message, stage, source_uri?, uuid?, details{} }`.

## Integration Points

- Renderer: `→ docs/contracts/renderer-assets.md` (upload protocol, residency).
- Audio: `→ docs/contracts/core-audio.md` (decoded PCM stream interface).
- Scripting: `→ docs/contracts/core-scripting.md` (asset handles in Lua/Rune).
- Agent: `→ docs/specs/agent/api.md` (`assets.import`, `assets.gen`, `assets.list`).
- Editor: `→ docs/specs/editor/assets.md` (browser, drag-drop, gen trigger).
- Networking: deterministic hashes enable client/server asset validation (`→ docs/specs/networking/replication.md`).

## Telemetry

Per stage, every import emits structured spans:
```json
{ "stage":"compress", "uuid":"...", "kind":"texture","encoder":"bc7",
  "in_bytes":16777216, "out_bytes":4194304, "ms":182.4,
  "deterministic_hash":"blake3:..." }
```
Subscribe via `→ docs/specs/agent/telemetry.md`.

## Test Requirements

- Reimport of unchanged source yields byte-identical `.nxa`.
- Headless import of all reference assets in `docs/games/*` succeeds on Linux/Win/Mac CI.
- Hot reload: edit `.png` → texture visibly updates within 500ms, no GPU validation errors.
- Stream budget: scene with 10× budget load shows zero frame drops; eviction LRU correct.
- Cyclic dep detection: synthetic cycle reports `E_DEP_CYCLE` with full path.
- All error JSON validates against schema in `docs/contracts/renderer-assets.md`.

## Prior Art

- bevy_asset (Bevy AssetServer + Handle + dep tracking) ✓ — model directly inspires registry layer. `inspired by: bevy_asset`.
- Unreal Cooker / DDC (Derived Data Cache) ✓ — content-addressable cache idea.
- Unity AddressableAssets ✓ — UUID addressing + budget streaming. Async loading API too verbose ✗.
- Godot `.import` sidecar pattern ✓ — import params persisted next to source.
- bgfx `texturec` / `geometryc` ✓ — deterministic offline encoders.

## Open Questions

- [DECISION NEEDED] On-disk pack format: single `.nxa` per asset vs. bundled `.nxpack` per scene? Tradeoff: random access vs. seek count.
- [DECISION NEEDED] Default streaming budget tier per platform (mobile vs. desktop vs. console).
- [DECISION NEEDED] Whether AI-gen results are cached forever (CC0) or expire with provider credit.
- [BENCHMARK NEEDED] Headless CI throughput target on reference hardware.
