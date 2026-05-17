<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Fuzzing

Random bytes → input → does it crash, hang, or violate an invariant?

Three classes:
1. **Parsers** — anything that reads untrusted input from disk or wire.
2. **Sandbox boundaries** — scripting VM, mod API, replay loader.
3. **Determinism oracles** — high-value invariants worth burning CPU on.

## Tool per use case

| Use | Tool |
|-----|------|
| Rust corpus fuzzing | `cargo-fuzz` (libFuzzer) |
| Rust structure-aware | `arbitrary` + `cargo-fuzz` |
| Rust differential | custom harness against reference impl |
| TS / Node | `jazzer.js` (libFuzzer for JS) |
| Python | `atheris` (libFuzzer for Python) |
| Network packets | engine `nexus-fuzz-net` (custom harness) |
| Game assets | engine `nexus-fuzz-asset` (per format) |

Cite: rust-fuzz/cargo-fuzz · github.com/CodeIntelligenceTesting/jazzer.js · github.com/google/atheris.

## Fuzz targets

```
crates/<crate>/fuzz/
├── Cargo.toml                 # fuzz target manifest
├── corpus/
│   └── <target>/              # seed corpus, committed
└── fuzz_targets/
    ├── parse_gltf.rs
    └── replay_loader.rs
```

`fuzz/fuzz_targets/parse_gltf.rs`:

```rust
#![no_main]
use libfuzzer_sys::fuzz_target;
use nexus_assets::gltf;

fuzz_target!(|data: &[u8]| {
    let _ = gltf::parse(data);  // must not panic, must not hang
});
```

Structure-aware (`arbitrary`):

```rust
#![no_main]
use libfuzzer_sys::fuzz_target;
use arbitrary::Arbitrary;
use nexus_net::Packet;

#[derive(Debug, Arbitrary)]
struct FuzzInput {
    packets: Vec<Packet>,
    seed: u64,
}

fuzz_target!(|input: FuzzInput| {
    let mut session = nexus_net::Session::new(input.seed);
    for p in input.packets {
        let _ = session.process(p);
    }
});
```

## Run

```bash
cargo +nightly fuzz run parse_gltf
cargo +nightly fuzz run parse_gltf -- -max_total_time=300         # 5 min
cargo +nightly fuzz run parse_gltf -- -jobs=8 -workers=8          # parallel
cargo +nightly fuzz tmin parse_gltf <crash>                        # minimize
cargo +nightly fuzz cmin parse_gltf                                # corpus min
```

## What every target must do

1. Accept `&[u8]` or a structured `Arbitrary` input.
2. Run the target function.
3. Crash on panic, ASan finding, or invariant violation.
4. NEVER call out to network, FS, or process state.
5. Time-bound per input: ≤ 100 ms (libFuzzer kills longer).

## Corpus

Committed to git under `fuzz/corpus/<target>/`. Seed it with real samples + previous failures.

| File | Source |
|------|--------|
| Real assets | `assets/test/<format>/` (CC0 samples) |
| Synthetic edge cases | crafted by hand |
| Crash regressions | added after every reproduction |
| Coverage-discovered | added by nightly `cmin` then committed |

Rule: **every crash, once fixed, becomes a corpus file**. The corpus is the regression test.

## Differential fuzzing

For specs with a reference impl (e.g., physics deterministic vs. f32):

```rust
fuzz_target!(|input: FuzzInput| {
    let a = nexus_physics::simulate_f32(&input);
    let b = nexus_physics::simulate_fixed(&input);
    assert!(approx_equal(a, b, EPSILON), "f32 vs fixed diverged at {:?}", input);
});
```

The two impls disagree → file a bug. Used for determinism specs (`docs/specs/physics/determinism.md`).

## Network packet fuzzer

`nexus-fuzz-net` harness:

```bash
nexus fuzz net --target rollback-resim --duration 10m
```

Spins up two engines, feeds adversarial packet streams (reordered, duplicated, malformed, version-skewed), asserts:
- No panic.
- Either packet processed or rejected with a registered error code.
- No silent state corruption (state hash before+after).

→ `docs/specs/networking/transport.md`.

## Asset import fuzzer

`nexus-fuzz-asset` harness — one fuzz target per supported format:

| Format | Target |
|--------|--------|
| glTF | `parse_gltf` |
| FBX | `parse_fbx` |
| OBJ | `parse_obj` |
| PNG | `parse_png` |
| EXR | `parse_exr` |
| OGG | `parse_ogg` |
| WAV | `parse_wav` |
| FLAC | `parse_flac` |
| TTF | `parse_ttf` |

→ `docs/specs/assets/import.md`.

## Scripting VM fuzzer

`nexus-fuzz-script`:

```bash
nexus fuzz script --target lua-vm --capabilities none
nexus fuzz script --target rune-vm --capabilities none
```

Generates random programs (via `arbitrary` AST). Asserts:
- No host crash.
- No capability escape (no FS, no net, no engine API beyond granted set).
- Gas accounting holds.
- Out-of-gas terminates within bounded steps.

→ `docs/specs/scripting/sandbox.md`.

## Replay loader fuzzer

Mandatory because player-submitted replays are untrusted input.

```rust
fuzz_target!(|data: &[u8]| {
    let _ = nexus_replay::load(data);    // must not panic
});
```

→ `docs/specs/agent/replay.md`.

## CI gates

| Gate | When | Budget |
|------|------|--------|
| Smoke fuzz | per PR (touched targets) | 30 s per target |
| Nightly fuzz | every night | 1 h per target |
| Pre-release fuzz | release branch | 24 h per target across cluster |
| OSS-Fuzz | continuous | upstream-managed |

[DECISION NEEDED] — OSS-Fuzz integration: apply once `nexus-engine` is public.

```yaml
- name: Fuzz smoke
  run: |
    for t in $(cargo fuzz list); do
      cargo +nightly fuzz run "$t" -- -max_total_time=30 \
        || (echo "::error::fuzz crash in $t" && exit 1)
    done
```

Any crash:
- Fails the build.
- Auto-files an issue with the minimized repro attached.
- Adds the crash file to the corpus (via the fix PR).

## Crash reporting

Crash artifact is a 3-tuple:

```
crashes/
├── parse_gltf-<sha>.bin               # minimized input
├── parse_gltf-<sha>.report.json       # universal error JSON
└── parse_gltf-<sha>.replay            # optional, when from replay fuzzer
```

`report.json`:

```json
{
  "target":   "parse_gltf",
  "input":    "crashes/parse_gltf-abc123.bin",
  "panic":    "index out of bounds: 0..=0 / 5",
  "location": { "file": "crates/nexus-assets/src/gltf/parse.rs", "line": 142 },
  "minimized": true,
  "size_bytes": 12
}
```

## Hard rules

| Rule | |
|------|--|
| Every untrusted-input parser has a fuzz target | non-negotiable |
| Every fuzz crash becomes a corpus file | regression locked in |
| Targets are `no_main` Rust binaries | libFuzzer requirement |
| Inputs ≤ 100 ms per execution | libFuzzer kills longer |
| No I/O in the fuzz target | speed + determinism |
| Sanitizers (ASan, UBSan) enabled in CI | catch memory bugs |
| Crash repro committed alongside the fix | PR contract |

## Forbidden

| Pattern | Why |
|---------|-----|
| Network / FS in fuzz targets | breaks isolation |
| `unwrap()` chains under fuzz | use `Result` |
| Catching the panic and ignoring it | hides the bug |
| Re-rolling RNG inside the target | non-deterministic |
| Stripping symbols in fuzz builds | unhelpful crash reports |
| Fuzzing without sanitizers | misses heap bugs |

## Cross-link

- → `docs/specs/assets/import.md` (asset format spec)
- → `docs/specs/networking/transport.md` (packet fuzz)
- → `docs/specs/scripting/sandbox.md` (sandbox fuzz)
- → `docs/specs/agent/replay.md` (replay fuzz)
- → `docs/specs/physics/determinism.md` (differential fuzz)
- → `docs/guides/coding-style/errors.md` (crash errors as universal JSON)
- → `ci.md` (gate placement)
