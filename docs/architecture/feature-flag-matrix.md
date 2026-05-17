<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Cargo Feature & Workspace Layout Matrix

> Canonical `[features]` table for every engine crate. The single source of truth Agent 01 (`04-workspace-layout.md`) defers to for default-features policy.
>
> Rule: every genre, every style, every physics extension, every netcode mode, every audio DSP pack is feature-gated OR a separate crate. Default-features set is minimal core only; everything else opts in via `Nexus.toml`.
>
> Authoritative for proposed Law #13 — see `docs/architecture/06-modularity.md`.

---

## Default-features policy

| Policy | Rule |
|---|---|
| Minimal core | `default = ["headless"]` for every crate except where a stricter minimum applies. |
| No `default = ["all"]` | Forbidden. `nexus-merge` lint `no_default_all_features` rejects. |
| No cyclic feature graphs | Forbidden. `nexus-merge` lint `no_cyclic_features`. |
| No silent re-enable | A feature MUST NOT re-enable a dep the dev removed. Lint `no_feature_reenables_removed_dep`. |
| Headless first | `headless` is default-on everywhere. Opt-out via `--no-default-features --features <real-backend>`. |
| Determinism first | `nexus-physics` ships `enhanced-determinism` default-on (Law 9 requirement). |
| Game opt-in path | Dev never edits `[features]` in plugin crates directly. They set `Nexus.toml [features]` and `[crates]`; `nexus build` translates to Cargo `--features` per crate. |

---

## Forbidden patterns

| Pattern | Why forbidden |
|---|---|
| `default = ["all"]` | Defeats opt-in modularity (proposed Law 13). |
| `default = ["fluid", "soft-body", "ray-tracing", "voice-chat"]` | Heavy subsystems must be opt-in. |
| Feature `A` enables `B`; feature `B` enables `A` | Cyclic. Cargo handles it but the graph is unmaintainable. |
| Removing a dep without removing the feature that gated it | Resurrection bug; `nexus-merge` lint catches. |
| Cross-crate feature passthrough beyond two hops | Spaghetti. If you need three-deep passthrough, refactor into a sub-crate. |
| Renaming a feature without a deprecation alias | Breaks downstream `Nexus.toml`. Use a `deprecated = "renamed-to-X"` shim for one minor release cycle. |

---

## Crate-by-crate matrix

Each row: feature name · what it gates · default? · hard-deps · known callers.

### `nexus-core`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `headless` | builds without renderer/window stubs | yes | — | every crate (transitively) |
| `parallel` | rayon-based parallel scheduler | yes | `rayon` | every game |
| `serde` | serde derives on World/Entity/Component | yes | `serde` | replay, snapshot, networking |
| `tracing-json` | structured tracing subscriber default | yes | `tracing-subscriber` | every binary |
| `proptest` | property-test harness exports | no | `proptest` | core's own tests + integration tests |

### `nexus-hal`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `x11` | X11 windowing on Linux | conditional (linux) | `winit/x11` | client games on Linux X11 |
| `wayland` | Wayland windowing on Linux | conditional (linux) | `winit/wayland` | client games on Linux Wayland |
| `wasm` | wasm32 web backend | conditional (wasm) | `winit/web` | web builds |
| `android` | Android backend | conditional (android) | `winit/android` | mobile builds |
| `ios` | iOS backend | conditional (ios) | `winit/ios` | mobile builds |
| `headless-hal` | no display, stub clock, in-memory FS | no | — | servers, CI, agents |

### `nexus-assets`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `import-gltf` | glTF importer | yes | `gltf` | 3D games |
| `import-png` | PNG/JPEG importer | yes | `image` | every game |
| `import-fbx` | FBX importer | no | `fbx` (third-party) | AAA 3D pipelines |
| `import-obj` | OBJ importer | no | `tobj` | indie 3D, hobby |
| `streaming` | async asset streaming | yes | `tokio` | open-world games |
| `compression-zstd` | zstd-compressed assets | yes | `zstd` | every shipped game |
| `compression-lz4` | lz4-compressed assets | no | `lz4_flex` | latency-sensitive paths |
| `gen-meshy` | Meshy AI generator | no | `reqwest` | dev-time asset gen |
| `gen-scenario` | Scenario AI generator | no | `reqwest` | dev-time asset gen |
| `gen-flux` | local FLUX generator | no | `reqwest` | dev-time asset gen |
| `kenney` | Kenney asset index | no | `reqwest` | indie projects |
| `polyhaven` | Poly Haven index | no | `reqwest` | 3D PBR projects |

### `nexus-renderer`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `headless` | no-surface renderer (validates only) | yes | — | servers, CI, agents |
| `vulkan` | Vulkan backend via wgpu | no | `wgpu/vulkan` | Linux/Windows client |
| `metal` | Metal backend | no | `wgpu/metal` | macOS/iOS client |
| `dx12` | DX12 backend | no | `wgpu/dx12` | Windows client |
| `gles` | OpenGL ES backend | no | `wgpu/gles` | low-end mobile |
| `wasm` | WebGPU/WebGL2 backend | no | `wgpu/webgpu` | web builds |
| `pbr` | PBR materials + IBL | no | — | 3D games (paired with `nexus-style-pbr`) |
| `2d-batcher` | sprite batcher | no | — | 2D games |
| `ray-tracing` | HW ray tracing path | no | `wgpu/ray-tracing` | high-end PC only |
| `post-fx-bloom` | bloom post-processing | no | — | PBR games |
| `post-fx-tonemap` | filmic tonemapping | no | — | PBR games |

### `nexus-physics`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `rapier3d` | 3D rigid body | yes | `rapier3d` | 3D games |
| `rapier2d` | 2D rigid body | yes | `rapier2d` | 2D games |
| `enhanced-determinism` | bit-deterministic solver | yes | rapier ext | EVERY game (Law 9) |
| `fluid` | SPH fluid sim | no | `salva3d` | sims, survival |
| `soft-body` | soft-body + cloth | no | rapier soft | sims, RPG cloaks |
| `character-controller` | kinematic char controller | yes | — | every player game |
| `vehicle` | wheeled vehicle model | no | — | racing |
| `debug-draw` | debug shape events | no | — | dev profile only |

### `nexus-audio`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `stereo` | basic stereo mix | yes | `cpal` | every game |
| `spatial` | 3D positional audio | no | — | 3D games |
| `hrtf` | head-related transfer function | no | `hrtf` | VR, competitive FPS |
| `convolution` | reverb via convolution | no | `realfft` | sims, AAA |
| `streaming` | streamed music tracks | yes | `symphonia` | every game |
| `voice-chat` | mic capture + Opus encode | no | `opus` | multiplayer with VoIP |
| `adaptive-music` | layered/stem-based music | no | — | RPG, action |
| `headless-audio` | silent mix (no device) | yes | — | servers, CI |

### `nexus-net`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `quic` | QUIC transport | yes | `quinn` | every networked game |
| `udp-raw` | raw UDP transport | no | — | constrained environments |
| `relay` | NAT-traversal relay client | no | — | P2P games behind NAT |
| `rollback` | rollback netcode | no | — | fighting, MOBA |
| `replication` | server-authoritative replication | no | — | FPS, MMORPG |
| `hybrid` | replication + client prediction | no | enables `replication` | most multiplayer |
| `interest-management` | zone-of-interest filtering | no | — | MMORPG, open-world |
| `anti-cheat-server` | server-side cheat heuristics | no | — | competitive games |

### `nexus-script`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `lua` | mlua + Lua 5.4 | yes | `mlua` | every scripted game |
| `rune` | Rune embedded scripting | yes | `rune` | mods, sandbox |
| `hot-reload` | file-watch reload | no | `notify` | dev profile only |
| `sandbox-strict` | capability-gated sandbox | yes | — | mods (Law-relevant) |

### `nexus-agent`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `json-rpc` | JSON-RPC server | yes | `jsonrpsee` | agent SDK clients |
| `headless-driver` | headless tick loop | yes | — | CI, scenario runner |
| `replay` | snapshot + input log | yes | — | agents, debugging |
| `scenario` | TOML scenario runner | yes | — | CI scenario suite |
| `python-bindings` | pyo3 bindings sub-crate | no | `pyo3` | Python consumers |
| `semantic-api` | NL → RPC translation | no | — | high-level agent ops |
| `telemetry-otlp` | OTLP telemetry export | no | `opentelemetry-otlp` | prod observability |

### `nexus-editor`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `egui-backend` | egui-based panels | yes | `egui` | every editor build |
| `live-reload` | scene/asset live reload | no | — | dev profile |
| `debug-overlays` | wireframe/normals overlays | no | — | dev profile |
| `shader-graph` | shader graph node UI | no | — | renderer authors |
| `headless-editor` | editor API w/o UI (for MCP) | yes | — | agent-driven editing |

### `nexus-cli`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `git` | git2 for `nexus new --git` | yes | `git2` | scaffolding |
| `network` | reqwest for `nexus add` resolution | yes | `reqwest` | crate resolution |
| `wizard` | interactive `nexus new` prompts | no | `dialoguer` | human dev workflow |

### `nexus-merge`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `syn-ast` | AST-based lints | yes | `syn`, `quote` | CI |
| `cargo-graph` | edge allow-list checks | yes | `cargo_metadata` | CI |
| `coverage-gate` | llvm-cov delta gate | yes | `llvm-cov` | CI |

### `crates/styles/nexus-style-pbr`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `ibl` | image-based lighting | yes | — | 3D PBR games |
| `parallax-occlusion` | POM mapping | no | — | high-end visual |
| `tessellation` | hardware tessellation | no | — | AAA |
| `subsurface-scattering` | SSS shader | no | — | character-heavy games |

### `crates/styles/nexus-style-npr`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `cel-shading` | cel/toon shader | yes | — | every NPR game |
| `outline-postpass` | edge-detect outlines | yes | — | NPR look |
| `hatching` | hatching pattern shader | no | — | sketch-style games |

### `crates/styles/nexus-style-pixel`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `palette-quantize` | LUT palette enforcement | yes | — | every pixel game |
| `dither` | ordered dither | yes | — | retro look |
| `crt-postfx` | CRT scanline shader | no | — | retro aesthetic |

### `crates/styles/nexus-style-2d`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `sprite-batch` | sprite batcher | yes | — | every 2D game |
| `tilemap` | tilemap renderer | yes | — | platformer, top-down |
| `9-slice` | 9-slice UI sprites | yes | — | UI-heavy games |

### `crates/styles/nexus-style-mixed`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `pbr-bridge` | mount PBR sub-pipeline | no | enables `nexus-style-pbr` | hybrid games |
| `2d-bridge` | mount 2D sub-pipeline | no | enables `nexus-style-2d` | hybrid games |
| `pixel-bridge` | mount pixel sub-pipeline | no | enables `nexus-style-pixel` | hybrid games |

### `crates/genres/nexus-genre-*`

Each genre crate exposes a small set of features. Common pattern:

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `default-prefabs` | ship starter prefabs/scenes | yes | — | every consumer |
| `default-scripts` | ship starter Lua/Rune scripts | yes | — | every consumer |
| `tutorials` | tutorial scene + scripts | no | — | template projects |
| `<genre-specific>` | e.g. `lane-jungle` on MOBA, `pcg-rng` on roguelike | varies | — | per-game |

Forbidden in genre crates: any feature that pulls in another genre crate, renderer style, or networking mode directly. Use ECS components published by those crates only (per Law 3 + the enforcement rule in `docs/architecture/06-modularity.md`).

### `crates/sdks/nexus-agent-sdk-rs`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `tokio-rt` | tokio runtime | yes | `tokio` | every consumer |
| `tls` | rustls for HTTPS endpoints | yes | `rustls` | remote agents |
| `cli` | bundle a thin CLI wrapper | no | `clap` | `nexus agent` binary |

### `crates/sdks/nexus-agent-sdk-py`

| Feature | Gates | Default | Hard-deps | Callers |
|---|---|---|---|---|
| `extension-module` | pyo3 extension build | yes | `pyo3` | maturin wheel |

---

## How `Nexus.toml` maps to Cargo features

`nexus build` translates `Nexus.toml` to the `cargo build` command. Mapping:

| Nexus.toml field | Cargo translation |
|---|---|
| `[engine] features = ["renderer", "physics", "audio"]` | enables matching subsystem crates' default features |
| `[style] primary = "pbr"` | adds `nexus-style-pbr` to deps + `renderer/pbr` feature |
| `[genres] primary = "moba"` | adds `nexus-genre-moba` to deps |
| `[networking] model = "rollback"` | enables `nexus-net/rollback` |
| `[features] ray_tracing = true` | enables `nexus-renderer/ray-tracing` |
| `[features] audio = "spatial"` | enables `nexus-audio/spatial` |
| `[crates] custom = ["nx-anime-style"]` | adds third-party crate; auto-discovery via `inventory` |

Mapping table authoritative in this file; `nexus-cli` consumes it. Schema validation per `docs/game-template/nexus-toml.md`.

---

## Test matrix

`nexus test --feature-matrix` runs a curated subset per CI; full Cartesian product nightly.

| Matrix tier | Combos | Cadence |
|---|---|---|
| Smoke | minimal core + one renderer backend + one physics build | every PR |
| Curated | 8 combos covering MOBA, FPS, RPG, RTS, platformer, racing, VN, roguelike | every PR |
| Full | every demo game × every supported target | nightly |
| Exhaustive | Cartesian product of `[features]` per crate | weekly, on a beefy runner |

Regressions in any tier block merge per Law 4 + Law 5.

---

## Known gaps + cross-agent flags

- `[DECISION NEEDED]` Final feature names for `nexus-renderer` backends — currently mirror wgpu's; confirm with Agent 03 (renderer specs).
- `[DECISION NEEDED]` Whether `nexus-script/lua` and `nexus-script/rune` should both be default-on, or default to `lua` only. Bigger binary vs broader sandbox story.
- `[DECISION NEEDED]` `nexus-physics/enhanced-determinism` default-on: confirm rapier crate stability. If unstable, drop to "opt-in but enforced when `networking.model = rollback`" per `Nexus.toml` validator rule `E_NXTOML_006`.
- `[DECISION NEEDED]` Per-genre `default-prefabs` — should they pull in `nexus-assets/import-png` transitively, or stay asset-source-agnostic? Recommendation: asset-source-agnostic; require consumer to declare.
- Cross-flag Agent 12 (genres) — every new genre crate MUST update this matrix in its PR.
- Cross-flag Agent 04 (styles) — same.
- Cross-flag Agent 07 (networking) — every new netcode mode is a new feature row here.
- Cross-flag Agent 28 (crates) — third-party crates in `nexus-community-*` follow this same default-features policy; non-compliance blocks Verified tier.

## Cross-references

- → `docs/architecture/04-workspace-layout.md` — workspace crate list this matrix annotates.
- → `docs/architecture/06-modularity.md` — manifesto + proposed Law 13.
- → `docs/specs/crates/plugin-trait.md` — plugin manifest's `features` declaration.
- → `docs/specs/crates/rails-plugin-model.md` — convention rules.
- → `docs/game-template/nexus-toml.md` — `[features]` consumer schema.
- → `docs/game-template/cli.md` — `nexus build` flag surface.
- → Cargo features book: https://doc.rust-lang.org/cargo/reference/features.html.
- → Cargo workspaces book: https://doc.rust-lang.org/cargo/reference/workspaces.html.
- → "Default features hell" prior art: search `cargo default features pitfall` (https://blog.rust-lang.org/inside-rust/, https://users.rust-lang.org/ has multiple cautionary threads).
