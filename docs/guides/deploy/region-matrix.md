<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy — Region Matrix

Place servers where players are. Latency budget depends on genre. → `docs/specs/networking/overview.md` for the underlying netcode tolerances.

---

## Latency budget per genre

| Genre | Acceptable RTT | Painful RTT | Notes |
|-------|---------------|-------------|-------|
| Fighting (frame-perfect) | ≤ 50 ms | > 80 ms | Rollback netcode tolerates more; still tight |
| FPS competitive | ≤ 60 ms | > 100 ms | CS-tier. RTT > 100 = lost market |
| FPS casual / TPS | ≤ 100 ms | > 150 ms | |
| Battle royale | ≤ 120 ms | > 200 ms | 100-player tick lowered |
| MOBA | ≤ 80 ms | > 120 ms | Dota/LoL tolerance band |
| RTS | ≤ 150 ms | > 300 ms | Lockstep can hide latency |
| MMORPG | ≤ 200 ms | > 400 ms | Client prediction masks |
| Turn-based / async | n/a | n/a | Use serverless edge |
| Co-op PvE | ≤ 150 ms | > 250 ms | |
| Racing | ≤ 80 ms | > 120 ms | |

→ Rollback netcode spec: `docs/specs/networking/rollback.md`.

---

## Recommended regions per player base

| Player concentration | Primary regions | Secondary | Tertiary |
|---------------------|----------------|-----------|----------|
| North America | `iad` (Virginia), `lax` (LA) | `dfw` (Dallas), `ord` (Chicago) | `sea` (Seattle), `yyz` (Toronto) |
| Europe | `fra` (Frankfurt), `lhr` (London) | `ams`, `cdg`, `arn` (Stockholm) | `mad`, `waw` |
| Asia-Pacific | `nrt` (Tokyo), `sin` (Singapore) | `hkg`, `syd`, `icn` (Seoul) | `bom` (Mumbai), `cgk` (Jakarta) |
| Oceania | `syd` | `mel` | — |
| South America | `gru` (São Paulo) | `eze` (Buenos Aires) | `scl` (Santiago) |
| Africa | `jnb` (Johannesburg) | `cpt` (Cape Town) | Limited; consider edge proxy to `fra` |
| Middle East | `dxb` (Dubai), `ruh` (Riyadh) | — | Limited provider footprint |
| China mainland | `pek`, `pvg`, `sha` | — | Requires ICP license; use partner clouds (Aliyun, Tencent) |

Provider availability differs. Cross-reference target docs:
- Fly regions: https://fly.io/docs/reference/regions/
- AWS regions: https://docs.aws.amazon.com/about-aws/global-infrastructure/regions_az/
- GCP regions: https://cloud.google.com/about/locations
- Azure regions: https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/
- Hetzner: 5 regions (Falkenstein, Nuremberg, Helsinki, Hillsboro, Singapore)

---

## Sample placements

### Indie shooter, NA + EU launch

```toml
[deploy.envs.prod]
regions = ["iad", "lax", "fra"]
```

Covers ~85% of typical Steam launches with 3 regions. Add `syd` if marketing in AU/NZ.

### Global RPG / co-op

```toml
[deploy.envs.prod]
regions = ["iad", "fra", "nrt", "syd", "gru"]
```

5 regions, p95 RTT < 150ms globally for the target genres.

### Fighting game (frame-tight)

```toml
[deploy.envs.prod]
regions = ["iad", "lax", "ord", "fra", "lhr", "nrt", "syd", "gru"]
```

8+ regions because tolerance is < 50ms. Matchmaker pins to nearest region.

### Async / turn-based

```toml
[deploy.envs.prod]
regions = ["edge"]              # Cloudflare Workers or Vercel Edge
```

One config, runs in 300+ POPs.

---

## Matchmaker region pinning

`nexus-server` exposes per-match region selection:

```rust
// pseudocode — actual API in docs/specs/networking/lobby.md
matchmaker.queue(player, MatchPrefs {
    max_rtt_ms: 80,
    preferred_regions: ["iad", "ord"],
});
```

Default behavior: pin to lowest-RTT region for all queued players. Fall back to next-best if pool empty for > N seconds.

---

## Cross-region failover

| Strategy | Use when |
|----------|---------|
| Anycast (Fly machines, Cloudflare) | Stateless or session-local state |
| Active-active with Postgres logical replication | Read-heavy |
| Active-passive with promote-on-failure | RPO/RTO tolerant |
| Per-region shards with no replication | High-write, isolated user pools |

For game servers specifically: matches are ephemeral. Failover = re-allocate on healthy region. Lost match acceptable; lost player session not.

---

## China & sanctioned regions

| Issue | Solution |
|-------|---------|
| ICP license for `.cn` | Partner with local publisher; or skip China |
| GFW interference with non-CN endpoints | Use Tencent CloudBase / Alibaba Cloud inside China |
| Sanctioned regions (per US Treasury OFAC) | Geo-block at edge; do not deploy |
| Russia (post-2022) | Most providers withdrew; geo-block or partner |

[VERIFY — sanctions regimes change. Check current OFAC list before launch.]
Authoritative: https://ofac.treasury.gov/sanctions-programs-and-country-information

---

## Cross-links

- Per-target region availability → `docs/guides/deploy/targets/`
- Latency tolerances per netcode model → `docs/specs/networking/`
- Cost per region → `docs/guides/deploy/cost-model.md`
- Lobby/matchmaking pinning → `docs/specs/networking/lobby.md`
