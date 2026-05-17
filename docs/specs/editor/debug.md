<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Debug Overlays & Profiler

> In-editor visualization of engine internals: physics wireframes, navmesh, audio sources, AI state, telemetry panels, frame profiler. All overlays are engine-side debug-draw streams; the editor is just a viewer + control surface.

## RPC parity

Every overlay toggle, every profiler capture start/stop, every breakpoint add/remove, every replay scrub is one `debug.*` / `profile.*` / `replay.*` agent RPC. The overlay checkboxes are not editor-local state — they call `debug.overlay.set` and the engine starts/stops the debug-draw stream. Same surface drives a headless CI run capturing physics overlays into a frame trace. Enforced by `docs/specs/editor/rpc-parity.md` and Law 13 (→ `docs/architecture/01-principles.md#law-13`). MCP wraps via `docs/specs/agent/mcp-server.md`.

## Boundaries

- Owns: debug-overlay toggle UI, telemetry panel layout, profiler view, log/console dock, breakpoint UI for scripts.
- Does NOT own: debug-draw rendering itself (→ `docs/contracts/physics-renderer.md`, `docs/specs/renderer/overview.md`), telemetry schema (→ `docs/specs/agent/telemetry.md`), navmesh data (→ `docs/specs/genres/rts.md` and recast integration in core).
- Depends on: `docs/specs/editor/overview.md`, `docs/specs/agent/telemetry.md`, `docs/specs/agent/api.md`, `docs/specs/agent/replay.md`, `docs/contracts/physics-renderer.md`, `docs/specs/scripting/hotreload.md`.

## Architecture

```
                     engine (any process)
                  ┌───────────────────────────┐
                  │  systems emit telemetry   │
                  │  + debug-draw primitives  │
                  │  every frame (always-on   │
                  │   in debug build)         │
                  └─────────────┬─────────────┘
                                │ telemetry stream (subscribe-by-channel)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Editor                                                              │
│ ┌───────────────┐  ┌──────────────────┐  ┌────────────────────────┐│
│ │ Overlays      │  │ Telemetry        │  │ Profiler / Flame       ││
│ │  ☑ phys wires │  │   (panels)       │  │   frame · system · job ││
│ │  ☑ navmesh    │  │   ECS · physics  │  │                        ││
│ │  ☑ ai paths   │  │   audio · net    │  │ ┌───── 16.6 ms ─────┐ ││
│ │  ☐ audio src  │  │   memory · gpu   │  │ │ render █████      │ ││
│ │  ☐ light bnds │  │                  │  │ │ physics ███       │ ││
│ │  ☑ entity ids │  │  charts · tables │  │ │ scripts ██        │ ││
│ │  ☐ frustums   │  │                  │  │ │ ai      █         │ ││
│ └───────────────┘  └──────────────────┘  └────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Console / Log     ▾ filter [error | warn | info | trace]        ││
│ │ ⚠ [12:04:11] physics.contact spike (n=4123) at frame 8821       ││
│ │ ✗ [12:04:13] script orc_ai.lua:42  nil index 'target'           ││
│ └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## Overlay catalogue

| Overlay | Default | Source | Hotkey |
|---|---|---|---|
| Physics wireframes (colliders) | off | `docs/contracts/physics-renderer.md` | F1 |
| Physics contacts + normals | off | physics | F2 |
| Physics joints / constraints | off | physics | — |
| Navmesh polygons | off | core/navmesh | F3 |
| Navmesh agent paths | off | core/navmesh | — |
| AI state machine labels | off | scripting | F4 |
| AI perception cones | off | scripting | — |
| Audio source positions + radii | off | audio | F5 |
| Audio occlusion rays | off | audio | — |
| Light bounds / shadows frustums | off | renderer | F6 |
| Camera frustums (all cameras) | off | renderer | F7 |
| LOD coloring | off | renderer | F8 |
| Overdraw heatmap | off | renderer | — |
| Entity IDs label | off | core | F9 |
| Component bounds (AABB) | off | core | — |
| Network: latency arrows, rollback markers | off | networking | F10 |
| GPU memory residency map | off | renderer | — |
| Hot-reload status badge | on | livereload | — |

Each overlay is independently subscribable. Toggling sends `engine.debug.overlay.set { id, enabled }` RPC; engine starts/stops the relevant debug-draw stream. Editor draws nothing on its own; engine pushes vertex lists.

Per-overlay style: color, line width, alpha — configurable, persisted per workspace.

## Telemetry panels

Telemetry channels are defined in `docs/specs/agent/telemetry.md`. Editor provides panel templates:

| Panel | Channels |
|---|---|
| ECS | entity count, archetype count, system schedule timing, change-detection hits |
| Physics | bodies, contacts/frame, solver iterations, broad-phase pairs |
| Renderer | draw calls, triangles, vram, frame time GPU/CPU, render-graph node ms |
| Audio | active voices, dsp time, peak/rms per bus, dropouts |
| Networking | rtt, packet loss, in/out bandwidth, rollback events, predicted vs authoritative diff |
| Memory | per-allocator usage, peak, growth rate, leaks suspected |
| Assets | streaming queue depth, cache hit/miss, IO time |
| Scripts | per-script vm time, allocations, errors, hot-reload events |
| GPU | per-pass time, queue submits, occupancy estimate |
| Agent | RPC calls/s, subscribers, scenario pass/fail counters |

Each panel:
- Chart strip (last 5 / 60 / 600 s buffer).
- Table view (sortable, exportable to CSV/JSON).
- Threshold lines (configurable; cross ⇒ red highlight + log entry).
- Right-click → "create alert" (sends to `agent.telemetry.alert.create`).

## Profiler / flame graph

```
frame 8821   total 16.4 ms   ▲ 0.2 ms over budget
└─ main_thread
   ├─ scheduler             ▌  0.3 ms
   ├─ input                 ▌  0.1 ms
   ├─ physics.step          ████  3.1 ms
   │   ├─ broad_phase       ██   1.2 ms
   │   ├─ narrow_phase      █    0.9 ms
   │   └─ solver            █    1.0 ms
   ├─ ai.tick               ███  2.4 ms
   ├─ scripts.run           ██   1.8 ms
   └─ render.submit         ████ 4.0 ms
└─ render_thread
   └─ gpu_submit            ████ 3.8 ms
└─ worker_pool (8)
   └─ jobs                  ███  2.1 ms (sum)
```

- Streamed from engine `agent.profile.subscribe`. Backed by per-system scoped timers (always-on in debug, sample-only in release).
- Modes: realtime, capture-N-frames, capture-on-spike (threshold trigger).
- Click a span ⇒ drills into sub-spans + jumps to source line via script/asset map.
- Export: Chrome `trace_event` JSON, Perfetto, Tracy.
- Comparison: load two captures side-by-side, regression diff.

## Console / log dock

- Tail of engine structured-log stream.
- Filter by level, system, regex, time range.
- Each entry: `{ ts, level, system, code, msg, fields, stack? }`. Code is from the per-system error contract.
- Click → jumps editor focus to the offending entity/asset/script when fields contain one.
- Input box at bottom: runs arbitrary RPC by name (`scene.entity.spawn …`); autocompletes from API schema.

## Script debugger

- Breakpoint UI in script editor pane (click margin).
- Step-over / step-in / step-out / continue.
- Variable inspector, call stack.
- Backed by the script VM debug interface (→ `docs/specs/scripting/lua.md`, `docs/specs/scripting/rune.md`).
- Time-travel: pair with replay (→ `docs/specs/agent/replay.md`) — rewind to last breakpoint hit.

## Replay / time-scrubber

- Timeline at the bottom of the viewport: scrub through a captured replay frame-by-frame.
- Backed by `docs/specs/agent/replay.md`. Editor speaks JSON-RPC to load a snapshot, advance N ticks, etc.
- "Bisect" mode: binary-search frames between "OK" and "BUG" markers.
- All debug overlays still active during scrub.

## Agent observation mode

- Read-only editor session connected to a remote engine (e.g. CI run, prod-like soak test).
- Cannot mutate; can subscribe to anything.
- Used by humans to audit what an AI agent is doing in real time.

## Public API (commands)

```rust
pub struct SetOverlay     { pub id: OverlayId, pub enabled: bool, pub style: Option<OverlayStyle> }
pub struct SubscribeTelemetry { pub channel: String, pub window: Duration }
pub struct UnsubscribeTelemetry { pub sub: SubscriptionId }
pub struct StartProfileCapture  { pub mode: ProfileMode, pub frames: u32 }
pub struct StopProfileCapture   { pub capture: CaptureId }
pub struct ExportProfile        { pub capture: CaptureId, pub format: ProfileFormat, pub dst: PathBuf }
pub struct AddBreakpoint        { pub script: AssetId, pub line: u32, pub condition: Option<String> }
pub struct RemoveBreakpoint     { pub bp: BreakpointId }
pub struct LoadReplay           { pub path: PathBuf }
pub struct ScrubReplay          { pub frame: u64 }
```

RPC counterparts under `debug.*`, `profile.*`, `replay.*` in `docs/specs/agent/api.md`.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Per overlay (typical scene) extra GPU cost | < 0.5 ms | 2 ms |
| Telemetry panel paint (60 charts) | < 6 ms | 16 ms |
| Profiler capture 60-frame buffer | < 2 ms / frame engine overhead | 4 ms |
| Log dock paint, 10k entries (virtualized) | < 4 ms | 12 ms |
| Replay scrub step | < 16 ms (1 frame) | 100 ms |
| Breakpoint hit → editor focus latency | < 100 ms | 500 ms |

`[BENCHMARK NEEDED]` debug-draw stream bandwidth at 100k bodies.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `DBG_OVERLAY_UNSUPPORTED` | system not loaded / not built with debug | gray-out toggle |
| `DBG_TELEM_CHANNEL_UNKNOWN` | channel not advertised by engine | refresh schema, suggest closest match |
| `DBG_PROFILE_CAPTURE_FULL` | capture buffer exhausted | drop oldest, warn |
| `DBG_REPLAY_INCOMPATIBLE` | replay engine version mismatch | offer migration or read-only |
| `DBG_BP_SCRIPT_NOT_LOADED` | script not in current VM state | defer until load |
| `DBG_LOG_OVERFLOW` | log rate exceeds editor ingest rate | switch to sampled mode |

## Integration Points

| System | Interaction |
|---|---|
| `docs/specs/agent/telemetry.md` | source of all panel data |
| `docs/specs/agent/replay.md` | timeline scrub |
| `docs/contracts/physics-renderer.md` | physics debug primitives |
| `docs/specs/renderer/overview.md` | renderer stats + overdraw heatmap |
| `docs/specs/scripting/hotreload.md` | script error overlay updates after reload |
| `docs/specs/scripting/lua.md` / `rune.md` | breakpoint protocol |
| `docs/specs/networking/rollback.md` | rollback visualization markers |
| `docs/specs/editor/scene.md` | shared selection; clicked entity highlighted in overlays |

## Test Requirements

- `debug.overlays_off_by_default`: fresh project → all overlays off; release build → telemetry overhead < 1% frame time.
- `debug.telemetry_parity`: a script `nexus debug capture --channel physics --frames 60` matches what the editor panel records.
- `debug.profile_export_roundtrip`: export to Chrome trace, re-import in `chrome://tracing`, no warnings.
- `debug.replay_scrub_determinism`: scrub to frame N forwards, then backwards from N+100 to N → identical state hash.
- `debug.bp_hit_rpc`: breakpoint hit raises `script.breakpoint.hit` event with payload `{ script, line, locals }`.
- `debug.log_sampling`: sustained 100k log/s, editor stays responsive; engine throttles with structured warning.

## Prior Art

- ✓ JetBrains Rider — debug overlay polish, conditional breakpoints, replay-style debugging concepts.
- ✓ Tracy — best-in-class CPU/GPU profiler; we adopt its concepts (zone markers, GPU sync) and offer it as an export target.
- ✓ Chrome `trace_event` — universal exchange format; we emit it.
- ✓ Perfetto — modern alternative; export target.
- ✓ Unreal Insights — multi-stream timeline, ms hover, gameplay tags.
- ✓ Unity Profiler — module-based UX, threshold alerts.
- ✓ Godot debugger — remote-attach to running game, scene tree mirror.
- ✓ NVIDIA Nsight / RenderDoc — frame capture inspector; we link out, do not reimplement.
- ✗ overlays as engine-internal toggles only (Unity / classic Godot) — fails the agent-callable mandate. Ours are RPC-driven from day one.

## Open Questions

- `[DECISION NEEDED]` Default profiler mode in release builds — sampled only, or off by default with on-demand enable?
- `[DECISION NEEDED]` Editor as live attach to running shipped game (with auth) — official feature or out of scope?
- `[DECISION NEEDED]` Debug-draw transport — same telemetry channel or separate high-bandwidth stream?
- `[DECISION NEEDED]` Time-travel script debugger — full step-back, or just frame-snapshot rewind?
- `[AGENT: 10]` finalize replay scrubbing RPC granularity (tick vs frame vs system-phase).
- `[AGENT: 10]` confirm telemetry channel naming convention (`physics.contacts.count` etc.).
- `[AGENT: 08]` lock breakpoint RPC schema; ensure both Lua and Rune expose same fields.
- `[AGENT: 14]` add a contract file `docs/contracts/core-debug.md` for the debug-draw vertex stream?
