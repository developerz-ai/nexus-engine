<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — AI-Assisted (`nexus-coder` Builds Mods)

> `nexus-coder` is a first-class mod author. `nexus coder mod-from-prompt "..."` end-to-end: scaffold, code, assets, scenarios, signing, multi-marketplace publish. Parallel subagents. Model routing per task. → `docs/specs/coder/workflows.md`.

## The Pitch

The same agent that builds engine systems builds mods. Same workflow file format. Same validation. Same test harness. Difference: the spec is a one-line prompt or a `mod-spec.toml`.

## Quick Start

```
nexus coder mod-from-prompt "Add a grappling hook to the FPS demo: shoot, retract, swing physics."
```

What happens (DAG below):

```
   prompt
     │
     ▼
  classify ──► route to mod-author template
     │
     ▼
  scaffold (nexus mod new --template gameplay-tweak)
     │
     ├──► author script (src/lib.rn)
     ├──► author scenarios (scenarios/*.toml)
     ├──► generate assets (parallel)
     │     ├── grapple-mesh: meshy / FLUX
     │     ├── retract-sfx:  scenario / kits
     │     └── icon:         FLUX
     ├──► author overlays
     └──► author locale strings
     │
     ▼
  validate ──► nexus mod verify + nexus mod test
     │
     ├──► fix-loop on fail (bounded 3 retries)
     │
     ▼
  package (nexus mod pack)
     │
     ▼
  sign (optional)
     │
     ▼
  publish (multi-marketplace, parallel)
     │
     ▼
  PR (if mod is in a git repo)
```

The orchestrator is `nexus-coder`'s `mod-from-prompt` workflow file.

## Workflow File

`.nexus/coder/workflows/mod-from-prompt.toml`:

```toml
name = "mod-from-prompt"
description = "Take a prompt, produce a packed + tested mod."
inputs = ["prompt", "game_id"]

[[task]]
id = "classify"
role = "coder"
model = "haiku"
prompt = "system/mod-classify.md"
tools = ["LookupBaseGame"]

[[task]]
id = "scaffold"
role = "coder"
depends_on = ["classify"]
model = "haiku"
tools = ["NexusMod::New"]

[[task]]
id = "manifest"
role = "coder"
depends_on = ["scaffold"]
model = "sonnet"
tools = ["EditManifest", "QueryAssetUuids"]

[[task]]
id = "script"
role = "coder"
depends_on = ["manifest"]
model = "sonnet"
tools = ["EditCrate", "QueryBaseGameSchema"]

[[task]]
id = "assets"
role = "asset-gen"
depends_on = ["manifest"]
parallel = true
tools = ["MeshyGenerate", "FluxGenerate", "KennyFetch"]

[[task]]
id = "overlays"
role = "coder"
depends_on = ["assets", "script"]
model = "sonnet"
tools = ["EditOverlays"]

[[task]]
id = "scenarios"
role = "coder"
depends_on = ["script"]
model = "sonnet"
tools = ["WriteScenario"]

[[task]]
id = "validate"
role = "reviewer"
depends_on = ["overlays", "scenarios"]
model = "opus"
tools = ["NexusModVerify", "NexusModTest"]

[[task]]
id = "fix-loop"
role = "coder"
depends_on = ["validate"]
model = "sonnet"
escalates_to = "opus"
max_retries = 3
tools = ["ReadError", "EditCrate", "NexusModTest"]

[[task]]
id = "pack"
role = "coder"
depends_on = ["validate"]
model = "haiku"
tools = ["NexusModPack"]

[[task]]
id = "sign"
role = "coder"
depends_on = ["pack"]
model = "haiku"
tools = ["NexusModSign"]

[[task]]
id = "publish"
role = "coder"
depends_on = ["sign"]
model = "haiku"
parallel = true
tools = ["NexusModPublish"]
```

## Model Routing (per task)

| Step | Model class | Why |
|---|---|---|
| `classify` | haiku | Cheap; one-shot classification |
| `scaffold` | haiku | Templated; deterministic |
| `manifest` | sonnet | Needs schema knowledge + UUID lookups |
| `script` | sonnet | Code generation with API surface |
| `assets` | provider-specific | Meshy / FLUX / Kenny APIs |
| `overlays` | sonnet | Connects assets to manifest |
| `scenarios` | sonnet | Test authoring requires understanding intent |
| `validate` | opus | Reviewer; higher reasoning |
| `fix-loop` | sonnet → opus on retry | Escalate when stuck |
| `pack` / `sign` / `publish` | haiku | Deterministic CLI wrap |

→ `docs/specs/coder/models.md` for the full routing policy.

## Subagent Recipe (Parallel)

Three subagents run concurrently in the asset-gen phase:

```
mod-author/asset-gen-mesh    ── Meshy API ── grapple_hook.glb
mod-author/asset-gen-sfx     ── Scenario API ── retract.ogg
mod-author/asset-gen-icon    ── FLUX local ── icon.png
```

Each subagent has its own isolated workdir; outputs sync at the `overlays` step.

## Capability-Aware Code Generation

When `nexus-coder` writes script, it reads the manifest's `[capabilities]` and only generates code that uses granted caps. If a generation needs a new cap, it:
1. Pauses.
2. Asks the user / orchestrator to expand the manifest.
3. Continues with the new cap.

Prevents `CAP_DENIED` at runtime by construction.

## Validation Loop

`validate` runs:
- `nexus mod verify` — layout, hash, sig, manifest schema.
- `nexus mod test` — all scenarios pass.
- `nexus mod profile` — within per-frame budget.

Fails route to `fix-loop`. Loop bounded; persistent failure escalates to the human.

## From `mod-spec.toml`

For deterministic generation (CI, reproducibility):

```toml
# mod-spec.toml
[mod]
id = "com.you.grapple-hook"
description = "Add a grappling hook with rope physics."
tier = "behavior"
target_game = "com.nexus.fps-demo"

[features]
- new_input_action = "fire_grapple"
- attaches_to = "any-static-surface"
- physics = "rope-constraint"
- visual = "rope-line + grapple-tip-mesh"
- audio = "shoot + retract + impact"

[constraints]
- per_frame_cpu_us_max = 200
- multiplayer_safe = true
- accessibility_compatible = true
```

Then:

```
nexus coder mod-from-spec mod-spec.toml
```

Same DAG; deterministic outputs.

## Curate-Then-Author Pattern

For larger mods, split:

```
nexus coder mod-design "RPG quest pack about a haunted lighthouse" --out design/
# design/ now has: design.md, quests/*.toml, characters/*.toml, scenes/*.toml
nexus coder mod-from-spec design/mod-spec.toml
```

`mod-design` produces the spec; `mod-from-spec` builds it. Authors review the spec between phases.

## Mod-Curator Subagent

Companion to mod-author: reviews mods authored by AI (or humans), audits requested caps vs needed caps, suggests reductions. → `[AGENT: 23]` flag below.

```
nexus coder mod-curator review path/to/some-mod.nxmod
```

Outputs: per-cap usage histogram, "this mod requests `WorldWrite<Inventory>` but only writes once at init; consider one-time grant pattern."

## Honesty About Limits

AI authoring works best for:
- Stat tweaks, balance overhauls.
- Simple new content (weapons, items).
- Asset overlays with prompted texture generation.
- Glue between existing systems (e.g., quest packs).

AI authoring still needs review for:
- Complex AI behavior trees.
- Multiplayer-correctness edge cases.
- Novel game mechanics not similar to anything in training.
- Performance-critical code paths.

Treat AI authoring like a junior contributor: fast, prolific, needs PR review.

## Cost

Per-mod cost varies wildly by complexity. Order-of-magnitude:
- Skin pack with AI textures: $0.50 - $5.
- Gameplay tweak (small): $1 - $10.
- New content (1 weapon + assets + tests): $5 - $30.
- Total conversion: $100 - $1000+ depending on scope.

`[BENCHMARK NEEDED]` — track via `nexus coder cost-report`.

## Cross-Links

- → `docs/specs/coder/workflows.md` — canonical workflow file format.
- → `docs/specs/coder/parallelism.md` — DAG mechanics.
- → `docs/specs/coder/models.md` — model routing.
- → `docs/specs/coder/tools.md` — tool definitions.
- → `docs/specs/mods/sdk.md` — what nexus-coder generates against.
- → `agent-recipes.md` — sister doc on agent-driven mod authoring.

## Open Questions

- `[DECISION NEEDED]` Default model class per step (opus for validate is expensive; could be sonnet on cheaper plans).
- `[DECISION NEEDED]` Asset-gen provider preference order (Meshy first vs Scenario first vs FLUX local).
- `[DECISION NEEDED]` Whether mod-author can autonomously publish to public marketplaces or always requires human gate.
- `[AGENT: 23]` Add `mod-author` and `mod-curator` subagents to `.claude/agents/`.
- `[AGENT: 18]` Confirm `nexus-coder` exposes `mod-from-prompt` and `mod-from-spec` workflows.
