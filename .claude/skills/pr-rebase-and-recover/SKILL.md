---
name: pr-rebase-and-recover
description: Rebase PR branch on main when CI fails on stale base or main moves. Conflict heuristics. Force-push. Restart wait-for-ci. Triggers: rebase pr, recover ci, fix stale branch.
allowed-tools: Bash(git *) Bash(gh *) Bash(cargo *) Read Edit
---

# pr-rebase-and-recover

Main moved or CI broke from a merged neighbor PR. Rebase, run scoped tests locally, force-push, restart CI.

## Preconditions
| Check | Command |
|---|---|
| working tree clean | `git status --porcelain` empty |
| current branch is PR branch | `gh pr view --json headRefName -q .headRefName` matches |
| main fetched | `git fetch origin main` |

## Steps
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
BRANCH=$(gh pr view "$PR" --json headRefName -q .headRefName)
git checkout "$BRANCH"

# 1. Sync main
git fetch origin main

# 2. Rebase
git rebase origin/main || REBASE_CONFLICT=1

# 3. Conflict resolution (see heuristics)
if [ -n "$REBASE_CONFLICT" ]; then
  resolve_conflicts          # see below; per-file heuristic
  git add -A
  git rebase --continue
fi

# 4. Local sanity — scoped, not full workspace
CRATES=$(git diff --name-only origin/main...HEAD \
  | grep '^crates/' | cut -d/ -f1-3 | sort -u \
  | xargs -I{} basename {})
for c in $CRATES; do
  cargo check -p "$c" || exit 1
  cargo test  -p "$c" || exit 1
done

# 5. Workspace check (Law 4)
cargo check --workspace

# 6. Force-push with lease (never plain --force)
git push --force-with-lease origin "$BRANCH"

# 7. Tell CR to re-review from scratch
gh pr comment "$PR" --body "@coderabbitai full review"

# 8. Restart CI watcher
# (mastermind invokes wait-for-ci next)
```

## Conflict resolution heuristics
| Conflict in | Resolution rule |
|---|---|
| `docs/specs/**` | **defer to spec** — keep main's version unless your PR explicitly amends the spec via ADR |
| `docs/contracts/**` | merge both sides; both consumers must remain consistent — escalate to `contract-author` |
| `docs/architecture/01-principles.md` | NEVER hand-resolve — requires ADR; abort rebase, escalate to `architect` |
| `Cargo.lock` | regenerate: `git checkout --theirs Cargo.lock && cargo update -p <changed>` |
| `Cargo.toml` (workspace members) | take union of both lists |
| `crates/<x>/src/**` | semantic merge — keep both sets of changes if independent; if same function touched, prefer the one that better matches the spec |
| `.github/workflows/**` | take union; pin every action SHA per `.coderabbit.yaml` rule |
| `CHANGELOG.md` | take main's, then re-run `pr-changelog` |

## Force-push policy
- **Always** `--force-with-lease`, **never** plain `--force`.
- **Never** force-push to `main` or to a branch owned by another agent/contributor unless coordinating.
- After force-push: CodeRabbit re-reviews from scratch — expect a fresh round. Plan triage time.

## Restart wait-for-ci
After push, invoke `wait-for-ci`. Reset round counter in `babysit-pr` if rebase was the cause of the failure (not a code bug).

## Escalation
| Condition | Route |
|---|---|
| same conflict resurfaces after second rebase | `architect` |
| `cargo check --workspace` red after clean rebase | `principle-keeper` (Law 4 violation upstream) |
| ≥10 files in conflict | `integration-resolver` |

## Output (JSON)
```json
{
  "pr": 123,
  "rebased_onto": "abc123",
  "conflicts": ["Cargo.lock", "crates/renderer/src/lib.rs"],
  "resolved": true,
  "scoped_crates": ["renderer", "core-ecs"],
  "force_pushed": true,
  "next": "wait-for-ci"
}
```

## Refs
- `docs/guides/merge-system.md` (Agent 16)
- `docs/architecture/01-principles.md#law-4`
- https://git-scm.com/docs/git-rebase
