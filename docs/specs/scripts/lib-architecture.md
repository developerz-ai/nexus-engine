<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `scripts/lib/` — Architecture

> Pure, side-effect-free, sourced-only utilities. One language per file. The plumbing every script reuses.

## Boundaries
- Owns: shared logging, JSON helpers, env loading, arg parsing, errors envelope, telemetry, wrappers around `gh` / `cargo` / `fly` / `sops`.
- Does NOT own: business logic of any script, network calls (except inside the gh/fly wrappers themselves).
- Depends on: only `scripts/lib/versions.toml` for pinned tool versions.

## Rules

1. **Source-only.** No file in `scripts/lib/` is executable. Shebangs forbidden. `chmod -x`.
2. **No side effects on import.** Sourcing must do nothing observable — no log lines, no `cd`, no network.
3. **One language per file.** `.sh` / `.py` / `.ts` extensions. Shared semantics across languages but never mixed in one file.
4. **Pure functions where possible.** State only via explicit `_state` globals, prefixed `NX_LIB_`.
5. **No transitive sourcing.** A lib file may source `scripts/lib/log.sh` but MUST NOT source another lib that itself sources something. Keeps dep graph flat.
6. **Stable function names.** `nx_<module>_<verb>` (bash) / `nx.<module>.<verb>` (py/ts).

## File Inventory (engine + template — identical surface)

| File | Lang | Purpose |
|---|---|---|
| `log.sh` | bash | `nx_log_info/warn/error/debug` → stderr, text or JSON |
| `log.py` | py | same surface, importable: `from nx import log` |
| `log.ts` | ts | bun-compatible logger |
| `json.sh` | bash | `nx_json_emit`, `nx_json_get`, jq/yq wrappers |
| `env.sh` | bash | `nx_env_load`, `nx_env_require` |
| `env.py` | py | `nx.env.load() / require()` |
| `args.sh` | bash | universal getopts-extended parser; emits assoc array |
| `errors.sh` | bash | `nx_err_make`, error envelope schema |
| `telemetry.sh` | bash | `nx_tel_start`, `nx_tel_end` — start/end events |
| `gh.sh` | bash | `nx_gh_api`, `nx_gh_graphql`, `nx_gh_release` |
| `cargo.sh` | bash | `nx_cargo_members`, `nx_cargo_target_dir`, sccache-on-by-default `nx_cargo_build` |
| `fly.sh` | bash | `nx_fly_deploy`, `nx_fly_status` — wraps `flyctl` |
| `sops.sh` | bash | `nx_sops_decrypt`, never echoes plaintext |
| `versions.toml` | data | pinned tool versions (rustup, bun, ruff, shellcheck, bats, …) |

## Function Conventions

### Bash
```bash
# scripts/lib/log.sh — sourced only
# Public: nx_log_info MSG [KV…]
nx_log_info() {
  local msg="$1"; shift
  _nx_log_emit "info" "$msg" "$@"
}
# Private (prefixed _)
_nx_log_emit() { … }
```

### Python
```python
# scripts/lib/log.py
def info(msg: str, **kv) -> None:
    _emit("info", msg, kv)
```

### TypeScript
```typescript
// scripts/lib/log.ts
export function info(msg: string, kv: Record<string, unknown> = {}): void {
  _emit("info", msg, kv);
}
```

## Universal Error Envelope (`errors.sh`)

```json
{
  "code": 5,
  "message": "clippy failed on crates/core",
  "location": "crates/core/src/ecs.rs:42:8",
  "suggested_fix": "run scripts/check --fix",
  "doc_url": "https://nexus-engine.org/docs/specs/scripts/cli-contract"
}
```

Constructor: `nx_err_make code msg [location] [suggested_fix]` → JSON to stdout. Compose into `errors[]` of the result envelope.

## Universal Bash Arg Parser (`args.sh`)

```bash
# scripts/lib/args.sh — sourced by every bash script
# Usage:
#   nx_args_def "json:switch" "env:string:required" "out:path"
#   nx_args_parse "$@"
#   echo "${NX_ARGS[env]}"
```

| Type tag | Semantics |
|---|---|
| `switch` | boolean, no value |
| `string` | freeform |
| `path` | string + existence check unless suffixed `:may-not-exist` |
| `int` | integer parse |
| `enum:a|b|c` | restricted set |
| `:required` | error 2 if missing |
| `:multi` | repeatable, array result |

Parser auto-injects the base flag set from `cli-contract.md` (`--help`, `--json`, …) so script authors only declare extras.

## Telemetry (`telemetry.sh`)

| Event | When |
|---|---|
| `script.start` | `nx_tel_start` at top of script |
| `script.end` | trap EXIT, emits `exit_code`, `duration_ms` |
| `script.warn` | every call to `nx_log_warn` |
| `script.error` | every call to `nx_log_error` |

Emit destinations:
- stdout JSON envelope (always)
- `$NEXUS_ROOT/.cache/telemetry/scripts.jsonl` (append; rotated daily)
- if `NEXUS_TELEMETRY_URL` set → POST asynchronously (opt-in; `NEXUS_NO_TELEMETRY` disables)

Audited by nexus-merge: `→ docs/guides/merge-system.md`.

## Versions Lockfile (`versions.toml`)

```toml
[tool]
rustup       = "1.27.1"
cargo-nextest = "0.9.72"
cargo-deny   = "0.14.24"
sccache      = "0.8.1"
bun          = "1.1.30"
ruff         = "0.6.9"
shellcheck   = "0.10.0"
bats-core    = "1.11.0"
naga-cli     = "0.20.0"
sops         = "3.9.0"
yq           = "4.44.3"
jq           = "1.7.1"
```

Updated by Renovate. Verified by `scripts/bootstrap`.

## Forbidden in `scripts/lib/`

- top-level network calls
- `set -e` on its own at top (libs are sourced, exiting kills caller)
- `exit` (return non-zero instead)
- environment mutations outside `NX_LIB_*` namespace
- writing to disk outside `$NEXUS_CACHE_DIR`

## Cross-References

- contract scripts conform to: `→ docs/specs/scripts/cli-contract.md`
- tests for lib functions: `→ docs/specs/scripts/testing.md`
- security posture for sops + gh: `→ docs/specs/scripts/security.md`
