<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Integrations Matrix

Every supported provider × every capability. Self-host / MIT-friendly / cost.

## Capability legend

- `E` errors / crashes
- `P` performance (traces/metrics)
- `A` analytics / events
- `F` feature flags
- `C` remote config
- `X` A/B experiments
- `D` dashboards
- `R` alerts / on-call

## Matrix

| Provider     | E | P | A | F | C | X | D | R | Self-host | License (server) | Cost tier | Notes |
|--------------|---|---|---|---|---|---|---|---|-----------|------------------|-----------|-------|
| **GlitchTip**    | y | y | n | n | n | n | n | n | yes | MIT | free / $15+ | Sentry-wire compatible; **MIT default** |
| Sentry       | y | y | n | n | n | n | n | n | yes (BSL/proprietary) | BSL (FSL post-2023) | $0–$80+ | Industry standard; SaaS easy |
| Bugsnag      | y | y | n | n | n | n | n | n | no | proprietary | $0–$59+ | Strong ANR / app-hangs |
| Rollbar      | y | n | n | n | n | n | n | n | no | proprietary | $0–$$ | Sentry alt |
| Crashlytics  | y | n | n | n | n | n | n | n | no (Firebase) | proprietary | $0 | Mobile only |
| **OpenTelemetry collector** | y | y | y | n | n | n | n | n | yes | Apache-2 | free | Pipe; pair with backends |
| **Grafana LGTM** | n | y | n | n | n | n | y | y | yes | AGPL (Grafana) + Apache (rest) | free | **default backend** |
| Datadog      | y | y | y | n | n | n | y | y | no | proprietary | $$$$ | Per-host, expensive |
| Honeycomb    | n | y | y | n | n | n | y | y | no | proprietary | event-based, $$ | OTel-native |
| New Relic    | y | y | y | n | n | n | y | y | partial | proprietary | 100GB free | OTLP supported |
| Prometheus   | n | y | n | n | n | n | n | y | yes | Apache-2 | free | Metrics only |
| Loki         | n | n | y(logs) | n | n | n | n | n | yes | AGPL | free | Logs |
| Tempo        | n | y | n | n | n | n | n | n | yes | AGPL | free | Traces |
| Mimir        | n | y | n | n | n | n | n | n | yes | AGPL | free | Long-term Prom |
| **PostHog**      | n | n | y | y | n | y | y | n | yes | MIT (OSS edition) | free / $$ | **analytics default** |
| Mixpanel     | n | n | y | n | n | y | n | n | no | proprietary | 1M/mo free | Strong funnels |
| Amplitude    | n | n | y | y | n | y | n | n | no | proprietary | 10M/mo free | Good cohort UI |
| GA4          | n | n | y | n | n | n | n | n | no | proprietary | free | Web-centric |
| Segment      | n | n | y | n | n | n | n | n | no | proprietary | $$ | Event pipe |
| Snowplow     | n | n | y | n | n | n | n | n | yes | Apache-2 | free | Pipeline-grade |
| **GrowthBook**   | n | n | n | y | y | y | n | n | yes | MIT | free | **flags + A/B default** |
| LaunchDarkly | n | n | n | y | y | y | n | n | no (relay) | proprietary | $$$ | Best UI |
| Statsig      | n | n | y | y | y | y | n | n | no | proprietary | $0–$$ | Free tier |
| Unleash      | n | n | n | y | n | y | n | n | yes | Apache-2 | free | Mature OSS |
| Flagsmith    | n | n | n | y | y | y | n | n | yes | BSD-3 | free | Clean UI |
| ConfigCat    | n | n | n | y | y | y | n | n | no | proprietary | $0–$ | Cheap |
| Firebase Remote Config | n | n | y | y | y | y | n | n | no | proprietary | free tier | Mobile-first |
| OpenFeature  | n | n | n | y(spec) | n | n | n | n | yes | Apache-2 | free | Spec only — adapter target |
| **ntfy.sh**      | n | n | n | n | n | n | n | y | yes | Apache-2 | free | **paging default** |
| PagerDuty    | n | n | n | n | n | n | n | y | no | proprietary | $$$ | Industry std |
| Opsgenie     | n | n | n | n | n | n | n | y | no | proprietary | $$ | Atlassian |
| Healthchecks.io | n | n | n | n | n | n | n | y | yes | BSD-3 | free | Cron monitor |

## MIT-default stack (recommended)

```
GlitchTip + Grafana LGTM + OTel collector + PostHog OSS + GrowthBook + ntfy.sh
```

- Fits on one $20/mo VPS for an indie launch.
- Every layer MIT or Apache or BSD or AGPL.
- Every layer swappable for a vendor without engine code change.

## Adapter coverage (engine ships)

| Capability | Adapter modules |
|-----------|-----------------|
| E | `sentry` (covers GlitchTip + Sentry), `bugsnag`, `rollbar`, `file`, `stdout` |
| P | `otlp` (universal), `datadog`, `newrelic` |
| A | `posthog`, `mixpanel`, `amplitude`, `segment`, `snowplow` |
| F+C+X | `openfeature` (covers GrowthBook + Unleash + LaunchDarkly + Flagsmith) |
| R | `alertmanager-webhook`, `ntfy`, `pagerduty`, `opsgenie` |

## Machine-readable

Also at `infra/integrations/matrix.json`:

```json
[
  {
    "id": "glitchtip",
    "capabilities": ["E","P"],
    "self_host": true,
    "license": "MIT",
    "cost_tier": "free",
    "default_for": ["E"],
    "wire_compatible_with": ["sentry"],
    "engine_adapter": "sentry",
    "docs": "https://glitchtip.com/documentation"
  },
  {
    "id": "sentry",
    "capabilities": ["E","P"],
    "self_host": true,
    "license": "FSL",
    "cost_tier": "freemium",
    "engine_adapter": "sentry",
    "docs": "https://docs.sentry.io/"
  },
  {
    "id": "growthbook",
    "capabilities": ["F","C","X"],
    "self_host": true,
    "license": "MIT",
    "cost_tier": "free",
    "default_for": ["F","C","X"],
    "engine_adapter": "openfeature",
    "docs": "https://docs.growthbook.io/"
  },
  {
    "id": "posthog",
    "capabilities": ["A","F","X","D"],
    "self_host": true,
    "license": "MIT",
    "cost_tier": "free",
    "default_for": ["A"],
    "engine_adapter": "posthog",
    "docs": "https://posthog.com/docs"
  },
  {
    "id": "grafana-lgtm",
    "capabilities": ["P","D","R"],
    "self_host": true,
    "license": "AGPL+Apache-2",
    "cost_tier": "free",
    "default_for": ["P","D","R"],
    "engine_adapter": "otlp",
    "docs": "https://github.com/grafana/docker-otel-lgtm"
  },
  {
    "id": "ntfy",
    "capabilities": ["R"],
    "self_host": true,
    "license": "Apache-2",
    "cost_tier": "free",
    "default_for": ["R"],
    "engine_adapter": "ntfy",
    "docs": "https://docs.ntfy.sh/"
  }
]
```

(Full file ships with every game template, includes all rows from the matrix above.)

## Vendor-honesty notes

- Sentry SaaS is best-in-class UX. If you ship beyond hobby scale and don't want to self-host, it's the safe choice. GlitchTip is the OSS escape hatch.
- LaunchDarkly's UI for flags + audit is unmatched. GrowthBook closes most of the gap for free.
- Datadog wins on integrations breadth. Cost scales painfully past 50 hosts.
- PostHog OSS gives 80% of Mixpanel/Amplitude for $0 — at the cost of running Postgres + ClickHouse.
- Firebase pulls you into Google's gravity well. Convenient; lock-in real.

## Cross-links

- `→ docs/guides/liveops/glitchtip.md`
- `→ docs/guides/liveops/sentry.md`
- `→ docs/guides/liveops/bugsnag.md`
- `→ docs/guides/liveops/analytics.md`
- `→ docs/guides/liveops/feature-flags.md`
- `→ docs/guides/liveops/telemetry-pipeline.md`
- `→ docs/guides/liveops/alerts.md`

## References

- Sentry license (FSL) · `https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/`
- GrowthBook · `https://docs.growthbook.io/`
- PostHog OSS · `https://github.com/PostHog/posthog`
- Grafana LGTM · `https://github.com/grafana/docker-otel-lgtm`
- OpenFeature · `https://openfeature.dev/`

## Open

- `[VERIFY — provider policy changes]` review matrix quarterly; licenses + free-tiers shift.
