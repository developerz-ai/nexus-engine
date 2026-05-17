<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Self-Host

Bare-metal, homelab, on-prem. K3s + Tailscale + Caddy + Restic. The MIT-aligned default for the freedom-maxxer. Zero vendor lock-in.

→ Overview: `docs/guides/deploy/overview.md`. Aligns with the Nexus open-source mandate.

---

## Why self-host

| Reason | |
|--------|--|
| Zero vendor lock-in | Move providers in a weekend |
| GDPR / sovereignty | Data physically yours |
| Per-month cost of an AAA-budget = $50 indie | If you have spare boxes |
| Educational | You learn the stack |
| MIT principle alignment | The whole point of Nexus |

| Trade-off | |
|-----------|--|
| Ops burden | Patches, upgrades, hardware failures |
| Bandwidth cost depends on ISP | Residential = limited; colo = best |
| No multi-region without colocation | Use Tailscale + remote VPS for edge |
| You are the on-call | Pager goes to your phone |

---

## Reference architecture

```
                Internet
                    │
        Cloudflare (DNS + DDoS shield + R2)
                    │
        Reverse proxy: Caddy on a VPS (Hetzner/DO)
                    │  ←── Tailscale mesh ──→
                    │
   ┌────────────┬───┴───────┬────────────┐
   │            │           │            │
 home-server   colo-1     colo-2      cloud-vm
 (K3s)        (K3s)      (K3s)        (K3s)
   │            │           │            │
   └─────── Restic ──────────────── Backblaze B2
```

Cloudflare in front: DDoS, DNS, TLS termination at the edge, R2 for assets.
Tailscale: mesh VPN over WireGuard. Nodes talk privately, anywhere.
Caddy: HTTPS reverse proxy with automatic Let's Encrypt.
K3s: lightweight K8s. Runs on a Raspberry Pi.
Restic: encrypted backups to B2/R2/anywhere.

---

## Prerequisites

| Item | |
|------|--|
| At least one box (homelab Mini PC, NUC, rack server) | $200+ if buying |
| Static IP from ISP OR Cloudflare Tunnel | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ |
| Cloudflare account for DNS/CDN | Free |
| Tailscale account (free up to 100 devices) | https://tailscale.com |
| UPS for production | Power blip = downtime |

---

## Bootstrap a node (Ubuntu Server 24.04)

```bash
# fresh box, root SSH
apt update && apt upgrade -y
apt install -y ufw fail2ban tailscale curl

# Tailscale
tailscale up --ssh --advertise-tags=tag:nexus-node

# K3s server (first node)
curl -sfL https://get.k3s.io | sh -s - --tls-san $(tailscale ip -4)

# additional workers
K3S_URL=https://<server-tailscale-ip>:6443 K3S_TOKEN=$(cat /var/lib/rancher/k3s/server/node-token) \
  curl -sfL https://get.k3s.io | sh -
```

K3s docs: https://docs.k3s.io/quick-start
Tailscale: https://tailscale.com/kb/

---

## Caddy reverse proxy

`infra/self-host/Caddyfile`:

```
example.com {
    encode gzip zstd
    reverse_proxy nexus-api.tailnet:8080 {
        health_uri /healthz
        health_interval 10s
    }
    log {
        output file /var/log/caddy/access.log
        format json
    }
}

lobby.example.com {
    reverse_proxy nexus-lobby.tailnet:8081
}
```

```bash
caddy run --config /etc/caddy/Caddyfile
```

Caddy docs: https://caddyserver.com/docs/

---

## Deploy via Helm/kubectl

`infra/self-host/nexus-deploy.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: nexus-api, namespace: nexus }
spec:
  replicas: 2
  selector: { matchLabels: { app: nexus-api } }
  template:
    metadata: { labels: { app: nexus-api } }
    spec:
      containers:
        - name: api
          image: ghcr.io/your-org/nexus-api:GIT_SHA
          ports: [{ containerPort: 8080 }]
          env:
            - { name: NEXUS_ENV, value: prod }
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: db, key: url } }
          livenessProbe:  { httpGet: { path: /healthz, port: 8080 } }
          readinessProbe: { httpGet: { path: /healthz, port: 8080 } }
---
apiVersion: v1
kind: Service
metadata: { name: nexus-api, namespace: nexus }
spec:
  selector: { app: nexus-api }
  ports: [{ port: 8080, targetPort: 8080 }]
```

```bash
kubectl apply -f infra/self-host/nexus-deploy.yaml
```

---

## Postgres (self-hosted HA)

Patroni + etcd. Or simpler: single primary + nightly backup, accept brief downtime on failure.

For zero-downtime: CloudNativePG operator on K3s. Docs: https://cloudnative-pg.io

---

## Backups — Restic

```bash
restic init --repo b2:nexus-backups:/   # uses BACKBLAZE_KEY env
restic backup /var/lib/rancher /var/lib/postgresql --tag prod
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
```

Cron:

```cron
0 3 * * * /usr/local/bin/nexus-backup.sh
```

Restic docs: https://restic.readthedocs.io/

Test restores monthly. An untested backup is no backup.

---

## DDoS / public ingress

Two patterns:

**A — Cloudflare Tunnel (no public IP needed):**

```bash
cloudflared tunnel create nexus
cloudflared tunnel route dns nexus example.com
cloudflared tunnel run nexus
```

Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

**B — Static IP + Cloudflare proxied DNS:**

DNS A record orange-cloud-on. Cloudflare blocks DDoS at the edge.

For UDP game traffic, neither covers you well — DDoS-protected UDP needs Cloudflare Spectrum (enterprise) or a VPS in front (Fly machines with sidecar proxy).

---

## CI/CD

GitHub Actions → SSH → `kubectl apply`:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: tailscale/github-action@v3
        with: { oauth-client-id: ${{ secrets.TS_OAUTH_ID }}, oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}, tags: tag:ci }
      - run: |
          kubectl --server=https://nexus-cp.tailnet:6443 \
            --token=$KUBE_TOKEN \
            apply -f infra/self-host/nexus-deploy.yaml
```

---

## Smoke test

```bash
nexus deploy smoke --env prod --target self
# or manually:
kubectl -n nexus rollout status deployment/nexus-api
curl -fsS https://example.com/healthz
```

---

## Rollback

```bash
kubectl -n nexus rollout undo deployment/nexus-api
```

---

## Cost note

| Item | One-time | Monthly |
|------|---------|---------|
| Mini PC (Beelink SER7 32GB/1TB) | ~$500 | $0 |
| UPS (CyberPower 1500VA) | ~$200 | $0 |
| Electricity (~50W idle × $0.15/kWh) | — | ~$5 |
| Residential gigabit | — | ~$70 (already paying) |
| Cloud VPS for edge proxy (CX22) | — | ~€5 |
| Cloudflare (Free plan) | — | $0 |
| Tailscale (Free) | — | $0 |
| Backblaze B2 (200 GB) | — | ~$1 |

**~$80/mo all-in** for a 1k-MAU-class indie game with full ops on your boxes.

Scale: add boxes (each ~$500) and a colo rack (~$100/mo per U) before reaching cloud-cost crossover.

---

## Pitfalls

- **No multi-region without colocation.** Players in Asia get high RTT to your bedroom.
- **Power, ISP, DNS** = single points of failure. Mitigate with UPS, secondary ISP, GeoDNS.
- **Patching is on you.** Schedule monthly K3s + base OS upgrades.
- **Hardware fails.** Have one spare box and tested restore.
- **Residential ISP TOS** often forbids servers. Use colo or cloud VPS for production traffic ingress.

---

## When self-host wins

| Reason | |
|--------|--|
| You believe Nexus's MIT principles include the deploy | Walk the talk |
| < 10k MAU and stable | Cloud is expensive overhead |
| You enjoy the homelab | Educational / fun |
| GDPR / sovereignty hard requirement | Total control |

---

## Cross-links

- Hardware to buy → `docs/guides/deploy/targets/hetzner.md` (rent if you don't own)
- Game-server fleet → `docs/guides/deploy/targets/agones.md`
- Edge proxy / CDN → `docs/guides/deploy/targets/cloudflare.md`
- Pipeline → `docs/guides/deploy/cicd.md`
- Observability self-host → `docs/guides/deploy/observability.md`
