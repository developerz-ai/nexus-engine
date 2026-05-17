---
name: open-pr
description: Open a PR from current branch with conventional-commits title, spec/contract refs, scenario tests, benchmark deltas. Marks draft until CI green. Triggers: open pr, create pr, ship branch, gh pr create.
allowed-tools: Bash(git *) Bash(gh *) Read Grep Glob
---

# open-pr

Open one PR. Conventional-commits title. Body templated. Draft until CI green.

## Preconditions
| Check | Command | Fail |
|---|---|---|
| branch ahead of main | `git rev-list --count origin/main..HEAD` | stop |
| working tree clean | `git status --porcelain` empty | `git add -p` first |
| spec referenced | grep `docs/specs/` or `docs/contracts/` in commits | refuse |
| `cargo check --workspace` green | run if Rust changed | fix first |

## Title rule (Conventional Commits)
`<type>(<scope>): <imperative>` · 50/72.
`type` ∈ `feat fix perf refactor docs test build ci chore revert`.
`scope` = crate name or `spec`/`contract`/`docs`/`ci`.
Examples:
- `feat(renderer): add cascaded shadow maps per docs/specs/renderer/shadows.md`
- `fix(physics): clamp character controller step to spec bound`
- `docs(specs/audio): add adaptive music spec`

## Body template (paste, fill, push)
```markdown
## Spec
- docs/specs/<system>/<file>.md#<anchor>
- docs/contracts/<a>-<b>.md (if boundary)

## Change
- One bullet per public-API or behavior delta.

## Scenarios (passing)
- `cargo test -p <crate> --test <scenario>`
- Headless scenario: `nexus run --headless scenarios/<name>.toml`

## Benchmarks
| Metric | Baseline | This PR | Δ |
|---|---|---|---|
| ... | ... | ... | ... |

## Principle audit
- [ ] Law 2: spec referenced
- [ ] Law 4: `cargo check --workspace` green
- [ ] Law 5: Performance Contract table updated (if API changed)
- [ ] Law 10: no string-only errors
- [ ] Law 12: tests added

## Open questions
- `[DECISION NEEDED]` items, if any.
```

## Commands
```bash
# 1. Push branch
git push -u origin "$(git branch --show-current)"

# 2. Derive title from latest commit
TITLE="$(git log -1 --pretty=%s)"

# 3. Write body to file (template above, filled)
$EDITOR /tmp/pr-body.md

# 4. Open as draft
gh pr create \
  --draft \
  --base main \
  --title "$TITLE" \
  --body-file /tmp/pr-body.md

# 5. Print URL for downstream skills
gh pr view --json url -q .url
```

## Auto-link
- Body MUST cite at least one `docs/specs/**` or `docs/contracts/**` path. `nexus-merge` rejects otherwise (Law 2).
- If multiple specs → list each on its own line under `## Spec`.
- ADR-affecting change → add `## ADR` section linking `docs/architecture/05-adr/<n>-<slug>.md`.

## Output (JSON, for babysit-pr to parse)
```json
{ "pr_url": "...", "pr_number": 123, "draft": true, "title": "..." }
```

## Refs
- `docs/guides/pr-protocol.md` (Agent 16)
- `docs/guides/merge-system.md` (Agent 16)
- `docs/guides/spec-format.md`
- https://cli.github.com/manual/gh_pr_create
- https://www.conventionalcommits.org/
