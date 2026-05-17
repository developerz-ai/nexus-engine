<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Nintendo Switch

**[PARTIAL — public info only. Full pipeline is NDA-gated.]**

Nintendo Developer Portal required. Devkit acquisition through formal approval. NSP submission via Lotcheck. NSO (Nintendo Switch Online) integration optional.

Authoritative (public): https://developer.nintendo.com

---

## Public path

| Step | Action |
|------|--------|
| 1 | Apply at https://developer.nintendo.com/register — provide studio info, prior shipped titles or strong portfolio |
| 2 | Sign NDA + receive NDA-protected developer portal access |
| 3 | Request devkit purchase (NX-DEV / SDEV) — typically $450-$2,500 USD per unit, varies |
| 4 | Receive NDK (Nintendo Development Kit) — NDA-protected SDK + docs |
| 5 | Port game; Nintendo provides middleware bridging C++ engines |
| 6 | Build NSP, run Lotcheck (Nintendo's QA pass) via portal |
| 7 | Submit to eShop; pricing, schedule, regional setup |
| 8 | Launch |

Timeline: typically 6-12 months from application to launch for a first-time studio.

---

## [NDA — devkit-only]

The following are NDA-protected and **not documented here**:
- NDK API surface
- NSO matchmaking / friends / leaderboards API
- Switch graphics API (NVN — proprietary; no public mentions)
- Devkit hardware specifics
- Submission file formats beyond "NSP package"
- Lotcheck criteria details
- Specific revenue share (commonly cited as ~30% but Nintendo doesn't publish)

If you have devkit access, the developer portal has complete documentation. **Do not paste it anywhere public.**

---

## Nexus support strategy

Nexus core targets Switch as a **best-effort tier-2 platform** (→ `docs/initial/vision.md` Platform Targets table). Path:
- Renderer abstracts via wgpu where possible; Switch backend uses NVN via a thin in-house bridge (NDA-only fork).
- Audio uses CPAL where supported; Switch backend writes to audio HAL via NDK.
- Input maps via Nexus HAL gamepad abstraction. → `docs/specs/core/hal.md`.
- Networking via UDP + custom transport — no relay through Nintendo services without NSO integration.

When you have a devkit, the Nexus team can share the (NDA-protected) Switch backend repo on request, gated by Nintendo Approved Developer status.

---

## Common dev questions

| Q | A (public) |
|---|-----------|
| Cost to get a devkit? | Hundreds to low thousands USD; varies by request and country. |
| Can I self-publish? | Yes, Nintendo opened to self-publish for indies via the Developer Portal. |
| Required QA pass? | Yes, Lotcheck. Submit, address findings, re-submit. |
| Region split? | Single eShop submission with region toggles. |
| Cross-play with PC? | Allowed; integrate your own backend (not Nintendo's). |
| Cloud saves? | NSO Save Data Cloud (NDA-gated API). |
| Achievements? | No system-level Switch achievements. Track your own. |

---

## When to apply

| Trigger | |
|--------|--|
| Game has shipped on PC and is stable | Nintendo prefers proven titles |
| Genre fits Switch audience (indie, family, RPG, platformer) | Higher approval odds |
| Have budget for 6-12mo port work | Realistic timeline |
| Marketing prepared for eShop launch | Nintendo can boost good titles |

If you're an unknown dev with no shipped title: itch + Steam first. → `docs/guides/release/itch-io.md`, `docs/guides/release/steam.md`.

---

## Cross-links

- Vision (Platform Targets) → `docs/initial/vision.md`
- HAL → `docs/specs/core/hal.md`
- Other consoles → `docs/guides/release/playstation.md`, `docs/guides/release/xbox-console.md`
- PC stores (stepping stones) → `docs/guides/release/steam.md`, `docs/guides/release/itch-io.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
