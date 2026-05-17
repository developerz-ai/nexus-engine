<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Compose Don't Build

> **You compose your engine from Nexus modules; you don't build it from scratch.**
>
> The hard problems of game-engine construction — voxel worlds, falling-sand physics, 100k-unit RTS, seamless MMORPG streaming, GPU fluid, destruction, deformable terrain, weather-as-system, procgen, sim-first determinism — are SOLVED, MODULAR, and COMPOSABLE in Nexus. The dev composes what they need. The engine work is already done.

---

## Status

- **Spec status.** Draft. Sibling of `06-modularity.md` (the mechanism) and `07-extend-dont-fork.md` (the sustainability story). This file is the inventory the modularity story enables.
- **Owners.** Agent 32. Cross-touches Agent 28 (`specs/crates/categories.md` needs new categories — see §Cross-Agent Flags), Agent 12 (genre specs), Agent 03 (renderer), Agent 05 (physics).
- **Enforced by.** Every "engine-within-the-engine" spec must compose existing crates explicitly. Every quick-start recipe must produce a working game scaffold in ≤ 1 day of work.

---

## The lost decade

| Game | Studio | Years on engine before shipping | What they built from scratch | Nexus would supply |
|---|---|---|---|---|
| Factorio | Wube Software | ~3 years pre-EA | deterministic tick sim, custom ECS, save/load, multiplayer lockstep | `docs/specs/sim-game/overview.md` + `nexus-net/replication` |
| Noita | Nolla Games | ~4 years | Falling Everything Engine (per-pixel CA, fluids, fire, gas) | `docs/specs/cellular-automata/overview.md` |
| Hytale | Hypixel Studios | ~5+ years (and counting) | voxel + scripting + MMO infra | `docs/specs/voxel/overview.md` + `docs/specs/seamless-world/overview.md` + `nexus-scripting` |
| Teardown | Tuxedo Labs | ~7 years | voxel destruction, ray-traced voxels, soft-body debris | `docs/specs/voxel/overview.md` + `docs/specs/destruction-first/overview.md` |
| Star Citizen | CIG | 12+ years | seamless 64-bit world, network mesh, planetary tech | `docs/specs/seamless-world/overview.md` (partial; planetary tech is research) |
| Sea of Thieves | Rare | ~4 years (engine fork) | gerstner wave fluid + sailing physics on UE4 | `docs/specs/fluid-gameplay/overview.md` |
| Dwarf Fortress | Bay 12 | 20+ years | procgen world simulation, ASCII renderer, agent AI | `docs/specs/procgen-first/overview.md` + `docs/specs/sim-game/overview.md` |
| RimWorld | Ludeon | ~4 years pre-1.0 | colony sim, story generator, mod API | `docs/specs/sim-game/overview.md` + `nexus-scripting` |
| Hotline Miami | Dennaton | ~2 years | top-down billboard renderer, AI, animation | `docs/specs/styles/2-5d.md` (billboard-3D submode) |
| Octopath Traveler | Square Enix | ~4 years | HD-2D pipeline | `docs/specs/styles/2-5d.md` (HD-2D submode) |

Honest caveat: some of those teams WANTED to build the engine — Wube's tech is their moat; Nolla's CA is the game. That's their right. **For teams that just want to ship the game, Nexus removes the engine work as a prerequisite.**

---

## The cost equation

| Approach | Engine work | Game work | Total wall-clock |
|---|---|---|---|
| Build-your-own (Factorio path) | team × 3 yr | team × 3 yr | 6 years to 1.0 (public timeline: 2012 prototype → 2020 1.0) |
| Build-your-own (Noita path) | team × 4 yr | team × 2 yr | 6 years (2014 prototype → 2020 release) |
| Compose with Nexus (target) | 0 | solo × 1 mo | 1 month to MVP, 1 year to 1.0 |

Illustrative. Numbers per public talks: [VERIFY — Factorio FFF retrospective], [VERIFY — Noita GDC 2019 talk by Petri Purho]. Nexus claim: 30–50× compression on the engine portion. The game design itself still takes design time — Nexus does not generate that.

---

## The engines-within-the-engine inventory

Every row below is a first-class subsystem most engines force devs to build themselves. In Nexus each is a module + an example crate name + a starter recipe.

| Subsystem | Spec | Example crate | Recipe | Genre relevance |
|---|---|---|---|---|
| Voxel worlds | `docs/specs/voxel/overview.md` | `nexus-voxel-core`, `nexus-voxel-greedy-mesh` | `docs/guides/recipes/voxel-game-quickstart.md` | Minecraft, Vintage Story, Trove, Teardown |
| Falling-sand / CA | `docs/specs/cellular-automata/overview.md` | `nexus-cellular-falling-sand`, `nexus-cellular-noita-elements` | `docs/guides/recipes/falling-sand-quickstart.md` | Noita, Powder Toy, Sandspiel |
| Massive RTS (10k–100k units) | `docs/specs/massive-rts/overview.md` | `nexus-massive-rts-flowfield`, `nexus-massive-rts-instanced-render` | `docs/guides/recipes/massive-rts-quickstart.md` | Supreme Commander, Planetary Annihilation, Ultimate General |
| Seamless MMO world | `docs/specs/seamless-world/overview.md` | `nexus-seamless-zone-handoff`, `nexus-seamless-predictive-stream` | `docs/guides/recipes/seamless-mmorpg-quickstart.md` | WoW, FFXIV, Guild Wars 2, EVE |
| Fluid as gameplay | `docs/specs/fluid-gameplay/overview.md` | `nexus-fluid-gameplay-coupling` | (composed in voxel + heavy-particles recipes) | Sea of Thieves, Where Cards Fall, From Dust |
| Weather as system | `docs/specs/weather-as-system/overview.md` | `nexus-weather-windfield`, `nexus-weather-precipitation` | (composed in seamless-mmorpg recipe) | RDR2, Death Stranding, Subnautica |
| Destruction-first | `docs/specs/destruction-first/overview.md` | `nexus-destruction-voronoi`, `nexus-destruction-persistent` | `docs/guides/recipes/destruction-quickstart.md` | Red Faction Guerrilla, Teardown, Battlefield BC2 |
| Deformable terrain | `docs/specs/deformable-terrain/overview.md` | `nexus-deformable-heightmap`, `nexus-deformable-multimaterial` | (composed in voxel + destruction recipes) | Worms, From Dust, Spintires |
| Procgen-first | `docs/specs/procgen-first/overview.md` | `nexus-procgen-wfc`, `nexus-procgen-seeded-rng` | (composed in falling-sand, sim-game recipes) | Dwarf Fortress, NoMan's Sky, Caves of Qud |
| Scripting-first | `docs/specs/scripting-first/overview.md` | `nexus-scripting-hotreload-heavy` | (composed across recipes) | Garry's Mod, Factorio modding, RimWorld |
| Sim-first (tick decoupled) | `docs/specs/sim-game/overview.md` | `nexus-sim-tick-decoupled`, `nexus-sim-headless-server` | `docs/guides/recipes/sim-game-quickstart.md` | Factorio, Dwarf Fortress, OpenTTD |
| Rhythm (frame-perfect audio) | `docs/specs/rhythm-game/overview.md` | `nexus-rhythm-beat-grid`, `nexus-rhythm-latency-calibrate` | `docs/guides/recipes/rhythm-quickstart.md` | Crypt of the NecroDancer, Beat Saber, Friday Night Funkin' |
| Text-heavy / VN | `docs/specs/text-heavy/overview.md` | `nexus-text-rich-render`, `nexus-text-dialogue-dsl` | `docs/guides/recipes/text-heavy-quickstart.md` | Disco Elysium, 80 Days, Sunless Sea |
| 4X strategy | `docs/specs/4x-strategy/overview.md` | `nexus-4x-hexgrid`, `nexus-4x-fogofwar` | (composed in massive-rts recipe — variant) | Civilization, Endless Legend, Old World |
| 2.5D pipeline | `docs/specs/styles/2-5d.md` | `nexus-style-2-5d-hd2d`, `nexus-style-2-5d-billboard` | `docs/guides/recipes/2-5d-hd-2d-quickstart.md`, `docs/guides/recipes/2-5d-billboard-quickstart.md` | Octopath, Cuphead, Doom, Hotline Miami |
| Heavy particles (10M+) | `docs/specs/renderer/particles-heavy.md` | `nexus-particles-gpu-sim`, `nexus-particles-impostor-render` | `docs/guides/recipes/heavy-particles-quickstart.md` | Returnal, Geometry Wars 3, Resogun, bullet hells |

Existing infrastructure that these compose on top of:

| Genre specs | → `docs/specs/genres/` (fps, rpg, mmorpg, rts, moba, platformer, racing, fighting, horror, survival, battleroyal, towdef, puzzle, visualnovel, openworld, roguelike) |
| Style specs | → `docs/specs/styles/` (pbr, npr, pixel, 2d, mixed, **2-5d** new) |
| Physics specs | → `docs/specs/physics/` (rigid, collision, character, fluid, soft, determinism) |
| Net specs | → `docs/specs/networking/` (transport, replication, rollback, lobby) |

---

## The compose-don't-build contract

Every "engine-within-the-engine" spec MUST:

1. **List composed Nexus modules explicitly.** No new engine work — only orchestration of existing crates.
2. **Declare any new module that needs to land** (with crate name in `nexus-<category>-<name>` form per `docs/specs/crates/naming.md`).
3. **Ship a starter scenario test.** Headless. Asserts the subsystem works end-to-end in < 60 s.
4. **Have a quick-start recipe.** `nexus new mygame --template <name>` produces a runnable game by day 1.
5. **Cite real precedent** with public talk/article URL (mark `[VERIFY — talk URL]` if not pinned yet).

---

## Quick-start recipe inventory

| Ambitious game type | Recipe | Modules composed |
|---|---|---|
| Voxel sandbox (Minecraft-like) | `docs/guides/recipes/voxel-game-quickstart.md` | voxel + physics/collision + assets/streaming + net/replication |
| Falling-sand (Noita-like) | `docs/guides/recipes/falling-sand-quickstart.md` | cellular-automata + particles-heavy + physics/determinism |
| HD-2D (Octopath-like) | `docs/guides/recipes/2-5d-hd-2d-quickstart.md` | styles/2-5d + styles/mixed + renderer/pbr |
| Billboard 3D (Doom-like) | `docs/guides/recipes/2-5d-billboard-quickstart.md` | styles/2-5d + genres/fps |
| 10k-unit RTS | `docs/guides/recipes/massive-rts-quickstart.md` | massive-rts + particles-heavy + net/replication |
| Seamless MMORPG | `docs/guides/recipes/seamless-mmorpg-quickstart.md` | seamless-world + assets/streaming + net/lobby + genres/mmorpg |
| Red-Faction destruction | `docs/guides/recipes/destruction-quickstart.md` | destruction-first + physics/soft + net/replication |
| Factorio-style sim | `docs/guides/recipes/sim-game-quickstart.md` | sim-game + net/replication + agent/replay |
| Returnal-style bullet hell | `docs/guides/recipes/heavy-particles-quickstart.md` | particles-heavy + physics/determinism |
| Beat Saber-style rhythm | `docs/guides/recipes/rhythm-quickstart.md` | rhythm-game + audio/streaming + core/hal |
| Disco-Elysium-style VN | `docs/guides/recipes/text-heavy-quickstart.md` | text-heavy + genres/visualnovel + assets/streaming |

---

## Compose-or-build decision tree

```
                  ┌─────────────────────────────────┐
                  │ I want to build a game like X   │
                  └─────────────────┬───────────────┘
                                    │
                  Does X map to an "engine-within-the-engine" spec?
                                    │
                       ┌────────────┴────────────┐
                       │ YES                     │ NO
                       ▼                         ▼
            nexus new mygame             Compose from base modules
            --template <recipe>          (core, renderer, physics,
                       │                  audio, net, scripting)
                       ▼                         │
            day-1 working scaffold               ▼
                       │                 Likely longer path,
                       ▼                 but still no engine
            week-1 game design work      build-from-scratch
```

---

## Mastermind routing

"I want to make a game like X" prompts route to `onboarding-coach` first, which:

1. Matches the request against the recipe inventory above.
2. If match: hand off to `nexus-cli-engineer` to run the `nexus new --template` invocation.
3. If no match: hand off to `architect` to design a custom composition from base modules.
4. Never: greenfield engine code. Always: compose existing modules.

→ `CLAUDE.md` (repo root) — mastermind routing rules already encode this. This spec documents the rationale.

---

## Cross-references

- → `docs/architecture/06-modularity.md` — the compile-time mechanism that makes composition real.
- → `docs/architecture/07-extend-dont-fork.md` — the sustainability story: extending a module is cheaper than forking.
- → `docs/specs/crates/categories.md` — Agent 28's category index; new crate categories listed in §Cross-Agent Flags below.
- → `docs/specs/hub/overview.md` — `nexus hub` is the discovery layer where composed modules surface.
- → `docs/initial/vision.md` §"The Nexus Thesis" — code-is-free thesis underwrites this.
- → `README.md` (repo root) §"What's in the box" — see also: this manifesto for the why behind that inventory.

## Cross-agent flags

The following crate categories should be added to Agent 28's `docs/specs/crates/categories.md` in the integration pass:

| New category key | Trait | Trait spec | Representative crate names |
|---|---|---|---|
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

Each new category SHOULD inherit per-category requirements from `docs/specs/crates/categories.md` (headless-safe, deterministic-required, mods-compat-required, min coverage). Default proposal: all yes/yes/yes, 80% coverage floor.

## Open questions

- `[DECISION NEEDED]` Should "engine-within-the-engine" specs live under `docs/specs/<subsystem>/` (current) or `docs/specs/recipes/<subsystem>/` (sibling of `guides/recipes`)?
- `[DECISION NEEDED]` Recipe templates: ship as `nexus-template-*` crates (versioned, Cargo-resolvable) or as `nexus-cli` builtin assets?
- `[DECISION NEEDED]` Order of recipes in the `nexus new --help` listing: alphabetical, popularity-weighted, or curated-by-difficulty?
- `[BENCHMARK NEEDED]` Day-1 time-to-runnable for each recipe on the reference machine.
