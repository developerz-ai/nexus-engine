<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Multiplayer Sync

> Server is authoritative on mod-set. Clients send their lockfile + hashes at join; server compares to its whitelist. Mismatch = structured reject. No cheating via mod divergence. → cross-link `docs/specs/networking/anticheat.md`.

## Boundaries
- Owns: mod-set negotiation protocol, server whitelist schema, client-mod-set proof, mismatch reject codes, divergence detection during session.
- Does NOT own:
  - Capability sandbox → `docs/specs/scripting/sandbox.md`
  - Anti-cheat scoring → `docs/specs/networking/anticheat.md` (canonical)
  - Lobby / matchmaking → `docs/specs/networking/lobby.md`
  - Transport / encryption → `docs/specs/networking/transport.md`
- Depends on: `dependencies.md` (lockfile), `package-format.md` (mod_hash), `docs/specs/networking/anticheat.md`.

## Mod Trust Tiers per Power Tier

| Tier | Trust in multiplayer | Default policy |
|---|---|---|
| Skin (cosmetic) | Client-local; no sim effect | Always allowed; server doesn't care |
| Behavior (sim-affecting) | Must be in server whitelist | Server publishes allowed mod-set |
| Total conversion | Treated as separate game; own ladder | Server is the TC server; matchmaking is per-TC |

The server-side mod whitelist lives in the server config; → `anti-cheat.md` for the per-mod gameplay implications.

## Required vs Optional vs Client-Only

Each mod, in `mod.toml`, declares its multiplayer role:

```toml
[multiplayer]
role = "required"              # required | optional | client-only
sim_affecting = true           # affects deterministic sim
asset_only = false             # purely asset overlays
spectator_safe = true          # safe to load on spectators
```

| Role | Client must have | Server must have | Hash check |
|---|---|---|---|
| `required` | ✓ | ✓ | strict (mod_hash equal) |
| `optional` | may have | must allow | strict if present |
| `client-only` | may have | ignores | none; client-side only |

A `sim_affecting` mod CANNOT be `client-only`. Engine rejects manifest with `MOD_E_MP_ROLE_CONTRADICTION`.

## Server Whitelist

Server's `Nexus.toml::[mods.server]`:

```toml
[mods.server]
mode = "whitelist"                     # whitelist | open | open-cosmetic-only
required = [
  { id = "com.nexus.mod-lib",     version_req = "^1.0",  mod_hash = "b3:..." },
  { id = "com.example.healing",   version_req = "^1.0",  mod_hash = "b3:..." },
]
allowed_optional = [
  { id = "com.example.ui-kit",    version_req = "^0.5" },
]
allow_client_only_cosmetic = true
ban = [
  { id = "com.evil.aimbot-pack", reason = "cheat" },
]
```

Modes:

| Mode | Behavior |
|---|---|
| `whitelist` | Only required + allowed_optional + client-only-cosmetic permitted |
| `open` | Any mod permitted (P2P / private servers only) |
| `open-cosmetic-only` | Any cosmetic-tier mod permitted; behavior/TC blocked |

Server publishes the whitelist via a signed manifest at the lobby endpoint (→ `docs/specs/networking/lobby.md`).

## Join-Time Negotiation

```
Client                              Server
  | --- HELLO + session ticket ---> |
  |                                  |
  | <--- SERVER_MOD_WHITELIST ------ |  (signed; cached if seen before)
  |                                  |
  | --- CLIENT_MOD_PROOF ---------> |
  |    { lockfile_hash,             |
  |      mods: [{id,ver,mod_hash}], |
  |      sig (over hash + nonce)    |
  |    }                            |
  |                                  |
  |                                  |  Server validates:
  |                                  |    1. Every server.required is present with matching hash
  |                                  |    2. No client mod is in server.ban
  |                                  |    3. No sim-affecting mod is unlisted (unless mode=open)
  |                                  |    4. mod_hash matches catalog (cross-verify)
  |                                  |
  | <--- JOIN_ACCEPT / JOIN_REJECT - |
  |                                  |
  | <--- ASSET_HASH_AGREEMENT ----- |  (per active overlay; client confirms or rejects)
```

`CLIENT_MOD_PROOF` is signed by the client session key (transport-layer, `docs/specs/networking/transport.md`). Tamper-evident.

## Version-Mismatch Handling

| Scenario | Server action | Client message |
|---|---|---|
| Client missing `required` mod | REJECT | "install com.example.healing@^1.0; click here to install from {source}" |
| Client has stale version | REJECT | "update com.example.healing to ≥ 1.0.0" |
| Client has newer version (within `version_req`) | ACCEPT | — |
| Client has newer version (outside `version_req`) | REJECT | "downgrade or wait for server update" |
| Client has unlisted sim-affecting mod | REJECT | "disable com.example.X to join this server" |
| Client has banned mod | REJECT + ledger entry | "com.evil.aimbot is not permitted here" |
| Client has client-only cosmetic mod | ACCEPT | — |

Reject codes use `MP_E_*` family; client UI uses the structured payload to offer one-click remediation.

## Asset Hash Agreement

Even with identical mod-set, two clients could resolve different bytes if their overlay stacks differ in priority/order. After JOIN_ACCEPT, server sends a `ASSET_HASH_AGREEMENT` packet listing every overlay-affected UUID and the expected resolved hash. Client computes and compares; mismatch → `MP_E_ASSET_HASH_MISMATCH`, session aborted.

Computed by the asset registry (`docs/specs/assets/registry.md`) over the resolved bytes of each affected UUID. Cached after first agreement so subsequent joins skip recomputation.

## Cheat-Detection on Diverging Mod Sets

During the session, the anti-cheat layer (→ `docs/specs/networking/anticheat.md`) periodically asserts:
- Same lockfile hash on server and client.
- Same `mod-effects.log` summary hash since last checkpoint (deterministic sim → identical mutation order).
- Same `Persist` blob hashes (for `sim_affecting` mods).

Divergence → `AC_E_MOD_STATE_DIVERGED`, peer flagged for forensic capture (`docs/specs/networking/anticheat.md` § Forensic).

## Hot-Mod Mid-Session

```
Server admin enables a new optional mod mid-session
                |
                v
          Server broadcasts MOD_SET_UPDATE
                |
                v
   Clients fetch + verify + load the mod
                |
                v
       Clients confirm or drop session
```

`sim_affecting` mods cannot be hot-added in `--ship` builds; only via dev/admin tooling with explicit warning. Cosmetic mods may be hot-added freely.

## P2P / Symmetric Games

No central server. Mod-set negotiation runs N-way:
- Lobby leader proposes the mod-set.
- Each peer confirms or vetoes.
- All-confirm = session starts.
- Veto = renegotiate or party dissolves.

P2P trust limits documented to users (→ `docs/specs/networking/anticheat.md` § Symmetric P2P).

## Listen Server / Local Co-op

Listen server uses the host's local mod-set as the whitelist automatically. Joining clients see "Host is running these mods; install to join?" UI.

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MP_E_MOD_REQUIRED_MISSING` | Client missing a `required` mod | Install prompt |
| `MP_E_MOD_BANNED` | Client running a banned mod | Disable + retry |
| `MP_E_MOD_UNLISTED_SIM` | Sim-affecting mod not on whitelist | Disable + retry |
| `MP_E_MOD_HASH_MISMATCH` | Same id+ver but different mod_hash | Re-install from server source |
| `MP_E_MOD_VERSION_OUT_OF_RANGE` | Client version outside server's req | Up/downgrade |
| `MP_E_ASSET_HASH_MISMATCH` | Overlay-resolved asset bytes diverge | Investigate overlay stack; disable conflicting |
| `MP_E_ROLE_CONTRADICTION` | `client-only` + `sim_affecting` declared | Manifest bug; fix |
| `AC_E_MOD_STATE_DIVERGED` | Mid-session divergence detected | Anti-cheat path; forensic capture |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Mod-set negotiation (50 mods) | < 200 ms | 1 s |
| Asset hash agreement (100 overlays, cached) | < 50 ms | 500 ms |
| Per-session divergence check | < 5 ms / minute | 50 ms |

`[BENCHMARK NEEDED]`.

## Integration Points

- `docs/specs/networking/anticheat.md` — canonical trust model; divergence path.
- `docs/specs/networking/lobby.md` — whitelist publication; signed by server.
- `docs/specs/networking/transport.md` — signed packets; replay protection.
- `docs/specs/networking/replication.md` — must remain deterministic given identical mod-set.
- `dependencies.md` — lockfile hash; the cross-peer agreement payload.
- `asset-overlay.md` — resolved-bytes hashes are the agreement basis.

## Test Requirements

- Two clients with byte-identical mod-set and lockfile join cleanly; same world snapshot frame-for-frame.
- Client with one extra cosmetic mod joins fine; client with one extra sim mod is rejected.
- Banned mod is rejected with structured `MP_E_MOD_BANNED` and reason.
- Mid-session divergence (intentionally inject in test) flagged within 1 second.
- Asset overlay produces different bytes on two clients with different priority → `MP_E_ASSET_HASH_MISMATCH` at agreement step.
- Server in `open-cosmetic-only` mode: behavior mod rejected, cosmetic accepted.

## Prior Art

- Counter-Strike `sv_pure` ✓ — server enforces asset hashes; we generalize to all mods.
- Minecraft Forge mod handshake ✓ — mod-list exchange at join.
- Factorio multiplayer mod-set lockstep ✓ — identical mod sets enforced; we mirror.
- ARMA mod-list dialog ✓ — UX inspiration for the install-to-join prompt.
- DayZ mod whitelist ✓ — server-side whitelist mode.

## Open Questions

- `[DECISION NEEDED]` Whether to support "I'll join read-only / spectator" with a relaxed mod-set.
- `[DECISION NEEDED]` Mod-aware matchmaking: lobbies advertise mod-set hash so players see compatible pools.
- `[DECISION NEEDED]` Cross-region asset distribution for required mods (CDN handoff during join).
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 07]` Confirm REJECT message format aligns with lobby contract.
- `[AGENT: 14]` Confirm hash-agreement contract surface for asset registry.
