<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — Scenarios

> TOML-defined deterministic test scenarios. Setup, steps, assertions, expected telemetry — declarative, machine-readable, batchable. The test framework an AI dev writes against, not GoogleTest.

## Boundaries

- **Owns:** TOML schema, scenario runner state machine, assertion evaluators, result format, batch runner.
- **Does NOT own:** the engine state being tested, scripted in-scene logic (→ scripting), CI orchestration (→ `docs/guides/integration-team.md` [AGENT: 16]).
- **Depends on:** headless runtime (→ `headless.md`), telemetry (→ `telemetry.md`), snapshot/replay (→ `replay.md`), entity CRUD (→ `api.md`).

## Why

Unit tests against a game engine in code are noisy: lots of setup, lots of teardown, lots of fragile pointers. A scenario is a pure data file. An AI dev writes one; the runner executes; the result is structured. Scenarios are also assets — they live in `scenarios/`, version with code, and reproduce regressions exactly because the engine is deterministic.

## File Layout

```
game/
├── scenarios/
│   ├── smoke/
│   │   ├── boot.toml
│   │   └── empty-scene.toml
│   ├── physics/
│   │   ├── falling-box.toml
│   │   ├── stacked-boxes.toml
│   │   └── coyote-time.toml
│   ├── regression/
│   │   └── issue-142-dragon-disappears.toml
│   └── perf/
│       └── 1000-entities.toml
```

A scenario file is self-contained: scene reference, initial entities, agent steps, assertions, expected metrics. It MUST be reproducible from the file alone — no hidden state.

## Schema

```toml
# scenarios/physics/falling-box.toml

[scenario]
name        = "Box falls and rests on floor"
id          = "phys.falling-box"        # stable, used in results
description = "A unit cube dropped from y=10 settles within 3s and emits exactly one collision."
tags        = ["physics", "smoke"]
timeout-ms  = 5000                       # hard wall-clock cap
seed        = 42                         # RNG seed override
tick-rate   = 60

[setup]
scene = "scenes/empty-floor.scn"
# OR inline:
# entities = [ ... ]

# Components / resources injected after scene load
[[setup.spawn]]
archetype  = "RigidBox"
components = { Transform = { pos = [0, 10, 0] }, RigidBody = { mass = 1.0 } }
tag        = "box"   # referencable below

[setup.resources]
"Physics.Gravity" = [0, -9.81, 0]

# Capabilities the engine grants for this scenario (sandbox)
[capabilities]
allowed = ["entity.*", "snapshot.*", "telemetry.*"]

# Steps execute in order. Each is one of: advance, rpc, input, wait-until, snapshot.
[[step]]
kind  = "advance"
ticks = 60       # 1 second at 60 Hz

[[step]]
kind   = "rpc"
method = "entity.get"
params = { entityId = "@box", components = ["Transform"] }
bind   = "midfall"   # capture result for assertion

[[step]]
kind  = "advance"
ticks = 180

[[step]]
kind      = "wait-until"
predicate = { topic = "events.collision", where = { a = "@box" } }
timeout-ticks = 120

[[step]]
kind   = "snapshot"
bind   = "final"

# Assertions evaluated at end (or inline with `kind = "assert"`)
[[assert]]
name = "box has fallen below y=5 by tick 60"
expr = "bindings.midfall.components.Transform.pos[1] < 5"

[[assert]]
name = "box ends at rest on floor"
expr = "entity('@box').components.Transform.pos[1] |> between(0.4, 0.6)"

[[assert]]
name = "exactly one collision recorded"
expr = "count(events('events.collision', where: {a='@box'})) == 1"

[[assert]]
name = "physics step time stayed under budget"
expr = "max(telemetry('physics.world').stepMs) < 4.0"

[[assert]]
name = "no script errors"
expr = "count(events('events.script.error')) == 0"

# Optional: expected telemetry baseline (regression detection)
[expect.telemetry]
"frame.simMs"     = { max = 8.0 }
"ecs.counts.entities" = { eq = 2 }     # floor + box
```

### Step kinds

| `kind` | Required fields | Purpose |
|---|---|---|
| `advance` | `ticks` (or `seconds`) | Run `sim.advance`. |
| `rpc` | `method`, `params?`, `bind?` | Execute any RPC; optionally bind result. |
| `input` | `frame`, `input` | Inject input as if from a player. |
| `wait-until` | `predicate`, `timeout-ticks` | Advance until predicate true. |
| `wait-ms` | `ms` | Wall-clock sleep (rarely needed; mostly for I/O timing tests). |
| `snapshot` | `bind` | Capture state for later assertion / artifact. |
| `restore` | `bind` | Restore previously-captured snapshot. |
| `assert` | `name`, `expr` | Inline assertion mid-scenario. |
| `record-event` | `name` | Emit a marker event into telemetry. |

### Tag refs

`@<tag>` resolves to the entity id created with that tag in `setup` or earlier steps. Tags scope to the scenario; no global registry.

### Predicates

A predicate is a small object — not a programming expression — to keep TOML parseable:

```toml
predicate = { topic = "events.collision", where = { a = "@box" } }
# OR
predicate = { entity = "@box", component = "Health", field = "current", op = "<=", value = 0 }
# OR
predicate = { telemetry = "physics.world", field = "awakeBodies", op = "==", value = 0 }
```

### Assertion expressions

Small expression DSL, evaluated in the runner sandbox. Pure, no side effects.

| Builtin | Purpose |
|---|---|
| `entity(tag-or-id)` | Returns current entity state. |
| `entities(query)` | Returns list matching query. |
| `events(topic, where?)` | Returns list of events recorded during run. |
| `telemetry(topic)` | Returns list of per-frame values. |
| `bindings.<name>` | Result from a prior `bind:`. |
| `count(list)` | Length. |
| `min/max/sum/avg/p95(list)` | Aggregations. |
| `between(x, lo, hi)` | Range check. |
| `|>` | Pipe operator. |
| `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!` | Standard ops. |

Grammar is intentionally small. If you need real logic, write a step `kind = "rpc" method = "script.eval"`.

## Execution

```
┌──────────────────────────────────────────────┐
│  parse TOML                                  │
│  validate against scenario schema            │
│  spawn `nexus run --headless --rpc=stdio`    │
│       --seed <seed> --tick-rate <rate>       │
│  initialize, set capabilities                │
│  load scene / inject setup                   │
│  for step in steps:                          │
│      run step; on error → fail-fast          │
│  for assert in asserts:                      │
│      evaluate; collect pass/fail             │
│  capture final snapshot (always)             │
│  shutdown engine                             │
│  return ScenarioResult                       │
└──────────────────────────────────────────────┘
```

A scenario MAY define its own engine config; the runner spawns one engine per scenario by default (process isolation). Batch mode (below) can reuse a single engine when scenarios opt in via `[scenario] reuse-engine = true`.

## Result Schema

```jsonc
// scenario.run → ScenarioResult
{
  "id": "phys.falling-box",
  "passed": true,
  "durationMs": 312,
  "tickCount": 240,
  "asserts": [
    { "name": "box has fallen below y=5 by tick 60",
      "passed": true, "actual": 4.18 },
    { "name": "box ends at rest on floor",
      "passed": true, "actual": 0.51 },
    { "name": "exactly one collision recorded",
      "passed": true, "actual": 1 },
    { "name": "physics step time stayed under budget",
      "passed": true, "actual": 2.4 }
  ],
  "artifacts": {
    "snapshotFinal":   "artifacts/phys.falling-box/final.snap",
    "telemetryLog":    "artifacts/phys.falling-box/telemetry.ndjson",
    "stdoutLog":       "artifacts/phys.falling-box/stdout.log"
  },
  "telemetryBaseline": { "matched": true, "deviations": [] }
}
```

On failure:

```jsonc
{
  "id": "phys.falling-box",
  "passed": false,
  "failedAt": { "kind": "assert", "index": 1 },
  "asserts": [
    { "name": "box ends at rest on floor",
      "passed": false, "expected": "between(0.4, 0.6)", "actual": -0.12,
      "diagnostic": "Box clipped through floor; check collision margin." }
  ],
  "artifacts": { "snapshotFinal": "...", "telemetryLog": "...",
                 "regressionPack": "artifacts/phys.falling-box/regression.zip" }
}
```

The `regressionPack` bundles snapshot + telemetry + scenario file — sufficient to reproduce the failure with `nexus replay`. (→ `replay.md`)

## Batch Runs

```jsonc
// scenario.runBatch
{
  "glob":     "scenarios/**/*.toml",
  "parallel": 8,
  "tags":     { "include": ["smoke"], "exclude": ["slow"] },
  "fastFail": false,
  "outputDir": "artifacts/"
}

// → BatchResult
{
  "total": 142,
  "passed": 140,
  "failed": 2,
  "skipped": 0,
  "durationMs": 18200,
  "results": [ /* ScenarioResult, ... */ ],
  "junit":   "artifacts/junit.xml",
  "summary": "artifacts/summary.json"
}
```

Parallelism spawns up to `parallel` engine processes concurrently. Determinism per scenario is preserved; ordering of `results` is by completion.

## CLI

```
nexus scenario run <FILE>             # single scenario
nexus scenario run-batch <GLOB>       # batch
nexus scenario validate <FILE>        # schema check, no engine boot
nexus scenario list <DIR>             # enumerate, show tags
nexus scenario record <FILE>          # run + capture as regression baseline
```

CI integration: `nexus scenario run-batch 'scenarios/**' --junit junit.xml --fast-fail` returns nonzero on any failure.

## Authoring Convention

- One scenario per file. Tags carry suite info.
- File name = scenario id with `/` → `-` (e.g. `phys-falling-box.toml`).
- Regression scenarios live under `scenarios/regression/issue-NNNN-*.toml` and reference the issue.
- A scenario that catches a real bug MUST land in the same PR as the fix.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Scenario boot (process spawn → first step) | < 200 ms | < 1 s |
| 100 scenarios batch (parallel=8) | < 30 s | < 2 min |
| Assertion expression eval | < 10 µs | < 100 µs |
| Per-scenario artifact write | < 50 ms | < 500 ms |

## Error Contract

| Code | `data.code` | Meaning | Caller action |
|---|---|---|---|
| -32602 | `SCENARIO_INVALID` | TOML failed schema validation | Fix file; see `data.errors`. |
| -32016 | `SCENARIO_TIMEOUT` | Exceeded `timeout-ms` | Increase or fix infinite loop. |
| -32017 | `STEP_FAILED` | A step RPC errored | Inspect `data.step` and chained error. |
| -32018 | `ASSERT_EXPR_INVALID` | Expression failed to parse | Fix expression. |
| -32019 | `TAG_UNRESOLVED` | `@tag` referenced before created | Order steps; ensure setup ran. |

## Test Requirements

- An empty `[scenario]` with `name = "noop"` passes immediately.
- A scenario referencing a missing scene fails with `STEP_FAILED` and `data.code = "SCENE_NOT_FOUND"`.
- Running the same scenario twice with same seed produces byte-identical artifact bundles.
- A scenario with no assertions but passing steps reports `passed: true`.
- Batch of 100 trivial scenarios at `parallel=8` finishes in < 30 s on reference hardware [BENCHMARK NEEDED].
- Assertion expression `count(events('events.collision')) > 0` evaluates correctly against a known collision event.

## Cross-references

- → `docs/specs/agent/api.md` — `scenario.*` RPCs
- → `docs/specs/agent/headless.md` — runtime mode used to execute
- → `docs/specs/agent/telemetry.md` — events/topics queried by assertions
- → `docs/specs/agent/replay.md` — regression pack format
- → `docs/specs/agent/sdk.md` — `nexus scenario` CLI bindings
- → `docs/contracts/core-agent.md` — capabilities grant model [AGENT: 14]
- → `docs/guides/integration-team.md` — CI uses `run-batch` [AGENT: 16]

## Prior Art

- Cucumber / Gherkin ✓ — natural-language scenarios; we use TOML for machine-parseability + structured assertions.
- RSpec, Jest ✓ — assertion vocabulary inspires `expect`/`assert` shape.
- Insta snapshot tests ✓ — `[expect.telemetry]` is a snapshot of expected metrics.
- Bevy `App` test harness ✓ — proves an ECS engine is testable in isolation.
- Replay-based test runners in Source/Quake ✓ — deterministic playback as test.

## Open Questions

- [DECISION NEEDED] Should `parallel` mode share assets across engine processes via shared memory? Significant boot-time win at cost of complexity.
- [DECISION NEEDED] Allow Lua/Rune scripted assertions in addition to expr DSL? Coordinate with [AGENT: 08].
- [DECISION NEEDED] JUnit XML vs SARIF vs custom JSON as the canonical batch summary format. Probably support all three.
