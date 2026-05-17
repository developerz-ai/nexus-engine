<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Tools

> The closed catalog of functions a subagent may call. Each is JSON-schema-typed. No file op, no engine op, no network op happens outside this list.

→ Architecture: `docs/specs/coder/architecture.md`
→ Sandbox enforcement: `docs/specs/coder/sandbox.md`
→ Engine bridge it wraps: `docs/specs/agent/api.md` [AGENT: 10]
→ Vercel AI SDK tool definitions: `https://ai-sdk.dev/docs/foundations/tools`

---

## Boundaries

- **Owns:** tool registry, JSON schemas, dispatch, per-tool permission checks.
- **Does NOT own:** the actions themselves (delegated to filesystem, git, or engine bridge).
- **Depends on:** Zod (schema) · Node `fs` + `child_process` · `nexus-agent-sdk` (Rust binding via the bridge).

---

## Tool catalog (the closed set)

| Tool | Side effect | Permission | Cost class |
|---|---|---|---|
| `ReadSpec` | read | always | free |
| `GrepCodebase` | read | always | free |
| `ReadFile` | read | always | free |
| `EditCrate` | write (worktree) | sandboxed | local |
| `RunHeadlessScenario` | engine call | rate-limited | engine |
| `ReplaySnapshot` | engine call | rate-limited | engine |
| `BenchPerfContract` | engine call | rate-limited | engine |
| `ValidateAgainstSpec` | read + analysis | always | local |
| `OpenPR` | network (gh) | gated | network |
| `ListSpecs` | read | always | free |
| `ListContracts` | read | always | free |
| `WriteSpec` | write (docs/) | architect role only | local |

No `Bash`. No `WebFetch`. No `Shell`. A subagent that needs to do something not on this list must request escalation; orchestrator handles or refuses. → `docs/specs/coder/sandbox.md` §kill-switch.

---

## Schema convention

All tools share this shape (Vercel AI SDK tool definition + Zod):

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const ReadSpec = tool({
  description: 'Read a Nexus spec file from docs/specs/. Returns full markdown.',
  inputSchema: z.object({
    path: z.string().describe('Path relative to repo root, must start with docs/specs/'),
  }),
  outputSchema: z.object({
    path: z.string(),
    content: z.string(),
    sha: z.string(),
  }),
  execute: async ({ path }) => { /* ... */ },
});
```

All execute functions are `async`, return structured JSON, throw typed `ToolError`. Vercel AI SDK streams partial output where the schema allows. → AI SDK structured outputs: `https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data`.

---

## ReadSpec

| Field | Spec |
|---|---|
| Purpose | Pull a single spec file into context. |
| Input | `{ path: "docs/specs/physics/rigid.md" }` |
| Output | `{ path, content, sha, last_modified }` |
| Constraint | path must match `^docs/specs/.+\.md$` |
| Errors | `E_NOT_FOUND`, `E_PATH_OUTSIDE_SPECS` |

---

## ListSpecs / ListContracts

| Field | Spec |
|---|---|
| Purpose | Discovery without loading file contents. |
| Input | `{ glob?: "docs/specs/physics/**" }` |
| Output | `{ entries: [{ path, title, size, sha }] }` |
| Use case | Subagent decides which specs to `ReadSpec` next. |

---

## GrepCodebase

| Field | Spec |
|---|---|
| Purpose | Ripgrep-equivalent over `crates/`, `docs/`, optionally `games/`. |
| Input | `{ pattern, glob?, max_results?, context?: number }` |
| Output | `{ matches: [{ path, line, text, before, after }], truncated }` |
| Constraint | regex must compile; result cap 200 lines/call |
| Errors | `E_REGEX_INVALID`, `E_TIMEOUT` |

---

## ReadFile

| Field | Spec |
|---|---|
| Purpose | Read any file inside the subagent's worktree. |
| Input | `{ path, offset?, limit? }` |
| Output | `{ path, content, total_lines, returned_lines }` |
| Constraint | path resolved inside worktree only |
| Errors | `E_PATH_ESCAPE`, `E_NOT_FOUND` |

---

## EditCrate

| Field | Spec |
|---|---|
| Purpose | Apply edits to source files in the subagent's worktree. |
| Input | `{ ops: [{ kind: "replace"\|"insert"\|"delete"\|"create", path, ... }] }` |
| Output | `{ applied: n, files_changed: [path], diff_stat }` |
| Constraint | path within `crates/` or `games/` or `docs/` (per role) |
| Atomicity | all ops succeed or none applied; ops apply in array order |
| Errors | `E_PATH_OUTSIDE_WORKTREE`, `E_CONFLICT`, `E_NO_MATCH` |

Edit format: same shape as Aider's `EditBlockCoder` for portability. → `https://aider.chat/docs/usage/modes.html`.

---

## RunHeadlessScenario

| Field | Spec |
|---|---|
| Purpose | Execute a scenario TOML against the engine; primary ground-truth tool. |
| Input | `{ scenario: "games/demo-fps/scenarios/strafe.toml", repeats?: 1, timeout_s?: 60 }` |
| Output | `{ passed: bool, asserts: [{name, ok, msg}], duration_ms, telemetry_summary, snapshot_id? }` |
| Constraint | scenario must exist; engine bridge must have a slot |
| Errors | `E_SCENARIO_NOT_FOUND`, `E_ENGINE_DOWN`, `E_TIMEOUT` |

→ Scenario format: `docs/specs/agent/scenarios.md`.

---

## ReplaySnapshot

| Field | Spec |
|---|---|
| Purpose | Re-run engine from a captured state to reproduce a bug. |
| Input | `{ snapshot_id, until_tick?, with_patch? }` |
| Output | `{ final_state_hash, diverged_at_tick?, telemetry_path }` |
| Constraint | snapshot must exist in `.nexus/snapshots/` |
| Errors | `E_SNAPSHOT_MISSING`, `E_NONDETERMINISTIC` |

→ Replay spec: `docs/specs/agent/replay.md`.

---

## BenchPerfContract

| Field | Spec |
|---|---|
| Purpose | Run the perf-contract benchmark for a spec; assert against its table. |
| Input | `{ spec: "docs/specs/physics/rigid.md", iterations?: 100 }` |
| Output | `{ rows: [{ metric, target, hard_limit, observed, status: "pass"\|"warn"\|"fail" }] }` |
| Constraint | spec must have a `Performance Contract` section |
| Errors | `E_NO_PERF_TABLE`, `E_BENCH_HARNESS_MISSING` |

---

## ValidateAgainstSpec

| Field | Spec |
|---|---|
| Purpose | Static check: does the code match the spec's Public API + Error Contract? |
| Input | `{ spec, code_glob? }` |
| Output | `{ matches: bool, gaps: [{kind, detail, location?}] }` |
| How | parses spec tables → diffs against `rustdoc` JSON + grep for error codes |
| Errors | `E_SPEC_UNPARSEABLE`, `E_TOOLCHAIN_MISSING` |

This tool runs in every commit-prep step. A subagent cannot OpenPR if `ValidateAgainstSpec` returns gaps without an explicit `--accept-drift` flag from the human.

---

## OpenPR

| Field | Spec |
|---|---|
| Purpose | Push the worktree branch and open a GitHub PR. |
| Input | `{ title, body, base?: "main", draft?: true, labels?: [string] }` |
| Output | `{ url, number, branch }` |
| Constraint | requires `gh` auth; passes through `nexus-merge` PR template |
| Gating | one OpenPR call per subagent run; orchestrator dedup |
| Errors | `E_GH_AUTH`, `E_BRANCH_DIRTY`, `E_PR_TEMPLATE_INVALID` |

→ PR template: `docs/guides/pr-protocol.md` [AGENT: 16].

---

## WriteSpec

| Field | Spec |
|---|---|
| Purpose | Architect-role subagents add or amend `docs/specs/...`. |
| Input | `{ path, content, mode: "create"\|"patch" }` |
| Output | `{ path, sha, mode }` |
| Constraint | role must be `architect` (orchestrator gates); path must match `docs/specs/...` |
| Errors | `E_ROLE_FORBIDDEN`, `E_SPEC_EXISTS` (in create mode) |

---

## Tool composition

Subagents do not call tools serially. They call in parallel within a step where Vercel AI SDK supports it (`maxParallelToolCalls`). Typical impl-spec subagent step:

```
parallel:
  ReadSpec(docs/specs/physics/rigid.md)
  ReadSpec(docs/specs/physics/collision.md)
  ListContracts(glob: docs/contracts/physics-*)
  GrepCodebase(pattern: "fn step\(", glob: "crates/physics/**")
```

→ Vercel AI SDK parallel tool calls: `https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling`.

---

## Permission matrix (per subagent role)

| Role | ReadSpec | EditCrate | WriteSpec | OpenPR | Run/Bench |
|---|---|---|---|---|---|
| `architect` | yes | no | yes | no | no |
| `coder` | yes | yes (crates/games) | no | yes | yes |
| `reviewer` | yes | no | no | comment-only | yes |
| `bencher` | yes | no | no | no | yes |
| `triager` | yes | no | no | no | no |

Roles assigned by orchestrator per task type. Role is in the system prompt and enforced at the runtime layer. Defense in depth.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| `ReadSpec` p50 | < 5 ms | < 50 ms |
| `GrepCodebase` p50 (whole repo) | < 200 ms | < 2 s |
| `EditCrate` (single op) | < 20 ms | < 200 ms |
| `RunHeadlessScenario` overhead vs raw `nexus run` | < 50 ms | < 200 ms |
| `ValidateAgainstSpec` (1 spec, 1 crate) | < 2 s | < 10 s |

---

## Error contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_PATH_OUTSIDE_WORKTREE` | tool tried to read/write outside sandbox | abort, audit, kill subagent |
| `E_ROLE_FORBIDDEN` | tool not in role's permission set | model error; recover by re-planning |
| `E_RATE_LIMIT` | per-tool cap hit | retry with backoff or yield |
| `E_TIMEOUT` | tool exceeded budget | retry once, then fail upstream |

---

## Prior art

- **Anthropic tool use** ✓ — JSON-schema-described function calls, parallel tool calls. Pattern: every tool is a typed function. → `https://docs.anthropic.com/en/docs/build-with-claude/tool-use`.
- **OpenAI function calling** ✓ — schema-first, same shape.
- **Vercel AI SDK `tool()`** ✓ — Zod → JSON schema, streaming results, multi-step loops.
- **Aider edit formats** ✓ — `EditBlockCoder`, `UnifiedDiffCoder` shapes inform our `EditCrate` op vocabulary.
- **MCP** ✓ — capability-negotiated tools/resources. Future: expose nexus-coder tools as an MCP server for foreign agents.

---

## Open questions

- [DECISION NEEDED] Expose tools as an MCP server so Claude Code / Cursor can use the Nexus toolchain too? Default: yes, v1.1.
- [DECISION NEEDED] `Bash` escape hatch (e.g. `cargo fmt`) — wrap as `RunChore(name)` with a closed name list, or just `Bash` with allow-list. Default: closed name list.
- [DECISION NEEDED] Auto-`ValidateAgainstSpec` on every `EditCrate` or only at commit-prep? Default: commit-prep only (latency).
