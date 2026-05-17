<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Browse UI

> Server-rendered HTML first. Progressive enhancement only for search. Every page has a parallel `.json` URL and a `Copy as JSON` button. WCAG AA. Dark/light/system. <1MB initial. <2s LCP. No JS framework lock-in.

→ Data behind every page: `index-format.md`
→ JSON endpoints that back each page: `api.md`
→ Agent surface: `agent-api.md`

## Choice — Astro

| Option | Pros | Cons |
|---|---|---|
| **Astro (chosen)** | server-rendered HTML islands; near-zero JS; build to static + dynamic; framework-agnostic islands | extra build step |
| Hugo / Zola | static-only; super-fast | dynamic surfaces awkward; less suited to auth flows |
| SSR React (Next) | rich client interactivity | heavy; JS-first; fights "no framework lock-in" |
| Server-side raw HTML (Rust + Maud / Askama) | one binary, no JS toolchain | every UI tweak rebuilds the server binary |

**Decision: Astro.** It satisfies "no framework lock-in" (islands can be Svelte, Solid, vanilla, Vue — interchangeable) while shipping near-zero JS by default. Most pages are 100% static HTML; only the search input and rating widget hydrate.

## Pages

| Path | Purpose | Parallel JSON |
|---|---|---|
| `/` | home, leaderboards, recent activity | `/api/v1/leaderboards/most-downloaded` etc. |
| `/categories` | taxonomy tree | `/api/v1/categories` |
| `/c/{slug}` | category browse | `/api/v1/crates?category={slug}` etc. |
| `/search?q=...` | search results | `/api/v1/search?q=...` |
| `/crates/{name}` | crate detail | `/api/v1/crates/{name}` |
| `/crates/{name}/versions` | version timeline | `/api/v1/crates/{name}/versions` |
| `/mods/{slug}` | mod detail | `/api/v1/mods/{slug}` |
| `/assets/{slug}` | asset-pack detail | `/api/v1/assets/{slug}` |
| `/games/{slug}` | game detail | `/api/v1/games/{slug}` |
| `/templates/{slug}` | template detail | `/api/v1/templates/{slug}` |
| `/u/{handle}` | user profile | `/api/v1/users/{handle}` |
| `/leaderboards/{kind}` | leaderboards | `/api/v1/leaderboards/{kind}` |
| `/attestations/{id}` | single attestation | `/api/v1/attestations/{id}` |
| `/log` | append-only audit log | `/api/v1/attestations` |
| `/about` | what nexus-hub is | — |
| `/docs/api` | OpenAPI rendering | `/api/v1/openapi.json` |
| `/account` | session-bound user pages | various |

`Copy as JSON` button on every record page copies the parallel JSON to clipboard. Discoverable via `<link rel="alternate" type="application/json" href="...">` so MCP clients and curl users find it.

## Cards (browse + search results)

Common card shape:

```
┌─────────────────────────────────────────────────────────────┐
│  [thumbnail 96×96]   nexus-genre-soulslike-core   v0.3.1     │
│                       genre/soulslike · verified · MIT       │
│                       ★4.7 (28)   12,480 DL   engine ^0.4   │
│                                                              │
│                       Hardcore souls combat with stamina,    │
│                       i-frames, parry, and posture system.   │
└─────────────────────────────────────────────────────────────┘
```

Required elements: thumbnail · name · category · tier badge · star rating · downloads · engine-compat · license. Summary truncated to 2 lines on small screens, 3 on wide.

Tier badges:
- `verified` — green check icon
- `community` — neutral
- `quarantine` — red warning
- `nsfw` — purple eye (hidden by default)

## Detail page — anatomy

```
┌───────────────────────────────────────────────────────────────────┐
│  HERO                                                              │
│  ────                                                              │
│  nexus-genre-soulslike-core  v0.3.1   [Install]  [Copy as JSON]   │
│  verified · MIT · engine ^0.4  ★4.7 (28)  12,480 downloads        │
│  Origin: crates.io ↗  Repo: github.com/... ↗                       │
├───────────────────────────────────────────────────────────────────┤
│  Tabs:  Overview  |  Versions  |  Reviews  |  Dependencies  |     │
│         Attestation  |  Telemetry (owner)                          │
├───────────────────────────────────────────────────────────────────┤
│  README excerpt (4000 chars) — link to full on the source repo    │
├───────────────────────────────────────────────────────────────────┤
│  Install instructions  (cargo + Nexus.toml + nexus hub install)    │
├───────────────────────────────────────────────────────────────────┤
│  Related crates (recommender output, top 5)                        │
└───────────────────────────────────────────────────────────────────┘
```

Install instructions copy-paste-ready as four code blocks (CLI, `Cargo.toml`, `Nexus.toml`, `nexus hub install`). All copyable with one click.

## Accessibility

| Target | Standard |
|---|---|
| Contrast | WCAG 2.2 AA (4.5:1 text, 3:1 large text and UI) |
| Keyboard nav | full; visible focus rings; logical tab order |
| Screen reader | semantic HTML; ARIA only where needed; landmarks on every page |
| Motion | `prefers-reduced-motion` honored |
| Forms | labels associated; error messages with `aria-describedby` |
| Color blindness | tier badges include shape, not just color |

Audit: pa11y + axe-core run in CI on every PR. Failing accessibility regresses block merge.

## Theming

| Theme | Default |
|---|---|
| `light` | when system preference = light |
| `dark` | when system preference = dark |
| `system` | follows OS |
| User override | session cookie `nx_theme` |

CSS-only theme switch via `:root[data-theme]`. No JS required for the default theme; the override toggle does require a 1-line script.

## Performance budget

| Metric | Target | Enforced by |
|---|---|---|
| Initial page weight | < 1 MB (HTML + critical CSS + thumbnails above-fold) | CI: Lighthouse + size budget files |
| Largest Contentful Paint (LCP) | < 2 s on typical broadband (Slow 4G simulated) | Lighthouse CI |
| First Input Delay (FID) | < 100 ms | Lighthouse CI |
| Cumulative Layout Shift (CLS) | < 0.05 | Lighthouse CI |
| Total Blocking Time | < 100 ms on category pages | Lighthouse CI |
| JS shipped per page | <50 KB compressed for search/rating; 0 KB for static pages | bundle-size check |

Failed budgets block release.

## Progressive enhancement

| Surface | Works without JS | JS adds |
|---|---|---|
| Browse + search | full functionality (form POST → SSR results) | typeahead, faceted filters |
| Detail pages | full | copy-to-clipboard, lightbox screenshots |
| Rating | full (form submit) | inline submit + optimistic update |
| Auth | full (form submit + redirect) | none needed |
| Code copy buttons | (button copies the visible text) | needs JS for clipboard write |

A user with JS disabled (e.g. some accessibility configurations) gets every feature except clipboard convenience and typeahead.

## SEO + machine discoverability

| Surface | Tag |
|---|---|
| Every record page | `<link rel="alternate" type="application/json" href="...json">` |
| Every record page | OpenGraph + Twitter card metadata |
| Every record page | Schema.org `SoftwareApplication` JSON-LD |
| Robots | `robots.txt` allows crawling, disallows `/account/*`, `/admin/*` |
| Sitemap | `sitemap.xml` paginated; per-record-kind sub-sitemaps |
| Hreflang | `en` only at v1; structure ready for translations |

`User-Agent` detection: when our own crawler or a known AI-agent fetches a page, we serve the JSON directly (or a 303 to the `.json` URL) to save bandwidth.

## Search UX

- Single search box at top of every page.
- Faceted filters in sidebar on results page: type, category, tier, license, engine version.
- Typeahead suggestions populated from Meilisearch's `/search` (with empty `q` for popular queries).
- Empty-state shows category browse + popular this week.
- Pagination: prev/next + jump-to-page; URL-state-preserved.

## Owner-only surfaces

A logged-in publisher viewing their own record sees an extra Telemetry tab with the author analytics (`telemetry.md` §Author analytics). Hidden from non-owners. No client-side gate — server-checked.

## Embeddable badges

Authors can embed:

```html
<a href="https://hub.nexus.engine/crates/nexus-genre-soulslike-core">
  <img src="https://hub.nexus.engine/badge/crates/nexus-genre-soulslike-core.svg" alt="nexus-hub: verified">
</a>
```

Badge endpoint: `GET /badge/{kind}/{name}.svg`. Cached aggressively. Style configurable: `?style=flat|plastic|for-the-badge` (shields.io conventions).

## Browser support

| Tier | Browsers |
|---|---|
| First-class | last 2 versions of Chrome, Firefox, Safari, Edge |
| Best-effort | older Safari (iOS 15+), older Firefox ESR |
| Graceful degradation | text-mode browsers (lynx, w3m) — everything navigable |

## Cross-references

- Page data ← `index-format.md`
- Page JSON ← `api.md` (URL pairs in §Pages table)
- Recommendation widget ← `agent-api.md` §Decision tables
- Identity flows ← `identity.md`
- Performance budget enforcement ← `docs/guides/testing/visual-regression.md` (general practice)
