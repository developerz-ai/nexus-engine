---
name: branch-conventions
description: Branch naming, base branch, draft policy, auto-merge policy, force-push policy. Short, table-driven. Triggers: branch naming, branch policy, where to branch from.
allowed-tools: Bash(git *) Bash(gh *) Read
---

# branch-conventions

Five tables. Read once. Apply forever.

## Naming
| Prefix | When | Example |
|---|---|---|
| `feat/` | new feature/spec impl | `feat/renderer-shadow-maps` |
| `fix/` | bug fix | `fix/character-controller-step` |
| `perf/` | perf-only change | `perf/ecs-archetype-iter` |
| `refactor/` | no behavior change | `refactor/jobs-fiber-pool` |
| `docs/` | docs/spec/contract | `docs/specs-audio-spatial` |
| `test/` | tests only | `test/replay-fuzz-harness` |
| `build/` `ci/` `chore/` | tooling | `ci/pin-action-shas` |
| `adr/` | new ADR | `adr/0042-why-wgpu` |
| `revert/` | revert prior PR | `revert/123-shadow-regression` |
| `bot/` | bot-authored | `bot/sync-glossary-2026-05-17` |

Rules:
- kebab-case after slash.
- ≤50 chars total.
- No issue numbers in branch names (they live in commit footer `Closes #N`).
- No personal names (`feat/sebi-shadows` ✗).

## Base branch
| Source of change | Base |
|---|---|
| anything | `main` |
| live-content hotfix | `main` (cherry-pick to active release branch after merge) |
| security backport | `release/X.Y` (rare, coordinated) |

Nexus is trunk-based. No `develop`. No long-lived feature branches (>3 days = rebase or split).

## Draft policy
| State | When |
|---|---|
| draft | branch < first CI run; impl incomplete; experimenting |
| ready | impl complete; CI green; spec referenced |
| draft (back) | force-pushed history rewrite; awaiting fresh CR review |

Mark ready via `gh pr ready <PR>` or GraphQL `markPullRequestReadyForReview` (see `gh-graphql-helpers`).

## Auto-merge policy
| Condition | Auto-merge? |
|---|---|
| `feat`/`fix` + ≤3 file change + ≤200 LOC | YES (squash) |
| `docs` only | YES (squash) |
| `chore`/`ci` + green | YES (squash) |
| touches `docs/architecture/01-principles.md` | NO — requires `architect` review + ADR |
| touches `docs/architecture/00-vision.md` | NO — requires ADR + 7-day notice |
| `revert/*` | NO — require human ack |
| breaking change | NO — require `release-engineer` review |

Enable via:
```bash
gh pr merge --auto --squash --delete-branch
```

## Force-push policy
| Target | Policy |
|---|---|
| own PR branch | OK with `--force-with-lease` (never plain `--force`) |
| `main` | FORBIDDEN |
| `release/*` | FORBIDDEN |
| branch shared with another agent | coordinate first or rebase locally and PR a rebase commit |

After force-push: CR re-reviews from scratch → expect a full triage round.

## Lifecycle commands
```bash
# 1. Create
git switch -c feat/<scope>-<slug>

# 2. Push (sets upstream)
git push -u origin "$(git branch --show-current)"

# 3. Sync (rebase, not merge)
git fetch origin main && git rebase origin/main

# 4. Force-push (safely)
git push --force-with-lease

# 5. After merge — clean up
git switch main && git pull && git branch -d feat/<scope>-<slug>
```

## Output
None — this is reference only. Other skills consult it before naming/branching.

## Refs
- `docs/guides/merge-system.md` (Agent 16)
- `docs/guides/pr-protocol.md` (Agent 16)
- `.claude/skills/open-pr/SKILL.md`
- `.claude/skills/pr-rebase-and-recover/SKILL.md`
