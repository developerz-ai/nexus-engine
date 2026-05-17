<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — Snapshot & Replay

> Deterministic capture, restore, replay, patch, and bisect of any engine state. The single feature that makes AI-driven debugging tractable: any failure is reproducible and walkable.

## Boundaries

- **Owns:** snapshot serialization, snapshot store, input log recorder/player, replay loop driver, bisect harness, snapshot diff.
- **Does NOT own:** per-system serialization (each system provides its own `Serialize`/`Deserialize` impl — contract enforced), deterministic physics (→ `docs/specs/physics/determinism.md` [AGENT: 05]).
- **Depends on:** ECS reflection (→ `docs/specs/core/ecs.md` [AGENT: 02]), HAL clock (→ `docs/specs/core/hal.md`), RPC notifications (→ `api.md`), telemetry recording (→ `telemetry.md`).

## Why

A traditional debugger needs a human at a breakpoint. An AI agent needs a snapshot file, an input log, and the ability to time-travel. Snapshot/replay turns a stochastic-looking bug ("the dragon disappears sometimes") into a reproducible byte-for-byte sequence, and gives the agent the power to bisect: which tick exactly did the bug introduce itself.

Snapshot/replay also enables:

- Multiplayer rollback (→ `docs/specs/networking/rollback.md` [AGENT: 07])
- Save games (game-template responsibility, → `docs/game-template/structure.md` [AGENT: 15])
- Scenario regression packs (→ `scenarios.md`)
- "What-if" exploration: snapshot, patch a variable, run forward, observe.

## Determinism Contract

Replay correctness rests on: **same engine version + same snapshot + same input log → byte-identical resulting snapshot at every tick.**

This requires:

| Requirement | Owner |
|---|---|
| Fixed timestep | runtime + physics |
| Deterministic physics solver | → `docs/specs/physics/determinism.md` [AGENT: 05] |
| Seeded RNG (every system uses engine-provided RNG) | core |
| No wall-clock reads in sim code | HAL |
| Sorted iteration order for parallel writes | ECS scheduler [AGENT: 02] |
| Deterministic floating point (no `-ffast-math`, no SIMD reorder) | build config |
| Asset binary identity (same UUID → same bytes) | → `docs/specs/assets/registry.md` [AGENT: 09] |

A determinism violation MUST raise `-32010 DETERMINISM_BROKEN` immediately when detected by replay-verify. This is a P0 bug class.

## Snapshot Format

```
┌────────────────────────────────────────────────────────┐
│  Snapshot file (.snap)                                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Header (fixed, 256 bytes)                        │  │
│  │   magic "NXS1"                                   │  │
│  │   format version (u16)                           │  │
│  │   engine version (string, 32B)                   │  │
│  │   tick (u64)                                     │  │
│  │   seed (u64)                                     │  │
│  │   scene id (uuid)                                │  │
│  │   timestamp (u64, unix ns)                       │  │
│  │   payload offset (u64)                           │  │
│  │   payload length (u64)                           │  │
│  │   payload sha256 (32B)                           │  │
│  │   compression (enum: none|zstd|lz4)              │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Section table                                    │  │
│  │   [ section: name, offset, length, sha256 ]      │  │
│  │     "ecs.entities"                               │  │
│  │     "ecs.resources"                              │  │
│  │     "physics.world"                              │  │
│  │     "audio.state"                                │  │
│  │     "scripting.vm"                               │  │
│  │     "rng.streams"                                │  │
│  │     "agent.state"                                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Section payloads (binary, optionally compressed) │  │
│  │ Each system writes its own bytes; format is its  │  │
│  │ private concern but MUST be deterministic.       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Two encodings:

| Format | Use | Cost |
|---|---|---|
| `binary` (default) | snapshots, replay, save games | compact, fastest |
| `json` | agent inspection, diffs, debugging | larger, human/AI readable |

`snapshot.export { format:"json" }` produces a structured tree:

```jsonc
{
  "header": { "tick": 1234, "seed": 42, "engine": "0.1.0", "scene": "..." },
  "sections": {
    "ecs.entities": [ { "id":"e0...001", "components": { ... } }, ... ],
    "ecs.resources": { "Gravity": [0,-9.81,0], ... },
    "physics.world": { "bodies": [...], "joints": [...] },
    "rng.streams": { "main": "0xdeadbeef...", "ai":"0x..." },
    "agent.state": { "subscriptions": [...] }
  }
}
```

## Input Log Format

Newline-delimited JSON, parallel to telemetry log:

```
{"v":1,"engine":"0.1.0","seed":42,"snapshotId":"snap_root_abc"}
{"tick":0,"inputs":[]}
{"tick":1,"inputs":[{"src":"agent","method":"entity.spawn","params":{...}}]}
{"tick":2,"inputs":[{"src":"player","device":"keyboard","keys":["W"]}]}
...
```

`src` is one of `agent` (RPC call), `player` (input device), `script` (script-triggered side effect captured for replay), `network` (remote peer input).

The input log + initial snapshot is sufficient to recreate any tick.

## API

### Capture / Restore

| Method | Notes |
|---|---|
| `snapshot.capture { format? }` | Returns `{ snapshotId, bytes, sha256 }`. In-memory store. |
| `snapshot.restore { snapshotId }` | Replaces world state. Tick counter resumes from snapshot tick. |
| `snapshot.export { snapshotId, path, format? }` | Writes to disk. |
| `snapshot.import { path }` | Loads into store, returns `snapshotId`. |
| `snapshot.list { }` | Enumerate in-memory snapshots. |
| `snapshot.drop { snapshotId }` | Free memory. |
| `snapshot.diff { a, b, sections? }` | Returns structured diff. |
| `snapshot.patch { snapshotId, patches }` | Apply JSON-Patch (RFC 6902) on the json form. |

### Replay

| Method | Notes |
|---|---|
| `replay.start { snapshotId, inputLog?, speed?, verify? }` | Begin replay. `verify=true` halts on any divergence. |
| `replay.stop { replayId }` | |
| `replay.pause { replayId }` | |
| `replay.seek { replayId, tick }` | Replay forward to a tick (rewinds to nearest prior snapshot first). |
| `replay.bisect { snapshotId, inputLog, predicate, range }` | Binary search for first tick predicate becomes true. |
| `replay.verify { snapshotId, inputLog, expectedFinal }` | Run input log, compare to expected snapshot. |

### Snapshot Diff Schema

```jsonc
{
  "a": "snap_001",
  "b": "snap_002",
  "tickDelta": 60,
  "summary": {
    "entitiesAdded":   2,
    "entitiesRemoved": 1,
    "entitiesChanged": 14,
    "resourcesChanged": 1
  },
  "entities": {
    "added":   ["e0...0a1", "e0...0a2"],
    "removed": ["e0...0b3"],
    "changed": [
      { "id":"e0...001",
        "components": {
          "Transform": { "pos": { "from":[0,5,0], "to":[0,2.1,0] } },
          "Velocity":  { "y":   { "from":-5.4,   "to":-7.8 } }
        } }
    ]
  },
  "resources": {
    "RNG.main": { "from":"0xabc", "to":"0xdef" }
  }
}
```

### Bisect

The killer feature for AI debugging. Given a snapshot at tick 0 and an input log running to tick 10000, "find the first tick at which X breaks":

```jsonc
// replay.bisect
{
  "snapshotId": "snap_root",
  "inputLog":   "logs/run-2026-05-17.ndjson",
  "predicate":  { "telemetry": "ecs.counts.entities", "op": "<", "value": 100 },
  "range":      { "from": 0, "to": 10000 }
}

// → result
{
  "found": true,
  "tick": 3142,
  "snapshotIds": {
    "before": "snap_b_3141",
    "after":  "snap_a_3142"
  },
  "predicateAt": { "before": false, "after": true },
  "iterationsRun": 14,
  "durationMs": 1820
}
```

Algorithm:

```
range = [from, to]
while range not collapsed:
    mid = (from + to) / 2
    restore(snapshot_root)
    replay inputLog ticks from snapshot_root.tick to mid
    capture snap_mid
    if predicate(snap_mid):
        to = mid
    else:
        from = mid + 1
return from
```

Cost: `O(log N * replay_cost_to_mid)`. With cached intermediate snapshots every K ticks, this becomes near-`O(log N)`.

### Patch & What-If

```jsonc
{
  "method": "snapshot.patch",
  "params": {
    "snapshotId": "snap_001",
    "patches": [
      { "op":"replace", "path":"/sections/ecs.resources/Gravity",      "value":[0,-1.0,0] },
      { "op":"replace", "path":"/sections/ecs.entities/e0...001/components/Health/current", "value":1 }
    ]
  }
}
// → { "snapshotId": "snap_002" }    (new snapshot, original untouched)
```

Then `replay.start` from the new snapshot to observe a different timeline. Patches act on the JSON form; the runtime re-serializes to binary internally.

## Replay Timeline (ASCII)

```
record:
  tick:  0────10────20────30────40────50────60────70────80────90
                                                                ▲
  snap:  S0                                                     │
                                                                │  capture S1
  input: ████████████████████████████████████████████████████████  (input log)

replay:
  start: S0 ──► tick 0
  feed inputs ──►   ─────────────────────────────────────────►
  emit  ──►  telemetry stream replays identically
  verify: at any tick T, snapshot(T) == recorded snapshot(T) ?
                                                            (else -32010)

bisect:
  S0 ──► tick 0
  ├── replay to 45 ── capture ── check predicate (false)
  │     └── replay to 67 ── capture ── check predicate (true)
  │           └── replay to 56 ── capture ── check predicate (false)
  │                 └── replay to 61 ── ... (collapse to single tick)
  └── O(log N) cycles
```

## Storage Backend

| Backend | When |
|---|---|
| In-memory (default) | Snapshots created in a session; lost on shutdown. |
| Disk (`workspace/.nexus/snapshots/`) | `snapshot.export`; auto-cleaned per retention. |
| Content-addressed | `snapshotId = "sha256-" + hex(payload_sha256)` for dedup. |

Retention: default 100 in-memory snapshots; LRU eviction. Configurable via `--snapshot-buffer N`.

## Integration with Networking

The same snapshot machinery powers rollback netcode. Networking pins a snapshot every K ticks and restores on input correction. Contract:

| Surface | Used by | Notes |
|---|---|---|
| `snapshot.capture(binary)` | rollback | < 10 ms target for 10k entities |
| `snapshot.restore` | rollback | < 5 ms |
| `replay.start(verify:false)` | rollback | resimulate K ticks |

→ `docs/specs/networking/rollback.md` [AGENT: 07]
→ `docs/contracts/core-networking.md` [AGENT: 14]

## Performance Contract

| Operation | Target | Hard limit |
|---|---|---|
| `snapshot.capture` (1k entities, binary) | < 2 ms | < 10 ms |
| `snapshot.capture` (10k entities, binary) | < 10 ms | < 50 ms [BENCHMARK NEEDED] |
| `snapshot.restore` (10k entities) | < 5 ms | < 30 ms |
| Snapshot file size (10k entities, binary+zstd) | < 1 MB | < 10 MB |
| `snapshot.diff` (two 10k snapshots) | < 50 ms | < 500 ms |
| `replay.bisect` (10k-tick log, fast predicate) | < 5 s | < 30 s |

## Error Contract

| Code | `data.code` | Meaning | Caller action |
|---|---|---|---|
| -32007 | `SNAPSHOT_INCOMPATIBLE` | Engine version / format mismatch | Re-record or run migration. |
| -32020 | `SNAPSHOT_NOT_FOUND` | Unknown id | `snapshot.list`. |
| -32021 | `SNAPSHOT_CORRUPT` | Header/section sha mismatch | File damaged. |
| -32022 | `INPUT_LOG_INVALID` | Format error | Validate with `nexus replay validate`. |
| -32010 | `DETERMINISM_BROKEN` | Replay diverged | Capture both snapshots, file bug. |
| -32023 | `BISECT_NO_TRANSITION` | Predicate never changes | Widen range or fix predicate. |
| -32024 | `PATCH_FAILED` | JSON-Patch op invalid | Inspect `data.failingOp`. |

## Test Requirements

- `snapshot.capture` then `snapshot.restore` on the same world is a no-op (byte-identical state).
- Capturing, mutating, restoring undoes the mutation.
- Record a 600-tick run with `--record`; replay it twice; both replays end at byte-identical snapshots.
- A scripted divergence (e.g. wall-clock read in user code) triggers `-32010` within one tick.
- `snapshot.diff(A, A) = empty diff`.
- `replay.bisect` with predicate that is always false returns `BISECT_NO_TRANSITION`.
- Patch + replay yields a different final state than unpatched replay.
- Snapshot file written on Linux replays identically on Windows and macOS [BENCHMARK NEEDED].

## Cross-references

- → `docs/specs/agent/api.md` — `snapshot.*` and `replay.*` RPCs
- → `docs/specs/agent/scenarios.md` — regression packs include snapshot + input log
- → `docs/specs/agent/headless.md` — `--record` and `--replay` flags
- → `docs/specs/agent/telemetry.md` — telemetry log format for replay
- → `docs/specs/core/ecs.md` — reflection / serialization contract [AGENT: 02]
- → `docs/specs/physics/determinism.md` — fixed-step determinism [AGENT: 05]
- → `docs/specs/networking/rollback.md` — netcode reuse [AGENT: 07]
- → `docs/contracts/core-agent.md` — what each system MUST serialize [AGENT: 14]

## Prior Art

- **GGPO** ✓ — save-state + resimulate as the foundation. We make the offline / RPC-driven variant of the same idea.
- **rr (Mozilla)** ✓ — deterministic replay of native programs. Validates that record-once-replay-many is tractable at production scale.
- **Quake demos / Source replays** ✓ — input log + initial state has been the way for 30 years; we adopt the model and structure it.
- **Bevy reflect / serde** ✓ — reflection-driven snapshotting is feasible; pattern we follow.
- **Time-travel debuggers (rr, WinDbg TTD, replayed.io)** ✓ — bisect is the natural superpower; we expose it as a single RPC.
- **JSON Patch (RFC 6902)** ✓ — standard, machine-friendly, what-if surface.

## Open Questions

- [DECISION NEEDED] Snapshot format versioning policy: how many old formats do we keep readable? Suggest: last two MINOR versions.
- [DECISION NEEDED] Granular snapshot — `snapshot.capture { sections: ["ecs.entities"] }`. Useful for fast partial reverts; complicates restore semantics.
- [DECISION NEEDED] Sub-tick snapshots (for VR / 240Hz)? Punt to v1.1.
- [BENCHMARK NEEDED] Compression ratio: zstd vs lz4 across representative scenes.
- [DECISION NEEDED] Cross-platform float determinism strategy. Fixed-point shadow for physics is in `docs/specs/physics/determinism.md` — does agent require a flag to enforce same for game logic?
