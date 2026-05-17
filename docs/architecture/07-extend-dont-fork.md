<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Extend, Don't Fork

> **You should never need to fork Nexus to ship your game.**
>
> Every common reason to fork — custom renderer tech, proprietary netcode, alternate physics, internal genre system, console port, branded build — maps to a sanctioned extension surface. Crate, plugin, mod, script, agent RPC, editor override. Pick one. Don't fork.
>
> A solo dev with AI inherits the same extension surface as a 1000-engineer studio. The engine moves forward. Everyone benefits. Forks are an escape hatch, not a strategy.

---

## Status

- **Spec status.** Ratified as **Law #15** via ADR `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md` (2026-05-17). Long-form rationale: `docs/architecture/proposed-law-14.md` (filename retained for compat; status header updated). Renumbered from proposed #14 to #15 because Agent 27 took the #13 slot first, pushing both this and Modularity by one.
- **Owner.** Agent 31 (this file). Sibling manifesto: Agent 29 (`06-modularity.md`).
- **Enforced by.** `principle-keeper` subagent (PR review) + merge-bot rule `no-engine-source-mod-without-rationale` (`docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`).
- **Integration pass note.** README repo-root §"The Commitment" will cross-link here; CLAUDE.md mastermind routes fork-tempted PRs to the migration cookbook + the right extension-surface subagent.

---

## The rule, one sentence

**Nexus is closed for modification. Open for extension.** Every public engine API is a stable extension surface. Every common need has a sanctioned plugin lane.

---

## Why this matters

| Failure mode of forks | Cost |
|---|---|
| Ecosystem fragmentation | Every fork is a dead end. UE5 forks, Quake source-mods, Source SDK derivatives — islands. |
| Upstream drift | Forks freeze in time. Source 2007 → Source 2013 → game-specific Authoring Tools; the SDK chain phased out forks that didn't track. → [Source engine SDK history](https://en.wikipedia.org/wiki/Source_(game_engine)) |
| Lost velocity | Maintaining a fork = maintaining the entire engine surface, not just your delta. Per-kloc upstream merge cost ≈ engineer-weeks per year; quantified → `docs/guides/studios/extend-vs-fork-playbook.md`. |
| AI tooling breakage | `nexus-coder` targets the canonical engine. Forks ship divergent specs; agent automation fails on them. |
| Community contributions lost | Your fixes never reach upstream; upstream fixes never reach you. |

The Open/Closed Principle (next section) is the structural answer.

---

## The Open/Closed Principle, for games

**Bertrand Meyer (1988, *Object-Oriented Software Construction*).** A module is **open for extension** — "it should be possible to add fields to the data structures it contains, or new elements to the set of functions it performs" — **and closed for modification** — "available for use by other modules" with "a well-defined, stable description (the interface)."

**Robert C. Martin (1996, "The Open-Closed Principle").** Refined: extension happens through **polymorphism against abstract interfaces**, not implementation inheritance. The interface is closed; new implementations satisfy the contract.

→ [Open–closed principle (Wikipedia)](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle)

**Applied to a game engine.**

- The renderer crate is closed for source modification.
- `trait RenderPass`, `trait StylePipeline`, `trait PhysicsBackend`, `trait NetTransport`, `trait AssetSource`, `trait GenrePlugin`, `trait ScriptVm`, `trait PlatformBackend`, `trait TelemetrySink` — open for new implementations.
- Studios ship a crate that `impl`s the trait. Engine source untouched. Engine semver intact. Studio crate gets every minor engine improvement for free.

The 12 trait registry rows in `docs/specs/crates/stable-api.md` ARE the open surface. The engine src that backs them is the closed surface.

---

## Fork-history horror reel

| Engine / fork | What happened | Lesson |
|---|---|---|
| Quake / DarkPlaces | Heavily-modified Q1 engine. Last stable release May 2014; later commits via SVN/GitHub mirrors; Xonotic devs carry the load. Long-term maintenance falls to a tiny circle. | A fork survives only as long as its tiny maintainer set survives. → [Quake engine (Wikipedia)](https://en.wikipedia.org/wiki/Quake_engine) |
| Quake III source-mods (ioquake3, OpenArena, urban terror, smokin guns, Quakeforge, FitzQuake, Quakespasm, ezQuake) | Fragmented into incompatible derivatives sharing little code. Each carries its own bugs, its own renderer drift, its own netcode quirks. | Source release ≠ ecosystem. Without an extension contract, every customisation is a fork. |
| Source SDK forks (pre-2013) | Phased out when Valve moved to per-game "Authoring Tools" in 2013. Mods that depended on the old SDK froze. | Upstream-controlled SDK boundaries with no stable extension surface ⇒ mods die when the publisher pivots. → [Source (game engine)](https://en.wikipedia.org/wiki/Source_(game_engine)) |
| Unreal Engine internal forks at studios | Studio engineers pay merge-cost per UE release. Public talks (Epic, multiple studios) put this in the engineer-weeks-per-year range. | Even a well-funded fork is a tax. The tax compounds. → quantified in `docs/guides/studios/extend-vs-fork-playbook.md`. |

**Pattern.** Every fork has the same lifecycle: enthusiasm → divergence → maintenance debt → bus-factor death.

---

## Counter-examples: stable extension contracts that worked

| Project | Extension model | Why it works |
|---|---|---|
| Linux kernel + DKMS | Out-of-tree modules auto-rebuild against new kernels. Drivers ship independently. | Stable userspace + DKMS removes the need to fork the kernel for vendor drivers. → [DKMS (Wikipedia)](https://en.wikipedia.org/wiki/Dynamic_Kernel_Module_Support) |
| Linux kernel stable API for userspace | "That interface is the very stable over time, and will not break." Programs from pre-0.9 still run. | Userland never has to fork the kernel. → [Documentation/process/stable-api-nonsense.rst](https://www.kernel.org/doc/Documentation/process/stable-api-nonsense.rst) |
| Bevy engine `Plugin` trait | `impl Plugin { fn build(&self, app: &mut App) }`. Engine features themselves are plugins. | Zero core modification needed to add features. → [bevy.org plugins guide](https://bevy.org/learn/quick-start/getting-started/plugins/) |
| Rails Engines | "A Rails application is actually just a 'supercharged' engine." Isolated namespacing; application takes precedence. | Devise, Spree, hundreds of gems extend Rails without forking. → [Rails Guides — Engines](https://guides.rubyonrails.org/engines.html) |
| VS Code Extension API | "Almost every part of VS Code can be customized and enhanced through the Extension API." Core features ARE extensions. | Marketplace of 50,000+ extensions; nobody forks VS Code to add language support. → [VS Code Extension API](https://code.visualstudio.com/api) |
| Babel plugins | Visitor pattern over AST nodes; configuration-based loading. | Compiler-as-a-platform — community ships transformations without touching Babel core. → [babeljs.io/docs/plugins](https://babeljs.io/docs/plugins) |
| Tokio ecosystem (hyper, tonic, tower, tracing, bytes) | Layered crates over a stable runtime. | The runtime is closed; the layer above is open and unbounded. → [tokio.rs](https://www.tokio.rs/) |

Nexus models all seven simultaneously.

---

## The Nexus extension model — tiered surfaces

Seven surfaces. Pick the lowest one that does the job.

| Tier | Surface | Lifecycle | Trust | Reach | Spec |
|---|---|---|---|---|---|
| 1 | **Compile-time crate** | `cargo add` | Full source | Whole engine API | `docs/specs/crates/overview.md` |
| 2 | **Cargo feature** | `--features <x>` in `Nexus.toml` | Full source | Within one crate | `docs/architecture/06-modularity.md` |
| 3 | **Runtime plugin (`NexusPlugin`)** | auto-wire via `inventory` registry | Full source | Whole engine API | `docs/specs/crates/plugin-trait.md` |
| 4 | **Mod (`.nxmod`)** | `nexus mod install` | Capability-gated sandbox | Mod SDK surface | `docs/specs/mods/overview.md` |
| 5 | **Script (Lua / Rune)** | hot-reload | Sandbox or trusted (Lua) | Game systems via bindings | `docs/specs/scripting/lua.md`, `docs/specs/scripting/rune.md` |
| 6 | **Agent RPC (JSON-RPC)** | external process | Capability handshake | Full agent API surface | `docs/specs/agent/api.md` |
| 7 | **Editor override** | UI panel / inspector plugin | Editor process | Editor surface only | `docs/specs/editor/overview.md` |

### Decision tree — "Where do I put my extension?"

```
                            "I need to change something Nexus doesn't do."
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
       Is it ASSET data only?         Is it RUNTIME behavior         Does it need NATIVE
       (textures, meshes, audio,      that PLAYERS install?          performance / unsafe / FFI?
        fonts, UI themes)             (skins, balance tweaks,        (custom rendering, integrator,
              │                        new weapons, quests)            netcode, console SDK)
              ▼                             │                             │
        Tier 4: MOD (Skin tier)             ▼                             ▼
        → specs/mods/overview.md   Tier 4: MOD (Behavior tier)  Tier 1: COMPILE-TIME CRATE
                                   → specs/mods/overview.md     → specs/crates/overview.md
                                                                       │
                              Is it DEV-TIME logic that                 │
                              extends ONE EXISTING SYSTEM?              │
                              (new render pass, new physics             │
                               integrator, new genre layer)             │
                                       │                                │
                                       ▼                                │
                              Tier 3: RUNTIME PLUGIN                    │
                              (`impl NexusPlugin`)                      │
                              → specs/crates/plugin-trait.md            │
                                                                        │
                              Is it just a BUILD-TIME toggle            │
                              for an existing crate?                    │
                              (turn off audio HRTF; enable              │
                               fluid sim; pick lua vs rune)             │
                                       │                                │
                                       ▼                                │
                              Tier 2: CARGO FEATURE                     │
                              in your Nexus.toml                        │
                              → architecture/06-modularity.md           │
                                                                        │
                              Is it INVOKING the engine                 │
                              from an external process /                │
                              tool / CI bot?                            │
                                       │                                │
                                       ▼                                │
                              Tier 6: AGENT RPC                         │
                              → specs/agent/api.md                      │
                                                                        │
                              Is it a tweak to LEVEL or                 │
                              GAMEPLAY LOGIC only?                      │
                                       │                                │
                                       ▼                                │
                              Tier 5: SCRIPT (lua/rune)                 │
                              → specs/scripting/lua.md, rune.md         │
                                                                        ▼
                                                          Did you hit a case that does
                                                          NOT fit any tier above?
                                                                        │
                                                                        ▼
                                                          Open an ADR proposing a new
                                                          extension surface.
                                                          → architecture/05-adr/
                                                          Do NOT fork.
```

Recipe-per-reason mapping: → `docs/guides/extend-not-fork-cookbook.md`.

---

## Merge-bot enforcement

A PR that modifies engine-core source (`crates/nexus-{core,renderer,physics,audio,networking,scripting,assets,agent,editor}/src/**`) for a feature expressible as an extension is **auto-rejected**. The bot comment redirects the contributor to:

1. The migration cookbook entry for their use case.
2. The right extension surface (crate / plugin / mod / script / agent RPC).
3. The `principle-keeper` subagent if they believe the rejection is wrong.

Full rule + JSON payload + appeal path: → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`.

Routed through `nexus-merge`. Authored by `principle-keeper` (subagent in `docs/guides/subagent-fleet.md`).

Whitelist exceptions: bug fixes, perf fixes, docstring updates, dependency bumps. Appeal: open an ADR; architect council ratifies.

---

## Stability promise

Every extension surface in the trait registry (`docs/specs/crates/stable-api.md`) carries a stability tier:

| Tier | Promise |
|---|---|
| Stable | Won't break in any `1.x`. Breaking change requires `2.0` + one-major shim. |
| Provisional | May change in a minor with `CHANGELOG`. |
| Unstable | Hidden behind `nexus-unstable`. May vanish in any patch. |
| Internal | Not public. Not part of the contract. |

**One-major deprecation overlap.** Engine `N.x` ships `nexus-engine-compat-(N-1)` re-exporting the previous major's surface mapped onto current. Community crates targeting `>=1.0, <2.0` continue compiling on `2.x` without republish. Shim retired one major later.

This is the contract that makes "never fork" a credible promise. If we break it, forks become rational. → `docs/specs/crates/stable-api.md`.

---

## The escape hatch — when forking IS the right call

Not absolutist. Some cases legitimately call for a fork:

| Case | Why a fork is OK |
|---|---|
| Research one-off (paper benchmark, thesis prototype) | The repo dies on submission. No long-term cost. |
| Non-game adjacent uses (scientific viz, robotics sim, training data gen) | Use-case so far outside engine scope that no extension surface fits and never will. |
| Clean-room re-implementation in a non-Rust language | Not a fork in the practical sense; a separate project sharing only design ideas. |
| Severe philosophical mismatch the council rejects via ADR | MIT lets you. The cost is yours: lost community velocity, lost AI tooling support, lost ecosystem compat. Spell it out, pay it, ship. |
| Educational fork ("I want to learn by hacking the engine") | Encouraged. Read-only or short-lived. Not for production. |

Forks are a feature of MIT. They are not a strategy for shipping a production game.

---

## Cross-references

- → `docs/architecture/01-principles.md` — the 12 laws. Proposed Law 14 ratifies this manifesto.
- → `docs/architecture/proposed-law-14.md` — Law 14 proposal (Extend, Don't Fork).
- → `docs/architecture/06-modularity.md` — Agent 29 sibling manifesto (opt-in compile-time modularity + Rails plugin model).
- → `docs/specs/crates/overview.md` — third-party crate ecosystem (Tier 1).
- → `docs/specs/crates/categories.md` — 14 canonical extension surfaces.
- → `docs/specs/crates/plugin-trait.md` — `NexusPlugin` trait shape (Tier 3).
- → `docs/specs/crates/stable-api.md` — stability tiers, semver, compat shim.
- → `docs/specs/mods/overview.md` — runtime extension lane (Tier 4).
- → `docs/specs/agent/api.md` — agent RPC surface (Tier 6).
- → `docs/specs/hub/overview.md` — discovery for community extensions.
- → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md` — enforcement spec.
- → `docs/guides/extend-not-fork-cookbook.md` — recipe per fork-motivation.
- → `docs/guides/studios/extend-vs-fork-playbook.md` — quantified business case.
- → `docs/guides/subagent-fleet.md` — `principle-keeper` ownership.
- → `docs/guides/merge-system.md` — merge-bot wiring (Agent 16).
- → `docs/guides/pr-protocol.md` — appeal path mechanics.

## Mastermind routing note

Any PR that touches engine-core source without an ADR/RFC is routed to `principle-keeper` first, before any other reviewer. Mastermind enforces. The redirect points the author at the migration cookbook + the right extension-surface subagent (`crate-author`, `mod-author`, `plugin-author`, `script-author`).
