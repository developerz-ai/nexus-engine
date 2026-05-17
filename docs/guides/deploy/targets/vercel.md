<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Vercel

For web frontend + serverless API. Best at: Next.js/SvelteKit/Astro, edge functions, ISR. **Not for game servers** — no UDP, cold starts, 10-300s function timeout depending on plan.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Why Vercel

| Strength | |
|----------|--|
| Best-in-class Next.js host | Built by Next team |
| Global edge network (~120 POPs) | Frontend p95 TTFB < 100ms |
| Edge functions (Cloudflare-Workers-equivalent) | Sub-50ms cold start |
| Per-PR preview deploys | Default, no config |
| Built-in image optimization | `next/image` auto |
| Generous hobby tier | Free for indie |

| Weakness | |
|----------|--|
| Lock-in to Vercel-isms | `next.config.js` quirks, ISR proprietary |
| No UDP, no long-lived sockets | Use websockets via Edge or external |
| Function timeout limits | Hobby 10s · Pro 60s · Enterprise 900s |
| Bandwidth pricing scales | $0.15/GB after free 100GB on hobby |
| WebSocket via Vercel costs differently | Pro plan or external broker |

Authoritative docs: https://vercel.com/docs

---

## Prerequisites

| Item | |
|------|--|
| Vercel account | https://vercel.com |
| `vercel` CLI | `npm i -g vercel` |
| Repo connected to Vercel | GitHub/GitLab/Bitbucket app |
| Frontend in `nexus-game/web/` | → `docs/game-template/structure.md` |

---

## vercel.json

`web/vercel.json`:

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "regions": ["iad1", "fra1", "sin1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/api/game/:path*", "destination": "https://api.example.com/:path*" }
  ]
}
```

COOP/COEP headers required for WASM SharedArrayBuffer (WebGPU multiplayer). → `docs/guides/release/web.md`.

Docs: https://vercel.com/docs/projects/project-configuration

---

## First deploy

```bash
cd web/
vercel login
vercel link
vercel env add NEXUS_API_URL production
vercel --prod
```

Preview deploy (default on every push):

```bash
vercel
```

Or:

```bash
nexus deploy --env prod --target vercel --component frontend
```

---

## Edge functions for lobby / matchmaking REST

```typescript
// web/app/api/match/route.ts
export const runtime = 'edge';
export const preferredRegion = ['iad1', 'fra1', 'sin1'];

export async function POST(req: Request) {
  const body = await req.json();
  // ... matchmaking logic
  return Response.json({ matchId: '...' });
}
```

Edge runtime: V8 isolate, no Node API. https://vercel.com/docs/functions/runtimes/edge

---

## Domains

```bash
vercel domains add example.com
# add CNAME or NS as instructed
vercel alias set <deployment-url> example.com
```

---

## Smoke test

```bash
nexus deploy smoke --env prod --target vercel
# or manually:
curl -fsS https://example.com/healthz
curl -fsS -I https://example.com | grep -i 'x-vercel'
```

---

## Rollback

```bash
vercel rollback                                 # to previous prod
vercel rollback <deployment-url>                # to specific
# or in dashboard: Deployments → "Promote to Production"
```

Vercel retains every deploy. Rollback ≤ 10s.

---

## Cost note

| Plan | Bandwidth | Builds | Functions | Cost |
|------|-----------|--------|-----------|------|
| Hobby | 100 GB/mo | 6000 min/mo | 100 GB-hours | $0 |
| Pro | 1 TB included, $0.15/GB after | 24k min | 1000 GB-hours | $20/user/mo |
| Enterprise | custom | custom | custom | call sales |

Pricing: https://vercel.com/pricing

Bandwidth at scale: a WASM game at 50 MB × 10k installs = 500 GB. One launch wipes the Pro included bandwidth. Use Cloudflare R2 + custom CDN for asset delivery instead. → `docs/guides/deploy/targets/cloudflare.md`.

---

## Pitfalls

- **WebSocket on Vercel** is finicky; for game lobby use Cloudflare Durable Objects or a dedicated host.
- **ISR / on-demand revalidation** locks you in; portable with effort, painful at scale.
- **Image optimization** counts against quota; pre-optimize for game assets.
- **Function cold start** ~100ms Edge, ~500ms Node — fine for menus, bad for in-game loops.

---

## When to outgrow

| Symptom | Move to |
|---------|---------|
| WASM bundle > 100 MB per asset | Cloudflare R2 + custom subdomain |
| Function bills > frontend bills | Move logic to dedicated backend (Fly/AWS) |
| Need self-host control | Cloudflare Pages, Netlify, or self-host SvelteKit |

---

## Cross-links

- Frontend alternatives → `docs/guides/deploy/targets/cloudflare.md` (Pages + Workers)
- Asset CDN → `docs/guides/deploy/targets/cloudflare.md`
- Web release → `docs/guides/release/web.md`
- Pipeline → `docs/guides/deploy/cicd.md`
