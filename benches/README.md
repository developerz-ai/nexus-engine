<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Workspace-Level Benchmarks

Cross-crate criterion benches live here. Per-crate benches stay under `crates/<name>/benches/` and are owned by that crate.

Spec refs:
- `docs/architecture/01-principles.md` Law 5 — Performance Is a Spec.
- `docs/guides/testing/perf.md` — bench authoring guide.

## Layout

```
benches/
├── README.md                                    (this file)
├── baselines/                                   committed to git
│   ├── .keep
│   └── <system>-<scenario>.json                 criterion summary, one per
│                                                bench × machine class
└── <system>/                                    one dir per system spanned
    └── <scenario>.rs                            criterion harness, harness=false
```

Per-bench summary JSON is the canonical artifact `nexus-merge` reads.

## Reference machine

Per Law 5, the perf contract is measured against:

> **AMD Ryzen 9 7950X + RTX 4070 + 64 GB RAM, Linux** — modal indie target circa 2026.

(Pinned in `docs/architecture/03-tech-stack.md` §"Reference machine".)

Numbers from other hardware classes go in `baselines/<system>-<scenario>.<machine-class>.json` with the class declared in `scripts/lib/manifest.toml` once additional classes ratify.

## Baselines

Format: criterion summary JSON, one file per bench, named `<system>-<scenario>.json`. Example:

```
benches/baselines/ecs-archetype-query-10k.json
benches/baselines/renderer-pbr-1000-meshes.json
benches/baselines/net-rollback-resim-8-players.json
```

Each baseline is the **accepted** performance number. Updates require a PR that explains the delta (`docs/guides/pr-protocol.md`).

Schema: criterion's native `estimates.json` shape, plus a small Nexus envelope.

```json
{
  "schema": "nexus.bench/v1",
  "system": "ecs",
  "scenario": "archetype-query-10k",
  "machine_class": "reference-2026",
  "baseline": {
    "median_ns": 12345,
    "mad_ns": 87,
    "sample_size": 100
  },
  "perf_contract": {
    "target_ns": 15000,
    "hard_limit_ns": 25000,
    "spec": "docs/specs/core/ecs.md#performance-contract"
  },
  "git_rev": "<sha-when-baseline-captured>",
  "captured_at": "2026-05-17T00:00:00Z"
}
```

Bench output (raw criterion artifacts, flamegraphs, percentile distributions) goes to `logs/bench/` — never committed.

## Running

```bash
scripts/bench                          # run every workspace + per-crate bench
scripts/bench --crate nexus-core       # one crate
scripts/bench --bench ecs_query        # one bench by name
scripts/bench --compare                # vs committed baseline; fails on regression
scripts/bench --capture                # rewrite baseline (requires PR justification)
```

Under the hood:

```bash
cargo bench --workspace -- --output-format=bencher | tee logs/bench/raw.txt
cargo criterion --message-format=json > logs/bench/criterion.jsonl
```

Compare-mode loads `baselines/<system>-<scenario>.json` and applies the gate:
- Median regression beyond the **target** → warn + require PR comment.
- Median regression beyond the **hard limit** → block merge.

## Adding a bench

1. Author the perf contract in the relevant spec under `docs/specs/<system>/`.
2. Drop the harness under `benches/<system>/<scenario>.rs` (or per-crate `crates/<name>/benches/`).
3. Register in the parent `Cargo.toml`:
   ```toml
   [[bench]]
   name = "<system>_<scenario>"
   harness = false
   ```
4. Run `scripts/bench --capture` on the reference machine to seed `baselines/<system>-<scenario>.json`.
5. Commit baseline JSON alongside the harness.

[BENCHMARK NEEDED] — first-pass baselines for every crate get captured once each system reaches its v0.1 spec-conformance milestone.

## Cross-links

- `docs/guides/testing/perf.md` — full bench authoring guide.
- `docs/guides/testing/coverage.md` — line/branch coverage (separate gate).
- `docs/guides/merge-system.md` — how the merge bot consumes bench JSON.
- `scripts/bench` — CLI wrapper.
