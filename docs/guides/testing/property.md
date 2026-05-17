<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Property-Based Tests

Generate inputs. Assert invariants. Shrink failures to minimal cases.

## Tool per language

| Language | Library |
|----------|---------|
| Rust | `proptest` |
| TypeScript | `fast-check` |
| Python | `hypothesis` |

Cite: github.com/proptest-rs/proptest · fast-check.dev · hypothesis.readthedocs.io.

## Where property testing pays

| Domain | Why |
|--------|-----|
| Math (vec / mat / quat) | algebraic laws (assoc, comm, inverse) |
| Serialization | round-trip = identity |
| Netcode | input → state → snapshot → restore = identity |
| Asset pipeline | import → process → export → import = stable |
| ECS queries | query results match brute-force filter |
| Render graph | topological sort respects deps |
| Scripting VM | bytecode round-trip; gas accounting; sandbox capability checks |
| Save/load | save → load = identity for all valid worlds |
| Hashing / IDs | uniqueness, distribution |
| Allocator | size requests honored, no double-free |

## Where it does NOT pay

| Domain | Why |
|--------|-----|
| One-off CRUD endpoints | Example-based test is clearer |
| UI components | snapshot + visual covers it |
| External-service callouts | mocked; no property to discover |
| Floating-point exact equality across platforms | use `approx` tolerance, not property |

## Naming

```
prop_<invariant>
```

```rust
proptest! {
    #[test]
    fn prop_serialize_roundtrip(world in any::<World>()) {
        let bytes = nexus_serde::to_bytes(&world)?;
        let back: World = nexus_serde::from_bytes(&bytes)?;
        prop_assert_eq!(world, back);
    }

    #[test]
    fn prop_quat_mul_inverse_is_identity(q in any::<Quat>()) {
        let r = q * q.inverse();
        prop_assert!(r.approx_eq(Quat::IDENTITY, 1e-5));
    }
}
```

## Strategies (generators)

Define once per type. Reused everywhere.

```rust
// crates/nexus-math/src/proptest_strategies.rs
use proptest::prelude::*;

pub fn arb_finite_f32() -> impl Strategy<Value = f32> {
    prop_oneof![
        Just(0.0_f32),
        Just(1.0_f32),
        Just(-1.0_f32),
        (-1e6_f32..1e6_f32),
    ].prop_filter("must be finite", |x| x.is_finite())
}

pub fn arb_unit_quat() -> impl Strategy<Value = Quat> {
    (arb_finite_f32(), arb_finite_f32(), arb_finite_f32(), arb_finite_f32())
        .prop_map(|(x, y, z, w)| Quat::new(x, y, z, w).normalize())
        .prop_filter("must be unit", |q| (q.length() - 1.0).abs() < 1e-5)
}
```

Rules:
- One strategy per type.
- Strategies live in `<crate>/src/proptest_strategies.rs`.
- Strategies are public, re-used across crates that depend on the type.
- Filter out invalid inputs at the strategy, not the assertion.

## TypeScript

```ts
import { fc, test } from '@fast-check/vitest';

test.prop([fc.array(fc.integer())])(
  'sort is idempotent',
  (xs) => {
    const a = [...xs].sort();
    const b = [...a].sort();
    expect(b).toEqual(a);
  },
);
```

## Python

```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_is_idempotent(xs: list[int]) -> None:
    a = sorted(xs)
    b = sorted(a)
    assert a == b
```

## Determinism

Same seed → same generated inputs → same shrunk failure. Required.

| Lib | Seed source |
|-----|-------------|
| `proptest` | `PROPTEST_CASES` env, plus per-test config; failure persists to `proptest-regressions/*.txt` |
| `fast-check` | `fc.assert(prop, { seed: <int> })` |
| `hypothesis` | `@given(...)` reads `HYPOTHESIS_SEED`; failures persist to `.hypothesis/examples` |

All persistence files **committed**. They are the corpus.

```
crates/nexus-math/proptest-regressions/quat.txt   ← committed
crates/nexus-net/proptest-regressions/rollback.txt
```

CI loads them first. New failure → new line appended → committed by AI fix PR.

## Case counts

| Suite | Default cases | Nightly cases |
|-------|---------------|---------------|
| Per-PR | 256 | n/a |
| Nightly | 256 | 10 000 |
| Release gate | 256 | 100 000 |

`PROPTEST_CASES`, `fc.assert({ numRuns })`, `HYPOTHESIS_MAX_EXAMPLES` set in CI by job.

## Shrinking

Failure output must include the shrunk counter-example.

```text
quat_mul_inverse_is_identity failed:
  shrunk to: q = Quat { x: 0.0, y: 0.0, z: 0.0, w: 0.0 }
  reason: assertion failed: r.approx_eq(Quat::IDENTITY, 1e-5)
```

Rule: investigate the shrunk case, not the original. Shrinking surfaces the minimal trigger.

## Property test JSON output

```bash
PROPTEST_REPORT_JSON=1 cargo nextest run -- --features proptest-json
```

```json
{
  "test": "prop_quat_mul_inverse_is_identity",
  "status": "fail",
  "seed": 1729,
  "cases_run": 47,
  "shrunk_input": { "q": { "x": 0.0, "y": 0.0, "z": 0.0, "w": 0.0 } },
  "shrink_iters": 12,
  "regression_appended": "proptest-regressions/quat.txt:42"
}
```

nexus-merge consumes this.

## Per-system property suites

### Math (`nexus-math`)
- Quat: `q * q^-1 = I`, `(p * q) * v = p * (q * v)`
- Mat4: `inv(M) * M = I`, `M^T^T = M`
- Transform: `to_mat4(t).inverse() = t.inverse().to_mat4()`

### Netcode (`nexus-net`)
- Snapshot/restore: `restore(snapshot(s)) = s` for all states `s`
- Rollback: `simulate(s0, [i0..in]) = rollback_and_resim(s0, [i0..in], at = k)`
- Delta encoding: `apply_delta(s, encode_delta(s, t)) = t`

### Serialization (`nexus-serde`)
- Round-trip for every `Serialize`-derived type
- Schema version skew: `decode_v1(encode_v1(x)) = x`; `decode_v2(encode_v1(x))` succeeds via migration

### Scripting VM (`nexus-scripting`)
- Bytecode round-trip
- Gas accounting: `run_n_steps(...).gas_used = sum(step_gas)`
- Sandbox: any AST without granted capability fails to compile (negative property)

### ECS (`nexus-ecs`)
- Query result = brute-force linear filter
- `world.spawn(c1, c2).insert(c3) ==> query<c1,c2,c3>.contains(e)`
- `world.despawn(e) ==> world.entity(e).is_none()`

→ Each system spec (`docs/specs/<system>/*.md`) lists its property requirements under `## Test Requirements`.

## Hard rules

| Rule | |
|------|--|
| Every shrunk failure committed to `*-regressions/` corpus | replay forever |
| Strategy filters out invalid inputs at the source | clarity |
| Properties are pure functions of input | no global state |
| No real I/O in property tests | speed + determinism |
| Properties have a single invariant | one assertion, narrowly named |
| Negative properties allowed (`prop_<bad>_rejected`) | for sandbox / parsers |

## Forbidden

| Pattern | Why |
|---------|-----|
| `proptest!` with > 4 strategy args | Hard to shrink |
| Random in the assertion body | Non-deterministic |
| `prop_assume!` to drop > 50% of cases | Strategy is wrong |
| Property test with > 5 s p95 runtime | Too slow for the suite |
| Hand-rolled randomness in the strategy | Use library generators |
| `cargo test` instead of `nextest` in CI | Lose JSON output |

## Cross-link

- → `unit.md` · → `integration.md` · → `fuzz.md` (overlap)
- → `docs/specs/core/math.md`, `docs/specs/networking/rollback.md`, `docs/specs/core/ecs.md`
- → `docs/guides/coding-style/dependencies.md` (lib versions)
- → `docs/guides/coding-style/errors.md` (negative property assertions on error codes)
