<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Solo-Dev On-Call

You are the on-call. Defaults assume one human + an AI rotation partner.

## Rule

- Alert routing distinguishes "can wait until morning" from "wake me".
- AI handles tier-1 triage and most auto-rollbacks.
- Phone wakes only if AI cannot resolve AND symptoms are user-impacting.
- Every page has a runbook URL. No exceptions.

## Tier table

| Tier | Who | Channel | Response SLA |
|------|-----|---------|--------------|
| T0 wake | human | phone (ntfy/PagerDuty) | 15 min |
| T1 attend | human | chat | 2 h |
| T2 review | human or coder | issue tracker | 24 h |
| T3 trend | coder weekly | dashboard | 1 week |

## Quiet hours

```toml
[oncall]
quiet_hours_local = "23:00-07:00"
quiet_override = ["severity:page"]
weekend_grace = true                # warns chat only on Sat/Sun
auto_snooze_on_auto_rollback_minutes = 30
```

## Routing

```yaml
# infra/alertmanager/routes.yml
- match: { severity: page }
  receiver: phone
  group_wait: 30s          # let auto-rollback try first
  repeat_interval: 30m
- match: { severity: warn }
  receiver: chat
  repeat_interval: 4h
- match: { severity: info }
  receiver: chat
  group_interval: 1h
```

## "Good enough to sleep" defaults

| Symptom | Wakes? | Why |
|---------|--------|-----|
| Crash spike > 5×, auto-rollback fired & succeeded | no | already mitigated, review AM |
| Crash spike > 5×, auto-rollback failed | yes | manual rollback required |
| p99 frame +15% on canary | no | block promotion, review AM |
| Server 5xx > 3× baseline | yes | players failing |
| Auth failure spike | yes | account access broken |
| Symbol missing 1h after release | no | warn chat only |
| Disk 85% | no | scale plan in chat |
| Disk 95% | yes | imminent loss |
| Collector dead 5m | no (warn) | new events queue locally |
| Collector dead 30m | yes | data loss imminent |

## Runbook template

```
runbooks/<alert-name>.md
```

```markdown
# CrashRateSpike

Symptom: crash/min > 5×24h_baseline.

## Auto-actions
- nexus publish watch fires rollback if release is on canary/beta.

## Manual steps
1. Check `nexus publish status` for active rollouts.
2. If rollout active and auto-rollback did not fire:
   `nexus publish rollback --release=$LATEST --reason=crash_spike`
3. If no rollout: pick top cluster from GlitchTip.
   `nexus cluster status --cluster=<id>`
4. Open hotfix PR.
5. Page sec-on-call if cluster is a known CVE.
```

## AI partner role

| Action | AI can do | AI cannot |
|--------|-----------|-----------|
| Rollback content/config | yes | — |
| Rollback server | yes if canary | not stable without sign-off |
| Rollback OTA | no | — |
| File postmortem stub | yes | — |
| Open hotfix PR | yes | merge — needs gate |
| Update status page | yes (templated) | wording outside template |

`→ docs/specs/coder/workflows.md`

## Phone tooling

| Tool | Cost | Notes |
|------|------|-------|
| ntfy.sh | free | default; PWA push |
| PagerDuty | $$ | rotations + escalations |
| Opsgenie | $ | similar |
| Twilio voice | per-call | last-resort voice call |

`→ docs/guides/liveops/alerts.md`

## Escalation (when team grows)

```
T0 wake → primary on-call (you)
   ↑ no ack 15m → secondary
   ↑ no ack 30m → broadcast all
   ↑ no ack 60m → recorded voice call
```

## Smoke test

```bash
nexus oncall test --send-page             # synthetic page
nexus oncall test --quiet-hours --send-warn  # should NOT wake
```

## Verify

```bash
nexus oncall audit --since=30d
# → pages count, false-wake count, MTTA, MTTR per tier
```

## Cross-links

- `→ docs/guides/liveops/alerts.md`
- `→ docs/guides/liveops/postmortem.md`
- `→ docs/guides/liveops/cadence.md` — freeze windows
- `→ docs/guides/liveops/canary-and-rollback.md`

## References

- Google SRE on-call · `https://sre.google/sre-book/being-on-call/`
- ntfy.sh · `https://docs.ntfy.sh/`
- PagerDuty · `https://www.pagerduty.com/`

## Open

- `[DECISION NEEDED]` Default false-wake budget per month for solo dev. Currently 1.
