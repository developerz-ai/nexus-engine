<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — CLI Surface

> `nexus coder <verb>` is the only public entry. Every verb is a thin shim over a workflow. Output streams structured JSON on stdout when `--json`; pretty text otherwise.

→ Workflows each verb maps to: `docs/specs/coder/workflows.md`
→ Models the CLI can swap: `docs/specs/coder/models.md`
→ Audit/cost queries: `docs/specs/coder/telemetry.md`
→ Top-level `nexus` CLI: `docs/game-template/cli.md` [AGENT: 15]

---

## Verbs

| Verb | Maps to workflow | One-liner |
|---|---|---|
| `nexus coder implement <spec>` | `implement-spec` | spec → code + tests + PR |
| `nexus coder fix <args>` | `fix-contract-violation` | reconcile code ↔ spec/contract |
| `nexus coder bench <spec>` | `perf-regression` | run perf, hunt regression |
| `nexus coder review <pr>` | `review` | senior-dev review on a PR |
| `nexus coder parallel <args>` | `parallel` | fan-out N tasks |
| `nexus coder weekend-mvp <pitch>` | `weekend-mvp` | the vision-statement run |
| `nexus coder cost [opts]` | (query) | telemetry/cost report |
| `nexus coder swap-model <type> <slug>` | (config) | change per-task model |
| `nexus coder kill <args>` | (control) | stop subagent(s) |
| `nexus coder context <subverb>` | (utility) | inspect/build/lint context |
| `nexus coder ui` | (server) | live dashboard over SSE |
| `nexus coder doctor` | (diagnostic) | check setup, keys, engine, gh |

---

## Global flags

| Flag | Default | Effect |
|---|---|---|
| `--json` | off | stdout = JSONL events; suppress pretty |
| `--cap=<usd>` | from policy | hard cost cap for this run |
| `--class=<laptop\|workstation\|beast\|cluster>` | auto-detect | machine class override |
| `--model.<task_type>=<slug>` | from policy | per-invocation model override |
| `--workflow=<name>` | inferred from verb | explicit workflow file |
| `--dry-run` | off | print DAG, don't spawn subagents |
| `--no-pr` | off | run to validate, skip `OpenPR` |
| `--quiet` / `--verbose` | normal | log verbosity |
| `--audit=<path>` | `.nexus/coder/audit.jsonl` | audit log location |

---

## `nexus coder implement <spec>`

```
$ nexus coder implement docs/specs/physics/rigid.md
[run-2026-05-17-1424] DAG: 6 tasks → coder × 4, reviewer × 1, coder × 1
  → read         (sonnet)      ████ 4.1k tok  $0.02
  → scaffold     (sonnet)      ████ 18k tok   $0.09
  → tests        (sonnet)      ████ 22k tok   $0.11
  → benches      (sonnet)      ████ 14k tok   $0.07
  → validate     (opus)        ████ 38k tok   $0.55  ✓ all asserts pass
  → pr           (haiku)       ████ 2.1k tok  $0.003  → PR #421

7m42s · 98.2k tok · $0.84 · scenarios 12/12 · perf within contract
```

Flags:

| Flag | Effect |
|---|---|
| `--scenario=<path>` | use a specific scenario instead of all |
| `--draft` | open PR as draft |
| `--base=<branch>` | base branch for PR (default `main`) |
| `--accept-drift` | allow `ValidateAgainstSpec` warnings (architect drift) |

---

## `nexus coder fix`

```
nexus coder fix --contract=docs/contracts/core-physics.md --report=ci-output.json
nexus coder fix --pr=421                # pulls coderabbit/merge-bot comments
nexus coder fix --crate=physics --error=E0432
```

Flags:

| Flag | Effect |
|---|---|
| `--contract=<path>` | start from a violation report |
| `--pr=<n>` | fix comments on an existing PR |
| `--crate=<name>` | scope the fix to a crate |
| `--error=<code>` | start from a compiler/clippy code |

---

## `nexus coder bench`

```
nexus coder bench docs/specs/physics/rigid.md
nexus coder bench --all
nexus coder bench --regression --since=7d
```

Flags:

| Flag | Effect |
|---|---|
| `--regression` | trigger `perf-regression` workflow on first failure |
| `--iterations=<n>` | override iteration count |
| `--baseline=<commit>` | compare against a commit |

---

## `nexus coder review <pr>`

```
nexus coder review 421
nexus coder review 421 --post                    # post comments to PR
nexus coder review --diff=- < changes.patch      # local diff
```

Flags:

| Flag | Effect |
|---|---|
| `--post` | post comments to GitHub PR (otherwise print) |
| `--strict` | fail exit code 1 if any blocker found |

---

## `nexus coder parallel`

```
nexus coder parallel --from=tasks.jsonl
nexus coder parallel --workflow=new-genre-module --genre=survival
nexus coder parallel --rename=OldType:NewType --crates=core,physics
```

Flags:

| Flag | Effect |
|---|---|
| `--from=<file>` | JSONL of task objects |
| `--workflow=<name>` | explicit workflow file |
| `--max=<n>` | cap concurrent subagents (default: machine class) |

---

## `nexus coder weekend-mvp`

```
nexus coder weekend-mvp "co-op cozy horror" --class=beast --cap=2000
```

Flags:

| Flag | Effect |
|---|---|
| `--genre=<name>` | force genre module |
| `--style=<pbr\|npr\|pixel\|2d>` | force style pipeline |
| `--cap=<usd>` | spend cap (default $500) |
| `--deadline=<48h>` | wall-clock budget (advisory) |

Prompts before spawning the DAG to confirm cap + class.

---

## `nexus coder cost`

```
nexus coder cost                       # current run, live
nexus coder cost --since=24h           # rollup
nexus coder cost --since=24h --json    # JSONL
nexus coder cost --by-model            # per-model breakdown
nexus coder cost --by-task-type        # per task class
nexus coder cost --recommend           # cheaper-model suggestions
nexus coder cost --workflow=weekend-mvp
```

Output schema → `docs/specs/coder/telemetry.md` §per-task summary.

---

## `nexus coder swap-model`

```
nexus coder swap-model code.impl deepseek/deepseek-v4
nexus coder swap-model --reset                       # back to default policy
nexus coder swap-model --show                        # current policy
nexus coder swap-model --scope=repo|user             # where to persist
```

Writes to `policy.toml` (repo wins over user). Diff vs default printed on every swap.

---

## `nexus coder kill`

```
nexus coder kill --all                  # stop everything
nexus coder kill <task-id>              # stop one
nexus coder kill --run=<run-id>         # stop a whole run
```

SIGTERM then SIGKILL after 5 s grace. Worktrees preserved for inspection.

---

## `nexus coder context`

```
nexus coder context build-map           # regenerate L7 repo map
nexus coder context lint                # find specs missing cross-links
nexus coder context inspect <task-id>   # show the prompt that was sent
nexus coder context size <spec>         # token estimate per layer
```

---

## `nexus coder ui`

```
nexus coder ui --port=8080
```

SSE stream of audit events → minimal web UI. Live DAG view, cost meter, scenario pass rate. Read-only.

---

## `nexus coder doctor`

```
$ nexus coder doctor
[ok]  Node 20.11.0
[ok]  git 2.43.0
[ok]  gh authenticated as seb
[ok]  nexus-agent-sdk built
[ok]  OPENROUTER_API_KEY set
[warn] anthropic/claude-opus-4-7: rate limit close to cap
[ok]  Engine bridge reachable
[ok]  Worktree pool: 8/8 warm
[ok]  Disk: 412 GB free
```

Exit 0 on all-ok, non-zero on any `[fail]`.

---

## Environment variables

| Var | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | required |
| `NEXUS_CODER_POLICY` | path to `policy.toml` override |
| `NEXUS_CODER_CACHE_DIR` | context cache location |
| `NEXUS_AGENT_SDK_BIN` | path to `nexus-agent-sdk` binary |
| `GH_TOKEN` / `gh auth` | required for `OpenPR` |
| `NEXUS_CODER_CLASS` | force machine class |

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success (all asserts passed, PR opened if requested) |
| `1` | task failure (validation, scenario, or budget cap) |
| `2` | misuse (bad flags, missing args) |
| `3` | environment (missing key, gh not authed) |
| `4` | engine bridge unhealthy |
| `5` | network/OpenRouter sustained failure |
| `130` | SIGINT |

---

## Output streaming

With `--json`, every audit event is emitted to stdout as one JSON object per line. Same schema as `.nexus/coder/audit.jsonl`. Pipe to `jq`, to OTLP, to anything.

Without `--json`, pretty TTY output with progress bars per subagent slot, live cost meter, DAG state. Re-renders on every event.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| CLI startup → first subagent spawn | < 1 s | < 3 s |
| Pretty re-render rate | 10 Hz | (capped) |
| JSONL event emit latency | < 5 ms | < 50 ms |

---

## Error contract

| Exit | Stderr line |
|---|---|
| 3 | `nexus coder: OPENROUTER_API_KEY not set; run \`nexus coder doctor\`` |
| 2 | `nexus coder: unknown verb '<x>'; try \`nexus coder --help\`` |
| 1 | `nexus coder: validate failed: <gap>; rerun with --accept-drift if intentional` |

---

## Open questions

- [DECISION NEEDED] `nexus coder repl` interactive mode? Default: defer, `ui` covers most needs.
- [DECISION NEEDED] Profile flag (`--profile=cheap|balanced|max-quality`) as a one-shot shortcut over `swap-model`? Default: yes.
- [DECISION NEEDED] Should `weekend-mvp` require explicit `--i-understand-the-cap` to run unattended over a weekend? Default: yes.
