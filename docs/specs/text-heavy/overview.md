<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Text-Heavy — Overview

> Visual novel, Disco-Elysium-style branching narrative. Rich-text rendering. Dialogue-tree DSL. Save-anywhere. Voice-line streaming. Disco Elysium, Sunless Sea, 80 Days, Pentiment.

## Boundaries

- Owns: rich-text renderer (markup tags: color, italic, shake, rate, sprite-inline, voice-cue), dialogue-tree DSL (`.ink`-inspired), choice-graph runtime, save-anywhere snapshot, voice-line streaming integration, localization pipeline.
- Does NOT own: font rasterization (→ `docs/specs/assets/import.md`), audio streaming (→ `docs/specs/audio/streaming.md`), VN-genre gameplay loop (→ `docs/specs/genres/visualnovel.md`), input handling (→ `docs/specs/core/hal.md`).
- Depends on: `nexus-genres/visualnovel`, `nexus-assets/streaming` (voice), `nexus-scripting` (dialogue conditions), `nexus-core/events`.

## Composes

| Existing module | Purpose |
|---|---|
| `nexus-genres/visualnovel` | VN scene + character + UI conventions |
| `nexus-assets/streaming` | voice line streaming on demand |
| `nexus-scripting` | dialogue choice conditions, variables, branching logic |
| `nexus-core/events` | choice-made events for game state |
| `nexus-audio/streaming` | gapless voice + music transitions |
| `nexus-agent/replay` | dialogue-replay (text playback for review) |

## New modules

| Crate | Category | Purpose |
|---|---|---|
| `nexus-text-rich-render` | `text` (new) | inline-markup text layout + animation |
| `nexus-text-dialogue-dsl` | `text` | parser + runtime for `.dialogue` files |
| `nexus-text-l10n` | `text` | localization key registry + asset pack swap |
| `nexus-text-voice-binding` | `text` | binding voice files to dialogue nodes |

## Architecture

```
Dialogue runtime

  ┌──────────────────────────────────────────────────────────┐
  │ .dialogue file (Ink/Yarn-inspired DSL)                   │
  │   === scene_alley ===                                    │
  │   PLAYER: "I should look around."                        │
  │   * [Search the dumpster] -> dumpster                    │
  │   * [Talk to the woman] -> woman { if has_seen_woman }   │
  └──────────────┬───────────────────────────────────────────┘
                 │ parse + compile (asset import)
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │ DialogueGraph (DAG of nodes + edges + conditions)        │
  │ - nodes: line | choice | branch | call | external        │
  │ - edges: conditional via scripting expressions            │
  │ - variables: scoped to story + persistent across saves    │
  └──────────────┬───────────────────────────────────────────┘
                 │ runtime
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │ DialoguePlayer                                           │
  │ - emit line → rich-text renderer (animated reveal)       │
  │ - voice cue → audio/streaming load + play                │
  │ - choice node → wait for player input                    │
  │ - advance → next node by edge condition                  │
  │ - snapshot at any point → save-anywhere                  │
  └──────────────────────────────────────────────────────────┘
```

## Rich-text markup

Inline tags inside text strings:

```
"The {color=red}beast{/color} {rate=0.5}breathed{/rate} slowly. {voice=evi-021}*Hello.*{/voice}"
```

| Tag | Effect |
|---|---|
| `{color=...}` | tint text |
| `{italic}` `{bold}` | typeface variant |
| `{shake=2}` | per-glyph jitter |
| `{rate=N}` | typewriter reveal rate multiplier (N < 1 = slower) |
| `{pause=ms}` | pause typewriter reveal |
| `{voice=id}` | play voice file id while text reveals |
| `{sprite=id}` | inline character emoji / icon |
| `{var=NAME}` | substitute variable value |

## Dialogue DSL excerpt

```
=== scene_office ===
{ has_clue ? "I know what you did." : "I just have some questions." }

DETECTIVE: "{var=player_name}, sit down."

* "Why am I here?" -> question_arrest
* "I'd like a lawyer."
    { lawyer_count = lawyer_count + 1 }
    -> lawyer_demand
* [Stare in silence] { if intimidation_skill > 5 } -> silence_intimidate

=== question_arrest ===
DETECTIVE: "You're not under arrest. Yet."
-> END
```

Compiles to a typed DialogueGraph; conditions run on scripting VM (`nexus-scripting`).

## Public API

```toml
[text_heavy]
dialogue_dir       = "dialogues/"
voice_dir          = "audio/voice/"
default_language   = "en"
languages          = ["en", "fr", "ja", "zh"]
reveal_rate_cps    = 30          # chars per second typewriter
save_anywhere      = true
voice_streaming    = true

[text_heavy.font]
default            = "assets/fonts/Inter.ttf"
fallback           = ["NotoSansCJK.ttf", "NotoEmoji.ttf"]
```

```rust
pub struct DialogueGraph { /* compiled DSL */ }

pub struct DialoguePlayer { /* current node, vars, history */ }

impl DialoguePlayer {
    pub fn load(&mut self, graph: DialogueHandle, start_node: &str);
    pub fn advance(&mut self);
    pub fn choose(&mut self, choice_index: usize);
    pub fn current_line(&self) -> Option<&RichText>;
    pub fn save_state(&self) -> DialogueSave;
    pub fn restore_state(&mut self, save: &DialogueSave);
    pub fn telemetry(&self) -> DialogueTelemetry;
}

pub struct DialogueTelemetry {
    pub lines_visited: u32,
    pub choices_made: u32,
    pub variables_count: u32,
    pub voice_files_loaded: u32,
    pub render_ms: f32,
}
```

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Dialogue compile (1k lines) | < 100 ms | 500 ms |
| Per-frame line reveal cost | < 0.5 ms | 2 ms |
| Choice latency (player input → next node) | < 16 ms | 100 ms |
| Voice file load (streaming) | < 100 ms | 500 ms |
| Save snapshot (full dialogue state) | < 50 ms | 200 ms |
| Memory: 10k-line graph | < 8 MB | 32 MB |
| Localization swap (mid-game) | < 1 s | 5 s |
| Text shaping (HarfBuzz) per line | < 1 ms | 5 ms |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `TXT_E_DSL_SYNTAX` | DSL parse error | Show line + col + suggested fix |
| `TXT_E_NODE_NOT_FOUND` | Edge references missing node | Validate at compile time; show offending edge |
| `TXT_E_VOICE_MISSING` | Voice file referenced but not in asset registry | Skip voice; log; surface in editor |
| `TXT_E_CONDITION_RUNTIME` | Scripting expression on edge errored | Treat as false; log |
| `TXT_E_L10N_KEY_MISSING` | Translation key missing for current language | Fall back to default_language |
| `TXT_W_LINE_TOO_LONG` | Line > 1000 chars | Likely author error; render anyway |

## Integration Points

- **VN genre**: this spec is the engine; genre is the gameplay shell. → `docs/specs/genres/visualnovel.md`.
- **Audio/streaming**: voice files streamed on cue. → `docs/specs/audio/streaming.md`.
- **Scripting**: edge conditions + variable mutations run on scripting VM. → `docs/specs/scripting/overview.md`.
- **Assets/streaming**: voice + character portraits streamed. → `docs/specs/assets/streaming.md`.
- **Agent**: nexus-coder can author dialogue trees via natural language → DSL conversion. → `docs/specs/agent/overview.md`.
- **Editor**: dialogue graph editor (node-based UI). → `docs/specs/editor/overview.md`.
- **Procgen**: WFC over narrative tiles for procedural dialogue / quest generation. → `docs/specs/procgen-first/overview.md`.

## Scenario test (starter)

`scenarios/text-heavy-branching-choice.scenario.toml`:

```toml
[scene]
template = "text-heavy-detective"
[setup]
dialogue = "dialogues/scene_office.dialogue"
[actions]
- { tick = 1,   action = "load_dialogue", start = "scene_office" }
- { tick = 30,  action = "advance" }
- { tick = 60,  action = "choose", choice = 1 }     # "I'd like a lawyer"
[asserts]
- { tick = 100, predicate = "var('lawyer_count') == 1" }
- { tick = 100, predicate = "current_node == 'lawyer_demand'" }
- { tick = 100, predicate = "render_ms < 0.5" }
- { tick = 100, predicate = "voice_loaded('detective_lawyer_01')" }
```

## Test Requirements

- Load 10k-line dialogue → compiles within 500 ms.
- Choice mutations propagate (variable updates persist into save).
- Save-anywhere: snapshot mid-line → restore resumes mid-line with cached voice.
- Localization swap: switch to JA → all on-screen text in JA within 1 s.
- Rich text markup: shake + rate + voice tags render simultaneously without interfering.
- Memory: 10k-line graph + 100 active variables < 8 MB.

## Prior Art

- Disco Elysium (ZA/UM) — branching narrative + skill-check dialogue model. [VERIFY — ZA/UM dev posts].
- Sunless Sea / Cultist Simulator (Failbetter / Weather Factory) — text-heavy storytelling. [VERIFY — Alexis Kennedy talks].
- 80 Days (Inkle) — Ink scripting language origin. https://www.inklestudios.com/ink/.
- Pentiment (Obsidian) — text + illuminated-manuscript styling. [VERIFY — Obsidian dev posts].
- Ren'Py — open-source VN engine. https://www.renpy.org.
- Twine / Sugarcube — open-source narrative tools.
- YarnSpinner — narrative DSL widely used in indie games. https://yarnspinner.dev.
- *Inspired by*: Inkle's Ink language design (compiles narrative tree to JSON).

## Open Questions

- `[DECISION NEEDED]` DSL syntax base: Ink (proven, JSON-compiled) vs Yarn (Unity-friendly) vs custom.
- `[DECISION NEEDED]` Default text shaping: HarfBuzz (heavy but correct) vs fontdue (lighter, simpler).
- `[BENCHMARK NEEDED]` 100k-line dialogue (Disco Elysium scale) compile time + memory.
- `[DECISION NEEDED]` Voice-line auto-binding by node-id convention vs explicit `voice = "..."` tag per line.
- `[DECISION NEEDED]` Inline-sprite (`{sprite=id}`) — limit to per-char emoji or allow full character portraits?
