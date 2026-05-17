<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Fuzzing

`cargo-fuzz` (libFuzzer) targets, structure-aware harnesses, corpora, and the differential fuzz oracles.

Spec refs:
- `docs/architecture/01-principles.md` Law 12 — Tests ship with code.
- `docs/guides/testing/fuzz.md` — authoritative authoring guide.
- `scripts/lib/test-policy.toml` — declarative target inventory consumed by `scripts/test --kind fuzz`.

This README is policy + layout. Concrete harnesses are owned by `fuzz-engineer` and `perf-engineer`; do NOT add harnesses from a generic config sweep.

## Layout

Per `docs/guides/testing/fuzz.md` §"Fuzz targets", every fuzzable crate hosts its own `fuzz/` next to its source:

```
crates/<crate>/
├── Cargo.toml
├── src/
└── fuzz/
    ├── Cargo.toml                 cargo-fuzz manifest, package = "<crate>-fuzz"
    ├── corpus/                    committed seed corpora
    │   └── <target>/
    │       ├── seed_001.bin
    │       └── crash_<sha>.bin    every fix lands a regression sample here
    └── fuzz_targets/
        ├── <target_a>.rs
        └── <target_b>.rs
```

Workspace-level `fuzz/` (this directory) holds:
- `README.md` (this file).
- Cross-crate differential harnesses (e.g., physics determinism oracle that pulls in `nexus-physics` and a reference impl).
- Shared corpora referenced by multiple targets.

## Target inventory (planned)

Per `docs/guides/testing/fuzz.md` and `scripts/lib/test-policy.toml [classes.fuzz]`.

| Crate | Target | Class | Spec |
|---|---|---|---|
| `nexus-assets` | `parse_gltf` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_fbx` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_obj` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_png` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_exr` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_ogg` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_wav` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_flac` | parser | `docs/specs/assets/import.md` |
| `nexus-assets` | `parse_ttf` | parser | `docs/specs/assets/import.md` |
| `nexus-net` | `rollback_resim` | differential | `docs/specs/networking/transport.md` |
| `nexus-net` | `packet_decode` | parser | `docs/specs/networking/transport.md` |
| `nexus-script` | `lua_vm` | sandbox | `docs/specs/scripting/sandbox.md` |
| `nexus-script` | `rune_vm` | sandbox | `docs/specs/scripting/sandbox.md` |
| `nexus-agent` | `replay_loader` | parser | `docs/specs/agent/replay.md` |
| `nexus-merge` | `parse_manifest` | parser | `docs/guides/merge-system.md` |
| `nexus-physics` (workspace differential) | `physics_f32_vs_fixed` | differential | `docs/specs/physics/determinism.md` |

Harnesses land per the authoring contract in `docs/guides/testing/fuzz.md` §"What every target must do".

## Run

```bash
scripts/test --kind fuzz                                       # smoke (30s per target)
scripts/test --kind fuzz --target parse_gltf --duration 5m     # focused
cargo +nightly fuzz run parse_gltf -- -max_total_time=300      # raw
cargo +nightly fuzz tmin parse_gltf <crash>                    # minimize crash
cargo +nightly fuzz cmin parse_gltf                            # minimize corpus
```

CI budgets (per `docs/guides/testing/fuzz.md` §"CI gates"):

| Gate | Cadence | Per-target budget |
|---|---|---|
| PR smoke (touched targets) | per PR | 30s |
| Nightly | nightly | 1h |
| Pre-release | release branch | 24h |
| OSS-Fuzz | continuous | upstream-managed (apply once public) |

Workflow YAML lands in the CI phase; this file is the policy those workflows consume.

## Crash protocol

Every crash, once fixed:
1. Minimized input goes to `crates/<crate>/fuzz/corpus/<target>/crash_<sha>.bin`.
2. Crash report JSON (`docs/guides/testing/fuzz.md` §"Crash reporting") attached to the issue.
3. Regression test in the per-crate `tests/` suite that loads the minimized input via `include_bytes!`.

The corpus is the regression test.

## Forbidden in fuzz targets

Per `docs/guides/testing/fuzz.md` §"Forbidden":
- Network or filesystem I/O.
- `unwrap()` chains.
- Catching panics silently.
- Reseeding RNG inside the target.
- Stripped symbols in fuzz builds.
- Running without sanitizers (ASan, UBSan).

## Cross-links

- `docs/guides/testing/fuzz.md` — authoring guide.
- `docs/specs/assets/import.md` — asset parser specs.
- `docs/specs/networking/transport.md` — packet protocol.
- `docs/specs/scripting/sandbox.md` — script VM sandbox contract.
- `docs/specs/agent/replay.md` — replay binary format.
- `docs/specs/physics/determinism.md` — differential fuzz oracle.
