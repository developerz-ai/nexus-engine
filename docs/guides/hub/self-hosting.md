<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — Self-host a nexus-hub mirror

> `docker compose up` brings up a working mirror. K3s helm chart for prod (linked, not shipped here). Default mode: read-only mirror of `hub.nexus.engine`. Switch to canonical-for-your-namespace via one config flag.

→ Spec: `docs/specs/hub/architecture.md`
→ Federation protocol: `docs/specs/hub/federation.md`
→ CLI: `docs/specs/hub/cli.md`

## When you'd self-host

| Need | Mode |
|---|---|
| Try things locally | dev (default `docker compose up`) |
| Studio internal mirror; air-gapped network | private |
| Community-run public mirror | community |
| Geographic latency improvement | community |
| Canonical for studio-internal crates | community + namespace claim |

## Prereqs

| Need | Version |
|---|---|
| Docker | 24+ |
| docker compose | v2.20+ |
| Disk | 50 GB free (300k records + Meili index + Postgres) |
| RAM | 4 GB minimum; 8 GB recommended |
| HTTPS | Caddy or Cloudflare in front (mandatory for federation) |

## Quickstart — dev

```
docker compose -f https://hub.nexus.engine/deploy/docker-compose.dev.yml up
```

Equivalent local snippet (`docker-compose.dev.yml`):

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: nexus_hub
    volumes: [pgdata:/var/lib/postgresql/data]
  meili:
    image: getmeili/meilisearch:v1.10
    environment:
      MEILI_MASTER_KEY: dev-master-key
    volumes: [meili:/meili_data]
  hub:
    image: ghcr.io/nexus-engine/nexus-hub:latest
    depends_on: [postgres, meili]
    ports: ["8080:8080"]
    environment:
      NEXUS_HUB_DATABASE_URL: postgres://postgres:dev@postgres/nexus_hub
      NEXUS_HUB_MEILI_URL:    http://meili:7700
      NEXUS_HUB_MEILI_KEY:    dev-master-key
      NEXUS_HUB_PUBLIC_URL:   http://localhost:8080
      NEXUS_HUB_MODE:         mirror
      NEXUS_HUB_UPSTREAM:     https://hub.nexus.engine
volumes:
  pgdata:
  meili:
```

Visit `http://localhost:8080`. Browse UI works. CLI:

```
nexus hub --hub http://localhost:8080 search "soulslike"
```

First snapshot pull happens automatically (≤ 5 min). Watch logs:

```
docker compose logs -f hub | grep federation
```

## Modes

```toml
# config/hub.toml
[hub]
public_url   = "https://hub.studio-acme.example"
mode         = "mirror"          # mirror | canonical | private | hybrid
upstream     = "https://hub.nexus.engine"
namespaces_canonical = []        # globs this mirror is canonical for, e.g. ["studio-acme-*"]
is_private   = false             # if true, not crawled by peers
contact      = "ops@studio-acme.example"
identity_key = "/etc/nexus-hub/identity.ed25519"   # generated on first run

[crawler]
enabled = true
adapters = ["crates_io", "github_releases"]   # disable mod adapters in studio mirror

[federation]
pull_interval_seconds = 3600
peers = ["https://hub.nexus.engine"]
```

Mode behaviour:

| Mode | Crawls own namespace | Pulls upstream | Accepts public submits | Issues attestations |
|---|---|---|---|---|
| `mirror` | no | yes | no (returns 403) | no (returns 403) |
| `canonical` | yes (only `namespaces_canonical`) | yes (upstream namespaces) | yes (only `namespaces_canonical`) | yes (only `namespaces_canonical`) |
| `private` | yes | no | yes | yes (under own keys) |
| `hybrid` | yes (for own ns) | yes (for upstream ns) | yes | yes |

`hybrid` is the recommended studio mode.

## Identity key

Generate on first run:

```
docker compose exec hub nexus-hub keygen --out /etc/nexus-hub/identity.ed25519
```

Back it up. If lost, you re-keygen and cross-sign — but federation peers must re-pin.

## Register with the canonical hub (optional)

For visibility in the federation directory:

```
nexus hub mirror register \
  --hub https://hub.nexus.engine \
  --my-origin https://hub.studio-acme.example \
  --contact ops@studio-acme.example \
  --token $NEXUS_HUB_TOKEN
```

Registered mirrors appear at `GET https://hub.nexus.engine/api/v1/mirrors` and get federation rate limits (6000/min). Optional — your mirror works without registering.

## HTTPS

Federation requires HTTPS. Caddy in front is the simplest path:

```caddy
hub.studio-acme.example {
  reverse_proxy hub:8080
  encode gzip zstd
}
```

Cloudflare or Bunny CDN in front works the same.

## Backups

Postgres dump nightly:

```
docker compose exec postgres pg_dump nexus_hub --format=custom > /backups/nexus-hub-$(date +%F).dump
```

Restore:

```
docker compose exec -T postgres pg_restore -d nexus_hub < /backups/nexus-hub-2026-05-17.dump
```

Meili re-indexes itself from Postgres on startup; no separate backup needed.

Identity key + audit log: back these up to a different physical location. Losing either is recoverable; losing both at once is not.

## Air-gapped mode (sneakernet)

```
# Source side, with internet:
nexus hub index sync --out /media/usb/index-$(date +%F).tar.gz

# Destination side, air-gapped:
docker compose exec hub nexus-hub import /media/usb/index-2026-05-17.tar.gz
```

Sneakernet snapshots are signed by the source hub's identity key. Air-gapped hub verifies on import. Replay-protection: refuse to import an older snapshot than the currently loaded one.

## K3s (production)

Helm chart published at `https://hub.nexus.engine/deploy/helm/nexus-hub-<version>.tgz`. Link — not duplicated here. Chart includes:

- Stateful Postgres (use cloud DB in production).
- Meilisearch deployment with persistent volume.
- Hub API + UI as a Deployment with HPA.
- Ingress (nginx-ingress or Traefik).
- Cron job for federation pulls.
- Cron job for nightly snapshot export.

```
helm repo add nexus-hub https://hub.nexus.engine/deploy/helm
helm install hub nexus-hub/nexus-hub \
  --values values.studio.yaml
```

## Observability

| Surface | Endpoint |
|---|---|
| Health | `GET /healthz` |
| Readiness | `GET /readyz` |
| Prometheus metrics | `GET /metrics` |
| Crawler health | `GET /admin/crawler/health` (admin token) |
| Federation lag | `GET /admin/federation/lag` |

Recommended dashboards: copy from `https://hub.nexus.engine/deploy/grafana/`.

## Common issues

| Symptom | Fix |
|---|---|
| First pull takes >30 min | snapshot is ~50 MB; check upstream throughput; the seed is one-time |
| `meili` keeps OOM | give it 2 GB RAM and don't share with Postgres |
| Federation pull returns 403 | check our `User-Agent` and that we're registered with upstream |
| `identity_key` signature mismatch | likely DNS hijack or unannounced key rotation; refuse to merge until verified |
| Disk fill | rotate audit log archives; truncate per-day downloads older than 24mo |

## Resource budget at scale

| Records | Postgres disk | Meili disk | RAM | CPU |
|---|---|---|---|---|
| 10k | 1 GB | 0.5 GB | 2 GB | 1 vCPU |
| 100k | 8 GB | 4 GB | 4 GB | 2 vCPU |
| 1M | 60 GB | 30 GB | 16 GB | 4 vCPU |

These are estimates from the index-record shape in `index-format.md`. Real-world: scale Postgres first, then API replicas, then Meili.

## Cross-references

- Architecture: `docs/specs/hub/architecture.md`
- Federation protocol: `docs/specs/hub/federation.md`
- Identity + key management: `docs/specs/hub/identity.md`
- Mirror operator subagent: `.claude/agents/hub-mirror-operator.md`
