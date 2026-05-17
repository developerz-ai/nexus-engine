---
description: Run criterion benches on a crate and compare to baseline.
argument-hint: [crate-name]
allowed-tools: Agent, Bash, Read
---

# /bench $ARGUMENTS

1. `Agent({ subagent_type: "perf-engineer", prompt: "Run benches for crates/$ARGUMENTS. Compare to baseline in docs/architecture/benchmarks-pending.md. Emit JSON. Flag regressions ≥ 5%." })`
2. Output: bench JSON + regression verdict.
