<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Scene Graph & Inspector

> Visual editing of the ECS world: hierarchical scene tree, typed component inspector, viewport gizmos, drag-drop wiring. Every edit is an `EditorCommand` (undoable) and an agent RPC.

## RPC parity

Every gizmo manipulation, every drag-drop, every inspector field edit emits the same JSON-RPC call an agent would issue. Tree row context menu → `scene.entity.*` RPC. Transform gizmo → `entity.transform.*` RPC. Inspector patch → `entity.update` / `scene.component.patch`. The editor never holds the truth; the engine does, via RPC. Enforced by `docs/specs/editor/rpc-parity.md` and Law 13 (→ `docs/architecture/01-principles.md#law-13`). MCP exposes the same surface (→ `docs/specs/agent/mcp-server.md`).

## Boundaries

- Owns: scene tree dock, inspector dock, viewport gizmos, transform handles, selection model, drag-drop targets, prefab UI affordances.
- Does NOT own: the actual ECS world (lives in engine, edited via RPC → `docs/specs/agent/api.md`), prefab serialization format (→ `docs/specs/assets/import.md`), physics gizmo math (→ `docs/contracts/physics-renderer.md`).
- Depends on: `docs/specs/editor/overview.md`, `docs/specs/core/ecs.md`, `docs/specs/agent/api.md`, `docs/specs/assets/registry.md`.

## Architecture

```
┌──────────────────┐    ┌──────────────────────────┐    ┌─────────────────┐
│   Scene Tree     │    │       Viewport           │    │   Inspector     │
│   Dock           │    │  (wgpu surface)          │    │   Dock          │
│                  │    │                          │    │                 │
│ ▾ World          │    │   ┌─────────────────┐    │    │ Transform       │
│   ▾ Level_01     │◄──►│   │  gizmos         │◄──►│◄──►│  pos  [0 0 0]   │
│     ▸ Lighting   │ sel│   │  selection rect │ sel│  sel│  rot  [0 0 0]   │
│     ▾ Enemies    │    │   │  grid · ruler   │    │    │ Mesh.Renderer   │
│       • Goblin_3 │    │   └─────────────────┘    │    │  asset: orc.gltf│
│       • Goblin_4 │    │                          │    │ RigidBody       │
│ ▸ UI             │    │                          │    │  mass: 80.0     │
└──────────────────┘    └──────────────────────────┘    └─────────────────┘
        │                          │                            │
        └──────────────┬───────────┴─────────────┬──────────────┘
                       ▼                         ▼
                  Selection model           EditorCommand
                  (entity IDs +              (RPC call +
                   component paths)          undo entry)
                       │
                       ▼
                  agent RPC client → engine ECS  → docs/specs/agent/api.md
```

The scene tree is a thin projection of the engine's ECS hierarchy. The editor never holds the truth; it requests it.

## Scene tree dock

- Backed by RPC subscription `scene.subscribe { root: <entity>, depth: u32 }` → engine streams diffs.
- Virtual scroll: tested up to 1M entities flat, 100k with full hierarchy expansion.
- Node icons inferred from dominant component (`Mesh3d` → cube, `Camera` → camera, `Light` → bulb, `RigidBody` → cog). Custom icons registerable.
- Multi-select: `Ctrl+click`, `Shift+click`, marquee in viewport.
- Filter bar: fuzzy name, archetype tag, "has component X", "has script Y", "broken refs only".
- Color-coding: red = error (missing asset, broken script), yellow = warning (perf budget), gray = disabled.
- Right-click context menu — every item is an `EditorCommand`:

| Action | Command id |
|---|---|
| Add child | `scene.entity.spawn` |
| Rename | `scene.entity.rename` |
| Duplicate | `scene.entity.duplicate` |
| Delete | `scene.entity.despawn` |
| Reparent (drag) | `scene.entity.reparent` |
| Save as prefab | `scene.prefab.create` |
| Instantiate prefab | `scene.prefab.instantiate` |
| Toggle visibility | `scene.entity.toggle_visible` |
| Toggle enabled | `scene.entity.toggle_enabled` |
| Pin to selection set | `scene.selection.pin` |

## Inspector dock

- Reflects selected entities' components via reflection metadata from `docs/specs/core/ecs.md`.
- Multi-edit: when N entities selected with shared components, edits broadcast to all; conflicting values shown as `<mixed>`.
- Component header row: drag-handle (reorder), enable toggle, copy-as-JSON, paste-as-JSON, remove.
- `+ Add Component` opens a typed picker (fuzzy search across all registered component types).
- Field widgets registered per `TypeId`:

| Rust type | Widget | Notes |
|---|---|---|
| `f32` / `f64` | drag-spinner + slider when `#[range]` | hold Shift = fine |
| `Vec2/3/4` | grouped spinners + drag pad | swizzle menu |
| `Quat` | euler-degrees view + quat raw view toggle | gimbal warning |
| `bool` | checkbox | |
| `String` | line edit | autocomplete from asset registry if `#[asset]` |
| `enum` | dropdown | |
| `Vec<T>` | collapsible list with add/remove/reorder | |
| `HashMap<K,V>` | key-value table | |
| `AssetId` | drag-drop slot + thumbnail | accepts from asset browser |
| `Entity` | entity-picker + viewport eyedropper | |
| `Color` | swatch + HSV/RGB/Hex tabs | |
| `Curve` | curve editor (cubic bezier) | |
| `Gradient` | gradient editor | |
| custom | user `InspectorWidget` impl | → plugin API |

Field changes batched per frame; one `scene.component.patch` RPC per frame per entity, JSON-patch (RFC 6902) payload. → undoable as one entry.

## Viewport & gizmos

```
        translate gizmo            rotate gizmo             scale gizmo
        ────────────────           ───────────────          ─────────────
              Y▲                       ⟲ Y                       ▢ Y
              │                       /                          │
              │                      /                           │
              ●───────►X            ●───── ⟲ X                  ●─────▢X
             ╱                       \                         ╱
            ╱                         \                       ╱
           ▼Z                          ⟲ Z                  ▢ Z
```

- Active tool: `Q` select, `W` translate, `E` rotate, `R` scale, `T` universal (combined).
- Snap: hold `Ctrl` snap-to-grid; settings in toolbar.
- Local vs world space toggle (`X`).
- Multi-select: gizmo at selection centroid; per-pivot mode (`P`) operates on each individually.
- Camera controls: middle-mouse orbit, right-mouse fly (WASD + QE), `F` frame selected, `Numpad 1/3/7` ortho axes (Blender parity).
- 2D mode: gizmos flatten, grid becomes pixel ruler; → `docs/specs/styles/2d.md`.
- Custom gizmos registerable per component (e.g. `Light` shows cone, `CollisionShape` shows wireframe — sourced via `docs/contracts/physics-renderer.md`).

## Drag-drop matrix

| From | To | Action |
|---|---|---|
| Asset browser → viewport | spawn entity at hit point with default components for asset type |
| Asset browser → inspector slot | set `AssetId` reference |
| Asset browser → scene tree node | attach as child or replace mesh ref (Shift = replace) |
| Scene tree → scene tree (other parent) | reparent (preserves world transform unless `Alt` held) |
| Scene tree → viewport | jump camera, frame |
| Scene tree → inspector entity slot | bind entity reference |
| External OS file → asset browser | import via `docs/specs/assets/import.md` |
| External OS file → viewport | import + spawn in one step |
| Component header (drag handle) → other component header | reorder |
| Component header → other entity row | copy component to that entity |

All drops go through `scene.dragdrop.resolve` RPC for validation.

## Prefabs

- A prefab = a sub-tree saved as a `.nxprefab` asset (`docs/specs/assets/import.md`).
- Instances are linked by default — edits to source propagate; per-instance overrides recorded as a JSON-patch delta on the instance entity (`PrefabOverride` component).
- Editor visualizes overrides with a blue dot next to overridden fields and a "revert" affordance.
- `Unpack` action breaks the link, baking the current state.

## Selection model

```rust
pub struct Selection {
    primary: Option<Entity>,       // last clicked, drives inspector focus
    set: HashSet<Entity>,          // full selection
    component_path: Option<String>,// e.g. "RigidBody.mass" for deep-link
    sets: HashMap<String, HashSet<Entity>>, // named "pinned" sets
}
```

Selection is editor-local but mirrored to engine via `scene.selection.set` so debug overlays (`debug.md`) and agents can read it.

## Public API (commands)

```rust
pub struct SpawnEntity { pub parent: Option<Entity>, pub components: Vec<ComponentJson> }
pub struct DespawnEntity { pub entity: Entity, pub cascade: bool }
pub struct Reparent { pub entity: Entity, pub new_parent: Option<Entity>, pub keep_world: bool }
pub struct PatchComponent { pub entity: Entity, pub patch: serde_json::Value }
pub struct AddComponent { pub entity: Entity, pub component: ComponentJson }
pub struct RemoveComponent { pub entity: Entity, pub type_id: ComponentTypeId }
pub struct CreatePrefab { pub root: Entity, pub path: AssetPath }
pub struct InstantiatePrefab { pub asset: AssetId, pub parent: Option<Entity>, pub transform: Transform }
```

All implement `EditorCommand` and map 1:1 to `scene.*` RPC methods in `docs/specs/agent/api.md`.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Tree paint, 10k visible nodes | < 4 ms | 16 ms |
| Inspector paint, 50 fields | < 2 ms | 8 ms |
| Gizmo drag, 60 fps maintained @ 1M scene entities | yes | yes |
| `scene.component.patch` RPC roundtrip | < 500 µs (UDS) | 4 ms |
| Marquee select, 1M entities | < 100 ms | 500 ms |
| Drag-drop spawn-from-asset | < 50 ms | 200 ms |
| Prefab instantiate (1k node subtree) | < 30 ms | 150 ms |

`[BENCHMARK NEEDED]` confirm on Steam Deck.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SC_ENT_NOT_FOUND` | entity ID stale | clear from selection, refresh tree |
| `SC_COMPONENT_UNKNOWN` | type not registered | offer plugin install |
| `SC_PATCH_INVALID` | JSON patch failed to apply | revert field, surface diff |
| `SC_REPARENT_CYCLE` | would create hierarchy cycle | block drop, toast |
| `SC_PREFAB_RECURSIVE` | prefab instances itself | block |
| `SC_ASSET_MISSING` | drag-dropped asset has missing deps | offer to import deps |
| `SC_MULTI_EDIT_MISMATCH` | components differ structurally | per-entity dialog |

## Integration Points

| System | Interaction |
|---|---|
| `docs/specs/core/ecs.md` | reflection metadata, archetype info |
| `docs/specs/agent/api.md` | every command → RPC |
| `docs/specs/agent/telemetry.md` | inspector subscribes to live values (read-only mode) |
| `docs/specs/assets/registry.md` | asset slots query thumbnails, paths |
| `docs/specs/scripting/hotreload.md` | script field hot-reload reflects new exports |
| `docs/contracts/physics-renderer.md` | collision shape gizmos |
| `docs/specs/editor/debug.md` | shared selection set drives overlays |

## Test Requirements

- `scene.headless_parity`: every action recorded as command JSON, replayed via RPC alone, produces identical ECS snapshot hash.
- `scene.undo_roundtrip`: random 1000-op fuzz; every op + inverse leaves state at hash-match.
- `scene.multi_edit`: 100 selected entities, single inspector edit, all updated in one RPC batch.
- `scene.drag_cycle_block`: attempt to parent ancestor under descendant → blocked, error code `SC_REPARENT_CYCLE`, no state mutated.
- `scene.prefab_override_persist`: edit instance field → save scene → reload → override preserved, source untouched.
- `scene.large_tree`: 100k entities, tree dock paints < 16 ms, scroll smooth.

## Prior Art

- ✓ Godot scene dock + inspector dock — pattern proven. `godotengine/godot` `SceneTreeEditor`, `EditorSelectionHistory`.
- ✓ Unity inspector — `<mixed>` multi-edit UX is the gold standard.
- ✓ Blender outliner — filter modes, modal viewport gizmos.
- ✓ `bevy_inspector_egui` — egui reflection-driven widgets, type-id widget registry.
- ✓ UE5 details panel — category collapse, drag-reorder.
- ✗ Godot prefab system (PackedScene) — inheritance model is powerful but confusing; we adopt JSON-patch overrides for clarity.
- ✗ Unity prefab variants — useful concept, messy implementation; spec ours as plain JSON-patch.

## Open Questions

- `[DECISION NEEDED]` Layered selection (selection groups) — first-class or plugin?
- `[DECISION NEEDED]` Component grouping/categories — driven by attribute macro or convention?
- `[DECISION NEEDED]` Live inspector during play-mode — read-only, two-way with rollback, or full edit?
- `[AGENT: 02]` confirm reflection API surface for component types (need `TypeRegistry::iter_fields`, `from_json_patch`).
- `[AGENT: 10]` lock subscription model for `scene.subscribe` (push vs diff vs pull).
- `[AGENT: 09]` `.nxprefab` mime + extension reserved in asset registry.
