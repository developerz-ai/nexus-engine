<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Guide — Agent Recipes for nexus-hub

> How nexus-coder (and any other AI agent) uses nexus-hub for discovery, evaluation, recommendation. Decision tables in JSON. Worked end-to-end flows. MCP variants.

→ Spec: `docs/specs/hub/agent-api.md`
→ Tools: `docs/specs/coder/tools.md`
→ MCP wrapping: `docs/specs/agent/mcp-server.md`

## Operating principles

1. **Snapshot first.** Pull `/api/v1/index.json` once, cache by ETag, query locally. Refresh hourly.
2. **Live for fresh + reasoned.** Use `/recommend` and `/eval-crate` only when you need real-time freshness or a reasoned answer the agent can surface to the user.
3. **Deterministic.** `/recommend` and `/eval-crate` are deterministic rankers — same input, same output, no LLM in the loop. Easier to audit.
4. **Decision tables are downloadable.** Apply them locally; you don't need to round-trip.
5. **Write actions require user confirmation.** Submitting, rating, flagging, attesting — never silent.

## Recipe 1 — Discovery from a fuzzy intent

User: "I want a soulslike combat system for my game."

```
1. nexus-coder calls `hub.recommend` (MCP) with:
   { intent: { project_kind: "extend_existing", genres: ["soulslike", "action_rpg"],
               engine_version: "^0.4", requirements: { tier_min: "verified" } } }
2. Receives ranked list with reasons[] and next_steps[].
3. Presents top 3 to user with verdict explanations.
4. On user pick: runs `hub.eval_crate(name, project)` to confirm fit.
5. On verdict=adopt: invokes `nexus hub install <name>` (user confirms the install).
```

## Recipe 2 — Snapshot-cached local discovery

For high-volume agent work (e.g. scanning the index to seed embeddings):

```
1. Conditional GET /api/v1/index.json with If-None-Match
2. If 200: rehydrate local index (Postgres/SQLite/in-memory — agent's choice)
3. Run filters / categorical queries / fuzzy match locally
4. Only call live endpoints to verify or to fetch owner-only fields
```

Cost: one ~50 MB fetch per hour. Replaces hundreds of single-record API calls.

## Recipe 3 — Eval a candidate against `Nexus.toml`

```python
project = parse_nexus_toml("./Nexus.toml")
eval = hub.eval_crate(name="nexus-genre-soulslike-core", project=project)

match eval["verdict"]:
    case "adopt":
        run_cargo_add(name, version=eval["target"]["version"])
        update_nexus_toml(name)
    case "adopt_with_caveats":
        present_caveats(eval["caveats"])  # let user decide
    case "do_not_adopt":
        suggest_alternatives(eval["alternatives"])
```

## Recipe 4 — Use the decision tables directly (no live call)

```
GET /api/v1/agent/decision-tables/pick-best-crate
```

Returns a JSON rules document:

```json
{
  "version": "1.0",
  "rules": [
    {"if": "license_compat == false", "then": "exclude", "reason": "license incompatible"},
    {"if": "tier == 'verified'",      "then": "boost", "weight": 0.30, "reason": "verified tier"},
    {"if": "rating.wlb >= 0.8 and rating.count >= 5", "then": "boost", "weight": 0.10, "reason": "highly rated"}
  ]
}
```

Apply locally over your cached snapshot. Useful for batch operations (e.g. "rank every survival crate for fit with this project").

## Recipe 5 — Verify an attestation offline

```python
import nacl.signing                 # ed25519
import json
from rfc8785 import canonicalize    # JCS

att = local_cache.get_attestation(attestation_id)
key = pinned_keys[att["signing_key_id"]]  # pre-fetched, pinned

payload = {k: v for k, v in att.items() if k != "signature"}
canonical = canonicalize(payload)

ok = nacl.signing.VerifyKey(key).verify(canonical, base64.b64decode(att["signature_b64"]))
fresh = att["expires_at"] > now and att["id"] not in revoked_set
trustworthy = ok and fresh
```

The agent does not need to contact the hub at verification time. The load-bearing property of signed attestations.

## Recipe 6 — Federation-aware lookup

```
1. Resolve crate's canonical hub:
     record.origin.canonical_hub   # from local snapshot
2. If canonical_hub != configured default:
     fetch /api/v1/crates/{name} from canonical_hub directly
3. Verify signature is from canonical_hub's identity key
```

Important for studio-internal records (e.g. `studio-acme-private-genre` lives at `hub.studio-acme.example`).

## Recipe 7 — Surface reasoned recommendations to the user

`/recommend` returns `reasons[]` strings. Concatenate naturally in the user reply:

```
"I'd suggest nexus-genre-soulslike-core (v0.3.1) because:
  - it's verified (audited 2026-03-12, expires 2026-09-12);
  - it targets engine ^0.4 (matches your project);
  - it has 28 ratings averaging 4.7★ (Wilson lower bound 0.81);
  - it has 12,480 downloads in the last 90 days."
```

These strings come from the hub, not from the LLM — they're auditable and the same on every call.

## MCP recipe — one-tool query

A nexus-coder turn using MCP:

```
Tool call: hub.recommend
Args:
{
  "intent": { "project_kind": "new_game", "genres": ["moba"], "engine_version": "^0.4" },
  "kinds": ["crate", "template"],
  "limit": 5
}

Tool result: { "recommendations": [...], "alternatives_considered": 12 }

Tool call: hub.eval_crate
Args:
{
  "name": "nexus-genre-moba-core",
  "project": { "engine_version": "0.4.3", "license": "MIT" }
}

Tool result: { "verdict": "adopt", "checks": {...} }
```

## Common pitfalls (agents specifically)

| Pitfall | Avoidance |
|---|---|
| LLM hallucinates a crate name not in the index | always pass through `/recommend` or `hub.search`; don't synthesize from training data |
| Cached snapshot becomes stale | refresh hourly; cache-bust on user explicit "find latest" |
| Submitting / rating / flagging without user consent | hub.* MCP tools are read-only; writes require an explicit `nexus hub …` invocation the user confirms |
| Trusting a `community`-tier crate as if Verified | check `tier` before recommending; surface tier in the reasoning string |
| Misattributing an attestation to the wrong record | verify `target.kind + target.name + version` matches before trusting |
| Brigading via agent-driven `/rate` | not possible — `/rate` MCP tool is not exposed; only the CLI invokes it, requires verified-install proof |

## Reference: decision-table fields

For `pick-best-*`:

| Field | Type | Use |
|---|---|---|
| `if` | string | Boolean expression over record + intent |
| `then` | enum | `exclude` / `boost` / `penalty` |
| `weight` | number | only for `boost` / `penalty` |
| `reason` | string | rationale string surfaced in `reasons[]` |
| `tiebreaker` | array | secondary sorts when scores tie |

Tables are versioned; agents pin a version: `?version=1.0`.

## Cross-references

- Spec: `docs/specs/hub/agent-api.md`
- CLI for write actions: `docs/specs/hub/cli.md`
- MCP wrapper: `docs/specs/agent/mcp-server.md`
- nexus-coder tool registry: `docs/specs/coder/tools.md`
- Recommendation subagent: `.claude/agents/hub-recommender.md`
- Verification math: `docs/specs/hub/verification.md`
