<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# GlitchTip — The MIT Default

Sentry-wire-compatible. MIT licensed. Self-host. Drop-in for any Sentry SDK.

## Why default

| Reason | Detail |
|--------|--------|
| License | MIT — aligns with Nexus license-forever pledge |
| Wire compat | Accepts Sentry envelope unmodified → existing SDKs work |
| Footprint | One Postgres + Django + Celery. Fits 1 VPS. |
| Cost | $0 self-host. Hosted plan exists for those who want it. |
| Lock-in | None. Migrate to/from Sentry by swapping DSN. |

`nexus new` scaffolds a GlitchTip docker-compose by default. Override with `--diag=sentry` / `--diag=bugsnag`.

## Self-host recipe (docker-compose)

```yaml
# infra/glitchtip/docker-compose.yml
version: "3.8"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: glitchtip
      POSTGRES_USER: glitchtip
      POSTGRES_PASSWORD: ${PG_PASS}
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: valkey/valkey:7
  web:
    image: glitchtip/glitchtip:latest
    depends_on: [postgres, redis]
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgres://glitchtip:${PG_PASS}@postgres/glitchtip
      SECRET_KEY: ${SECRET_KEY}
      PORT: "8000"
      EMAIL_URL: ${EMAIL_URL}
      GLITCHTIP_DOMAIN: https://errors.example.com
      DEFAULT_FROM_EMAIL: errors@example.com
      CELERY_WORKER_AUTOSCALE: "1,3"
  worker:
    image: glitchtip/glitchtip:latest
    depends_on: [postgres, redis]
    command: ./bin/run-celery-with-beat.sh
    environment:
      DATABASE_URL: postgres://glitchtip:${PG_PASS}@postgres/glitchtip
      SECRET_KEY: ${SECRET_KEY}
volumes: { pgdata: {} }
```

```bash
docker compose -f infra/glitchtip/docker-compose.yml up -d
# initial superuser
docker compose exec web ./manage.py createsuperuser
```

## Engine config

```toml
[diag]
backend = "sentry"               # GlitchTip = Sentry wire
[diag.sentry]
dsn = "https://<key>@errors.example.com/<project_id>"
release = "${GAME_NAME}@${GAME_VERSION}+${BUILD_SHA}"
environment = "${NEXUS_CHANNEL}"
traces_sample_rate = 0.05
```

No code change vs Sentry — DSN host swaps.

## Symbol upload

GlitchTip supports debug files via Sentry CLI:

```bash
SENTRY_URL=https://errors.example.com \
  sentry-cli debug-files upload --include-sources target/release/
SENTRY_URL=https://errors.example.com \
  sentry-cli sourcemaps upload --release "$RELEASE" web/dist/
```

## Smoke test

```bash
nexus diag emit --kind=panic --to=sentry \
  --dsn="https://<key>@errors.example.com/<project_id>"
curl -sf https://errors.example.com/api/0/  # 401 = up
```

## Verify

UI: `https://errors.example.com/<org>/<project>/issues/` — new issue visible <30s.

## Backup

```bash
docker compose exec postgres pg_dump -U glitchtip glitchtip \
  | gzip > glitchtip-$(date +%F).sql.gz
```

Store off-host. `→ docs/guides/deploy/observability.md` for retention policy.

## Rollback

```bash
docker compose down              # zero data loss; pgdata volume persists
nexus config set diag.enabled false
```

## Migration paths

| From → To | Steps |
|-----------|-------|
| Sentry SaaS → GlitchTip | Stand up GlitchTip, swap DSN, re-upload current release symbols |
| GlitchTip → Sentry | Reverse. Both speak the same wire format. |
| Bugsnag → GlitchTip | Switch adapter `nexus add observability sentry`, swap DSN |

## Cost

| Mode | Cost |
|------|------|
| Self-host (1 VPS, 100k events/mo) | ~$10/mo VPS |
| Hosted glitchtip.com | from $15/mo |

## Cross-links

- `→ docs/guides/liveops/error-reporting.md`
- `→ docs/guides/liveops/symbol-upload.md`
- `→ docs/guides/liveops/sentry.md` — same wire format
- `→ docs/guides/deploy/observability.md`

## References

- GlitchTip docs · `https://glitchtip.com/documentation`
- GlitchTip source (MIT) · `https://gitlab.com/glitchtip/`
- Sentry envelope spec · `https://develop.sentry.dev/sdk/envelopes/`

## Open

- `[VERIFY — provider policy changes]` GlitchTip Sentry-wire parity changes.
