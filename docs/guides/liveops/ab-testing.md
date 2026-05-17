<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# A/B + Multivariate Testing

Variants are flags + analytics + stat-sig stop rules. GrowthBook native; engine schema-typed.

## Rule

- Every experiment has: hypothesis · primary metric · MDE · pre-registered duration.
- Holdout cohort: 5% never enters experiments.
- Stop early only on harm (auto-rollback). Never on early "winner".
- Exposure event required, sample 100%.

## Experiment schema

```
game/experiments/<name>.toml
```

```toml
[experiment]
key         = "new_inventory_ui_2026_05"
hypothesis  = "Grid layout increases level_complete by 3%"
flag        = "new_inventory_ui"
primary_metric = "level_complete_rate_d1"
guardrail_metrics = ["crash_free_users", "session_length_p50", "purchase_rate"]
mde         = 0.03                          # min detectable effect
power       = 0.80
alpha       = 0.05
start       = "2026-05-17"
end         = "2026-05-31"
holdout     = 0.05                          # 5% never assigned
audience    = "channel == 'stable' && platform != 'web'"

[[variant]]
key = "control"
weight = 0.5

[[variant]]
key = "grid"
weight = 0.5
```

CI rejects experiments missing hypothesis, MDE, or guardrails.

## Bucketing

```
bucket = sha256(player_hash + experiment_key) % 10000 / 10000
if bucket < holdout: skip
remap (bucket - holdout) into variant weights
```

Sticky per `player_hash`. Cross-device requires logged-in identity.

## Engine API

```rust
let variant = nexus::experiments::variant_for("new_inventory_ui_2026_05");
match variant.as_str() {
    "grid" => show_grid_inventory(),
    _      => show_list_inventory(),
}
// exposure event emitted automatically on first read per session
```

Result also surfaces as the bound flag value (`new_inventory_ui = true` if `grid`).

## Metrics

| Metric type | Source |
|-------------|--------|
| Conversion (rate) | analytics events |
| Continuous (time, score) | analytics with value |
| Ratio (ARPU) | derived |
| Count | analytics |
| Guardrail | dashboard query |

`→ docs/guides/liveops/analytics.md`

## Stat-sig stop rules

| Rule | Action |
|------|--------|
| Guardrail breach (any) | auto-stop, fall back to control, page |
| Sequential test boundary hit | promote winner |
| Pre-registered end reached | analyze, write decision doc |
| Sample size > 4× planned, still inconclusive | stop, document |

Use sequential testing (e.g. mSPRT) to avoid peeking penalty. GrowthBook supports Bayesian + frequentist sequential.

## Output

```
experiments/<key>/results.md   (auto-written on stop)
- decision: ship-grid | ship-control | inconclusive
- effect: +2.4% (95% CI: +0.8% to +4.0%)
- guardrail deltas
- exposure counts
- linked dashboard
- recommendation
```

Coder reads this; if `ship-grid` → opens PR removing the flag, hard-coding the winner.

## Holdout

5% global holdout never participates in any A/B. Used for long-term cumulative-impact analysis ("are all our 'wins' adding up?").

## Smoke test

```bash
nexus experiments dry-run new_inventory_ui_2026_05 \
  --simulate=10000 --seed=42
# prints bucket distribution, variant weights, expected exposures
```

## Verify

```bash
nexus experiments status new_inventory_ui_2026_05
# → start, end, exposures per variant, current effect + CI, guardrail status
```

## Rollback

```bash
nexus experiments stop new_inventory_ui_2026_05 --reason='guardrail_breach'
# falls all users back to control flag value
```

## Tooling

| Tool | Role |
|------|------|
| GrowthBook | bucketing + analysis (default) |
| Statsig | vendor alternative |
| Optimizely | vendor |
| Eppo | analysis-only |
| nexus-coder | drafts experiments from open questions |

## Cross-links

- `→ docs/guides/liveops/feature-flags.md` — flag schema (variants ride flags)
- `→ docs/guides/liveops/analytics.md` — metrics
- `→ docs/guides/liveops/dashboards.md` — guardrail tiles
- `→ docs/guides/liveops/canary-and-rollback.md`

## References

- GrowthBook experiments · `https://docs.growthbook.io/experiments`
- mSPRT sequential testing · `https://arxiv.org/abs/1611.05655`
- Statsig docs · `https://docs.statsig.com/`
- Optimizely stats engine · `https://docs.developers.optimizely.com/`
- Trustworthy Online Controlled Experiments (Kohavi/Tang/Xu)

## Open

- `[DECISION NEEDED]` Default stat method — Bayesian (intuitive) vs frequentist sequential (rigor).
