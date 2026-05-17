<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Agent Recipes

> How `nexus-coder` and downstream subagents author and publish mods. Parallel asset gen + scenario testing + signing + multi-marketplace publish. Decision tables in JSON for deterministic routing.

## The Default Pipeline

For any "build me a mod" request:

```
classify ──► scaffold ──► (assets || script || scenarios) ──► validate ──► fix-loop ──► pack ──► sign ──► publish
```

Steps in `()` run in parallel. Full DAG in `docs/guides/mods/authoring/ai-assisted.md`.

## Subagent Fleet (for mods)

Two new subagents (`[AGENT: 23]` flagged):

| Subagent | Role |
|---|---|
| `mod-author` | End-to-end mod creation: scaffold → script → assets → scenarios → pack → publish |
| `mod-curator` | Review-only: audit caps requested vs used; flag suspicious patterns; suggest tightenings |

Existing fleet subagents reused:

| Subagent | Use in mod context |
|---|---|
| `scripting-engineer` | Heavy Rune script authoring |
| `rune-specialist` | VM-level questions, optimization |
| `mod-sandbox-specialist` | Cap design / consent flow |
| `asset-pipeline-engineer` | Asset overlay design |
| `ai-asset-gen-specialist` | Meshy / Scenario / FLUX prompting |
| `scenario-author` | Test scenario authoring |
| `test-author` | Property / fuzz tests for mods |
| `perf-engineer` | Per-mod profiling and budget tuning |
| `security-reviewer` | Cap audit, asset-overlay integrity, signing |
| `code-reviewer` | Pre-publish review |

`mod-author` dispatches the others in parallel per the DAG.

## Decision Tables (JSON for agents)

### Picking templates

```json
{
  "schema": "mod-template-routing-v1",
  "templates": [
    { "match": ["texture", "skin", "palette", "reskin", "look", "asset only"], "template": "skin-pack",        "tier": "skin" },
    { "match": ["stat", "balance", "tweak", "number", "rebalance"],          "template": "gameplay-tweak",   "tier": "behavior" },
    { "match": ["weapon", "item", "enemy", "creature", "spell", "ability"],   "template": "new-content",      "tier": "behavior" },
    { "match": ["quest", "story", "narrative", "dialogue", "lore"],           "template": "quest-pack",       "tier": "behavior" },
    { "match": ["npc behavior", "ai", "pathfinding", "tactics"],              "template": "ai-behavior",      "tier": "behavior" },
    { "match": ["movement", "parkour", "grappling", "vehicle", "swimming"],   "template": "genre-layer",      "tier": "behavior" },
    { "match": ["accessibility", "colorblind", "tts", "subtitle", "remap"],   "template": "accessibility",    "tier": "behavior" },
    { "match": ["total conversion", "different game", "replace", "tc"],       "template": "total-conversion", "tier": "total-conversion" },
    { "match": ["library", "shared", "framework", "api for mods"],            "template": "library",          "tier": "behavior" }
  ],
  "default": { "template": "gameplay-tweak", "tier": "behavior" }
}
```

Agent classifies the prompt, matches keywords, picks template + tier.

### Picking marketplaces

```json
{
  "schema": "mod-marketplace-routing-v1",
  "criteria": {
    "platform_steam_first": ["steam", "self-hosted"],
    "platform_cross":       ["mod-io", "self-hosted"],
    "platform_console":     ["mod-io"],
    "community_modpack":    ["curseforge", "self-hosted"],
    "community_pc_active":  ["thunderstore", "self-hosted"],
    "community_bethesda":   ["nexus-mods", "steam", "self-hosted"],
    "monetize_free":        ["thunderstore", "self-hosted", "nexus-mods", "steam", "mod-io"],
    "monetize_pwyw":        ["itch", "self-hosted"],
    "monetize_paid":        ["mod-io", "itch", "self-hosted"]
  },
  "default": ["self-hosted"]
}
```

Agent crosses platform + community + monetize axes to pick `--to <targets>` for `nexus mod publish`.

### Capability minimization heuristic

`mod-curator` walks AST + scenario telemetry to suggest cap reductions:

```json
{
  "schema": "mod-curator-rules-v1",
  "rules": [
    { "if": "world.write requested but no spawn/set in code", "suggest": "remove world.write" },
    { "if": "world.read includes C but no query::<C>",         "suggest": "narrow read list" },
    { "if": "events.emit allows '*' but only emits 1 name",    "suggest": "narrow emit list" },
    { "if": "persist requested but never read/written",        "suggest": "remove persist" },
    { "if": "audit shows 0 calls to a cap over 1000 frames",  "suggest": "consider removing" },
    { "if": "audit shows constant LIMIT_EXCEEDED on bridge_calls", "suggest": "raise [limits].bridge_calls or refactor" }
  ]
}
```

## End-To-End Recipe (worked example)

Prompt: "Add a grappling hook to the FPS demo. Shoot, retract, swing physics. Multiplayer-safe."

1. `mod-author` classifies → `genre-layer` template, `behavior` tier.
2. `mod-author` dispatches in parallel:
   - `scripting-engineer` writes `src/lib.rn` (grapple state, swing physics constraints).
   - `ai-asset-gen-specialist` generates: grapple mesh (Meshy), grapple sound (Scenario), reticle icon (FLUX).
   - `scenario-author` writes `scenarios/grapple_shoot.toml`, `scenarios/grapple_swing.toml`, `scenarios/grapple_break.toml`.
3. `mod-author` writes `mod.toml::[capabilities]` from the static analysis: `WorldRead<Input, Transform, Physics>`, `WorldWrite<GrappleState, RopeJoint>`, `events.emit = ["grapple.fired", "grapple.attached", "grapple.released"]`, `audio.oneshot = ["grapple_fire", "grapple_retract"]`.
4. `mod-author` writes overlays: reticle icon overlays the base FPS UI.
5. `code-reviewer` + `security-reviewer` review the diff in parallel.
6. `perf-engineer` runs `nexus mod profile` on the dev build; flags hot loop in swing physics; routes back to `scripting-engineer` for a one-pass fix.
7. `mod-author` runs `nexus mod pack --profile ship`.
8. `mod-author` signs.
9. `mod-author` publishes per matrix: target game is FPS demo on Steam → `--to steam --to self-hosted`.
10. `mod-author` outputs the publish report; PRs the source repo.

Total wall time (8 cores, modern net): minutes.

## CI Routing

For repos with `nexus-coder` integration:
- Tag `mod-v*` → trigger publish.
- PR to `main` → trigger pack + verify + test + perf check (no publish).
- Comment `/regenerate-assets` → run `ai-asset-gen-specialist` only.
- Comment `/curate` → run `mod-curator` audit, post review.

## Multiplayer Mod Validation Recipe

Before publishing a multiplayer-affecting mod:
1. `mod-author` flags the mod as `[multiplayer].sim_affecting = true`.
2. `test-author` writes `scenarios/mp_handshake.toml` (two-client mod-set negotiation).
3. `test-author` writes `scenarios/mp_divergence.toml` (asserts identical world snapshot frame-for-frame across clients).
4. `anticheat-specialist` reviews; suggests `[multiplayer].baseline_profile` if movement / damage profile shifts.
5. `merge-bot` blocks publish if any MP test fails.

## Cost Accounting

Per-task model cost reported by `nexus coder cost-report`. `mod-author` writes a `BUILD-COST.md` next to the mod listing per-mod budgets.

```json
{
  "schema": "mod-build-cost-v1",
  "mod_id": "com.example.grapple-hook",
  "version": "0.1.0",
  "totals_usd": 14.20,
  "by_subagent": {
    "scripting-engineer":  6.00,
    "ai-asset-gen":        4.20,
    "scenario-author":     1.50,
    "code-reviewer":       1.00,
    "security-reviewer":   0.80,
    "perf-engineer":       0.70
  }
}
```

`[BENCHMARK NEEDED]` — track over time.

## Parallelism Doctrine (mod-specific)

Per `docs/guides/parallelism-doctrine.md`:
- Default: dispatch N subagents whenever steps are independent.
- Asset gen → always parallel across asset kinds.
- Script + scenarios + assets: parallel after manifest.
- Multi-marketplace publish: parallel always.
- Validate / review: parallel reviewers OK; final gate sequential.

Engine ensures isolation per-subagent worktree to avoid file conflicts.

## Mod-Curator Workflow

```
nexus coder mod-curator review <mod.nxmod or repo>
```

1. Run `mod inspect`.
2. Static-analyze for cap reach.
3. Run scenarios; collect audit log.
4. Compare requested caps to actually-used caps.
5. Emit JSON report + Markdown summary.
6. Post review comment on PR or open issue if standalone.

Sample report fragment:

```json
{
  "mod_id": "com.example.healing-pack",
  "version": "1.0.1",
  "findings": [
    { "severity": "info",    "rule": "narrow read",  "detail": "world.read = ['Health', 'Transform', 'Inventory']; never read Inventory in 1000-frame sample.", "suggest": "drop Inventory" },
    { "severity": "warn",    "rule": "limit risk",   "detail": "events.emit hit LIMIT_EXCEEDED 4 times under stress test.", "suggest": "raise [limits].events_emitted or coalesce" },
    { "severity": "ok",      "rule": "signature",    "detail": "signed by did:key:z6Mk...; key trusted via marketplace." }
  ]
}
```

## Cross-Links

- → `docs/guides/mods/authoring/ai-assisted.md` — primary AI-author guide.
- → `docs/specs/coder/workflows.md` — workflow file format.
- → `docs/specs/coder/parallelism.md` — DAG mechanics.
- → `docs/guides/mods/integrations-matrix.md`
- → `docs/guides/mods/marketplaces/decision-matrix.md`
- → `docs/specs/mods/sdk.md`
- → `docs/guides/parallelism-doctrine.md`

## Open Questions

- `[AGENT: 23]` Author the `mod-author` and `mod-curator` subagent files in `.claude/agents/`.
- `[AGENT: 18]` Confirm `nexus-coder` workflows `mod-from-prompt` / `mod-from-spec` shipped.
- `[DECISION NEEDED]` Whether `mod-curator` runs automatically on every PR to mod repos in the org, or opt-in.
- `[DECISION NEEDED]` Default model class per subagent for mod work (cost vs quality).
