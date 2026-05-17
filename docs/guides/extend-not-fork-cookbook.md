<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Extend, Don't Fork — Migration Cookbook

> Every common "I'd fork because..." reason mapped to a sanctioned extension surface. Recipe, example crate name, cross-link. Each row also calls out **when you SHOULD fork** instead, because the rule is not absolutist.
>
> Top-level rationale: `docs/architecture/07-extend-dont-fork.md`.
> Decision tree: same file, §"Where do I put my extension?"
> Enforcement: `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`.

---

## How to use this cookbook

1. Find the row that matches your fork motivation.
2. Read SANCTIONED SURFACE column → that's the answer.
3. Follow STEPS to author the extension.
4. If your case isn't here, jump to §"Not in the table" at the bottom.

`nexus-coder` reads this file as a decision tree. Rows are stable; do not renumber.

---

## The 14 entries

### 1. "I need a custom rendering technique (e.g., my own GI)"

| Field | Value |
|---|---|
| Sanctioned surface | Compile-time crate implementing `RenderPass` plugin |
| Category | `style` or new `render-pass` crate (extends `nexus-renderer`) |
| Example crate | `nexus-renderer-customgi`, `nexus-style-watercolor-gi` |
| Trait | `RenderPass` (renderer plugin trait) |
| Cross-link | → `docs/specs/renderer/gi.md`, `docs/specs/renderer/overview.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-renderer-customgi --category style`
2. `impl RenderPass for MyGi { fn record(&mut self, ctx: &mut FrameCtx) -> Result<(), RenderError> }`
3. Register via `impl NexusPlugin for MyGiPlugin { fn build(&self, app: &mut AppBuilder) { app.add_render_pass::<MyGi>() } }`
4. Add to game's `Nexus.toml` under `[plugins]`.

**When you SHOULD fork.** Research-only path tracer with no intent to ship a game. Or you need to mutate the wgpu device creation itself (rare; petition for a `RendererBackendPlugin` trait extension instead).

---

### 2. "I need custom netcode (e.g., proprietary anti-cheat-friendly transport)"

| Field | Value |
|---|---|
| Sanctioned surface | Compile-time crate implementing `NetTransport` |
| Category | `net` |
| Example crate | `nexus-net-mycorp`, `nexus-net-steam-relay`, `nexus-net-epic-eos` |
| Trait | `NetTransport` |
| Cross-link | → `docs/specs/networking/transport.md`, `docs/specs/networking/overview.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-net-mycorp --category net`
2. `impl NetTransport for MyTransport { fn send(...); fn recv(...); fn flush(...); }`
3. Register with `NexusPlugin::build`.
4. Set `[networking].transport = "mycorp"` in `Nexus.toml`.

**When you SHOULD fork.** You need to change `nexus-net`'s rollback algorithm fundamentally (not the transport). Open an ADR proposing a `RollbackBackend` trait first — fork only if denied.

---

### 3. "I need a custom physics integrator"

| Field | Value |
|---|---|
| Sanctioned surface | Compile-time crate implementing `PhysicsBackend` |
| Category | `physics` |
| Example crate | `nexus-physics-myintegrator`, `nexus-physics-verlet`, `nexus-physics-jolt-bridge` |
| Trait | `PhysicsBackend` |
| Cross-link | → `docs/specs/physics/overview.md`, `docs/specs/physics/determinism.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-physics-myintegrator --category physics`
2. `impl PhysicsBackend for MyIntegrator { fn step(&mut self, world: &mut PhysicsWorld, dt: SimTime) -> Result<(), PhysicsError> }`
3. Honor Law 9 (deterministic replay): use `SeededRng`, ordered iteration, no wall-clock.
4. Set `[physics].backend = "myintegrator"` in `Nexus.toml`.

**When you SHOULD fork.** You're prototyping a research-paper integrator with no production target.

---

### 4. "I need a custom asset format"

| Field | Value |
|---|---|
| Sanctioned surface | `AssetImporter` plugin crate |
| Category | `asset-source` |
| Example crate | `nexus-asset-source-meshy`, `nexus-asset-source-myformat`, `nexus-asset-import-usdz` |
| Trait | `AssetSource` or `AssetImporter` |
| Cross-link | → `docs/specs/assets/import.md`, `docs/specs/assets/registry.md`, `docs/specs/assets/generation.md` |

**Steps.**
1. `nexus crate new nexus-asset-import-myformat --category asset-source`
2. `impl AssetImporter for MyFormat { const EXTENSIONS: &[&str] = &["xyz"]; fn import(&self, bytes: &[u8]) -> Result<AssetBundle, ImportError> }`
3. Register at startup; engine routes `*.xyz` files to your importer.

**When you SHOULD fork.** Almost never. Importers are pure functions; the trait fits every known format.

---

### 5. "I need a new genre system"

| Field | Value |
|---|---|
| Sanctioned surface | Compile-time crate implementing `GenrePlugin` |
| Category | `genre` |
| Example crate | `nexus-genre-deckbuilder`, `nexus-genre-immersive-sim`, `nexus-community-genre-mecha` |
| Trait | `GenrePlugin` |
| Cross-link | → `docs/specs/crates/categories.md`, `docs/specs/genres/plugin-trait.md` `[NEW — Agent 12]` |

**Steps.**
1. `nexus crate new nexus-genre-deckbuilder --category genre`
2. Declare ECS components (`Card`, `Deck`, `Hand`), systems (`shuffle_system`, `draw_system`), prefabs.
3. `impl GenrePlugin for DeckbuilderGenre { fn build(&self, app: &mut AppBuilder) { app.register_components::<...>(); app.add_systems(...); } }`
4. Add `nexus-genre-deckbuilder` under `[genres]` in `Nexus.toml`.

**When you SHOULD fork.** Never. Genre crates are the canonical extension lane; this is exactly what the system was designed for.

---

### 6. "I need a custom platform (a new console, embedded board, BeOS)"

| Field | Value |
|---|---|
| Sanctioned surface | `PlatformBackend` crate |
| Category | `platform` |
| Example crate | `nexus-platform-steamdeck`, `nexus-platform-orbis-stub`, `nexus-community-platform-haiku` |
| Trait | `PlatformBackend` |
| Cross-link | → `docs/specs/core/hal.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-platform-myconsole --category platform`
2. `impl PlatformBackend for MyConsole { fn window(...); fn input(...); fn filesystem(...); fn time(...); fn threads(...); }`
3. If console SDK is NDA-restricted: ship the crate as a private repo in your studio monorepo. Engine stays upstream.
4. `--target=my-console` in build.

**When you SHOULD fork.** Console vendor's SDK requires modifying engine-core source to satisfy certification (e.g., custom memory allocator hooks at the HAL boundary). First petition for HAL extension hooks via ADR. Fork is last resort — and you sign the perpetual-maintenance cost (see playbook).

---

### 7. "I need to embed an existing C++ library (Wwise, FMOD, RAD Game Tools)"

| Field | Value |
|---|---|
| Sanctioned surface | Wrapper crate with `NexusPlugin` adapter |
| Category | `audio` (Wwise/FMOD), `tools`, or `asset-source` depending on lib |
| Example crate | `nexus-audio-wwise-bridge`, `nexus-audio-fmod-bridge`, `nexus-tools-bink-bridge` |
| Trait | `AudioBackend`, `DspPack`, or adapter `NexusPlugin` |
| Cross-link | → `docs/specs/audio/overview.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-audio-wwise-bridge --category audio`
2. Build the C++ lib via `build.rs` (link-only; no engine source touched).
3. `unsafe extern "C"` FFI module with `// SAFETY:` blocks per Law 6.
4. `impl AudioBackend for WwiseBackend`.
5. Crate may be MIT (wrapper) even though the wrapped lib is proprietary — the wrapper is your code.

**When you SHOULD fork.** Never. FFI-wrapper crates are the standard pattern; the engine deliberately keeps the audio (and physics) backend trait open for this.

---

### 8. "I need an internal proprietary feature I won't open-source"

| Field | Value |
|---|---|
| Sanctioned surface | Private crate in your studio monorepo. Engine stays upstream. |
| Category | Any (your crate, your namespace) |
| Example crate | `mycorp-mygame-engine-ext`, `acme-genre-acmewars`, kept in your private git |
| Trait | Whichever trait fits your feature |
| Cross-link | → `docs/specs/crates/licensing.md`, `docs/specs/crates/naming.md` |

**Steps.**
1. Generate the crate against the public engine trait. Keep the source in your private repo.
2. Add as `path = "../mycorp-mygame-engine-ext"` or private git dep in your game's `Cargo.toml`.
3. Engine is still an unmodified upstream dependency. You receive every engine fix.
4. Crate license is yours: MIT, proprietary, royalty-bearing — your call.

**This is supported and common.** The engine deliberately does not enforce open-sourcing of community/studio crates. Only `nexus-*` namespaced crates must be MIT. Use `mycorp-*` or `acme-*` for closed-source work.

**When you SHOULD fork.** Never. Private crate ≠ fork. This is the whole point of the model.

---

### 9. "I want to break compatibility for performance (e.g., bigger entity ID bits)"

| Field | Value |
|---|---|
| Sanctioned surface | Propose a Cargo feature in upstream → if denied, last-resort fork with perpetual maintenance |
| Category | n/a (engine-core change) |
| Example | `nexus-core` feature `entity-id-u64` |
| Cross-link | → `docs/specs/core/ecs.md`, `docs/architecture/05-adr/`, `docs/guides/studios/extend-vs-fork-playbook.md` |

**Steps.**
1. Open an ADR proposing the feature flag. Show the perf measurement.
2. If accepted: add `[features] entity-id-u64 = []` in `nexus-core`, gated `cfg`.
3. If denied AND your business needs it: fork. Read the playbook before you do — quantified per-kloc merge cost is in `docs/guides/studios/extend-vs-fork-playbook.md`.

**When you SHOULD fork.** Only when (a) ADR is denied AND (b) the perf delta is mission-critical AND (c) you accept perpetual upstream-merge cost. Spell out the cost in a docs/forks/MYFORK.md so future engineers don't think it's free.

---

### 10. "I need to brand the engine ('PoweredByMyTech', custom splash, custom editor theme)"

| Field | Value |
|---|---|
| Sanctioned surface | `Nexus.toml` `[branding]` block + editor theme crate |
| Category | n/a (config) + `tools` for editor themes |
| Example crate | `mycorp-editor-theme`, branding in `Nexus.toml` |
| Cross-link | → `docs/game-template/nexus-toml.md`, `docs/specs/editor/overview.md` |

**Steps.**
1. Edit `Nexus.toml`:
   ```toml
   [branding]
   name = "MyCorp Engine"
   splash = "assets/branding/splash.png"
   editor_logo = "assets/branding/editor.svg"
   crash_dialog_url = "https://mycorp.com/support"
   ```
2. Optional: `nexus crate new mycorp-editor-theme --category tools` for a full editor reskin.
3. Engine runtime + editor read `[branding]` and apply. No source modification.

**When you SHOULD fork.** Never. Branding is a config concern. If you find yourself patching engine source to change a logo, file a bug — the `[branding]` schema is missing a field.

---

### 11. "I disagree with the architectural direction"

| Field | Value |
|---|---|
| Sanctioned surface | ADR (Architecture Decision Record); fork is MIT-permitted but costly |
| Category | n/a (governance) |
| Example | `docs/architecture/05-adr/NNNN-my-proposal.md` |
| Cross-link | → `docs/guides/adr-format.md`, `docs/architecture/05-adr/`, `docs/guides/studios/extend-vs-fork-playbook.md` |

**Steps.**
1. Open an ADR with Status / Context / Decision / Consequences / Alternatives.
2. Route to architect council via `principle-keeper` subagent.
3. If accepted: engine evolves. You contributed.
4. If denied: you may fork (MIT permits it). You forfeit: community velocity, AI tooling support (`nexus-coder` targets canonical), ecosystem compat (third-party crates target canonical traits). Document the cost; sign it; ship.

**When you SHOULD fork.** Severe philosophical mismatch the council won't ratify AND you have a multi-year roadmap that absorbs the cost. Rare. Honest.

---

### 12. "I need a custom scripting language (not lua, not rune)"

| Field | Value |
|---|---|
| Sanctioned surface | `ScriptVm` plugin crate |
| Category | `script-lang` |
| Example crate | `nexus-script-lang-wren`, `nexus-script-lang-janet`, `nexus-script-lang-wasm-component` |
| Trait | `ScriptVm` |
| Cross-link | → `docs/specs/scripting/overview.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-script-lang-wren --category script-lang`
2. `impl ScriptVm for WrenVm { fn load(...); fn call(...); fn snapshot(...); fn restore(...); }`
3. Honor Law 9: deterministic snapshot/restore is mandatory for replay.
4. Set `[scripting].vm = "wren"` in `Nexus.toml`.

**When you SHOULD fork.** Never. The `ScriptVm` trait was designed exactly for this.

---

### 13. "I need a telemetry sink for my internal observability stack"

| Field | Value |
|---|---|
| Sanctioned surface | `TelemetrySink` plugin crate |
| Category | `telemetry-sink` |
| Example crate | `nexus-telemetry-sink-honeycomb`, `nexus-telemetry-sink-mycorp-otel` |
| Trait | `TelemetrySink` |
| Cross-link | → `docs/specs/agent/telemetry.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-telemetry-sink-mycorp-otel --category telemetry-sink`
2. `impl TelemetrySink for MyOtel { fn emit(&mut self, event: TelemetryEvent) -> Result<(), SinkError> }`
3. Register via `NexusPlugin`. Sink runs in the telemetry fanout.

**When you SHOULD fork.** Never. Telemetry sinks are a pure interface; the engine emits, you consume.

---

### 14. "I need editor functionality (custom inspector, custom asset browser tab)"

| Field | Value |
|---|---|
| Sanctioned surface | Editor override / extension (Tier 7) |
| Category | `tools` or editor-extension manifest |
| Example crate | `nexus-editor-inspector-shadergraph`, `mycorp-editor-asset-curator` |
| Trait | Editor extension API (panel / inspector / command registry) |
| Cross-link | → `docs/specs/editor/overview.md`, `docs/specs/crates/categories.md` |

**Steps.**
1. `nexus crate new nexus-editor-inspector-shadergraph --category tools`
2. Register UI panels / inspectors via the editor's extension API.
3. Editor scans extension crates at boot; no editor-source modification.

**When you SHOULD fork.** Never. The editor is built editor-extension-first — same model as VS Code (core features ARE extensions).

---

## Not in the table — what to do

1. Re-check the decision tree in `docs/architecture/07-extend-dont-fork.md`.
2. If still no fit, open an ADR proposing a **new extension surface** (new trait, new plugin lane, new editor hook). Do NOT propose a code modification.
3. Route to `principle-keeper`. Council ratifies new traits as additive minor releases (per `docs/specs/crates/stable-api.md` § Semver Discipline).
4. Fork only as a last resort, and only after the ADR loop has run to conclusion.

---

## Anti-patterns (the merge bot will reject these)

| Anti-pattern | What the bot says |
|---|---|
| PR modifies `crates/nexus-core/src/**` to add a new component type | "Components are user-defined in your game crate. → cookbook §5." |
| PR modifies `crates/nexus-renderer/src/**` to add a new render pass | "Use the `RenderPass` plugin trait. → cookbook §1." |
| PR modifies `crates/nexus-net/src/**` to add a new transport | "Implement `NetTransport` in your own crate. → cookbook §2." |
| PR modifies `crates/nexus-agent/src/**` to add a new RPC method without ADR | "RPC method additions require an ADR (stable wire protocol). → `docs/specs/agent/api.md`." |
| PR adds branding strings to `crates/nexus-editor/src/**` | "Branding is config. → cookbook §10. Use `Nexus.toml [branding]`." |

Full rejection rule + JSON payload: → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`.

---

## Cross-references

- → `docs/architecture/07-extend-dont-fork.md` — manifesto.
- → `docs/architecture/proposed-law-14.md` — proposed law ratifying this cookbook.
- → `docs/architecture/06-modularity.md` — opt-in compile-time modularity (Agent 29).
- → `docs/specs/crates/overview.md`, `docs/specs/crates/categories.md`, `docs/specs/crates/plugin-trait.md`, `docs/specs/crates/stable-api.md`.
- → `docs/specs/mods/overview.md` — runtime extension surface.
- → `docs/specs/agent/api.md` — agent RPC surface.
- → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md` — enforcement.
- → `docs/guides/studios/extend-vs-fork-playbook.md` — quantified business case.
- → `docs/guides/adr-format.md` — ADR template.
- → `docs/guides/subagent-fleet.md` — `principle-keeper`, `crate-author`, `mod-author`, `plugin-author`, `script-author`.

## Mastermind routing note

When a contributor asks "should I fork?", mastermind invokes `principle-keeper` first; `principle-keeper` reads this cookbook and routes to the appropriate authoring subagent (`crate-author` / `mod-author` / `plugin-author` / `script-author`) along with the matching row number.
