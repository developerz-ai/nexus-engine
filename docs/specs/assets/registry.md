<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Asset Registry

> Stable UUID addressing for every asset, a dependency DAG, reference-counted handles, and a file watcher driving hot reload — the single source of truth for "what assets exist, who refers to them, what their bytes hash to".

## Boundaries

- Owns: UUID generation/persistence, `(uuid → metadata, pack_path, source_path)` index, dependency DAG, reference counts, watcher, change diffing, hot-reload event broadcast.
- Does NOT own: load/decode (`→ streaming.md`), encoding (`→ compression.md`), GPU upload (`→ docs/contracts/renderer-assets.md`).
- Depends on: `→ overview.md` (pack header for hash/uuid), `→ docs/specs/core/hal.md` (fs watcher), `→ docs/specs/core/events.md` (event bus), `→ docs/specs/core/jobs.md` (re-import jobs).

## UUID Scheme

ULID (Crockford base32, time-ordered, 128-bit) chosen over UUIDv4: monotonic, sortable, embeddable in filenames without conflict.

```
01HZ8XQK3M2P0R5N7T9V1A4B6C       ← 26-char text form, used in TOML, scripts, agent API
[16 bytes]                        ← in .nxa header
```

- Assigned at first `import()`; persisted in `<src>.import.toml`.
- Never regenerated. Re-importing the same source preserves UUID.
- `nexus assets relocate <old> <new>` rewrites all references.

## Registry State

```
Registry {
  entries: HashMap<AssetUuid, Entry>
  deps_forward:  HashMap<AssetUuid, Vec<AssetUuid>>   // a → its deps
  deps_reverse:  HashMap<AssetUuid, Vec<AssetUuid>>   // a → its dependents
  by_source:     HashMap<PathBuf, AssetUuid>
  by_hash:       HashMap<[u8;32], AssetUuid>          // dedupe
  refcounts:     HashMap<AssetUuid, AtomicU32>
}

Entry {
  uuid:        AssetUuid
  kind:        AssetKind
  source_path: Option<PathBuf>   // None for AI-gen / library
  pack_path:   PathBuf           // .nxa location
  source_hash: [u8;32]           // blake3 of normalized source+opts
  pack_hash:   [u8;32]           // blake3 of .nxa bytes
  provenance:  ProvenanceRef     // → generation.md
  load_state:  LoadState         // NotLoaded|Loading|Loaded|Failed
  size_bytes:  u64
  tier:        Tier              // → streaming.md
}
```

Registry persists between sessions as `nexus/registry.bin` (rkyv-serialized for zero-copy load). Rebuildable from scanning `.nxa` headers in O(N).

## Lookup Path

```
                 by_source(path)
                       │
   AssetUuid ──────────┼────── by_hash(blake3)         (content addressing)
   (ULID)              │
                       ▼
                 entries[uuid]  ──── O(1) ──── Entry
                       │
                       ├──► pack_path  → streaming
                       ├──► deps_fwd[] → ensure loaded
                       └──► refcounts  → eviction policy
```

Lookup is O(1) hash. Iteration uses sorted UUID list (ULID time ordering = creation-order traversal).

## Dependency Graph

A `→ B` ⇔ A's bytes contain `B`'s UUID. Collected at import.

Examples:
- `scene.gltf` → meshes → materials → textures.
- `material.toml` → `albedo.png`, `normal.png`, shader UUID.
- `prefab.toml` → mesh UUID, animation set UUID.

Properties:
- DAG: cycles forbidden. Import-time detection; runtime `request` validates.
- Load order: dependencies guaranteed loaded before dependent's `is_ready()` returns true.
- Eviction: a dependency cannot be evicted while any dependent is `Loaded`.
- Hot reload: edit propagates up the reverse graph (B changed → all A consumers re-resolve).

## Handles

```rust
struct Handle<T: Asset> {
    uuid: AssetUuid,
    inner: Arc<HandleInner>,   // Strong; refcount on drop
}
struct UntypedHandle { uuid: AssetUuid, kind: AssetKind, inner: Arc<HandleInner> }
```

- `Handle<T>::Strong` increments refcount → asset pinned per its tier rules.
- `Handle::Weak` (UUID only) participates in equality but doesn't pin.
- Drop is fast: dec refcount, queue eviction candidacy if zero.

`Handle::Weak(uuid)` for stable references serialized in scenes/scripts. `Strong` for live runtime use. Pattern mirrors bevy_asset's `Handle::Strong` / `Handle::Uuid` split. `inspired by: bevy_asset`.

## Hot Reload

```
fs watcher ─┬─▶ debounce 200 ms ─▶ classify (source | import.toml | .nxa)
            │                              │
            │                              ▼
            │                       re-import via jobs ─▶ new .nxa
            │                              │
            │                              ▼
            │                  diff source_hash, pack_hash
            │                              │
            │                              ▼
            │                  if changed: registry.update(entry)
            │                              │
            │                              ▼
            │                  broadcast AssetEvent::Reloaded(uuid)
            │                              │
            │                              ▼
            │                  walk deps_reverse → notify dependents
            │
            ▼ (deleted)
        AssetEvent::Removed(uuid)
```

Subscribers (renderer, scripts, editor) implement an `on_reload(uuid)` hook. Reload is transactional: the new bytes are fully ready in the streaming tier before the old residency is dropped (no torn frames).

Hot reload defaults to ON in dev; OFF in `--ship`.

## Public API

```rust
// Identity & lookup
fn uuid_for(src: &Path) -> Option<AssetUuid>;
fn lookup(uuid: AssetUuid) -> Option<&Entry>;
fn lookup_by_hash(h: [u8;32]) -> Option<AssetUuid>;

// Handles
fn load<T:Asset>(uuid: AssetUuid) -> Handle<T>;                  // strong
fn load_weak<T:Asset>(uuid: AssetUuid) -> WeakHandle<T>;

// Dependency
fn dependencies(uuid: AssetUuid) -> &[AssetUuid];
fn dependents(uuid: AssetUuid) -> &[AssetUuid];
fn validate_dag() -> Result<(), Vec<CycleError>>;

// Watching
fn watch(uuid: AssetUuid, cb: impl Fn(AssetEvent) + Send + Sync) -> WatchHandle;
fn watch_glob(pat: &str, cb: impl Fn(AssetEvent) + Send + Sync) -> WatchHandle;

// Maintenance
fn scan(dir: &Path) -> ScanReport;       // rebuild from .nxa headers
fn gc() -> GcReport;                     // remove orphan .nxa files
fn relocate(old: &Path, new: &Path);     // file moved
```

### Events

```rust
enum AssetEvent {
    Added(AssetUuid),
    Reloaded(AssetUuid),
    Removed(AssetUuid),
    Failed(AssetUuid, AssetError),
    DepGraphChanged(AssetUuid),
}
```

Delivered through engine event bus (`→ docs/specs/core/events.md`). Ordering guarantees: dependencies' events fire before dependents'.

## Agent / Script Access

JSON-RPC (`→ docs/specs/agent/api.md`):
```
assets.list           { filter? } → [{uuid, kind, source?, size, deps[]}]
assets.lookup         { uuid }    → Entry
assets.dependents     { uuid }    → [uuid]
assets.subscribe      { glob }    → stream of AssetEvent
assets.reload         { uuid }    → ok | error          (force re-import)
```

Scripts (Lua / Rune): `assets.load("01HZ8X…")` returns a handle proxy.

## Persistence

`nexus/registry.bin` — versioned, rkyv-serialized snapshot. Loaded in `< 50 ms` for projects up to 100k entries. On corruption (magic mismatch), automatic rebuild from `.nxa` scan.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| `lookup(uuid)` | < 1 µs | 10 µs |
| `lookup_by_hash` | < 2 µs | 20 µs |
| `dependencies(uuid)` | O(deg), < 1 µs amortized | 10 µs |
| Handle clone/drop | < 50 ns | 500 ns |
| File-watcher event → reload broadcast | < 100 ms | 500 ms |
| Registry load from disk (100k entries) | 50 ms | 200 ms |
| Full rescan (10k `.nxa` files) | 1 s | 5 s |
| DAG cycle check (100k nodes) | 50 ms | 500 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_ASSET_NOT_FOUND` | Unknown UUID | Re-import or fix manifest |
| `E_DEP_CYCLE` | Cycle detected in DAG | Break (see `details.path[]`) |
| `E_DEP_MISSING` | Referenced UUID absent | Import missing dep or fix reference |
| `E_HASH_MISMATCH` | `.nxa` hash ≠ registry entry | Re-import; possible corruption |
| `E_REGISTRY_CORRUPT` | `registry.bin` unreadable | Auto-rebuild triggered |
| `E_RELOAD_TXN` | New bytes failed validation; old kept | Fix source; old still loaded |
| `W_ORPHAN_PACK` | `.nxa` without source or owner | GC candidate |

## Integration Points

- Streaming (`→ streaming.md`): consumes `pack_path` + `tier` from Entry.
- Renderer (`→ docs/contracts/renderer-assets.md`): receives `AssetEvent::Reloaded` to swap GPU resources atomically.
- Scripting (`→ docs/contracts/core-scripting.md`): handle proxies; reload events trigger script re-bind.
- Editor (`→ docs/specs/editor/assets.md`): browser is a registry view; drag-drop creates/relocates.
- Agent (`→ docs/specs/agent/api.md`): subscribes to events for live debugging.
- Networking (`→ docs/specs/networking/replication.md`): UUID + `pack_hash` exchanged for client/server asset parity check.

## Test Requirements

- 1M-entry registry: lookup latency holds < 10 µs p99.
- Hot-reload of leaf texture propagates to all dependent materials' shaders within 500 ms.
- Cycle insertion rejected at import; structured `E_DEP_CYCLE` with path.
- Registry survives crash mid-write (atomic rename); reload either succeeds or rebuilds.
- Move-and-rename of source file preserves UUID through `relocate`.
- Concurrent `load`/`unload` from 16 threads is race-free (handle refcount audited).
- Dedup: importing same bytes twice from different paths returns same UUID, single `.nxa`.

## Prior Art

- bevy_asset (`AssetServer`, `Handle<T>`, dependency tracking, watch_for_changes) ✓ — strongest direct influence on API shape. `inspired by: bevy_asset`. Improvements: ULIDs over generational indices for cross-process stability; explicit DAG storage; agent JSON-RPC.
- Unreal `FAssetRegistry` / `FSoftObjectPath` ✓ — registry + soft ref pattern.
- Unity Addressables ✓ — UUID + groups ✗ — async API too ceremonial; group budgets opaque.
- Godot `.import` + `res://` paths ✓ — import sidecar pattern.
- Git ✓ — content-addressable storage model; the `.nxa` hash subsystem mirrors it.

## Open Questions

- [DECISION NEEDED] ULID vs. UUIDv7 (both time-ordered; ULID has nicer text form; UUIDv7 standardized).
- [DECISION NEEDED] Whether to support cross-project UUID namespaces (mods importing engine assets) — yes, but need namespacing scheme.
- [DECISION NEEDED] Persist refcounts? (probably not — they're transient runtime state.)
- [DECISION NEEDED] How aggressive should GC be for AI-gen cache entries that haven't been loaded in N days?
- [BENCHMARK NEEDED] Registry boot time at 1M entries on Steam Deck / mid-tier mobile.
