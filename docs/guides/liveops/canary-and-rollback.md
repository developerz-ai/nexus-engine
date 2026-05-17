<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Canary & Rollback

% rollout. Health-gated promotion. Auto-revert on regression.

## Rule

- Every change goes canary first. No direct-to-stable.
- Canary cohort: 1% by default (tunable per channel).
- Promotion is gated by health checks, not a timer alone.
- Rollback < 60s for content/config; < 5 min for server; hours for OTA.

## Stages

```
dev → canary (1%) → beta (10% opt-in) → stable (100%)
       │              │                  │
       │              │                  └── promote on holdout + manual sign-off
       │              └── promote on metrics-after-N-days
       └── promote on bake_time elapsed AND no guardrail breach
```

## Health gates

| Gate | Threshold | Window |
|------|-----------|--------|
| `crash_free_users`  | >= 99.0% | full canary window |
| `p99_frame_time`    | <= 1.10 × stable baseline | full window |
| `session_length_p50`| >= 0.90 × stable baseline | full window |
| `server_error_rate` | <= 1.20 × stable baseline | full window |
| `revenue_per_dau`   | >= 0.90 × stable baseline | full window |
| `bake_time`         | >= 2h content / 24h binary | absolute |

Any gate fails → auto-rollback fires. All gates pass for the bake duration → eligible for promote.

## Bake times

| Change kind | Bake (canary) | Bake (beta) |
|-------------|---------------|-------------|
| Remote config | 30 min | 2 h |
| Feature flag | 30 min | 2 h |
| Live-content (scripts/assets) | 2 h | 12 h |
| Server deploy | 1 h | 6 h |
| OTA binary | 24 h | 72 h |
| Engine bump | 72 h | 1 week |

## Rollout command

```bash
nexus publish --channel=canary --release=01HXYZ --percent=1
nexus publish status --release=01HXYZ        # watch gates
nexus publish promote --release=01HXYZ --to=beta
nexus publish promote --release=01HXYZ --to=stable
```

## Auto-rollback

```bash
nexus publish watch --release=01HXYZ --auto-rollback
# subscribes to alerts; if guardrail breach → fires:
#   - live-content: flip channel pointer to prior release (< 60s)
#   - remote-config: swap version (< 60s)
#   - flag: kill variant (< 60s)
#   - server: kubectl rollout undo (< 5 min)
#   - OTA: halt rollout (varies by store)
# then pages on-call
```

## Manual rollback

```bash
nexus publish rollback --release=01HXYZ --reason='crash_spike'
nexus publish rollback --release=01HXYZ --kind=content     # only content layer
nexus publish rollback --release=01HXYZ --kind=config      # only config layer
```

## Promotion criteria

A release may promote to next channel when:

1. All health gates pass for full bake window.
2. No open `severity:page` alert.
3. Coder has not opened a PR tagged `breaks-<release-id>`.
4. (beta → stable) Holdout vs treatment delta within MDE on guardrails.
5. (binary OTA) symbol upload verified for the release.

`nexus publish can-promote --release=01HXYZ --to=stable` prints checklist + decision.

## Blast radius

Canary cohort selection:

| Strategy | When |
|----------|------|
| Random hash % bucket | default |
| Geo-pinned (region) | regulatory rollouts |
| Channel-only (beta opt-in) | risky changes |
| Internal-first (employee flag) | very risky |

Never canary minors (COPPA) by default.

## Smoke test

```bash
nexus publish dry-run --release=01HXYZ --percent=1 \
  --simulate-users=10000
```

## Verify

```bash
nexus publish status --release=01HXYZ
# → percent live, exposures, gate values, time until next eligible promote
```

## Rollback drill

Quarterly chaos test:

```bash
nexus publish drill --simulate-crash-spike --release=01HXYZ
# fires synthetic alert, expects auto-rollback within SLA
```

## Cross-links

- `→ docs/guides/liveops/alerts.md` — fires the auto-rollback
- `→ docs/guides/liveops/live-content.md`
- `→ docs/guides/liveops/remote-config.md`
- `→ docs/guides/liveops/feature-flags.md`
- `→ docs/guides/liveops/ota-updates.md`
- `→ docs/guides/release/` (Agent 21)

## References

- Google SRE on canarying · `https://sre.google/workbook/canarying-releases/`
- Spinnaker canary analysis · `https://spinnaker.io/docs/guides/user/canary/`
- Argo Rollouts · `https://argoproj.github.io/argo-rollouts/`

## Open

- `[DECISION NEEDED]` Auto-rollback default policy on first-day-of-launch (different gates may apply).
