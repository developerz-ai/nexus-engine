<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Agent API

> The surface AI agents (nexus-coder, MCP clients, third-party agents) use. JSON in, JSON out. Index snapshot is primary. Recommend + eval are first-class POST endpoints. MCP wraps them all.

→ Base API: `api.md`
→ nexus-coder tools: `docs/specs/coder/tools.md`
→ MCP wrapping: `docs/specs/agent/mcp-server.md`

## Primary entrypoint — the index snapshot

```
GET /api/v1/index.json
```

| Header | Value |
|---|---|
| `If-None-Match` | last seen ETag — 304 if fresh |
| `Accept-Encoding` | `gzip, br` |
| `User-Agent` | `nexus-coder/<v> (+https://...)` (per `telemetry.md` agent classification) |

Recommended agent flow:

```
1. on first run: fetch /api/v1/index.json; store with ETag; index locally
2. hourly: conditional GET; if 304, no work
3. for any query (search, filter, recommend): query local first
4. only call live endpoints (/api/v1/crates/{name}, /recommend, /eval-crate) for
   real-time freshness or owner-only data
```

Why: an agent doing dozens of discovery queries per task should not roundtrip per query. The snapshot is engineered for this (→ `index-format.md` §Size budget).

## POST /api/v1/recommend

"I'm building X; what fits?" Returns a ranked, reasoned list.

Request:

```json
{
  "$id": "https://hub.nexus.engine/schemas/RecommendRequest.json",
  "type": "object",
  "required": ["intent"],
  "properties": {
    "intent": {
      "type": "object",
      "required": ["project_kind"],
      "properties": {
        "project_kind": {"enum": ["new_game", "extend_existing", "research"]},
        "genres": {"type": "array", "items": {"type": "string"}, "description": "e.g. [\"moba\", \"tower_defense\"]"},
        "styles": {"type": "array", "items": {"type": "string"}, "description": "e.g. [\"stylized\", \"2d\"]"},
        "platforms": {"type": "array", "items": {"type": "string"}},
        "engine_version": {"type": "string", "description": "semver req"},
        "requirements": {
          "type": "object",
          "properties": {
            "license_allowlist": {"type": "array", "items": {"type": "string"}},
            "headless_safe":     {"type": "boolean"},
            "deterministic":     {"type": "boolean"},
            "tier_min":          {"enum": ["verified", "community"]}
          }
        },
        "categories_wanted": {"type": "array", "items": {"type": "string"}, "description": "from /api/v1/categories"}
      }
    },
    "limit": {"type": "integer", "default": 20, "maximum": 100},
    "kinds": {"type": "array", "items": {"enum": ["crate", "mod", "asset", "template"]}, "default": ["crate", "template"]}
  }
}
```

Response:

```json
{
  "$id": "https://hub.nexus.engine/schemas/RecommendResponse.json",
  "type": "object",
  "required": ["recommendations"],
  "properties": {
    "recommendations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target", "score", "reasons", "fit"],
        "properties": {
          "target": {"type": "object", "properties": {"kind": {"type": "string"}, "name": {"type": "string"}, "version": {"type": "string"}}},
          "score":  {"type": "number", "minimum": 0, "maximum": 1, "description": "composite fit score"},
          "reasons": {"type": "array", "items": {"type": "string"}, "description": "human-readable rationale lines"},
          "fit": {
            "type": "object",
            "properties": {
              "category_match":     {"type": "number"},
              "engine_compat":      {"type": "boolean"},
              "license_compat":     {"type": "boolean"},
              "tier":               {"type": "string"},
              "rating_wlb":         {"type": ["number", "null"]},
              "downloads_recent":   {"type": "integer"},
              "is_verified":        {"type": "boolean"}
            }
          },
          "next_steps": {"type": "array", "items": {"type": "string"}, "description": "e.g. [\"nexus hub install <name>\", \"add to Nexus.toml: ...\"]"}
        }
      }
    },
    "alternatives_considered": {"type": "integer"}
  }
}
```

Scoring formula (transparent — encoded in the recommender, not a black-box LLM):

```
score = 0.30 * category_match
      + 0.20 * (tier == "verified" ? 1.0 : 0.4 if tier == "community" else 0.0)
      + 0.15 * (1.0 if engine_compat else -∞)         # hard fail
      + 0.10 * normalize_log(downloads_recent_90d)
      + 0.10 * (rating_wlb if rating_wlb is not None else 0.5)
      + 0.05 * (1.0 if license_compat else -∞)         # hard fail
      + 0.05 * (1.0 if headless_safe matches requirement else 0.0)
      + 0.05 * recency_bonus(last_indexed_at)
```

Negative-∞ on hard fails = excluded from the result list entirely. Score is sorted descending. Reasons enumerate which terms dominated.

The recommender is a deterministic ranker over the local index, not an LLM. **Same query → same result.** No prompt-injection risk in the recommendation logic. The `reasons` strings are templated, not generated.

## POST /api/v1/eval-crate/{name}

"Evaluate this crate against my project." Returns a structured fit report.

Request:

```json
{
  "$id": "https://hub.nexus.engine/schemas/EvalRequest.json",
  "type": "object",
  "properties": {
    "project": {
      "type": "object",
      "properties": {
        "engine_version": {"type": "string"},
        "platforms":      {"type": "array", "items": {"type": "string"}},
        "license":        {"type": "string"},
        "existing_dependencies": {"type": "array", "items": {"type": "string"}},
        "requirements": {
          "type": "object",
          "properties": {
            "headless_safe":     {"type": "boolean"},
            "deterministic":     {"type": "boolean"},
            "perf_class":        {"enum": ["realtime", "interactive", "batch"]}
          }
        }
      }
    }
  }
}
```

Response:

```json
{
  "$id": "https://hub.nexus.engine/schemas/EvalResponse.json",
  "type": "object",
  "required": ["target", "checks", "verdict"],
  "properties": {
    "target": {"type": "object"},
    "checks": {
      "type": "object",
      "properties": {
        "schema_conformance":   {"type": "object", "properties": {"pass": {"type": "boolean"}, "notes": {"type": "string"}}},
        "engine_compat":        {"type": "object", "properties": {"pass": {"type": "boolean"}, "constraint": {"type": "string"}, "your_version": {"type": "string"}}},
        "license_compat":       {"type": "object", "properties": {"pass": {"type": "boolean"}, "their": {"type": "string"}, "yours": {"type": "string"}}},
        "headless_claim":       {"type": "object", "properties": {"pass": {"type": "boolean"}, "claimed": {"type": "boolean"}, "required": {"type": "boolean"}}},
        "deterministic_claim":  {"type": "object", "properties": {"pass": {"type": "boolean"}}},
        "perf_claim":           {"type": "object", "properties": {"pass": {"type": "boolean"}, "claim": {"type": "string"}, "audited": {"type": "boolean"}}},
        "dependency_conflicts": {"type": "object", "properties": {"pass": {"type": "boolean"}, "conflicts": {"type": "array", "items": {"type": "string"}}}},
        "tier":                 {"type": "object", "properties": {"tier": {"type": "string"}, "expires_at": {"type": "string"}}},
        "moderation":           {"type": "object", "properties": {"status": {"type": "string"}, "warnings": {"type": "array"}}}
      }
    },
    "verdict": {"enum": ["adopt", "adopt_with_caveats", "do_not_adopt"]},
    "caveats": {"type": "array", "items": {"type": "string"}},
    "alternatives": {"type": "array", "items": {"type": "object"}, "description": "if verdict != adopt, ranked alternatives from /recommend"}
  }
}
```

Hard rules (any of these → `do_not_adopt`):
- License incompatible with project's license.
- `moderation.status ∈ {quarantined, delisted_by_moderator}`.
- Engine version constraint cannot be satisfied.

Soft rules → `adopt_with_caveats`:
- `tier == "community"` when project wanted `tier_min: "verified"`.
- Claimed `headless_safe: true` but no attestation backs it.
- Dependency overlaps with project deps at incompatible semver ranges.

## Decision tables (JSON, agent-consumable)

The agent doesn't need to invent the heuristic — these tables are downloadable:

```
GET /api/v1/agent/decision-tables/{kind}
  kind ∈ { pick-best-crate, pick-best-mod, pick-best-template, pick-best-asset-pack }
```

Example `pick-best-crate.json`:

```json
{
  "version": "1.0",
  "rules": [
    {"if": "license_compat == false", "then": "exclude", "reason": "license incompatible"},
    {"if": "tier == 'quarantined'",   "then": "exclude", "reason": "quarantined"},
    {"if": "engine_compat == false",  "then": "exclude", "reason": "engine version mismatch"},
    {"if": "tier == 'verified'",      "then": "boost", "weight": 0.30, "reason": "verified tier"},
    {"if": "deterministic == requirement.deterministic", "then": "boost", "weight": 0.10, "reason": "determinism match"},
    {"if": "rating.wlb >= 0.8 and rating.count >= 5", "then": "boost", "weight": 0.10, "reason": "highly rated"},
    {"if": "downloads_recent_90d > 1000", "then": "boost", "weight": 0.05, "reason": "popular"},
    {"if": "last_commit_age_days > 540 and downloads_recent_90d < 10", "then": "penalty", "weight": -0.15, "reason": "looks abandoned"}
  ],
  "tiebreaker": ["score desc", "rating.count desc", "name asc"]
}
```

`pick-best-mod.json`:

```json
{
  "version": "1.0",
  "rules": [
    {"if": "tier_power > project.allow_tier", "then": "exclude", "reason": "exceeds allowed power tier"},
    {"if": "marketplace not in project.allowed_marketplaces", "then": "exclude", "reason": "marketplace not enabled"},
    {"if": "moderation.nsfw == true and project.allow_nsfw == false", "then": "exclude", "reason": "nsfw filtered"},
    {"if": "engine_compat == false", "then": "exclude", "reason": "engine version mismatch"},
    {"if": "rating.wlb >= 0.7", "then": "boost", "weight": 0.20},
    {"if": "downloads_recent_90d > 5000", "then": "boost", "weight": 0.10},
    {"if": "deps satisfiable", "then": "boost", "weight": 0.10}
  ]
}
```

Same shape for templates and asset-packs. Agents can apply rules locally over the snapshot — no live API call needed.

## MCP wrapper

The MCP server (`docs/specs/agent/mcp-server.md`) exposes hub queries as tools. Mapping:

| Hub endpoint | MCP tool |
|---|---|
| `GET /api/v1/index.json` | `hub.index_fetch(if_none_match: string?)` |
| `GET /api/v1/crates/{name}` | `hub.crate_get(name)` |
| `GET /api/v1/mods/{slug}` | `hub.mod_get(slug)` |
| `GET /api/v1/search` | `hub.search(q, type?, filters?)` |
| `POST /api/v1/recommend` | `hub.recommend(intent, kinds?, limit?)` |
| `POST /api/v1/eval-crate/{name}` | `hub.eval_crate(name, project)` |
| `GET /api/v1/categories` | `hub.categories()` |
| `GET /api/v1/attestations/{id}` | `hub.attestation_get(id)` |

All MCP tools are read-only. Writes (submit, attest, rate, flag) require an explicit user-confirmed action; they're not exposed as silent agent tools. Capability discipline per `docs/contracts/core-agent.md`.

## Rate limits

| Caller | Limit |
|---|---|
| anonymous agent (`ua_class: agent`) | 60/min total — same as anonymous |
| authenticated agent (`Authorization: Bearer ...`) | 600/min total |
| federation peer | 6000/min (declared in `/.well-known/nexus-hub.json`) |

Snapshot fetches don't count against these limits when the response is 304. Encourages the recommended caching flow.

## Caching headers contract

| Endpoint | Cache-Control | ETag |
|---|---|---|
| `/api/v1/index.json` | `public, max-age=600` | yes |
| `/api/v1/crates/{name}` | `public, max-age=300` | yes |
| `/api/v1/search` | `public, max-age=60` | yes |
| `/api/v1/recommend` | `private, max-age=0` | no (depends on intent) |
| `/api/v1/eval-crate/{name}` | `private, max-age=0` | no |

Agents SHOULD cache aggressively per the above headers.

## Determinism for agent use

For audit reasons, agents need reproducible queries. We guarantee:
- `/recommend` with same `intent` body and the same snapshot is byte-identical (modulo `request_id`).
- `eval-crate` is similarly deterministic per (record version, project description).
- The snapshot is versioned by ETag — if you want a stable result, pin the ETag in your audit log.

LLM-based scoring is deliberately NOT used in `/recommend` and `/eval-crate` — those are deterministic rankers. If a higher-level agent needs an LLM rationale on top, that's done at the agent's tier (e.g. nexus-coder synthesizing a natural-language summary from `reasons[]`).

## Cross-references

- nexus-coder tool registry: `docs/specs/coder/tools.md` (add `hub.*` tools as a planned-batch)
- MCP wrap: `docs/specs/agent/mcp-server.md`
- Recommendation subagent: `.claude/agents/hub-recommender.md`
- Decision-table author guide: `docs/guides/hub/agent-recipes.md`
