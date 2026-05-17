<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Native Mods (WASM Tier)

> `[DECISION NEEDED]` for v2.0. A third runtime tier above Rune, for mods that need native-speed compute (procgen, complex AI, physics overlays). Backed by WASM Component Model. Sandbox preserved.

## Status

Spec-level **proposal only** for engine v2.0. v1.0 ships Rune-only. This document captures the design sketch, risks, and decision points so v2.0 planning can move quickly.

## Boundaries (if accepted)
- Owns: WASM tier loader, component-model imports/exports mapping to SDK, per-mod fuel/memory limits, Wasmtime/Wasmer backend choice.
- Does NOT own:
  - Capability sandbox semantics → `docs/specs/scripting/sandbox.md`
  - Rune mod tier → `docs/specs/scripting/rune.md`
  - Manifest schema → `manifest.md` (extends with `[wasm]` block)
- Depends on: WASM Component Model (final), WASI Preview 2.

## Motivation

A few mod kinds will hit Rune's ceiling:
- Voxel chunk meshers (millions of ops per second).
- Pathfinding at scale (1000s of agents).
- Procedural generation passes (Wave Function Collapse, erosion).
- Audio DSP plugins.
- ML inference (player behavior prediction, NPC dialogue scoring).

Rune is fast enough for the vast majority of mods; WASM closes the long tail without unlocking native-code escape.

## Proposed Tier Position

| Tier | VM | Cap model | Hot reload | Perf |
|---|---|---|---|---|
| Lua (trusted) | mlua | none (trusted) | yes | high |
| Rune (untrusted) | rune-rs | capability | yes | medium |
| **WASM (untrusted, opt-in)** | wasmtime or wasmer | capability | yes | high (native) |

WASM mods declared in `mod.toml`:

```toml
[mod]
tier = "behavior"
runtime = "wasm"                       # default: "rune"

[wasm]
module = "build/mymod.wasm"
component = true                       # component model required
fuel_per_frame = 5_000_000             # instruction budget
memory_pages_max = 256                 # 16 MB
```

Capabilities use the same catalog (`docs/specs/scripting/sandbox.md`); the bridge maps caps to WIT-typed imports.

## Sandbox Preservation

WASM in this proposal is **NOT** Web/JS WASM. It is server-style component WASM with:
- No syscall surface unless explicitly imported.
- Imports gated by capabilities (the broker generates the import table per mod).
- Memory limited per `[wasm].memory_pages_max`.
- Fuel-metered CPU (Wasmtime fuel API or epoch interruption).
- No host-pointer leakage; only typed values cross the boundary.

This preserves the threat-model guarantees in `docs/specs/scripting/sandbox.md`. WASM does not become a backdoor to native-code execution.

## Component Model Sketch

```wit
package nexus:mod;

interface world {
    record entity { id: u64 }
    use math.{vec3, mat4}

    query: func(components: list<string>) -> list<entity>
    spawn: func(components: list<component-data>) -> entity
    despawn: func(e: entity)
}

interface events {
    emit: func(name: string, payload: list<u8>)
    subscribe: func(name: string) -> stream<event>
}

world mod-entry {
    import nexus:mod/world
    import nexus:mod/events
    import nexus:mod/assets
    import nexus:mod/log
    import nexus:mod/rng
    import nexus:mod/persist

    export init: func(env: mod-env) -> result<mod, mod-error>
    export on-step: func(dt: float64)
    export on-reload: func(prev: list<u8>) -> result<list<u8>, reload-error>
}
```

The host generates per-mod import lists based on granted caps. Ungranted import = link fails at load with `CAP_DENIED`.

## Risks

| Risk | Mitigation |
|---|---|
| WASM toolchain churn (component model still stabilizing in 2026) | Wait for stable; pin to a frozen tag |
| Larger artifact sizes than Rune | Stricter tier budgets; gzip in `.nxmod`; dedupe runtime support libs |
| Slower hot reload (link cost) | Cache compiled artifacts; keep Rune as default |
| Determinism on threading | Single-threaded execution (no `wasi-threads`); fuel-metered |
| FFI cost vs Rune | `[BENCHMARK NEEDED]`; expected ~ same order at typed boundary |
| Console/mobile WASM runtime availability | Likely restricted on consoles; ship platform matrix at decision time |
| Cap-import generation complexity | Codegen WIT files at install time from manifest caps |

## Performance Targets (proposal)

| Metric | Target | vs Rune |
|---|---|---|
| Cold load (1 MB module) | < 50 ms | comparable |
| Compute-bound op | 1–5× C-speed | 5–20× faster than Rune |
| Bridge call overhead | < 200 ns | comparable |
| Memory cap enforcement | hard | hard |

`[BENCHMARK NEEDED]` before commit.

## Tooling

- `nexus mod new --wasm --lang rust` scaffolds a `cargo new` with WIT + component-model adapter.
- `nexus mod new --wasm --lang zig` (post-MVP).
- `nexus mod new --wasm --lang assemblyscript` for accessibility (no compile toolchain).
- `nexus mod pack` includes `.wasm` under `build/`.
- `nexus mod verify` validates the component (Wasmtime `wasmtime component wit`).

## Comparison Table (v2.0 decision input)

| Aspect | Rune | WASM (proposed) |
|---|---|---|
| Authoring languages | Rune | Rust, AssemblyScript, Zig, C, others compiling to component |
| Onboarding cost | low | medium (toolchain) |
| Performance | medium | high |
| Sandbox guarantees | high | high (component model) |
| Hot reload | fast | medium |
| Console portability | high | TBD per platform |
| Maturity (2026) | rune-rs stable | component model approaching stable |
| Mod author audience | game-scripters | systems programmers |

## Open Questions (for v2.0 decision)

- `[DECISION NEEDED]` Backend: Wasmtime vs Wasmer (both viable; Wasmtime has component model first).
- `[DECISION NEEDED]` Coexistence: WASM and Rune mods in same session — yes, but ordering / interop bus?
- `[DECISION NEEDED]` Should TC tier (`docs/specs/mods/total-conversions.md`) accept WASM?
- `[DECISION NEEDED]` Per-platform availability matrix (web target via wasm-component-in-wasm is recursive; likely skip).
- `[DECISION NEEDED]` Anti-cheat treatment: native-speed compute may shift behavioral baselines; recalibrate scoring per `docs/specs/networking/anticheat.md`.
- `[BENCHMARK NEEDED]` All perf numbers; rerun before commit.
- `[AGENT: 08]` Confirm scripting team's appetite for two-runtime mod model.
- `[AGENT: 23]` Subagent: `wasm-mod-author` if accepted.

## Recommendation

Defer to engine v2.0. Until then:
- Keep Rune as the only mod runtime.
- Maintain this spec; revisit when WASM component model + WASI Preview 2 are stable across our target platforms.
- Track the use-cases above; if v1.x mod ecosystem shows the perf cliff, accelerate.

## Prior Art

- WASM Component Model — direct technical basis.
- Roblox Luau VM upgrade path — keeping a scripting tier and adding a perf tier.
- VST/AU audio plugins — capability-gated native code as compositional model.
- Browser extensions: MV3 sandboxed JS — capability-gated, audited.
- Embedded scripting in databases (Postgres procedural langs) — multiple tiers, one model.

## Integration Points

- `docs/specs/scripting/sandbox.md` — same cap catalog.
- `docs/specs/scripting/rune.md` — coexistence model.
- `manifest.md` — `[wasm]` block extension.
- `package-format.md` — `build/*.wasm` included in archive.
- `sdk.md` — same surface; WIT generation under the hood.
- `docs/specs/networking/anticheat.md` — recalibration risk.
