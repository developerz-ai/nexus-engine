---
name: wait-for-coderabbit
description: Block until coderabbitai[bot] posts its review on a PR. Detects in-progress vs complete markers. Retriggers via @coderabbitai review if missing past threshold. Triggers: wait for coderabbit, wait cr, cr review status.
allowed-tools: Bash(gh *) Bash(jq *) Bash(sleep *) Read
---

# wait-for-coderabbit

Poll until CodeRabbit posts its review summary. Then hand off to `coderabbit-triage`.

## Detection rules
| Signal | Source | Means |
|---|---|---|
| comment by `coderabbitai[bot]` containing `Actionable comments posted` | `gh pr view --json comments` | review complete |
| comment by `coderabbitai[bot]` containing `Reviewing...` or `🔄` | same | in progress |
| no `coderabbitai[bot]` author in comments | same | not started |
| `coderabbitai[bot]` review thread present | GraphQL `reviewThreads` | inline comments dropped |

## Poll loop
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
TIMEOUT_MIN="${TIMEOUT_MIN:-20}"
DEADLINE=$(( $(date +%s) + 60 * TIMEOUT_MIN ))

while [ $(date +%s) -lt $DEADLINE ]; do
  STATE=$(gh pr view "$PR" --json comments -q '
    [.comments[] | select(.author.login == "coderabbitai")]
    | if length == 0 then "missing"
      elif any(.body; test("Actionable comments posted|✅ Review complete"))
        then "complete"
      else "in_progress" end')
  echo "{\"pr\": $PR, \"cr_state\": \"$STATE\", \"t\": $(date +%s)}"
  [ "$STATE" = "complete" ] && exit 0
  sleep 30
done
```

## Re-trigger when missing past threshold
If `STATE = missing` after 5 min, post:
```bash
gh pr comment "$PR" --body "@coderabbitai review"
```
Then reset deadline once. If still missing after second deadline → emit `cr_no_show` and continue without CR (do NOT block merge; flag for `liveops-engineer`).

## Re-trigger after force-push
CR usually re-reviews on push. If not within 3 min after push:
```bash
gh pr comment "$PR" --body "@coderabbitai full review"
```

## Output (JSON)
```json
{
  "pr": 123,
  "cr_state": "complete|in_progress|missing|cr_no_show",
  "review_comment_id": 1234567,
  "thread_count": 7,
  "duration_s": 180
}
```

## Pair with
- After `complete` → invoke `coderabbit-triage`.
- After `cr_no_show` → proceed to `pr-merge` if other gates pass (Law 2 still requires spec ref, but CR is advisory).

## CR commands cheat (full ref: `respond-to-cr-commands`)
| Command | Effect |
|---|---|
| `@coderabbitai review` | request incremental review |
| `@coderabbitai full review` | re-review from scratch |
| `@coderabbitai pause` | stop auto-reviews on this PR |
| `@coderabbitai resume` | restart auto-reviews |
| `@coderabbitai resolve` | mark all CR threads resolved |
| `@coderabbitai ignore` | skip this PR |
| `@coderabbitai summary` | regenerate summary |

## Refs
- https://docs.coderabbit.ai/guides/commands
- https://cli.github.com/manual/gh_pr_comment
