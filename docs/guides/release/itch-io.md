<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — itch.io

The indie default. Free to publish. Configurable revenue share (you set it, default 10% to itch). Instant publish. Channels for per-platform builds. Web build hosting built-in.

Authoritative: https://itch.io/docs/creators/

---

## Why itch first

| Strength | |
|----------|--|
| Zero gatekeeping | Page goes live instantly |
| Pay-what-you-want pricing | Or free, or fixed |
| Devlogs as built-in marketing | Each post pushes to followers |
| Game jams | Massive discovery surface |
| First-pass QA | Real players in days |
| Web hosting for WASM | Same upload pipeline |
| MIT-aligned ethos | Founder Leaf is on record |

| Trade-off | |
|-----------|--|
| Discovery weaker than Steam | Need to drive your own traffic |
| Smaller buyers per page | Sales numbers ~10× lower than Steam typical |

---

## Prerequisites

| Item | Cost | Where |
|------|------|-------|
| itch.io account | $0 | https://itch.io |
| Game page created | $0 | dashboard → "Create new project" |
| `butler` CLI | $0 | https://itch.io/docs/butler/ |
| API key | $0 | https://itch.io/user/settings/api-keys |

---

## Install butler

```bash
# Linux/macOS/Windows: download from https://broth.itch.zone/butler/<os>-amd64/LATEST/archive/default
curl -L https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default -o butler.zip
unzip butler.zip && chmod +x butler && mv butler ~/bin/
butler login                # opens browser, OR use API key in $BUTLER_API_KEY
butler -V
```

---

## Channel naming convention

`<user>/<game>:<channel>` — channel = `<os>-<arch>` typically.

| Channel | Platform |
|---------|---------|
| `windows` | Windows .exe / .zip |
| `windows-arm64` | Windows ARM |
| `osx` | macOS universal |
| `linux` | Linux .tar.gz / .AppImage |
| `linux-arm64` | Linux ARM |
| `web` | HTML5 / WASM bundle |
| `android` | APK |

For beta/internal use: `windows-beta`, `osx-internal`, etc.

---

## First push

```bash
nexus release build --target itch --platforms windows,macos,linux,web
# produces: dist/itch/{windows,osx,linux,web}/

butler push dist/itch/windows you/your-game:windows --userversion 0.1.0
butler push dist/itch/osx     you/your-game:osx     --userversion 0.1.0
butler push dist/itch/linux   you/your-game:linux   --userversion 0.1.0
butler push dist/itch/web     you/your-game:web     --userversion 0.1.0
```

butler reuploads only changed files (delta patches), so subsequent pushes are seconds.

---

## Web (WASM) build

Mark page "This file will be played in the browser" in the web channel section. Set viewport size matching your canvas (e.g., 1280×720). Enable `Fullscreen button`, `Mobile friendly` as appropriate.

WASM threading via SharedArrayBuffer needs COOP/COEP. itch supports this — enable in the embed options. → `docs/guides/release/web.md`.

---

## CI/CD

`.github/workflows/release-itch.yml`:

```yaml
on:
  push:
    tags: ['v*']

jobs:
  itch:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: cargo install nexus-cli
      - run: nexus release build --target itch --platforms windows,macos,linux,web
      - name: butler
        env: { BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }} }
        run: |
          curl -L https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default -o butler.zip
          unzip butler.zip && chmod +x butler
          ./butler push dist/itch/windows you/your-game:windows --userversion ${GITHUB_REF_NAME#v}
          ./butler push dist/itch/osx     you/your-game:osx     --userversion ${GITHUB_REF_NAME#v}
          ./butler push dist/itch/linux   you/your-game:linux   --userversion ${GITHUB_REF_NAME#v}
          ./butler push dist/itch/web     you/your-game:web     --userversion ${GITHUB_REF_NAME#v}
```

---

## Devlog

Page → "Devlog" → New post. Each post hits followers + sometimes itch front page. Use to:
- Announce builds
- Share GIFs of new features
- Postmortem dev sprints
- Engage the community

The Nexus `nexus release devlog` command can publish via itch.io's API or just open the dashboard.

---

## Pricing model

| Model | itch supports |
|-------|--------------|
| Free | yes, default |
| Pay-what-you-want with minimum | yes, set $0 minimum or $X |
| Fixed price | yes |
| Sale + bundles | yes |
| First-week discount | yes |

Revenue share: configurable per-sale slider, default 10% to itch.io. Recommend: 10%. They earn it.

itch payouts: PayPal direct, or Stripe payouts. Set in account settings.

---

## Channel management

```bash
butler status you/your-game:windows         # latest build info
butler channel you/your-game:windows        # detailed history
```

To remove a bad upload, push a corrected one over the same channel — itch auto-supersedes.

To archive: dashboard → Channel settings → Hide / Delete.

---

## Smoke test

```bash
butler status you/your-game:windows | grep 'Latest build'
# manually: download from page on a fresh machine → launch → verify
```

---

## Rollback

Re-push a previous build:

```bash
butler push dist/itch/windows-v0.0.9 you/your-game:windows --userversion 0.0.9-rollback
```

butler keeps history; you can also revert via dashboard → Builds → previous build → "Use this build".

---

## Cost note

- Listing: free.
- Revenue share: 0-30%, you set (default 10%).
- Storage: unlimited per-game.
- Bandwidth: unlimited.
- Net cost to ship: $0.

---

## Pitfalls

- **Web bundle size** affects load time; aim < 50 MB initial.
- **Channel naming inconsistency** between platforms creates a fractured launcher UX. Stick to convention above.
- **butler API key** in plain text in CI — store in secrets. → `docs/guides/deploy/secrets.md`.
- **Page review for some adult/political content** may be delayed; not a typical block.

---

## When to add Steam on top

After itch validates the game:
- Steam Direct fee ($100) becomes worth it once you have a wishlist hook
- Wishlists drive Steam launch; itch doesn't help wishlist
- Some indie devs only ever ship on itch — fine

---

## Cross-links

- Web build details → `docs/guides/release/web.md`
- Steam alternative → `docs/guides/release/steam.md`
- Auto-update (itch app handles this) → `docs/guides/release/auto-update.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
- Windows signing (for installer builds outside itch) → `docs/guides/release/codesigning/windows.md`
