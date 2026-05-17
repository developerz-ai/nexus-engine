<!-- SPDX-License-Identifier: MIT -->

## Summary

<!-- 1-3 bullets on what changes and why -->

## Spec / Contract

Cites: `docs/specs/...` or `docs/contracts/...` — _path here_

## Laws checklist

- [ ] Cites a spec (`docs/specs/**`) or contract (`docs/contracts/**`) — path filled above (Law 2)
- [ ] `cargo check --workspace` green (Law 4)
- [ ] `cargo fmt --all` clean
- [ ] `cargo clippy --all-targets -- -D warnings` clean
- [ ] `bun test` green (if scripts touched)
- [ ] Tests added — unit + integration + scenario where applicable (Law 12)
- [ ] Structured errors only — no string-only `anyhow!` in shipped code (Law 10)
- [ ] Telemetry emitted — per-frame structured trace where applicable (Law 11)
- [ ] No `unsafe` without `// SAFETY:` paragraph (Law 6)
- [ ] SPDX header on every new file (Law 7)
- [ ] Performance Contract table on every new public API (Law 5)
- [ ] Modularity respected — crate touches only what its spec declares (Law 14, also Law 3)
- [ ] Extends, does not fork — reuses existing systems where possible (Law 15)

## Test plan

<!-- How a reviewer reproduces the test result -->

## Telemetry / benchmarks

<!-- New trace events; criterion deltas; perf-engineer report -->

## Risk

<!-- Sandbox? Determinism? Networking? Asset pipeline? -->
