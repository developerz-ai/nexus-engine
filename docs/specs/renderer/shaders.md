<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Shader Pipeline

> WGSL is the source language; `naga` is the compiler. A preprocessor adds `#import`, `#define`, and conditionals. Permutations are explicit, named, and cached. Hot reload is a first-class build target.

## Boundaries

- Owns: WGSL preprocessing, permutation enumeration, compile cache, pipeline-state creation, hot reload watcher.
- Does NOT own:
  - Bind group layouts (owned by individual passes / materials).
  - Material parameter authoring → `docs/specs/renderer/pbr.md`.
  - Visual shader graph → `docs/specs/editor/shader.md` [AGENT: 11] (emits WGSL into this pipeline).
- Depends on:
  - `naga` (gfx-rs/wgpu) for WGSL → SPIR-V / MSL / HLSL / WGSL.
  - `notify` for filesystem watching.
  - `docs/specs/renderer/backend.md` for selecting output dialect.

## Architecture

```
WGSL source files (crates/*/shaders/*.wgsl)
        │
        ▼
┌────────────────────────────────────────┐
│   Preprocessor (naga-oil derivative)   │
│   · #import "path"                     │
│   · #define KEY value                  │
│   · #ifdef / #endif                    │
│   · @entry tagging                     │
└────────────┬───────────────────────────┘
             │
             ▼  (expanded source per permutation)
┌────────────────────────────────────────┐
│   naga front-end → IR                  │
│   · syntax + type checks               │
│   · validation errors → JSON diags     │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│   naga back-end (selected by backend)  │
│   Vulkan  → SPIR-V                     │
│   DX12    → HLSL/DXIL                  │
│   Metal   → MSL                        │
│   WebGPU  → WGSL (re-emit)             │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│   Pipeline Cache                       │
│   key = (shader_id, perm_hash, layout) │
│   value = wgpu::*Pipeline               │
│   persisted to disk (per backend)      │
└────────────┬───────────────────────────┘
             │
             ▼
       wgpu Pipeline
```

## Permutation System

Permutations are explicit, declared per pipeline, and exhaustively enumerated at build time when possible.

```rust
// In code:
pub struct PipelineSpec {
    pub shader: ShaderId,
    pub vertex_entry: &'static str,
    pub fragment_entry: Option<&'static str>,
    pub features: PermutationKey,        // bitset of #define flags
    pub variants: &'static [&'static str],  // declared #define names
}
```

Declared in WGSL via header pragma:

```wgsl
//! @permutations USE_NORMAL_MAP USE_AO HAS_VERTEX_COLOR SKINNED CASCADE_COUNT(1|2|3|4)
//! @entry vs_main fs_main

#ifdef USE_NORMAL_MAP
  // ...
#endif
```

Constraints to keep combinatorial explosion bounded:

- `[BUDGET]` ≤ 8 boolean flags + 1 enumerated dim per pipeline → ≤ 256 × N variants.
- Compile budget: ≤ 1024 unique permutations per shader compiled at build time; rest on demand.
- Persisted cache survives restarts; cache key includes WGSL source hash + naga version + backend.

## Preprocessor

Minimal directive set (no Turing-complete macros):

```
#import "path/to/file.wgsl"            // textual include, dedup'd
#define KEY                            // bool flag
#define KEY value                      // int / float / string constant
#ifdef KEY  /  #ifndef KEY  /  #endif  /  #else
#if KEY == 3 / #if KEY < 4             // integer-constant compare
#pragma once                           // dedup token
```

`#import` resolves against module roots registered by each crate. No path traversal outside roots.

## Hot Reload

```
fs notify ──► debounce (50 ms) ──► dependency walker
                                    │
                                    ▼
                          set of dirty shader_ids
                                    │
                                    ▼
                  for each dirty:  re-preprocess
                                    re-compile current-live permutations only
                                    on success: atomic swap of cached pipeline
                                    on failure: keep prev pipeline, emit error
                                                with file:line:col
```

Reload guarantees:

- Bind group layouts must remain stable across reload (validated). Layout change → fall back to full reload (drop cached pipelines, recompile next frame).
- Currently-recording command buffers complete with old pipeline; swap takes effect next encode.
- All errors are structured JSON with `code`, `file`, `line`, `column`, `message`, `suggested_fix`.

## Public API

```rust
pub struct ShaderRegistry { /* internal */ }

pub struct ShaderId(u32);
pub struct PipelineId(u32);

impl ShaderRegistry {
    pub fn load_wgsl(&mut self, path: &Path) -> Result<ShaderId, ShaderError>;
    pub fn register_pipeline(&mut self, spec: PipelineSpec)
        -> Result<PipelineId, ShaderError>;
    pub fn get_pipeline(&self, id: PipelineId, perm: PermutationKey)
        -> Result<&wgpu::RenderPipeline, ShaderError>;
    pub fn enable_hot_reload(&mut self, watch: &[PathBuf]);
    pub fn precompile_all(&mut self) -> CompileReport;     // CI / shipping build
}

pub struct CompileReport {
    pub total: u32,
    pub succeeded: u32,
    pub failed: Vec<(ShaderId, ShaderError)>,
    pub elapsed: Duration,
}
```

## Cache Format

```
~/.cache/nexus/shaders/<game_id>/<backend>/<naga_ver>/<src_hash>.bin
  header   : version, backend, naga_ver, source_hash, perm_hash
  blob     : SPIR-V / DXIL / MSL bytes
  metadata : entry points, bind group sigs
```

Cache invalidation: source hash mismatch OR naga version mismatch → full rebuild.

## Performance Contract

| Metric                                          | Target           | Hard limit       |
|-------------------------------------------------|------------------|------------------|
| Single permutation compile (cold, mid CPU)      | < 25 ms          | < 100 ms         |
| Permutation cache hit                           | < 50 µs          | < 200 µs         |
| Hot reload turnaround (save → pipeline swap)    | < 100 ms         | < 500 ms         |
| Pipeline cache load (10k entries from disk)     | < 200 ms         | < 1 s            |
| Memory per cached pipeline (avg)                | < 32 KB          | < 256 KB         |
| Full precompile (shipping build, 5k variants)   | < 30 s           | < 120 s          |

## Error Contract

| Code                       | Meaning                              | Caller action                       |
|----------------------------|--------------------------------------|-------------------------------------|
| `SHADER_PARSE`             | WGSL syntax error                    | Show file:line:col, suggested fix   |
| `SHADER_VALIDATE`          | naga type/uniformity error           | Render error overlay, keep prev     |
| `SHADER_BACKEND_TRANSLATE` | naga backend failed                  | File compiler bug                   |
| `SHADER_BIND_LAYOUT_DRIFT` | Reload changed bind group sig        | Force full pipeline recompile       |
| `SHADER_PERM_OVERFLOW`     | > budget permutations enumerated     | Reduce flags or split shader        |
| `SHADER_CACHE_CORRUPT`     | Cache blob bad header / hash         | Recompile, repopulate cache         |

## Integration Points

| System    | Contact                                                                                |
|-----------|----------------------------------------------------------------------------------------|
| Backend   | Selects naga back-end at init; cache keyed by backend.                                 |
| Renderer  | All passes acquire pipelines via `ShaderRegistry`; no direct `wgpu::create_pipeline`.  |
| Assets    | `.wgsl` files imported as text assets, watched by registry.                            |
| Editor    | Material/visual-shader node graph emits WGSL → registers as a pipeline.                |
| Agent SDK | `nexus shader compile-all` precompiles for headless determinism; errors → JSON.        |
| Scripting | Scripts cannot create shaders directly (sandboxing); request pre-registered ones only. |

## Test Requirements

- Round-trip: load `.wgsl`, register pipeline, compile cold → cache → reload from cache → identical bytes.
- Bad syntax → `SHADER_PARSE` with correct file/line/column.
- Hot reload: edit file, save → pipeline swapped within hard limit; no validation errors.
- Permutation enumeration: declare 4 flags → 16 pipelines produced when `precompile_all()`.
- Backend matrix: same WGSL compiles successfully on Vulkan, Metal, DX12, WebGPU back-ends.
- Reload with bind layout drift → emits `SHADER_BIND_LAYOUT_DRIFT`, full recompile recovers.

## Prior Art

- `naga-oil` (Bevy) ✓ preprocessor + module system for WGSL.
- Bevy shader defs ✓ flag-based permutations.
- `wgsl_bindgen` ✓ generates Rust bindings from WGSL.
- `slang` ✓ best-in-class shader language with proper modules; we may pivot if WGSL grows them.
- UE shader permutation system ✓ explicit cooked permutations.
- `rust_wgpu_hot_reload` ✓ minimal reference for filesystem-watch reload.

## Open Questions

- `[DECISION NEEDED]` Adopt `slang` as primary source language once WebGPU back-end matures? WGSL lacks modules natively.
- `[DECISION NEEDED]` AOT precompile for shipping → ship cooked SPIR-V/DXIL/MSL/WGSL bundles vs. ship WGSL + compile on first launch.
- `[DECISION NEEDED]` Push-constant emulation strategy on backends without them (WebGPU) — small UBO ring buffer.
- `[BENCHMARK NEEDED]` naga compile speed for our heaviest lit shader — informs precompile budget.
- `[DECISION NEEDED]` Allow user-provided shader plugins (capability/sandbox concerns).
- `[DECISION NEEDED]` Pipeline cache shared cross-game vs. per-game — sharing saves disk, complicates invalidation.
