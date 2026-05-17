<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Identity

> Accounts are optional for browsing, required for write actions. GitHub OAuth is the default. No email required to publish. Hardware-key MFA for high-trust roles. Reputation flows from real signal.

→ Auth header conventions: `api.md` §Authentication
→ Verification roles: `verification.md`
→ Moderation roles: `moderation.md`

## Account-less by default

| Action | Account needed? |
|---|---|
| Browse any listing | no |
| Search | no |
| Download `/api/v1/index.json` | no |
| Read attestations + audit log | no |
| Submit a new artifact for indexing | yes |
| Rate, review, flag | yes |
| Issue or revoke attestations | yes + role |
| Run a mirror that registers with the federation | yes (mirror identity, not personal) |
| Operate the moderation queue | yes + role |

## Identity providers

| Provider | Use | MFA |
|---|---|---|
| GitHub OAuth | default for publishers (their GitHub handle suffices) | per GitHub policy |
| GitHub OIDC | studio orgs (org membership flows through) | per org |
| Email magic-link | users without GitHub | TOTP optional |
| Passkey (WebAuthn) | available for all account types | yes (the MFA factor itself) |
| Hardware key (FIDO2) | required for attestation-signing accounts and moderators | yes |

GitHub OAuth precedent: crates.io uses the same model. We deliberately match so a `crates.io` publisher needs zero new accounts.

## Account record

→ Schema in `index-format.md` §User. Recap:

| Field | Notes |
|---|---|
| `handle` | unique, immutable after first 7 days, lowercase, `[a-z0-9-]+`, 2–30 chars |
| `display_name` | mutable, free text up to 64 chars |
| `avatar_url` | mutable; defaults to GitHub avatar if linked |
| `bio` | up to 1000 chars |
| `github_handle` | optional but recommended |
| `email` | optional; never required to publish |
| `linked_crates`, `linked_mods` | derived; updated on every crawl |
| `reputation` | computed; → §Reputation below |

## Email is optional

A publisher with only a GitHub OAuth login never needs to give us their email. We can still:
- Notify them via GitHub (e.g. open an issue in their repo for a critical flag).
- Send them webhooks for events they subscribed to.

Email is required only if:
- They opt into email digests.
- They want password-reset for an email-magic-link account.
- They are a council moderator (we must be able to reach them).

## Tokens

| Token | Issued via | Scope | Lifetime |
|---|---|---|---|
| `nx_pat_*` | `/account/tokens/new` | bitset: `submit`, `rate`, `flag`, `attest`, `admin` | 1 year default; user-configurable |
| `nx_session_*` | OAuth callback | session cookie | 24h sliding; refreshed silently |
| `nx_webhook_*` | `/account/webhooks/new` | webhook delivery only | indefinite until revoked |
| `nx_mirror_*` | `/api/v1/mirrors/register` | federation pull at elevated rate | indefinite; rotatable |

Tokens shown once at creation; only a prefix and hash stored. Compromised token → revoke → new one. All token usage logged with IP + UA in `account.audit_log`.

## Reputation

`reputation` is a 0..1 composite score updated nightly. Used as a discovery signal, not for moderation power.

| Signal | Weight | Direction |
|---|---|---|
| `downloads_recent_90d` across user's records (log-scaled) | 0.30 | + |
| Attestations passed (Verified-tier achievement) | 0.20 | + |
| Auditor pass-rate on their submissions | 0.15 | + |
| Quality flags received against their records | 0.20 | − (decays with cure) |
| Account age (logistic, plateaus at 2 years) | 0.05 | + |
| Verified contact (email + GitHub linked) | 0.05 | + |
| Council moderator role | 0.05 | + (badge, not multiplier) |

Reputation NEVER affects ranking of other users' work — only the publisher's own surfacing (e.g. "trending publisher" lists). Recommendation engines may use it as a feature; tiebreaker only.

## Roles

| Role | Powers | Granted by |
|---|---|---|
| `user` | submit, rate, flag (within limits) | default on signup |
| `auditor` | issue/revoke attestations under their key | council vote |
| `moderator` | act on flags, change `moderation.status` | council vote |
| `council` | accept new auditors/moderators; emergency revoke; appeal decisions | charter (initial set bootstrapped from engine governance) |
| `mirror-operator` | register a mirror, declare canonical namespaces for it | self-claim; verified by ownership of `<host>/.well-known/nexus-hub.json` |
| `admin` | platform operations (read-only audit log access; never edit log) | hub-foundation employees |

All role grants are signed events in the audit log. No silent role escalation possible.

## Privacy

| Datum | Public | Visible to user | Visible to staff |
|---|---|---|---|
| `handle`, `display_name`, `avatar` | yes | yes | yes |
| `bio` | yes | yes | yes |
| `email` | no | yes | only with legal cause |
| IP addresses | no | redacted in their own audit log | yes (rate-limit forensics; 30d retention) |
| `linked_crates` | yes | yes | yes |
| `reputation` (number) | yes | yes | yes |
| Webhook URLs | no | yes | no |

GDPR right-to-erasure: account deletion removes `email`, `bio`, `avatar`, IPs, sessions. Public artifacts you authored stay listed (they live elsewhere) but `display_name` becomes `deleted-user-{hash8}`. Cannot undelete.

## Anti-takeover

| Threat | Mitigation |
|---|---|
| GitHub account takeover → hub account takeover | hub session lifetime short; sensitive actions re-auth-required; hardware-key required for `auditor`/`moderator`/`council` |
| Stolen `nx_pat_*` | every token call logged; user can revoke from `/account/tokens` |
| Squatting handles | first-7-days-mutable; council can re-assign for verified impersonation cases |
| RubyGems-style takeover-via-yank-publish | hub never owns the artifact; takeover of the hub account does not let attacker publish a malicious crate (crates.io controls that); attacker can only mess with metadata + rating-spam |
| Email-domain compromise | only affects email-magic-link accounts; council members must use hardware keys + GitHub OAuth |

The RubyGems lesson (`https://blog.rubygems.org/` historical takeover incidents): the value is in **moving the trust anchor away from passwords**. We do this with OAuth + hardware-key MFA for high-trust roles.

## Signed actions

For council, moderator, and auditor actions, the user's identity key signs the canonicalized action. The hub stores the signature in the audit log. External witnesses can verify without trusting the hub.

```
action ::= {
  "kind": "moderation_action" | "attestation_issued" | "attestation_revoked" | "role_granted",
  "actor": "<handle>",
  "actor_key_id": "<key-id>",
  "payload": { /* kind-specific */ },
  "at": "<iso8601>"
}
signature := Ed25519(canonical_json(action), actor_key)
```

Personal user actions (rate, flag, submit) are NOT signed — they're authenticated by token only. Signing matters where the action carries cross-time trust.

## Cross-references

- Token usage on API: `api.md` §Authentication
- Roles in verification: `verification.md`
- Roles in moderation: `moderation.md`
- Mirror identity: `federation.md`
- Account UI flows: `browse-ui.md`
