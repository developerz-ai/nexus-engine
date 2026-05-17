<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — SDK

> The stable subset of engine APIs callable from a mod. Versioned independently from the engine. Semver across breaking changes. Compatibility shims for one major version back.

## Boundaries
- Owns: SDK surface enumeration, stable-API promise, deprecation policy, semver mapping engine ↔ SDK.
- Does NOT own:
  - Capability enforcement (every SDK fn checks caps via the broker) → `docs/specs/scripting/sandbox.md`
  - VM internals → `docs/specs/scripting/rune.md`
  - Bridge function metadata → `docs/contracts/core-scripting.md`
- Depends on: `docs/specs/scripting/sandbox.md`, `docs/contracts/core-scripting.md`.

## The Stable-API Promise

A mod targeting `sdk = "^1.0"` runs on every `nexus-1.x` engine release **without re-compilation** until the SDK reaches `2.0`.

- Engine MAY add new APIs in a minor release. Mod ignores them.
- Engine MAY NOT remove APIs in a minor release.
- Engine MAY mark APIs deprecated; they still work until next major.
- Engine MUST ship a compatibility shim for one major version back (mods targeting `^1.x` keep running on `nexus-2.x`).

Mitigates the Minecraft mod-hellscape problem (mod breakage on each game update). Cited in `docs/specs/mods/overview.md` non-negotiables.

## Surface Map

```
nexus.mod.*
  ├── world          ← ECS access (cap-gated)
  ├── events         ← bus emit/subscribe (cap-gated)
  ├── assets         ← load by UUID (cap-gated)
  ├── audio          ← oneshot triggers (cap-gated)
  ├── input          ← read-only snapshot, deterministic
  ├── time           ← sim time only (no wall clock)
  ├── rng            ← per-world seeded (cap-gated)
  ├── log            ← structured logging (cap-gated)
  ├── persist        ← per-mod state blob (cap-gated)
  ├── ui             ← immediate-mode mod-side overlay
  ├── locale         ← Fluent strings
  ├── physics        ← raycast/query only (no direct write)
  ├── math           ← vec/mat/quat, deterministic
  ├── prelude        ← re-exports of common types
  └── semantic       ← NL spawn helper (cap-gated, total-conv tier)
```

Every fn is annotated with: cap required, cost class, deterministic flag, since-version, deprecated-in.

## Versioning

| Version axis | Bumps when |
|---|---|
| Engine | Any change inside crates not on the SDK boundary |
| SDK MINOR | New API added, no removals, no semantics change |
| SDK MAJOR | API removed, signature changed, semantics changed |
| Cap catalog | Adding cap = MINOR; removing cap = MAJOR |

`mod.toml::[mod].sdk = "^1.0"` is the declared compatibility range. Loader rejects mods whose `sdk` requirement falls outside the running engine's supported range with `MOD_E_SDK_INCOMPAT`.

## Compatibility Shim

For one major version back:

```
engine 2.x
  └── nexus-mod-sdk-1.x shim  ← maps 1.x calls onto 2.x impls
      └── runs mods targeting sdk ^1.0 unmodified
```

Shim policy:
- Shim is shipped in `crates/nexus-mod-sdk-compat/` (spec-level reference; impl elsewhere).
- Shim documented in `MIGRATION.md` per major.
- Shim retired one major after introduction (engine 3.x drops the 1.x shim).
- Mods get a warning telemetry event on each session run via shim.

## Deprecation Policy

```
v1.4: api X marked #[deprecated(since="1.4", note="use Y", removal="2.0")]
v1.5..1.99: X still works; warning logged on call; mod scoreboard tracks usage
v2.0: X removed; mods using X via shim continue; mods recompiled get compile error
v3.0: shim retired
```

Mods that miss a major-version bump for one full release cycle (≈ 18 months) become "legacy"; player gets a banner. After cycle 2: "unsupported", auto-disabled with one-click re-enable.

## Public API Categories

### `nexus.mod.world` (cap: WorldRead/Write)
```
fn query<C: Component...>() -> Iter<(Entity, C...)>
fn spawn(bundle: Bundle) -> Entity
fn despawn(entity: Entity)
fn get<C: Component>(entity: Entity) -> Option<C>
fn set<C: Component>(entity: Entity, value: C)
fn each_changed<C: Component>(f: Fn(Entity, &C))
```

### `nexus.mod.events` (cap: EventEmit/Subscribe)
```
fn emit(name: &str, payload: Value)
fn subscribe(name: &str, handler: Fn(EventCtx))
fn unsubscribe(handle: SubHandle)
```

### `nexus.mod.assets` (cap: AssetRead)
```
fn load<T: Asset>(uuid: Uuid) -> Handle<T>
fn load_async<T: Asset>(uuid: Uuid) -> Future<Handle<T>>
fn is_ready(handle: &UntypedHandle) -> bool
```

### `nexus.mod.audio` (cap: AudioOneshot)
```
fn play(id: &str, at: Option<Vec3>, params: AudioParams) -> VoiceHandle
fn stop(handle: VoiceHandle)
```

### `nexus.mod.input` (no cap; read-only)
```
fn snapshot() -> InputSnapshot          // taken at script-step boundary
fn just_pressed(action: ActionId) -> bool
```

### `nexus.mod.time` (no cap)
```
fn sim_now() -> f64                     // seconds since world start
fn frame() -> u64                       // monotonic frame index
fn dt() -> f64                          // last fixed step delta
```

### `nexus.mod.rng` (cap: Rng)
```
fn seed_world() -> u64                  // read-only
fn next_u64() -> u64
fn next_f64() -> f64                    // [0,1)
fn range(lo: i64, hi: i64) -> i64
fn choose<T>(slice: &[T]) -> &T
```

### `nexus.mod.persist` (cap: Persist)
```
fn read() -> Option<Bytes>              // own blob
fn write(bytes: &[u8]) -> Result<()>    // bounded by cap size
```

### `nexus.mod.ui`
```
fn overlay(name: &str, f: Fn(UiCtx))    // immediate-mode panel
fn window(name: &str, opts: WindowOpts, f: Fn(UiCtx))
fn screen_to_world(p: Vec2) -> Vec3
```
Mod UI renders into a dedicated layer; never overlaps engine HUD without explicit grant. `[DECISION NEEDED]` on default opacity & input-routing rules.

### `nexus.mod.locale`
```
fn t(key: &str) -> String               // current language
fn t_args(key: &str, args: Map) -> String
fn current_lang() -> LangId
```
Loads from `locale/<lang>.ftl` in the mod's `.nxmod`. → `docs/guides/mods/authoring/i18n.md`.

### `nexus.mod.physics`
```
fn raycast(origin: Vec3, dir: Vec3, max: f32, mask: LayerMask) -> Option<RayHit>
fn overlap_sphere(c: Vec3, r: f32, mask: LayerMask) -> Vec<Entity>
```
Read-only; mutation via components.

### `nexus.mod.math`
Vec2/3/4, Mat3/4, Quat, deterministic transcendentals (libm). No SIMD-specific surface; engine uses SIMD internally.

### `nexus.mod.semantic` (cap: SemanticSpawn; total-conversion tier only)
```
fn spawn(prompt: &str) -> Result<Entity>
fn describe(entity: Entity) -> String
```
Routed via agent SDK (→ `docs/specs/agent/semantic.md`); rate-limited per `docs/specs/scripting/sandbox.md`.

## Type Stability

Every type re-exported from `nexus.mod.prelude` is part of the stable surface. Adding a field to a public struct = MINOR (struct exposed as `#[non_exhaustive]`). Removing or renaming = MAJOR.

`Entity`, `Uuid`, `Handle<T>`, `Vec3`, `Quat`, `Mat4`, `Bytes`, `LangId`, `LayerMask` — all stable.

## Forbidden Surface

A mod cannot reach (no public path):

| Capability | Reason |
|---|---|
| Raw filesystem | Sandboxed by design (`docs/specs/scripting/sandbox.md`) |
| Subprocess / shell | Forbidden cap |
| Arbitrary network | Reserved cap `Net`, disabled v1.0 |
| Wall clock | Breaks determinism |
| System RNG | Breaks determinism |
| Thread id | Breaks determinism |
| Engine internal types (`World`, `Resources`, `Schedule`) | Power escape |
| Unsafe blocks | Rune has none exposed |
| Native FFI | Outside SDK; awaits WASM tier → `native-mods.md` |

## Performance Contract (per call)

| API class | Target | Hard limit |
|---|---|---|
| `world.query` (10k ents) | < 1 ms | 4 ms |
| `world.spawn` | < 5 µs | 30 µs |
| `events.emit` | < 1 µs | 10 µs |
| `assets.load` (cache hit) | < 10 µs | 50 µs |
| `audio.play` | < 5 µs | 20 µs |
| `ui.overlay` (per-frame) | < 50 µs / 50 widgets | 200 µs |
| `rng.next_u64` | < 50 ns | 200 ns |

`[BENCHMARK NEEDED]`. Aggregate per-mod budget enforced by sandbox (250 µs/frame default).

## Error Contract

Bridge errors from `docs/specs/scripting/sandbox.md` apply (CAP_DENIED, CAP_REVOKED, LIMIT_EXCEEDED, BRIDGE_TYPE_MISMATCH). SDK-specific:

| Code | Meaning |
|---|---|
| `MOD_E_SDK_INCOMPAT` | Mod targets SDK range outside engine's supported set |
| `MOD_E_SDK_DEPRECATED_USE` | Call to deprecated API; surfaced as warn |
| `MOD_E_SDK_REMOVED` | Mod targets removed API (no shim available) |

## Integration Points

- `docs/contracts/core-scripting.md` — bridge fn metadata per SDK fn.
- `docs/specs/scripting/sandbox.md` — every cap-gated SDK fn cross-references catalog.
- `docs/specs/scripting/rune.md` — `ModEnv` exposes SDK roots per granted cap.
- `docs/specs/assets/registry.md` — `Handle<T>` semantics.
- `docs/specs/agent/sdk.md` — agent SDK consumes the same surface for fuzzing.

## Test Requirements

- Every fn in the SDK surface has: doc-comment with cap+cost+det flag, unit test, scenario test, fuzz harness.
- Adding a fn without `since="X.Y"` fails CI.
- Removing a fn without prior `#[deprecated]` cycle fails CI.
- Shim CI: take all behavior-tier scenarios from previous major, run on current major via shim; pass rate ≥ 99.5%.
- Mod targeting `^1.0` boots cleanly on `1.4` engine without recompile.

## Prior Art

- Bevy `bevy_*` re-exports + plugin trait ✓ — modular surface.
- Minecraft Forge / Fabric API ✓ — mod loader with API surface; ✗ breaks on every game update (the anti-goal we mitigate via shim).
- Skyrim SKSE ✓ — extensive surface, ✗ no formal stability, breaks on game update.
- Factorio Lua API ✓ — comprehensive; ✗ no semver.
- Garry's Mod gmod_lua ✓ — broad surface, ✗ ambient authority.

## Open Questions

- `[DECISION NEEDED]` UI input-routing default (mod overlay blocks engine input? mod-side toggle?).
- `[DECISION NEEDED]` Coroutines / async surface for mods (Rune supports; determinism cost).
- `[DECISION NEEDED]` Per-platform SDK subsets (consoles may disable `ui.overlay` for cert reasons).
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 14]` Confirm bridge-fn metadata format in `contracts/core-scripting.md`.
- `[AGENT: 10]` Confirm agent SDK exposes a "fuzz-with-this-SDK" entry point.
