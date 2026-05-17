<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — NSFW Gates & Content Moderation

> Opt-in NSFW with hard gates at install and runtime. Age verification at the distribution layer, NOT the engine. Marketplaces own moderation policy. Engine ships hash-blocklist enforcement and a clean takedown protocol. No exceptions for known-illegal content.

## Boundaries
- Owns: `[mod].nsfw` flag semantics, runtime gate behavior, hash-blocklist enforcement, takedown protocol, content-moderation hooks marketplaces consume.
- Does NOT own:
  - Age verification (legal compliance; marketplace responsibility) → `docs/guides/mods/marketplaces/**`
  - Per-jurisdiction legal classification → `docs/guides/mods/economy/legal.md`
  - Subjective taste / community guidelines (marketplaces' job)
- Depends on: `manifest.md`, `lifecycle.md`, `docs/guides/mods/marketplaces/**`.

## NSFW Flag

```toml
[mod]
nsfw = true                            # true | false | "explicit" | "mature"
nsfw_categories = ["violence-graphic", "sexual-content"]
```

| Value | Meaning |
|---|---|
| `false` | Standard. Visible by default. |
| `true` | Mature-themed. Hidden by default in browser; opt-in. |
| `"mature"` | Strong themes (e.g., graphic violence) but no explicit sexual content. |
| `"explicit"` | Sexual content. Hardest gate. |

Categories use a fixed enum (extensible). Marketplaces may show or hide based on the tags and the user's age-verification state.

## Runtime Gate

In-game mod browser respects a per-profile setting:

```
Settings → Content → NSFW Visibility
  [ ] Show mature mods
  [ ] Show explicit mods (requires age verification)
```

Default: both off. Toggling "explicit" prompts:
> "This requires age verification through the marketplace. Continue?" → marketplace flow.

If a save loads referencing an NSFW mod and the current profile disables NSFW, the mod is **disabled for this session**; banner shown:
> "Mod 'X' is disabled because your content settings hide explicit mods."

Save load policy (→ `save-compatibility.md`) defaults to `warn` in this case; player can flip per-save.

## Age Verification

Engine does NOT verify age. That's a legal-jurisdiction problem and varies by region. Marketplaces handle it:
- Steam: built-in DOB + content filter.
- Mod.io: built-in age verification.
- Nexus Mods: account-level adult-content toggle.
- Thunderstore: community-level policy.
- Self-hosted: site operator's responsibility.

Engine surfaces the marketplace's verification status (yes/no) and the player's local content setting. If a marketplace claims "user is verified," engine trusts that flag. → `docs/guides/mods/marketplaces/integrations-matrix.md`.

## Hash Blocklist

Engine ships a configurable blocklist of `mod_hash` values for content that violates jurisdictional law (CSAM, doxxing, malware). Sources:
- Built-in conservative seed list (empty by default; community-maintained).
- Marketplace-shared lists (signed feeds from major hubs).
- Per-server / per-game additional blocks (server `Nexus.toml::[mods.blocklist]`).
- User-provided local blocklist.

Hashes only — no content. Blocklist file format:

```toml
# blocklist.toml
version = 1
signed_by = "did:key:z6Mk..."
updated  = "2026-05-17T10:23:00Z"

[[entry]]
mod_hash = "b3:abcd...1234"
reason = "csam"                        # csam | doxx | malware | court-order
jurisdictions = ["global"]
takedown_ref = "https://takedown.example.com/case/12345"   # optional
```

Behavior: any `.nxmod` with a hash on the blocklist is refused at install with `MOD_E_BLOCKED_HASH`. Engine logs the attempt to a local audit (privacy-preserving; no upload).

Distribution: blocklist feeds are signed; engine verifies sig; supports multiple feed sources. Player can disable individual feeds (NOT the legal-floor ones — those are hardcoded with the relevant jurisdiction toggles).

## Takedown Protocol

A mod author or rights-holder files a takedown:
1. Submit to marketplace (engine doesn't host).
2. Marketplace processes (DMCA, GDPR, court order, etc.).
3. Marketplace adds the hash to its signed blocklist feed.
4. Subscribed clients fetch the updated feed.
5. Affected mods refused at next install attempt; already-installed mods get warned at next launch.

Engine never auto-deletes installed mods. It surfaces:
> "This mod has been removed from its marketplace for reason: X. You may keep using it locally or uninstall now."

Exceptions: blocklist entries with `reason = "csam"` or `reason = "court-order"` trigger refuse-to-launch by default, with player override possible only on `--legal-floor-acknowledged` build flag (which itself logs to local audit).

## Content Moderation Hooks (Marketplaces)

The engine ships an API marketplaces use to report:

```
POST /v1/moderation/report   { mod_hash, category, evidence, reporter }
GET  /v1/moderation/feed     → signed blocklist
```

These are MARKETPLACE-side endpoints; the engine bundles a reference client. Game studios using `nexus-hub` (`[DECISION NEEDED]`) get this for free.

## Author-Side Controls

A mod author can:
- Mark their own mod NSFW preemptively (recommended; avoids retroactive flag).
- Submit content tags (curators may revise).
- Pin a "creator removed" record so installed copies don't relaunch (engine respects).

## Server-Side Policy

Multiplayer server admins can ban NSFW mods even if marketplace allows:

```toml
[anticheat.mods]
ban_nsfw = true                        # blocks any mod with nsfw=true or higher
ban_nsfw_categories = ["sexual-content"]
```

Rejected at handshake with `MP_E_MOD_BANNED` and reason "server-policy: nsfw".

## Privacy

- Blocklist queries never leave the client; feeds are pulled in bulk.
- Audit log of blocked-install attempts is local-only.
- No tracking of "what NSFW mod did this user install"; not collected, not stored.
- Telemetry (→ `telemetry.md`) excludes NSFW state.

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_BLOCKED_HASH` | Mod hash on active blocklist | Refuse install |
| `MOD_E_NSFW_PROFILE_HIDES` | Mod is NSFW; profile setting hides | Skip; not an error, info |
| `MOD_E_NSFW_AGE_REQUIRED` | Explicit mod attempted to load without verification | Block; route to marketplace |
| `MOD_E_TAKEDOWN_REFUSE_LAUNCH` | csam/court-order takedown blocks launch | Mandatory; no override |
| `MOD_W_TAKEDOWN_SOFT` | Marketplace removed; player can keep using locally | Banner; player choice |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Blocklist lookup per install (10k entries) | < 5 ms | 20 ms |
| Feed fetch + verify (signed TOML, 1 MB) | < 200 ms | 1 s |
| Profile-gate check per session start | < 1 ms | 10 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `manifest.md` — `nsfw`, `nsfw_categories` fields.
- `lifecycle.md` — install gate.
- `multiplayer-sync.md` — server `ban_nsfw` policy.
- `save-compatibility.md` — saves with NSFW mods + profile hide path.
- `docs/guides/mods/marketplaces/**` — each marketplace's verification model.
- `docs/guides/mods/economy/legal.md` — jurisdictional notes.

## Test Requirements

- Mod with `nsfw = true` hidden from default browser; visible when toggle enabled.
- Mod with `nsfw = "explicit"` requires verification; refused if not verified.
- Blocklist entry refuses install with `MOD_E_BLOCKED_HASH`; doesn't auto-delete installed copy.
- Server with `ban_nsfw = true` rejects NSFW mod at handshake with structured reason.
- Hash-blocklist feed signature verified; tampered feed rejected.
- Audit of blocked-install attempts is local-only; no network call.

## Prior Art

- Steam content filter ✓ — DOB + categories, marketplace-level.
- Mod.io age-gate ✓ — verified-flag handoff.
- Nexus Mods adult-content toggle ✓ — account-level.
- Loverslab-style community moderation ✓ — community-curated.
- DMCA takedown UX (YouTube, etc.) ✓ — informs the takedown protocol.
- Apple App Store age ratings ✓ — per-jurisdiction.

## Open Questions

- `[DECISION NEEDED]` Whether engine ships a default blocklist seed or leaves to community feeds.
- `[DECISION NEEDED]` `--legal-floor-acknowledged` build flag policy: removed in `--ship` builds for distributors? `[VERIFY — jurisdiction-specific]`.
- `[DECISION NEEDED]` Per-jurisdiction feed selection UX: opt-in / auto by IP?
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 22]` Confirm liveops crash-format doesn't leak NSFW-mod fingerprints into telemetry.
