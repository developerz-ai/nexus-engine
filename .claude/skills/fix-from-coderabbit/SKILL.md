---
name: fix-from-coderabbit
description: For each accepted CR thread, locate file, route to right subagent, apply fix, build, run scoped tests, push, then resolve threads. Triggers: fix cr, apply coderabbit, address review comments.
allowed-tools: Bash(git *) Bash(cargo *) Bash(gh *) Bash(jq *) Read Edit Write Grep Glob Skill
---

# fix-from-coderabbit

For every thread classified `accept` by `coderabbit-triage`: fix → build → test (scoped) → commit → push → resolve.

## Input
`/tmp/triage.json` from `coderabbit-triage`. Filter to `action == "accept"`:
```bash
jq -c '.threads[] | select(.action == "accept")' /tmp/triage.json > /tmp/cr-accept.jsonl
```

## Per-thread loop
```bash
while read T; do
  PATH_=$(echo "$T" | jq -r .path)
  LINE=$(echo "$T" | jq -r .line)
  TID=$(echo "$T" | jq -r .thread_id)
  CLASS=$(echo "$T" | jq -r .class)

  # 1. Route by path → subagent
  AGENT=$(scripts/route-path.sh "$PATH_")    # see routing table below

  # 2. Delegate the fix
  # (mastermind dispatches Agent({ subagent_type: AGENT, prompt: "<thread context>" }))

  # 3. Build scoped
  CRATE=$(scripts/crate-of.sh "$PATH_")
  cargo check -p "$CRATE"

  # 4. Test scoped
  cargo test -p "$CRATE"

  # 5. Stage + commit per thread
  git add "$PATH_"
  git commit -m "fix(${CRATE}): $(echo "$T" | jq -r .summary)

CR-Thread: $TID"

  # 6. Push
  git push

  # 7. Resolve via gh-graphql-helpers
  bash .claude/skills/coderabbit-resolve/resolve-one.sh "$TID"

done < /tmp/cr-accept.jsonl
```

## Path → subagent routing
| Path glob | Subagent |
|---|---|
| `crates/core/ecs/**` | `ecs-engineer` |
| `crates/core/memory/**` | `memory-engineer` |
| `crates/renderer/**` | `renderer-engineer` (style → `pbr-specialist` etc.) |
| `crates/physics/**` | `physics-engineer` |
| `crates/audio/**` | `audio-engineer` |
| `crates/networking/**` | `network-engineer` |
| `crates/scripting/**` | `scripting-engineer` |
| `crates/assets/**` | `asset-pipeline-engineer` |
| `crates/agent/**` | `agent-api-engineer` |
| `crates/editor/**` | `editor-engineer` |
| `crates/genres/<g>/**` | `<g>-genre` |
| `docs/specs/**` | `spec-author` |
| `docs/contracts/**` | `contract-author` |
| `docs/architecture/05-adr/**` | `adr-author` |
| `.github/workflows/**` | `ci-engineer` |
| `**/*.toml`, `Cargo.lock` | `nexus-cli-engineer` |
| anything else | `code-reviewer` |

Full subagent fleet → `CLAUDE.md` § Subagent Fleet (Agent 23).

## Commit hygiene
- One commit per accepted thread. Body line: `CR-Thread: <thread_id>` for traceability.
- 50/72 subject. `<type>(<scope>): <imperative>`.
- Never squash inside this loop; squash happens in `pr-merge`.

## Build/test scope
| Change scope | Build | Test |
|---|---|---|
| single crate | `cargo check -p <crate>` | `cargo test -p <crate>` |
| crate + dependents | `cargo check --workspace` | `cargo test -p <crate>` + dependents |
| workflows | `act -j <job>` (if `act` installed) else push and watch | n/a |
| docs only | `cargo doc -p <crate> --no-deps` | n/a |

## Failure handling
- Build fails after fix → revert that one fix (`git restore`), mark thread `discuss`, reply with diagnostic.
- Test fails after fix → keep fix, fix the test if it was the regression CR predicted; else revert.
- Multiple fixes interact badly → bisect, keep the ones that pass alone, defer the rest.

## Output (JSON)
```json
{
  "pr": 123,
  "applied": 4,
  "reverted": 1,
  "resolved_threads": ["PRRT_a", "PRRT_b", "PRRT_c", "PRRT_d"],
  "commits": ["abc123", "def456"],
  "next": "wait-for-ci"
}
```

## Refs
- `.claude/skills/coderabbit-triage/SKILL.md`
- `.claude/skills/coderabbit-resolve/SKILL.md`
- `docs/guides/coding-style/` (Agent 20)
- `docs/architecture/04-workspace-layout.md`
