<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Release — Web (WASM + WebGPU)

Nexus runs in the browser via WASM + WebGPU (wgpu backend). Distribute via itch.io web, Newgrounds, Crazy Games, Poki, self-host. COOP/COEP headers required for SharedArrayBuffer (threaded WASM, audio worklets).

→ `docs/specs/renderer/backend.md` for the wgpu/WebGPU backend.

---

## Build

```bash
nexus release build --target web --release
# output: dist/web/{game.wasm, game.js, index.html, assets/}
```

Internally: `wasm-bindgen` + `wasm-opt` (optimize) + asset packing.

Output structure:

```
dist/web/
├── index.html
├── game.js              # bindgen glue
├── game_bg.wasm         # compiled engine + game (target: <50MB initial; stream rest)
├── assets/              # textures, audio, levels — fetched lazily
└── sw.js                # service worker for caching
```

---

## COOP / COEP headers (required)

For SharedArrayBuffer (multi-threaded WASM, AudioWorklet):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these: no `SharedArrayBuffer`, threading falls back to single-thread, no high-precision timers.

Spec: https://web.dev/articles/coop-coep
WebGPU + WASM threads: https://gpuweb.github.io/gpuweb/

---

## Hosting options

### A — itch.io web

Mark the channel as "playable in browser". itch handles COOP/COEP. → `docs/guides/release/itch-io.md`.

### B — Self-host (Cloudflare Pages + R2)

`wrangler.toml` (Pages):

```toml
name = "nexus-game-web"
pages_build_output_dir = "dist/web"

[[headers]]
for = "/*"
[headers.values]
Cross-Origin-Opener-Policy = "same-origin"
Cross-Origin-Embedder-Policy = "require-corp"
Cache-Control = "public, max-age=31536000, immutable"
```

```bash
wrangler pages deploy dist/web --project-name nexus-game
```

Large assets to R2 with public bucket + custom domain. → `docs/guides/deploy/targets/cloudflare.md`.

### C — Vercel

`vercel.json`:

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
    ]
  }]
}
```

→ `docs/guides/deploy/targets/vercel.md`.

### D — Crazy Games

Submit via https://developer.crazygames.com. Their CDN serves the game inside their portal. Revenue: ad share + premium API. Devs report ~$1-3 RPM.

Docs: https://developer.crazygames.com/sdk

### E — Poki

Submit via https://developers.poki.com. Similar model. SDK requires ad break integration:

```js
PokiSDK.init().then(() => {
  PokiSDK.gameLoadingFinished();
});
await PokiSDK.commercialBreak();
```

Docs: https://sdk.poki.com

### F — Newgrounds

Upload via https://www.newgrounds.com/projects. Smaller scale but cultural relevance. API for medals/scores: https://www.newgrounds.io/

### G — Y8 / Kongregate / etc.

Niche portals. Wrap in their SDK if monetizing via ad share.

---

## WASM size & streaming

Initial download is the player's wait time. Optimize:

```bash
# wasm-opt
wasm-opt -O3 --strip-debug -o game.opt.wasm game.wasm

# gzip / brotli on the wire
brotli -9 game.opt.wasm
# serve with Content-Encoding: br
```

Asset streaming via fetch:

```js
const response = await fetch('/assets/level-1.bin');
const bytes = await response.arrayBuffer();
nexusEngine.loadLevel(bytes);
```

Nexus asset registry supports lazy fetch with priority queue. → `docs/specs/assets/streaming.md`.

Target: < 50 MB initial WASM + glue. Heavy assets stream on demand.

---

## WebGPU availability

| Browser | Status (May 2026) |
|---------|-------------------|
| Chrome / Edge | Enabled by default since v113 (2023) |
| Safari | Enabled by default since 18.0 (2024) |
| Firefox | Enabled on Windows; per-platform rolling [VERIFY] |

Feature-detect:

```js
if (!('gpu' in navigator)) {
  showFallback();   // WebGL2 fallback if available
}
```

WebGPU spec: https://www.w3.org/TR/webgpu/

Nexus renderer falls back to WebGL2 if WebGPU absent (degraded but functional). → `docs/specs/renderer/backend.md`.

---

## Service worker for caching

`sw.js`:

```js
self.addEventListener('install', e => {
  e.waitUntil(caches.open('nexus-v1').then(c => c.addAll([
    '/game_bg.wasm', '/game.js', '/index.html'
  ])));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

Players get instant reloads after first visit.

---

## Save data

Use `localStorage` (~5MB), `IndexedDB` (~50MB-quota-based), or Origin Private File System (OPFS).

Cloud save: implement via your backend (→ `docs/specs/networking/lobby.md` + per-store cloud save).

---

## Smoke test

```bash
# local server with COOP/COEP
python3 -c "
import http.server
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        super().end_headers()
http.server.test(HandlerClass=H, port=8080)
" --directory dist/web

# browse http://localhost:8080 — open DevTools → Application → check no COOP/COEP warnings
```

After deploy:

```bash
curl -I https://your-game.com | grep -i 'cross-origin'
# expect both COOP and COEP headers
```

---

## Rollback

- Cloudflare Pages: `wrangler pages deployment list` → previous → "Promote".
- Vercel: `vercel rollback`.
- itch: re-push prior build to web channel.

---

## Cost note

| Host | 1k installs | 100k installs | 10M installs |
|------|-------------|---------------|--------------|
| itch.io web | $0 | $0 | $0 (itch absorbs) |
| Cloudflare Pages + R2 | $0 | ~$10 | ~$200 |
| Vercel | $0 | ~$50-$200 | hits Pro overage |
| Crazy Games / Poki | $0 | $0 (ad rev shared) | $0 (ad rev shared) |

---

## Pitfalls

- **COOP/COEP forgotten** → no threads, audio stutters, no high-perf timer.
- **WASM > 100 MB** → players bounce; reduce or stream more aggressively.
- **WebGPU not feature-detected** → instant fail on older Safari, mobile Firefox.
- **Mobile browser quirks** (touch events, viewport scaling, low memory) — test on real devices.
- **No filesystem** — players can't import mods or arbitrary files. Use file input + drag-drop.
- **Audio autoplay blocked** until user gesture. First click unlocks.

---

## Cross-links

- WebGPU renderer backend → `docs/specs/renderer/backend.md`
- Asset streaming → `docs/specs/assets/streaming.md`
- itch.io web channel → `docs/guides/release/itch-io.md`
- Cloudflare Pages + R2 → `docs/guides/deploy/targets/cloudflare.md`
- Vercel → `docs/guides/deploy/targets/vercel.md`
- Agent recipe → `docs/guides/release/agent-recipes.md`
