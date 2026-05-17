<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# nexus CLI — Reference

> The Rails-equivalent of `rails`. One binary, every project lifecycle action, agent-invokable.

## Boundaries
- Owns: the CLI surface, command parsing, structured JSON output, exit codes.
- Does NOT own: the underlying engine, agent SDK, asset generators (it dispatches to them).
- Depends on: `→ docs/game-template/nexus-toml.md`, `→ docs/specs/agent/sdk.md`, `→ docs/specs/assets/generation.md`.

## Global Flags

| Flag | Default | Purpose |
|---|---|---|
| `--json` | off | every command emits structured JSON instead of text. AI-first mandate. |
| `--quiet` | off | suppress non-error output |
| `--verbose` | off | debug-level logs |
| `--manifest <path>` | `./Nexus.toml` | override manifest location |
| `--profile <name>` | `dev` | `dev` \| `release` \| `ship` |
| `--no-color` | off | strip ANSI |
| `--version` | — | print CLI + engine versions |
| `--help` | — | inline help; respects `--json` |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | generic failure |
| 2 | usage error (invalid args) |
| 3 | manifest validation error |
| 4 | build error |
| 5 | test failure |
| 6 | deploy error |
| 7 | agent error |
| 10 | network / external service error |

## Command Index

| Command | Purpose |
|---|---|
| `nexus new` | scaffold a new game project |
| `nexus add` | add an engine module / genre / platform / dependency |
| `nexus generate` | code generation: entity, system, scene, scenario, agent |
| `nexus build` | compile for one or more targets |
| `nexus run` | run the game (headed, headless, or as server) |
| `nexus test` | unit + integration + scenario tests |
| `nexus lint` | manifest + spec + CLI compliance checks |
| `nexus deploy` | push to deploy target (Steam, itch, web, server, mobile) |
| `nexus agent` | invoke / manage AI agents and replays |
| `nexus migrate` | bump template edition + apply transforms |
| `nexus doctor` | environment + toolchain diagnosis |

---

## `nexus new`

```
nexus new <name> [flags]
```

Scaffolds a new game project at `./<name>/` from the template.

| Flag | Type | Default | Purpose |
|---|---|---|---|
| `--genre` | enum | `platformer` | primary genre → `Nexus.toml [genres].primary` |
| `--style` | enum | `pbr` | visual style → `Nexus.toml [style].primary` |
| `--platforms` | csv | `linux,web` | initial build targets |
| `--license` | SPDX | `MIT` | LICENSE file + manifest |
| `--git` | bool | `true` | `git init` + initial commit |
| `--no-server` | bool | off | skip `server/` crate |
| `--no-web` | bool | off | skip `web/` sub-monorepo |
| `--no-mobile` | bool | off | skip `mobile/` sub-monorepo |
| `--no-infra` | bool | off | skip `infra/` |
| `--minimal` | bool | off | game/ + Nexus.toml only |
| `--template` | name\|url | `default` | custom template source |

JSON output:
```json
{ "ok": true, "path": "./mygame", "created_files": 142, "manifest": {...} }
```

---

## `nexus add`

```
nexus add <kind> <value> [flags]
```

Mutates `Nexus.toml` + scaffolds related files.

| `kind` | Example | Effect |
|---|---|---|
| `genre` | `nexus add genre rpg` | appends to `[genres].secondary`, runs `nexus generate` for genre defaults |
| `style` | `nexus add style mixed` | switches `[style].primary`; warns about style-lock breakage |
| `platform` | `nexus add platform ios` | appends to `[platforms].targets`; adds CI matrix entry |
| `feature` | `nexus add feature ray_tracing` | sets `[features].ray_tracing = true` |
| `crate` | `nexus add crate physics-extra` | new workspace crate under `crates/` |
| `dependency` | `nexus add dependency tokio` | Cargo dep on closest matching crate |
| `dlc` | `nexus add dlc halloween-2026` | scaffold `dlc/packs/halloween-2026/` |
| `mod` | `nexus add mod starter` | scaffold `mods/official/starter/` |
| `scenario` | `nexus add scenario smoke` | scaffold `tests/scenarios/smoke.toml` |
| `agent` | `nexus add agent qa-runner` | scaffold `ai-agents/.claude/agents/qa-runner.md` |

| Flag | Purpose |
|---|---|
| `--dry-run` | preview diff without writing |
| `--force` | overwrite existing files |

---

## `nexus generate`

```
nexus generate <generator> <name> [args] [flags]
```

Rails-style generators. Idempotent. Spec-first: generates a spec stub in `specs/` alongside code.

| Generator | Args | Produces |
|---|---|---|
| `entity` | `<Name> <Component...>` | components + system stub + spec |
| `system` | `<name>` | system file + test + spec |
| `component` | `<Name>` | component + tests |
| `event` | `<Name>` | event type + handlers stub |
| `scene` | `<name>` | scene file + load script + test |
| `plugin` | `<name>` | Bevy-style plugin module |
| `script` | `<name>` | Lua/Rune script + spec |
| `shader` | `<name>` | WGSL file + permutation stub + preview scene |
| `scenario` | `<name>` | TOML scenario + assertion stubs |
| `agent` | `<name>` | `.claude/agents/<name>.md` + skill bindings |
| `migration` | `<name>` | SQL migration in `server/migrations/` |
| `genre-feature` | `<genre> <feature>` | genre-specific scaffold (e.g. `fps weapon`) |

| Flag | Purpose |
|---|---|
| `--spec-only` | emit spec stub, skip code |
| `--no-test` | skip test generation |
| `--ai` | call agent to fill in spec + initial impl |

JSON output:
```json
{ "ok": true, "generator": "entity", "files": ["src/components/dragon.rs", "specs/features/dragon.md"] }
```

---

## `nexus build`

```
nexus build [flags]
```

Compiles the project (game/, server/, web/, mobile/ as enabled by manifest).

| Flag | Default | Purpose |
|---|---|---|
| `--target` | manifest default | one of `linux\|windows\|macos\|android\|ios\|web\|switch\|ps5\|xbox\|all` |
| `--profile` | `dev` | `dev` \| `release` \| `ship` (ship strips editor + telemetry) |
| `--assets` | `incremental` | `incremental` \| `full` \| `skip` |
| `--shaders` | `incremental` | same |
| `--out` | `dist/` | output directory |
| `--workspaces` | `all` | csv subset: `game,server,web,mobile` |
| `--package` | off | also produce platform-specific installer/bundle |

JSON output:
```json
{ "ok": true, "target": "linux", "profile": "release", "artifacts": ["dist/mygame-linux-x86_64"], "size_bytes": 48211004, "duration_ms": 87211 }
```

---

## `nexus run`

```
nexus run [flags] [-- <game-args>]
```

| Flag | Default | Purpose |
|---|---|---|
| `--headless` | off | no window; required for agents/CI |
| `--role` | `client` | `client` \| `server` \| `editor` |
| `--scene` | manifest default | starting scene |
| `--speed` | `1` | sim speed multiplier (headless only) |
| `--frames` | unlimited | exit after N frames (headless) |
| `--seed` | random | RNG seed pin (determinism) |
| `--replay` | none | replay file → `docs/specs/agent/replay.md` |
| `--record` | none | path to record replay to |
| `--telemetry-port` | manifest | open JSON-RPC stream |
| `--snapshot-on-exit` | off | write state snapshot to `.nexus/snapshots/` |

---

## `nexus test`

```
nexus test [pattern] [flags]
```

| Flag | Default | Purpose |
|---|---|---|
| `--unit` | on | Cargo unit tests |
| `--integration` | on | integration tests |
| `--scenarios` | on | TOML scenarios from `tests/scenarios/` |
| `--benchmarks` | off | run benches (criterion) |
| `--coverage` | off | emit coverage report |
| `--parallel` | `auto` | thread count |
| `--seed` | random | scenario seed pin |
| `--watch` | off | re-run on file change |
| `--bisect` | off | with `--replay`, bisect failing input range |

JSON output:
```json
{ "ok": false, "passed": 142, "failed": 3, "skipped": 1, "failures": [ { "name": "scenarios/multiplayer-handshake", "code": "E_SCN_TIMEOUT", "frame": 247 } ] }
```

---

## `nexus lint`

```
nexus lint [flags]
```

| Flag | Purpose |
|---|---|
| `--manifest` | validate `Nexus.toml` against schema |
| `--spec` | every feature in `src/` has a spec in `specs/` |
| `--cli` | every project-local CLI command supports `--json` |
| `--style` | every asset complies with `[style]` lock |
| `--fix` | apply auto-fixes where safe |
| `--strict` | promote warnings to errors |

---

## `nexus deploy`

```
nexus deploy <target> [flags]
```

`<target>` ∈ keys of `Nexus.toml [deploy]`: `steam`, `itch`, `web`, `server`, `mobile`, or `all`.

| Flag | Default | Purpose |
|---|---|---|
| `--env` | `prod` | `dev` \| `staging` \| `prod` |
| `--dry-run` | off | preview actions, no side effects |
| `--rollback` | none | deploy ID to roll back to |
| `--changelog` | auto | path to release notes |
| `--sign` | on | code-sign artifacts |
| `--no-cache` | off | force rebuild |

JSON output:
```json
{ "ok": true, "target": "server", "env": "prod", "deploy_id": "dep_2026_05_17_001", "url": "https://mygame-server.fly.dev", "duration_ms": 142001 }
```

---

## `nexus agent`

Front door to the AI agent surface. Agent-invokable; every subcommand emits JSON natively.

```
nexus agent <subcommand> [args]
```

| Subcommand | Purpose |
|---|---|
| `list` | enumerate agents in `ai-agents/.claude/agents/` |
| `invoke <name> [prompt]` | run an agent against the project; streams structured events |
| `scenario run <path>` | execute a TOML scenario → `docs/specs/agent/scenarios.md` |
| `scenario batch <dir>` | run all scenarios in directory; report pass/fail matrix |
| `replay record <out>` | start recording inputs + state to a replay file |
| `replay play <file>` | deterministic playback → `docs/specs/agent/replay.md` |
| `replay bisect <file> <test>` | find minimal failing input range |
| `telemetry tail` | stream live telemetry as NDJSON to stdout |
| `telemetry query <expr>` | structured query over recent telemetry |
| `state dump <out>` | full ECS snapshot to file |
| `state diff <a> <b>` | diff two snapshots |
| `semantic "<nl command>"` | natural-language → engine RPC → `docs/specs/agent/semantic.md` |

Common flags: `--headless` (default for agent subcommands), `--speed`, `--seed`, `--timeout`, `--json` (always on for agent — flag is no-op for compatibility).

JSON event example (`nexus agent invoke gameplay-dev "balance the dragon fight"`):
```json
{ "event": "agent.start",  "agent": "gameplay-dev", "ts": 1747514400123 }
{ "event": "tool.call",    "tool": "scenario_run", "args": { "path": "tests/scenarios/dragon-fight.toml" } }
{ "event": "tool.result",  "tool": "scenario_run", "ok": false, "failure_frame": 482 }
{ "event": "file.write",   "path": "specs/balance/dragon.md", "bytes": 1204 }
{ "event": "agent.end",    "ok": true, "duration_ms": 64211 }
```

---

## `nexus migrate`

```
nexus migrate [--to <edition>] [--dry-run]
```

Bumps `project.edition`. Applies registered transforms. Always shows diff before write unless `--yes`.

---

## `nexus doctor`

```
nexus doctor [--json]
```

Diagnoses local environment: toolchain versions, GPU/driver, disk space, network, agent SDK reachability, manifest validity. Exit 0 = healthy.

JSON output:
```json
{ "ok": true, "checks": [ { "name": "rustc", "version": "1.85.0", "ok": true }, { "name": "wgpu-backend", "value": "vulkan", "ok": true }, ... ] }
```

---

## Performance Contract

| Command | Cold target | Warm target | Hard limit |
|---|---|---|---|
| `nexus new` | <5s | — | 10s |
| `nexus build --profile=dev` (incremental, game/ only) | — | <2s | 5s |
| `nexus run --headless --frames=60` | <500ms startup | — | 1s |
| `nexus lint` | <1s | <500ms | 2s |
| `nexus test --scenarios` (per scenario) | — | — | per-scenario timeout from TOML |

`[BENCHMARK NEEDED]` actual baselines once impl exists.

## Error Contract

All errors emitted as structured JSON when `--json`:
```json
{ "ok": false, "code": "E_NXTOML_006", "message": "rollback netcode requires strict determinism", "location": "Nexus.toml:18", "suggested_fix": "set engine.determinism = \"strict\"" }
```

Error code namespaces:
- `E_NXTOML_*` manifest validation
- `E_BUILD_*` build
- `E_TEST_*` test
- `E_DEPLOY_*` deploy
- `E_AGENT_*` agent
- `E_NET_*` network / external

## Cross-Agent Flags
- `[AGENT: 09]` asset generators referenced by `nexus build --assets` enum
- `[AGENT: 10]` `nexus agent` subcommands mirror agent SDK API
- `[AGENT: 11]` `nexus run --role=editor` requires editor crate
- `[AGENT: 16]` `nexus lint` rules consumed by AI merge bot
- `[AGENT: 12]` `nexus generate genre-feature` enum sourced from genre modules

## Open Questions
- `[DECISION NEEDED]` whether `nexus deploy` should support multi-target atomic deploys (all-or-nothing rollback)
- `[DECISION NEEDED]` whether `nexus run --replay` should auto-snapshot on divergence
- `[DECISION NEEDED]` should `nexus agent invoke` stream NDJSON or JSON-RPC framing
