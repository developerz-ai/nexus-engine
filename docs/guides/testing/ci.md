<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# CI Pipeline

GitHub Actions. Matrix per OS / backend. Staged gates. JSON output. nexus-merge consumes everything.

Same workflow in engine (`nexus-engine/.github/workflows/`) and in every `nexus new mygame` template (`mygame/.github/workflows/nexus-ci.yml`). Drift = bug.

## Gate stages (in order)

```
1. fmt              ← always, fail fast
2. lint             ← always
3. unit             ← per language
4. integration      ← cross-crate
5. scenario         ← TOML scenarios
6. visual           ← pixel-diff
7. network          ← multi-client / lag
8. perf             ← bench diff vs main
9. coverage         ← floors + diff
10. fuzz (smoke)    ← touched targets only
11. release (tag)   ← cross-platform binaries
```

Each stage emits structured JSON. A failure short-circuits the rest (configurable). nexus-merge reads the JSON, comments on PR, blocks merge on any non-green stage.

## Matrix

| Axis | Values |
|------|--------|
| OS | `ubuntu-24.04`, `macos-14`, `windows-2022` |
| Rust toolchain | pinned in `rust-toolchain.toml` (stable channel) |
| GPU backend | `vulkan` (Linux), `metal` (macOS), `dx12` (Windows), `wgpu-webgpu` (Linux/Dawn), `wgpu-gles` (mobile/web fallback) |
| Target | `native`, `wasm32-unknown-unknown` (web), `aarch64-linux-android`, `aarch64-apple-ios` |
| Node | `22` LTS |
| Python | `3.12` |

Per-stage matrix subset is opt-in — not every stage runs on every cell.

## Workflow files

```
.github/workflows/
├── style.yml           # fmt + lint (~5 min)
├── test.yml            # unit + integration + scenario (~20 min)
├── visual.yml          # visual diff (~15 min, GPU matrix)
├── network.yml         # network suite (~10 min)
├── perf.yml            # bench gate (~30 min, baseline + PR)
├── coverage.yml        # coverage + diff (~25 min)
├── fuzz.yml            # smoke fuzz on touched targets (~10 min)
├── release.yml         # tag-driven, cross-platform binaries (~60 min)
└── nightly.yml         # full fuzz + long perf + dep audit (~6 h)
```

## `style.yml`

```yaml
name: style
on: [push, pull_request]
concurrency:
  group: style-${{ github.ref }}
  cancel-in-progress: true

jobs:
  fmt-lint:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@1.85.0
        with: { components: rustfmt, clippy }
      - uses: Swatinem/rust-cache@v2
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: astral-sh/setup-uv@v3
      - uses: JohnnyMorganz/setup-stylua@v2
        with: { version: 0.20.0 }

      - run: pnpm install --frozen-lockfile
      - run: uv sync --frozen

      - run: nexus fmt --check
      - run: nexus lint --json | tee lint.json

      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: lint-report, path: lint.json }
```

## `test.yml`

```yaml
name: test
on: [push, pull_request]
concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit-integration:
    needs: style                           # only run if fmt+lint pass
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, macos-14, windows-2022]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: dtolnay/rust-toolchain@1.85.0
      - uses: Swatinem/rust-cache@v2
      - uses: taiki-e/install-action@nextest

      - run: cargo nextest run --workspace --message-format libtest-json > nextest.json
      - run: cargo test --workspace --doc

      - run: pnpm install --frozen-lockfile
      - run: pnpm -r run test -- --reporter=json --outputFile=vitest.json

      - uses: astral-sh/setup-uv@v3
      - run: uv sync --frozen
      - run: uv run pytest --junit-xml=pytest.xml

      - uses: leafo/gh-actions-lua@v10
        with: { luaVersion: '5.4' }
      - run: luarocks install busted
      - run: busted --output=json -p '_spec' game/scripts > busted.json
        if: ${{ hashFiles('game/scripts/*_spec.lua') != '' }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-report-${{ matrix.os }}
          path: |
            nextest.json
            vitest.json
            pytest.xml
            busted.json

  scenario:
    needs: unit-integration
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: dtolnay/rust-toolchain@1.85.0
      - uses: Swatinem/rust-cache@v2
      - run: cargo build --release -p nexus-cli
      - run: ./target/release/nexus run --scenario crates/ --parallel $(nproc) --json out/
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: scenarios, path: out/ }
```

## `visual.yml`

```yaml
name: visual
on: [pull_request]

jobs:
  visual:
    strategy:
      fail-fast: false
      matrix:
        backend: [vulkan, metal, dx12, wgpu-webgpu]
        include:
          - backend: vulkan
            os: ubuntu-24.04
          - backend: metal
            os: macos-14
          - backend: dx12
            os: windows-2022
          - backend: wgpu-webgpu
            os: ubuntu-24.04
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: dtolnay/rust-toolchain@1.85.0
      - uses: Swatinem/rust-cache@v2
      - name: Mesa pin (Linux only)
        if: matrix.os == 'ubuntu-24.04'
        run: sudo apt-get install -y mesa-vulkan-drivers=24.0.* lavapipe-tools
      - run: cargo run --release -p nexus-cli -- visual run scenarios/visual/ --backend ${{ matrix.backend }} --json out/
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: visual-failures-${{ matrix.backend }}, path: visual-failures/ }
```

## `perf.yml`

```yaml
name: perf
on: [pull_request]

jobs:
  bench:
    runs-on: [self-hosted, perf]            # dedicated runner, no shared CPU
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - run: git fetch origin main
      - uses: dtolnay/rust-toolchain@1.85.0
      - uses: Swatinem/rust-cache@v2

      - name: Baseline (main)
        run: |
          git checkout origin/main -- crates/ benches/
          cargo bench --workspace -- --save-baseline main
          git checkout HEAD -- crates/ benches/

      - name: PR
        run: cargo bench --workspace -- --baseline main --output-format bencher | tee bench.json

      - run: nexus perf gate bench.json --max-regress 5%

      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: bench-report, path: bench.json }
```

## `coverage.yml`

```yaml
name: coverage
on: [pull_request]

jobs:
  coverage:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: dtolnay/rust-toolchain@1.85.0
        with: { components: llvm-tools-preview }
      - uses: taiki-e/install-action@cargo-llvm-cov
      - uses: taiki-e/install-action@nextest

      - run: cargo llvm-cov nextest --workspace --json --output-path coverage-pr.json

      - run: git fetch origin main
      - run: |
          git checkout origin/main
          cargo llvm-cov nextest --workspace --json --output-path coverage-main.json
          git checkout -

      - run: nexus tools coverage diff coverage-main.json coverage-pr.json --output diff.json

      - run: nexus tools coverage gate diff.json --floor-file .nexus/coverage-floors.toml

      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: coverage, path: diff.json }
```

## `nightly.yml`

```yaml
name: nightly
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  fuzz-long:
    runs-on: ubuntu-24.04
    timeout-minutes: 420
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@nightly
      - run: |
          for t in $(cargo fuzz list); do
            cargo +nightly fuzz run "$t" -- -max_total_time=3600 || \
              gh issue create --title "fuzz crash: $t" --body-file fuzz/artifacts/$t/*.minimized
          done

  prop-deep:
    runs-on: ubuntu-24.04
    timeout-minutes: 180
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@1.85.0
      - env: { PROPTEST_CASES: 10000, HYPOTHESIS_MAX_EXAMPLES: 10000 }
        run: cargo nextest run --workspace
```

## `release.yml`

Tag-driven (`v*.*.*`). Builds binaries for: Linux x64, Linux aarch64, macOS aarch64, Windows x64, WASM, Android arm64, iOS arm64. Runs full matrix one more time. Generates SBOM (`docs/guides/coding-style/dependencies.md`). Publishes:
- GitHub Release with binaries + SBOM
- `crates.io` for engine crates
- `npm` for `@nexus/*` packages
- `pypi` for `nexus-agent-sdk`

## Caching

| Layer | Key |
|-------|-----|
| Cargo registry + git | OS + Cargo.lock hash |
| Cargo target | OS + Cargo.lock + rustc version |
| pnpm store | pnpm-lock.yaml hash |
| uv cache | uv.lock hash |
| Bench baseline | `main` SHA |
| Visual goldens | LFS pointer hash |
| Mesa drivers (Linux) | apt cache, weekly bust |

Cache hit p95 target: > 80%. Misses logged to nexus-merge for action.

## Parallelism

| Stage | Parallelism |
|-------|-------------|
| `nextest` | auto-detect cores |
| `vitest` | thread-pool, isolate per file |
| `pytest -n auto` | xdist, cores |
| Scenarios | `--parallel $(nproc)` |
| Fuzz | per-target one job, jobs in parallel |
| OS matrix | parallel across cells |
| Backend matrix | parallel across cells |

## Timeout policy

| Stage | Timeout |
|-------|---------|
| fmt + lint | 15 min |
| unit + integration | 45 min |
| scenario | 30 min |
| visual | 30 min per backend |
| network | 30 min |
| perf | 60 min |
| coverage | 30 min |
| fuzz smoke | 10 min |
| nightly fuzz | 7 h |
| release | 90 min |

Any timeout = build failure. Re-run only after investigating root cause (timeouts are usually deadlocks, not "the runner was slow").

## Required checks (branch protection)

```
- style / fmt-lint
- test / unit-integration (ubuntu-24.04)
- test / unit-integration (macos-14)
- test / unit-integration (windows-2022)
- test / scenario
- visual / vulkan
- visual / metal
- visual / dx12
- network
- perf
- coverage
- fuzz (smoke)
```

Merge to `main` blocked until all green. nexus-merge enforces (no human override).

## Artifact retention

| Kind | Retention |
|------|-----------|
| Test JSON reports | 30 days |
| Scenario JSON + replays | 30 days |
| Visual failures (PNGs) | 90 days |
| Perf JSON | 365 days (trend) |
| Coverage JSON | 365 days (trend) |
| Fuzz crashes | forever (LFS) |
| Release binaries + SBOM | forever |

## Hard rules

| Rule | |
|------|--|
| Same CI in engine + template (substituted) | drift detection |
| All gates emit JSON | nexus-merge consumption |
| No "re-run flaky" button usage | flake = bug |
| No skipping required checks | branch protection |
| Bench runs on dedicated perf runner | noise floor |
| Visual runs on pinned Mesa driver (Linux) | determinism |
| Caching keys include lockfile hash | reproducibility |
| Timeouts trigger investigation, not retry | root-cause-first |

## Forbidden

| Pattern | Why |
|---------|-----|
| `continue-on-error: true` on gates | bypasses block |
| Re-run buttons clicked > 1× per PR | flake hiding |
| `if: always()` to skip past failures | bypass |
| Mutable cache keys (no lockfile hash) | poisoned |
| Long-running step without timeout | indefinite hang |
| GitHub-hosted runners for perf | noise |
| Real GPUs for default visual tests | flake (use SW + nightly real-GPU) |
| Bash scripts > 20 lines inline | move to `scripts/` |

## Cross-link

- → `overview.md` (gate order)
- → `unit.md`, `integration.md`, `scenarios.md`, `visual.md`, `network.md`, `perf.md`, `coverage.md`, `fuzz.md`
- → `docs/guides/merge-system.md` (consumer)
- → `docs/guides/pr-protocol.md` (PR-side contract)
- → `docs/guides/coding-style/formatting-tools.md` (style gate)
- → `docs/guides/coding-style/dependencies.md` (supply-chain audit jobs)
- → `game-tests.md` (template inherits this workflow)
