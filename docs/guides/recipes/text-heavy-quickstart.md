<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Text-Heavy Quick-Start

> Day 1: Disco Elysium-style branching narrative. Voiced lines. Save anywhere.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| Audio files for voice lines (placeholders bundled) | required for voiced play |
| HarfBuzz fonts (Inter + Noto fallbacks bundled) | required |

## Scaffold

```
nexus new mygame --template visual-novel
cd mygame
nexus run
```

Day 1 result: a starting scene in a detective's office. Click choices to branch. Voice lines stream from disk. Save mid-line, reload, mid-line preserved.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "audio", "scripting"]

[style]
preset = "2d"

[genres]
primary = "visualnovel"

[text_heavy]
dialogue_dir      = "dialogues/"
voice_dir         = "audio/voice/"
default_language  = "en"
languages         = ["en", "fr", "ja"]
reveal_rate_cps   = 30
save_anywhere     = true
voice_streaming   = true

[text_heavy.font]
default  = "assets/fonts/Inter.ttf"
fallback = ["NotoSansCJK.ttf", "NotoEmoji.ttf"]

[crates]
nexus-text-rich-render        = "1.0"
nexus-text-dialogue-dsl       = "1.0"
nexus-text-l10n               = "1.0"
nexus-text-voice-binding      = "1.0"
nexus-genre-visualnovel       = "1.0"
nexus-audio-streaming         = "1.0"
nexus-scripting               = "1.0"

[scripting]
language     = "lua"
script_dirs  = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-text-rich-render` | inline-markup text layout + animation |
| `nexus-text-dialogue-dsl` | .dialogue parser + runtime |
| `nexus-text-l10n` | localization key registry + asset pack swap |
| `nexus-text-voice-binding` | bind voice files to dialogue nodes |
| `nexus-genres/visualnovel` | VN scene + character + UI conventions |
| `nexus-audio/streaming` | voice file streaming |
| `nexus-scripting` | dialogue edge conditions |

→ Full spec: `docs/specs/text-heavy/overview.md`. Cross-link → `docs/specs/genres/visualnovel.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs            # ~20 LOC, no game logic in Rust
  scripts/
    systems/
      save-load.lua
  dialogues/
    scene_office.dialogue
    scene_alley.dialogue
  l10n/
    en/
      scene_office.toml
    ja/
      scene_office.toml
  audio/
    voice/
      detective/
        line_001.ogg
        line_002.ogg
  assets/
    fonts/
      Inter.ttf
      NotoSansCJK.ttf
    portraits/
      detective.png
  scenarios/
    text-heavy-branching-choice.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_text_rich_render::TextHeavyPlugin;
use nexus_genre_visualnovel::VnPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(TextHeavyPlugin::default())
        .add_plugin(VnPlugin)
        .add_startup_system(start)
        .run();
}

fn start(mut player: ResMut<DialoguePlayer>) {
    player.load("scene_office", "intro");
}
```

## Dialogue authoring

```
# dialogues/scene_office.dialogue
=== intro ===
{ has_clue ? "I know what you did." : "I just have some questions." }

DETECTIVE: "{var=player_name}, sit down."

* "Why am I here?" -> question_arrest
* "I'd like a lawyer."
    { lawyer_count = lawyer_count + 1 }
    -> lawyer_demand
* [Stare in silence] { if intimidation_skill > 5 } -> silence_intimidate

=== question_arrest ===
DETECTIVE: "{voice=detective_lawyer_01}*You're not under arrest. {pause=400}Yet.*{/voice}"
-> END
```

Rich-text inline tags (`{color}`, `{shake}`, `{rate}`, `{voice}`, `{pause}`, `{var}`) render automatically.

## Starter scenario test

`scenarios/text-heavy-branching-choice.scenario.toml`:

```toml
[scene]
template = "text-heavy-detective"
[setup]
dialogue = "dialogues/scene_office.dialogue"
[actions]
- { tick = 1,   action = "load_dialogue", start = "intro" }
- { tick = 30,  action = "advance" }
- { tick = 60,  action = "choose", choice = 1 }      # "I'd like a lawyer"
[asserts]
- { tick = 100, predicate = "var('lawyer_count') == 1" }
- { tick = 100, predicate = "current_node == 'lawyer_demand'" }
- { tick = 100, predicate = "render_ms < 0.5" }
- { tick = 100, predicate = "voice_loaded('detective_lawyer_01')" }
```

## Localization

```toml
# l10n/ja/scene_office.toml
"DETECTIVE: \"{var=player_name}, sit down.\""  = "刑事「{var=player_name}、座ってくれ。」"
"Why am I here?"                                = "なぜ私はここに？"
"I'd like a lawyer."                            = "弁護士を呼んでくれ。"
```

Switch at runtime: `text_heavy.set_language("ja")`. UI updates within 1 s.

## Next steps

| You want | Add |
|---|---|
| Disco-Elysium skill checks | already supported — edge conditions on scripting expressions |
| Procedural dialogue (Wildermyth-style) | `nexus add nexus-procgen-wfc`; use WFC over narrative tiles |
| Hand-drawn 2.5D parallax backgrounds | `nexus add nexus-style-2-5d-parallax`; see `docs/guides/recipes/2-5d-hd-2d-quickstart.md` |
| Voice synthesis (AI-generated voice lines) | `nexus add nexus-asset-source-tts` (community: Bark, XTTS) |
| Save-game cloud sync | `nexus add nexus-feature-flag-steam-cloud` (community) |
| In-game dialogue editor | already in `docs/specs/editor/overview.md` |

## Cross-links

→ `docs/specs/text-heavy/overview.md`
→ `docs/specs/genres/visualnovel.md`
→ `docs/specs/audio/streaming.md`
→ `docs/architecture/08-compose-dont-build.md` (Disco Elysium's narrative tech took years; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe text-heavy-quickstart
```
