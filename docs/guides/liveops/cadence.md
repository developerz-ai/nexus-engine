<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release Cadence

Predictable cadence beats heroic pushes. Defaults shipped with `nexus new`.

## Rule

- Cadence drives discipline. Discipline drives sleep.
- Every cadence tier has a gate. Skip a gate → block the tier.
- Off-tier emergencies allowed: tier `hotfix`, with break-glass log.

## Tiers

| Tier        | Cadence | What changes | Gate |
|-------------|---------|--------------|------|
| `hotfix`    | < 24h on demand | bugfix scripts/config/server | scenario regression test + 2h canary |
| `balance`   | weekly (Tue) | numbers, drop tables | A/B significance OR design sign-off |
| `content`   | bi-weekly | new levels, cosmetics, scripts | full scenario matrix + 12h beta |
| `feature`   | monthly | new mechanics, UI changes | full matrix + 72h beta + holdout |
| `engine`    | per LTS (quarterly) | engine version bump | full matrix + 1-week beta + holdout |

## Per-tier checklist

```
[ ] hotfix
  - scenario regression test (FAILS on main, PASSES on PR)
  - changeset limited to hotfixable categories (→ hotfix-pipeline.md)
  - canary 1% for 2h, gates green
  - changelog entry

[ ] balance
  - schema-validated diff (→ remote-config.md)
  - A/B if measurable; design sign-off if not
  - canary 1% for 24h
  - patch notes player-readable

[ ] content
  - full scenario matrix green
  - perf budget within Δ
  - localized strings present (every supported locale OR fallback ok)
  - beta 12h
  - changelog + dev blog

[ ] feature
  - feature flag wraps every new code path
  - full scenario matrix
  - perf benchmark Δ within budget
  - beta 72h with holdout
  - changelog + dev blog + marketing assets

[ ] engine
  - upstream LTS bump merged
  - full integration test pass on all platforms
  - beta 1 week
  - migration notes per breaking change
  - announce 2 weeks ahead
```

## Solo-dev default schedule

| Day | Action |
|-----|--------|
| Mon | review weekend crash clusters, queue hotfixes |
| Tue | balance patch publish (canary AM, promote PM) |
| Wed | content work (no shipping) |
| Thu | content shipping window if bi-weekly |
| Fri | freeze; no shipping after 14:00 local |
| Sat | quiet; auto-rollback only |
| Sun | quiet; auto-rollback only |

Override anytime; this is just the default.

## Freeze windows

| Window | Behavior |
|--------|----------|
| Friday 14:00 → Monday 09:00 | no manual ships; auto-rollback allowed |
| Tournament eve (per game) | full freeze, hotfix break-glass only |
| Holiday (per region) | no ships in region's timezone |

`nexus publish` refuses inside freeze unless `--break-glass --reason=...`.

## Calendar in repo

```
infra/cadence/calendar.toml
```

```toml
[[freeze]]
name = "weekend"
cron = "0 14 * * 5"     # Fri 14:00
until = "0 09 * * 1"    # Mon 09:00

[[freeze]]
name = "tournament-2026-06"
from = "2026-06-13T00:00:00Z"
to   = "2026-06-17T00:00:00Z"

[[release]]
tier = "balance"
cron = "0 10 * * 2"     # Tue 10:00
auto = true              # coder may auto-publish if all green
```

## Telemetry feedback

| Metric | Adjusts cadence by |
|--------|--------------------|
| crash-free < 99% week-over-week | pause non-hotfix tiers until recovered |
| p99 frame regression > 5% | block feature tier promote |
| retention D7 down 5% | block content tier promote |

## Smoke test

```bash
nexus cadence next        # prints next scheduled tier + bake countdown
nexus cadence check       # validates calendar + tier checklists
```

## Verify

```bash
nexus cadence audit --since=30d
# → tier ships, on-time %, breaks-glass count, avg time-to-rollback
```

## Cross-links

- `→ docs/guides/liveops/hotfix-pipeline.md`
- `→ docs/guides/liveops/canary-and-rollback.md`
- `→ docs/guides/liveops/oncall.md`
- `→ docs/guides/liveops/postmortem.md`
- `→ docs/guides/release/` (Agent 21)

## References

- DORA elite cohort: multiple deploys/day · `https://cloud.google.com/devops`
- Spotify rhythm of release · `https://engineering.atspotify.com/`

## Open

- `[DECISION NEEDED]` Default balance day — Tue vs Wed. Tue surfaces issues with more weekday traffic.
