<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# AI Triage

nexus-coder subscribes to the crash stream. Clusters. Ranks. Opens PRs.

## Rule

- Coder is a streaming consumer. Crashes are events, not tickets.
- Cluster by `fingerprint` (`→ docs/guides/liveops/crash-format.md`).
- Rank by `impact = count × MAU_affected × severity_weight`.
- One PR per cluster. Spec-referenced. Scenario-tested.
- Never merges its own PR. nexus-merge gates.

## Loop

```
crash stream (SSE/WebSocket from GlitchTip)
        │
        ▼
┌──────────────────┐   already-known?  ┌────────────┐
│ cluster + rank   │ ───── yes ──────▶ │ append     │
│ (by fingerprint) │                   │ to cluster │
└──────┬───────────┘                   └────────────┘
       │ no
       ▼
┌──────────────────┐
│ fetch replay     │
│ (replay_ref)     │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ generate failing │
│ scenario test    │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ propose fix      │
│ (LLM + spec)     │
└──────┬───────────┘
       ▼
┌──────────────────┐
│ run full         │
│ scenario matrix  │ ── fail → revise (max 3 attempts)
└──────┬───────────┘
       │ pass
       ▼
┌──────────────────┐
│ open PR with:    │
│ - cluster_id     │
│ - failing test   │
│ - fix            │
│ - perf delta     │
└──────────────────┘
```

## Subscription

```bash
nexus coder watch \
  --source=glitchtip --url=$URL --token=$TOK \
  --since=now --filter='release.stage in [stable,canary,beta]'
```

Internal: SSE feed. Resumable via cursor. Backpressure-safe.

## Cluster key

```python
cluster_id = hash(envelope.fingerprint[0])     # deduped at collector
# enriched in coder with:
{ "stack_hash": ..., "exception_type": ..., "module": ..., "engine_version": ... }
```

## Ranking

```
impact = clamp(
  log10(1 + count_24h)
  × users_affected / DAU
  × severity_weight[level]
  × stage_weight[release.channel],
  0, 100
)
```

| Variable | Weight |
|----------|--------|
| `severity.fatal` | 1.0 |
| `severity.error` | 0.3 |
| `severity.warning` | 0.05 |
| `stage.stable` | 1.0 |
| `stage.canary` | 0.5 |
| `stage.beta` | 0.3 |
| `stage.dev` | 0.0 (drop) |

Top N clusters per cycle = the work queue.

## Decision table (JSON, machine-readable)

```json
{
  "rules": [
    {
      "when": { "cluster.impact": ">= 70", "stage": "stable" },
      "action": "open_pr_priority_high",
      "canary_immediately": true
    },
    {
      "when": { "cluster.impact": ">= 30", "stage": "stable" },
      "action": "open_pr_priority_normal"
    },
    {
      "when": { "cluster.in_third_party_module": true },
      "action": "open_issue_upstream"
    },
    {
      "when": { "cluster.exception_type": "OutOfMemory" },
      "action": "open_pr_with_repro",
      "extra_attachments": ["heap_snapshot"]
    },
    {
      "when": { "cluster.matches": "^panic: index out of bounds" },
      "action": "open_pr_priority_high",
      "label": "off-by-one"
    },
    {
      "when": { "cluster.count_24h": "< 3", "cluster.users_affected": "< 5" },
      "action": "watch_only"
    }
  ]
}
```

Lives at `infra/coder/triage-rules.json`. Coder reads on each tick.

## PR template

```
title: fix(<module>): <one-line> [cluster-<id>]

## Cluster
- ID: <id>
- Impact: <0-100>
- Users affected (24h): <n>
- Stack: <top-3-frames>
- First seen: <ts>  · Last seen: <ts>
- Engine: <ver>     · Game: <ver>

## Repro
- Replay: <crash-id>
- Scenario: tests/scenarios/regression_<cluster-id>.toml (FAILS on main)

## Fix
<diff-summary>

## Validation
- scenario regression: pass
- scenario matrix: <pass>/<total>
- perf: Δ <Δ-ms> on frame budget
- coverage: Δ +<n> lines

## Spec
- → docs/specs/<system>/<file>.md#<section>
```

## Limits

| Limit | Default |
|-------|---------|
| PRs/day per coder | 10 |
| Attempts per cluster | 3 |
| Cluster cool-off after rejection | 24h |
| Auto-close PR if no merge within | 14d |

## Smoke test

```bash
nexus coder triage --dry-run --since=24h \
  --source=glitchtip --url=$URL --token=$TOK
# prints ranked clusters, no PRs opened
```

## Verify

```bash
nexus coder verify --pr=<num>          # re-runs scenario matrix against fix
```

## Rollback

```bash
nexus coder pause                       # stop subscribing
nexus coder close --pr=<num> --reason='regression'
```

## Cross-links

- `→ docs/specs/coder/workflows.md` — coder pipeline contract
- `→ docs/specs/coder/architecture.md` — runtime topology
- `→ docs/guides/liveops/crash-to-pr.md` — end-to-end
- `→ docs/guides/liveops/replay-on-crash.md`
- `→ docs/guides/merge-system.md` — gate
- `→ docs/guides/testing/scenarios.md`

## References

- Sentry issue grouping · `https://docs.sentry.io/concepts/data-management/event-grouping/`
- Google SRE on toil · `https://sre.google/sre-book/eliminating-toil/`
- Error-budget burn rate · `https://sre.google/workbook/alerting-on-slos/`

## Open

- `[DECISION NEEDED]` Default PR-per-day rate; should scale with team velocity.
- `[AGENT: 18]` confirm `docs/specs/coder/workflows.md` defines the `submit_pr(...)` step coder uses.
