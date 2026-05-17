<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Categories

> The canonical extension surfaces. Every third-party crate claims exactly one category. Each category names the trait the crate implements, the engine spec the trait lives in, and representative crate names.

→ Overview: `docs/specs/crates/overview.md`.
→ Naming policy: `docs/specs/crates/naming.md`.
→ Manifest field: `category` in `docs/specs/crates/manifest.md`.

## Category Registry

| Category key | Trait | Trait spec | Representative crate names |
|---|---|---|---|
| `genre` | `GenrePlugin` | `docs/specs/genres/plugin-trait.md` `[NEW — to be authored by Agent 12]` | `nexus-genre-survival-extreme`, `nexus-genre-spaceflight`, `nexus-genre-deckbuilder`, `nexus-community-genre-mecha` |
| `style` | `StylePipeline` | `docs/specs/styles/overview.md` § plugin trait | `nexus-style-anime`, `nexus-style-watercolor`, `nexus-style-comic`, `nexus-community-style-vaporwave` |
| `physics` | `PhysicsBackend` | `docs/specs/physics/overview.md` § backend trait | `nexus-physics-jolt-bridge`, `nexus-physics-verlet`, `nexus-community-physics-position-based` |
| `net` | `NetTransport` | `docs/specs/networking/transport.md` § plugin trait | `nexus-net-webtransport`, `nexus-net-steam-relay`, `nexus-net-epic-eos` |
| `audio` | `AudioBackend` or `DspPack` | `docs/specs/audio/overview.md` § backend trait | `nexus-audio-fmod-bridge`, `nexus-audio-wwise-bridge`, `nexus-audio-dsp-reverb-convolution` |
| `asset-source` | `AssetSource` | `docs/specs/assets/generation.md` § source trait | `nexus-asset-source-meshy`, `nexus-asset-source-flux`, `nexus-asset-source-kenney`, `nexus-asset-source-scenario` |
| `telemetry-sink` | `TelemetrySink` | `docs/specs/agent/telemetry.md` § sink trait | `nexus-telemetry-sink-honeycomb`, `nexus-telemetry-sink-sentry`, `nexus-telemetry-sink-glitchtip`, `nexus-telemetry-sink-datadog` |
| `feature-flag` | `FlagProvider` | `docs/guides/liveops/feature-flags.md` § provider trait | `nexus-feature-flag-growthbook`, `nexus-feature-flag-launchdarkly`, `nexus-feature-flag-unleash`, `nexus-feature-flag-custom-redis` |
| `input` | `InputDevice` | `docs/specs/core/hal.md` § input plugin | `nexus-input-eye-tracker-tobii`, `nexus-input-foot-pedals`, `nexus-input-midi-controller`, `nexus-community-input-eeg` |
| `platform` | `PlatformBackend` | `docs/specs/core/hal.md` § platform plugin | `nexus-platform-steamdeck`, `nexus-platform-orbis-stub`, `nexus-community-platform-haiku` |
| `script-lang` | `ScriptVm` | `docs/specs/scripting/overview.md` § vm trait | `nexus-script-lang-wren`, `nexus-script-lang-janet`, `nexus-script-lang-wasm-component` (note: Lua + Rune are the engine defaults in `nexus-script` — both default-on; opt-out via Cargo features. Resolved 2026-05-17.) |
| `genre-toolkit` | (no trait — helper library) | author's docs | `nexus-genre-toolkit-quests`, `nexus-genre-toolkit-inventory`, `nexus-genre-toolkit-dialogue` |
| `tools` | (no trait — build/codegen tool) | author's docs | `nexus-tools-shader-permutation-gen`, `nexus-tools-asset-thumbnailer` |
| `test-fixtures` | (no trait — scenario/replay assets) | `docs/specs/agent/scenarios.md` § fixture pack | `nexus-test-fixtures-mp-handshake`, `nexus-test-fixtures-determinism-suite` |
| `voxel` | `VoxelStorage`, `VoxelMesher` | `docs/specs/voxel/overview.md` | `nexus-voxel-core`, `nexus-voxel-greedy-mesh`, `nexus-voxel-marching-cubes` |
| `cellular` | `CellularElement`, `CellularStep` | `docs/specs/cellular-automata/overview.md` | `nexus-cellular-falling-sand`, `nexus-cellular-noita-elements` |
| `massive` | `MassiveQuery`, `FlowField` | `docs/specs/massive-rts/overview.md` | `nexus-massive-rts-flowfield`, `nexus-massive-rts-instanced-render` |
| `seamless` | `ZoneHandoff`, `PredictiveStream` | `docs/specs/seamless-world/overview.md` | `nexus-seamless-zone-handoff`, `nexus-seamless-predictive-stream` |
| `weather` | `WindField`, `Precipitation` | `docs/specs/weather-as-system/overview.md` | `nexus-weather-windfield`, `nexus-weather-precipitation` |
| `destruction` | `Fracture`, `DebrisStream` | `docs/specs/destruction-first/overview.md` | `nexus-destruction-voronoi`, `nexus-destruction-persistent` |
| `deformable` | `EditableHeightmap`, `MultiMaterial` | `docs/specs/deformable-terrain/overview.md` | `nexus-deformable-heightmap`, `nexus-deformable-multimaterial` |
| `procgen` | `WfcSolver`, `SeededRng` | `docs/specs/procgen-first/overview.md` | `nexus-procgen-wfc`, `nexus-procgen-seeded-rng` |
| `sim` | `TickSim`, `HeadlessServer` | `docs/specs/sim-game/overview.md` | `nexus-sim-tick-decoupled`, `nexus-sim-headless-server` |
| `rhythm` | `BeatGrid`, `LatencyCalibrator` | `docs/specs/rhythm-game/overview.md` | `nexus-rhythm-beat-grid`, `nexus-rhythm-latency-calibrate` |
| `text` | `RichTextRender`, `DialogueDSL` | `docs/specs/text-heavy/overview.md` | `nexus-text-rich-render`, `nexus-text-dialogue-dsl` |
| `4x` | `HexGrid`, `FogOfWar` | `docs/specs/4x-strategy/overview.md` | `nexus-4x-hexgrid`, `nexus-4x-fogofwar` |

Categories rows for `voxel` through `4x` added 2026-05-17 per Agent 32's `docs/architecture/08-compose-dont-build.md` §"Cross-agent flags" — see `docs/architecture/decisions-resolved.md`.

A crate that does not fit any of the above MUST petition for a new category via PR against this file. New categories require an ADR.

## Per-category requirements

| Category | Headless-safe | Deterministic-required | Mods-compat required | Min coverage |
|---|---|---|---|---|
| `genre` | yes | yes | yes | 80% |
| `style` | yes (no-op renderer in headless) | n/a | yes | 70% |
| `physics` | yes | yes (Law 9) | yes | 85% |
| `net` | yes | yes | yes | 80% |
| `audio` | yes (no-op in headless) | n/a | yes | 70% |
| `asset-source` | yes (offline mock required) | n/a | n/a | 70% |
| `telemetry-sink` | yes | n/a | n/a | 60% |
| `feature-flag` | yes (offline mode required) | n/a | n/a | 60% |
| `input` | yes (no-op in headless) | yes | n/a | 70% |
| `platform` | yes | yes | yes | 80% |
| `script-lang` | yes | yes | yes | 80% |
| `genre-toolkit` | yes | yes | yes | 70% |
| `tools` | yes | n/a | n/a | 60% |
| `test-fixtures` | yes | yes | n/a | n/a |
| `voxel` | yes | yes | yes | 80% |
| `cellular` | yes | yes | yes | 80% |
| `massive` | yes | yes | yes | 80% |
| `seamless` | yes | yes | yes | 80% |
| `weather` | yes | yes | yes | 80% |
| `destruction` | yes | yes | yes | 80% |
| `deformable` | yes | yes | yes | 80% |
| `procgen` | yes | yes | yes | 80% |
| `sim` | yes | yes | yes | 80% |
| `rhythm` | yes | yes | yes | 80% |
| `text` | yes | yes | yes | 80% |
| `4x` | yes | yes | yes | 80% |

→ Floor + per-category enforcement: `docs/specs/crates/testing.md`.

## Plugin trait shape (universal contract)

Every category trait satisfies this shape, regardless of system:

```rust
pub trait NexusPlugin: Send + Sync + 'static {
    /// Stable identifier. Matches Cargo crate name.
    const ID: &'static str;
    /// Engine semver range supported.
    const ENGINE_COMPAT: &'static str;
    /// Build the plugin into a running app.
    fn build(&self, app: &mut AppBuilder) -> Result<(), PluginError>;
    /// Optional teardown for hot-reload paths.
    fn teardown(&self, app: &mut AppBuilder) -> Result<(), PluginError> { Ok(()) }
}
```

Category traits (`GenrePlugin`, `StylePipeline`, `PhysicsBackend`, …) extend this base. Definitions live in their owning system spec.

## Discovery by category

`crates.io` does not natively support category filters beyond its built-in taxonomy. Discovery uses:

- `keywords = ["nexus", "nexus-genre"]` in `Cargo.toml` (crates.io supports up to 5 keywords).
- `categories = ["game-engines"]` (closest official crates.io category).
- The `[package.metadata.nexus].category` field is the authoritative source; indexers parse it.

→ `docs/specs/crates/discovery.md`.

## Worked example: `nexus-style-anime`

| Field | Value |
|---|---|
| Category | `style` |
| Trait | `StylePipeline` |
| Engine compat | `^1.0` |
| Headless-safe | yes |
| Mods-compat | yes |
| License | MIT |
| Coverage floor | 70% |

Author flow: `nexus crate new nexus-style-anime --category style` → scaffolds with `impl StylePipeline for AnimeStyle`. → `docs/guides/crates/publishing.md`.

## Cross-references

- → `docs/specs/crates/manifest.md` for the `category` enum.
- → `docs/specs/crates/naming.md` — subname rules per category.
- → `docs/specs/crates/quality-bar.md` — audit criteria differ by category (renderer plugin gets visual regression, telemetry plugin does not).
- → `docs/architecture/04-workspace-layout.md` — engine-shipped category exemplars (`crates/styles/nexus-style-pbr`, `crates/genres/nexus-genre-fps`).

## Open Questions

- `[DECISION NEEDED]` Should `genre` allow multiple secondary genres per crate, or one crate per genre? Default proposal: one crate per primary genre; toolkits go in `genre-toolkit`.
- `[DECISION NEEDED]` Is `script-lang` headless-safe assertion realistic for VMs that need GPU compute? Likely yes — script logic runs on CPU.
- `[BENCHMARK NEEDED]` Coverage floors are heuristic; calibrate against measured costs once the first community crates ship.
- `[AGENT: 12]` Author `docs/specs/genres/plugin-trait.md` — the universal `GenrePlugin` trait.
