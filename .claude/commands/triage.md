---
description: Cluster incoming crashes, rank by impact, draft fix PRs.
allowed-tools: Agent, Read, Bash
---

# /triage

1. `Agent({ subagent_type: "crash-triager", prompt: "Pull latest crashes from configured Sentry/Bugsnag/GlitchTip. Cluster by stack signature. Rank by user-impact × frequency. For top 5, identify owning spec + draft fix PR description." })`
2. Output: ranked clusters + draft PR titles.
