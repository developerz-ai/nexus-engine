---
name: wait-for-ci
description: Poll gh pr checks --watch until all required checks finish. Distinguishes required vs optional, handles flaky reruns, enforces timeout. Triggers: wait for ci, watch checks, ci status.
allowed-tools: Bash(gh *) Bash(jq *) Bash(sleep *) Read
---

# wait-for-ci

Block until CI verdict known. Emit JSON. No prose narration.

## Inputs
| Var | Source |
|---|---|
| `PR` | `$ARGUMENTS` or `gh pr view --json number -q .number` |
| `TIMEOUT_MIN` | default 30 |
| `REQUIRED` | from branch-protection; cached in `.github/required-checks.json` |

## Loop
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
DEADLINE=$(( $(date +%s) + 60 * ${TIMEOUT_MIN:-30} ))

# Watch mode — blocks until first verdict
gh pr checks "$PR" --watch --fail-fast=false || true

# Then snapshot
gh pr view "$PR" --json statusCheckRollup,number,headRefName \
  > /tmp/ci.json
```

## Classify (jq)
```bash
jq '
  .statusCheckRollup
  | group_by(.conclusion // .status)
  | map({k: (.[0].conclusion // .[0].status), n: length, names: map(.name)})
' /tmp/ci.json
```

| Bucket | Meaning | Action |
|---|---|---|
| `SUCCESS` | green | continue |
| `FAILURE` `CANCELLED` `TIMED_OUT` `ACTION_REQUIRED` | red | emit `failed` summary; route to `pr-rebase-and-recover` or domain-engineer |
| `IN_PROGRESS` `QUEUED` `PENDING` | running | re-poll until deadline |
| `NEUTRAL` `SKIPPED` | optional, ignore unless required | check `REQUIRED` |

## Re-poll loop (when only PENDING left)
```bash
while [ $(date +%s) -lt $DEADLINE ]; do
  gh pr view "$PR" --json statusCheckRollup -q \
    '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length' \
    | grep -q '^0$' && break
  sleep 30
done
```

## Flaky re-runs
- A check that failed once and passed on rerun → record but accept.
- A check that flaps ≥3 times in one PR → emit `flaky` event, do NOT block; flag in `docs/guides/testing/ci.md` (Agent 20).
- Re-run a single check:
```bash
gh run rerun "$RUN_ID" --failed
```

## Required vs optional
- Required list lives at `.github/required-checks.json` (array of check names).
- A FAILURE in a non-required check → emit `optional_failure`, do NOT block merge.

## Output (JSON)
```json
{
  "pr": 123,
  "verdict": "green|red|timeout",
  "required_pass": 12,
  "required_fail": 0,
  "optional_fail": 1,
  "duration_s": 412,
  "flaky": ["bench-windows"],
  "failing_checks": []
}
```

## Timeout policy
| `TIMEOUT_MIN` | Tier | Action on timeout |
|---|---|---|
| 15 | unit/lint | emit `timeout`, route to `ci-engineer` |
| 30 | default | escalate to mastermind |
| 60 | bench/visual | acceptable; keep polling once if `--patient` |

SLO target: required checks green in ≤15 min (see `docs/guides/pr-workflow.md`).

## Refs
- https://cli.github.com/manual/gh_pr_checks
- https://cli.github.com/manual/gh_run_rerun
- `docs/guides/testing/ci.md` (Agent 20)
