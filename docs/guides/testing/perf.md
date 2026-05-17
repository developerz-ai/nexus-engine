<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Performance Tests

Performance is a spec. → `docs/architecture/01-principles.md` law #5.

Every public API with a contract `target` has a benchmark proving it.

## Tool per use case

| Use | Tool |
|-----|------|
| Per-function micro-benchmarks (Rust) | `criterion` |
| CLI binaries / end-to-end | `hyperfine` |
| Frame-time profiling | engine `--trace` flag → `tracing-tracy` or `tracing-chrome` |
| Flame graphs | `samply` (cross-platform) + `cargo flamegraph` |
| GPU profiling | `wgpu` profiler + RenderDoc / Tracy GPU |
| Memory profiling | `dhat`, `heaptrack` |
| TS micro-benchmarks | `vitest bench` |
| Python | `pytest-benchmark` |

Cite: github.com/bheisler/criterion.rs · github.com/sharkdp/hyperfine · github.com/mstange/samply · tracy.nereid.pl.

## Where benchmarks live

```
crates/<crate>/benches/
├── archetype_query.rs        # criterion benches
└── frame_loop.rs
```

`Cargo.toml`:

```toml
[[bench]]
name    = "archetype_query"
harness = false
```

## Criterion benchmark

```rust
// crates/nexus-ecs/benches/archetype_query.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use nexus_ecs::*;

fn bench_query_10k(c: &mut Criterion) {
    let mut world = World::new();
    for _ in 0..10_000 {
        world.spawn((Position::default(), Velocity::default()));
    }

    let mut group = c.benchmark_group("query");
    group.throughput(Throughput::Elements(10_000));
    group.bench_function("position_velocity_10k", |b| {
        b.iter(|| {
            for (p, v) in world.query::<(&Position, &Velocity)>().iter() {
                black_box((p, v));
            }
        });
    });
    group.finish();
}

criterion_group!(benches, bench_query_10k);
criterion_main!(benches);
```

Run:

```bash
cargo bench -p nexus-ecs                                          # all benches
cargo bench -p nexus-ecs --bench archetype_query                  # one
cargo bench -p nexus-ecs --bench archetype_query -- --save-baseline main
cargo bench -p nexus-ecs --bench archetype_query -- --baseline main
```

## Benchmark naming

```
bench_<op>_<size>
```

`bench_archetype_query_10k`, `bench_pbr_pass_4k`, `bench_rollback_resim_8frames`.

`<size>` reveals scaling. Bench multiple sizes per op:

| Size | Use |
|------|-----|
| `1` | per-op overhead |
| `100`, `1k`, `10k`, `100k`, `1m` | scaling |
| `worst` | adversarial input |

`criterion`'s `BenchmarkGroup` with `throughput` reports M elem/s.

## Performance contracts

Every public API spec lists targets:

```
## Performance Contract
| Metric | Target | Hard limit |
|--------|--------|-----------|
| Spawn 1k entities | < 200 µs | 500 µs |
| Query archetype (10k) | < 100 µs | 250 µs |
| Frame submit | < 1 ms | 5 ms |
```

→ `docs/specs/<system>/<file>.md` `## Performance Contract` section (spec format).

Every contract row has a corresponding `#[bench]` in the crate. CI verifies the bench result ≤ `Hard limit`. PR diff verifies bench result vs. main baseline within `±5%` of `Target`.

## Regression gate

```yaml
# .github/workflows/perf.yml
- name: Bench main baseline
  run: cargo bench -p nexus-ecs -- --save-baseline main

- name: Checkout PR
  run: git checkout $PR_HEAD

- name: Bench PR
  run: cargo bench -p nexus-ecs -- --baseline main --output-format bencher | tee bench.json

- name: Gate
  run: nexus perf gate bench.json --max-regress 5%
```

`nexus perf gate`:
- Parses criterion JSON.
- Diffs against baseline.
- > 5% regression on any benchmark → exit non-zero.
- > 1% regression → PR comment with table.
- Improvement > 5% → celebrated, must update spec target.

Per-system overrides: `<crate>/perf.toml` sets stricter thresholds for hot paths.

```toml
# crates/nexus-ecs/perf.toml
[[gate]]
bench           = "query/position_velocity_10k"
target          = "100us"
hard_limit      = "250us"
max_regress_pct = 2
```

## Hyperfine for CLIs

```bash
hyperfine --warmup 3 --runs 30 \
  'nexus build --release' \
  'nexus build --release --incremental'
```

CI runs `hyperfine` for `nexus new` (template scaffold time) and `nexus build` (cold/warm). Targets documented in `docs/architecture/03-tech-stack.md`.

| CLI op | Target |
|--------|--------|
| `nexus new mygame` cold | < 5 s |
| `nexus new mygame` warm | < 2 s |
| `nexus build --release` cold | < 60 s (clean) |
| `nexus build --release` warm | < 5 s |
| `nexus test` warm | < 30 s |

## Frame-time profiling

```bash
nexus run --trace tracy demo/fps
nexus run --trace chrome --output trace.json demo/fps
```

Engine emits per-system frame timing via `tracing` spans. Tracy / `chrome://tracing` load it.

Targets per system in `docs/specs/<system>/overview.md` `## Performance Contract`. → `docs/specs/core/jobs.md` (frame budget).

## Flame graphs

```bash
cargo flamegraph -p nexus-renderer --bench frame_loop -- --bench
samply record nexus run --headless --scenario scenarios/perf/heavy-scene.toml
samply load profile.json
```

CI uploads flame SVG as a PR artifact for any > 1% regression. Reviewer (human or AI) sees the diff immediately.

## Memory profiling

```bash
cargo build --release --features dhat
target/release/nexus-fps                           # writes dhat-heap.json
dh_view.html                                       # browser-load
```

Per-system memory budgets in `docs/specs/core/memory.md`. CI runs a `dhat` job on the demo FPS once per release; > 5% growth fails.

## TypeScript benchmarks

```ts
import { bench, describe } from 'vitest';

describe('JSON-RPC client', () => {
  bench('encode 1k spawns', () => {
    encodeRequest({ method: 'spawn', params: spawns });
  });
});
```

Run: `pnpm vitest bench`.

## Python benchmarks

```python
def test_serialize_perf(benchmark):
    result = benchmark(serialize_request, large_payload)
    assert benchmark.stats.mean < 0.001
```

Run: `uv run pytest --benchmark-only`.

## Game-side perf

`nexus bench` (game template) runs the game's `benches/`. Same gate, same format.

| Game perf target | Default |
|------------------|---------|
| Frame time (60 Hz) | < 16.6 ms p99 |
| Frame time (120 Hz) | < 8.3 ms p99 |
| Frame time (VR 90 Hz) | < 11.1 ms p99 |

→ `game-tests.md`.

## Hard rules

| Rule | |
|------|--|
| Every public API perf target has a benchmark | spec contract |
| Benchmarks run on dedicated CI runner (no shared CPU) | reduce noise |
| Warm-up phase ≥ 3 iterations | criterion default |
| Baseline = `main` branch HEAD | PR diff |
| `--max-regress 5%` default | tighter per crate via `perf.toml` |
| Benchmark output is JSON | nexus-merge consumption |
| Flame graph artifact on regression | reviewer can see hot path |
| No `release` profile dependency on `debug-assertions` | corrupts numbers |

## Forbidden

| Pattern | Why |
|---------|-----|
| `Instant::now()` differencing in tests | Use `criterion` |
| Hidden `--features dev` enabled in bench | Lies about prod perf |
| Benchmarks that allocate then time | Time the steady state |
| `cargo bench` with default harness | No JSON, no baselines |
| Real network / disk in micro-benchmarks | Variance kills signal |
| `println!` inside the timed loop | Skews results |
| Hand-tuned numbers in spec without bench | Speculation, not contract |

## Cross-link

- → `docs/architecture/01-principles.md` (law #5: performance is a spec)
- → `docs/specs/core/jobs.md` · → `docs/specs/core/memory.md`
- → `docs/specs/renderer/overview.md` · → `docs/specs/networking/rollback.md`
- → `ci.md` (perf gate placement)
- → `docs/guides/merge-system.md` (regression gating)
- → `game-tests.md` (game-side `nexus bench`)
