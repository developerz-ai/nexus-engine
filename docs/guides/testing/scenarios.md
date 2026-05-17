<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Scenarios — The Nexus Innovation

A scenario is a TOML file that boots the engine, runs a deterministic simulation, and asserts on telemetry / state / events. It is THE integration test format for both engine and games.

Spec: → `docs/specs/agent/scenarios.md` (Agent 10). This file = the testing conventions around it.

## What scenarios do

| | Unit test | Integration test | **Scenario** |
|--|-----------|------------------|--------------|
| Boots engine | no | partial | yes |
| Real systems wired | no | partial | yes |
| Game logic exercised | no | maybe | yes |
| Asserts on telemetry stream | no | no | yes |
| Authored by | dev | dev | **AI agent + dev** |
| Replayable | no | no | yes |
| Survives refactor | no | mostly | yes (behavior, not impl) |

The big win: an AI agent writes scenarios. The engine runs them. The dev never writes test infrastructure.

## File location

| Owner | Path |
|-------|------|
| Engine | `crates/<crate>/scenarios/*.toml` |
| Demo games | `games/<game>/scenarios/*.toml` |
| Game template | `<game>/scenarios/*.toml` |
| DLC / mods | `<game>/dlc/<name>/scenarios/*.toml` |

One file per scenario. `kebab-case.toml`. Group folders OK: `scenarios/combat/melee-hitstop.toml`.

## Minimal scenario

```toml
# scenarios/render/empty-frame.toml
# SPDX-License-Identifier: MIT
schema = "nexus.scenario/v1"
name   = "empty frame renders without panicking"
seed   = 42

[engine]
backend = "noop"
audio   = "null"
clock   = "frozen"

[steps]
1.run_frames = 1

[assert]
"telemetry.frame_count"           = 1
"telemetry.errors.length"         = 0
"telemetry.pass_timing.geometry"  = { lt = "1ms" }
```

Run:

```bash
nexus run --scenario scenarios/render/empty-frame.toml
nexus run --scenario scenarios/render/                # directory recursive
nexus run --scenario scenarios/ --filter combat       # name substring
```

## Assertion DSL

Right-hand side forms:

| Form | Example | Meaning |
|------|---------|---------|
| Scalar | `= 1` | exact equality |
| Range | `= { lt = 5 }` / `{ gt = 0 }` / `{ between = [1, 10] }` | numeric bound |
| Approx | `= { approx = 3.14, tol = 0.01 }` | float equality |
| Contains | `= { contains = "shadow" }` | substring / array membership |
| Matches | `= { regex = "^PLAYER_" }` | regex |
| Exists | `= "?"` | key present |
| Absent | `= "!"` | key absent |
| Duration | `= "1ms"` / `"500us"` / `"16.6ms"` | parsed as `Duration` |
| Bytes | `= "1KiB"` / `"32MiB"` | parsed as bytes |
| Event | `[[assert.event]]` table | sequence/order matching |

Examples:

```toml
[assert]
"telemetry.frame_count"                  = 60
"telemetry.errors.length"                = 0
"telemetry.pass_timing.shadow"           = { lt = "2ms" }
"telemetry.gpu_memory"                   = { lt = "256MiB" }
"world.entities.Player.count"            = 1
"world.entities.Player[0].position.y"    = { approx = 0.0, tol = 0.001 }
"log[?level='error'].length"             = 0       # JSONPath query

[[assert.event]]
order = "strict"
match = [
  { code = "ENGINE.BOOT" },
  { code = "ASSET.LOADED", path = "scene/main.gltf" },
  { code = "ENGINE.FRAME_READY", frame = 1 },
]
```

→ `docs/specs/agent/scenarios.md` for the complete schema.

## Steps DSL

Sequential. Each step has a numeric key (sortable). Multiple actions per step allowed.

```toml
[steps]
1.spawn = { archetype = "Player", at = [0, 0, 0] }
2.apply_input = { player = 1, input = "move_forward", frames = 30 }
3.run_frames = 30
4.snapshot = "after-30-frames"
5.apply_input = { player = 1, input = "jump" }
6.run_frames = 60
7.assert_now = { "world.entities.Player[0].position.y" = { gt = 0.5 } }
```

Action verbs (engine-provided):
- `run_frames`, `run_seconds`
- `spawn`, `despawn`, `mutate`
- `apply_input`, `release_input`
- `snapshot`, `restore`
- `assert_now` (intermediate check)
- `emit` (custom event)

→ `docs/specs/agent/scenarios.md` for the full verb list.

## Engine block

```toml
[engine]
backend = "noop"                # "noop" | "vulkan" | "metal" | "dx12" | "webgpu"
audio   = "null"                # "null" | "real"
input   = "headless"
clock   = "frozen"              # "frozen" | "wall"
features = ["physics", "audio"] # enabled subsystems
plugins  = ["nexus-genre-fps"]  # additional crates
scene    = "demo/main.gltf"     # optional starting scene
```

Defaults: `backend = "noop"`, `audio = "null"`, `clock = "frozen"`. Safe-by-default for CI.

## Batch runs

```bash
nexus run --scenario scenarios/                       # all under dir
nexus run --scenario scenarios/ --parallel 8          # parallelism
nexus run --scenario scenarios/ --shard 1/4           # CI sharding
nexus run --scenario scenarios/ --tag perf            # tag filter
nexus run --scenario scenarios/ --until-fail          # stress
nexus run --scenario scenarios/ --json out/           # JSON output dir
```

Each scenario runs in its own process — full isolation, faulty scenario can't poison neighbors.

## Parallel runs

Scenarios are deterministic, so any subset can be parallelized. The scenario runner shards by hashing path → bucket.

| Constraint | Why |
|------------|-----|
| Each scenario has its own seed | reproducibility |
| Each scenario has its own tempdir | no shared FS |
| Each scenario has its own port (if needed) | no socket clash |
| GPU scenarios serialized within a worker | driver state |

CI: `--parallel $(nproc)`; per-shard p95 < 5 min.

## Output format

```json
{
  "scenario":  "scenarios/render/empty-frame.toml",
  "status":    "pass",
  "duration_ms": 312,
  "seed":      42,
  "asserts": [
    { "path": "telemetry.frame_count", "expected": 1, "actual": 1, "status": "pass" }
  ],
  "errors":    [],
  "snapshots": ["after-30-frames"],
  "replay":    "out/scenarios/render/empty-frame.replay"
}
```

Fail format includes diff:

```json
{
  "status": "fail",
  "asserts": [
    {
      "path": "world.entities.Player[0].position.y",
      "expected": { "approx": 0.0, "tol": 0.001 },
      "actual": 0.137,
      "status": "fail",
      "diff": "+0.137",
      "trace_id": "01HXY...K9"
    }
  ]
}
```

nexus-merge consumes this directly. → `docs/guides/merge-system.md`.

## Flake policy

Zero tolerance.

| Symptom | Action |
|---------|--------|
| Scenario fails intermittently | Open `flake.YYYYMMDD.<name>` ticket. Quarantine via `disabled = true` in TOML. Block merge of any PR that touches related crates until fixed. |
| Re-running passes | NOT acceptable as proof of fix. Must reproduce via `--until-fail` then patch. |
| Seed drift between runs | Scenario engine has a bug, not the test. Fix the engine. |
| Clock drift | `clock = "frozen"` not set; reject scenario. |

CI does NOT retry failed scenarios. A flake is a bug.

## Authoring workflow (AI-first)

1. Agent writes the spec → `docs/specs/<system>.md`.
2. Agent writes scenarios in `crates/<system>/scenarios/` BEFORE implementation.
3. `nexus run --scenario` → all fail (no code).
4. Agent implements until scenarios pass.
5. Agent writes additional scenarios discovered during implementation.
6. PR includes spec, code, scenarios. → `docs/guides/ai-dev-onboarding.md`.

## Authoring workflow (human)

```bash
nexus scenario new combat/melee-hitstop          # scaffolds TOML
nexus scenario run scenarios/combat/melee-hitstop.toml
nexus scenario record                            # interactive: play a session, capture telemetry, emit scenario
```

`nexus scenario record` runs the engine with input recording on; on stop, writes a TOML scenario that re-asserts the captured telemetry. Lets devs convert manual playtests into regression tests.

## Game-side scenarios

Identical format. Identical runner. Identical CI invocation.

```bash
nexus test --scenario               # all game scenarios
nexus test --scenario combat        # filter
```

Game devs write scenarios in `<game>/scenarios/`. The engine guarantees they work the same on engine PRs and game PRs. → `game-tests.md`.

## Hard rules

| Rule | |
|------|--|
| Every scenario has a seed (int) | reproducibility |
| Every scenario specifies `[engine]` explicitly | no default drift |
| No `now()` / wall clock | always frozen |
| Assert sections > 0 | every scenario must check something |
| Scenarios are committed | they ARE the tests |
| Scenario name = its assertion | reader knows what failed |
| Failures emit replay file | bisectable → `snapshot.md` |
| No conditional steps based on runtime state | use multiple scenarios |

## Forbidden

| Pattern | Why |
|---------|-----|
| `random_seed = true` | Non-reproducible |
| Wall-clock duration assertions in CI | Flake |
| Scenarios that depend on FS state outside `assets/` | Hidden coupling |
| Scenarios with > 60 s real-wall duration | Move to perf bucket |
| `disabled = true` without ticket | Dead test |
| Hand-edited replay files | Should be engine-generated |
| Same name in different files | Reporter conflict |

## Cross-link

- → `docs/specs/agent/scenarios.md` (canonical schema)
- → `docs/specs/agent/replay.md` (replay format)
- → `docs/specs/agent/telemetry.md` (assert sources)
- → `snapshot.md` · → `network.md` · → `game-tests.md` · → `ci.md`
- → `docs/guides/coding-style/errors.md` (assert on error `code`)
- → `docs/guides/coding-style/logging.md` (assert on log events)
- → `docs/guides/ai-dev-onboarding.md` (scenario-first workflow)
