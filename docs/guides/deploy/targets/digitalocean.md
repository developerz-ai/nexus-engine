<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — DigitalOcean

Predictable pricing. Droplets + App Platform + managed K8s + Spaces (S3). Good middle-ground between bare Hetzner and full AWS. UDP works on droplets.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Service map

| Need | DO service |
|------|-----------|
| VM (UDP-capable) | Droplets |
| Managed K8s | DOKS (DigitalOcean Kubernetes) |
| App Platform PaaS (HTTP) | App Platform |
| Object storage S3-compatible | Spaces (+ Spaces CDN) |
| Postgres | Managed Databases |
| Redis / KeyDB | Managed Caches |
| Load balancer | DO Load Balancer (HTTP/TCP) |
| Functions | DO Functions (limited) |

Docs: https://docs.digitalocean.com

---

## Why DO

| Strength | |
|----------|--|
| Pricing is simple and listed clearly | No surprise bill |
| Droplets support UDP natively | Game servers OK |
| 14+ regions, good coverage | NYC, SFO, AMS, FRA, LON, TOR, BLR, SGP, SYD |
| DOKS is cheap K8s | $12/mo per cluster (control plane free) |
| Tutorials are world-class | Easiest cloud to learn |

| Weakness | |
|----------|--|
| No purpose-built game services | DIY matchmaking, fleet management |
| Limited burstable / spot pricing | Always-on cost |
| Slower iteration on new features vs AWS/GCP | |
| Spaces CDN limited features vs Cloudflare R2 | Egress not free |

---

## Prerequisites

| Item | |
|------|--|
| DO account + billing | https://cloud.digitalocean.com |
| `doctl` CLI | `brew install doctl` or `snap install doctl` |
| SSH key uploaded | `doctl compute ssh-key import` |

---

## App Platform — HTTP backend

`.do/app.yaml`:

```yaml
name: nexus-api
region: nyc
services:
  - name: api
    github:
      repo: your-org/nexus-game
      branch: main
      deploy_on_push: true
    dockerfile_path: Dockerfile.api
    http_port: 8080
    instance_size_slug: professional-xs
    instance_count: 2
    health_check:
      http_path: /healthz
      initial_delay_seconds: 10
    envs:
      - { key: NEXUS_ENV, value: prod }
      - { key: DATABASE_URL, value: "${db.DATABASE_URL}", type: SECRET }
databases:
  - name: db
    engine: PG
    production: true
    version: "16"
    size: db-s-1vcpu-1gb
```

Deploy:

```bash
doctl apps create --spec .do/app.yaml
# or update
doctl apps update <app-id> --spec .do/app.yaml
```

Docs: https://docs.digitalocean.com/products/app-platform/

---

## Droplets + UDP game server

```bash
doctl compute droplet create nexus-gs-iad-01 \
  --region nyc3 --size c-4 --image ubuntu-24-04-x64 \
  --ssh-keys $SSH_KEY_ID --tag-name nexus-gs,prod \
  --user-data-file infra/do/cloud-init.yaml
```

`infra/do/cloud-init.yaml`:

```yaml
#cloud-config
packages: [docker.io, ufw]
runcmd:
  - ufw allow 22/tcp
  - ufw allow 7777/udp
  - ufw --force enable
  - docker run -d --restart=always --network=host \
      -e NEXUS_ENV=prod \
      ghcr.io/your-org/nexus-game-server:latest
```

Firewall:

```bash
doctl compute firewall create --name nexus-gs \
  --inbound-rules "protocol:tcp,ports:22,sources:0.0.0.0/0 protocol:udp,ports:7777,sources:0.0.0.0/0" \
  --outbound-rules "protocol:tcp,ports:all,destinations:0.0.0.0/0 protocol:udp,ports:all,destinations:0.0.0.0/0" \
  --tag-names nexus-gs
```

---

## DOKS + Agones

```bash
doctl kubernetes cluster create nexus-gs \
  --region nyc3 --version 1.31 \
  --node-pool "name=worker;size=s-4vcpu-8gb;count=3;auto-scale=true;min-nodes=3;max-nodes=20"

doctl kubernetes cluster kubeconfig save nexus-gs

helm install agones agones/agones --namespace agones-system --create-namespace
```

→ `docs/guides/deploy/targets/agones.md` for fleet config.

---

## Spaces (S3-compatible)

```bash
doctl spaces create nexus-assets-prod --region nyc3
doctl spaces cdn create --origin nexus-assets-prod.nyc3.digitaloceanspaces.com
```

Use AWS SDK with custom endpoint `https://nyc3.digitaloceanspaces.com`.

Spaces docs: https://docs.digitalocean.com/products/spaces/

For asset CDN at scale, Cloudflare R2 remains cheaper (zero egress).

---

## CI/CD

`.github/workflows/deploy-do.yml`:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: digitalocean/action-doctl@v2
        with: { token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }} }
      - run: doctl apps update ${{ secrets.DO_APP_ID }} --spec .do/app.yaml --wait
```

---

## Smoke test

```bash
nexus deploy smoke --env prod --target do
# or manually:
doctl apps get <app-id> --format LiveURL --no-header | xargs -I {} curl -fsS {}/healthz
nc -uv $(doctl compute droplet get nexus-gs-iad-01 --format PublicIPv4 --no-header) 7777
```

---

## Rollback

```bash
doctl apps list-deployments <app-id>
doctl apps create-deployment <app-id> --force-rebuild=false --rollback-to <deployment-id>
```

---

## Cost note

| Component | 100k MAU | 10M MAU |
|-----------|----------|---------|
| App Platform Professional-XS ×2 | ~$50 | switch to droplets |
| Droplets c-4 ×20 (game servers) | ~$1,600 | ~$160,000 |
| Managed Postgres (Standard 4GB HA) | ~$120 | ~$1,500 |
| Spaces + CDN (5 TB) | ~$300 | ~$30,000 |
| Load balancer | ~$12 | ~$120 |
| **Total approx** | **~$2,100** | **~$200,000** |

Pricing: https://www.digitalocean.com/pricing

---

## Pitfalls

- **No anycast.** One IP per droplet. For multi-region game servers, use DNS-based steering + per-region droplets.
- **App Platform Pro pricing climbs fast** beyond 2 GB RAM. Switch to droplets earlier than expected.
- **Spaces CDN cache invalidation can be slow.** Cache-bust with versioned URLs.
- **No spot/preemptible.** All capacity is on-demand.

---

## When DO wins

| Reason | |
|--------|--|
| Want simple, predictable pricing | DO is the clearest |
| Need UDP game servers without orchestration overhead | Droplet + Docker |
| Solo / small team allergic to AWS complexity | Default for indie hosting |
| Existing tutorials / community on DO | Mature OSS docs |

---

## Cross-links

- Cheaper bare-metal → `docs/guides/deploy/targets/hetzner.md`
- Anycast game servers → `docs/guides/deploy/targets/fly-io.md`
- Asset CDN cheaper → `docs/guides/deploy/targets/cloudflare.md`
- Agones fleet → `docs/guides/deploy/targets/agones.md`
- Pipeline → `docs/guides/deploy/cicd.md`
