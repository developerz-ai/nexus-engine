<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — JetBrains Plugin `[DEFERRED — v2.0]`

> **Status: DEFERRED to v2.0.** No work begins until VS Code + Zed extensions ship and stabilize. Placeholder spec records intent and prevents duplicate planning.

## Scope (intended, v2.0)

JetBrains family — Rider, IntelliJ IDEA, CLion, RustRover, WebStorm, PyCharm — all share the IntelliJ Platform. One plugin, distributed via the JetBrains Marketplace, covers them all.

Same shape as `docs/specs/editor/vscode-extension.md`:
- Auto-launch `nexus-mcp-server`.
- Tool window with subagent fleet + telemetry + scenarios.
- Inspections (the JetBrains analog of diagnostics) for `principle-keeper` + RPC parity failures.
- Action set in the IntelliJ Action Registry mirroring the Command Palette set.
- Status bar widget for fps / agents / spend.

## Why deferred

- IntelliJ Platform requires Kotlin/Java; the plugin is its own toolchain (Gradle, JetBrains SDK, IntelliJ test framework). Significant fixed cost.
- VS Code + Cursor + Zed together cover the majority of Rust+TS+Python game-dev surface in 2026.
- Rider is the only JetBrains IDE with a meaningful game-dev share today (Unity ecosystem); its overlap with Nexus is medium.
- Better to ship two excellent extensions than three okay ones.

## v2.0 entrance criteria

- VS Code extension at ≥ 1.0 with 95% conformance scenario pass rate for two consecutive releases.
- ≥ 10k installs across VS Code + Cursor + Zed combined.
- A community ask thread on the Nexus issue tracker with ≥ 100 +1s for JetBrains.
- `[DECISION NEEDED]` Whether to fund this from the core team or accept a community-led port.

## Cross-references

- → `docs/specs/editor/vscode-extension.md` — canonical IDE-extension shape.
- → `docs/specs/editor/zed-extension.md` — sibling, ships first.
- → `docs/specs/agent/mcp-server.md` — the universal back end.

## Open Questions

- `[DECISION NEEDED]` Single multi-IDE plugin via `intellij-platform-gradle-plugin`, or per-IDE thin shims.
- `[DECISION NEEDED]` Whether to add Visual Studio (full IDE, not VS Code) — entirely separate effort, only relevant if a major studio sponsors.
- `[AGENT: 23]` `ide-extension-engineer` owns this placeholder until elevated to active.
