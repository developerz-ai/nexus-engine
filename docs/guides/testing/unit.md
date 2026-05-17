<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Unit Testing

One function. One test file. Hermetic. Deterministic. ≤100 ms each.

## Tool per language

| Language | Runner | Notes |
|----------|--------|-------|
| Rust | `cargo test` + `cargo-nextest` (CI default) | `nextest` for speed + JSON output |
| TypeScript | `vitest` | colocated `*.test.ts`, jsdom for components |
| Python | `pytest` + `pytest-anyio` | strict markers, parametrize, fixtures |
| Lua | `busted` | `_spec.lua` files, `nexus.test.mock` engine stubs |
| WGSL | `naga-cli validate` (per file) + shader unit harness | one harness per shader |

Cite: nexte.st · vitest.dev · docs.pytest.org · olivinelabs.com/busted · github.com/gfx-rs/naga.

## Naming

```
<fn-or-behavior>_<condition>_<expected>
```

```rust
#[test]
fn spawn_zero_count_returns_empty_vec() { ... }

#[test]
fn spawn_above_cap_returns_enemy_limit_error() { ... }
```

```ts
describe('SpawnQueue', () => {
  it('flushes batched requests on idle', () => { ... });
  it('rejects spawn above cap with ENEMY_LIMIT error', () => { ... });
});
```

```python
def test_spawn_zero_count_returns_empty_list(): ...
def test_spawn_above_cap_raises_enemy_limit_error(): ...
```

```lua
describe('spawn', function()
  it('returns empty when count is zero', function() ... end)
  it('errors with ENEMY_LIMIT above cap', function() ... end)
end)
```

## AAA structure

Three phases. Marked with comments only when non-obvious.

```rust
#[test]
fn spawn_above_cap_returns_enemy_limit_error() {
    // arrange
    let mut world = World::test();
    let spawner = EnemySpawner::new(&mut world, "grunt", 4);

    // act
    let err = spawner.spawn(5).unwrap_err();

    // assert
    assert_eq!(err.code(), "ECS.ENEMY_LIMIT");
}
```

Tests use `.unwrap()` and `.expect()` freely — `clippy::unwrap_used` is `#[allow]`ed in `#[cfg(test)]` modules. → `docs/guides/coding-style/rust.md`.

## No shared mutable state

Every test gets its own `World`, its own `tempdir`, its own seed.

| Don't | Do |
|-------|----|
| `static mut WORLD: ...` | `let world = World::test()` |
| `lazy_static! { CLIENT }` | per-test fixture |
| `#[test]` order dependency | tests run in any order, including parallel |
| Real network call | injected loopback transport |
| Real GPU | `wgpu` null backend (`Backend::Noop`) |
| `std::env::set_var` | injected config |

## Determinism

```rust
use nexus_test::clock::FrozenClock;
use rand_chacha::ChaCha20Rng;
use rand::SeedableRng;

fn rng(name: &str) -> ChaCha20Rng {
    let seed = nexus_test::seed_from_name(name);
    ChaCha20Rng::seed_from_u64(seed)
}
```

Test name → seed. Same name → same seed → identical run. Flake = bug (`scenarios.md` flake policy).

## Rust

`Cargo.toml`:

```toml
[dev-dependencies]
nexus-test = { path = "../nexus-test" }
proptest   = "1"
rstest     = "0.21"
insta      = "1"
```

`src/lib.rs` pattern:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use nexus_test::*;

    #[test]
    fn ... { ... }
}
```

Run:

```bash
cargo nextest run                              # all
cargo nextest run -p nexus-renderer            # one crate
cargo nextest run --status-level slow          # surface slow tests
cargo nextest run --no-fail-fast               # full report
cargo test --doc                               # doc-tests
```

Output format for CI:

```bash
cargo nextest run --message-format libtest-json > nextest.json
```

nexus-merge consumes `nextest.json`.

## TypeScript (vitest)

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    coverage: { provider: 'v8', reporter: ['json', 'text'] },
    reporters: ['default', 'json'],
    outputFile: { json: 'vitest.json' },
  },
});
```

Colocated:

```
src/services/engine/
├── client.ts
└── client.test.ts
```

Run:

```bash
pnpm vitest run
pnpm vitest run src/services/engine
pnpm vitest run --coverage
```

## Python (pytest)

`pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths        = ["tests"]
addopts          = "--strict-markers --strict-config -ra"
asyncio_mode     = "auto"
markers          = [
  "slow: opt-in slow tests (nightly only)",
  "network: requires network (CI-only)",
]
filterwarnings   = ["error"]
```

Layout:

```
ai-agents/
├── src/playtest_agent/
└── tests/
    ├── conftest.py
    └── test_scenario_runner.py
```

Run:

```bash
uv run pytest
uv run pytest tests/services/test_engine_client.py
uv run pytest -m "not slow"
uv run pytest --cov=src --cov-report=json:coverage.json
```

## Lua (busted)

```
game/scripts/enemy-spawner.lua
game/scripts/enemy-spawner_spec.lua
```

```lua
-- enemy-spawner_spec.lua
local EnemySpawner = require('enemy-spawner')
local mock         = require('nexus.test.mock')

describe('EnemySpawner', function()
  local world

  before_each(function()
    world = mock.world()
  end)

  it('returns empty when count is zero', function()
    local spawner = EnemySpawner.new(world, 'grunt')
    local count, err = spawner:spawn_wave(0)
    assert.equals(0, count)
    assert.is_nil(err)
  end)
end)
```

Run:

```bash
busted -p '_spec' game/scripts
busted --coverage -p '_spec' game/scripts
```

`nexus.test.mock` ships with the engine and stubs engine bindings deterministically.

## WGSL

Two test layers:

1. Static: `naga-cli validate <file>` per shader, per backend (vulkan / metal / dx12 / glsl-es300).
2. Functional: shader unit harness that runs a compute shader on the null backend with known inputs/outputs.

```rust
// crates/nexus-renderer/tests/shader_brdf.rs
#[test]
fn ggx_returns_zero_when_below_horizon() {
    let result = run_compute_shader(
        include_str!("../shaders/brdf-ggx-test.wgsl"),
        &[/* inputs */],
    );
    assert_eq!(result, expected);
}
```

→ `docs/guides/coding-style/wgsl.md` (numerical hygiene).

## Hard rules

| Rule | Why |
|------|-----|
| One assertion per concept (multiple `assert_eq!` OK if same concept) | Failure tells you what broke |
| No `if` / branching in tests | Test what the test name says |
| No `try`/`catch` for assertions | Use `assert_throws` / `should.throw` |
| No mocks of types you own — use the real type | Mocks lie |
| Mock at the I/O boundary only | Real logic stays under test |
| Snapshot tests for serialization only | Otherwise = locked-in bugs |
| Test names = sentences | Reader knows what failed without reading code |
| < 100 ms per test (p95) | Slow tests = ignored tests |

## Forbidden

| Pattern | Why |
|---------|-----|
| `Thread.sleep` / `time.sleep` | Replace with frozen clock |
| `tokio::time::sleep` (real) | Replace with `tokio::time::advance` |
| `localhost:<random port>` | Use in-memory transport |
| Real HTTP call | Mock at the client boundary |
| Real disk write outside `tempfile` | Pollution |
| Order-dependent tests | Parallel runs surface them as flakes |
| `#[ignore]` without a tracking ticket | Dead test |
| `expect()` with prose error | Match the assertion to the failure mode |

## Cross-link

- → `integration.md` · → `scenarios.md` · → `coverage.md`
- → `docs/guides/coding-style/rust.md`, `typescript.md`, `python.md`, `lua.md`, `wgsl.md`
- → `docs/guides/ai-dev-onboarding.md` (TDD-first)
