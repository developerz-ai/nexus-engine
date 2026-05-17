<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Telemetry Pipeline

Production telemetry → OpenTelemetry collector → backend (Grafana LGTM default, Datadog/Honeycomb optional).

## Rule

- Every system emits OTel signals. No custom protocol.
- One collector address. The pipeline fans out.
- Always-on for errors. Sampled for events. Hard cap on bandwidth.

## Stack

```
┌─────────────┐   OTLP/gRPC   ┌──────────────┐   route   ┌─────────────────────┐
│ game client │ ───────────▶  │  collector   │ ────────▶ │ Tempo  (traces)     │
│  (engine)   │               │ (OTel)       │           │ Loki   (logs)       │
└─────────────┘               │              │           │ Mimir  (metrics)    │
                              │              │           │ GlitchTip (errors)  │
                              └──────────────┘           └─────────────────────┘
                                                                  │
                                                                  ▼
                                                              Grafana UI
```

Default backend: **Grafana LGTM** (Loki + Grafana + Tempo + Mimir). All Apache-2 / AGPL on server. MIT on client SDKs.

## Signal types

| Signal | When | Backend |
|--------|------|---------|
| trace  | per frame, per request | Tempo |
| metric | every 10s aggregate | Mimir |
| log    | structured (JSON) | Loki |
| error  | on emit | GlitchTip (`→ glitchtip.md`) |
| event  | gameplay (`→ analytics.md`) | PostHog |

## Engine spans (semconv)

| Span name | Attrs |
|-----------|-------|
| `game.frame`       | `frame.id`, `frame.dt_ms`, `frame.systems` |
| `gpu.pass`         | `pass.name`, `pass.duration_us`, `pass.drawcalls` |
| `physics.step`     | `physics.dt`, `physics.bodies`, `physics.contacts` |
| `script.tick`      | `script.lang`, `script.tick_ms` |
| `asset.load`       | `asset.id`, `asset.kind`, `asset.bytes` |
| `net.rpc`          | `rpc.system=nexus`, `rpc.method`, `rpc.latency_ms` |

Follows OTel semantic conventions where applicable; engine-specific spans namespaced `game.*`.

## Resource attrs (per process)

```
service.name        = mygame
service.version     = 1.0.4+build.214
service.instance.id = <ulid>
deployment.environment = stable|beta|canary
nexus.engine.version = 0.7.3
nexus.channel        = stable
nexus.platform.os    = linux
nexus.platform.gpu   = NVIDIA RTX 4070
```

## Sampling policy

| Signal | Sample rate | Override |
|--------|-------------|----------|
| error / fatal | 100% | never sampled out |
| panic / crash | 100% | — |
| span (frame)  | 1% / 0.1% mobile | bump to 100% when `error` parent |
| metric        | aggregated every 10s | always 100% |
| log info+     | 100% | — |
| log debug     | 0% prod, 100% canary | — |

Tail-based sampling at collector: keep any trace containing an error span at 100%.

## Collector config (skeleton)

```yaml
# infra/otel-collector/config.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  batch: { send_batch_size: 1024, timeout: 5s }
  memory_limiter: { limit_mib: 512, check_interval: 1s }
  tail_sampling:
    decision_wait: 30s
    policies:
      - { name: errors, type: status_code, status_code: { status_codes: [ERROR] } }
      - { name: latency, type: latency, latency: { threshold_ms: 100 } }
      - { name: sample, type: probabilistic, probabilistic: { sampling_percentage: 1 } }
  attributes/scrub:
    actions:
      - { key: client.address, action: delete }
      - { key: user.email,     action: delete }
exporters:
  otlphttp/tempo: { endpoint: http://tempo:4318 }
  otlphttp/loki:  { endpoint: http://loki:3100/otlp }
  prometheusremotewrite: { endpoint: http://mimir:9009/api/v1/push }
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter,attributes/scrub,tail_sampling,batch], exporters: [otlphttp/tempo] }
    metrics: { receivers: [otlp], processors: [memory_limiter,attributes/scrub,batch], exporters: [prometheusremotewrite] }
    logs:    { receivers: [otlp], processors: [memory_limiter,attributes/scrub,batch], exporters: [otlphttp/loki] }
```

## Engine config

```toml
[telemetry]
endpoint = "https://otlp.example.com:4317"
protocol = "grpc"
sampling.frame = 0.01
sampling.frame_mobile = 0.001
batch_max_bytes = 65536
flush_interval_ms = 5000
queue_max = 4096
drop_on_full = true        # never block the game loop
```

## Bandwidth cap

| Tier | Cap (avg / peak) |
|------|------------------|
| desktop stable | 4 KB/s avg, 32 KB/s peak |
| mobile cellular | 1 KB/s avg, 8 KB/s peak |
| canary | 16 KB/s avg, 128 KB/s peak |

Engine enforces. Drops oldest-first when over.

## Smoke test

```bash
nexus telemetry emit --span=game.frame --duration-us=16000
otelcol-contrib --config infra/otel-collector/config.yaml &
nexus telemetry tail | head
```

## Verify

```bash
# Grafana: explore Tempo, query { service.name="mygame" }
nexus telemetry verify --endpoint=$ENDPOINT
```

## Rollback

```bash
NEXUS_TELEMETRY_DISABLE=1 ./mygame
nexus config set telemetry.enabled false
```

## Vendor options

| Vendor | Drop-in? | Cost note |
|--------|----------|-----------|
| Grafana LGTM (self-host) | yes — default | infra only |
| Grafana Cloud | yes | free tier 50GB logs |
| Datadog | yes (OTel ingest) | $$$ — per-host pricing |
| Honeycomb | yes (OTel-native) | event-based |
| New Relic | yes (OTLP endpoint) | free 100GB/mo |

Adapter: swap `telemetry.endpoint` only. No code change.

## Cross-links

- `→ docs/guides/liveops/error-reporting.md`
- `→ docs/guides/liveops/analytics.md`
- `→ docs/guides/liveops/dashboards.md`
- `→ docs/guides/deploy/observability.md`
- `→ docs/specs/agent/telemetry.md` — schema source of truth

## References

- OpenTelemetry · `https://opentelemetry.io/`
- OTel semconv · `https://opentelemetry.io/docs/specs/semconv/`
- Grafana LGTM · `https://github.com/grafana/docker-otel-lgtm`
- Tail sampling · `https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor`

## Open

- `[BENCHMARK NEEDED]` Per-frame OTel span overhead vs raw atomic counters at 144 FPS.
