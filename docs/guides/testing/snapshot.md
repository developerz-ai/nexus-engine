<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Snapshot & Replay Tests

Deterministic capture → store → diff → bisect.

Spec: → `docs/specs/agent/replay.md` (Agent 10). This file = the testing conventions around it.

## Two kinds of "snapshot"

| Kind | Scope | Tool | Use |
|------|-------|------|-----|
| **Serialization snapshot** | one struct → bytes | `insta` (Rust) · vitest snapshot · `syrupy` (Python) | catch unintended API/format change |
| **Replay snapshot** | full engine state at a frame | engine native (`nexus.replay/v1`) | regression-test simulation correctness |

The engine treats both as first-class. Different storage, same review workflow.

## Serialization snapshots

Use sparingly. Snapshot only data shapes that are **contracts**:
- public RPC payloads (`docs/specs/agent/api.md`)
- save-game file format
- universal error JSON (`docs/guides/coding-style/errors.md`)
- telemetry event schemas
- TOML→Rust deserialization

Rust (`insta`):

```rust
use insta::assert_json_snapshot;

#[test]
fn spawn_request_serializes_to_v1() {
    let req = SpawnRequest { archetype: "Player".into(), at: Vec3::ZERO };
    assert_json_snapshot!(req);
}
```

Files committed to `crates/<crate>/snapshots/*.snap`. Reviewed like source code.

Update workflow:

```bash
cargo insta review        # interactive accept/reject
cargo insta accept        # blanket accept (PR description must justify)
```

CI runs `INSTA_UPDATE=no cargo nextest run`. Mismatches fail.

TypeScript (`vitest`):

```ts
expect(req).toMatchSnapshot();
```

Python (`syrupy`):

```python
def test_request(snapshot):
    assert request.to_json() == snapshot
```

### Snapshot policy

| Rule | |
|------|--|
| Snapshot only contracts | otherwise = locked-in bugs |
| Review every snapshot diff manually | snapshots are diff-noise traps |
| Never auto-accept on CI | review = human or AI maintainer judgement |
| Include schema version in the snapshot key | breaking changes get new snapshot, old stays |
| One snapshot file per concept | parseable, greppable |

## Replay snapshots

Engine-native binary format. Captures: initial state, input sequence, RNG seed, scenario steps, telemetry events.

```
out/scenarios/render/empty-frame.replay
  ├─ header (schema = "nexus.replay/v1")
  ├─ initial state (gzip JSON)
  ├─ input stream (binary)
  ├─ telemetry stream (binary)
  └─ assertion log
```

→ `docs/specs/agent/replay.md` for byte format.

## Capture

Two paths:

1. **Scenario run** captures automatically. Every `nexus run --scenario` writes a `.replay`. → `scenarios.md`.
2. **Live record** captures from a running engine:

```bash
nexus record --output out/sessions/$(date +%Y%m%d-%H%M).replay
# play, then Ctrl-C; replay is written
```

In-engine via API:

```rust
let mut recorder = engine.start_recording(path)?;
engine.run_frames(60)?;
recorder.finish()?;
```

## Replay

```bash
nexus replay out/scenarios/render/empty-frame.replay         # interactive playback
nexus replay --check out/scenarios/render/empty-frame.replay # headless; pass/fail
nexus replay --check --tolerance gpu out/...                 # allow rendering wobble (visual.md)
```

`--check`:
1. Loads initial state.
2. Re-runs every step with the recorded inputs + same seed.
3. Compares frame-by-frame telemetry against captured stream.
4. Exits non-zero on first divergence; emits structured JSON locating it.

Output:

```json
{
  "replay": "out/scenarios/render/empty-frame.replay",
  "status": "fail",
  "diverged_at_frame": 17,
  "first_diff": {
    "path": "world.entities.Player[0].position.y",
    "expected": 1.234,
    "actual": 1.241,
    "delta": 0.007
  },
  "system_suspect": "physics.rigid"
}
```

`system_suspect` = the system whose telemetry first diverged.

## Bisect

```bash
nexus replay --bisect out/scenarios/render/empty-frame.replay \
  --good v0.5.0 --bad HEAD
```

Drives `git bisect` using `nexus replay --check` as the test command. Output is a single commit SHA + diff hunk.

## Patch variables

Replays can be re-run with one variable mutated, to ask "what if?":

```bash
nexus replay --patch 'world.gravity = -19.6' out/sessions/...replay
```

Useful for game-balance regression tests: "lower gravity, does the death curve change as expected?".

## Use cases

| Scenario | Tool |
|----------|------|
| "Did this PR change collision results?" | `nexus replay --check` on the regression suite |
| "When did this AI behavior break?" | `nexus replay --bisect` |
| "Can I reproduce that crash from a player report?" | player's `.replay` → `nexus replay` |
| "How does X scale with N enemies?" | `nexus replay --patch 'enemy_count=N'` over a sweep |
| "Are saves backwards-compatible?" | last release's `.replay` against current binary |

## CI gate

Engine ships a curated replay suite under `crates/nexus-test/replays/`. CI runs:

```bash
nexus replay --check crates/nexus-test/replays/
```

Fail = block merge. Replay-suite delta requires an ADR-style PR justification.

Game template ships `<game>/replays/` and runs the same on game CI.

## Storage

| Replay class | Where | Retention |
|--------------|-------|-----------|
| Per-scenario | `out/scenarios/` | per-run, artifact upload |
| Curated regression | `crates/nexus-test/replays/` | git LFS, forever |
| Player crash reports | object storage | 90 days |
| Bisect cache | `target/replay-cache/` | local only |

LFS for binary replays. Schema-versioned filenames (`*.v1.replay`) — old schema preserved by version when format bumps.

## Hard rules

| Rule | |
|------|--|
| Replays are deterministic. A non-determinism finding = engine bug. | → `docs/architecture/01-principles.md` law #9 |
| Replay schema is versioned. Old replays still load via migration. | `replay-migrate <in> <out>` |
| Curated suite never edited by hand. Always re-recorded then PR'd with diff. | review snapshot diff |
| `--check` runs headless, on CPU GPU backend. | → `visual.md` for pixel checks |
| `--tolerance` flags are explicit, not implicit. | strict by default |
| Player-submitted replays never run with elevated capabilities. | sandboxed |

## Forbidden

| Pattern | Why |
|---------|-----|
| Hand-editing `.replay` binaries | corrupts schema |
| Snapshotting log lines verbatim | format drift = noise |
| Snapshotting timestamps | fuzz with `redactions` |
| Storing replays outside LFS | bloats repo |
| Tolerance > 1% without ticket | hides drift |
| `cargo insta accept` without manual review | snapshot rot |

## Cross-link

- → `docs/specs/agent/replay.md` (binary format)
- → `docs/specs/agent/telemetry.md` (capture source)
- → `scenarios.md` (scenarios produce replays)
- → `visual.md` (pixel-diff replays)
- → `network.md` (rollback replays)
- → `docs/guides/coding-style/dependencies.md` (insta, syrupy versions)
