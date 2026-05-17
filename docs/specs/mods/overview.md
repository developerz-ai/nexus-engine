<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Overview

> Every Nexus game ships moddable to 100% by default. Cosmetic mods zero-friction. Gameplay mods consent-gated. Total conversions permitted and celebrated. Engine takes no cut. Modders own their work. Players own their experience.

## Boundaries
- Owns: mod system philosophy, the three power tiers, default-on policy, cross-link map to every other mod spec.
- Does NOT own:
  - Capability enforcement → `docs/specs/scripting/sandbox.md`
  - VM internals → `docs/specs/scripting/rune.md`
  - Trusted Lua game logic → `docs/specs/scripting/lua.md`
  - Asset registry / UUID → `docs/specs/assets/registry.md`
  - Multiplayer trust → `docs/specs/networking/anticheat.md`
- Depends on: every spec under `docs/specs/scripting/**` and `docs/specs/assets/**`.

## The Critical Principle

A Nexus game ships with 100% mod power by default. This is non-negotiable.

| Mode | Player friction | Engine policy |
|---|---|---|
| Offline solo | Zero. No prompts. Install and play. | All caps auto-granted (cosmetic + gameplay) on user-initiated install. |
| Online co-op (private) | One consent dialog at first run. | Server (host) declares mod whitelist. |
| Online competitive | Consent dialog + server policy. | Server-authoritative whitelist; mismatch = reject session. |
| Total conversion | Treated as separate game. | Own ladder, own saves, own anti-cheat domain. |

The engine never blocks a mod from being made. The engine never takes a cut. The engine never demands a marketplace account.

## The Three Power Tiers

| Tier | Touches | Default caps | Multiplayer | Example |
|---|---|---|---|---|
| **Skin** | Assets only (textures, meshes, audio, fonts, icons). No script. | `AssetRead`, asset-overlay write. | Always permitted; not anti-cheat relevant. | Reskin dragon. New UI theme. Pixel font pack. |
| **Behavior** | Scripts (Rune VM) + assets. Sandboxed. | Skin caps + `WorldRead`, `WorldWrite`, `EventEmit`, `EventSubscribe`, `Rng`, `Persist`, `Log`. | Per-server whitelist. Client-cosmetic-only auto-trusted. | New weapon. Stat tweak. Quest pack. AI behavior. |
| **Total Conversion** | Entry-point override. Replaces base game scenes/scripts/genre layer wholesale. | All Behavior caps + `SemanticSpawn` + entry-point replacement. | Own ladder. Engine treats as a different `game_id`. | Counter-Strike on HL. DotA on WC3. SkyrimVR overhaul. |

Power tier is declared in `mod.toml::[mod].tier`. Engine refuses to load a mod whose script reach exceeds its declared tier. → `package-format.md`.

## What "100% Power" Means

| Surface | Skin | Behavior | Total Conv |
|---|---|---|---|
| Replace any asset by UUID | ✓ | ✓ | ✓ |
| Add new entities / components / systems | ✗ | ✓ | ✓ |
| Hook lifecycle events | ✗ | ✓ | ✓ |
| Override engine subsystem (renderer style, physics tweak) | ✗ | via genre module | ✓ |
| Replace the game's entry point | ✗ | ✗ | ✓ |
| Ship a new genre module | ✗ | ✓ (sandboxed) | ✓ (replaces) |
| Read/write the save file | ✗ | with `Persist` + player consent | ✓ |
| Outbound HTTP | ✗ (v1.0) | reserved v1.1 with allowlist | reserved v1.1 |
| Filesystem outside mod dir | ✗ | ✗ | ✗ |
| Subprocess / shell | ✗ | ✗ | ✗ |

The "✗" rows are the hard limits set by `docs/specs/scripting/sandbox.md`. Everything else: yes, always, by design.

## Consent Model (Quick)

| Trigger | Action |
|---|---|
| Mod requests only Skin caps | Install silently. No prompt. |
| Mod requests Behavior caps | Single grouped dialog: "this mod will modify <Health, Inventory>; emit <quest.complete>; persist 4 KB. Allow / Allow once / Deny." |
| Mod requests `Persist` to a save tagged "competitive" | Extra prompt: "save will be marked modded; competitive ladder eligibility may be removed." |
| Mod requests cap added in a version bump | Re-prompt at update install. |
| Accessibility mod (declared in manifest) | Auto-approved everywhere. → `accessibility.md`. |

Full grant flow: → `docs/specs/scripting/sandbox.md` (canonical) and `permissions.md` (mod-side UX contract).

## The Doc Map

```
specs/mods/
├── overview.md              ← you are here
├── package-format.md        ← .nxmod layout, signing, hashes
├── manifest.md              ← mod.toml schema
├── sdk.md                   ← stable API surface, semver
├── dependencies.md          ← resolver, lockfile, conflicts
├── load-order.md            ← deterministic ordering
├── asset-overlay.md         ← virtual FS, UUID remap
├── lifecycle.md             ← install→enable→update→uninstall
├── save-compatibility.md    ← save + mod-set contract
├── multiplayer-sync.md      ← server whitelist, hash agreement
├── total-conversions.md     ← entry-point override
├── hot-reload.md            ← edit→see live
├── native-mods.md           ← [DECISION NEEDED] WASM tier for v2.0
├── permissions.md           ← consent UI contract
├── anti-cheat.md            ← trust tiers per power tier
├── accessibility.md         ← elevated default permissions
├── nsfw-and-moderation.md   ← gates, blocklist, takedown
└── telemetry.md             ← opt-in author analytics

guides/mods/
├── overview.md              ← distribution decision matrix
├── marketplaces/            ← per-store integration guides
├── authoring/               ← creator workflows
├── players/                 ← end-user UX
└── economy/                 ← free / paid / legal
```

## Non-Negotiables

1. **Modding is first-class.** Not an afterthought. Every engine API has "is this safely mod-callable?" answered in its spec.
2. **The sandbox is mandatory.** `docs/specs/scripting/sandbox.md` is canonical. No spec under `mods/` may relax a capability rule it sets.
3. **MIT default.** Engine code is MIT. Default mod license template is MIT. Authors may pick any OSI license or proprietary.
4. **AI may author mods.** `nexus-coder` builds mods end-to-end. → `docs/guides/mods/authoring/ai-assisted.md`.
5. **No marketplace lock-in.** `nexus mod publish` supports N marketplaces in one command. Self-hosted is a first-class target.
6. **Deterministic with mods loaded.** Same mod-set + same seed + same input = same state. → `docs/specs/scripting/rune.md` § Determinism.

## Aspirational Bar

| Mod | Engine capability needed | Status |
|---|---|---|
| Counter-Strike on Half-Life | Total conversion + new netcode genre layer | Spec-supported, → `total-conversions.md` |
| DotA on WC3 | Total conversion + new genre (MOBA already in core) | Spec-supported |
| Garry's Mod on Source | Total conv + arbitrary sandbox + asset slurp | Spec-supported, → `total-conversions.md` |
| Minecraft mod loader (Forge/Fabric) | SDK semver + load order + dep resolution | Spec-supported, → `sdk.md`, `dependencies.md` |
| Skyrim SKSE | Native code injection | `[DECISION NEEDED]` v2.0 via WASM tier → `native-mods.md` |
| Factorio Space Exploration | Massive content pack + new systems + balance | Spec-supported via Behavior tier |

Full mapping: → `docs/guides/mods/famous-mods-as-tests.md`.

## Integration Points

- → `docs/specs/scripting/sandbox.md` — capability catalog (canonical).
- → `docs/specs/scripting/rune.md` — VM per mod.
- → `docs/specs/scripting/hotreload.md` — reload pipeline.
- → `docs/specs/assets/registry.md` — UUID + DAG for asset overlay.
- → `docs/specs/networking/anticheat.md` — trust tiers.
- → `docs/specs/coder/workflows.md` — `nexus-coder` mod authoring workflow.
- → `docs/specs/agent/scenarios.md` — test harness for mods.

## Open Questions

- `[DECISION NEEDED]` Default policy for unsigned mods in `--ship` builds: warn / refuse / allow with banner?
- `[DECISION NEEDED]` Whether engine ships a first-party federated index (`nexus-hub`) → `docs/guides/mods/marketplaces/nexus-hub.md`.
- `[AGENT: 23]` Add `mod-author` and `mod-curator` subagents to the fleet.
- `[AGENT: 18]` Confirm `nexus-coder` exposes `mod-from-prompt` workflow.
- `[AGENT: 22]` Confirm liveops feature-flags can scope per-mod.
