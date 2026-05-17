<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Verification

> The Verified tier is the only thing nexus-hub fully owns. Signed Ed25519 attestations. Append-only public audit log. Revocable. Expires. Reputation flows from here.

→ Tier definitions (Verified / Community / Quarantine): `docs/specs/crates/quality-bar.md`
→ Attestation schema: `index-format.md` §Attestation
→ Endpoint: `POST /api/v1/attest` in `api.md`

## Tier table (recap)

| Tier | Who decides | Sandbox | Default for new |
|---|---|---|---|
| Verified | signed attestation from an auditor on the council | none (full trust) | no |
| Community | passed validator; no audit yet | none | yes (default) |
| Quarantine | moderation flag pending | restricted from agent recommendations | when flagged |

Authoritative tier table: `docs/specs/crates/quality-bar.md`. [INTEGRATION NEEDED] — this spec assumes that exists; if Agent 28's wording differs, that doc is source of truth.

## Why signed attestations

| Approach | Trust model | Verifiable offline | Pitfall |
|---|---|---|---|
| Trust-the-hub badge | hub admin says so | no | hub compromise → all badges fake |
| Crowd ratings only | wisdom of crowds | yes | brigadable; misses subtle issues (perf, license) |
| **Signed attestations** | **named auditor signs a claim** | **yes (Ed25519 verify)** | key management |
| TUF-style | meta-signatures over the index | yes | high implementation cost; overkill for index records |

We pick signed attestations because they survive a hub compromise: an agent that downloaded the snapshot last week can re-verify today without trusting the hub at all.

## Auditor identities

| Identity kind | Example | How keys are managed |
|---|---|---|
| `audit-council-NN` | `audit-council-01` | engine governance multi-sig; rotated yearly |
| `studio-{name}` | `studio-nexus-foundation` | studio holds its own keys; rotated per their policy |
| `individual-{handle}` | `individual-alice` | personal hardware key; rotated annually |

All public keys published at `GET /api/v1/keys` and pinned in the official hub's Git repo (`hub/keys/`). New keys announced 30 days in advance with cross-signatures from existing council keys.

## Attestation blob — canonical shape

```json
{
  "id": "att_01J9YH4W5GZ8Q3JK0X2VBNRPTM",
  "target": { "kind": "crate", "name": "nexus-genre-survival-extreme" },
  "version": "0.4.2",
  "audited_at": "2026-03-12T14:22:00Z",
  "expires_at": "2026-09-12T14:22:00Z",
  "auditor": "audit-council-01",
  "signing_key_id": "audit-council-01-2026",
  "results": {
    "license_ok":         true,
    "no_known_cves":      true,
    "headless_safe":      true,
    "deterministic":      true,
    "scenarios_passed":   true,
    "perf_contract_met":  true,
    "notes": "Passes all categories' criteria in docs/specs/crates/quality-bar.md. Re-audit after engine 0.5 release."
  }
}
```

The above object is **canonicalized** per RFC 8785 (JCS), then signed Ed25519. The signature is delivered alongside in the API envelope:

```json
{
  "attestation": { /* above */ },
  "signature_b64": "MEUCIQDf...",
  "signing_key_id": "audit-council-01-2026"
}
```

## Signing scheme

| Property | Value |
|---|---|
| Algorithm | Ed25519 (RFC 8032) |
| Canonicalization | RFC 8785 JSON Canonicalization Scheme |
| Hash inside signature | implicit (Ed25519 hashes internally) |
| Signature encoding | unpadded base64url |
| Key rotation | annual; old key valid for verification 12 months after rotation |
| Key revocation | published to `GET /api/v1/keys/revoked` with effective-date |

## Submit flow

```
auditor                                hub
  │                                       │
  │── prepare attestation JSON ───────────│
  │── canonicalize (RFC 8785)             │
  │── sign Ed25519 with active key        │
  │                                       │
  │── POST /api/v1/attest ───────────────▶│
  │   body: { attestation, signature_b64, │
  │           signing_key_id }            │
  │                                       │
  │                                       │── verify signature
  │                                       │── verify auditor active
  │                                       │── verify target exists
  │                                       │── verify version exists
  │                                       │── append to audit log
  │                                       │── update crate.verification
  │                                       │── push to federation outbox
  │◄────── 201 Created ───────────────────│
  │        { id, audit_log_offset,        │
  │          canonical_url }              │
```

The hub's role is verifying the signature and appending to the log. It does NOT do the audit work. The auditor does.

## Audit playbook (referenced)

Auditor playbook lives at `docs/specs/crates/quality-bar.md` — that's Agent 28's spec. Summary in the spirit of what we expect a council audit to cover:

| Area | Check |
|---|---|
| License | SPDX expression resolves; compatible with MIT engine; no GPL leaks |
| CVEs | `cargo audit` clean; transitive deps clean |
| Headless safety | runs in `--headless` mode without panic |
| Determinism | replay of recorded scenarios yields identical output |
| Scenarios | author's declared scenarios pass; council adds 3 stress scenarios |
| Perf contract | declared perf targets met under bench harness |
| API surface | only stable engine API used; no nightly features |
| Build reproducibility | `build_hash` matches across two clean builds |

Pass = signed attestation. Fail = council issues a `flag` with reason; the crate remains `community` tier unless escalated to `quarantine` by moderation.

## Audit log

Append-only. Public. Queryable.

```
GET /api/v1/attestations?since=2026-05-01&auditor=audit-council-01
```

Each log entry:

```json
{
  "offset": 4821,
  "event": "attest_issued",
  "attestation_id": "att_01J9YH...",
  "at": "2026-03-12T14:22:00Z",
  "previous_offset_hash": "blake3:..."   // chained
}
```

The `previous_offset_hash` chains entries. Any tampering of an old entry breaks the chain for all subsequent entries. The hash chain head is published to a public git repo (`hub/audit-log/HEAD`) every hour for external witnesses.

## Revocation

An attestation can be revoked. Reasons:

| Reason | Trigger |
|---|---|
| CVE found post-audit | auditor revokes; crate auto-flagged |
| License changed | crawler detects; revocation issued |
| Maintainer compromise | council emergency revoke (multi-sig required) |
| Auditor key compromise | all attestations under that key revoked |

Revocation is itself a signed event:

```json
{
  "id": "rev_01J9Z...",
  "revokes": "att_01J9YH...",
  "reason": "cve_found_post_audit:CVE-2026-1234",
  "revoked_at": "2026-06-01T09:00:00Z",
  "auditor": "audit-council-01"
}
```

`GET /api/v1/attestations/{id}` returns `revoked: true` after revocation, with `revoked_reason` populated.

## Key rotation

```
year N           year N+1
  │                  │
  ▼                  ▼
key-N    overlap    key-(N+1)
        ◄──60d──►
```

- 60-day overlap: both keys valid.
- Council members cross-sign the new key with the old.
- After overlap, old key is moved to `revoked` (verification still possible — only signing prohibited).
- New attestations always use the latest key.
- An agent verifying an old attestation can still find the right key in `/api/v1/keys/historical`.

## Verifying offline (the load-bearing property)

An agent that downloaded `/api/v1/index.json` last week can today, with no hub access:

```
1. Read crate.verification.attestation_id
2. Fetch the attestation blob (cached locally or from any mirror)
3. Fetch the signing key (pinned in nexus-hub git repo)
4. Canonicalize attestation (RFC 8785), verify Ed25519
5. Check expires_at and revoked list
6. Trust accordingly
```

No trust in any live network service required. This is the property that makes signed-attestations worth the key-management cost.

## Expiry

| Tier | Expiry |
|---|---|
| Verified | 6 months by default; configurable per attestation |
| Verified (post-1.0 of crate) | 12 months |
| Quarantine | indefinite until cleared |

Expired attestations stay in the log, marked `expired: true`. Crate auto-downgrades to `community` until re-audited.

## Pitfalls explicitly named

| Pitfall | Mitigation |
|---|---|
| Auditor compromise → mass forge | Hardware keys; multi-sig for council; key rotation |
| Replay of old signed attestation against a new crate version | `version` field is part of the signed payload |
| Two slightly-different JSON encodings, two signatures | RFC 8785 canonicalization |
| Hub compromise hides revocations | Hash-chained audit log + external git mirror |
| Verified-but-shady (audit was sloppy) | Public log surfaces auditor track record; reputation per auditor |
| Auditor disappears | Council can re-issue under a new auditor identity |

## Cross-references

- Tier policy: `docs/specs/crates/quality-bar.md`
- Audit log endpoint: `api.md` §`/api/v1/attestations`
- Subagent that runs the playbook: `.claude/agents/hub-curator.md`
- Signing crate (planned): `crates/nexus-hub-attest`
