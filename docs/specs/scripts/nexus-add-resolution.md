<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `nexus add` — Crate Resolution Spec

> How `nexus add nexus-genre-moba` actually wires the crate. The mechanism behind the Rails-style plugin model.
>
> Front-end CLI surface lives in `docs/game-template/cli.md`. This spec covers the internal resolution pipeline executed when `kind = crate` (or any kind that resolves to a crate dep — `genre`, `style`, `feature` resolving to a community crate).

---

## Boundaries

- Owns: the resolution pipeline (manifest fetch → compat check → mutation → verify → log).
- Does NOT own: CLI flag surface (→ `docs/game-template/cli.md`), `Nexus.toml` schema (→ `docs/game-template/nexus-toml.md`), `[package.metadata.nexus]` schema (→ `docs/specs/crates/manifest.md`), `NexusPlugin` trait (→ `docs/specs/crates/plugin-trait.md`).
- Depends on: `scripts/manifest.toml` (Agent 25 — must register `nexus-add` script entry), `docs/specs/crates/categories.md` (Agent 28 — category enum), `docs/specs/crates/quality-bar.md` (Agent 28 — verification tier check).

---

## Invocation

```
nexus add <crate-name> [flags]
nexus add genre <enum>   # resolves to nexus-genre-<enum> (or community alias)
nexus add style <enum>   # resolves to nexus-style-<enum>
nexus add crate <name>   # explicit
```

Flags relevant here (full list in `cli.md`):

| Flag | Default | Purpose |
|---|---|---|
| `--version <semver-req>` | latest stable | pin a specific version |
| `--registry <url>` | crates.io | alt registry (e.g. `nexus-hub`) |
| `--dry-run` | off | preview diff, no writes |
| `--allow-unverified` | off | accept Community-tier crates |
| `--allow-quarantine` | off | accept Quarantine-tier (audit failed); requires `--yes` |
| `--features <csv>` | crate default | per-crate Cargo features to enable |
| `--json` | off (default for agents) | structured stdout |
| `--secondary` | off | when adding a `genre`, append to `[genres].secondary` instead of replacing `primary` |

---

## Resolution pipeline (10 steps)

```
            ┌──────────────────────────────────────────────────────────┐
        1   │  Parse args, resolve <kind> → crate name + version req   │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        2   │  Fetch crate metadata from registry (crates.io API)      │
            │   GET /api/v1/crates/<name>                              │
            │   GET /api/v1/crates/<name>/<version>/download           │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        3   │  Extract [package.metadata.nexus] from Cargo.toml of     │
            │  the published crate                                     │
            │   missing → E_CRATE_NO_MANIFEST                          │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        4   │  Verify engine_versions compat with Nexus.toml           │
            │  [engine].version                                        │
            │   mismatch → E_CRATE_ENGINE_INCOMPAT                     │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        5   │  Verify category ∈ canonical enum                        │
            │  (docs/specs/crates/categories.md)                       │
            │   unknown → E_CRATE_BAD_CATEGORY                         │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        6   │  Verify NexusPlugin trait implemented                    │
            │  (heuristic: source-search for `impl NexusPlugin`        │
            │   in published crate; full check on next `cargo check`)  │
            │   missing → E_CRATE_NO_PLUGIN                            │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        7   │  Verification tier check                                 │
            │   Verified → proceed                                     │
            │   Community + no --allow-unverified → E_CRATE_UNVERIFIED │
            │   Quarantine + no --allow-quarantine → E_CRATE_QUARANTINE│
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        8   │  Mutate manifests (atomic; rollback on failure)          │
            │   Cargo.toml [dependencies] += <name> = <version-req>    │
            │   Nexus.toml [crates] or [genres] block updated          │
            │   (--dry-run prints diff, no write)                      │
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
        9   │  Run `cargo check --message-format=json` headless        │
            │   compile error → rollback both manifests → E_CRATE_BUILD│
            └────────────────────────┬─────────────────────────────────┘
                                     ▼
            ┌──────────────────────────────────────────────────────────┐
       10   │  Emit structured outcome to stdout (NDJSON or one JSON   │
            │  object per --json contract)                             │
            └──────────────────────────────────────────────────────────┘
```

Each step emits a `tracing` event (Law 11). The full pipeline is observable via `--verbose` or via telemetry subscriber.

---

## Manifest mutation rules

| `<kind>` | Cargo.toml mutation | Nexus.toml mutation |
|---|---|---|
| `crate <name>` | `[dependencies] <name> = "<req>"` | `[crates] custom += "<name>"` (or list table) |
| `genre <enum>` (primary slot empty) | `[dependencies] nexus-genre-<enum> = "<req>"` | `[genres] primary = "<enum>"` |
| `genre <enum>` (--secondary) | same | `[genres] secondary += "<enum>"` |
| `style <enum>` | `[dependencies] nexus-style-<enum> = "<req>"` | `[style] primary = "<enum>"` (warns if differs from current) |
| `feature <name>` (engine feature) | enables matching crate feature(s) per `feature-flag-matrix.md` | `[features] <name> = true` (or matching enum) |
| `feature <name>` (community-crate feature) | `[dependencies.<crate>] features += "<name>"` | `[plugins.<crate>.features] += "<name>"` if structured |

Atomic mutation: both files written under a single tempfile-and-rename pair. Failure mid-write triggers full rollback from a `.nexus/backups/<timestamp>/` snapshot.

---

## Validation rules

`nexus add` enforces (in addition to `Nexus.toml` schema rules):

| Rule | Error code |
|---|---|
| Crate name matches `^(nexus|nexus-community|nx)-[a-z0-9-]{1,63}$` | `E_CRATE_BAD_NAME` |
| Crate version is valid semver | `E_CRATE_BAD_VERSION` |
| Crate's `[package.metadata.nexus]` present | `E_CRATE_NO_MANIFEST` |
| Crate's `engine_versions` matches local engine version | `E_CRATE_ENGINE_INCOMPAT` |
| Crate's `category` in canonical enum | `E_CRATE_BAD_CATEGORY` |
| Crate exposes `impl NexusPlugin` symbol | `E_CRATE_NO_PLUGIN` |
| Crate's license MIT-compatible (Law 7) | `E_CRATE_BAD_LICENSE` |
| Crate at Verified tier OR `--allow-unverified` passed | `E_CRATE_UNVERIFIED` |
| Crate not at Quarantine tier OR `--allow-quarantine` + `--yes` | `E_CRATE_QUARANTINE` |
| Cargo check passes after mutation | `E_CRATE_BUILD` |
| Adding doesn't violate cross-genre dep rule (proposed Law 13) | `E_CRATE_CROSS_GENRE_DEP` |

All errors structured per Law 10:

```json
{
  "ok": false,
  "code": "E_CRATE_ENGINE_INCOMPAT",
  "message": "nexus-genre-moba 1.2.3 requires engine ^2 but project pins ^1",
  "location": "Nexus.toml:[engine].version",
  "suggested_fix": "upgrade engine to ^2 via `nexus migrate --to 2`, or pin `--version=0.9` of nexus-genre-moba",
  "context": { "crate": "nexus-genre-moba", "found_version": "1.2.3", "required_engine": "^2", "actual_engine": "1.0.4" }
}
```

---

## Structured outcome (`--json`)

Success:

```json
{
  "ok": true,
  "crate": "nexus-genre-moba",
  "version": "1.2.3",
  "category": "genre",
  "verification_tier": "Verified",
  "engine_compat": { "required": "^1", "actual": "1.0.4", "ok": true },
  "manifest_diff": {
    "Nexus.toml": [
      "+ [genres].secondary += \"moba\""
    ],
    "Cargo.toml": [
      "+ nexus-genre-moba = { version = \"1.2\" }"
    ]
  },
  "checks": [
    { "name": "fetch_metadata", "ok": true, "duration_ms": 412 },
    { "name": "engine_compat", "ok": true },
    { "name": "category", "ok": true, "value": "genre" },
    { "name": "plugin_trait", "ok": true },
    { "name": "license", "ok": true, "value": "MIT" },
    { "name": "verification_tier", "ok": true, "value": "Verified" },
    { "name": "cargo_check", "ok": true, "duration_ms": 8211 }
  ],
  "next_steps": [
    "nexus build --profile=dev",
    "nexus generate scene moba-lane --plugin=nexus-genre-moba"
  ],
  "duration_ms": 9011
}
```

Failure (rolled back):

```json
{
  "ok": false,
  "code": "E_CRATE_BUILD",
  "message": "cargo check failed after adding nexus-genre-moba; rolled back",
  "location": "Cargo.toml",
  "suggested_fix": "review the cargo diagnostics below; consider pinning a compatible version",
  "context": {
    "crate": "nexus-genre-moba",
    "version": "1.2.3",
    "rollback_ok": true,
    "cargo_diagnostics": [
      { "level": "error", "code": "E0277", "message": "the trait `NexusPlugin` is not implemented for ..." }
    ]
  }
}
```

Exit codes per `cli.md`:

| Exit | When |
|---|---|
| 0 | success |
| 2 | usage error |
| 3 | manifest validation error (incl. `E_CRATE_*`) |
| 4 | cargo build error |
| 10 | network / registry error |

---

## Performance contract

| Phase | Target | Hard limit |
|---|---|---|
| Metadata fetch (registry round-trip) | < 1 s | 5 s |
| Manifest parse + validation | < 50 ms | 200 ms |
| Atomic mutation (both files) | < 50 ms | 200 ms |
| `cargo check` (incremental, warm cache) | < 10 s | 30 s |
| `cargo check` (cold, first add) | < 60 s | 5 min |
| Total `nexus add` (warm) | < 12 s | 35 s |

`[BENCHMARK NEEDED]` once impl exists. Reference machine per Law 5.

---

## Headless safety (Law 8)

`nexus add` runs fully headless. No GUI, no GPU, no audio device. Verified by:

- CI runs `nexus add` against a fixture registry in headless containers.
- Test `nexus_add_headless_smoke` in `crates/nexus-cli/tests/`.

Failure mode if a transitive dep requires GPU at build time: `cargo check` errors propagate as `E_CRATE_BUILD` with the upstream message in `context.cargo_diagnostics`. No silent skip.

---

## Determinism (Law 9)

`nexus add` is deterministic given the same registry snapshot + same starting manifests:

- Registry response cached under `.nexus/cache/registry/<crate>/<version>.json` keyed by `(crate, version)`.
- Mutation diff is byte-identical across runs.
- `cargo check` output non-determinism (timestamps) is excluded from the structured outcome.

Replay: `nexus add --replay <log>` re-applies a recorded session against a different starting manifest (useful for migration scripts).

---

## Script registration (`scripts/manifest.toml`)

Add an entry (Agent 25 owns the file; this spec declares the contract):

```toml
[[script]]
name        = "nexus-add"
path        = "scripts/nexus-add"
lang        = "bash"
category    = "dev"
description = "Resolve a Nexus crate, verify compat, mutate Cargo.toml + Nexus.toml, run cargo check."
since       = "0.1.0"
idempotent  = false   # repeated invocations re-mutate; use --dry-run for idempotence
flags = [
  { name = "version",            type = "string" },
  { name = "registry",           type = "string" },
  { name = "dry-run",            type = "switch" },
  { name = "allow-unverified",   type = "switch" },
  { name = "allow-quarantine",   type = "switch" },
  { name = "features",           type = "string" },
  { name = "secondary",          type = "switch" },
  { name = "yes",                type = "switch" },
  { name = "json",               type = "switch" },
]
exit_codes = [
  { code = 0,  meaning = "added; cargo check passed" },
  { code = 2,  meaning = "usage error" },
  { code = 3,  meaning = "manifest validation error (E_CRATE_*)" },
  { code = 4,  meaning = "cargo check failed after mutation; rolled back" },
  { code = 10, meaning = "registry / network error" },
]
required_env = []
test_file   = "scripts/nexus-add.bats"
```

Wrapper script `scripts/nexus-add` dispatches to the `nexus-cli` binary; existence allows the script harness to discover and lint this command alongside the others.

---

## Cross-references

- → `docs/game-template/cli.md` — `nexus add` CLI surface.
- → `docs/game-template/nexus-toml.md` — `Nexus.toml` schema being mutated.
- → `docs/specs/crates/manifest.md` (Agent 28) — `[package.metadata.nexus]` schema being read.
- → `docs/specs/crates/categories.md` (Agent 28) — canonical category enum.
- → `docs/specs/crates/quality-bar.md` (Agent 28) — verification tier check.
- → `docs/specs/crates/plugin-trait.md` — `NexusPlugin` trait required for compat.
- → `docs/specs/crates/rails-plugin-model.md` — the mental model this CLI implements.
- → `docs/architecture/06-modularity.md` — modularity manifesto; the cross-genre-dep rule enforced here.
- → `docs/architecture/feature-flag-matrix.md` — `--features` flag values per crate.
- → `scripts/manifest.toml` — script registry (Agent 25 owns).
- → `docs/specs/scripts/cli-contract.md` (Agent 25) — base CLI contract every script honors (`--json`, `--quiet`, exit codes).
- → crates.io registry API: https://doc.rust-lang.org/cargo/reference/registry-web-api.html.

## Open questions

- `[DECISION NEEDED]` Alt-registry priority order when both crates.io and `nexus-hub` carry the same name. Recommendation: `nexus-hub` wins for `nexus-*` namespace (curated); crates.io wins for `nx-*` (community first-source).
- `[DECISION NEEDED]` Behavior when `cargo check` succeeds but `nexus lint` fails on the new manifest. Recommendation: keep the add (cargo passed), surface the lint as a warning + suggested follow-up `nexus lint --fix`.
- `[DECISION NEEDED]` Whether to auto-`git add` the mutated files. Recommendation: NO; emit a hint in `next_steps` instead.
- `[DECISION NEEDED]` Caching policy for registry metadata (TTL, invalidation). Recommendation: 1 h TTL for resolution, infinite for content-hash-pinned downloads, `--no-cache` bypass flag.
- Cross-flag Agent 25 (scripts) — register `nexus-add` entry in `scripts/manifest.toml`.
- Cross-flag Agent 28 (crates) — categories and verification-tier enums must be in place before this CLI ships.
