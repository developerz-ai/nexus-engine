---
description: Author or run a TOML scenario under docs/specs/agent/scenarios.
argument-hint: [scenario-name]
allowed-tools: Agent, Read, Bash, Glob
---

# /scenario $ARGUMENTS

1. If scenario file exists → run: `Bash(nexus run --scenario $ARGUMENTS)`.
2. If absent → `Agent({ subagent_type: "scenario-author", prompt: "Author scenario $ARGUMENTS per docs/specs/agent/scenarios.md. TOML. Assertions explicit. Pass/fail criteria machine-checkable." })`
3. Output: scenario path + run result JSON.
