<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# WGSL Style

WGSL is the only shading language. → `docs/specs/renderer/shaders.md`

Validation: `naga-cli validate` runs in CI. Hot reload: every shader must round-trip without restart.

## Files

| Path | Contains |
|------|----------|
| `crates/nexus-renderer/shaders/*.wgsl` | engine-provided shaders |
| `crates/nexus-styles/<style>/shaders/*.wgsl` | style-pack shaders |
| `<game>/assets/shaders/*.wgsl` | game-specific shaders |
| `<game>/assets/shaders/*.wgsli` | include-only fragments (preprocessed) |

One shader concern per file. ≤500 LOC. Split large pipelines into includes.

## Naming

| Item | Convention | Example |
|------|-----------|---------|
| File | `kebab-case.wgsl` | `pbr-opaque.wgsl` |
| Struct | `PascalCase` | `Material` |
| Struct field | `snake_case` | `base_color` |
| Function | `snake_case` | `apply_normal_map` |
| Constant | `SCREAMING_SNAKE_CASE` | `MAX_LIGHTS` |
| Local var | `snake_case` | `world_pos` |
| Uniform binding | `u_*` | `u_camera` |
| Storage binding | `s_*` | `s_instances` |
| Texture binding | `t_*` | `t_albedo` |
| Sampler binding | `samp_*` | `samp_linear` |

→ `naming.md`

## Struct layout

Always specify `align` and `size` for uniforms. `std140`-style rules apply (16-byte alignment).

```wgsl
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors

struct Camera {
    view:        mat4x4<f32>,
    proj:        mat4x4<f32>,
    view_proj:   mat4x4<f32>,
    position:    vec3<f32>,
    _pad0:       f32,        // explicit padding, never implicit
    near:        f32,
    far:        f32,
    _pad1:       vec2<f32>,
}
```

Rules:
- Explicit `_padN` fields, never implicit padding.
- Order fields large → small (mat4, mat3, vec4, vec3, vec2, f32, i32, u32, bool).
- Mirror struct layout in the Rust side via `bytemuck::Pod`. → `docs/contracts/renderer-assets.md`

## Binding conventions

```wgsl
// Group layout — engine convention, hardcoded
// @group(0) = per-frame   (camera, time, lights)
// @group(1) = per-pass    (gbuffer, shadow map, irradiance)
// @group(2) = per-material(albedo, normal, metallic)
// @group(3) = per-draw    (model matrix, instance data)

@group(0) @binding(0) var<uniform>            u_camera:    Camera;
@group(0) @binding(1) var<uniform>            u_time:      Time;
@group(0) @binding(2) var<storage, read>      s_lights:    array<Light>;

@group(2) @binding(0) var                     t_albedo:    texture_2d<f32>;
@group(2) @binding(1) var                     samp_linear: sampler;
```

Group/binding numbers are fixed engine-wide. Style packs override only `@group(2)`+.

## Entry points

```wgsl
@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOut {
    var out: VertexOut;
    out.clip_position = u_camera.view_proj * vec4<f32>(position, 1.0);
    out.world_normal  = normal;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let albedo = textureSample(t_albedo, samp_linear, in.uv).rgb;
    return vec4<f32>(albedo, 1.0);
}
```

Entry points: `vs_main` · `fs_main` · `cs_main`. Always. Toolchain looks up by name.

## Comments

Header on every file (mandatory). Section comments delineate stages. Inline comments only for non-obvious math.

```wgsl
// ---- PBR: GGX specular ----
//
// Cook-Torrance BRDF, GGX distribution, Smith geometry, Fresnel-Schlick.
// Reference: Burley 2012 "Physically-Based Shading at Disney".
fn brdf_ggx(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, roughness: f32, f0: vec3<f32>) -> vec3<f32> {
    let h = normalize(v + l);
    let n_dot_h = max(dot(n, h), 0.0);
    let alpha   = roughness * roughness;
    let alpha2  = alpha * alpha;
    let denom   = n_dot_h * n_dot_h * (alpha2 - 1.0) + 1.0;
    let d       = alpha2 / (PI * denom * denom);
    // ... Smith G, Schlick F, ...
}
```

→ `comments.md` (WHY not WHAT)

## Hot-reload-safe patterns

| Do | Don't |
|----|-------|
| Use `const` for compile-time constants | Use `let` outside functions |
| Branch on uniforms (dynamic) | Use `#ifdef`-style preprocessor when uniform branch works |
| Use storage buffers for variable counts | Hard-code array sizes that change with content |
| Keep entry-point signature stable | Add/remove vertex attributes between hot reloads |
| One pipeline per `.wgsl` | Combine pipelines into one file |

Pipeline state derives entirely from the WGSL + a render-graph node descriptor. Render graph caches by content hash. → `docs/specs/renderer/shaders.md`

## Numerical hygiene

- All f32 literals: trailing `.0` (e.g., `1.0`, not `1`).
- Divisions guarded: `max(x, 1e-6)` for denominators.
- `normalize(v)` only when `length(v) > 0`. Use `safe_normalize` helper for unknown vectors.
- No `pow(x, n)` for integer `n` — use `x * x` etc.

## Forbidden

| Pattern | Why |
|---------|-----|
| Implicit struct padding | Misaligned uniform = silent corruption |
| `var<workgroup>` without size comment | Tuning later requires re-derivation |
| Reading uninitialised `var` | UB on some backends |
| `loop {}` without bounded iteration count | Driver hangs |
| Texture sampling outside `@fragment` / explicit grad | Some backends reject |
| Hidden global state | Breaks hot reload |

## CI gate

```bash
naga-cli validate <file>                      # syntax + semantic
naga-cli convert <file> --to spv              # SPIR-V backend probe
naga-cli convert <file> --to msl              # Metal backend probe
naga-cli convert <file> --to hlsl             # DX backend probe
naga-cli convert <file> --to glsl --version 300es  # WebGL fallback
```

Every shader compiles to every backend. CI rejects on any backend failure.

Cite: gpuweb/gpuweb WGSL spec · gfx-rs/naga.

## File header

```wgsl
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
```

## Cross-link

- → `docs/specs/renderer/shaders.md` · → `docs/specs/renderer/pbr.md`
- → `docs/specs/styles/overview.md` (per-style overrides)
- → `comments.md` · → `naming.md` · → `formatting-tools.md`
