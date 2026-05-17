<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0005 — GGPO-Style Rollback Netcode as the Primary Real-Time Multiplayer Model

## Status

`Accepted`

Date: 2026-01-15
Authors: nexus-architecture-agent-01
Reviewers: integration team, networking team

## Context

Real-time multiplayer games — fighting, FPS, MOBA, twitch action — fall apart under naive client-server input-delay models when network latency exceeds ~50ms. Players feel input lag, frame jitter, or both. The industry's most-respected solution is **rollback netcode**: predict, simulate forward, reconcile on misprediction by rolling back and re-simulating.

GGPO (https://www.ggpo.net/), pioneered by Tony Cannon (2006), and shipped by Skullgirls, Killer Instinct, Guilty Gear Strive, Street Fighter 6, Mortal Kombat, demonstrates the model in production. Valve's GameNetworkingSockets and modern fighting-game tech extend the playbook.

Forces:
- Vision targets fighting, FPS, MOBA — all latency-critical genres. → `docs/specs/genres/fighting.md`, `docs/specs/genres/fps.md`, `docs/specs/genres/moba.md`.
- Law 9: deterministic replay required engine-wide. Rollback REQUIRES determinism; this aligns naturally.
- Law 1: net errors must be machine-readable per-frame (sync hash mismatches, rollback events).
- Law 5: rollback's cost is N extra simulation frames per misprediction. Performance budgets must absorb this.

Alternatives include lockstep (RTS-classic), client-side prediction + server reconciliation (Quake/Source/Overwatch), and snapshot interpolation (Valve's original 1999 design).

## Decision

Nexus's networking core ships **GGPO-inspired rollback netcode** as a first-class library in `nexus-net`, with deterministic ECS simulation as the foundation.

- **Determinism is engine-wide** — driven by Law 9. Physics uses Rapier's `enhanced-determinism` feature plus fixed-point optionality for cross-platform parity (`docs/specs/physics/determinism.md`).
- **Inputs are the network payload.** Bandwidth scales with player count × input rate, not entity count.
- **Local input** is applied immediately for zero-latency feel. Remote inputs are predicted (last-known repeated) and corrected on arrival.
- **Rollback window** is configurable per game (default: 8 frames at 60Hz ≈ 133ms). Games can tune for their genre.
- **Sync hash** of world state computed each tick, exchanged out-of-band, mismatch = telemetry alert + desync recovery flow.
- **Rollback is opt-in per genre.** RTS and MMORPG use replication models (`docs/specs/networking/replication.md`) instead; rollback for them would be cost-prohibitive at hundreds of units.
- Coexistence: server-authoritative replication remains available for genres where rollback doesn't fit. `docs/specs/networking/overview.md` documents the choice-tree.

## Consequences

### Positive

- **Best-in-class felt latency** for competitive genres. Input → on-screen response = local frame cost only.
- **Determinism becomes a forcing function** that strengthens the engine across the board — better replays, easier bisection, more reproducible bugs.
- **Peer-to-peer friendly.** No mandatory authoritative server reduces hosting costs for indie multiplayer games.
- **Replay = recorded input log + initial snapshot.** Tiny on disk, exact on playback. Free debugging tool. → `docs/specs/agent/replay.md`.
- **Aligns with Law 9** end-to-end. The hardest part of rollback (determinism) is already a project-wide law.

### Negative / costs

- **Determinism is HARD.** Floats are not portable across CPUs without care. Mitigation: fixed-point physics path for netcode-critical games (`docs/specs/physics/determinism.md`), bit-exact replays within a target.
- **CPU cost on misprediction.** Each misprediction → up to N extra simulation steps. Mitigation: simulation budget at 60Hz must leave headroom; benchmark suite enforces (Law 5).
- **Not suitable for all genres.** RTS with 200 units, MMORPG with 1000 entities — rollback memory + CPU cost untenable. We accept and document; replication path provides for them.
- **Anti-cheat is harder** in P2P mode. Mitigation: server-authoritative variant or relay-validated variant offered. → `docs/specs/networking/anticheat.md`.
- **Memory cost** for storing rollback states: state snapshots × rollback window. Snapshot compression (`zstd` + bincode) mitigates.

### Neutral

- Inputs serialized compactly; protocol defined in `docs/specs/networking/transport.md`.
- "Input delay" tunable per game: 0 to N frames. Pure GGPO often uses 1–2 frames of artificial delay to reduce rollback count in casual play.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Client-side prediction + server reconciliation** (Quake / Source / Overwatch) | proven at scale; auth server simplifies cheat | server cost; felt latency higher than rollback; complexity of dual simulation; "lag compensation" controversies | rollback gives better felt latency where it matters |
| **Lockstep** (RTS classic — Age of Empires, Starcraft) | trivial determinism; bandwidth tiny | input delay = worst-case RTT; awful for action; pause on packet loss | wrong for action genres |
| **Snapshot interpolation** (HL1 original) | simple | felt latency = interp buffer + RTT; awful for competitive | inferior |
| **Hybrid (rollback for inputs + replication for world)** | covers more genres in one engine | major complexity tax | this IS our decision — rollback as PRIMARY, replication coexists |
| **Cloud-rendered (Stadia-style)** | zero client compute | unrelated; not a netcode model | not applicable |

Note on inspiration: we explicitly do NOT use GGPO's source code (LGPL historically; current SDK is BSL). We implement the algorithm from public design documentation and academic write-ups under MIT. → Law 7.

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"Genre Targets"
- Laws: 1, 5, 9
- Networking specs: `docs/specs/networking/overview.md`, `docs/specs/networking/rollback.md`, `docs/specs/networking/replication.md`, `docs/specs/networking/transport.md`, `docs/specs/networking/anticheat.md`
- Determinism: `docs/specs/physics/determinism.md`, `docs/architecture/05-adr/0007-deterministic-replay.md`
- Replay: `docs/specs/agent/replay.md`
- Genre specs that opt in: `docs/specs/genres/fighting.md`, `docs/specs/genres/fps.md`, `docs/specs/genres/moba.md`
- Prior-art (AGENT 13): `docs/prior-art/ggpo.md`
- External:
  - GGPO: https://www.ggpo.net/
  - Tony Cannon, "Fight the Lag", Gamasutra 2006 (archived): https://web.archive.org/web/2006*/gamasutra.com/view/feature/131781/the_lag_factor.php
  - Valve GameNetworkingSockets: https://github.com/ValveSoftware/GameNetworkingSockets
  - Glenn Fiedler "Networked Physics" series: https://gafferongames.com/categories/networked-physics/
