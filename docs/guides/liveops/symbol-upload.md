<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Symbol Upload

Without symbols, every crash is `0x7fff8ab4`. With them, every crash is a fix candidate.

## Rule

- Upload before publish. Never after. Race condition window = crashes you can't read.
- Release ID matches envelope `release.commit`. Mismatch = no symbolication.
- Strip from shipped binary. Keep symbols on the server.

## Per-platform matrix

| Platform | Symbol type | Tool | Where |
|----------|-------------|------|-------|
| Linux native | DWARF + `.dbg` split | `objcopy --only-keep-debug` | symbol server |
| Windows native | `.pdb` | MSVC / clang-cl | symbol server |
| macOS native | dSYM bundle | Xcode / `dsymutil` | symbol server + Apple |
| iOS | dSYM (bitcode dSYM if enabled) | Xcode archive | Sentry/Bugsnag + App Store Connect |
| Android | ProGuard/R8 mapping.txt + native `.so` symbols | gradle | symbol server |
| Web (WASM) | `.wasm.map` + JS source maps | `wasm-opt --debuginfo` | symbol server |
| Console | proprietary `.elf`/`.sym` | platform SDK | platform |

## Engine workflow

```bash
nexus build --release --emit-symbols=./symbols/$RELEASE/
nexus symbols upload --release=$RELEASE --to=sentry   # or glitchtip / bugsnag / minio
nexus symbols verify --release=$RELEASE               # round-trip a known frame
nexus publish                                          # only after verify
```

## Per-target commands

### Linux native

```bash
# split
cp game game.unstripped
objcopy --only-keep-debug game game.dbg
objcopy --strip-debug    game
objcopy --add-gnu-debuglink=game.dbg game
# upload
sentry-cli debug-files upload --include-sources ./game.dbg
```

### Windows native (MSVC)

```bash
# build emits game.exe + game.pdb
sentry-cli debug-files upload --include-sources ./game.pdb
```

### macOS / iOS

```bash
# dSYM produced in Xcode archive
sentry-cli debug-files upload --include-sources \
  ~/Library/Developer/Xcode/Archives/.../*.xcarchive/dSYMs/
```

### Android

```bash
# Java/Kotlin (R8/ProGuard)
sentry-cli upload-proguard --android-manifest \
  app/build/intermediates/merged_manifests/release/AndroidManifest.xml \
  app/build/outputs/mapping/release/mapping.txt

# Native .so
sentry-cli debug-files upload \
  app/build/intermediates/merged_native_libs/release/out/lib/
```

### Web (WASM + JS)

```bash
sentry-cli sourcemaps inject web/dist/
sentry-cli sourcemaps upload --release "$RELEASE" web/dist/
```

## CI integration

```yaml
# .github/workflows/release.yml (excerpt)
- name: build
  run: nexus build --release --emit-symbols=symbols/${{ env.RELEASE }}
- name: upload symbols
  env: { SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }} }
  run: nexus symbols upload --release="$RELEASE" --to=sentry
- name: verify
  run: nexus symbols verify --release="$RELEASE"
- name: publish
  run: nexus publish --channel=stable
```

Gate publish on `verify`. No symbols → no ship.

## Self-host symbol server (MinIO)

```bash
docker run -d -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin -e MINIO_ROOT_PASSWORD=$PASS \
  -v minio-data:/data minio/minio server /data --console-address ":9001"

nexus symbols configure --backend=minio \
  --endpoint=http://localhost:9000 --bucket=nexus-symbols
```

Layout: `s3://nexus-symbols/<release>/<platform>/<arch>/<debug-id>.{dbg,pdb,dSYM,wasm.map}`

Standard symbol-server layout — readable by `lldb`, `windbg`, `gdb`, `addr2line` via http symbol-server URL.

## Verify

```bash
nexus symbols verify --release=$RELEASE
# walks: known address → frame with file:line. Exits non-zero on miss.
```

## Rollback

```bash
nexus symbols delete --release=$RELEASE       # remove from store
nexus publish --rollback --channel=stable     # → docs/guides/liveops/canary-and-rollback.md
```

## Retention

| Channel | Keep |
|---------|------|
| stable  | 365d |
| beta    | 90d |
| canary  | 30d |
| dev     | 7d |

## Cross-links

- `→ docs/guides/liveops/crash-format.md` — debug-id derivation
- `→ docs/guides/liveops/sentry.md` · `→ docs/guides/liveops/glitchtip.md` · `→ docs/guides/liveops/bugsnag.md`
- `→ docs/guides/release/codesigning/` (Agent 21)

## References

- Sentry debug files · `https://docs.sentry.io/platforms/native/data-management/debug-files/`
- Microsoft Symbol Server · `https://learn.microsoft.com/en-us/windows/win32/debug/symbol-servers-and-symbol-stores`
- Breakpad symbol format · `https://chromium.googlesource.com/breakpad/breakpad/+/master/docs/symbol_files.md`
- WASM debug info · `https://github.com/WebAssembly/debugging`

## Open

- `[DECISION NEEDED]` Default self-host: MinIO vs SeaweedFS vs plain HTTP.
