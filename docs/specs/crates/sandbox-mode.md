<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Sandbox Mode (Resolved: ships v2.0, opt-in)

> Opt-in: ship a crate as a WASM Component so end users can run it under capability gates without trusting native code. Bridges the gap between "full-trust crate" and "sandboxed mod" for crates that don't need native speed.

→ Overview: `docs/specs/crates/overview.md`.
→ Mod sandbox (the runtime-content sibling): `docs/specs/mods/overview.md`, `docs/specs/scripting/sandbox.md`.
→ WebAssembly Component Model: `https://component-model.bytecodealliance.org/`.

## Status

**RESOLVED 2026-05-17 — Ships in v2.0, opt-in.** v1.0 stays native-only. Design specced now so v1.0 doesn't paint into a corner. See `docs/architecture/decisions-resolved.md`.

## The motivation

Today's options for end users:
- Engine crate or third-party crate → full native trust, no sandbox.
- Mod → Rune/Lua VM, capability-gated, slower.

Gap: a community physics integrator, AI behavior library, or asset transcoder that doesn't need native speed, but a security-conscious studio still wants to run with capability constraints. Today such a thing must be a native crate (full trust) or a mod (perf hit + restricted API surface).

Proposal: crates may declare `sandbox_mode = "wasm-component"` in the manifest. Tooling builds them as a WASM Component; the engine loads them via a capability-gated host.

## How it would work

```
crate source (Rust)
  │
  ├── cargo build --target wasm32-wasip2          ← Component target
  │
  └── output: <crate>-<version>.wasm (Component)
                │
                ├── ships alongside the native rlib on crates.io
                └── declared in [package.metadata.nexus].sandbox_mode = "wasm-component"

engine startup
  │
  ├── consumer selects "sandboxed" in Nexus.toml::[crates].mode = "sandbox"
  │
  └── engine loads the .wasm via wasmtime; host bindings expose capability-gated API surface
```

## Manifest declaration (proposal)

```toml
[package.metadata.nexus]
sandbox_mode = "wasm-component"    # "native" (default) | "wasm-component" | "both"
sandbox_caps = [                   # caps requested (mirrors mod cap catalog)
  "EcsRead",
  "EcsWrite",
  "Math",
  "Rng",
  "Log",
]
sandbox_resource_limits = {
  memory_mb        = 64,
  cpu_pct          = 5,
  alloc_rate_kb_s  = 1024,
}
```

`mode = "both"` ships both rlib and wasm; consumer chooses at build time.

## Capability gates

Same catalog as mods (`docs/specs/scripting/sandbox.md`) — the engine reuses the bridge. Crate sandbox mode is essentially "the mod runtime, but for compile-time-known crates with no signing/marketplace flow".

Default-deny. Manifest declares requested caps. Consumer policy grants. Engine refuses to load crates whose runtime reach exceeds declared caps.

## Performance trade-off

| Aspect | Native crate | WASM Component (sandboxed) |
|---|---|---|
| Hot-path math | ~ 1.0× | ~ 1.5–3× slower (depends on workload, codegen, AOT vs JIT) |
| Memory | shared with engine | isolated linear memory |
| ECS access | direct pointers | bridge call per access |
| Determinism | engine-wide | preserved (Component Model is deterministic by spec) |
| Threading | full | host-controlled |
| Hot reload | restart required | runtime swap supported |

Therefore: WASM sandbox mode suits crates whose work is per-frame light (behavior trees, AI scoring, config DSLs) or where determinism + isolation outweigh raw speed. Not suitable for renderer, hot physics inner loops, or audio DSP.

## Per-category fit

| Category | Sandbox-mode fit |
|---|---|
| `genre`, `genre-toolkit`, `script-lang`, `feature-flag`, `telemetry-sink` | Good fit |
| `asset-source`, `tools`, `test-fixtures` | Good fit (out-of-band work) |
| `physics`, `audio`, `style`, `net` | Poor fit (perf-sensitive); native preferred |
| `input`, `platform` | Poor fit (need host access); native preferred |

## Tooling (proposal)

```
nexus crate new <name> --category <key> --sandbox=wasm-component
nexus crate build --sandbox-mode                     # produces .wasm Component
nexus crate test --sandbox-mode                      # runs tests under wasmtime
nexus add <crate> --sandbox                          # consumes .wasm instead of rlib
```

Consumer-side `Nexus.toml`:

```toml
[crates]
default_mode = "native"        # default for all crates
overrides = { "nexus-feature-flag-growthbook" = "sandbox" }
```

## Distribution

WASM Components ship inside the crate tarball at `target/wasm32-wasip2/release/<crate>.wasm`. `nexus add --sandbox` fetches and uses it. `cargo` does not natively download WASM; we layer on top.

`[DECISION NEEDED]` Whether to host the WASM artifacts on `nexus-hub` mirror (recommended) or rely on per-crate GitHub releases.

## Integration Points (when this lands)

- → `docs/specs/scripting/sandbox.md` — reuse the cap broker.
- → `docs/specs/scripting/rune.md` — adjacent VM lane; coexists.
- → `docs/specs/crates/security.md` — sandbox mode strengthens supply-chain story.
- → `docs/specs/mods/native-mods.md` — the modding-side analog of this same gap (`[DECISION NEEDED]` v2.0 for both).
- → `docs/specs/crates/manifest.md` — manifest extensions.

## Prior Art

- **WebAssembly Component Model** — the underlying tech. Stable as of 2024. `https://component-model.bytecodealliance.org/`.
- **Wasmtime** — reference runtime; deterministic mode supported. `https://wasmtime.dev/`.
- **Extism** — plugin SDK around WASM Components; the user-facing pattern we'd mirror. `https://extism.org/`.
- **Bevy `wasm` examples** — engine targeting WASM directly; complementary, not the same.
- **Veloren plugin system experiments** — early WASM-component-model attempts in game engines.

## Open Questions

- **RESOLVED 2026-05-17** — Ships in **v2.0**; v1.0 ecosystem matures first.
- `[DECISION NEEDED]` Whether `genre`, `script-lang` crates should require sandbox mode (security-by-default for high-risk categories) or remain optional. Default: optional; document the trade-off; signal preferred mode in `nexus-hub`.
- `[DECISION NEEDED]` Capability model parity with mods: identical catalog or crate-specific extensions? Default: identical (single catalog, simpler audit story).
- `[BENCHMARK NEEDED]` Native vs WASM overhead per category once we have measured workloads.
- `[VERIFY — wasmtime determinism]` Re-confirm deterministic-mode coverage on every target at design freeze.
