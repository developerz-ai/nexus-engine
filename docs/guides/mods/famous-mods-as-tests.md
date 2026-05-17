<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Famous Mods as Tests

> If Counter-Strike-on-Nexus could happen, what does the engine need to support? Table mapping famous mod precedents to specific Nexus capabilities. The aspirational bar: ALL of these must be possible on Nexus, in months not decades.

## The Bar

| Mod (origin) | Why it matters | Nexus capability needed | Spec / status |
|---|---|---|---|
| Counter-Strike (Half-Life) | A mod became a standalone esport. The proof that TCs can reshape an industry. | Total conversion + new net code genre layer + entry-point override | `docs/specs/mods/total-conversions.md` ✓ |
| DotA (WarCraft III) | A mod-of-a-mod spawned a genre (MOBA). | Total conversion + genre module composition | `docs/specs/mods/total-conversions.md` ✓ |
| S.T.A.L.K.E.R. Anomaly | TC keeps a 15-year-old game alive. | Long-term SDK stability + asset overlay + total conv | `docs/specs/mods/sdk.md` ✓, `asset-overlay.md` ✓ |
| Counter-Strike on HL → standalone | Engine licensee + standalone product path | Branding rules + game_id isolation + ladder/anticheat split | `total-conversions.md` ✓ |
| Garry's Mod (Source) | Sandbox of sandboxes; mods of mods; emergent toolkit. | Cap broker permitting general-purpose spawn + script + asset combine | `docs/specs/scripting/sandbox.md` ✓, SDK ✓ |
| Minecraft Forge / Fabric | Stable mod loader against a moving game. | SDK semver promise + compat shim one major back | `docs/specs/mods/sdk.md` ✓ |
| Minecraft modpacks (CurseForge / Modrinth) | Curated bundles of N mods that "just work." | Dep resolver + lockfile + portable profile | `dependencies.md` ✓, `players/profiles.md` ✓ |
| Skyrim SKSE | Native code extending the game. | `[DECISION NEEDED]` WASM tier for v2.0 | `native-mods.md` (decision pending) |
| Skyrim Wabbajack lists | One-click install of N mods in deterministic order. | Lockfile + load-order spec + asset-overlay priority | `dependencies.md` ✓, `load-order.md` ✓, `players/sharing-saves.md` ✓ |
| Skyrim Nexus Mods + Vortex | Dependency-aware manager UX. | Federated mod browser + per-save profiles | `players/install.md` ✓, `players/profiles.md` ✓ |
| Factorio Space Exploration | Massive content pack + new systems + balance overhaul. | Behavior tier with high cap budget + cross-mod overlays + library mods | `docs/specs/mods/manifest.md` ✓, `asset-overlay.md` ✓ |
| Factorio mod portal | First-class lockstep mod-set in MP. | Multiplayer hash agreement + server whitelist | `multiplayer-sync.md` ✓ |
| RimWorld Combat Extended | Massive ECS-altering mod with library deps. | Cap broker permitting WorldWrite<*> at behavior tier + lib mods | sandbox ✓, sdk ✓ |
| ARMA mods (DayZ, Wasteland) | Eventually became standalone games. | TC path + asset replacement + server policy | TC ✓ |
| Doom WAD mods (1993–today) | Asset overlay invention; modding originator. | Asset overlay (replace/patch) | `asset-overlay.md` ✓ |
| Quake mods | Server-side mod loading via QuakeC. | Server-side mod whitelist + scripting sandbox | `multiplayer-sync.md` ✓ |
| TF2C / Open Fortress | Source mod community keeping engines alive | Long-term engine LTS + community-driven publishing | self-hosted ✓ |
| StarCraft custom maps → Tower Defense genre | Editor + scripting birthed genres. | Editor exposing scripting cap; mod browser | `editor.md` ✓ |
| StarCraft Brood War MBS / SC:R | Modders fixing decades-old quality-of-life | Asset overlay + behavior tweaks | overlay ✓ |
| KOTOR Restored Content Mod | Years of community effort restoring cut content. | Save migration + cap-attenuated patch packs | save-compat ✓ |
| Fallout New Vegas (TTW: Tale of Two Wastelands) | Total conversion combining two games' content. | TC + cross-game asset namespacing | TC ✓ + `[DECISION NEEDED]` cross-game UUIDs |
| World of Warcraft AddOns (Lua) | Trusted in-process scripting at scale. | Lua tier (trusted) + telemetry + UI | `lua.md` ✓ |
| Bethesda Creation Kit ecosystem | Editor as content pipeline. | Editor + mod publish dialog | `editor.md` ✓ |
| Cities: Skylines workshop | Massive cosmetic + functional mod economy on Workshop. | Steam Workshop adapter + sub-sync | `steam-workshop.md` ✓ |
| Stardew Valley SMAPI | Permissive open mod loader on a closed source game. | Library mods + dep tracking | library template ✓ |
| Half-Life 2 Garry's Mod scripting | Lua-in-game; physics sandbox. | Behavior tier + physics raycast SDK | `sdk.md` `nexus.mod.physics` ✓ |
| Source filmmaker | Engine asset reuse for new media. | Asset registry export + sandboxed render | `assets/registry.md` ✓ + editor ✓ |
| Roblox UGC / Studio | Capability-secured scripting at scale. | Cap broker | sandbox ✓ |
| Mount & Blade Bannerlord mods | Heavy data + script combo, dep ecosystem. | Library + dep resolver | dependencies ✓ |
| Project Zomboid mods | Single-VM script ecosystem, large content pack culture. | Behavior tier + perf budget tuning | sdk ✓ + perf ✓ |
| Dwarf Fortress LNP (Lazy Newb Pack) | Bundle of N mods + configs for friction-free start. | Profile bundles + share saves | profiles ✓ + sharing-saves ✓ |
| EVE Online ESI / third-party tools | Out-of-game data layer; future mod-aware ecosystem | `Net` cap when v1.1 ships | `[DECISION NEEDED]` `Net` cap design |
| Subnautica mods (BepInEx-based) | Active modding on a non-modder engine, by hacking | Native code injection — engine v2.0 WASM target | `native-mods.md` (decision pending) |
| Cyberpunk 2077 Redmod (official mod tool) | Late-added official toolchain. | Day-one shipping = no late-add tax | overview ✓ "first-class" |
| Lethal Company (Thunderstore) | Brand-new game with thriving mod scene week 1. | Easy CI publish + Thunderstore adapter + permissive sandbox | thunderstore.md ✓ + sandbox ✓ |
| Vampire Survivors mods | Tiny, fast iteration, asset-heavy. | `nexus mod watch` + hot reload + AI asset gen | hot-reload ✓ + ai-assisted ✓ |
| Beat Saber custom songs + mods (BMBF) | Player-created content as engine content. | Asset overlay + content moderation hooks | overlay ✓ + nsfw ✓ |
| Skyrim Special Edition adult mods (LoversLab) | NSFW community surviving alongside non-NSFW. | NSFW gate + opt-in browser filter | `nsfw-and-moderation.md` ✓ |
| Quake mods on modern engines (Quake Remaster) | Old mods running on new engine via compat shim. | Engine ↔ SDK compat shim | sdk shim ✓ |
| Modular cars in Beam.NG | Engine-aware data-driven asset packs. | Asset registry + per-asset overlay | registry ✓ |

## What's Missing

Cases the engine does NOT yet fully support; tracked as decisions:

| Mod precedent | Gap | Spec |
|---|---|---|
| Skyrim SKSE (native code) | No native code tier in v1.0 | `native-mods.md` `[DECISION NEEDED]` v2.0 |
| Garry's Mod-style raw asset slurp at runtime | `Fs` cap deliberately denied | sandbox ✓ (by design) |
| Mods that need outbound network (server queries, multiplayer pals) | `Net` cap reserved v1.1 | sandbox `[DECISION NEEDED]` |
| Cross-game library mods (one lib used by 10 games) | Namespacing for engine-namespaced UUIDs | `asset-overlay.md` `[DECISION NEEDED]` |
| Mods that modify engine itself (e.g., new render pipeline) | Engine internals NOT exposed | by design; use genre modules / engine PRs |

These are deliberate; not bugs. Each has a documented path forward (decision pending or alternative pattern).

## How To Use This Doc

- **Spec author**: when designing a new mod feature, scan this table. If you can't say "yes, X precedent works on Nexus," you have a spec gap.
- **Marketplace work**: this table identifies which marketplaces real famous mods come from — informs adapter priority.
- **Onboarding modders**: point them at the closest precedent.
- **AI agent (`nexus-coder`)**: use the table to classify a vague prompt ("I want my mod to be like SKSE") and route to the right template + caps.
- **Game studios**: validate "is our game's modding story complete?" by asking "could the next Counter-Strike happen here?"

## The Aspiration

Skyrim took 10+ years for its modding ecosystem to mature. Minecraft took 5. Factorio took 3. Lethal Company took 3 weeks.

Pattern: better tooling collapses the timeline. Nexus targets **months from launch** to thriving mod ecosystem for new games. The pieces above are how.

## Cross-Links

- → `docs/specs/mods/overview.md` — the philosophy.
- → `docs/specs/mods/total-conversions.md`
- → `docs/specs/mods/sdk.md`
- → `docs/specs/mods/multiplayer-sync.md`
- → `docs/specs/mods/native-mods.md`
- → `docs/guides/mods/authoring/ai-assisted.md` — the "build the next CS in a weekend" path.
- → `docs/guides/mods/marketplaces/decision-matrix.md`
