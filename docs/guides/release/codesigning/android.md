<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Codesigning — Android

Two-key model under Play App Signing:
- **Upload key** — yours; signs AABs you upload.
- **App signing key** — Google's (or yours, if you opt in); signs APKs distributed to users.

Sideload distribution uses a single keystore.

Authoritative: https://developer.android.com/studio/publish/app-signing

---

## Generate upload keystore

```bash
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass $KEYSTORE_PASS \
  -keypass $KEY_PASS \
  -dname "CN=Your Studio,O=Your Studio,L=City,S=State,C=US"
```

Store the `.jks` in your secrets backend. → `docs/guides/deploy/secrets.md`.

**Don't lose it.** For sideload-only distribution: losing the keystore means you can never update existing installs (Android only accepts updates signed by the same key).

For Play Store: with Play App Signing, you can reset the upload key via Play Console support — but the app signing key (held by Google) remains constant.

---

## Sign AAB / APK with Gradle

`app/build.gradle.kts`:

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_FILE") ?: "upload-keystore.jks")
            storePassword = System.getenv("KEYSTORE_PASS")
            keyAlias = System.getenv("KEY_ALIAS") ?: "upload"
            keyPassword = System.getenv("KEY_PASS")
            enableV1Signing = false        // disable JAR signing (legacy)
            enableV2Signing = true         // APK Signature Scheme v2
            enableV3Signing = true         // v3 (rotation)
            enableV4Signing = true         // v4 (incremental install on Android 11+)
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
        }
    }
}
```

Build:

```bash
./gradlew bundleRelease     # produces app-release.aab signed with upload key
./gradlew assembleRelease   # produces app-release.apk for sideload
```

APK signing scheme reference: https://source.android.com/docs/security/features/apksigning

---

## Manual sign with `apksigner` / `jarsigner`

For an unsigned APK from CI:

```bash
apksigner sign --ks upload-keystore.jks \
  --ks-key-alias upload \
  --ks-pass env:KEYSTORE_PASS \
  --key-pass env:KEY_PASS \
  --out app-signed.apk app-unsigned.apk

apksigner verify --verbose app-signed.apk
```

For AAB:

```bash
jarsigner -keystore upload-keystore.jks \
  -storepass:env KEYSTORE_PASS \
  -keypass:env KEY_PASS \
  app-release.aab upload
```

apksigner docs: https://developer.android.com/tools/apksigner

---

## Play App Signing enrollment

First release on Play Console:
1. Upload AAB signed with upload key.
2. Play Console offers Play App Signing → enroll.
3. Option A: Google generates the app signing key (recommended).
   Option B: You upload an existing app signing key (irreversible).
4. From now on, every AAB signed with upload key gets re-signed by Google for distribution.

Reset upload key procedure (if compromised):
1. Generate new upload key.
2. Export public cert: `keytool -export -rfc -keystore upload-keystore.jks -alias upload -file upload_cert.pem`
3. Play Console → App Signing → Request upload key reset → upload new cert.
4. Google approves within 48h.

Docs: https://support.google.com/googleplay/android-developer/answer/9842756

---

## Sideload-only flow (no Play)

You hold the single key. Same key signs every update forever:

```bash
keytool -genkey -keystore sideload.jks -alias sideload -keyalg RSA -keysize 4096 -validity 20000 ...
apksigner sign --ks sideload.jks --ks-pass env:PASS app.apk
```

For F-Droid: optional reproducible builds, your APK signed by F-Droid's key by default. Or "Reproducible Builds with Developer Signature" lets your key be used.

F-Droid signing: https://f-droid.org/en/docs/Reproducible_Builds/

---

## CI signing

`.github/workflows/release-android.yml`:

```yaml
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - name: Decode keystore
        env: { KEYSTORE_B64: ${{ secrets.UPLOAD_KEYSTORE_B64 }} }
        run: echo "$KEYSTORE_B64" | base64 -d > $RUNNER_TEMP/upload-keystore.jks
      - name: Build + sign AAB
        env:
          KEYSTORE_FILE: ${{ runner.temp }}/upload-keystore.jks
          KEYSTORE_PASS: ${{ secrets.KEYSTORE_PASS }}
          KEY_PASS: ${{ secrets.KEY_PASS }}
        run: ./gradlew bundleRelease
      - uses: actions/upload-artifact@v4
        with: { name: aab, path: app/build/outputs/bundle/release/app-release.aab }
```

---

## Smoke test

```bash
apksigner verify --verbose --print-certs app-release.apk
# expect Signer #1 with your cert subject

# install on device:
adb install -r app-release.apk
```

For AAB → APK extraction for device testing:

```bash
bundletool build-apks --bundle=app-release.aab --output=app.apks \
  --ks=upload-keystore.jks --ks-pass=env:KEYSTORE_PASS \
  --ks-key-alias=upload --key-pass=env:KEY_PASS
bundletool install-apks --apks=app.apks
```

bundletool: https://developer.android.com/tools/bundletool

---

## Pitfalls

- **Lost keystore (sideload)** → cannot update; users must uninstall + reinstall (losing save data). Back up.
- **v1 signing only (JAR)** → install fails on Android 11+ Play. Always enable v2+v3.
- **Targeting wrong `targetSdkVersion`** → Play rejects (annual minimum bumps).
- **Multiple ABIs missing** → must include `arm64-v8a` for 64-bit Play policy.
- **Different key for debug vs release** is normal; debug key is auto-generated by Gradle.
- **Switching from upload-only to Play App Signing later** is possible but a one-way door.

---

## Cross-links

- Play Store submission → `docs/guides/release/play-store.md`
- Sideload APK distribution → `docs/guides/release/sideloading.md`
- F-Droid → `docs/guides/release/sideloading.md`
- Meta Quest (APK signing reuses Android flow) → `docs/guides/release/meta-quest.md`
- Secrets storage → `docs/guides/deploy/secrets.md`
