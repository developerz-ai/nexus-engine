<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Overview

Where to publish the client. Nexus does not pick. The dev and the agent pick from the matrix.

Two release axes:
- **Storefront** — Steam, itch, Epic, GOG, Microsoft Store, App Store, Play Store, console, web, sideload.
- **Platform packaging** — installer + signing + auto-update on each OS.

→ Per-store playbooks: `docs/guides/release/<store>.md`. Per-OS signing: `docs/guides/release/codesigning/`.

---

## Store decision matrix

| Store | Cut | Cert cost | Approval time | Audience | DRM stance | MIT-compat | Console gating |
|-------|-----|----------|---------------|----------|-----------|------------|----------------|
| **Steam** | 30% (20% > $50M) | $100 one-time per app | 1-5 days | massive PC | optional DRM (Steam DRM, denuvo etc.) | yes | no |
| **itch.io** | 0-30% configurable | free | instant | indie PC + web | DRM-free default | yes (best fit) | no |
| **Epic Games Store** | 12% | free invite-based | weeks (selective) | growing PC | optional DRM | yes | no |
| **GOG** | 30% | free invite-based | weeks (selective) | DRM-free PC enthusiast | DRM-FREE required | yes (perfect fit) | no |
| **Microsoft Store (PC)** | 12-15% | $19 ind / $99 corp | 1-3 days | PC + Xbox PC | optional | yes | no for PC |
| **App Store (iOS)** | 15-30% | $99/yr Apple Dev | 24-72h | massive mobile | required signing | yes | no |
| **Google Play** | 15-30% | $25 one-time | hours-days | massive mobile | required signing | yes | no |
| **Web (itch / Crazy / Poki / self)** | varies (often rev-share 50%) | free | hours | massive casual | n/a | yes | no |
| **Nintendo Switch** | 30% est. | devkit + approval | months | Switch | required (NDA) | yes | YES (NDA) |
| **PlayStation 5** | 30% est. | devkit + approval | months | PS5 | required (NDA) | yes | YES (NDA) |
| **Xbox Series** | 30% est. | ID@Xbox free for indie | months | Xbox | required (NDA) | yes | YES (NDA) |
| **Meta Quest Store** | 30% main / 0% App Lab(?) | $0 dev account | weeks | VR | required signing | yes | App Lab semi-open |
| **Sideload (Flatpak/Snap/MSI/DMG/AUR)** | 0% | $0 | minutes | technical PC | optional | yes | no |

[VERIFY — store cuts and approval times change frequently. Always check the official store docs before quoting in marketing.]

---

## "Where should I launch?"

| Goal | Pick |
|------|------|
| Maximum reach, PC | Steam + itch (free fallback) |
| Indie, fast iteration, fair cut | itch.io first, Steam later |
| DRM-free purist | GOG + itch + direct |
| Mobile maximalist | App Store + Play Store + Web (3 deploys) |
| VR launch | Meta Quest + Steam (SteamVR) |
| Cross-platform unified | Steam + Xbox PC + Microsoft Store |
| Web-first browser game | Crazy Games + Poki + self-host + itch web |
| Console aspirations | Switch + PS5 + Xbox once builds stabilize (NDA-gated) |

Multi-store from day one is the norm. The cost is signing keys + extra CI + per-store metadata.

---

## Submission artifact requirements (high-level)

| Store | Binary format | Aux artifacts |
|-------|---------------|---------------|
| Steam | platform-native (.exe / .app / .x86_64) uploaded as a depot via SteamPipe | screenshots, capsule art, store page, demo build optional |
| itch.io | zip / per-platform binary uploaded via butler | cover image, screenshots, devlog |
| Epic | EGS-packaged build via BuildPatchTool | store assets via Dev Portal |
| GOG | platform binaries + installer or web installer | manifest, achievements, art |
| MS Store | MSIX / MSIXVC package via partner.microsoft.com | app icons, screenshots, ratings, age |
| App Store | IPA via Transporter / fastlane / Xcode | App Store Connect metadata, screenshots per device, privacy questionnaire, age, IAP |
| Play Store | AAB via Play Console / fastlane | screenshots per device, age, IAP, data-safety form |
| Meta Quest | APK signed | Oculus dashboard metadata, App Lab vs Store |
| Switch / PS5 / Xbox | platform-specific image, NDA-gated | platform-specific cert package |

---

## Submission frequency & velocity

| Store | Push to live (typical) | Beta channel |
|-------|----------------------|--------------|
| Steam | instant via SteamPipe + branch swap | named branches (`beta`, `staging`) |
| itch.io | instant via butler channels | channels per build (`win-beta`, etc.) |
| App Store | manual review per build (24-72h) | TestFlight |
| Play Store | depends on track: internal hours, prod 1-3d | internal/closed/open testing tracks |
| MS Store | 1-3 day cert per build | Submission options package flights |
| EGS | hours via BuildPatchTool, manual approval per build | sandbox builds |
| GOG | manual ingestion days-weeks | GOG Galaxy beta tags |

Steam + itch are the fastest iteration platforms; they're where you iterate. Console submissions are quarterly cadence.

---

## Cert / signing summary (cross-OS)

→ Full per-OS: `docs/guides/release/codesigning/`.

| OS | Required for | Cost | Cert authority |
|----|--------------|------|---------------|
| Windows | SmartScreen reputation; required by Microsoft Store | $200-500/yr OV, $300-700/yr EV | DigiCert, Sectigo, Certum (cheapest), GlobalSign |
| macOS | Gatekeeper, notarization | $99/yr (Apple Developer) | Apple |
| iOS | App Store + sideload | included with $99 Apple Dev | Apple |
| Android | Play Store + sideload | $25 one-time + keystore self-managed | Self / Play App Signing |
| Linux | Flatpak / Snap repos optional | $0 (GPG) | Self |

EV certs (Windows) reach SmartScreen "trusted" instantly; OV takes ~5000 installs to season.

---

## Universal release CLI

```bash
nexus release build --target steam,itch,playstore,appstore,web,msstore
nexus release sign --target steam        # uses configured signing key for OS bundled
nexus release upload --target steam --branch beta
nexus release submit --target appstore   # for stores requiring review
nexus release status --target appstore   # check approval status
```

→ `docs/game-template/cli.md` for the CLI surface contract.

The agent reads `Nexus.toml [release]` to know which stores are configured:

```toml
[release]
stores = ["steam", "itch", "appstore", "playstore", "web"]

[release.steam]
app_id = 123456
depot_id = 123457
branch = "default"

[release.itch]
user = "you"
game = "your-game"

[release.appstore]
team_id = "ABCD1234"
bundle_id = "com.you.yourgame"

# ... per-store sections
```

---

## "Where should the AI agent execute first?"

Default agent submission order (parallel where independent):

1. **itch.io** (fastest feedback loop, free, instant)
2. **Web** (self-host + itch web, validate WASM bundle)
3. **Steam beta branch** (private depot, internal testers)
4. **Play Store internal track** (closed testing)
5. **TestFlight (App Store)** (internal testers up to 100)
6. **MS Store flighted submission**
7. **Steam default branch** (public)
8. **Play Store open testing → production**
9. **App Store production**

Console (Switch / PS5 / Xbox) gated behind NDA + cert; agent flags `[NDA — devkit only]` and stops.

→ `docs/guides/release/agent-recipes.md` for the full decision tree.

---

## Cross-links

- Per-store playbooks → `docs/guides/release/<store>.md`
- Per-OS signing → `docs/guides/release/codesigning/`
- Installers → `docs/guides/release/installers.md`
- Auto-update → `docs/guides/release/auto-update.md`
- Sideload distribution → `docs/guides/release/sideloading.md`
- Agent recipes → `docs/guides/release/agent-recipes.md`
- Deploy backend → `docs/guides/deploy/overview.md`
- Game-template CLI → `docs/game-template/cli.md`
