<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Codesigning — iOS (Provisioning Profiles + Certs)

Cert + provisioning profile + entitlements → signed `.ipa`. Three cert types depending on distribution. `fastlane match` is the standard automation for keeping certs/profiles in sync across machines and CI.

Authoritative:
- https://developer.apple.com/documentation/security/preparing-your-app-to-be-distributed
- https://docs.fastlane.tools/actions/match/

---

## Cert + profile matrix

| Distribution | Cert | Profile |
|--------------|------|---------|
| Local dev | Apple Development | Development profile |
| TestFlight + App Store | Apple Distribution | App Store profile |
| Ad-Hoc (limited UDIDs, e.g., internal QA) | Apple Distribution | Ad-Hoc profile |
| Enterprise in-house | Apple Enterprise Distribution | In-House profile |

Most teams use the first two.

---

## Generate cert via Xcode

Xcode → Settings → Accounts → Manage Certificates → "+" → Apple Distribution.

Or via portal:
1. CSR from Keychain Access.
2. https://developer.apple.com/account/resources/certificates/list → Apple Distribution → upload CSR → download `.cer`.
3. Double-click to install in Keychain.

Verify:

```bash
security find-identity -v -p codesigning
# look for "Apple Distribution: Your Name (TEAMID)"
```

---

## Bundle ID + App ID

Reverse-DNS: `com.you.yourgame`. Register at https://developer.apple.com/account/resources/identifiers/list → "+" → App IDs.

Enable capabilities (Game Center, In-App Purchase, Push Notifications, etc.) on the App ID — these must match what's in your `.entitlements`.

---

## Provisioning profile

App Store profile: https://developer.apple.com/account/resources/profiles/list → "+" → App Store → select App ID + cert → download `.mobileprovision`.

Install: double-click adds to `~/Library/MobileDevice/Provisioning Profiles/`.

---

## Entitlements

`YourGame.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>aps-environment</key><string>production</string>
  <key>com.apple.developer.game-center</key><true/>
  <key>com.apple.developer.in-app-payments</key>
    <array><string>merchant.com.you.yourgame</string></array>
  <key>com.apple.developer.associated-domains</key>
    <array><string>applinks:your-site.com</string></array>
</dict>
</plist>
```

Reference: https://developer.apple.com/documentation/bundleresources/entitlements

---

## Sign + archive + export

Manual via xcodebuild:

```bash
xcodebuild -workspace YourGame.xcworkspace -scheme YourGame \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath build/YourGame.xcarchive \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER="YourGame App Store" \
  DEVELOPMENT_TEAM=ABCD1234 \
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
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.you.yourgame</key>
    <string>YourGame App Store</string>
  </dict>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
```

---

## fastlane match (recommended)

Keeps certs + profiles in a private encrypted git repo, syncs across machines.

`Matchfile`:

```ruby
git_url("git@github.com:your-org/ios-certs.git")
storage_mode("git")
type("appstore")           # or "development", "adhoc", "enterprise"
app_identifier(["com.you.yourgame"])
username("your@apple-id.com")
team_id("ABCD1234")
```

Run once per type to seed:

```bash
fastlane match appstore
```

In CI:

```bash
fastlane match appstore --readonly
```

Decrypts certs/profiles into the keychain; no manual cert juggling.

Docs: https://docs.fastlane.tools/actions/match/

---

## fastlane gym + pilot + deliver

`Fastfile`:

```ruby
default_platform(:ios)
platform :ios do
  before_all do
    setup_ci
    match(type: "appstore", readonly: true)
  end
  desc "Build + upload TestFlight"
  lane :beta do
    increment_build_number(xcodeproj: "YourGame.xcodeproj")
    gym(scheme: "YourGame", export_method: "app-store", clean: true)
    pilot(skip_waiting_for_build_processing: true)
  end
  desc "Submit App Store"
  lane :release do
    gym(scheme: "YourGame", export_method: "app-store", clean: true)
    deliver(force: true, submit_for_review: true, automatic_release: false)
  end
end
```

`gym` (build): https://docs.fastlane.tools/actions/gym/
`pilot` (TestFlight): https://docs.fastlane.tools/actions/pilot/
`deliver` (App Store metadata + binary): https://docs.fastlane.tools/actions/deliver/

---

## CI on GitHub Actions (macOS runner)

```yaml
runs-on: macos-14
steps:
  - uses: actions/checkout@v4
  - uses: ruby/setup-ruby@v1
    with: { ruby-version: '3.3', bundler-cache: true }
  - name: Setup match SSH
    env: { MATCH_SSH_KEY: ${{ secrets.MATCH_SSH_KEY }} }
    run: |
      mkdir -p ~/.ssh
      echo "$MATCH_SSH_KEY" > ~/.ssh/id_ed25519
      chmod 600 ~/.ssh/id_ed25519
      ssh-keyscan github.com >> ~/.ssh/known_hosts
  - env:
      MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
      APP_STORE_CONNECT_API_KEY_KEY_ID: ${{ secrets.ASC_KEY_ID }}
      APP_STORE_CONNECT_API_KEY_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
      APP_STORE_CONNECT_API_KEY_KEY: ${{ secrets.ASC_PRIVATE_KEY }}
    run: bundle exec fastlane beta
```

App Store Connect API key (preferred over Apple ID + ASP for CI): https://docs.fastlane.tools/app-store-connect-api/

---

## Smoke test

- TestFlight install on a real device.
- Or use `idevice_id` + `ideviceinstaller` (libimobiledevice) for headless install testing.

```bash
codesign --verify --verbose=2 dist/YourGame.ipa     # cert validity
codesign -d --entitlements - dist/YourGame.app      # check entitlements
```

---

## Revocation

Compromised distribution cert:
1. Revoke at https://developer.apple.com/account/resources/certificates/list.
2. Existing apps in store continue working (signed binaries already distributed).
3. Generate new cert, regenerate provisioning profiles, re-sync via `fastlane match nuke distribution && fastlane match appstore`.
4. Re-build + re-upload TestFlight/App Store.

---

## Pitfalls

- **Provisioning profile entitlements mismatch app entitlements** → upload fails with cryptic error. Check both sides.
- **Bundle ID typo** between Xcode project, provisioning profile, App ID, and `Info.plist` → install fails.
- **Free Apple ID** allows on-device sideload up to 3 apps, 7-day expiry — useless for distribution; need paid Apple Developer Program.
- **Cert/profile drift between local Mac and CI** is the #1 build failure. `fastlane match` solves it.
- **App Store Connect API key permissions** must include "Admin" or specific scopes for upload + submission.
- **Bitcode** is deprecated; `uploadBitcode: false`.

---

## Cross-links

- App Store submission → `docs/guides/release/app-store.md`
- macOS signing (related) → `docs/guides/release/codesigning/macos.md`
- Android signing → `docs/guides/release/codesigning/android.md`
- Secrets storage → `docs/guides/deploy/secrets.md`
