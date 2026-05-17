<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Economy — Marketplace Cut Comparison

> Side-by-side platform cuts. `[VERIFY]` everything; marketplace policies change. Numbers as of 2026 snapshot.

## Quick Table

| Channel | Paid mods supported | Platform cut on paid | Donation / tip cut | Notes |
|---|---|---|---|---|
| Steam Workshop | mostly no (since 2015) | n/a | n/a (external donate links) | Paid mods experiment discontinued |
| Mod.io | yes, per game contract | varies (set per game) | varies | Cross-platform; consoles |
| Thunderstore | no | n/a | 0% (donation pass-through) | Tipping via author's external links |
| Nexus Mods | no direct paid mods | n/a | 0% (DP pool, Nexus-funded) | Donation Points program |
| CurseForge / Overwolf | yes (points system) | per Overwolf | varies | Modpacks support tiered models |
| itch.io | yes (author-set 0–100%) | 0% min, 100% max — author chooses | 0% min | Most author-favorable paid model |
| Self-hosted | yes (your processor) | 0% engine; 2-3% processor (Stripe etc.) | 0% engine | Your terms entirely |
| nexus-hub `[DECISION NEEDED]` | n/a (pointer-only) | n/a | n/a | If shipped, hub never touches money |

All values `[VERIFY — marketplace policy changes]`.

## Detailed Breakdown

### Steam Workshop

- **Paid mods experiment (Apr 2015)**: launched with 25/75 author/Valve+publisher split. Withdrawn within a week after community backlash.
- **Skyrim Creation Club (curated, first-party only)**: Valve + Bethesda curated; not open Workshop.
- **Current status**: Workshop items overwhelmingly free; engine refuses to mark Workshop items as paid in `nexus mod publish`.
- **Donation route**: external links in description, subject to Steam TOS. `[VERIFY]`.

### Mod.io

- **Per-game contracts**: studio negotiates with mod.io for revenue model.
- **Console-friendly**: mod.io has been through PSN / Xbox / Switch cert; one of few options for paid console mods.
- **Cut**: declared per game; transparent in mod card.
- **Refunds**: per game policy, mod.io enforces window.
- `[VERIFY — current commission structure]`.

### Thunderstore

- **No paid mods**: by design.
- **Tipping**: author's external links in description; 0% cut by Thunderstore.
- **Community grants**: some communities (e.g., Risk of Rain 2) crowdfund author rewards externally.

### Nexus Mods

- **No paid mods directly**: by design.
- **Donation Points (DP)**: Nexus Mods funds a monthly cash pool (declared by Nexus). Mods earn DP based on download metrics; DP convert to cash on a schedule.
- **DP cut**: 0% by Nexus on author cashout (Nexus funds the pool out of its own subscription revenue).
- **Collections**: mod authors may participate in revenue sharing on premium collections. `[VERIFY]` current rules.

### CurseForge / Overwolf

- **Points system**: players earn / spend Overwolf points; authors earn revenue from points.
- **Modpacks**: tiered premium models possible.
- **Cut**: Overwolf takes a portion; author gets the rest. `[VERIFY — exact split]`.
- **Notes**: ecosystem heavily Minecraft-centric.

### itch.io

- **Author-set cut**: itch.io lets the author decide what % itch.io keeps (default 10%, range 0–100%).
- **Pay-what-you-want**: first-class.
- **Refunds**: per author policy.
- **Tipping**: built in.
- **Strength**: most author-favorable terms in the industry.

### Self-Hosted

- **Engine cut**: 0%.
- **Processor cut**: 2.4–3.4% + per-transaction fee (Stripe/Paddle/etc.).
- **Compliance burden**: VAT, refunds, fraud — you own.
- **Strength**: full control; no platform veto.

## Practical Decision Table

| Author goal | Recommended channel |
|---|---|
| Maximize revenue per sale | itch.io (low fees) or self-hosted |
| Maximum reach for paid mod | Mod.io (cross-platform) |
| Maximum reach for free mod | Steam Workshop + Mod.io + self-hosted |
| Console paid mod | Mod.io |
| Donation-driven only | Nexus Mods (DP) + Ko-fi link everywhere |
| Subscription | Patreon (off-platform) + free mod on marketplaces |

Multi-publish is the norm; choose monetization per channel.

## Honest Math

For a $4.99 mod selling 1,000 copies:

| Channel | Author per sale | Author total |
|---|---|---|
| itch.io (10% cut) | $4.49 | $4,490 |
| Mod.io (varies, assume 10%) | $4.49 | $4,490 |
| Self-hosted (3% processor) | $4.84 | $4,840 |
| Steam Workshop (n/a, paid mods discontinued) | n/a | n/a |
| CurseForge (varies; assume 20%) | $3.99 | $3,990 |

Self-hosted wins on per-sale, loses on discovery. Pick based on YOUR audience.

## Update Frequency

This table changes. `[VERIFY]` annually. Engine ships a `nexus mod economy update-check` command that pulls the latest marketplace policies (community-maintained JSON) and warns on drift.

## Cross-Links

- → `overview.md`
- → `paid-mods.md`
- → `free-mods.md`
- → `docs/guides/mods/marketplaces/decision-matrix.md`
- → Per-marketplace docs in `docs/guides/mods/marketplaces/`.

## Sources

- Steam Workshop paid mods retraction announcement (Apr 2015) — `steamcommunity.com/games/SteamWorkshop/announcements/detail/208632365677404377`. `[VERIFY URL]`.
- itch.io revenue split: `itch.io/docs/creators/getting-started`. `[VERIFY]`.
- Mod.io: per-game contracts, see `docs.mod.io`. `[VERIFY]`.
- Nexus Mods DP: `help.nexusmods.com/article/41-donation-points-system`. `[VERIFY]`.
- Stripe pricing: `stripe.com/pricing`. `[VERIFY]`.
