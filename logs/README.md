<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# logs/

Structured JSON telemetry per Law 11. One subdir per concern. Newline-delimited JSON; `tracing-subscriber` JSON exporter writes here by default.

| Subdir | Producer |
|---|---|
| `build/` | `cargo` / `nexus build` output |
| `test/` | `cargo nextest` JSON streams |
| `bench/` | `criterion` JSON exports |
| `agent/` | per-subagent run traces |
| `ci/` | GitHub Actions log mirrors |
| `replay/` | deterministic replay traces (Law 9) |
| `telemetry/` | per-frame engine telemetry |
| `crash/` | minidumps + crash JSON sidecars |

Gitignored except `.keep` markers and this README. Rotated by `scripts/clean-logs` (future).
