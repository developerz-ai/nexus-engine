<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Cloudflare

Workers + R2 + D1 + Durable Objects + Pages. Best at: asset CDN (zero egress!), lobby / matchmaking REST, edge auth, WebSocket relay, static frontends. **Not for UDP game servers** — no UDP, 30s CPU cap per request.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Component map

| Component | Use for |
|-----------|---------|
| Workers | Edge functions, REST API, auth, sign URLs |
| R2 | S3-compatible object storage, **zero egress** — best asset CDN |
| D1 | SQLite at edge, replicated; OK for low-write metadata |
| Durable Objects | Strongly-consistent regional actor; perfect for lobby / room state |
| Pages | Static site + Functions, JAMstack frontends |
| Workers KV | Eventually-consistent KV; OK for feature flags |
| Queues | Async work, decouple webhook ingest |
| Hyperdrive | Connection pool for upstream Postgres |

Docs: https://developers.cloudflare.com

---

## Prerequisites

| Item | |
|------|--|
| Cloudflare account | https://dash.cloudflare.com |
| `wrangler` CLI | `npm i -g wrangler` |
| Domain on Cloudflare DNS | Or use `*.workers.dev` |

---

## wrangler.toml — lobby + DO + R2 + D1

`infra/cloudflare/wrangler.toml`:

```toml
name = "nexus-lobby"
main = "src/index.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

[vars]
NEXUS_ENV = "prod"

[[durable_objects.bindings]]
name = "MATCHES"
class_name = "MatchRoom"

[[migrations]]
tag = "v1"
new_classes = ["MatchRoom"]

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "nexus-assets-prod"

[[d1_databases]]
binding = "DB"
database_name = "nexus-metadata"
database_id = "..."

[env.staging]
name = "nexus-lobby-staging"
vars = { NEXUS_ENV = "staging" }
```

Docs: https://developers.cloudflare.com/workers/wrangler/configuration/

---

## Durable Object — lobby room

```typescript
// src/index.ts
export class MatchRoom {
  state: DurableObjectState;
  players: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState) { this.state = state; }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected ws', { status: 400 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.players.add(server);
    server.addEventListener('message', e => {
      for (const p of this.players) if (p !== server) p.send(e.data);
    });
    server.addEventListener('close', () => this.players.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === '/match') {
      const id = env.MATCHES.idFromName(crypto.randomUUID());
      const room = env.MATCHES.get(id);
      return room.fetch(req);
    }
    return new Response('ok');
  }
};
```

DO docs: https://developers.cloudflare.com/durable-objects/

Caveat: DO is regional but matchmaking should pick the DO near the players. Use `locationHint` (https://developers.cloudflare.com/durable-objects/reference/data-location/).

---

## R2 — asset CDN (zero egress!)

```bash
wrangler r2 bucket create nexus-assets-prod
wrangler r2 object put nexus-assets-prod/game.wasm --file game.wasm
```

Expose via custom domain:

```toml
# in wrangler.toml or dashboard
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "nexus-assets-prod"
```

Serve via Worker or public access on a subdomain:

```bash
wrangler r2 bucket cors put nexus-assets-prod --rules '[{"AllowedOrigins":["*"],"AllowedMethods":["GET"]}]'
# enable public access in dashboard, or front with a Worker for signed URLs
```

R2 pricing: $0.015/GB-mo storage, **$0 egress**, $4.50/M Class A ops, $0.36/M Class B ops.
Docs: https://developers.cloudflare.com/r2/

For a game shipping 200 MB to 100k players: storage ~$3/mo + bandwidth $0. Same on AWS S3 + CloudFront ≈ $1,500/mo.

---

## D1

```bash
wrangler d1 create nexus-metadata
wrangler d1 execute nexus-metadata --file=schema.sql
```

Use for: leaderboards (read-heavy), player profiles, feature flags. Not for: high-write game state.

Docs: https://developers.cloudflare.com/d1/

---

## Pages — static frontend

```bash
wrangler pages deploy ./web/dist --project-name nexus-web
```

Custom domain via dashboard. Per-PR previews automatic.

Docs: https://developers.cloudflare.com/pages/

---

## First deploy

```bash
wrangler login
wrangler deploy --env staging
wrangler deploy --env prod
```

Or:

```bash
nexus deploy --env prod --target cloudflare --component lobby
```

---

## Smoke test

```bash
curl -fsS https://nexus-lobby.your-account.workers.dev/healthz
wrangler tail nexus-lobby --env prod          # live logs
```

---

## Rollback

```bash
wrangler deployments list
wrangler rollback <deployment-id>
```

Docs: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/

---

## Cost note

| Service | Free tier | Paid |
|---------|-----------|------|
| Workers | 100k req/day, 10ms CPU | $5/mo + $0.30/M reqs over 10M, $0.02/M CPU-ms |
| Durable Objects | 1M reqs free | $0.15/M reqs, $12.50/M GB-s |
| R2 | 10 GB storage, 1M Class A, 10M Class B ops | $0.015/GB-mo, $0 egress |
| D1 | 5 GB, 25M reads, 50k writes / day | $0.001/M reads, $1/M writes |
| Pages | unlimited bandwidth, 500 builds/mo | $20/mo Pro |

Pricing: https://www.cloudflare.com/plans/developer-platform/

---

## Pitfalls

- **No UDP. No raw TCP.** Game servers do not belong here.
- **30s CPU limit per request** (50ms free, paid up to 30s). For long compute, use Queues or external worker.
- **DO eventual consistency between regions.** Within one DO instance: strong. Across DOs: not.
- **D1 ~ 100 ms p95 read latency global**. Hot path = use Worker KV cache + DO authority.
- **Workers WebSocket has session limits** — Hibernation API extends them: https://developers.cloudflare.com/durable-objects/api/websockets/

---

## When NOT to use

- Realtime physics / authoritative game tick → Fly machines, AWS GameLift, Agones.
- Long compute (>30s per request) → external worker, queue.
- Heavy SQL writes → Hyperdrive + Postgres, not D1.

---

## Cross-links

- Game-server host → `docs/guides/deploy/targets/fly-io.md`, `docs/guides/deploy/targets/agones.md`
- Frontend alternative → `docs/guides/deploy/targets/vercel.md`
- Web release (COOP/COEP) → `docs/guides/release/web.md`
- Pipeline → `docs/guides/deploy/cicd.md`
