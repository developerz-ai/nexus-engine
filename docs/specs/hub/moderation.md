<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Moderation

> Index is open by default. Removal is rare and reasoned. Auto-flags for objective signals (CVE, dead URL, license drift). Human moderators for subjective signals. Every action is logged. Every author can appeal.

→ Tier definitions: `docs/specs/crates/quality-bar.md`
→ Endpoint: `POST /api/v1/flag` in `api.md`
→ NSFW gate (mod-side): `docs/specs/mods/nsfw-and-moderation.md`

## Principles

1. **Removal hurts the ecosystem.** Default to "list but warn" over "delist".
2. **Objective > subjective.** A CVE is a fact; "low quality" is a flag.
3. **Reasoned + logged.** Every removal carries `reason` and `actor` in the public audit log.
4. **Appeal-by-default.** Every author can appeal; appeal goes to the council, not the original moderator.
5. **nexus-hub does not own the artifact.** Removal here = removal from the **index**, not from crates.io / Steam / itch.io.

## Flag taxonomy

| Reason | Severity | Auto / human | Default action |
|---|---|---|---|
| `malware` | critical | human (escalated) | quarantine immediately on plausible evidence |
| `cve_high` | high | auto (rustsec) | `tags += ["cve"]`; under_review |
| `cve_critical` | critical | auto | quarantine; require auditor sign-off to lift |
| `license_violation` | high | auto + human | quarantine; notify author; 14-day cure window |
| `license_drift` | medium | auto | flag; notify author; 30-day cure window |
| `dead_url` | low | auto | `tags += ["dead_url"]`; remove from default search after 30d |
| `dead_url` 7d | medium | auto | `moderation.status = "delisted_by_moderator"` |
| `nsfw_unflagged` | medium | human | set `moderation.nsfw = true`; do not delist |
| `spam` | medium | human | quarantine; appealable |
| `impersonation` | high | human | quarantine; require council action to clear |
| `dmca` | depends | human (legal handler) | per-jurisdiction; council handles |
| `other` | low | human | triage |

Severity → SLA → who handles → next-steps documented per-reason in `docs/guides/hub/moderation-playbook.md` (operations doc; not in this spec list).

## Moderation states

```
        ┌──────────┐
   ┌───▶│  clean   │◀─────────────┐
   │    └────┬─────┘              │
   │         │ flagged            │ cleared
   │         ▼                    │
   │  ┌────────────────┐          │
   │  │ under_review   │──────────┘
   │  └──────┬─────────┘
   │         │ confirmed
   │         ▼
   │  ┌────────────────┐  appeal upheld
   │  │  quarantined   │──────────────┐
   │  └──────┬─────────┘              │
   │         │ severe                  ▼
   │         ▼                  back to under_review
   │  ┌─────────────────────┐
   │  │ delisted_by_         │
   │  │ moderator            │
   │  └─────────────────────┘
   │
   │  ┌─────────────────────┐
   └──│ removed_by_author    │      (author DELETE)
      └─────────────────────┘
```

State recorded in `record.moderation.status` (→ `index-format.md` §Moderation).

| State | Visible in default browse? | Visible to agents by default? | Installable via `nexus hub install`? |
|---|---|---|---|
| clean | yes | yes | yes |
| under_review | yes (with badge) | yes (with `tags: ["under_review"]`) | yes (warns) |
| quarantined | only if `?include_quarantined=true` | only with explicit flag | refuses without `--allow-quarantined` |
| delisted_by_moderator | no (only direct URL works) | no | no |
| removed_by_author | no | no | no |

## Auto-flag sources

| Source | Cadence | Produces |
|---|---|---|
| `rustsec/advisory-db` (CVE DB) | hourly | `cve_high` / `cve_critical` |
| Crawler URL health-check | nightly | `dead_url` |
| SPDX validator | every index | `license_drift`, `license_violation` |
| Manifest drift detector | every index | warning; not a flag by itself |
| Duplicate-content heuristic | weekly | `spam` candidate (human review) |
| Cross-reference with GitHub `archived: true` | weekly | `dead_url` advisory |

Source code: `crates/nexus-hub-moderation/`.

## Human moderation queue

```
            ┌───────────────────┐
            │   /admin/queue    │   (admin UI)
            ├───────────────────┤
            │  reason filter    │
            │  severity sort    │
            │  age sort         │
            └─────────┬─────────┘
                      │
                      ▼
            ┌───────────────────┐
            │  ticket detail    │
            │  · context        │
            │  · history        │
            │  · author notes   │
            └─────────┬─────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
     clear        warn          quarantine    delist
                  (badge)                     (with reason)
```

Actions are taken by moderators (council-elected, identified). Every action is signed (Ed25519, same key system as `verification.md`) and appended to the same audit log so external witnesses can verify nothing was tampered with.

## Appeal flow

```
author                          council
  │                                │
  │── POST /api/v1/appeals ───────▶│   { ticket_id, statement, evidence }
  │                                │
  │                                │── distributed to 3 council members
  │                                │── 7-day deliberation window
  │                                │── majority decision signed
  │                                │
  │◄────── decision ───────────────│
  │       { upheld | overturned,   │
  │         reason, signers }      │
```

Decisions are public (at `/api/v1/appeals/{id}`). Author retries possible after 30 days OR after material change.

## DMCA

| Step | Owner |
|---|---|
| Notice received | legal contact at `legal@hub.nexus.engine` |
| Triage | legal handler (not specced here; see `docs/guides/hub/legal-handler.md` to be written) |
| Action | usually `delisted_by_moderator` with `removal_reason: "dmca_notice_{id}"` |
| Counter-notice | author can file; treated as an appeal |

**Important:** even when the index removes a listing, the artifact remains where it lives (crates.io, Steam Workshop, GitHub). We can only delist; we can't take down code we never hosted.

## NSFW gate

NSFW is **not** a removal. It's a metadata flag.

| Setting | Effect |
|---|---|
| Default browse | NSFW hidden |
| `?nsfw=include` query | NSFW shown |
| Authenticated user with `prefs.show_nsfw=true` | NSFW shown by default |
| API `GET /api/v1/mods` | `nsfw=exclude` default; pass `?nsfw=include` |

Authors self-declare in their manifest. Crawler also runs a heuristic; mismatch → `nsfw_unflagged` flag. NSFW policy mirrors the runtime-mod spec at `docs/specs/mods/nsfw-and-moderation.md`.

## Rate limits on flagging

| Caller | Limit | Why |
|---|---|---|
| anonymous | 0 | flagging requires an account |
| authenticated | 20/day | prevents flag-spam |
| trusted reporter (badge) | 200/day | track-record-based unlock |
| author flagging their own record | unlimited | self-takedown is fine |

A user who files many false-positive flags loses flagging privileges (escalating cool-down). Track-record stored in `users.flag_reputation`.

## Author tooling

| Endpoint | Action |
|---|---|
| `DELETE /api/v1/crates/{name}/listing` | self-delist (artifact stays on crates.io) |
| `POST /api/v1/appeals` | open an appeal |
| `GET /api/v1/users/{handle}/flags-received` | see flags against your records |
| `PATCH /api/v1/crates/{name}/manifest` | trigger re-crawl after fixing a flagged manifest |

## Public audit log

Every moderation action enters the same hash-chained append-only log as attestations (`verification.md`):

```json
{
  "offset": 5421,
  "event": "moderation_action",
  "ticket_id": "tk_01J9Z...",
  "target": {"kind": "crate", "name": "nexus-evil-malware"},
  "action": "quarantine",
  "reason": "malware",
  "actor": "moderator-bob",
  "at": "2026-05-15T10:33:00Z",
  "signature_b64": "...",
  "previous_offset_hash": "blake3:..."
}
```

External witnesses verify the chain hourly.

## Pitfalls explicitly named

| Pitfall | Mitigation |
|---|---|
| Moderator drift (capricious removals) | every action signed by a named human; reputation tracked; council can roll back |
| Flag-brigading (coordinated false flags) | reporter-reputation + escalating cool-down |
| Legal pressure to delist legitimate content | federation: other mirrors can keep listing |
| "Verified" badge revoked for non-objective reasons | revocation requires an auditor signature; reasons are public |
| Permanent removal | nothing is permanent in the index; `removed_by_author` is reversible by re-`/submit` |

## Cross-references

- Tier definitions: `docs/specs/crates/quality-bar.md`
- Verification + signing: `verification.md`
- Identity + reputation: `identity.md`
- Mod-side NSFW: `docs/specs/mods/nsfw-and-moderation.md`
- Subagent that staffs the queue: `.claude/agents/hub-curator.md`
