<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Integrations Matrix

> Per-marketplace per-capability table. Reference card for `nexus-coder`, publishing tooling, and authors picking targets.

## Capability Columns

| Code | Meaning |
|---|---|
| upload | Adapter can publish a new mod |
| update | Adapter can update existing mod |
| sub-sync | Auto-subscription sync to player install |
| search | Programmatic search |
| versions | List + pin versions |
| auth-API | API key or token auth |
| auth-OAuth | OAuth user flow |
| auth-PKCE | OAuth PKCE (public client) |
| console-sdk | Has console SDK |
| paid | Supports paid mods |
| moderation-feed | Signed takedown / blocklist feed |
| sandbox-bytes | Hosted bytes have integrity hash |
| webhook | Server-side webhooks for events |
| nsfw-gate | Built-in NSFW gating |

✓ = supported, ✗ = not supported, ~ = partial, ? = `[VERIFY]`.

## Matrix

| Channel | upload | update | sub-sync | search | versions | auth-API | auth-OAuth | auth-PKCE | console-sdk | paid | moderation-feed | sandbox-bytes | webhook | nsfw-gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Steam Workshop | ✓ (steamcmd/SDK) | ✓ | ✓ | ✓ | ✓ | ~ | ✓ (Steam acct) | ✗ | ~ (per game) | ✗ (since 2015) | ✓ (Valve) | ✓ | ~ | ✓ |
| Mod.io | ✓ (REST) | ✓ | ✓ (OAuth) | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ (per game) | ✓ | ✓ | ✓ | ✓ |
| Thunderstore | ✓ (REST+GH Action) | ✓ (new version only) | ✗ (launcher does) | ✓ | ✓ | ✓ (token) | ✗ | ✗ | ✗ | ✗ (donation) | ✓ (per community) | ✓ | ~ | ~ (per community) |
| Nexus Mods | ~ (first manual) | ✓ (REST) | ✓ (Vortex) | ✓ (GraphQL) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ direct (DP pool) | ✓ | ✓ | ~ | ✓ |
| CurseForge | ~ (gated docs) | ~ | ✓ (CF App) | ✓ (REST) | ✓ | ✓ (token) | ✗ | ✗ | ✗ | ~ (points) | ~ | ✓ | ? | ~ |
| itch.io | ✓ (butler/REST) | ✓ | ✗ | ✓ (REST) | ✓ (channels) | ✓ | ~ | ✗ | ✗ | ✓ (author-set %) | ✓ | ✓ | ~ | ✓ |
| Self-hosted | ✓ (any HTTPS) | ✓ | ✓ (engine polls) | ✓ (index) | ✓ (index) | n/a (Ed25519) | n/a | n/a | ✓ | ✓ (your processor) | ✓ (signed feed) | ✓ (BLAKE3) | ✓ (webhooks if you build) | ✓ (manifest flag) |
| nexus-hub `[DECISION NEEDED]` | n/a (pointer-only) | n/a | ~ | ✓ (federated) | ✓ | n/a | n/a | n/a | ✓ | n/a | ✓ (signed) | ✓ (verifies via feeds) | ✓ | ~ |

All `[VERIFY — marketplace policy changes]`. Source per row → `docs/guides/mods/marketplaces/<channel>.md`.

## Detailed Notes Per Channel

### Steam Workshop
- Sub-sync handled by Steam client; engine watches Workshop dir.
- Versions: per Workshop item; recent versioning improvements (Jan 2026, `[VERIFY]`).
- Paid: discontinued for general Workshop; Creation Club is curated only.
- Webhook: indirect via Steamworks events (`Workshop_OnItemSubscribed` etc.).

### Mod.io
- Console SDKs available per platform; gated by certification.
- Paid: per-game contract with mod.io.
- Webhooks: yes, per game admin dashboard.

### Thunderstore
- Cannot reupload same version → versioning is per-release.
- No sub-sync at marketplace; r2modman / Thunderstore Mod Manager handles client-side.
- Webhooks limited; mostly community RSS.

### Nexus Mods
- OAuth client registration manual (email support). `[VERIFY]` if web UI lands.
- DP program is the donation rail; not direct paid mods.
- Webhooks: limited; GraphQL polling more common.

### CurseForge
- API access typically requires Overwolf partnership; smaller mods may scrape.
- Adapter is best-effort; engine prefers Mod.io for similar use-cases.

### itch.io
- Author sets cut (default 10%). Most author-favorable terms.
- No native sub-sync; engine polls.
- Loose convention for mod tagging (`nexus-mod`, `for-<game-slug>`).

### Self-hosted
- Adapter is minimal (HTTPS + signed `index.toml`).
- Webhooks: build your own server-side; engine adapter posts to author endpoints.
- Discovery is your problem; `nexus-hub` if it ships can aggregate.

### nexus-hub
- Proposed federated index.
- Hub aggregates signed feeds; never hosts bytes.
- Hub takes no money; ever.

## Auth Recipe Cross-Ref

| Channel | Setup command |
|---|---|
| Steam Workshop | `nexus mod auth steam --steamguard CODE` |
| Mod.io | `nexus mod auth mod-io --api-key XXX` or `--oauth` |
| Thunderstore | `nexus mod auth thunderstore --token tss_...` |
| Nexus Mods | `nexus mod auth nexus-mods --oauth` |
| CurseForge | `nexus mod auth curseforge --token cf_...` |
| itch.io | `nexus mod auth itch --api-key XXX` or `--butler` |
| Self-hosted | `nexus mod keygen --out keys/` |

## Per-Capability JSON (for agents)

```json
{
  "schema": "nexus-marketplace-capabilities-v1",
  "verify_required": true,
  "channels": [
    {
      "id": "steam",
      "upload": true, "update": true, "sub_sync": true, "search": true, "versions": true,
      "auth": ["steamcmd", "sdk"], "console": "partial",
      "paid": false, "moderation_feed": true, "sandbox_bytes": true, "webhook": "partial", "nsfw_gate": true
    },
    {
      "id": "mod_io",
      "upload": true, "update": true, "sub_sync": true, "search": true, "versions": true,
      "auth": ["api_key", "oauth"], "console": true,
      "paid": "per_game", "moderation_feed": true, "sandbox_bytes": true, "webhook": true, "nsfw_gate": true
    },
    {
      "id": "thunderstore",
      "upload": true, "update": "new_version_only", "sub_sync": false, "search": true, "versions": true,
      "auth": ["token"], "console": false,
      "paid": false, "moderation_feed": "per_community", "sandbox_bytes": true, "webhook": "partial", "nsfw_gate": "per_community"
    },
    {
      "id": "nexus_mods",
      "upload": "partial_first_manual", "update": true, "sub_sync": true, "search": true, "versions": true,
      "auth": ["oauth", "pkce"], "console": false,
      "paid": false, "moderation_feed": true, "sandbox_bytes": true, "webhook": "partial", "nsfw_gate": true
    },
    {
      "id": "curseforge",
      "upload": "partial", "update": "partial", "sub_sync": true, "search": true, "versions": true,
      "auth": ["token"], "console": false,
      "paid": "points", "moderation_feed": "partial", "sandbox_bytes": true, "webhook": "verify", "nsfw_gate": "partial"
    },
    {
      "id": "itch",
      "upload": true, "update": true, "sub_sync": false, "search": true, "versions": true,
      "auth": ["api_key", "butler"], "console": false,
      "paid": true, "moderation_feed": true, "sandbox_bytes": true, "webhook": "partial", "nsfw_gate": true
    },
    {
      "id": "self_hosted",
      "upload": true, "update": true, "sub_sync": "engine_polls", "search": "index", "versions": "index",
      "auth": ["ed25519"], "console": true,
      "paid": true, "moderation_feed": true, "sandbox_bytes": true, "webhook": "diy", "nsfw_gate": true
    },
    {
      "id": "nexus_hub",
      "status": "decision-needed",
      "upload": false, "update": false, "sub_sync": "partial", "search": true, "versions": true,
      "auth": [], "console": true,
      "paid": false, "moderation_feed": true, "sandbox_bytes": true, "webhook": true, "nsfw_gate": "partial"
    }
  ]
}
```

`nexus-coder` and other automation reads this when choosing publish targets.

## Cross-Links

- → `docs/guides/mods/marketplaces/decision-matrix.md` — higher-level decision view.
- → Per-marketplace docs in `docs/guides/mods/marketplaces/`.
- → `docs/guides/mods/economy/marketplace-cut-comparison.md` — money side.
- → `docs/specs/mods/manifest.md` — `[marketplace]` blocks.
- → `agent-recipes.md` — how agents pick channels.
