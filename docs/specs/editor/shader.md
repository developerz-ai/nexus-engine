<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Editor — Shader / Material Graph

> Visual node graph that compiles to WGSL through the engine's shader pipeline. Live preview updates as nodes change. Graph is a plain JSON asset, fully agent-editable.

## RPC parity — thin UI over the shader-graph RPC

The graph IS the data. The node-canvas UI is one client. Every `CreateNode`, `MoveNode`, `Connect`, `SetParam`, `GroupNodes`, `CompileGraph` action is one `shader.*` agent RPC. An agent authoring a shader writes the same RPC sequence the UI emits — and gets the same compile artifacts, the same preview frames, the same permutation cache. The node-canvas is NOT a separate IDE. Enforced by `docs/specs/editor/rpc-parity.md` and Law 13 (→ `docs/architecture/01-principles.md#law-13`). MCP exposes the same surface (→ `docs/specs/agent/mcp-server.md`).

## Boundaries

- Owns: node graph editor UI, node library, parameter inspector, preview viewport, compile-error overlay.
- Does NOT own: WGSL compilation/permutations (→ `docs/specs/renderer/shaders.md`), material runtime (→ `docs/specs/renderer/pbr.md`), shader hot reload mechanics (→ `docs/specs/scripting/hotreload.md`, `docs/specs/editor/livereload.md`).
- Depends on: `docs/specs/editor/overview.md`, `docs/specs/renderer/shaders.md`, `docs/specs/renderer/pbr.md`, `docs/specs/styles/overview.md`, `docs/specs/agent/api.md`.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Shader Graph Dock                                                   │
│  ┌──────────┬─────────────────────────────────────┬────────────────┐ │
│  │ Node Lib │           Canvas (zoom/pan)         │  Preview       │ │
│  │          │                                     │  ┌──────────┐  │ │
│  │ ▾ Math   │  ┌─────┐    ┌──────────┐           │  │  sphere  │  │ │
│  │  add     │  │ Time│──► │ Sin      │──┐        │  │  env hdr │  │ │
│  │  mul     │  └─────┘    └──────────┘  │        │  └──────────┘  │ │
│  │  sin     │                            ▼        │                │ │
│  │ ▾ Sample │  ┌──────────────┐ ┌────────────┐   │  Parameters    │ │
│  │  tex2d   │  │ SampleTex2D  │►│ Mul        │──►│ ◉ base color   │ │
│  │  tex3d   │  │  uv: UV0     │ │            │   │ ▸ metallic 0.0 │ │
│  │ ▾ PBR    │  └──────────────┘ └────────────┘   │ ▸ roughness 0.5│ │
│  │  pbr_out │                              │      │                │ │
│  │ ▾ Custom │                              ▼      │  Compile log   │ │
│  │  user.fn │            ┌──────────────────┐    │  ✓ wgsl 1240 b │ │
│  │          │            │ MaterialOutput   │    │  ✓ permutes 4  │ │
│  │          │            │  base · normal · │    │  ⚠ unused: Sin │ │
│  │          │            │  metal · rough · │    │                │ │
│  │          │            │  emissive · alpha│    │                │ │
│  │          │            └──────────────────┘    │                │ │
│  └──────────┴─────────────────────────────────────┴────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Graph file format

```toml
# fountain_water.nxshader  (TOML for clarity; JSON canonical)
schema = "nexus.shader/v1"
domain  = "surface"          # surface | post | compute | particle
output  = "pbr"              # pbr | unlit | toon | custom

[[node]]
id = "n_time"
kind = "input.time"
pos  = [0, 0]

[[node]]
id = "n_sin"
kind = "math.sin"
pos  = [200, 0]

[[node]]
id = "n_out"
kind = "output.material.pbr"
pos  = [600, 0]
params.metallic  = 0.0
params.roughness = 0.4

[[edge]]
from = "n_time:out"
to   = "n_sin:x"

[[edge]]
from = "n_sin:out"
to   = "n_out:emissive"
```

Stable IDs ⇒ edits diff cleanly in git, agents can patch nodes with confidence.

## Node taxonomy

| Group | Examples |
|---|---|
| Inputs | `input.time`, `input.uv`, `input.normal`, `input.world_pos`, `input.view_dir`, `input.vertex_color`, `input.instance_id`, `input.uniform.<name>` |
| Constants | `const.float`, `const.vec2/3/4`, `const.color`, `const.matrix` |
| Math | `math.add/sub/mul/div`, `math.dot/cross/length/normalize`, `math.sin/cos/tan`, `math.pow/exp/log`, `math.lerp/smoothstep/saturate`, `math.fract/floor/mod` |
| Sampling | `sample.tex2d`, `sample.tex2d_array`, `sample.tex_cube`, `sample.tex3d`, `sample.triplanar` |
| Procedural | `proc.noise.simplex`, `proc.noise.worley`, `proc.voronoi`, `proc.checker`, `proc.gradient` |
| Vector ops | `vec.split`, `vec.combine`, `vec.swizzle`, `vec.rotate2d`, `vec.reflect/refract` |
| Lighting | `light.lambert`, `light.fresnel`, `light.specular_ggx` (advanced — direct WGSL preferred) |
| Style | `style.toon.ramp`, `style.outline.fresnel`, `style.pixel.quantize`, `style.npr.hatching` |
| Flow | `flow.branch` (compiled to step/select, no real branch), `flow.subgraph` (reusable node-group asset) |
| Outputs | `output.material.pbr`, `output.material.unlit`, `output.material.toon`, `output.post.color`, `output.compute.write` |
| Custom | `custom.wgsl` (drop a WGSL snippet, declare ins/outs) |

Each node = a Rust struct + a WGSL emitter (`fn emit(&self, ctx: &mut EmitCtx)`). Third-party nodes register via plugin API.

## Compilation pipeline

```
graph JSON ──► validate (typecheck, cycle check, dead-code)
            │
            ▼
        topological sort
            │
            ▼
        emit WGSL per output domain
            │
            ▼
   permutation expand (per style, per quality tier)  → docs/specs/renderer/shaders.md
            │
            ▼
        naga validate (in-engine)
            │
            ▼
      cache by content hash; push to renderer; trigger live preview
```

- Validation runs on every edit (debounced ~50 ms). Errors are structured and pointed at offending node/port.
- Type system: `Float`, `Vec2/3/4`, `Mat3/4`, `Color`, `Sampler2D/3D/Cube`, `Bool`, `Int`. Implicit promotion `Float → Vec*` only when single component; otherwise an `Adapter` node is auto-inserted with a visible badge.
- Compile artifacts cached in `.nexus/cache/shaders/{graph_hash}_{permutation_hash}.wgsl`.

## Live preview

- Preview viewport renders a mesh (sphere / cube / plane / custom) lit by a chosen environment HDR.
- Updates within 100 ms of last edit (target — see `docs/specs/editor/livereload.md`).
- Mini-preview thumbnail at every node (Unreal-style) — shows that node's output value visualized; toggleable (perf cost).
- Per-permutation preview tabs (e.g. "low quality" vs "high").
- Stats overlay: instruction count, sampler count, varyings used, register pressure estimate.

## Parameter inspector

- Same widget registry as scene inspector (→ `docs/specs/editor/scene.md`).
- Per-output material instance: parameters exposed by `input.uniform.<name>` nodes become editable material slots.
- Curve/gradient parameters use full editors.
- Drag-drop texture from asset browser → fills `sample.tex2d` source.

## Subgraphs (node groups)

- Select N nodes → "Group" → becomes a reusable `.nxshader` asset with declared input/output ports.
- Instantiated as `flow.subgraph` node. Editing the source updates all instances.
- Encourages a community-built library of recipes (e.g. `triplanar_pbr`, `cel_outline`, `water_ripple`). MIT, shareable.

## Custom WGSL escape hatch

```
┌─────────────────────────────────────────────┐
│  custom.wgsl                                │
│  inputs:  uv: vec2<f32>, t: f32             │
│  outputs: color: vec3<f32>                  │
│  ┌─────────────────────────────────────────┐│
│  │ let p = uv * 8.0 + vec2(t);             ││
│  │ color = vec3(sin(p.x)*cos(p.y));        ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

- Validated by naga against declared signature.
- Useful for advanced effects; lets graph remain expressive without ballooning the node library.

## Public API (commands)

```rust
pub struct CreateNode   { pub graph: AssetId, pub kind: NodeKind, pub pos: Vec2 }
pub struct MoveNode     { pub graph: AssetId, pub node: NodeId, pub pos: Vec2 }
pub struct DeleteNode   { pub graph: AssetId, pub node: NodeId }
pub struct Connect      { pub graph: AssetId, pub from: PortRef, pub to: PortRef }
pub struct Disconnect   { pub graph: AssetId, pub edge: EdgeId }
pub struct SetParam     { pub graph: AssetId, pub node: NodeId, pub key: String, pub value: serde_json::Value }
pub struct GroupNodes   { pub graph: AssetId, pub nodes: Vec<NodeId>, pub new_asset: AssetPath }
pub struct CompileGraph { pub graph: AssetId, pub permutations: Vec<PermutationKey> }
```

RPC counterparts: `shader.*` in `docs/specs/agent/api.md`. Every action is JSON-roundtrippable ⇒ agents can author shaders directly.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Edit ⇒ preview frame | < 100 ms | 250 ms |
| Compile + validate (50-node graph) | < 30 ms | 150 ms |
| Permutation expand (4 styles × 2 quality) | < 80 ms | 400 ms |
| Canvas paint, 500 nodes visible | < 8 ms | 16 ms |
| Mini-preview thumbnails enabled (50 nodes) | < 16 ms | 33 ms |
| Custom WGSL re-validate | < 10 ms | 50 ms |

`[BENCHMARK NEEDED]` confirm naga validate cost on cold cache.

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `SH_TYPE_MISMATCH` | port types incompatible | block edge, surface adapter suggestion |
| `SH_CYCLE` | graph contains cycle | block edit, highlight cycle |
| `SH_UNREACHABLE` | output disconnected | warn, allow save |
| `SH_NODE_UNKNOWN` | node kind not registered | offer plugin install |
| `SH_PERMUTATION_OVERFLOW` | > 256 permutations from style matrix | force user to lock variants |
| `SH_NAGA_ERROR` | WGSL did not validate | surface naga structured diag at node |
| `SH_PARAM_OUT_OF_RANGE` | clamped param exceeded `#[range]` | clamp + toast |
| `SH_SUBGRAPH_RECURSIVE` | subgraph instantiates itself | block |

## Integration Points

| System | Interaction |
|---|---|
| `docs/specs/renderer/shaders.md` | downstream consumer; defines permutation matrix |
| `docs/specs/renderer/pbr.md` | `output.material.pbr` slot semantics |
| `docs/specs/styles/overview.md`, `styles/npr.md`, `styles/pixel.md` | style nodes + permutation keys |
| `docs/specs/editor/livereload.md` | recompile triggers asset reload event |
| `docs/specs/editor/assets.md` | graph stored as `.nxshader` asset |
| `docs/specs/agent/api.md` | `shader.*` RPC surface |
| `docs/specs/agent/telemetry.md` | per-node compile time + instruction count published |

## Test Requirements

- `shader.graph_roundtrip`: random graph generation (fuzz) → save → load → identical JSON canonicalization.
- `shader.headless_compile`: build a sample PBR graph via RPC only (no UI), produce WGSL, render preview offscreen, image-hash against golden.
- `shader.live_preview_latency`: edit `SetParam`, measure time to first preview frame, P95 ≤ 100 ms.
- `shader.permutation_cap`: graph configured for > 256 permutations → `SH_PERMUTATION_OVERFLOW` raised, no compile launched.
- `shader.custom_wgsl_safety`: malicious `custom.wgsl` (infinite loop / undefined behavior) → naga rejects or compute timeout aborts.
- `shader.style_inheritance`: graph compiled under cartoon style picks `output.material.toon` automatically when `output.material.pbr` is absent.

## Prior Art

- ✓ Unreal Material Editor — node taxonomy, mini-preview-at-node, reroute nodes, live recompile. Acknowledged limitation: recompile cost on large graphs.
- ✓ Unity Shader Graph — typed ports, subgraphs as assets.
- ✓ Blender Geometry/Shader Nodes — exemplary UX, group nodes, drag from socket.
- ✓ Godot Visual Shader — domain-typed (spatial/canvas/particles).
- ✓ Stride node material editor — underrated C# implementation.
- ✓ ShaderVine (2026, WebGPU) — Monaco WGSL editor + node graph + live preview built explicitly for agentic workflows; confirms our design direction.
- ✗ purely visual (no escape hatch) — limits power users; we keep `custom.wgsl`.

## Open Questions

- `[DECISION NEEDED]` Default output domain when style lock changes mid-graph — auto-rewire, prompt, or break?
- `[DECISION NEEDED]` Subgraph variant system — TypeScript-like generics or duplicate-on-edit?
- `[DECISION NEEDED]` Mini-preview at every node default-on or default-off (perf vs UX)?
- `[DECISION NEEDED]` Should the compute domain share the same node library or be a separate editor mode?
- `[AGENT: 03]` confirm WGSL permutation key schema in `docs/specs/renderer/shaders.md`.
- `[AGENT: 03]` agree on `output.material.*` slot list (base, normal, metallic, roughness, ao, emissive, alpha, sss, anisotropy, clearcoat …).
- `[AGENT: 04]` style node naming conventions (`style.npr.*`, `style.pixel.*`).
- `[AGENT: 10]` `shader.subscribe.compile_status` RPC stream for IDE-like inline errors.
