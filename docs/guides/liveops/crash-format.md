<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crash Format — Native Dumps & Symbolication

Native crashes (SIGSEGV, EXCEPTION_ACCESS_VIOLATION, illegal instruction) live below the language runtime. Engine uses crashpad.

## Stack: crashpad

- Default capture backend on all desktop + mobile targets.
- Out-of-process handler: child process survives parent crash, writes dump, uploads.
- Minidump format (`.dmp`) — same as Windows + Chromium.
- WASM: no native dump; engine catches JS exceptions + WASM traps via wasm-bindgen panic hook.

Why crashpad over breakpad: maintained, out-of-process upload during crash, better mobile.

## Layout

```
crashpad/
├── handler/        ← OOP crash handler binary, shipped with game
├── pending/        ← unwritten dumps
├── completed/      ← written, unsent
├── settings.dat
└── attachments/    ← attached envelope + replay ref
```

`nexus run` spawns the handler. On crash:
1. Kernel signals handler.
2. Handler walks parent process memory, writes minidump.
3. Handler attaches Nexus envelope JSON + replay-ref + last telemetry batch.
4. Handler uploads to configured backend (Sentry/GlitchTip/Bugsnag).
5. Handler exits.

## Minidump → envelope

The collector (Sentry/GlitchTip) symbolicates via uploaded debug files (`→ docs/guides/liveops/symbol-upload.md`) and emits a normalized event matching `nexus.error/1`.

Engine attaches sidecar JSON `nexus_envelope.json` so non-crashable context (scene, entity count, replay-ref) survives the minidump.

## Fingerprint (dedup hash)

```
fingerprint = sha256(
   join("|",
     normalize(top_in_app_frame.symbol),
     normalize(top_in_app_frame.file),
     str(top_in_app_frame.line // 10),    // bucket ±10 lines
     exception.type,
     release.engine.major_minor
   )
)
```

Properties:

- Stable across patch versions (bucket-by-10-lines).
- Resets on engine major/minor bump (intentional — semantics may shift).
- `normalize` strips template params, monomorphization suffixes, anonymous closure suffixes.

## Frame structure

```json
{
  "fn":      "shadow::cascade_split",
  "file":    "renderer/pass/shadow.rs",
  "line":    142,
  "col":     18,
  "addr":    "0x7fff8ab4",
  "module":  "libnexus_renderer.so",
  "debug_id":"0123abcd-...",        // GUID from PE/PDB or build-id
  "in_app":  true,
  "symbol_status": "resolved"        // resolved|unresolved|partial
}
```

`debug_id` is the symbol-server lookup key. Format per platform:

| Platform | Source |
|----------|--------|
| Linux | `.note.gnu.build-id` |
| Windows | PDB Age + GUID |
| macOS/iOS | LC_UUID |
| Android `.so` | build-id |

## ANR / hang

ANRs are not crashes — main thread blocked > N seconds. Capture stack of main + render + script threads. Emit envelope with `kind: "anr"`.

| Platform | Threshold | Detector |
|----------|-----------|----------|
| Android | 5s | system ANR |
| iOS / macOS | 2s warn / 6s fatal | watchdog timer |
| Desktop | 2s | engine watchdog on main loop |
| Web | 250ms long-task | `PerformanceObserver` |

## Test crash

```bash
nexus diag crash --signal=SIGSEGV         # forces null deref
nexus diag crash --kind=oom               # forces alloc failure
nexus diag crash --kind=anr --hold=6s     # blocks main thread
```

## Verify

```bash
nexus diag last-dump                       # shows last minidump path
nexus diag symbolicate ./pending/abc.dmp   # local resolve via cached symbols
```

## Rollback

```bash
NEXUS_CRASH_HANDLER=off ./mygame           # skip handler attach
nexus config set diag.crashpad.enabled false
```

## Cross-links

- `→ docs/guides/liveops/error-reporting.md` — envelope it produces
- `→ docs/guides/liveops/symbol-upload.md` — symbol resolution
- `→ docs/guides/liveops/replay-on-crash.md` — attached replay
- `→ docs/guides/liveops/privacy.md` — scrub before upload

## References

- crashpad · `https://chromium.googlesource.com/crashpad/crashpad/+/refs/heads/main/README.md`
- breakpad symbol format · `https://chromium.googlesource.com/breakpad/breakpad/+/master/docs/symbol_files.md`
- Minidump format · `https://learn.microsoft.com/en-us/windows/win32/debug/minidump-files`
- Android ANR · `https://developer.android.com/topic/performance/vitals/anr`

## Open

- `[DECISION NEEDED]` WASM: capture via panic_hook only, or add SharedArrayBuffer-based watchdog?
- `[BENCHMARK NEEDED]` Crashpad handler overhead on Android low-tier devices.
