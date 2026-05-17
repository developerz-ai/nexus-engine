<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Alerts

Defaults a solo dev can sleep through. Page only when player experience is on fire.

## Rule

- Alert on symptoms (crash rate, p99 frame time), not causes.
- Error budgets, not raw thresholds. See Google SRE Workbook ch. 5.
- Routing: warn → chat. Page → phone. Repeat-page on unack only.
- Every alert links to a runbook.

## Default rules

| Alert | Condition | Severity | Route |
|-------|-----------|----------|-------|
| `crash_rate_spike`   | `crash/min > 5×24h_baseline` for 5m | page | phone |
| `crash_free_breach`  | crash-free-users < 99% for 15m | page | phone |
| `p99_frame_regress`  | p99 frame > 33ms for 10m (target 60FPS) | warn | chat |
| `server_5xx_spike`   | `5xx/min > 3×baseline` for 5m | page | phone |
| `flag_blast_radius`  | new flag → crash rate doubled in cohort | page | phone (auto-rollback fires first) |
| `analytics_silence`  | events/min == 0 for 5m | warn | chat (collector dead) |
| `symbol_missing`     | unsymbolicated crash > 1 hour after release | warn | chat |
| `disk_full`          | collector disk > 85% | page | phone |
| `auth_failure_spike` | login failures > 10×baseline | page | phone |

`infra/alerts/rules.yaml` ships with these. Override per game.

## Rule file (Prometheus / Alertmanager)

```yaml
groups:
- name: nexus-game
  rules:
  - alert: CrashRateSpike
    expr: |
      sum(rate(nexus_errors_total{level="fatal"}[5m]))
      >
      5 * sum(rate(nexus_errors_total{level="fatal"}[24h] offset 24h))
    for: 5m
    labels: { severity: page }
    annotations:
      summary: "crash rate {{$value}}/s — 5× yesterday"
      runbook: "https://github.com/{{org}}/{{game}}/blob/main/runbooks/crash-spike.md"

  - alert: CrashFreeBreach
    expr: nexus_crash_free_users < 0.99
    for: 15m
    labels: { severity: page }
    annotations:
      summary: "crash-free users {{$value | humanizePercentage}} < 99%"
      runbook: "runbooks/crash-free.md"
```

## Routing

```yaml
# infra/alertmanager/config.yml
route:
  group_by: [alertname, severity]
  receiver: chat
  routes:
    - matchers: [severity="page"]
      receiver: phone
      repeat_interval: 30m

receivers:
  - name: chat
    webhook_configs:
      - url: ${SLACK_WEBHOOK}
  - name: phone
    webhook_configs:
      - url: https://ntfy.sh/${NTFY_TOPIC}      # default: free, MIT
        send_resolved: true
```

| Channel | Tool | Cost |
|---------|------|------|
| chat  | Slack / Discord / Mattermost | free |
| phone | ntfy.sh (push) | free (MIT self-host or hosted) |
| phone | PagerDuty / Opsgenie | $$, vendor |
| email | SMTP | free |
| voice | Twilio | per-call |

ntfy.sh default — installable as PWA, no account, free, self-host option.

## Solo-dev "good enough to sleep"

| Setting | Default |
|---------|---------|
| Quiet hours | 23:00–07:00 local |
| Quiet override | severity = `page` AND condition for ≥ 10m |
| Auto-snooze | if auto-rollback fires, snooze 30m |
| Weekend grace | warn-only on Sun for non-page |

`→ docs/guides/liveops/oncall.md`

## Auto-rollback path

`crash_rate_spike` → `canary-rollback` action runs BEFORE paging:

```
alert fires → check channel == canary → trigger nexus publish --rollback → page only if rollback fails
```

`→ docs/guides/liveops/canary-and-rollback.md`

## Smoke test

```bash
nexus alerts test --rule=CrashRateSpike      # fires synthetic event
nexus alerts dry-run                          # evaluates all rules locally
```

## Verify

```bash
amtool alert query --alertmanager.url=$URL severity=page
```

## Rollback

```bash
nexus alerts disable CrashRateSpike --reason="known-issue #312" --until=2026-05-20
```

## Cross-links

- `→ docs/guides/liveops/dashboards.md` — alert tiles link to drill-downs
- `→ docs/guides/liveops/oncall.md` — on-call rotation
- `→ docs/guides/liveops/postmortem.md` — alert → postmortem flow
- `→ docs/guides/liveops/canary-and-rollback.md`

## References

- Google SRE Workbook · `https://sre.google/workbook/`
- Alertmanager · `https://prometheus.io/docs/alerting/latest/alertmanager/`
- ntfy.sh · `https://docs.ntfy.sh/`
- PagerDuty · `https://developer.pagerduty.com/`

## Open

- `[DECISION NEEDED]` Default error-budget burn-rate alerting policy (fast-burn 2% in 1h, slow-burn 10% in 6h).
