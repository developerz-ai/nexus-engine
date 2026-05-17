<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Rails-Plugin Mental Model

> Think Rails gems. `bundle add foo_gem` → Bundler resolves → `Foo::Engine` Railtie auto-mounts → routes + initializers wire themselves → app uses `Foo.bar`.
>
> Nexus mirror: `nexus add nexus-genre-moba` → Cargo resolves → `NexusPlugin` implementation registers via `inventory` → genre systems auto-mount on engine init → game uses `genre::moba::*`. Zero boilerplate.
>
> Inspired by Rails::Engine + Railtie (https://guides.rubyonrails.org/engines.html) and Bevy plugins. Not a verbatim copy.

---

## Boundaries

- Owns: the mental model + conventions + anti-patterns that make Nexus plugins feel like Rails gems.
- Does NOT own: the `NexusPlugin` trait signature (→ `plugin-trait.md`), Cargo feature matrix (→ `docs/architecture/feature-flag-matrix.md`), CLI behavior (→ `docs/game-template/cli.md` + `docs/specs/scripts/nexus-add-resolution.md`).
- Depends on: `docs/architecture/06-modularity.md` (the why), `docs/specs/crates/overview.md` (where this fits in the three-layer ecosystem), `docs/specs/crates/categories.md` (Agent 28 — extension surfaces), `docs/specs/crates/manifest.md` (Agent 28 — `[package.metadata.nexus]`).

---

## The Rails → Nexus mapping

| Rails concept | Nexus concept | Notes |
|---|---|---|
| Gem | Cargo crate | distributed via crates.io (or alt registry) |
| `Gemfile` | `Cargo.toml` `[dependencies]` + `Nexus.toml` `[crates]` | manifest layered: Cargo for compile, Nexus.toml for engine-level wiring |
| `bundle install` | `cargo build` (via `nexus build`) | resolution + compile |
| `bundle add foo_gem` | `nexus add nexus-genre-moba` | mutates both manifests + runs `cargo check` |
| `Railtie` | `NexusPlugin` trait | the interface engine calls to mount a plugin |
| `Rails::Engine` | `SubsystemPlugin` (a `NexusPlugin` with a mountable subgraph) | bundles components/systems/scenes |
| `config/initializers/*.rb` | plugin `register(&mut Engine, &Nexus.toml)` | called once at engine boot |
| Route mounting (`mount Foo::Engine`) | System scheduling via `Schedule::add_systems_from_plugin(...)` | injects ECS systems on declared schedule |
| `config/application.rb` | `Nexus.toml` | top-level project config |
| `ActiveSupport::Notifications` | `nexus_core::Telemetry` | every plugin emits structured events |
| `Rails.logger` | `tracing` JSON subscriber | structured, per Law 11 |
| `config.eager_load_namespaces` | `inventory::iter::<NexusPlugin>()` at boot | compile-time auto-discovery |
| Gem version constraint | Cargo semver + `engine_versions` in manifest | double-checked: Cargo resolves Rust deps, Nexus checks engine compat |
| `config.middleware.use` | `register` adds systems with `before`/`after` constraints | explicit ordering, not magic |
| `rails generate scaffold` | `nexus generate plugin <name>` | scaffolds a plugin crate from template |
| `rake db:migrate` | `nexus migrate` | template + plugin migrations |

---

## Convention rules

| Convention | Rule |
|---|---|
| Crate name | `nexus-<category>-<topic>` for first-party; `nexus-community-<name>` or `nx-<name>` for community. → `docs/specs/crates/naming.md` (Agent 28). |
| Plugin type name | `<Topic>Plugin` (e.g. `MobaPlugin`, `AnimeStylePlugin`). One per crate (multiple permitted but discouraged). |
| Registration | One `inventory::submit! { Box::new(<Topic>Plugin) as Box<dyn NexusPlugin> }` per crate at lib-root. |
| Default config layer | Plugin ships a `default_config()` returning a typed struct; overridden by `Nexus.toml [plugins.<name>]` table. Override priority: `Nexus.toml` > plugin default. |
| Public surface | Re-exported under `nexus_<topic>::prelude`. Game does `use nexus_moba::prelude::*;`. |
| Scripts | Lua/Rune files under `assets/scripts/<plugin>/` auto-discovered. |
| Asset prefix | All asset paths prefixed `<plugin-name>:` to avoid collisions (e.g. `moba:textures/tower.png`). |
| Schedule label | Plugin systems run on declared `Schedule` label; default `Update`. Custom schedules declared in manifest. |
| Spec link | `[package.metadata.nexus] spec = "docs/specs/..."` mandatory (Law 2). |

---

## End-to-end flow — `nexus add nexus-genre-moba`

1. Dev runs `nexus add nexus-genre-moba` in repo root.
2. CLI resolves manifest via crates.io API. → `docs/specs/scripts/nexus-add-resolution.md`.
3. Verifies `engine_versions` compatible with `Nexus.toml [engine] version`.
4. Verifies declared category `genre` is in canonical enum (→ `docs/specs/crates/categories.md`).
5. Appends to `Cargo.toml [dependencies]` and `Nexus.toml [genres].secondary` (or sets `primary` if empty).
6. Runs `cargo check --message-format=json` to validate compile.
7. Emits structured outcome `{ ok, crate, version, manifest_diff, cargo_diff }` as JSON to stdout.
8. **Next `nexus build`** — `inventory` collects every `NexusPlugin` impl into a static registry. Engine init scans, validates, topo-sorts by `before`/`after`, calls `register(&mut Engine, &Nexus.toml)` in order.
9. Game `main.rs` is unchanged. Plugin is live.

---

## Worked example — adding a MOBA layer to an existing FPS game

Starting state: `Nexus.toml [genres] primary = "fps"`. Dev wants jungle-mode side-game.

```bash
$ nexus add nexus-genre-moba --secondary --json
{ "ok": true, "crate": "nexus-genre-moba", "version": "1.2.3",
  "manifest_diff": { "Nexus.toml": "+ [genres].secondary += \"moba\"" },
  "cargo_diff": { "Cargo.toml": "+ nexus-genre-moba = \"1.2\"" },
  "checks": [{ "name": "engine_compat", "ok": true }, { "name": "cargo_check", "ok": true }] }
```

Next `nexus build`:

- `inventory` iterates: finds `FpsPlugin` (already there) + `MobaPlugin` (new).
- Engine `init()` calls `FpsPlugin::register` then `MobaPlugin::register` (alphabetical default; `Nexus.toml [plugins.priority] = ["fps", "moba"]` if explicit order needed).
- Game code now has `use nexus_moba::prelude::*;` available — no other edits required to start consuming.

---

## Anti-pattern call-outs

| Anti-pattern | Why forbidden |
|---|---|
| Magic globals | Plugin mutates a `static mut WORLD` or hidden singleton. Breaks Law 9 (deterministic replay) + Law 3 (boundaries). Use `&mut Engine` passed to `register`. |
| Monkey-patching engine internals | Reaching into `nexus_core::ecs::internals` via `pub(crate)` escape hatches. Breaks Law 3. Use published contracts in `docs/contracts/`. |
| Implicit capability grant | Plugin reads filesystem or opens sockets without declaring `[capabilities]` in manifest. Breaks Law 1 (auditability) + AI-first review. Capability/feature flag is required for ANY system that mutates engine state beyond ECS reads. |
| Plugin returns `Box<dyn Error>` | Breaks Law 10 (structured errors). MUST return `nexus_core::error::StructuredError`. |
| Plugin does I/O in `register` | Breaks Law 8 (headless) if I/O requires display/GPU/network. `register` is pure setup; I/O happens in scheduled systems. |
| Auto-load all features | Plugin sets `default = ["all"]` in its own `Cargo.toml`. Breaks proposed Law 13 (opt-in modularity). |
| Cross-plugin private deps | `nexus-genre-moba` imports `nexus-genre-fps::internal::tower_health()`. Use published ECS components + events only. |
| Cyclic load order | Plugin A `after = ["B"]`, Plugin B `after = ["A"]`. Engine init fails fast with structured `E_PLUGIN_CYCLE`. |
| Naming squat | Publishing `nexus-foo` without being first-party (see `docs/specs/crates/naming.md`). Community uses `nexus-community-*` or `nx-*`. |
| Skipping the manifest | Crate lacks `[package.metadata.nexus]`. `nexus add` rejects with `E_CRATE_NO_MANIFEST`. |

---

## What Rails got wrong that Nexus fixes

| Rails pain | Nexus correction |
|---|---|
| Plugin load order undefined → "works on my machine" bugs | Topo-sort with declared `before`/`after`; cycle = fail-fast at boot. |
| Monkey-patching is idiomatic | Forbidden. Contracts in `docs/contracts/` are the only seams. |
| Initializer order = filename alphabetical, fragile | Explicit `[plugins.priority]` override in `Nexus.toml`, validated at boot. |
| `config/application.rb` Ruby code = runtime surprise | `Nexus.toml` is declarative TOML; validated by schema before any code runs. |
| `eager_load` vs `autoload` cognitive overhead | Single mode: compile-time discovery via `inventory`; if it isn't compiled in, it isn't there. |
| `Gemfile.lock` vs `Gemfile` confusion for new users | `Nexus.toml` is the manifest; `Cargo.lock` is the lockfile; `nexus add` updates both atomically. |

---

## Cross-references

- → `docs/specs/crates/overview.md` — three-layer ecosystem (engine vs third-party vs mods).
- → `docs/specs/crates/categories.md` — canonical category enum (genre, style, physics-ext, net-transport, audio-dsp, asset-source, telemetry-sink, …).
- → `docs/specs/crates/manifest.md` — `[package.metadata.nexus]` schema.
- → `docs/specs/crates/plugin-trait.md` — `NexusPlugin` trait signature + registration.
- → `docs/game-template/nexus-toml.md` — `[crates]`, `[plugins]`, `[genres]` sections (Agent 15).
- → `docs/architecture/06-modularity.md` — the manifesto (the why).
- → `docs/architecture/feature-flag-matrix.md` — Cargo features per crate.
- → Rails Engines guide: https://guides.rubyonrails.org/engines.html (inspiration).
- → `inventory` crate: https://docs.rs/inventory (compile-time registry mechanism).
- → Bevy plugins: https://github.com/bevyengine/bevy#plugins (Rust prior art).

## Open questions

- `[DECISION NEEDED]` Allow multiple plugins per crate, or one per crate? Recommendation: one per crate by convention; multiple permitted but `nexus lint` warns.
- `[DECISION NEEDED]` Plugin uninstall semantics: does `nexus remove` call `shutdown` on already-built binaries, or only mutate manifests? Recommendation: manifests only; build artifacts regenerated on next `nexus build`.
- `[DECISION NEEDED]` Should the `[plugins.priority]` table be ordered list or DAG? Ordered list is simpler; DAG matches `before`/`after` constraints already in plugin manifest. Recommendation: keep manifest constraints authoritative; `[plugins.priority]` is a hint resolved before topo-sort.
