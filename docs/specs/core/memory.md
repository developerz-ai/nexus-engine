<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Core / Memory

> Deterministic, budget-enforced allocators. Every byte is owned by a named system; OOM is an error code, never a panic.

## Boundaries

- **Owns**
  - System allocator wrapper (`SysAlloc`) — global `#[global_allocator]` providing accounting and per-system budgets.
  - Arena (`Arena` / bump) — single-frame and scoped scratch allocations.
  - Pool (`PoolAllocator<T>`) — fixed-size block recycling for hot, uniform-size objects (ECS table rows, particles, job nodes).
  - TLSF (`TlsfHeap`) — general-purpose, O(1) worst-case alloc/free with low fragmentation; backing for asset streaming and scripting VMs.
  - Slab (`SlabAllocator`) — page-backed, growable, free-list-of-blocks; used inside TLSF and for archetype storage.
  - Region accounting: `MemBudget`, `MemTag`, telemetry per tag.
  - Aligned allocation, `Box::new_in`-style typed constructors.
- **Does NOT own**
  - GPU memory → `docs/specs/renderer/backend.md` (wgpu owns the GPU heap; we expose a CPU-staging arena only).
  - Asset bytes on disk → `docs/specs/assets/streaming.md` (streaming uses our `TlsfHeap` as backing, but I/O is theirs).
  - String interning → lives in `core::events` and ECS registry (uses our allocators, does not extend them).
  - Garbage collection — no GC anywhere in Nexus engine code. Scripting VMs (Lua/Rune) bring their own and run inside a `TlsfHeap` sub-region.
- **Depends on**
  - `core::hal` for page-granular OS allocation (`mmap`/`VirtualAlloc`/`mach_vm_allocate`) and for thread-local storage primitives.
  - `core::jobs` for per-thread arena reset hooks (each worker thread gets its own `Arena`).

## Architecture

```
   OS pages (4 KiB / 16 KiB / 2 MiB hugepages where supported)
        │
        ▼
   ┌──────────────────────────────────────────────┐
   │  SlabAllocator   (page-backed, free-list)    │
   └──────┬───────────────────────────────┬───────┘
          │                               │
          ▼                               ▼
   ┌────────────────┐            ┌──────────────────┐
   │ TlsfHeap       │            │ PoolAllocator<T> │
   │ (general,O(1)) │            │ (fixed-size)     │
   └────┬───────────┘            └────────┬─────────┘
        │                                 │
        ▼                                 ▼
   ┌────────────────┐            ┌──────────────────┐
   │ Arena (bump)   │            │ ECS tables, jobs │
   │ (frame-scoped) │            │ particles, audio │
   └────────────────┘            └──────────────────┘

   ┌─────────────────────────────────────────────┐
   │ MemRegistry  (every allocator registers)    │
   │   tag → { capacity, in_use, peak, alloc#}   │
   │   enforced budget via SysAlloc hook         │
   └─────────────────────────────────────────────┘
```

**Allocator selection guide.**

| Use case | Allocator |
|---|---|
| Per-frame scratch (command buffers, log batches) | `Arena` (reset at frame end) |
| Per-system scratch within a job | thread-local `Arena` (reset at job join) |
| Uniform-size, high-churn (ECS rows, particles, RPC msgs) | `PoolAllocator<T>` |
| Variable-size, long-lived (assets, scene graph, scripting heap) | `TlsfHeap` |
| Single huge buffer (texture upload, mesh upload) | `SlabAllocator` directly |
| Anything else (rare) | `SysAlloc` (global) — must carry a `MemTag` |

**TLSF rationale.** Two-Level Segregated Fit (Masmano et al., 2004; updated 2008) provides O(1) worst-case `alloc`/`free`, < 15 % fragmentation in measured workloads, deterministic latency. Required by the AI-first mandate (no unbounded GC pauses, no jemalloc heuristics). Inspired by `mattconte/tlsf` reference implementation; we reimplement in safe Rust over a `SlabAllocator` backing.

**Per-system budgets.** Every Nexus subsystem (renderer, physics, audio, scripting, assets…) declares its budget in `Nexus.toml`. `MemRegistry` enforces hard caps:

```toml
[memory.budget]
ecs       = "256 MiB"
renderer  = "1 GiB"   # CPU side; GPU has its own budget
physics   = "128 MiB"
audio     = "64 MiB"
scripting = "128 MiB"
assets    = "2 GiB"
agent     = "32 MiB"
scratch   = "64 MiB"  # frame arena per thread
```

Exceeding budget returns `ErrMem::BudgetExceeded`. Subsystems handle gracefully (evict cache, refuse spawn, downgrade LOD). Never panics. The agent API streams `MemTelemetry` so AI agents can see budget pressure and react.

**Determinism.** All allocators reproduce identical pointer offsets (relative to their region base) given the same allocation sequence. ASLR is disabled inside our sub-regions because pointers are stored as `(region_id: u16, offset: u32)` 6-byte handles for snapshotting (cross-ref `docs/specs/agent/replay.md`).

**No `unsafe` without justification.** Each `unsafe` block in `core::memory` carries an inline `// SAFETY:` comment and a corresponding miri test. Per principle 6 (`docs/architecture/01-principles.md`).

## Public API

```rust
// === Tags & Budgets ===
#[derive(Copy, Clone, Eq, PartialEq, Hash)]
pub struct MemTag(pub &'static str);

pub struct MemBudget {
    pub tag: MemTag,
    pub limit_bytes: u64,
    pub on_exceed: BudgetPolicy,
}
pub enum BudgetPolicy { Reject, Evict(EvictHookId), Downgrade(DowngradeHookId) }

pub struct MemStats {
    pub tag: MemTag,
    pub in_use: u64,
    pub peak: u64,
    pub limit: u64,
    pub alloc_count: u64,
    pub free_count: u64,
    pub fragmentation_ratio: f32,   // 0.0 = perfect, 1.0 = unusable
}

// === Registry ===
pub struct MemRegistry { /* private */ }
impl MemRegistry {
    pub fn register(&self, b: MemBudget) -> Result<(), ErrMem>;
    pub fn stats(&self, tag: MemTag) -> Option<MemStats>;
    pub fn snapshot(&self) -> Vec<MemStats>;            // → telemetry
    pub fn set_limit(&self, tag: MemTag, limit: u64) -> Result<(), ErrMem>;
}
pub fn registry() -> &'static MemRegistry;

// === Arena ===
pub struct Arena { /* private */ }
impl Arena {
    pub fn with_capacity(tag: MemTag, bytes: usize) -> Result<Self, ErrMem>;
    pub fn alloc<T>(&self, value: T) -> Result<&mut T, ErrMem>;
    pub fn alloc_slice<T: Copy>(&self, len: usize) -> Result<&mut [T], ErrMem>;
    pub fn alloc_bytes(&self, len: usize, align: usize) -> Result<&mut [u8], ErrMem>;
    pub fn reset(&mut self);                            // drops nothing; user-types must be Drop-free
    pub fn used(&self) -> usize;
    pub fn capacity(&self) -> usize;
}

// === Pool ===
pub struct PoolAllocator<T> { /* private */ }
impl<T> PoolAllocator<T> {
    pub fn with_capacity(tag: MemTag, slots: usize) -> Result<Self, ErrMem>;
    pub fn alloc(&self) -> Result<PoolBox<T>, ErrMem>;  // returned via Drop
    pub fn in_use(&self) -> usize;
    pub fn capacity(&self) -> usize;
}
pub struct PoolBox<T> { /* private; Deref + DerefMut */ }

// === TLSF ===
pub struct TlsfHeap { /* private */ }
impl TlsfHeap {
    pub fn with_capacity(tag: MemTag, bytes: usize) -> Result<Self, ErrMem>;
    pub fn alloc(&self, layout: Layout) -> Result<NonNull<u8>, ErrMem>;
    pub unsafe fn free(&self, ptr: NonNull<u8>, layout: Layout);
    pub fn stats(&self) -> MemStats;
    pub fn defragment_hint(&self) -> f32;               // [0,1] urgency
}

// === Slab (lower level) ===
pub struct SlabAllocator { /* private */ }
impl SlabAllocator {
    pub fn new(tag: MemTag, page_bytes: usize) -> Result<Self, ErrMem>;
    pub fn alloc_pages(&self, n: usize) -> Result<NonNull<u8>, ErrMem>;
    pub unsafe fn free_pages(&self, ptr: NonNull<u8>, n: usize);
}

// === Global ===
pub struct SysAlloc;
unsafe impl GlobalAlloc for SysAlloc { /* … */ }
// Carries an implicit MemTag("untagged") for any allocation that does not go
// through a typed allocator. Untagged allocations are visible in telemetry as
// `MemTag("untagged")` — non-zero values flag missed accounting.

// === Handles for snapshot ===
pub struct RegionHandle(pub u16, pub u32);          // (region_id, offset)
```

## Performance Contract

| Operation | Target | Hard limit |
|---|---|---|
| `Arena::alloc<T>` (no overflow) | ≤ 4 ns | 15 ns |
| `Arena::reset` | ≤ 50 ns (any size) | 200 ns |
| `PoolAllocator::alloc` | ≤ 10 ns | 30 ns |
| `PoolBox::drop` (return slot) | ≤ 10 ns | 30 ns |
| `TlsfHeap::alloc` (avg 64 B) | ≤ 35 ns | 120 ns |
| `TlsfHeap::alloc` (avg 4 KiB) | ≤ 80 ns | 250 ns |
| `TlsfHeap::free` | ≤ 40 ns | 150 ns |
| `SlabAllocator::alloc_pages(1)` | ≤ 2 µs (warm) | 50 µs (cold mmap) |
| Fragmentation after 24 h stress | ≤ 12 % | 25 % |
| Budget check (`SysAlloc::alloc` hook) | ≤ 6 ns | 20 ns |
| Telemetry snapshot (`MemRegistry::snapshot`) | ≤ 2 µs / 64 tags | 10 µs |
| Determinism: 2 runs same alloc seq | bit-identical region offsets | n/a |

All `[BENCHMARK NEEDED]` — TLSF and pool numbers from Masmano et al. and `mattconte/tlsf` published figures, must re-validate on reference rig.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `MEM.E001` | Out of memory (allocator backing exhausted) | Caller must release; consider `defragment_hint()` |
| `MEM.E002` | Budget exceeded (tag at `limit_bytes`) | Caller must evict / downgrade per `BudgetPolicy`; agents should reduce scope |
| `MEM.E003` | Bad alignment (requested `align` not power of 2 or > 4 KiB) | Fix caller; align must be ∈ {1,2,4,8,16,…,4096} |
| `MEM.E004` | Bad size (zero or > `i32::MAX` for arenas) | Caller bug; sanity-check input |
| `MEM.E005` | Double free (TLSF / Pool detected) | Caller bug; reproducer to bug tracker; debug-only panic |
| `MEM.E006` | Use-after-reset (`Arena::reset` while live refs exist) | Compile-time prevented for typed `alloc`; runtime check for `alloc_bytes` |
| `MEM.E007` | Tag not registered (`SysAlloc` saw alloc with unknown tag) | Register via `MemRegistry::register` at startup |
| `MEM.E008` | Region full for snapshot (offset > 2^32) | Split into multiple regions; raise budget |
| `MEM.E009` | OS allocation failed (`mmap`/`VirtualAlloc` returned error) | Surface OS errno via `ErrMem::os_errno`; cannot retry meaningfully |
| `MEM.E010` | Defragmentation requested but live handles outstanding | Defrag is offline only in v1.0; release handles first |

All errors structured JSON with `code`, `tag`, `bytes_requested`, `bytes_available`, `suggested_fix`.

## Integration Points

- **`core::hal`** — page allocation primitive (`hal::os::map_pages` / `unmap_pages`). The only place `core::memory` calls into the OS. → `docs/specs/core/hal.md`
- **`core::jobs`** — every worker thread has a TLS `Arena` registered with `MemTag("scratch.thread-N")`. Job system resets it at job-graph completion. → `docs/specs/core/jobs.md`
- **`core::ecs`** — `World` owns one `PoolAllocator` per archetype row size class; one frame `Arena` for `CommandQueue`. → `docs/specs/core/ecs.md`
- **`renderer`** — receives staging `SlabAllocator` for upload buffers; CPU-side material/mesh metadata lives in a `TlsfHeap` tagged `renderer`. GPU heap is NOT ours. → `docs/contracts/core-renderer.md`
- **`assets`** — streaming subsystem requests `TlsfHeap` with `assets` budget; honors `MEM.E002` by evicting LRU assets. → `docs/specs/assets/streaming.md`
- **`scripting`** — Lua/Rune VMs receive a sub-`TlsfHeap` as their entire heap; OOM inside script returns `MEM.E002` to script as a recoverable error. → `docs/specs/scripting/sandbox.md`
- **`agent`** — `MemStats` streamed every frame via telemetry bus. Agents can subscribe to budget-exceeded events. → `docs/specs/agent/telemetry.md`
- **`networking`** — rollback netcode uses dedicated `PoolAllocator<StateFrame>` sized to history length. → `docs/specs/networking/rollback.md`

## Test Requirements

1. `arena_alloc_returns_aligned_pointer` — alignment of returned ref matches `align_of::<T>()` for primitives and structs of all alignments ≤ 64.
2. `arena_reset_reuses_full_capacity` — after reset, can alloc `capacity` bytes again.
3. `pool_alloc_free_cycle_stable_pointers` — alloc, free, alloc returns the same slot (LIFO).
4. `tlsf_no_fragmentation_in_steady_state` — 24 h synthetic workload keeps fragmentation < 25 %.
5. `tlsf_o1_worst_case` — alloc latency p99.99 across 10 M ops < 250 ns.
6. `budget_enforced` — allocating past budget returns `MEM.E002`; in-use never exceeds limit by more than one page.
7. `eviction_hook_runs` — `BudgetPolicy::Evict` invokes hook and retries alloc.
8. `untagged_allocations_visible` — any allocation via `SysAlloc` without explicit tag appears under `MemTag("untagged")`.
9. `determinism_pointer_offsets` — two identical alloc sequences produce identical `RegionHandle` offsets.
10. `oom_does_not_panic` — exhausting an arena/tlsf/pool returns `MEM.E001`; no panic in release build (verified via panic-runtime test).
11. `miri_clean` — all `unsafe` blocks pass miri on linux-x86_64 and macos-aarch64.
12. `loom_concurrency` — `loom` model test on `PoolAllocator` and `TlsfHeap` with 8 simulated threads: no deadlock, no data race, no use-after-free.
13. `huge_page_path` — on linux with `THP=madvise`, `SlabAllocator` with 2 MiB pages succeeds and reports correct backing.
14. `snapshot_serializable` — `MemRegistry::snapshot()` serializes to deterministic JSON; replay restores byte-identical layout.
15. `cross_thread_arena_unsoundness_rejected` — sending `&mut Arena` across threads fails to compile (`!Sync` on the bump cursor).
16. `pool_drop_returns_slot_even_on_panic` — `PoolBox` drop guard returns slot under panic-unwind.

## Prior Art

- **TLSF paper** — Masmano, Ripoll, Crespo (2004), "TLSF: A New Dynamic Memory Allocator for Real-Time Systems"; Masmano et al. (2008) updated bitmap scheme. We implement v2 (per-class bitmaps).
  - ✓ O(1) worst case, deterministic, low fragmentation.
  - ✗ Reference impl is C with raw pointers; we reimplement in safe Rust over `SlabAllocator`.
- **`mattconte/tlsf`** (GitHub reference C impl) — algorithmic source of truth; our impl must match its placement policy on the standard fragmentation benchmark suite.
- **Jason Gregory, *Game Engine Architecture* (3rd ed.), ch. 5** — single-frame arena, stack allocator, pool allocator patterns. Direct lineage for our `Arena` and `PoolAllocator`.
  - ✓ Per-system budgets, double-buffered scratch (cross-frame ref into prev frame's arena).
- **Our Machinery memory blog series** (Niklas Gray) — informed the "every byte tagged" stance and the choice to make budgets a hard contract.
  - ✓ Tagging discipline; `[DECISION NEEDED]` on whether to adopt their `mem_alloc()`-takes-tag-as-parameter ergonomics or rely on per-allocator tag binding.
- **`bumpalo`** crate — design reference for `Arena` ergonomics. We do not depend on it (need our own tag/budget integration) but the `alloc<T>(t)` returning `&mut T` shape is copied.
- **mimalloc / jemalloc** — explicitly NOT used as global allocator. Their heuristics are tuned for server workloads (long-tail allocs), produce nondeterministic offsets, and have unbounded background work. We use a stripped global allocator that delegates to `TlsfHeap`s with tags.
- **Bevy** has no first-class allocator story; we treat that as a wart to fix.

## Open Questions

1. `[DECISION NEEDED]` — Should `SysAlloc` reject untagged allocations entirely in release builds (forcing tag discipline) or merely report them via telemetry? Strict mode breaks crates we don't control (serde, hashbrown internals). Likely: release = report, debug = warn-loud.
2. `[DECISION NEEDED]` — Defragmentation strategy for `TlsfHeap`: online compaction (requires handle indirection on every alloc, slow) vs. offline only (requires asset reload). v1.0 offline; v2.0 reconsider.
3. `[DECISION NEEDED]` — Hugepage default: opt-in per region or auto when region ≥ 16 MiB? Auto wastes RSS on small workloads.
4. `[DECISION NEEDED]` — Should `RegionHandle` (6 bytes) replace raw pointers in *all* engine internals (allowing region relocation), or only in snapshot/replay paths? Full conversion costs perf; partial may leak raw pointers into snapshots.
5. `[BENCHMARK NEEDED]` — All performance numbers, especially TLSF on realistic asset-streaming workload.
6. `[DECISION NEEDED]` — Cross-tag transfer ("loan 16 MiB from `assets` to `physics` for one frame"): supported API or forbidden? Affects scripting and modding budgets. `[AGENT: 08]` scripting needs.
7. `[DECISION NEEDED]` — On 32-bit targets (Android armv7, some consoles) the `RegionHandle(u16, u32)` cap of 4 GiB per region is fine but total `u16` region count (65 536) may be tight for asset systems. Bump to `(u24, u40)` 8-byte handle? `[AGENT: 09]` assets to weigh in.
