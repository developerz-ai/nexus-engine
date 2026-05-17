<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Testing — Overview

Tests ship with code. Every crate. Every PR. No exceptions.

## The principle

> A change without a test is a change that doesn't exist.

Engine principle: `docs/architecture/01-principles.md` law #12 — "Tests ship with code".

Cite: Google Testing Blog (the test pyramid) · Beck, *Test-Driven Development* · RimWorld + Factorio dev blogs on deterministic replay testing · Bevy testing patterns · Naughty Dog GDC talks on engine testing.

## The three pyramids

```
        ┌─────────────────┐
        │   Scenario      │   ← TOML, runs in nexus-engine binary, on-PR
        │  (integration   │
        │   for AI)       │
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │  Integration    │   ← multi-crate, headless boot, real services
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │     Unit        │   ← per-fn, pure, hermetic, <100ms each
        └─────────────────┘
```

The pyramid order is also the **mandatory authoring order** for any new feature: unit tests first, integration second, scenarios third. → `docs/guides/ai-dev-onboarding.md`.

## Test layers

| Layer | File | Tool |
|-------|------|------|
| Unit | `unit.md` | per language |
| Integration | `integration.md` | `cargo nextest`, `vitest`, `pytest` with fixtures |
| Scenario | `scenarios.md` | `nexus run --scenario` (TOML) |
| Snapshot / replay | `snapshot.md` | `nexus replay --check` (binary) |
| Property | `property.md` | `proptest`, `fast-check`, `hypothesis` |
| Performance | `perf.md` | `criterion`, `hyperfine` |
| Fuzz | `fuzz.md` | `cargo-fuzz`, packet/asset/script fuzzers |
| Visual regression | `visual.md` | pixel-diff golden images |
| Network | `network.md` | deterministic lag/loss injection |
| Coverage | `coverage.md` | `cargo-llvm-cov`, `c8`, `coverage.py` |
| Game-side (template) | `game-tests.md` | same stack, `nexus test` |
| CI orchestration | `ci.md` | GitHub Actions matrix |

## What runs when

| Gate | Tests | Where |
|------|-------|-------|
| Pre-commit | format · lint | local + CI |
| Pre-push | unit | local |
| Per PR | unit · integration · scenario · perf-diff · visual-diff | CI |
| Per merge to main | full suite + fuzz smoke | CI |
| Nightly | fuzz (long-run) + coverage report + dep audit | CI |
| Per release | full matrix on all platforms | CI |

→ `ci.md` for the pipeline contract.

## Determinism mandate

| Rule | |
|------|--|
| No `std::thread::sleep` in tests | use `tokio::time::advance` or `nexus_test::clock` |
| No `SystemTime::now()` | use injected `Clock` (test impl returns frozen instant) |
| No real network | use `nexus-test-net` loopback |
| No real GPU (default) | use `wgpu`'s null backend; opt in to GPU tests with `--features gpu` |
| Random | `rand_chacha` seeded from test name |
| File system | `tempfile` per test |

A flaky test is a blocker bug, not a retry candidate. → `scenarios.md` (flake policy).

## Naming

| Kind | Pattern | Example |
|------|---------|---------|
| Unit | `<fn>_<condition>_<expected>` | `spawn_zero_count_returns_empty` |
| Integration | `<system>_<scenario>` | `renderer_pbr_demo_scene` |
| Scenario | `<feature>.toml` | `combat-melee-hitstop.toml` |
| Property | `prop_<invariant>` | `prop_serialize_roundtrip` |
| Bench | `bench_<op>_<size>` | `bench_archetype_query_10k` |

AAA structure (Arrange / Act / Assert) — sections marked with comments only when non-obvious.

## Performance contract for tests

| Layer | p95 per test |
|-------|--------------|
| Unit | ≤ 100 ms |
| Integration | ≤ 5 s |
| Scenario | ≤ 30 s (one) |
| Visual | ≤ 10 s |
| Property (default) | ≤ 30 s (≤ 1000 cases) |

Anything slower goes into the nightly bucket via `#[cfg(feature = "slow")]` (Rust) / `@pytest.mark.slow` / `it.skip` outside the slow suite.

## Coverage floors

| Crate kind | Line coverage | Branch coverage |
|------------|---------------|-----------------|
| `nexus-core`, `nexus-ecs`, `nexus-math` | 90% | 85% |
| Renderer, physics, audio, networking | 80% | 70% |
| Genre / style modules | 70% | 60% |
| Editor / CLI / tooling | 60% | best-effort |
| Examples / demos | none (scenario-tested) | — |

CI fails when coverage drops > 0.5% on any crate. → `coverage.md`.

## Tests as documentation

| | Doc | Test |
|--|-----|------|
| `examples/` (Rust) | yes, compiled, runnable | yes, `cargo test --examples` |
| Doc-test (`/// ```` block) | yes | yes, `cargo test --doc` |
| `# Examples` in TSDoc | yes | runnable via `tsx` in CI |
| `>>>` in docstrings (Python) | yes | `pytest --doctest-modules` |

Every public API: an example, the example compiles, the example runs as a test. → `docs/guides/coding-style/comments.md`.

## Game-side mirror

`nexus new mygame` scaffolds:

```
mygame/
├── game/
│   ├── src/
│   └── tests/
├── server/
│   └── tests/
├── ai-agents/
│   └── tests/
├── scenarios/                # game-level TOML scenarios
│   └── playable-end-to-end.toml
└── .github/workflows/
    └── nexus-ci.yml          # same CI as engine
```

Game devs run identical commands:

```bash
nexus test                       # all unit + integration
nexus test --scenario            # all scenarios
nexus bench                      # all benchmarks
nexus test --coverage            # coverage report
```

→ `game-tests.md` for details.

## Cross-link

- → `docs/architecture/01-principles.md` (law #12)
- → `docs/specs/agent/scenarios.md`, `docs/specs/agent/replay.md`
- → `docs/guides/ai-dev-onboarding.md` (TDD workflow for AI agents)
- → `docs/guides/merge-system.md` (gating)
- → `unit.md`, `integration.md`, `scenarios.md`, `snapshot.md`, `property.md`, `perf.md`, `fuzz.md`, `visual.md`, `network.md`, `game-tests.md`, `coverage.md`, `ci.md`
