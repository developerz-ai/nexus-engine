<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Proposed Law #14 — Extend, Don't Fork

> **Status: Ratified as Law #15 — see ADR `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`.**
> Renumbered from "proposed #14" to **Law #15** at ratification because Agent 27 had already taken the #13 slot for Agent–Editor RPC Parity, pushing both this proposal and the Opt-in Modularity proposal by one. Conformance text and enforcement rules below are unchanged from the proposal.
>
> The canonical, ratified law text now lives in `docs/architecture/01-principles.md` §"Law 15 — Extend, Don't Fork". This file survives as the long-form rationale doc per ADR 0010 step 3.
>
> Sibling proposal: Opt-in Modularity (`docs/architecture/06-modularity.md` §"Proposed Law #13"; ratified as **Law #14**).
> Manifesto: `docs/architecture/07-extend-dont-fork.md`.
> Cookbook: `docs/guides/extend-not-fork-cookbook.md`.
> Enforcement spec: `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`.

---

## Status

**Ratified as Law #15 (2026-05-17). See `docs/architecture/05-adr/0010-ratify-laws-13-and-14.md`.**

Original drafting status: `[DECISION NEEDED]` — proposed for architect council. Resolved by the integration pass with renumbering. The canonical text moved verbatim into `docs/architecture/01-principles.md` as Law 15.

---

## Proposed statement (for `01-principles.md`)

## Law 14 — Extend, Don't Fork

**Statement.** Nexus is closed for source modification, open for extension. Every public engine API is a stable extension surface. Every common need has a sanctioned plugin lane (compile-time crate, Cargo feature, runtime plugin, mod, script, agent RPC, editor override). A PR that modifies engine-core source for a feature expressible as an extension is rejected without human review.

**Test of conformance.**

- (a) No PR touches `crates/nexus-{core,renderer,physics,audio,networking,scripting,assets,agent,editor}/src/**` without a linked `Status: Accepted` ADR. Enforced by `nexus-merge` rule `no-engine-source-mod-without-rationale` (`docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`).
- (b) Every extension surface is documented as such: trait declared in its system spec, registered in `docs/specs/crates/categories.md`, stability tier in `docs/specs/crates/stable-api.md`.
- (c) Every common forking motivation has a cookbook entry (`docs/guides/extend-not-fork-cookbook.md`); the cookbook has ≥14 entries at v1.0.
- (d) Engine majors ship a compat shim crate (`nexus-engine-compat-(N-1)`) for one-major back, per `docs/specs/crates/stable-api.md` § "The Compat Shim Pattern".
- (e) Whitelist exceptions (bug fix, perf fix, docstring, deps bump, test-only, compat-shim) are mechanically detected and bypass the gate.

**Rationale.** Every game engine fork in history died: Quake source-mods fragmented; Source SDK derivatives froze when Valve pivoted to per-game Authoring Tools; UE5 fork-merge cost is engineer-weeks per kloc per year. The Open/Closed Principle (Meyer 1988; Martin 1996) is the structural answer: a closed core + open extension surface gives a solo dev the same trajectory as a 1000-engineer studio. Vision §"The Nexus Thesis", §"The Flywheel".

**Enforced by.** `nexus-merge` rule `no-engine-source-mod-without-rationale` (auto-rejects + posts JSON+markdown bot comment); `principle-keeper` subagent (PR review + appeal handling); architect council (ratifies new extension surfaces via ADR).

**Cross-refs.** → `docs/architecture/07-extend-dont-fork.md`, `docs/guides/extend-not-fork-cookbook.md`, `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`, `docs/specs/crates/overview.md`, `docs/specs/crates/categories.md`, `docs/specs/crates/plugin-trait.md`, `docs/specs/crates/stable-api.md`, `docs/specs/mods/overview.md`, `docs/specs/agent/api.md`, `docs/architecture/06-modularity.md`.

---

## Conformance test detail

Mirrors the format of Laws 1–12. Each conformance bullet maps to a check that `nexus-merge` runs on every PR.

| Conformance | Check | Enforcer |
|---|---|---|
| (a) No engine-core mod without ADR | Glob match on `crates/nexus-{core,renderer,...}/src/**` + ADR-link check | `nexus-merge` rule `no-engine-source-mod-without-rationale` |
| (b) Surfaces documented | `docs/specs/crates/categories.md` table row exists for every public trait | `principle-keeper` review + CI lint `category_documented` |
| (c) Cookbook coverage | Cookbook row count ≥ 14 + every row has REASON/SURFACE/EXAMPLE/LINK | CI lint `cookbook_complete` |
| (d) Compat shim present | At major bump, `crates/nexus-engine-compat-(N-1)/` exists and re-exports prior major's public surface | Release pipeline gate |
| (e) Exceptions detected | Whitelist regex on title + path globs | Bot logic in `no-engine-source-mod-without-rationale` spec |

---

## Enforcement chain

```
contributor PR
     │
     ▼
nexus-merge intake
     │
     ├─ Match trigger glob? ──── no ──► standard review flow
     │
     yes
     │
     ▼
Match whitelist exception? ──── yes ──► standard review flow
     │
     no
     │
     ▼
Has linked Status:Accepted ADR? ── yes ──► standard review flow
     │
     no
     │
     ▼
REJECT. Post JSON+md bot comment. Label `policy:needs-adr`. Skip CI.
     │
     ▼
Contributor options:
  1. Rewrite as extension → re-open or new PR
  2. Open ADR → bot re-evaluates on acceptance
  3. Appeal: comment `@principle-keeper review`
     │
     ▼
principle-keeper subagent re-evaluates:
   - lift block (rare; bot misclassified)
   - confirm + cookbook redirect (default)
   - escalate to architect council (legitimate new surface)
```

---

## Amendment process for Law 14 (once ratified)

Per `01-principles.md` § "Amendment process":

1. Open an ADR `docs/architecture/05-adr/NNNN-amend-law-14.md` with full Status / Context / Decision / Consequences / Alternatives.
2. Demonstrate no existing spec depends on the prior wording OR provide a migration plan for every dependent spec (`crates/overview.md`, `crates/categories.md`, `crates/stable-api.md`, `mods/overview.md`, `agent/api.md`, `06-modularity.md`, `07-extend-dont-fork.md`, `extend-not-fork-cookbook.md`, `no-engine-source-mod-without-rationale.md`).
3. Approval by architect council via `docs/guides/integration-team.md`.

Law 14 cannot be repealed if it derives from a vision §"The Commitment" clause. The clauses it inherits from:

- "Be MIT licensed" (forks remain legally permitted; the law constrains practice, not rights).
- "Treat AI agents as first-class users" (forks break AI tooling; this law preserves the tooling promise).
- "Have no single human maintainer as a point of failure" (forks recreate the single-maintainer failure mode at studio scale).

If the council ever wants to weaken Law 14, those three vision clauses force a higher bar than ordinary law amendments.

---

## Open questions (for council review)

- `[DECISION NEEDED]` Whether Law 14 supersedes the implicit "you may always modify engine source if you can defend it" posture in current ADR culture. Default proposal: YES, the rule is the rule; ADRs become the explicit mechanism.
- `[DECISION NEEDED]` Whether the rule applies to `crates/nexus-cli/src/**`. Default proposal: NO — CLI is tooling, not engine surface. (Mirrored in the merge-policy spec.)
- `[DECISION NEEDED]` Whether to ratify Laws 13 and 14 together (they're co-dependent). Default proposal: YES, single ADR `NNNN-laws-13-14-opt-in-modularity-and-no-fork.md`.
- `[VERIFY]` Conformance check (c) cookbook row count: pinned at 14 because that's the v0.1 cookbook size. Bump as new surfaces are added.

---

## Cross-references

- → `docs/architecture/01-principles.md` — destination once ratified.
- → `docs/architecture/06-modularity.md` — sibling Law #13 proposal.
- → `docs/architecture/07-extend-dont-fork.md` — manifesto + decision tree.
- → `docs/guides/extend-not-fork-cookbook.md` — recipe set the law mandates.
- → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md` — enforcement spec.
- → `docs/specs/crates/overview.md`, `categories.md`, `plugin-trait.md`, `stable-api.md`.
- → `docs/specs/mods/overview.md`, `docs/specs/agent/api.md`.
- → `docs/guides/adr-format.md`, `docs/guides/integration-team.md`.
- → `docs/guides/subagent-fleet.md` — `principle-keeper`.

## Mastermind routing note

Once ratified, mastermind raises Law 14 priority equal to Laws 1, 3, and 7 (constitutional-derived). PRs that violate Law 14 are routed to `principle-keeper` first; secondary reviewers see the law-violation block before code review.
