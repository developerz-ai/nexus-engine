<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — Submitting to nexus-hub

> Two paths: **auto-crawl** (default; do nothing) and **explicit submit** (for non-`nexus-*` names or for non-crate artifacts). Plus the **Verified tier** path for auditors. nexus-hub never asks for your artifact bytes.

→ Spec: `docs/specs/hub/api.md` §`POST /submit`, §`POST /attest`
→ Tier definitions: `docs/specs/crates/quality-bar.md`
→ Signing scheme: `docs/specs/hub/verification.md`

## Decide your path

| You are publishing | Path |
|---|---|
| Crate named `nexus-*` or with keyword `nexus` | auto-crawl (do nothing) |
| Crate without that naming | explicit submit |
| Mod on a federated marketplace (Steam Workshop / Mod.io / Thunderstore game already registered) | auto-crawl (via the marketplace adapter) |
| Mod on a marketplace not yet federated | explicit submit |
| Asset pack on Kenney / Poly Haven / OpenGameArt / ambientCG | auto-crawl |
| Asset pack on IPFS or your own host | explicit submit |
| Demo game | explicit submit |
| Template (GitHub repo with topic `nexus-template`) | auto-crawl |

## Auto-crawl

You don't do anything. The crawler picks you up within ≤ 5 min after:
- the crate appears on `crates.io/api/v1/crates?q=nexus-`, OR
- the GitHub repo carries the `nexus-template` topic, OR
- the asset pack is listed on a federated CC0 library, OR
- the mod is uploaded to a marketplace whose `game_id` is in the crawler's federated set.

To check it landed:

```
nexus hub show <your-name> --json
```

Returns 404 → not yet indexed (try again in 5 min) OR you don't match the auto-crawl filters (use explicit submit).

## Explicit submit (CLI)

```
nexus hub login                            # GitHub OAuth
nexus hub submit
> kind: crate                              # or mod / asset / game / template
> origin_url: https://crates.io/crates/...
> manifest_url: <auto-detected; override if needed>
> category: genre/survival
```

Non-interactive (for CI):

```
nexus hub submit --json <<EOF
{
  "kind": "crate",
  "origin_url": "https://crates.io/crates/my-cool-crate",
  "manifest_url": "https://raw.githubusercontent.com/me/my-cool-crate/main/nexus-crate.toml",
  "category": "util/math"
}
EOF
```

Server returns `submission_id`. Poll `GET /api/v1/submissions/{id}` until `status: "indexed"` or `status: "rejected"`.

## Rejection reasons (what to fix)

| Reason | Fix |
|---|---|
| `bad_manifest` | match the schema in `docs/specs/crates/manifest.md` (or `docs/specs/mods/manifest.md`) |
| `bad_name` | rename per `docs/specs/crates/naming.md` |
| `bad_license` | use an SPDX expression on the engine allowlist (`docs/specs/crates/licensing.md`) |
| `unresolvable_deps` | every dep must publish to crates.io |
| `engine_incompat` | declare a sane `engine_compat`; intersect with a living engine version |
| `dead_url` | make `origin_url` return 200 |
| `spam_suspected` | get out of moderation queue: provide context via `notes` on resubmit |

Rejected? You can fix and resubmit. The new submission supersedes the rejection.

## Manifest checklist

For crates, in `Cargo.toml`:

```toml
[package.metadata.nexus]
category = "genre/survival"
engine_compat = ">=0.4.0, <0.5.0"
traits_implemented = ["GenreLayer", "HungerSystem"]
headless_safe = true
deterministic = true
agent_readable = true
audit_url = "https://github.com/you/your-crate/blob/main/AUDIT.md"
```

For mods, in `mod.toml`:

```toml
[mod]
id = "my-mod"
tier = "behavior"
capabilities = ["WorldRead", "WorldWrite", "EventEmit"]
engine_compat = ">=0.4.0, <0.5.0"
```

Either: a sibling `nexus-crate.toml` is also honored (same shape as the `[package.metadata.nexus]` table, top-level).

## Embed the badge

After indexed (any tier), embed in your README:

```markdown
[![nexus-hub](https://hub.nexus.engine/badge/crates/my-cool-crate.svg)](https://hub.nexus.engine/crates/my-cool-crate)
```

The badge reflects current tier (verified / community / quarantined). Cache TTL: 5 min.

## Verified-tier path (auditor flow)

Verified is opt-in and signed. Authors don't self-verify; an auditor on the council does.

1. Author opens an audit request:
   ```
   nexus hub submit --json --kind audit_request <<EOF
   { "target": "crate:my-cool-crate:0.4.2", "playbook_results": { ... }, "audit_url": "https://github.com/me/my-cool-crate/blob/main/AUDIT.md" }
   EOF
   ```

2. Council reviews per `docs/specs/crates/quality-bar.md`'s playbook.

3. Auditor signs an attestation:
   ```
   nexus hub attest \
     --target crate:my-cool-crate:0.4.2 \
     --result license_ok=true,no_known_cves=true,headless_safe=true,deterministic=true,scenarios_passed=true,perf_contract_met=true \
     --signing-key ~/.nexus/keys/audit-council-01-2026.ed25519
   ```

4. Server appends to the audit log + updates `crate.verification`. Badge flips to Verified within ≤ 5 min.

Verified attestations expire (default 6 months). Re-audit before expiry to keep the badge.

See `docs/specs/hub/verification.md` for the signing scheme and the canonicalization rule (RFC 8785).

## Removing your listing

```
nexus hub delete crates/my-cool-crate
```

Hides the listing from the hub. The crate **stays** on crates.io (we never had it). Reversible by re-`submit`.

## Updating

You don't update — the crawler does. Push a new version to crates.io; the crawler picks it up within ≤ 5 min. To force a refresh:

```
nexus hub refresh crates/my-cool-crate
```

## Common pitfalls

| Pitfall | Avoidance |
|---|---|
| Crate name doesn't match `nexus-*` and you forgot explicit submit | use the naming convention; otherwise `submit` |
| Manifest missing required fields | run `nexus hub validate <path-to-manifest>` before publishing to crates.io |
| Engine compat too tight | declare a real range, not a single version |
| Forgetting to embed badge | the badge endpoint works even before you're verified — embed it day one |
| Quarantine because a flag is open | see public flag on your record's page; respond in `Author response` |

## Cross-references

- API: `docs/specs/hub/api.md`
- Crate manifest schema: `docs/specs/crates/manifest.md`
- Mod manifest schema: `docs/specs/mods/manifest.md`
- Tier definitions: `docs/specs/crates/quality-bar.md`
- Signing + audit log: `docs/specs/hub/verification.md`
- Subagent that handles audit queue: `.claude/agents/hub-curator.md`
