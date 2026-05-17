<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Economy — Overview

> Nexus engine does not extract value from mod creators. MIT forever, no cut, no fees. Games built on Nexus may opt-in to creator-revenue features. Defaults favor the creator.

## The Engine's Stance

| | Engine |
|---|---|
| Takes a cut on mods | NEVER |
| Hosts a paid marketplace | NEVER |
| Requires an account | NEVER |
| Issues licenses | NEVER |
| Charges authors | NEVER |
| Charges players | NEVER |

Engine code is MIT, mod tooling is MIT, distribution adapters are MIT. The engine is infrastructure, not a tollbooth.

## What Games Can Opt Into

Per game, declared in `Nexus.toml::[mods.economy]`:

```toml
[mods.economy]
# Whether to enable paid mods at all for THIS game.
allow_paid_mods = false                # default

# If allow_paid_mods = true:
revenue_split_default = { author = 0.80, game = 0.15, platform = 0.05 }
refund_window_days = 14
currency = "USD"

# Tipping settings (free mods).
allow_tipping = true                   # default
tipping_destinations = ["ko-fi", "patreon", "github-sponsors", "liberapay", "open-collective"]

# Donation Points integration (Nexus Mods–style).
allow_dp_integration = false
```

Game studios choose the model. Engine ships the rails for both free + paid; defaults to free.

## Free Is the Default

Every template (`docs/guides/mods/authoring/templates.md`) ships with `tier` = free. Authors who want money:
1. Toggle `[marketplace.<store>].paid` or set a `[economy].price`.
2. Engine integrates with the chosen marketplace's monetization rail.
3. Author gets paid per the marketplace's terms.

The engine never sits between the player and the marketplace.

## The Four Lanes

| Lane | What it is | Doc |
|---|---|---|
| Free + donations | Default. Mod is free; tipping built in. | `free-mods.md` |
| Paid (opt-in per game) | Mod has a price; marketplace handles payment. | `paid-mods.md` |
| Marketplace-cut comparison | Side-by-side of platform cuts. | `marketplace-cut-comparison.md` |
| Legal | License inheritance, DMCA, safe harbor. | `legal.md` |

## Why Free Defaults Matter

The 2015 Steam Workshop paid-mods experiment failed because:
1. It was opt-in by Valve, opt-out for authors.
2. Cuts were unfavorable.
3. Players felt the free-mod social contract was broken.
4. Existing mods couldn't be paywalled without provenance disputes.

Engine learns: paid mods are valid, but never the default. Each game decides. Players are never surprised by a "this used to be free" toggle.

## Tipping > Subscription > Sale (for most mods)

Empirical observation from modding communities (Skyrim, Minecraft, Garry's Mod):
- Tipping ("Buy Me a Coffee" links) outperforms forced purchase in goodwill and total revenue for small mods.
- Subscription works for live-service mods (regular content drops).
- Outright sale works for total conversions / large content packs.

Engine surfaces all three; per-mod author chooses.

## Pay-What-You-Want

The "itch.io model": price floor + optional bump. Engine supports it via:

```toml
[economy]
pricing = "pwyw"
min_price = 0
suggested = 5
```

Per-marketplace caveats: not every store supports PWYW; itch.io is the strongest. Self-hosted always works (you handle the payment processor).

## Creator Identity

Authors can use:
- Anonymous: `mod.toml::[author].name = "anon"`. Donations skipped.
- Pseudonymous: handle + donation links.
- Verified: DID-based identity (`did:key:` or `did:web:`); engine verifies via `package-format.md` signing.

No identity flow is required; the engine respects whatever the author declares.

## Cross-Game Library Mods

A library mod used by 10 games:
- Author publishes once.
- Each game's economy applies.
- Author can set per-game revenue split if monetizing.
- Most library mods are free + donation; that's the community norm.

## Transparency

Marketplace cuts must be **declared** in `[economy].marketplace_cuts` so players see where their money goes. Engine validates this against the marketplace's actual policy at install time; mismatch warns at install.

## What's Not Covered Here

- Game's own DLC sales (separate from mods).
- Cosmetic monetization in the base game (not modding).
- Battle passes (engine has primitives but not mod-economy).

Those belong to `docs/guides/release/**` and the game's own design docs.

## Cross-Links

- → `free-mods.md`
- → `paid-mods.md`
- → `marketplace-cut-comparison.md`
- → `legal.md`
- → `docs/specs/mods/manifest.md` — `[marketplace]` blocks.
- → `docs/guides/mods/marketplaces/decision-matrix.md`
- → `docs/guides/mods/marketplaces/**` per-store details.
