<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# ADR 0011 — Preserve Law 15 across the assets relocation

## Status

Status: Proposed

Date: 2026-11-05
Authors: assets-layout[bot]
Reviewers: human maintainer and integration team (approval pending)

Human and integration approval is required before merge. This proposal does not
grant approval, amend any exception, or authorize automatic merge.

## Context

`nexus-assets` is a Phase 0 scaffold governed by Law 15, regardless of its
directory. Moving it into `packages/` must not remove source protection, SPDX
scanning, review instructions, or coverage policy. The existing style packages
are already under `packages/styles/`; no other group moves in this decision.

## Decision

Relocate exactly these files:

| Old path | New path |
|---|---|
| `crates/nexus-assets/Cargo.toml` | `packages/nexus-assets/Cargo.toml` |
| `crates/nexus-assets/README.md` | `packages/nexus-assets/README.md` |
| `crates/nexus-assets/src/lib.rs` | `packages/nexus-assets/src/lib.rs` |
| `crates/nexus-assets/tests/smoke.rs` | `packages/nexus-assets/tests/smoke.rs` |

Preserve README, source and smoke-test bytes. Change only the manifest's two
outgoing dependency paths; update the Cargo member and eight incoming paths.
Package identity, versions, dependency graph, public APIs and behavior do not
change. No compatibility duplicate remains at the old location.

Replace assets in the protected crates brace glob with the explicit
`packages/nexus-assets/src/**` selector in Law 15, its manifesto, historical
proposal and merge-policy spec. All other protected paths, obligations and
exceptions remain unchanged. This Proposed ADR is not an Accepted ADR.

Update the workspace specification, renderer-assets provider file of record,
testing examples and repository steering documentation. Preserve assets coverage
in Codecov, both tarpaulin profiles, SPDX scanning and source/bench/example review
rules. Add hermetic layout and policy regression tests.

Register `packages/nexus-assets` explicitly in the Bun workspace with minimal
private metadata (`@nexus-engine/nexus-assets`, version `0.1.0`, MIT), no scripts
or dependencies, and matching lock metadata. This is not a JavaScript runtime
package or a change to Rust dependency boundaries.

## Consequences

### Positive

- Assets joins the package layout without weakening Law 15 or existing gates.
- Tests bind the relocation to its dependency, documentation and policy updates.

### Negative / costs

- External consumers using checkout-relative paths must update them.
- Path-sensitive policies now require an explicit assets selector.
- The constitution-adjacent amendment requires human and integration review.

### Neutral

- No asset implementation, new extension surface or performance change.
- Cargo and Bun remain separate workspaces; dependency pins are unchanged.

## Alternatives considered

| Alternative | Pros | Cons | Rejection reason |
|---|---|---|---|
| Keep assets in crates | No path maintenance | Does not deliver package layout | Revisit if layout migration is declined |
| Move every system | Uniform layout | Broad unrelated policy and dependency churn | Only assets is in scope |
| Keep an old copy or symlink | Legacy path compatibility | Duplicate identity or ambiguous protection | One canonical location is simpler |
| Exempt packages from Law 15 | Shorter selectors | Weakens source protection | Location must not determine extension policy |

## Cross-references

- Laws: `docs/architecture/01-principles.md` Law 15
- Manifesto: `docs/architecture/07-extend-dont-fork.md`
- Historical rationale: `docs/architecture/proposed-law-14.md`
- Layout: `docs/architecture/04-workspace-layout.md`
- Specs: `docs/specs/assets/overview.md`, `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`
- Contract: `docs/contracts/renderer-assets.md`
