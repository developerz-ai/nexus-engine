<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Curated Starter List

> The crates that ship verified on day one. Mirrors of engine-internal exemplars republished to crates.io for compat, plus a small set of first-party community partners. Always the safe starting point.

→ Awesome-list (broader, community): `docs/specs/crates/awesome-nexus.md`.
→ Discovery: `docs/specs/crates/discovery.md`.

## What "ships day one" means

These crates are:
- Verified at engine v1.0 release.
- Authored by the engine team or a Council-vetted partner.
- Published under MIT.
- Used in the demo games (`games/nexus-*`) as exemplars.
- Audit attestations live in `nexus-hub`.

A consumer who picks any of these knows: it works, it's audited, it stays maintained for at least the 1.x cycle.

## The day-one list

### Genres
| Crate | Mirrors | Purpose |
|---|---|---|
| `nexus-genre-fps` | engine `crates/genres/nexus-genre-fps` | First-person shooter |
| `nexus-genre-rpg` | engine `crates/genres/nexus-genre-rpg` | Single-player RPG |
| `nexus-genre-mmorpg` | engine `crates/genres/nexus-genre-mmorpg` | Massively-multiplayer RPG |
| `nexus-genre-rts` | engine `crates/genres/nexus-genre-rts` | Real-time strategy |
| `nexus-genre-moba` | engine `crates/genres/nexus-genre-moba` | MOBA |
| `nexus-genre-platformer` | engine `crates/genres/nexus-genre-platformer` | Platformer |
| `nexus-genre-racing` | engine `crates/genres/nexus-genre-racing` | Racing |
| `nexus-genre-survival` | engine `crates/genres/nexus-genre-survival` | Survival |
| `nexus-genre-horror` | engine `crates/genres/nexus-genre-horror` | Horror |
| `nexus-genre-fighting` | engine `crates/genres/nexus-genre-fighting` | Fighting |
| `nexus-genre-battleroyal` | engine `crates/genres/nexus-genre-battleroyal` | Battle royale |
| `nexus-genre-roguelike` | engine `crates/genres/nexus-genre-roguelike` | Roguelike |
| `nexus-genre-towdef` | engine `crates/genres/nexus-genre-towdef` | Tower defense |
| `nexus-genre-puzzle` | engine `crates/genres/nexus-genre-puzzle` | Puzzle |
| `nexus-genre-visualnovel` | engine `crates/genres/nexus-genre-visualnovel` | Visual novel |
| `nexus-genre-openworld` | engine `crates/genres/nexus-genre-openworld` | Open-world template |

### Styles
| Crate | Mirrors | Purpose |
|---|---|---|
| `nexus-style-pbr` | engine `crates/styles/nexus-style-pbr` | Physically-based rendering |
| `nexus-style-npr` | engine `crates/styles/nexus-style-npr` | Non-photorealistic / cel |
| `nexus-style-pixel` | engine `crates/styles/nexus-style-pixel` | Pixel art |
| `nexus-style-2d` | engine `crates/styles/nexus-style-2d` | 2D sprites + tilemaps |
| `nexus-style-mixed` | engine `crates/styles/nexus-style-mixed` | PBR world + NPR characters |

### Physics
| Crate | Purpose |
|---|---|
| `nexus-physics-rapier` | The engine default. Mirrors internal Rapier integration. |

`[DECISION NEEDED]` Whether `nexus-physics-jolt-bridge` ships day one or v1.1. Default: v1.1.

### Networking
| Crate | Purpose |
|---|---|
| `nexus-net-quic` | The engine default (Quinn). |
| `nexus-net-rollback` | GGPO-style rollback. |

### Audio
| Crate | Purpose |
|---|---|
| `nexus-audio-spatial` | Default spatial audio. |
| `nexus-audio-dsp-base` | Reverb / delay / EQ / compressor — the staple effects pack. |

### Asset sources
| Crate | Purpose |
|---|---|
| `nexus-asset-source-kenney` | Kenney.nl free asset packs. |
| `nexus-asset-source-polyhaven` | Poly Haven HDRIs + textures. |
| `nexus-asset-source-flux-local` | FLUX self-hosted image generation. |
| `nexus-asset-source-meshy` | Meshy.ai 3D generation (API key required). |
| `nexus-asset-source-scenario` | Scenario.gg style-conditioned generation (API key required). |

### Telemetry sinks
| Crate | Purpose |
|---|---|
| `nexus-telemetry-sink-stdout` | NDJSON to stdout (default in dev). |
| `nexus-telemetry-sink-otlp` | OpenTelemetry Protocol exporter. |
| `nexus-telemetry-sink-sentry` | Sentry / GlitchTip backends. |

### Feature flags
| Crate | Purpose |
|---|---|
| `nexus-feature-flag-static` | TOML-driven flags, no service. The "no liveops" baseline. |
| `nexus-feature-flag-growthbook` | GrowthBook backend. |

### Input
| Crate | Purpose |
|---|---|
| `nexus-input-keyboard-mouse` | Engine default. |
| `nexus-input-gamepad` | Gamepad via `gilrs`. |

### Platforms
| Crate | Purpose |
|---|---|
| `nexus-platform-desktop` | Linux / Windows / macOS default. |
| `nexus-platform-mobile` | Android / iOS default. |
| `nexus-platform-web` | WASM + WebGPU default. |

### Script languages
| Crate | Purpose |
|---|---|
| `nexus-script-lang-lua` | mlua-backed. Default for game logic. |
| `nexus-script-lang-rune` | Rune-backed. Default for mods. |

### Genre toolkits
| Crate | Purpose |
|---|---|
| `nexus-genre-toolkit-quests` | Quest graph + journal. |
| `nexus-genre-toolkit-inventory` | Slot-grid inventory + crafting. |
| `nexus-genre-toolkit-dialogue` | Branching dialogue + localization. |
| `nexus-genre-toolkit-saves` | Save-slot manager + auto-save. |

### Tools
| Crate | Purpose |
|---|---|
| `nexus-tools-shader-permutation-gen` | Generates shader permutations at build. |
| `nexus-tools-asset-thumbnailer` | Asset preview thumbnailer for the editor. |
| `nexus-tools-replay-bisect` | Bisects a failing replay range. |

### Test fixtures
| Crate | Purpose |
|---|---|
| `nexus-test-fixtures-determinism-suite` | Determinism replay corpus. |
| `nexus-test-fixtures-mp-handshake` | Multiplayer handshake scenarios. |
| `nexus-test-fixtures-style-reference` | Reference scenes for visual regression. |

## Why the engine re-publishes its own crates

Engine-internal crates live in the monorepo (`crates/styles/*`, `crates/genres/*`). They're consumed by demo games via `path = "..."` deps. For external consumers who want the same crate without checking out the engine repo, we re-publish to crates.io under the same name.

Effect:
- Game projects depend on `nexus-genre-fps = "1.0"` from crates.io.
- Engine workspace depends on `nexus-genre-fps = { path = "crates/genres/nexus-genre-fps" }` internally.
- Both sources are byte-identical at each release tag.

`nexus crate publish-internal` ships the re-publishing automation. Driven by `release-engineer` subagent at every engine release.

## Discovery shortcut

```
nexus add --curated
```

Prints the day-one list with category + tier + license columns. Default Verified, can be filtered.

## How a new crate joins the curated list

1. Reach Verified tier via the standard audit (`docs/specs/crates/quality-bar.md`).
2. Demonstrate stable maintenance ≥ 6 months.
3. Bring unique value (does something none of the existing list does).
4. Council vote to promote to "Day-One" status.
5. Engine release notes announce the addition; `nexus add --curated` lists it from the next release.

This is conservative by design. The curated list is the "safe choice". The broader awesome-list is the "go look at the menu" list.

## Cross-references

- → `docs/specs/crates/awesome-nexus.md` — the broader community list.
- → `docs/specs/crates/quality-bar.md` — Verified tier definition.
- → `docs/architecture/04-workspace-layout.md` — engine-internal exemplars.
- → `docs/guides/crates/community-policy.md` — Council promotion process.
- → `docs/guides/crates/consuming.md` — `nexus add --curated`.

## Open Questions

- `[DECISION NEEDED]` Engine ships re-published mirrors via auto-PR or manual publish? Default: auto-PR via release-engineer.
- `[DECISION NEEDED]` Which of the v1.0 demo dependencies graduate to "day-one curated" vs stay as a tested-but-not-mirrored exemplar. Default: graduate everything used by ≥ 2 demo games.
