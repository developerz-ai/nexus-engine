---
name: coderabbit-config
description: When and how to evolve .coderabbit.yaml — enable new tools, switch profile, add path-instructions for new doc subtrees, tune tone. Triggers: update coderabbit config, tune cr, edit coderabbit yaml.
allowed-tools: Read Edit Grep Glob Bash(git *)
---

# coderabbit-config

Single file: `/home/superuser/workspace/sebyx07/nexus-engine/.coderabbit.yaml`. Schema: `https://coderabbit.ai/integrations/schema.v2.json`.

## When to edit
| Trigger | Edit |
|---|---|
| New language/runtime in repo | add `reviews.tools.<linter>: enabled: true` |
| New doc subtree under `docs/<x>/` | add `path_instructions` entry |
| New crate subtree under `crates/<x>/` | add `path_instructions` entry |
| Too many noisy nits | switch `profile: assertive` → `chill` (last resort) |
| Too few catches | switch `profile: chill` → `assertive` (default) |
| New principle added to `docs/architecture/01-principles.md` | append rule to `tone_instructions` |
| New file glob to exclude | `path_filters` add `!<glob>` |
| Tone shift (e.g., new house rule) | edit `tone_instructions` |

## Profile semantics
| Profile | Behavior |
|---|---|
| `assertive` (default) | flags more, asks for changes, blocks merge until addressed |
| `chill` | summary only, no block, fewer nits |

Nexus default: `assertive`. Law 2 (spec-before-code) is too important to relax.

## Path-instruction pattern (copy + adapt)
```yaml
- path: "crates/<new>/**/*.rs"
  instructions: |
    Enforce Nexus principles (docs/architecture/01-principles.md).
    - No unwrap/expect/panic outside #[cfg(test)] (Law 6, 10)
    - Structured errors via thiserror (Law 10)
    - #[deny(missing_docs)] on all public items
    - tests live next to code in `#[cfg(test)] mod tests`
    Cite the spec in commit message: `docs/specs/<system>/<file>.md`.
```

## Tool enable/disable table
| Tool | Nexus default | Why |
|---|---|---|
| `shellcheck` | on | shell scripts in `scripts/`, `.github/workflows/` |
| `markdownlint` | on | spec/contract/guide quality |
| `github-checks` | on, timeout 900000 | wait for CI before final review |
| `gitleaks` | on | Law 7-adjacent: no secrets ever |
| `actionlint` | on | GitHub Actions correctness |
| `yamllint` | on | configs |
| `hadolint` | on | Dockerfiles for `nexus run --container` |
| `biome` | on | TS/JS in `crates/scripting/ts-bindings/`, web tooling |
| `ruff` | on | Python in `tools/`, `nexus-agent-sdk/python/` |
| `checkov` | on if `infra/` exists | IaC for matchmaking/relay |
| `sqlfluff` | on if `migrations/` exists | currently no SQL |
| `prisma-lint` | off | no Prisma usage |
| `ktlint` | off | no Kotlin |
| `ruby/rubocop` | off | no Ruby |

## Add a tool — diff template
```yaml
reviews:
  tools:
    <tool>:
      enabled: true
      # optional: config_file: ".<tool>.yml"
```
Commit: `chore(coderabbit): enable <tool> for <reason>`.

## Add a path_instruction — diff template
```yaml
reviews:
  path_instructions:
    - path: "<glob>"
      instructions: |
        <rules — one per line, imperative>
        Reference: docs/<...>
```
Commit: `chore(coderabbit): add path_instruction for <path>`.

## Validate locally
- VS Code with YAML extension reads the schema URL → live validation.
- Or: `npx -y @stoplight/spectral-cli lint .coderabbit.yaml --ruleset https://coderabbit.ai/integrations/schema.v2.json` (best-effort).

## Sanity test after edit
```bash
git diff .coderabbit.yaml          # review
gh pr comment "$PR" --body "@coderabbitai full review"   # on next PR, force fresh review
```

## Refs
- https://docs.coderabbit.ai/guides/configure-coderabbit
- https://docs.coderabbit.ai/getting-started/configure-coderabbit
- `docs/guides/coderabbit.md` — narrative companion
- `docs/architecture/01-principles.md`
