<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Epic Games Store

12% cut (best on PC). EOS SDK for cross-platform services. Selective onboarding — Epic vets every title.

Authoritative: https://dev.epicgames.com/docs/

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| Epic Games Developer account | $0 | https://dev.epicgames.com |
| Product approval | invite/application | Submit via https://store.epicgames.com/en-US/distribute |
| Product key, Sandbox ID, Deployment ID | issued on approval | Developer Portal |
| BuildPatchTool CLI | $0 | Available in Dev Portal downloads |
| EOS SDK (if using Epic services) | $0 | https://dev.epicgames.com/portal/sdk |
| Banking + tax | required before payout | Dev Portal |

Approval process: submit a build + storefront draft + business info. Epic reviews — can take weeks. Not all titles approved.

---

## Build upload via BuildPatchTool (BPT)

```bash
BuildPatchTool \
  -mode=PatchUpload \
  -OrganizationId=<org-id> \
  -ProductId=<product-id> \
  -ArtifactId=<artifact-id> \
  -BuildVersion=0.1.0+$GITHUB_SHA \
  -BuildRoot=./dist/epic/windows \
  -CloudDir=./dist/epic/cloud \
  -AppLaunch=YourGame.exe \
  -AppArgs="" \
  -ClientId=<bpt-client-id> \
  -ClientSecret=<bpt-client-secret>
```

BPT produces delta manifest, uploads only changed chunks. Like Steam depots, only Epic-flavored.

Docs: https://dev.epicgames.com/docs/epic-games-store/publishing-tools/uploading-binaries/build-patch-tool

---

## Sandboxes (Epic's branches)

Two sandbox types:
- **Dev** — internal testing.
- **Stage** — pre-prod, can be tested via launcher.
- **Live** — public.

Promote builds via Dev Portal:

```
Build uploaded to Dev → tested → promote to Stage → tested → promote to Live
```

Each promotion is a manual click in Dev Portal (or BPT REST API call).

---

## EOS SDK (cross-platform services)

Optional but powerful. Achievements, friends, voice, lobbies, leaderboards, P2P/relay. **Free to use across Epic + Steam + consoles + mobile** — that's the kicker.

```cpp
EOS_InitializeOptions InitOptions = {};
InitOptions.ApiVersion = EOS_INITIALIZE_API_LATEST;
InitOptions.ProductName = "YourGame";
InitOptions.ProductVersion = "0.1.0";
EOS_Initialize(&InitOptions);
```

Docs: https://dev.epicgames.com/docs/game-services/eos-overview

Achievements:

```cpp
EOS_Achievements_UnlockAchievementsOptions options = { ... };
EOS_Achievements_UnlockAchievements(handle, &options, this, OnUnlockComplete);
```

EOS overlay (in-game friends UI): https://dev.epicgames.com/docs/epic-online-services/eos-overlay-overview

Nexus binding: `nexus-eos-bridge` (community/MIT). [VERIFY — confirm crate exists at publish time]

---

## Achievements

Define in Dev Portal → Achievements. Each has:
- Locked / unlocked text
- 256×256 icon (locked + unlocked)
- Optional progress (0–100)

Trigger via EOS_Achievements API.

---

## Store page

Set up in Dev Portal:
- Title, description, capsule art (multiple sizes), screenshots, trailer
- Genres, tags, ratings (IARC)
- Pricing per region (Epic handles currency conversion)
- Release schedule
- Refund eligibility (Epic policy: 14d / < 2h)

---

## CI/CD

```yaml
- name: BPT upload
  run: |
    BuildPatchTool \
      -mode=PatchUpload \
      -OrganizationId=$EPIC_ORG \
      -ProductId=$EPIC_PRODUCT \
      -ArtifactId=$EPIC_ARTIFACT \
      -BuildVersion=${GITHUB_REF_NAME#v}+$GITHUB_SHA \
      -BuildRoot=./dist/epic/windows \
      -CloudDir=./dist/epic/cloud \
      -ClientId=$EPIC_BPT_CLIENT_ID \
      -ClientSecret=$EPIC_BPT_CLIENT_SECRET
```

BPT for Linux is available; for macOS use the Win/Linux version cross-compiled.

---

## Smoke test

- Launch Epic Games Launcher → switch to Stage sandbox → install build → verify telemetry heartbeat.
- Or: download build via BPT in headless mode and run.

---

## Rollback

Dev Portal → Builds → previous build → "Promote to Live".

Or via BPT API:

```bash
# pseudocode — actual REST API
curl -X POST https://api.epicgames.dev/builds/v1/promote \
  -d '{"sandbox":"live","build_id":"<prev>"}' \
  -H "Authorization: Bearer $TOKEN"
```

---

## Cost note

- Account: free.
- Revenue share: 12% (Epic's pitch since launch).
- EOS services: free.
- BPT and tools: free.
- Hosting/CDN: free (Epic pays).

Compared to Steam (30%) on a $20 game: Epic returns $17.60 vs Steam $14. Worth applying.

---

## Pitfalls

- **Selective onboarding** — many indie titles rejected. Apply early.
- **BPT requires `.exe` launcher** with absolute path; double-check pathing.
- **EOS overlay** can conflict with custom in-game UI; test toggles.
- **No native auto-update outside the Epic launcher.** Standalone EGS-distributed builds need custom updater.
- **Discovery is weaker than Steam.** Epic store page traffic is a fraction.

---

## Cross-links

- Steam (compare) → `docs/guides/release/steam.md`
- Windows signing → `docs/guides/release/codesigning/windows.md`
- EOS-based lobby/matchmaking → `docs/specs/networking/lobby.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
