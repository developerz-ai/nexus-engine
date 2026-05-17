<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0010 — Ratify Modularity + Extend-Don't-Fork as Laws #14 and #15

> Numbering note. The proposals in `docs/architecture/06-modularity.md` and `docs/architecture/proposed-law-14.md` were drafted as Laws #13 and #14 respectively. Between drafting and ratification, Agent 27 inserted **Law #13 — Agent–Editor RPC Parity** into `docs/architecture/01-principles.md`. The integration pass resolves the collision by renumbering: Opt-in Modularity = **Law #14**; Extend, Don't Fork = **Law #15**. Conformance text, enforcement rules, and cross-refs are unchanged; only the law numbers move.

## Status

`Accepted`

Date: 2026-05-17
Authors: integration-resolver (post-32-agent integration pass)
Reviewers: architect council, principle-keeper

Supersedes: nothing. Co-ratifies the two proposals authored in Agent 29 (`docs/architecture/06-modularity.md`) and Agent 31 (`docs/architecture/07-extend-dont-fork.md`, `docs/architecture/proposed-law-14.md`).

## Context

Two architectural manifestos landed in parallel and proposed sibling additions to the Binding Laws (`docs/architecture/01-principles.md`):

- **Opt-in Modularity** (Agent 29, drafted as proposed #13). Statement: no game compiles code it does not declare. Every genre, every style, every physics extension, every networking backend, every audio DSP pack is a separate crate OR a Cargo feature, default-off unless required by `nexus-core`.
- **Extend, Don't Fork** (Agent 31, drafted as proposed #14). Statement: Nexus is closed for source modification, open for extension. Every common need has a sanctioned plugin lane (compile-time crate, Cargo feature, runtime plugin, mod, script, agent RPC, editor override). A PR that modifies engine-core source for a feature expressible as an extension is rejected without human review.

Between drafting and ratification, Agent 27 took the #13 slot for **Agent–Editor RPC Parity** (already accepted as Law #13). The two proposals are therefore renumbered:

Both proposals derive from the same constitutional commitments: AI-first (Law 1), Spec Before Code (Law 2), Sacred Module Boundaries (Law 3), MIT Forever (Law 7). Both are load-bearing for the 100M-LOC thesis (`docs/initial/vision.md` §"The Nexus Thesis"). Both were flagged for joint ratification in Agent 31's open questions (`docs/architecture/proposed-law-14.md` §"Open questions").

## Decision

**Ratify both proposals together as Laws #14 (Opt-in Modularity) and #15 (Extend, Don't Fork).**

1. Law #14 — Opt-in Modularity — text per `docs/architecture/06-modularity.md` §"Proposed Law #13", inserted into `docs/architecture/01-principles.md` immediately after Law #13 (RPC Parity).
2. Law #15 — Extend, Don't Fork — text per `docs/architecture/proposed-law-14.md` §"Proposed statement (for `01-principles.md`)", inserted into `docs/architecture/01-principles.md` immediately after Law #14.
3. `docs/architecture/proposed-law-14.md` updates its status header to `Status: Ratified as Law #15 — see ADR 0010` and survives as the long-form rationale doc.
4. `docs/architecture/06-modularity.md` §"Proposed Law #13" relabels to "Ratified as Law #14 — see ADR 0010"; cross-link added.
5. The `01-principles.md` summary table grows from 13 to 15 rows.
6. `CLAUDE.md` mastermind table grows from 13 to 15 rows; Law #15 routing is raised equal to Laws 1, 3, and 7 (constitution-derived).

## Consequences

### Positive

- The 100M-LOC compile graph is a proper subset of the workspace by law, not by convention.
- Every common forking motivation has a sanctioned plugin lane and a cookbook entry — community velocity rises; ecosystem fragmentation falls.
- `nexus-merge` gains two named lints (`feature_gate_required_for_cross_genre_dep`, `no-engine-source-mod-without-rationale`) that match auditable rules.
- The solo dev inherits the same extension surface as a 1000-engineer studio.

### Negative / costs

- Stable-API discipline becomes hard requirement, not best practice. `docs/specs/crates/stable-api.md` carries real teeth — each tier change is breaking.
- One-major compat shim (`nexus-engine-compat-(N-1)`) is now a release-pipeline gate (Law 14 conformance check (d)). Adds release engineering work.
- `cargo deny` edge allow-list grows; PRs touching `Cargo.toml` graph need explicit ADRs more often.
- Cookbook (`docs/guides/extend-not-fork-cookbook.md`) MUST stay ≥ 14 entries to satisfy Law 14 conformance check (c).

### Neutral

- Forks remain legally permitted (MIT). The law constrains practice, not rights.
- Whitelist exceptions (bug fix, perf fix, docstring, deps bump, test-only, compat-shim) bypass the gate mechanically; honest small changes do not need an ADR.

## Alternatives considered

- **Ratify Law #13 only; defer #14 to next cycle.** Rejected: the two laws are co-dependent — opt-in modularity assumes extension surfaces exist, and extension surfaces assume default-off opt-in. Splitting the ratification leaves a window where contributors can fork "because there is no other lane yet."
- **Ratify Law #14 only; defer #13.** Rejected: extension surfaces without opt-in modularity reintroduce compile-graph explosion. The two laws are halves of one rule.
- **Ratify as one combined Law #13.** Rejected: the two ideas are independently testable, independently enforced, and have separate enforcement mechanisms. Keeping them as two laws gives merge-bot two named gates.
- **Hold both for an additional architect council window.** Rejected: blocks downstream work — `crate-author`, `mod-author`, `principle-keeper`, and the cookbook all depend on the laws being live. The proposals have been visible since Agents 29 + 31 landed; the integration pass is the right moment.

## Implementation checklist

- [x] Law #13 (RPC Parity, Agent 27) verified present.
- [x] Law #14 (Opt-in Modularity) appended to `docs/architecture/01-principles.md` (integration pass).
- [x] Law #15 (Extend, Don't Fork) appended to `docs/architecture/01-principles.md` (integration pass).
- [x] Summary table updated (15 rows).
- [x] `docs/architecture/proposed-law-14.md` status header → `Ratified as Law #15 — see ADR 0010`.
- [x] `docs/architecture/06-modularity.md` §"Proposed Law #13" relabeled to "Ratified as Law #14".
- [x] `CLAUDE.md` Non-Negotiables table → 15 rows; routing note for Law 15.
- [x] `docs/architecture/decisions-resolved.md` records the ratification.
- [ ] `nexus-merge` rule registrations (`feature_gate_required_for_cross_genre_dep`, `no-engine-source-mod-without-rationale`) — code work, next session.
- [ ] `docs/guides/extend-not-fork-cookbook.md` cited as having ≥ 14 entries — verify count, next session.

## Cross-references

- → `docs/architecture/01-principles.md` — destination of both ratified laws.
- → `docs/architecture/06-modularity.md` — Law #13 manifesto.
- → `docs/architecture/07-extend-dont-fork.md` — Law #14 manifesto.
- → `docs/architecture/proposed-law-14.md` — Law #14 long-form rationale (status updated).
- → `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md` — Law #14 enforcement spec.
- → `docs/guides/extend-not-fork-cookbook.md` — cookbook required by Law #14 conformance.
- → `docs/specs/crates/stable-api.md` — compat shim policy required by Law #14 conformance (d).
- → `docs/specs/crates/categories.md` — extension surface registry required by Law #14 conformance (b).

## Amendment

Per `docs/architecture/01-principles.md` §"Amendment process": either law can be amended only via a `NNNN-amend-law-N.md` ADR with full Status / Context / Decision / Consequences / Alternatives + migration plan. Repeal is constrained by the vision §"The Commitment" clauses each law inherits.

## Renumbering migration note

If you author or review docs predating 2026-05-17, "Proposed Law #13" (Opt-in Modularity) is now **Law #14**; "Proposed Law #14" (Extend, Don't Fork) is now **Law #15**. Conformance text is unchanged. The shift is purely an integer collision with Agent 27's RPC Parity law, which took the #13 slot first.
