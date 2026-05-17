<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Codesigning — macOS (Developer ID + Notarization)

Sign with Developer ID Application cert → notarize via Apple → staple ticket. Without notarization, Gatekeeper hard-blocks on macOS 10.15+. App Store distribution uses a different cert (Apple Distribution / Mac App Store).

Authoritative:
- https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution
- https://developer.apple.com/documentation/security/hardened_runtime

---

## Cert types

| Cert | Used for | Where |
|------|----------|-------|
| **Developer ID Application** | Direct distribution (.app, .dmg) | Apple Developer portal → Certificates |
| **Developer ID Installer** | `.pkg` installers for direct distribution | Same portal |
| **Apple Distribution** | App Store submissions (iOS + Mac) | Same portal |
| **Apple Development** | Local dev signing | Same portal |
| **Developer ID Kernel Extension** | Kexts (rare for games) | Apple approval needed |

For Nexus games distributed outside the App Store: Developer ID Application (+ Installer for `.pkg`).

---

## Prerequisites

| Item | Cost | |
|------|------|--|
| Apple Developer Program | $99/yr | https://developer.apple.com/programs/ |
| Mac with current Xcode (or Xcode Command Line Tools) | $0 | App Store / `xcode-select --install` |
| App-specific password | $0 | https://appleid.apple.com → Security → App-Specific Passwords |
| Or App Store Connect API key | $0 | https://appstoreconnect.apple.com/access/api |

---

## Generate cert

Easiest path: Xcode → Settings → Accounts → "Manage Certificates" → "+" → Developer ID Application.

Or via portal:
1. Generate CSR (Keychain Access → Certificate Assistant → Request from CA).
2. Upload at https://developer.apple.com/account/resources/certificates/list → choose Developer ID Application.
3. Download `.cer`, double-click to install in Keychain.

Verify:

```bash
security find-identity -v -p codesigning
# look for "Developer ID Application: Your Name (TEAMID)"
```

---

## Sign the `.app`

```bash
codesign --sign "Developer ID Application: Your Name (ABCD1234)" \
  --options runtime \
  --timestamp \
  --entitlements YourGame.entitlements \
  --deep \
  YourGame.app
```

Flags:
- `--options runtime` — hardened runtime (required for notarization).
- `--timestamp` — RFC 3161 secure timestamp (required for notarization).
- `--entitlements` — XML file declaring capabilities.
- `--deep` — sign nested bundles too. **`--deep` is deprecated for sealing**; sign each nested binary explicitly for new code.

Verify:

```bash
codesign --verify --strict --deep --verbose=2 YourGame.app
spctl --assess --verbose YourGame.app
```

---

## Entitlements

`YourGame.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><false/>
  <key>com.apple.security.cs.disable-library-validation</key><false/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key><false/>
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.device.audio-input</key><true/>
</dict>
</plist>
```

Game-specific common entitlements:
- `allow-jit` — yes if WASM / scripting JIT inside the engine.
- `network.client` — for any online play.
- `device.audio-input` — voice chat.
- `app-sandbox` — App Store submissions; not for Developer ID outside-Store builds.

Full reference: https://developer.apple.com/documentation/bundleresources/entitlements

---

## Notarize via `notarytool`

```bash
# zip the .app (notarytool accepts zip, dmg, pkg)
ditto -c -k --sequesterRsrc --keepParent YourGame.app YourGame.zip

# submit
xcrun notarytool submit YourGame.zip \
  --apple-id $APPLE_ID \
  --password $APP_SPECIFIC_PASSWORD \
  --team-id $TEAM_ID \
  --wait
# (or use --key for App Store Connect API key auth)
```

Auth options:
- App-specific password (legacy but works).
- App Store Connect API key (`--key /path/AuthKey.p8 --key-id $KEY_ID --issuer $ISSUER_ID`) — recommended for CI.

Typical turnaround: 1-15 minutes. Apple scans for malware + checks signing + hardened runtime + entitlements policy compliance.

notarytool docs: https://developer.apple.com/documentation/security/customizing_the_notarization_workflow

---

## Staple the ticket

```bash
xcrun stapler staple YourGame.app
xcrun stapler validate YourGame.app
```

Stapling embeds the notarization ticket in the app so Gatekeeper accepts it even offline.

---

## Build `.dmg` (recommended distribution format)

```bash
brew install create-dmg
create-dmg \
  --volname "Your Game" \
  --volicon "assets/volume.icns" \
  --window-pos 200 120 --window-size 600 400 \
  --icon-size 100 \
  --icon "YourGame.app" 175 200 \
  --hide-extension "YourGame.app" \
  --app-drop-link 425 200 \
  "YourGame.dmg" "YourGame.app"

# sign + notarize the DMG too
codesign --sign "Developer ID Application: ..." --timestamp YourGame.dmg
xcrun notarytool submit YourGame.dmg --apple-id $APPLE_ID --password $ASP --team-id $TEAM_ID --wait
xcrun stapler staple YourGame.dmg
```

create-dmg: https://github.com/create-dmg/create-dmg

---

## Universal binary (Intel + Apple Silicon)

Build for both archs and `lipo` them:

```bash
cargo build --release --target x86_64-apple-darwin
cargo build --release --target aarch64-apple-darwin
lipo -create -output YourGame.app/Contents/MacOS/YourGame \
  target/x86_64-apple-darwin/release/yourgame \
  target/aarch64-apple-darwin/release/yourgame
```

Then sign the unified binary.

---

## CI signing (GitHub Actions macOS runner)

```yaml
runs-on: macos-14
steps:
  - uses: actions/checkout@v4
  - name: Import cert
    env:
      P12: ${{ secrets.MAC_CERT_P12 }}
      P12_PASS: ${{ secrets.MAC_CERT_PASS }}
    run: |
      KEYCHAIN=$RUNNER_TEMP/build.keychain
      echo "$P12" | base64 -d > /tmp/cert.p12
      security create-keychain -p "" "$KEYCHAIN"
      security default-keychain -s "$KEYCHAIN"
      security unlock-keychain -p "" "$KEYCHAIN"
      security import /tmp/cert.p12 -k "$KEYCHAIN" -P "$P12_PASS" -T /usr/bin/codesign
      security set-key-partition-list -S apple-tool:,apple:codesign -s -k "" "$KEYCHAIN"
      rm /tmp/cert.p12
  - name: Build + sign + notarize
    env:
      APPLE_ID: ${{ secrets.APPLE_ID }}
      ASP: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
      TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    run: |
      nexus release build --target macos
      codesign --sign "Developer ID Application: Your Name ($TEAM_ID)" \
        --options runtime --timestamp \
        --entitlements YourGame.entitlements \
        dist/YourGame.app
      ditto -c -k --sequesterRsrc --keepParent dist/YourGame.app dist/YourGame.zip
      xcrun notarytool submit dist/YourGame.zip \
        --apple-id "$APPLE_ID" --password "$ASP" --team-id "$TEAM_ID" --wait
      xcrun stapler staple dist/YourGame.app
```

---

## Smoke test

```bash
# unsigned/unnotarized assessment
spctl --assess --verbose YourGame.app
# expect: "accepted" with source "Notarized Developer ID"

# launch from a clean VM via Finder → no Gatekeeper prompt should appear
```

---

## Revocation

Compromised Developer ID cert:
1. Apple Developer portal → revoke cert.
2. Apple revokes notarization tickets associated.
3. Previously distributed binaries may stop launching on macOS depending on user's revocation settings.
4. Issue new cert, re-sign, re-notarize, re-distribute.

Mitigate by storing the `.p12` in a secrets backend (→ `docs/guides/deploy/secrets.md`), never in repo, never on a shared machine.

---

## Pitfalls

- **Forgetting `--options runtime`** → notarization rejects.
- **No `--timestamp`** → notarization rejects.
- **Hardened runtime + JIT** without `allow-jit` entitlement → runtime crash. Set the entitlement.
- **`--deep` is being phased out** for sealing; sign each nested binary individually for forward compatibility.
- **Notarytool with App ID password** can stall if Apple ID has 2FA without an app-specific password.
- **Universal binary signing** must happen after `lipo`, not before.
- **DMG must also be notarized** for clean install experience.

---

## App Store submission differs

Apple Distribution cert + Xcode Organizer upload + provisioning profile match. → `docs/guides/release/app-store.md`.

---

## Cross-links

- Windows signing → `docs/guides/release/codesigning/windows.md`
- iOS signing → `docs/guides/release/codesigning/ios.md`
- App Store submission → `docs/guides/release/app-store.md`
- Sideload macOS → `docs/guides/release/sideloading.md`
- Installer authoring → `docs/guides/release/installers.md`
- Secrets storage → `docs/guides/deploy/secrets.md`
