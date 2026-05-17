---
description: Sweep the repo and sync docs/guides/glossary.md.
allowed-tools: Agent
---

# /sync-glossary

1. `Agent({ subagent_type: "glossary-keeper", prompt: "Sweep docs/specs/**, docs/contracts/**, docs/architecture/**. Extract domain terms. Add missing entries to docs/guides/glossary.md. Flag inconsistent uses." })`
2. Output: diff + flagged inconsistencies.
