---
description: Run the per-store release recipe.
argument-hint: [steam|itch|epic|gog|msstore|appstore|playstore|web|switch|ps5|xbox]
allowed-tools: Agent, Bash, Read
---

# /release $ARGUMENTS

1. `Agent({ subagent_type: "release-engineer", prompt: "Run the $ARGUMENTS release recipe per docs/guides/release/$ARGUMENTS.md. Verify codesigning. Verify rating. Verify build artifacts. Emit submission checklist + pass/fail." })`
2. Output: submission status.
