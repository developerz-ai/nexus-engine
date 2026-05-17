<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Game Template — `scripts/custom/` Extension Rules

> Add scripts under `scripts/custom/`. `nexus upgrade` never touches them. Same contract as seeded scripts.

## Where Custom Scripts Live

```
scripts/
├── custom/                              ← yours, never overwritten
│   ├── pull-localization                ← entry, executable
│   ├── pull-localization.test.py        ← sibling test
│   ├── push-leaderboard-snapshot
│   └── push-leaderboard-snapshot.bats
├── lib/                                 ← seeded, overwritten
└── <seeded scripts>                     ← overwritten on upgrade
```

## Hard Rules

| # | Rule |
|---|---|
| 1 | put all custom scripts under `scripts/custom/`. Anywhere else → `nexus upgrade` may overwrite. |
| 2 | every custom script follows the same CLI contract as seeded scripts → `→ docs/specs/scripts/cli-contract.md`. |
| 3 | every custom script has a sibling test → `→ docs/specs/scripts/testing.md`. |
| 4 | every custom script is registered in `scripts/manifest.toml`. Without that, `scripts/index.json` skips it and AI agents won't discover it. |
| 5 | reuse `scripts/lib/*` utilities. Do not vendor your own logger / arg parser / envelope emitter. |
| 6 | `--env` required if the script touches env-scoped resources. |
| 7 | secrets via `nx_sops_decrypt` only. Never hardcode, never accept via flag. |
| 8 | exit code 0 = success, 2 = bad usage, 5 = gate failed, etc. — match the universal table. |
| 9 | commits to `scripts/custom/` must be signed (same as seeded). `→ docs/specs/scripts/security.md`. |
| 10 | lint clean: `scripts/lint-scripts --json` must exit 0 before merge. |

## Scaffold

```bash
scripts/new-script --name <kebab-name> --lang <bash|py|ts> --category <category>
```

Lands under `scripts/custom/`. Wires manifest. Stubs tests. Walkthrough: `→ docs/guides/scripts-write-your-own.md`.

## Naming Custom Scripts

| Pattern | Reason |
|---|---|
| project-specific verb-noun (`pull-localization`, `seed-test-data`) | clear intent |
| no overlap with seeded names | `scripts/build` is seeded; `scripts/custom/build` is an error |
| no `nexus-*` prefix | reserved for first-party tools |
| no `scripts/<name>` (top-level) | reserved for seeded |

`scripts/lint-scripts` enforces no-overlap and no-reserved-prefix rules.

## When to Add to `scripts/lib/` (Custom Shared Util)

Rarely. If two or more custom scripts share logic:

| Add it to | When |
|---|---|
| `scripts/custom/_lib/<name>.<ext>` | shared across custom scripts |
| `scripts/lib/<name>.<ext>` | only via PR to the template (so all games get it) |

`scripts/custom/_lib/` is also preserved by `nexus upgrade`.

## When NOT to Write a Script

| Situation | Better |
|---|---|
| one-off command | ad-hoc shell; do not pollute the index |
| logic better in `nexus` CLI | open issue / PR to nexus-cli; script becomes a thin wrapper |
| logic better as a subagent | author under `.claude/agents/`, invoke via `scripts/agent-run` |
| logic that's a single `gh api …` call | inline; not script-worthy |

## Upgrade Behavior

```bash
nexus upgrade --json --dry-run
```

Output (envelope):
```json
{
  "data": {
    "overwrite":   ["scripts/build", "scripts/check", "scripts/lib/log.sh"],
    "merge":       ["scripts/manifest.toml"],
    "preserve":    ["scripts/custom/", "scripts/custom/_lib/"],
    "regenerate":  ["scripts/index.json"]
  }
}
```

`preserve` = guaranteed untouched. `merge` = three-way merge; conflicts surface as `errors[]`.

## Promoting a Custom Script Upstream

When a custom script proves useful across multiple games:

| Step | Detail |
|---|---|
| 1 | move from `scripts/custom/<name>` to `scripts/<name>` in a PR to nexus-game-template |
| 2 | ensure tests still pass under template repo's CI |
| 3 | add manifest entry to the template's `scripts/manifest.toml` |
| 4 | nexus-merge gates: spec ✓, tests ✓, no-secret-leak ✓ |
| 5 | next `nexus upgrade` on every game gets it |

## Anti-Patterns

| Don't | Do |
|---|---|
| put custom scripts at `scripts/<name>` | put them at `scripts/custom/<name>` |
| skip the manifest entry | add it — otherwise undiscoverable |
| skip the test | CI fails |
| vendor your own logger | use `scripts/lib/log.{sh,py,ts}` |
| modify a seeded script in place | shadow it under `scripts/custom/`, or PR upstream |
| commit unencrypted secrets | use sops, period |

## Cross-References

- `→ docs/specs/scripts/cli-contract.md` — the contract you inherit
- `→ docs/specs/scripts/testing.md` — sibling test stack
- `→ docs/specs/scripts/security.md` — secrets + signed commits
- `→ docs/guides/scripts-write-your-own.md` — step-by-step
- `→ docs/game-template/scripts/seed-list.md` — reserved seeded names
- `→ docs/game-template/scripts/overview.md`
