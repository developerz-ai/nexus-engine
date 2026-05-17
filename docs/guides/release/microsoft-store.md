<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Microsoft Store (PC + Xbox PC)

MSIX packaging. Partner Center upload. 12% cut for games (15% for non-game apps). Xbox PC integration optional.

Authoritative: https://learn.microsoft.com/windows/uwp/publish/

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| Microsoft Partner Center account | $19 individual / $99 company (one-time) | https://partner.microsoft.com |
| App reservation | $0 | Reserve name in Partner Center |
| MSIX Packaging Tool | $0 | https://learn.microsoft.com/windows/msix/packaging-tool/tool-overview |
| Windows 10 SDK | $0 | Installs with Visual Studio |
| Code signing cert (for sideload / store) | varies | → `docs/guides/release/codesigning/windows.md` |

For Xbox Live services integration (achievements, leaderboards, gamertag), see https://learn.microsoft.com/gaming/gdk/

---

## MSIX vs MSIXVC

- **MSIX** — standard PC apps. Auto-installs, sandboxed, auto-updates.
- **MSIXVC** — for large games via Microsoft Store's Bundled Game pipeline. Streaming install, partial-download play.

Most indie games use MSIX. AAA / large-content games use MSIXVC.

---

## Package via msix CLI

`Package.appxmanifest`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  IgnorableNamespaces="uap">
  <Identity
    Name="YourPublisher.YourGame"
    Publisher="CN=Your Publisher, O=Your Org, C=US"
    Version="0.1.0.0" />
  <Properties>
    <DisplayName>Your Game</DisplayName>
    <PublisherDisplayName>You</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Applications>
    <Application Id="App" Executable="YourGame.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="Your Game"
        Description="Your Game"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
  </Capabilities>
</Package>
```

Build MSIX:

```powershell
MakeAppx pack /d .\dist\msix-root /p .\dist\YourGame.msix
SignTool sign /fd SHA256 /a /f cert.pfx /p $env:CERT_PASSWORD .\dist\YourGame.msix
```

MakeAppx docs: https://learn.microsoft.com/windows/msix/package/manual-packaging-root

---

## Partner Center submission

1. https://partner.microsoft.com → Microsoft Store → Apps and Games → reserve app name.
2. Pricing, properties (age rating IARC, category, system requirements).
3. Submission → Packages → upload `.msix` / `.msixbundle`.
4. Store listing per language (description, screenshots, trailer).
5. Submit → goes through certification.

Typical cert time: 24-72 hours.

Docs: https://learn.microsoft.com/windows/uwp/publish/app-submissions

---

## Flighting (beta channels)

Partner Center supports submission "Package flights" — beta groups receive specific MSIX versions.

Set up: Submission → Package flights → create flight → restrict by Group of Customer IDs.

---

## Xbox Live services (optional)

For achievements / leaderboards / Xbox profile / cloud save:

- Register Xbox Live integration in Partner Center.
- Use Microsoft GDK (Game Development Kit): https://learn.microsoft.com/gaming/gdk/
- Free for PC; Xbox console requires ID@Xbox onboarding → `docs/guides/release/xbox-console.md`.

Achievements:

```cpp
XblAchievementsUpdateAchievementAsync(xblContext, xuid, 1, "achievement_id", 100, &async);
```

---

## CI/CD

`.github/workflows/release-ms.yml`:

```yaml
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: windows-2022
    steps:
      - uses: actions/checkout@v4
      - run: |
          nexus release build --target msstore
          MakeAppx pack /d dist/msix-root /p dist/YourGame.msix
          SignTool sign /fd SHA256 /a /f cert.pfx /p $env:CERT_PASSWORD dist/YourGame.msix
      - name: Upload to Partner Center
        run: |
          # use Microsoft Store submission API
          # https://learn.microsoft.com/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services
          pwsh -File scripts/ms-store-submit.ps1 -Package dist/YourGame.msix -Tenant $env:MS_TENANT -ClientId $env:MS_CLIENT_ID -ClientSecret $env:MS_CLIENT_SECRET
```

Microsoft Store Submission API: https://learn.microsoft.com/windows/uwp/monetize/using-windows-store-services

---

## Smoke test

```powershell
# install local MSIX
Add-AppxPackage -Path .\dist\YourGame.msix
Get-AppxPackage YourPublisher.YourGame
# launch
explorer.exe shell:AppsFolder\YourPublisher.YourGame_<hash>!App
```

After Store submission: download via Store app on a clean Win11 VM → launch → verify.

---

## Rollback

Partner Center → submissions list → previous submission → "Make this the live submission".

Time: ~hours to roll out (Store CDN propagation).

---

## Cost note

- One-time account: $19 individual / $99 company.
- Revenue share: 12% games / 15% apps.
- Cert per submission: free.
- Xbox Live PC: free.
- Hosting + CDN: free.

---

## Pitfalls

- **MSIX sandboxes the app** — can't write outside its install folder without explicit capabilities. Use `LocalState` for player saves.
- **`Identity Publisher`** must exactly match cert subject. Mismatch → cert fail.
- **Cert SHA256** required; SHA1 rejected.
- **Submission flow** is web-form-heavy; the Submission API removes most of this in CI.
- **Xbox Live "Creators Program"** is gone since 2022; use Partner Center direct + GDK.
- **IARC rating** is required; complete the questionnaire in Partner Center.

---

## When MS Store is worth it

| Reason | |
|--------|--|
| Want unified PC + Xbox PC distribution | Best path |
| Smaller cut than Steam (12%) | Saves money |
| Auto-update via Windows Store baked in | Zero updater code |
| Xbox PC Game Pass eligibility | Big audience expansion |

---

## Cross-links

- Windows signing → `docs/guides/release/codesigning/windows.md`
- Xbox Console → `docs/guides/release/xbox-console.md`
- Steam (compare) → `docs/guides/release/steam.md`
- Installers (sideload .msi) → `docs/guides/release/installers.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
