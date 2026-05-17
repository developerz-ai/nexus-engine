<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Apple App Store (iOS / iPadOS / macOS)

Xcode + codesign + notarization + App Store Connect + App Review. 15% cut for first $1M annual revenue, 30% over. $99/yr Apple Developer Program required.

Authoritative:
- https://developer.apple.com/app-store/
- https://developer.apple.com/app-store/review/guidelines/

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| Apple Developer Program | $99/yr | https://developer.apple.com/programs/ |
| Xcode (latest) | $0 | Mac App Store |
| App ID + Bundle ID | $0 | https://developer.apple.com/account/resources/identifiers/list |
| Provisioning profiles | $0 | https://developer.apple.com/account/resources/profiles/list |
| App Store Connect record | $0 | https://appstoreconnect.apple.com |
| Mac (required for signing/notarization) | $$ | physical or CI macOS runner |

→ Signing detail: `docs/guides/release/codesigning/ios.md` and `docs/guides/release/codesigning/macos.md`.

---

## Bundle ID & App ID

Reverse-DNS: `com.you.yourgame`. Set once, immutable. Used in `Info.plist` `CFBundleIdentifier`.

---

## Capabilities (entitlements)

Common entitlements for games:

```xml
<dict>
  <key>com.apple.developer.game-center</key><true/>
  <key>com.apple.developer.in-app-payments</key><true/>
  <key>com.apple.developer.networking.wifi-info</key><true/>
</dict>
```

Enable in App ID → Capabilities. Add to `<App>.entitlements` and provisioning profile.

Game Center docs: https://developer.apple.com/game-center/

---

## Build via Xcode

Command-line CI build:

```bash
xcodebuild -workspace YourGame.xcworkspace -scheme YourGame \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath build/YourGame.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/YourGame.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

`ExportOptions.plist`:

```xml
<plist version="1.0">
<dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string>ABCD1234</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
```

xcodebuild docs: https://developer.apple.com/documentation/xcode/

For Nexus (Rust + wgpu), use `cargo-xcode` or build the Rust lib then link from the Xcode project. → `docs/specs/core/hal.md` for iOS HAL details.

---

## Notarize (macOS) — not for iOS

iOS apps are signed and submitted; no notarization. macOS apps require notarization for Gatekeeper. → `docs/guides/release/codesigning/macos.md`.

---

## Upload via Transporter / altool / fastlane

Pick one:

### A — `xcrun altool` (built-in)

```bash
xcrun altool --upload-app -f build/ipa/YourGame.ipa \
  -t ios -u $APPLE_ID -p $APP_SPECIFIC_PASSWORD
```

[VERIFY — `altool` is being deprecated in favor of `notarytool` for notarization; for App Store upload use Transporter or `xcrun altool` / `iTMSTransporter`.]

### B — Transporter app (GUI)

Drag-and-drop `.ipa`/`.pkg` to Transporter. https://apps.apple.com/us/app/transporter/id1450874784

### C — fastlane (preferred for CI)

`Fastfile`:

```ruby
default_platform(:ios)
platform :ios do
  lane :release do
    setup_ci
    match(type: "appstore")               # cert/profile sync
    gym(scheme: "YourGame", export_method: "app-store")
    pilot(skip_waiting_for_build_processing: true)   # TestFlight
    deliver(skip_metadata: false, force: true)       # App Store submission
  end
end
```

fastlane docs: https://docs.fastlane.tools/getting-started/ios/
fastlane match (cert/profile sync): https://docs.fastlane.tools/actions/match/

---

## TestFlight

Internal testers (up to 100, company team members): instant.
External testers (up to 10,000): requires beta App Review (24-48h first build, faster after).

`pilot` (fastlane) uploads build, manages testers.

Docs: https://developer.apple.com/testflight/

---

## App Store submission

`deliver` (fastlane) or Connect UI:
- Metadata per locale (description, keywords, what's new, support URL).
- Screenshots per device family (iPhone 6.5", 6.1", 5.5", iPad 12.9", 11").
- App preview videos (optional).
- Age rating questionnaire.
- Privacy nutrition labels (data collection disclosures).
- App Review Information (demo account, notes).
- IAP entries (create in Connect → In-App Purchases).

Submit for review → ~24-72h response (often < 24h in 2025+).

Review guidelines: https://developer.apple.com/app-store/review/guidelines/

---

## IAP / StoreKit

Two API surfaces:
- StoreKit 2 (Swift, recommended)
- StoreKit 1 (Obj-C, legacy)

Server-side validation: https://developer.apple.com/documentation/appstoreserverapi

For game IAP, use StoreKit 2 if iOS 15+ minimum:

```swift
let products = try await Product.products(for: ["com.you.coins_100"])
let result = try await products[0].purchase()
```

Subscriptions: same API, configure in Connect → Subscriptions.

---

## Game Center (achievements + leaderboards)

Enable capability. Create leaderboards/achievements in Connect.

```swift
let report = GKAchievement(identifier: "ach_first_kill")
report.percentComplete = 100
try await GKAchievement.report([report])
```

---

## Smoke test

- TestFlight install on a real device → launch → telemetry heartbeat.
- Simulator runs but Game Center / IAP need a real device + sandbox tester account.

---

## Rollback

iOS doesn't support binary rollback once a version is live. Mitigations:
- Submit a hotfix (review can be expedited for critical issues — request from Connect).
- Phased release: enable in Connect to roll out to a percentage daily — abort if breakage.
- Feature flags to disable broken features without binary change.

Apple expedited review: https://developer.apple.com/contact/app-store/?topic=expedite

---

## Cost note

- Apple Developer Program: $99/yr.
- Revenue share: 30% standard / 15% Small Business Program (< $1M/yr).
- No per-build cost.
- Bandwidth + hosting: free.
- macOS CI runner if not using personal Mac: ~$0.08/min on GitHub.

Small Business Program: https://developer.apple.com/app-store/small-business-program/

---

## Pitfalls

- **App Review rejection causes**: misleading screenshots, broken IAP test, undisclosed data collection, web view that's basically a website, accessing private APIs.
- **Privacy nutrition labels** must match actual behavior; lying is a fast ban.
- **Bitcode is deprecated** — leave off.
- **TestFlight beta review** can hang for 48h on first build.
- **App Specific Password** for `altool` is rate-limited; use API key (App Store Connect API) for higher CI throughput.
- **Cert / profile drift** between local Mac and CI is the #1 build failure; fastlane match fixes this.

---

## When App Store is required

| Reason | |
|--------|--|
| iOS distribution | Only path on consumer devices (no sideload until EU DMA expansion; check current Apple policy) |
| iPad / Mac App Store version | Same submission, multi-platform metadata |
| Game Center integration | Apple-exclusive |

For Mac DMG distribution outside App Store: → `docs/guides/release/sideloading.md` + `docs/guides/release/codesigning/macos.md` for notarization.

---

## Cross-links

- iOS signing detail → `docs/guides/release/codesigning/ios.md`
- macOS signing detail → `docs/guides/release/codesigning/macos.md`
- Play Store (Android equivalent) → `docs/guides/release/play-store.md`
- Sideload Mac DMG → `docs/guides/release/sideloading.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
- iOS HAL → `docs/specs/core/hal.md`
