<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Live-Ops — Thesis

Games iterate like web apps. Solo dev + AI closes the loop in hours, not quarters.

## The principle

A shipped game is not done. It is instrumented. Every crash, every frame stutter, every churn event flows back to the dev. AI triages, proposes a fix, gates it through scenario tests, and pushes a hotfix without a binary rebuild. The dev sleeps. The patch ships.

Every hour cut from `crash → fix → live` is a unit of leverage. Defaults make the loop free.

## The loop

```
   ┌─────────┐    crash + telemetry     ┌──────────────┐
   │ player  │ ───────────────────────▶ │ collector    │
   └─────────┘                          │ (GlitchTip / │
        ▲                               │  Sentry /    │
        │  hotfix / OTA / live-content  │  OTel)       │
        │                               └──────┬───────┘
        │                                      │ stream
        │                                      ▼
   ┌────┴─────────┐  PR + scenario   ┌──────────────────┐
   │ live-content │ ◀──── tests ──── │  nexus-coder     │
   │ + OTA + flags│                  │  (AI triage)     │
   └──────────────┘                  └──────┬───────────┘
        ▲                                   │ replay
        │ canary + rollback                 ▼
        │                            ┌──────────────┐
        └──────────── CI ─────────── │ nexus-merge  │
                                     └──────────────┘
```

## Cadence — web vs Nexus

| Action            | Web baseline | Nexus target |
|-------------------|--------------|--------------|
| Hotfix script/asset | minutes    | minutes (live-content) |
| Balance tweak       | hours      | < 1 h (remote config) |
| Feature flag flip   | seconds    | seconds (GrowthBook) |
| Binary patch (OTA)  | hourly     | < 24 h (delta channels) |
| Full release        | weekly     | weekly (cadence.md) |
| Crash → root cause  | hours      | < 30 min (AI triage + replay) |
| Crash → user fix    | 1 day      | < 24 h (hotfix pipeline) |
| Postmortem          | 1 week     | next business day |

Source: Google SRE Workbook, ch. 7 (error budgets) · DORA 2024 elite cohort.

## What changed

| Old game | Nexus game |
|----------|------------|
| Patch = certify + 2 weeks | Patch = git push |
| Crash dump → email → ticket | Crash → JSON envelope → coder PR |
| Telemetry behind launcher | OTel by default |
| Balance change = release | Balance change = config flip |
| Postmortem = blame doc | Postmortem = scenario test |
| QA writes repros | Replay-on-crash IS the repro |

## Defaults (MIT-aligned self-host)

- Errors: **GlitchTip** (Sentry-wire-compatible, MIT) → `→ docs/guides/liveops/glitchtip.md`
- Telemetry: **Grafana LGTM** (Loki + Grafana + Tempo + Mimir) → `→ docs/guides/liveops/telemetry-pipeline.md`
- Analytics: **PostHog OSS** → `→ docs/guides/liveops/analytics.md`
- Flags: **GrowthBook** (MIT) → `→ docs/guides/liveops/feature-flags.md`
- Alerts: **ntfy.sh** (free, self-hostable) → `→ docs/guides/liveops/alerts.md`

Switch any layer for vendor (Sentry/Datadog/LaunchDarkly) without touching engine code — adapters fan out from ONE envelope.

## Read next

1. `→ docs/guides/liveops/error-reporting.md` — the one envelope
2. `→ docs/guides/liveops/replay-on-crash.md` — deterministic repro
3. `→ docs/guides/liveops/ai-triage.md` — nexus-coder consumes the stream
4. `→ docs/guides/liveops/one-month-game.md` — week-by-week recipe

## Cross-links

- `→ docs/specs/agent/replay.md` — deterministic snapshot/replay
- `→ docs/specs/coder/workflows.md` — coder PR pipeline
- `→ docs/guides/deploy/observability.md` — infra layer
- `→ docs/guides/testing/scenarios.md` — gating tests
- `→ docs/game-template/cli.md` — `nexus replay`, `nexus hotfix`

## References

- Google SRE Workbook · `https://sre.google/workbook/`
- DORA State of DevOps 2024 · `https://cloud.google.com/devops`
- Sentry Engineering blog on game telemetry · `https://blog.sentry.io/`
