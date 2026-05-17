<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Testing — Quick Pointer

One-page index. Authoritative content lives in the per-kind files in this directory.

Law: every PR ships its tests. → `../../architecture/01-principles.md` Law 12.
Floor: per-crate coverage gates. → `coverage.md`.
Doctrine: the three pyramids. → `overview.md`.

## Where each kind lives

| Kind | What | Authoring guide | Location in code |
|---|---|---|---|
| unit | per-function, hermetic, ≤100ms | `unit.md` | `crates/<c>/src/**/mod tests` |
| integration | multi-crate, headless boot | `integration.md` | `crates/<c>/tests/*.rs` |
| scenario | TOML, drives engine binary | `scenarios.md` | `docs/specs/agent/scenarios/*.toml`, `games/<g>/scenarios/` |
| snapshot / replay | deterministic byte-equality | `snapshot.md` | `crates/<c>/tests/snapshot_*.rs` |
| property | invariants via `proptest` | `property.md` | `crates/<c>/tests/prop_*.rs` |
| performance | criterion benches | `perf.md` | `crates/<c>/benches/`, `benches/` |
| fuzz | `cargo-fuzz` + corpora | `fuzz.md` | `crates/<c>/fuzz/`, `fuzz/` |
| visual | pixel-diff golden image | `visual.md` | `crates/<c>/tests/visual/`, `tests/golden/` |
| network | lag/loss injection | `network.md` | `crates/nexus-net/tests/net_*.rs` |
| coverage | line+branch gate | `coverage.md` | computed; output in `logs/test/coverage/` |
| game-side | identical stack, in template | `game-tests.md` | `nexus new` scaffold |
| CI orchestration | matrix + gates | `ci.md` | `.github/workflows/*` (deferred) |

## How to run (via `scripts/test`)

`scripts/test` reads `scripts/lib/test-policy.toml` and routes each crate to the right runner.

```bash
scripts/test                                          # everything required this commit
scripts/test --kind unit                              # unit only
scripts/test --kind integration
scripts/test --kind scenario
scripts/test --kind property
scripts/test --kind visual
scripts/test --kind fuzz                              # smoke (30s/target by default)
scripts/test --kind fuzz --target parse_gltf --duration 5m
scripts/test --crate nexus-core                       # one crate, all required kinds
scripts/test --coverage                               # full suite + coverage gate
scripts/test --watch                                  # nextest + watchexec
```

Configs that drive each runner:

| File | Drives |
|---|---|
| `.config/nextest.toml` | unit + integration + property runner |
| `tarpaulin.toml` | coverage (local) |
| `scripts/lib/test-policy.toml` | required kinds per crate + per-crate floors |
| `naga-validate.toml` | WGSL validation (invoked from `scripts/check`) |
| `audit.toml` | dependency vulnerability gate |
| `deny.toml` | license + edge allow-list |
| `benches/README.md` | bench layout + baseline contract |
| `fuzz/README.md` | fuzz target inventory |
| `codecov.yml` | upload format (dormant until codecov wired) |

## Per-crate floors (summary)

Full table: `coverage.md`. Source of truth: `../../../scripts/lib/test-policy.toml`.

| Tier | Line | Branch |
|---|---|---|
| core (`nexus-core`, `nexus-hal`) | 90% | 85% |
| systems (renderer, physics, audio, net, assets, script, agent) | 80% | 70% |
| genres + styles | 70% | 60% |
| tooling (editor, cli, sdks, codegen) | 60% | best-effort |
| demo games | scenario-covered | — |

## Cross-link

- Pyramid + naming + determinism rules: `overview.md`.
- Per-PR coverage diff gate: `coverage.md`.
- CI gate placement (deferred to CI phase): `ci.md`.
- Spec → test mapping (Law 12 conformance): `../pr-protocol.md`.
