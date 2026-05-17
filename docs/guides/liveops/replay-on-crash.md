<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Replay-on-Crash

Every crash uploads a deterministic snapshot + input log. Dev runs `nexus replay <crash-id>` locally and reproduces it.

## Rule

- Engine is deterministic (`→ docs/specs/physics/determinism.md`).
- Replay = last snapshot + input stream since snapshot.
- Snapshot every N seconds (default 30). Input ring buffer always-on.
- Crash handler attaches the ring + most recent snapshot to the envelope.

## Anatomy

```
recording window
|<───── 30s ─────>|<── input ring (always on) ──>| CRASH
                  ↑
                  snapshot S0 (state hash, all components)

replay file (.nrep):
  header { game_version, engine_version, seed, snapshot_id }
  snapshot { ... }
  inputs  [ { tick, source, payload } ... ]
  metadata { crash_envelope_ref }
```

## File format

| Section | Bytes | Notes |
|---------|-------|-------|
| magic   | 4 | `NRPL` |
| version | 2 | u16 |
| flags   | 2 | bit 0: compressed, bit 1: encrypted |
| header  | var | TOML |
| snapshot | var | bincode + zstd |
| inputs  | var | bincode + zstd, framed by tick |
| crc32   | 4 | tail |

`→ docs/specs/agent/replay.md` for snapshot schema.

## Engine config

```toml
[replay]
enabled           = true
snapshot_interval = 30          # seconds
input_ring_size   = 64000       # entries (~3min @ 360Hz)
max_file_bytes    = 4_194_304   # 4 MB cap
compression       = "zstd"
attach_on_crash   = true
attach_on_panic   = true
attach_on_logic_error = false   # opt-in for hard bugs
upload_to         = "${REPLAY_UPLOAD_URL}"    # S3 / MinIO / Sentry attachment
```

## Upload flow

```
crash detected → flush ring + snapshot → write .nrep tempfile
              → encrypt with game public key (optional)
              → upload via signed URL
              → envelope.replay_ref = "replays/01HXYZ.nrep"
```

Encryption: per-game ECDH key in CI secrets. Player's machine encrypts; only dev can decrypt. Prevents accidental save-data leakage.

## Dev command

```bash
nexus replay <crash-id>                 # downloads + opens in headless engine
nexus replay <crash-id> --gui           # opens in editor with playback timeline
nexus replay <crash-id> --bisect        # binary-search inputs to minimal repro
nexus replay <crash-id> --scrub --t=42.3 # jump to specific time
nexus replay <crash-id> --extract-scenario > tests/scenarios/regression_$ID.toml
```

## Minimal repro → scenario

```bash
nexus replay <crash-id> --bisect --emit-scenario tests/scenarios/regression_$ID.toml
nexus test --scenario tests/scenarios/regression_$ID.toml      # should FAIL
# apply fix
nexus test --scenario tests/scenarios/regression_$ID.toml      # should PASS
```

`→ docs/guides/testing/scenarios.md` for scenario format.

## Determinism contract

Replay only works if the engine is deterministic for the recorded subsystems:

| Subsystem | Deterministic? | Notes |
|-----------|---------------|-------|
| ECS scheduler  | yes | seeded execution order |
| Physics        | fixed-point option | `→ docs/specs/physics/determinism.md` |
| Scripting      | yes if pure | flag non-determinism in `Nexus.toml` |
| Rendering      | yes for state; no for visual | replay reproduces state, not screen |
| Networking     | yes via rollback | `→ docs/specs/networking/rollback.md` |
| Audio          | no | excluded from replay |
| RNG            | yes | seed in snapshot |

If a subsystem is non-deterministic, mark `replay_skip = true`. Engine drops it from replay scope.

## Privacy

- Inputs are anonymous (key/button events, not text strings).
- Chat input excluded by default.
- Text-entry inputs scrubbed if `privacy.mode != "permissive"`.
- Replay encrypted in transit + at rest by default.

## Size budget

| Genre | Snapshot | 3-min ring | Compressed |
|-------|----------|------------|------------|
| platformer | 100 KB | 200 KB | 30 KB |
| FPS        | 800 KB | 1.5 MB  | 400 KB |
| RTS        | 4 MB   | 6 MB    | 1.2 MB |
| MMO        | 20 MB  | — (cap)  | 4 MB |

Caps prevent runaway uploads. Truncate oldest inputs if over.

## Smoke test

```bash
nexus replay record --duration=10s --out=/tmp/test.nrep
nexus replay /tmp/test.nrep --verify
```

## Verify

```bash
nexus replay verify <crash-id>            # state-hash matches recording → pass
```

## Rollback

```bash
nexus config set replay.enabled false
NEXUS_REPLAY_DISABLE=1 ./mygame
```

## Cross-links

- `→ docs/specs/agent/replay.md` — snapshot schema, replay engine
- `→ docs/specs/physics/determinism.md`
- `→ docs/guides/testing/scenarios.md` — converted scenario format
- `→ docs/guides/liveops/ai-triage.md` — nexus-coder uses replay
- `→ docs/guides/liveops/crash-to-pr.md`

## References

- GGPO / rollback netcode papers · `https://github.com/pond3r/ggpo/blob/master/doc/README.md`
- Bevy replay discussions · `https://github.com/bevyengine/bevy/issues/8967`
- zstd · `https://facebook.github.io/zstd/`

## Open

- `[DECISION NEEDED]` Replay encryption: ECDH per-game vs symmetric per-player vs none-by-default.
- `[BENCHMARK NEEDED]` Snapshot cost at 4000 entities — target < 5ms.
