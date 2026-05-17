---
description: Run the per-target deploy recipe for an env.
argument-hint: [env] [target]
argument: env target
allowed-tools: Agent, Bash, Read
---

# /deploy $ARGUMENTS

1. Parse: `$0` = env (dev|staging|prod). `$1` = target (fly|aws|gcp|azure|render|vercel|cloudflare|selfhost|agones).
2. `Agent({ subagent_type: "deploy-engineer", prompt: "Deploy to $0 on $1 per docs/guides/deploy/$1.md. Run preflight. Apply. Verify health. Roll back on failure." })`
3. Output: deploy status + health endpoint.
