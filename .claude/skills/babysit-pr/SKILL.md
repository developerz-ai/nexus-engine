---
name: babysit-pr
description: End-to-end PR loop. Opens PR, waits CI, waits CodeRabbit, triages, fixes, replies, resolves, re-runs CI, merges. The mastermind invokes this and walks away. Triggers: babysit pr, drive pr, ship pr end to end.
allowed-tools: Bash(git *) Bash(gh *) Bash(jq *) Bash(sleep *) Read Edit Skill
---

# babysit-pr

Drive a PR from branch-push to merge. Idempotent — safe to re-invoke mid-loop.

## State machine
```
[branch]
  │
  └─▶ open-pr ──▶ [opened, draft]
        │
        └─▶ wait-for-ci ──▶ red ──▶ pr-rebase-and-recover ─┐
              │                                            │
              green                                        │
              │                                            │
              └─▶ mark-ready-for-review                    │
                    │                                      │
                    └─▶ wait-for-coderabbit                │
                          │                                │
                          └─▶ coderabbit-triage            │
                                │                          │
                                ├── accept ─▶ fix-from-coderabbit ──┐
                                ├── reject/discuss ─▶ coderabbit-reply
                                └── outdated ─▶ coderabbit-resolve  │
                                                                    │
                                                  (after fixes pushed)
                                                                    │
                                                  wait-for-ci ◀─────┘
                                                  │
                                                  green + all-CR-resolved + approvals
                                                  │
                                                  └─▶ pr-merge ──▶ [merged]
                                                          │
                                                          └─▶ pr-changelog
```

## Driver loop
```bash
PR="${1:-$(gh pr view --json number -q .number 2>/dev/null || echo new)}"
ROUND=0
MAX_ROUNDS=3       # kill-switch — escalate to human after 3 unproductive CR cycles

# 0. Open if not open
[ "$PR" = "new" ] && PR=$(claude-skill open-pr | jq -r .pr_number)

while :; do
  ROUND=$((ROUND+1))

  # 1. CI
  CI=$(claude-skill wait-for-ci "$PR")
  VERDICT=$(echo "$CI" | jq -r .verdict)
  if [ "$VERDICT" = "red" ]; then
    claude-skill pr-rebase-and-recover "$PR"
    continue
  fi
  [ "$VERDICT" = "timeout" ] && { emit_escalate "ci_timeout"; exit 2; }

  # 2. Mark ready
  gh pr ready "$PR" 2>/dev/null || true

  # 3. CodeRabbit
  CR=$(claude-skill wait-for-coderabbit "$PR")
  STATE=$(echo "$CR" | jq -r .cr_state)
  if [ "$STATE" = "cr_no_show" ]; then
    echo "WARN: CR did not review — proceeding without CR (advisory only)"
  else
    # 4. Triage
    PLAN=$(claude-skill coderabbit-triage "$PR")
    NACCEPT=$(echo "$PLAN" | jq '.counts.accept')
    NREJECT=$(echo "$PLAN" | jq '.counts.reject')
    NDISCUSS=$(echo "$PLAN" | jq '.counts.discuss')

    # 5. Apply fixes
    [ "$NACCEPT" -gt 0 ] && claude-skill fix-from-coderabbit "$PR"
    # 6. Post replies
    [ $((NREJECT + NDISCUSS)) -gt 0 ] && claude-skill coderabbit-reply "$PR"
    # 7. Resolve fixed threads
    claude-skill coderabbit-resolve "$PR"

    # If we pushed fixes, loop CI again
    if [ "$NACCEPT" -gt 0 ]; then
      [ "$ROUND" -ge "$MAX_ROUNDS" ] && { emit_escalate "cr_loop_unconverged"; exit 3; }
      continue
    fi
  fi

  # 8. Merge gates
  GATES=$(gh pr view "$PR" --json mergeable,reviewDecision,statusCheckRollup)
  MERGEABLE=$(echo "$GATES" | jq -r .mergeable)
  APPROVED=$(echo "$GATES" | jq -r .reviewDecision)
  if [ "$MERGEABLE" = "MERGEABLE" ] && [ "$APPROVED" = "APPROVED" ]; then
    claude-skill pr-merge "$PR"
    claude-skill pr-changelog "$PR"
    break
  else
    echo "WARN: gates not satisfied — mergeable=$MERGEABLE approved=$APPROVED"
    # enable auto-merge so as soon as gates flip, it lands
    gh pr merge "$PR" --auto --squash
    break
  fi
done
```

## Status object (emit every tick)
```json
{
  "pr": 123,
  "round": 2,
  "stage": "wait-for-coderabbit|triage|fix|reply|resolve|wait-for-ci|merge",
  "ci_verdict": "green|red|pending",
  "cr_state": "complete|in_progress|cr_no_show",
  "open_threads": 3,
  "approvals": 1,
  "mergeable": true,
  "next_action": "fix-from-coderabbit"
}
```
Mastermind parses this on each tick to decide whether to keep waiting, spawn a fix subagent in parallel, or escalate.

## Kill-switch
- `ROUND >= 3` with CR still posting new threads → escalate to human (open `[ESCALATE]` issue).
- CI red 2× from same root cause → escalate to `ci-engineer` subagent.
- Merge conflict twice in same loop → escalate to `architect`.

## SLO (per `docs/guides/pr-workflow.md`)
| Stage | Target | Hard cap |
|---|---|---|
| CI green | 15 min | 30 min |
| CR review post | 5 min after ready | 20 min |
| Triage → reply round | 5 min | 15 min |
| PR open → merged (non-arch) | 1 h | 4 h |

## Refs
- All sibling skills under `.claude/skills/`
- `docs/guides/pr-workflow.md`
- `docs/guides/merge-system.md` (Agent 16)
- `docs/guides/mastermind-pr-loop.md`
