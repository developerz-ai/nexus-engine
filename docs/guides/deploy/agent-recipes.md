<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Agent Recipes

How `nexus-coder` (→ `docs/specs/coder/`) picks a deploy target and executes. Decision tree as structured JSON the agent reads at recommendation time.

**Core principle:** Nexus does not pick. The agent reads the dev's constraints + the matrix below, recommends two options with tradeoffs, and asks the dev to confirm.

---

## Decision tree

```
START
  │
  ├─ needs UDP game server?  ──yes──┬─ multi-region from day 1?  ──yes──> Fly.io  | AWS GameLift  | Agones (GKE/EKS/Hetzner)
  │                                 └─ single region OK?         ──yes──> Hetzner CCX | DO droplet | self-host K3s
  │
  ├─ static frontend / SSR only?    ──yes──> Vercel | Cloudflare Pages | Netlify
  │
  ├─ REST API + lobby (no UDP)?     ──yes──┬─ free tier required?       ──yes──> Cloudflare Workers + DO
  │                                        └─ paid OK, fast prototype?  ──yes──> Railway | Render | Fly machines
  │
  ├─ enterprise SLA / compliance?   ──yes──┬─ already on AWS commit?    ──yes──> AWS (ECS / GameLift)
  │                                        ├─ Microsoft EA?             ──yes──> Azure (Container Apps / PlayFab)
  │                                        └─ open to GCP?              ──yes──> GCP (Cloud Run / GKE + Agones)
  │
  ├─ sovereignty / MIT principle?   ──yes──> Self-host (K3s + Tailscale + Caddy)
  │
  └─ asset CDN with heavy egress?   ──yes──> Cloudflare R2 (zero-egress) — pair with any backend
```

---

## Per-target capability matrix (machine-readable)

```json
{
  "$schema": "nexus-deploy-targets-v1",
  "targets": [
    {
      "id": "fly",
      "name": "Fly.io",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": true,
      "regions": 35,
      "min_region_latency_ms": 30,
      "gpu": false,
      "autoscale": "per-region machine count",
      "free_tier": "trial credit",
      "managed_postgres": true,
      "managed_redis": false,
      "managed_s3": "tigris",
      "best_for": ["game-server-udp", "global-low-latency", "indie-budget"],
      "bad_for": ["enterprise-sla", "gpu-workloads"],
      "monthly_cost_1k_mau": 30,
      "monthly_cost_100k_mau": 2500,
      "monthly_cost_10m_mau": 200000,
      "docs": "docs/guides/deploy/targets/fly-io.md",
      "vendor_docs": "https://fly.io/docs/"
    },
    {
      "id": "railway",
      "name": "Railway",
      "udp": false,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 4,
      "min_region_latency_ms": 50,
      "gpu": false,
      "autoscale": "vertical",
      "free_tier": "$5/mo",
      "managed_postgres": true,
      "managed_redis": true,
      "managed_s3": false,
      "best_for": ["staging", "rest-api", "per-pr-preview"],
      "bad_for": ["udp", "game-servers", "global-latency"],
      "monthly_cost_1k_mau": 20,
      "monthly_cost_100k_mau": 3000,
      "monthly_cost_10m_mau": null,
      "docs": "docs/guides/deploy/targets/railway.md",
      "vendor_docs": "https://docs.railway.com/"
    },
    {
      "id": "render",
      "name": "Render",
      "udp": false,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 5,
      "min_region_latency_ms": 50,
      "gpu": false,
      "autoscale": "horizontal+vertical",
      "free_tier": "static + 90d postgres",
      "managed_postgres": true,
      "managed_redis": true,
      "managed_s3": false,
      "best_for": ["staging", "rest-api", "cron-jobs"],
      "bad_for": ["udp", "game-servers"],
      "monthly_cost_1k_mau": 25,
      "monthly_cost_100k_mau": 3200,
      "monthly_cost_10m_mau": null,
      "docs": "docs/guides/deploy/targets/render.md",
      "vendor_docs": "https://render.com/docs"
    },
    {
      "id": "vercel",
      "name": "Vercel",
      "udp": false,
      "tcp": "http-only",
      "websocket": "edge-or-external",
      "anycast": true,
      "regions": 120,
      "min_region_latency_ms": 20,
      "gpu": false,
      "autoscale": "serverless",
      "free_tier": "hobby",
      "managed_postgres": false,
      "managed_redis": false,
      "managed_s3": false,
      "best_for": ["frontend", "nextjs", "edge-functions", "static-ssr"],
      "bad_for": ["game-servers", "long-compute", "udp"],
      "monthly_cost_1k_mau": 0,
      "monthly_cost_100k_mau": 200,
      "monthly_cost_10m_mau": 15000,
      "docs": "docs/guides/deploy/targets/vercel.md",
      "vendor_docs": "https://vercel.com/docs"
    },
    {
      "id": "cloudflare",
      "name": "Cloudflare (Workers + R2 + DO + Pages)",
      "udp": false,
      "tcp": "http+ws",
      "websocket": true,
      "anycast": true,
      "regions": 300,
      "min_region_latency_ms": 10,
      "gpu": false,
      "autoscale": "serverless",
      "free_tier": "generous",
      "managed_postgres": false,
      "managed_redis": false,
      "managed_s3": "r2-zero-egress",
      "best_for": ["asset-cdn", "lobby-rest", "edge-auth", "websocket-relay", "frontend"],
      "bad_for": ["game-servers-udp", "long-compute", "raw-tcp"],
      "monthly_cost_1k_mau": 5,
      "monthly_cost_100k_mau": 300,
      "monthly_cost_10m_mau": 25000,
      "docs": "docs/guides/deploy/targets/cloudflare.md",
      "vendor_docs": "https://developers.cloudflare.com"
    },
    {
      "id": "aws",
      "name": "AWS (ECS / GameLift / EKS)",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 33,
      "min_region_latency_ms": 30,
      "gpu": true,
      "autoscale": "everything",
      "free_tier": "12-mo limited",
      "managed_postgres": true,
      "managed_redis": true,
      "managed_s3": true,
      "best_for": ["enterprise-sla", "gamelift-matchmaking", "compliance", "scale-without-limit"],
      "bad_for": ["budget-conscious", "simplicity"],
      "monthly_cost_1k_mau": 80,
      "monthly_cost_100k_mau": 8000,
      "monthly_cost_10m_mau": 700000,
      "docs": "docs/guides/deploy/targets/aws.md",
      "vendor_docs": "https://docs.aws.amazon.com"
    },
    {
      "id": "gcp",
      "name": "GCP (GKE / Cloud Run / Agones-native)",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 40,
      "min_region_latency_ms": 30,
      "gpu": true,
      "autoscale": "everything",
      "free_tier": "$300 credit + always-free tier",
      "managed_postgres": true,
      "managed_redis": true,
      "managed_s3": true,
      "best_for": ["agones-native", "k8s-autopilot", "bigquery-analytics", "spanner-global"],
      "bad_for": ["budget-conscious"],
      "monthly_cost_1k_mau": 70,
      "monthly_cost_100k_mau": 5000,
      "monthly_cost_10m_mau": 400000,
      "docs": "docs/guides/deploy/targets/gcp.md",
      "vendor_docs": "https://cloud.google.com/docs"
    },
    {
      "id": "azure",
      "name": "Azure (AKS / Container Apps / PlayFab)",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 60,
      "min_region_latency_ms": 30,
      "gpu": true,
      "autoscale": "everything",
      "free_tier": "$200 credit + always-free PlayFab",
      "managed_postgres": true,
      "managed_redis": true,
      "managed_s3": "blob",
      "best_for": ["playfab-backend", "xbox-integration", "microsoft-ea"],
      "bad_for": ["budget-conscious", "unix-purists"],
      "monthly_cost_1k_mau": 100,
      "monthly_cost_100k_mau": 6000,
      "monthly_cost_10m_mau": 500000,
      "docs": "docs/guides/deploy/targets/azure.md",
      "vendor_docs": "https://learn.microsoft.com/azure/"
    },
    {
      "id": "digitalocean",
      "name": "DigitalOcean",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 14,
      "min_region_latency_ms": 40,
      "gpu": true,
      "autoscale": "horizontal",
      "free_tier": "$200 credit",
      "managed_postgres": true,
      "managed_redis": true,
      "managed_s3": "spaces",
      "best_for": ["simple-pricing", "indie-hosting", "k8s-cheap"],
      "bad_for": ["global-anycast", "spot-pricing"],
      "monthly_cost_1k_mau": 30,
      "monthly_cost_100k_mau": 2000,
      "monthly_cost_10m_mau": 160000,
      "docs": "docs/guides/deploy/targets/digitalocean.md",
      "vendor_docs": "https://docs.digitalocean.com"
    },
    {
      "id": "hetzner",
      "name": "Hetzner",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": false,
      "regions": 5,
      "min_region_latency_ms": 50,
      "gpu": "limited",
      "autoscale": "manual+terraform",
      "free_tier": "none",
      "managed_postgres": false,
      "managed_redis": false,
      "managed_s3": false,
      "best_for": ["eu-cost-per-core", "dedicated-boxes", "high-bandwidth"],
      "bad_for": ["managed-services", "global-regions"],
      "monthly_cost_1k_mau": 50,
      "monthly_cost_100k_mau": 1500,
      "monthly_cost_10m_mau": 120000,
      "docs": "docs/guides/deploy/targets/hetzner.md",
      "vendor_docs": "https://docs.hetzner.com"
    },
    {
      "id": "self",
      "name": "Self-host (K3s + Tailscale + Caddy)",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": "via-cloudflare",
      "regions": "wherever-you-have-boxes",
      "min_region_latency_ms": "depends",
      "gpu": "if-you-own-it",
      "autoscale": "manual",
      "free_tier": "your hardware",
      "managed_postgres": "self-run",
      "managed_redis": "self-run",
      "managed_s3": "via-r2-or-minio",
      "best_for": ["sovereignty", "mit-principles", "homelab", "stable-small-scale"],
      "bad_for": ["multi-region-without-colo", "enterprise-sla", "ops-allergic"],
      "monthly_cost_1k_mau": 30,
      "monthly_cost_100k_mau": 1200,
      "monthly_cost_10m_mau": 100000,
      "docs": "docs/guides/deploy/targets/self-host.md",
      "vendor_docs": null
    },
    {
      "id": "agones",
      "name": "Agones (on any K8s)",
      "udp": true,
      "tcp": true,
      "websocket": true,
      "anycast": "via-underlying",
      "regions": "via-underlying",
      "min_region_latency_ms": "via-underlying",
      "gpu": "via-underlying",
      "autoscale": "fleet-autoscaler",
      "free_tier": "agones-itself-free",
      "managed_postgres": false,
      "managed_redis": false,
      "managed_s3": false,
      "best_for": ["dedicated-game-server-fleets", "multi-cloud", "oss-gamelift-alternative"],
      "bad_for": ["non-k8s-shops", "pure-http-workloads"],
      "monthly_cost_1k_mau": "underlying",
      "monthly_cost_100k_mau": "underlying",
      "monthly_cost_10m_mau": "underlying",
      "docs": "docs/guides/deploy/targets/agones.md",
      "vendor_docs": "https://agones.dev/site/docs/"
    }
  ]
}
```

The agent loads this JSON, filters by `Nexus.toml` constraints, and emits a ranked list.

---

## Agent CLI surface

```bash
# Ask for a recommendation
nexus deploy recommend \
  --mau 50000 \
  --regions iad,fra,nrt \
  --budget-usd 2000 \
  --constraints udp,managed-postgres

# Output (example):
# Best fit: Fly.io
#   - udp: yes
#   - regions: iad, fra, nrt available
#   - est cost: $1,650/mo (within budget)
#   - tradeoffs: see docs/guides/deploy/targets/fly-io.md
# Second pick: Hetzner CCX + Agones
#   - udp: yes
#   - regions: fsn1, hel1 (EU), need additional NYC/JP via separate provider
#   - est cost: $900/mo (within budget)
#   - tradeoffs: manual ops, no anycast, see docs/guides/deploy/targets/hetzner.md

nexus deploy apply --target fly --env prod --confirm
```

`recommend` always returns ≥ 2 options. Dev confirms. → `docs/specs/coder/architecture.md` for agent CLI contract.

---

## Constraint vocabulary

| Constraint | Meaning |
|------------|---------|
| `udp` | UDP transport required |
| `low-latency-50ms` | p95 RTT ≤ 50ms in named regions |
| `managed-postgres` | provider-managed PG with HA |
| `gpu` | GPU instances available |
| `compliance:soc2`, `compliance:hipaa`, `compliance:gdpr` | Certification required |
| `sovereignty:eu`, `sovereignty:us`, `sovereignty:self` | Data residency |
| `oss-stack` | Prefer OSS over proprietary services |
| `free-tier` | Must run within free tier limits |
| `budget:N` | Monthly USD cap |

---

## Refusal rules

The agent **must refuse** to apply when:
- Constraint conflicts with chosen target (e.g., `udp` + Vercel).
- Cost projection exceeds `Nexus.toml.deploy.envs.<env>.cost_cap_usd_monthly` without `--confirm-overrun`.
- Promoting `dev` → `prod` directly (must pass through `staging`).
- Secrets from another env are referenced.
- The smoke test definition is missing for prod.

---

## Cross-links

- Target details → `docs/guides/deploy/targets/`
- Cost model → `docs/guides/deploy/cost-model.md`
- Region matrix → `docs/guides/deploy/region-matrix.md`
- Coder agent architecture → `docs/specs/coder/architecture.md`
- Coder workflows → `docs/specs/coder/workflows.md` [AGENT 18 if not yet present]
- Game-template CLI → `docs/game-template/cli.md`
- Release agent recipes → `docs/guides/release/agent-recipes.md`
