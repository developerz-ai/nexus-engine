<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Railway

Push-to-deploy PaaS. Best for staging, internal tools, web/API services. **Not for UDP game servers** — proxy is HTTP/TCP only.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Why Railway

| Strength | |
|----------|--|
| Git-push deploy, zero config | Fastest staging spin-up |
| Per-PR preview environments | Clean PR workflow |
| Managed Postgres / Redis / Mongo | Click-to-add |
| Nixpacks auto-detects Rust/Node/Go | No Dockerfile needed |
| $5 monthly free credit | Hobby tier |

| Weakness | |
|----------|--|
| No UDP support | Game servers go elsewhere |
| Regional placement limited (us-east, us-west, eu-west, ap-southeast) | Not global |
| Pricing scales fast on memory | Watch overage |
| No anycast | One region per service |

Authoritative docs: https://docs.railway.com/

---

## Prerequisites

| Item | |
|------|--|
| Railway account | https://railway.com |
| `railway` CLI | `npm i -g @railway/cli` or `brew install railway` |
| Repo with `Dockerfile` or Nixpacks-compatible source | |

---

## railway.toml

`railway.toml`:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.server"

[deploy]
startCommand = "nexus server start --env staging"
healthcheckPath = "/healthz"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5

[deploy.envs.staging]
numReplicas = 1
region = "us-east"

[deploy.envs.prod]
numReplicas = 3
region = "us-east"
```

Docs: https://docs.railway.com/reference/config-as-code

---

## First deploy

```bash
railway login
railway init --name nexus-staging
railway link
railway up
railway domain                  # generates *.up.railway.app domain
```

Add a Postgres:

```bash
railway add --plugin postgresql
# sets DATABASE_URL automatically on linked service
```

Set secrets:

```bash
railway variables --set STRIPE_KEY=sk_test_...
```

Or via nexus-cli:

```bash
nexus deploy --env staging --target railway
```

---

## Per-PR preview envs

`.github/workflows/preview.yml`:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  preview:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g @railway/cli
      - name: Up preview
        if: github.event.action != 'closed'
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }} }
        run: railway environment create pr-${{ github.event.number }} || true && railway up --environment pr-${{ github.event.number }}
      - name: Teardown
        if: github.event.action == 'closed'
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }} }
        run: railway environment delete pr-${{ github.event.number }} --yes
```

Preview URL appears as a comment on the PR (via Railway GitHub app).

---

## Smoke test

```bash
nexus deploy smoke --env staging --target railway
# or manually:
curl -fsS https://nexus-staging.up.railway.app/healthz
railway logs --tail 50
```

---

## Rollback

```bash
railway redeploy --service nexus-staging --deployment <prev-deployment-id>
# or via UI: Deployments → Restart on prior commit
```

Railway retains last 10 deployments by default.

---

## Cost note

| Env | Setup | ~$ / mo |
|-----|-------|---------|
| dev/staging (1 service, 1 GB RAM, 0.5 vCPU) | $0.000463/GB-min RAM + $0.000231/vCPU-min | ~$10 |
| Postgres (1 GB) | included in service usage | +$5 |
| Per-PR preview (~5 PRs/week, 6h each) | usage-based | +$5 |

Pricing: https://railway.com/pricing
Hard cap via plan limits + alerting.

---

## Pitfalls

- **No UDP.** If your game server needs UDP, use Fly/AWS/Hetzner/self-host instead.
- **Memory > 1 GB explodes cost.** Audit allocator behavior; nexus-engine baseline is ~250 MB.
- **No native staging promotion.** Use separate environments or projects.
- **Cold-starts on hobby plan.** Pro plan keeps services warm.

---

## When to outgrow

| Symptom | Move to |
|---------|---------|
| Need UDP / dedicated game server | Fly.io, Hetzner + Agones |
| Need > 3 regions | Fly.io, AWS, GCP |
| > $200/mo on a single service | Hetzner dedicated or self-host |
| Need K8s primitives | AWS EKS / GCP GKE / Hetzner K3s |

---

## Cross-links

- Similar PaaS → `docs/guides/deploy/targets/render.md`
- For game servers → `docs/guides/deploy/targets/fly-io.md`
- Web frontend → `docs/guides/deploy/targets/vercel.md`
- Pipeline → `docs/guides/deploy/cicd.md`
