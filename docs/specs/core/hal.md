<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Core / HAL — Hardware Abstraction Layer

> The single thin layer between Nexus and the OS. Window, input, filesystem, time, threads, page allocation, async I/O. Every other subsystem calls HAL, never the OS directly.

## Boundaries

- **Owns**
  - Window / display creation, sizing, DPI, monitor enumeration, swapchain surface handle.
  - Input: keyboard, mouse, gamepad (XInput / DualSense / Switch Joy-Con / generic HID), touch, pen, IME / text input.
  - Filesystem: read/write/seek, async I/O reactor (io_uring on Linux, IOCP on Windows, kqueue on macOS/BSD, libuv-equivalent fallback elsewhere), atomic rename, mmap.
  - Time: monotonic clock, wall clock, high-resolution timers, sleep-until, frame pacing primitives, deterministic clock source for replay.
  - Thread primitives: OS thread spawn, TLS, affinity hints, parking (futex on Linux, `WaitOnAddress` on Windows, `__ulock_wait` on macOS), thread naming.
  - Page allocation: `mmap` / `VirtualAlloc` / `mach_vm_allocate`, huge pages, guard pages.
  - Power / battery / thermal hints (mobile + handheld consoles).
  - Clipboard, native dialogs (open-file, save-file, message), URL open (sandbox-permitting).
- **Does NOT own**
  - GPU device, queues, swapchain creation logic → `docs/specs/renderer/backend.md` (HAL provides only the raw surface handle and the window event loop).
  - Audio device → `docs/specs/audio/overview.md` (CPAL or platform-direct; HAL provides only thread + time).
  - High-level input mapping (`Action = Jump`) → `docs/specs/agent/api.md` and per-game scripting; HAL emits raw `InputEvent`s.
  - Networking sockets → `docs/specs/networking/transport.md` (transport uses its own QUIC/UDP stack; HAL only provides the async reactor primitive).
  - Allocator policy → `core::memory` (HAL provides page allocation; `core::memory` builds heaps).
- **Depends on**
  - The OS and nothing else. **HAL is the only crate allowed to depend on platform crates** (`winit`, `gilrs`, `rfd`, `io-uring`, `windows-sys`, `objc2`, `ndk`, `web-sys`, etc.). All other engine crates depend on HAL.

## Architecture

```
   Engine subsystems (renderer, audio, ecs, agent, ...)
        │
        ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  core::hal — abstract trait API             │
   │  Window | Input | Fs | Time | Thread | Page | Power | Misc  │
   └─────────────────────────────────────────────────────────────┘
        │                          (one impl per target)
        ├─► hal_linux       (wayland / x11 / io_uring / evdev / pipewire-time)
        ├─► hal_windows     (win32 / IOCP / XInput + RawInput)
        ├─► hal_macos       (AppKit / kqueue / IOKit-HID / GameController)
        ├─► hal_ios         (UIKit / GameController / Metal surface)
        ├─► hal_android     (NativeActivity / AInput / asset manager)
        ├─► hal_web         (web-sys / GamepadAPI / fetch + IndexedDB / wasm-bindgen)
        └─► hal_headless    (no window, deterministic clock, in-memory FS, mock input)

   Selection at compile time via Cargo features; runtime at most checks
   feature negotiation (e.g. "is this a wayland session?" within hal_linux).
```

**Cross-platform substrate.** We will likely depend on `winit` for windowing on desktop/mobile/web (inspiration: it is the de facto Rust standard, mature on every target) and `gilrs` for cross-platform gamepad. We re-export both via our trait API so engine code never names them directly. Inspiration / API shape borrows from **SDL3** (single unified API surface, capability negotiation, event polling vs callback dual model), **`winit`** (event loop architecture, redraw-on-demand), **sokol_app** (minimal "one function returns events" mental model).

**Two event-loop modes.**

1. **Pumped** (`hal.pump_events()`) — non-blocking poll, fills an event buffer; engine drives the loop. Used by the game runtime: the engine controls frame pacing.
2. **Driven** (`hal.run_app(app)`) — the OS drives via callbacks. Required for: web (browser owns the rAF loop), iOS (UIKit owns the run loop), some Android lifecycle paths.

Both modes deliver the same `Vec<HalEvent>` to the engine. Headless mode synthesizes events from scripted input (cross-ref `docs/specs/agent/scenarios.md`).

**Deterministic clock.** The replay system (`docs/specs/agent/replay.md`) requires that "the clock" be a value the engine controls, not the wall clock. HAL provides:
- `Time::mono()` — real monotonic clock.
- `Time::engine()` — engine clock; default = `mono()`, but replayable to a recorded sequence.
- `Time::fixed_step(dt)` — pinned to a fixed timestep for deterministic simulation.

All engine code reads `Time::engine()`, never `mono()` directly (lint enforced).

**Async I/O reactor.** A single per-process reactor thread runs `io_uring` / IOCP / kqueue and dispatches completions to the job system (`core::jobs`) on the `Critical` lane. The reactor exposes `Fs::read_async`, `Fs::write_async`, and a generic `IoHandle` for sockets used by `networking`. No `std::fs` outside HAL.

**Page allocation.** `Page::map(bytes, prot, flags)` returns a `PageRegion` (RAII). Supports huge pages where available (Linux `MAP_HUGETLB` / `MADV_HUGEPAGE`, Windows large pages with privilege, macOS `VM_FLAGS_SUPERPAGE_SIZE_2MB`). Used exclusively by `core::memory::SlabAllocator`.

**Hot-pluggable input.** Gamepad connect/disconnect, monitor change, DPI change, focus, occlusion — all delivered as `HalEvent`s. State queries (`hal.gamepad_state(id)`) are also available for poll-style code.

## Public API

```rust
// === Top-level handle ===
pub struct Hal { /* private */ }
impl Hal {
    pub fn init(cfg: HalConfig) -> Result<Hal, ErrHal>;
    pub fn pump_events(&mut self, out: &mut Vec<HalEvent>);
    pub fn run_app<A: HalApp>(self, app: A) -> !;     // driven mode
    pub fn window(&self) -> &dyn Window;
    pub fn input(&self) -> &dyn Input;
    pub fn fs(&self) -> &dyn Fs;
    pub fn time(&self) -> &dyn Time;
    pub fn power(&self) -> &dyn Power;
    pub fn capabilities(&self) -> &HalCaps;
}
pub struct HalConfig {
    pub mode: HalMode,                    // Windowed | Fullscreen | Headless | Embed(RawHandle)
    pub title: String,
    pub size: (u32, u32),
    pub vsync: VsyncMode,                 // Off | On | Adaptive | Mailbox
    pub deterministic_clock: bool,
    pub allow_hidpi: bool,
}
pub enum HalMode { Windowed, Fullscreen, Headless, Embed(RawHandle) }

// === Capabilities (queried at runtime) ===
pub struct HalCaps {
    pub platform: Platform,               // Linux | Windows | MacOS | IOS | Android | Web
    pub backends_available: BackendMask,  // wayland|x11|win32|cocoa|uikit|ndk|wasm
    pub touch: bool,
    pub pen: bool,
    pub gamepad_count: u8,
    pub displays: Vec<DisplayInfo>,
    pub huge_pages: bool,
    pub async_io: AsyncIoBackend,         // IoUring | Iocp | Kqueue | None
}

// === Events ===
pub enum HalEvent {
    WindowResized { w: u32, h: u32, scale: f32 },
    WindowFocus(bool),
    WindowCloseRequested,
    Redraw,
    Key { key: KeyCode, scan: u32, state: ButtonState, mods: ModState, repeat: bool },
    Text { string: SmallString<8> },      // IME / composed
    Mouse { dx: f32, dy: f32, x: f32, y: f32 },
    MouseButton { button: MouseButton, state: ButtonState, x: f32, y: f32 },
    Scroll { dx: f32, dy: f32 },
    Touch { id: u32, phase: TouchPhase, x: f32, y: f32, pressure: f32 },
    GamepadConnected { id: GamepadId, name: SmallString<32>, kind: GamepadKind },
    GamepadDisconnected { id: GamepadId },
    GamepadButton { id: GamepadId, button: GpButton, state: ButtonState },
    GamepadAxis { id: GamepadId, axis: GpAxis, value: f32 },     // [-1, 1]
    GamepadAccel { id: GamepadId, x: f32, y: f32, z: f32 },      // m/s², DualSense / Switch
    GamepadGyro  { id: GamepadId, x: f32, y: f32, z: f32 },      // rad/s
    FileDrop { paths: SmallVec<[PathBuf; 4]> },
    DisplayChanged,
    AppPause, AppResume,                  // mobile lifecycle
    LowMemory,
    Custom(u32, [u8; 16]),                // platform-specific escape hatch
}

// === Window ===
pub trait Window {
    fn size(&self) -> (u32, u32);
    fn scale(&self) -> f32;
    fn set_title(&self, s: &str);
    fn set_cursor(&self, c: CursorKind);
    fn set_cursor_visible(&self, on: bool);
    fn capture_cursor(&self, on: bool) -> Result<(), ErrHal>;
    fn raw_handle(&self) -> RawHandle;     // for renderer surface creation
    fn request_redraw(&self);
    fn set_fullscreen(&self, mode: FullscreenMode);
}

// === Input ===
pub trait Input {
    fn key_state(&self, key: KeyCode) -> ButtonState;
    fn mouse_pos(&self) -> (f32, f32);
    fn mouse_button_state(&self, b: MouseButton) -> ButtonState;
    fn gamepads(&self) -> &[GamepadId];
    fn gamepad_state(&self, id: GamepadId) -> Option<&GamepadState>;
    fn set_rumble(&self, id: GamepadId, low: f32, high: f32, dur: Duration);
    fn set_clipboard(&self, text: &str);
    fn clipboard(&self) -> Option<String>;
}

// === Filesystem ===
pub trait Fs {
    fn open(&self, path: &Path, mode: OpenMode) -> Result<FileHandle, ErrHal>;
    fn read(&self, h: &FileHandle, buf: &mut [u8]) -> Result<usize, ErrHal>;
    fn write(&self, h: &FileHandle, buf: &[u8]) -> Result<usize, ErrHal>;
    fn seek(&self, h: &FileHandle, pos: SeekFrom) -> Result<u64, ErrHal>;
    fn read_async(&self, path: &Path) -> JobHandle;       // → core::jobs Critical lane
    fn write_async(&self, path: &Path, bytes: Vec<u8>) -> JobHandle;
    fn mmap(&self, path: &Path) -> Result<Mmap, ErrHal>;
    fn atomic_write(&self, path: &Path, bytes: &[u8]) -> Result<(), ErrHal>;
    fn list(&self, dir: &Path) -> Result<Vec<DirEntry>, ErrHal>;
    fn metadata(&self, path: &Path) -> Result<Meta, ErrHal>;
    fn user_dir(&self, kind: UserDir) -> Option<PathBuf>;  // Save | Config | Cache | Documents
    fn watch(&self, path: &Path) -> Result<FsWatcher, ErrHal>;  // file change events
}

// === Time ===
pub trait Time {
    fn mono(&self) -> Instant;             // OS monotonic; not for game logic
    fn engine(&self) -> Instant;           // engine clock; replayable
    fn wall(&self) -> SystemTime;          // never used for game logic
    fn delta(&self) -> Duration;           // last frame's engine delta
    fn now_ticks(&self) -> u64;            // CPU TSC if available, else ns counter
    fn sleep_until(&self, when: Instant);  // hybrid spin + park
    fn set_fixed_step(&self, dt: Duration);
    fn set_replay_source(&self, src: Box<dyn ClockSource>);
}

// === Threads / TLS / Park ===
pub trait Thread {
    fn spawn(&self, name: &str, f: Box<dyn FnOnce() + Send>) -> Result<ThreadHandle, ErrHal>;
    fn pin_to_core(&self, h: &ThreadHandle, core: u16) -> Result<(), ErrHal>;
    fn current_core(&self) -> Option<u16>;
    fn park_thread(&self, timeout: Option<Duration>);
    fn unpark_thread(&self, h: &ThreadHandle);
}

// === Page allocation ===
pub trait Page {
    fn map(&self, bytes: usize, prot: PageProt, flags: PageFlags) -> Result<PageRegion, ErrHal>;
    fn unmap(&self, region: PageRegion);
    fn page_size(&self) -> usize;
    fn huge_page_size(&self) -> Option<usize>;
}

// === Power / thermal ===
pub trait Power {
    fn battery(&self) -> Option<Battery>;
    fn on_battery(&self) -> bool;
    fn thermal_state(&self) -> ThermalState;   // Nominal | Warm | Hot | Critical
    fn hint_performance(&self, h: PerfHint);   // Performance | Balanced | Efficient
}
```

## Performance Contract

| Operation | Target | Hard limit |
|---|---|---|
| `pump_events` (idle window) | ≤ 20 µs | 100 µs |
| `pump_events` (1000 events queued) | ≤ 200 µs | 1 ms |
| `Time::engine()` | ≤ 10 ns | 30 ns |
| `Time::now_ticks()` (TSC fast path) | ≤ 3 ns | 12 ns |
| `Time::sleep_until` jitter (60 fps, busy CPU) | ≤ 200 µs | 1 ms |
| `Page::map(2 MiB)` cold | ≤ 200 µs | 2 ms |
| `Fs::read_async` request enqueue | ≤ 2 µs | 10 µs |
| Async I/O completion → job dispatch | ≤ 50 µs | 250 µs |
| Gamepad poll | ≤ 5 µs / pad | 25 µs |
| Window create | ≤ 50 ms | 500 ms |
| Cold cap. negotiation (`Hal::init`) | ≤ 150 ms | 1 s |
| Memory overhead per Hal instance | ≤ 4 MiB | 16 MiB |
| Frame-pacing accuracy (vsync mailbox @ 60 fps) | ≤ 1 ms p99 | 4 ms |

`[BENCHMARK NEEDED]` per platform.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `HAL.E001` | Backend unavailable (e.g. wayland on a non-wayland session) | Fall back via `HalCaps::backends_available`; surface to user |
| `HAL.E002` | Window create failed | Surface OS errno; do not retry |
| `HAL.E003` | Surface handle invalid (DPI / monitor lost) | Re-create swapchain; renderer must handle |
| `HAL.E004` | Input device disconnected mid-call | Drop the device id; user notification |
| `HAL.E005` | File not found | Caller decides; common, not an error per se |
| `HAL.E006` | Permission denied | Surface; on sandboxed platforms (iOS / web) cannot recover |
| `HAL.E007` | Disk full | Caller releases space or aborts |
| `HAL.E008` | Async I/O queue full | Backpressure; retry later |
| `HAL.E009` | Page map failed (OOM / `RLIMIT_AS`) | Surface; `core::memory` adjusts budgets |
| `HAL.E010` | Thread spawn failed | Reduce thread count; surface to job system |
| `HAL.E011` | Clipboard unavailable (sandbox / headless) | Treat as empty |
| `HAL.E012` | Unsupported on this platform (e.g. cursor capture on iOS) | Caller chooses fallback; `HalCaps` should have prevented call |
| `HAL.E013` | Replay clock exhausted (deterministic mode, no more recorded ticks) | End of replay; engine pauses |
| `HAL.E014` | Filesystem watcher event lost (inotify queue overflow) | Re-scan affected dir |

All errors carry `os_errno?`, `path?`, `device_id?`.

## Integration Points

- **`renderer`** — receives `RawHandle` from `Window::raw_handle()` to create wgpu surface; redraws on `Redraw` event; recreates swapchain on `WindowResized` / `DisplayChanged`. → `docs/contracts/core-renderer.md`
- **`core::memory`** — only client of `Page::map`; uses guard-page allocations for stack overflow detection. → `docs/specs/core/memory.md`
- **`core::jobs`** — only client of `Thread::spawn` (lint forbids elsewhere); async I/O completions land via `Lane::Critical`. → `docs/specs/core/jobs.md`
- **`core::events`** — `HalEvent`s are republished into the typed event bus (`Event<KeyPressed>`, `Event<GamepadConnected>`, etc.) by a thin pump system. → `docs/specs/core/events.md`
- **`audio`** — gets its own dedicated thread via `Thread::spawn(name="audio")`, pinned, real-time priority hint. CPAL or platform-direct audio API handled inside `audio` crate. → `docs/specs/audio/overview.md`
- **`assets`** — exclusive user of `Fs::read_async` / `Fs::mmap` for asset I/O. → `docs/specs/assets/streaming.md`
- **`agent`** — headless mode (`HalMode::Headless`) lets agents drive the engine with mock input via `Input` trait stubs and a recorded clock source. → `docs/specs/agent/headless.md`
- **`scripting`** — clipboard and `user_dir(Save)` exposed read/write through a capability-gated proxy (no raw `Fs` to scripts). → `docs/specs/scripting/sandbox.md`
- **`editor`** — file watcher (`Fs::watch`) drives hot reload of shaders, scripts, assets. → `docs/specs/editor/livereload.md`
- **`networking`** — uses `Hal::time().now_ticks()` for RTT measurement; uses async reactor primitive directly for socket I/O. → `docs/specs/networking/transport.md`

## Test Requirements

1. `init_succeeds_each_platform` — `Hal::init` returns Ok on every supported target in CI matrix (linux/wayland, linux/x11, windows, macos, headless; mobile and web tested in dedicated jobs).
2. `pump_events_drains` — synthesized 10 k events drain through `pump_events` with zero loss.
3. `headless_mode_no_window` — `HalMode::Headless` returns a `HalCaps` with no displays, no window handle, mock input; engine boots and runs ECS for 1000 frames.
4. `deterministic_clock_replay` — recording 60 s of `Time::engine()` then replaying yields identical Instant sequence; downstream physics produces identical snapshot hash.
5. `vsync_mailbox_jitter` — present-to-present p99 < 1 ms over 60 s at 60 fps on supported platforms.
6. `gamepad_hotplug` — plug / unplug events delivered ≤ 50 ms after OS notification.
7. `dpi_change` — moving window between 1× and 2× monitors emits `WindowResized` with correct `scale`.
8. `async_io_throughput` — `Fs::read_async` of 1000 × 64 KiB files completes ≥ 90 % of native `dd` throughput on the same FS.
9. `atomic_write_crash_safe` — kill -9 mid-write; partial file never visible at target path (verified via crash harness).
10. `mmap_then_munmap_no_leak` — 10 k mmap/unmap cycles; RSS does not grow.
11. `huge_pages_used_when_available` — on linux with THP `madvise`, 16 MiB request gets ≥ 8 × 2 MiB hugepages.
12. `clipboard_roundtrip` — set, get, expect equal — skipped in sandboxed CI.
13. `web_target_compiles` — `cargo build --target wasm32-unknown-unknown --features hal_web` succeeds; integration test in headless chromium verifies window + input.
14. `mobile_lifecycle_emits` — Android `onPause`/`onResume` → `AppPause`/`AppResume` events delivered.
15. `low_memory_event_on_pressure` — Android `onLowMemory` and iOS `didReceiveMemoryWarning` deliver `LowMemory`.
16. `no_panic_on_disconnect` — pulling USB gamepad mid-frame: graceful `GamepadDisconnected`, no panic, no race.
17. `lint_no_std_thread` — CI lint asserts no `std::thread::spawn` outside `core::jobs`.
18. `lint_no_direct_clock` — CI lint asserts no `std::time::Instant::now()` outside `core::hal`.
19. `lint_no_direct_fs` — CI lint asserts no `std::fs` outside `core::hal`.
20. `power_hint_observed` — on Linux with cpupower available, `PerfHint::Efficient` reduces governor; on iOS `ProcessInfo` thermal state reflects in `thermal_state()`.

## Prior Art

- **SDL3** (`libsdl-org/SDL`)
  - ✓ Unified API across desktop, mobile, consoles. Capability negotiation. Single header for the user.
  - ✓ The "init subsystem on demand" pattern (`SDL_InitSubSystem`) — we adopt for granular init.
  - ✗ C API, manual memory; we keep Rust trait-based.
  - ✗ Windowing in SDL is monolithic; `winit` shows a cleaner separation. We split window from input.
- **`winit`** (`rust-windowing/winit`)
  - ✓ Mature on every Rust-supported platform (linux/win/mac/ios/android/web).
  - ✓ ApplicationHandler pattern (the `HalApp` driven-mode trait derives from it).
  - ✗ Event-loop ownership rigidity has historically been painful (event loop must run on main thread; we accept this and document the constraint).
  - ✗ Gamepad not in scope; we add `gilrs` (`Arvamer/gilrs`).
- **sokol_app** (`floooh/sokol`)
  - ✓ Minimal surface area, single header, "one update function" mental model — informs our pumped event-loop ergonomics.
  - ✗ Limited input device coverage; we go broader.
- **`io-uring`** (Linux) — kernel-level async I/O completion ring; we depend on `tokio-uring`-style abstraction or roll a minimal wrapper. Cross-platform fallback for older kernels: thread-pool blocking reads (slow, correct).
- **GLFW** — informs the "always raw event then queue" model and the cursor-capture / input-grab semantics.
- **Sokol gfx / sokol app split** — informs the strict separation of HAL (window) from renderer (GPU device).
- **Bevy `bevy_winit`** — shows the pitfalls of wrapping `winit` too thinly; we wrap thicker so consumers see `HalEvent`, not `winit::WindowEvent`.
- **Godot OS abstraction** (`OS` and `DisplayServer` classes) — informs the structure of having one global "OS service" with sub-services per concern.

## Open Questions

1. `[DECISION NEEDED]` — Hard dependency on `winit` vs. a custom Wayland/X11/Win32/Cocoa stack. Pro-winit: ships day one on every platform. Con: API churn, slow merge of fixes. Bias: depend on winit for v1.0, isolate via `Window` trait so we can swap later.
2. `[DECISION NEEDED]` — Should HAL own the audio output device too, or leave it to `audio` crate? Argument for HAL: it owns "talking to the OS". Argument against: audio's I/O cadence is real-time and needs its own thread + buffer model. Bias: leave to `audio`; HAL only provides the thread.
3. `[DECISION NEEDED]` — Filesystem virtualization layer (e.g. PhysFS-style mount of an archive at `/data/maps/...`). Useful for modding and platforms with restricted FS. Where: HAL, or a separate `assets` concern? Bias: assets; HAL stays "real FS only".
4. `[BENCHMARK NEEDED]` — All performance numbers per platform.
5. `[DECISION NEEDED]` — Should `Hal::init` be `&'static` (singleton) or movable? Singleton matches winit's event-loop-on-main-thread constraint; movable matches Rust idioms. Bias: singleton, accessed via `hal()` global.
6. `[DECISION NEEDED]` — Web target threading: `SharedArrayBuffer` + WebWorkers (cross-origin headers required), or single-threaded? `[AGENT: 03]` renderer wasm path needs an answer; cross-impact with `core::jobs`.
7. `[DECISION NEEDED]` — Console (Switch / PS5 / Xbox) HAL impls live in this repo (gated behind NDA features) or in a separate private overlay? Public repo cannot include SDKs; bias: private overlay crate that implements the same traits.
8. `[DECISION NEEDED]` — IME / text input policy: always-on (full text events), or gated by mode (game vs UI)? Bias: gated; HAL exposes `enable_text_input(rect)` / `disable_text_input()` per platform expectation.
9. `[DECISION NEEDED]` — Raw input mode vs cooked: do we offer raw HID access for power users (custom controllers)? Risk: huge surface area. Bias: no in v1.0; expose plug-in interface in v1.1.
