<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# AI Asset Generation

> AI- and library-sourced assets are first-class citizens. `nexus assets gen "stone golem, weathered"` returns a real, imported, registered asset — same `AssetUuid`, same registry, same pipeline as a hand-authored source.

## Boundaries

- Owns: provider abstraction, prompt → request mapping, request queueing, license validation, attribution metadata, local cache of generated artifacts, library catalog indexing (Kenney/OpenGameArt/Poly Haven/ambientCG).
- Does NOT own: model training, hosted GPU infrastructure (user-managed for FLUX), credit/billing UI (CLI surfaces stats only).
- Depends on: `→ import.md` (every generated artifact flows through normal import), `→ registry.md` (UUID + provenance), `→ docs/specs/agent/api.md` (agent-driven gen), `→ docs/specs/core/hal.md` (HTTP / IPC).

## Provider Taxonomy

```
       ┌─────────────────────────────────────────────────────┐
       │                  generation request                 │
       │  { kind, prompt, refs?, style?, license_filter,     │
       │    quality, deterministic_seed?, budget_credits }   │
       └───────────────┬─────────────────────────────────────┘
                       ▼
       ┌──────────────────────────────────────────┐
       │             PROVIDER ROUTER              │
       │  policy: prefer local → CC0 lib → paid   │
       └──┬──────────────┬────────────┬─────────┬─┘
          ▼              ▼            ▼         ▼
      ┌───────┐    ┌──────────┐  ┌────────┐ ┌────────┐
      │ FLUX  │    │ Library  │  │ Meshy  │ │Scenario│
      │ local │    │ search   │  │  API   │ │  API   │
      └───┬───┘    └─────┬────┘  └────┬───┘ └────┬───┘
          ▼              ▼            ▼          ▼
                 raw file (gltf/png/wav/...)
                          ▼
                   normal IMPORT pipeline
                          ▼
              .nxa + registry entry + provenance
```

## Providers (v1.0)

### `flux-local` — Self-hosted text-to-image

- Model: Black Forest Labs FLUX.1 (`flux-dev` or `flux-schnell`). Source: github.com/black-forest-labs/flux; weights on Hugging Face. License: non-commercial for `dev`; Apache-2.0 for `schnell`. Engine never bundles weights — user provides.
- Transport: HTTP to a user-run inference server (ComfyUI, vLLM-style, or BFL's reference repo). Endpoint configured in `Nexus.toml`.
- Kinds: `texture`, `concept`, `ui_sprite`, `material_swatch`.
- VRAM requirement (user-side): ≥ 16–24 GB for full quality.
- Cost: free at runtime (user GPU). [BENCHMARK NEEDED] target latency on RTX 4090.

### `meshy` — Text/Image-to-3D mesh

- Docs: docs.meshy.ai. REST, asynchronous task model.
- Two-stage workflow (per Meshy text-to-3D API): `mode:"preview"` → review → `mode:"refine"` (textures applied). Engine implements both transparently.
- Supported kinds: `mesh` (with optional rigging via `remesh` / `rigging` endpoints).
- Output formats: glTF/GLB → fed straight into `→ import.md`.
- Auth: API key in `~/.nexus/credentials.toml` or `NEXUS_MESHY_KEY` env.
- Cost: credit-based; engine reports remaining credits in telemetry.

### `scenario` — Custom-style 2D textures/sprites/skyboxes

- Docs: docs.scenario.com. REST with custom-trained models per team style.
- Best use: train a model on the project's art (style consistency), then batch-generate textures/sprites/skyboxes.
- Kinds: `texture`, `sprite`, `skybox`, `material` (PBR set via texturing pipeline).
- Output: PNG/EXR/JPG; cubemap as 6 faces or equirect (HDR for skybox).
- Auth: API key.

### `kenney` — CC0 game asset library (offline catalog)

- Source: kenney.nl — 40,000+ CC0 assets. License: CC0 (verified).
- Engine ships an offline catalog index (manifest of pack name, kind, tags, hash). Search is local; download via HTTPS on first use, then content-addressed cache.
- Kinds: `sprite`, `mesh`, `audio`, `ui`, `tilemap`.

### `opengameart` — Community library

- License filter: engine queries only CC0, CC-BY 4.0, or CC-BY-SA 4.0 (configurable). Attribution metadata required and persisted on import.
- Catalog: scraped manifest, refreshed periodically. [DECISION NEEDED] hosting of catalog snapshot.

### `polyhaven` — HDRIs, 3D models, textures (CC0)

- Source: polyhaven.com — 100% CC0.
- Kinds: `hdri`, `mesh`, `pbr_material` (full material set: BaseColor/Normal/Roughness/AO/Disp).
- API: Poly Haven offers a public JSON API for listings and downloads.

### `ambientcg` — PBR materials (CC0)

- Source: ambientcg.com — 2000+ PBR materials, HDRIs, models, CC0.
- Kinds: `pbr_material`, `hdri`, `mesh`.

Future providers (plugin trait `GenProvider`): Suno (music), ElevenLabs (voice), Stable Audio (SFX), Tripo3D, Luma Genie, Rodin.

## License Tagging

Every generated/sourced asset carries `provenance.toml`:
```toml
provider = "kenney"
license = "CC0-1.0"
attribution = ""                     # required iff license demands
source_url = "https://kenney.nl/assets/..."
prompt = ""                          # for ai-gen
model = "flux-dev@1.0"
seed = 1234
generated_utc = "2026-05-17T10:11:12Z"
hash = "blake3:..."
```

Build pipeline emits a per-project `THIRD_PARTY_LICENSES.md` from provenance entries automatically (`nexus build --emit-licenses`).

License filter is enforced at request time. Default policy: `[CC0-1.0, MIT, Apache-2.0]` for unattended/CI gen; CC-BY family requires `--allow-attrib`.

## Public API

```rust
fn gen(req: GenRequest) -> GenJob;
fn gen_blocking(req: GenRequest) -> Result<AssetUuid, GenError>;
fn search(query: SearchQuery) -> Vec<CatalogHit>;
fn providers() -> &'static [ProviderInfo];     // capabilities, costs, auth state
fn refresh_catalog(provider: ProviderId);
```

Agent JSON-RPC (`→ docs/specs/agent/api.md`):
```
assets.gen     { kind, prompt, opts }   → { job_id }
assets.search  { query, license_filter} → { hits[] }
assets.gen.poll{ job_id }               → { status, asset_uuid?, error? }
```

CLI:
```
nexus gen texture "rusted iron, 2K, tileable"
nexus gen mesh    "stone golem, low poly, weathered" --provider meshy
nexus gen find    "wood crate" --license CC0
nexus gen credits                                # show provider balance
```

## Generation Request

```rust
struct GenRequest {
  kind: AssetKind,           // mesh|texture|audio|sprite|skybox|material|...
  prompt: String,
  refs: Vec<AssetUuid>,      // style refs (img-to-img, mesh re-skin)
  style: Option<StyleTag>,   // pbr | npr | pixel | painted | photo
  license_filter: Vec<LicenseId>,
  quality: Quality,          // draft | std | high
  seed: Option<u64>,         // deterministic when supported
  budget_credits: Option<u32>,
  prefer: Vec<ProviderId>,   // user override of policy
}
```

## Determinism & Caching

- Request hash = `blake3(provider ⊕ model_ver ⊕ prompt ⊕ refs ⊕ opts ⊕ seed)`.
- Identical hash within a project → cache hit; no re-spend.
- AI-gen results are content-addressed and stored alongside normal `.nxa` files; re-imports are free.
- For non-deterministic providers, `seed` is recorded but reproducibility is best-effort and flagged in `provenance.toml`.

## Headless / CI Use

`nexus gen ... --headless --json` returns NDJSON with `{status, progress, eta_s, ...}` events. Agents poll without TTY. Generation is sandboxed: no provider call without credentials present; in CI, provider gen is disabled by default — only library lookup is allowed unless `--enable-paid` set.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Catalog search (local) | < 20 ms | 100 ms |
| Kenney/PolyHaven download (10 MB) | 2 s (warm CDN) | 30 s |
| Meshy text-to-3D preview | 30 s (provider-bound) | 180 s |
| Meshy refine | 60 s | 300 s |
| FLUX local 1024² (4090) | 3 s | 15 s |
| Scenario texture 1K | 8 s | 60 s |
| Cache hit retrieval | same as `import` of cached `.nxa` | |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_GEN_PROVIDER` | Provider HTTP/RPC failure | Retry or change provider |
| `E_GEN_AUTH` | Missing/invalid credentials | Set key in `~/.nexus/credentials.toml` |
| `E_GEN_QUOTA` | Out of credits / quota | Top up or switch provider |
| `E_GEN_LICENSE` | All matches violated `license_filter` | Loosen filter or pick another provider |
| `E_GEN_TIMEOUT` | Job exceeded `timeout_s` | Lower quality or retry |
| `E_GEN_CONTENT_BLOCKED` | Provider safety filter rejected prompt | Reword prompt |
| `W_GEN_NONDETERMINISTIC` | Cache miss because provider ignores seed | None (recorded in provenance) |

## Integration Points

- Import (`→ import.md`): all generated artifacts are imported normally — gen is a source, not a parallel pipeline.
- Registry (`→ registry.md`): provenance stored in registry; `assets.list --by-provider` queryable.
- Editor (`→ docs/specs/editor/assets.md`): "Generate…" panel in browser; live preview during streaming gen.
- Agent (`→ docs/specs/agent/api.md`): full JSON-RPC; agents drive most generation.
- Networking: deterministic hashes mean clients can pre-fetch gen assets from a CDN of cached results (`→ docs/specs/networking/replication.md`).

## Test Requirements

- Provider abstraction: mock provider returns synthetic asset; flows through import to registry with provenance set.
- License filter rejects non-matching results; structured error.
- Cache: identical request twice → second is free (no network call).
- CI mode disables paid providers by default; library lookups continue to work offline once cached.
- Provenance file present on every generated `.nxa` and survives reimport.
- Generated glTF from Meshy validates and converts to engine mesh without errors.

## Prior Art

- Meshy text-to-3D API (docs.meshy.ai) ✓ — async preview→refine workflow adopted as canonical model.
- Scenario (scenario.com) ✓ — custom-trained models for style consistency; rare in this space.
- FLUX (black-forest-labs/flux) ✓ — best open-weight T2I; local inference removes vendor lock.
- Kenney.nl ✓ — CC0 gold standard; 40k+ assets, no attribution required.
- OpenGameArt ✓ — breadth ✗ — license heterogeneity demands filtering.
- Poly Haven ✓ — CC0 PBR materials & HDRIs at production quality.
- ambientCG ✓ — CC0 PBR library, large coverage.
- Unity Asset Store ✗ — closed, vendor-extracting; anti-pattern. AI gen + CC0 libraries replace it.

## Open Questions

- [DECISION NEEDED] First-party music/SFX gen provider (Suno vs. Stable Audio vs. local AudioCraft)?
- [DECISION NEEDED] Voice gen provider — ElevenLabs (closed) vs. local Coqui/XTTS?
- [DECISION NEEDED] Should engine host an opt-in CDN of community-generated CC0 assets to share cache cost?
- [DECISION NEEDED] Auto-style-locking: when project declares style in `Nexus.toml`, should all gen requests inherit it implicitly? (`→ docs/specs/styles/overview.md`).
- [BENCHMARK NEEDED] End-to-end "prompt → in-game asset" wall time targets per provider on reference hardware.
