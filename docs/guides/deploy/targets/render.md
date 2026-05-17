<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Render

PaaS similar to Railway. Free tier, autoscaling, managed Postgres/Redis. **No UDP** — same constraint as Railway. Best for staging, web/API, cron jobs.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Why Render

| Strength | |
|----------|--|
| `render.yaml` infra-as-code | Reproducible across teams |
| Free static sites + free PostgreSQL trial | Cheap dev/staging |
| Preview environments per PR | Auto-spun by GitHub integration |
| Autoscale on CPU/RAM/RPS | Built-in, no Kubernetes |
| Managed cron jobs | First-class scheduler |
| Regions: Oregon, Virginia, Ohio, Frankfurt, Singapore | Reasonable coverage |

| Weakness | |
|----------|--|
| No UDP | Same as Railway |
| Postgres free tier expires after 90 days | Migrate to paid or another provider |
| Pricing on autoscale can surprise | Set max instances |
| Build minutes capped on hobby plan | |

Authoritative docs: https://render.com/docs

---

## Prerequisites

| Item | |
|------|--|
| Render account | https://render.com |
| GitHub/GitLab repo connected | OAuth via dashboard |
| `Dockerfile` or buildpack-compatible source | |

---

## render.yaml

`render.yaml` at repo root:

```yaml
services:
  - type: web
    name: nexus-api
    runtime: docker
    dockerfilePath: ./Dockerfile.api
    region: oregon
    plan: starter            # starter | standard | pro | pro-plus
    healthCheckPath: /healthz
    autoDeploy: true
    envVars:
      - key: NEXUS_ENV
        value: staging
      - key: DATABASE_URL
        fromDatabase:
          name: nexus-staging-db
          property: connectionString
      - key: STRIPE_KEY
        sync: false          # set manually in dashboard
    scaling:
      minInstances: 1
      maxInstances: 4
      targetCPUPercent: 70

  - type: cron
    name: nexus-nightly-stats
    runtime: docker
    schedule: "0 3 * * *"
    dockerfilePath: ./Dockerfile.cron
    dockerCommand: nexus jobs run nightly-stats

databases:
  - name: nexus-staging-db
    plan: starter
    region: oregon
    postgresMajorVersion: 16

previewsEnabled: true
previewsExpireAfterDays: 7
```

Docs: https://render.com/docs/blueprint-spec

---

## First deploy

Connect repo → Render reads `render.yaml` → click **Apply**.

Or via API:

```bash
curl -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @render-service.json
```

CLI alternative (community): https://render.com/docs/cli

Or:

```bash
nexus deploy --env staging --target render
```

---

## Preview environments

Enable in `render.yaml` (`previewsEnabled: true`). Render spins a full preview stack on each PR. URL posted to PR by Render GitHub App.

Each preview gets:
- Its own service instances
- Its own preview database (copy or fresh)
- Its own env vars (overridable)

Teardown: automatic on PR close or expiry.

---

## Smoke test

```bash
nexus deploy smoke --env staging --target render
# or manually:
curl -fsS https://nexus-api.onrender.com/healthz
render logs nexus-api --tail 100        # via CLI
```

---

## Rollback

```bash
# via dashboard: Deploys → previous deploy → "Rollback to this deploy"
# via API:
curl -X POST https://api.render.com/v1/services/<id>/deploys \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -d '{"commitId":"<prev-sha>"}'
```

Render retains all deploy history. Rollback ≤ 90s typical.

---

## Cost note

| Env | Setup | ~$ / mo |
|-----|-------|---------|
| Static site (frontend) | free plan | $0 |
| Starter web service (512 MB) | $7 | $7 |
| Standard web service (2 GB) | $25 | $25 |
| Postgres Standard (4 GB RAM, 100 GB disk) | $65 | $65 |
| Per-PR preview x5/week (auto-expire 7d) | usage | ~$30 |

Pricing: https://render.com/pricing

---

## Pitfalls

- **No UDP.** Same as Railway. Game servers belong elsewhere.
- **Free Postgres expires.** Move to paid before day 90 or back up + migrate.
- **Autoscale defaults aggressive.** Cap `maxInstances` to avoid runaway bills.
- **Cold starts on free tier** > 30s. Use starter or above for staging.

---

## When to outgrow

| Symptom | Move to |
|---------|---------|
| Need UDP | Fly.io, Hetzner + Agones |
| Need > 5 regions | Fly.io, AWS, GCP |
| Per-service cost > $200/mo | Hetzner / self-host |
| Need K8s | AWS EKS / GCP GKE / DO K8s |

---

## Cross-links

- Similar PaaS → `docs/guides/deploy/targets/railway.md`
- For game servers → `docs/guides/deploy/targets/fly-io.md`
- Frontend → `docs/guides/deploy/targets/vercel.md`
- Pipeline → `docs/guides/deploy/cicd.md`
