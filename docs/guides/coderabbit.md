<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# CodeRabbit — What It Checks, How to Use It, When It's Wrong

CodeRabbit (`@coderabbitai`) is the always-on review bot for Nexus. Config: `.coderabbit.yaml`. Skills: `.claude/skills/coderabbit-*`.

---

## What CR catches automatically (Nexus repo)

| Category | Examples |
|---|---|
| Law violations | `panic!`/`unwrap`/`expect` in shipped code (Law 6, 10); string-only errors (Law 10); `println!` (Law 11); missing SPDX header (Law 7); `unsafe` without `// SAFETY:` (Law 6) |
| Spec compliance | PR with no `docs/specs/**` reference (Law 2); spec file missing required sections; invented perf numbers vs `[BENCHMARK NEEDED]` |
| Cross-system | contract referenced but consumer not updated; downstream test that needs change |
| Code quality | clippy/rustfmt drift; complexity hot-spots; god modules; missing public docs |
| Configs | unpinned action SHAs; secrets leaked in YAML; over-broad `permissions:` |
| Shaders | WGSL that fails `naga`; magic binding indices |

Tools enabled: see `reviews.tools` block in `.coderabbit.yaml`. Per-path rules: `reviews.path_instructions`.

---

## Reading a CR review

A typical CR review has three parts:

1. **Summary comment** — top-level review summary by `coderabbitai[bot]`. Contains the actionable comment count, walkthrough, and sequence diagrams (for cross-system changes).
2. **Inline review threads** — file/line comments. Each is a `PullRequestReviewThread` (GraphQL). The mastermind reads these via `gh-graphql-helpers` recipe #1.
3. **Walkthrough** — auto-generated per-file walkthrough. Reference only; never block on this.

Triage rule: only act on inline threads. Summary and walkthrough are informational.

---

## Responding to a CR thread

| CR thread says | You do | Skill |
|---|---|---|
| reproducible defect / Law violation | fix, push, resolve | `fix-from-coderabbit` → `coderabbit-resolve` |
| stylistic nit, no behavior change | accept if cheap, else reject as taste | `fix-from-coderabbit` or `coderabbit-reply` |
| alternative impl, both correct | benchmark, then decide | `coderabbit-reply` with `discuss` |
| factually wrong (contradicts spec/Law) | reject, cite Law anchor | `coderabbit-reply` with rejection template |
| outdated (file moved/changed since CR review) | resolve, no reply | `coderabbit-resolve` |

Always cite an anchor in `docs/architecture/01-principles.md#law-N` when rejecting. CR remembers and stops surfacing the same wrong suggestion next PR (knowledge base on).

---

## Chat commands

Full table: `.claude/skills/respond-to-cr-commands/SKILL.md`.

Most common:
```bash
gh pr comment "$PR" --body "@coderabbitai review"        # incremental
gh pr comment "$PR" --body "@coderabbitai full review"   # from scratch (after rebase)
gh pr comment "$PR" --body "@coderabbitai resolve"       # close all CR threads
gh pr comment "$PR" --body "@coderabbitai pause"         # WIP storm — silence CR
gh pr comment "$PR" --body "@coderabbitai summary"       # regenerate summary
```

---

## Updating `.coderabbit.yaml`

Use `.claude/skills/coderabbit-config/SKILL.md`. Common edits:

- New language/runtime → enable a tool under `reviews.tools`.
- New doc subtree → add `path_instructions` entry.
- New principle in `01-principles.md` → append a rule to `tone_instructions`.
- Too noisy → consider tightening `path_filters`, not lowering profile.

Test locally: any IDE that reads `yaml-language-server` schema URLs validates the file inline. After merge, force a fresh review on the next PR with `@coderabbitai full review`.

---

## When CR is wrong (it happens)

CR sometimes:
- proposes `anyhow!()` because it's "more idiomatic" → wrong for Nexus (Law 10).
- suggests removing `#[deny(missing_docs)]` to silence build noise → wrong (house rule).
- suggests broadening `unsafe` blocks for "convenience" → wrong (Law 6).
- suggests `println!` in benchmarks instead of `eprintln!` to stderr → both wrong (Law 11; use the criterion bench reporter).

Reject with the rejection template in `.claude/skills/coderabbit-reply/SKILL.md`. Always cite the Law anchor. The knowledge base option (`learnings: scope: global`) makes CR learn from one PR and stop repeating across the repo.

---

## Privacy / data handling

CodeRabbit sees PR diffs and comments. No source files are otherwise sent. No production data. Repo is public MIT — there is nothing to protect except API tokens, which `gitleaks` (enabled) catches before CR ever sees them.

---

## Refs

- https://docs.coderabbit.ai/guides/configure-coderabbit
- https://docs.coderabbit.ai/guides/commands
- `.coderabbit.yaml`
- `.claude/skills/coderabbit-triage/SKILL.md`
- `.claude/skills/coderabbit-reply/SKILL.md`
- `.claude/skills/coderabbit-resolve/SKILL.md`
- `.claude/skills/coderabbit-config/SKILL.md`
- `docs/architecture/01-principles.md`
