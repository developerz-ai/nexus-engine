<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — Agones

Open-source Kubernetes operator for dedicated game-server fleets. Runs on any K8s — GKE, EKS, AKS, DOKS, K3s, kind. **The MIT-spirit alternative to AWS GameLift.**

→ Overview: `docs/guides/deploy/overview.md`. Use with `docs/guides/deploy/targets/{gcp,aws,azure,digitalocean,hetzner,self-host}.md`.

---

## What Agones provides

| | |
|--|--|
| `GameServer` CRD | Per-match-instance lifecycle: scheduled → ready → allocated → shutdown |
| `Fleet` | Pool of game servers with desired replica count |
| `GameServerAllocation` | Atomic "give me a ready server now" |
| `FleetAutoscaler` | Buffer-based or webhook autoscale |
| SDK (Go/C++/Rust/C#/Node/etc.) | In-server lib to call Ready/Allocate/Shutdown/Health |
| Counters & Lists (1.32+) | Per-server slot/player counters for richer allocation |

Docs: https://agones.dev/site/docs/
Repo: https://github.com/googleforgames/agones (Google + community, Apache-2.0)

---

## Prerequisites

| Item | |
|------|--|
| Kubernetes cluster (1.29+) | Any provider |
| `kubectl` + `helm` | |
| Nexus game-server image, statically linked, exposes UDP | → `docs/specs/networking/transport.md` |

---

## Install

```bash
helm repo add agones https://agones.dev/chart/stable
helm repo update
helm upgrade --install agones agones/agones \
  --namespace agones-system --create-namespace \
  --set "gameservers.namespaces={default}" \
  --version 1.46.0
```

Verify:

```bash
kubectl get pods -n agones-system
kubectl explain gameserver
```

---

## Fleet definition

`infra/agones/fleet.yaml`:

```yaml
apiVersion: agones.dev/v1
kind: Fleet
metadata:
  name: nexus-gs
  namespace: default
spec:
  replicas: 10
  scheduling: Packed                # Packed for binpacking, Distributed for spread
  strategy: { type: RollingUpdate, rollingUpdate: { maxSurge: 25%, maxUnavailable: 25% } }
  template:
    spec:
      ports:
        - name: game
          portPolicy: Dynamic       # Dynamic | Static | Passthrough
          containerPort: 7777
          protocol: UDP
      health:
        initialDelaySeconds: 5
        periodSeconds: 5
        failureThreshold: 3
      sdkServer:
        logLevel: Info
        grpcPort: 9357
        httpPort: 9358
      template:
        spec:
          containers:
            - name: server
              image: ghcr.io/your-org/nexus-game-server:GIT_SHA
              resources:
                requests: { cpu: "500m", memory: "512Mi" }
                limits:   { cpu: "1",    memory: "1Gi"   }
              env:
                - { name: NEXUS_ENV, value: prod }
```

Apply:

```bash
kubectl apply -f infra/agones/fleet.yaml
kubectl get fleet nexus-gs
kubectl get gameservers
```

---

## In-server SDK calls

Game server **must** signal lifecycle. Pseudocode (Rust binding):

```rust
let sdk = agones::Sdk::new().await?;
// boot work...
sdk.ready().await?;                   // tell Agones we're available
sdk.health_check_loop(Duration::from_secs(2));

// on allocation (from outside), serve match...
match_loop().await;

sdk.shutdown().await?;                // we're done, pod will terminate
```

SDK references: https://agones.dev/site/docs/guides/client-sdks/
Rust SDK is community; Go/C++/C#/Node are first-party. Nexus ships a thin Rust wrapper in `nexus-server-sdk`.

→ Integration spec: `docs/specs/networking/lobby.md`.

---

## Allocation (matchmaker → server)

`infra/agones/allocation.yaml`:

```yaml
apiVersion: allocation.agones.dev/v1
kind: GameServerAllocation
spec:
  selectors:
    - matchLabels: { agones.dev/fleet: nexus-gs }
      gameServerState: Ready
  metadata:
    labels: { match-id: "m_7a3" }
```

Programmatic:

```go
allocation, err := agonesClient.AllocationV1().GameServerAllocations("default").Create(ctx, alloc, metav1.CreateOptions{})
// allocation.Status.Address  -> "192.0.2.10"
// allocation.Status.Ports[0].Port -> 31234
```

REST/gRPC alloc service (preferred in production): https://agones.dev/site/docs/advanced/allocator-service/

---

## Autoscaler

`infra/agones/autoscaler.yaml`:

```yaml
apiVersion: autoscaling.agones.dev/v1
kind: FleetAutoscaler
metadata: { name: nexus-gs-as }
spec:
  fleetName: nexus-gs
  policy:
    type: Buffer
    buffer:
      bufferSize: 5                  # always keep 5 Ready servers
      minReplicas: 5
      maxReplicas: 200
```

Webhook policy for custom scaling: https://agones.dev/site/docs/reference/fleetautoscaler/

---

## Counters / Lists (1.32+)

Per-server capacity hints:

```yaml
# in Fleet spec.template.spec
counters:
  players:
    count: 0
    capacity: 16
lists:
  rooms:
    capacity: 4
```

Allocate against capacity:

```yaml
priorities:
  - type: Counter
    key: players
    order: Ascending
```

Docs: https://agones.dev/site/docs/guides/counters-and-lists/

---

## Per-cloud notes

| Cluster | Setup | UDP exposure |
|---------|-------|--------------|
| GKE | Native, easiest | NodePort on node external IP works; HostPort for static |
| EKS | Works; ensure node SG opens UDP port range | NLB optional for entrypoint |
| AKS | Works; load balancer SKU `Standard` | |
| DOKS | Works; LB pricing reasonable | |
| K3s self-host | Works; configure metallb for LB IPs | Open firewall to node port range |

Authoritative cluster-by-cluster: https://agones.dev/site/docs/installation/creating-cluster/

---

## CI/CD

```yaml
- run: |
    sed -i "s/GIT_SHA/$GITHUB_SHA/" infra/agones/fleet.yaml
    kubectl apply -f infra/agones/fleet.yaml
    kubectl rollout status fleet/nexus-gs --timeout=10m
```

Agones rolling update drains Ready servers first, leaves Allocated alone until matches end.

---

## Smoke test

```bash
kubectl get fleet nexus-gs -o wide
kubectl get gameservers -l agones.dev/fleet=nexus-gs

# allocate a test server
kubectl apply -f infra/agones/allocation.yaml
kubectl get gameserverallocations
```

---

## Rollback

```bash
kubectl rollout undo fleet/nexus-gs
```

Or re-apply prior YAML.

---

## Cost note

Agones itself is free. Cost = underlying K8s + node compute.

Reference (100k MAU, ~1700 concurrent):
- Nodes: ~110 game-server pods @ 1 CPU each → 30 nodes × `n2-standard-4` ≈ $4,000/mo on GCP
- Same workload on Hetzner CCX33 ×30 ≈ €900/mo
- Same on EKS m6i.xlarge ×30 + NAT ≈ $4,500/mo

Pair with cheaper infra. → `docs/guides/deploy/targets/hetzner.md`.

---

## Pitfalls

- **Port-range exposure.** Dynamic port policy needs the node's external IP and an open UDP port range (default 7000-8000). Make sure cloud firewalls and node-level iptables allow this.
- **Allocation latency** at scale: use the Allocator Service, not the K8s API directly.
- **SDK sidecar resource overhead** is small but real (~50 MB RAM per pod).
- **Counters/Lists are alpha-graduated**; check version skew before relying.
- **Custom dashboards needed.** Grafana with Prometheus metrics from Agones. → `docs/guides/deploy/observability.md`.

---

## When Agones wins over GameLift

| Reason | |
|--------|--|
| Multi-cloud or self-host | GameLift is AWS-only |
| MIT/Apache stack | Open all the way down |
| Full control of allocation logic | Custom webhooks |
| Cost at scale (vs GameLift markup) | Pay only for compute |

When GameLift wins:
- FlexMatch out-of-box matchmaking
- AWS-exclusive infra
- Buyer wants a single AWS bill

---

## Cross-links

- Underlying clusters → `docs/guides/deploy/targets/{aws,gcp,azure,digitalocean,hetzner,self-host}.md`
- Networking spec → `docs/specs/networking/`
- Lobby + matchmaking → `docs/specs/networking/lobby.md`
- Observability → `docs/guides/deploy/observability.md`
