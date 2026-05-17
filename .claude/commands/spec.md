---
description: Author or revise a spec file under docs/specs/<system>/.
argument-hint: [system-name or spec-path]
allowed-tools: Agent, Read, Glob
---

# /spec $ARGUMENTS

1. Resolve target: if `$ARGUMENTS` is a path under `docs/specs/`, use it. Else map system → `docs/specs/<system>/overview.md`.
2. `Agent({ subagent_type: "spec-author", prompt: "Author/revise the spec for $ARGUMENTS. Follow docs/guides/spec-format.md. Cross-link contracts. Flag [DECISION NEEDED] / [BENCHMARK NEEDED]." })`
3. After spec lands, dispatch `integration-resolver` to fix cross-refs.
4. Output: spec path + open flags.
