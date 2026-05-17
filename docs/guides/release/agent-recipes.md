<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Agent Recipes

How `nexus-coder` (→ `docs/specs/coder/`) picks storefronts, prepares artifacts, and executes submissions. Decision data is structured JSON the agent reads. Console submissions stop at `[NDA — devkit only]`.

**Core principle:** Nexus does not pick. The dev picks. Agent provides ranked options + executes once confirmed.

---

## Decision tree

```
START
  │
  ├─ platform: PC? ──> Steam + itch (free fallback)
  │                    + Epic (if approved) + GOG (if DRM-free) + MS Store (12% cut bonus)
  │                    + sideload (signed installers on your site)
  │
  ├─ platform: mobile? ──> App Store + Play Store
  │                       + Meta Quest if VR
  │                       + sideload APK on your site
  │
  ├─ platform: web/browser? ──> itch (web channel) + self-host + Crazy + Poki + Newgrounds
  │
  ├─ platform: console? ──> [NDA — devkit only]
  │                         Switch → docs/guides/release/switch.md
  │                         PS5    → docs/guides/release/playstation.md
  │                         Xbox   → docs/guides/release/xbox-console.md
  │
  └─ stance: DRM-free purist? ──> itch + GOG + sideload only
```

---

## Per-store capability matrix (machine-readable)

```json
{
  "$schema": "nexus-release-stores-v1",
  "stores": [
    {
      "id": "steam",
      "name": "Steam",
      "platforms": ["windows", "macos", "linux"],
      "cut_pct": 30,
      "cut_pct_after_50m": 20,
      "submission_cost_usd": 100,
      "approval_time": "1-5 days",
      "iap_supported": true,
      "drm_optional": true,
      "drm_required": false,
      "auto_update": "via-steam-client",
      "achievements": true,
      "cloud_save": true,
      "matchmaking": "via-steamworks-or-byo",
      "best_for": ["mass-pc-audience", "wishlists", "early-access", "multiplayer"],
      "submission_artifacts": ["per-platform binary", "store page assets", "ratings", "trailer"],
      "cli_tools": ["steamcmd"],
      "docs": "docs/guides/release/steam.md",
      "vendor_docs": "https://partner.steamgames.com/doc/home"
    },
    {
      "id": "itch",
      "name": "itch.io",
      "platforms": ["windows", "macos", "linux", "web", "android"],
      "cut_pct_configurable": "0-30",
      "cut_pct_default": 10,
      "submission_cost_usd": 0,
      "approval_time": "instant",
      "iap_supported": false,
      "drm_optional": false,
      "drm_required": false,
      "auto_update": "via-itch-app",
      "achievements": false,
      "cloud_save": false,
      "matchmaking": "byo",
      "best_for": ["indie", "fast-iteration", "pay-what-you-want", "devlog", "game-jams", "web"],
      "submission_artifacts": ["per-channel binary", "cover", "screenshots"],
      "cli_tools": ["butler"],
      "docs": "docs/guides/release/itch-io.md",
      "vendor_docs": "https://itch.io/docs/creators/"
    },
    {
      "id": "epic",
      "name": "Epic Games Store",
      "platforms": ["windows", "macos"],
      "cut_pct": 12,
      "submission_cost_usd": 0,
      "approval_time": "weeks (selective)",
      "iap_supported": true,
      "drm_optional": true,
      "drm_required": false,
      "auto_update": "via-epic-launcher",
      "achievements": true,
      "cloud_save": true,
      "matchmaking": "via-eos",
      "best_for": ["lower-cut", "eos-cross-platform-services"],
      "submission_artifacts": ["per-platform binary", "BPT manifest", "store assets"],
      "cli_tools": ["BuildPatchTool"],
      "docs": "docs/guides/release/epic.md",
      "vendor_docs": "https://dev.epicgames.com/docs/"
    },
    {
      "id": "gog",
      "name": "GOG",
      "platforms": ["windows", "macos", "linux"],
      "cut_pct": 30,
      "submission_cost_usd": 0,
      "approval_time": "weeks (selective)",
      "iap_supported": false,
      "drm_optional": false,
      "drm_required": "DRM-FREE-REQUIRED",
      "auto_update": "via-galaxy-or-byo",
      "achievements": "via-galaxy",
      "cloud_save": "via-galaxy",
      "matchmaking": "via-galaxy-or-byo",
      "best_for": ["drm-free-audience", "crpg", "classic", "mit-aligned-distribution"],
      "submission_artifacts": ["installers OR depot build"],
      "cli_tools": ["gog-build-tool"],
      "docs": "docs/guides/release/gog.md",
      "vendor_docs": "https://devportal.gog.com"
    },
    {
      "id": "msstore",
      "name": "Microsoft Store (PC)",
      "platforms": ["windows"],
      "cut_pct": 12,
      "submission_cost_usd": 19,
      "approval_time": "1-3 days",
      "iap_supported": true,
      "drm_optional": true,
      "drm_required": false,
      "auto_update": "via-windows-store",
      "achievements": "xbox-live-optional",
      "cloud_save": "xbox-live-optional",
      "matchmaking": "xbox-live-or-byo",
      "best_for": ["xbox-pc-integration", "lower-cut", "game-pass-eligibility"],
      "submission_artifacts": ["msix", "store assets", "ratings"],
      "cli_tools": ["MakeAppx", "signtool", "ms-store-submission-api"],
      "docs": "docs/guides/release/microsoft-store.md",
      "vendor_docs": "https://learn.microsoft.com/windows/uwp/publish/"
    },
    {
      "id": "appstore",
      "name": "Apple App Store",
      "platforms": ["ios", "ipados", "macos"],
      "cut_pct": 30,
      "cut_pct_small_business": 15,
      "submission_cost_usd": 99,
      "submission_cost_period": "per-year",
      "approval_time": "24-72h",
      "iap_supported": true,
      "drm_required": true,
      "auto_update": "via-app-store",
      "achievements": "game-center",
      "cloud_save": "icloud",
      "matchmaking": "game-center-or-byo",
      "best_for": ["ios-distribution", "mac-app-store", "game-center"],
      "submission_artifacts": ["ipa", "screenshots-per-device", "privacy-labels", "ratings", "iap-config"],
      "cli_tools": ["xcodebuild", "fastlane", "transporter", "altool"],
      "docs": "docs/guides/release/app-store.md",
      "vendor_docs": "https://developer.apple.com/app-store/"
    },
    {
      "id": "playstore",
      "name": "Google Play Store",
      "platforms": ["android"],
      "cut_pct": 30,
      "cut_pct_small_business": 15,
      "submission_cost_usd": 25,
      "submission_cost_period": "one-time",
      "approval_time": "hours-3days",
      "iap_supported": true,
      "drm_required": true,
      "auto_update": "via-play",
      "achievements": "play-games-services",
      "cloud_save": "play-games-services",
      "matchmaking": "play-games-services-or-byo",
      "best_for": ["android-distribution", "play-games-services", "pre-launch-report"],
      "submission_artifacts": ["aab", "screenshots-per-device", "data-safety", "ratings", "iap-config"],
      "cli_tools": ["gradle", "fastlane", "bundletool", "publisher-api"],
      "docs": "docs/guides/release/play-store.md",
      "vendor_docs": "https://developer.android.com/guide/app-bundle"
    },
    {
      "id": "web",
      "name": "Web (WASM)",
      "platforms": ["web"],
      "cut_pct": 0,
      "cut_pct_via_portals": "ad-rev-share",
      "submission_cost_usd": 0,
      "approval_time": "instant (self) / hours (portals)",
      "iap_supported": "via-byo-payment",
      "drm_required": false,
      "auto_update": "browser-cache-bust",
      "achievements": "byo",
      "cloud_save": "byo",
      "matchmaking": "byo",
      "best_for": ["browser-distribution", "wide-reach", "demo-builds", "ad-supported"],
      "submission_artifacts": ["wasm bundle", "html shell", "assets"],
      "cli_tools": ["wasm-bindgen", "wrangler/vercel/butler"],
      "portals": ["itch-web", "crazy-games", "poki", "newgrounds", "y8"],
      "docs": "docs/guides/release/web.md",
      "vendor_docs": "https://web.dev/articles/coop-coep"
    },
    {
      "id": "meta-quest",
      "name": "Meta Quest",
      "platforms": ["quest"],
      "cut_pct": 30,
      "submission_cost_usd": 0,
      "approval_time": "days (App Lab) / weeks (Store)",
      "tiers": ["App Lab", "Store"],
      "iap_supported": true,
      "drm_required": true,
      "auto_update": "via-meta",
      "achievements": "meta",
      "matchmaking": "meta-or-byo",
      "best_for": ["standalone-vr"],
      "submission_artifacts": ["signed-apk", "store-assets", "comfort-rating"],
      "cli_tools": ["gradle", "ovr-platform-util"],
      "docs": "docs/guides/release/meta-quest.md",
      "vendor_docs": "https://developers.meta.com/horizon"
    },
    {
      "id": "switch",
      "name": "Nintendo Switch",
      "platforms": ["switch"],
      "nda_gated": true,
      "approval_required": true,
      "docs": "docs/guides/release/switch.md",
      "vendor_docs": "https://developer.nintendo.com"
    },
    {
      "id": "playstation",
      "name": "PlayStation 5",
      "platforms": ["ps5"],
      "nda_gated": true,
      "approval_required": true,
      "docs": "docs/guides/release/playstation.md",
      "vendor_docs": "https://partners.playstation.net"
    },
    {
      "id": "xbox-console",
      "name": "Xbox Series",
      "platforms": ["xbox"],
      "nda_gated": true,
      "approval_required": true,
      "program": "ID@Xbox",
      "docs": "docs/guides/release/xbox-console.md",
      "vendor_docs": "https://www.xbox.com/en-US/developers/id"
    },
    {
      "id": "sideload",
      "name": "Sideload (direct)",
      "platforms": ["windows", "macos", "linux", "android"],
      "cut_pct": 0,
      "submission_cost_usd": 0,
      "approval_time": "instant",
      "iap_supported": "byo",
      "drm_optional": true,
      "auto_update": "byo (nexus-updater / sparkle / winsparkle)",
      "best_for": ["zero-cut", "sovereignty", "mit-purism", "internal-distribution"],
      "submission_artifacts": ["signed-installer-per-os"],
      "cli_tools": ["inno-setup", "create-dmg", "appimagetool", "fpm", "apksigner", "nexus-updater"],
      "docs": "docs/guides/release/sideloading.md",
      "vendor_docs": null
    }
  ]
}
```

---

## Default submission order

When the dev says `nexus release publish --all`, agent executes in this order (parallel where independent):

| Stage | Stores | Why |
|-------|-------|-----|
| 1 | itch.io (internal channel) | Fastest feedback, free |
| 1 | Web self-host + itch web | Validate WASM bundle |
| 2 | Steam beta branch (private password) | Internal testers via Steam |
| 2 | Play Store internal track | Closed testing on Android |
| 2 | TestFlight (App Store) | Internal/external testers |
| 2 | MS Store flighted | Beta group on Windows |
| 2 | Meta Quest App Lab | Semi-public VR |
| 3 | Steam default branch | Public PC launch |
| 3 | itch.io public | Public indie launch |
| 3 | Play Store open testing → production | Android public |
| 3 | App Store production | iOS public |
| 3 | MS Store production | Windows store public |
| 3 | Epic | If approved |
| 3 | GOG | If approved + DRM-free verified |
| 3 | Web public (Crazy Games, Poki) | Portal submissions |
| 4 | Sideload (signed installers on your CDN) | Power-user distribution |

Console submissions: agent flags `[NDA — devkit required]` and stops, listing the dev's next manual step.

---

## Agent CLI surface

```bash
# Ask for store recommendations
nexus release recommend \
  --platforms windows,macos,linux,web,android,ios \
  --genre "co-op-roguelike" \
  --drm-stance optional \
  --budget-usd 300

# Output (example):
# Recommended order:
#  1. itch.io (free, instant)
#  2. Steam ($100 fee, mass audience)
#  3. Web self-host via Cloudflare Pages + R2
#  4. Play Store internal track ($25 one-time)
#  5. TestFlight (requires $99/yr Apple Developer)
#  Skip for now (NDA): Switch, PS5, Xbox console
#  Skip (DRM-required by stance): none

nexus release build --target steam,itch,playstore,appstore,web,msstore
nexus release sign  --target steam,itch,playstore,appstore,web,msstore
nexus release upload --target itch         --channel internal
nexus release upload --target steam        --branch beta
nexus release submit --target appstore     --track testflight
nexus release status --target appstore     # polls Connect API

nexus release promote --target steam --from beta --to default
nexus release promote --target playstore --from internal --to production --rollout 5
```

→ `docs/game-template/cli.md` for the full CLI contract.

---

## Per-store required artifacts (agent pre-flight)

Agent refuses to submit if missing:

| Store | Required |
|-------|---------|
| Steam | depot binary, app_build VDF, store page complete (Partner site), age rating |
| itch | per-channel binary, page cover image, page description |
| Epic | per-platform binary, BPT credentials, store assets in Dev Portal |
| GOG | binary or installer, DRM-free audit pass, store page in Dev Portal |
| MS Store | signed MSIX, age rating (IARC), store assets, policy questionnaire |
| App Store | signed IPA, screenshots per-device, privacy labels, age rating, IAP config |
| Play Store | signed AAB, screenshots per-device, data safety form, age rating, content rating |
| Meta Quest | signed APK, comfort rating, supported inputs declared |
| Web | WASM bundle + COOP/COEP headers verified |
| Sideload | signed installer per OS, GPG sig (Linux), notarized (macOS), updater configured |

Verify with: `nexus release preflight --target <store>`.

---

## Refusal rules

Agent **must refuse** to submit when:
- Required artifact missing.
- Cert / signing key not available in secrets backend.
- DRM detected on GOG submission.
- Mandatory store policy field absent (privacy labels, age rating).
- For console NDA-gated stores: agent has no devkit context.
- `Nexus.toml [release].<store>.app_id` empty.

---

## Status polling

```bash
nexus release status --target appstore
# Output:
#  App: Your Game (com.you.yourgame)
#  Latest: 0.1.1 (build 42)
#  TestFlight: "Ready to Test" (beta review passed 2026-05-17T09:12Z)
#  App Store: "Waiting for Review" (submitted 2026-05-17T10:00Z)
```

Backed by per-store APIs:
- Steam: Partner WebAPI
- itch: server-side via butler
- App Store: App Store Connect API
- Play Store: Publisher API
- MS Store: Microsoft Store Submission API

---

## Cross-links

- Per-store playbooks → `docs/guides/release/<store>.md`
- Per-OS signing → `docs/guides/release/codesigning/`
- Installers → `docs/guides/release/installers.md`
- Auto-update → `docs/guides/release/auto-update.md`
- Coder agent architecture → `docs/specs/coder/architecture.md`
- Coder workflows → `docs/specs/coder/workflows.md` [AGENT 18]
- Game-template CLI → `docs/game-template/cli.md`
- Deploy backend → `docs/guides/deploy/overview.md`
- Deploy agent recipes → `docs/guides/deploy/agent-recipes.md`
