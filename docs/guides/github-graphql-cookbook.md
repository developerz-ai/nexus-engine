<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# GitHub GraphQL Cookbook

Copy-paste `gh api graphql` recipes for the operations REST cannot do (or cannot do well). Mirrors `.claude/skills/gh-graphql-helpers/SKILL.md` for human reading.

Setup once:
```bash
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name  -q .name)
PR=$(gh pr   view --json number -q .number)
```

---

## 1. List all review threads on a PR

```bash
gh api graphql --paginate \
  -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" -f query='
query($owner:String!,$repo:String!,$pr:Int!,$endCursor:String){
  repository(owner:$owner,name:$repo){pullRequest(number:$pr){
    reviewThreads(first:100,after:$endCursor){
      nodes{
        id isResolved isOutdated path line startLine diffSide
        comments(first:50){nodes{
          id databaseId url body createdAt
          author{login}
        }}
      }
      pageInfo{hasNextPage endCursor}
    }
  }}
}'
```

Sample (truncated):
```json
{
  "data": {
    "repository": {
      "pullRequest": {
        "reviewThreads": {
          "nodes": [
            {
              "id": "PRRT_kwDOA1B2C3-4D5E6F",
              "isResolved": false,
              "isOutdated": false,
              "path": "crates/renderer/src/shadow.rs",
              "line": 142,
              "diffSide": "RIGHT",
              "comments": {
                "nodes": [{
                  "id": "PRRC_kw...",
                  "databaseId": 1234567,
                  "url": "https://github.com/sebyx07/nexus-engine/pull/123#discussion_r1234567",
                  "body": "Consider using `cascaded_split_log` here…",
                  "author": { "login": "coderabbitai" }
                }]
              }
            }
          ],
          "pageInfo": { "hasNextPage": false, "endCursor": null }
        }
      }
    }
  }
}
```

---

## 2. List bot comments only (top-level, not in threads)

```bash
gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" -f query='
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){pullRequest(number:$pr){
    comments(first:100){nodes{
      id databaseId url body createdAt
      author{login}
    }}
  }}
}' | jq '[.data.repository.pullRequest.comments.nodes[]
       | select(.author.login=="coderabbitai")]'
```

---

## 3. Resolve a review thread (REST cannot do this)

```bash
THREAD_ID="PRRT_kwDOA1B2C3-4D5E6F"

gh api graphql -F threadId="$THREAD_ID" -f query='
mutation($threadId:ID!){
  resolveReviewThread(input:{threadId:$threadId}){
    thread{id isResolved}
  }
}'
```

Response:
```json
{ "data": { "resolveReviewThread": { "thread": { "id": "PRRT_...", "isResolved": true } } } }
```

Idempotent — running on an already-resolved thread is a no-op.

---

## 4. Add a reply inside an existing thread

```bash
gh api graphql \
  -F threadId="$THREAD_ID" \
  -F body="Acknowledged. Fixed in abc123 per docs/specs/renderer/shadows.md#cascades." \
  -f query='
mutation($threadId:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{
    pullRequestReviewThreadId:$threadId, body:$body
  }){ comment{id url body} }
}'
```

---

## 5. Enable auto-merge (squash)

```bash
PR_NODE_ID=$(gh pr view "$PR" --json id -q .id)

gh api graphql -F prId="$PR_NODE_ID" -f query='
mutation($prId:ID!){
  enablePullRequestAutoMerge(input:{
    pullRequestId:$prId,
    mergeMethod:SQUASH
  }){ pullRequest{ autoMergeRequest{ enabledAt } } }
}'
```

---

## 6. Request a reviewer (by login)

```bash
REVIEWER_LOGIN="nexus-merge-bot"

USER_ID=$(gh api graphql -f login="$REVIEWER_LOGIN" -f query='
  query($login:String!){user(login:$login){id}}' | jq -r .data.user.id)

gh api graphql -F prId="$PR_NODE_ID" -F userId="$USER_ID" -f query='
mutation($prId:ID!,$userId:ID!){
  requestReviews(input:{pullRequestId:$prId,userIds:[$userId]}){
    pullRequest{id}
  }
}'
```

---

## 7. Dismiss a stale review

```bash
REVIEW_NODE_ID="PRR_kwDO..."
DISMISS_REASON="Force-pushed; requesting fresh review."

gh api graphql -F reviewId="$REVIEW_NODE_ID" -F msg="$DISMISS_REASON" -f query='
mutation($reviewId:ID!,$msg:String!){
  dismissPullRequestReview(input:{
    pullRequestReviewId:$reviewId, message:$msg
  }){ pullRequestReview{id state} }
}'
```

---

## 8. Mark PR ready for review (out of draft)

```bash
gh api graphql -F prId="$PR_NODE_ID" -f query='
mutation($prId:ID!){
  markPullRequestReadyForReview(input:{pullRequestId:$prId}){
    pullRequest{id isDraft}
  }
}'
```

---

## 9. Convert PR back to draft

```bash
gh api graphql -F prId="$PR_NODE_ID" -f query='
mutation($prId:ID!){
  convertPullRequestToDraft(input:{pullRequestId:$prId}){
    pullRequest{id isDraft}
  }
}'
```

---

## 10. Branch protection (REST is fine for this one)

```bash
gh api -X PUT "/repos/$OWNER/$REPO/branches/main/protection" \
  -f required_status_checks.strict=true \
  -f 'required_status_checks.contexts[]=ci/build' \
  -f 'required_status_checks.contexts[]=ci/test' \
  -f 'required_status_checks.contexts[]=ci/clippy' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F required_pull_request_reviews.dismiss_stale_reviews=true \
  -F required_conversation_resolution=true \
  -F restrictions=
```

---

## Error handling

Always check `.errors`:
```bash
RESP=$(gh api graphql ... )
echo "$RESP" | jq -e '.errors // empty' && { echo "ERR"; echo "$RESP" | jq .errors; exit 1; }
```

Rate-limit before a big batch:
```bash
gh api rate_limit | jq '.resources.graphql'
```
GraphQL is point-cost, not request-count — small queries cost little, paginating ten pages costs ~10.

Token scopes needed:
- read: `repo` (public) or `repo` (private)
- mutations: `repo` + sometimes `workflow`

---

## Refs

- https://docs.github.com/en/graphql/reference/mutations
- https://docs.github.com/en/graphql/reference/objects
- https://cli.github.com/manual/gh_api
- `.claude/skills/gh-graphql-helpers/SKILL.md`
