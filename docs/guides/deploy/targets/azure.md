<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Azure

Best for: PlayFab (turnkey game backend), studios with Microsoft enterprise agreements, Xbox/Game Pass integration. Otherwise pricier and clunkier than AWS/GCP.

→ Overview: `docs/guides/deploy/overview.md`.

---

## Service map

| Need | Azure service |
|------|---------------|
| Containerized backend | Container Apps · App Service |
| K8s | AKS |
| Game backend turnkey (matchmaking, leaderboards, party, IAM) | **PlayFab** |
| Dedicated game servers | Azure PlayFab Multiplayer Servers · AKS + Agones |
| Asset storage / CDN | Blob Storage + Azure Front Door |
| Postgres | Azure Database for PostgreSQL |
| Globally distributed multi-model | Cosmos DB |
| Lobby cache | Azure Cache for Redis |
| Secrets | Key Vault |
| Observability | Application Insights · Log Analytics |
| Xbox/Game Pass | Xbox Live Services (gated) |

Docs: https://learn.microsoft.com/azure/

---

## Why Azure (specifically)

| Reason | |
|--------|--|
| PlayFab is the best one-stop game backend on the market | Free tier generous (100k MAU) |
| Game Pass / Xbox integration | Single vendor across PC + Xbox |
| Enterprise Microsoft EA discounts | Often 30-50% off list |
| AKS + Agones works | Same pattern as GKE |

Trade-off: pricing is opaque without an EA. Default list pricing is ~10-20% higher than AWS for equivalent compute.

---

## PlayFab — the killer feature

PlayFab supplies:
- Player accounts + auth (email, FB, Apple, Steam, Xbox, custom)
- Matchmaking (TrueSkill-based)
- Leaderboards (versioned)
- Cloud Save
- Party / Voice
- Real-time analytics
- Hosted multiplayer servers (linux/windows, container or VM-based)
- Economy / IAP validation

Setup:

```bash
# create PlayFab title in https://developer.playfab.com
# get TitleId + SecretKey
```

Client SDK (any platform):

```rust
// pseudocode — actual SDK varies per language
let pf = PlayFab::new(title_id);
let session = pf.login_with_steam(steam_ticket).await?;
pf.matchmaking().queue("ranked_5v5", session).await?;
```

PlayFab docs: https://learn.microsoft.com/gaming/playfab/
Pricing: https://playfab.com/pricing/ — free up to 100k MAU on essentials.

---

## Container Apps (HTTP backend)

`infra/azure/containerapp.yaml`:

```yaml
location: eastus
properties:
  managedEnvironmentId: /subscriptions/.../managedEnvironments/nexus-env
  configuration:
    ingress:
      external: true
      targetPort: 8080
      transport: http
    secrets:
      - name: db-url
        keyVaultUrl: https://nexus-kv.vault.azure.net/secrets/db-url
        identity: system
  template:
    containers:
      - name: api
        image: nexus.azurecr.io/api:GIT_SHA
        resources: { cpu: 1.0, memory: 2Gi }
        env:
          - { name: NEXUS_ENV, value: prod }
          - { name: DATABASE_URL, secretRef: db-url }
    scale: { minReplicas: 1, maxReplicas: 20 }
```

Deploy:

```bash
az containerapp update --name nexus-api --resource-group nexus-prod \
  --yaml infra/azure/containerapp.yaml
```

Container Apps docs: https://learn.microsoft.com/azure/container-apps/

---

## AKS + Agones (game-server fleet, non-PlayFab)

```bash
az aks create --resource-group nexus-prod --name nexus-gs \
  --node-count 3 --node-vm-size Standard_D4s_v5 --generate-ssh-keys

az aks get-credentials --resource-group nexus-prod --name nexus-gs

helm repo add agones https://agones.dev/chart/stable
helm install agones agones/agones --namespace agones-system --create-namespace
```

→ `docs/guides/deploy/targets/agones.md` for fleet config.

---

## PlayFab Multiplayer Servers (alternative)

If using PlayFab, skip AKS entirely:

```bash
# upload Linux server build
az playfab multiplayer build create-linux-build \
  --title-id $TITLE_ID \
  --build-name nexus-prod-$GITHUB_SHA \
  --vm-size Standard_D2as_v4 \
  --multiplayer-server-count-per-vm 4 \
  --game-assets-references "fileName=server.tar.gz,mountPath=/data/" \
  --region-configurations "region=EastUs,maxServers=10,standbyServers=2"
```

PlayFab MPS docs: https://learn.microsoft.com/gaming/playfab/features/multiplayer/servers/

---

## CI/CD via OIDC

`.github/workflows/deploy-azure.yml`:

```yaml
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - run: |
          az acr login --name nexus
          docker build -t nexus.azurecr.io/api:$GITHUB_SHA .
          docker push nexus.azurecr.io/api:$GITHUB_SHA
          sed -i "s/GIT_SHA/$GITHUB_SHA/" infra/azure/containerapp.yaml
          az containerapp update --name nexus-api --resource-group nexus-prod \
            --yaml infra/azure/containerapp.yaml
```

OIDC: https://learn.microsoft.com/azure/developer/github/connect-from-azure

---

## Smoke test

```bash
nexus deploy smoke --env prod --target azure
# or manually:
az containerapp show -n nexus-api -g nexus-prod --query properties.configuration.ingress.fqdn -o tsv \
  | xargs -I {} curl -fsS https://{}/healthz
```

---

## Rollback

```bash
az containerapp revision list --name nexus-api -g nexus-prod
az containerapp revision activate --name nexus-api -g nexus-prod --revision <prev>
```

PlayFab: rebuild and re-deploy a prior build; allocate new servers from old build.

---

## Cost note

| Component | 100k MAU | 10M MAU |
|-----------|----------|---------|
| PlayFab (Essentials, < 100k MAU) | $0 | $1,495/mo + meters |
| Container Apps (3-20 replicas) | ~$300 | switch to AKS |
| AKS (3 nodes Standard_D4) | ~$400 | per workload |
| Blob + Front Door (5 TB) | ~$500 | ~$40,000 |
| Postgres (Flexible, HA) | ~$400 | ~$5,000 |
| Cosmos DB (if used) | varies wildly | varies wildly |
| App Insights | ~$200 | ~$2,000 |
| **Total approx** | **~$2,000-$3,000** | **~$500,000+** |

Pricing: https://azure.microsoft.com/pricing/
PlayFab pricing: https://playfab.com/pricing/

---

## Pitfalls

- **Cosmos DB cost.** RU-based pricing is opaque; benchmark before committing.
- **Front Door vs CDN naming changes.** Azure renames products often. Verify the SKU.
- **PlayFab cloud script** is JavaScript-only and limited; complex backend logic still wants a separate service.
- **Xbox Live integration** is gated behind ID@Xbox / partner status. → `docs/guides/release/xbox-console.md`.
- **Region naming inconsistent** between Azure portal, CLI, and PlayFab.

---

## When Azure is worth it

| Reason | |
|--------|--|
| Want PlayFab without writing matchmaking/leaderboards | Big time-saver |
| Targeting Xbox + PC unified | Xbox Live SDK only first-class here |
| Existing Microsoft EA / Azure commitments | Discounts substantial |
| Need Cosmos DB multi-model global | Niche but real |

Otherwise: AWS or GCP are typically cheaper and less Microsoft-flavored.

---

## Cross-links

- Agones detail → `docs/guides/deploy/targets/agones.md`
- AWS comparison → `docs/guides/deploy/targets/aws.md`
- GCP comparison → `docs/guides/deploy/targets/gcp.md`
- Xbox release → `docs/guides/release/xbox-console.md`
- Pipeline → `docs/guides/deploy/cicd.md`
