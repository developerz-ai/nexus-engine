<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — `NexusPlugin` Trait Spec

> Every third-party crate that extends the engine implements `NexusPlugin`. The trait is the seam. No other extension mechanism is supported.
>
> Compile-time discovery via the `inventory` crate (https://docs.rs/inventory). Zero-config wire-up at `cargo build`. Engine init scans, validates, topo-sorts, registers.

---

## Boundaries

- Owns: trait signature, registration mechanism, mount-order rules, conflict detection, headless-safety assertion, test requirements.
- Does NOT own: per-category trait extensions (`GenrePlugin`, `StylePlugin`, `NetTransport` — those live in `categories.md`), CLI behavior, Cargo features.
- Depends on: `docs/contracts/*` (plugins MUST respect contracts), `docs/specs/crates/manifest.md` (Agent 28 — `[package.metadata.nexus]`), `docs/specs/crates/quality-bar.md` (Agent 28 — verification tiers), `docs/architecture/01-principles.md` (every Law applies).

---

## Trait signature

Pseudocode + Rust signature, ≤ 20 lines:

```rust
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
//! Implements: docs/specs/crates/plugin-trait.md @ <commit>
pub trait NexusPlugin: Send + Sync + 'static {
    fn name(&self) -> &'static str;                                    // unique stable id
    fn version(&self) -> semver::Version;                              // crate version
    fn engine_versions(&self) -> semver::VersionReq;                   // compat range, e.g. "^1"
    fn category(&self) -> PluginCategory;                              // → categories.md
    fn register(&self, engine: &mut Engine, cfg: &NexusToml)
        -> Result<(), StructuredError>;                                // mount; headless-safe
    fn shutdown(&self, engine: &mut Engine) -> Result<(), StructuredError>;
    fn health_check(&self, engine: &Engine) -> HealthReport { HealthReport::ok() }
    fn migration_from(&self, prior: &semver::Version) -> Option<Migration> { None }
    fn before(&self) -> &'static [&'static str] { &[] }                // mount-order constraints
    fn after(&self) -> &'static [&'static str]  { &[] }
}
```

Companion types defined in `nexus_core::plugin`:

- `PluginCategory` — enum mirroring `docs/specs/crates/categories.md`.
- `HealthReport` — `{ ok: bool, checks: Vec<NamedCheck>, telemetry: serde_json::Value }`.
- `Migration` — `{ from: Version, to: Version, steps: Vec<MigrationStep> }`.
- `Engine` — opaque mount-point handle; exposes `add_systems`, `add_resource`, `subscribe_event`, `register_asset_source`, `register_telemetry_sink`. No private internals leak.

---

## Registration pattern (compile-time discovery)

```rust
// In the plugin crate's lib.rs:
pub struct MobaPlugin;

impl NexusPlugin for MobaPlugin { /* ... */ }

inventory::submit! {
    Box::new(MobaPlugin) as Box<dyn NexusPlugin>
}
```

Engine boot:

```rust
for plugin in inventory::iter::<Box<dyn NexusPlugin>>() {
    registry.push(plugin);
}
registry.validate()?;     // compat + conflicts
registry.topo_sort()?;    // before/after constraints
for plugin in registry.iter() {
    plugin.register(&mut engine, &nexus_toml)?;
}
```

Zero glue code in the game. The plugin's mere presence in `Cargo.toml` causes it to mount.

`[DECISION NEEDED]` — `inventory` crate vs explicit `register_all!` macro vs build-script codegen. Recommendation: **`inventory`** for v1.0; fall back to codegen if WASM tree-shaking or startup-cost benchmarks fail. → `docs/architecture/06-modularity.md` §"Honest pitfalls".

---

## Mount-order rules

| Rule | Behavior |
|---|---|
| Default | Alphabetical by `name()`. |
| `[plugins.priority]` in `Nexus.toml` | Ordered list of plugin names; listed plugins mount in given order before unlisted plugins. |
| `before()` / `after()` constraints | Plugin declares hard ordering. Topo-sort merges these with the priority hint. |
| Cycle detected | Boot aborts with `E_PLUGIN_CYCLE` listing the cycle (structured error per Law 10). |
| Constraint references unknown plugin | Boot aborts with `E_PLUGIN_UNKNOWN_REF` (no silent skip). |
| Ties | Broken alphabetically; deterministic across runs (Law 9). |

Example resolution:

```toml
# Nexus.toml
[plugins.priority]
order = ["core-overrides", "moba", "anime-style"]
```

Plugin `nexus-genre-moba` declares `after = ["nexus-style-pbr"]`. Final order: `core-overrides`, `pbr`, `moba`, `anime-style`, then everything else alphabetical.

---

## Conflict detection

Boot-time validations (fail-fast with structured errors):

| Conflict | Error code | Detection |
|---|---|---|
| Two plugins register the same `SystemId` | `E_PLUGIN_CONFLICT_SYSTEM` | `Engine::add_systems` deduplicates by id; second insert errors with both plugin names. |
| Two plugins register the same `ResourceId` | `E_PLUGIN_CONFLICT_RESOURCE` | same mechanism. |
| Plugin's `engine_versions()` rejects current engine | `E_PLUGIN_ENGINE_MISMATCH` | semver mismatch at boot; lists required vs actual. |
| Plugin's `category()` not in canonical enum | `E_PLUGIN_BAD_CATEGORY` | rejected at registry build. |
| Two plugins claim primary-genre slot when manifest sets `primary` | `E_PLUGIN_GENRE_PRIMARY_AMBIGUOUS` | `Nexus.toml [genres].primary` is canonical; secondaries co-exist. |
| Asset path collision on prefix | `E_PLUGIN_ASSET_PREFIX_COLLISION` | asset registry rejects second prefix; plugin must rename. |
| Capability requested not in allowlist | `E_PLUGIN_CAPABILITY_DENIED` | `[capabilities]` in plugin manifest cross-checked against `Nexus.toml [plugins.<name>].grant`. |

All errors implement `StructuredError` (Law 10). All errors emitted via telemetry (Law 11) before boot abort.

---

## Headless-safe assertion (Law 8)

> `register` MUST NOT require a display, GPU surface, audio device, or network device.

Why: AI agents debug headlessly. CI runs headlessly. Servers run headlessly. A plugin that needs a window to mount is unusable in scenario tests, deterministic replay, and server-side validation.

Enforcement:

- `register` runs under `cfg(test)` in CI in `--headless` mode against a stub `Engine`. Any plugin call that probes `Engine::renderer().surface()` or equivalent fails — that work belongs in a scheduled system, not in `register`.
- `nexus-merge` lint `plugin_register_headless_safe` greps for forbidden calls (`Window::new`, `cpal::default_host`, `wgpu::Instance::request_adapter`) inside `register`.

Pattern:

```rust
fn register(&self, engine: &mut Engine, cfg: &NexusToml) -> Result<(), StructuredError> {
    engine.add_resource(MobaConfig::from_toml(cfg)?);
    engine.add_systems(Schedule::Update, (lane_tick, tower_ai, minion_spawn));
    engine.subscribe_event::<DamageEvent>(on_damage);
    // No window. No GPU. No socket. No file I/O.
    Ok(())
}
```

I/O happens inside the scheduled systems, which run only when their subsystem is enabled (headless mode no-ops renderer/audio gracefully per Law 8).

---

## Test requirements

Every plugin crate MUST include:

| Test | Requirement |
|---|---|
| `headless_loads` | `cargo test --features headless` mounts the plugin against a stub `Engine`, asserts `Ok(())`. |
| `register_shutdown_clean` | `register` then `shutdown` leaves zero leaked entities, resources, telemetry subscribers. |
| `engine_version_check` | Plugin rejects an engine version outside `engine_versions()` with `E_PLUGIN_ENGINE_MISMATCH`. |
| `no_unsafe` | `cargo geiger` reports zero `unsafe` blocks unless justified per Law 6. |
| `replay_determinism` | Plugin's systems produce bit-identical output across two runs with the same seed (Law 9). |
| `scenario_smoke` | At least one TOML scenario under `tests/scenarios/` exercises the plugin's main feature. |
| `telemetry_schema_declared` | Plugin's telemetry events are declared in `docs/specs/.../telemetry.md` per Law 11. |
| `structured_errors_only` | All public `Result` types use `StructuredError` per Law 10. |
| `feature_default_minimal` | Plugin's own `[features] default = [...]` does NOT include heavy subsystems by default (proposed Law 13). |

CI gate: `nexus crate test` runs the full pack on every PR to a crate repository. → `docs/specs/crates/testing.md` (Agent 28).

---

## Lifecycle

```
                ┌──────────────────────────────────────────────┐
                │  cargo build (inventory collects symbols)    │
                └──────────────────────────┬───────────────────┘
                                           ▼
                ┌──────────────────────────────────────────────┐
                │  nexus build  →  binary linked w/ plugin     │
                └──────────────────────────┬───────────────────┘
                                           ▼
                ┌──────────────────────────────────────────────┐
                │  game start  →  Engine::init()               │
                │   1. iter inventory                          │
                │   2. validate (compat, category, conflicts)  │
                │   3. topo-sort (before/after + priority)     │
                │   4. for each: plugin.register(&mut engine)  │
                └──────────────────────────┬───────────────────┘
                                           ▼
                ┌──────────────────────────────────────────────┐
                │  game running  →  systems tick               │
                │   Engine::telemetry().subscribe(...)         │
                │   plugin.health_check() polled every N secs  │
                └──────────────────────────┬───────────────────┘
                                           ▼
                ┌──────────────────────────────────────────────┐
                │  game stop  →  Engine::shutdown()            │
                │   for each: plugin.shutdown(&mut engine)     │
                │   assert: no leaked state                    │
                └──────────────────────────────────────────────┘
```

---

## Manifest interplay

The trait covers runtime behavior. The crate's `Cargo.toml` declares the metadata `nexus add` consumes:

```toml
[package.metadata.nexus]
spec = "docs/specs/genres/moba.md"
category = "genre"
engine_versions = "^1"
headless_safe = true
deterministic = true
capabilities = ["read_world", "spawn_entities", "schedule_systems"]
laws = ["1", "3", "5", "8", "9", "10", "11", "12"]
```

Schema authority: `docs/specs/crates/manifest.md` (Agent 28).

---

## Cross-references

- → `docs/specs/crates/overview.md` — three-layer ecosystem.
- → `docs/specs/crates/categories.md` — `PluginCategory` enum + per-category extension traits.
- → `docs/specs/crates/manifest.md` — `[package.metadata.nexus]` schema.
- → `docs/specs/crates/quality-bar.md` — verification tiers; trait conformance required for Verified tier.
- → `docs/specs/crates/rails-plugin-model.md` — the mental model.
- → `docs/architecture/06-modularity.md` — opt-in modularity manifesto.
- → `docs/architecture/feature-flag-matrix.md` — Cargo features per crate.
- → `docs/contracts/core-renderer.md`, `docs/contracts/core-physics.md`, `docs/contracts/core-networking.md`, `docs/contracts/core-audio.md`, `docs/contracts/core-scripting.md`, `docs/contracts/core-agent.md` — plugins consume these contracts; they do NOT reach into private internals.
- → `inventory` crate: https://docs.rs/inventory.
- → Bevy `App::add_plugin` prior art: https://github.com/bevyengine/bevy.

## Open questions

- `[DECISION NEEDED]` `inventory` vs build-script codegen for compile-time registration. Recommendation: `inventory` for v1.0; codegen fallback if WASM startup-cost benchmark fails ( > 50 ms). Cross-flag with Agent 28.
- `[DECISION NEEDED]` Async `register` (`async fn`) — needed if a plugin must precompute on a thread pool? Recommendation: NO; `register` stays sync. Long-running setup uses the first tick of a scheduled system.
- `[DECISION NEEDED]` Hot-reload plugin lifecycle (replace plugin without restart) — v1.0 or v1.1? Recommendation: **v1.1**; v1.0 requires restart. Scripts (Lua/Rune) cover hot path.
- `[DECISION NEEDED]` Plugin DAG visualization tool (`nexus plugins graph --format=dot`) — own tooling? Likely yes; track in Agent 28's `docs/guides/crates/consuming.md`.
