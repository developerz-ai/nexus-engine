<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Merge Policy — No Engine-Source Modification Without Rationale

> A PR that touches engine-core source for a feature expressible as an extension is auto-rejected. Bot comment redirects to the migration cookbook + the right extension surface. Authored by `principle-keeper`. Enforced by `nexus-merge`.
>
> Manifesto: `docs/architecture/07-extend-dont-fork.md`. Cookbook: `docs/guides/extend-not-fork-cookbook.md`. Proposed Law 14: `docs/architecture/proposed-law-14.md`.

---

## The rule

A pull request that:

1. Modifies any file under `crates/nexus-{core,renderer,physics,audio,networking,scripting,assets,agent,editor}/src/**` AND
2. Does NOT link to an approved RFC/ADR (`docs/architecture/05-adr/NNNN-*.md` with Status: Accepted)

is **auto-rejected** by `nexus-merge` with a structured rejection payload (below) before any other reviewer sees it.

Auto-rejection is a **soft block**: PR remains open, bot comments, label `policy:needs-adr` applied, CI is skipped. The contributor follows the appeal path or rewrites the PR as an extension.

---

## Whitelist exceptions

The rule does NOT trigger when the PR matches one of:

| Exception | Detection |
|---|---|
| Bug fix | PR title prefix `fix:` AND links to an issue with label `bug` AND diff does not add new public API |
| Performance fix | PR title prefix `perf:` AND attaches a benchmark before/after AND diff does not change public API |
| Docstring / comment update | Diff is 100% within doc-comments (`///`, `//!`) and code comments (`//`, `/* */`) |
| Dependency bump | Diff is limited to `Cargo.toml` + `Cargo.lock` AND no `src/**` file changed |
| Test-only change | Diff is 100% within `tests/**` or `#[cfg(test)]` blocks |
| Spec-prep refactor | PR title prefix `refactor:` AND linked ADR is in `Status: Proposed` (allowed to land prep work; the actual feature waits for ADR acceptance) |
| Compat-shim update | Diff is limited to `crates/nexus-engine-compat-*/` |

Exception detection is mechanical (lints + file-path globs + title regex). If a PR satisfies more than one filter, the most permissive applies.

---

## The bot comment template

### JSON payload (machine-parseable)

The bot posts this as the first block in its comment. `nexus-coder` and downstream automation parse it.

```json
{
  "schema": "nexus-merge-policy/no-engine-source-mod-without-rationale/v1",
  "decision": "rejected",
  "rule": "no-engine-source-mod-without-rationale",
  "pr": { "number": 1234, "repo": "sebyx07/nexus-engine", "sha": "abc123" },
  "violations": [
    {
      "path": "crates/nexus-renderer/src/gi.rs",
      "change_type": "addition",
      "summary": "adds new public function `bake_lightprobes`",
      "expressible_as": "render-pass-plugin",
      "cookbook_section": "1",
      "cookbook_url": "docs/guides/extend-not-fork-cookbook.md#1-i-need-a-custom-rendering-technique-eg-my-own-gi",
      "suggested_crate_name": "nexus-renderer-customgi",
      "suggested_trait": "RenderPass",
      "suggested_spec": "docs/specs/renderer/gi.md"
    }
  ],
  "exceptions_considered": ["fix", "perf", "docstring", "deps", "test-only", "spec-prep", "compat-shim"],
  "exception_matched": null,
  "appeal_path": {
    "open_adr": "docs/guides/adr-format.md",
    "subagent": "principle-keeper",
    "council_review_url": "docs/guides/integration-team.md"
  },
  "label_applied": "policy:needs-adr",
  "ci_skipped": true,
  "next_actions": [
    "Read the cookbook entry linked above.",
    "Rewrite this PR as a community crate implementing the suggested trait.",
    "OR open an ADR proposing the trait extension you actually need.",
    "OR appeal: mention @principle-keeper in a comment with the rationale."
  ]
}
```

### Human-readable markdown

The bot's comment continues:

```markdown
## Policy: Extend, Don't Fork

This PR modifies engine-core source. Nexus is closed for source modification, open for extension (`docs/architecture/07-extend-dont-fork.md`).

The change at **crates/nexus-renderer/src/gi.rs** is expressible as a **`RenderPass` plugin** in a community crate.

**Cookbook recipe:** [§1 — I need a custom rendering technique](../guides/extend-not-fork-cookbook.md#1-i-need-a-custom-rendering-technique-eg-my-own-gi)
**Suggested crate name:** `nexus-renderer-customgi`
**Trait to implement:** `RenderPass`
**Spec:** `docs/specs/renderer/gi.md`

### What to do

1. **Recommended.** Close this PR. Run `nexus crate new nexus-renderer-customgi --category style`. Implement `RenderPass`. Publish.
2. **If the trait can't express your change.** Open an ADR proposing the extension surface you need. Link the ADR here; the bot will re-evaluate.
3. **If you believe this rejection is wrong.** Comment `@principle-keeper review` — the subagent re-evaluates and either lifts the block or escalates to the architect council.

### Status

- Label applied: `policy:needs-adr`
- CI skipped until policy is satisfied
- This PR stays open; no force-close

---

*Posted by `nexus-merge` per `docs/specs/merge-policy/no-engine-source-mod-without-rationale.md`.*
```

The JSON block always precedes the markdown. Automation parses the JSON; humans read the markdown.

---

## File-path globs (the trigger)

| Glob | Reason it's protected |
|---|---|
| `crates/nexus-core/src/**` | Substrate — extensions cannot reach into the substrate |
| `crates/nexus-renderer/src/**` | Render pipeline — use `RenderPass` plugins |
| `crates/nexus-physics/src/**` | Physics core — use `PhysicsBackend` |
| `crates/nexus-audio/src/**` | Audio core — use `AudioBackend` / `DspPack` |
| `crates/nexus-networking/src/**` | Net stack — use `NetTransport` |
| `crates/nexus-scripting/src/**` | VM glue — use `ScriptVm` |
| `crates/nexus-assets/src/**` | Pipeline — use `AssetSource` / `AssetImporter` |
| `crates/nexus-agent/src/**` | Agent RPC — wire-stable, requires ADR for any addition |
| `crates/nexus-editor/src/**` | Editor core — use editor extensions |

Engine-shipped extension crates (`crates/styles/`, `crates/genres/`, `crates/nexus-engine-compat-*/`) are NOT in the trigger set. They are themselves extensions to the core.

---

## Trait-suggestion heuristic

The bot inspects the diff and maps the change to a suggested trait:

| Diff signal | Suggested trait | Cookbook § |
|---|---|---|
| New `pub fn` in `renderer/src/<pass>.rs` | `RenderPass` | 1 |
| New `pub fn` in `networking/src/transport*.rs` | `NetTransport` | 2 |
| New `pub fn` in `physics/src/<integrator>.rs` | `PhysicsBackend` | 3 |
| New `pub fn` in `assets/src/import*.rs` | `AssetImporter` / `AssetSource` | 4 |
| New ECS component / system in `core/src/` | (Define in your game crate; reject) | 5 |
| New platform-specific code in `core/src/hal/` | `PlatformBackend` | 6 |
| New scripting VM glue in `scripting/src/` | `ScriptVm` | 12 |
| New telemetry emitter in `agent/src/telemetry/` | `TelemetrySink` | 13 |
| New editor panel / inspector in `editor/src/` | Editor extension | 14 |
| Branding strings (string literals matching brand keys) | `Nexus.toml [branding]` | 10 |
| Doesn't match any heuristic | (cookbook §"Not in the table", suggest ADR) | n/a |

Heuristic is best-effort. The contributor can correct it in the appeal.

---

## Appeal path

1. Contributor comments `@principle-keeper review` with rationale.
2. `principle-keeper` subagent re-reads the PR diff + the cookbook + the manifesto. Outputs one of:
   - **Lift block.** Rare. Reason: bot misclassified; PR is a legitimate exception. Label `policy:needs-adr` removed, CI re-enabled.
   - **Confirm + suggest cookbook entry.** Default. The subagent picks the cookbook row and links it explicitly.
   - **Escalate to architect council.** Triggered when the contributor argues for a new extension surface. Council opens an ADR slot.
3. If escalated, the PR is parked. The ADR runs through `docs/guides/adr-format.md`. On ADR acceptance, the PR can be reworked or merged.

Council ratification mechanism: → `docs/guides/integration-team.md`.

---

## Bot implementation hooks

The merge bot reads:

| Input | Purpose |
|---|---|
| PR diff (paths + content) | trigger detection + exception detection + trait-suggestion |
| PR title | `fix:` / `perf:` / `refactor:` exception detection |
| PR labels | manual override `policy:exempt-ratified` (set only by `principle-keeper`) |
| Linked ADRs | check `Status: Accepted` block in linked file |
| `docs/guides/extend-not-fork-cookbook.md` | source of cookbook URLs for the suggestion payload |
| `docs/specs/crates/categories.md` | source of trait names |

The bot writes:

| Output | Where |
|---|---|
| Rejection JSON + markdown comment | PR comment thread (top-level) |
| Label `policy:needs-adr` | PR labels |
| CI skip marker | Per `docs/guides/merge-system.md` CI gate |
| Structured rejection event | Telemetry per Law 11; consumable by `nexus-coder` and dashboards |

Implementation lives in `nexus-merge` (Agent 16). Bot source: `docs/guides/merge-system.md` for hooks, this spec for the rule.

---

## Telemetry & metrics

Every rejection emits a `merge.policy.rejected` event with the JSON payload above. Dashboards track:

- Rejection rate per week (target: trending down as community internalises the rule).
- Most-frequent trigger path (signal: a particular crate's extension surface is under-served; file a spec issue).
- Appeal outcomes (lift / confirm / escalate counts).
- ADRs opened from appeals (intended outcome: legitimate gaps become trait extensions).

→ `docs/specs/agent/telemetry.md` for sink wiring; `docs/guides/liveops/` for dashboard ownership.

---

## What this rule does NOT cover

| Out of scope | Where it lives |
|---|---|
| Style-only nits | `docs/guides/style-guide.md` |
| License-header check | Law 7 enforcer (`file_has_spdx_header`) |
| Test coverage check | Law 12 enforcer (`cargo llvm-cov` gate) |
| Performance regression check | Law 5 enforcer (bench gate) |
| Cross-genre dependency rejection | `feature_gate_required_for_cross_genre_dep` in `docs/architecture/06-modularity.md` |
| Mod / runtime sandboxing | `docs/specs/scripting/sandbox.md` |

This spec is a single, focused gate: **don't modify engine-core source for a feature that has an extension surface.**

---

## Cross-references

- → `docs/architecture/07-extend-dont-fork.md` — manifesto.
- → `docs/architecture/proposed-law-14.md` — proposed law ratifying this gate.
- → `docs/guides/extend-not-fork-cookbook.md` — the recipe set the bot suggests from.
- → `docs/guides/merge-system.md` — Agent 16's merge bot architecture.
- → `docs/guides/pr-protocol.md` — PR workflow (where this gate fits).
- → `docs/guides/adr-format.md` — appeal path template.
- → `docs/guides/integration-team.md` — council ratification.
- → `docs/guides/subagent-fleet.md` — `principle-keeper`, `crate-author`, `mod-author`, `plugin-author`.
- → `docs/specs/crates/categories.md` — trait suggestions sourced from here.
- → `docs/specs/crates/stable-api.md` — trait additions per semver discipline.
- → `docs/architecture/01-principles.md` — Law 3 (boundaries), Law 14 once ratified.

## Open questions

- `[DECISION NEEDED]` Should the bot rejection auto-close after 30 days of no contributor response, or stay open forever? Default proposal: stay open; contributors come back.
- `[DECISION NEEDED]` Whether to also gate `crates/nexus-cli/src/**`. Default proposal: NO — CLI is a tool, not engine surface; ordinary review applies.
- `[VERIFY]` Glob list above against the final workspace layout in `docs/architecture/04-workspace-layout.md`.

## Mastermind routing note

Mastermind routes any PR matching the trigger glob to `principle-keeper` BEFORE any other subagent. `principle-keeper` posts the bot comment; other reviewers see the policy block first.
