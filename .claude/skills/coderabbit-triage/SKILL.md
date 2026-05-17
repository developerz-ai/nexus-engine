---
name: coderabbit-triage
description: Fetch all coderabbitai[bot] review threads via GraphQL, classify each (bug/nit/suggestion/opinion/wrong), emit accept/reject/discuss plan. Triggers: triage coderabbit, classify cr comments, cr plan.
allowed-tools: Bash(gh *) Bash(jq *) Read Grep
---

# coderabbit-triage

Read all CR threads → classify each → emit a structured plan the mastermind can execute.

## Fetch threads (GraphQL — REST cannot return `isResolved`)
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" -f query='
query($owner:String!, $repo:String!, $pr:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$pr) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first:50) {
            nodes {
              id
              databaseId
              author { login }
              body
              createdAt
              url
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}' > /tmp/cr-threads.json
```

Pagination: if `hasNextPage`, re-run with `-F cursor="$endCursor"` and `after:$cursor` in the query.

## Filter to CR-authored threads
```bash
jq '[.data.repository.pullRequest.reviewThreads.nodes[]
  | select(.comments.nodes[0].author.login == "coderabbitai")
  | select(.isResolved == false)]' /tmp/cr-threads.json > /tmp/cr-open.json
```

## Classification table (apply per thread)
| Class | Definition | Default action |
|---|---|---|
| `bug` | reproducible defect, principle violation, security issue | **accept** |
| `nit` | style/naming/comment with no behavior change | **accept if cheap, reject if churn** |
| `suggestion` | alternative impl, equivalent correctness | **discuss** |
| `opinion` | taste/style without spec backing | **reject with principle cite** |
| `wrong` | factually incorrect, contradicts spec or principle | **reject with principle cite** |
| `outdated` | thread `.isOutdated == true` | **resolve, no reply** |

## Heuristics
- Body matches `panic!|unwrap()|expect(` outside `#[cfg(test)]` → `bug` (Law 6, Law 10).
- Body suggests changing a spec without ADR → `wrong` (Law 2).
- Body suggests adding logging via `println!` → `wrong` (Law 11 wants structured telemetry).
- Body suggests removing `#[deny(missing_docs)]` → `wrong` (house rule).
- Body suggests broader `unsafe` → `wrong` unless `// SAFETY:` proven.
- Body suggests a rename with no callers affected → `nit`, accept.
- Body suggests an algorithm change with measurable perf delta → `suggestion`, discuss + bench.

## Output (JSON, one object per thread)
```json
{
  "pr": 123,
  "threads": [
    {
      "thread_id": "PRRT_kwDOA...",
      "path": "crates/renderer/src/shadow.rs",
      "line": 142,
      "class": "bug|nit|suggestion|opinion|wrong|outdated",
      "action": "accept|reject|discuss|resolve",
      "summary": "<one-line>",
      "principle_cite": "docs/architecture/01-principles.md#law-6",
      "reply_draft": "<text to post if rejecting>",
      "comment_url": "https://github.com/..."
    }
  ],
  "counts": { "accept": 4, "reject": 2, "discuss": 1, "resolve": 0 }
}
```

## Vendor honesty
CR is wrong sometimes. Rejecting is fine and expected. Every reject MUST cite a Nexus principle by anchor (`docs/architecture/01-principles.md#law-N`) so future readers see the reasoning.

## Hand-off
- `accept` → `fix-from-coderabbit`
- `reject`/`discuss` → `coderabbit-reply`
- `resolve` (outdated) → `coderabbit-resolve`

## Refs
- https://docs.github.com/en/graphql/reference/objects#pullrequestreviewthread
- https://docs.github.com/en/graphql/reference/objects#pullrequestreviewcomment
- `docs/architecture/01-principles.md`
- `.claude/skills/gh-graphql-helpers/SKILL.md`
