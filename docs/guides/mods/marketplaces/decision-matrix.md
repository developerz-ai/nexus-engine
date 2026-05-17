<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — Decision Matrix

> Side-by-side comparison: cost, audience, console-support, API quality, moderation latency, MIT-friendly stance. All `[VERIFY]` flagged values reflect 2026 snapshots.

## Quick Pick

| If your priority is... | Pick |
|---|---|
| Steam reach | Steam Workshop |
| Cross-platform incl. consoles | Mod.io |
| Active modding community | Thunderstore |
| Established RPG fanbase | Nexus Mods |
| Minecraft-style modpacks | CurseForge |
| Pay-what-you-want | itch.io |
| Zero vendor lock | Self-hosted |
| Discovery atop self-hosted | nexus-hub `[DECISION NEEDED]` |

Multi-publish recommended. Engine: `nexus mod publish --to A --to B --to C`.

## Matrix

| Channel | Cost (author) | Cost (player) | Setup friction | API quality | Console support | Audience reach | Moderation latency | Paid mods | MIT-friendly | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Steam Workshop | Steam Direct $100/game | free | medium (SDK) | excellent (ISteamUGC) | partial (per-game) | massive (Steam-only) | hours-days | mostly no (2015 lesson) | yes | Default for Steam games |
| Mod.io | free | free | medium (OAuth + game register) | excellent (REST + Rust SDK) | yes (console SDKs) | medium-large, cross-platform | hours | varies per game | yes | Best for cross-platform |
| Thunderstore | free | free | low (token only) | good (REST + GH Action) | none | community-specific, very active | hours | none (donation-only) | yes | Best for PC modders |
| Nexus Mods | free | throttled DL for free accts | medium (OAuth via email) | good (GraphQL V2 + REST V1) | none | massive (Bethesda RPGs) | hours-days | none direct; DP program | mostly | Best for Bethesda-style |
| CurseForge | free | free (CF App on Windows) | medium (Overwolf account) | medium (API gated to authors) | none | medium (Minecraft-tier) | hours | rev share via points | partial (Overwolf TOS) | Reference / lower priority |
| itch.io | free | free / PWYW / paid | low (account + butler) | good (REST + butler) | none | medium (indie) | hours | yes (opt-in 10%) | yes | Best for indie / PWYW |
| Self-hosted | hosting fees | free | low-medium (S3 + sign) | n/a (HTTPS only) | yes | yours | depends on you | yes (your terms) | yes | The MIT-default |
| nexus-hub `[DECISION NEEDED]` | none | free | low | tbd | yes | aggregated | per-feed | none direct | yes | Optional federation |

All cost / policy values are `[VERIFY — marketplace policy changes]`; check the per-marketplace doc for the latest.

## Detailed Comparison

### Revenue Cuts (Paid Mods Where Applicable)

| Channel | Cut at platform | Notes |
|---|---|---|
| Steam Workshop | n/a | Paid mods discontinued (2015) |
| Mod.io | varies per game-author contract | Set at game registration |
| Thunderstore | none | Donation-only model |
| Nexus Mods | none direct | Donation Points (DP) pool funded by Nexus |
| CurseForge | varies (Overwolf) | Points-based; check current ToS |
| itch.io | 0–100%, default 10% (author choice) | The author sets the cut |
| Self-hosted | 0% | Author owns it all |
| nexus-hub | 0% | Hub never touches money |

`[VERIFY — current policy]`.

### API Quality (for `nexus mod publish` adapter complexity)

| Channel | Complexity | Notes |
|---|---|---|
| Steam Workshop | medium | steamcmd or SDK; CI-friendly with TOTP |
| Mod.io | low-medium | Clean REST; Rust SDK; test sandbox |
| Thunderstore | low | Token + multipart; official GH Action |
| Nexus Mods | medium-high | OAuth manual reg; first-upload partially manual |
| CurseForge | medium-high | Gated docs; per-game wrappers vary |
| itch.io | low | butler CLI; simple |
| Self-hosted | low | Engine generates index; backend pluggable |

### Moderation Latency

| Channel | Reports → action | Notes |
|---|---|---|
| Steam Workshop | hours-days | Per game admin + Valve TOS |
| Mod.io | hours | Active moderators |
| Thunderstore | hours | Per-community + global mods |
| Nexus Mods | hours-days | Mod authors + Nexus staff |
| CurseForge | varies | Per Overwolf TOS |
| itch.io | hours | itch.io team |
| Self-hosted | you decide | DIY |

## Multi-Publish Matrix

Recommended combinations:

| Game profile | Recommended channels |
|---|---|
| AAA Steam-first | Steam + Mod.io + self-hosted |
| Indie PC-focus | Thunderstore + itch.io + self-hosted |
| Bethesda-style RPG | Nexus Mods + Steam + self-hosted |
| Mobile / console primary | Mod.io + self-hosted |
| Open-source / fan-favorite | Self-hosted + Thunderstore + nexus-hub |
| Minecraft-style modpack | CurseForge + self-hosted |

## Machine-Readable (JSON for agents)

```json
{
  "schema": "nexus-marketplace-matrix-v1",
  "generated": "2026-05-17",
  "verify_required": true,
  "channels": [
    { "id": "steam",         "author_cost_usd": 100, "rev_cut_paid": "n/a",   "console": "partial", "audience": "massive", "mod_format_native": false, "api": "ISteamUGC", "auth": "steamcmd|sdk",  "mit_friendly": true,  "paid_mods": false },
    { "id": "mod_io",        "author_cost_usd": 0,   "rev_cut_paid": "varies","console": "yes",     "audience": "large",   "mod_format_native": false, "api": "REST",      "auth": "api_key|oauth", "mit_friendly": true,  "paid_mods": "varies" },
    { "id": "thunderstore",  "author_cost_usd": 0,   "rev_cut_paid": "none",  "console": "no",      "audience": "medium",  "mod_format_native": false, "api": "REST",      "auth": "token",         "mit_friendly": true,  "paid_mods": false },
    { "id": "nexus_mods",    "author_cost_usd": 0,   "rev_cut_paid": "none",  "console": "no",      "audience": "massive", "mod_format_native": false, "api": "GraphQL+REST","auth": "oauth",       "mit_friendly": "mostly","paid_mods": false },
    { "id": "curseforge",    "author_cost_usd": 0,   "rev_cut_paid": "varies","console": "no",      "audience": "medium",  "mod_format_native": false, "api": "REST",      "auth": "api_token",     "mit_friendly": "partial","paid_mods": "points" },
    { "id": "itch",          "author_cost_usd": 0,   "rev_cut_paid": "0-100 author-set","console": "no","audience": "indie", "mod_format_native": false, "api": "REST+butler","auth": "api_key",     "mit_friendly": true,  "paid_mods": true },
    { "id": "self_hosted",   "author_cost_usd": 0,   "rev_cut_paid": "none",  "console": "yes",     "audience": "yours",   "mod_format_native": true,  "api": "HTTPS",     "auth": "ed25519",       "mit_friendly": true,  "paid_mods": true },
    { "id": "nexus_hub",     "author_cost_usd": 0,   "rev_cut_paid": "none",  "console": "yes",     "audience": "aggregated","mod_format_native": true,"api": "REST",      "auth": "did",           "mit_friendly": true,  "paid_mods": "n/a-pointer-only", "status": "decision-needed" }
  ]
}
```

Agents (including `nexus-coder` / `mod-author` subagents) should read this JSON variant when picking a marketplace.

## Open Questions

- `[VERIFY]` Every cost / policy column. Marketplaces change; check per-doc Sources sections.
- `[DECISION NEEDED]` Whether Nexus engine ships a recommended "default 3" for `nexus new`-scaffolded games (probably Steam + Mod.io + self-hosted).
- `[DECISION NEEDED]` Whether engine's CI templates publish to all configured marketplaces or one-per-tag.

## See Also

- `docs/guides/mods/overview.md`
- `docs/guides/mods/integrations-matrix.md` — finer-grained per-capability matrix.
- Per-marketplace docs in this directory.
