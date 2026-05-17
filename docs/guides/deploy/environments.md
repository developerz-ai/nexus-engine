<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Environments

Three envs, never two, never four. `dev` · `staging` · `prod`. Optional `preview` per-PR.

---

## Conventions

| Env | DNS | Branch | Promotion source | Auto-deploy |
|-----|-----|--------|-----------------|-------------|
| `dev` | `dev.example.com` | `develop` | `main` merges | yes |
| `preview` | `pr-<N>.preview.example.com` | per-PR | PR push | yes |
| `staging` | `staging.example.com` | `staging` | tagged build | yes |
| `prod` | `example.com` | `release/*` | staging soak ≥ 24h | manual approval |

Rules:
- No code goes to `prod` that didn't run in `staging` for ≥ 24h.
- `dev` may break. `staging` rebuilds nightly off `main`. `prod` rebuilds only on tag.
- `preview` env is throwaway: torn down on PR merge/close.

---

## Per-env config layering

Files in repo:

```
infra/env/
├── base.toml             # shared defaults
├── dev.toml              # overrides for dev
├── staging.toml          # overrides for staging
└── prod.toml             # overrides for prod
```

Merge order: `base` → `<env>` → env vars. Last writer wins.

Loaded at boot via `nexus-config` (→ `docs/specs/coder/architecture.md`):

```bash
NEXUS_ENV=staging nexus server start
```

---

## Secrets per env

Never share secrets across envs. Each env gets its own:
- API keys
- Database passwords
- Signing keys
- OAuth client IDs

Scope enforced by the secrets backend. → `docs/guides/deploy/secrets.md`.

Storage layout (`sops` example):

```
infra/secrets/
├── dev.enc.yaml          # encrypted, age-recipients = dev team
├── staging.enc.yaml      # encrypted, age-recipients = staging service account
└── prod.enc.yaml         # encrypted, age-recipients = prod KMS only
```

Decryption:

```bash
sops -d infra/secrets/prod.enc.yaml > /tmp/prod.env
```

Rotate after every personnel change. After rotation, redeploy all envs.

---

## Promotion flow

```
   PR push                 main merge            tag v1.2.3            manual gate
       │                        │                      │                     │
       ▼                        ▼                      ▼                     ▼
   preview env  ──>          dev env  ──>         staging env  ──>        prod env
   (auto)                    (auto)               (auto, soak 24h)        (approval)
```

Each arrow runs the CI pipeline. → `docs/guides/deploy/cicd.md`.

Promotion never copies binaries between envs blindly — rebuilds from the same source ref with the new env's config.

Exception: the **same artifact** is promoted across envs when the build is non-deterministic per env (e.g., signed installer). Then config is loaded at runtime.

---

## Per-env feature flags

Override flags per env without redeploy. Stored in the secrets backend or a flag service (Unleash, Flipt, LaunchDarkly).

```toml
# infra/env/staging.toml
[features]
new_matchmaker = true        # test in staging first
debug_overlay = true
```

```toml
# infra/env/prod.toml
[features]
new_matchmaker = false       # not ready yet
debug_overlay = false
```

---

## Smoke test per env

After every deploy. → `docs/guides/deploy/cicd.md` for the workflow.

```bash
nexus deploy smoke --env staging
```

Checks:
- `/healthz` → 200
- `/version` matches expected git SHA
- Lobby allocates a test match
- Telemetry endpoint receives a heartbeat within 30s

Fail → auto-rollback. → `docs/guides/deploy/cicd.md` rollback section.

---

## Rollback per env

```bash
nexus deploy rollback --env prod --to v1.2.2
```

Uses the previous artifact already on the target. No rebuild. Same secrets. Same config.

If schema migration was forward-incompatible, rollback requires a separate down-migration. Forward-only migrations make this safer.

---

## Cross-links

- Pipeline → `docs/guides/deploy/cicd.md`
- Secrets → `docs/guides/deploy/secrets.md`
- Targets → `docs/guides/deploy/targets/`
- Overview → `docs/guides/deploy/overview.md`
