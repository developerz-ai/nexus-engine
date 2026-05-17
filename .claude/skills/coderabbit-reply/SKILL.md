---
name: coderabbit-reply
description: Post threaded replies to CodeRabbit review threads via GraphQL addPullRequestReviewThreadReply (or REST fallback). For wrong/opinion threads include principle citation. Triggers: reply coderabbit, post cr reply.
allowed-tools: Bash(gh *) Bash(jq *) Read
---

# coderabbit-reply

Reply inside the existing review thread. Never start a new thread for an answer.

## Inputs
Per-thread record from `coderabbit-triage`:
```json
{ "thread_id": "PRRT_kw...", "comment_url": "...", "reply_draft": "..." }
```

## Preferred: GraphQL (works on threads, not just comments)
```bash
THREAD_ID="$1"          # PRRT_... from triage
BODY_FILE="$2"          # reply text (markdown)

gh api graphql \
  -F threadId="$THREAD_ID" \
  -F body="$(cat "$BODY_FILE")" \
  -f query='
mutation($threadId:ID!, $body:String!) {
  addPullRequestReviewThreadReply(input:{
    pullRequestReviewThreadId: $threadId,
    body: $body
  }) {
    comment { id url body createdAt }
  }
}'
```

## REST fallback (when you have a `comment_id` not a `thread_id`)
```bash
PR="$1"; PARENT_ID="$2"; BODY_FILE="$3"
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

gh api -X POST "repos/$OWNER/$REPO/pulls/$PR/comments" \
  -f in_reply_to="$PARENT_ID" \
  -f body="$(cat "$BODY_FILE")"
```

## Reply templates

### Accept (acknowledge + commit ref)
```markdown
Acknowledged. Fixed in commit `<sha>` — <one-line summary>.
Per `docs/specs/<path>.md#<anchor>`.
```

### Reject — wrong/contradicts spec
```markdown
Disagree. This contradicts `docs/architecture/01-principles.md#law-<N>` (<law name>).
Specifically: <one-line why the suggestion fails the law>.
Spec reference: `docs/specs/<path>.md#<anchor>`.
Keeping current implementation.
```

### Reject — opinion/taste
```markdown
Style preference; current form matches `docs/guides/coding-style/<file>.md`.
No change.
```

### Discuss — suggestion with merit
```markdown
Plausible. Need to benchmark before deciding.
Filed: `docs/architecture/decisions-open.md` — `[DECISION NEEDED] <topic>`.
Benchmark plan: `cargo bench -p <crate> --bench <name>`.
Leaving open for `perf-engineer`.
```

### Resolve outdated
No reply — go straight to `coderabbit-resolve`.

## Batch mode
```bash
jq -c '.threads[] | select(.action != "resolve")' /tmp/triage.json \
| while read thread; do
    TID=$(echo "$thread" | jq -r .thread_id)
    echo "$thread" | jq -r .reply_draft > /tmp/reply.md
    gh api graphql -F threadId="$TID" -F body="$(cat /tmp/reply.md)" -f query='
      mutation($threadId:ID!,$body:String!){
        addPullRequestReviewThreadReply(input:{
          pullRequestReviewThreadId:$threadId, body:$body
        }){ comment { url } }
      }' \
    || echo "FAIL: $TID"
  done
```

## Rules
- Always cite a `docs/architecture/01-principles.md#law-N` anchor in `reject` replies.
- Always cite a commit SHA in `accept` replies (post AFTER push, not before).
- Never reply with `LGTM`, `thanks`, or emoji-only.
- Never delete CR comments — only resolve threads.

## Output (JSON)
```json
{
  "thread_id": "PRRT_kw...",
  "reply_id": "PRC_kw...",
  "reply_url": "https://github.com/.../#discussion_r1234",
  "action_taken": "reject|accept|discuss"
}
```

## Refs
- https://docs.github.com/en/graphql/reference/mutations#addpullrequestreviewthreadreply
- https://docs.github.com/en/rest/pulls/comments#create-a-reply-for-a-review-comment
- `.claude/skills/gh-graphql-helpers/SKILL.md`
- `docs/architecture/01-principles.md`
