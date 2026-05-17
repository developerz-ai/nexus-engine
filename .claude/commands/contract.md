---
description: Author or revise a contract file under docs/contracts/<a>-<b>.md.
argument-hint: [a-b, e.g. core-renderer]
allowed-tools: Agent, Read, Glob
---

# /contract $ARGUMENTS

1. Target path: `docs/contracts/$ARGUMENTS.md`.
2. `Agent({ subagent_type: "contract-author", prompt: "Author/revise the $ARGUMENTS contract. Enforce both directions (A→B and B→A). Cite the two specs. Flag [DECISION NEEDED]." })`
3. Dispatch `integration-resolver`.
4. Output: contract path + delta.
