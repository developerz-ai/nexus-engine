---
name: pr-merge
description: Squash-merge with conventional commit message, delete branch, post release-note line. Refuses if any CR thread unresolved or any law violation. Triggers: merge pr, land pr, squash merge.
allowed-tools: Bash(git *) Bash(gh *) Bash(jq *) Read
---

# pr-merge

Final gate. Refuses if any precondition fails. Never merges without spec ref, CI green, all threads resolved, ≥1 approval (human or `nexus-merge` bot).

## Pre-merge gate (ALL must pass)
| # | Check | Command | Refuse on |
|---|---|---|---|
| 1 | CI green (required only) | `wait-for-ci` verdict | red, timeout |
| 2 | mergeable | `gh pr view --json mergeable` | NOT `MERGEABLE` |
| 3 | approval | `gh pr view --json reviewDecision` | NOT `APPROVED` |
| 4 | no open CR threads | GraphQL `reviewThreads` filter `isResolved:false` author `coderabbitai` | count > 0 |
| 5 | spec ref in body | `gh pr view --json body \| grep 'docs/specs\\|docs/contracts'` | missing |
| 6 | no `[DECISION NEEDED]` open | grep PR body + linked files | found |
| 7 | branch up to date with main | `git rev-list origin/main..HEAD` reachable | behind → rebase |

## Gate check
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

OPEN=$(gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" -f query='
query($owner:String!,$repo:String!,$pr:Int!) {
  repository(owner:$owner,name:$repo){pullRequest(number:$pr){
    reviewThreads(first:100){nodes{
      isResolved comments(first:1){nodes{author{login}}}
    }}
  }}
}' | jq '[.data.repository.pullRequest.reviewThreads.nodes[]
       | select(.isResolved==false)
       | select(.comments.nodes[0].author.login=="coderabbitai")] | length')

[ "$OPEN" -gt 0 ] && { echo "REFUSE: $OPEN open CR threads"; exit 1; }

VIEW=$(gh pr view "$PR" --json mergeable,reviewDecision,body,title,headRefName)
echo "$VIEW" | jq -e '.mergeable=="MERGEABLE" and .reviewDecision=="APPROVED"' \
  || { echo "REFUSE: gates not met"; exit 2; }
echo "$VIEW" | jq -r .body | grep -E 'docs/(specs|contracts)/' >/dev/null \
  || { echo "REFUSE: no spec ref"; exit 3; }
```

## Squash merge
```bash
TITLE=$(gh pr view "$PR" --json title -q .title)
BODY=$(gh pr view "$PR" --json body -q .body)

# Conventional Commits squash message
MSG="${TITLE}

$(echo "$BODY" | sed -n '/## Spec/,/^##/p' | grep -E 'docs/(specs|contracts)/')

Closes #${PR}"

gh pr merge "$PR" \
  --squash \
  --delete-branch \
  --subject "$TITLE" \
  --body "$MSG"
```

## Auto-merge variant (when waiting on a still-pending check)
```bash
gh pr merge "$PR" --auto --squash --delete-branch
```
GitHub will auto-merge once gates flip.

## Post-merge
```bash
# 1. Confirm
gh pr view "$PR" --json state,mergedAt,mergeCommit

# 2. Hand off to pr-changelog
claude-skill pr-changelog "$PR"

# 3. Release-note one-liner (stdout)
echo "- $(echo "$TITLE" | sed 's/^[a-z]*\(([^)]*)\)*:\s*//') (#${PR})"
```

## Refuses (table-driven errors)
| Code | Reason | Fix |
|---|---|---|
| 1 | open CR threads | `coderabbit-resolve` first |
| 2 | gates not met | `wait-for-ci` + request review |
| 3 | no spec ref | edit PR body, add `docs/specs/...` |
| 4 | branch behind main | `pr-rebase-and-recover` |
| 5 | law violation | route to `principle-keeper` |

## Branch protection alignment
This skill assumes `main` has branch protection requiring: ≥1 approval, all required checks green, dismiss stale reviews on push, require conversation resolution. Set via `gh api -X PUT /repos/:owner/:repo/branches/main/protection` (see `docs/guides/github-graphql-cookbook.md`).

## Output (JSON)
```json
{
  "pr": 123,
  "merged": true,
  "merge_sha": "abc123",
  "deleted_branch": "feat/shadow-maps",
  "release_note": "- add cascaded shadow maps (#123)"
}
```

## Refs
- `docs/guides/merge-system.md` (Agent 16 — `nexus-merge` bot integration)
- `docs/guides/pr-protocol.md` (Agent 16)
- https://cli.github.com/manual/gh_pr_merge
