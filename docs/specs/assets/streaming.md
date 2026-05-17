<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Asset Streaming

> Async, priority-ordered loader with hard memory budgets per tier. Game thread never blocks on I/O; renderer never sees an unready asset upload.

## Boundaries

- Owns: stream scheduler, priority queue, residency tiers, memory budget accounting, LRU eviction, mip / LOD / meshlet page streaming, decoded-pool lifetime.
- Does NOT own: file/network I/O primitives (`→ docs/specs/core/hal.md`), GPU upload queue (`→ docs/contracts/renderer-assets.md`), audio decoded ring buffer (`→ docs/specs/audio/streaming.md`).
- Depends on: `→ registry.md` (UUID → `.nxa` location + dep graph), `→ overview.md` (pack TOC), `→ docs/specs/core/jobs.md` (decode jobs), `→ docs/specs/core/memory.md` (budget arenas).

## Architecture

```
           request (uuid, prio, kind, deps_required) ─┐
                                                      ▼
                       ┌──────────────────────────────────┐
                       │      PRIORITY QUEUE (per tier)   │
                       │   Resident > Streamed > Prefetch │
                       │   keyed (urgency, distance, tie) │
                       └────────────────┬─────────────────┘
                                        ▼
                       ┌──────────────────────────────────┐
                       │       FETCH WORKERS (N)          │
                       │  open .nxa, read pages, zstd     │
                       └────────────────┬─────────────────┘
                                        ▼
                       ┌──────────────────────────────────┐
                       │     DECODE JOBS (job graph)      │
                       │  per kind: tex / mesh / audio    │
                       └────────────────┬─────────────────┘
                                        ▼
                       ┌──────────────────────────────────┐
                       │     UPLOAD QUEUE (renderer)      │
                       │  GPU staging ring, frame-coalesced│
                       └────────────────┬─────────────────┘
                                        ▼
                              residency table updated
                                        │
                budget pressure ────────┴──── LRU evictor
```

## Residency Tiers

| Tier | Lifetime | Budget default | Eviction |
|---|---|---|---|
| `Resident` | Pinned until `unload()` | UI, hero meshes, splash. | Never (error if budget exceeded). |
| `Streamed` | Lives while referenced or in working set | Most world geometry/textures. | LRU below threshold. |
| `Prefetch` | Speculative on agent / camera hint | Predictive. | LRU first to evict. |
| `Transient` | Single-frame use | VFX bake, generated noise. | End-of-frame. |

Each tier has an independent memory budget per platform. Tiers cannot borrow from each other (prevents heap-fragmentation cascade).

Per-platform defaults (overridable in `Nexus.toml`):

| Platform | Resident | Streamed (tex) | Streamed (mesh) | Prefetch |
|---|---|---|---|---|
| Desktop high-end | 512 MB | 2 GB | 1 GB | 512 MB |
| Desktop low | 256 MB | 768 MB | 384 MB | 128 MB |
| Mobile high | 128 MB | 384 MB | 192 MB | 64 MB |
| Mobile low | 64 MB | 192 MB | 96 MB | 0 |
| Web (WASM) | 64 MB | 256 MB | 128 MB | 0 |

[BENCHMARK NEEDED] Tune defaults per device class via telemetry from demo games.

## Priority Computation

```
priority = w_urgency · U + w_distance · (1 / max(d, ε)) + w_screen · S + w_user
```
- `U` = `Critical(1.0) | Visible(0.8) | NearCamera(0.6) | Likely(0.3) | Speculative(0.1)`
- `d` = world-space distance (meters); ignored for non-spatial assets.
- `S` = projected screen coverage (Nanite-style, `→ lod.md`).
- `w_user` = explicit boost via `Handle::set_priority`.

Ties broken by insertion order (FIFO stable). Re-prioritization happens up to once/frame per pending request.

## Page-Granular Streaming

Large assets stream by region (not all-or-nothing):
- **Textures**: stream individual mips. Highest needed mip resolves first; lower mips upgrade in background. `Streamed` tier requires mip 0 only when within `S ≥ 0.5` of full coverage.
- **Meshes**: stream LOD levels and (with virtual geometry) individual meshlet pages. `→ lod.md`.
- **Audio**: stream packets in 200 ms chunks past prefetch head. `→ docs/specs/audio/streaming.md`.
- **Anim**: stream per-clip; bake-on-load for short clips < 50 KB.

## Public API

```rust
fn request<T:Asset>(uuid: AssetUuid, prio: Priority) -> Handle<T>;
fn set_priority(h: &Handle<impl Asset>, prio: Priority);
fn unload(h: Handle<impl Asset>);             // drops ref; LRU may evict
fn budget(tier: Tier) -> BudgetStats;          // {used, cap, pending}
fn set_budget(tier: Tier, bytes: u64);
fn flush_to_ready(uuid: AssetUuid) -> Result<(),LoadError>; // blocking; CI/agent use
```

`Handle<T>` is reference-counted; drop → eviction candidate. `Handle::is_ready()` non-blocking.

## Eviction Policy

- LRU within tier; touched on each `peek/use`.
- Resident never evicts; instead `request` returns `E_BUDGET_EXCEEDED` if no room and no candidates.
- Streaming overshoot allowed for **one frame** to absorb spikes; if not resolved by end-of-frame, evictor force-frees lowest-priority entries.
- Eviction emits telemetry: `{ "stage":"evict","uuid":..., "tier":..., "reason":"lru|pressure|explicit", "bytes":... }`.

## Headless / Deterministic Mode

Agent SDK (`→ docs/specs/agent/headless.md`) needs determinism:
- `--deterministic` flag: scheduler picks tasks in stable order regardless of fetch latency; uses `flush_to_ready` semantics implicitly.
- Replay snapshots include residency set + budgets so a replay starts in same state. `→ docs/specs/agent/replay.md`.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Frame stall from streaming | 0 ms | 0 ms (assets in-flight render placeholder) |
| Latency: request → ready (small, cached) | 2 ms | 16 ms |
| Latency: request → ready (cold disk, 1MB BCn) | 8 ms | 50 ms |
| Latency: request → ready (cold disk, 10MB mesh) | 25 ms | 150 ms |
| Eviction overhead per frame | < 0.1 ms | 0.5 ms |
| Decoder throughput (Zstd) | ≥ 2 GB/s aggregate | platform-dependent |
| Decoder throughput (meshopt vertex) | ≥ 3 GB/s | per zeux's reported 3–6 GB/s on desktop |
| Worker count default | min(physical_cores − 2, 6) | configurable |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_BUDGET_EXCEEDED` | Tier full, no LRU candidate | Raise budget, unload, change tier |
| `E_STREAM_TIMEOUT` | Request exceeded `timeout_ms` | Lower priority or check disk/net |
| `E_DECODE_FAIL` | Bad page checksum or codec error | Re-import source |
| `E_NOT_RESIDENT` | Blocking peek on non-resident asset in `--strict` mode | Await ready |
| `W_PLACEHOLDER_USED` | Frame rendered with fallback (pink/checker) | None (logged) |

## Integration Points

- Renderer: streams driven by frustum/screen-coverage hints from render graph (`→ docs/contracts/renderer-assets.md`).
- Networking: server may push asset prefetch hints to clients ahead of zone load (`→ docs/specs/networking/replication.md`).
- Agent: `assets.subscribe_stream` telemetry stream for live monitoring (`→ docs/specs/agent/telemetry.md`).
- Editor: live "Streaming" panel showing budget usage (`→ docs/specs/editor/debug.md`).
- Scripting: handles passed across FFI; ref counts respected (`→ docs/contracts/core-scripting.md`).

## Test Requirements

- Load 10× budget worth of assets sequentially: zero frame stalls, eviction LRU correct.
- 1000-concurrent-request stress: queue stable, no starvation of `Critical` priority.
- Hot-reload of a streamed mip 0 succeeds without rendering corruption.
- `--deterministic` mode: identical load order across 10 runs.
- Mid-load `unload` cancels in-flight decode within 1 frame.

## Prior Art

- bevy_asset (async load + handles) ✓ — direct inspiration for handle/priority API. `inspired by: bevy_asset`.
- Unreal Streamable Manager ✓ — pool + priority model.
- Unity Addressables ✓ — group budgets ✗ — overly ceremonial async API.
- id Tech MegaTexture / Trilinear cache ✓ — page-granular streaming approach.
- UE5 Nanite streaming (Karis SIGGRAPH 2021) ✓ — screen-coverage priority + cluster paging directly inspires mesh path. `→ lod.md`.

## Open Questions

- [DECISION NEEDED] HTTP/3 streaming for web (WASM) — partial range over fetch() vs. custom CDN format.
- [DECISION NEEDED] Should `Transient` tier auto-recycle decoded buffers across frames via slab allocator?
- [BENCHMARK NEEDED] Worker thread count optimal on Steam Deck, M-series Mac, mid-tier Android.
