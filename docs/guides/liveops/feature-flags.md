<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Feature Flags

Change behavior without a release. Server-side and client-side. GrowthBook (MIT) default.

## Rule

- Every risky code path is behind a flag. Default off.
- Flags expire. Stale flags = tech debt; CI warns at 90 days.
- Flags are typed. Schema in repo.
- Evaluation happens client-side from a synced ruleset — no per-call network round-trip.

## Default provider: GrowthBook (MIT)

```yaml
# infra/growthbook/docker-compose.yml
services:
  mongo: { image: mongo:7, volumes: [mongo:/data/db] }
  growthbook:
    image: growthbook/growthbook:latest
    ports: ["3000:3000","3100:3100"]
    environment:
      MONGODB_URI: mongodb://mongo:27017/growthbook
      APP_ORIGIN:  https://flags.example.com
      API_HOST:    https://flags.example.com:3100
    depends_on: [mongo]
volumes: { mongo: {} }
```

```bash
docker compose -f infra/growthbook/docker-compose.yml up -d
```

## Flag schema

```
game/flags/flags.toml
```

```toml
[[flag]]
key = "new_inventory_ui"
type = "bool"
default = false
owner = "ui-team"
expires = "2026-07-01"
description = "Roll out new grid inventory"

[[flag]]
key = "shadow_quality"
type = "enum"
values = ["low","medium","high","ultra"]
default = "medium"
expires = "2026-12-31"

[[flag]]
key = "enemy_spawn_rate"
type = "number"
default = 1.0
min = 0.0
max = 3.0
```

CI fails if a flag is read by code but not declared here.

## Engine API

```rust
if nexus::flags::bool("new_inventory_ui").value() {
    show_grid_inventory();
} else {
    show_list_inventory();
}

let q = nexus::flags::enum_("shadow_quality").value();
renderer.set_shadow_quality(q);

let rate = nexus::flags::number("enemy_spawn_rate").value();
spawner.set_rate(rate);
```

Every call logs an exposure event (sampled).

## Client-side evaluation

```toml
[flags]
provider     = "growthbook"
endpoint     = "https://flags.example.com:3100/api/features/${CLIENT_KEY}"
sync_interval_s = 300
sticky_bucketing = true
attributes_provider = "scripts/flags/attrs.lua"
```

Engine downloads ruleset every `sync_interval_s`. Evaluation is local — 0 ms per flag read.

## Bucketing attributes

```lua
-- scripts/flags/attrs.lua
return {
  player_hash = nexus.player.hash(),
  country     = nexus.geo.country(),
  channel     = nexus.release.channel(),
  engine_ver  = nexus.engine.version(),
  game_ver    = nexus.game.version(),
  platform    = nexus.platform.os(),
  cohort      = nexus.player.cohort()        -- e.g. "d0_2026_05_17"
}
```

GrowthBook hashes `player_hash` → consistent bucket across sessions.

## Server-side flags

Same SDK on the game server. Use for backend behavior:

```rust
if nexus::flags::bool("rate_limit_strict").value_for(player_attrs) {
    rate_limit.set(60);
} else {
    rate_limit.set(120);
}
```

## Exposure events

```json
{
  "event": "$feature_flag_called",
  "flag":  "new_inventory_ui",
  "variant": true,
  "player_hash": "...",
  "ts": "...",
  "context": { "channel": "canary" }
}
```

Sent to analytics (`→ analytics.md`). Required for A/B significance (`→ ab-testing.md`).

## Kill switch

```bash
nexus flags set new_inventory_ui false --everywhere     # < 60s propagation
nexus flags kill new_inventory_ui                        # disables flag, forces default
```

## Vendor alternatives

| Provider | License | Self-host | Notes |
|----------|---------|-----------|-------|
| GrowthBook | MIT | yes | default |
| Unleash | Apache 2 | yes | strong gradual rollout |
| LaunchDarkly | proprietary | no | best UI, $$$ |
| ConfigCat | proprietary | partial | cheap |
| Flagsmith | BSD-3 | yes | clean UI |
| OpenFeature | spec only | n/a | adapter target |

Engine speaks OpenFeature. Any provider plugs in.

## Smoke test

```bash
nexus flags get new_inventory_ui --attrs='{"player_hash":"abc"}'
nexus flags evaluate-all --attrs='{"channel":"canary"}'
```

## Verify

```bash
nexus flags list --stale          # flags past expires
nexus flags coverage              # % of flag reads to declarations
```

## Rollback

```bash
nexus flags revert new_inventory_ui --to=<sha>
nexus flags freeze                # halt new flag changes (incident)
```

## Cleanup

CI step:

```bash
nexus flags audit
# warns: 4 flags older than 90 days, 1 flag read in code but unset for 30 days
```

## Cross-links

- `→ docs/guides/liveops/ab-testing.md`
- `→ docs/guides/liveops/remote-config.md` — numeric tuning
- `→ docs/guides/liveops/canary-and-rollback.md`
- `→ docs/guides/liveops/analytics.md`

## References

- GrowthBook · `https://docs.growthbook.io/`
- OpenFeature · `https://openfeature.dev/`
- LaunchDarkly · `https://docs.launchdarkly.com/`
- Unleash · `https://docs.getunleash.io/`
- Facebook gatekeeper · `https://engineering.fb.com/2017/08/31/web/rapid-release-at-massive-scale/`

## Open

- `[DECISION NEEDED]` Default stale-flag policy: 90 days warn, 180 days hard error in CI.
