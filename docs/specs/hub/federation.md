<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Federation

> Anyone runs a mirror. The official hub is the most popular instance, not the owner. The protocol is open. Canonical source wins on conflicts. Mirrors are read-only copies for everything but their own community submissions.

→ Topology: `architecture.md`
→ Self-host walkthrough: `docs/guides/hub/self-hosting.md`
→ Precedent: WebFinger (`https://www.rfc-editor.org/rfc/rfc7033`), Thunderstore per-community federation, lib.rs's "alternative front-end" model.

## Why federation

| Threat | Federation answer |
|---|---|
| Single-hub outage | Mirrors keep serving |
| Censorship of a record (national / legal / political) | Other mirrors can keep listing it |
| Vendor lock-in | Identical protocol; consumers can switch |
| Air-gapped studio needs | Internal mirror behind firewall |
| Hub maintainer drift | Community-run alternative gains traction |

The flywheel needs no single point of failure.

## Mirror tiers

| Tier | Marker | Powers | Restrictions |
|---|---|---|---|
| **Canonical** | `is_canonical: true` in well-known | issues attestations; assigns ULIDs; sets record `canonical_url` | one canonical per record-namespace; default = `hub.nexus.engine` |
| **Community mirror** | `mirror_of: <canonical-url>` | accepts submissions for its own community; mirrors canonical records read-only | cannot issue attestations against records it does not canonical-own |
| **Private mirror** | `is_private: true` | full mirror semantics; not crawled by peers | invisible to discovery |

Canonical-per-record-namespace is the key insight: a community mirror MAY be canonical for **its own** record namespace (e.g. `studio-internal-`), while remaining a read-only mirror of `hub.nexus.engine` for everything else. Records carry a `canonical_hub` field declaring who owns the canonical bit.

## The well-known manifest

Every mirror serves:

```
GET https://<mirror>/.well-known/nexus-hub.json
```

```json
{
  "$id": "https://hub.nexus.engine/schemas/MirrorManifest.json",
  "type": "object",
  "required": ["protocol_version", "hub_origin", "is_canonical", "namespaces_canonical", "peers"],
  "properties": {
    "protocol_version": {"type": "string", "description": "e.g. \"1.0\""},
    "hub_origin":       {"type": "string", "format": "uri"},
    "is_canonical":     {"type": "boolean"},
    "is_private":       {"type": "boolean"},
    "namespaces_canonical": {
      "type": "array",
      "items": {"type": "string"},
      "description": "record-name globs this mirror is canonical for, e.g. [\"nexus-*\", \"studio-acme-*\"]"
    },
    "mirror_of":        {"type": ["string", "null"], "format": "uri"},
    "peers": {
      "type": "array",
      "items": {"type": "string", "format": "uri"},
      "description": "other mirrors this hub pulls from"
    },
    "snapshot_url":     {"type": "string", "format": "uri", "description": "where its /api/v1/index.json lives"},
    "contact":          {"type": "string", "format": "email"},
    "identity_key":     {"type": "string", "description": "Ed25519 public key for mirror-identity signatures"},
    "pull_rate_limit":  {"type": "integer", "description": "requests/min this mirror permits federation peers"},
    "policies": {
      "type": "object",
      "properties": {
        "accepts_nsfw":  {"type": "boolean"},
        "license_filter": {"type": "array", "items": {"type": "string"}}
      }
    }
  }
}
```

WebFinger precedent: `https://www.rfc-editor.org/rfc/rfc7033`. We deliberately use a similar `/.well-known/` pattern.

## Discovery handshake

```
peer A                                   peer B
  │                                         │
  │── GET /.well-known/nexus-hub.json ─────▶│
  │                                         │
  │◄────── manifest (with snapshot_url) ────│
  │                                         │
  │── GET <snapshot_url> (ETag if cached) ─▶│
  │                                         │
  │◄────── 200 / 304 ───────────────────────│
  │                                         │
  │── merge into local index (read-only    │
  │   view; never overwrites local         │
  │   canonical records)                   │
```

## Pull cadence

| Pair type | Pull frequency |
|---|---|
| Canonical → mirror | mirror pulls every 1 hour |
| Mirror → mirror | every 6 hours (small ops) |
| Studio private mirror → canonical | every 4 hours (configurable) |
| Air-gapped private mirror | manual; sneakernet via index tarball |

Pull uses `If-None-Match` with the snapshot's ETag. 304 responses are free.

## Conflict resolution

```
For every record encountered during a pull:
  if record.canonical_hub == self.hub_origin:
      skip                           # we are canonical; ignore peer's version
  elif record.canonical_hub == peer.hub_origin:
      upsert(record)                 # peer is canonical; take it
  elif record.canonical_hub in known_canonicals:
      ignore                         # not from the canonical source; possibly stale
  else:
      log("orphan canonical claim"); ignore
```

Rule: **only the declared canonical hub for a record can mutate that record.** Other mirrors cache. No "edit war" possible — there is no edit, only authoritative copies.

## Loop prevention

Each pull request carries:

```
X-Hub-Pull-Origin: https://studio-acme.hub.example/
X-Hub-Pull-Trace:  hub.nexus.engine, mirror-asia.example, studio-acme.hub.example
```

A mirror rejects requests where its own origin appears in the trace. Prevents A→B→C→A storms. Inspired by Mastodon/ActivityPub's `to`/`cc` deduplication (`https://activitypub.rocks/`).

## Signed mirror identity

Mirrors sign their manifest with the `identity_key` declared in it. Peers verify on first fetch and pin (TOFU — trust on first use). Key rotation requires cross-signing.

Why: prevents DNS-hijack / man-in-the-middle attacks against the well-known.

## Attestation propagation

Attestations propagate canonically only:

| Event | Where it happens | Where it propagates |
|---|---|---|
| Attestation issued | canonical hub for the record | included in canonical hub's next snapshot; mirrors pick up on next pull |
| Attestation revoked | same | same; revocation entry appended to audit log |

Mirrors **never** issue attestations against records they do not canonical-own. The API on a non-canonical mirror returns `403 not_canonical` for `POST /api/v1/attest` on those records.

## Diff: official hub vs community mirror

| Property | Official `hub.nexus.engine` | Community mirror |
|---|---|---|
| Canonical for `nexus-*` namespace | yes | no (unless explicitly delegated) |
| Issues attestations under council keys | yes | no (can issue under its own keys, but for its own namespace) |
| Cost | hosted by Nexus foundation | hosted by you |
| SLAs | best-effort; no formal SLA | yours to set |
| Moderation policies | foundation's | yours |
| Reachable from `nexus hub` CLI default | yes | configurable via `~/.nexus/hub.toml::default_hub` |

A community mirror MAY filter content (e.g. studio-internal mirror excludes NSFW). The protocol does not enforce a content policy.

## Bootstrap a new mirror

```
docker compose -f https://hub.nexus.engine/deploy/docker-compose.mirror.yml up
# downloads latest snapshot, sets is_canonical: false, peers: [hub.nexus.engine]
```

Then register with the official hub (optional, for visibility):

```
POST https://hub.nexus.engine/api/v1/mirrors/register
{
  "hub_origin": "https://hub.studio-acme.example",
  "contact":    "ops@studio-acme.example",
  "identity_key": "Ed25519..."
}
```

Registered mirrors appear at `GET /api/v1/mirrors` and get federation-peer rate limits (6000/min) instead of the anonymous 60/min.

## Self-host playbook

Operational details — Docker compose, K3s helm chart, backup, restore, certificate management — live in `docs/guides/hub/self-hosting.md`. This spec stays at the protocol level.

## Sync lag SLO

| Pair | Target | Alert |
|---|---|---|
| Canonical → mirror (snapshot fetch) | < 1h p95 | > 2h p95 |
| Mirror → search index | < 30s | > 5min |
| Attestation log fan-out | < 5min | > 30min |

## Conflict examples (worked)

**Case 1.** Crate `nexus-rng` is canonical at `hub.nexus.engine`. Community mirror `mirror-asia.example` also serves a record for `nexus-rng`. Mirror's record is older.
→ Resolution: mirror upserts canonical's record. Mirror's stale copy overwritten on next pull.

**Case 2.** Studio-internal mirror `hub.studio-acme.example` has `namespaces_canonical: ["studio-acme-*"]`. It also pulls `nexus-*` from canonical. Studio publishes `studio-acme-private-genre`.
→ Resolution: canonical hub does NOT see `studio-acme-private-genre` (not in its pulled namespaces). Studio mirror is the only place it exists. Works as designed.

**Case 3.** Community mirror tries to `POST /api/v1/attest` against `nexus-rng`.
→ Resolution: returns `403 not_canonical`, with hint `attest against hub.nexus.engine`.

**Case 4.** Federation pull from `hub.nexus.engine` returns a snapshot signed by an unknown identity key.
→ Resolution: refuse to merge. Alert. Either someone hijacked DNS or canonical rotated keys without announcement.

## Trust pinning

A mirror pins peer keys after first successful handshake (TOFU). Key change requires:
1. Old key signs an `identity_key_rotation` event.
2. Peers see the cross-signature in the manifest's `key_history`.
3. Peers update their pin.

Hard-failure on unannounced key change — refuse to merge until manual approval.

## Cross-references

- HTTP API endpoints: `api.md` (see `/.well-known/nexus-hub.json`, `/api/v1/mirrors`).
- Index snapshot format: `index-format.md`.
- Self-host playbook: `docs/guides/hub/self-hosting.md`.
- Mirror operator subagent: `.claude/agents/hub-mirror-operator.md`.
- Precedents: WebFinger RFC 7033, ActivityPub, Thunderstore community federation.
