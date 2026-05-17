<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent Recipes — How nexus-coder Uses Live-Ops Data

Machine-readable decisions. JSON tables. Coder reads on every tick.

## Capabilities exposed to coder

| Stream / API | Action |
|--------------|--------|
| `GET /events` (SSE) | subscribe to crash + error stream |
| `GET /clusters` | list current clusters, paginated |
| `GET /clusters/<id>` | full cluster + sample envelope + replay_ref |
| `GET /replays/<ref>` | signed URL for replay download |
| `GET /telemetry/query?promql=...` | query metric backend |
| `GET /traces/<id>` | full Tempo trace |
| `GET /flags` / `POST /flags/<key>` | read / write feature flags |
| `GET /config` / `POST /config` | read / write remote config |
| `POST /publish` | issue canary / promote / rollback |
| `POST /pr` | open PR (via nexus-merge intake) |
| `GET /experiments/<key>` | experiment status |
| `POST /postmortem` | draft postmortem stub |

`→ docs/specs/coder/architecture.md`

## Subscription loop (pseudocode)

```
loop:
  events = sse_recv(/events, since=cursor)
  for ev in events:
     cluster = upsert_cluster(ev)
     if cluster.impact >= threshold:
        action = decide(cluster, rules)
        execute(action, cluster)
     cursor = ev.id
```

## Decision table (JSON)

`infra/coder/decisions.json`:

```json
{
  "version": 1,
  "ranking_weights": {
    "severity.fatal": 1.0,
    "severity.error": 0.3,
    "severity.warning": 0.05,
    "stage.stable": 1.0,
    "stage.canary": 0.5,
    "stage.beta": 0.3,
    "stage.dev": 0.0
  },
  "actions": [
    {
      "name": "auto_rollback_canary",
      "when": {
        "cluster.stage": "canary",
        "cluster.impact": ">= 60",
        "cluster.first_seen_seconds_ago": "<= 7200"
      },
      "do": [
        { "tool": "publish", "args": { "command": "rollback", "scope": "canary" } },
        { "tool": "page", "args": { "severity": "warn", "channel": "chat" } }
      ]
    },
    {
      "name": "open_hotfix_pr_high",
      "when": {
        "cluster.stage": "stable",
        "cluster.impact": ">= 70"
      },
      "do": [
        { "tool": "fetch_replay", "args": { "cluster_id": "$cluster.id" } },
        { "tool": "bisect_inputs", "args": { "max_iters": 20 } },
        { "tool": "write_scenario", "args": { "out": "tests/scenarios/regression_$cluster.id.toml" } },
        { "tool": "propose_fix", "args": { "max_attempts": 3 } },
        { "tool": "run_scenario_matrix" },
        { "tool": "open_pr", "args": { "label": "hotfix,priority-high" } }
      ]
    },
    {
      "name": "open_normal_pr",
      "when": {
        "cluster.stage": "stable",
        "cluster.impact": ">= 30",
        "cluster.impact": "< 70"
      },
      "do": [
        { "tool": "fetch_replay" },
        { "tool": "propose_fix", "args": { "max_attempts": 3 } },
        { "tool": "open_pr", "args": { "label": "fix" } }
      ]
    },
    {
      "name": "watch_only",
      "when": {
        "cluster.count_24h": "< 3",
        "cluster.users_affected": "< 5"
      },
      "do": [
        { "tool": "tag_cluster", "args": { "tag": "watching" } }
      ]
    },
    {
      "name": "upstream_issue",
      "when": { "cluster.module.matches": "^(libstd|wgpu|rapier|tokio)::" },
      "do": [
        { "tool": "tag_cluster", "args": { "tag": "third-party" } },
        { "tool": "open_upstream_issue" },
        { "tool": "open_pr", "args": { "label": "workaround" } }
      ]
    },
    {
      "name": "config_safety",
      "when": {
        "alert.name": "ConfigSchemaViolation"
      },
      "do": [
        { "tool": "rollback_config", "args": { "channel": "$alert.labels.channel" } },
        { "tool": "open_pr", "args": { "title": "tighten schema for $alert.labels.key" } }
      ]
    }
  ]
}
```

Rules evaluated top-down; first match wins. Override per game.

## Telemetry queries coder runs

```promql
# current p99 frame time per release
histogram_quantile(0.99,
  sum by (release, le) (rate(nexus_frame_time_ms_bucket[5m])))

# crash-free users by release
1 - (
  count by (release) (count by (release, player_hash) (nexus_errors_total{level="fatal"}[24h]))
  /
  count by (release) (count by (release, player_hash) (nexus_session_start_total[24h]))
)

# regression test: did this release move any metric?
abs(
  avg_over_time(nexus_session_length_s_p50{release="$NEW"}[1h])
  -
  avg_over_time(nexus_session_length_s_p50{release="$PREV"}[1h])
) / avg_over_time(nexus_session_length_s_p50{release="$PREV"}[1h])
```

Coder uses these to gate promote decisions.

## Canary watch recipe

```
on publish.canary(release):
  poll every 5 min for 2h:
     crash_free  = query(crash_free_users{release=release})
     p99_frame   = query(p99 frame ms)
     err_rate    = query(server 5xx)
     if any breaches threshold:
         execute(rollback)
         tag release: bad
         open postmortem stub
         exit
  if all green:
     tag release: canary_clean
     await promote signal
```

## Auto-rollback recipe

```
on alert.crash_rate_spike(release):
   if release.stage in [canary, beta]:
      execute(publish.rollback(scope=release.stage))
      tag release: auto_rolled_back
      open_pr(label='post-rollback investigation')
   else if release.stage == stable:
      # higher bar — page first
      execute(page(severity=page, channel=phone, runbook=runbooks/crash-spike.md))
```

## Postmortem auto-stub

```
on incident.resolved(sev>=SEV2):
   stub = build_postmortem(
     cluster=incident.cluster,
     alerts=incident.alerts,
     timeline=incident.audit_log,
     rollback=incident.rollback_log
   )
   commit(stub, path="postmortems/<date>-<slug>.md")
   open_pr(stub)
```

## Coder safety constraints

| Constraint | Default |
|-----------|---------|
| Max PRs/day | 10 |
| Max auto-rollbacks/hour | 3 (then escalate to human) |
| Max flag changes/hour | 5 |
| Max config-publishes/hour | 5 |
| Forbid: changing engine version | yes |
| Forbid: changing privacy.mode | yes |
| Forbid: changing signing keys | yes |
| Forbid: merging own PR | yes (nexus-merge gate) |

Constraints in `infra/coder/limits.json`. Breach = halt + page.

## Smoke test

```bash
nexus coder simulate --feed=samples/crashes.ndjson \
  --rules=infra/coder/decisions.json --dry-run
```

## Verify

```bash
nexus coder audit --since=24h
# → actions taken, PRs opened, rollbacks fired, halts, false-positives
```

## Cross-links

- `→ docs/specs/coder/architecture.md` — coder runtime
- `→ docs/specs/coder/workflows.md` — PR pipeline
- `→ docs/specs/coder/models.md` — LLM stack
- `→ docs/specs/coder/parallelism.md` — concurrency model
- `→ docs/guides/liveops/ai-triage.md` — clustering + ranking
- `→ docs/guides/liveops/canary-and-rollback.md`
- `→ docs/guides/liveops/postmortem.md`

## References

- Google SRE error budgets · `https://sre.google/workbook/error-budget-policy/`
- OpenTelemetry SDK · `https://opentelemetry.io/docs/instrumentation/`
- Prometheus query language · `https://prometheus.io/docs/prometheus/latest/querying/basics/`

## Open

- `[DECISION NEEDED]` Whether coder can self-modify its own decisions.json (likely: no, human-only).
- `[AGENT: 18]` Coder needs a public `submit_pr(title, body, diff, label[])` tool; confirm shape in `docs/specs/coder/workflows.md`.
- `[AGENT: 20]` Scenario runner output schema needed for `run_scenario_matrix` parsing.
