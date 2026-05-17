<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Consuming Guide

> `nexus add nexus-style-anime` and you're done. The CLI resolves the manifest, checks engine compat, writes `Cargo.toml` + `Nexus.toml`, runs the scenario tests against the new crate, reports JSON.

→ Pipeline spec: `docs/specs/crates/release-pipeline.md`.
→ `nexus add` CLI: `docs/game-template/cli.md` § `nexus add`.
→ `Nexus.toml` consumer-side: `docs/game-template/nexus-toml.md`.

## TL;DR

```
nexus add nexus-style-anime           # add a crate
nexus add --search "anime style"      # discover first
nexus add nexus-physics-jolt-bridge nexus-net-webtransport  # add multiple
```

## What `nexus add` does

For each crate:

```
1. resolve
   ├── fetch metadata from index.nexus-engine.dev (or crates.io fallback)
   ├── select latest version satisfying [engine.version] in Nexus.toml
   └── refuse on tier=quarantine without --accept-risk
2. compat check
   ├── verify [package.metadata.nexus].engine_versions includes engine version
   ├── verify category fits a [crates] / [plugins] slot in Nexus.toml
   ├── verify license is in your project's policy
   └── flag incompatible_with conflicts
3. mutate Cargo.toml
   └── add the dep with version pin from latest
4. mutate Nexus.toml
   └── add to [crates] or [plugins] section (per docs/game-template/nexus-toml.md)
5. fetch
   └── cargo fetch (lockfile updated)
6. smoke
   └── nexus crate test --scenarios --crate <name>   (the crate's own scenarios)
7. report
   └── JSON to stdout
```

Output:

```json
{
  "ok": true,
  "added": [
    { "name": "nexus-style-anime", "version": "0.3.1", "tier": "verified", "category": "style" }
  ],
  "cargo_toml_changed": true,
  "nexus_toml_changed": true,
  "lockfile_delta": { "added": 4, "removed": 0, "bumped": 0 },
  "smoke": { "scenarios_run": 1, "passed": 1, "failed": 0 }
}
```

## Discovering crates

```
nexus add --search "anime style"
```

Queries `index.nexus-engine.dev` with `category=style` + free-text + your engine version. Returns ranked list.

```
nexus add --search "physics" --category=physics --tier=verified
nexus add --search --json --category=telemetry-sink
```

Underlying API: `GET /v1/search?...` → see `docs/specs/crates/discovery.md`.

## Compat outcomes

| Outcome | What `nexus add` does |
|---|---|
| Verified + engine compat + license ok | Add silently |
| Community + compat + license ok | Add with banner: "Community tier (no audit)" |
| Quarantine | Refuse; require `--accept-risk` and a reason |
| `engine_versions` excludes your engine | Refuse; suggest `--force-compat` (warned) or older version |
| License not in your project policy | Refuse; suggest license-bundle review |
| `incompatible_with` matches an existing dep | Refuse; suggest removing the conflict first |
| `mods_compat = false` and your project enables mods | Warn; require confirmation |
| `headless_safe = false` and your CI runs headless | Warn; require confirmation |

## Pinning vs caret

`nexus add` writes a caret-prefixed pin by default:

```toml
[dependencies]
nexus-style-anime = "0.3"           # ^0.3, accepts 0.3.x
```

Override:

```
nexus add nexus-style-anime --exact     # writes = "0.3.1"
nexus add nexus-style-anime --version="0.2"
```

For `Verified` consumers shipping releases, `--exact` is recommended (matches engine policy → `docs/guides/coding-style/dependencies.md`).

## Multiple crates at once

```
nexus add nexus-physics-jolt-bridge nexus-net-webtransport nexus-telemetry-sink-honeycomb
```

Resolves all jointly: if two crates carry conflicting `incompatible_with`, the whole add aborts.

## Removing crates

```
nexus remove nexus-style-anime
```

Mutates `Cargo.toml` + `Nexus.toml`. Runs `cargo update -p nexus-style-anime --precise=removed` to prune the lockfile. → `docs/game-template/cli.md` (Agent 15 to add `remove` if not present).

## Upgrading crates

```
nexus upgrade                                      # all crates
nexus upgrade nexus-style-anime                    # one crate
nexus upgrade nexus-style-anime --to=0.4.0         # explicit target
nexus upgrade --check                              # dry-run, JSON report only
```

Behavior:
- Bumps within the current engine compat range automatically.
- Cross-major bumps require `--to=<version>` or `--major`.
- Re-runs scenario smoke; refuses on regression unless `--accept-regression`.

## Troubleshooting matrix

| Error | Likely cause | Fix |
|---|---|---|
| `E_CRATE_NOT_FOUND` | Typo or unpublished | Check `nexus add --search` |
| `E_CRATE_INCOMPAT_ENGINE` | `engine_versions` excludes your version | Pick older version or upgrade engine |
| `E_CRATE_INCOMPAT_LICENSE` | License not in policy | Use `--accept-license <SPDX>` or pick alternative |
| `E_CRATE_QUARANTINE` | Crate flagged | Read reason; `--accept-risk` only if you've reviewed |
| `E_CRATE_CONFLICT` | `incompatible_with` collision | Remove the conflict first |
| `E_CRATE_LOCK_DIVERGENCE` | Lockfile mismatch | `cargo update`; commit lockfile |
| `E_CRATE_SMOKE_FAIL` | Crate's own scenario fails on your engine | Open issue against crate; consider older version |
| `E_NXTOML_PARSE` | Manifest invalid | `nexus lint --manifest` |
| Crate works locally, fails in CI | CI uses different engine version | Add explicit `[engine].version` pin in `Nexus.toml` |

## Worked example — adding a telemetry sink

```
$ nexus add nexus-telemetry-sink-honeycomb --json
```

```json
{
  "ok": true,
  "added": [
    {
      "name": "nexus-telemetry-sink-honeycomb",
      "version": "1.2.0",
      "tier": "verified",
      "category": "telemetry-sink",
      "implements": ["TelemetrySink"],
      "license": "MIT",
      "headless_safe": true,
      "mods_compat": false
    }
  ],
  "cargo_toml_changed": true,
  "nexus_toml_changed": true,
  "nexus_toml_diff": "[telemetry]\nsinks = [\"stdout-json\", \"otlp\", \"honeycomb\"]\n[telemetry.honeycomb]\napi_key_env = \"HONEYCOMB_API_KEY\"\ndataset = \"mygame\"\n",
  "lockfile_delta": { "added": 6, "removed": 0, "bumped": 0 },
  "smoke": { "scenarios_run": 1, "passed": 1, "failed": 0 },
  "next_steps": [
    "Set HONEYCOMB_API_KEY in your environment.",
    "Run `nexus run --headless --frames=600` to verify telemetry flow."
  ]
}
```

Note the `next_steps` field: human-readable hints emitted alongside structured output. Law 1 satisfied.

## Worked example — adding a genre

```
nexus add nexus-genre-spaceflight
```

Adds to `Cargo.toml` AND to `Nexus.toml::[genres].secondary` (if not already primary). Scaffolds default `tests/scenarios/spaceflight-smoke.toml` if absent. Runs the smoke; reports JSON.

## When to consume vs author

| Need | Path |
|---|---|
| Common need, multiple crates exist | Consume the best-fit Verified one |
| Common need, only Community crates exist | Consume the one most-maintained; consider auditing it yourself |
| Niche need, no crate exists | Author one (`nexus crate new`); contribute back |
| You need internals not in the public API | File an issue against the upstream crate first; only fork if upstream refuses |

→ Decision flow for `nexus-coder`: `docs/guides/crates/agent-recipes.md`.

## Cross-references

- → `docs/specs/crates/discovery.md` — the index `nexus add` queries.
- → `docs/specs/crates/quality-bar.md` — tier definitions.
- → `docs/specs/crates/licensing.md` — license filter.
- → `docs/game-template/cli.md` — `nexus add` CLI.
- → `docs/game-template/nexus-toml.md` — `[crates]` / `[plugins]` sections.
- → `docs/guides/crates/agent-recipes.md` — `nexus-coder` discovery + evaluation.

## Open Questions

- `[DECISION NEEDED]` Whether `nexus add` should auto-PR against `awesome-nexus` to upvote crates the user keeps. Default: no.
- `[DECISION NEEDED]` Should `nexus add` warn when adding a `nexus-community-*` over a Verified alternative? Default: yes, with `--prefer-community` to silence.
