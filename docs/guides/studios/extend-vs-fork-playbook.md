<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Studio Playbook — Extend vs Fork

> For studios. The business case for not forking Nexus. The cost of forking, quantified. The engineering reality of keeping a fork in sync. Real-world cases cited.
>
> Audience: technical directors, engine leads, CTOs evaluating Nexus for production. Read once at adoption; re-read every time someone says "we should just fork it."
>
> Manifesto: `docs/architecture/07-extend-dont-fork.md`. Cookbook: `docs/guides/extend-not-fork-cookbook.md`. Enforcement: `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`.

---

## The rule, restated for studios

You don't need to fork Nexus. Every reason you've ever forked an engine maps to an extension surface. Internal proprietary features stay private. The engine stays upstream. You inherit every minor improvement for free.

A solo dev with AI inherits the same extension surface as your 1000-engineer org. The difference is your throughput, not your engine.

---

## The cost of a fork — quantified

### Per-kloc upstream merge cost

Empirical reference points from public talks and post-mortems:

| Source | Reported cost |
|---|---|
| Unreal Engine internal forks at AAA studios (public GDC / DevCom talks across multiple studios) | Engineer-weeks per UE release per fork-delta-kloc. A 50-kloc delta against a UE5 minor ≈ 3–8 engineer-weeks of merge work per release. `[VERIFY]` against specific GDC vault talks for v1.0 of this doc. |
| Linux distro kernel patch maintenance (Red Hat, SUSE, Debian — long history) | Steady-state cost ≈ 1 senior kernel engineer per 10–20 kloc of patch delta, full-time, in perpetuity. The "we'll just rebase" plan is the most common cause of patch-set bit-rot. |
| Browser engine forks (Webkit → Blink, Servo experiments, Brave on Chromium) | Brave runs a thin patch over Chromium with significant ongoing cost; full forks (Servo) require dedicated engine teams to make any headway. |
| Source SDK private branches at studios pre-2013 | Many died when Valve moved to per-game Authoring Tools. Forks that didn't track upstream became unshippable on Steam updates. → `docs/architecture/07-extend-dont-fork.md` §"Fork-history horror reel" |

**Working estimate for Nexus.** Assume your fork delta is `D` kloc against the canonical engine. Conservative steady-state cost:

```
fork_cost_per_year ≈ (D / 10) engineer-years
```

A 100-kloc fork delta = 10 engineer-years per year, forever, just to track upstream. That budget pays for ~10 senior engineers full-time who produce zero new game content.

`[VERIFY]` Pin precise numbers from GDC vault talks (Epic, CD Projekt Red, Riot, Respawn, Activision) before v1.0 of this doc ships externally. The ratio above is order-of-magnitude correct against the empirical references but not yet pinned.

### Hidden costs (not in the engineer-time number)

| Hidden cost | Impact |
|---|---|
| Lost ecosystem crates | Every `nexus-*` community crate targets canonical engine traits. A fork that diverges from those traits cuts itself off from the ecosystem. |
| Broken AI tooling | `nexus-coder` targets the canonical engine. On a fork, `coder` generates code that doesn't compile against your engine. Re-training a coder on a fork ≈ a multi-engineer-year project per fork. |
| Lost contribution path | Bugs you fix in your fork never reach upstream. Bugs upstream fixes never reach you. Both sides pay. |
| Recruiting friction | Engineers know the canonical engine. Onboarding to a fork = N weeks of "where did MyCorp diverge from upstream?" per hire. |
| Documentation drift | The 100M-LOC spec corpus reflects canonical. Your fork's docs are stale the day you branch. |
| Asset / mod pipeline drift | Mods (`.nxmod`) target canonical SDK semver (`docs/specs/mods/sdk.md`). Mod authors won't bother with your fork. |
| Bus factor | If your engine team shrinks, the fork rots. Multiple historical examples (Source SDK community forks, Quake derivatives — see manifesto). |

---

## Real-world reference points

### CD Projekt Red — REDengine → Unreal Engine 5

CDPR built and maintained REDengine through Witcher 3 + Cyberpunk 2077. In 2022 they announced their next-generation Witcher saga would ship on **Unreal Engine 5**, ending REDengine development. Public statements cite: tooling, talent pool, ecosystem velocity. The cost of maintaining a bespoke engine, even with the budget of a studio shipping the highest-revenue PC RPG of a generation, exceeded the benefit. Even the alternative they picked — UE5 — they intend to use largely unmodified, with extensions where needed.

Lesson for Nexus studios: if CDPR concluded their proprietary engine wasn't worth the cost, your fork of an open engine almost certainly isn't either. `[VERIFY]` exact CDPR press release URL for v1.0 of this doc.

### Epic Games — UE source access + branch policy

Epic publishes UE source on GitHub with full history. Studios get full source access. Yet Epic's documented best practice is: **avoid modifying engine source where a plugin / module / Blueprint extension suffices**. The same logic Nexus codifies in the merge-bot rule.

Studios that did modify engine source (and there are many) report the per-release merge cost cited above. The engineer-week numbers come from public GDC postmortems.

### Riot / Valorant — engine + custom anti-cheat

Riot famously runs an extensive proprietary anti-cheat (Vanguard) on top of an engine. The anti-cheat is a separate process / kernel driver, NOT a fork of the engine. The engine boundary is preserved; the proprietary tech lives at the OS layer.

Nexus mapping: do the same with `nexus-net-mycorp` + an external anti-cheat process. Cookbook §2.

### Linux kernel + DKMS + nvidia driver

The most-cited case of "private proprietary tech on an open kernel without forking." NVIDIA ships a closed-source kernel module via DKMS, which auto-rebuilds against new kernels. The kernel doesn't fork; the driver doesn't fork; both evolve independently. Decades of working software prove the model.

→ [DKMS (Wikipedia)](https://en.wikipedia.org/wiki/Dynamic_Kernel_Module_Support)

Nexus mapping: your closed-source proprietary crate is the kernel module; the engine is the kernel; `Cargo` + `NexusPlugin` registry is DKMS.

### Rails + Devise + Spree

A 20-year-old open framework with thousands of "extension" gems. Devise (authentication), Spree (e-commerce), Sidekiq (background jobs), Active Admin (admin UI) — none are forks of Rails. All extend it via `Rails::Engine`. Companies build billion-dollar businesses on top of Rails with zero engine-source modification.

→ [Rails Guides — Engines](https://guides.rubyonrails.org/engines.html)

Nexus mapping: Cookbook §7 (FFI wrapper crates), §8 (private proprietary crates).

---

## Decision matrix — should you fork?

Walk this matrix before opening any fork.

| Question | Yes → | No → |
|---|---|---|
| 1. Does your need match a cookbook row? (`docs/guides/extend-not-fork-cookbook.md`) | Follow the cookbook. **Don't fork.** | Continue. |
| 2. Can your need be expressed as a NEW extension surface (a new trait, plugin lane, RPC method)? | Open an ADR proposing it. **Don't fork** while ADR is in flight. | Continue. |
| 3. Is the ADR explicitly denied by the architect council? | Continue. | Iterate the ADR. **Don't fork.** |
| 4. Is the perf / business / certification need ABSOLUTELY blocking ship? | Continue. | **Don't fork.** |
| 5. Can you afford `D / 10` engineer-years per year, in perpetuity, where `D` = your delta in kloc? | Continue. | **Don't fork.** Reduce scope. |
| 6. Are you willing to lose ecosystem crate compat, AI tooling support, and contribution flow? | Continue. | **Don't fork.** |
| 7. Are you willing to document the fork in `docs/forks/MYFORK.md` (private or public) so future engineers know the cost? | Fork. Sign the cost. Ship. | **Don't fork.** |

If you reached "fork" at the bottom of this matrix, you're in the legitimate minority. The manifesto's escape-hatch section applies to you.

If you bailed before the bottom, you didn't need to fork — and you've already saved your studio years of engineering time.

---

## Common arguments for forking — and the response

| "We need to fork because..." | Response |
|---|---|
| "...we need proprietary feature X." | Private crate. Cookbook §8. Engine stays upstream. |
| "...we need a different rendering pipeline." | `RenderPass` plugin. Cookbook §1. |
| "...we need our own netcode for anti-cheat." | `NetTransport` + external anti-cheat process. Cookbook §2. Valorant model. |
| "...we need a console SDK that's NDA-restricted." | `PlatformBackend` in a private crate. Cookbook §6. NDA-restricted code stays in your private repo. |
| "...the engine is slow at thing Y." | Open a perf ADR. The engine WILL ship the fix; everyone wins. If you forked, the fix lands only in your fork. |
| "...we disagree with the architectural direction." | ADR. Cookbook §11. Fork only after explicit council rejection AND budget approval for `D / 10` engineer-years per year. |
| "...we want to lock down what mods can run." | Server-side mod whitelist. → `docs/specs/mods/multiplayer-sync.md`. Doesn't require a fork. |
| "...we want to remove the AI agent surface." | Opt out via `Nexus.toml [engine].features`. The agent crate is opt-in (per `docs/architecture/06-modularity.md`). |
| "...we want to rebrand." | `Nexus.toml [branding]`. Cookbook §10. |
| "...we want to monetize." | MIT lets you. No fork needed. Ship your game; charge for it. |

---

## What the engine commits to (so forking doesn't pay)

| Commitment | Spec |
|---|---|
| Public trait stability | `docs/specs/crates/stable-api.md` — Stable tier, one-major shim, semver discipline |
| Extension-surface coverage | `docs/specs/crates/categories.md` — 14 surfaces v1.0; petition for more |
| AI tooling targets canonical | `docs/specs/coder/tools.md` (Agent 18) — `nexus-coder` only learns the canonical engine |
| Compat shim per major | `crates/nexus-engine-compat-(N-1)/` ships at each major (`stable-api.md`) |
| Perf budgets honored | Law 5 — perf regression beyond budget blocks merge |
| Headless / determinism honored | Laws 8 + 9 — server, replay, CI all keep working |
| MIT forever | Law 7 — license never changes |

If the engine breaks these commitments, forking becomes rational. Hold us to them.

---

## When forking IS the right call (honest list)

- **Research / paper benchmark.** Repo dies on submission. No long-term cost.
- **Non-game adjacent use** (robotics sim, scientific viz, training-data gen). Use-case too far from engine scope; no extension surface fits and never will.
- **Clean-room re-implementation in another language.** Not a fork in practice; a separate project sharing only design ideas.
- **Severe philosophical mismatch the council rejects via ADR AND** you have a multi-year roadmap that absorbs `D / 10` engineer-years per year. Rare. Honest.
- **Educational fork** to learn the engine internals. Encouraged. Not for production.

Forks are a feature of MIT. They are not a strategy for shipping a production game.

---

## How to upstream a fork delta you already have

If you adopted Nexus after already maintaining a custom engine, you arrive with deltas. Process to dissolve them:

1. **Audit your delta.** List every modification to engine source. Total kloc, per-crate breakdown.
2. **Per modification, ask:** does this fit a cookbook row?
   - Yes → port to an extension. Delete the engine modification.
   - No → propose a new extension surface via ADR.
3. **Iterate until delta = 0.** Track progress in `docs/forks/MYCORP-DISSOLUTION.md` (private or public).
4. **Once delta = 0**, you're on canonical. You receive every engine fix. You contribute back when relevant.

This is the supported path off a fork. The architect council fast-tracks ADRs that dissolve real fork deltas — it's the strongest signal a new extension surface is needed.

---

## Cross-references

- → `docs/architecture/07-extend-dont-fork.md` — manifesto + decision tree.
- → `docs/architecture/proposed-law-14.md` — Law 14 ratification doc.
- → `docs/guides/extend-not-fork-cookbook.md` — recipe set referenced throughout.
- → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md` — what the merge bot enforces.
- → `docs/specs/crates/stable-api.md` — the stability promise that makes "don't fork" credible.
- → `docs/specs/crates/categories.md` — the 14 sanctioned extension surfaces.
- → `docs/specs/mods/overview.md`, `docs/specs/agent/api.md`, `docs/specs/core/hal.md`.
- → `docs/architecture/06-modularity.md` — opt-in compile-time modularity (sibling manifesto).
- → `docs/architecture/01-principles.md` — 12 binding laws (14 once Law 14 ratifies).
- → `docs/guides/integration-team.md` — architect council.
- → `docs/guides/adr-format.md` — ADR template for proposing new extension surfaces.

## Open questions

- `[VERIFY]` Pin the GDC vault / public-talk URLs for per-kloc fork merge cost numbers before v1.0 external ship.
- `[VERIFY]` Pin the CDPR REDengine → UE5 press release URL.
- `[DECISION NEEDED]` Whether to publish a public registry of studios on canonical Nexus vs forks (a "forks register"). Default proposal: NO — peer pressure as governance is unhealthy. The merge-bot rule + the cost math should suffice.

## Mastermind routing note

When a studio asks "should we fork?", mastermind invokes `principle-keeper` first; `principle-keeper` walks the decision matrix above with the contributor and routes them to the cookbook + the relevant authoring subagent (`crate-author`, `mod-author`, `plugin-author`).
