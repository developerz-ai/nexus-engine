<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — PlayStation 5

**[PARTIAL — public info only. Full pipeline is NDA-gated.]**

Sony PartnerNet onboarding. Devkit acquisition through formal application. PKG submission via Sony's QA process. PSN integration mandatory for any online features.

Authoritative (public): https://partners.playstation.net

---

## Public path

| Step | Action |
|------|--------|
| 1 | Apply at https://partners.playstation.net — studio info, financials, prior shipped titles, business plan |
| 2 | Sign NDA → receive PartnerNet access |
| 3 | Order devkit (DevKit, TestKit) — pricing on-request |
| 4 | Download PS5 SDK from PartnerNet |
| 5 | Port the engine + game |
| 6 | Pass Sony's QA + cert (compliance) checks |
| 7 | Submit PKG via PartnerNet |
| 8 | Set up PS Store page, pricing, regional release |
| 9 | Launch |

Timeline: 6-18 months for first-time studio. Self-publishing program (PlayStation Indies / Pub Fund) available for selected indies.

---

## [NDA — devkit-only]

The following are NDA-protected and **not documented here**:
- PS5 SDK API surface (GNM/GNMX rendering, AGC2 audio, etc.)
- Devkit hardware specifics, prices
- PSN integration API (NP, Trophies, Activities, Game Help)
- Cert (TRC) checklist details
- Submission file formats specific
- Specific revenue share (commonly cited as 30%)

If you have devkit access, the PartnerNet has the complete documentation. Do not share publicly.

---

## Nexus support strategy

PS5 is a **best-effort tier-2 platform** for Nexus (→ `docs/initial/vision.md`). Path:
- Renderer wgpu abstraction doesn't reach PS5 (no Vulkan/Metal/DX12). Custom backend over Sony's GNM (NDA fork).
- Audio: custom HAL backend.
- Input: PlayStation controller via Nexus HAL (DualSense haptics via Sony APIs).
- Networking: UDP transport works; relay/matchmaking integrate with PSN.
- → `docs/specs/core/hal.md`.

When you have PartnerNet access, the Nexus PS5 backend repo can be shared under NDA terms.

---

## Common dev questions

| Q | A (public) |
|---|-----------|
| Indie path? | Yes — PlayStation Indies + self-publish via PartnerNet. |
| Devkit cost? | Not publicly stated; expect low thousands. |
| Required cert? | Sony cert (TRC). Multiple submission rounds typical. |
| Cross-play with PC/Xbox? | Allowed; integrate via your own backend. |
| PSN required? | For any online feature, yes. |
| Trophies? | Yes — design and submit via PartnerNet. |
| Region locked? | No, but submission per region (PEGI, ESRB, CERO, etc.). |

---

## When to apply

| Trigger | |
|--------|--|
| Shipped title on PC | Proves engine viability |
| Have funding for port + cert | Cert iterations can require fixes |
| Genre/scope fits PS5 audience | AAA-ish presentation favored; small indie has room via Indies program |
| Marketing aligned | PS Store discovery is meaningful |

If you're unproven: PC + Switch first (Switch is the more indie-friendly console). → `docs/guides/release/switch.md`.

---

## Cross-links

- Vision (Platform Targets) → `docs/initial/vision.md`
- HAL → `docs/specs/core/hal.md`
- Other consoles → `docs/guides/release/switch.md`, `docs/guides/release/xbox-console.md`
- PC stores (stepping stones) → `docs/guides/release/steam.md`, `docs/guides/release/itch-io.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
