<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# AAA Path — From Weekend MVP to Dota 2 Scale

> How a 1-person team takes the Friday-night-to-Sunday-night MVP and scales it, over months and years, to a Dota 2 / WoW / Black Myth: Wukong-class game without hiring a hundred people. The Nexus answer to the "AAA requires AAA studios" axiom.

## Boundaries
- Owns: the scaling playbook — what you add, when, in what order.
- Does NOT own: business decisions (publishing, marketing budget, legal). Those are yours.
- Depends on: `→ docs/game-template/weekend-mvp.md` (the starting state), `→ docs/specs/agent/*` (your agent fleet grows here), `→ docs/specs/genres/*` (genre modules you stack), `→ docs/guides/merge-system.md` (the AI merge bot becomes your tech lead).

## The Premise

You shipped the MVP on Sunday. Monday morning the question is: how does this become Dota 2?

The answer is **not** "hire 200 engineers." The answer is the same answer that gave you the MVP, scaled to the time available: more agents, more specs, more parallelism, more rigor.

## The Scaling Axes

A Dota 2-class game differs from a weekend MVP on four axes, not one:

| Axis | Weekend MVP | AAA target | Multiplier |
|---|---|---|---|
| Content volume | 30 enemies, 3 biomes | 1000+ entities, 50+ maps | ~50x |
| Systems depth | core loop + combat + meta | + economy, social, anti-cheat, esports, seasons | ~10x |
| Production quality | LLM-grade copy, FLUX sprites | hand-polished by artists, voice acted | ~10x |
| Operational scale | hobby telemetry, 100 CCU | 24/7 ops, 1M CCU, live ops | ~100x |

Total complexity: ~50,000x. Number of humans on a Nexus team: 1. The remaining ~50,000x is absorbed by **AI agent parallelism + automation + open-source community**.

## The Scaling Phases

### Phase 0 — Weekend MVP (week 1)
You are here. → `docs/game-template/weekend-mvp.md`

### Phase 1 — Early Access (weeks 2-8)

**Goal**: stable, playable, growing community.

| Activity | How |
|---|---|
| Daily hotfix cadence | `nexus deploy` is one command; AI merge bot lands fixes within minutes |
| Telemetry-driven design | `nexus agent telemetry query` becomes your morning ritual |
| Community feedback loop | `nexus add scenario` for every reported bug; never fixed without a regression scenario |
| First content patch | spec → agent → review → ship, every week |
| Performance baselining | `perf-engineer` agent runs nightly perf regression, files PRs against itself |

Agent fleet grows from 5 → 12: add `community-liaison`, `economy-analyst`, `live-ops`, `crash-triage`, `art-director`, `audio-director`, `localization-lead`.

### Phase 2 — Content Vertical Scale (months 3-6)

**Goal**: 10x the content. Same engine, same systems, more entities, more maps, more story.

```
specs/content/
├── factions/                  (was: 0)         → 6 factions, each with lore + units
├── biomes/                    (was: 3)         → 15 biomes
├── enemies/                   (was: 30)        → 300 enemies
├── bosses/                    (was: 3)         → 40 bosses
├── items/                     (was: 50)        → 1500 items
├── quests/                    (was: 0)         → 200 quests
└── story/                     (was: 0)         → main campaign, 25h
```

**How a solo dev produces this**: agent parallelism. `content-designer` runs as a fleet — one agent per content category, all simultaneously, each writing its specs first, then generating assets, then handing to `qa-runner` for scenario coverage. You are the spec reviewer, not the spec writer.

**Throughput target**: 1 reviewed-and-merged content PR per hour, 8h/day, 5 days/week → 40/week → 2000/year. `[BENCHMARK NEEDED]` after one project at scale.

**Hard rule**: nothing ships without a regression scenario. The `tests/scenarios/` directory grows linearly with content. The AI merge bot blocks PRs without scenario coverage.

### Phase 3 — Systems Depth (months 6-12)

**Goal**: add the systems that distinguish a hobby roguelike from a Dota 2.

| New system | Spec | Genre / Reference |
|---|---|---|
| Ranked matchmaking + ELO | `specs/features/matchmaking.md` | → `docs/specs/genres/moba.md`, `→ docs/specs/networking/lobby.md` |
| Anti-cheat | `specs/features/anti-cheat.md` | → `docs/specs/networking/anticheat.md` |
| Replays, casting, observers | `specs/features/replay.md` | → `docs/specs/agent/replay.md` |
| Esports tournament mode | `specs/features/tournament.md` | server-mode plugin |
| Skins, cosmetics, battle pass | `specs/features/cosmetics.md` | + DLC pipeline (`dlc/`) |
| In-game economy + marketplace | `specs/features/economy.md` | + service in `server/` |
| Voice chat | → `docs/specs/audio/voice.md` | |
| Social: friends, parties, clans | `specs/features/social.md` | + `mobile/` companion screens |
| Live ops calendar | `specs/features/live-ops.md` | infra cron + `[deploy.server]` rolling updates |
| Account system + cross-progression | `specs/features/accounts.md` | + `server/auth.rs` |
| Spectator mode + heatmaps | `specs/features/spectator.md` | telemetry replay |
| Mod workshop integration | `mods/` + `[mods].workshop_url` | → `docs/specs/scripting/sandbox.md` |

Each is a 1-2 week spec → agent → review → ship cycle. Six months covers all of the above when run with agent parallelism. You ship one major system every 2 weeks on average.

### Phase 4 — Production Polish (months 12-18)

**Goal**: bring quality from "LLM-good" to "industry-best."

This is where humans (community contributors, paid contractors) re-enter the loop:

| Quality lift | Source |
|---|---|
| Hand-painted UI iconography | commissioned artist, agent integrates |
| Voice acting | studio sessions, agent integrates dialogue trees |
| Original score | composer, agent integrates with adaptive music system → `docs/specs/audio/adaptive.md` |
| Cinematic cutscenes | in-engine via scene editor → `docs/specs/editor/scene.md` |
| Localization QA | per-language human review, file-by-file |
| Accessibility | `specs/features/accessibility.md` + scenario coverage |

The agents do not lose the ability to ship features here. Humans add the irreducibly-human craft layer on top. You still review every PR; the AI merge bot still lands them.

### Phase 5 — Live Service (months 18+)

**Goal**: continuous operation, seasonal content, esports, modding economy.

| Cadence | Mechanism |
|---|---|
| Hotfix | minutes (auto-deploy on green merge) |
| Balance patch | weekly (`balance-tuner` agent runs continuous 100k-run simulations) |
| Content patch (new heroes, maps, items) | every 2 weeks |
| Season (theme, battle pass, leaderboard reset) | every 3 months |
| Major expansion | every 12 months |

Solo dev workload at this phase: ~4h/day reviewing PRs from your agents and community, 1h/day playing your own game, 1h/day community engagement. Everything else is automation.

## Operational Scale: 1 → 1M CCU

```
[client] ──(QUIC)──► [edge relay] ──► [regional server cluster] ──► [auth/db/marketplace]
                              ▲                  ▲                            ▲
                              │                  │                            │
                              └─ infra/edge/ ────┴─ infra/k8s/ ───────────────┘
                                                  ▲
                                                  │
                                       [nexus deploy server --env=prod]
                                                  ▲
                                                  │
                                          [live-ops agent]
```

| Stage | CCU | Infra |
|---|---|---|
| Launch | 1K | 3 regions × 4 nodes (Fly.io) |
| Viral | 10K | 5 regions × 20 nodes; CDN-cached assets |
| Steady | 100K | 8 regions × 80 nodes; dedicated DB cluster; edge relay |
| Esports peak | 1M | 12 regions × 500 nodes; multi-tier matchmaking; relay mesh |

Each scale-up: a `infra/` PR drafted by `live-ops` agent, reviewed by you, applied via `nexus deploy infra`. No DevOps hire.

## Community as Workforce

The MIT license is the unlock. By month 6 you should have:

| Asset | Source |
|---|---|
| Community mods | `mods/community/` — workshop integration |
| Fan translations | localization PRs (LLM-bootstrapped, fan-polished) |
| Bug fixes from players | open-source — they read `docs/specs/`, write a fix, AI merge bot lands it |
| Maps from level designers | UGC pipeline; `nexus add scene` → workshop upload |
| Custom game modes | `[mods]` capability system → `docs/specs/scripting/sandbox.md` |

Dota 2 was originally a Warcraft 3 mod. Counter-Strike was originally a Half-Life mod. League of Legends was a DotA derivative. The best content in the genre **came from modders**. Nexus makes you mod-friendly by default; the community becomes your content team for free.

## What Stays Constant

From weekend MVP to Dota 2 scale, these never change:

| Constant | Why |
|---|---|
| `Nexus.toml` is the single source of truth | manifest grows but never splinters |
| Every feature has a spec before code | scales because specs are the agent contract |
| Every code path has a scenario | catches regression on every PR, forever |
| Headless deterministic replay | makes every bug reproducible in <5 min |
| AI merge bot lands every PR | no human bottleneck; same on day 1 and day 3000 |
| MIT license | community trust never breaks |
| One repo, one team (you + agents), one workflow | the cognitive overhead never explodes |

## What Changes

| Day 1 (MVP) | Day 1000 (Dota 2 scale) |
|---|---|
| 1 dev, 5 agents | 1 dev, ~50 specialized agents, ~10k community contributors |
| ~14K LOC | ~5M LOC |
| 0 services in prod | 30+ services in prod |
| 100 CCU peak | 1M CCU peak |
| 1 platform live | 7 platforms live |
| 0 mods | 100K+ workshop mods |
| 0 translations | 30+ languages |
| 1 commit/hour | 100 commits/hour |
| Manual telemetry review | 24/7 anomaly-detection agent |

The dev count stays at 1. The agent count and community count carry the load.

## Realistic Limits

| Bottleneck | Mitigation |
|---|---|
| Token budget | grows with revenue; first $10K MRR fully funds an aggressive agent fleet |
| You become the bottleneck (PR review) | promote `architect` agent to draft-merge low-risk PRs; you only review high-risk |
| Decision fatigue | weekly planning session: pin the 10 specs that matter; ignore the rest |
| Burnout | the engine is open-source; community PRs reduce your load over time |
| Anomaly response (3am pages) | `live-ops` agent has runbook authority for L1-L2; pages you only for L3+ |

## The Honest Caveat

This document describes a **design target**, not a current capability. The agent reliability, the engine maturity, and the community scale all have to converge for this to be real. The engine spec exists so that this convergence is **possible**. The vision is that v2.0 of Nexus (`docs/initial/vision.md` success metrics) makes it **probable**.

If you are reading this in 2026 and trying it: report what works and what does not. PR your findings into this file. The path is the spec; the path is also the experiment.

## Cross-Agent Flags
- `[AGENT: 10]` agent fleet expansion patterns; need spec for `architect`, `live-ops`, `crash-triage` roles
- `[AGENT: 12]` MMORPG + MOBA + open-world genre modules carry most of the heavy lifting at scale
- `[AGENT: 16]` AI merge bot SLAs at 100 commits/hour
- `[AGENT: 17]` need a demo game that explicitly walks this path as the integration test

## Open Questions
- `[DECISION NEEDED]` revenue-share / sponsorship model for community contributors to large-scale Nexus games — `[BENCHMARK NEEDED]` from first project at this scale
- `[DECISION NEEDED]` at what point a Nexus game **must** hire a human (legal? compliance? IP?) vs can remain pure-agent
- `[DECISION NEEDED]` whether `architect` agent gets write-access to `Nexus.toml` itself, or only PR-suggest
