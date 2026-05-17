<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Coverage

Per-crate floors. Per-PR diff. JSON output. Block-on-merge.

## Tool per language

| Language | Tool | Output |
|----------|------|--------|
| Rust | `cargo-llvm-cov` (also exposes lcov + JSON) | LCOV + JSON |
| TypeScript | `c8` (V8 native) | JSON + LCOV |
| Python | `coverage.py` | JSON + LCOV |
| Lua | `luacov` + `luacov-html` | JSON via converter |
| WGSL | n/a (validated, not coverage-instrumented) | n/a |

`cargo-tarpaulin` is fine for local exploration; `cargo-llvm-cov` is the CI default (faster, more accurate, integrates with `nextest`).

Cite: github.com/taiki-e/cargo-llvm-cov · github.com/bcoe/c8 · coverage.readthedocs.io.

## Coverage floors

| Crate kind | Line | Branch |
|------------|------|--------|
| `nexus-core`, `nexus-ecs`, `nexus-math`, `nexus-error` | 90% | 85% |
| `nexus-renderer`, `nexus-physics`, `nexus-audio`, `nexus-net`, `nexus-assets`, `nexus-scripting` | 80% | 70% |
| `nexus-genre-*`, `nexus-style-*` | 70% | 60% |
| `nexus-editor`, `nexus-cli`, `nexus-agent-sdk` | 60% | best-effort |
| `examples/*`, `games/*` | — (scenario-covered) | — |
| TS package | 75% | 65% |
| Python package | 80% | 70% |
| Lua module | 70% | 60% |

Per-game floors set in `nexus.toml`:

```toml
[test.coverage]
default = 70
per_crate."game"      = 75
per_crate."server"    = 80
per_crate."ai-agents" = 50
```

## Diff gate

In addition to floors:

| Metric | Threshold |
|--------|-----------|
| Per-crate coverage drop | > 0.5% → block |
| File coverage drop | > 5% → block |
| New file under 70% line | block (unless `examples/` / `tests/`) |
| Diff lines (added) uncovered % | > 20% → block |

PR comment shows per-file diff:

```
crates/nexus-ecs/src/archetype.rs    87.2% → 84.1%   (-3.1%)  ❌
crates/nexus-net/src/rollback.rs     91.0% → 91.5%   (+0.5%)  ✅
```

## Run

```bash
# Rust workspace
cargo llvm-cov nextest --workspace --json --output-path coverage.json
cargo llvm-cov nextest --workspace --lcov --output-path coverage.lcov
cargo llvm-cov report --html                                                       # open

# TS
pnpm vitest run --coverage --coverage.reporter=json --coverage.reporter=lcov

# Python
uv run pytest --cov=src --cov-branch \
  --cov-report=json:coverage.json --cov-report=lcov:coverage.lcov

# Lua
busted --coverage -p '_spec' game/scripts && luacov && nexus tools luacov-to-json
```

`nexus test --coverage` runs all of the above and merges into one report.

## JSON schema (universal)

```json
{
  "schema": "nexus.coverage/v1",
  "totals": { "line_pct": 87.3, "branch_pct": 79.1, "fn_pct": 90.4 },
  "crates": {
    "nexus-ecs": {
      "line_pct": 91.0,
      "branch_pct": 86.4,
      "fn_pct": 94.2,
      "files": {
        "src/archetype.rs": { "line_pct": 84.1, "branch_pct": 71.3, "lines_uncovered": [42, 43, 87] }
      }
    }
  },
  "diff_vs_main": {
    "totals": { "line_pct_delta": -0.3 },
    "regressions": [
      { "file": "crates/nexus-ecs/src/archetype.rs", "delta": -3.1 }
    ]
  }
}
```

nexus-merge consumes this directly. → `docs/guides/merge-system.md`.

## Excludes

```toml
# .cargo/config.toml
[env]
LLVM_COV_FLAGS = "--ignore-filename-regex=(tests|benches|examples|fuzz_targets)"
```

| Excluded | Why |
|----------|-----|
| `tests/` | Tests not counted toward floor |
| `benches/` | Benches not counted |
| `examples/` | Scenario-covered |
| `fuzz/` | Fuzz harness not counted |
| `target/` | Generated |
| `*.gen.rs` | Generated |
| `mod tests` blocks | Test code |

TS exclusions in `vitest.config.ts`:

```ts
coverage: {
  exclude: ['**/*.test.ts', '**/*.bench.ts', '**/dist/**', '**/*.gen.ts'],
}
```

Python in `pyproject.toml`:

```toml
[tool.coverage.run]
omit = ["tests/*", "**/__init__.py"]
branch = true
```

## What 100% does NOT prove

Coverage measures execution, not correctness. The bar is "did this line run", not "did we assert anything about its behavior". 100% is a starting point.

Mandatory companions:
- Property tests for invariants → `property.md`
- Scenarios for behavior → `scenarios.md`
- Fuzz for parsers / sandboxes → `fuzz.md`
- Visual for renderer → `visual.md`

## Per-PR workflow

1. CI runs full test suite with coverage.
2. CI checks out `main`, runs same suite, baselines.
3. CI diffs, produces `coverage.json` with `diff_vs_main`.
4. nexus-merge:
   - Blocks if any floor violated.
   - Blocks if any per-file drop > 5%.
   - Comments per-file diff.
   - Approves if all green.

## Nightly full report

```yaml
- run: cargo llvm-cov nextest --workspace --json | tee coverage-full.json
- run: nexus tools coverage publish coverage-full.json   # → S3 / dashboard
```

Coverage trends published to internal dashboard. Per-crate trend visible over months.

## Hard rules

| Rule | |
|------|--|
| Coverage is structured JSON, not HTML for gating | machine-parseable |
| Per-crate floors enforced — no global average dodge | every crate accountable |
| Diff vs main mandatory | per-PR gate |
| Excludes documented in this file, not ad-hoc per-crate | drift control |
| Coverage runs on the same test set as PR gate | no surprise gaps |
| Generated code excluded | distorts numbers |
| Tests / benches excluded | self-coverage |

## Forbidden

| Pattern | Why |
|---------|-----|
| `// LCOV_EXCL_LINE` comments | hides untested branches; use a real exclusion rule |
| Lowering a crate floor without an ADR | drift normalization |
| Counting `examples/` toward floor | gaming the gate |
| Single HTML report w/o JSON | nexus-merge can't read |
| Coverage-only PRs (no behavior change) | use a refactor PR |
| Tests written for coverage % rather than behavior | useless |

## Cross-link

- → `unit.md`, `integration.md`, `scenarios.md`, `property.md`, `fuzz.md`, `visual.md`, `network.md`, `perf.md`
- → `docs/guides/merge-system.md` (gate consumer)
- → `docs/guides/coding-style/formatting-tools.md` (tool versions)
- → `ci.md` (gate placement)
