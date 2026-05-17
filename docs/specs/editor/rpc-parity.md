<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — RPC Parity (Enforcement Spec)

> Every editor operation has a matching agent JSON-RPC method. CI gate enforces. No orphan buttons. No orphan methods (except explicitly headless-only). The editor is `agent_client_0` — same RPCs an AI agent would call.

## The principle

The editor is a fast human cursor over the AI's keyboard. Mouse for pointing; chat for describing; both routes hit the same RPC. No editor-only operations, ever.

→ `docs/architecture/01-principles.md#law-13`. → `docs/specs/editor/overview.md`. → `docs/specs/agent/api.md`.

## Boundaries

- **Owns:** the parity registry files (`editor_actions.toml`, `rpc_methods.toml`), the auditor (`scripts/check-rpc-parity`), the conformance test suite, error code allocation for parity failures.
- **Does NOT own:** what the actions or methods *do* — that lives in the system specs.
- **Cross-link:** → `docs/specs/agent/api.md`, → `docs/specs/agent/mcp-server.md`, → `docs/specs/editor/{overview,scene,assets,shader,debug,livereload}.md`, → `docs/architecture/01-principles.md#law-13`.

## Registries

Both registries are TOML, hand-checked, and machine-parsed. Lives at:

- `crates/nexus-editor/registry/editor_actions.toml`
- `crates/nexus-agent/registry/rpc_methods.toml`

### `editor_actions.toml`

```toml
schema = "nexus.editor.actions/v1"

[[action]]
id          = "entity.transform.translate"
panel       = "scene"
trigger     = ["gizmo.translate", "shortcut.W", "palette.translate"]
rpc         = "entity.transform.translate"
description = "Translate selected entity along an axis or freely."

[[action]]
id          = "asset.import"
panel       = "assets"
trigger     = ["toolbar.import", "drop.os_file", "palette.import"]
rpc         = "asset.import"
description = "Import an asset from an OS path."

[[action]]
id          = "debug.overlay.physics_wires"
panel       = "debug"
trigger     = ["toggle.overlays.physics_wires", "shortcut.F1"]
rpc         = "debug.overlay.set"
rpc_args    = { id = "physics_wires" }
description = "Toggle physics wireframe overlay."
```

Required keys: `id`, `panel`, `trigger[]`, `rpc`. Optional: `rpc_args` (partial bind), `description`.

### `rpc_methods.toml`

```toml
schema = "nexus.agent.methods/v1"

[[method]]
name           = "entity.transform.translate"
spec           = "docs/specs/agent/api.md#entity.transform.translate"
caps           = ["ECS_WRITE"]
surfaces       = ["editor", "headless"]

[[method]]
name           = "asset.import"
spec           = "docs/specs/agent/api.md#assets"
caps           = ["ASSETS_LOAD"]
surfaces       = ["editor", "headless"]

[[method]]
name           = "scenario.runBatch"
spec           = "docs/specs/agent/api.md#scenario"
caps           = ["SCENARIO_RUN"]
surfaces       = ["headless"]   # explicit: no editor button required
```

`surfaces` is the load-bearing field. Allowed values: `editor`, `headless`. Every method MUST list at least one. Methods that list `editor` MUST have a matching `editor_actions.toml` row whose `rpc` field equals the method `name`.

## The mapping convention

One-to-one names. Action id == RPC method name. Sub-namespacing uses dots.

| Action id | RPC method | Holds |
|---|---|---|
| `entity.spawn` | `entity.spawn` | ✓ |
| `scene.entity.reparent` | `scene.entity.reparent` | ✓ |
| `debug.overlay.set` | `debug.overlay.set` | ✓ |
| `editor.layout.save` | — | ✗ Edit-only state; the action MUST go through a wrapping RPC like `editor.preferences.save` exposed as headless too. |

When an action needs to deliver UI-only side effects (e.g. open a dock), wrap them: the RPC is the canonical operation; the dock-opening is a CLIENT-side effect listening to the response. The agent gets the same response.

## CI auditor

Binary: `scripts/check-rpc-parity`. Invoked by `scripts/check` and as a `nexus-merge` lint named `editor_rpc_parity`.

```
$ scripts/check-rpc-parity
ok      | editor_actions: 312 entries
ok      | rpc_methods:    347 entries (35 headless-only)
ok      | parity:         312 actions ↔ 312 methods
ok      | naming:         all 1:1
ok      | caps:           every action's RPC has caps declared
```

Failure exit codes:

| Code | Name | Meaning |
|---|---|---|
| 10 | `PARITY_ORPHAN_BUTTON` | Editor action references RPC that does not exist in `rpc_methods.toml`. |
| 11 | `PARITY_ORPHAN_RPC` | RPC declared with `surfaces = ["editor"]` but no `editor_actions.toml` entry references it. |
| 12 | `PARITY_NAME_MISMATCH` | Action id does not equal the RPC method name (when both are non-headless). |
| 13 | `PARITY_CAPS_MISSING` | Action's RPC has no caps declared. |
| 14 | `PARITY_SCHEMA_INVALID` | TOML parse error or schema-version mismatch. |
| 15 | `PARITY_HEADLESS_TAG_MISSING` | RPC neither has `editor` nor `headless` in `surfaces`. |
| 16 | `PARITY_DUPLICATE_ID` | Same `action.id` declared twice, or same `method.name` declared twice. |
| 17 | `PARITY_TRIGGER_EMPTY` | Action has zero triggers. |

Failure output is structured JSON when `--json` is set (consumed by `principle-keeper`):

```jsonc
{
  "ok": false,
  "errors": [
    {
      "code": "PARITY_ORPHAN_BUTTON",
      "action_id": "scene.entity.duplicate_special",
      "expected_rpc": "scene.entity.duplicate_special",
      "fix": "Add a method to rpc_methods.toml with name='scene.entity.duplicate_special' and surfaces=['editor','headless'], or remove the action."
    }
  ]
}
```

## Headless-only methods

Methods that have no UI equivalent are explicitly tagged `surfaces = ["headless"]`. The auditor treats them as exempt from the button requirement. Examples:

- `scenario.runBatch` — only meaningful from CLI/CI.
- `sim.setSpeed` with arguments > 10x — editor caps the UI at 10x but the RPC accepts up to 100x for CI.
- `snapshot.diff` — exposed in editor only via console; the diff RPC is the primary surface.

PRs adding a `headless` tag MUST justify in the PR body. `principle-keeper` checks.

## How a new feature is added

1. Spec the RPC in `docs/specs/agent/api.md` (or its sibling spec).
2. Add the method to `rpc_methods.toml` with caps + surfaces.
3. If `editor` is in surfaces: add the matching action to `editor_actions.toml` and wire a UI handler.
4. Open the PR. CI runs the auditor. PR blocked until both files agree.

## Failure modes & fix recipes

| Failure | Fix |
|---|---|
| Added button without RPC | Either add the RPC (preferred) or remove the button. |
| Added RPC, forgot button | Add the action row or change `surfaces` to `["headless"]` with a one-line justification. |
| Renamed RPC | Rename the action id in lockstep; bump the agent contract MINOR. |
| Cap added to RPC | Action automatically inherits — no editor change required; editor surfaces the cap-denied error to the user. |

## Test scenarios

`tests/editor_rpc_parity.rs`:

- `parity.audit_runs_clean` — registry as-shipped passes the auditor.
- `parity.every_action_invocable_via_rpc` — for each action, programmatically call its RPC with synthesized args; assert engine state delta matches the editor-side invocation of the same action with the same args (snapshot hash equality).
- `parity.headless_only_methods_have_no_button` — for every method tagged `headless`, grep editor source for the name in any UI handler; expect zero matches.
- `parity.duplicate_id_blocked` — synthetic registry with duplicate `action.id` → auditor exits with `PARITY_DUPLICATE_ID`.
- `parity.naming_drift_blocked` — synthetic registry with `action.id = "foo.bar"` mapped to `rpc = "foo.baz"` → auditor exits with `PARITY_NAME_MISMATCH`.
- `parity.snapshot_after_button` — record-and-replay test: human-driven action via UI; snapshot at frame N; same action via raw RPC; snapshot at frame N; hashes equal.

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| Auditor cold run, ~1k actions + ~1k methods | < 200 ms | 1 s | local dev iteration |
| Auditor in CI (every PR) | < 500 ms | 2 s | included in `scripts/check` |
| Registry hot reload during dev | < 50 ms | 200 ms | editor watches both files |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `PARITY_ORPHAN_BUTTON` | UI references missing RPC | add RPC or remove action |
| `PARITY_ORPHAN_RPC` | RPC marked `editor` but no UI | add action or change to `headless` |
| `PARITY_NAME_MISMATCH` | action id ≠ rpc method | align names |
| `PARITY_CAPS_MISSING` | RPC has no caps declared | declare per `docs/contracts/core-agent.md` |
| `PARITY_SCHEMA_INVALID` | bad TOML / wrong schema version | fix syntax |
| `PARITY_HEADLESS_TAG_MISSING` | method has empty `surfaces` | declare at least one |
| `PARITY_DUPLICATE_ID` | same id declared twice | dedup |
| `PARITY_TRIGGER_EMPTY` | action has no trigger | add at least one trigger |

All errors structured JSON per `docs/specs/agent/api.md` error envelope shape.

## Integration Points

| System | Interaction |
|---|---|
| `docs/specs/agent/api.md` | source of truth for RPC method names + schemas |
| `docs/specs/agent/mcp-server.md` | MCP tools mirror the RPC registry; parity audit feeds it |
| `docs/specs/editor/overview.md` | the principle this enforces |
| `docs/specs/editor/{scene,assets,shader,debug,livereload}.md` | each panel registers its actions here |
| `docs/contracts/core-agent.md` | cap declarations the auditor cross-checks |
| `docs/architecture/01-principles.md#law-13` | the law this spec exists to enforce |
| `scripts/check` | invokes the auditor in CI |

## Open Questions

- `[DECISION NEEDED]` Should action triggers be machine-validated (hotkey collision detection in the auditor)?
- `[DECISION NEEDED]` Should the editor source generate `editor_actions.toml` from `#[derive(EditorAction)]` macros, or stay hand-curated for review-friendliness?
- `[DECISION NEEDED]` Per-action telemetry — record every UI trigger as `editor.action.invoked` for replay parity?
- `[BENCHMARK NEEDED]` Auditor performance at projected v1.0 scale (~5k actions + ~5k methods).
- `[AGENT: 10]` Finalize the canonical RPC schema export format the auditor consumes.
- `[AGENT: 14]` Should `rpc_methods.toml` be auto-generated from `docs/contracts/core-agent.md`'s method table, or vice versa?
- `[AGENT: 23]` `editor-rpc-parity-auditor` subagent owns this spec + the auditor binary.
