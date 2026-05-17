<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — GOG

DRM-FREE required. Curated catalog. 30% standard cut (negotiable in some cases). Audience is enthusiast PC, especially CRPG / strategy / classic genres. Best fit for MIT-aligned games — DRM-free aligns with open source ethos.

Authoritative: https://devportal.gog.com (developer portal, requires approval)

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| GOG developer account | invite-based | Apply via https://www.gog.com/partners |
| Approval | curated | Submit pitch + build + business info |
| GOG Galaxy SDK (optional) | $0 | Provided after onboarding |
| Banking + tax | required for payout | Dev Portal |

Approval typical timeline: weeks to months. GOG curates manually.

---

## DRM-free contract

GOG's defining feature. The game **must** run without any GOG client present. No phone-home checks, no online activation, no required launcher.

What this means for Nexus games:
- Game binary runs from any path, any user, offline.
- No required online auth for single-player.
- Optional online features (multiplayer, leaderboards) gated by user opt-in.
- Save files stored locally per platform convention.

GOG audits builds for DRM. Rejection is common if you sneak any in.

---

## Build delivery

Two flavors:

### A — Standalone installer

Upload a self-contained installer:
- Windows: `.exe` installer (Inno Setup or NSIS or InstallShield)
- macOS: `.pkg` or `.dmg`
- Linux: `.sh` self-extracting (Mojo Setup is common) or `.deb` + `.rpm` + `.tar.xz`

Submitted via Dev Portal upload.

### B — GOG Galaxy build (depot-style)

For users who want auto-update via the Galaxy launcher:

```bash
# pseudocode — actual tool name from GOG Dev Portal docs
gog-build-tool upload \
  --product-id <id> \
  --branch dev \
  --content ./dist/gog/windows
```

[VERIFY — tool name changes; check current Dev Portal docs]

GOG Galaxy: https://www.gog.com/galaxy

---

## GOG Galaxy SDK (optional)

Achievements, leaderboards, multiplayer, friends. Standard layer if you want parity with Steam.

```cpp
galaxy::api::Init({ "clientId", "clientSecret" });
galaxy::api::User()->SignInGalaxy();
galaxy::api::Stats()->SetAchievement("ACH_FIRST_KILL");
galaxy::api::Stats()->StoreStatsAndAchievements();
```

The SDK is optional — your game ships fine without it, you just lose those features for Galaxy users.

Docs: provided after partner onboarding. Public reference: https://docs.gog.com/galaxyapi/

---

## Installer authoring

If shipping standalone installers (Path A), → `docs/guides/release/installers.md` for Inno Setup, WiX, and Linux scripts.

Best practices for GOG installers:
- Bundle all runtime dependencies (no online installer fetch).
- Install to user-writable location optionally (no admin required).
- Provide uninstaller that fully removes.
- Include a "GAME" folder structure that matches GOG conventions:
  ```
  GAME/
  ├── game/             # game files
  ├── support/          # readmes, EULAs
  └── unins000.exe      # uninstaller
  ```

---

## CI/CD

GOG doesn't publish a documented public CI API for build upload (as of May 2026 — [VERIFY]). Common pattern:
- Build artifact in CI.
- Push to GOG via Dev Portal manual upload OR partner-provided CLI tool.
- Wait for QA pass (GOG runs verification).

If GOG provides a per-account upload token, use it the same way as Steam's `steamcmd`.

---

## Store page

Set in Dev Portal:
- Cover (capsule art), background art
- Description (HTML supported)
- Screenshots (min 5)
- Trailer (YouTube embed)
- Genres / tags / age rating
- System requirements
- Pricing per region

GOG's regional pricing is curated; you submit and they finalize.

---

## Smoke test

```bash
# install via Galaxy or run installer manually on a clean machine
# verify game launches offline (DRM check)
nmcli networking off    # Linux
# verify game runs the same
```

---

## Rollback

Dev Portal → previous build → promote to default branch. Same model as Steam branches.

---

## Cost note

- Listing: $0.
- Revenue share: 30% standard. Sometimes negotiable.
- Hosting + CDN: free.
- GOG handles refunds (their policy: 30 days, no questions asked — generous).

---

## Pitfalls

- **DRM accidentally bundled** (online activation, license check) → rejection.
- **GOG curation is real**. Approval not guaranteed.
- **Smaller audience than Steam** — 100× smaller wishlists typical.
- **Update cadence slower** — GOG QAs each build.
- **Linux support is appreciated** but optional; GOG audience skews Windows.

---

## When GOG is the right fit

| Reason | |
|--------|--|
| Strong DRM-free ethos | Aligns with Nexus MIT principles |
| CRPG / strategy / classic / niche genre | GOG audience overweights these |
| Quality bar is high | Curation a feature |
| Want a DRM-free distribution alongside Steam | Best partner for that posture |

---

## Cross-links

- Steam (compare) → `docs/guides/release/steam.md`
- itch.io (also DRM-free default) → `docs/guides/release/itch-io.md`
- Installer authoring → `docs/guides/release/installers.md`
- Windows signing → `docs/guides/release/codesigning/windows.md`
- Auto-update outside Galaxy → `docs/guides/release/auto-update.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
