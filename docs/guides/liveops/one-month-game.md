<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# The One-Month Solo-Dev Playbook

Idea → shipped → live-debugged → first patch in 30 days. One human + AI.

## Principle

Every hour cut from `crash → fix → live` is a unit of leverage. Defaults compound.

## Week 1 — Scaffold + core loop

### Goal
Playable core loop. Scenario tests pass. Local + headless run.

### Day 1 — Scaffold
```bash
nexus new mygame --genre=platformer --style=pixel
cd mygame
nexus run                       # opens window, default scene
nexus test                       # scenario suite green
```
- Pick genre module (`→ docs/specs/genres/`).
- Pick style module (`→ docs/specs/styles/`).
- Verify CI green on push (template includes `.github/workflows/`).

### Day 2 — Loop sketch
- Edit `game/scenes/level_01.toml`.
- Add player, ground, goal.
- `nexus test --scenario reach-goal` — write the win condition first.

### Day 3 — Mechanics
- Add jump, dash, hazards via genre module's built-in components.
- Coder writes mechanic specs from prompts.

### Day 4 — AI assets
```bash
nexus assets generate sprite --prompt='pixel-art knight, 32x32, 4-frame run' --to=game/assets/knight/
nexus assets generate music --prompt='8-bit upbeat, 90bpm, looping' --to=game/assets/music/
```
- Free path: Kenney + OpenGameArt; paid: Meshy / Scenario / FLUX (`→ docs/specs/assets/generation.md`).

### Day 5 — Scenario harness
- Write 5 scenarios covering core loop edges (`→ docs/guides/testing/scenarios.md`).
- All green = green to proceed.

### Day 6–7 — Headless validation
```bash
nexus run --headless --duration=30m --collect=telemetry.ndjson
nexus telemetry analyze telemetry.ndjson
```
- Verify no panics, perf within budget.

### End of Week 1 checklist
- [ ] `nexus run` opens a playable level.
- [ ] `nexus test` green on CI.
- [ ] First scenario `level_01_win` passes.
- [ ] Telemetry pipeline emits to local collector.
- [ ] Repo public on GitHub if you want.

## Week 2 — Polish + beta ship

### Goal
Beta build downloadable. Crash + telemetry + analytics wired. 10 testers.

### Day 8 — Polish
- Camera feel, jump arc, hit feedback.
- Lock style with `nexus style lock`.

### Day 9 — Wire live-ops defaults
```bash
nexus add observability glitchtip       # → docs/guides/liveops/glitchtip.md
nexus add analytics posthog              # → docs/guides/liveops/analytics.md
nexus add flags growthbook               # → docs/guides/liveops/feature-flags.md
nexus add content live                   # → docs/guides/liveops/live-content.md
```
Defaults are MIT-aligned + self-host.

### Day 10 — Privacy + opt-out
- `nexus diag privacy audit` — confirm strict mode on (`→ docs/guides/liveops/privacy.md`).
- Privacy settings UI auto-generated. Customize copy.

### Day 11 — Build + sign
```bash
nexus build --release --target=linux,windows,macos,web
nexus symbols upload --release=$(nexus release id) --to=glitchtip
nexus content publish --bundle=all --channel=beta
nexus publish --channel=beta
```
- `→ docs/guides/release/codesigning/`.

### Day 12 — Beta announce
- Send 10 testers a link. Beta channel.
- Watch `nexus dashboards open` (health-overview).

### Day 13 — First crashes
- Coder triages overnight (`→ docs/guides/liveops/ai-triage.md`).
- Inbox: 3 clusters, 1 PR queued by morning.

### Day 14 — First hotfix
- Review coder PR. Merge.
- `nexus hotfix publish --channel=canary` (1%).
- Watch gates green for 2h. Promote to beta.

### End of Week 2 checklist
- [ ] Beta build downloadable.
- [ ] GlitchTip receiving events.
- [ ] PostHog showing funnel.
- [ ] First coder-generated hotfix shipped via live-content.
- [ ] No PII in any envelope.

## Week 3 — Alpha → polish → marketing

### Goal
100 alpha testers. Crash-free > 99%. Marketing assets ready.

### Day 15 — Recruit alpha
- Post on r/playmygame, Discord, dev mastodon.
- Limit to 100. Beta channel auto-opens.

### Day 16 — Iterate from data
- Funnel reveals tutorial drop-off.
- Remote-config tweak: tutorial timeout +30%.
- `nexus config publish --channel=beta`.

### Day 17 — Balance via A/B
- `nexus experiments new tutorial-length-2026-05`.
- Two variants: short / standard. Primary metric: D1 retention.

### Day 18 — Performance pass
- `nexus profile --record --duration=60s`.
- Top hotspot → coder PR.

### Day 19 — Localization
- `nexus loc extract` → strings table.
- AI translate to 5 languages. `nexus loc verify`.

### Day 20 — Marketing assets
- `nexus screenshots auto --scene=highlight_reel`.
- `nexus trailer build --duration=60s` (uses replay system to produce footage).

### Day 21 — Press kit
- `nexus presskit build` → `presskit/index.html`.

### End of Week 3 checklist
- [ ] Crash-free users ≥ 99% for 7 days.
- [ ] D1 retention > 30%.
- [ ] All locales pass `nexus loc verify`.
- [ ] Presskit on a domain.
- [ ] AI experiment auto-stopped with winning variant.

## Week 4 — Ship 1.0

### Goal
Public 1.0 on itch.io / Steam / web. First post-launch hotfix shipped live.

### Mon (Day 22) — Final gate
- Full scenario matrix green.
- Perf within budget on every platform.
- No `severity:page` open.

### Tue (Day 23) — Submit + symbol upload
```bash
nexus build --release --all-targets
nexus symbols upload --release=1.0.0
nexus publish --channel=stable --target=itch
nexus publish --channel=stable --target=steam   # branch ship
nexus publish --channel=stable --target=web
```

### Wed (Day 24) — Canary 1%
- Stable rolling out to 1%.
- Watch gates (`→ canary-and-rollback.md`).
- Auto-promote rules armed.

### Thu (Day 25) — Promote
- Gates green 24h. Promote to 100%.
- Marketing push: dev blog, Twitter/Mastodon, YouTube short.

### Fri (Day 26) — First post-launch fire

Hour-by-hour playbook:

| Time | Action |
|------|--------|
| 09:00 | Open dashboards. Crash-free 99.7%. |
| 10:14 | Alert: crash spike on macOS arm64. |
| 10:14 | Auto-rollback fires content layer. Cluster ID logged. |
| 10:15 | Page snoozed (auto-rollback succeeded). |
| 10:20 | Coder enriches cluster, fetches replay. |
| 10:42 | Coder PR with failing scenario + fix. |
| 11:05 | Review. Merge. |
| 11:08 | Hotfix package built (scripts only). |
| 11:09 | Canary 1% live. |
| 13:09 | Bake clean. Promote to stable. |
| 13:30 | Postmortem stub drafted by coder. |
| 14:00 | Review postmortem, set action items, publish. |
| 14:15 | Lunch. |

### Sat (Day 27) — Quiet
- Auto-rollback only.
- Read player feedback.

### Sun (Day 28) — Quiet
- Plan week-2 content drop.

### Mon (Day 29) — First content drop
- New level via live-content.
- `nexus content publish --channel=canary`.

### Tue (Day 30) — Balance tweak
- A/B revealed economy too generous.
- `nexus config publish --key=economy.drop_rate=0.85 --channel=canary`.

### End of month checklist
- [ ] 1.0 shipped to 3+ stores.
- [ ] Crash-free > 99% sustained.
- [ ] First hotfix via live-content in < 4h from crash.
- [ ] First A/B experiment concluded.
- [ ] First content drop shipped.
- [ ] First postmortem published.

## What this proves

A solo dev iterates on a shipped game as fast as a web dev iterates on a web app. Defaults make the loop free.

## Cross-links

- `→ docs/game-template/weekend-mvp.md` — even shorter version
- `→ docs/game-template/aaa-path.md` — scale from this to AAA
- `→ docs/guides/liveops/overview.md`
- `→ docs/guides/liveops/cadence.md`
- `→ docs/game-template/cli.md`
- `→ docs/specs/agent/sdk.md`

## References

- itch.io butler · `https://itch.io/docs/butler/`
- Steamworks publishing · `https://partner.steamgames.com/doc/sdk/uploading`
- Apple TestFlight · `https://developer.apple.com/testflight/`
- Google Play internal testing · `https://support.google.com/googleplay/android-developer/answer/9845334`

## Open

- `[BENCHMARK NEEDED]` Measure real one-month attempt with this playbook; tune day-by-day.
