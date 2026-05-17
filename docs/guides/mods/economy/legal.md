<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Economy — Legal

> License inheritance for mods. DMCA pointers. Fan-work safe-harbor patterns. Not legal advice — consult a lawyer for your jurisdiction.

## License Inheritance Cheat Sheet

| Engine license | Base game license | Mod author chooses |
|---|---|---|
| MIT (Nexus) | MIT | Any (MIT, GPL, CC0, proprietary, etc.) |
| MIT (Nexus) | Proprietary (game studio) | As permitted by game's EULA |
| MIT (Nexus) | GPL | Mod often must be GPL-compatible (depends on linking) |
| MIT (Nexus) | CC-BY-NC base assets | Mod cannot be sold commercially without permission |

Mods inherit the most restrictive applicable license. Engine being MIT does NOT free a mod from a non-MIT base game's restrictions.

## Declaring Your Mod's License

`mod.toml`:

```toml
[mod]
license = "MIT"                  # OSI SPDX id; required
```

LICENSE file required in `.nxmod` (matches declared SPDX id, byte-compared against SPDX text catalog). → `docs/specs/mods/package-format.md`.

Common choices:

| License | Use when |
|---|---|
| MIT | Permissive; default for templates |
| Apache-2.0 | Permissive + patent grant |
| GPL-3.0-or-later | Copyleft; forces derivatives open |
| MPL-2.0 | File-level copyleft |
| CC-BY-4.0 | Assets; attribution required |
| CC-BY-NC-4.0 | Non-commercial only |
| CC0-1.0 | Public domain dedication |
| LicenseRef-Proprietary | All rights reserved; describe in LICENSE |

If unsure: MIT for code, CC-BY-4.0 for assets.

## License Compatibility With Base Game

Game studios should declare their mod-licensing stance in `Nexus.toml::[mods.legal]`:

```toml
[mods.legal]
# What modders may distribute (re-use of game's IP).
permit_derivative_assets = true            # mods can include modified game assets
permit_paid_mods = false                   # mods cannot charge for derivatives
require_attribution = "© MyGame Studio, used under mod license"
prohibited_uses = ["competing-game", "hate-speech"]
```

Mod browser surfaces this for mod authors before they publish. Engine refuses to publish a mod whose license / contents violate the declared policy.

## Fan-Work Safe Harbor Patterns

Many publishers tolerate fan mods unofficially but reserve takedown rights. Engine helps with:

- **Disclaimer template**: mod templates ship with a `README.md` boilerplate: "This is a fan mod for X. Not affiliated with or endorsed by X's publisher."
- **No-trademark mode**: TC mods (`docs/specs/mods/total-conversions.md`) can rebrand fully; mod doesn't claim to BE the original game.
- **Asset replacement**: if a mod replaces all of a base game's protected assets with original work, the mod can sometimes ship standalone (e.g., Black Mesa / Counter-Strike trajectory). Consult counsel.

Engine doesn't render legal judgments; it gives modders the technical tools to do it right.

## DMCA / Takedown

If a rights-holder files a takedown:

1. Filed at marketplace (not at engine; engine doesn't host).
2. Marketplace processes per their policy and legal jurisdiction.
3. Marketplace adds mod hash to its signed blocklist feed (→ `docs/specs/mods/nsfw-and-moderation.md`).
4. Subscribed clients fetch updated feed; install refused; player notified.
5. Author can counter-notice per marketplace policy.

For self-hosted: you (the host) handle DMCA. Your hosting provider may forward notices; engage counsel.

Engine never centrally hosts mods; takedowns are always marketplace-scoped.

## Counter-Notice & Reinstatement

Standard DMCA counter-notice if you believe takedown is improper:
- Identify the work.
- Statement of good faith.
- Consent to jurisdiction.
- Submit to marketplace's designated agent.

Marketplace policies vary. `[VERIFY]` per marketplace.

## Trademark vs Copyright

| Issue | Engine support |
|---|---|
| Copying protected assets | Mod refused at install if hash matches publisher's blocklist; otherwise marketplace policy |
| Using game's trademarks (name, logo) | Discouraged; rebrand for TCs; consult lawyer |
| Using likeness (characters, voices, faces) | Right-of-publicity varies by jurisdiction; especially risky for real people |
| Using music | Almost always requires license; very risky |

## Open-Source Licensing Within Mods

If your mod includes third-party libraries (other mods, Rust crates, asset packs):
- Include their LICENSE in your `.nxmod`'s LICENSE file (or LICENSE-third-party).
- Respect license terms (especially GPL's source-availability for derivatives).
- Engine's `nexus mod verify --license-audit` lists all detected sub-licenses.

## Authors' Rights To Withdraw

A mod author can withdraw their mod from marketplaces. Already-downloaded copies persist on player machines (engine never auto-deletes). Effect:
- New installs refused (marketplace removes).
- Lockfile-pinned saves continue to work locally if mod is cached.
- "Author removed this mod" banner shown.

This protects:
- Authors who change mind.
- Authors who lose access to a tool/key.
- Authors who learn of a flaw and want to pull.

## Liability

The engine is MIT-licensed and provided "AS IS, WITHOUT WARRANTY OF ANY KIND" (per MIT). Mod authors are similarly responsible for their own work. Game studios using the engine inherit MIT's terms; they may add their own EULA on top of their game.

Mod authors should:
- Declare a license.
- Avoid copying others' IP.
- Avoid making unsafe sandbox claims (engine enforces but author shouldn't market "this mod will hack your system!"-style).
- Provide some way to be contacted (homepage / repository).

## NSFW / Adult Content

Legal jurisdiction matters:
- US: First Amendment broad, child-protection exceptions; CSAM hash-blocked globally.
- EU/UK: per-country obscenity laws.
- Australia: stricter; some content prohibited.
- China / Korea / Japan: varied; consult.

Marketplaces handle age verification; engine ships hash blocklist for known illegal content. → `docs/specs/mods/nsfw-and-moderation.md`.

## Trademark on "Nexus"

The Nexus engine project does not own the word "Nexus" (the project itself uses the name). Mods may use "Nexus" descriptively (e.g., "for Nexus engine"). Game studios using Nexus may name their games anything; the engine name is a credit, not a brand requirement.

## Cross-Links

- → `overview.md`
- → `paid-mods.md`
- → `free-mods.md`
- → `docs/specs/mods/package-format.md` — LICENSE file requirement.
- → `docs/specs/mods/nsfw-and-moderation.md` — takedown protocol.
- → `docs/specs/mods/total-conversions.md` — branding rules.
- → `docs/specs/mods/multiplayer-sync.md` — ban-list mechanics.

## Disclaimers

This document is informational, not legal advice. Consult a lawyer in your jurisdiction for:
- Specific license selection.
- Trademark / right-of-publicity issues.
- DMCA / take-down responses.
- Commercial mod licensing structures.
- Tax implications of mod sales.

## Sources / Further Reading

- SPDX license list: `spdx.org/licenses/`
- Choose-a-License (GitHub): `choosealicense.com`
- OSI: `opensource.org`
- DMCA overview: `copyright.gov/dmca`
- ChillingEffects / Lumen Database: `lumendatabase.org`
- EFF on mods + fair use: `eff.org`
