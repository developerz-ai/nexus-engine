---
name: pr-changelog
description: Generate CHANGELOG.md entry for merged PR from Conventional Commits title. Spec reference required. Keep-a-Changelog format. Triggers: changelog, generate changelog, release note.
allowed-tools: Bash(git *) Bash(gh *) Bash(jq *) Read Edit
---

# pr-changelog

After `pr-merge`. One entry per merged PR. Keep-a-Changelog format + spec backref.

## Sections (Keep-a-Changelog)
| Conventional type | CHANGELOG section |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `perf` | Changed (perf note) |
| `refactor` | Changed |
| `docs` | Documentation |
| `test` | (skip unless visible to users) |
| `build` `ci` `chore` | (skip unless user-visible) |
| `revert` | Reverted |
| breaking (`!` in type or `BREAKING CHANGE:` footer) | Removed/Changed + **BREAKING** label |

## Format
```markdown
## [Unreleased]

### Added
- <imperative summary> ([#123](https://github.com/<o>/<r>/pull/123)) — spec: `docs/specs/<path>.md`

### Fixed
- ...

### Changed
- ...

### Removed
- **BREAKING**: ...
```

## Build entry
```bash
PR="${1:-$(gh pr view --json number -q .number)}"
META=$(gh pr view "$PR" --json title,body,number,url,mergeCommit)

TITLE=$(echo "$META" | jq -r .title)
URL=$(echo "$META" | jq -r .url)
BODY=$(echo "$META" | jq -r .body)

# 1. Parse type/scope/summary
TYPE=$(echo "$TITLE" | sed -E 's/^([a-z]+)(\([^)]+\))?!?:.*/\1/')
SUMMARY=$(echo "$TITLE" | sed -E 's/^[a-z]+(\([^)]+\))?!?:\s*//')
BREAKING=0
echo "$TITLE" | grep -q '!' && BREAKING=1
echo "$BODY" | grep -q 'BREAKING CHANGE' && BREAKING=1

# 2. Extract spec ref (REQUIRED — refuse if missing, per Law 2)
SPEC=$(echo "$BODY" | grep -oE 'docs/(specs|contracts)/[^ )]+' | head -1)
[ -z "$SPEC" ] && { echo "REFUSE: no spec ref in PR body"; exit 1; }

# 3. Map to section
case "$TYPE" in
  feat) SECTION="Added" ;;
  fix) SECTION="Fixed" ;;
  perf|refactor) SECTION="Changed" ;;
  docs) SECTION="Documentation" ;;
  revert) SECTION="Reverted" ;;
  *) SECTION="Changed" ;;
esac
[ "$BREAKING" = "1" ] && SECTION="Changed"

# 4. Build line
LINE="- "
[ "$BREAKING" = "1" ] && LINE="${LINE}**BREAKING**: "
LINE="${LINE}${SUMMARY} ([#${PR}](${URL})) — spec: \`${SPEC}\`"

echo "Insert into CHANGELOG.md § [Unreleased] § ${SECTION}:"
echo "$LINE"
```

## Insert (idempotent)
```bash
# Ensure [Unreleased] section exists at top of CHANGELOG.md
grep -q '^## \[Unreleased\]' CHANGELOG.md || \
  sed -i '1i\## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Removed\n\n### Documentation\n\n### Reverted\n' CHANGELOG.md

# Insert under correct section (use a small awk script — never duplicate the line)
grep -F "$LINE" CHANGELOG.md || \
  awk -v section="### $SECTION" -v line="$LINE" '
    $0==section { print; getline; while ($0 ~ /^$/) { print; getline }
                  print line; print; next }
    { print }
  ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

git add CHANGELOG.md
git commit -m "docs(changelog): add entry for #${PR}" || true
git push
```

## On release cut
- `release-engineer` subagent renames `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD` and inserts a fresh `[Unreleased]` above it.
- Link references (`[X.Y.Z]: https://github.com/.../compare/...`) maintained at bottom of file.

## Output (JSON)
```json
{
  "pr": 123,
  "section": "Added",
  "line": "- add cascaded shadow maps ([#123](...)) — spec: `docs/specs/renderer/shadows.md`",
  "inserted": true,
  "duplicate_skipped": false,
  "breaking": false
}
```

## Refs
- https://keepachangelog.com/en/1.1.0/
- https://www.conventionalcommits.org/
- `docs/architecture/01-principles.md#law-2`
- `release-engineer` subagent (CLAUDE.md, Agent 23)
