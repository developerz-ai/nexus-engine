<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Postmortem

Blameless. Mechanism-focused. Linked from crash cluster to doc.

## Rule

- Every page-tier incident gets a postmortem within 5 business days.
- Blameless: name the system, not the human or agent.
- Action items have an owner and a due date; tracked to completion.
- Doc lives in repo: `postmortems/<date>-<slug>.md`.

## Template

```markdown
# Postmortem — <slug>
Date: 2026-05-17
Authors: <handles>
Status: draft | review | published
Severity: SEV1 | SEV2 | SEV3
Linked cluster: <id>
Linked alert: <id>

## Summary
One paragraph: what happened, blast radius, duration.

## Impact
- Users affected: <n> (<%>)
- Sessions affected: <n>
- Revenue impact: $<amount>
- SLO burn: <%> of monthly budget

## Timeline (UTC)
- 03:14 — alert fired
- 03:15 — auto-rollback attempted
- 03:18 — auto-rollback failed
- 03:25 — on-call ack
- 03:31 — manual rollback live
- 03:40 — recovery confirmed

## Root cause
Mechanism, not person. Example: "Drop table version 2026-05-17.1 had value range
beyond schema clamp. Server accepted; client overflowed; renderer crashed in
shadow pass."

## What went well
- Auto-detect within 60s
- Auto-rollback flow worked partially
- Telemetry retained for diagnosis

## What went wrong
- Schema range checker did not cover nested arrays
- Auto-rollback for live-content reverted manifest but cached client kept stale
- Runbook for shadow-pass crash was missing

## Where we got lucky
- Issue happened on canary, not stable
- Crash hash collided with prior cluster → already had repro tooling

## Action items
| # | Owner | Due | Item |
|---|-------|-----|------|
| 1 | coder | 2026-05-20 | Add nested-array schema validation |
| 2 | dev   | 2026-05-21 | Force-purge CDN on rollback |
| 3 | coder | 2026-05-22 | Write runbook for shadow-pass crash |

## Detection improvements
- Add alert: schema_range_violation
- Add scenario test: balance.* nested arrays
```

## Severity scale

| SEV | Criteria |
|-----|----------|
| SEV1 | stable channel down or unplayable for >5% users, or > 30min |
| SEV2 | non-stable channel down, or stable degraded < 5% users |
| SEV3 | warn-tier alert that required human intervention |
| SEV4 | tracked-only, no action needed |

## Blameless rules

- Use "the deploy" / "the schema check" / "the coder PR" — never "Alice's deploy".
- AI agents named by role, not instance: "nexus-coder", not "coder-instance-42".
- Focus on missing guardrails, not missed catches.

## Coder integration

```bash
nexus postmortem new --cluster=<id> --alert=<id>
# generates stub from cluster + alert + timeline (auto-pulled from alertmanager + dashboards)
```

Coder fills:

- Summary draft (from cluster envelope + replay)
- Timeline (from alert log + audit log)
- Root cause hypothesis (from replay + diff window)
- Action item suggestions (from rule gaps)

Human reviews + approves.

## Retention

| Item | Keep |
|------|------|
| Postmortem doc | forever (git) |
| Linked cluster events | match `→ privacy.md` retention |
| Linked replays | 365d |
| Linked telemetry traces | 365d |

## Indexing

`postmortems/INDEX.md` lists all postmortems with date, severity, root cause tag (taxonomy below).

## Root-cause taxonomy

| Tag | Examples |
|-----|----------|
| `config-drift` | schema not enforcing range |
| `regression-shipped` | scenario test missing |
| `dep-bump` | engine/lib upgrade broke API |
| `infra-capacity` | OOM, disk full |
| `vendor-outage` | Sentry/Datadog/CDN down |
| `auth-leak` | rate limiter weak |
| `data-corruption` | save schema mismatch |
| `race-condition` | timing-dependent bug |

Quarterly: roll up by tag → invest in the top category.

## Smoke test

```bash
nexus postmortem dry-run --cluster=<id>
```

## Verify

```bash
nexus postmortem status --since=90d     # open actions, age, owner
```

## Cross-links

- `→ docs/guides/liveops/ai-triage.md` — cluster source
- `→ docs/guides/liveops/alerts.md`
- `→ docs/guides/liveops/oncall.md`
- `→ docs/guides/liveops/crash-to-pr.md`

## References

- Google SRE postmortem culture · `https://sre.google/sre-book/postmortem-culture/`
- Etsy code as craft, blameless postmortems · `https://www.etsy.com/codeascraft/blameless-postmortems`
- PagerDuty postmortem ops guide · `https://postmortems.pagerduty.com/`

## Open

- `[DECISION NEEDED]` Make postmortems publicly published by default for OSS games — full transparency, but PII risk.
