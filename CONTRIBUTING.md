<!-- SPDX-License-Identifier: MIT -->

# Contributing to Nexus Engine

Spec-driven, AI-first, MIT forever. Read `CLAUDE.md` first.

## Spec before code (Law 2)

Every PR cites a `docs/specs/**` or `docs/contracts/**` path. New behavior → write the spec first. Format: [`docs/guides/spec-format.md`](docs/guides/spec-format.md).

## Four-stage pipeline

`spec → contract → impl → test`. Never skip a stage. Details: `CLAUDE.md`.

## Branch naming

`<system>/<short-desc>` — e.g. `renderer/pbr-lut`, `core/ecs-archetype-move`.

## PR title

`<system>: <imperative>` — 50/72 rule (subject ≤ 50, body wraps at 72). Conventional Commits acceptable for cross-cutting (`chore:`, `docs:`, `ci:`).

## Tests required (Law 12)

Every impl PR adds unit + integration + scenario tests. Coverage floor per `docs/guides/testing/coverage.md`.

## Local checks (run before push)

```bash
cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo nextest run
bun test
biome check
```

`cargo check --workspace` MUST be green (Law 4).

## PR babysit

End-to-end PR loop (open → CI → CodeRabbit → triage → fix → merge) is automated. Pointer: `.claude/skills/babysit-pr`.

## Subagent routing

Every task routes to a subagent. Routing table: `CLAUDE.md` → "Subagent Fleet — Routing Table". Independent tasks → dispatch N subagents in one message (parallelism doctrine: `docs/guides/parallelism-doctrine.md`).

## The 12 Laws

Non-negotiable. See `CLAUDE.md` → "Non-Negotiables" and `docs/architecture/01-principles.md`. A PR that violates a law is auto-rejected by `nexus-merge`.

## License

By contributing, you agree your work is licensed MIT (Law 7). Every new source file ships an SPDX header.
