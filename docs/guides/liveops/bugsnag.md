<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Bugsnag Integration

Bugsnag for studios already on SmartBear. Adapter maps envelope → Notify API v5.

## Prerequisites

- Bugsnag project + API key.
- For mobile: upload tokens for proguard mappings / dSYMs.

## Install

```bash
nexus add observability bugsnag
```

`Nexus.toml`:

```toml
[diag.bugsnag]
api_key      = "${BUGSNAG_API_KEY}"
release_stage = "${NEXUS_CHANNEL}"        # dev|beta|canary|stable|production
app_version  = "${GAME_VERSION}"
app_type     = "game"
enabled_release_stages = ["beta","canary","stable","production"]
auto_track_sessions = true
max_breadcrumbs = 50
send_threads = "unhandled"                # all|unhandled|never
```

## Release-stage discipline

| Stage | Bugsnag `releaseStage` | Filtering |
|-------|------------------------|-----------|
| dev   | `dev`                  | Drop unless `NEXUS_DIAG_FORCE=1` |
| beta  | `beta`                 | Send all |
| canary| `canary`               | Send all + page on spike |
| stable| `production`           | Send all + SLO alerts |

Stages drive Bugsnag's stability score and crash-free-users charts.

## App hangs (iOS / macOS)

Threshold: main-thread block > 2s = `appHang` event.

```toml
[diag.bugsnag.app_hangs]
enabled = true
threshold_ms = 2000
fatal_threshold_ms = 6000
```

## ANR (Android)

Android Application Not Responding — main thread blocked > 5s.

```toml
[diag.bugsnag.anr]
enabled = true
report_unhandled_anrs = true
```

Engine renderer + script tick run off the UI thread → ANRs almost always indicate a binder/IPC stall or JNI deadlock. Capture full thread dump on detection.

## Symbol upload

```bash
# Android (Proguard / R8)
bugsnag-cli upload android-proguard --api-key=$KEY \
  --version-name=$VER --version-code=$CODE \
  build/outputs/mapping/release/mapping.txt

# iOS (dSYM)
bugsnag-cli upload xcode-archive --api-key=$KEY $ARCHIVE_PATH

# Web (source maps)
bugsnag-cli upload js --api-key=$KEY \
  --version-name=$VER web/dist/

# Native (Linux/Win/Mac) → use breakpad symbols
bugsnag-cli upload breakpad --api-key=$KEY symbols/
```

`→ docs/guides/liveops/symbol-upload.md`

## Smoke test

```bash
nexus diag emit --kind=panic --to=bugsnag --release-stage=dev
```

## Verify

```bash
bugsnag-cli api events --api-key=$KEY \
  --filter "release.stage=dev,release.version=$VER" | head
```

## Rollback

```bash
nexus config set diag.bugsnag.enabled false
# or restrict stages
nexus config set diag.bugsnag.enabled_release_stages '["production"]'
```

## Cost

| Tier | Events/mo | Cost |
|------|-----------|------|
| Bugsnag Free | 7.5k | $0 |
| Standard | 50k | $59 |
| Enterprise | custom | — |

No OSS self-host. For MIT-default deployments use GlitchTip.

## Cross-links

- `→ docs/guides/liveops/error-reporting.md`
- `→ docs/guides/liveops/symbol-upload.md`
- `→ docs/guides/liveops/glitchtip.md` — OSS alternative

## References

- Bugsnag docs · `https://docs.bugsnag.com/`
- Notify API v5 · `https://bugsnagerrorreportingapi.docs.apiary.io/`
- bugsnag-cli · `https://github.com/bugsnag/bugsnag-cli`
- Android ANR · `https://developer.android.com/topic/performance/vitals/anr`

## Open

- `[VERIFY — provider policy changes]` Bugsnag SmartBear pricing changes.
