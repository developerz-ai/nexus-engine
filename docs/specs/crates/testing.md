<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Testing

> Every community crate ships tests. `cargo test` clean. Coverage floor per category. At least one scenario test against the engine. At least one bench if the crate makes a perf claim. Headless-safe assertion.

→ Overview: `docs/specs/crates/overview.md`.
→ Category-required floors: `docs/specs/crates/categories.md`.
→ Quality bar (consumes test signal): `docs/specs/crates/quality-bar.md`.
→ Engine principle: Law 12 (`docs/architecture/01-principles.md`).

## Mandatory test surface

| Layer | Mandatory? | Tooling |
|---|---|---|
| Unit | yes | `cargo test --lib` |
| Integration | yes (≥ 1) | `cargo test --test '*'` |
| Doc tests | yes for public items with non-trivial examples | `cargo test --doc` |
| Scenario | yes (≥ 1) | `nexus crate test --scenarios` |
| Property | recommended | `proptest` |
| Fuzz | required for parsers / deserializers | `cargo fuzz` |
| Bench | required if Performance Contract declared | `criterion` |
| Visual regression | required for `style` category | `nexus crate test --visual` |
| Determinism | required if `deterministic = true` | `nexus crate test --determinism` |
| Headless smoke | always | `nexus crate test --headless` |

## Coverage floors (per category)

From `docs/specs/crates/categories.md`:

| Category | Floor |
|---|---|
| `genre`, `physics`, `net`, `platform`, `script-lang` | 80% |
| `style`, `input`, `audio`, `genre-toolkit` | 70% |
| `asset-source`, `feature-flag`, `telemetry-sink`, `tools` | 60% |
| `test-fixtures` | n/a (fixtures are the test) |

Measured via `cargo-llvm-cov`. `nexus crate test --coverage` emits JSON:

```json
{ "lines": { "total": 2104, "covered": 1758, "percent": 0.835 }, "floor": 0.70, "pass": true }
```

Coverage delta in CI: a PR must not decrease coverage below the floor. Categories where the floor is already exceeded enjoy a 5-point grace band for legitimate refactors.

## Scenario tests

Every crate ships ≥ 1 scenario in `tests/scenarios/*.toml`. Scenarios drive the engine headlessly via `nexus run --scenario`. Format defined in `docs/specs/agent/scenarios.md`.

Example for `nexus-style-anime`:

```toml
# tests/scenarios/cel-shading-smoke.toml
[scenario]
name        = "cel-shading-smoke"
description = "Anime style renders a sphere without panic."
seed        = 42
timeout_ms  = 5000

[engine]
features = ["renderer", "headless"]
style    = "nexus-style-anime"

[steps]
1 = { action = "spawn", template = "sphere", at = [0, 0, 0] }
2 = { action = "wait_frames", n = 60 }
3 = { action = "assert_no_errors" }
4 = { action = "snapshot", out = "snapshot.json" }

[asserts]
panics_seen      = 0
errors_seen      = 0
frames_rendered  = ">= 60"
```

Run with:

```
nexus crate test --scenarios
```

`nexus-coder` runs the same harness during evaluation. → `docs/guides/crates/agent-recipes.md`.

## Performance Contract tests

If the crate's manifest or README claims a perf number, a bench MUST validate it.

```rust
// benches/cel_shading.rs — criterion harness
fn cel_shading_bench(c: &mut Criterion) {
    c.bench_function("cel_shading_4k_sphere", |b| {
        b.iter(|| render_sphere_4k(&style));
    });
}
```

Run with `nexus crate test --benches`. CI compares against `benches/baselines.json`; a regression > 10% beyond the declared hard limit blocks merge. → Law 5.

## Determinism tests (required for `deterministic = true`)

A determinism test executes the crate's surface twice with the same seed, asserts byte-identical output.

```toml
# tests/scenarios/determinism.toml
[scenario]
name = "determinism"
seed = 42
runs = 2

[asserts]
snapshot_hash_equal_across_runs = true
```

For `physics`, `net`, `genre`, `script-lang`, `platform`, `input`, `genre-toolkit`, `test-fixtures` categories.

## Visual regression (required for `style` category)

`style` crates ship a `tests/visual/` dir of reference scenes. CI renders, diffs against goldens with a perceptual metric (SSIM ≥ 0.95).

```
tests/visual/
├── sphere.toml          ← scene description
├── sphere.golden.png    ← committed reference
└── sphere.diff.png      ← generated on regression, uploaded as CI artifact
```

→ `docs/guides/testing/visual-regression.md` `[NEW — to be authored by Agent 04]`.

## Headless smoke (always)

Every crate boots in `--headless` mode without panic, without GPU, without speakers, with a stub input. The test asserts:

```
nexus crate test --headless --frames=60
```

Failure modes that count as bugs (per Law 8):
- Hard panic in headless mode.
- Required GPU resource without `headless_safe = false` declared.
- Required network without offline-mode fallback (for `asset-source`, `telemetry-sink`, `feature-flag`).

`headless_safe = false` crates skip this check but get a banner on consume.

## Fuzz tests

Required for any crate that:
- Parses untrusted input (asset format, network packet, mod config).
- Deserializes from a wire format (serde, bincode, custom).
- Compiles or interprets a script-VM input.

`cargo fuzz` harness:

```rust
// fuzz/fuzz_targets/parse_packet.rs
fuzz_target!(|data: &[u8]| {
    let _ = nexus_net_webtransport::parse_packet(data);  // no panic, no UAF
});
```

CI runs the corpus for a bounded budget (default 60 seconds per target on PR; 1 hour on main).

## Cross-engine-version test matrix

Verified-tier crates run their full test suite against each engine version they claim compat with:

| Crate version | Engine 1.0 | Engine 1.1 | Engine 1.2 |
|---|---|---|---|
| `0.3.1` | green | green | green |

`nexus crate test --engine-matrix` orchestrates. Cached in CI; one-shot run takes the engine compat range from the manifest.

## CI template

Drop in `.github/workflows/ci.yml`:

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        engine: ["1.0", "1.1", "1.2"]
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --workspace
      - run: cargo test --doc
      - run: nexus crate test --headless --frames=60 --engine=${{ matrix.engine }}
      - run: nexus crate test --scenarios --engine=${{ matrix.engine }}
      - run: nexus crate test --coverage --engine=${{ matrix.engine }}
      - run: cargo deny check
      - run: cargo audit --deny=warnings
      - run: cargo semver-checks check-release
      - if: matrix.engine == '1.2'
        run: cargo public-api --diff-git-checkouts main HEAD
```

## Test-fixture crates

A `test-fixtures` category crate is the test surface for *other* crates. It ships:
- Scenario TOML files.
- Reference replay files.
- Reference snapshots.
- Reference assets (under MIT or CC0).

Consumers depend on it as `[dev-dependencies]`:

```toml
[dev-dependencies]
nexus-test-fixtures-determinism-suite = "1.0"
```

And run with `nexus crate test --scenarios --fixtures=nexus-test-fixtures-determinism-suite`.

## Integration Points

- → `docs/specs/agent/scenarios.md` — scenario TOML format (the harness).
- → `docs/specs/crates/quality-bar.md` — test signal feeds the audit verdict.
- → `docs/specs/crates/manifest.md` — `deterministic`, `headless_safe` flags drive which tests apply.
- → `docs/specs/crates/release-pipeline.md` — test suite must be green for publish.
- → `docs/specs/coder/tools.md` — `RunHeadlessScenario` is the engine surface.

## Open Questions

- `[DECISION NEEDED]` Coverage delta tolerance for refactors: 5-point grace OK, or strict? Default: 5-point grace within category floor.
- `[DECISION NEEDED]` Fuzz budget on PR vs main: 60s PR / 1h main, OK? Default: yes; tune per `[BENCHMARK NEEDED]`.
- `[DECISION NEEDED]` Visual regression SSIM threshold: 0.95 too tight? Default: 0.95; per-scene override allowed.
- `[BENCHMARK NEEDED]` Per-category measured floor calibration after first 10 community crates.
- `[AGENT: 10]` Confirm `nexus crate test --scenarios` is a thin wrapper over `nexus run --scenario`.
