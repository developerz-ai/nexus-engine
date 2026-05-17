<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — GCP

Best for: K8s-heavy (GKE), Agones-native, BigQuery analytics, Spanner global SQL. Game-server-friendly via **Agones (originally a Google project)**.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Service map

| Need | GCP service |
|------|-------------|
| Containerized backend HTTP | Cloud Run |
| K8s | GKE (Autopilot or Standard) |
| Dedicated game servers | GKE + Agones (→ `docs/guides/deploy/targets/agones.md`) |
| Asset storage / CDN | GCS + Cloud CDN |
| Postgres | Cloud SQL · AlloyDB |
| Globally distributed SQL | Spanner |
| Lobby cache | Memorystore (Redis) · Firestore |
| Auth | Identity Platform · Firebase Auth |
| Secrets | Secret Manager |
| Observability | Cloud Operations (Logging + Monitoring + Trace) |
| Edge | Cloud CDN · Cloud Armor |
| Big-data analytics | BigQuery |

Docs: https://cloud.google.com/docs

---

## Prerequisites

| Item | |
|------|--|
| GCP account + billing | https://console.cloud.google.com |
| `gcloud` CLI | https://cloud.google.com/sdk/docs/install |
| Project + APIs enabled | `gcloud services enable container.googleapis.com run.googleapis.com ...` |
| Workload Identity Federation for CI | https://cloud.google.com/iam/docs/workload-identity-federation |

---

## Cloud Run (HTTP backend)

`infra/gcp/service.yaml`:

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: nexus-api
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 200
      timeoutSeconds: 60
      containers:
        - image: us-central1-docker.pkg.dev/nexus-prod/nexus/api:GIT_SHA
          ports: [{ containerPort: 8080 }]
          env:
            - name: NEXUS_ENV
              value: prod
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: db-url, key: latest }
          resources: { limits: { cpu: "1", memory: "1Gi" } }
```

Deploy:

```bash
gcloud run services replace infra/gcp/service.yaml --region us-central1
```

Cloud Run docs: https://cloud.google.com/run/docs

---

## GKE + Agones (game servers)

```bash
gcloud container clusters create-auto nexus-gs \
  --region us-central1 \
  --release-channel rapid

# install Agones
helm repo add agones https://agones.dev/chart/stable
helm upgrade --install agones agones/agones \
  --namespace agones-system --create-namespace \
  --set "gameservers.namespaces={default}"
```

GKE docs: https://cloud.google.com/kubernetes-engine/docs
Agones GKE guide: https://agones.dev/site/docs/installation/creating-cluster/gke/

Fleet + allocation → see `docs/guides/deploy/targets/agones.md`.

---

## Secrets Manager

```bash
echo -n "postgres://..." | gcloud secrets create db-url --data-file=-
gcloud secrets add-iam-policy-binding db-url \
  --member="serviceAccount:cloud-run-sa@nexus-prod.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

Docs: https://cloud.google.com/secret-manager/docs

---

## CI/CD via Workload Identity Federation

`.github/workflows/deploy-gcp.yml`:

```yaml
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/123/locations/global/workloadIdentityPools/gh/providers/gh
          service_account: gh-deploy@nexus-prod.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud auth configure-docker us-central1-docker.pkg.dev
          docker build -t us-central1-docker.pkg.dev/nexus-prod/nexus/api:$GITHUB_SHA .
          docker push us-central1-docker.pkg.dev/nexus-prod/nexus/api:$GITHUB_SHA
          sed -i "s/GIT_SHA/$GITHUB_SHA/" infra/gcp/service.yaml
          gcloud run services replace infra/gcp/service.yaml --region us-central1
```

---

## Smoke test

```bash
nexus deploy smoke --env prod --target gcp
# or manually:
gcloud run services describe nexus-api --region us-central1 --format='value(status.url)' \
  | xargs -I {} curl -fsS {}/healthz
```

---

## Rollback

```bash
gcloud run services update-traffic nexus-api --region us-central1 \
  --to-revisions=nexus-api-<prev-rev>=100
```

Cloud Run keeps all revisions; rollback = traffic split.

GKE/Agones: `kubectl rollout undo deployment/...`.

---

## Cost note

| Component | 100k MAU | 10M MAU |
|-----------|----------|---------|
| Cloud Run (HTTP API) | ~$400 | switch to GKE |
| GKE Autopilot | ~$120 (cluster) + nodes | per workload |
| Agones game servers (n2-standard-2 ×100) | ~$3,000 | ~$300,000 |
| GCS + Cloud CDN | ~$400 | ~$30,000 |
| Cloud SQL Postgres HA | ~$300 | ~$3,000 |
| Cloud Logging/Monitoring | ~$200 | ~$2,000 |
| **Total approx** | **~$4,500** | **~$400,000** |

Pricing: https://cloud.google.com/pricing
Egress to internet: $0.12/GB → cuts to ~$0.05/GB at PB scale. Cheaper than AWS for big bandwidth. Still more than R2.

---

## Pitfalls

- **Cloud Run is HTTP only.** No UDP. Use GKE + Agones for game servers.
- **Cold start on min-scale 0.** Set `minScale=1` for low-latency APIs.
- **Spanner is expensive** ($0.30/node-hour). Worth it for global ACID; overkill otherwise.
- **Autopilot pricing** charges per pod resource request. Right-size requests.
- **VPC peering and egress to other clouds** is pricey; design for one cloud.

---

## When GCP is worth it

| Reason | |
|--------|--|
| Already running Agones | Agones was born at Google |
| Need BigQuery for analytics | Best-in-class |
| Need Spanner for global SQL | Unmatched |
| GKE Autopilot for simplified K8s | Cleaner than EKS/AKS for many teams |
| Pre-existing GCP commitments | Stay consistent |

---

## Cross-links

- Agones detail → `docs/guides/deploy/targets/agones.md`
- AWS comparison → `docs/guides/deploy/targets/aws.md`
- Asset CDN cheaper → `docs/guides/deploy/targets/cloudflare.md`
- Pipeline → `docs/guides/deploy/cicd.md`
