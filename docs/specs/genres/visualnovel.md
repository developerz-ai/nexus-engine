<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Visual Novel Genre Module

> Visual-novel primitives: dialogue script VM, branching choice graph, sprite + background staging, save-anywhere snapshots, skip-read/auto-advance/backlog.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.visualnovel] version = "0.1"
script_lang = "ndl"           # "ndl" (Nexus Dialogue Lang) | "ink" | "yarn"
save_anywhere = true
auto_advance_ms_per_char = 35
backlog_lines = 200
```

## Boundaries

- Owns: dialogue script loader/VM, choice graph, sprite/bg slot registry, transition (fade/dissolve), text reveal, save-anywhere snapshot, backlog, settings (skip-read, voice).
- Does NOT own: 2D rendering (→ `docs/specs/styles/2d.md`), audio playback (→ `docs/specs/audio/streaming.md`), localization tables (game-side, engine consumes keys).
- Depends on: ECS, scripting, asset registry, save chunk (→ `docs/specs/genres/rpg.md` SAVE format).

## Architecture

```
   .ndl source ──► Compile ──► ScriptBytecode (deterministic)
                                       │
                                       ▼
                              ┌────────────────┐
                              │   ScriptVM     │
                              │ pc, vars, hist │
                              └────┬───────────┘
                                   │ commands
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
        TextReveal             Stage director         ChoiceMenu
        (typewriter)           ├ bg(slot=bg, "kitchen.png")
                               ├ chara(slot=L, "alice/smile.png")
                               ├ move(slot=L, x:-200, dur:.4)
                               └ play(audio="sting.ogg")
```

## NDL — Nexus Dialogue Language

Minimal, readable, machine-parseable. Compiles to bytecode for deterministic stepping.
```
:start
@bg "kitchen.dawn"
@chara L "alice/smile"
Alice: "You came."
Alice: "I wasn't sure you would."

?choose:
- "I had to.":          -> route_loyal
- "It was convenient.": -> route_pragmatic
- "Who are you?":       -> route_lost  [if !flags.met_alice]

:route_loyal
$ flags.affinity_alice += 2
Alice: "Then stay."
-> end

:end
@stop
```
- `:label` jump targets.
- `@cmd` stage/audio command (data-driven registry).
- `?id:` choice block; options gated by `[if expr]`.
- `$` assignment (vars persist in save).
- `->` jump.

## Public API

```rust
// resources
pub struct VnState {
    script_id: ScriptId, pc: u32, vars: ScriptScope,
    history: VecDeque<HistoryLine>, awaiting_choice: Option<ChoiceMenu>,
}
pub struct Stage { slots: HashMap<SlotId, StageEntity> } // slots: bg, L, C, R, fg, overlay
pub struct Settings { text_speed: f32, auto_ms: f32, skip_read_only: bool, voice_vol: f32 }

// components
pub struct StageEntity { kind: StageKind, sprite: AssetId, x:f32, y:f32, scale:f32, alpha:f32 }

// systems
fn vn_step_system();             // advances VM until blocking command
fn text_reveal_system();         // typewriter timer
fn choice_input_system();
fn stage_tween_system();         // smooth fades / moves
fn auto_advance_system();
fn skip_system();

// events
pub enum VnEvent {
    LineShown{speaker, text_key}, ChoiceShown{id, options}, ChoiceMade{id, idx},
    Jumped{label}, FlagChanged{name,old,new}, RouteEntered{label}, EndingReached{ending_id},
}
```

## Save-Anywhere Model

Snapshot = `(script_id, pc, vars, history snapshot, stage snapshot, audio cursors)`. Stored as VN chunk inside the save file:
```
VN chunk:
  script_id [16]u8
  pc        u32
  vars      msgpack
  history   array<HistoryLine>
  stage     array<StageEntity>
  audio     array<AudioCursor>
```
Round-trip: load snapshot → reproduce identical screen + VM state.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Script step (no IO) | <50 µs | 500 µs |
| Save snapshot write | <30 ms | 100 ms |
| Load snapshot read+restore | <80 ms | 250 ms |
| Skip mode (skip 1000 read lines) | <500 ms | 2 s |
| Text reveal frame cost | <20 µs | 100 µs |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `VN_E001` | unknown label jump | halt script, error overlay in dev mode |
| `VN_E002` | missing asset for stage slot | render placeholder + telemetry |
| `VN_E010` | save chunk version mismatch | run VN-chunk upgrader |
| `VN_E020` | choice expr eval fail | hide option, log |

## Integration Points

- Save/Load: VN chunk lives inside RPG save container → `docs/specs/genres/rpg.md`.
- Audio: voice-line cursor per character, BGM crossfade → `docs/specs/audio/adaptive.md`.
- Styles/2D: sprite/bg via 2D pipeline → `docs/specs/styles/2d.md`.
- Localization: text keys resolved against locale tables (engine emits key, game resolves).
- Agent: route-coverage scenario explores every branch headlessly → `docs/specs/agent/scenarios.md`.

## Choice Graph Diagram

```
       greet
         │
       ┌─┴─┐
       │ ? │
       └┬─┬┘
        │ │
   loyal│ │pragmatic
        ▼ ▼
     route_loyal   route_pragmatic
        │              │
        └────┬─────────┘
             ▼
          endingA / endingB / endingC  (decided by flags)
```

## Telemetry

```json
{"t":13.0,"sys":"vn","evt":"choice_made","id":"choose","idx":0,"label":"route_loyal","flags":{"affinity_alice":4}}
```
Per-playthrough: branch-coverage map, average reading speed, ending reached.

## Test Requirements

- Snapshot → load round-trip on every line produces identical state (golden hash).
- Route coverage: agent harness reaches every `:label` reachable.
- Skip mode skips only previously-read lines (tracked per save).
- Auto-advance respects per-line override (`@wait 2.0`).
- Compiler rejects unknown `@cmd` or undefined label at compile-time.

## Prior Art

- Ren'Py script style ✓ — primary inspiration for NDL.
- ink (Inkle) ✓ — branching syntax conciseness.
- Yarn Spinner ✓ — node graph compatible with editor.
- Steins;Gate phone-trigger model — out of scope (game-side feature).
- VN Conf talks on save-everywhere QA ✓.

## Open Questions

- [DECISION NEEDED] Default NDL vs ink (engine ships both — which is default?).
- [DECISION NEEDED] Auto-resolve unread voice on skip vs prompt.
- [BENCHMARK NEEDED] Long-script (50k lines) compile + load time.
