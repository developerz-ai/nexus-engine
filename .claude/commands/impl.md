---
description: Read a spec, route to the right engineer, write impl + tests.
argument-hint: [spec-path, e.g. docs/specs/networking/rollback.md]
allowed-tools: Agent, Read, Grep, Glob
---

# /impl $ARGUMENTS

1. Read `$ARGUMENTS`. Identify the owning subsystem.
2. Route per CLAUDE.md routing table. If unclear → dispatch `orchestrator` first.
3. ONE message, parallel dispatch:
   - domain engineer (impl per spec)
   - `test-author` (unit + integration + scenario)
   - `perf-engineer` (criterion bench against Performance Contract)
4. After batch: parallel `code-reviewer` + `security-reviewer` + `docs-style-enforcer`.
5. `merge-bot` verdict.
