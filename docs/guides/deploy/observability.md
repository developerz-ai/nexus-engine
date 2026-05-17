<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Observability

Logs · metrics · traces. OpenTelemetry first. Vendor-portable. → `docs/specs/agent/telemetry.md` for the in-engine schema.

---

## Stack choices

| Backend | Logs | Metrics | Traces | Free tier | Best for |
|---------|------|---------|--------|-----------|----------|
| Grafana Cloud | Loki | Mimir | Tempo | 10k series, 50GB logs | Cost-conscious OSS-aligned |
| Self-hosted Grafana | Loki | Mimir/Prometheus | Tempo | Free, your boxes | Sovereignty |
| Datadog | yes | yes | yes | none | Enterprise budget, fast onboarding |
| Honeycomb | events | from events | yes | 20M events | High-cardinality debugging |
| AWS CloudWatch | yes | yes | X-Ray | small | AWS-native |
| GCP Cloud Ops | yes | yes | Trace | small | GCP-native |

Nexus does not pick. Set the OTLP endpoint and go.

---

## OTel collector (vendor-neutral)

Deploy one collector per region. Game server → local collector → backend.

`infra/otel/collector.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_percentage: 75
  resource:
    attributes:
      - key: service.namespace
        value: nexus
        action: upsert

exporters:
  otlphttp/grafana:
    endpoint: ${env:OTLP_ENDPOINT}
    headers:
      authorization: Basic ${env:OTLP_AUTH}
  prometheus:
    endpoint: 0.0.0.0:9090

service:
  pipelines:
    logs:    { receivers: [otlp], processors: [memory_limiter, resource, batch], exporters: [otlphttp/grafana] }
    metrics: { receivers: [otlp], processors: [memory_limiter, resource, batch], exporters: [otlphttp/grafana, prometheus] }
    traces:  { receivers: [otlp], processors: [memory_limiter, resource, batch], exporters: [otlphttp/grafana] }
```

OTel collector docs: https://opentelemetry.io/docs/collector/configuration/

Run:

```bash
docker run -d --name otelcol \
  -p 4317:4317 -p 4318:4318 \
  -v $PWD/collector.yaml:/etc/otelcol/config.yaml \
  -e OTLP_ENDPOINT=$OTLP_ENDPOINT \
  -e OTLP_AUTH=$OTLP_AUTH \
  otel/opentelemetry-collector-contrib:latest
```

---

## Game-server instrumentation

Nexus server emits OTel by default (→ `docs/specs/agent/telemetry.md`):

```toml
# Nexus.toml
[observability]
otlp_endpoint = "http://localhost:4317"
service_name = "nexus-game-server"
sample_rate = 0.1                # 10% of traces
log_level = "info"
metrics_interval = "10s"
```

Per-frame metrics (always emitted):
- `nexus_frame_duration_ms{percentile}` — p50/p95/p99/p999
- `nexus_entities_active`
- `nexus_systems_duration_ms{system}`
- `nexus_network_rtt_ms{peer}`
- `nexus_net_bytes{dir}` — in/out
- `nexus_memory_bytes{system}`

Player-session traces:
- session.start → match.allocate → match.tick (sampled) → match.end

---

## Logs

Structured JSON only. → `docs/specs/coder/architecture.md`.

```json
{"ts":"2026-05-17T14:22:01Z","lvl":"info","svc":"lobby","match_id":"m_7a3","event":"allocated","region":"iad","players":8}
```

Loki query example:

```logql
{service="lobby"} | json | match_id="m_7a3"
```

Datadog: same JSON ingested via the datadog-agent. https://docs.datadoghq.com/logs/

---

## Alerts

Minimum SLO alerts per env:

| Alert | Condition | Severity |
|-------|-----------|----------|
| API 5xx rate | `> 1% over 5m` | page |
| Frame budget breach | `p99 frame_ms > 16` for 5m | page (prod) |
| Match allocation failure | `> 5% failures over 5m` | page |
| Region down | no heartbeat 60s | page |
| Disk > 85% | sustained 10m | warn |
| Cert expiring | < 14 days | warn |
| Deploy smoke failed | any | page |

Routing: PagerDuty, Opsgenie, Discord webhook for indie. Avoid email-only — too slow.

---

## SLOs

| Service | SLI | SLO | Window |
|---------|-----|-----|--------|
| Lobby | match allocation success | 99.5% | 28d rolling |
| Game server | frame budget (p99 ≤ 16ms) | 99% | 28d rolling |
| Web frontend | TTFB | p95 < 200ms | 28d rolling |
| Telemetry ingest | accepted events | 99.9% | 7d rolling |

Error budget = `1 - SLO`. Burn rate alerts at 2× and 10× budget consumption.

Google SRE SLO workbook: https://sre.google/workbook/implementing-slos/

---

## On-call

Even a solo dev gets paged. Use PagerDuty free (1 user) or self-host Grafana OnCall.

Rotation template (small team):

| Week | Primary | Secondary |
|------|---------|-----------|
| W1 | A | B |
| W2 | B | C |
| W3 | C | A |

Runbook per alert in `infra/runbooks/<alert-name>.md`. Linked from the alert payload.

---

## Cost notes

| Stack | 1k MAU | 100k MAU | 10M MAU |
|-------|--------|----------|---------|
| Grafana Cloud Free | $0 | likely overage ~$50 | ~$2k+ |
| Self-hosted (Hetzner CX22 x3) | ~$15 | ~$60 | ~$500 |
| Datadog | ~$15 | ~$1.5k | ~$50k+ |
| Honeycomb | $0 | ~$500 | ~$10k+ |

Numbers approximate, May 2026. Verify on provider pricing pages.

---

## Cross-links

- In-engine telemetry → `docs/specs/agent/telemetry.md`
- CI/CD → `docs/guides/deploy/cicd.md`
- Secrets (OTLP auth) → `docs/guides/deploy/secrets.md`
- Cost detail → `docs/guides/deploy/cost-model.md`
