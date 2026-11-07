# AI-first scorecard

> Written by the developerz.ai maintainer agent — established by dz-runner setup mode. Each onboarding run rewrites this file whole; the latest run wins, and the same card is stored on the platform.

- Run: `run_782899260e224cab8db6cd1ee69f3a1a`
- Computed: 2026-11-03T16:07:13.673Z
- Proof: **proved** — every command ran green at head.
- Score: 13 of 15 items ok

## `policy` — ok

- .dz/maintainer/maintainer.yml established
- .dz/maintainer/reviewer.md established

## `brain` — ok

- CLAUDE.md already present, left alone

## `roster` — ok

- .claude/agents already present, left alone

## `skills` — ok

- .claude/skills already present, left alone

## `scripts` — ok

- bin/setup established
- bin/dev established
- bin/check established
- bin/stop established
- down: ./bin/stop (bin)
- ./bin/setup exited 0 at head (0.8s)

## `wiring` — ok

- .mcp.json established

## `commands` — ok

- .claude/commands already present, left alone

## `access` — gap

- landed 0 of 7 asked
- still missing: OPENROUTER_API_KEY, NX_LOG_LEVEL, NX_REPLAY_SEED, NX_RUSTC_WRAPPER, NX_TELEMETRY, GH_TOKEN, NEXUS_ENV

## `layout` — gap

- migration to the house layout filed as tasks
- packages/genres: 1 move(s) planned as one task
- packages/nexus-agent: 1 move(s) planned as one task
- packages/nexus-assets: 1 move(s) planned as one task
- packages/nexus-audio: 1 move(s) planned as one task
- packages/nexus-cli: 1 move(s) planned as one task
- packages/nexus-core: 1 move(s) planned as one task
- …and 10 more

## `smoke_test` — ok

- scripts/tests/check.test.ts in the repository
- run by ./bin/check exited 0 at head (11.0s)

## `env_example` — ok

- .env.example already present, left alone

## `agents_md` — ok

- AGENTS.md established

## `per_workspace_brains` — ok

- scripts/CLAUDE.md established

## `docs_readme` — ok

- docs/README.md already present, left alone

## `gate_proved` — ok

- ./bin/check exited 0 at head (11.0s)
