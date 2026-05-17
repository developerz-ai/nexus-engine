---
name: respond-to-cr-commands
description: CodeRabbit chat-command cheat sheet — when to invoke @coderabbitai resolve/pause/ignore/summary/full review. Triggers: cr command, coderabbit command, talk to coderabbit.
allowed-tools: Bash(gh *) Read
---

# respond-to-cr-commands

CodeRabbit listens for `@coderabbitai <verb>` in PR comments. Use the right verb; do not improvise.

## Command table
| Command | Effect | When to invoke |
|---|---|---|
| `@coderabbitai review` | incremental review of new commits | after pushing fixes; CR slow to auto-review |
| `@coderabbitai full review` | re-review from scratch | after force-push or rebase that invalidated prior review |
| `@coderabbitai summary` | regenerate the PR summary comment | summary stale after large changes |
| `@coderabbitai resolve` | mark ALL CR-authored threads resolved | after all accepted fixes pushed and replies posted |
| `@coderabbitai pause` | stop auto-reviews on this PR | doing rapid WIP iteration; resume when stable |
| `@coderabbitai resume` | restart auto-reviews | after a pause |
| `@coderabbitai ignore` | skip this PR entirely | trivial doc-only PR; rare |
| `@coderabbitai generate docstrings` | open a follow-up PR adding docstrings | when CR flags missing docs across many sites |
| `@coderabbitai plan` | ask CR for a fix plan instead of a review | before large refactors |
| `@coderabbitai help` | print CR's own command list | when in doubt |

## Issue/chat commands (inside a review thread)
| Command | Effect |
|---|---|
| `@coderabbitai or use <X>` | reply to a CR comment to push back; CR will reconsider |
| `@coderabbitai explain` | CR expands on its own comment |
| `@coderabbitai why?` | CR cites the rule it applied |

## Invocation
```bash
gh pr comment "$PR" --body "@coderabbitai full review"
gh pr comment "$PR" --body "@coderabbitai resolve"
gh pr comment "$PR" --body "@coderabbitai pause"
```

## Decision tree
```
just pushed fixes? ─── yes ─── @coderabbitai review
   │
   no
   │
force-pushed/rebased? ─── yes ─── @coderabbitai full review
   │
   no
   │
all threads addressed? ─── yes ─── @coderabbitai resolve
   │
   no
   │
WIP storm? ─── yes ─── @coderabbitai pause   (resume later)
```

## Rules
- Never invoke `ignore` on a PR with code changes.
- Never invoke `resolve` if any thread is class `discuss` and unresolved in the triage plan.
- `pause` does not block merge — but `nexus-merge` still requires a final CR review unless explicitly waived.
- One command per comment. Do not chain multiple verbs.

## Output
Stdout of `gh pr comment` (the comment URL). No JSON needed — this skill is a verb dispatcher.

## Refs
- https://docs.coderabbit.ai/guides/commands
- `.claude/skills/wait-for-coderabbit/SKILL.md`
- `.claude/skills/coderabbit-resolve/SKILL.md`
