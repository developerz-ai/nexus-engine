<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Gameplay Analytics

Funnels, retention, monetization. PostHog OSS default. Mixpanel / Amplitude as adapters.

## Rule

- Events are typed. Schema lives in the repo.
- Player ID is `player_hash` (opaque). Never raw account ID.
- Server-side ingest preferred. Client ingest only for offline play.
- Sample = 100% by default; cap by event budget per session.

## Default events

| Event | When | Required props |
|-------|------|----------------|
| `session_start` | game launched | `os`, `version`, `channel` |
| `session_end`   | clean exit | `duration_s`, `crashed` |
| `level_enter`   | scene loaded | `level`, `attempt` |
| `level_complete`| win | `level`, `time_s`, `deaths` |
| `level_fail`    | die / quit | `level`, `cause`, `time_s` |
| `tutorial_step` | each step | `step_id`, `attempt` |
| `purchase`      | IAP done | `sku`, `amount_cents`, `currency`, `paywall_id` |
| `ad_impression` | ad shown | `placement`, `network` |
| `ad_reward`     | reward claimed | `placement`, `reward_id` |
| `feature_used`  | flag fired | `flag`, `variant` |
| `error_seen`    | non-fatal toast | `code`, `surface` |

`→ docs/specs/agent/telemetry.md` for full schema.

## Schema in repo

```
game/analytics/events.toml
```

```toml
[[event]]
name = "level_complete"
required = ["level","time_s","deaths"]
optional = ["used_hint","loadout"]
sample   = 1.0
pii      = false

[[event]]
name = "purchase"
required = ["sku","amount_cents","currency","paywall_id"]
sample   = 1.0
server_validated = true
```

CI fails build if engine emits an event not declared here.

## Funnels (out of the box)

| Funnel | Steps |
|--------|-------|
| Onboarding | install → first_launch → tutorial_done → first_level_complete |
| Monetization | paywall_shown → paywall_clicked → purchase_started → purchase_complete |
| Retention | D1 / D7 / D30 active |
| Engagement | session_start → 3 levels → session_end > 10min |

Dashboards ship pre-built. `→ docs/guides/liveops/dashboards.md`

## PostHog OSS (default)

```yaml
# infra/posthog/docker-compose.yml
# upstream: https://posthog.com/docs/self-host
```

```bash
git clone https://github.com/posthog/posthog && cd posthog
docker compose -f docker-compose.hobby.yml up -d
```

`Nexus.toml`:

```toml
[analytics]
backend  = "posthog"
endpoint = "https://posthog.example.com"
api_key  = "${POSTHOG_API_KEY}"
flush_interval_ms = 5000
queue_max = 256
```

## Mixpanel / Amplitude (vendor)

```toml
[analytics]
backend = "mixpanel"     # or "amplitude"
project_token = "${MIXPANEL_TOKEN}"
```

Adapter normalizes engine event → vendor event. Property names preserved.

## Server-side ingest

```
client → game server → analytics backend
```

Server validates `purchase` events against the store receipt before forwarding. Stops client-side fraud.

## Privacy

| Rule | Default |
|------|---------|
| Player ID | `sha256(account_id + game_salt)` |
| IP | dropped at collector |
| Email | never |
| Country | from server-side IP, IP then dropped |
| COPPA mode | all analytics off |

`→ docs/guides/liveops/privacy.md`

## Smoke test

```bash
nexus analytics emit --event=level_complete --props='{"level":"1","time_s":42,"deaths":0}'
```

## Verify

```bash
nexus analytics tail | head
# or in PostHog UI: Live events → see the event
```

## Rollback

```bash
nexus config set analytics.enabled false
NEXUS_ANALYTICS_DISABLE=1 ./mygame
```

## Cost

| Backend | Free tier | Note |
|---------|-----------|------|
| PostHog OSS self-host | unlimited | infra only |
| PostHog Cloud | 1M events/mo | $0 |
| Mixpanel | 1M events/mo | $0 |
| Amplitude | 10M events/mo | $0 |

## Cross-links

- `→ docs/guides/liveops/dashboards.md`
- `→ docs/guides/liveops/ab-testing.md` — variant attribution
- `→ docs/guides/liveops/feature-flags.md`
- `→ docs/specs/agent/telemetry.md`

## References

- PostHog docs · `https://posthog.com/docs`
- Mixpanel docs · `https://docs.mixpanel.com/`
- Amplitude docs · `https://amplitude.com/docs`
- GA4 events · `https://support.google.com/analytics/answer/9322688`

## Open

- `[DECISION NEEDED]` Default event budget per session (events/min).
