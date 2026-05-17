<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Quality Bar

> Three verification tiers. Auditor playbook is machine-runnable. Audit output is JSON. Verification is a service, not a gatekeep.

→ Overview: `docs/specs/crates/overview.md`.
→ Indexer field: `audit` block in `docs/specs/crates/discovery.md`.
→ Council: `docs/guides/crates/community-policy.md`.

## Tiers

| Tier | Badge | Default for | Display |
|---|---|---|---|
| **Verified** | green check | Council-audited `nexus-*` crates | `✓ verified` in `nexus add` output and on `nexus-hub` |
| **Community** | (none) | Anyone publishing under `nexus-*` / `nexus-community-*` / `nx-*` | Plain entry; CI badge surfaced if author publishes one |
| **Quarantine** | yellow triangle | Flagged for security/license/abuse | `⚠ quarantine: <reason>` banner; install requires `--accept-risk` |

Tier is set per `(crate, version)` pair. A crate can be Verified at `1.2.0` and Community at `1.3.0` until re-audited.

## Tier transition table

| From | To | Trigger |
|---|---|---|
| Community | Verified | Council audit passes; attestation uploaded |
| Verified | Community | New version published; auto-downgrade pending re-audit |
| Community | Quarantine | Security advisory · license violation · Code-of-Conduct violation · spam |
| Verified | Quarantine | Same as above; with Council notification |
| Quarantine | Community | Issue resolved + 30-day cool-down |
| Quarantine | Verified | Issue resolved + full re-audit |

## Auditor Playbook

`nexus crate audit <name>[@<version>]` runs the curator pipeline. Used by Council members manually, by `crate-curator` subagent automatically, and by every PR to `awesome-nexus`.

| Step | Check | Tooling | Pass criterion |
|---|---|---|---|
| 1. Manifest | `[package.metadata.nexus]` valid | `nexus crate audit --manifest` | All required fields, valid enum values |
| 2. License | License ∈ allow-list, file matches SPDX id | `cargo-deny check licenses` | No errors |
| 3. Naming | Conforms to `naming.md` rules | Internal name-lint | No collisions, no typosquats |
| 4. Public API | Surface matches `[surface]` declaration | `cargo public-api`, `cargo-semver-checks` | No undeclared exports |
| 5. Build | Compiles on every supported engine version | `cargo check` matrix | All targets green |
| 6. Headless | Boots cleanly without display | Engine harness | No panic, telemetry only |
| 7. Tests | Pass on every supported engine version | `cargo nextest` | All green |
| 8. Coverage | Meets category floor | `cargo-llvm-cov` | ≥ category-specific floor |
| 9. Scenario | At least one scenario test passes | `nexus crate test --scenarios` | ≥ 1 scenario green |
| 10. Bench (if perf claim) | Matches Performance Contract | `nexus crate test --benches` | Within hard limit |
| 11. Determinism (if `deterministic = true`) | Replay parity | Engine determinism harness | Bit-identical snapshots |
| 12. Supply chain | No CVEs, no GPL transitive, no yanked deps | `cargo-deny`, `cargo-audit` | No errors |
| 13. `unsafe` audit | Counted, justified | `cargo-geiger`, manual review | No unjustified `unsafe`; trend flat or down |
| 14. Provenance | Repo public, releases tagged, SBOM published | Manual + `cosign verify` (if signed) | Repo reachable; tag matches version |
| 15. Code-of-Conduct | No abusive content | Manual + content scan | Pass |

Total: 15 checks. Verified tier requires all 15 pass. Failure of 1-2 minor checks (e.g., docs coverage) → "Verified with notes". Failure of any 3+ → Community. Failure of license, supply-chain, or CoC → Quarantine.

## Audit JSON output

```json
{
  "schema_version": "1.0",
  "crate": "nexus-style-anime",
  "version": "0.3.1",
  "audited_at": "2026-05-10T12:00:00Z",
  "auditor": {
    "kind": "council-member",
    "id": "council:5",
    "name": "alice"
  },
  "playbook_version": "1.0",
  "verdict": "verified",
  "score": 0.94,
  "checks": [
    { "id": "manifest", "status": "pass" },
    { "id": "license", "status": "pass", "detail": "MIT, allow-list ok" },
    { "id": "naming", "status": "pass" },
    { "id": "public-api", "status": "pass" },
    { "id": "build", "status": "pass", "targets": ["x86_64-linux", "wasm32", "aarch64-apple-darwin"] },
    { "id": "headless", "status": "pass" },
    { "id": "tests", "status": "pass", "count": 64 },
    { "id": "coverage", "status": "pass", "value": 0.83, "floor": 0.70 },
    { "id": "scenario", "status": "pass", "count": 3 },
    { "id": "bench", "status": "skip", "reason": "no perf claim" },
    { "id": "determinism", "status": "skip", "reason": "deterministic=false for style" },
    { "id": "supply-chain", "status": "pass", "cves": 0 },
    { "id": "unsafe", "status": "pass", "count": 0 },
    { "id": "provenance", "status": "pass" },
    { "id": "coc", "status": "pass" }
  ],
  "notes": [],
  "next_review_due": "2026-11-10T00:00:00Z"
}
```

Uploaded to `nexus-hub` via `POST /v1/attest`. Cached in the crate's repo at `.nexus/audit/<version>.json` so the audit travels with the source.

## Per-category audit adjustments

| Category | Extra checks |
|---|---|
| `physics` | Determinism replay across `x86_64` + `aarch64` |
| `net` | Adversarial fuzz (malformed packets, abort mid-handshake) |
| `style` | Visual regression vs reference scene |
| `audio` | Spectrum diff vs reference render |
| `asset-source` | Offline-mode test (mock the upstream API) |
| `telemetry-sink` | High-rate ingest test (drop policy, backpressure) |
| `feature-flag` | Offline / network-partition fallback |
| `script-lang` | Sandbox escape fuzz |
| `platform` | Cert-relevant API surface (when applicable) |

## Re-audit cadence

| Trigger | Action |
|---|---|
| New minor or major version | Re-audit required for Verified status |
| New patch version | Audit auto-renewed if `cargo-semver-checks` reports no breaking change |
| 6 months since last audit | Renewal reminder; auto-downgrade to Community at 12 months |
| CVE disclosed in dep tree | Forced re-audit within 7 days |
| Maintainer change | Re-audit recommended (Council discretion) |

## Curator subagent

`crate-curator` (Opus, `.claude/agents/crate-curator.md`) runs the playbook end-to-end. Workflow:

1. `nexus crate fetch <name>@<version>` → pull source to a sandboxed worktree.
2. Run the 15-step pipeline. Capture JSON.
3. Manual review of `unsafe`, public API design, naming, CoC. Cannot be skipped.
4. Verdict → upload attestation → notify maintainer.

## Quarantine

A crate enters Quarantine via:
- `nexus crate audit --flag <name> --reason "<text>" --evidence <url>` (Council members only).
- Auto-flag on CVE disclosure (RustSec advisory matching dep tree).
- Auto-flag on yanked dependency (Verified tier; warning for Community).

Effects:
- `nexus-hub` shows banner: `⚠ quarantine: <reason>`.
- `nexus add <name>` requires `--accept-risk` and prints the reason.
- `cargo-deny` integration optionally blocks (config opt-in).
- Existing `Cargo.lock` consumers are not auto-removed; CI warns.

Recovery: maintainer fixes the issue, re-runs audit, requests re-evaluation via `nexus crate audit --request-recheck <name>`. → `docs/guides/crates/community-policy.md`.

## Anti-gaming

| Risk | Mitigation |
|---|---|
| Verified the audited version, then publish a malicious patch | Auto-downgrade on new version; consumer pin via `Cargo.lock` |
| Inflate downloads via bot | Health signal is a hint, not a tier gate |
| Self-attest as Verified | Attestation upload requires Council key; signature checked on indexer side |
| Squat verified-looking name | Naming policy + index banner. → `docs/specs/crates/naming.md` |

## Integration Points

- → `docs/specs/crates/manifest.md` — `audit_log_url`, `vet_attestation`, `sbom` fields drive the playbook.
- → `docs/specs/crates/security.md` — supply-chain checks are a strict subset.
- → `docs/specs/crates/discovery.md` — `audit` block in index entry.
- → `docs/guides/crates/community-policy.md` — Council governance.
- → `.claude/agents/crate-curator.md` — subagent implementing the playbook.

## Open Questions

- `[DECISION NEEDED]` Verified-tier renewal: 6 vs 12 months? Default: 6 months reminder, 12 months auto-downgrade.
- `[DECISION NEEDED]` Whether Quarantine downloads should be blocked outright or warn-on-install. Default: warn (preserve user agency).
- `[BENCHMARK NEEDED]` Full playbook run-time per crate. Target: ≤ 10 minutes wall-clock for a typical Verified-tier candidate.
- `[AGENT: 16]` Confirm `nexus-merge` can consume audit JSON for cross-PR signal.
