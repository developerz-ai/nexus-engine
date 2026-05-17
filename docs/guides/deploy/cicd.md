<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — CI/CD

Pipeline shape: **build → sign → upload → smoke-test → promote**. Same shape on every CI provider.

---

## Prerequisites

| Item | Where |
|------|-------|
| Secrets backend wired into CI | → `docs/guides/deploy/secrets.md` |
| Deploy target configured | → `docs/guides/deploy/targets/<target>.md` |
| Signing certs in CI vault | → `docs/guides/release/codesigning/` |
| `nexus-cli` available on runner | `cargo install nexus-cli` |

---

## GitHub Actions — reusable workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:
    inputs:
      env:
        type: choice
        options: [dev, staging, prod]

permissions:
  contents: read
  id-token: write       # OIDC to cloud / fly / aws
  packages: write

concurrency:
  group: deploy-${{ inputs.env || 'dev' }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    outputs:
      artifact: ${{ steps.build.outputs.artifact }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - id: build
        run: |
          nexus build --release --artifact-out dist/
          echo "artifact=dist/server.tar.zst" >> $GITHUB_OUTPUT
      - uses: actions/upload-artifact@v4
        with:
          name: server-${{ github.sha }}
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-24.04
    environment: ${{ inputs.env || 'dev' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: server-${{ github.sha }}
          path: dist/
      - name: Decrypt secrets
        run: sops -d infra/secrets/${{ inputs.env }}.enc.yaml > $RUNNER_TEMP/env
      - name: Deploy
        run: nexus deploy --env ${{ inputs.env }} --artifact dist/server.tar.zst
      - name: Smoke test
        run: nexus deploy smoke --env ${{ inputs.env }} --timeout 90s
      - name: Rollback on failure
        if: failure()
        run: nexus deploy rollback --env ${{ inputs.env }}
```

Authoritative docs:
- GitHub Actions concurrency: https://docs.github.com/en/actions/using-jobs/using-concurrency
- OIDC to cloud: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect

---

## GitLab CI

`.gitlab-ci.yml`:

```yaml
stages: [build, deploy, smoke]

variables:
  CARGO_HOME: $CI_PROJECT_DIR/.cargo

build:
  stage: build
  image: rust:1-bookworm
  script:
    - cargo install nexus-cli --root /usr/local
    - nexus build --release --artifact-out dist/
  artifacts:
    paths: [dist/]
    expire_in: 7 days

.deploy-template:
  stage: deploy
  image: ghcr.io/nexus-engine/deploy-runner:latest
  script:
    - sops -d infra/secrets/$CI_ENVIRONMENT_NAME.enc.yaml > /tmp/env
    - nexus deploy --env $CI_ENVIRONMENT_NAME --artifact dist/server.tar.zst
    - nexus deploy smoke --env $CI_ENVIRONMENT_NAME --timeout 90s

deploy:staging:
  extends: .deploy-template
  environment: { name: staging, url: https://staging.example.com }
  only: [main]

deploy:prod:
  extends: .deploy-template
  environment: { name: prod, url: https://example.com }
  only: [tags]
  when: manual
```

GitLab docs: https://docs.gitlab.com/ee/ci/environments/

---

## Self-hosted runners

For privileged work (devkit builds, console SDKs, large caches).

| Use | Runner type | Why |
|-----|------------|-----|
| Console SDKs (NDA) | On-prem VM, no public network | NDA forbids cloud CI |
| macOS notarization | Mac Mini in a closet | Cheap, fast keychain access |
| Large Rust builds | Bare-metal Hetzner | sccache hit rate, parallel jobs |
| GPU testing | Self-hosted with NVIDIA | CI providers gate GPU |

Hardening:
- Ephemeral runners only (job-scoped VM, destroyed after).
- No `ACTIONS_RUNNER_ALLOW_RUNASROOT`.
- Repo allowlist on the runner pool.

GitHub self-hosted: https://docs.github.com/en/actions/hosting-your-own-runners
GitLab runners: https://docs.gitlab.com/runner/

---

## Pipeline shape (vendor-neutral)

```
checkout ─> deps cache ─> lint ─> test ─> build ─> sign ─> upload artifact
                                                                │
                                                                ▼
                                                       per-env deploy job
                                                                │
                                                                ▼
                                                          smoke test
                                                                │
                                                          pass / fail
                                                          │       │
                                                       promote  rollback
```

Every stage emits structured telemetry. → `docs/guides/deploy/observability.md`.

---

## Smoke test

After deploy, before declaring success.

```bash
nexus deploy smoke --env staging --timeout 90s
```

Default checks (override in `Nexus.toml`):
1. `GET /healthz` → 200 within 5s
2. `GET /version` matches deployed git SHA
3. Allocate a test lobby → succeeds
4. Telemetry heartbeat received within 30s
5. p99 latency on test endpoint < 300ms

Fail any → exit non-zero → CI triggers rollback.

---

## Rollback

```bash
nexus deploy rollback --env prod
nexus deploy rollback --env prod --to v1.2.2
```

Behavior:
- Re-points traffic to the previous artifact (already on the target).
- No rebuild, no download.
- Rollback ≤ 60s p99 on Fly/Railway/Render. AWS ECS ~ 3min.
- Schema migrations: forward-only by policy. If a down-migration is needed, ship it as a separate hotfix.

---

## Cross-links

- Per-target deploy commands → `docs/guides/deploy/targets/`
- Env conventions → `docs/guides/deploy/environments.md`
- Secrets in CI → `docs/guides/deploy/secrets.md`
- Observability → `docs/guides/deploy/observability.md`
- Release pipelines (client to stores) → `docs/guides/release/`
- Agent recipe → `docs/guides/deploy/agent-recipes.md`
