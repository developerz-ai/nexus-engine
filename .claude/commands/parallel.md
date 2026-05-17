---
description: Split a multi-part task into parallel subagent invocations.
argument-hint: [task description]
allowed-tools: Agent
---

# /parallel $ARGUMENTS

1. `Agent({ subagent_type: "orchestrator", prompt: "Plan: $ARGUMENTS. Output a JSON dispatch plan: { batches: [[{subagent_type, prompt}, …], …] }. Maximize parallelism. Serialize only on hard dependencies." })`
2. Execute the plan batch by batch, in-message parallel within each batch.
3. After final batch: dispatch `integration-resolver` + `merge-bot`.
