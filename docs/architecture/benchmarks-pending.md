<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Nexus Engine — Benchmarks Pending

> Every `[BENCHMARK NEEDED]` flag across the corpus. Numbers are unknown until measured; do not invent. The next Claude Code session can run a measurement campaign on the reference machine (AMD Ryzen 9 7950X + RTX 4070 + 64 GB Linux — pinned in `docs/architecture/03-tech-stack.md`).
>
> Pair files: `docs/architecture/decisions-open.md`, `docs/architecture/cross-agent-flags.md`.
>
> Volume: `grep -c '\[BENCHMARK NEEDED\]' docs/**/*.md` ≈ **279 hits in N files** at integration time. Many are Performance Contract table cells in specs that won't be measurable until the relevant crate exists. The list below dedupes by topic.
>
> Format: `- [topic] — what to measure — file`.

---

## Engine subsystem perf (gated on impl)

- [physics-bodies] 100k static + 5k dynamic rigid bodies open-world target — `docs/specs/physics/overview.md`.
- [renderer-particles] 10M particle target on RTX 4070 — `docs/specs/renderer/particles-heavy.md` (Agent 32 cross-ref).
- [assets-import] Headless CI import throughput ≥ 100 MB/s aggregate — `docs/specs/assets/overview.md`.
- [snapshot-cost] Replay snapshot cost at 4000 entities — target < 5 ms — `docs/guides/liveops/replay-on-crash.md`.
- [fps-demo-numbers] All fps numbers in nexus-fps demo (frame time, sim ceiling) — pending renderer + physics landing — `docs/games/nexus-fps.md`.
- [headless-sim-ceiling] Simultaneous matches per CI runner in headless mode — `docs/games/nexus-fps.md`.

## Modularity / compile graph (Agent 29)

- [moba-loc-compiled] LOC compiled / build time / artifact size for MOBA example — `docs/architecture/06-modularity.md`.
- [pixel-loc-compiled] Same, for 2D pixel platformer example — `docs/architecture/06-modularity.md`.
- [vn-loc-compiled] Same, for single-player VN example — `docs/architecture/06-modularity.md`.
- [monolithic-loc] Reference monolithic compile (~12M LOC v1.0; 100M LOC mature) baseline — `docs/architecture/06-modularity.md`.
- [inventory-startup-wasm] `inventory` crate startup cost on WASM target — threshold: 50 ms — `docs/architecture/06-modularity.md`, `docs/specs/crates/plugin-trait.md`.

## Compose-don't-build (Agent 32)

- [recipe-day1-time] Day-1 time-to-runnable for each compose recipe on reference machine — `docs/architecture/08-compose-dont-build.md`.

## Merge system (Agent 16)

- [merge-cost-per-pr] Real per-PR cost at S8 against full corpus, including verification pass — `docs/guides/merge-system.md`.
- [perf-noise-floor] Perf-regression noise floor on production runner hardware — `docs/guides/merge-system.md`.
- [merge-baseline-noise] Baseline noise floor — needs production hardware profile — `docs/guides/merge-system.md`.

## Integration team (Agent 17)

- [perf-drift-threshold] Realistic perf-drift threshold based on first 90d audit data — `docs/guides/integration-team.md`.
- [incident-rate] Per-rotation incident rate to size team N — `docs/guides/integration-team.md`.
- [demo-game-ci-cost] Demo-game CI cost budget ($/day) — `docs/guides/integration-team.md`.

## AAA path (Agent 22)

- [aaa-throughput] AI throughput: 40 reviewed-and-merged content PRs / week sustained for one project at scale — `docs/game-template/aaa-path.md`.
- [aaa-revshare-data] Revenue-share / sponsorship data from first project at scale — `docs/game-template/aaa-path.md`.

## Weekend MVP

- [asset-gen-throughput] Realistic asset generation throughput for 30 enemies in 60 min — `docs/game-template/weekend-mvp.md`.

## AI dev metrics

- [onboarding-ttfm] Real onboarding time-to-first-merge per agent model — `docs/guides/ai-dev-onboarding.md`.
- [s1-pass-rate] First-submit S1 pass rate per agent model (needs 30d post-v0.1 telemetry) — `docs/guides/pr-protocol.md`.

## Crates ecosystem (Agent 28)

- [indexer-cold-start] `nexus-hub` indexer cold-start cost; target full crates.io scan ≤ 1 hour — `docs/specs/crates/discovery.md`.
- [indexer-cve-cycle] CVE re-evaluation cycle ≤ 15 min from RustSec publish — `docs/specs/crates/security.md`.
- [coverage-floors] Per-category coverage floors are heuristic; calibrate against measured costs once first community crates ship — `docs/specs/crates/categories.md`.
- [agent-recipes-cost] `nexus-coder` workflow end-to-end cost — `docs/guides/crates/agent-recipes.md`.

## Mods

- [mod-install-time] Mod install + sandbox handshake wall-clock — `docs/guides/mods/players/install.md`.
- [mod-audit-cost] Mod audit pipeline per-mod cost — `docs/guides/mods/agent-recipes.md`.

## SQL / liveops

- [ddl-large-table] Lock-acquiring DDL on tables > 1M rows — flagged in `docs/guides/coding-style/sql.md`.

---

## How to drain this list

1. Pick a topic with code that exists.
2. Spawn `perf-engineer` with the file + the metric.
3. Measure on the reference machine; commit the number + a JSON benchmark artifact under `benches/` of the relevant crate.
4. Replace `[BENCHMARK NEEDED]` in the source with the measured value + date + commit ref.
5. Remove the line here.
6. If the number violates a Performance Contract → open an ADR or a tracking issue per Law 5.

Bulk: `benchmark-coordinator` subagent owns the periodic sweep.
