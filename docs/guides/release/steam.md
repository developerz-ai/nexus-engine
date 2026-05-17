<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Steam

Steamworks SDK + `steamcmd` + depots + branches. The dominant PC storefront. 30% cut (sliding to 25% > $10M, 20% > $50M revenue per app).

Authoritative: https://partner.steamgames.com/doc/home

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| Steamworks Partner account | one-time **$100 / app** ("Steam Direct fee") | https://partner.steamgames.com |
| App ID + Depot IDs | issued on payment of Direct fee | Partner dashboard |
| Steamworks SDK | free | https://partner.steamgames.com/downloads/list |
| `steamcmd` CLI | free | https://developer.valvesoftware.com/wiki/SteamCMD |
| Steam build account | separate from your personal Steam | create in Users & Permissions |
| Banking + tax forms | required before launch | Partner site |
| Store page content | screenshots, capsule, trailer | submission checklist |

Steam Direct fee is per app, refundable to your sales revenue after $1,000 in revenue.

---

## Project layout

```
release/steam/
├── app_build_<APPID>.vdf
├── depot_build_<DEPOTID>_windows.vdf
├── depot_build_<DEPOTID>_macos.vdf
├── depot_build_<DEPOTID>_linux.vdf
├── content/
│   ├── windows/
│   ├── macos/
│   └── linux/
└── output/
```

---

## `app_build_<APPID>.vdf`

```vdf
"AppBuild"
{
    "AppID" "123456"
    "Desc" "Nexus build $GITHUB_SHA"
    "BuildOutput" "../output/"
    "ContentRoot" "../content/"
    "SetLive" ""                  // empty = no auto-set live; or "beta", "default"
    "Depots"
    {
        "123457" "depot_build_123457_windows.vdf"
        "123458" "depot_build_123458_macos.vdf"
        "123459" "depot_build_123459_linux.vdf"
    }
}
```

VDF format docs: https://partner.steamgames.com/doc/sdk/uploading

---

## Depot file (Windows example)

`depot_build_123457_windows.vdf`:

```vdf
"DepotBuildConfig"
{
    "DepotID" "123457"
    "ContentRoot" "../content/windows/"
    "FileMapping"
    {
        "LocalPath" "*"
        "DepotPath" "."
        "recursive" "1"
    }
    "FileExclusion" "*.pdb"
    "FileExclusion" "*.log"
}
```

---

## Upload via steamcmd

```bash
steamcmd \
  +login <build-account> \
  +run_app_build $PWD/release/steam/app_build_123456.vdf \
  +quit
```

Use 2FA via Steam Guard mobile or shared secret in CI.

For CI without interactive 2FA: store `Steam Guard` config file from a logged-in machine and reuse. Or use `steam-totp` to compute codes from a secret.

Reference: https://developer.valvesoftware.com/wiki/SteamCMD#Automating_SteamCMD

---

## Branches

Branches let you ship to a subset before public release. Defaults exist:
- `default` — public
- `beta` — testers with password
- Any name you create.

Set in Partner site → App Admin → Steam Pipe → Builds → "Set build live on branch".

`SetLive` in VDF auto-publishes after upload — convenient for `beta`, dangerous for `default`. Leave blank for production and promote manually.

---

## Steam Input

Native API for controller mapping. Players remap; you read normalized actions.

```cpp
SteamInput()->Init(false);
auto actionSet = SteamInput()->GetActionSetHandle("InGameControls");
auto move = SteamInput()->GetAnalogActionHandle("Move");
```

Docs: https://partner.steamgames.com/doc/features/steam_controller

Nexus core HAL exposes a Steam Input backend that flips on when `SteamAPI_Init` succeeds. → `docs/specs/core/hal.md`.

---

## Achievements + Stats

Define in Partner site → Stats and Achievements. Trigger from code:

```cpp
SteamUserStats()->SetAchievement("ACH_FIRST_KILL");
SteamUserStats()->StoreStats();
```

Docs: https://partner.steamgames.com/doc/features/achievements

---

## Cloud saves (Steam Cloud)

Two flavors:
- **Steam Auto-Cloud** — Steam syncs file paths you configure in Partner site. Zero code.
- **ISteamRemoteStorage** — explicit API for fine control.

Docs: https://partner.steamgames.com/doc/features/cloud

---

## Workshop (mods / UGC)

Use ISteamUGC. Allow players to upload, subscribe, and rate.

```cpp
SteamUGC()->CreateItem(appId, k_EWorkshopFileTypeCommunity);
```

Docs: https://partner.steamgames.com/doc/features/workshop

---

## Proton / Steam Deck (Linux verified)

Test on Steam Deck or Linux + Proton:

```bash
# install Proton manually then run:
WINEPREFIX=/tmp/proton-test \
  $STEAM/steamapps/common/Proton\ 9.0/proton run YourGame.exe
```

For "Steam Deck Verified" status: submit via https://partner.steamgames.com/doc/steamdeck/loadgame. Checklist: input glyphs, default resolution, suspend/resume, controller-only navigation, text size.

---

## Full deploy command

```bash
nexus release build --target steam --platforms windows,macos,linux
nexus release sign --target steam     # signs Windows binaries (Authenticode), notarizes macOS
nexus release upload --target steam --branch beta
# QA passes...
nexus release publish --target steam --branch default --from beta
```

---

## Smoke test

```bash
# verify build appeared
steamcmd +login <user> +app_info_print 123456 +quit | grep buildid
# run on a clean machine via Steam → install from beta branch → launch → telemetry heartbeat
```

---

## Rollback

Steam supports build rollback via Partner UI: pick a previous build → "Set build live on branch".

Or via steamcmd:

```bash
# upload a "rollback" build that's just the previous content; or use Partner UI
```

Time to rollback: < 5min after Partner UI action. Players get the previous build on next launch.

---

## Cost note

- Steam Direct fee: $100 per app (one-time, recoverable).
- Revenue share: 30% (20% over $50M).
- VAT / sales tax handled by Valve.
- Hosting / bandwidth: free (Steam pays for distribution CDN).

---

## Pitfalls

- **`SetLive` in VDF in CI** = accidental public push. Leave blank for `default` branch.
- **Build account 2FA** — needs Steam Guard set up; CI-friendly via shared secret + `steam-totp`.
- **Depot path mistakes** strand orphan files; preview with `steamcmd +run_app_build_http <vdf> +quit` (dry-run flag).
- **Steam Cloud quota** small per app; don't dump telemetry there.
- **Steamworks SDK is C/C++**. Rust binding: https://github.com/Noxime/steamworks-rs (MIT). Nexus uses this in `nexus-steam-bridge`.
- **Achievements once unlocked stay unlocked**. Test in a separate Steam account or clear stats in Partner site.

---

## Cross-links

- Windows signing → `docs/guides/release/codesigning/windows.md`
- macOS notarization → `docs/guides/release/codesigning/macos.md`
- itch.io alternative → `docs/guides/release/itch-io.md`
- Steam Input → `docs/specs/core/hal.md`
- Server hosting for multiplayer → `docs/guides/deploy/targets/fly-io.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
