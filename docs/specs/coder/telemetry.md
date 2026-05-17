<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Telemetry

> Structured JSON for every event. Token spend per task. Model accuracy per task type. Scenario pass rate. Time-to-merge. All grep-able, all chartable, all replayable.

→ Audit log location: `docs/specs/coder/sandbox.md` §audit log
→ Cost ledger usage: `docs/specs/coder/models.md` §cost ceilings
→ Engine-side telemetry (separate stream): `docs/specs/agent/telemetry.md` [AGENT: 10]

---

## Boundaries

- **Owns:** subagent + orchestrator + tool runtime events, cost ledger, accuracy estimator.
- **Does NOT own:** engine-frame telemetry (engine emits separately) · OpenRouter-side metering (their dashboard).
- **Depends on:** local filesystem append (JSONL) · optional sink (OpenTelemetry OTLP, Loki, etc.).

---

## The single truth: `.nexus/coder/audit.jsonl`

Append-only. One event per line. UTF-8. Newline-terminated. Schema-versioned.

```jsonl
{"v":1,"ts":"2026-05-17T14:22:01.041Z","kind":"subagent.spawn","task_id":"impl-physics-rigid-3a","role":"coder","model":"anthropic/claude-sonnet-4-7","slot":4,"worktree":".nexus/coder/worktrees/slot-04","parent_run":"run-2026-05-17-14-21-58"}
{"v":1,"ts":"2026-05-17T14:22:01.412Z","kind":"context.built","task_id":"impl-physics-rigid-3a","tokens":18420,"cache_target_ratio":0.74,"layers":{"L0":2100,"L1":2890,"L2":910,"L3":4720,"L4":3120,"L5":3680,"L7":1000}}
{"v":1,"ts":"2026-05-17T14:22:04.853Z","kind":"model.step","task_id":"impl-physics-rigid-3a","step":1,"prompt_tokens":18420,"completion_tokens":2104,"cached_tokens":14200,"cost_usd":0.0421,"duration_ms":3441,"tool_calls":["ReadSpec","GrepCodebase"]}
{"v":1,"ts":"2026-05-17T14:22:05.119Z","kind":"tool.call","task_id":"impl-physics-rigid-3a","tool":"EditCrate","input_hash":"sha256:abc...","output_hash":"sha256:def...","duration_ms":42,"status":"ok"}
{"v":1,"ts":"2026-05-17T14:22:42.700Z","kind":"scenario.run","task_id":"impl-physics-rigid-3a","scenario":"games/demo-fps/scenarios/strafe.toml","passed":true,"duration_ms":1284,"snapshot_id":"snap-91a2"}
{"v":1,"ts":"2026-05-17T14:23:11.005Z","kind":"subagent.exit","task_id":"impl-physics-rigid-3a","status":"ok","total_tokens":62100,"total_cost_usd":0.184,"files_changed":7,"pr_url":"https://github.com/.../pull/421"}
```

Discoverable by `jq`, by `nexus coder cost`, by any time-series DB ingest.

---

## Event taxonomy

| `kind` | Source | Frequency |
|---|---|---|
| `run.start` / `run.end` | orchestrator | per CLI invocation |
| `dag.built` | orchestrator | per run |
| `subagent.spawn` / `subagent.exit` | orchestrator | per task |
| `context.built` | context builder | per task |
| `model.step` | subagent | per AI SDK step |
| `tool.call` | tool runtime | per tool call |
| `scenario.run` | tool runtime → engine bridge | per `RunHeadlessScenario` |
| `bench.run` | tool runtime | per `BenchPerfContract` |
| `validate.run` | tool runtime | per `ValidateAgainstSpec` |
| `pr.open` | tool runtime | per `OpenPR` |
| `worktree.alloc` / `worktree.release` | sandbox mgr | per task |
| `permission.deny` | tool runtime | on denial |
| `kill.trigger` | orchestrator / sandbox | on kill |
| `backpressure.engaged` / `backpressure.cleared` | orchestrator | on transition |
| `throttle.applied` | orchestrator | on cap hit |
| `cost.cap.hit` | cost ledger | on cap |
| `model.failover` | model router | on fallback hop |

---

## Per-task summary (derived)

`nexus coder cost` rolls events into a per-task row:

```json
{
  "task_id": "impl-physics-rigid-3a",
  "task_type": "code.impl",
  "model": "anthropic/claude-sonnet-4-7",
  "tokens": { "prompt": 62100, "completion": 8200, "cached": 48000 },
  "cost_usd": 0.184,
  "wall_s": 70.0,
  "tool_calls": { "ReadSpec": 3, "GrepCodebase": 2, "EditCrate": 5, "RunHeadlessScenario": 1, "ValidateAgainstSpec": 1, "OpenPR": 1 },
  "scenarios": { "ran": 1, "passed": 1 },
  "pr": "https://github.com/.../pull/421",
  "status": "merged"
}
```

---

## Accuracy estimator

For each `(task_type, model)` cell, derive accuracy from outcomes:

```
accuracy = pass(validate) ∧ pass(scenario) ∧ merged(pr)
         / total tasks of that (type, model)
```

Rolling window: last 1000 tasks. Stored in `.nexus/coder/accuracy.json`. Used by `models.md` policy + `nexus coder cost --recommend`.

```json
{
  "code.impl": {
    "anthropic/claude-sonnet-4-7": { "n": 412, "accuracy": 0.94, "avg_cost": 0.21 },
    "deepseek/deepseek-v4":         { "n": 188, "accuracy": 0.82, "avg_cost": 0.04 },
    "qwen/qwen3-coder":             { "n": 122, "accuracy": 0.79, "avg_cost": 0.02 }
  }
}
```

---

## Time-to-merge

Tracked per workflow:

| Metric | Definition |
|---|---|
| `t_dag_start` | first subagent spawn |
| `t_validate_pass` | last validate step passes |
| `t_pr_open` | `OpenPR` tool call |
| `t_merge` | webhook from `nexus-merge` (or human merge) |
| `ttm = t_merge - t_dag_start` | reported in `nexus coder cost --workflow` |

---

## Scenario-test pass rate

Derived from `scenario.run` events. Per scenario, rolling 100-run rate. Drop > 5pp triggers `health.scenario_regression` alert.

```
pass_rate(scenario) = count(passed=true) / count(*)   # last 100 runs
```

→ Scenarios spec: `docs/specs/agent/scenarios.md`.

---

## Token spend dashboard (`nexus coder cost`)

```
$ nexus coder cost --since=24h
Run         Workflow         Tasks  Tokens     Cost     TTM      Status
run-...001  implement-spec   6      241k       $0.94    7m42s    merged
run-...002  perf-regression  18     1.2M       $4.12    34m11s   merged
run-...003  weekend-mvp      483    142M       $187.40  47h08m   shipped

By model:
  anthropic/claude-opus-4-7    12.4M tok  $124.00
  anthropic/claude-sonnet-4-7  98.1M tok  $58.40
  anthropic/claude-haiku-4-7   24.3M tok  $4.20
  deepseek/deepseek-v4         8.9M tok   $1.20

Cache hit ratio (avg static prefix): 71.4%
```

---

## Sinks

| Sink | Format | Use case |
|---|---|---|
| `.nexus/coder/audit.jsonl` | JSONL | local truth, always on |
| stdout (when `--telemetry=stdout`) | JSONL | CI capture, pipe to log aggregator |
| OpenTelemetry OTLP | OTLP | Grafana/Tempo, opt-in |
| Loki | JSON | log search, opt-in |
| Prometheus push-gateway | metrics | dashboards, opt-in |

Default: JSONL only. Other sinks via `~/.nexus/coder/sinks.toml`.

---

## Privacy & redaction

By default, audit log includes prompts and tool outputs hashed (sha256) not in plaintext — preserves diff-ability without leaking content. Toggle plaintext via `audit.plaintext = true` (per-event class) when debugging.

OpenRouter API keys never appear in any log. Scrubbed at the orchestrator before write.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| Audit write (per event) | < 1 ms | < 10 ms |
| Audit log fsync policy | every 1 s or 1000 events | configurable |
| `nexus coder cost --since=24h` | < 500 ms (1M events) | < 3 s |
| Accuracy estimator update | < 100 µs per outcome | < 1 ms |
| Sink fan-out latency | < 50 ms | < 500 ms |

---

## Error contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_AUDIT_WRITE` | filesystem full / IO error | switch to stderr fallback, alarm |
| `E_SINK_DOWN` | configured OTLP/Loki unreachable | drop sink, keep JSONL, alarm |
| `E_SCHEMA_VERSION` | replaying old audit with new tool | upgrade tool reader, never rewrite log |

---

## Prior art

- **OpenTelemetry** ✓ — schema and semantic conventions; we adopt for sink interop.
- **Honeycomb-style wide events** ✓ — one event per unit of work, many fields; we steal the philosophy.
- **`structlog` (Python)** ✓ — structured logging defaults.
- **Anthropic / OpenAI usage APIs** ✓ — token + cost in response headers; we record verbatim.
- **OpenRouter cost headers** ✓ — `X-OR-Cost`, `X-OR-Cached-Tokens`; we record verbatim.

---

## Open questions

- [DECISION NEEDED] Should the audit log be append-only at the OS level (`chattr +a` on Linux)? Default: yes when run as `--secure`.
- [DECISION NEEDED] Surface a live web UI (`nexus coder ui --port=8080`)? Default: yes, v1.0; simple SSE over the audit log.
- [BENCHMARK NEEDED] Sustained event rate at 64 concurrent subagents. Estimate ~5k events/s peak.
