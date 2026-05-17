<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Test Harness

> Test a mod with scenarios, replay snapshots, and headless boot. Reuses `docs/specs/agent/scenarios.md`. Same primitives as engine tests.

## Why

Engine is deterministic + headless-bootable. Mods inherit both. A mod can be tested at full speed, in CI, without a display, with assertions on world state and telemetry.

## Layout

```
mymod/
├── scenarios/
│   ├── smoke.toml             ← boot + load
│   ├── new_weapon.toml        ← exercise the new weapon
│   ├── balance.toml           ← stat-change verification
│   ├── perf-1000-ents.toml   ← perf assertion
│   └── regression/
│       └── issue-42.toml      ← regression for a known bug
```

Each `.toml` is self-contained (→ `docs/specs/agent/scenarios.md`).

## Minimal Scenario

```toml
[scenario]
name = "Smoke: mod loads and emits init log"
id   = "com.you.mycoolmod.smoke"
description = "Loads the mod against the FPS demo, checks no error events."
tags = ["smoke"]
timeout-ms = 5000
seed = 1
tick-rate = 60

[setup]
mods = ["com.you.mycoolmod@workspace"]    # use working copy
scene = "scenes/empty.scn"

[[step]]
ticks = 60                                  # let mod init run

[[assert]]
kind = "event-emitted"
name = "mycoolmod.ready"
times = 1

[[assert]]
kind = "no-errors"
codes = ["SCRIPT_*", "CAP_*", "MOD_*"]
```

## Running

```
nexus mod test                            # all scenarios in scenarios/
nexus mod test smoke.toml                 # one
nexus mod test --tag perf                 # by tag
nexus mod test --json                     # machine-readable result
nexus mod test --replay-on-fail           # capture .nexus-replay
```

CI:
```yaml
- run: nexus mod pack
- run: nexus mod test --json > results.json
- if: failure()
  run: ls test-results/*.nexus-replay
```

## Cap Granting in Tests

Test runner can grant caps non-interactively (otherwise the consent dialog would block):

```toml
[setup.caps]
"com.you.mycoolmod" = {
  world.read = ["Health", "Input"],
  world.write = ["Health"],
  events.emit = ["mycoolmod.ready"],
}
```

If a manifest cap is missing from `[setup.caps]`, the runner falls back to "grant exactly what manifest requests" so the mod sees its declared environment.

## Replay Capture

A scenario fail can auto-capture a `.nexus-replay` (→ `docs/specs/agent/replay.md`). Replays are deterministic; reopen them in the editor or via `nexus agent replay file.nexus-replay --frame N` to step through.

Useful for sharing regressions: paste replay file + scenario reproduces 1-to-1 on any machine.

## Assertion Kinds (mod-relevant)

| Kind | Asserts |
|---|---|
| `entity-count` | N entities with given components exist |
| `component-value` | Specific entity's component field equals X |
| `event-emitted` | Event with name X emitted N times |
| `no-errors` | No structured errors matching code globs |
| `telemetry-bound` | A telemetry counter stays within range (e.g., `cpu_us_p95 < 100`) |
| `cap-not-denied` | None of the listed caps returned `CAP_DENIED` |
| `replay-deterministic` | Re-running the same scenario yields byte-identical snapshot |
| `save-loads` | Save written then loaded successfully |
| `multiplayer-sync` | Spin two clients; mod-set negotiation succeeds |

Full list in `docs/specs/agent/scenarios.md`.

## Perf Assertions

```toml
[[assert]]
kind = "telemetry-bound"
metric = "mod.cpu_us_p95"
mod_id = "com.you.mycoolmod"
max = 200
```

Fails if your mod blows past the per-frame budget. → `perf.md`.

## Property / Fuzz Tests

```
nexus mod test --fuzz scenarios/new_weapon.toml --runs 10000 --seed-range 1..10000
```

Runs the scenario across N seeds, looking for assertion failures or panics. Crash reproducer auto-saved on first fail.

## Multiplayer Tests

```toml
[scenario]
multiplayer = true
peers = 2

[setup.server.mods]
required = ["com.you.mycoolmod@workspace"]

[setup.peer.1.mods]
installed = ["com.you.mycoolmod@workspace"]

[setup.peer.2.mods]
installed = ["com.you.mycoolmod@workspace"]
```

Runner spins headless server + N peer sims; runs all peers in one process; asserts state convergence.

## Snapshot Testing

A scenario can assert against a stored snapshot (`scenarios/snapshots/<id>.json`):

```toml
[[assert]]
kind = "snapshot-match"
file = "snapshots/com.you.mycoolmod.smoke.json"
fields = ["world.entities.*.Health.hp", "world.events_emitted_by_name.mycoolmod.*"]
```

Update snapshots with `nexus mod test --update-snapshots`.

## Coverage

```
nexus mod test --coverage
```

Reports per-`.rn`-file branch coverage; aggregated to `target/coverage/mod-coverage.html`.

## Integration with CI

Standard GH Actions snippet shipped in templates:

```yaml
name: mod-ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: nexus mod pack
      - run: nexus mod verify target/*.nxmod
      - run: nexus mod test --json > results.json
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: replays
          path: test-results/**/*.nexus-replay
```

## Pitfalls

- Wall-clock time in scenarios: never; use sim time (engine handles).
- Threading races: sandbox is single-threaded per mod; race tests are about ordering across mods.
- Asset hashes can drift if a dep mod's bytes change; pin dep versions in `[setup.mods]`.

## Cross-Links

- → `docs/specs/agent/scenarios.md` — canonical schema.
- → `docs/specs/agent/replay.md` — capture/replay.
- → `docs/specs/agent/headless.md` — headless boot mechanics.
- → `perf.md` — perf-test patterns.
- → `debugging.md` — when tests fail.
- → `editor.md` — test panel in the editor.
