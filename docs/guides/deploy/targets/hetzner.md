<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Hetzner

Best $/core in EU. Dedicated boxes + cloud + load balancers + object storage. Manual setup but unmatched price/perf. UDP fine. → Pair with K3s + Agones for fleet management.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Service map

| Need | Hetzner product |
|------|-----------------|
| Cloud VM | Hetzner Cloud (CX/CPX/CCX series) |
| Dedicated box | Hetzner Robot (auction & new) |
| Load balancer | Hetzner Cloud LB |
| Object storage | Hetzner Storage Box (SFTP) · third-party for S3 |
| Managed K8s | not offered — run K3s/k0s/RKE2 |
| Managed Postgres | not offered — self-host |
| Locations | Falkenstein, Nuremberg, Helsinki, Hillsboro OR, Singapore |

Docs: https://docs.hetzner.com

---

## Why Hetzner

| Strength | |
|----------|--|
| **AX102** (Ryzen 9 7950X3D, 128GB, 2TB NVMe) for ~€100/mo | Hyperscaler equivalent ~€2,000/mo |
| CCX cloud (dedicated vCPU) cheaper than AWS reserved | |
| Unmetered traffic on most plans (20 TB → reduced speed) | Massive for game/asset hosting |
| Generous I/O, real CPUs | Not noisy-neighbor shared |
| EU data sovereignty | GDPR-friendly default |

| Weakness | |
|----------|--|
| Few regions outside EU | US (Hillsboro), Asia (Singapore) only |
| No managed databases | Self-host or use Neon/Supabase |
| Dedicated provisioning takes hours | Cloud VMs are instant |
| Support is async ticket-based | Don't expect AWS-style hand-holding |

---

## Prerequisites

| Item | |
|------|--|
| Hetzner Cloud account (separate from Robot) | https://www.hetzner.com/cloud |
| `hcloud` CLI | `brew install hcloud` |
| SSH key uploaded | `hcloud ssh-key create --name laptop --public-key-from-file ~/.ssh/id_ed25519.pub` |
| Network + firewall designed | Below |

---

## Cloud server (UDP game server)

```bash
hcloud network create --name nexus --ip-range 10.0.0.0/16
hcloud network add-subnet nexus --type cloud --network-zone eu-central --ip-range 10.0.0.0/24

hcloud firewall create --name nexus-gs \
  --rules-file infra/hetzner/firewall.json

hcloud server create \
  --name nexus-gs-fsn-01 \
  --type cpx41 \
  --image ubuntu-24.04 \
  --location fsn1 \
  --network nexus \
  --firewall nexus-gs \
  --ssh-key laptop \
  --user-data-from-file infra/hetzner/cloud-init.yaml
```

`infra/hetzner/firewall.json`:

```json
{
  "rules": [
    { "direction": "in", "protocol": "tcp", "port": "22", "source_ips": ["YOUR_IP/32"] },
    { "direction": "in", "protocol": "udp", "port": "7777", "source_ips": ["0.0.0.0/0", "::/0"] },
    { "direction": "in", "protocol": "tcp", "port": "443", "source_ips": ["0.0.0.0/0", "::/0"] }
  ]
}
```

`infra/hetzner/cloud-init.yaml`:

```yaml
#cloud-config
packages: [docker.io, ufw, fail2ban]
runcmd:
  - docker run -d --restart=always --network=host \
      -e NEXUS_ENV=prod \
      ghcr.io/your-org/nexus-game-server:latest
  - systemctl enable --now fail2ban
```

---

## Dedicated box (Robot)

Order via https://robot.hetzner.com (or auction https://www.hetzner.com/sb/).

Auto-provision via installimage on rescue boot:

```bash
ssh root@<rescue-ip>
installimage -a -n nexus-gs-01 -r yes -l 1 -p /boot:ext3:1G,swap:swap:2G,/:ext4:all \
  -i /root/.oldroot/nfs/install/../images/Ubuntu-2404-noble-amd64-base.tar.gz
reboot
```

Then run cloud-init equivalent manually.

Or use Ansible: https://docs.ansible.com (or Terraform with `hetznercloud/hcloud` provider).

---

## K3s cluster (lightweight K8s)

```bash
# control plane
curl -sfL https://get.k3s.io | sh -

# workers
curl -sfL https://get.k3s.io | K3S_URL=https://<cp-ip>:6443 K3S_TOKEN=<token> sh -

# install Agones
helm install agones agones/agones --namespace agones-system --create-namespace
```

K3s docs: https://docs.k3s.io
→ `docs/guides/deploy/targets/agones.md` for fleet config.

---

## Postgres (self-hosted HA)

Stay simple. Patroni + etcd + 3 nodes:

```bash
docker compose -f infra/hetzner/postgres-ha.yml up -d
```

Or use external managed: Neon, Supabase, Crunchy Bridge (cheaper than running it yourself if you're solo).

---

## Object storage

Hetzner Storage Box = SFTP only. For S3-compatible:

| Option | |
|--------|--|
| MinIO on a CX41 | Self-managed S3, ~€16/mo |
| Cloudflare R2 | Zero egress; best default → `docs/guides/deploy/targets/cloudflare.md` |
| Backblaze B2 | Bandwidth alliance to Cloudflare = free egress |

---

## CI/CD

`.github/workflows/deploy-hetzner.yml`:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: SSH + deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HZNR_HOST }}
          username: deploy
          key: ${{ secrets.HZNR_SSH_KEY }}
          script: |
            cd /opt/nexus
            docker compose pull
            docker compose up -d --remove-orphans
            curl -fsS http://localhost:8080/healthz
```

For fleet-scale: Ansible inventory or Terraform + cloud-init re-run.

---

## Smoke test

```bash
nexus deploy smoke --env prod --target hetzner
# or manually:
hcloud server list --selector tag=prod
curl -fsS https://your-domain.com/healthz
nc -uv <server-ip> 7777
```

---

## Rollback

Docker tag swap + restart:

```bash
ssh deploy@<host> "cd /opt/nexus && IMAGE_TAG=v1.2.2 docker compose up -d"
```

K3s: `kubectl rollout undo deployment/nexus-gs`.

---

## Cost note

| Component | 100k MAU | 10M MAU |
|-----------|----------|---------|
| CPX41 ×4 (cloud, game servers + lobby) | ~€60 | switch to dedicated |
| AX102 dedicated ×3 (game-server fleet) | ~€300 | ~€3,000 (30 boxes) |
| Postgres HA (Patroni on 3× CX31) | ~€30 | ~€500 (bigger boxes) |
| MinIO or external S3 | varies | varies |
| Load balancer | ~€5 | ~€50 |
| **Total approx (EU heavy)** | **~€400** | **~€5,000** |

Pricing: https://www.hetzner.com/cloud · https://www.hetzner.com/dedicated-rootserver

Compare 10M MAU: AWS ≈ $700k/mo. Hetzner ≈ €5k/mo. Difference: ops time + missing regions.

---

## Pitfalls

- **No global anycast.** For multi-region, run independent fleets per location + GeoDNS.
- **Hardware fails.** Dedicated boxes are real metal; have spare capacity.
- **DDoS protection** is included but basic; layer Cloudflare in front for high-risk.
- **20 TB traffic cap** then reduced to 1 Gbps; for asset-heavy launches use Cloudflare/R2 in front.
- **Support latency** is hours not minutes. Don't pick for SLA-bound enterprise.

---

## Sovereignty bonus

GDPR-friendly. Servers physically in EU. No US CLOUD Act exposure. → `docs/guides/deploy/targets/self-host.md` for full sovereignty.

---

## Cross-links

- Bare-metal sovereignty + self-host → `docs/guides/deploy/targets/self-host.md`
- Anycast game servers → `docs/guides/deploy/targets/fly-io.md`
- Game-server fleet management → `docs/guides/deploy/targets/agones.md`
- CDN in front → `docs/guides/deploy/targets/cloudflare.md`
- Pipeline → `docs/guides/deploy/cicd.md`
