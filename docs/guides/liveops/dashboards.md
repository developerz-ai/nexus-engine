<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Dashboards

Every `nexus new` ships Grafana dashboards as code. Provisioned on first deploy.

## Shipped boards

| Board | Question it answers |
|-------|---------------------|
| `health-overview` | Is the game on fire right now? |
| `crashes` | Crashes/min, top stacks, crash-free-users % |
| `performance` | p50/p95/p99 frame time, GPU bound %, stutter rate |
| `retention` | D1/D7/D30 by cohort, churn curve |
| `monetization` | Funnel, ARPU, ARPDAU, conversion |
| `liveops` | Flag exposure, A/B variant lift |
| `infra` | Server CPU/RAM, RPS, errors |

Files: `infra/grafana/dashboards/*.json`. Provisioned via Grafana sidecar.

## Health-overview tiles

```
┌──────────────┬──────────────┬──────────────┐
│ DAU          │ Crash-free % │ p99 frame ms │
│ 12,431       │ 99.42%       │ 18.4         │
├──────────────┼──────────────┼──────────────┤
│ Net errors/s │ Sessions/min │ ARPDAU       │
│ 0.3          │ 89           │ $0.18        │
└──────────────┴──────────────┴──────────────┘
SLO bar: ████████████████████░  98.3% / 99.0% target
```

## Queries (PromQL / LogQL)

```promql
# crashes per minute
sum(rate(nexus_errors_total{level="fatal"}[1m]))

# crash-free users (24h)
1 - (count(count by (player_hash) (nexus_errors_total{level="fatal"}[24h]))
   / count(count by (player_hash) (nexus_session_start_total[24h])))

# p99 frame time
histogram_quantile(0.99, sum(rate(nexus_frame_time_ms_bucket[5m])) by (le))

# D7 retention
count(count by (player_hash) (nexus_session_start_total{day="7"}))
  / count(count by (player_hash) (nexus_session_start_total{day="0"}))
```

## Provision

```bash
nexus deploy dashboards --to=grafana --url=https://grafana.example.com
# or
docker compose up -d grafana    # mounts infra/grafana/dashboards/
```

## Edit

```bash
nexus dashboard edit health-overview      # opens local Grafana
nexus dashboard export                     # writes JSON back to repo
```

Dashboards live in git. Same review process as code.

## Drill-through

| Tile | Click → |
|------|---------|
| Crashes/min | top stacks in Sentry/GlitchTip |
| p99 frame  | Tempo traces filtered to slow frames |
| ARPDAU drop | PostHog cohort breakdown |
| Flag panel | GrowthBook variant page |

`→ docs/guides/liveops/alerts.md` — alert rules attached.

## Per-genre overlays

| Genre | Extra board |
|-------|-------------|
| FPS  | shots/sec, hit %, weapon balance |
| RPG  | quest funnel, build diversity |
| RTS  | APM, match length, win rate |
| MOBA | hero pick/ban/win, queue time |
| MMO  | concurrent users per shard |

Provisioned by `nexus add genre <name>`.

## Smoke test

```bash
nexus dashboards verify       # all queries return data
```

## Rollback

```bash
nexus dashboards rollback --to=<git_sha>
```

## Cross-links

- `→ docs/guides/liveops/telemetry-pipeline.md`
- `→ docs/guides/liveops/analytics.md`
- `→ docs/guides/liveops/alerts.md`
- `→ docs/guides/deploy/observability.md`

## References

- Grafana provisioning · `https://grafana.com/docs/grafana/latest/administration/provisioning/`
- PromQL · `https://prometheus.io/docs/prometheus/latest/querying/basics/`
- Tempo · `https://grafana.com/docs/tempo/latest/`

## Open

- `[DECISION NEEDED]` Ship Grafana as embedded service vs require external instance.
