<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0004 — MIT License, Forever, No Dual Licensing

## Status

`Accepted` — **constitutionally immutable** (see `docs/architecture/00-vision.md` §"The Commitment")

Date: 2026-01-15
Authors: nexus-architecture-agent-01
Reviewers: integration team

## Context

License choice determines who builds on the engine, who contributes, who trusts the project long-term, and who can fork if the project's stewards ever fail.

Forces:
- Vision §"The Open Source Mandate" and §"The Commitment".
- Unity's September 2023 runtime-fee announcement caused mass migration and lasting trust damage. The episode is the modern reference case: a license change is an existential threat.
- Open-core / "community edition vs paid pro" models (Cocos, Defold history, some game-tech middlewares) consistently produce friction and limit the community-built layer.
- AGPL / SSPL / BUSL / "fair source" / "commons clause" licenses each create downstream uncertainty that suppresses adoption in commercial games.
- AAA studios, indie studios, modders, and AI agents all need a license whose meaning is unambiguous in 2026 and in 2046.

## Decision

Nexus Engine, every official sub-project, every tool in the org (`nexus-engine`, `nexus-cli`, `nexus-agent-sdk`, `nexus-assets`, `nexus-merge`, `nexus-game-template`), every spec, every doc, every example is licensed under the **MIT License**.

- License never changes. Period.
- No dual licensing (no MIT-or-commercial, no GPL-or-commercial).
- No open core. No paid tiers in the core engine.
- Every source file starts with `SPDX-License-Identifier: MIT` and `Copyright (c) 2026 Nexus Engine contributors`. → Law 7.
- Every dependency added to the workspace must be MIT-compatible. Allow-list: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-DFS-2016. MPL-2.0 acceptable only as isolated runtime crates (not statically linked into core). GPL/AGPL/LGPL/SSPL/BUSL/"source available"/"commons clause": forbidden. Enforced by `cargo deny`. → `docs/architecture/04-workspace-layout.md` §`deny.toml`.
- Contributor License Agreement (CLA): **none**. Inbound = outbound (MIT). This avoids the legal capture pattern that enabled past license changes elsewhere.
- Re-licensing is structurally impossible: it would require unanimous agreement of every past contributor. Without a CLA, no single party owns the right to re-license.

## Consequences

### Positive

- **Maximum adoption.** Indie devs, AAA studios, modders, AI agent vendors can all use Nexus in commercial products with zero royalty, zero seat fees, zero runtime fees.
- **Trust.** The community knows the rug cannot be pulled. The CLA-free model is itself a guarantee.
- **No acquisition risk.** Nexus cannot be "acquired and closed" because there is no central entity with the right to relicense.
- **Permissionless forking.** If `nexus-merge` itself goes off-mission, fork it. The community can self-heal.
- **Plays well with closed-source games.** Shipping a commercial closed-source game on top of Nexus is explicitly permitted. The competitor to Unity is born.

### Negative / costs

- **No license-fee revenue.** Nexus cannot be funded by license sales. Funding model must be donations, foundation membership, optional commercial support, sponsor tiers, or grants. Not Nexus's problem to solve in this ADR; flagged for governance ADR [DECISION NEEDED — funding model].
- **No protective copyleft.** A bad actor could fork, close, and re-distribute. We accept this. Linux's history shows the open commons wins over closed forks in the long run.
- **AGPL-licensed dependencies cannot be used** in the core. We accept the smaller dependency set this implies.
- **Patent grant weaker** than Apache-2.0. Mitigated by allowing Apache-2.0 dependencies (which carry stronger patent grants); the union of MIT + Apache-2.0 in the deps tree gives the project meaningful patent coverage.

### Neutral

- The `LICENSE` file in the repo root is the canonical text (https://opensource.org/license/mit/). Every per-file SPDX header references it.
- Asset content shipped with the engine (textures, models, sounds, fonts) MUST also be MIT or CC0 or equivalently permissive. Asset license check runs as part of `nexus-merge`. → `docs/specs/assets/registry.md`.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| **Apache-2.0** | explicit patent grant; mature governance | longer license text; some downstream confusion around NOTICE files | MIT is shorter, simpler, equally adopted; Apache-2.0 dependencies still allowed |
| **MIT + Apache-2.0 dual** | maximum compatibility (Rust ecosystem standard) | dual-license overhead; outbound licensing slightly more complex; "which one applies" confusion downstream | MIT alone is sufficient; we accept Apache-2.0 in deps |
| **MPL-2.0** | weak copyleft on file-level; allows commercial use | file-level copyleft creates uncertainty in renderer/shader pipeline; reduces adoption fear-factor | adoption simplicity wins |
| **GPLv3 / AGPLv3** | strong copyleft, all derivatives open | shipped commercial games would need to release source — destroys studio adoption (Vision target) | violates Vision §"Who This Is For" |
| **BSL / Elastic / SSPL** | revenue protection via time-delayed open | not OSI-approved; downstream uncertainty; would damage trust irreversibly | not real open source |
| **Open Core (MIT core + commercial premium)** | revenue model | community-versus-pro friction; ecosystem fragmentation; misaligned incentives over time | violates Vision §"The Commitment" |
| **CC0 / Public domain** | no restrictions | unenforceable in some jurisdictions; no liability disclaimer | MIT cleaner legally |

This ADR cannot be repealed without first amending the constitutional commitment in `docs/architecture/00-vision.md` §"The Commitment", which is itself immutable for the life of the project.

## Cross-references

- Constitution: `docs/architecture/00-vision.md` §"The Open Source Mandate", §"The Commitment"
- Laws: 7
- Workspace: `docs/architecture/04-workspace-layout.md` §`deny.toml`
- Prior art: `docs/prior-art/unity.md` (AGENT 13)
- External:
  - MIT License: https://opensource.org/license/mit/
  - SPDX identifiers: https://spdx.org/licenses/
  - Unity runtime-fee context (Sept 2023): https://blog.unity.com/news/plan-pricing-and-packaging-updates (and the subsequent walk-back) — historical record
