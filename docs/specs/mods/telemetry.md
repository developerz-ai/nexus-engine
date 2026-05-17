<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Telemetry (Opt-In Author Analytics)

> Mod authors opt in to receive install counts, enable rates, crash rates by mod, per-mod perf cost. Privacy-preserving by default. Player consent at install. No tracking by default. No engine-side analytics on mods.

## Boundaries
- Owns: telemetry schema, per-mod opt-in/out, anonymization rules, transport bounds, sampling defaults.
- Does NOT own:
  - Author-side ingest endpoint (author's responsibility)
  - Engine-wide crash reporting (→ `docs/guides/liveops/crash-format.md`)
  - Player-personal analytics (NOT collected)
- Depends on: `manifest.md` `[telemetry]`, `permissions.md`, `docs/guides/liveops/telemetry-pipeline.md`.

## Default: OFF

Mods do not phone home by default. Authors must opt in via manifest, players must opt in at install. Double-consent. → `permissions.md`.

```toml
[telemetry]
enabled = false                                # default
endpoint = "https://telemetry.example.com/v1/ingest"
schema = "nexus-mod-telemetry-v1"
events = ["install", "enable", "disable", "uninstall", "crash", "perf-summary"]
sample_rate = 1.0                              # 0..1; 1.0 = all sessions
```

Events listed are the ONLY events the engine will send for this mod. Author cannot subscribe to events not on this fixed list. (Engine prevents arbitrary outbound payloads.)

## Event Catalog

| Event | Triggered | Payload |
|---|---|---|
| `install` | First install | mod_id, version, anon_session_id, engine_ver, platform |
| `enable` | Each enable | mod_id, version, anon_session_id |
| `disable` | Each disable | mod_id, version, anon_session_id, session_duration_s |
| `uninstall` | Uninstall | mod_id, version, anon_session_id |
| `crash` | Mod-attributed crash | mod_id, version, code (CAP_*, SCRIPT_*), stack hash, no source |
| `perf-summary` | Once per session at end | mod_id, version, cpu_us_p50/p95/p99, alloc_bytes_total, calls_in/out |
| `update-success` | After hot-reload or update install | mod_id, old_ver, new_ver |

Forbidden: any event with player identity, save contents, gameplay outcomes, level-specific info, or PII.

## Anonymization

| Field | Treatment |
|---|---|
| `anon_session_id` | random per session, NEVER linked across sessions |
| `device_id` | NEVER collected |
| `ip` | NEVER stored at engine layer; the author's endpoint should not log either |
| `os_version` | major version only (e.g., "Linux 6", "macOS 14"), never minor/build |
| `cpu_model` | family only ("x86_64-avx2") |
| `gpu_model` | vendor + class only ("nvidia-discrete") |
| `region` | country code only if user opts in (separate setting); else "global" |

Engine enforces by serializing through a fixed redactor before transport.

## Consent UI

At install, if `[telemetry].enabled = true`:

```
+----------------------------------------------------------+
| Healing Pack would like to send anonymous usage data:    |
|                                                          |
|  • Install / enable / disable events                    |
|  • Crash reports attributed to this mod                 |
|  • Per-session performance summary                       |
|                                                          |
| This data is sent to: telemetry.example.com             |
| (Healing Pack's author)                                  |
|                                                          |
| The engine guarantees NO personal data is included.     |
|                                                          |
|  [ Allow ]   [ Allow Once ]   [ Deny ]                  |
+----------------------------------------------------------+
```

"Deny" is the keyboard default. Persistence: player choice is per-mod and recallable from mod settings.

## Transport

- Engine batches events (max 1 batch per 30 s per mod).
- Send via HTTPS only.
- Retry with backoff up to 24h, then drop.
- No third-party analytics SDK injection. Engine ships its own transport; authors cannot redirect via mod code.
- Total telemetry overhead capped at 0.5 KB/min per mod.

## Author Endpoint Schema

`POST {endpoint}` with body:

```json
{
  "schema": "nexus-mod-telemetry-v1",
  "mod_id": "com.example.healing",
  "mod_version": "1.0.0",
  "engine_version": "1.4.7",
  "platform": "linux",
  "anon_session_id": "01HZ8...",
  "ts_ms": 1718000000000,
  "events": [
    { "kind": "install", ... },
    { "kind": "enable", ... },
    { "kind": "perf-summary", "cpu_us_p95": 87, "calls_in": 1243, "calls_out": 87 }
  ]
}
```

Author must respond `200 OK` or `204 No Content`. Any other status = retry per policy.

## Sampling

Authors can request `sample_rate < 1.0` for high-volume events (e.g., `perf-summary`). Engine deterministically samples by `anon_session_id` hash so a given session is consistently in/out.

## Crash Attribution

A crash is attributed to a mod when the structured error code originates from:
- That mod's VM (`SCRIPT_*` codes with mod_id field).
- That mod's caps (`CAP_*` codes for the mod_id).
- A panic in a bridge fn called from that mod's VM.

`crash` event payload includes the stack hash (BLAKE3 of normalized frames) but NEVER source code or runtime values. Author can correlate hashes across reports for clustering.

## Disable & Revoke

Player can revoke telemetry at any time:
```
Mod settings → Healing Pack → Telemetry → [ Disable ]
```

Effect: immediate. No further events sent. Pending batch dropped.

## Author Dashboard (Suggested)

The engine doesn't ship one; authors build their own. Sample queries:

```sql
SELECT mod_version, COUNT(DISTINCT anon_session_id) FROM installs
WHERE ts_ms > now() - INTERVAL '30 days'
GROUP BY mod_version;

SELECT mod_version, percentile_cont(0.95) WITHIN GROUP (ORDER BY cpu_us_p95)
FROM perf_summary
GROUP BY mod_version;

SELECT mod_version, code, COUNT(*) FROM crashes
GROUP BY mod_version, code
ORDER BY COUNT(*) DESC;
```

Reference dashboard recipe: → `docs/guides/mods/authoring/perf.md` § Telemetry-driven optimization.

## Engine-Side Aggregation (NOT done by default)

The engine does NOT aggregate mod telemetry centrally. If a marketplace or first-party hub (`docs/guides/mods/marketplaces/nexus-hub.md` `[DECISION NEEDED]`) wants aggregate counts (downloads, average rating), that lives at the marketplace layer, not the engine.

## Privacy Audit

Per session start, engine logs a structured event:

```json
{
  "ts": 1718000000,
  "kind": "telemetry-active-mods",
  "mods": [
    { "id": "com.example.healing", "version": "1.0.0", "endpoint": "telemetry.example.com" }
  ]
}
```

Visible in player's mod settings as "Active telemetry destinations." Empowers the player. No surprise endpoints.

## Server-Side Disable

In multiplayer, the server can disable per-mod telemetry for all connected clients via:

```toml
[mods.server]
disable_mod_telemetry = true
```

Used when servers must prevent any outbound non-game traffic (e.g., LAN-only, esports stages).

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_TELEMETRY_ENDPOINT_INVALID` | URL not HTTPS or syntactically bad | Refuse install for that opt-in; mod still installs |
| `MOD_W_TELEMETRY_DROP` | Retry budget exceeded; dropped | Local log only |
| `MOD_E_TELEMETRY_PAYLOAD_REJECTED` | Engine redactor refused field | Drop; log to local audit |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Per-mod overhead, telemetry on | < 0.1% CPU | 1% |
| Network bandwidth per mod | < 0.5 KB/min | 2 KB/min |
| Batch send latency | < 100 ms p95 | 1 s |

## Integration Points

- `permissions.md` — consent dialog includes telemetry destinations.
- `manifest.md` — `[telemetry]` schema.
- `lifecycle.md` — install/enable/disable events.
- `docs/specs/scripting/sandbox.md` — telemetry uses the broker, not a separate net path; counted under broker quotas.
- `docs/guides/liveops/telemetry-pipeline.md` — same redactor library reused.
- `nsfw-and-moderation.md` — NSFW-mod telemetry suppressed by privacy rule.

## Test Requirements

- Default install with `[telemetry].enabled = true`: consent dialog shown; no events sent until Allow.
- Allow → events sent only to declared endpoint; redactor strips any forbidden field.
- Revoke → next event suppressed immediately; pending batch dropped.
- Endpoint downtime: retry honored; final drop logged; engine stable.
- Player disables telemetry globally: no mod sends regardless of opt-in.
- Server `disable_mod_telemetry`: no mod sends during session.

## Prior Art

- Mozilla telemetry consent model ✓ — informative consent + clear opt-out.
- Sentry / GlitchTip crash reporting ✓ — structured, sample-able, but typically without consent gate; we elevate.
- Steam game telemetry ✓ — coarse aggregates only.
- Browser DoNotTrack history ✗ — ignored signal; we hard-enforce.
- Mobile ad SDKs ✗ — anti-pattern; we forbid third-party SDK injection.

## Open Questions

- `[DECISION NEEDED]` Whether to ship a turn-key author-side ingest (e.g., one-click Cloudflare worker template).
- `[DECISION NEEDED]` Aggregation by `nexus-hub` if it ships.
- `[DECISION NEEDED]` Crash-event stack-hash salt scheme to prevent re-identification across players.
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 22]` Confirm crash-format from liveops can be reused.
