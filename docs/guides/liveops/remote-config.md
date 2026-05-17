<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Remote Config

Tuning values without a release. Versioned. Reversible. Schema-checked.

## Rule

- Config is typed. Schema lives in repo. Server rejects unknown keys.
- Every change is a commit. PR-reviewed by nexus-merge.
- Clients pin a config version per session — config never changes mid-session unless `hot_reload = true`.
- All numeric ranges declared. Server clamps before serving.

## What goes in remote config

| Category | Examples |
|----------|----------|
| Economy  | drop rates, price multipliers, currency conversion |
| Balance  | enemy HP/DMG, weapon damage, ability cooldowns |
| Pacing   | tutorial step timeouts, hint timing |
| UI       | text variants, button copy, paywall layout id |
| Difficulty | spawn rate, AI aggressiveness |
| Networking | tick rate, interpolation buffer, max snapshot age |

What does NOT go here: feature toggles (`→ feature-flags.md`), assets (`→ live-content.md`), variants (`→ ab-testing.md`).

## Schema

```
game/config/schema.toml
```

```toml
[[entry]]
key = "balance.weapon.pistol.damage"
type = "number"
default = 25
min = 1
max = 200
hot_reload = false        # take effect next match

[[entry]]
key = "economy.drop_table.boss_loot"
type = "json"
default_file = "config/default/boss_loot.json"
schema_file  = "config/schema/boss_loot.schema.json"
hot_reload = false

[[entry]]
key = "ui.paywall.layout_id"
type = "string"
default = "v1"
hot_reload = true         # apply immediately on next view
```

## File layout

```
game/config/
├── schema.toml             ← typed contract
├── default/                ← what ships with binary
│   ├── balance.toml
│   ├── economy.toml
│   └── boss_loot.json
├── live/                   ← current served config (per channel)
│   ├── stable/2026-05-17/
│   ├── canary/2026-05-17/
│   └── beta/2026-05-15/
└── history/                ← every prior version (immutable)
```

## Server format

```json
{
  "schema": "nexus.config/1",
  "version": "2026-05-17.1",
  "channel": "stable",
  "issued_at": "2026-05-17T03:14:15Z",
  "values": {
    "balance.weapon.pistol.damage": 22,
    "ui.paywall.layout_id": "v3"
  },
  "signature": "ed25519:..."
}
```

Same signing key as live-content (`→ live-content.md`).

## Engine API

```rust
let dmg: f32 = nexus::config::number("balance.weapon.pistol.damage")
    .or_default()           // falls back to bundled default on miss
    .value();
let layout: String = nexus::config::string("ui.paywall.layout_id").value();
```

Reads are constant-time. Backed by an in-memory map refreshed on poll.

## Polling

```toml
[config]
endpoint        = "https://config.example.com"
channel         = "stable"
poll_interval_s = 300
pin_per_session = true       # most safety; never changes mid-session
verify_signature = true
```

## Hot-reload entries

Entries with `hot_reload = true` fire `nexus::config::on_change(key, |new| { ... })`. Use for UI text, layout swaps, sale banners.

## Promotion flow

```bash
nexus config edit balance.toml                  # opens local editor
nexus config validate                            # checks schema + ranges
nexus config diff --from=stable                  # what changed
nexus config publish --channel=canary            # 1% via canary
# watch dashboards
nexus config promote --from=canary --to=stable
```

## A/B variants

Per-key variant via `→ ab-testing.md`. Coder can run "damage = 22 vs 25" on canary cohort, picks the winner.

## Smoke test

```bash
nexus config get balance.weapon.pistol.damage --attrs='{"channel":"stable"}'
nexus config validate
```

## Verify

```bash
nexus config status                          # current version per channel
nexus config audit --since=24h               # who changed what
```

## Rollback

```bash
nexus config rollback --channel=stable --to=2026-05-16.3
# < 60s for client refresh
```

Each historical version is immutable; rollback = swap pointer.

## Safety nets

| Net | Behavior |
|-----|----------|
| Server schema reject | unknown / out-of-range keys → 400 |
| Client clamp | client also clamps as defense |
| Default fallback | missing key → bundled default |
| Signature fail | reject + warn + use cached |
| Stale config | > 24 h without poll → warn, keep last |

## Cross-links

- `→ docs/guides/liveops/feature-flags.md` — toggles
- `→ docs/guides/liveops/ab-testing.md` — variants
- `→ docs/guides/liveops/live-content.md` — same signing
- `→ docs/guides/liveops/canary-and-rollback.md`

## References

- Firebase Remote Config · `https://firebase.google.com/docs/remote-config`
- LaunchDarkly remote config · `https://docs.launchdarkly.com/home/getting-started`
- GrowthBook config · `https://docs.growthbook.io/`

## Open

- `[DECISION NEEDED]` Per-session pin vs always-live for balance values — pin is safer, live is faster.
