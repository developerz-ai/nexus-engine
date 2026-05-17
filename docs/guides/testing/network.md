<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Network Testing

In-memory transport. Deterministic lag/loss/reorder injection. Multi-client harness. Rollback resync verification.

→ `docs/specs/networking/transport.md`, `docs/specs/networking/rollback.md`, `docs/specs/networking/replication.md`.

## The transport stack

```
+------------+      +------------+
|  Engine A  |      |  Engine B  |
+-----┬------+      +------┬-----+
      │                    │
      ▼                    ▼
+-----┴────────────────────┴-----+
|    nexus-net-loopback (test)   |   ← injectable: lag, loss, reorder, duplicate
+--------------------------------+
```

Production: `nexus-net-udp` or `nexus-net-quic`.
Tests: `nexus-net-loopback`. Same `Transport` trait. Identical wire format.

## Harness

```rust
use nexus_test_net::{TestNet, NetConditions};

let conditions = NetConditions {
    latency_ms:     50,
    jitter_ms:      10,
    loss_pct:       2,
    reorder_pct:    1,
    duplicate_pct:  0,
    bandwidth_kbps: 1000,
};

let mut net = TestNet::new(conditions).with_seed(42);
let server = test_engine(EngineRole::Server).with_transport(net.endpoint("server"));
let alice  = test_engine(EngineRole::Client).with_transport(net.endpoint("alice"));
let bob    = test_engine(EngineRole::Client).with_transport(net.endpoint("bob"));
```

`TestNet`:
- Deterministic. Seeded RNG drives loss/jitter dice.
- Tick-driven. `net.tick(Duration::from_millis(16))` advances all endpoints in lockstep.
- Captures packet log per tick — replayable, diff-able.
- Records full timeline for failure forensics.

## Lag / loss / reorder injection

```rust
net.set_conditions(NetConditions {
    latency_ms: 100,
    loss_pct:   10,
    ..Default::default()
});

net.partition("alice", Duration::from_millis(500));     // total link drop window
net.delay_next("bob", Duration::from_millis(250));      // single packet delay
net.duplicate_next("alice", 3);                          // dup the next packet 3x
net.reorder_window("alice", 4);                          // shuffle next 4 packets
```

Each helper is deterministic — same seed → same outcome.

## Multi-client tests

```rust
#[test]
fn three_clients_agree_on_state_after_partition_heals() {
    let mut net = TestNet::new(NetConditions::default()).with_seed(1);
    let server = test_engine(EngineRole::Server).with_transport(net.endpoint("server"));
    let cs = ["alice", "bob", "carol"].map(|n|
        test_engine(EngineRole::Client).with_transport(net.endpoint(n)));

    cs.iter_mut().for_each(|c| c.connect());
    net.tick_for(Duration::from_secs(1));

    net.partition("alice", Duration::from_secs(2));
    net.tick_for(Duration::from_secs(3));

    let state_hashes: Vec<_> = cs.iter().map(|c| c.world_state_hash()).collect();
    assert!(state_hashes.windows(2).all(|w| w[0] == w[1]),
        "clients diverged: {state_hashes:?}");
}
```

## Rollback resync tests

Rollback netcode (`docs/specs/networking/rollback.md`) demands two clients reach identical state for any delivered input set.

```rust
proptest! {
    #[test]
    fn rollback_converges(
        inputs in arb_input_stream(60),       // 60 frames of input
        conditions in arb_net_conditions(),
    ) {
        let mut net = TestNet::new(conditions).with_seed(0);
        let mut a = test_engine_pair(&mut net, "a", "b").0;
        let mut b = test_engine_pair(&mut net, "a", "b").1;

        for (frame, input) in inputs.iter().enumerate() {
            a.apply_input(*input);
            net.tick(FRAME_DURATION);
            b.apply_input(*input);
            net.tick(FRAME_DURATION);
        }

        prop_assert_eq!(a.confirmed_state_hash(), b.confirmed_state_hash());
    }
}
```

Property covers a huge slice of net conditions. Failure shrinks to minimal divergence input.

## Wire-format compatibility tests

| Test | What |
|------|------|
| `wire_protocol_v1_v2` | v1 client + v2 server: graceful negotiate or error code `NET.PROTOCOL_MISMATCH` |
| `packet_v1_decode_stable` | v1 packets in corpus decode byte-equal to snapshot |
| `delta_compression_roundtrip` | property test: `apply(delta(s, t)) == t` for all `s`, `t` |

## DDoS / malformed input

Already covered under fuzz (`fuzz.md`):
- `nexus-fuzz-net` runs adversarial packet streams against the receive path.
- Replay loader fuzzed similarly.

## Bandwidth + cost asserts

Some scenarios assert traffic budgets:

```toml
[capture.network]
record_to = "out/net-trace.bin"

[assert]
"network.bytes_sent.server"   = { lt = "1MiB" }
"network.packets_per_sec.avg" = { lt = 60 }
"network.snapshot_size.p95"   = { lt = "1KiB" }
```

→ `docs/specs/networking/replication.md` for per-system budgets.

## Lobby / matchmaking tests

Lobby spec → `docs/specs/networking/lobby.md`. Tests use:
- `testcontainers` for PostgreSQL (matchmaking state)
- `testcontainers` for Redis (presence)
- In-memory transport for client ↔ matchmaker RPC

Property: any sequence of join/leave/disconnect ends in a consistent lobby state.

## Anticheat tests

→ `docs/specs/networking/anticheat.md`. Tests:
- Server rejects client input outside time window (replay attack).
- Server rejects deltas inconsistent with prior state (forged update).
- Server-side input sanitation strips unknown fields.

## CI

```yaml
- name: Network suite
  run: cargo nextest run -p nexus-net --test '*' --message-format libtest-json
- name: Net property fuzz
  run: PROPTEST_CASES=2000 cargo nextest run -p nexus-net --features prop-deep
- name: Wire compat
  run: cargo nextest run -p nexus-net --test wire_compat
```

Nightly:

```yaml
- name: Net fuzz (long)
  run: cargo +nightly fuzz run net_recv -- -max_total_time=3600
```

## Hard rules

| Rule | |
|------|--|
| All network tests run on `nexus-net-loopback` (in-memory) | no real sockets |
| Real sockets only in `integration/network/real_*.rs` with `--features real-net` | gated |
| `TestNet` is deterministic | seeded |
| Every multi-client test asserts final-state convergence | rollback contract |
| Bandwidth budgets enforced in CI | spec contract |
| Wire format changes require corpus snapshot update | back-compat audit |
| No real DNS, no real STUN/TURN in tests | use fakes |

## Forbidden

| Pattern | Why |
|---------|-----|
| `tokio::net::TcpListener::bind("0.0.0.0:0")` in tests | flake / port exhaustion |
| `std::net::*` direct use | bypasses transport abstraction |
| Wall-clock `Instant::now()` for timeouts | use `tokio::time::advance` |
| Sleeping for "messages to arrive" | use `net.tick(...)` then assert |
| Asserting on packet *contents* in high-level tests | over-couples to wire format |
| Real UDP/QUIC in CI default suite | flake source |

## Cross-link

- → `docs/specs/networking/overview.md` · → `docs/specs/networking/rollback.md`
- → `docs/specs/networking/replication.md` · → `docs/specs/networking/transport.md`
- → `docs/specs/networking/lobby.md` · → `docs/specs/networking/anticheat.md`
- → `integration.md` (multi-engine harness)
- → `property.md` (rollback property tests)
- → `fuzz.md` (`nexus-fuzz-net`)
- → `snapshot.md` (deterministic replays cover net)
