<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Sandbox & Safety

> One git worktree per subagent. Permissioned tool runtime. Hard kill switches. Append-only audit log. The cost of dozens of agents touching the same repo at once.

→ Tools (the only escape vectors): `docs/specs/coder/tools.md`
→ Telemetry / audit format: `docs/specs/coder/telemetry.md`
→ Parallelism (worktree pool sizing): `docs/specs/coder/parallelism.md`

---

## Boundaries

- **Owns:** worktree allocation, per-subagent permission scope, kill switches, audit log writer.
- **Does NOT own:** kernel-level isolation (no containers v1.0) · network firewall (orchestrator policy only).

---

## The threat model

Subagents are LLMs. They are non-malicious but unreliable. Failure modes:

| Mode | Example | Mitigation |
|---|---|---|
| Wrong file | edits `crates/core/` when task is `crates/audio/` | worktree path scoping |
| Runaway loop | calls `EditCrate` 1000× in a row | per-tool rate limit |
| Spec drift | writes code that contradicts spec | `ValidateAgainstSpec` gate |
| Secret exfil | reads `.env` and embeds in prompt | denylist (`.env`, `.ssh/`, `~/.nexus/coder/policy.toml`) |
| Cost runaway | burns through budget chasing a bad path | budget cap per subagent (→ `models.md`) |
| Repo poison | force-push, force-delete, history rewrite | git ops gated, only `OpenPR` exposed |

Not in scope: malicious LLM with code-execution intent. Run with hostile models at your own risk.

---

## Worktree-per-subagent

```
nexus-engine/                  ← main checkout
├── .git/                      ← shared object database
├── .nexus/coder/worktrees/
│   ├── slot-00/               ← worktree, branch coder/slot-00/<task>
│   ├── slot-01/               ← worktree, branch coder/slot-01/<task>
│   ├── slot-02/               ← ...
│   └── slot-NN/
└── ...
```

Each subagent process is launched with `cwd = .nexus/coder/worktrees/slot-K/`. The tool runtime resolves every path against this cwd; any path that escapes (`..` traversal, absolute outside) → `E_PATH_OUTSIDE_WORKTREE` → kill subagent + audit.

Pattern reference: Aider / Claude Code subagent worktrees. → `~/workspace/sebyx07/claude-code-bible/docs/02-skills-agents-commands.md`.

---

## Warm pool

Creating a worktree cold = ~3s. Pool keeps `min(8, pool.size)` pre-allocated worktrees on `main`. On allocation:

```
checkout main, pull, create branch coder/slot-K/<task-id>
hand to subagent
on subagent exit:
    if merged: keep branch, mark slot free
    if abandoned: delete branch, reset slot to main, mark free
```

Target: < 500ms allocation from warm pool. → `docs/specs/coder/parallelism.md`.

---

## Permission model (defense in depth)

Three layers:

**L1 — Role.** Orchestrator stamps role into system prompt. Model self-restricts. Cheap, advisory.

**L2 — Tool registry.** Per-role allow-list. Calls to disallowed tools → `E_ROLE_FORBIDDEN`, returned as a tool error the model can recover from.

**L3 — Runtime.** Every tool's `execute` re-checks: path scope, role, rate limit, budget. A bug in L2 still gets blocked.

```
              role in system prompt
                       │
                       ▼
            tool catalog filtered per role
                       │
                       ▼
              runtime path + role check
                       │
                       ▼
                  side effect
```

---

## Path scoping per role

| Role | Read scope | Write scope |
|---|---|---|
| `architect` | repo-wide | `docs/specs/`, `docs/architecture/` |
| `coder` | repo-wide | `crates/`, `games/`, `tests/`, `docs/specs/<system>/` (amendments only) |
| `reviewer` | repo-wide | none (comments only via `OpenPR` review API) |
| `bencher` | repo-wide | `benches/`, no source |
| `triager` | repo-wide | none |

Denylist applies to all roles:
- `.env`, `.env.*`
- `.ssh/`, `~/.ssh/`
- `~/.nexus/coder/policy.toml`, `~/.nexus/coder/keys.toml`
- `.git/objects/`, `.git/hooks/` (git plumbing)
- absolute paths outside the worktree

---

## Kill switches

| Trigger | Action |
|---|---|
| `Ctrl-C` on CLI | SIGINT → orchestrator → SIGTERM all subagents → 5s grace → SIGKILL |
| `nexus coder kill --all` | same as above without UI |
| `nexus coder kill <task-id>` | kill that subagent, preserve siblings |
| Budget cap hit | orchestrator stops queueing, in-flight finish naturally |
| `E_SANDBOX_BREAK` from any tool | kill the offending subagent, blacklist its prompt hash for 1 hour |
| Watchdog (no progress for N min) | kill, retry once with bigger model, then fail upstream |
| Engine bridge crash | drain affected subagents, restart bridge, re-queue tasks |

Every kill is logged with `{ trigger, task_id, partial_diff, tokens_burnt }`.

---

## Network policy

Subagents have **no direct network**. Network access happens only through specific tools:

| Tool | Network surface | Limit |
|---|---|---|
| (model call) | OpenRouter `chat/completions` | orchestrator-mediated, budget-capped |
| `OpenPR` | `gh` CLI → GitHub API | gated, one per subagent run |

No raw `fetch`, no `curl`, no DNS for user code. Enforced by spawning subagent processes with restricted egress (firewall hook if available, else trust + audit).

[DECISION NEEDED] Should v1.0 require a network namespace (Linux `unshare -n`) to enforce this? Recommend yes on Linux beast/cluster class, best-effort elsewhere.

---

## Filesystem policy

Subagent processes spawned with `cwd` set to worktree. On Linux, optionally use:

- `unshare --mount` + bind-mount worktree → reduces blast radius
- `seccomp-bpf` profile blocking `socket`, `open` outside cwd

Both opt-in, off by default for laptop class, on for cluster.

---

## Audit log

Append-only JSONL at `.nexus/coder/audit.jsonl`. Every:

- subagent spawn / exit
- tool call (name, input hash, output hash, duration)
- model call (model, tokens, cost)
- permission denial
- kill switch trigger
- worktree allocation / release
- PR opened

Schema → `docs/specs/coder/telemetry.md`.

Audit log is the source of truth for incidents. Rotated daily, compressed weekly, retained 90 days by default.

---

## Recovery

```
orchestrator crash:
   on restart, read .nexus/coder/runs/<run_id>/dag.json
   for each task with status ∈ {running, queued}:
       if worktree exists and branch ahead of main: preserve, mark "needs human"
       else: re-queue
       
subagent crash:
   orchestrator detects via process exit code
   worktree state preserved (no cleanup) for inspection
   task re-queued with `retry_n++`; bail at retry_n == 3
   
engine crash:
   bridge restart, scenarios re-run, no state preserved (scenarios are deterministic)
```

No data loss. Worst case: a wasted worktree disk slot + replayable task.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| Worktree alloc (warm) | < 500 ms | < 3 s |
| Worktree teardown | < 200 ms | < 2 s |
| Path scope check (per tool call) | < 0.1 ms | < 1 ms |
| Audit log write (per event) | < 1 ms | < 10 ms |
| Kill propagation (SIGTERM → exit) | < 2 s | < 5 s |

---

## Error contract

| Code | Meaning | Caller action |
|---|---|---|
| `E_PATH_OUTSIDE_WORKTREE` | escape attempt | kill subagent, audit |
| `E_PATH_DENYLIST` | hit secret denylist | kill subagent, audit, alert |
| `E_ROLE_FORBIDDEN` | tool not in role | return error to model, allow retry with different tool |
| `E_WORKTREE_DIRTY` | branch has uncommitted changes at handoff | force clean, log |
| `E_WORKTREE_CONFLICT` | merge conflict on integration | escalate to architect role |
| `E_KILL_TIMEOUT` | subagent didn't exit on SIGTERM | SIGKILL, mark slot unhealthy |

---

## Prior art

- **Claude Code worktree pattern** ✓ — proves git worktrees scale to many parallel agents. → bible ch. 2 + ch. 5.
- **Aider git integration** ✓ — every change committed for free rollback.
- **Bubblewrap / Firejail** ✓ — for opt-in OS-level isolation.
- **GitHub Actions runners** ✓ — per-job fresh checkout, our worktree pool is a faster local equivalent.

---

## Open questions

- [DECISION NEEDED] Containerize subagents (Docker / podman) by default? Default: no, perf cost too high; opt-in for cluster class.
- [DECISION NEEDED] Enforce seccomp on Linux v1.0 or defer? Default: defer to v1.1.
- [DECISION NEEDED] Should `architect` role be allowed to write to `crates/`? Currently no — keeps spec/impl separation clean.
