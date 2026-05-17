<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Debugging

> Live debugger attach to a running game. Breakpoints in Lua / Rune. Capability-violation traceback. Hot-reload-on-fix. → `docs/specs/editor/debug.md`.

## Attach

```
nexus mod debug --attach <pid>
```

Or from the editor: `Run → Attach Debugger`.

Editor opens its Debug panel; the running game accepts the attachment if dev-mode is on. `--ship` builds reject by default.

## Breakpoints

Click in the gutter in editor's source view OR via CLI:

```
nexus mod debug bp set src/lib.rn:23
nexus mod debug bp list
nexus mod debug bp clear all
```

Engine pauses the mod's VM at the breakpoint (the rest of the world keeps running on a heartbeat). Inspect frame variables in the watch panel.

## Step / Continue

| Action | Shortcut | CLI |
|---|---|---|
| Step Over | F10 | `nexus mod debug step` |
| Step Into | F11 | `nexus mod debug step --into` |
| Step Out | Shift+F11 | `nexus mod debug step --out` |
| Continue | F5 | `nexus mod debug continue` |
| Pause | Pause | `nexus mod debug pause` |

## Watch Expressions

Add expressions to the watch panel. Engine evaluates them in the mod's VM scope at the current pause:

```
self.state.last_hit_time
world.query::<Health>().count()
env.audit.cap_use_count("WorldWrite<Health>")
```

## Capability-Violation Traceback

When a `CAP_DENIED` or `LIMIT_EXCEEDED` fires, the debugger surfaces:

```
+----------------------------------------------------------+
| CAP_DENIED                                                |
|                                                          |
| Mod: com.you.mycoolmod                                   |
| Cap requested: WorldWrite<Inventory>                     |
| Granted set: WorldRead<Inventory>, WorldWrite<Health>    |
|                                                          |
| Source:                                                  |
|   src/lib.rn:47                                          |
|     w.set::<Inventory>(e, new_inv);                      |
|                                                          |
| Suggested fix:                                           |
|   Add to mod.toml:                                       |
|     [capabilities]                                       |
|     world.write = [..., "Inventory"]                     |
|                                                          |
| [ Apply Fix ]   [ Continue ]                             |
+----------------------------------------------------------+
```

"Apply Fix" updates `mod.toml`; hot-reload kicks in with the new cap (consent re-prompted if needed).

## Stack Inspection

The full call stack from the VM, plus any bridge frames:

```
[ 0] src/lib.rn:47   on_step()
[ 1] <bridge>        WorldWrite::set
[ 2] <bridge>        cap_check
[ 3] src/lib.rn:122  spawn_loot
```

Click any frame to jump source + inspect locals.

## Live REPL

The debug panel includes a Rune REPL bound to the paused VM:

```
> world.query::<Health>().count()
12
> w.set::<Health>(0, Health { hp: 9999, max: 9999 })
ok
```

REPL evaluations honor caps; ungranted ops return `CAP_DENIED` exactly as in code.

## Hot-Reload-On-Fix

Editing source while paused at a breakpoint:
- Save → hot-reload pipeline runs.
- VM updated with new code.
- Resume at next safe point (script-step boundary).
- State preserved per `docs/specs/scripting/rune.md` § Hot Reload.

Edits that change cap requests pause the resume until consent is granted.

## Structured Error Log

Right panel of the debug view shows every structured error the engine has surfaced for your mod this session:

```
[12345f] CAP_DENIED  WorldWrite<Inventory>  src/lib.rn:47
[12347f] LIMIT_EXCEEDED events.emit (cap 256, attempted 312)  src/lib.rn:81
[12389f] SCRIPT_TIMEOUT (frame budget 250µs exceeded: 312µs)  src/lib.rn:on_step
```

Click → jumps to source + opens fix-suggestion.

## Telemetry Stream

Below the error log: a live tail of your mod's telemetry channel:

```
cpu_us: 87  calls_in: 12  calls_out: 41  alloc_bytes: 256
```

Filter by counter; export CSV for offline analysis.

## Remote Debugging

A dev multiplayer server can host the debug protocol over TCP (loopback or LAN, opt-in):

```
nexus mod debug --attach tcp://192.168.1.10:5180
```

`--ship` rejects.

## CI Debugging

Failed scenarios capture `.nexus-replay` (→ `test-harness.md`). Open in editor and step through:

```
nexus mod debug replay test-results/issue-42.nexus-replay --frame 1234
```

Same UI; replays are deterministic, so the bug reproduces every time.

## Panic vs Error

The engine never crashes on a mod bug:
- Rune panics inside a VM are caught at the VM boundary, surfaced as `SCRIPT_RUNTIME`.
- Bridge fn panics caught at the bridge.
- Hard host crashes (e.g., GPU driver fault) are out of mod scope but still produce a `.nexus-replay` via `docs/guides/liveops/crash-format.md`.

## Pitfalls

- Breakpoints in `on_step` fire every tick; consider conditional breakpoints (`bp condition src/lib.rn:23 health.hp < 10`).
- REPL ops count against your mod's per-frame budget.
- `--ship` builds reject the debugger; test in dev / editor builds.

## Cross-Links

- → `docs/specs/editor/debug.md`
- → `docs/specs/scripting/rune.md`
- → `docs/specs/scripting/sandbox.md` — for what CAP errors mean.
- → `test-harness.md` — `.nexus-replay` integration.
- → `perf.md` — when "it works but slow."
