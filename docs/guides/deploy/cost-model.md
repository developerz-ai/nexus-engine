<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Cost Model

Back-of-envelope per-target monthly cost. Numbers are May 2026 list price. `[VERIFY]` each before committing.

**Assumptions:**
- MAU = monthly active users. Average session = 30 min. Sessions/MAU/month = 8. Concurrent peak ≈ MAU / 60.
- Game server: 16 players per instance, dedicated UDP, p99 frame ≤ 16ms.
- Lobby/matchmaking: ~5 RPS per 1k concurrent.
- Asset CDN: 200MB initial download + 50MB/month updates.
- Telemetry: ~100 events/session.

Concurrent peak math:

| MAU | Concurrent peak | Server instances (16p) | Lobby RPS | CDN egress/mo |
|-----|----------------|------------------------|-----------|---------------|
| 1k | ~17 | 2 | ~85 | ~50 GB |
| 100k | ~1,700 | ~110 | ~8,500 | ~5 TB |
| 10M | ~170,000 | ~11,000 | ~850k | ~500 TB |

---

## Per-target monthly cost (USD)

### Server/backend only

| Target | 1k MAU | 100k MAU | 10M MAU |
|--------|--------|----------|---------|
| Fly.io (machines) | ~$30 | ~$2,500 | ~$200k |
| Hetzner (dedicated) | ~$50 | ~$1,500 | ~$120k |
| Self-host (Hetzner + K3s + ops time) | ~$30 | ~$1,200 | ~$100k |
| AWS ECS Fargate | ~$80 | ~$8,000 | ~$700k |
| AWS GameLift (FleetIQ + spot) | ~$60 | ~$5,500 | ~$450k |
| GCP Cloud Run (HTTP) | ~$40 | ~$4,000 | unfit (cold start) |
| GCP GKE + Agones | ~$70 | ~$5,000 | ~$400k |
| Azure AKS + PlayFab MM | ~$100 | ~$6,000 | ~$500k |
| DigitalOcean Droplets | ~$30 | ~$2,000 | ~$160k |
| Railway | ~$20 | ~$3,000 (overage city) | unfit |
| Render | ~$25 | ~$3,200 | unfit |
| Cloudflare Workers + DO (lobby only, not gameserver) | ~$5 | ~$300 | ~$25k |
| Vercel (frontend only) | $0 | ~$200 | ~$15k |

### Asset CDN

| CDN | 50 GB | 5 TB | 500 TB |
|-----|-------|------|--------|
| Cloudflare R2 | $0.75 | $75 | $7,500 (zero egress, storage only) |
| AWS S3 + CloudFront | ~$5 | ~$450 | ~$45k |
| Backblaze B2 + bandwidth alliance | ~$0.30 | ~$30 | ~$3k |
| Self (Hetzner + Nginx) | ~$5 | ~$50 | ~$2k + ops |

Cloudflare R2 zero-egress is the dominant default for asset CDN. → `docs/guides/deploy/targets/cloudflare.md`.

### Observability

| Stack | 1k | 100k | 10M |
|-------|-----|------|-----|
| Grafana Cloud Free | $0 | overage ~$50 | ~$2k+ |
| Self-hosted (3× Hetzner CX22) | ~$15 | ~$60 | ~$500 |
| Datadog | ~$15 | ~$1.5k | ~$50k+ |

---

## Total stack examples

### Indie weekend MVP — 1k MAU target

| Component | Pick | Cost |
|-----------|------|------|
| Game server | Fly.io shared-cpu-1x ×2 | ~$10 |
| Lobby | Fly.io shared-cpu-1x ×1 | ~$5 |
| Web/landing | Vercel hobby | $0 |
| Assets | Cloudflare R2 (50 GB) | ~$1 |
| Postgres | Fly.io managed (4 GB) | ~$15 |
| Observability | Grafana Cloud Free | $0 |
| Secrets | sops + age | $0 |
| **Total** | | **~$31/mo** |

### Mid-tier indie — 100k MAU

| Component | Pick | Cost |
|-----------|------|------|
| Game server fleet | Fly.io perf-2x ×110 across 6 regions | ~$2,500 |
| Lobby | Cloudflare Workers + DO | ~$30 |
| Web | Vercel Pro | ~$20 |
| Assets | R2 (5 TB) | ~$75 |
| Postgres | Neon / Fly Postgres HA | ~$200 |
| Observability | Grafana Cloud paid | ~$200 |
| **Total** | | **~$3,025/mo** |

### Scale-out — 10M MAU

At this scale, optimize bespoke. Rough envelope:

| Component | Pick | Cost |
|-----------|------|------|
| Game server fleet | Hetzner dedicated + Agones × thousands | ~$100k |
| Lobby | self + DO regional shards | ~$5k |
| Assets | R2 (500 TB) | ~$7.5k |
| Postgres | self HA + read replicas | ~$10k |
| Observability | self Grafana stack | ~$2k |
| **Total** | | **~$125k/mo** |

vs. all-AWS at 10M MAU: ~$1M+/mo. Pick wisely.

---

## Hidden costs

| Cost | When it bites |
|------|---------------|
| Egress (AWS / GCP / Azure) | Asset CDN, cross-region replication, backups offsite |
| NAT gateway hours (AWS) | $0.045/hr × 24 × 30 × regions × AZs; can match server costs at small scale |
| Load balancer hours | $20-30/mo per ALB/NLB per region |
| Managed K8s control plane | $73/mo per EKS/GKE/AKS cluster |
| Cross-AZ data transfer (AWS) | $0.01/GB; replication and HA Postgres rack it up |
| CI minutes | GitHub Actions: free 2k/mo; busy repo blows past, $0.008/min after |
| Support plans | AWS Business = $100/mo min, enterprise = $15k/mo min |

→ Self-host avoids most of these. → `docs/guides/deploy/targets/self-host.md`.

---

## Cost guardrails

Set in `Nexus.toml`:

```toml
[deploy.envs.dev]
cost_cap_usd_monthly = 50

[deploy.envs.staging]
cost_cap_usd_monthly = 500

[deploy.envs.prod]
cost_cap_usd_monthly = 5000     # alert at 80%, page at 100%
```

`nexus-coder` reads these and refuses to scale past the cap without a `--confirm-overrun` flag.

Provider-side guardrails:
- AWS: Budgets + Anomaly Detection.
- GCP: Budgets + Billing alerts.
- Azure: Cost Management.
- Fly.io: dashboard alerts only — set OS-level via CLI cron.
- Cloudflare: per-product limits.

---

## How the agent uses this

`nexus-coder` reads the table + `[deploy] cost_cap_usd_monthly` and emits a recommendation:

```
$ nexus deploy recommend --mau 50000 --regions iad,fra,nrt --budget 2000
Recommendation: Fly.io machines + Cloudflare R2 + Grafana Cloud Free
Estimated: $1,650/mo (within $2,000 cap)
Tradeoffs: see docs/guides/deploy/targets/fly-io.md
```

→ `docs/guides/deploy/agent-recipes.md` for the decision tree.

---

## Cross-links

- Target detail → `docs/guides/deploy/targets/`
- Region pricing/latency → `docs/guides/deploy/region-matrix.md`
- Overview → `docs/guides/deploy/overview.md`
