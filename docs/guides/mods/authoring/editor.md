<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Editor Workflow

> Mod-aware UI in the Nexus editor: scene overlay, asset overlay preview, capability inspector, package + publish dialog. → `docs/specs/editor/overview.md`.

## Open a Mod Project

`File → Open Mod Project` or:
```
nexus editor --open-mod path/to/mycoolmod
```

The editor opens with the mod loaded over a chosen base game (defaults to the `[mod].game_id` from `mod.toml`).

## Scene Overlay

Left panel: scene tree.
- Base game's entities greyed (read-only by default).
- Mod-added entities highlighted in your mod's accent color.
- Mod-modified components show a "diff dot" next to the value.

Toggle `View → Only My Mod` to focus.

Drag-drop a mod-side prefab into the scene; the editor wires up the overlay entry in `overlays/` automatically.

## Asset Overlay Preview

Asset browser panel: every base asset shows whether your mod overlays it.

Right-click → `Add overlay for this asset` → opens overlay editor:

```
+----------------------------------------------------------+
| Overlay: 01HZ8XQK... (Dragon Mesh)                        |
|                                                          |
| Mode: ( ) Replace   (•) Patch   ( ) Merge                |
| Priority: [100]                                          |
|                                                          |
| Patch:                                                   |
|   nodes/Dragon/transform.scale = [2.0, 2.0, 2.0]         |
|   materials/dragon-skin.albedo_tint = [1.0, 0.5, 0.5, 1] |
|                                                          |
| Live preview:                                            |
|   [ Base ]   [ Overlay (your mod) ]   [ Diff ]           |
+----------------------------------------------------------+
```

Live preview composes the overlay against the base at editor time. Save updates `overlays/<uuid>.overlay.toml`.

## Capability Inspector

Bottom panel: shows the engine APIs your mod's source code is currently calling, and whether each is granted.

```
+----------------------------------------------------------+
| Capability Inspector                                     |
|                                                          |
|  src/lib.rn:23  env.cap::<WorldWrite<Health>>()  ✓      |
|  src/lib.rn:27  env.cap::<EventEmit>()           ✓      |
|  src/lib.rn:44  env.cap::<Persist>()             ✗ NOT GRANTED |
|                                                          |
|  [ Update manifest to grant Persist ]                    |
+----------------------------------------------------------+
```

Click "Update manifest" → editor adds the cap to `mod.toml::[capabilities]` and re-prompts the in-editor preview session for consent.

This is the in-editor version of `docs/specs/mods/permissions.md`.

## Live-Reload Inside Editor

Editing any source file triggers the standard hot-reload (`docs/specs/scripting/hotreload.md`). Editor surfaces the `ReloadReport` as a toast:

```
[ Healing Pack reloaded in 76 ms — state preserved ]
```

Failed reload shows the structured error with click-to-jump-to-source. → `debugging.md`.

## Test Harness Panel

`View → Tests` opens the scenario panel.

- Lists all `scenarios/*.toml`.
- Run individually or as a suite.
- Pass/fail per assertion.
- Last-run telemetry diffed against previous run (perf regression hint).
- "Generate replay snapshot" button for failed scenarios.

→ `test-harness.md`.

## Profiler

`View → Profiler` — same panel as engine dev mode, scoped to your mod.

Surfaces:
- Per-system CPU per frame.
- Cap-use counters (`world.read`, `world.write`, `events.emit`).
- Memory + alloc deltas.
- Top-N hot scripts within the mod.
- Per-frame budget compliance vs the sandbox limit.

→ `perf.md`.

## Package + Publish Dialog

`File → Package & Publish`:

```
+----------------------------------------------------------+
| Package mycoolmod 1.2.3                                  |
|                                                          |
|  Target: target/mycoolmod-1.2.3.nxmod                    |
|  Reproducible: ✓ (timestamps fixed, sorted)              |
|  Size: 18.4 MB / 500 MB tier budget                      |
|  Signing: keys/signing.key  [ Change ]                   |
|                                                          |
|  Marketplaces:                                           |
|    [x] Self-hosted: https://mods.mygame.com/             |
|    [x] mod.io game 4321                                  |
|    [ ] Steam Workshop                                    |
|    [ ] Thunderstore                                      |
|                                                          |
|  Per-marketplace metadata: [ Edit ]                       |
|                                                          |
|  [ Pack ]   [ Pack & Publish ]                           |
+----------------------------------------------------------+
```

Wraps `nexus mod pack` + `nexus mod publish --to ...` (`packaging.md`, `publishing.md`). Auth tokens loaded from `~/.nexus/auth/`.

## Mod-In-Editor Save Profile

Editor maintains a separate save namespace per mod project so testing doesn't pollute your real saves. `Edit → Save Profile → Reset` clears the test namespace.

## Multi-Mod Workspace

Open multiple mod projects under one workspace (`File → Add to Workspace`). Useful when you maintain a mod and its dependency library together.

- Resolver runs locally with all workspace mods at their working versions (not their published versions).
- Cross-mod overlays previewable.
- `nexus mod publish --workspace` publishes all in dependency order.

## Keyboard Shortcuts (defaults)

| Action | Key |
|---|---|
| Hot-reload now | F5 |
| Run last scenario | F6 |
| Open capability inspector | Ctrl+Shift+P |
| Open profiler | Ctrl+Shift+G |
| Toggle Only-My-Mod scene view | Ctrl+M |
| Package & Publish | Ctrl+Shift+B |

`[DECISION NEEDED]` whether to make these rebindable in editor's keybindings.

## Cross-Links

- → `quickstart.md`
- → `debugging.md` — live debugger attach.
- → `test-harness.md`
- → `perf.md`
- → `docs/specs/editor/overview.md`
- → `docs/specs/editor/livereload.md`
- → `docs/specs/editor/debug.md`

## Pitfalls

- Editing a base-game asset by accident (UI grey-out is the gate; don't bypass).
- Forgetting to save the overlay before pack; editor warns.
- Capability inspector reads STATIC code; runtime-only capability reach (`env.cap::<T>()` inside conditional) may slip past it. Run test harness to catch.

## Open Questions

- `[DECISION NEEDED]` Whether to allow the editor to push live changes to a connected dev multiplayer server.
- `[DECISION NEEDED]` In-editor mod marketplace browser for installing dep mods directly without leaving the editor.
- `[AGENT: 11]` Confirm editor surface enumerated above aligns with editor team's plan.
