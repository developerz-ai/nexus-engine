<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Auto-Update

Players don't manually update. Ship an updater from v0.1.0. Per-OS conventions exist; Nexus also ships a cross-platform updater (`nexus-updater`) for sideload distribution.

→ Direct distribution: `docs/guides/release/sideloading.md`. Signing: `docs/guides/release/codesigning/`.

---

## When you need an updater

| Channel | Updater handles updates |
|---------|------------------------|
| Steam | yes (Steam client) |
| itch.io (with itch app) | yes |
| Epic Games Store | yes |
| GOG Galaxy | yes |
| Microsoft Store / MSIX | yes (Windows) |
| App Store / Play Store / Meta Quest | yes (system) |
| Console | yes (system) |
| **Direct download (.exe / .dmg / .AppImage / .deb / APK sideload)** | **NO — you must ship one** |

Custom-distributed builds always need an updater. This is where Sparkle / WinSparkle / nexus-updater come in.

---

## macOS — Sparkle

The de-facto standard for direct-distributed Mac apps. EdDSA-signed updates, delta patches.

`Info.plist`:

```xml
<key>SUFeedURL</key>
<string>https://your-studio.com/appcast.xml</string>
<key>SUPublicEDKey</key>
<string>YOUR_BASE64_PUBLIC_KEY</string>
```

`appcast.xml` on your server:

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <title>Version 0.1.1</title>
      <pubDate>Sat, 17 May 2026 12:00:00 +0000</pubDate>
      <sparkle:version>0.1.1</sparkle:version>
      <sparkle:shortVersionString>0.1.1</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>11.0</sparkle:minimumSystemVersion>
      <enclosure
        url="https://your-studio.com/YourGame-0.1.1.zip"
        length="123456789"
        type="application/octet-stream"
        sparkle:edSignature="..." />
    </item>
  </channel>
</rss>
```

Generate signature:

```bash
./Sparkle/bin/sign_update YourGame-0.1.1.zip
```

Sparkle docs: https://sparkle-project.org

For non-AppKit / non-Cocoa games (e.g., a Rust + wgpu game), use `Sparkle.framework` linked directly; call `[SPUStandardUpdaterController updateNow:]` on a menu item.

---

## Windows — WinSparkle

Cross-platform Sparkle port for Win32/Win64. C API. DSA / Ed25519 signed.

```c
#include <winsparkle.h>

int main() {
    win_sparkle_set_appcast_url("https://your-studio.com/winappcast.xml");
    win_sparkle_set_app_details(L"Your Studio", L"YourGame", L"0.1.0");
    win_sparkle_set_dsa_pub_pem(dsa_pub_pem);   // or Ed25519
    win_sparkle_init();
    // ... game loop ...
    win_sparkle_cleanup();
}
```

`winappcast.xml` same as Sparkle's appcast but pointing to `.exe` / `.msi`.

WinSparkle: https://winsparkle.org

---

## Windows — Squirrel.Windows

Alternative — package + auto-update in one. Used by Slack, Atom, GitHub Desktop. Pulls Nuget-style packages.

```powershell
Squirrel --releasify YourGame.0.1.1.nupkg
# uploads RELEASES + .nupkg to your server
```

Repo: https://github.com/Squirrel/Squirrel.Windows

Trade-off: Squirrel installs to `%LocalAppData%\YourGame\` (no admin), updates seamless, but no system-wide install option.

---

## Cross-platform — `nexus-updater`

Nexus ships a built-in updater for games shipped outside stores. Lightweight HTTPS-pull updater. Verifies Ed25519 signature on each downloaded artifact.

`Nexus.toml`:

```toml
[release.updater]
manifest_url = "https://your-studio.com/updates/manifest.json"
channel = "stable"             # stable | beta | nightly
ed25519_pubkey = "base64..."
check_interval_secs = 86400
delta_supported = true
```

`manifest.json` on your server:

```json
{
  "channel": "stable",
  "latest": {
    "version": "0.1.1",
    "released_at": "2026-05-17T12:00:00Z",
    "artifacts": [
      {
        "platform": "windows-x86_64",
        "url": "https://your-studio.com/dl/yourgame-0.1.1-win-x64.zip",
        "sha256": "abc...",
        "ed25519_sig": "def...",
        "size": 123456789,
        "delta_from": { "0.1.0": "https://your-studio.com/dl/yourgame-0.1.0-to-0.1.1-win.patch" }
      },
      {
        "platform": "macos-universal",
        "url": "https://your-studio.com/dl/yourgame-0.1.1-mac.zip",
        "sha256": "..."
      },
      {
        "platform": "linux-x86_64",
        "url": "https://your-studio.com/dl/yourgame-0.1.1-linux.tar.zst",
        "sha256": "..."
      }
    ]
  }
}
```

Game calls:

```rust
let updater = nexus_updater::Updater::from_config()?;
if let Some(release) = updater.check_for_update().await? {
    if updater.prompt_user_to_install(release).await? {
        updater.download_and_stage(release).await?;
        updater.restart_with_update().await?;
    }
}
```

→ Spec: `docs/specs/coder/architecture.md` for the agent CLI surface that publishes updates (`nexus release publish-update`).

---

## Linux — AppImageUpdate

AppImageUpdate uses zsync2 deltas. Add the update info to your AppImage:

```bash
appimagetool --updateinformation 'zsync|https://your-studio.com/yourgame-x86_64.AppImage.zsync' \
             AppDir YourGame-x86_64.AppImage
```

Generate `.zsync`:

```bash
zsyncmake YourGame-x86_64.AppImage
# produces YourGame-x86_64.AppImage.zsync
```

Users run:

```bash
AppImageUpdate YourGame-x86_64.AppImage
```

AppImageUpdate: https://github.com/AppImage/AppImageUpdate

For Flatpak/Snap/distro-repo distros, the OS package manager handles updates.

---

## Android sideload auto-update

No system mechanism for non-Play APKs. Pattern:
1. Your game polls `https://your-studio.com/android-manifest.json` for latest version.
2. If newer, prompt user, open browser to APK URL.
3. Android installer handles the rest (signed by same key → silent update OK with permission).

Or use F-Droid: F-Droid client handles auto-update automatically once your repo is indexed.

---

## Channel strategy

Three channels:
- `stable` — public release. Slow, tested.
- `beta` — opt-in. Players who want to test.
- `nightly` — bleeding edge. Internal + power users.

`manifest.json` per channel:
- `https://your-studio.com/updates/stable/manifest.json`
- `https://your-studio.com/updates/beta/manifest.json`
- `https://your-studio.com/updates/nightly/manifest.json`

In-game settings: "Update channel" dropdown → sets `[release.updater].channel`.

Promotion: nightly → beta → stable via `nexus release promote --from beta --to stable --version 0.1.1`.

---

## Delta updates

Full download for a 200 MB game on every patch is painful. Use:
- **bsdiff / bsdiff_endsley** — binary delta for executables.
- **zsync** — block-level for AppImage.
- **xdelta3** — generic.

The `nexus-updater` supports bsdiff + zstd-compressed deltas. Devs publish both full and per-version-delta artifacts.

---

## Signing every update

Ed25519 key, kept offline. Sign each artifact:

```bash
nexus release sign-update dist/yourgame-0.1.1-win.zip \
  --key /secure/offline-vault/ed25519.sk \
  --out dist/yourgame-0.1.1-win.zip.sig
```

Embed pubkey in the game binary. Updater rejects any download whose sig doesn't verify.

Rotating the key: ship a new game version that knows both the old and new pubkey, wait 6 months, ship a version with only the new pubkey.

→ `docs/guides/deploy/secrets.md` for key storage.

---

## Mandatory update flag

For critical security/break-fix updates:

```json
{
  "latest": {
    "version": "0.1.2",
    "mandatory": true,
    "min_version_required": "0.1.2",
    "...": "..."
  }
}
```

Game refuses to launch if `version < min_version_required`. Use sparingly — players hate forced updates.

---

## Smoke test

```bash
# install older version on test machine
# trigger updater
yourgame --check-update
# observe: download progress, sig verify, restart with new version
```

Manual fuzz: serve a tampered manifest → expect updater to refuse.

---

## Rollback (server-side)

If a bad update goes live:
1. Revert `manifest.json` to previous version (file is small, version-control it).
2. Users on stale checks pick up the rollback within `check_interval_secs`.
3. For mandatory updates already installed: ship a quick patch with the fix, mark mandatory again.

Game-side rollback ("downgrade") is not supported by default — players can manually reinstall an older binary.

---

## Pitfalls

- **Unsigned updates** → trivial supply-chain attack. Always sign.
- **HTTP (not HTTPS)** for update endpoints → MITM. Always HTTPS + sig.
- **No staged rollout** → bad update hits 100% instantly. Phase via channel splits or percentage flag in manifest.
- **Restart timing** mid-multiplayer → bad UX. Defer to next launch or game-over.
- **Storage permissions on macOS sandboxed apps** → use Sparkle's helper tool; don't try to overwrite the .app from inside.
- **Mobile sideload updates** require user to re-confirm install each time (Android security model).

---

## Cross-links

- Direct distribution → `docs/guides/release/sideloading.md`
- Signing keys → `docs/guides/release/codesigning/`
- Asset CDN for hosting updates → `docs/guides/deploy/targets/cloudflare.md`
- Coder agent publish command → `docs/specs/coder/architecture.md`
- Release agent recipe → `docs/guides/release/agent-recipes.md`
