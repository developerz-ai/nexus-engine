<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# GGPO

> Tony Cannon's 2006 rollback netcode library — the single piece of middleware most responsible for modern competitive fighting/racing/RTS multiplayer being playable online. Open-sourced MIT 2019.

## Snapshot

| | |
|---|---|
| Language | C++ |
| License | MIT (since Oct 2019) |
| Status | Reference implementation; the *technique* is what's borrowed |
| Since | 2006 (Tony Cannon) |
| Repo | https://github.com/pond3r/ggpo |

## What Nexus Borrows ✓

- **The rollback model itself.** Simulate forward with predicted remote inputs → on input arrival, snapshot-restore + resimulate frames → present the corrected frame. Hides ~100-150ms RTT with zero perceived input lag. Foundational for Nexus competitive networking → `docs/specs/networking/rollback.md`.
- **Input delay + rollback as a tunable mix.** Players can trade input latency for rollback frequency depending on connection. Low-latency LAN: 0 frames delay. Cross-country: 2-3 frames delay reduces rollback frequency. Nexus exposes per-match → `docs/specs/networking/rollback.md`.
- **Confirmation frame model.** State is only confirmed when all remote inputs for a given frame have arrived. Confirmed state is the rollback base. Nexus snapshots only confirmed frames → `docs/specs/agent/replay.md`.
- **Save / load / advance callback API.** Game implements three callbacks; GGPO calls them. Decouples netcode from game logic. Nexus contract for systems that participate in rollback → `docs/contracts/core-networking.md`.
- **Peer-to-peer, no authoritative server required.** For symmetric latency-sensitive games (fighters, 1v1 RTS), P2P + rollback beats client-server + reconciliation. Nexus supports both modes; rollback path is P2P → `docs/specs/networking/overview.md`, `docs/specs/networking/transport.md`.
- **MIT open-source release sets the precedent.** Cannon publishing the reference implementation freed the technique from being a Capcom/Arc System Works secret. Nexus continues the openness — every netcode component is MIT.

## Design Notes / Tradeoffs

- **Rollback budget.** Typical max rollback window is 7-9 frames at 60Hz (~150ms). Beyond, the visual hitch becomes worse than input lag. Nexus configures per-game.
- **Determinism is the precondition.** Every system that touches gameplay state must be bit-deterministic given the same inputs. This propagates: physics (→ Rapier `enhanced-determinism`), RNG (seeded, deterministic), floating-point (avoid transcendental drift, or use fixed-point). → `docs/specs/physics/determinism.md`, `docs/specs/core/math.md`.
- **State serialization cost.** Save/restore of full game state must be fast enough to fit a rollback frame (sub-millisecond). Drives ECS storage design: contiguous arrays restore in `memcpy`, OOP graphs do not → `docs/specs/core/ecs.md`.
- **Audio + VFX rollback is tricky.** Don't replay sounds, don't double-spawn particles. Mark "presentation" systems as rollback-exempt; replay only updates final state, not their event stream → `docs/specs/audio/overview.md`, `docs/specs/renderer/particles.md`.

## What Nexus Avoids ✗

- **Single-mode netcode.** GGPO is rollback-only. Nexus needs server-authoritative + interpolation for MMO scale, rollback for competitive — same engine, different mode per genre → `docs/specs/networking/overview.md`.
- **C++ callback indirection.** Nexus integrates rollback as an ECS scheduler mode, not external library + callbacks. Same idea, native ergonomics.
- **No matchmaking, no relay.** GGPO is pure transport-agnostic netcode. Nexus pairs it with a lobby/relay layer → `docs/specs/networking/lobby.md`.

## Architectural Lessons

1. **Rollback is fundamentally a *systems architecture* requirement, not a networking feature.** Every game system must be deterministic and snapshot-able. Bolt-on rollback is impossible; design-in rollback is mandatory.
2. **Hide latency or hide variance — pick one per frame.** Input delay hides variance, rollback hides latency. Mix per match for best feel.
3. **Make confirmed vs predicted state visible in the data model.** Don't pretend they're the same; the debugger needs to know.
4. **Open-source the reference implementation; let the technique win.** Cannon's MIT release accelerated the entire genre.
5. **Performance budget for save/restore is a first-class engine spec**, not an afterthought. <1ms full-state snapshot at 60Hz is the bar.
6. **Presentation must be separable from simulation.** Rollback replays simulation; presentation observes the final result. Architecturally splits engine into sim-tier + view-tier — same split Nexus uses for headless → `docs/specs/agent/headless.md`.

## Direct Influence on Nexus

| GGPO concept | Nexus file |
|---|---|
| Rollback model | `docs/specs/networking/rollback.md` |
| Input delay/rollback mix | `docs/specs/networking/rollback.md` |
| Save/Load/Advance callbacks | `docs/contracts/core-networking.md` |
| Snapshot-able world state | `docs/specs/agent/replay.md`, `docs/specs/core/ecs.md` |
| Determinism requirement | `docs/specs/physics/determinism.md`, `docs/specs/core/math.md` |
| Presentation/sim split | `docs/specs/agent/headless.md`, `docs/specs/audio/overview.md` |
| P2P transport | `docs/specs/networking/transport.md` |
| Fighting game tuning | `docs/specs/genres/fighting.md` |

## References

- Repo (open source 2019): https://github.com/pond3r/ggpo
- GGPO docs README: https://github.com/pond3r/ggpo/blob/master/doc/README.md
- Official site: https://www.ggpo.net/
- Wikipedia (history, Cannon, MIT release): https://en.wikipedia.org/wiki/GGPO
- Infil's "Netcode" series (essential reading): https://words.infil.net/w02-netcode-p5.html
- SnapNet rollback netcode breakdown: https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/
- "How Rollback Netcode Saved Fighting Games": https://energiaa.vamk.fi/en/blogs/how-rollback-netcode-saved-fighting-games/
- "Fighters' History: Japan ignores GGPO for 15 years" (Chisholm): https://turbo-2.medium.com/fighters-history-japan-ignores-ggpo-for-15-years-7140519284a1
