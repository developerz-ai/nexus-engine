<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Community Policy & Governance

> Verification Council governs the Verified tier. AI-first by design: at least one Council seat is reserved for an AI maintainer. Conflict-of-interest declared. Sunset policy for unmaintained crates. Squat / takedown rules documented.

→ Quality bar (the playbook the Council runs): `docs/specs/crates/quality-bar.md`.
→ Naming policy (what the Council protects): `docs/specs/crates/naming.md`.
→ Engine-wide merge policy (analogous): `docs/guides/merge-system.md`.

## The Verification Council

**RESOLVED 2026-05-17 — 5 seats, 6-month rotating terms, at least one seat reserved for a non-Anthropic AI maintainer.** Locked. See `docs/architecture/decisions-resolved.md`.

| Seat | Filled by |
|---|---|
| 1. Engine maintainer | A `nexus-engine` core maintainer (typically `architect` subagent or a human delegate) |
| 2. Security reviewer | A `security-reviewer` subagent or partnered security engineer |
| 3. Community representative | Elected from active community contributors (≥ 3 published Verified crates) |
| 4. License + legal | A reviewer with FOSS license fluency |
| 5. AI maintainer (non-Anthropic-only) | Reserved for an AI agent run by a partner org / different model family — prevents single-vendor capture |

Council acts by simple majority (3 of 5) on routine decisions. Quarantine reversal and tier-policy changes require 4 of 5.

## What the Council does

| Activity | Cadence |
|---|---|
| Verify new submissions | On request; SLA 14 days |
| Re-verify on minor/major releases | On publish; SLA 7 days |
| Re-audit on CVE disclosure | Immediate; SLA 72 hours |
| Flag for Quarantine | On evidence; SLA 24 hours |
| Resolve Quarantine | On request + remediation; SLA 14 days |
| Name reservation review | Weekly batch |
| Awesome-nexus auto-PR review | Daily |
| Policy amendment | As needed; ADR-tracked |

## Conflict-of-interest rules

| Conflict | Required action |
|---|---|
| Council member is author of a crate under review | Recuse from that decision; another member runs the playbook |
| Council member is employee of a vendor whose crate is under review | Disclose; recuse if asked |
| Council member receives funding from a marketplace integrating with `nexus-hub` | Disclose; recuse on marketplace-specific decisions |
| Council member's employer ships a competing crate | Disclose; recuse |

All disclosures public in `docs/architecture/decisions-open.md` under a `crates-council` heading.

## Tier promotion request

Author submits:

```
nexus crate audit nexus-style-anime --request-verification
```

Files an issue against the Council queue. Issue includes:
- Crate name + version.
- Manifest block dump.
- Coverage + scenario report.
- Audit log URL (if author ran self-audit).
- Conflict-of-interest declarations (author-side).

Council assigns a curator (`crate-curator` subagent or human). Curator runs the 15-step playbook (`docs/specs/crates/quality-bar.md`). Verdict posted as audit JSON within SLA.

## Tier downgrade

Auto-triggers:
- New version published (auto-downgrade to Community pending re-audit).
- CVE filed in dep tree (auto-Quarantine for critical; Community for medium).
- License change (Community → Quarantine if license leaves allow-list).
- 12 months since last audit (Verified → Community).

Manual:
- Council vote on evidence of malicious behavior, abandonment, or policy violation.

## Quarantine resolution

Author flow:
1. Read the Quarantine reason in `nexus crate health <name>`.
2. Ship a patch addressing it.
3. `nexus crate audit <name> --request-recheck`.
4. Council re-runs playbook; on pass, tier reverts to Community (and a fresh Verified application can follow).

## Squat takedown

Crates.io does not delete; the Council's recourse is bounded:
- Name reservation (pre-publish, prevents future squat).
- Banner in `nexus-hub` index marking the squat.
- Auto-PR to `awesome-nexus` to omit the squat.
- Application to crates.io for abandoned-crate transfer per policy (slow, manual, last resort). Cite: `https://crates.io/policies`.

A "squat" is defined as: a `nexus-*` name held by a publisher who is not the Council's designated maintainer, with no published code other than placeholder, no maintenance in 12+ months.

## Sunset policy

A crate is "sunset" when:
- No release in 12 months.
- No activity (commits, issues, PRs) in 12 months.
- Maintainer unreachable for 90 days after Council contact.

Sunset effects:
- Tier downgrades to Community.
- `nexus-hub` shows banner: "no recent activity".
- `nexus add` warns at install.
- `awesome-nexus` entry moved to "sunset" section.

Sunset recovery:
- Original maintainer returns + cuts a release → banner cleared.
- New maintainer takes over via transparent transfer → audit re-run; banner cleared.

## Code of Conduct

The Nexus Engine Code of Conduct applies to all Council activity, all `awesome-nexus` PRs, all crate maintainer interactions. Council enforces.

`[DECISION NEEDED]` Final CoC text. Default proposal: adopt the Rust Code of Conduct (`https://www.rust-lang.org/policies/code-of-conduct`) verbatim.

## Council elections

Seats 3 (community representative) and 5 (AI maintainer) elected.

Eligibility:
- Seat 3: ≥ 3 published Verified crates, ≥ 12 months activity, no Quarantine history in past 12 months.
- Seat 5: nominated by an org operating an AI maintainer for at least one Nexus project; org publicly identified.

Process:
- Nominations open 30 days before term end.
- Voting: weighted by (a) verified-crate authorship, (b) community contributions, (c) AI-model usage in nexus-coder runs. Detail: `[DECISION NEEDED]` final weights.
- Single transferable vote.
- Results public; ties broken by random Council vote.

## Council members' rights and responsibilities

Rights:
- Sign attestations (Verified tier).
- Vote on policy.
- Flag Quarantine.
- Recommend names for reservation.

Responsibilities:
- Run audits within SLA.
- Document decisions in audit JSON + Council minutes.
- Recuse on conflicts.
- Treat all interactions per Code of Conduct.
- Not publish a personally-authored crate as Verified without independent Council review.

## Anti-capture protections

| Risk | Mitigation |
|---|---|
| One vendor dominates Council | Seat 5 reserved for non-Anthropic AI; community elects Seat 3 |
| Council gates entry to ecosystem | Verified is opt-in; Community is the default; ecosystem grows without Council |
| Council favors big crates | All audits use the same 15-step playbook; deviation requires Council vote |
| Single human bus-factor | AI seats (1, 2, 5) ensure continuity; rotation prevents lock-in |

## Decision log

All Council decisions logged to `docs/architecture/decisions-open.md` under `crates-council` heading, then archived to `docs/architecture/05-adr/crates-council-NNNN.md` per the standard ADR format (`docs/guides/adr-format.md`).

## Cross-references

- → `docs/specs/crates/quality-bar.md` — the audit playbook.
- → `docs/specs/crates/naming.md` — Council protects the namespace.
- → `docs/specs/crates/release-pipeline.md` — Council attestation upload.
- → `docs/architecture/decisions-open.md` — open Council decisions.
- → `docs/guides/merge-system.md` — engine-side analog (this mirrors the discipline).
- → `.claude/agents/crate-curator.md` — the Opus subagent operating Council audits.

## Open Questions

- `[DECISION NEEDED]` Final Council seat composition. Default: 5 seats, 1 AI-other-vendor reserved. Track in `docs/architecture/decisions-open.md`.
- `[DECISION NEEDED]` Voting weights for Seat 3/5 elections.
- `[DECISION NEEDED]` Whether `nexus-hub` operator is the Council, a separate body, or rotating volunteer. Default: Council operates the reference instance; anyone may run a mirror.
- `[DECISION NEEDED]` Adopt Rust CoC verbatim vs author Nexus-specific. Default: adopt verbatim.
- `[VERIFY — crates.io policy]` Abandoned-crate transfer procedure at v1.0 ship date.
