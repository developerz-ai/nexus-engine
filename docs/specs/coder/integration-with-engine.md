<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Integration With the Engine

> nexus-coder talks to Nexus through `nexus-agent-sdk` — same protocol the editor uses, same protocol CI uses. Scenarios are ground truth. Replay snapshots are regression fixtures. The semantic API is a high-level affordance.

→ The SDK it consumes: `docs/specs/agent/sdk.md` [AGENT: 10]
→ Wire protocol: `docs/specs/agent/api.md` [AGENT: 10]
→ Scenarios: `docs/specs/agent/scenarios.md` [AGENT: 10]
→ Replay: `docs/specs/agent/replay.md` [AGENT: 10]
→ Semantic API: `docs/specs/agent/semantic.md` [AGENT: 10]
→ Contract: `docs/contracts/core-agent.md` [AGENT: 14]

---

## Boundaries

- **Owns:** the bridge process, scenario+replay+bench tool implementations, engine instance pool.
- **Does NOT own:** the engine itself · the JSON-RPC schema · scenarios on disk (those belong to games + spec test sections).

---

## Why this matters

nexus-coder is a Nexus citizen. It uses the public agent API only. No privileged paths, no internal hooks. This guarantees:

1. **Dogfooding.** If the agent API has a gap, nexus-coder feels it first.
2. **Substitutability.** Any third-party coding agent that speaks `nexus-agent-sdk` is on equal footing.
3. **Determinism.** Same RPC produces same engine state. Same scenario produces same pass/fail. → AI-first law 5 (`docs/initial/vision.md`).

---

## Bridge topology

```
N subagents
     │      (each issues tool calls to its in-proc tool runtime)
     ▼
Tool runtime
     │      (RunHeadlessScenario / ReplaySnapshot / BenchPerfContract)
     ▼
Engine bridge process (Rust)
     │      (multiplexes onto K headless engines)
     ▼
K headless engines (nexus run --headless --rpc=stdio)
     │      (JSON-RPC over stdio per agent SDK spec)
     ▼
Engine state (ECS world, physics world, render-not-run)
```

Pool size K ≤ N. Default K = ceil(N/4). Engines are reusable across subagents because every scenario starts with `world.reset` + `snapshot.load`.

---

## Engine instance lifecycle

```
on bridge boot:
   for i in 0..K:
       spawn `nexus run --headless --rpc=stdio --determinism=strict`
       initialize handshake (capabilities exchange per agent/api.md)
       mark slot free

on tool call:
   pick free slot OR queue
   send: world.reset { seed: <task_id_hash> }
   send: scenario.load { path }   OR snapshot.load { id }
   send: sim.advance { ticks } OR run-until-assertion
   collect telemetry stream
   return structured result
   send: world.reset to clear state for next caller
   mark slot free

on bridge shutdown:
   send: shutdown to all engines
   wait
```

→ Lifecycle commands defined in `docs/specs/agent/api.md`.

---

## Tool → SDK call map

| Tool | SDK calls used |
|---|---|
| `RunHeadlessScenario` | `scenario.run` |
| `ReplaySnapshot` | `snapshot.load` + `sim.advance` + (optional) `state.patch` |
| `BenchPerfContract` | `bench.run` (or `scenario.run` with perf assertions) |
| `ValidateAgainstSpec` | `rustdoc` (offline) + spec-table parse — no SDK call |

→ Full method tables in `docs/specs/agent/api.md`.

---

## Scenarios as ground truth

Every spec includes a `Test Requirements` section. nexus-coder maps each requirement to one or more scenarios:

```
docs/specs/physics/rigid.md  →  games/demo-fps/scenarios/rigid-stack.toml
                            →  games/demo-fps/scenarios/box-on-plane.toml
                            →  games/demo-fps/scenarios/joint-pendulum.toml
```

`RunHeadlessScenario` is THE pass/fail oracle. Validate sub-workflows always include at least one scenario.

→ Scenario TOML format: `docs/specs/agent/scenarios.md`.

---

## Replay snapshots as regression fixtures

When a scenario fails, the engine captures a snapshot via `snapshot.capture`. nexus-coder stores it in `.nexus/snapshots/<scenario>-<hash>.snap` and references it from the test:

```toml
# games/demo-fps/scenarios/rigid-stack-regression-3a.toml
[setup]
snapshot = ".nexus/snapshots/rigid-stack-snap-3a.snap"

[assert]
at_tick = 600
component."nexus_physics::RigidBody" .linvel.y < 0.01
```

The snapshot replaces "reproduce the bug by clicking around" with `nexus coder bench --replay=...`. → `docs/specs/agent/replay.md`.

Pattern: GGPO save-state as regression fixture, lifted to debugging plane.

---

## Semantic API as high-level affordance

When the architect role drafts a scenario, it often uses the semantic layer:

```
agent prompt:
  "Write a scenario where two dragons fight 100m above the castle, one dies in < 30s."

semantic.parse →
  scene.load "castle.scn"
  entity.spawn "dragon" @ (castle.center + (0,100,0))
  entity.spawn "dragon" @ (castle.center + (50,100,0))
  scenario.assert "alive_count('dragon') == 1 within 30s"
```

The semantic layer translates NL to structured commands the engine understands. nexus-coder uses it for scenario drafting and rapid prototyping; it does **not** use semantic calls in `code.impl` or `validate` workflows (too loose for production code).

→ Semantic layer spec: `docs/specs/agent/semantic.md`.

---

## Determinism contract

Every tool call to the engine is deterministic given `(seed, scenario_or_snapshot, RPC sequence)`. If a result varies between identical calls, that's a bug in the engine (→ `docs/specs/physics/determinism.md` [AGENT: 05]), surfaced as `E_NONDETERMINISTIC`.

nexus-coder relies on this to make:
- `git bisect` over scenarios reliable
- A/B model accuracy comparisons fair
- CI flakes attributable to the model, not the engine

→ AI-first law 5 in `docs/initial/vision.md`.

---

## Telemetry passthrough

The engine emits per-frame structured telemetry (→ `docs/specs/agent/telemetry.md`). The bridge:

1. subscribes to the relevant topics for the scenario,
2. aggregates a summary (`{frame_count, p50_ms, p99_ms, error_count, ...}`),
3. returns it as the tool output,
4. optionally writes the raw stream to `.nexus/runs/<run_id>/engine-telemetry/<task_id>.jsonl` for deep inspection.

nexus-coder's own telemetry (`docs/specs/coder/telemetry.md`) is a separate stream; the two are linked by `task_id` and `run_id`.

---

## Engine version pinning

`Nexus.toml` declares the engine version a game targets. nexus-coder reads this and:

- launches the matching `nexus` binary,
- refuses to operate if the toolchain doesn't have it,
- writes the version into every audit event for reproducibility.

→ `Nexus.toml` spec: `docs/game-template/nexus-toml.md` [AGENT: 15].

---

## Failure modes

| Failure | Surface | Recovery |
|---|---|---|
| Engine OOM mid-scenario | `E_ENGINE_DOWN` from bridge | bridge respawns engine, retries scenario once |
| Engine determinism break | `E_NONDETERMINISTIC` | bridge halts, marks engine slot unhealthy, alarms |
| RPC stall (no telemetry for N ms) | bridge times out, kills engine subprocess | restart, fail tool with `E_TIMEOUT` |
| Scenario file invalid | `E_SCENARIO_NOT_FOUND` or schema error | tool returns to subagent; model can fix scenario |
| Bridge crash | orchestrator notices, restarts bridge, re-queues tasks | clean, deterministic recovery |

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| Bridge RPC dispatch overhead | < 5 ms | < 50 ms |
| Engine cold start | < 500 ms | < 2 s |
| Engine warm scenario run (small scene) | < 1 s | < 5 s |
| Engine memory per instance | < 500 MB idle | < 2 GB |
| Bridge throughput | 500 tool calls/s aggregate | [BENCHMARK NEEDED] |

---

## Integration tests

The coder ↔ engine seam is itself tested. `games/coder-integration/scenarios/*.toml` cover:

- bridge starts K engines successfully
- engine OOM recovery
- determinism: same task → same hash 100 runs
- replay round-trip: capture → load → identical state
- semantic call → expected structured commands

These run in CI as part of the `nexus-merge` gate. → `docs/guides/merge-system.md` [AGENT: 16].

---

## Prior art

- **Bevy `ScheduleRunnerPlugin`** ✓ — headless engine that CI can drive. → `docs/specs/agent/headless.md`.
- **LSP** ✓ — language servers run as subprocesses, JSON-RPC over stdio, multiple clients. We mirror.
- **GGPO** ✓ — save-state primitive as a developer tool, not just a netcode tool.
- **Aider edit-then-test loop** ✓ — make-then-verify is the productivity primitive.
- **Unity Test Runner** ✗ — bolted on, not deterministic, GUI-coupled. What we are replacing.

---

## Open questions

- [DECISION NEEDED] Should the bridge expose its own pool stats as agent-SDK telemetry topic, so `nexus coder ui` shows engine health alongside coder health? Default: yes.
- [DECISION NEEDED] Multi-engine sharded scenario runs (split a long scenario across K engines for speed)? Defer to v1.1.
- [DECISION NEEDED] Snapshot dedup across runs (content-addressed `.nexus/snapshots/`)? Default: yes, sha256-named, GC on age.

---

## Cross-agent flags

- **[AGENT 10]** depends on stable shapes of: `scenario.run`, `snapshot.load`, `sim.advance`, `world.reset`, `bench.run`, `telemetry.subscribe`. Any rename ripples here.
- **[AGENT 14]** owns `docs/contracts/core-agent.md` — rate limits and capability scopes there are the upper bound on what nexus-coder may do.
- **[AGENT 15]** owns `Nexus.toml` version field this spec reads.
- **[AGENT 16]** owns merge gate; nexus-coder produces PRs that pass it.
