<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Agent API — Semantic Layer

> Natural-language → structured RPC. `engine.spawn("dragon near castle")` is a valid call. A thin, deterministic intent resolver on top of the structured API, never a replacement.

## Boundaries

- **Owns:** intent grammar registry, intent resolver, slot fillers, vocabulary discovery, ambiguity handling.
- **Does NOT own:** the LLM (resolver is rule-based + optional small LM; the agent's own LLM is upstream), the underlying RPC (→ `api.md`), scripting (→ `docs/specs/scripting/sandbox.md` [AGENT: 08]).
- **Depends on:** entity CRUD (`api.md`), spatial queries (→ `docs/specs/core/ecs.md` [AGENT: 02]), asset registry (→ `docs/specs/assets/registry.md` [AGENT: 09]).

## Why

The structured API is precise but verbose. Five RPCs to "place a dragon near the castle facing the player" is friction. The semantic layer compresses canonical intents into one call, dispatched deterministically and observably.

Key constraint: the semantic layer is **never a black box**. Every semantic call returns the structured calls it dispatched, so the agent can inspect, learn, and switch to structured form when the semantic form is too vague.

This satisfies AI-First Mandate law 6: **Semantic APIs.**

## Architecture

```
   agent utterance
       │
       ▼
┌──────────────────────────────────────────┐
│  Tokenizer (deterministic)               │
│   ↓                                      │
│  Intent matcher (registry of patterns)   │
│   ↓                                      │
│  Slot filler                             │
│    - entity refs   ("castle", "player")  │
│    - spatial preps ("near", "above")     │
│    - asset/archetype  ("dragon")         │
│    - numeric  ("3", "50m away")          │
│   ↓                                      │
│  Constraint solver                       │
│    - "near castle" → query → pos sample  │
│   ↓                                      │
│  Plan: ordered list of structured RPCs   │
│   ↓                                      │
│  (optional) Confidence + dry-run reply   │
│   ↓                                      │
│  Dispatch                                │
└──────────────────────────────────────────┘
       │
       ▼
   { result, dispatched: [structured RPCs] }
```

The resolver is **rule-based with optional small LM fallback** for unknown utterances. The default build ships only the rule-based resolver to keep the engine LLM-free; an optional `semantic-llm` feature adds a small (sub-1B parameter) model behind a capability flag.

## API Surface

| Method | Purpose |
|---|---|
| `semantic.parse { utterance, context? }` | Resolve to structured plan without executing. |
| `semantic.execute { utterance, context? }` | Parse + dispatch the plan. |
| `semantic.vocabulary { }` | List supported intents with grammars. |
| `semantic.register { intent, grammar, handler }` | Game / mod adds a custom intent. |
| `semantic.unregister { intent }` | |

### `semantic.parse` → response

```jsonc
{
  "utterance": "spawn a dragon near the castle",
  "intent": "entity.spawn",
  "confidence": 0.92,
  "slots": {
    "archetype": "Dragon",
    "spatial":   { "op":"near", "target":"@castle", "distance": 8.0 },
    "facing":    null,
    "count":     1
  },
  "plan": [
    { "method":"entity.query",
      "params":{ "with":["Tag.Castle"], "limit":1 },
      "bind":"castle" },
    { "method":"spatial.sampleNear",
      "params":{ "anchor":"$castle", "radius":8.0, "filter":"navigable" },
      "bind":"pos" },
    { "method":"entity.spawn",
      "params":{ "archetype":"Dragon",
                 "components":{"Transform":{"pos":"$pos"}} },
      "bind":"dragon" }
  ],
  "ambiguities": [],
  "alternatives": []
}
```

### `semantic.execute`

Runs the plan. Returns:

```jsonc
{
  "ok": true,
  "result": { "dragon": "e0...0a7" },
  "dispatched": [ /* RPC results, in order */ ],
  "durationMs": 8.4
}
```

If `confidence < threshold` (default 0.6) or `ambiguities.length > 0`, the resolver MAY return `-32012 SEMANTIC_AMBIGUOUS` with candidate plans rather than dispatch. Controlled by:

```jsonc
{ "method": "semantic.execute",
  "params": { "utterance": "...",
              "threshold": 0.6,
              "onAmbiguous": "error" | "pickFirst" | "dryRun" } }
```

## Vocabulary (v1.0 baseline)

Intents shipped with the engine. Game / mods extend via `semantic.register`.

| Intent | Example utterance | Maps to |
|---|---|---|
| `entity.spawn` | "spawn a dragon at 10,0,0" | `entity.spawn` |
| `entity.spawn-near` | "spawn 3 goblins near the player" | query + sampleNear + spawnBatch |
| `entity.despawn` | "remove all dragons" | query + despawn |
| `entity.move` | "move the player to the castle gate" | query + entity.update |
| `entity.modify` | "set player health to 100" | entity.update |
| `entity.kill` | "kill all enemies" | query + entity.update(Health=0) |
| `scene.load` | "load the forest scene" | scene.load |
| `sim.advance` | "run for 5 seconds" | sim.advance |
| `sim.pause` | "pause" | sim.pause |
| `sim.set-speed` | "run at 10× speed" | sim.setSpeed |
| `snapshot.capture` | "save state" | snapshot.capture |
| `snapshot.restore` | "rewind to the last save" | snapshot.restore |
| `replay.bisect` | "find when the enemy count dropped below 5" | replay.bisect |
| `telemetry.subscribe` | "watch physics performance" | telemetry.subscribe |
| `scenario.run` | "run the falling-box scenario" | scenario.run |
| `query.inspect` | "what entities are within 10m of the player" | entity.query |
| `asset.generate` | "generate a tree sprite, pixel art style" | asset.generate |

`semantic.vocabulary` returns each with full grammar + slot schema. The agent uses this to know what utterances the engine actually understands without trial and error.

## Grammar Form

Grammars are deterministic patterns, expressed as a compact DSL:

```toml
[intent."entity.spawn-near"]
patterns = [
  "spawn {count:int=1} {archetype:asset} near {target:entity}",
  "spawn {count:int=1} {archetype:asset} {distance:length=5m} from {target:entity}",
  "place {archetype:asset} near {target:entity}",
]
slot.archetype = { type = "asset", domain = "archetypes" }
slot.target    = { type = "entity-ref", resolve = "query-or-tag" }
slot.distance  = { type = "length", default = "5m", min = "0.1m", max = "1km" }
slot.count     = { type = "int", min = 1, max = 100 }
handler        = "entity.spawn-near"
```

Slot types are a fixed vocabulary: `int`, `float`, `length`, `angle`, `string`, `entity-ref`, `asset`, `archetype`, `tag`, `pos3`, `rgba`, `direction`, `script-snippet`. Custom types live in scripts (→ scripting sandbox).

The resolver matches utterances against patterns, picks highest-confidence match, fills slots, and produces a plan. No general-purpose parser; intent design is explicit and reviewable.

## Spatial Resolution

The hardest part of "near the castle" is grounding. Helpers:

| Op | Resolution |
|---|---|
| `near X` | sample uniform points within R of X's bounds, filter navigable |
| `at X` | use X's position |
| `above X / below X` | offset along world up |
| `behind X / front of X` | use X's forward vector |
| `between X and Y` | midpoint, optional jitter |
| `inside X` | sample from X's volume (collider AABB) |
| `at <pos3>` | literal |

Each op is a deterministic function of world state at the tick of evaluation. Two identical world states produce identical sampled positions, given the same RNG stream.

## Asset Resolution

`archetype: "dragon"` resolves through the registered archetypes (declared by the game in `Nexus.toml` and via `archetype.register`). Resolution is case-insensitive substring + alias map. → `docs/specs/assets/registry.md` [AGENT: 09].

If unresolved, semantic returns alternatives:

```jsonc
"ambiguities": [
  { "slot":"archetype", "value":"dragon",
    "candidates": ["RedDragon","BlackDragon","BabyDragon"] }
]
```

## Custom Intents (per game / mod)

```jsonc
{ "method": "semantic.register",
  "params": {
    "intent": "rpg.give-quest",
    "patterns": ["give {player:entity} the {quest:tag} quest"],
    "slots": {
      "player": {"type":"entity-ref"},
      "quest":  {"type":"tag", "domain":"quests"}
    },
    "handler": { "kind":"script", "lang":"lua", "fn":"rpg.give_quest" }
  } }
```

Handlers MAY be:

- **script** — sandboxed Lua/Rune function (→ `docs/specs/scripting/sandbox.md`).
- **rpc-plan** — fixed list of structured RPCs with slot substitution.
- **builtin** — engine-provided handler (only for `nexus-engine` itself).

Mods registering intents are subject to capability grants (→ contract).

## Determinism

Semantic resolution is **deterministic given world state and utterance**. Same world, same string → same plan, same dispatch order. The optional small-LM fallback is the **only** non-deterministic component, and it is disabled by default. Scenarios that use semantic calls record the plan, not the utterance, so replay is bit-stable even if vocabulary changes.

## LLM Fallback (optional)

With `--features semantic-llm`:

- If no pattern matches with `confidence ≥ threshold`, a small local model proposes an intent + slots.
- Output is **constrained to the registered intent grammars** (JSON Schema constrained decoding).
- Disabled by default; requires `--capabilities semantic.llm`.
- Cached: identical utterance → identical plan in-process.

## Performance Contract

| Op | Target | Hard limit |
|---|---|---|
| `semantic.parse` (rule-based, known intent) | < 1 ms | < 5 ms |
| `semantic.parse` (LLM fallback, small model) | < 200 ms | < 1 s |
| `semantic.execute` end-to-end (simple intent) | < 5 ms | < 30 ms |
| `semantic.vocabulary` (200 intents) | < 10 ms | < 50 ms |

## Error Contract

| Code | `data.code` | Meaning | Caller action |
|---|---|---|---|
| -32012 | `SEMANTIC_AMBIGUOUS` | Multiple plans tied | Inspect `data.candidates`. |
| -32025 | `SEMANTIC_UNRESOLVED` | No intent matched | Use structured RPC; or register intent. |
| -32026 | `SEMANTIC_SLOT_INVALID` | Slot value out of domain | Inspect `data.slot.errors`. |
| -32027 | `SEMANTIC_HANDLER_FAILED` | Plan dispatched but a sub-RPC failed | See `data.failedAt`. |

## Test Requirements

- `semantic.parse("spawn a dragon at 0,0,0")` produces a plan whose first method is `entity.spawn`.
- Same utterance against same world state produces byte-identical plans across runs.
- An unknown asset name returns `SEMANTIC_SLOT_INVALID` with candidate suggestions.
- Registering a custom intent makes it visible in `semantic.vocabulary`.
- A semantic call's `dispatched` list, when re-played as raw RPCs, produces the same final state.
- LLM fallback off by default; `semantic.parse` of nonsense returns `SEMANTIC_UNRESOLVED`.

## Cross-references

- → `docs/specs/agent/api.md` — `semantic.*` and underlying structured RPCs
- → `docs/specs/agent/scenarios.md` — scenarios record plans, not utterances
- → `docs/specs/scripting/sandbox.md` — script-backed handlers [AGENT: 08]
- → `docs/specs/assets/registry.md` — archetype / tag resolution [AGENT: 09]
- → `docs/specs/core/ecs.md` — spatial queries [AGENT: 02]
- → `docs/contracts/core-agent.md` — capability gating [AGENT: 14]

## Prior Art

- **Inform 7 (interactive fiction)** ✓ — natural-language game commands with rigorous semantics; we adopt the determinism stance.
- **MCP tool schemas** ✓ — JSON-Schema-constrained tool invocation; informs `semantic.vocabulary` output.
- **OpenAI function calling** ✓ — same pattern: LLM picks a function, fills params from schema. Our resolver does this without an LLM by default.
- **OpenCog / Hubris natural-language pipelines** ✗ — too academic, too brittle. We keep it deliberately small.
- **Unity ML-Agents trainer DSL** ✓ — proves a domain-specific scripting layer that an agent can drive.

## Open Questions

- [DECISION NEEDED] Whether `semantic.execute` should auto-snapshot before dispatch (so `"undo"` is well-defined). Probably opt-in flag.
- [DECISION NEEDED] How much spatial vocabulary ships in v1.0 vs deferred. Suggest: minimum viable = `at`, `near`, `above`, `inside`.
- [DECISION NEEDED] Which small LM (if any) is the default for the optional `semantic-llm` feature. Avoid heavy deps.
- [BENCHMARK NEEDED] Resolver pattern matcher under 10k registered intents (modded RPG scale).
