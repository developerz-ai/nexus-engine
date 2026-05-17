<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Error Reporting — The Universal Envelope

Engine emits ONE structured envelope. Adapters fan out to Sentry / Bugsnag / GlitchTip / file / stdout.

## Rule

- One envelope per crash, panic, recoverable error, ANR, hang.
- JSON. UTF-8. Schema versioned. Forward-compatible.
- No string-formatted stack traces. Frames are structured.
- PII scrubbing applied before envelope leaves process. `→ docs/guides/liveops/privacy.md`

## Schema (v1)

```json
{
  "schema": "nexus.error/1",
  "event_id": "01HXYZ...",          // ULID
  "ts": "2026-05-17T03:14:15.926Z",
  "level": "error",                  // debug|info|warning|error|fatal
  "kind": "panic",                   // panic|exception|crash|anr|hang|logic|assert
  "fingerprint": ["sha256:..."],     // dedup key — see crash-format.md
  "release": {
    "engine": "nexus@0.7.3",
    "game":   "mygame@1.0.4+build.214",
    "channel": "stable",             // stable|beta|canary|dev
    "commit":  "a1b2c3d"
  },
  "platform": {
    "os": "linux", "os_version": "6.6",
    "arch": "x86_64",
    "gpu": "NVIDIA RTX 4070",
    "driver": "550.78",
    "locale": "en-US"
  },
  "device": {
    "id_hash": "sha256:opaque",       // never raw device id
    "ram_mb": 32768,
    "cpu_cores": 16
  },
  "message": "index out of bounds",
  "exception": {
    "type": "core::panic",
    "value": "index 42 out of bounds (len 10)",
    "module": "nexus_renderer::pass::shadow"
  },
  "stack": [
    { "fn": "shadow::cascade_split", "file": "renderer/pass/shadow.rs",
      "line": 142, "col": 18, "in_app": true,
      "addr": "0x7ffe...", "symbol_status": "resolved" }
  ],
  "breadcrumbs": [                   // last N events leading to crash
    { "ts": "...", "cat": "input", "msg": "MouseClick(412,210)" },
    { "ts": "...", "cat": "scene", "msg": "spawn(dragon)" }
  ],
  "context": {
    "scene": "level_3",
    "entity_count": 4812,
    "frame_time_ms": 18.4,
    "render_pass": "shadow"
  },
  "tags": { "genre": "rpg", "style": "pbr", "build_type": "release" },
  "replay_ref": "replays/01HXYZ.nrep",  // → docs/specs/agent/replay.md
  "telemetry_ref": "traces/01HXYZ"      // → docs/guides/liveops/telemetry-pipeline.md
}
```

## Field rules

| Field | Required | Notes |
|-------|----------|-------|
| `schema` | yes | Pin version. Adapters refuse unknown majors. |
| `event_id` | yes | ULID. Sortable. |
| `fingerprint` | yes | Drives dedup. `→ docs/guides/liveops/crash-format.md` |
| `release.commit` | yes | Symbolication key. `→ docs/guides/liveops/symbol-upload.md` |
| `stack` | for panic/crash/exception | Structured frames only. |
| `replay_ref` | when available | Empty if replay-on-crash disabled. |
| `breadcrumbs` | recommended | Ring buffer, default 100 entries. |

## Adapter table

| Target | Maps to | Notes |
|--------|---------|-------|
| Sentry | `/api/<id>/store/` | Direct field map; `exception` → Sentry exception interface. |
| GlitchTip | Sentry wire format | Drop-in for Sentry SDK URL. |
| Bugsnag | `/notify` payload v5 | `release.channel` → `releaseStage`. |
| stdout | NDJSON | Default for dev. |
| File | rotating NDJSON | `--errors-to=./crashes/` |
| OTel | `Span.Event` + `exception.*` | Semconv compliant. |

## Engine API (Rust signature)

```rust
nexus::diag::report(Error::new()
    .kind(Kind::Logic)
    .level(Level::Error)
    .message("inventory overflow")
    .context("entity", entity_id)
    .tag("genre", "rpg")
    .attach_replay()        // captures last N seconds
    .send());
```

Panics are auto-captured via `panic_handler`. SIGSEGV / SIGABRT / EXCEPTION_ACCESS_VIOLATION captured by crashpad. `→ docs/guides/liveops/crash-format.md`

## Smoke test

```bash
nexus diag emit --kind=panic --release=test --to=stdout
nexus diag emit --kind=panic --to=sentry --dsn=$SENTRY_DSN
nexus diag verify --event-id=$ID   # round-trip the envelope back
```

## Rollback

```bash
NEXUS_DIAG_DISABLE=1 ./mygame        # kill switch (env)
nexus config set diag.enabled false  # persistent
```

Kill switch must never crash the game. Drop-on-error semantics.

## Cross-links

- `→ docs/guides/liveops/sentry.md` · `→ docs/guides/liveops/bugsnag.md` · `→ docs/guides/liveops/glitchtip.md`
- `→ docs/guides/liveops/symbol-upload.md` · `→ docs/guides/liveops/privacy.md`
- `→ docs/specs/agent/telemetry.md` (telemetry schema)

## References

- Sentry Envelope · `https://develop.sentry.dev/sdk/envelopes/`
- Bugsnag Notify API v5 · `https://docs.bugsnag.com/api/error-reporting/`
- OTel exception semconv · `https://opentelemetry.io/docs/specs/semconv/exceptions/`
- ULID · `https://github.com/ulid/spec`

## Open

- `[DECISION NEEDED]` breadcrumb ring buffer size default — 100 vs 256.
- `[DECISION NEEDED]` envelope max size on mobile — current target 64 KB compressed.
