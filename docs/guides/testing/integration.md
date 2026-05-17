<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Integration Testing

Multiple crates wired together. Real internal APIs. Mocked external boundaries only. Headless. ≤5 s per test.

## What integration covers

| Boundary | Tested in |
|----------|-----------|
| Two engine crates exchanging data | `tests/<topic>.rs` in the consumer crate |
| Engine + asset pipeline (real files, real import) | `crates/nexus-assets/tests/import_*.rs` |
| Engine + script VM | `crates/nexus-scripting/tests/` |
| Client + server (in-process, two `tokio` runtimes) | `crates/nexus-net/tests/` |
| CLI + engine | `crates/nexus-cli/tests/` |
| Editor host + engine | `crates/nexus-editor/tests/` |
| Game template + engine | `nexus-game-template/tests/scaffold.rs` |

## Rust

`crates/<name>/tests/` directory. One file per scenario family.

```
crates/nexus-renderer/
└── tests/
    ├── common/
    │   └── mod.rs                  # shared fixtures (test world, null backend)
    ├── render_graph_basic.rs
    ├── render_graph_dependencies.rs
    └── shader_hot_reload.rs
```

```rust
// tests/render_graph_basic.rs
mod common;
use common::*;

#[test]
fn empty_graph_executes_without_passes() {
    let mut engine = test_engine();
    engine.run_frame().unwrap();
    assert_eq!(engine.telemetry().frame_count(), 1);
}

#[test]
fn shadow_pass_depends_on_geometry_pass() {
    let mut engine = test_engine_with_demo_scene("shadows");
    engine.run_frames(10).unwrap();

    let timing = engine.telemetry().pass_timing();
    assert!(timing.start_of("shadow") >= timing.end_of("geometry"));
}
```

Run:

```bash
cargo nextest run --test '*'
cargo nextest run --test render_graph_basic
cargo nextest run --workspace --test '*'
```

## TypeScript

`tests/integration/` separate from `*.test.ts` (unit colocated).

```
web/
├── src/
└── tests/
    └── integration/
        ├── engine-rpc.test.ts
        └── scenario-runner.test.ts
```

`vitest.config.integration.ts`:

```ts
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 5000,
    pool: 'forks',
    isolate: true,
  },
});
```

## Python

```
ai-agents/tests/
├── unit/
└── integration/
    ├── conftest.py
    └── test_engine_client.py
```

Mark explicitly:

```python
import pytest
pytestmark = pytest.mark.integration
```

Run: `uv run pytest tests/integration -m integration`.

## Fixtures

Centralized. Cheap to construct. Hermetic.

| Fixture | What it provides |
|---------|------------------|
| `test_engine()` | Engine with null GPU, frozen clock, in-memory asset registry, no audio device |
| `test_engine_with_demo_scene(name)` | + `nexus-demo-scenes/<name>` loaded |
| `test_world()` | Bare ECS world, no systems registered |
| `test_assets()` | Ephemeral asset registry rooted at `tempfile::tempdir()` |
| `test_net_pair()` | Two engines wired via in-memory loopback (no real sockets) |
| `test_clock()` | Frozen clock, manually advanced |
| `test_rng(name)` | `ChaCha20Rng` seeded from test name |

Engine fixtures live in `crates/nexus-test/`. Game template fixtures live in `<game>/tests/common/` and re-export `nexus_test::*`.

## Headless engine boot

```rust
let engine = Engine::builder()
    .backend(Backend::Noop)            // wgpu null backend
    .audio(AudioBackend::Null)         // no CPAL device
    .input(InputBackend::Headless)     // no winit
    .clock(Clock::frozen())
    .telemetry(Telemetry::buffered())  // no IPC, capture-in-memory
    .assets(AssetRegistry::ephemeral())
    .build()
    .unwrap();
```

→ `docs/specs/agent/headless.md` for the full contract.

## Multi-process client/server

Spin up two engines in one test process, communicate via in-memory transport.

```rust
#[test]
fn client_predicts_server_authoritative_position() {
    let mut net = test_net_pair();
    let mut server = test_engine_with(EngineRole::Server).with_net(net.server);
    let mut client = test_engine_with(EngineRole::Client).with_net(net.client);

    server.spawn_player(PlayerId(1), Vec3::ZERO);
    client.connect_as(PlayerId(1));

    server.apply_input(PlayerId(1), Input::move_forward());
    server.run_frames(10);
    net.flush();
    client.run_frames(10);

    let server_pos = server.position(PlayerId(1));
    let client_pos = client.position(PlayerId(1));
    assert!((server_pos - client_pos).length() < 0.01);
}
```

→ `network.md` for lag/loss injection.

## Real services in CI

| Service | When used | How |
|---------|-----------|-----|
| PostgreSQL | server / nexus-merge tests | `testcontainers` per test class |
| Redis | matchmaking tests | `testcontainers` |
| MinIO | asset registry remote tests | `testcontainers` |
| Real GPU | renderer parity tests | CI matrix has `gpu` runner; opt-in via `--features gpu` |

Local dev: `nexus dev services up` boots them via Docker Compose. CI starts containers per job.

## Async tests

Rust:

```rust
#[tokio::test(flavor = "current_thread", start_paused = true)]
async fn timeout_after_5s() {
    let result = client.spawn_with_timeout(Duration::from_secs(5)).await;
    tokio::time::advance(Duration::from_secs(10)).await;
    assert!(matches!(result.unwrap_err().code(), "AGENT.TIMEOUT"));
}
```

`start_paused = true` + `tokio::time::advance` = deterministic time. No real sleeps.

Python:

```python
@pytest.mark.anyio
async def test_spawn_timeout():
    with pytest.raises(EngineError) as exc:
        await client.spawn(timeout_s=5.0)
    assert exc.value.code == 'AGENT.TIMEOUT'
```

## Hard rules

| Rule | Why |
|------|-----|
| No real external network (HTTP, DNS) | Flake source #1 |
| No `localhost:` random port | Use in-memory transport |
| No real GPU (unless `--features gpu`) | CI runners lack GPUs |
| Real disk only in `tempdir` | Pollution |
| Real DB only via `testcontainers` | Reproducible |
| Each test < 5 s p95 | Surfaces accidental slow paths |
| Each test serializable seed | Reproducible failures |
| No `#[ignore]` without ticket | Dead test |

## Forbidden

| Pattern | Why |
|---------|-----|
| Sharing global state across tests | Order-dependent flake |
| Sleeping for "things to settle" | Use deterministic clock + wait-for-event |
| Real http://googleapis.com etc. calls | Network is not the test |
| Real audio device | Headless = no device |
| `cargo test` instead of `nextest` in CI | Slower, worse JSON output |
| Bundling unit + integration in same file | Different runtimes, different timeouts |

## CI invocation

```bash
cargo nextest run --workspace --test '*' --message-format libtest-json > integration.json
pnpm -r run test:integration -- --reporter=json --outputFile=integration.json
uv run pytest tests/integration -m integration --junit-xml=integration.xml
```

nexus-merge merges per-language JSON into a single integration report.

## Cross-link

- → `unit.md` · → `scenarios.md` · → `network.md` · → `snapshot.md`
- → `docs/specs/agent/headless.md` (headless contract)
- → `docs/specs/networking/rollback.md` (rollback test pairs)
- → `ci.md` (gate placement)
