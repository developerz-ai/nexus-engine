<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus-coder — Model Routing

> Per-task model picks. OpenRouter is the gateway. Frontier models for hard thinking, cheap models for batch grunt work, free models when accuracy doesn't matter. Swap any time, no code change.

→ Architecture: `docs/specs/coder/architecture.md`
→ Telemetry / cost ledger: `docs/specs/coder/telemetry.md`
→ Vercel AI SDK provider abstraction: `https://ai-sdk.dev/docs/introduction`
→ OpenRouter model fallbacks: `https://openrouter.ai/docs/guides/routing/model-fallbacks`

---

## Boundaries

- **Owns:** model-per-task policy, fallback chains, cost ceilings, token budget tracking, A/B accuracy table.
- **Does NOT own:** the inference (OpenRouter does) · the prompt content (subagent does) · the tools (tool runtime).
- **Depends on:** OpenRouter HTTPS API · Vercel AI SDK provider for OpenRouter (`@openrouter/ai-sdk-provider`).

---

## The default policy table

The orchestrator looks up `(task_type, machine_class)` → `(primary, fallbacks[])`.

| Task type | Primary | Fallbacks | Why |
|---|---|---|---|
| `architect.design` | `anthropic/claude-opus-4-7` | `openai/o4`, `google/gemini-3-pro` | Hard reasoning. Few calls, high stakes. |
| `architect.review` | `anthropic/claude-opus-4-7` | `openai/o4` | Catches deep flaws. |
| `code.impl` | `anthropic/claude-sonnet-4-7` | `deepseek/deepseek-v4`, `qwen/qwen3-coder` | Bulk. Good edit accuracy. Cheap. |
| `code.refactor` | `anthropic/claude-sonnet-4-7` | `deepseek/deepseek-v4` | Mechanical, deterministic-ish. |
| `code.tighten-loop` | `anthropic/claude-haiku-4-7` | `meta/llama-4-haiku` | Tight retry cycles. Speed > IQ. |
| `test.scenario-write` | `anthropic/claude-sonnet-4-7` | `deepseek/deepseek-v4` | Structured TOML. |
| `test.fix-flake` | `anthropic/claude-opus-4-7` | `openai/o4` | Hard bugs. Frontier helps. |
| `bench.regression-hunt` | `anthropic/claude-opus-4-7` | `openai/o4` | Needle in haystack. |
| `docs.write` | `anthropic/claude-sonnet-4-7` | `google/gemini-3-flash` | Volume + clarity. |
| `docs.lint` | `:free` tier (rotating) | `anthropic/claude-haiku-4-7` | Style only. Free first. |
| `triage.classify` | `anthropic/claude-haiku-4-7` | `openai/gpt-5-mini` | Cheap, fast classifier. |
| `chore.rename` / `chore.format` | `:free` tier | `anthropic/claude-haiku-4-7` | Pure mechanics. |
| `pr.summary` | `anthropic/claude-haiku-4-7` | `openai/gpt-5-mini` | Short, structured. |
| `merge.gate` | `anthropic/claude-opus-4-7` | `openai/o4` | Gate the world. Spend money. |

Model strings are OpenRouter slugs. Update the table; no code change. Names above are illustrative for 2026; refresh from `https://openrouter.ai/models` on every release. → `docs/specs/coder/cli.md` `nexus coder swap-model`.

---

## Routing algorithm

```
function pick_model(task):
    policy = policy_table[(task.type, machine.class)]
    if user_override(task): return user_override(task)        # CLI flag wins
    if budget.remaining < policy.primary.estimated_cost:
        return cheapest_qualifying(policy)
    return policy.primary + policy.fallbacks                  # passed as models[] to OpenRouter
```

`models[]` is sent verbatim to OpenRouter so failover is automatic — if `anthropic/claude-opus-4-7` is rate-limited or down, OpenRouter tries the next entry transparently. → `openrouter.ai/docs/guides/routing/model-fallbacks`.

---

## Cost ceilings

| Scope | Default cap | Behavior at cap |
|---|---|---|
| Single subagent | $5 | abort task, mark `E_TOKEN_CAP` |
| Single workflow DAG | $50 | pause, prompt user |
| Daily session | $200 | hard stop, write ledger summary |
| Project lifetime | user-set | warn at 80%, stop at 100% |

Caps are wall-clock independent. They are spend budgets. Override per-invocation: `nexus coder implement --cap=20 spec/foo.md`. → `docs/specs/coder/cli.md`.

---

## Token budget tracking

Every subagent emits `{ prompt_tokens, completion_tokens, cached_tokens, cost_usd }` after each step. Orchestrator aggregates into the ledger.

```
ledger entry:
{
  "ts": "2026-05-17T14:22:01Z",
  "task_id": "impl-physics-rigid-3a",
  "task_type": "code.impl",
  "model": "anthropic/claude-sonnet-4-7",
  "prompt_tokens": 18420,
  "completion_tokens": 2104,
  "cached_tokens": 14200,
  "cost_usd": 0.0421,
  "duration_ms": 3812,
  "tool_calls": 7
}
```

→ Schema in `docs/specs/coder/telemetry.md`.

---

## Prompt-cache awareness

Models that support prompt caching (Anthropic, OpenAI) get longest-lived chunks pinned at the front of the prompt:

```
[ system prompt        ]   ← stable, cached forever
[ Nexus principles     ]   ← stable, cached forever
[ relevant contracts   ]   ← stable per task class, cached per session
[ relevant specs       ]   ← stable per task, cached per task
[ task instruction     ]   ← unique per call
```

→ Detailed packing rules in `docs/specs/coder/context.md`.

OpenRouter passes through Anthropic cache headers. Verify with `usage.cached_tokens` in response. Target: ≥ 70% cache hit on the static prefix.

---

## A/B accuracy table

The orchestrator maintains a rolling 1000-task accuracy estimate per `(task_type, model)` cell. Source of truth: `ValidateAgainstSpec` + `RunHeadlessScenario` pass/fail.

```
accuracy[ "code.impl", "anthropic/claude-sonnet-4-7" ] = 0.93
accuracy[ "code.impl", "deepseek/deepseek-v4"        ] = 0.81
accuracy[ "code.impl", "qwen/qwen3-coder"            ] = 0.78
```

Used by `nexus coder cost --recommend` to suggest cheaper models when accuracy gap is small enough. [BENCHMARK NEEDED]: thresholds.

---

## Model swap UX

```
nexus coder swap-model code.impl deepseek/deepseek-v4
# updates ~/.nexus/coder/policy.toml
# affects ALL future code.impl tasks
# emits diff vs default policy for transparency
```

`policy.toml` lives in the repo (committed) or user home (per-dev). Repo wins.

---

## Provider-level controls

Inject OpenRouter `provider` block per task class:

```json
{
  "provider": {
    "order": ["Anthropic", "Bedrock", "GoogleVertex"],
    "allow_fallbacks": true,
    "data_collection": "deny"
  }
}
```

Used for: privacy-sensitive code paths (deny logging providers), latency-sensitive loops (pin lowest-latency provider), compliance (allow-list providers). → `https://openrouter.ai/docs/guides/routing/provider-selection`.

---

## Performance contract

| Metric | Target | Hard limit |
|---|---|---|
| Policy lookup | < 0.1 ms | < 1 ms |
| Cost ledger write (per step) | < 1 ms | < 10 ms |
| Failover hop (primary → fallback) | OpenRouter-bound | < 5 s wall |

---

## Open questions

- [DECISION NEEDED] Should `architect.design` use thinking-mode models (extended reasoning) by default? Cost ~10×.
- [DECISION NEEDED] Local model support (Ollama, vLLM) for offline / free runs? Default: yes, via Vercel AI SDK's `ollama` provider, treated as one more entry in `models[]`.
- [COST NEEDED] Real-world per-task cost distribution from a "weekend AAA MVP" run. → ship telemetry, harvest after first dogfood.
