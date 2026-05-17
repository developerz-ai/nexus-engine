---
description: Full review — code + security + docs style in parallel.
argument-hint: [pr-number or branch]
allowed-tools: Agent, Bash, Read
---

# /review $ARGUMENTS

ONE message, parallel dispatch:
- `Agent({ subagent_type: "code-reviewer", prompt: "Review $ARGUMENTS against the 12 laws + spec referenced in PR body." })`
- `Agent({ subagent_type: "security-reviewer", prompt: "Audit $ARGUMENTS: secrets, unsafe, sandbox surface, supply chain, anti-cheat." })`
- `Agent({ subagent_type: "docs-style-enforcer", prompt: "Conform $ARGUMENTS docs to claude-code-bible ch.11." })`
- `Agent({ subagent_type: "principle-keeper", prompt: "Verify $ARGUMENTS passes each of the 12 laws." })`

Output: four verdicts. Merge-bot consolidates.
