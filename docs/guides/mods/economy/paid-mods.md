<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Economy — Paid Mods

> Opt-in per game. Pricing models: one-time, subscription, pay-what-you-want. Revenue split favors creator by default. Refund policy mandatory. Engine takes 0%.

## When To Allow Paid Mods

Per `Nexus.toml::[mods.economy].allow_paid_mods`. Default: `false`.

Game studio decides. Considerations:
- Paid mods bring quality investment + content drops + sustained authoring.
- Paid mods risk fragmenting community goodwill (2015 lesson).
- Paid mods need refunds, fraud handling, takedown response.
- Some genres tolerate paid mods better than others (sims, RPGs > competitive MP).

If you allow, you set the floor: split, refund window, currency, dispute escalation. Engine enforces your declared rules.

## Pricing Models

```toml
[economy]
pricing = "one-time"            # one-time | subscription | pwyw | bundle
price = 4.99
currency = "USD"
```

| Model | Best for | Refund expectations |
|---|---|---|
| One-time | Content packs, total conversions, large items | 14-day standard |
| Subscription | Live-service mods (monthly content) | Cancel-anytime |
| Pay-what-you-want | Small mods, "support" model | Author discretion |
| Bundle | Mod author's collection sold together | Mirror underlying mods |

## Revenue Split (engine default)

```toml
[mods.economy]
revenue_split_default = { author = 0.80, game = 0.15, platform = 0.05 }
```

| Recipient | Cut | Rationale |
|---|---|---|
| Author | 80% | Creator does the work; share reflects it |
| Game studio | 15% | Studio owns the IP and player base |
| Marketplace | 5% | Platform processing |

Reality check: marketplace cut is set by the marketplace, not the engine. Engine enforces the author / game split AFTER the platform takes its share. → `marketplace-cut-comparison.md`.

## Per-Mod Split Override

Game studio can let authors negotiate per mod:

```toml
[economy.split]
author = 0.85
game = 0.10
platform = "marketplace-takes-rest"
```

Validates against the game's policy floor. Engine refuses a split that goes below the policy minimum.

## Refunds

```toml
[mods.economy]
refund_window_days = 14
refund_conditions = ["unused", "broken", "removed"]
```

- **unused**: refunded automatically if play-time < 2h.
- **broken**: refunded if mod fails to load on player's engine version (auto-detected).
- **removed**: refunded if marketplace takes down the mod within `refund_window_days`.

Refund flow happens at the marketplace. Engine signals eligibility; player initiates.

## Dispute Resolution

Game studio decides:

```toml
[mods.economy.disputes]
contact = "support@mygame.com"
escalation = "marketplace"                # marketplace | publisher | community
chargeback_policy = "marketplace"         # who absorbs?
```

Engine never resolves disputes; it routes them.

## Anti-Fraud

Engine builds in:
- Per-author velocity limits (no flood-publishing variants to game the algorithm).
- Hash collision detection (re-uploaded copies of the same mod under a different name flagged).
- Marketplace reports surfaced.
- Player-side: refund history; abusive refund patterns reported to marketplace.

Marketplace owns the legal anti-fraud floor; engine adds engine-side signals.

## Paid + Free Tier Mix

A mod can have free + paid versions:

```toml
[economy]
free_tier = true
paid_tier = { pricing = "one-time", price = 4.99, extras = ["advanced-features", "extra-assets"] }
```

Engine surfaces both; player picks. Mod author scripts the "is paid" check via the engine SDK:

```rune
if env.cap::<Persist>()?.has_paid_unlock() {
    // ... advanced features
}
```

`has_paid_unlock` checks the marketplace's entitlement record; engine doesn't store payment data itself.

## Honest Pricing UI

```
+----------------------------------------------------------+
| Survival Overhaul Pro — $4.99                            |
|                                                          |
| Buy via Mod.io.                                          |
| 14-day refund. Play-time under 2h refunded automatically.|
|                                                          |
| Revenue split:                                           |
|   Author (greenstudios):           80%                  |
|   Game studio (MegaCorp):          15%                  |
|   Mod.io platform:                  5%                  |
|                                                          |
|  [Buy on Mod.io]   [Try Free Tier]                       |
+----------------------------------------------------------+
```

Splits visible. Refund policy clear. No surprise upsells.

## Platform Differences

| Marketplace | Paid mods supported | Engine adapter |
|---|---|---|
| Steam Workshop | mostly no (2015) | engine refuses paid publish |
| Mod.io | yes, per-game contract | adapter supports |
| Thunderstore | none (donation only) | engine refuses paid publish |
| Nexus Mods | none direct, DP only | engine treats as free + DP |
| CurseForge | varies (points/Overwolf) | adapter best-effort |
| itch.io | yes (0–100% author-set cut) | adapter supports |
| Self-hosted | yes (your processor) | adapter supports via custom hook |

Mixed-marketplace paid mod: publish paid on stores that allow it, free on others. Engine `--to` flags can vary.

## Self-Hosted Paid Mods

```toml
[economy]
pricing = "one-time"
price = 4.99
processor = "stripe"                    # stripe | paddle | lemonsqueezy | gumroad | custom
processor_endpoint = "https://payments.mygame.com/mods/healing-pack"
```

Engine adapter calls `processor_endpoint` for entitlement check before unlocking download. You run the processor; engine ferries the entitlement.

## Compliance

- VAT / sales tax: handled at the payment processor / marketplace.
- GDPR: minimum personal data collected for purchase; engine never touches it.
- Age-gates on paid mods inherit the player's marketplace verification (→ `docs/specs/mods/nsfw-and-moderation.md`).

## The 2015 Lesson

Steam Workshop's paid-mods launch failed because:
- Authors got 25%; players felt cheated.
- "This used to be free" claims; provenance disputes.
- Refund handling absent.
- Opt-in for Valve, opt-out for community.

Engine's safeguards:
- Default revenue is 80% creator.
- Free is the default and never auto-flipped.
- Refund policy mandatory and visible.
- Hash + signature + provenance to spot rehosts.
- Player-side warning if a previously-free mod becomes paid.

## Pitfalls

- Setting price without enabling `allow_paid_mods` at game level → publish refused.
- Per-mod split below game floor → publish refused.
- Forgetting refund eligibility (`unused`) → player frustration.
- Paid mods on competitive servers where mods are gameplay-affecting: balance and fairness concerns; consider banning paid behavior mods on competitive ladders.

## Cross-Links

- → `overview.md`
- → `free-mods.md`
- → `marketplace-cut-comparison.md`
- → `legal.md`
- → `docs/guides/mods/marketplaces/decision-matrix.md`
- → `docs/specs/mods/manifest.md` — `[marketplace]` per-store config.
