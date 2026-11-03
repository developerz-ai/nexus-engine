# developerz-ai/nexus-engine — scripts

> Workspace brain — established by dz-runner setup mode from this workspace, then owned by
> its maintainers. Correct it in place; setup never overwrites a brain that exists.

The Bun/TypeScript agent-facing CLI layer (`@nexus-engine/scripts`); a Bun workspace package of the root `package.json`, independent of the Cargo workspace.

The gate is the repo root’s: `bin/check` (see the root `CLAUDE.md`).

## Structure

```
scripts/
├── .bun-version          # pinned Bun runtime
├── package.json          # @nexus-engine/scripts, private, type: module
├── tsconfig.json         # strict, noUncheckedIndexedAccess, types: ["bun-types"]
├── biome.json
├── manifest.toml         # source of truth for every script, flag, exit code
├── index.json            # generated from manifest.toml + --help output
├── bin/                  # one <name>.ts per manifest entry
├── lib/                  # source-only shared helpers (never executed)
│   ├── skeleton.ts args.ts log.ts errors.ts env.ts telemetry.ts gh.ts cargo.ts
│   └── versions.toml     # pinned tool versions, updated by Renovate
├── tests/                # one <name>.test.ts per bin, plus helpers.ts
└── <name>                # one-line POSIX shim: exec bun bin/<name>.ts "$@"
```

`bin/`: bootstrap, check, build, test, bench, replay, scenario, index-scripts, new-script, lint-scripts, release-engine, symbols-upload, sync-docs-index, triage-issues.
`lib/`: args.ts (hand-rolled flag parser), log.ts (structured JSON to stderr), errors.ts (tagged `NxError` union), env.ts (`.env` loader), telemetry.ts, gh.ts, cargo.ts (sccache + target-dir), skeleton.ts (`defineScript` wrapper).

## Conventions

- Runtime is Bun, pinned by `scripts/.bun-version` (1.4.4). Language TypeScript with `strict: true` and `noUncheckedIndexedAccess: true`.
- Biome is the only linter/formatter — `bun x biome check .` from `scripts/`. Never `bun x @biomejs/biome` (fetches latest, breaks on schema drift).
- Every `bin/<name>.ts` carries a `// Performance Contract:` comment block (cold_start, wall_time, mem_peak) — Law 5.
- Errors are tagged unions in `lib/errors.ts`; throw only `NxError`, never a bare `Error` — Law 10.
- Structured JSON telemetry to stderr via `lib/log.ts` — Law 11. Never `console.log`.
- Every `bin/<name>.ts` needs a sibling `tests/<name>.test.ts` — Law 12.
- The public shim `scripts/<name>` must keep working byte-for-byte: same flags, same exit codes, same `--json` envelope shape.
- `scripts/manifest.toml` is hand-edited source of truth; `scripts/index.json` is regenerated with `scripts/index-scripts` — never hand-edit it.
- Process spawning goes through `lib/bun.ts` (`Bun.spawn`) — never `bash -c`, never shell expansions.
- Zero runtime dependencies; dev-deps only in `scripts/package.json` (biome, @types/bun, typescript).
- `scripts/manifest.toml` also declares the per-crate test policy indirectly via `scripts/lib/test-policy.toml` — coverage floors and required test classes per crate tier.
