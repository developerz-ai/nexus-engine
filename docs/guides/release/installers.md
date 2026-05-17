<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Installer Authoring

Per-OS installer formats and the tools to author them. Signed installers + auto-update = real distribution.

→ Signing: `docs/guides/release/codesigning/`. Auto-update: `docs/guides/release/auto-update.md`. Direct distribution: `docs/guides/release/sideloading.md`.

---

## Windows installers

| Tool | Format | Best for |
|------|--------|---------|
| Inno Setup | `.exe` installer | Most indie games. Free, mature, simple. |
| NSIS | `.exe` installer | More flexible scripting; uglier UI defaults. |
| WiX Toolset | `.msi` | Enterprise-friendly. Group Policy installable. |
| MSIX | `.msix` | MS Store + modern sideload with auto-update via Windows. |

### Inno Setup recipe

`installer.iss`:

```pascal
[Setup]
AppId={{12345678-1234-1234-1234-123456789012}}
AppName=Your Game
AppVersion=0.1.0
AppPublisher=Your Studio
AppPublisherURL=https://your-studio.com
DefaultDirName={autopf}\YourGame
DefaultGroupName=Your Game
OutputBaseFilename=YourGameSetup
OutputDir=dist\windows
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
PrivilegesRequired=lowest
SignTool=signtool

[Files]
Source: "dist\windows\YourGame.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\windows\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\Your Game"; Filename: "{app}\YourGame.exe"
Name: "{commondesktop}\Your Game"; Filename: "{app}\YourGame.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Run]
Filename: "{app}\YourGame.exe"; Description: "Launch Your Game"; Flags: nowait postinstall skipifsilent
```

Compile + sign:

```powershell
iscc installer.iss
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
  /f cert.pfx /p $env:CERT_PASS dist/windows/YourGameSetup.exe
```

Inno Setup docs: https://jrsoftware.org/ishelp/

`SignTool` directive in `.iss` invokes signtool during compile; set up via Inno's Tools → Configure Sign Tools.

### WiX (MSI) recipe

`installer.wxs`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="Your Game" Manufacturer="Your Studio"
           Version="0.1.0" UpgradeCode="12345678-1234-1234-1234-123456789012"
           Scope="perUser">
    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />
    <MediaTemplate EmbedCab="yes" CompressionLevel="high" />
    <Feature Id="Main" Title="Your Game" Level="1">
      <ComponentGroupRef Id="MainFiles" />
    </Feature>
    <StandardDirectory Id="LocalAppDataFolder">
      <Directory Id="INSTALLFOLDER" Name="YourGame" />
    </StandardDirectory>
  </Package>
  <Fragment>
    <ComponentGroup Id="MainFiles" Directory="INSTALLFOLDER">
      <Component>
        <File Source="dist/windows/YourGame.exe" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>
```

Build:

```bash
wix build installer.wxs -o dist/windows/YourGame.msi
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
  /f cert.pfx /p $env:CERT_PASS dist/windows/YourGame.msi
```

WiX v4 docs: https://wixtoolset.org/docs/

### MSIX

→ `docs/guides/release/microsoft-store.md` for the MSIX manifest + signing.

---

## macOS installers

| Format | Best for |
|--------|---------|
| `.dmg` | Default for direct distribution; user drags to /Applications |
| `.pkg` | Required for installers that need root or post-install scripts |
| `.app` zipped | Smallest footprint; users right-click → Open the first time |

### `.dmg` with create-dmg

```bash
brew install create-dmg
create-dmg \
  --volname "Your Game" \
  --volicon "assets/volume.icns" \
  --background "assets/dmg-bg.png" \
  --window-pos 200 120 --window-size 800 500 \
  --icon-size 100 \
  --icon "YourGame.app" 200 250 \
  --hide-extension "YourGame.app" \
  --app-drop-link 600 250 \
  --eula "assets/LICENSE.txt" \
  "dist/macos/YourGame.dmg" "dist/macos/YourGame.app"
```

Sign + notarize the DMG too → `docs/guides/release/codesigning/macos.md`.

create-dmg: https://github.com/create-dmg/create-dmg

### `.pkg` with `productbuild`

```bash
productbuild \
  --component dist/macos/YourGame.app /Applications \
  --sign "Developer ID Installer: Your Name (TEAMID)" \
  dist/macos/YourGame.pkg
```

Notarize via notarytool.

---

## Linux installers

| Format | Best for | Tool |
|--------|---------|------|
| `.AppImage` | Universal portable | appimagetool |
| `.flatpak` | Sandboxed, distro-agnostic | flatpak-builder |
| `.snap` | Canonical-curated | snapcraft |
| `.deb` | Debian/Ubuntu | fpm or dh_make |
| `.rpm` | Fedora/RHEL | fpm or rpmbuild |
| `.pkg.tar.zst` | Arch | makepkg (PKGBUILD) |

### AppImage

```bash
# build the AppDir structure first
AppDir/
├── usr/bin/yourgame
├── usr/share/applications/yourgame.desktop
├── usr/share/icons/hicolor/256x256/apps/yourgame.png
└── AppRun       # entrypoint

appimagetool AppDir YourGame-x86_64.AppImage --sign --sign-key $GPG_KEY
```

appimagetool: https://github.com/AppImage/AppImageKit

### `.deb` / `.rpm` via fpm

```bash
fpm -s dir -t deb -n yourgame -v 0.1.0 \
  --license MIT \
  --maintainer "release@your-studio.com" \
  --description "Your Game built on Nexus" \
  --depends "libvulkan1" --depends "libasound2t64" \
  dist/linux/=/usr/local/

fpm -s dir -t rpm -n yourgame -v 0.1.0 \
  --license MIT \
  --depends "vulkan-loader" --depends "alsa-lib" \
  dist/linux/=/usr/local/
```

fpm: https://github.com/jordansissel/fpm

### Flatpak / Snap / AUR

→ `docs/guides/release/sideloading.md` for full recipes.

---

## Cross-platform installer authoring

Pick **per OS native**. No truly cross-platform installer tool is good for games (Java-based ones look ugly, are bloated, and tied to the JVM).

The Nexus CLI orchestrates:

```bash
nexus release installer --target windows,macos,linux
# produces: dist/windows/YourGameSetup.exe (Inno)
#           dist/macos/YourGame.dmg
#           dist/linux/YourGame-x86_64.AppImage + yourgame_0.1.0_amd64.deb + yourgame-0.1.0-x86_64.rpm
```

Internally invokes Inno Setup (via wine on Linux CI if needed), create-dmg (macOS runner), appimagetool + fpm (Linux runner).

---

## CI matrix example

```yaml
strategy:
  matrix:
    include:
      - os: windows-latest
        target: windows
        installer: inno
      - os: macos-14
        target: macos
        installer: dmg
      - os: ubuntu-24.04
        target: linux
        installer: appimage
runs-on: ${{ matrix.os }}
steps:
  - uses: actions/checkout@v4
  - run: nexus release build --target ${{ matrix.target }}
  - run: nexus release installer --target ${{ matrix.target }} --signed
  - uses: actions/upload-artifact@v4
    with: { name: installer-${{ matrix.target }}, path: dist/${{ matrix.target }}/ }
```

---

## Smoke test

Install on a clean VM per OS → launch → verify version → check uninstall.

```bash
# Windows
YourGameSetup.exe /SILENT
"%LOCALAPPDATA%\YourGame\YourGame.exe" --version

# macOS
hdiutil attach YourGame.dmg
cp -R /Volumes/YourGame/YourGame.app /Applications/
/Applications/YourGame.app/Contents/MacOS/YourGame --version

# Linux AppImage
./YourGame-x86_64.AppImage --version
```

---

## Pitfalls

- **Inno Setup default install path** to `Program Files` requires admin; use `{autopf}` with `PrivilegesRequired=lowest` for per-user install.
- **DMG forgotten to notarize** → user gets Gatekeeper warning even though the inner .app is notarized.
- **`.deb` missing dependencies** → install succeeds, runtime fails. Explicit `--depends` per OS-shipped lib.
- **AppImage glibc too new** → won't run on older distros. Build on the oldest distro you target (Ubuntu 22.04 typical).
- **WiX UpgradeCode reuse** between unrelated apps → MSI installer collisions.
- **Inno Setup signtool** integration needs configured "Sign Tool" definition; otherwise installer is unsigned even if you signed the inner `.exe`.

---

## Cross-links

- Windows signing → `docs/guides/release/codesigning/windows.md`
- macOS signing/notarization → `docs/guides/release/codesigning/macos.md`
- Linux signing → `docs/guides/release/codesigning/linux.md`
- Direct distribution → `docs/guides/release/sideloading.md`
- Auto-update → `docs/guides/release/auto-update.md`
