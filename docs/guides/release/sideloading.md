<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Sideloading (Direct Distribution)

Ship binaries from your own site. No store cut. Players opt-in by clicking a download link. Pair with auto-update for a real experience.

→ Signing: `docs/guides/release/codesigning/`. Installers: `docs/guides/release/installers.md`. Updates: `docs/guides/release/auto-update.md`.

---

## Format per platform

| Platform | Format | Distribution |
|----------|--------|--------------|
| Windows | `.exe` (Inno Setup, NSIS), `.msi` (WiX), `.msix` (sideload-signed) | Direct DL, GitHub Releases, Scoop bucket |
| macOS | `.dmg`, `.pkg`, `.app` zipped | Direct DL, Homebrew tap |
| Linux | `.AppImage`, `.flatpak`, `.snap`, `.deb`, `.rpm`, tar.zst | Direct DL, Flathub, Snap Store, AUR |
| Android | `.apk` | Direct DL, F-Droid, Amazon, your site |
| iOS | `.ipa` via AltStore / Sideloadly (limited) | Niche; EU DMA marketplaces opening up |

---

## Windows direct

Sign first → distribute.

```bash
# Inno Setup compiled installer
iscc installer.iss
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
  /f cert.pfx /p $CERT_PASS dist/YourGameSetup.exe
```

Direct distribution:
- GitHub Releases — free for OSS, attached binaries
- Your S3/R2 bucket behind your domain
- Scoop bucket: https://scoop.sh
- WinGet manifest: https://learn.microsoft.com/windows/package-manager/

→ Full: `docs/guides/release/codesigning/windows.md` and `docs/guides/release/installers.md`.

---

## macOS direct

Sign + notarize + staple:

```bash
codesign --sign "Developer ID Application: Your Name (TEAMID)" \
  --options runtime --timestamp YourGame.app
ditto -c -k --sequesterRsrc --keepParent YourGame.app YourGame.zip
xcrun notarytool submit YourGame.zip --apple-id $APPLE_ID --password $ASP \
  --team-id $TEAM_ID --wait
xcrun stapler staple YourGame.app
hdiutil create -volname "Your Game" -srcfolder YourGame.app -ov -format UDZO YourGame.dmg
codesign --sign "Developer ID Application: ..." YourGame.dmg
```

Distribute via Sparkle-equipped DMG or Homebrew cask:

```ruby
# Homebrew Cask formula
cask "your-game" do
  version "0.1.0"
  sha256 "<sha256>"
  url "https://your-site.com/YourGame-#{version}.dmg"
  name "Your Game"
  homepage "https://your-site.com"
  app "YourGame.app"
end
```

→ `docs/guides/release/codesigning/macos.md`. Homebrew Cask docs: https://docs.brew.sh/Cask-Cookbook

---

## Linux direct

### AppImage

Single-file portable executable. Runs on most distros.

```bash
appimagetool YourGame.AppDir YourGame-x86_64.AppImage
# optional sign:
gpg --detach-sign YourGame-x86_64.AppImage
```

Docs: https://docs.appimage.org

### Flatpak (Flathub)

Sandboxed, distro-agnostic. Submit manifest to Flathub.

```yaml
# org.yousite.YourGame.yml
app-id: org.yousite.YourGame
runtime: org.freedesktop.Platform
runtime-version: '23.08'
sdk: org.freedesktop.Sdk
command: yourgame
modules:
  - name: yourgame
    buildsystem: simple
    build-commands:
      - install -Dm755 yourgame /app/bin/yourgame
    sources:
      - type: archive
        url: https://your-site.com/yourgame-0.1.0.tar.gz
        sha256: ...
```

Submit at https://github.com/flathub/flathub. Flatpak docs: https://docs.flatpak.org

### Snap

Canonical's package manager.

`snap/snapcraft.yaml`:

```yaml
name: yourgame
version: '0.1.0'
summary: A game.
description: Your game built on Nexus.
confinement: strict
base: core22
parts:
  yourgame:
    plugin: dump
    source: dist/linux/
apps:
  yourgame:
    command: yourgame
    plugs: [home, network, opengl, audio-playback, joystick, wayland, x11]
```

```bash
snapcraft
snapcraft upload --release=stable yourgame_0.1.0_amd64.snap
```

Docs: https://snapcraft.io/docs

### Arch AUR (PKGBUILD)

```bash
# PKGBUILD
pkgname=yourgame
pkgver=0.1.0
pkgrel=1
arch=('x86_64')
url='https://your-site.com'
license=('MIT')
depends=('glibc' 'vulkan-icd-loader')
source=("https://your-site.com/yourgame-${pkgver}-linux.tar.gz")
sha256sums=('...')
package() {
  install -Dm755 "$srcdir/yourgame" "$pkgdir/usr/bin/yourgame"
  install -Dm644 "$srcdir/yourgame.desktop" "$pkgdir/usr/share/applications/yourgame.desktop"
}
```

Push to https://aur.archlinux.org. AUR docs: https://wiki.archlinux.org/title/Arch_User_Repository

### `.deb` (Debian / Ubuntu)

```bash
fpm -s dir -t deb -n yourgame -v 0.1.0 \
  --license MIT --maintainer "you@example.com" \
  dist/linux/=/usr/local/
# produces yourgame_0.1.0_amd64.deb
```

fpm: https://github.com/jordansissel/fpm

### `.rpm` (Fedora / RHEL)

```bash
fpm -s dir -t rpm -n yourgame -v 0.1.0 \
  --license MIT --maintainer "you@example.com" \
  dist/linux/=/usr/local/
```

### Signing keys

GPG-sign each artifact:

```bash
gpg --detach-sign --armor YourGame.AppImage     # produces .asc
```

Publish public key on your site + keyservers. Players verify:

```bash
gpg --verify YourGame.AppImage.asc YourGame.AppImage
```

→ `docs/guides/release/codesigning/linux.md`.

---

## Android sideload (APK)

```bash
# build signed APK (not AAB) for direct DL
./gradlew assembleRelease
# dist/yourgame.apk

# host on your site or F-Droid
```

F-Droid:
- All FOSS metadata required; reproducible build preferred
- Submit at https://f-droid.org/en/docs/Submitting_to_F-Droid_Quick_Start_Guide/

Direct download UX: instruct users to enable "Install from unknown sources" per-app.

---

## iOS sideload

Limited by Apple. Options as of May 2026:
- **EU DMA alternative app marketplaces** (AltStore PAL, Setapp Mobile, etc.) — region-locked to EU.
- **AltStore / Sideloadly** — refreshes every 7 days with a free Apple ID (developer mode).
- **Enterprise distribution** — for in-house apps only, abuse risks revocation.

[VERIFY — Apple's sideload posture evolves; check current policy at https://developer.apple.com.]

---

## Auto-update on sideload

→ `docs/guides/release/auto-update.md`. Patterns:
- **macOS** — Sparkle framework reads appcast.xml.
- **Windows** — WinSparkle, Squirrel.Windows, or your own checker.
- **Linux** — AppImageUpdate, or distro repo updates handle it.
- **Cross-platform** — Nexus ships a built-in HTTPS-pull updater (`nexus-updater`) reading a signed `updates.json`.

---

## CDN for direct downloads

| CDN | Best for | Cost |
|-----|---------|------|
| Cloudflare R2 + custom domain | Zero egress, generous free tier | ~$0-$15/mo for typical indie |
| Backblaze B2 + Cloudflare CDN | Bandwidth alliance = free egress | ~$0-$10/mo |
| GitHub Releases | Free, fine for OSS | $0 (free) |
| Your own server (Hetzner + Caddy) | Sovereignty | ~$5/mo |

→ `docs/guides/deploy/targets/cloudflare.md`.

---

## Smoke test

| Platform | Command |
|----------|--------|
| Windows | `Get-AuthenticodeSignature dist/YourGame.exe` |
| macOS | `spctl --assess -v dist/YourGame.app` (should say "accepted") |
| Linux AppImage | `./YourGame.AppImage --version` |
| Android | `adb install dist/yourgame.apk` |

---

## Pitfalls

- **Unsigned Windows binary** → SmartScreen scary warning, install conversion drops 50%+. Sign or use EV.
- **macOS un-notarized** → Gatekeeper hard-blocks since macOS 10.15. Mandatory.
- **Linux distro fragmentation** → ship AppImage as the universal fallback alongside Flatpak/Snap.
- **No auto-update** → players never patch; ship Sparkle/WinSparkle/nexus-updater from day one.
- **Mirror integrity** → publish SHA256 + GPG sig next to every download.

---

## Cross-links

- Signing per OS → `docs/guides/release/codesigning/`
- Installers per OS → `docs/guides/release/installers.md`
- Auto-update → `docs/guides/release/auto-update.md`
- Store alternatives → `docs/guides/release/{steam,itch-io,gog,microsoft-store,play-store}.md`
- Asset CDN → `docs/guides/deploy/targets/cloudflare.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
