<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Google Play Store

AAB (Android App Bundle) via Play Console. Play App Signing handles distribution keys. 15% cut for first $1M annual revenue, 30% over. $25 one-time developer fee.

Authoritative:
- https://play.google.com/console
- https://developer.android.com/guide/app-bundle

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| Google Play Console account | $25 one-time | https://play.google.com/console/signup |
| Android SDK + Build Tools | $0 | https://developer.android.com/studio |
| Java 17 (recommended) | $0 | OpenJDK |
| Upload signing keystore | $0 (self-gen) | → `docs/guides/release/codesigning/android.md` |
| Play App Signing enrolled | $0 | Play Console → App signing |

---

## Build AAB

```bash
./gradlew bundleRelease
# output: app/build/outputs/bundle/release/app-release.aab
```

Sign with upload key (not the distribution key — Google holds that):

```bash
jarsigner -keystore upload-keystore.jks \
  -storepass $UPLOAD_STORE_PASS \
  -keypass $UPLOAD_KEY_PASS \
  app-release.aab upload
```

Or via Gradle config in `build.gradle.kts`:

```kotlin
android {
    signingConfigs {
        register("release") {
            storeFile = file(System.getenv("UPLOAD_KEYSTORE") ?: "upload-keystore.jks")
            storePassword = System.getenv("UPLOAD_STORE_PASS")
            keyAlias = "upload"
            keyPassword = System.getenv("UPLOAD_KEY_PASS")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

For Nexus (Rust core), use `cargo-ndk` to build per-ABI, then bundle:

```bash
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 \
  -o app/src/main/jniLibs \
  build --release
```

→ `docs/specs/core/hal.md` for Android HAL details.

---

## Play App Signing

Two keys:
- **Upload key** — yours; signs the AAB you upload.
- **App signing key** — Google's; signs the APKs distributed to users.

You enroll at first release. Google generates the signing key OR you upload yours (irreversible).

Docs: https://developer.android.com/studio/publish/app-signing

If upload key compromised: reset via Play Console (request new key; signed builds with old key rejected after).

---

## Tracks

| Track | Audience | Velocity |
|-------|----------|---------|
| Internal | up to 100 testers (email list) | minutes |
| Closed | testers via list / email | hours |
| Open | anyone with Play Store link | hours-days |
| Production | everyone | hours-days |

Promote between tracks via Console UI or Publisher API.

---

## Upload via Publisher API (CI)

```bash
# use gradle plugin or fastlane
fastlane supply --track internal --aab app/build/outputs/bundle/release/app-release.aab \
  --json_key path/to/service-account.json --package_name com.you.yourgame
```

Or `gradle-play-publisher`: https://github.com/Triple-T/gradle-play-publisher

Service account: create in Google Cloud Console → grant "Release Manager" role in Play Console.

Publisher API docs: https://developers.google.com/android-publisher

---

## fastlane (Android)

`Fastfile`:

```ruby
default_platform(:android)
platform :android do
  lane :internal do
    gradle(task: "bundleRelease")
    supply(track: "internal", aab: "app/build/outputs/bundle/release/app-release.aab")
  end
  lane :promote_to_prod do
    supply(track_promote_to: "production", track: "internal")
  end
end
```

Docs: https://docs.fastlane.tools/getting-started/android/

---

## Play Console submission

- App content section: target audience, ads, content rating (IARC), data safety, privacy policy URL.
- Store listing per language: title, short/full description, screenshots (phone/tablet/TV/wear as applicable), feature graphic, video.
- Pricing & distribution: countries, free or paid.
- IAP / subscriptions: create in Monetize → Products.
- Pre-launch report: Google runs your AAB on real devices automatically.

Submit → Production track → review ~hours to days.

---

## IAP / Billing

Google Play Billing Library 6+. https://developer.android.com/google/play/billing

Server-side validation: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products

Subscriptions: same SDK, configure in Console → Subscriptions.

---

## Smoke test

```bash
# build AAB → extract APK via bundletool for a specific device
bundletool build-apks --bundle=app-release.aab --output=app.apks --connected-device
bundletool install-apks --apks=app.apks
adb logcat | grep nexus
```

Internal track install: tester email → Play Store link → install.

---

## Rollback

Play Console → release → "Halt rollout" (immediate). Then submit a prior AAB version OR a hotfix.

For staged rollout (e.g., 1% → 5% → 25% → 100%): halt at any stage if crash rate spikes. Vitals dashboard shows ANRs/crashes per release.

Docs: https://support.google.com/googleplay/android-developer/answer/6346149

---

## Cost note

- Account: $25 one-time.
- Revenue share: 15% first $1M/yr, 30% over.
- Hosting + CDN: free.
- Bandwidth: unlimited.

---

## Pitfalls

- **Target API level requirement** — Play raises this annually. Build against current `targetSdkVersion`.
- **64-bit requirement** — must include arm64-v8a; ship 32-bit + 64-bit per Play policy.
- **Data Safety form** must match actual SDK behavior; analytics SDKs trigger disclosure.
- **Privacy policy URL required** — host on your site.
- **Closed testing requires N testers minimum** for some apps (e.g., 12 for 14 days) before production.
- **App Bundle splits** can produce per-device APKs differing in behavior; test on multiple devices.
- **Pre-launch report failures** can block submission; fix or acknowledge each.

---

## When Play Store is required

| Reason | |
|--------|--|
| Android distribution at scale | Only mainstream channel |
| Google Play Games sign-in / leaderboards / achievements | Tied to Play |
| Billing on Android | Required (with rare exceptions, e.g., EU DMA) |
| Pre-launch report (free device QA) | Saves hours |

Alternatives for sideload / openness: F-Droid, Amazon Appstore, Huawei AppGallery, direct APK from your site. → `docs/guides/release/sideloading.md`.

---

## Cross-links

- Android signing detail → `docs/guides/release/codesigning/android.md`
- App Store (iOS) → `docs/guides/release/app-store.md`
- Sideload APK / F-Droid → `docs/guides/release/sideloading.md`
- Android HAL → `docs/specs/core/hal.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
