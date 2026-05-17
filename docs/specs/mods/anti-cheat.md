<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Anti-Cheat Compatibility

> Trust model per mod power tier: cosmetic = always trusted; behavior = server must allow; total conversion = separate domain. Extends — does not redefine — `docs/specs/networking/anticheat.md`.

## Boundaries
- Owns: per-tier trust mapping, server policy file extension, mod-ledger schema, mod-aware forensic capture fields.
- Does NOT own:
  - Validator chain / behavioral scoring → `docs/specs/networking/anticheat.md` (canonical)
  - Multiplayer sync / whitelist negotiation → `multiplayer-sync.md`
  - Capability enforcement → `docs/specs/scripting/sandbox.md`
- Depends on: `docs/specs/networking/anticheat.md`, `multiplayer-sync.md`, `docs/specs/scripting/sandbox.md`.

## Per-Tier Trust Mapping

| Power tier | Sim effect | Default trust | Ladder treatment |
|---|---|---|---|
| Skin (cosmetic) | none | always trusted (client-local) | unaffected |
| Behavior (sim-affecting) | yes | server must include in whitelist | save flagged "modded"; ladder per server policy |
| Total conversion | replaces game | separate domain (`game_id`) | own ladder, own ban list |

A sim-affecting mod CANNOT be client-only (manifest validation, → `multiplayer-sync.md`).

## Server Policy Extensions

Extends `docs/specs/networking/anticheat.md` server config:

```toml
[anticheat.mods]
# Whether to accept modded clients at all.
allow_modded_clients = true

# Per-mod trust override (id glob).
[[anticheat.mods.trust]]
id = "com.nexus.mod-lib"
trust = "core"                         # trusted as if first-party

[[anticheat.mods.trust]]
id = "com.example.*"
trust = "standard"

[[anticheat.mods.trust]]
id = "com.unverified.*"
trust = "elevated-scoring"             # raises baseline anomaly score weight

# Mods that change behavioral baselines (e.g., new movement abilities).
# Authors declare a baseline-shift profile; servers can accept or reject.
[[anticheat.mods.baseline_profile]]
id = "com.example.grapple-hook"
profile = "movement_burst"             # validator weight adjustments
```

Trust levels:

| Level | Meaning |
|---|---|
| `core` | Treated as first-party; validators use baseline weights. |
| `standard` | Default. Slightly raised weight on anomaly scores. |
| `elevated-scoring` | Higher anomaly weight; suspicion threshold lowered. |
| `block` | Mod cannot join; server rejects at handshake. |

## Mod-Aware Validators

Validators from `docs/specs/networking/anticheat.md` receive additional context:

```
ctx.mod_set: list of (mod_id, version, mod_hash, trust_level)
ctx.mod_caps: per-mod cap set granted by player
ctx.baseline_profile: composite of all loaded baseline_profiles
```

Validator may consult: "does any loaded mod legitimately expand the movement profile? If yes, widen tolerance." Prevents false positives where a legitimate mod (e.g., grappling hook) looks like a teleport hack.

## Cheat-Mod Detection

Even with a sandbox, "cheats as mods" exist (aimbot via legitimate `WorldRead<Aim>`, ESP via legitimate `WorldRead<Position>`). Server-side mitigations:

| Mitigation | How |
|---|---|
| **Limit `WorldRead` parameters per ladder** | Competitive servers can disallow reading positions of unseen entities; engine then masks query results. |
| **Hide non-broadcast state** | Server only replicates state the client should see; mod can't read what it doesn't have. |
| **Per-server cap whitelist** | Server's `[anticheat.mods.cap_whitelist]` restricts which caps mods may use, even if player granted. |
| **Behavioral scoring across mod-sets** | Same mod-set + abnormal performance still flags. |
| **Public ledger of known cheat mods** | `anti-cheat.mods.ban` list; cross-game federation `[DECISION NEEDED]`. |

The strongest defense is server-replication discipline: a mod cannot reveal what the server never sent.

## Mod-Aware Forensic Capture

Forensic bundles (→ `docs/specs/networking/anticheat.md` § Forensic Capture) include:

```json
{
  "mod_set": [
    { "id": "com.example.healing", "version": "1.0.0", "mod_hash": "b3:...", "trust": "standard" }
  ],
  "lockfile_hash": "b3:...",
  "cap_audit_summary": {
    "com.example.healing": {
      "reads": 1243, "writes": 87, "events_emitted": 12,
      "denied": 0, "limit_exceeded": 0
    }
  },
  "asset_overlay_set": [ "01HZ...", "01HZ..." ]
}
```

Auditor (human or AI) can re-run the session deterministically with the same mod-set to verify the flag.

## TC Anti-Cheat Domain

Total conversions are isolated:
- Own ladder.
- Own ban list (TC publisher controls).
- Own server whitelist of allowed sub-mods.
- Cross-TC cheats are impossible (no shared state).

A TC server's anti-cheat config lives at `<tc-dir>/anticheat.toml`; engine's defaults apply unless overridden.

## Ledger Integration

Per-violation telemetry (→ canonical) gains mod-attribution:

```json
{
  "ts_ns": 1718...,
  "peer": "...",
  "session": "...",
  "code": "AC_E_INPUT_IMPLAUSIBLE",
  "severity": "Warn",
  "validator": "MovementSanity",
  "tick": 1234,
  "mod_set_hash": "b3:...",            // for cohort filtering
  "suspected_mod": null,               // populated by AI auditor if attributable
  "evidence": { ... }
}
```

Cohort analysis: "are flags concentrated on sessions with mod X loaded?" Drives transparent community ledger / takedown.

## Cosmetic Always-Trusted Rule

Even on the strictest competitive server, skin-tier mods are accepted because they cannot affect sim:
- No script tier active.
- Only `AssetRead` + `AudioOneshot` caps.
- Asset hash agreement (→ `multiplayer-sync.md`) ensures client doesn't substitute a transparent-wall texture; client and server compute the same expected resolved hash. Substitution detected.

If hash agreement is bypassed (transparent walls anyway), the server's render-side hash check fails and the client is rejected. The skin tier is the ONLY tier where this guarantee is purely server-driven.

## Open-Source Stance

Per `docs/specs/networking/anticheat.md`: no kernel-level intrusion, no obscurity-based checks, no proprietary blobs. Mod anti-cheat strength comes from:
1. Server authority on state (mods can't fake what server didn't send).
2. Cap broker (mods can't reach surfaces they weren't granted).
3. Asset hash agreement (mods can't substitute textures invisibly).
4. Behavioral scoring (anomalies surface even with all caps "legal").
5. Public, auditable ban lists.

## Error Contract

Reuses `AC_E_*` from `docs/specs/networking/anticheat.md`. Mod-specific:

| Code | Meaning |
|---|---|
| `AC_E_MOD_BLOCKED_BY_SERVER` | Mod on server's block list / trust=`block` |
| `AC_E_MOD_CAP_OUT_OF_SERVER_POLICY` | Mod's granted caps include one the server policy disallows |
| `AC_E_MOD_STATE_DIVERGED` | Per-mod state diverges from server-side simulation |
| `AC_E_BASELINE_PROFILE_REJECTED` | Server doesn't accept the declared `baseline_profile` |

## Performance Contract

Same as `docs/specs/networking/anticheat.md`. Mod-context cost:
- Mod-aware validator lookup: < 1 µs per input.
- Mod-set forensic capture additions: < 1% extra CPU under flag.

## Integration Points

- `docs/specs/networking/anticheat.md` — canonical.
- `multiplayer-sync.md` — handshake-time whitelist; ban list source.
- `docs/specs/scripting/sandbox.md` — broker audit feeds ledger.
- `docs/specs/agent/replay.md` — forensic capture format.
- `total-conversions.md` — TC domain isolation.
- `permissions.md` — server-policy-blocked cap surface in consent UI.

## Test Requirements

- Skin mod loads on strictest competitive server with no friction.
- Behavior mod NOT on server whitelist is rejected at join with `AC_E_MOD_BLOCKED_BY_SERVER`.
- Modded session that scores anomalous still gets forensic captured with mod-set attached.
- Asset substitution attempt (transparent texture) detected by hash agreement.
- TC ban list isolated from host-game ban list.
- Determinism: replaying a flagged session with the same mod-set reproduces the flag.

## Prior Art

- Overwatch — server authority + replication discipline ✓.
- CS Anti-Cheat / VAC — server-side validator weights ✓.
- Tarkov BattleEye ✗ — kernel-level; engine doesn't ship.
- Halo Infinite EasyAntiCheat ✗ — kernel; engine doesn't ship.
- Risk of Rain 2 + BepInEx + community mods ✓ — proves modded competitive multiplayer is possible if scoped.
- Counter-Strike `sv_pure` ✓ — asset hash agreement model.

## Open Questions

- `[DECISION NEEDED]` Federation: cross-game cheat-mod ban list, opt-in?
- `[DECISION NEEDED]` Per-mod-author trust badge ("verified author has never shipped a cheat mod") — gameable?
- `[DECISION NEEDED]` Baseline-profile registry: community-curated vs publisher-curated.
- `[BENCHMARK NEEDED]` Validator chain cost with mod-set context at 64-peer load.
- `[AGENT: 07]` Confirm validator-context API includes mod fields.
