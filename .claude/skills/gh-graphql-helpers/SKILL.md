---
name: gh-graphql-helpers
description: Reusable gh api graphql snippets — list PR threads, list bot comments, resolve thread, add reply, enable auto-merge, request reviewer, dismiss review. Single source of truth for other skills. Triggers: graphql gh, gh api recipes, github graphql.
allowed-tools: Bash(gh *) Bash(jq *) Read
---

# gh-graphql-helpers

Library. Other skills `Read` here and copy the exact block they need. Every snippet is parameterized and runnable.

## Conventions
- `$OWNER`, `$REPO`, `$PR` always come from `gh repo view` / `gh pr view`.
- `-F` for typed args (Int!, Boolean!), `-f` for strings.
- Always select minimal fields — pagination uses `pageInfo { hasNextPage endCursor }`.

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name  -q .name)
PR=$(gh pr view  --json number -q .number)
```

## 1. List all review threads on a PR (paginated)
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

## 2. List CodeRabbit-authored comments only
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

## 3. Resolve a review thread (THE killer feature — REST cannot)
```bash
gh api graphql -F threadId="$THREAD_ID" -f query='
mutation($threadId:ID!){
  resolveReviewThread(input:{threadId:$threadId}){
    thread{id isResolved}
  }
}'
```

## 4. Unresolve a review thread
```bash
gh api graphql -F threadId="$THREAD_ID" -f query='
mutation($threadId:ID!){
  unresolveReviewThread(input:{threadId:$threadId}){
    thread{id isResolved}
  }
}'
```

## 5. Reply inside a thread (preserves thread context)
```bash
gh api graphql -F threadId="$THREAD_ID" -F body="$REPLY_BODY" -f query='
mutation($threadId:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{
    pullRequestReviewThreadId:$threadId, body:$body
  }){ comment{id url body} }
}'
```

## 6. Enable auto-merge (squash)
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

## 7. Disable auto-merge
```bash
gh api graphql -F prId="$PR_NODE_ID" -f query='
mutation($prId:ID!){
  disablePullRequestAutoMerge(input:{pullRequestId:$prId}){
    pullRequest{id}
  }
}'
```

## 8. Request a reviewer
```bash
USER_ID=$(gh api graphql -f login="$REVIEWER_LOGIN" -f query='
  query($login:String!){user(login:$login){id}}' | jq -r .data.user.id)

gh api graphql -F prId="$PR_NODE_ID" -F userId="$USER_ID" -f query='
mutation($prId:ID!,$userId:ID!){
  requestReviews(input:{pullRequestId:$prId,userIds:[$userId]}){
    pullRequest{id reviewRequests(first:10){nodes{
      requestedReviewer{... on User{login}}
    }}}
  }
}'
```

## 9. Dismiss a stale review
```bash
gh api graphql -F reviewId="$REVIEW_NODE_ID" -F msg="$DISMISS_REASON" -f query='
mutation($reviewId:ID!,$msg:String!){
  dismissPullRequestReview(input:{
    pullRequestReviewId:$reviewId, message:$msg
  }){ pullRequestReview{id state} }
}'
```

## 10. Add labels
```bash
gh api graphql -F prId="$PR_NODE_ID" -F labels='["bug","spec-needed"]' -f query='
mutation($prId:ID!,$labels:[ID!]!){
  addLabelsToLabelable(input:{labelableId:$prId,labelIds:$labels}){
    labelable{... on PullRequest{ labels(first:10){nodes{name}} }}
  }
}'
```
(label IDs from `repository.labels(first:100){nodes{id name}}`.)

## 11. Mark a PR ready for review (out of draft)
```bash
gh api graphql -F prId="$PR_NODE_ID" -f query='
mutation($prId:ID!){
  markPullRequestReadyForReview(input:{pullRequestId:$prId}){
    pullRequest{id isDraft}
  }
}'
```

## 12. Convert PR back to draft
```bash
gh api graphql -F prId="$PR_NODE_ID" -f query='
mutation($prId:ID!){
  convertPullRequestToDraft(input:{pullRequestId:$prId}){
    pullRequest{id isDraft}
  }
}'
```

## Error handling
- GraphQL errors return `errors:[{message,...}]` in the response body. Check with `jq '.errors // empty'`.
- Rate limit: `gh api rate_limit` — fall back to longer polls if `remaining < 100`.
- Permission denied: token needs `repo` scope (workflow scope for some mutations).

## Refs
- https://docs.github.com/en/graphql/reference/mutations
- https://docs.github.com/en/graphql/reference/objects
- https://cli.github.com/manual/gh_api
- `docs/guides/github-graphql-cookbook.md` — narrative companion
