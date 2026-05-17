<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Xbox Series X|S

**[PARTIAL — public info only. Full pipeline is NDA-gated.]**

Microsoft ID@Xbox program (free for indies). Microsoft GDK SDK. Submission via Partner Center. Xbox Live mandatory for online features. Game Pass eligibility possible.

Authoritative (public):
- https://www.xbox.com/en-US/developers/id
- https://learn.microsoft.com/gaming/gdk/

---

## Public path

| Step | Action |
|------|--------|
| 1 | Apply to ID@Xbox at https://www.xbox.com/en-US/developers/id |
| 2 | If approved, sign program agreement (NDA-protected portions) |
| 3 | Receive Xbox devkit (loaner kit, free to ID@Xbox members) |
| 4 | Download GDK and Xbox-specific SDK from Partner Center |
| 5 | Port game; use GDK APIs for Xbox Live, achievements, GameSave |
| 6 | Submit via Partner Center → cert pass |
| 7 | Set up Microsoft Store / Xbox Store listing |
| 8 | Launch |

Timeline: 3-9 months once devkit in hand. ID@Xbox is the most accessible console program — Microsoft actively recruits indies.

---

## ID@Xbox vs Microsoft Store PC

| | Microsoft Store (PC) | ID@Xbox (Xbox console) |
|--|---------------------|------------------------|
| Cost | $19/$99 Partner Center fee | Free for approved members |
| SDK | Standard Windows + optional GDK | GDK + Xbox-specific (NDA pieces) |
| Approval | Open submission | ID@Xbox application review |
| Cut | 12% | 30% (rumored — not publicly confirmed) |
| Devkit | not needed | yes, loaner provided |

PC-only release: use `docs/guides/release/microsoft-store.md`.
Console: this doc.

---

## [NDA — devkit-only]

NDA-protected:
- Xbox-specific GDK APIs (XGameRuntime, XLive, XStore extensions)
- Devkit hardware specifics
- Cert (XR) full checklist
- PIX on Xbox profiling
- Specific Game Pass deal terms

GDK PC portion is **public**: https://learn.microsoft.com/gaming/gdk/_content/gc/get-started/setup-fundamentals/gr-setup-install
GDK PC includes Xbox Live + Game Save + Achievements that work on Xbox Live PC. Console-specific parts in GDKX (NDA).

---

## Nexus support strategy

Xbox Series is a **best-effort tier-2 platform** (→ `docs/initial/vision.md`). Path:
- Renderer: DX12 backend already in wgpu; Xbox uses DX12-X (NDA superset). Conditional compile.
- Audio: WASAPI/XAudio2 backend.
- Input: Xbox controller via Nexus HAL.
- Networking: standard UDP; Xbox Live for matchmaking optional.
- → `docs/specs/core/hal.md`.

PC ID@Xbox + GDK works without devkit for testing some features.

---

## Common dev questions

| Q | A (public) |
|---|-----------|
| Cost to apply? | Free. |
| Free devkit? | Yes (loaner) for approved ID@Xbox members. |
| Self-publish? | Yes via ID@Xbox. |
| Achievements? | Yes, Xbox Live achievements. Design in Partner Center. |
| Cross-play / cross-progression? | Allowed via your backend + Xbox Live. |
| Game Pass deal? | Negotiated separately; not automatic. |
| Cert difficulty? | Easier than PS5/Switch reportedly; XR (compliance) checklist published in GDK docs (PC parts public). |

---

## Game Pass

Eligibility is on Microsoft's discretion. Approach via your ID@Xbox account manager once you have a build. Game Pass is a fixed payout (negotiated), not revenue share; can be transformative for indies.

---

## When to apply

| Trigger | |
|--------|--|
| You have a buildable PC version | Easier port via shared GDK |
| Want unified PC + Xbox release | Single ecosystem |
| Indie scope; doesn't need AAA cert team | ID@Xbox supports indies actively |
| Game Pass interest | Pitch early |

---

## Cross-links

- Microsoft Store (PC) → `docs/guides/release/microsoft-store.md`
- Vision (Platform Targets) → `docs/initial/vision.md`
- HAL → `docs/specs/core/hal.md`
- Other consoles → `docs/guides/release/switch.md`, `docs/guides/release/playstation.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
