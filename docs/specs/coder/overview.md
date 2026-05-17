<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Overview

> The in-house AI coding agent that ships AAA games from one beefy box, a generous OpenRouter budget, and a spec.

`nexus-coder` is the tool a solo dev uses to act on the Nexus thesis: code is free, architecture is the bottleneck, parallelism is the lever. It is spec-driven, model-agnostic, headless-aware, and contract-bound.

→ Vision: `docs/initial/vision.md` (the 7 AI-first laws are non-negotiable here)
→ Principles: `docs/architecture/01-principles.md` [AGENT: 01]
→ Agent runtime it talks to: `docs/specs/agent/sdk.md` [AGENT: 10]
→ Contract for engine access: `docs/contracts/core-agent.md` [AGENT: 14]

---

## Boundaries

- **Owns:** prompt assembly, model routing, subagent pool, tool runtime, sandbox/worktree mgmt, telemetry, cost ledger, `nexus coder` CLI.
- **Does NOT own:** the engine (→ `crates/`), the agent JSON-RPC protocol (→ `docs/specs/agent/api.md`), the merge bot (→ `docs/guides/merge-system.md` [AGENT: 16]), asset generation pipelines (→ `docs/specs/assets/generation.md` [AGENT: 09]).
- **Depends on:** Vercel AI SDK (`ai` npm pkg) · OpenRouter HTTPS API · `nexus-agent-sdk` (Rust + Python) · `git worktree` · local filesystem.

---

## Why not just Claude Code / Cursor / Copilot

| Generic agent | Gap for Nexus | nexus-coder answer |
|---|---|---|
| Claude Code | No knowledge of Nexus.toml, scenarios, replay snapshots, ECS shape. | Built-in tools wrap the agent SDK natively. |
| Cursor | Editor-coupled. Human-in-loop. One model at a time. | Headless. Dozens of subagents. Per-task model. |
| Copilot Workspace | GitHub-locked. Opaque models. | Local. Any OpenRouter model. Auditable. |
| Aider | Two-model architect/editor only. Single-repo. | N-model pool. Spec-aware. DAG workflows. |
| Devin | SaaS. Token markup. Black box. | Your machine. Your keys. Open ledger. |

The differentiator is **engine-awareness**. Every nexus-coder subagent knows:

1. Nexus is spec-driven — no code without `docs/specs/<system>/*.md`.
2. Every system has a contract in `docs/contracts/<a>-<b>.md`.
3. Tests are scenarios (TOML) + replays (binary), not unit asserts.
4. The truth source is `nexus run --headless`, not opinion.
5. Performance is in the spec table, not negotiable.

---

## The spec-driven mandate

```
No spec      → coder refuses. Suggests writing spec first.
Spec exists  → coder reads it + contracts + prior art before touching crates.
Code diverges from spec → coder fixes code OR opens spec-change PR. Never silent drift.
```

Enforced by the `ValidateAgainstSpec` tool (→ `docs/specs/coder/tools.md`) which runs in every commit-prep step.

Pattern reference: spec-driven dev as practiced in Bevy RFC process and Rust RFC repo. Same shape: living `docs/specs/` is the single source.

---

## Operating posture

| Property | Value |
|---|---|
| Default run mode | headless, non-interactive, streaming JSON |
| Max concurrent subagents | machine-class dependent (→ `docs/specs/coder/parallelism.md`) |
| Token sink | OpenRouter (→ `docs/specs/coder/models.md`) |
| Sandbox unit | one `git worktree` per subagent (→ `docs/specs/coder/sandbox.md`) |
| Ground truth | `nexus run --headless --rpc=stdio` scenario pass (→ `docs/specs/agent/scenarios.md`) |
| Audit | append-only JSONL ledger (→ `docs/specs/coder/telemetry.md`) |

---

## Reading order

1. This file.
2. `architecture.md` — the orchestrator + subagent + tool runtime layout.
3. `models.md` — per-task model policy.
4. `parallelism.md` — how dozens run at once.
5. `tools.md` — every callable function.
6. `workflows.md` — DAG recipes.
7. `context.md` — context packing strategy.
8. `sandbox.md` — isolation + safety.
9. `telemetry.md` — what's logged.
10. `cli.md` — `nexus coder ...` surface.
11. `integration-with-engine.md` — how it leans on `nexus-agent-sdk`.

---

## Prior art

- **Aider** ✓ — architect/editor split, repo-map context, edit-format pluggability. We generalize from 2 roles to N roles. (Aider blog, *Separating code reasoning and editing*, 2024.)
- **Claude Code subagents** ✓ — parallel pre-configured personas with their own tool restrictions. → `~/workspace/sebyx07/claude-code-bible/docs/02-skills-agents-commands.md`.
- **Vercel AI SDK** ✓ — provider-agnostic tool loops, streaming structured output, multi-step `maxSteps`. → `sdk.vercel.ai`.
- **OpenRouter** ✓ — one API, all frontier + cheap + free models, transparent pricing, automatic provider fallback. → `openrouter.ai/docs`.
- **GitHub Copilot Workspace** ✓ — plan-then-implement loop; we steal the loop, ditch the SaaS lock-in.
- **GGPO replay-as-debugger** ✓ — but for code: deterministic snapshot is the regression fixture. → `docs/specs/agent/replay.md`.
- **Cursor** ✗ — editor-coupled, single-shot. Cannot run 30 jobs.
- **Devin** ✗ — closed, token markup, no inspection.

---

## Open questions

- [DECISION NEEDED] Ship `nexus-coder` as a Node CLI (Vercel AI SDK is JS-native) or as a Rust binary that calls the SDK over a thin Node sidecar? Default assumption: Node CLI, Rust sidecar for engine RPC.
- [DECISION NEEDED] Is `nexus-coder` itself MIT and in this repo, or sibling repo `nexus-coder`? Recommend: sibling repo, MIT, referenced as submodule for dogfooding.
- [DECISION NEEDED] Should subagents call the OpenRouter API directly or always through the orchestrator (rate-limit + cost cap chokepoint)? Default: always through orchestrator.
- [COST NEEDED] Reference budget for "weekend AAA MVP" run. Estimate: $200–$2000 in tokens. → `docs/specs/coder/telemetry.md`.
