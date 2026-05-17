<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Economy — Free Mods

> The default. Tipping built in. Donation links surfaced in the browser. Zero platform cut. Pass-through to author's chosen processor.

## The Default Path

A mod with no `[economy]` block is free. Authors can still get paid via:

| Mechanism | Cut taken by engine | Cut taken by platform |
|---|---|---|
| Tipping (Ko-fi, Patreon, GitHub Sponsors, Liberapay) | 0% | per platform (usually 0% – 5%) |
| Donation Points (Nexus Mods–style) | 0% | per marketplace |
| Off-platform sales (linked from mod page) | 0% | per author's setup |

Engine surfaces donation links, never processes payment itself.

## Author Setup

`mod.toml`:

```toml
[author]
name = "sebi"
donation = [
  "https://ko-fi.com/sebi",
  "https://patreon.com/sebi",
  "https://github.com/sponsors/sebi",
  "https://liberapay.com/sebi"
]
```

In-game mod card:

```
+----------------------------------------------------------+
| Healing Pack                                             |
| by sebi                                                  |
| Support: [Ko-fi] [Patreon] [GitHub Sponsors] [Liberapay] |
|                                                          |
| [Install]                                                |
+----------------------------------------------------------+
```

Clicks open the player's browser to the author's donation page. Engine doesn't intermediate.

## Multi-Platform Donations

The engine encourages multiple links because some players have preferences:
- Ko-fi: low fees, one-time tips, no account needed for tipper.
- Patreon: subscription.
- GitHub Sponsors: dev-friendly; GitHub takes 0%.
- Liberapay: gift-economy ethos; ~0% fee.
- Open Collective: transparent collective funding.

Authors list as many as they support.

## Per-Game Tipping Setting

```toml
# Nexus.toml of the game
[mods.economy]
allow_tipping = true                    # default
tipping_destinations = ["ko-fi", "patreon", "github-sponsors", "liberapay", "open-collective"]
```

A game can curate the list (e.g., kid-friendly games may restrict). Engine respects.

## Donation Points (Nexus Mods)

Nexus Mods runs a Donation Points (DP) program: a monthly cash pool distributed to mod authors proportional to download metrics. Free mods can opt in:

```toml
[marketplace.nexus_mods]
donation_points = true
```

Engine surfaces a "DP-eligible" badge in the mod card.

`[VERIFY — Nexus Mods DP eligibility rules]`. → `docs/guides/mods/marketplaces/nexus-mods.md`.

## Steam Workshop

Steam discontinued direct paid-mods Workshop integration (2015). Tipping via the author's external links works (see donation list above). Workshop tags can advertise external donation links subject to Steam's TOS. `[VERIFY]`.

## Mod.io

Mod.io's per-game revenue contracts can include tipping. Engine surfaces what the marketplace allows. `[VERIFY — current Mod.io tipping support]`.

## Self-Hosted

You control the page. Add your donation buttons; engine surfaces them in the card the same way. No middleman.

## Tipping UX (in-game)

`Mods → <mod> → Support author`:

```
+----------------------------------------------------------+
| Support sebi                                             |
|                                                          |
| Healing Pack is free. The author accepts tips:           |
|                                                          |
|   [Tip via Ko-fi]                                        |
|   [Subscribe on Patreon]                                 |
|   [Sponsor on GitHub]                                    |
|   [Tip on Liberapay]                                     |
|                                                          |
| Tipping is between you and the destination.             |
| The engine takes nothing.                                |
+----------------------------------------------------------+
```

Buttons open the browser. Engine never asks for your card.

## Aggregating Donations

Some authors prefer one destination (Open Collective, for instance) that splits to multiple recipients. List one link; the platform handles the split.

## Discoverability

Mods with donation links are surfaced in the browser's "Support creators" shelf (optional, per-game). Promotes the gift economy.

## Anti-Pattern: Donation-Required

Engine refuses to feature mods that:
- Gate functionality behind donation ("pay $5 to unlock advanced features").
- Spam donation requests in-game.
- Hijack the consent dialog to push donations.

Those are paid mods; use `paid-mods.md` rails. Engine surfaces a warning at install if mod's behavior gates content but `[economy]` says free.

## Tax & Legal

Engine takes no responsibility for the donor↔author relationship. Authors must handle:
- Tax reporting in their jurisdiction.
- Refund disputes (usually n/a for tips, but check Ko-fi/Patreon policies).
- Multi-author splits (if shared mod).

`docs/guides/mods/economy/legal.md` for more.

## Telemetry

Engine does NOT report your donation activity to authors. Authors may see "click-through to donation page" if the donation platform tracks (per the platform's own policy).

Per-mod opt-in telemetry from `docs/specs/mods/telemetry.md` excludes financial signals.

## Pitfalls

- Author lists donation link to a dead page → engine warns "support link unreachable" once a week.
- Donor expects exclusive content for tipping; not the free-mod social contract.
- Players assuming "free" means "no costs": always show the underlying marketplace + author info so it's clear.

## Cross-Links

- → `overview.md`
- → `paid-mods.md`
- → `marketplace-cut-comparison.md`
- → `docs/specs/mods/manifest.md` — `[author].donation`.
- → `docs/guides/mods/marketplaces/nexus-mods.md` — DP program.
