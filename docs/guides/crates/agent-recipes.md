<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Agent Recipes

> How `nexus-coder` finds, evaluates, installs, and authors community crates. The crate ecosystem is a first-class peer of the engine and the game-template; the agent treats all three the same way.

→ `nexus-coder` architecture: `docs/specs/coder/architecture.md`.
→ Tool catalog: `docs/specs/coder/tools.md`.
→ Discovery + index API: `docs/specs/crates/discovery.md`.

## Tools you call

These are the existing nexus-coder tools from `docs/specs/coder/tools.md` that the recipes below compose. **No new tools are introduced here — recipes call only the existing closed set.**

| Tool | Use in recipes |
|---|---|
| `ReadSpec` | Read a crate's `[package.metadata.nexus]` block, `tests/scenarios/*.toml`, MIGRATIONS |
| `ListSpecs` / `ListContracts` | Discover what categories / traits exist in the engine |
| `GrepCodebase` | Search the local repo for existing usage patterns |
| `ReadFile` | Read `Cargo.toml`, `Nexus.toml`, `Cargo.lock` |
| `EditCrate` | Apply edits to `Cargo.toml`, `Nexus.toml`, source files |
| `RunHeadlessScenario` | Smoke-test a candidate crate against the project |
| `BenchPerfContract` | Validate a crate's perf claim against its spec |
| `ValidateAgainstSpec` | Confirm crate impl matches its declared `implements` traits |
| `OpenPR` | Propose the consume/upgrade as a PR |
| `WriteSpec` | Author role only — author a new crate's spec when scaffolding |

For external HTTP (index queries), use whatever fetcher is allowed in the agent's sandbox (`[AGENT: 18]` to confirm; recipes assume a sandbox-approved HTTP allow-list for `index.nexus-engine.dev` and `crates.io`).

## Recipe 1 — Discover a crate for a stated need

Triggered when the user (or an orchestrator) says "I need X" where X is a category-fittable need.

```
Input:  { need: "real-time multiplayer", category_hint?: "net", constraints: { engine: "1.2", license: ["MIT", "Apache-2.0"] } }
Output: { candidates: [Candidate], reasoning: string }
```

Algorithm:

```
1. List categories                           ← ReadSpec(docs/specs/crates/categories.md)
2. Choose category                           ← LLM step; emits category_key
3. Query index                               ← GET /v1/search?category=<key>&engine=^1.2&license=MIT,Apache-2.0
4. Filter
   - tier ≠ quarantine
   - engine_versions matches
   - mods_compat aligns with Nexus.toml [mods].enabled
   - headless_safe = true if CI is headless
   - incompatible_with does not collide with installed deps
5. Rank by health.score (downloads + audit + scenario pass rate)
6. Return top N as candidates
```

JSON decision shape:

```json
{
  "category": "net",
  "candidates": [
    {
      "name": "nexus-net-quic",
      "version": "1.0.2",
      "tier": "verified",
      "score": 0.97,
      "reason": "Day-one curated; matches genre fps; deterministic; mods-compat"
    },
    {
      "name": "nexus-net-webtransport",
      "version": "0.4.1",
      "tier": "verified",
      "score": 0.81,
      "reason": "WebGPU + web-deploy path; deterministic; mods-compat; fewer downloads"
    }
  ],
  "recommendation": "nexus-net-quic",
  "rationale": "Higher download trend, longer audit history, identical engine compat."
}
```

## Recipe 2 — Evaluate a candidate before installing

Don't just `nexus add` and hope. Evaluate first.

```
1. Pull crate metadata                       ← GET /v1/crate/<name>/<version>
2. Read manifest                             ← ReadFile via cargo download or git clone
3. ValidateAgainstSpec                       ← spec=crate's docs/STYLE.md (if present); confirm implements claim
4. Spin up sandboxed worktree                ← orchestrator-managed
5. Apply: `nexus add <name> --dry-run`       ← reports compat
6. Run the crate's own scenarios             ← RunHeadlessScenario for each in tests/scenarios/*.toml
7. Run the user's existing scenario suite    ← regression smoke
8. Score
   - all scenarios pass: +0.5
   - perf within hard limits: +0.2
   - tier=verified: +0.2
   - no unsafe additions: +0.1
9. Decide
   - score ≥ 0.8: install
   - 0.5 ≤ score < 0.8: install with confirmation
   - score < 0.5: reject; suggest alternative
```

JSON decision table:

```json
{
  "candidate": "nexus-net-quic",
  "evaluation": {
    "compat": "ok",
    "scenarios_run": 6,
    "scenarios_passed": 6,
    "perf_within_limits": true,
    "unsafe_delta": 0,
    "tier": "verified"
  },
  "score": 0.98,
  "decision": "install"
}
```

## Recipe 3 — Install a chosen crate

```
1. EditCrate                                 ← nexus add <name> (or manual Cargo.toml + Nexus.toml edit)
2. Cargo fetch + lockfile update
3. Run project test suite headless           ← RunHeadlessScenario over project scenarios
4. ValidateAgainstSpec                       ← confirm no spec drift from the addition
5. Emit JSON change report
6. OpenPR (when authorized)                  ← PR title cites the crate + tier
```

PR template (when the agent opens):

```markdown
## Add `nexus-net-quic` for multiplayer

| Field | Value |
|---|---|
| Crate | [nexus-net-quic 1.0.2](https://crates.io/crates/nexus-net-quic) |
| Tier | ✓ verified |
| Category | net |
| License | MIT |
| Engine compat | >=1.0, <2.0 |

### Why
Need: "real-time multiplayer". Day-one curated. Highest score per agent-recipes.md Recipe 1.

### Changes
- `Cargo.toml`: + `nexus-net-quic = "1.0"`
- `Nexus.toml`: `[networking]` block populated.
- Lockfile: +6 packages, 0 removed, 0 bumped.

### Tests
- Project scenarios: 142/142 pass.
- Crate's scenarios: 6/6 pass.
- Perf: within declared hard limits.

### Audit
- Last audit: 2026-04-10 by council:3. Verdict: verified (score 0.94).
- SBOM: https://nexus-hub.dev/sbom/nexus-net-quic/1.0.2.cdx.json

Spec ref: docs/specs/crates/overview.md
```

## Recipe 4 — Author a new crate

Triggered when no candidate scores ≥ 0.5 in Recipe 2, OR when the user explicitly requests "write a crate that does X".

```
1. WriteSpec                                 ← scaffold docs/STYLE.md for the new crate (role=architect)
2. Shell out to `nexus crate new <name> --category <key>`     [via orchestrator]
3. EditCrate                                 ← implement the trait
   - read trait spec via ReadSpec
   - implement minimum-viable methods
   - keep unsafe count at 0
4. EditCrate                                 ← write tests
   - unit per public fn
   - at least one scenario in tests/scenarios/
   - perf bench if claim made
5. RunHeadlessScenario                       ← confirm green
6. ValidateAgainstSpec                       ← compare impl ↔ spec
7. EditCrate                                 ← fill [package.metadata.nexus] block per manifest.md
8. Shell: `nexus crate publish --dry-run`    [via orchestrator]
9. OpenPR                                    ← against author's own repo for human review
10. Out-of-band: orchestrator may invoke `nexus crate publish` once human approves
```

## Recipe 5 — Migrate a crate across engine majors

Triggered when `nexus crate health <name>` reports `ok-via-shim` or when a CI run against the next major fails.

```
1. ReadSpec                                  ← docs/guides/crates/migrating.md
2. ReadFile                                  ← MIGRATIONS/<from>-to-<to>.md from engine
3. Plan
   - list deprecated symbols used (parse cargo check warnings)
   - map each via the engine MIGRATIONS guide
4. EditCrate                                 ← rewrite per migration; one symbol per commit
5. RunHeadlessScenario                       ← per migration commit
6. EditCrate                                 ← widen engine_versions in [package.metadata.nexus]
7. EditCrate                                 ← author crate's own MIGRATIONS/<from>-to-<to>.md
8. ValidateAgainstSpec
9. OpenPR
```

## Recipe 6 — Audit a community crate (curator role)

The `crate-curator` subagent's standard flow. Distinct from authoring/consuming.

```
1. Fetch source                              ← cargo download or git clone (sandboxed worktree)
2. Run the 15-step playbook                  ← docs/specs/crates/quality-bar.md
   - automated steps: shell out to cargo-deny, cargo-audit, cargo-vet, ...
   - manual steps: ReadFile + LLM review for unsafe, API design, naming
3. Emit audit JSON                           ← per quality-bar.md schema
4. Decide tier
   - verified: all checks pass
   - community: minor checks fail
   - quarantine: critical (license, supply-chain, CoC)
5. (Council members) attest                  ← POST /v1/attest with Council key
6. OpenPR against awesome-nexus              ← if promoted to Verified
```

## Anti-patterns (don't do these)

| Anti-pattern | Why |
|---|---|
| `nexus add <crate>` without evaluation | Trust without verification |
| Skip running the crate's own scenarios | Misses authoring bugs |
| Score a Community crate above Verified because of trivia | Tier exists for a reason; weight it |
| Add multiple genres in one PR | Hard to review; split |
| Author a crate when a Verified one fits | Inflates ecosystem noise |
| Fork instead of file-issue when upstream has a bug | Wastes everyone's time |
| Use `--force-compat` without explanation | Breaks reproducibility; document if necessary |
| Add a `nexus-community-*` crate to a Verified-tier consumer | Violates trust transitivity; either get crate Verified or stay Community |

## Performance Contract

| Recipe | Target | Hard limit |
|---|---|---|
| Recipe 1 (discover) | < 5 s | 30 s |
| Recipe 2 (evaluate, single candidate) | < 60 s | 5 min |
| Recipe 3 (install + smoke) | < 2 min | 10 min |
| Recipe 4 (author MVP) | < 10 min | 30 min |
| Recipe 5 (migrate per symbol) | < 30 s | 2 min |
| Recipe 6 (audit one crate) | < 5 min | 30 min |

`[BENCHMARK NEEDED]` once nexus-coder workflows measured end-to-end.

## Cross-references

- → `docs/specs/coder/tools.md` — the closed tool set.
- → `docs/specs/coder/workflows.md` — generic workflow patterns this composes.
- → `docs/specs/crates/discovery.md` — index API.
- → `docs/specs/crates/quality-bar.md` — Recipe 6 playbook source.
- → `docs/guides/crates/publishing.md` — Recipe 4 author flow.
- → `docs/guides/crates/consuming.md` — Recipe 3 consumer flow.

## Open Questions

- `[DECISION NEEDED]` Should agent recipes be code (TypeScript per Vercel AI SDK) or stay as documented prompts? Default: code, generated from these recipes by `crate-author` / `crate-consumer-advisor` subagents.
- `[DECISION NEEDED]` Whether to expose an MCP tool `nexus.crates.search` for foreign agents (Claude Code, Cursor). Default: yes, by v1.1 (mirrors the broader MCP decision in `docs/specs/coder/tools.md`).
- `[AGENT: 18]` Confirm HTTP fetcher allow-list includes `index.nexus-engine.dev`, `crates.io`, `docs.rs`.
