<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Codesigning — Linux

No central OS-level enforced signing like Windows/macOS. Each distribution channel (AppImage, Flatpak, Snap, distro repo) has its own signing convention. GPG is the common thread.

→ Distribution channels: `docs/guides/release/sideloading.md`.

---

## Generate signing key

```bash
gpg --batch --quick-gen-key "Your Studio <release@your-studio.com>" \
    ed25519 sign 2y
gpg --list-secret-keys --keyid-format=long
# note the long key ID, e.g. ABCD1234EF567890
```

Export public key for publication:

```bash
gpg --armor --export ABCD1234EF567890 > release.pub.asc
```

Publish at:
- Your site (`https://your-studio.com/release.pub.asc`)
- Keyserver: `gpg --keyserver hkps://keys.openpgp.org --send-keys ABCD1234EF567890`

Users verify:

```bash
gpg --keyserver hkps://keys.openpgp.org --recv-keys ABCD1234EF567890
gpg --verify YourGame.AppImage.asc YourGame.AppImage
```

---

## AppImage signing

Embed signature into the AppImage:

```bash
appimagetool YourGame.AppDir YourGame-x86_64.AppImage \
  --sign \
  --sign-key ABCD1234EF567890
```

Or detached signature post-hoc:

```bash
gpg --detach-sign --armor YourGame.AppImage
# produces YourGame.AppImage.asc
```

AppImage signing docs: https://docs.appimage.org/packaging-guide/optional/signatures.html

AppImageUpdate (auto-update) verifies the embedded signature on each update.

---

## Flatpak signing

Flatpak repos are signed with a per-repo GPG key. Flathub signs centrally; for self-hosted repos:

```bash
flatpak build-update-repo --gpg-sign=ABCD1234EF567890 my-repo/
flatpak build-sign --gpg-sign=ABCD1234EF567890 my-repo/ org.yousite.YourGame
```

Users add the repo with key:

```bash
flatpak remote-add --gpg-import=release.pub.asc your-studio https://your-studio.com/flatpak
```

For Flathub submissions, Flathub does the signing. Just submit the manifest. → `docs/guides/release/sideloading.md`.

Flatpak signing docs: https://docs.flatpak.org/en/latest/hosting-a-repository.html

---

## Snap signing

Canonical signs Snap Store builds automatically; you sign your snap with your developer key implicitly via `snapcraft login`.

For self-hosted Snap (rare): no signing required — Snap relies on Snap Store trust + sandbox.

---

## Distro repo signing keys

### Debian/Ubuntu `.deb` repo (your own)

Use `reprepro` or `aptly`:

```bash
aptly repo create -distribution=stable -component=main yourgame-stable
aptly repo add yourgame-stable yourgame_0.1.0_amd64.deb
aptly snapshot create yourgame-stable-0.1.0 from repo yourgame-stable
aptly publish snapshot -gpg-key=ABCD1234EF567890 yourgame-stable-0.1.0 stable
```

User adds:

```bash
curl -fsSL https://your-studio.com/release.pub.asc | sudo tee /etc/apt/keyrings/yourstudio.asc
echo "deb [signed-by=/etc/apt/keyrings/yourstudio.asc] https://your-studio.com/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/yourstudio.list
sudo apt update && sudo apt install yourgame
```

aptly docs: https://www.aptly.info

### RPM repo

```bash
createrepo_c repo/
gpg --detach-sign --armor repo/repodata/repomd.xml
```

User imports key:

```bash
sudo rpm --import https://your-studio.com/release.pub.asc
```

createrepo_c: https://docs.fedoraproject.org/en-US/quick-docs/setup-rpmfusion/

### AUR

PKGBUILDs are not signed by AUR. The source tarball you reference should be signed:

```bash
gpg --detach-sign --armor yourgame-0.1.0.tar.gz
# upload both files
```

In PKGBUILD:

```bash
source=("https://your-site.com/yourgame-${pkgver}.tar.gz"
        "https://your-site.com/yourgame-${pkgver}.tar.gz.asc")
validpgpkeys=('ABCD1234EF567890ABCDEF1234567890ABCD12EF')  # full fingerprint
```

---

## GPG hygiene

- **Store private key in a hardware token** (YubiKey 5, Nitrokey) when feasible. Token-resident keys can't be exfiltrated.
- **Use a subkey for releases**, master key offline. Compromise of subkey ≠ identity compromise.
- **Rotate every 2 years** via the key's expiry.
- **Backup master key offline** (paper backup, USB in a safe).
- **Never paste private key into chat/CI logs.**

YubiKey + GPG: https://github.com/drduh/YubiKey-Guide

---

## CI signing

GitHub Actions example (GPG):

```yaml
- name: Import key
  env: { GPG_PRIVATE_KEY: ${{ secrets.GPG_PRIVATE_KEY }}, GPG_PASSPHRASE: ${{ secrets.GPG_PASSPHRASE }} }
  run: |
    echo "$GPG_PRIVATE_KEY" | gpg --batch --import
    echo "default-cache-ttl 7200" > ~/.gnupg/gpg-agent.conf
    echo "$GPG_PASSPHRASE" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --sign --output /dev/null /dev/null

- name: Sign artifacts
  run: |
    gpg --batch --detach-sign --armor dist/YourGame.AppImage
    gpg --batch --detach-sign --armor dist/yourgame-0.1.0-x86_64.tar.gz
```

Store the **subkey** in CI, not the master. → `docs/guides/deploy/secrets.md`.

---

## Smoke test

```bash
gpg --verify dist/YourGame.AppImage.asc dist/YourGame.AppImage
# expect "Good signature from Your Studio <release@...>"
```

For a fresh user simulation:

```bash
docker run --rm -it ubuntu:24.04 bash
apt update && apt install -y gpg wget
wget https://your-studio.com/release.pub.asc -O- | gpg --import
wget https://your-studio.com/YourGame.AppImage{,.asc}
gpg --verify YourGame.AppImage.asc YourGame.AppImage
```

---

## Revocation

Compromised GPG key:
1. Generate revocation certificate (do this at creation time and store offline).
   ```bash
   gpg --output revoke.asc --gen-revoke ABCD1234EF567890
   ```
2. Import + push revocation to keyservers.
   ```bash
   gpg --import revoke.asc
   gpg --keyserver hkps://keys.openpgp.org --send-keys ABCD1234EF567890
   ```
3. Generate new key, publish new fingerprint, update all signing pipelines.
4. Notify users via release notes + your site.

---

## Pitfalls

- **No revocation cert pre-generated** → can't revoke a compromised key from a backup.
- **Key in plaintext on CI** → use a secrets backend, or hardware-token-based signing.
- **Mixed key fingerprints across distros** → users get confused about which key signs what. Pick one key per artifact stream.
- **Snap/Flathub auto-signing only on official stores** → don't assume signing happens.
- **AppImage embedded sig vs detached sig** are different verification flows; pick one and document it.

---

## Cross-links

- AppImage / Flatpak / Snap / AUR distribution → `docs/guides/release/sideloading.md`
- Auto-update → `docs/guides/release/auto-update.md` (AppImageUpdate uses these sigs)
- Windows signing → `docs/guides/release/codesigning/windows.md`
- macOS signing → `docs/guides/release/codesigning/macos.md`
- Secrets storage → `docs/guides/deploy/secrets.md`
