<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Secrets

Never-in-repo. Encrypted-at-rest. Scoped per env. Rotated on every personnel change.

---

## Backend choice

| Backend | Best for | Cost | Notes |
|---------|---------|------|-------|
| sops + age | Solo / small team, MIT-aligned default | free | Files in repo, encrypted; recipients = age keys |
| Doppler | Small/medium team, dev UX | free tier, ~$8/user | Web UI, env injection, audit log |
| 1Password Connect | Team already on 1Password | $8/user + Connect | Secrets in vaults, fetched at deploy |
| HashiCorp Vault | Enterprise, on-prem | self-host | Dynamic creds, KMS, audit |
| AWS Secrets Manager | AWS workloads | $0.40/secret/mo | IAM-scoped, KMS-backed |
| GCP Secret Manager | GCP workloads | $0.06/version/mo | IAM-scoped |
| Azure Key Vault | Azure workloads | $0.03/10k ops | IAM-scoped |

`Nexus.toml` field `secrets_backend` picks one. → `docs/guides/deploy/overview.md`.

---

## sops + age (MIT default)

Setup once:

```bash
# generate per-developer key
age-keygen -o ~/.config/sops/age/keys.txt
# public key prints; capture for .sops.yaml
```

`.sops.yaml`:

```yaml
creation_rules:
  - path_regex: infra/secrets/dev\.enc\.yaml$
    age: >-
      age1devkey...,age1ci-dev-key...
  - path_regex: infra/secrets/staging\.enc\.yaml$
    age: >-
      age1ci-staging-key...
  - path_regex: infra/secrets/prod\.enc\.yaml$
    age: >-
      age1ci-prod-key...
```

Encrypt:

```bash
sops -e -i infra/secrets/prod.enc.yaml
```

Decrypt in CI:

```bash
export SOPS_AGE_KEY="$(cat /run/secrets/ci_prod_age_key)"
sops -d infra/secrets/prod.enc.yaml > /tmp/prod.env
```

sops docs: https://github.com/getsops/sops
age docs: https://age-encryption.org

---

## Doppler

```bash
doppler login
doppler setup --project nexus --config prd
doppler secrets set DATABASE_URL=postgres://...
doppler run -- nexus server start
```

CI:

```bash
doppler run --token=$DOPPLER_TOKEN -- nexus deploy --env prod
```

Docs: https://docs.doppler.com

---

## 1Password Connect

```bash
op item create --category=login --title="prod-database" \
  url=postgres://... --vault=nexus-prod
```

Fetch at deploy:

```bash
op read "op://nexus-prod/prod-database/password"
```

Docs: https://developer.1password.com/docs/connect

---

## Cloud-native (AWS SM example)

```bash
aws secretsmanager create-secret \
  --name nexus/prod/database-url \
  --secret-string "postgres://..."
```

ECS task injects via env:

```json
{
  "secrets": [
    { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:...:secret:nexus/prod/database-url" }
  ]
}
```

Docs: https://docs.aws.amazon.com/secretsmanager/latest/userguide/

---

## Lifecycle

| Phase | Action |
|-------|--------|
| Generate | `openssl rand -base64 48` or backend-native. Never paste from chat. |
| Store | Encrypted backend only. Repo holds ciphertext or nothing. |
| Distribute | Pull at deploy. Never bake into image layers. |
| Use | Inject as env var. Avoid writing to disk; if you must, `tmpfs` only. |
| Audit | Log access. Backend provides this; review weekly. |
| Rotate | Quarterly minimum. After personnel change: immediately. After incident: same hour. |
| Revoke | Mark in backend, redeploy all consumers. |

---

## Never-in-repo policy

Pre-commit hook:

```bash
pip install detect-secrets
detect-secrets scan --baseline .secrets.baseline
pre-commit install
```

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks: [{ id: detect-secrets }]
  - repo: https://github.com/getsops/sops
    rev: v3.9.0
    hooks: [{ id: sops-encrypt, files: 'infra/secrets/.*\.yaml$' }]
```

Reject the PR if a secret appears in plain text. The merge bot (→ `docs/guides/merge-system.md`) will enforce this regardless.

---

## Kill-switch procedure

Compromised secret → execute in this order:

1. **Revoke at source.** Provider API: AWS IAM `delete-access-key`, Stripe rotate, etc.
2. **Rotate in backend.** Replace ciphertext with new value.
3. **Redeploy all consumers.** `nexus deploy --env prod --rotate-secrets`.
4. **Audit log.** Grep for last 30 days of usage of the compromised secret.
5. **Postmortem.** Within 48h. → runbook in `infra/runbooks/secret-rotation.md`.

If the leaked secret is a signing key (cert, keystore): treat as catastrophic. → `docs/guides/release/codesigning/` per-platform revocation steps.

---

## Per-env scope

| Secret | dev | staging | prod |
|--------|-----|---------|------|
| Stripe test key | yes | yes | no |
| Stripe live key | no | no | yes |
| Signing keys | no | release-only | release-only |
| OAuth client secret | dev app | staging app | prod app |
| Database password | dev DB | staging DB | prod DB |

Cross-env reuse is forbidden. The agent must refuse to copy a `prod` secret into `dev`.

---

## Cross-links

- CI/CD secret injection → `docs/guides/deploy/cicd.md`
- Env conventions → `docs/guides/deploy/environments.md`
- Signing keys → `docs/guides/release/codesigning/`
- Coder agent secret handling → `docs/specs/coder/architecture.md`
