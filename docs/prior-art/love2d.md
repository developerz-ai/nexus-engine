<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# LÖVE (Love2D)

> The gold standard of onboarding: a single binary, a `main.lua`, a `love.draw()` function — and you have a game. Twenty years of evidence that radical simplicity is a feature, not a limitation.

## Snapshot

| | |
|---|---|
| Language | Lua (LuaJIT on most platforms) for users; C++/SDL core |
| License | zlib (permissive, OSS-compatible) |
| Status | Active, 11.x stable, 12.x in development |
| Since | 2008 |
| Repo | https://github.com/love2d/love |

## What Nexus Borrows ✓

- **The `main.lua` covenant.** Drop one file with `love.load()` / `love.update(dt)` / `love.draw()` into a folder, drag onto the LÖVE binary — game runs. **Best zero-to-running-game story of any engine, ever.** Nexus `nexus run path/to/file` must hit the same target → `docs/game-template/cli.md`, `docs/game-template/weekend-mvp.md`.
- **No installer, single binary distribution.** `.love` files are renamed zips. Cross-platform: Windows, macOS, Linux, Android, iOS — same binary semantics. Nexus packaging model → `docs/game-template/cli.md`.
- **Lua as scripting.** Tiny runtime, fast (LuaJIT), forgiving syntax, easy to embed. Validates Nexus choice of Lua for game logic → `docs/specs/scripting/lua.md`.
- **Callback-based API.** `love.keypressed(key)`, `love.mousemoved(x,y,...)` — no event objects, no listener registration boilerplate, just define a function. Nexus exposes high-level "just define a function" sugar via scripting layer → `docs/specs/scripting/overview.md`.
- **Frame loop as the only mental model for beginners.** No ECS knowledge required to ship a Pong clone. Nexus must preserve a beginner mode where ECS is invisible → `docs/specs/agent/semantic.md`, `docs/game-template/weekend-mvp.md`.
- **Documentation as a wiki (love2d.org/wiki).** Every function has its own page, runnable example, community-edited. Nexus docs site adopts the per-function-page pattern.
- **Mobile + web support without architectural changes.** `love.js` exists; iOS/Android ports active. Nexus WASM target → `docs/architecture/00-vision.md`.
- **Community: itch.io jam-friendly.** LÖVE is the most-used jam framework. Lesson: optimize for the 48-hour project, the AAA path emerges from it.

## What Nexus Avoids ✗

- **No 3D.** LÖVE is 2D-only. Has 3D via community libraries (love3d, g3d), but never first-class. Nexus is 3D-first, with 2D as a style/projection → `docs/specs/styles/2d.md`, `docs/specs/styles/pbr.md`.
- **No scene editor.** Pure code-first. Fine for jams, painful past 10k LOC. Nexus ships editor v1 → `docs/specs/editor/overview.md`.
- **No ECS, no entity model.** Users roll their own (commonly `hump.class` or `concord`). Inconsistent ecosystem patterns. Nexus provides ECS as the default → `docs/specs/core/ecs.md`.
- **No asset pipeline.** Just load PNGs/OGGs at runtime. Fine at jam scale, fatal at AAA. Nexus has full asset pipeline → `docs/specs/assets/overview.md`.
- **No networking primitive.** LÖVE has sockets; everything else is user code (`enet-lua`, etc.). Nexus ships rollback + replication → `docs/specs/networking/overview.md`.
- **No headless mode.** LÖVE always opens a window; no agent-friendly operation. Nexus inverts → `docs/specs/agent/headless.md`.
- **No physics-grade tooling.** Box2D bindings exist but no constraint editor, no debug view beyond what users build. Nexus integrates Rapier + editor debug draw → `docs/specs/physics/overview.md`.

## Architectural Lessons

1. **Onboarding compounds.** The minute saved on every first-tutorial is multiplied across millions of new users. LÖVE's `love.draw()` is worth more than any feature.
2. **A single binary that runs anything is a UX superpower.** No installer, no SDK, no project file. `nexus run game.lua` must work.
3. **Permissive license + small binary + great docs = community velocity.** LÖVE punched above its weight for 17 years on this combo.
4. **Beginner-mode and AAA-mode must coexist.** LÖVE has only beginner-mode; the cliff to "real game" is steep. Nexus must provide both, with a smooth gradient between.
5. **Callbacks are friendlier than event objects for beginners.** Provide both layers; default to callbacks in the scripting layer.
6. **Per-function wiki pages with runnable examples** beat narrative docs for reference material. Use both.
7. **Jam-friendliness is the gateway drug.** Every successful indie engine wins jams first; AAA usage follows.

## Direct Influence on Nexus

| LÖVE pattern | Nexus file |
|---|---|
| `main.lua` zero-config entry | `docs/game-template/cli.md`, `docs/game-template/weekend-mvp.md` |
| Single binary, no installer | `docs/game-template/cli.md` |
| Callback API for scripting | `docs/specs/scripting/lua.md`, `docs/specs/scripting/overview.md` |
| `.love` zip packaging | `docs/game-template/cli.md` |
| Per-function wiki docs | `docs/specs/agent/api.md` (doc generation) |
| Beginner-mode preservation | `docs/specs/agent/semantic.md`, `docs/game-template/weekend-mvp.md` |
| Mobile + web parity | `docs/architecture/00-vision.md` |
| (gap) no 3D | `docs/specs/renderer/overview.md`, `docs/specs/styles/2d.md` |
| (gap) no editor | `docs/specs/editor/overview.md` |
| (gap) no ECS | `docs/specs/core/ecs.md` |

## References

- Repo: https://github.com/love2d/love
- Official site: https://love2d.org/
- Wiki (model documentation site): https://love2d.org/wiki/Main_Page
- "A Guide to Getting Started with Love2D" (Ebens): https://ebens.me/posts/a-guide-to-getting-started-with-love2d/
- Hacker News (Sept 2023): https://brianlovin.com/hn/37494275
- LÖVE 2D framework overview: https://www.javascriptdoctor.blog/2026/04/love-2d-game-framework-thats-taking.html
- Codédex tutorial: https://www.codedex.io/projects/get-started-with-love2d-and-lua
