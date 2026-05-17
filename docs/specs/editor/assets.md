<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Asset Browser

> File-tree + grid view over the asset registry. Import, preview, and AI-generate assets without leaving the editor. Every operation is an `EditorCommand` and an agent RPC.

## RPC parity

Every toolbar button, drag-drop, import wizard step, and AI-generation submit emits one `asset.*` agent RPC. Browser action `asset.import` ↔ RPC `asset.import`; `asset.generate` ↔ RPC `asset.generate`; commit/delete/move/tag identical. The browser is one client; an agent driving asset workflows headlessly calls the same surface. Enforced by `docs/specs/editor/rpc-parity.md` and Law 13 (→ `docs/architecture/01-principles.md#law-13`). MCP mirrors via `docs/specs/agent/mcp-server.md`.

## Boundaries

- Owns: asset browser dock, grid/tree view, thumbnail cache, preview viewport, import wizard UI, generation request UI.
- Does NOT own: asset bytes/registry/streaming (→ `docs/specs/assets/registry.md`), format importers (→ `docs/specs/assets/import.md`), generation backends (→ `docs/specs/assets/generation.md`).
- Depends on: `docs/specs/editor/overview.md`, `docs/specs/assets/registry.md`, `docs/specs/assets/import.md`, `docs/specs/assets/generation.md`, `docs/specs/agent/api.md`.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Asset Browser Dock                                                │
│  ┌──────────────┬───────────────────────────────────────────────┐ │
│  │  Folder Tree │  Toolbar: [import] [generate] [filter] [view] │ │
│  │              ├───────────────────────────────────────────────┤ │
│  │  ▾ assets/   │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │ │
│  │    ▸ meshes/ │  │ thb │ │ thb │ │ thb │ │ thb │ │ thb │    │ │
│  │    ▸ textures│  │ orc │ │tree │ │rock │ │sword│ │ ui  │    │ │
│  │    ▸ shaders/│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘    │ │
│  │    ▸ audio/  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │ │
│  │    ▸ prefabs/│  │ thb │ │ thb │ │ thb │ │ thb │ │ thb │    │ │
│  │              │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘    │ │
│  │  ▾ external/ │                                               │ │
│  │    kenney    │  Preview pane (right or bottom):              │ │
│  │    polyhaven │  ┌────────────────────────────┐               │ │
│  │              │  │   rotatable 3D / 2D / play │               │ │
│  └──────────────┴──┴────────────────────────────┴───────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## Views

- **Tree**: directory hierarchy under `assets/` and external libraries.
- **Grid**: thumbnail grid, configurable cell size (32/64/128/256 px).
- **List**: name, type, size, dependencies, last modified, GPU memory cost.
- **Graph**: dependency graph for the selection (asset uses asset uses asset).

All views read from the same `assets.subscribe { path, recursive }` RPC stream.

## Thumbnail cache

- Stored in `.nexus/cache/thumbs/{asset_uuid}_{size}.webp`.
- Generated on import + on first browser display.
- Generation runs in engine (off the editor thread), result pushed via telemetry channel.
- Stale detection via asset content hash from `docs/specs/assets/registry.md`.
- 3D mesh thumbnails: rendered by engine in a tiny offscreen viewport (256² default), neutral lighting, camera frames bounding sphere.
- Animated thumbnails (idle on hover): 64-frame GIF/WebP for animation clips, particle effects, shader graphs.

## Preview pane

| Asset kind | Preview |
|---|---|
| Texture/Image | image viewer, channel toggle (RGBA), mip slider, gamma toggle |
| Mesh | orbit camera, wireframe/solid/normals/UV overlay, LOD slider |
| Animation | timeline scrubber, play/pause, loop, bone overlay |
| Material | sphere/cube/plane preview, env probe selector |
| Shader graph | small viewport + node mini-map (→ `docs/specs/editor/shader.md`) |
| Audio | waveform + transport + spectrogram, spatialization toggle |
| Prefab | mini-viewport with the prefab spawned |
| Script | code preview with syntax highlight + exported component list |
| Font | glyph atlas + sample text |
| Particle/VFX | live looping preview |
| Scene | thumbnail screenshot + "open in tab" |

## Import flow

```
┌────────────────────┐
│ OS file dropped /  │
│ Import… clicked    │
└────────┬───────────┘
         ▼
┌────────────────────┐    detect format       ┌──────────────────────┐
│ assets.import.start├───────────────────────►│ docs/specs/assets/   │
└────────┬───────────┘ (rpc)                  │  import.md pipeline  │
         │                                    └──────┬───────────────┘
         ▼                                           │
┌────────────────────┐    settings JSON              │
│  Import Wizard UI  │◄─── default settings ─────────┘
│  (per-format)      │
└────────┬───────────┘
         │  user tweaks settings (compression, LODs, scale, axis fix)
         │  live preview updates after each tweak (debounced 200 ms)
         ▼
┌────────────────────┐    finalize             ┌──────────────────────┐
│ assets.import.commit├──────────────────────►│ registry insert      │
└────────┬───────────┘                         │ + thumbnail gen      │
         │                                     │ + dependency scan    │
         ▼                                     └──────────────────────┘
   browser refresh
```

- Wizard settings persisted per-folder as `.nxasset` sidecar (re-import uses same settings).
- Batch import: drop a folder → tabbed wizard with "apply to all of this kind".
- Background queue: imports never block UI; progress in status bar.

## AI generation trigger

The "Generate" toolbar button opens a panel that drives `docs/specs/assets/generation.md`. The editor is a thin form; the engine routes to backends.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Generate Asset                                                     │
│                                                                     │
│  Kind:   [ Texture ▾ ]   [ Mesh ▾ ]   [ Audio ▾ ]   [ Sprite ▾ ]   │
│                                                                     │
│  Prompt: ┌───────────────────────────────────────────────────────┐  │
│          │ "weathered iron warhammer, fantasy, low poly, 2k tris"│  │
│          └───────────────────────────────────────────────────────┘  │
│                                                                     │
│  Style:  [ inherit project · pbr ]    Ref images: [ + drop ]        │
│                                                                     │
│  Backend: ◉ auto   ○ Meshy   ○ Scenario   ○ FLUX local              │
│           ○ Kenney library   ○ OpenGameArt   ○ Poly Haven           │
│                                                                     │
│  Variants: [4]   Seed: [random ⟳]   Budget cap: [$ 0.40]            │
│                                                                     │
│  [ Cancel ]                                            [ Generate ] │
└─────────────────────────────────────────────────────────────────────┘
```

Submit ⇒ `assets.generate { kind, prompt, style, refs, backend, variants, seed, budget }` RPC. Returns a job id. Results stream into a "Pending" folder. User picks variants → "Commit" moves them into target folder, runs the standard import pipeline, registers in registry.

- Project-wide style consistency: prompt is augmented by `style.lock` from `docs/specs/styles/overview.md`.
- Generation history kept in `.nexus/cache/generation_log.jsonl` for replay/audit (and so an agent can `bisect` a style drift).
- Budget guardrails: per-project cap from `Nexus.toml`; UI shows running cost.

## External library browsing

- Kenney, OpenGameArt, Poly Haven, ambientCG indexed via `nexus-assets` library cache (separate from project assets).
- Browser shows them under `external/` with a clear license badge (CC0, CC-BY, etc).
- Drag from external ⇒ copies into `assets/` (with proper attribution sidecar `LICENSE.txt`).

## Search

- Global Ctrl+F: name, tag, type, license, dependencies, "used in scene X", "broken refs".
- Saved searches (smart folders).
- Semantic search: prompt text matched against vector embeddings of thumbnails+metadata via `assets.search.semantic` (backend: same model used for generation captions).

## Public API (commands)

```rust
pub struct ImportAsset      { pub src: PathBuf, pub dst: AssetPath, pub settings: serde_json::Value }
pub struct ReimportAsset    { pub asset: AssetId, pub settings_overrides: serde_json::Value }
pub struct DeleteAsset      { pub asset: AssetId, pub also_break_refs: bool }
pub struct MoveAsset        { pub asset: AssetId, pub new_path: AssetPath }
pub struct RenameAsset      { pub asset: AssetId, pub new_name: String }
pub struct GenerateAsset    { pub kind: AssetKind, pub prompt: String, pub style: StyleRef,
                              pub refs: Vec<AssetId>, pub backend: Option<BackendId>,
                              pub variants: u32, pub seed: Option<u64>, pub budget_usd: f32 }
pub struct CommitGenerated  { pub job_id: JobId, pub chosen: Vec<VariantId>, pub dst_folder: AssetPath }
pub struct CreateFolder     { pub path: AssetPath }
pub struct TagAsset         { pub asset: AssetId, pub tags: Vec<String> }
```

All implement `EditorCommand`. RPC counterparts: `assets.*` in `docs/specs/agent/api.md`.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Browser paint, 5k assets in folder | < 8 ms (virtualized grid) | 16 ms |
| Thumbnail gen, single 2k mesh | < 250 ms (background) | 2 s |
| Preview load, 4k texture | < 80 ms | 500 ms |
| Import 1 GB glTF | < 30 s | 5 min |
| Generate→preview, FLUX local 1024² | < 5 s on RTX 3060 | 30 s |
| Generate→preview, Meshy mesh | < 60 s | 5 min |
| Semantic search across 100k assets | < 200 ms | 1 s |

`[BENCHMARK NEEDED]` Meshy/Scenario backends — pin numbers after API stabilization.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `AB_IMPORT_FORMAT_UNKNOWN` | no importer for extension | offer plugin search |
| `AB_IMPORT_CORRUPT` | importer rejected the bytes | surface importer's structured error |
| `AB_GEN_BACKEND_DOWN` | generation provider unreachable | suggest fallback backend |
| `AB_GEN_BUDGET_EXCEEDED` | request would exceed project cap | block, surface current spend |
| `AB_GEN_REJECTED_POLICY` | provider safety filter tripped | show provider message, suggest rewording |
| `AB_THUMB_FAILED` | thumbnail render error | use generic icon, log |
| `AB_REF_BREAK_BLOCKED` | delete would break scenes; user did not confirm | open ref-list dialog |
| `AB_LICENSE_INCOMPATIBLE` | dragged external asset license not project-compatible | warn, allow override |

## Integration Points

| System | Interaction |
|---|---|
| `docs/specs/assets/registry.md` | source of truth for paths, UUIDs, deps, hashes |
| `docs/specs/assets/import.md` | importer pipeline invoked by wizard |
| `docs/specs/assets/generation.md` | generation backends, job lifecycle |
| `docs/specs/assets/streaming.md` | preview viewport uses same streaming path |
| `docs/specs/styles/overview.md` | style lock injected into generation prompts |
| `docs/specs/editor/scene.md` | drag-drop into viewport / inspector slots |
| `docs/specs/editor/livereload.md` | reimport ⇒ live update without restart |
| `docs/specs/agent/api.md` | every action ⇒ `assets.*` RPC |

## Test Requirements

- `assets.browser.large_folder`: 10k items, grid paints < 16 ms, scrubbing smooth.
- `assets.browser.import_roundtrip`: drop file → wizard accepts → registry lists → preview renders → drag to viewport → entity spawned.
- `assets.browser.generation_replay`: capture generation job JSON, re-run headless via RPC, produces same artifact (deterministic seed).
- `assets.browser.budget_guard`: configured $1 cap, generation attempt at $1.10 rejected with `AB_GEN_BUDGET_EXCEEDED`, no provider call made.
- `assets.browser.license_check`: dragging CC-BY asset into project locked to CC0 triggers `AB_LICENSE_INCOMPATIBLE`.
- `assets.browser.thumb_cache`: thumb gen idempotent — same content hash ⇒ cache hit.
- `assets.browser.semantic_search`: corpus of 1k assets, prompt "red metal sword" returns swords ranked above unrelated meshes.

## Prior Art

- ✓ Godot FileSystem dock + import dock model; sidecar `.import` files. ✗ wizard split across two docks (we unify).
- ✓ Unity Project window — drag-drop fluidity, preview hover.
- ✓ Unreal content browser — collections, smart filters.
- ✓ Blender Asset Browser — catalog system, drag-drop into 3D view.
- ✓ Kenney.nl / Poly Haven web UX — license-first browsing.
- ✓ Substance / Quixel Bridge — search + preview + one-click import flow.
- ✓ Meshy / Scenario / FLUX UIs — generation form ergonomics.

## Open Questions

- `[DECISION NEEDED]` Local model packaging — bundle FLUX weights with editor, or fetch on first use?
- `[DECISION NEEDED]` Per-asset cost attribution — track per generation, per project, per agent identity?
- `[DECISION NEEDED]` "Pending" folder visibility — hidden until commit, or always visible to all collaborators?
- `[DECISION NEEDED]` Semantic search embedding model — default local (CLIP-like) vs remote?
- `[AGENT: 09]` finalize generation job schema (`job_id` lifetime, variant addressing).
- `[AGENT: 09]` confirm sidecar format (`.nxasset` vs Godot-style `.import`).
- `[AGENT: 04]` confirm `style.lock` field name + payload in `docs/specs/styles/overview.md`.
- `[AGENT: 16]` license-compatibility matrix — where does it live? Asset registry or merge-system config?
