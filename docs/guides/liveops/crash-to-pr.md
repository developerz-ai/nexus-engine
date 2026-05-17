<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crash → PR Pipeline

End-to-end contract. Each step has a single owner and a single output.

## The pipeline

```
1 capture      → crashpad             → minidump + envelope
2 ingest       → collector            → cluster id (fingerprint)
3 enrich       → coder                → cluster + replay + telemetry context
4 reproduce    → headless engine      → state-hash matches recording
5 minimize     → bisect inputs        → minimal failing scenario
6 fail-first   → scenario test        → red on main
7 propose      → coder (LLM + spec)   → diff
8 validate     → scenario matrix      → green
9 perf gate    → benchmark            → Δ within budget
10 PR open     → coder                → spec-referenced PR
11 review      → nexus-merge          → static + arch + license + tests
12 canary      → release              → 1% of users
13 watch       → alerts               → auto-rollback on regression
14 promote     → release              → 100%
15 close cluster → coder              → "fixed-in <release>"
```

## Per-step contract

| Step | Input | Output | Owner | Failure → |
|------|-------|--------|-------|-----------|
| 1 capture     | crash | minidump+envelope | engine handler | local log only |
| 2 ingest      | envelope | cluster_id | collector | drop, retry queue |
| 3 enrich      | cluster_id | enriched cluster | coder | mark `enrich_failed`, skip |
| 4 reproduce   | replay | state-hash match | headless engine | mark `non_repro`, watch_only |
| 5 minimize    | replay | minimal `.nrep` | coder.bisect | use full replay |
| 6 fail-first  | min `.nrep` | scenario test (red) | coder | block — humans needed |
| 7 propose     | scenario + spec | diff | coder LLM | retry up to 3 |
| 8 validate    | diff | matrix green | scenario runner | go to 7 |
| 9 perf gate   | diff | Δ within budget | benchmark runner | go to 7 |
| 10 PR open    | diff + artifacts | PR url | coder | mark `submit_failed` |
| 11 review     | PR | merge/reject | nexus-merge | feedback → 7 |
| 12 canary     | release | rollout 1% | publisher | rollback |
| 13 watch      | metrics | hold/rollback/promote | alerts | rollback |
| 14 promote    | hold ok | 100% | publisher | — |
| 15 close      | release | cluster closed | coder | — |

## Artifacts

Each PR carries the full evidence chain:

```
pull-request/
├── cluster.json         # cluster + impact + history
├── envelope.json        # representative envelope
├── replay.nrep          # encrypted, link only
├── scenario.toml        # the failing test (now passing)
├── perf.json            # Δ frame ms, allocs, draw calls
├── coverage.json        # Δ lines
└── spec.refs            # which spec sections govern this fix
```

## Time budget

Target wall-clock per cluster (P50):

| Step | Budget |
|------|--------|
| 1–3 (capture → enrich) | < 60s |
| 4 (reproduce) | < 5 min |
| 5 (minimize) | < 15 min |
| 6–9 (test + fix loop) | < 30 min |
| 10–11 (PR + review) | < 30 min |
| 12 (canary live) | 1–6 h |
| 13–14 (promote) | < 1 h after canary clean |

Total P50: < 8 hours from first crash to fix at 100%. Target P95: < 24 h.

## Examples

### Off-by-one panic

```
Step 4: replay reproduces in 2.1s.
Step 5: bisect → input{tick=412, action="grab_item", target_idx=42}
Step 6: scenario asserts no panic on grab with empty inventory → RED.
Step 7: coder narrows inventory.rs:131 bounds check.
Step 8: matrix green (412/412).
Step 10: PR #1278 with cluster-9a8b.
Step 12: canary 1% for 2h. Crashes match prior baseline.
Step 14: promote.
```

### Non-reproducible

```
Step 4: replay diverges at tick=89 (state-hash mismatch).
Mark cluster: non_repro. Coder opens "needs determinism review" issue.
Loop continues for other clusters.
```

## Smoke test

```bash
nexus crash-to-pr dry-run --crash-id=<id>
# walks the pipeline locally, prints what each step would do
```

## Verify

```bash
nexus cluster status --cluster=<id>
# prints current step, last result, next action
```

## Rollback

Per step:

```bash
nexus cluster reopen --cluster=<id>          # back to step 3
nexus cluster pause --cluster=<id>            # halt pipeline
nexus pr close --num=<n> --reason='wrong fix' # back to step 7
nexus publish rollback --release=<id>         # step 12 → revert
```

## Cross-links

- `→ docs/guides/liveops/ai-triage.md` — clustering + ranking detail
- `→ docs/guides/liveops/replay-on-crash.md`
- `→ docs/guides/testing/scenarios.md`
- `→ docs/guides/merge-system.md` — review gate
- `→ docs/guides/liveops/canary-and-rollback.md`
- `→ docs/specs/coder/workflows.md`

## References

- Google SRE on incident lifecycle · `https://sre.google/sre-book/managing-incidents/`
- Bisect-style minimization · `https://www.cs.utah.edu/~regehr/papers/pldi12-preprint.pdf` (C-Reduce)

## Open

- `[BENCHMARK NEEDED]` P50 wall-clock from crash to merged PR — measure once coder is online.
