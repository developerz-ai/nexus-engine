<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Sentry Integration

SaaS or self-host. Sentry-wire is the de-facto crash format. Engine ships a first-party adapter.

## Prerequisites

- Sentry org + project (or self-hosted Sentry / GlitchTip).
- DSN: `https://<key>@<host>/<project_id>`.
- Auth token with `project:releases`, `org:read` for source-map upload.

## Install — engine adapter

```bash
nexus add observability sentry          # adds nexus-diag-sentry to Cargo.toml
```

`Nexus.toml`:

```toml
[diag.sentry]
dsn      = "${SENTRY_DSN}"               # never hard-code
environment = "${NEXUS_CHANNEL}"         # dev|beta|canary|stable
release  = "${GAME_NAME}@${GAME_VERSION}+${BUILD_SHA}"
traces_sample_rate = 0.05                # perf traces
profiles_sample_rate = 0.01
send_default_pii = false                 # never true. → privacy.md
attach_stacktrace = true
max_breadcrumbs = 100
before_send = "scripts/diag/scrub.lua"   # PII scrub hook
```

## SDK per platform

| Platform | SDK | Notes |
|----------|-----|-------|
| Native (Linux/Win/Mac) | nexus-diag-sentry (Rust, sentry-rust) | Auto panic + signal hook |
| Android | nexus-diag-sentry-android (sentry-java AAR) | ANR detection on; capture proguard mapping |
| iOS | nexus-diag-sentry-ios (sentry-cocoa xcframework) | App hangs on, dSYM upload |
| Web (WASM) | nexus-diag-sentry-web (sentry-javascript) | Source maps required |
| Console | n/a — use file sink, fan-in from store telemetry |

## Source-map / symbol upload

```bash
# CI step, after build, before publish
sentry-cli releases new          "$RELEASE"
sentry-cli releases set-commits  "$RELEASE" --auto
sentry-cli debug-files upload    --include-sources target/release/
sentry-cli sourcemaps upload     --release "$RELEASE" web/dist/
sentry-cli releases finalize     "$RELEASE"
sentry-cli releases deploys "$RELEASE" new -e "$NEXUS_CHANNEL"
```

`→ docs/guides/liveops/symbol-upload.md` for the per-platform matrix.

## Release tagging

Release ID format: `<game>@<semver>+<build_sha>`. Must match the `release.commit` in the envelope. Mismatched releases never symbolicate.

## Performance traces

Engine spans:

| Span | Op | When |
|------|-----|------|
| `frame` | `game.frame` | every frame, sampled |
| `render.pass.<name>` | `gpu.pass` | per render pass |
| `physics.step` | `physics.step` | per fixed tick |
| `script.tick` | `script.tick` | per scripted system |
| `asset.load.<id>` | `asset.load` | on load |

Sample at 5% global. Always-on for `level >= error`.

## Smoke test

```bash
nexus diag emit --kind=panic --to=sentry --dsn="$SENTRY_DSN"
# expect event_id printed; appears in Sentry UI within 30s
```

## Verify

```bash
sentry-cli events list --project "$PROJ" --query "release:$RELEASE" | head -5
nexus diag verify --release "$RELEASE"   # checks debug files resolved
```

## Rollback

```bash
nexus config set diag.sentry.enabled false   # disables fan-out
# or rotate DSN to /dev/null sink
nexus config set diag.sentry.dsn ""
```

## Cost

| Tier | Events/mo | Cost |
|------|-----------|------|
| Sentry Dev | 5k | $0 |
| Sentry Team | 50k | $26 |
| Sentry Business | 100k+ | $80+ |
| Self-host | unlimited | infra only |

For OSS games: self-host or **GlitchTip** (`→ glitchtip.md`) — wire-compatible, MIT-aligned.

## Cross-links

- `→ docs/guides/liveops/error-reporting.md` — envelope schema
- `→ docs/guides/liveops/symbol-upload.md` — debug files
- `→ docs/guides/liveops/glitchtip.md` — drop-in OSS alternative
- `→ docs/guides/deploy/observability.md`

## References

- Sentry docs · `https://docs.sentry.io/`
- sentry-cli · `https://docs.sentry.io/cli/`
- Sentry envelope spec · `https://develop.sentry.dev/sdk/envelopes/`
- sentry-rust · `https://github.com/getsentry/sentry-rust`

## Open

- `[VERIFY — provider policy changes]` Sentry SaaS pricing reviewed quarterly.
