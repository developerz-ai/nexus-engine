<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Meta Quest Store

OpenXR build, signed APK, Meta Horizon Developer Hub. Two tiers: **App Lab** (semi-open) and **Quest Store** (curated). Free developer account; ~30% revenue share.

Authoritative: https://developers.meta.com/horizon

---

## App Lab vs Store

| | App Lab | Quest Store |
|--|--------|------------|
| Curation | Light review (technical only) | Heavy review (quality bar) |
| Discoverability | Direct link only (no in-store browse) | Featured in Quest Store |
| Audience | Enthusiasts, sideloaders | Mass Quest users |
| Time to approval | Days | Weeks-months |
| Indie viability | Easy | Difficult |
| Revenue share | 30% [VERIFY] | 30% [VERIFY] |

Recommendation: **launch on App Lab first**, port to Store after polish + reviews.

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| Meta developer account | $0 | https://developers.meta.com |
| Organization | $0 | Dashboard |
| Quest device (any model) | $$ | Required for testing |
| Android SDK + NDK | $0 | Same as Play Store |
| Meta Quest SDK / OpenXR | $0 | https://developers.meta.com/horizon/develop |

Quest runs Android under the hood. Build is an APK signed with your keystore.

---

## OpenXR build

Nexus uses OpenXR (cross-vendor VR standard). The Quest SDK is a thin layer over OpenXR + Meta-specific extensions.

```bash
nexus release build --target meta-quest --xr-runtime openxr
# output: dist/quest/app.apk
```

Permissions in `AndroidManifest.xml`:

```xml
<uses-permission android:name="com.oculus.permission.USE_ANCHOR_API" />
<uses-permission android:name="com.oculus.permission.USE_SCENE" />
<uses-feature android:name="oculus.software.handtracking" android:required="false" />
<uses-feature android:name="android.hardware.vr.headtracking" android:required="true" />
```

Meta Quest manifest reference: https://developers.meta.com/horizon/documentation/native/android/mobile-native-manifest

---

## Sign + upload

Sign APK same as Play Store:

```bash
jarsigner -keystore upload.jks app.apk upload
zipalign -v 4 app.apk app-aligned.apk
```

Upload via Meta Quest Developer Hub or `ovr-platform-util`:

```bash
ovr-platform-util upload-quest-build \
  --app_id <app-id> \
  --app-secret <secret> \
  --apk app-aligned.apk \
  --channel ALPHA          # ALPHA | BETA | RC | LIVE | APP_LAB
```

CLI docs: https://developers.meta.com/horizon/resources/publish-reference-platform-command-line-utility

---

## Channels

| Channel | Audience |
|---------|---------|
| ALPHA | up to 100 internal testers |
| BETA | up to 1000 closed testers |
| RC | release candidate |
| LIVE | public Store/App Lab |
| APP_LAB | App Lab-specific |

---

## In-app purchases / DLC

Meta IAP SDK. Available for Quest Store and App Lab.

```cpp
ovr_IAP_LaunchCheckoutFlow("sku_coins_100");
```

Docs: https://developers.meta.com/horizon/documentation/native/ps-iap-s2s

---

## Quest store page

Set up in Developer Hub:
- Title, subtitle, description (with VR-specific tags: "Standing", "Roomscale")
- Comfort rating (Intense / Moderate / Comfortable)
- Genre, supported devices (Quest 2/3/3S/Pro)
- Trailer + screenshots
- Required input (hands, controllers, body tracking)
- Multiplayer support
- IAP listings

---

## Smoke test

```bash
adb install -r app-aligned.apk
adb shell am start -n com.you.yourgame/com.unity3d.player.UnityPlayerActivity
adb logcat | grep nexus
```

Or via Meta Quest Developer Hub: install build to your headset → launch → verify.

---

## Rollback

Developer Hub → previous build → "Promote to LIVE".

For staged rollout: control percentage via Hub.

---

## Cost note

- Developer account: $0.
- Revenue share: 30% [VERIFY — Meta has experimented with reduced rates].
- Hosting + CDN: free.
- IAP processing: included in revenue share.

---

## Pitfalls

- **30Hz vs 90/120Hz** — Quest demands stable 72/90/120 Hz; missed frames = nausea.
- **Vulkan vs OpenGL ES backends** — Vulkan preferred for performance on Quest 2+. Nexus wgpu picks Vulkan.
- **Texture compression** — use ASTC for Quest; ETC2 fallback. → `docs/specs/assets/compression.md`.
- **Single-pass stereo** required for performance; render both eyes in one pass.
- **App Lab tag** identifies semi-curated; some users skip App Lab content.
- **OpenXR loader version mismatch** can cause runtime crashes; pin SDK version.

---

## When Meta Quest is the right fit

| Reason | |
|--------|--|
| Game is VR-native | Quest is the dominant standalone VR platform |
| Want to ship to standalone (not just PCVR) | Quest is the only mainstream choice |
| Indie VR fits App Lab model | Faster than Store cert |

For PCVR (Index, Vive, Reverb): ship on Steam with OpenXR; same build, Steam SteamVR. → `docs/guides/release/steam.md`.

---

## Cross-links

- Steam (PCVR) → `docs/guides/release/steam.md`
- Android signing (same as Play) → `docs/guides/release/codesigning/android.md`
- Asset compression (ASTC) → `docs/specs/assets/compression.md`
- HAL VR section → `docs/specs/core/hal.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
