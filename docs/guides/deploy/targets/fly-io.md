<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Fly.io

Best default for global low-latency game servers on indie budget. UDP supported, anycast, per-region scaling, Postgres + S3-compatible Tigris.

→ Overview: `docs/guides/deploy/overview.md`. Cost: `docs/guides/deploy/cost-model.md`.

---

## Why Fly

| Strength | |
|----------|--|
| UDP-capable machines | Game servers run native, not through a proxy |
| Anycast IPv4/IPv6 | Single address, geo-routed |
| Per-region instances | Pin to LA, FRA, NRT, etc. |
| Fast cold start (~200ms on `auto_stop`) | Match-on-demand servers |
| Volumes + managed Postgres + Tigris S3 | All-in-one |
| Free tier (small) | $5 trial credit; ~3 shared-cpu VMs free |

| Weakness | |
|----------|--|
| Smaller region menu vs AWS | ~35 regions vs ~30+ AWS regions, but well-placed |
| No K8s | Use Fly machines API, not kubectl |
| Bandwidth costs add up at scale | ~$0.02/GB egress |
| Reliability historically spotty | Has improved 2024–25, still monitor |

Authoritative docs: https://fly.io/docs/

---

## Prerequisites

| Item | Get it via |
|------|-----------|
| `flyctl` CLI | `curl -L https://fly.io/install.sh \| sh` |
| Fly account + payment method | `flyctl auth signup` |
| `Nexus.toml` with `backend_target = "fly"` | → `docs/game-template/nexus-toml.md` |
| Server binary builds for `x86_64-unknown-linux-musl` | `nexus build --target linux-musl --release` |

---

## fly.toml

`infra/fly/server.toml`:

```toml
app = "nexus-game-prod"
primary_region = "iad"
kill_signal = "SIGTERM"
kill_timeout = "30s"

[build]
  image = "ghcr.io/your-org/nexus-game-server:latest"

[env]
  NEXUS_ENV = "prod"
  RUST_LOG = "info"

[[services]]
  internal_port = 7777
  protocol = "udp"
  auto_stop_machines = false
  min_machines_running = 2

  [[services.ports]]
    port = 7777

[[services]]
  internal_port = 8080
  protocol = "tcp"
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

[[vm]]
  size = "performance-2x"
  memory = "4gb"

[checks.healthz]
  type = "http"
  port = 8080
  path = "/healthz"
  interval = "10s"
  timeout = "2s"
  grace_period = "10s"
```

Docs: https://fly.io/docs/reference/configuration/

---

## First deploy

```bash
flyctl auth login
flyctl launch --copy-config --config infra/fly/server.toml --no-deploy
flyctl secrets set DATABASE_URL=postgres://... STRIPE_KEY=sk_live_...
flyctl deploy --config infra/fly/server.toml
```

Or via nexus-cli:

```bash
nexus deploy --env prod --target fly
```

---

## Scaling to regions

```bash
flyctl scale count 4 --region iad --config infra/fly/server.toml
flyctl scale count 4 --region lax --config infra/fly/server.toml
flyctl scale count 4 --region fra --config infra/fly/server.toml
flyctl scale count 2 --region nrt --config infra/fly/server.toml
flyctl scale count 2 --region syd --config infra/fly/server.toml
```

Region codes: https://fly.io/docs/reference/regions/

Match `Nexus.toml [deploy.envs.prod].regions`. → `docs/guides/deploy/region-matrix.md`.

---

## Dedicated IPv4

Anycast IPv4 is **shared** by default. For inbound UDP to a specific match, allocate dedicated:

```bash
flyctl ips allocate-v4 --app nexus-game-prod
# ~$2/mo per dedicated IPv4
```

Docs: https://fly.io/docs/networking/services/

---

## Postgres

```bash
flyctl postgres create --name nexus-prod-db --region iad --vm-size shared-cpu-2x --volume-size 40
flyctl postgres attach nexus-prod-db --app nexus-game-prod
```

Sets `DATABASE_URL` secret. HA: `--initial-cluster-size 3`.

Docs: https://fly.io/docs/postgres/

---

## Tigris S3 (asset CDN)

```bash
flyctl storage create
# emits AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_ENDPOINT_URL_S3
```

Docs: https://fly.io/docs/reference/tigris/

S3-compatible. Cloudflare R2 still cheaper egress for asset-heavy games. → `docs/guides/deploy/targets/cloudflare.md`.

---

## Smoke test

```bash
nexus deploy smoke --env prod --target fly
# or manually:
flyctl status --app nexus-game-prod
curl -fsS https://nexus-game-prod.fly.dev/healthz
nc -uv nexus-game-prod.fly.dev 7777     # UDP probe
```

---

## Rollback

```bash
flyctl releases --app nexus-game-prod
flyctl deploy --image registry.fly.io/nexus-game-prod:<prev-tag> --config infra/fly/server.toml
# or
nexus deploy rollback --env prod --target fly
```

Fly retains last ~50 releases. Rollback ≤ 60s.

---

## Cost note

| Env | Setup | ~$ / mo |
|-----|-------|---------|
| dev (1× shared-cpu-1x, no Postgres) | minimal | ~$5 |
| staging (2× perf-1x ×2 regions + small PG) | | ~$80 |
| prod (perf-2x ×6 regions ×4 machines + HA PG + Tigris) | | ~$2,500 @ 100k MAU |

Bandwidth: $0.02/GB egress outside North America/Europe; $0 within Fly Postgres replication.

Pricing: https://fly.io/docs/about/pricing/

---

## Pitfalls

- `auto_stop_machines` on UDP services breaks active matches mid-game. Always `false` for game servers.
- Shared IPv4 UDP is one port-per-app; for per-match ports use machines API + dedicated IPv4 or proxy.
- Cold starts on `auto_start` are ~200ms TCP, multi-second on Postgres connection pool warm-up.
- Health check `grace_period` must exceed the engine boot time (often 5–10s for asset preload).

---

## Cross-links

- Alternative PaaS → `docs/guides/deploy/targets/railway.md`, `docs/guides/deploy/targets/render.md`
- Region placement → `docs/guides/deploy/region-matrix.md`
- Asset CDN → `docs/guides/deploy/targets/cloudflare.md`
- Game-server fleet management → `docs/guides/deploy/targets/agones.md`
- Pipeline → `docs/guides/deploy/cicd.md`
