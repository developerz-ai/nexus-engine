<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Modularity Manifesto

> Two load-bearing ideas. One file. Read both. Build everything else on top.
>
> 1. **Opt-in compile-time modularity.** No game compiles code it does not declare.
> 2. **Rails-style plugin model.** `nexus add <crate>` → cargo resolves → plugin auto-wires on next build.
>
> Foundational to the 100M-LOC thesis (`docs/initial/vision.md` §"The Nexus Thesis"). Nobody compiles 100M LOC for any one game. Each game compiles the subset it asks for.

---

## Status

- **Spec status.** Ratified as **Law #14** via ADR `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md` (2026-05-17). Original proposed numbering was #13; renumbered to #14 because Agent 27 took the #13 slot for RPC Parity.
- **Owners.** Agent 29 (this file); cross-touches Agent 01 (`01-principles.md`, `04-workspace-layout.md`), Agent 15 (`game-template/*`), Agent 28 (`specs/crates/*`).
- **Enforced by.** `principle-keeper` subagent (PR review) + `cargo deny` graph rules + `nexus-merge` lint `feature_gate_required_for_cross_genre_dep`.

---

## The two laws of Nexus modularity

| # | Rule | Mechanism |
|---|---|---|
| Opt-in compile-time | Engine is inherently modular. Every genre, style, physics extension, networking backend, audio DSP, asset generator = separate crate or gated Cargo feature. | Cargo features + workspace member selection (`Nexus.toml [crates]` resolves to `[dependencies]` + `--features`). |
| Rails plugin model | Auto-wiring on `cargo add`. Convention-over-config. Zero boilerplate to consume. | `NexusPlugin` trait + `inventory` registry → engine init scans, mounts, schedules. → `docs/specs/crates/plugin-trait.md`. |

Restate both rules in every spec that touches build configuration or plugin registration.

---

## Why this is fundamental

100M LOC at maturity = unbounded community surface. Naive monolithic compile = unshippable. The thesis only works if:

- A MOBA does not drag in platformer code, VN dialogue tree, or fluid sim.
- A 2D pixel game does not drag in PBR, ray tracing, or rollback netcode.
- A single-player VN does not drag in physics, networking, or (if dev opts out) the AI agent surface.

Each game's compile graph is a **proper subset** of the workspace. The unused crates are dead code at compile time — not gated at runtime, not stripped by LTO, **never seen by the compiler**.

→ Cross-link: `docs/initial/vision.md` §"The Nexus Thesis", `docs/architecture/01-principles.md` Law 3 (Sacred Boundaries), Law 5 (Performance Is a Spec).

---

## Compile graph diagram — "all crates exist" vs "this game compiles"

```
                              ALL CRATES EXIST (workspace)
   ┌───────────────────────────────────────────────────────────────────┐
   │ nexus-core   nexus-hal   nexus-assets   nexus-renderer            │
   │ nexus-physics  nexus-audio  nexus-net  nexus-script  nexus-agent  │
   │                                                                   │
   │ styles/     pbr · npr · pixel · 2d · mixed                        │
   │ genres/     fps rpg mmorpg rts moba platformer racing survival    │
   │             horror fighting battleroyal roguelike towdef puzzle   │
   │             visualnovel openworld                                 │
   │ third-party crates.io: nexus-style-anime, nexus-genre-deckbuilder,│
   │             nexus-net-geo-routing, nexus-audio-spectral, …        │
   └───────────────────────────────────────────────────────────────────┘
                                  │
                  Nexus.toml selects subset
                                  ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │             THIS GAME'S COMPILE GRAPH (MOBA example)              │
   │                                                                   │
   │ nexus-core ── nexus-hal ── nexus-assets ── nexus-renderer (PBR)   │
   │      │            │             │              │                  │
   │      └── nexus-physics (rapier, enhanced-determinism)             │
   │      └── nexus-audio (spatial)                                    │
   │      └── nexus-net (rollback, quic)                               │
   │      └── nexus-script (lua + rune)                                │
   │      └── nexus-agent (sdk + headless)                             │
   │      └── nexus-style-pbr                                          │
   │      └── nexus-genre-moba                                         │
   │                                                                   │
   │ NOT COMPILED: nexus-genre-platformer, nexus-genre-visualnovel,    │
   │   nexus-genre-roguelike, nexus-style-pixel, nexus-style-2d,       │
   │   physics fluid/soft-body, audio convolution, mmorpg zone stream  │
   └───────────────────────────────────────────────────────────────────┘
```

Every other game gets an analogously narrowed graph.

---

## Worked example #1 — MOBA (5v5 competitive, rollback-netcoded)

Manifest excerpt (illustrative):

```toml
[engine]
features = ["renderer", "physics", "audio", "networking", "scripting", "agent"]

[style]
primary = "pbr"

[genres]
primary = "moba"

[networking]
model = "rollback"
transport = "quic"
max_players = 10
```

**Compiled in.**

| Crate / feature | Why |
|---|---|
| `nexus-core` | substrate (always) |
| `nexus-hal` (`x11`, `wayland`) | window + input |
| `nexus-assets` (`import-gltf`, `kenney`) | character + map assets |
| `nexus-renderer` (`vulkan`, no `headless` for client; `headless` for server) | per-pixel PBR competitive look |
| `nexus-physics` (`enhanced-determinism`) | server-authoritative hit detection |
| `nexus-audio` (`hrtf`, `spatial`) | positional ability audio |
| `nexus-net` (`quic`, rollback module) | tournament-grade netcode |
| `nexus-script` (`lua`, `hot-reload`) | ability balance tuning |
| `nexus-agent` | balance bot, replay analysis |
| `nexus-style-pbr` | shader pack |
| `nexus-genre-moba` | lane/jungle/tower/minion components + systems |

**Dead code at compile time (NOT in build graph).**

`nexus-genre-platformer`, `nexus-genre-visualnovel`, `nexus-genre-mmorpg`, `nexus-genre-roguelike`, `nexus-genre-towdef`, `nexus-genre-survival`, `nexus-genre-horror`, `nexus-genre-fighting`, `nexus-genre-puzzle`, `nexus-genre-openworld`, `nexus-genre-racing`, `nexus-genre-battleroyal`, `nexus-genre-rpg`, `nexus-genre-rts`, `nexus-genre-fps`, `nexus-style-pixel`, `nexus-style-2d`, `nexus-style-mixed`, `nexus-style-npr`, `nexus-physics/fluid`, `nexus-physics/soft-body`, `nexus-audio/convolution`, MMORPG zone streaming, VN dialogue tree, roguelike PCG RNG.

---

## Worked example #2 — 2D pixel-art platformer (single-player, offline)

Manifest excerpt:

```toml
[engine]
features = ["renderer", "physics", "audio", "scripting"]  # no networking, no agent

[style]
primary = "pixel"
palette = "assets/palette.png"

[genres]
primary = "platformer"

[networking]
model = "off"
```

**Compiled in.**

| Crate / feature | Why |
|---|---|
| `nexus-core` | substrate |
| `nexus-hal` (`x11`, `wayland`, no audio HRTF) | window + input |
| `nexus-assets` (`import-png`, `kenney`) | tilesets, sprites |
| `nexus-renderer` (`vulkan`, `2d-batcher`) | 2D batched render path only |
| `nexus-physics` (`rapier2d`, no fluid, no soft-body) | platformer collisions |
| `nexus-audio` (`stereo`) | chiptune music + SFX |
| `nexus-script` (`lua`) | level scripts |
| `nexus-style-pixel` | nearest-neighbor sampler, palette quantizer, dither shader |
| `nexus-genre-platformer` | character controller, parallax, checkpoints, enemy AI |

**Dead code at compile time.**

`nexus-style-pbr`, `nexus-style-npr`, `nexus-style-2d` (replaced by `pixel`), `nexus-style-mixed`, `nexus-net` (all of it), `nexus-agent` (opted out), `nexus-physics/fluid`, `nexus-physics/soft-body`, `nexus-physics/rapier3d` (2D-only build), `nexus-audio/hrtf`, `nexus-audio/convolution`, `nexus-audio/voice-chat`, all PBR shaders, all genres except platformer, ray-tracing, MMORPG zone streaming, rollback netcode, agent JSON-RPC server.

---

## Worked example #3 — Single-player narrative visual novel

Manifest excerpt:

```toml
[engine]
features = ["renderer", "audio", "scripting"]  # no physics, no networking, no agent (opt-out)

[style]
primary = "2d"

[genres]
primary = "visualnovel"
```

**Compiled in.**

| Crate / feature | Why |
|---|---|
| `nexus-core` | substrate |
| `nexus-hal` | window + input |
| `nexus-assets` (`import-png`, `streaming`) | sprite + voice asset streaming |
| `nexus-renderer` (`2d-batcher`, no `vulkan` PBR path) | sprite composition + text rendering |
| `nexus-audio` (`stereo`, `streaming`) | voice + music |
| `nexus-script` (`lua`) | scene + dialogue scripts |
| `nexus-style-2d` | flat-shaded 2D pipeline |
| `nexus-genre-visualnovel` | dialogue tree, choice graph, save/load, branching |

**Dead code at compile time.**

`nexus-physics` (entire crate), `nexus-net` (entire crate), `nexus-agent` (opted out — dev declined AI surface), `nexus-style-pbr/npr/pixel/mixed`, every other genre crate, rollback netcode, ray tracing, fluid/soft-body, HRTF, MMORPG zone streaming, character controller, every shader for PBR.

---

## Compile-time savings target (per-example)

`[BENCHMARK NEEDED]` — pin actual numbers once initial integration lands.

| Example | LOC compiled (target) | Build time (cold, target) | Binary size (release, target) |
|---|---|---|---|
| Monolithic (everything) | ~12M (v1.0); 100M (mature) | 30+ min cold | 800 MB+ |
| MOBA | ~3.5M | < 8 min cold; < 30s incremental | ~180 MB stripped |
| 2D pixel platformer | ~1.2M | < 3 min cold; < 10s incremental | ~45 MB stripped |
| Single-player VN | ~0.8M | < 2 min cold; < 8s incremental | ~30 MB stripped |

Reference machine: per Law 5 — `[DECISION NEEDED]` (Ryzen 9 7950X + RTX 4070 + 64 GB Linux baseline).

Methodology: `nexus build --profile=release --target=linux-x86_64 --json` reports compiled-LOC, wall-clock, artifact bytes. Tracked in CI per-example; regression > 10% blocks merge under Law 5.

---

## The enforcement rule

> **A PR that adds a hard dependency across an unrelated genre, style, or physics boundary is REJECTED by `nexus-merge`. No exceptions without an ADR.**

Examples of rejection:

| PR change | Rejected because |
|---|---|
| `nexus-genre-moba` adds `nexus-genre-visualnovel` to `[dependencies]` | cross-genre dep |
| `nexus-style-pixel` adds `nexus-style-pbr` to `[dependencies]` | cross-style dep |
| `nexus-physics/fluid` becomes default-on | makes fluid non-opt-in |
| `nexus-genre-platformer` adds direct `nexus-net` dep | genres must not depend on networking directly — use ECS components published by `nexus-net` (per Law 3) |
| `nexus-core` adds `nexus-renderer` | substrate cannot depend on subsystems |

Enforced by:

- `cargo deny` graph rule (allow-list of edges; see `deny.toml` in `docs/architecture/04-workspace-layout.md`).
- `nexus-merge` lint `feature_gate_required_for_cross_genre_dep`.
- `principle-keeper` subagent review (final gate; routes cross-genre PRs for human ratification only if the PR also amends this manifesto via ADR).

Mastermind / `nexus-merge` routes any PR matching the rejected patterns above to `principle-keeper` before any other reviewer.

---

## Proposed Law #13 — Ratified as Law #14 (Opt-in Modularity)

> **Status: Ratified as Law #14 — see ADR `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`.**
> Renumbered from "proposed #13" to **Law #14** at ratification because Agent 27 took the #13 slot for Agent–Editor RPC Parity. The canonical, ratified text now lives in `docs/architecture/01-principles.md` §"Law 14 — Opt-in Modularity". Original proposal text retained below for the rationale + conformance detail.

Original proposal text (now ratified verbatim):

> **Law 13 — Opt-in Modularity.**
> **Statement.** No game compiles code it does not declare. Every genre, every style, every physics extension, every networking backend, every audio DSP pack is a separate crate OR a Cargo feature, default-off unless required by `nexus-core`. The default-features set is minimal core only; everything else opts in via `Nexus.toml`.
> **Test of conformance.** (a) `cargo tree -e features` on any demo game shows only declared features. (b) Removing a crate from `Nexus.toml` removes it from the compile graph (verified by `cargo build --build-plan --json`). (c) No crate sets `default-features = ["all"]`. (d) No cyclic feature graph.
> **Rationale.** 100M-LOC thesis. Nobody compiles 100M LOC for any one game.
> **Enforced by.** `nexus-merge` lints `no_default_all_features`, `no_cyclic_features`, `feature_gate_required_for_cross_genre_dep`; `cargo deny` edge allow-list.

Ratified via ADR `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`; canonical text now in `docs/architecture/01-principles.md` §"Law 14".

---

## Honest pitfalls

| Pitfall | Mitigation |
|---|---|
| Feature-flag combinatorial explosion → untested combinations ship | Test matrix discipline: `nexus test --feature-matrix` runs N curated combos per CI; full Cartesian product nightly. → `docs/specs/crates/testing.md`. |
| Conditional `cfg(feature = "...")` clutter in source | Convention: feature-gated modules live in `src/<feature>.rs` with one top-level `#[cfg]`. No scattered `cfg` inside function bodies. |
| `inventory` crate startup cost on WASM | Measure on first integration. If > 50 ms, fall back to explicit `register_all()` codegen via `nexus-codegen`. `[DECISION NEEDED]` — pick approach at v0.2. |
| Plugin load-order bugs (Rails-world classic) | Plugins declare `after`/`before` constraints in their manifest; `nexus-engine` topo-sorts at boot; cycle → fail-fast structured error. → `docs/specs/crates/plugin-trait.md`. |
| Two plugins register the same `SystemId` | Fail-fast at boot with `E_PLUGIN_CONFLICT` (structured error per Law 10). No silent override. |
| Dev removes a crate but `Nexus.toml` still references it | `nexus lint` errors with `E_NXTOML_010` and suggests `nexus remove <crate>`. |
| Default-features hell (Cargo footgun: enabling a feature silently re-enables a removed dep) | `nexus-merge` lint `no_feature_reenables_removed_dep` parses `[features]` graph for resurrection edges. |
| WASM tree-shaking fails on `inventory` symbols | Verify with `wasm-opt --strip-dwarf` size before/after; if unused plugin code ships in WASM, switch to compile-time codegen registration. |

---

## Cross-references

- → `docs/architecture/04-workspace-layout.md` — the workspace shape this manifesto modularizes.
- → `docs/architecture/01-principles.md` — Law 3 (boundaries), Law 5 (perf), Law 7 (MIT), Law 8 (headless). Proposed Law 13 lives here once ratified.
- → `docs/architecture/feature-flag-matrix.md` — canonical Cargo `[features]` per crate.
- → `docs/specs/crates/overview.md` — third-party crate ecosystem (the unbounded surface).
- → `docs/specs/crates/categories.md` — extension surfaces + trait registry.
- → `docs/specs/crates/rails-plugin-model.md` — the Rails analogy in full.
- → `docs/specs/crates/plugin-trait.md` — `NexusPlugin` trait spec.
- → `docs/specs/scripts/nexus-add-resolution.md` — how `nexus add` wires the crate.
- → `docs/game-template/nexus-toml.md` — `[crates]`, `[genres]`, `[features]` sections.
- → `docs/game-template/cli.md` — `nexus add` surface.
- → `docs/initial/vision.md` §"The Nexus Thesis", §"The Ecosystem".
- README repo root — see also: this manifesto for the modularity story.

## Mastermind routing note

Any PR adding a hard cross-genre, cross-style, or cross-subsystem dependency MUST be routed to `principle-keeper` first. Other reviewers downstream. Mastermind enforces.
