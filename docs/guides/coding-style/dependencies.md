<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Dependency Policy

Minimum dependencies. Vetted. License-clean. Supply-chain audited.

Every new dep is a maintenance liability. Every transitive dep is a CVE waiting to happen. Adding a dep is a deliberate engineering decision, not a reflex.

## License allowlist

| Allowed | Forbidden |
|---------|-----------|
| MIT | GPL (any version) |
| Apache-2.0 | AGPL |
| BSD-2-Clause | LGPL (unless dynamically linked from a non-engine boundary) |
| BSD-3-Clause | SSPL |
| MPL-2.0 | Commercial / proprietary |
| ISC | "Source-available" (BSL, Elastic) |
| Zlib | "Custom" without legal review |
| CC0 / Unlicense | CC-BY-NC, CC-BY-SA |

Nexus is MIT. Any dep restricting that is a non-starter. CI fails on first GPL transitive.

Cite: spdx.org/licenses · opensource.org/licenses · BlueOak Council license ratings.

## Vetted lists (per language)

### Rust — first-call libraries

| Concern | Crate |
|---------|-------|
| Error (lib) | `thiserror` |
| Error (bin) | `anyhow` |
| Logging | `tracing` + `tracing-subscriber` |
| Async runtime | `tokio` |
| Async channels | `flume` |
| Mutex / RwLock | `parking_lot` |
| Serialization | `serde` + `serde_json` |
| Time | `jiff` (≥ chrono for new code) |
| UUID | `uuid` (v7) |
| HTTP client | `reqwest` |
| HTTP server | `axum` |
| CLI | `clap` |
| DB | `sqlx` |
| Random | `rand` + `rand_chacha` (deterministic) |
| Testing | `proptest`, `criterion`, `insta`, `rstest` |
| GPU | `wgpu`, `naga`, `bytemuck` |
| Physics | `rapier3d`, `rapier2d` |
| Audio | `cpal`, `symphonia` |
| ECS | (internal `nexus-ecs`) |
| Scripting | `mlua`, `rune` |

→ `docs/architecture/03-tech-stack.md` for rationale per choice.

### TypeScript — first-call libraries

| Concern | Package |
|---------|---------|
| Validation | `zod` |
| HTTP | `ofetch` (browser) · `undici` (node) |
| State (cross-tree) | `zustand` |
| Server state | `@tanstack/react-query` |
| Forms | `react-hook-form` |
| Date / time | `Temporal` polyfill (`@js-temporal/polyfill`) |
| Logging | `pino` |
| Testing | `vitest`, `@testing-library/react`, `playwright`, `fast-check` |
| Routing | `@tanstack/router` |
| Build | `vite` |

### Python — first-call libraries

| Concern | Package |
|---------|---------|
| Async | `anyio` |
| HTTP | `httpx` |
| Validation | `pydantic` (v2) |
| Logging | `structlog` |
| CLI | `typer` |
| Testing | `pytest`, `hypothesis`, `pytest-anyio` |
| DB | `asyncpg` |

### Lua — first-call libraries

| Concern | Module |
|---------|--------|
| Testing | `busted` |
| Coverage | `luacov` |
| Stub mocking | (internal `nexus.test.mock`) |
| HTTP / I/O | none — engine surfaces only |

Lua is sandboxed. The only deps allowed inside `game/scripts/` are pure-Lua modules vendored under `lib/`. → `docs/specs/scripting/sandbox.md`

## Version pinning

| Manifest | Pin style | Lockfile committed |
|----------|-----------|--------------------|
| `Cargo.toml` | `"1.2"` (caret allowed) | `Cargo.lock` ✓ |
| `package.json` | exact (`"1.2.3"`) | `pnpm-lock.yaml` ✓ |
| `pyproject.toml` | `>=1.2,<2` | `uv.lock` ✓ |
| Lua | exact tag from vendored source | n/a (vendored) |

Rules:
- Lockfiles always committed. CI fails on unstaged lockfile changes.
- Engine releases (semver tags) require exact pins on all direct deps. No caret, no tilde, no `*`.
- Pre-release versions (`1.2.3-rc.1`) only allowed in `dev-dependencies`.
- `git` dependencies forbidden in published crates / packages. Allowed in `[patch.crates-io]` for local dev only, blocked at release.

## Adding a new dependency

PR checklist (auto-applied by template):

```markdown
- [ ] License is in the allowlist (see dependencies.md)
- [ ] No comparable dep already in the workspace
- [ ] Maintainer has >1 active maintainer or is in `nexus-engine/*`
- [ ] Crates.io download count > 100k or has security audit
- [ ] No transitive native deps (C/C++) without a vendoring plan
- [ ] `cargo deny check` passes
- [ ] `pnpm audit` / `pip-audit` passes
- [ ] Diff in lockfile reviewed (no surprise transitives)
- [ ] Spec / ADR updated if dep crosses a sacred boundary
```

nexus-merge runs every check and blocks merge on failure. → `docs/guides/merge-system.md`

## Supply-chain hygiene

### `cargo-deny.toml`

```toml
[graph]
all-features = true

[advisories]
db-path  = "~/.cargo/advisory-db"
db-urls  = ["https://github.com/rustsec/advisory-db"]
ignore   = []                                       # never ignore without a ticket
vulnerability = "deny"
unmaintained  = "warn"
unsound       = "deny"
yanked        = "deny"
notice        = "warn"

[licenses]
unlicensed         = "deny"
allow-osi-fsf-free = "neither"
copyleft           = "deny"
default            = "deny"
allow = [
  "MIT", "Apache-2.0", "Apache-2.0 WITH LLVM-exception",
  "BSD-2-Clause", "BSD-3-Clause",
  "MPL-2.0", "ISC", "Zlib", "CC0-1.0", "Unicode-DFS-2016",
]
exceptions = []                                     # any exception requires ADR

[bans]
multiple-versions = "warn"                          # error on PR if grows
wildcards         = "deny"
highlight         = "all"
deny = [
  { name = "openssl",      reason = "use rustls" },
  { name = "openssl-sys",  reason = "use rustls" },
  { name = "chrono",       reason = "use jiff (new code)" },
]

[sources]
unknown-registry = "deny"
unknown-git      = "deny"
allow-git        = []                               # no git deps in release
```

Cite: github.com/EmbarkStudios/cargo-deny.

### `pnpm` audit

CI step:

```yaml
- run: pnpm audit --audit-level=moderate --prod
- run: pnpm dlx license-checker-rseidelsohn --production --failOn 'GPL;AGPL;LGPL;SSPL'
```

### `pip-audit`

CI step:

```yaml
- run: uv run pip-audit --strict
```

## SBOM

CI generates a SPDX SBOM per release:

```bash
cargo cyclonedx --format json --output sbom.cdx.json
pnpm dlx @cyclonedx/cdxgen -o sbom-web.cdx.json
uv pip freeze | cyclonedx-py requirements - -o sbom-py.cdx.json
```

Published with every GitHub release. nexus-merge cross-references vulnerabilities post-release and auto-files PRs for CVE-impacted deps.

## Forbidden

| Pattern | Why |
|---------|-----|
| `git` dependencies in releases | Non-reproducible |
| `path` dependencies in published crates | Breaks downstream |
| Pre-1.0 deps in stable engine APIs | Churn risk |
| Adding a dep for one helper function | Inline the function |
| Hidden transitive of GPL code | License contamination |
| `npm` (use `pnpm`) | Hoisting bugs |
| `yarn` (use `pnpm`) | Same |
| `poetry` (use `uv`) | Speed + resolution differences |
| `pip install` outside `uv` lockfile | Drift |
| `cargo install --git` in CI | Non-reproducible |
| Polyfilling stdlib | Use modern target |

## Cross-link

- → `docs/architecture/03-tech-stack.md` (Agent 01, tech-stack rationale)
- → `docs/architecture/05-adr/` (Agent 01, ADRs for dep additions)
- → `docs/guides/merge-system.md` (Agent 16, supply-chain gating)
- → `formatting-tools.md` (tool version pins)
- → `rust.md`, `typescript.md`, `python.md`, `lua.md`
