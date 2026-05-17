<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-hub — Ratings & Reviews

> 1–5 stars + optional text. Only verified installers count toward the public rating. Wilson lower-bound is the sort key, not the raw mean. Brigading detected and decayed. Reviews are content; flaggable like any other.

→ Endpoint: `POST /api/v1/rate` in `api.md`
→ Verified-installer signal: `telemetry.md`
→ Wilson interval: standard score for proportion estimates with small samples

## Why stars + reviews (and what we deliberately don't do)

| Mechanism | We use | Why / why not |
|---|---|---|
| 1–5 stars | yes | Familiar; works for both technical and consumer artifacts |
| Text review (≤ 4000 chars) | yes | Substance beats stars alone |
| Up/down vote on reviews | yes (helpfulness) | Sort reviews by signal |
| Reply threads | no (v1) | Devolves; defer to v2 if demand |
| Emoji reactions | no | Noise; nothing to learn from "😍" |
| One-tap "I use this" badge | yes | Stronger-than-star, weaker-than-rating signal |

## Eligibility

| Rating type | Requirement | Effect |
|---|---|---|
| **Counted rating** (affects public `rating.mean`) | account + proof of install for that record version | full weight |
| **Uncounted rating** | account, no install proof | visible in user's profile only; not aggregated |
| Anonymous opinion | not accepted | no |

Proof of install:
- For crates: a successful `nexus hub install <crate>` call from the user's CLI logs a privacy-preserving token (hashed user+crate+version+ts; not PII). Or: a successful `cargo install` event surfaced via opt-in telemetry. Or: a manifest in the user's published artifact `depends_on <crate>`.
- For mods: an entitlement from the marketplace (Steam Workshop "subscribed", Mod.io download token).
- For assets: a download event via the hub's redirector (the only time we touch the artifact CDN path).

Without proof, ratings stay in the user's profile and a sidebar (`Recent uncounted ratings`) but DO NOT change the headline score.

## Score computation

Headline: **Wilson lower-bound at 95% confidence on the proportion of 4★+ ratings**.

```
wlb = (
  (p + z²/2n - z * sqrt((p(1-p) + z²/4n) / n))
  / (1 + z²/n)
)
where:
  n = count of counted ratings
  p = fraction of counted ratings >= 4 stars
  z = 1.96 (95% CI)
```

Display:
- `rating.mean` — arithmetic mean of counted stars (for the human; the headline number)
- `rating.wilson_lower_bound` — used for `?sort=rating` (defaults all list endpoints' rating-sort to wlb)
- `rating.histogram` — 5-bucket distribution

Why Wilson over mean: a single 5★ from one user outranks 200×4★ on raw mean. Wilson grades that down until sample size justifies the high score. Reddit ranking precedent.

## Brigading defences

| Attack | Defence |
|---|---|
| Many fresh accounts, one target | account-age × reputation weighting on rating-acceptance; freshly-created accounts can rate but their counts contribute fractional weight until the account is 30 days old |
| Same user, many alts | rate-limit per IP (60-day window) + cross-account fingerprinting (best-effort) |
| Coordinated downvote on a competitor | spike detection (z-score on daily rating rate per record); spikes trigger temporary `?sort=rating` exclusion + moderation flag |
| Author's own 5★ flood from sock-puppets | publisher cannot rate their own records (auto-detected via authored_by graph) |
| Negative reviews to extort | reviews flaggable; moderation reviews; pattern detection across reporters |

Spike detection: compute weekly baseline μ, σ of new ratings for each record. If today's count > μ + 4σ AND today's mean differs from rolling mean by > 1.0 stars, trigger `under_review` on the rating delta (not the artifact). Public moderation entry follows.

## Rating decay

Old ratings still count, but recent ratings count slightly more (recency weight). Half-life: 18 months. Prevents a once-great-but-now-broken crate from cruising on ancient reviews.

```
weight_i = decay(now - rated_at_i) = 0.5 ^ (age_days / (18*30))
```

Applied to mean + wlb. Histogram is shown raw (so users see the time-shape).

## Review structure

```json
{
  "$id": "https://hub.nexus.engine/schemas/Review.json",
  "type": "object",
  "required": ["id", "target", "rater", "stars", "at"],
  "properties": {
    "id": {"type": "string"},
    "target": {
      "type": "object",
      "properties": {
        "kind": {"enum": ["crate", "mod", "asset", "game", "template"]},
        "name": {"type": "string"},
        "version": {"type": ["string", "null"]}
      }
    },
    "rater": {
      "type": "object",
      "properties": {
        "handle": {"type": "string"},
        "verified_install": {"type": "boolean"},
        "weight": {"type": "number", "description": "0..1 — account-age × reputation"}
      }
    },
    "stars": {"type": "integer", "minimum": 1, "maximum": 5},
    "review": {"type": ["string", "null"], "maxLength": 4000},
    "helpful": {"type": "integer", "description": "up-votes from other users"},
    "unhelpful": {"type": "integer"},
    "edited_at": {"type": ["string", "null"], "format": "date-time"},
    "at": {"type": "string", "format": "date-time"},
    "moderation": {"$ref": "Moderation.json"}
  }
}
```

## Sorting reviews

`?sort=` on `GET /api/v1/crates/{name}/reviews`:

| Sort | Formula | When useful |
|---|---|---|
| `helpfulness` (default) | Wilson interval over (helpful, unhelpful) | finding the most-useful reviews |
| `recency` | descending `at` | check on recent issues |
| `controversy` | Wilson interval on `min(helpful, unhelpful) / (helpful + unhelpful)` | find disputes |
| `weight` | rater-weight descending | hear from established users first |

## Helpful / unhelpful

Voters must have an account; one vote per user per review; cannot vote on your own review. Vote-flips allowed. Author of a review sees up/down counts; never sees voter identities.

## Editing reviews

Reviews are editable for 14 days. After that, frozen. Edits visible via `edited_at` field and an inline diff link. Frozen reviews preserve the trail when a controversy unfolds.

## Author response

Crate authors can post one pinned reply per review (clearly labeled `Author:`). Not counted as a rating. Cannot vote-game (their reply doesn't earn helpful votes that affect any score).

## Rate-limit

| Caller | Limit |
|---|---|
| anonymous | 0 |
| authenticated | 5 ratings/hr · 20/day · 100/week per IP |
| trusted reviewer | 200/week (reputation-unlocked) |
| author rating their own | 0 (blocked) |

## Reviewer reputation effects

Reviewers with consistent helpful votes and never-moderated reviews unlock:
- Higher rate limits.
- "Trusted reviewer" badge on their reviews.
- Reviews surfaced as `recommended` on related crate pages.

Reviewers who get many `unhelpful` votes or whose reviews get moderated lose privileges. Reputation per `identity.md`.

## Display rules (UI + JSON)

| Surface | Rating display |
|---|---|
| Browse card | star + mean to 1 decimal + `(N)` counted-count |
| Detail page | histogram + mean + wlb + `?` tooltip explaining the difference |
| API list endpoints | `rating.mean`, `rating.count`, `rating.wilson_lower_bound`, `rating.histogram` |
| Default `?sort=rating` | descending wlb |

Crates with `count < 5` show no headline number — only "Not yet rated (3 ratings so far)". Avoids the one-good-review fluke.

## Pitfalls explicitly named

| Pitfall | Mitigation |
|---|---|
| One-rating-fluke headline | hide headline below N=5 counted ratings |
| Author astroturfs with sock-puppets | weight by account age × reputation; spike detection |
| Old great reviews mask new rot | recency decay (18-mo half-life) |
| Negative review extortion | reviews are themselves flaggable; pattern detection per reporter |
| Author retaliates against negative reviewer | author cannot see voter identities; cannot flag a review on personal grounds (`reason` enum doesn't include `disagree`) |
| Rating gaming via mod-author ↔ mod-rater swap deals | cross-author rating graphs; suspicious pair-density triggers review |

## Cross-references

- Endpoint: `api.md` §`POST /api/v1/rate`
- Account / reputation: `identity.md`
- Telemetry sources for verified-install: `telemetry.md`
- Recommendation engine uses ratings as a feature: `agent-api.md`
