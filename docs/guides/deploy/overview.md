<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Overview

Nexus does not pick the deploy target. You and your agent pick. This file is the menu.

Two layers:
- **Server/backend** — game servers, lobby/relay, web frontend, mobile-companion API, analytics.
- **Client release** — game binary/bundle to a storefront. → `docs/guides/release/overview.md`.

---

## Pick-by-need (server/backend)

| Need | First pick | Second pick | Why |
|------|-----------|-------------|-----|
| Global low-latency UDP game servers, indie budget | Fly.io | Hetzner + Agones | Fly machines run UDP, anycast, per-region scaling |
| Hands-off staging for a PR / preview | Railway | Render | Push → URL |
| Web frontend + edge SSR | Vercel | Cloudflare Pages | Edge functions, global CDN |
| Lobby / matchmaking serverless | Cloudflare Workers + Durable Objects | Fly machines | DO = strongly consistent regional actor |
| Asset CDN | Cloudflare R2 | AWS S3 + CloudFront | R2 = zero egress |
| Enterprise SLA, GameLift matchmaking | AWS | GCP + Agones | GameLift FleetIQ + spot |
| OSS dedicated game-server fleets on K8s | Agones (any K8s) | AWS EKS + Agones | Open source GameLift |
| Maximum $/core EU | Hetzner | OVH | Dedicated boxes, ~5× cheaper than hyperscalers |
| Sovereignty / freedom-maxx | Self-host (K3s + Tailscale) | Hetzner | MIT-aligned default |
| PlayFab-style "everything backend" | Azure PlayFab | AWS GameLift + Cognito | Matchmaking + leaderboards + party out-of-box |

→ Detailed per-target guides in `docs/guides/deploy/targets/`.

---

## Bad-fit warnings

| Target | Bad at | Use anyway when |
|--------|--------|----------------|
| Vercel / serverless | UDP, long-lived sockets, sub-50ms p99 game loops | Web frontend, REST API, edge KV |
| Cloudflare Workers | UDP, > 30s CPU, raw TCP | Lobby, matchmaking REST, asset signing |
| Railway / Render | Per-region pinning, anycast, > 8GB RAM cheap | Staging, internal tools |
| AWS Lambda | Cold-start sensitive realtime | Async jobs, webhook receivers |
| GitHub Pages | Anything dynamic | Static landing page only |

State this to your agent: **serverless ≠ realtime multiplayer**. Game servers want long-lived processes pinned to a region with raw UDP.

---

## Staging vs production

Three environments minimum. → `docs/guides/deploy/environments.md`.

| Env | Purpose | Region count | Scale | Cost cap |
|-----|---------|--------------|-------|----------|
| `dev` | Per-PR preview, throwaway | 1 | 1 instance, smallest | < $5/PR/week |
| `staging` | Integration, soak test, QA | 1-2 | ~10% of prod | < 10% of prod |
| `prod` | Players | Per region matrix | Autoscale | Tracked in `cost-model.md` |

Promotion: tagged build in `dev` → `staging` → `prod`. No skips.

---

## `Nexus.toml [deploy]` section

Declared per-game. Agent reads to pick a target and execute.

```toml
[deploy]
backend_target = "fly"          # fly | railway | render | aws | gcp | azure | do | hetzner | self | cloudflare
frontend_target = "vercel"      # vercel | cloudflare | netlify | self
asset_cdn = "cloudflare-r2"     # cloudflare-r2 | aws-s3 | b2 | self
secrets_backend = "sops-age"    # sops-age | doppler | 1password | aws-sm | gcp-sm | vault

[deploy.envs.dev]
regions = ["iad"]
instance = "shared-cpu-1x"
min_instances = 0
max_instances = 1

[deploy.envs.staging]
regions = ["iad", "fra"]
instance = "performance-2x"
min_instances = 1
max_instances = 4

[deploy.envs.prod]
regions = ["iad", "lax", "fra", "syd", "gru", "nrt"]
instance = "performance-4x"
min_instances = 2
max_instances = 20

[deploy.observability]
otel_endpoint = "https://otlp.your-grafana-cloud"
log_backend = "loki"            # loki | datadog | honeycomb | cloudwatch | self
```

→ Full schema in `docs/game-template/nexus-toml.md`.

---

## Environment matrix

Per environment, declare:

| Field | Purpose |
|-------|---------|
| `regions` | Where instances run |
| `instance` | Per-target SKU |
| `min_instances` / `max_instances` | Autoscale bounds |
| `secrets_scope` | Which secrets unlock for this env |
| `domain` | DNS for env (`dev-*.example.com`, `staging.example.com`, `example.com`) |
| `feature_flags` | Per-env flag overrides |

→ Conventions in `docs/guides/deploy/environments.md`.

---

## Cross-links

- Pick a target → `docs/guides/deploy/targets/`
- Per-env secrets → `docs/guides/deploy/secrets.md`
- Pipeline → `docs/guides/deploy/cicd.md`
- Observability → `docs/guides/deploy/observability.md`
- Cost reasoning → `docs/guides/deploy/cost-model.md`
- Region placement → `docs/guides/deploy/region-matrix.md`
- Agent decision tree → `docs/guides/deploy/agent-recipes.md`
- Release client to a store → `docs/guides/release/overview.md`
