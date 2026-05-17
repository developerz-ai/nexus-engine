---
name: coderabbit-resolve
description: Mark review threads resolved via GraphQL resolveReviewThread mutation. Paginated, dry-run, batch. REST cannot do this. Triggers: resolve cr threads, mark resolved, close review threads.
allowed-tools: Bash(gh *) Bash(jq *) Read
---

# coderabbit-resolve

Close review threads programmatically. The ONLY way is GraphQL `resolveReviewThread` — REST does not expose it.

## Single thread
```bash
THREAD_ID="$1"          # PRRT_... from triage / list

gh api graphql -F threadId="$THREAD_ID" -f query='
mutation($threadId:ID!) {
  resolveReviewThread(input:{ threadId:$threadId }) {
    thread { id isResolved }
  }
}'
```

Response confirms `isResolved: true`. Re-running on an already-resolved thread is a no-op.

## Unresolve (rarely needed; for revert)
```bash
gh api graphql -F threadId="$THREAD_ID" -f query='
mutation($threadId:ID!) {
  unresolveReviewThread(input:{ threadId:$threadId }) {
    thread { id isResolved }
  }
}'
```

## List all unresolved CR threads on a PR
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

gh api graphql --paginate \
  -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" -f query='
query($owner:String!,$repo:String!,$pr:Int!,$endCursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$pr) {
      reviewThreads(first:100, after:$endCursor) {
        nodes {
          id isResolved isOutdated path line
          comments(first:1){ nodes { author { login } } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}' | jq '[.data.repository.pullRequest.reviewThreads.nodes[]
  | select(.comments.nodes[0].author.login == "coderabbitai")
  | select(.isResolved == false)
  | { id, path, line, isOutdated }]'
```

## Batch resolve (after fixes pushed)
```bash
jq -r '.[].id' /tmp/cr-open.json \
| while read TID; do
    [ -n "$TID" ] || continue
    gh api graphql -F threadId="$TID" -f query='
      mutation($threadId:ID!){
        resolveReviewThread(input:{ threadId:$threadId }){
          thread { id isResolved }
        }
      }' >/dev/null && echo "resolved $TID" || echo "FAIL $TID"
  done
```

## Dry-run (preview only, no mutation)
```bash
DRY=1 jq -r '.[] | "\(.id)\t\(.path):\(.line)\t\(.isOutdated)"' /tmp/cr-open.json
```

## When to resolve
| Trigger | Resolve? |
|---|---|
| fix pushed + reply posted + CI green on the fix commit | YES |
| reject reply posted citing principle | YES (post-reply, after 1 reviewer ack OR 24h) |
| thread `isOutdated: true` (file moved/changed) | YES, no reply needed |
| discuss reply, still pending decision | NO — leave open until decision logged |
| CR comment is the review summary itself (not a thread) | N/A (not a thread) |

## Alternative: ask CR to resolve
Some teams prefer letting CodeRabbit close its own threads after fixes:
```bash
gh pr comment "$PR" --body "@coderabbitai resolve"
```
That command resolves ALL CR threads. Use the GraphQL mutation when you need per-thread control.

## Output (JSON)
```json
{
  "pr": 123,
  "resolved": ["PRRT_a", "PRRT_b"],
  "failed": [],
  "skipped_open_discuss": ["PRRT_c"],
  "outdated_resolved": 1
}
```

## Refs
- https://docs.github.com/en/graphql/reference/mutations#resolvereviewthread
- https://docs.github.com/en/graphql/reference/mutations#unresolvereviewthread
- https://docs.coderabbit.ai/guides/commands
- `.claude/skills/gh-graphql-helpers/SKILL.md`
