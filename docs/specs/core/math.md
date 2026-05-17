<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Core / Math

> Fixed coordinate convention (right-handed, Y-up, -Z forward). SIMD-accelerated vec/mat/quat. Fixed-point arithmetic available for deterministic netcode and physics.

## Boundaries

- **Owns**
  - Scalar conveniences (`Float`, `Real` type aliases for `f32` / fixed mode).
  - Vector types: `Vec2`, `Vec3`, `Vec3A` (SIMD-aligned `Vec3` padded to 16 B), `Vec4`, `IVec2/3/4`, `UVec2/3/4`, `DVec2/3/4`.
  - Matrix types: `Mat2`, `Mat3`, `Mat3A`, `Mat4`, `DMat4`.
  - Rotations: `Quat`, `DQuat`, `EulerXYZ`, `EulerYXZ`, `EulerZYX`.
  - Transform composition: `Affine2`, `Affine3A` (3×4 + scale-rotation, common renderer/physics transform).
  - Coordinate-space helpers: `WorldSpace`, `LocalSpace`, `ViewSpace`, `ClipSpace`, `ScreenSpace` (phantom-typed where ergonomic, runtime-tagged elsewhere — `[DECISION NEEDED]`).
  - Geometry: `Aabb2`, `Aabb3`, `Obb3`, `Sphere`, `Ray`, `Plane`, `Frustum`, `Capsule`, `Triangle`.
  - Intersection / distance / closest-point primitives.
  - Curve types: `Spline` (linear / Hermite / Catmull-Rom / Bezier / B-spline).
  - Easing functions (Penner set).
  - Color: `Color::srgb`, `Color::linear`, `Color::hsl`, `Color::oklab`.
  - Random number generation (deterministic PRNG: SplitMix64 + Xoshiro256++).
  - Noise: Perlin, Simplex, Worley, Value (used by terrain and VFX).
  - Fixed-point: `Fix32` (Q16.16) and `Fix64` (Q32.32) with full arithmetic; conversion guards.
  - SIMD utilities (`f32x4`, `f32x8` portable SIMD via `std::simd` when stable; `wide` crate fallback).
  - Hashing helpers for math types (deterministic, cross-platform).
- **Does NOT own**
  - Linear algebra solvers beyond `Mat4::inverse` (no general LAPACK; SVD/eigendecomp lives in physics if needed).
  - Spatial acceleration structures (BVH, octree) → built on these primitives but live in `physics` and `renderer`.
  - Shading math (PBR BRDF) — uses these types but defined in `docs/specs/styles/pbr.md`.
  - Animation interpolation (keyframe blending) — uses `Quat::slerp` etc. but lives in `assets` / `renderer`.
  - Game-logic curves (stat curves, drop tables) — separate concern.
- **Depends on**
  - **Nothing in `core::*`** — math is the lowest layer alongside `core::hal`. Pure CPU code. Required by everyone else.
  - Optional: `bytemuck` for POD casts; `portable-simd` (stable) or `wide` crate (until stable).

## Architecture

```
                ┌─────────────────────────────────────────┐
                │           Real (= f32 | Fix32)          │
                └────────────────┬────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   Vec/Mat/Quat            Geometry                 Color / Noise
   (SIMD on f32 path)      (Aabb,Ray,Plane,...)     (PRNG, sRGB↔linear)
        │
        │  Type-tagged spaces (optional)
        ▼
   Vec3<World>  Vec3<Local>  Vec3<View>  Vec3<Clip>
        │  conversions go through Mat4<From, To>
        ▼
   Affine3A  ←→  Transform { translation, rotation, scale }
                 │
                 └─► used as ECS component (core::ecs)
```

**Coordinate convention.** Right-handed, Y-up, -Z forward (matches glTF 2.0, Blender export, Unity-with-flag, Three.js). Rationale: this is the dominant convention in modern open-source 3D pipelines; minimizes import conversion. Engine code asserting otherwise is a bug.

- Forward: `-Z`
- Right: `+X`
- Up: `+Y`
- Rotation order convention for Euler: ZYX intrinsic by default (pitch=X, yaw=Y, roll=Z applied as yaw → pitch → roll).
- Matrices are column-major in storage, post-multiplication semantics (`M * v` transforms `v`). Cross-ref `docs/specs/renderer/shaders.md` — WGSL is column-major too; uploads are zero-conversion.
- World units: 1.0 = 1 meter. Time units: seconds (`f32`) or fixed-step ticks (`u32`).
- Angles: radians everywhere in code; degrees only at user-facing boundaries (editor inspectors, asset metadata).
- Clip space: depth 0..1, Y-down post-projection (matches WebGPU / Vulkan / Metal / DX12 — not OpenGL). Projection matrix accounts for this.

**SIMD strategy.** Default scalar fallback always works. SIMD path engaged when `f32x4` width matches: `Vec4`, `Mat4`, `Quat`, `Affine3A` use it; `Vec3A` is `Vec3` padded to 16 B for SIMD-friendliness (cost: 4 bytes per `Vec3A`; gain: 2-3× on transform-heavy hot loops). `Vec3` remains 12 B for storage density (ECS components, mesh vertices). Convert `Vec3 ↔ Vec3A` at hot-loop boundaries.

Backend selection at compile time:
- `aarch64`: NEON via `std::simd` / `core::arch::aarch64`.
- `x86_64`: SSE2 baseline (guaranteed by ABI), AVX2 opt-in via `target-feature`. AVX-512 only behind explicit feature flag (downclocks).
- `wasm32`: WASM SIMD128 (browser-availability >98 %).
- portable-simd preferred when stable (cleaner code, all targets); else `wide` crate.

We will not invent our own glam; we will likely depend on / vendor `glam` as the underlying SIMD impl (battle-tested, used by Bevy and many others) and re-export under our names. The space-tagged wrappers and fixed-point types are ours. (`[DECISION NEEDED]` — depend on glam vs. inline a stripped subset.)

**Fixed-point mode.** A `cargo` feature `fixed-math` switches the `Real` type alias to `Fix32` (Q16.16, ±32 768 range, 1/65 536 precision). Required for:
- Lockstep / rollback netcode (`docs/specs/networking/rollback.md`)
- Deterministic replay across CPU architectures (`docs/specs/agent/replay.md`)
- Determinism-critical physics (`docs/specs/physics/determinism.md`)

`Fix32` arithmetic is bit-identical across x86_64, aarch64, wasm32 — `f32` is *not*, because of fused-multiply-add, transcendental approximations, and rounding mode variation. Trigonometry on `Fix32` uses lookup tables (256-entry quarter-sine, linear interp) for cross-arch identity. Performance cost: ~2× slower than `f32` for arithmetic, ~5× slower for trig. Acceptable for netcode-bound simulation; not used for renderer.

A subset of types has dual implementations: `Vec3f` (always f32, for renderer) and `Vec3` (= `Vec3f` in float mode, = `Vec3<Fix32>` in fixed mode). Physics integrates over `Vec3`. Renderer always over `Vec3f`. Conversion at the physics↔renderer boundary.

**Determinism without fixed-point** is also offered: a `deterministic-f32` feature enforces strict IEEE 754 (no FMA contraction, `ffp-contract=off`, no `--fast-math`, no SSE4.1 round-to-nearest variants), no use of `f32::sin`/`cos`/`tan` (use our own lookup-based approximations). This is best-effort cross-arch determinism; the safest answer remains `Fix32`.

**Hashing.** Math types implement a stable, byte-deterministic hash (independent of `Hasher` choice) for snapshot/replay. Float NaN canonicalized to a single bit pattern; -0.0 hashed as +0.0.

## Public API

(condensed — full list in `crates/nexus-math/src/lib.rs` when implementation lands)

```rust
// Type alias controlling float vs fixed
#[cfg(not(feature = "fixed-math"))] pub type Real = f32;
#[cfg(feature = "fixed-math")]      pub type Real = Fix32;

// === Vectors ===
#[repr(C)] pub struct Vec2 { pub x: Real, pub y: Real }
#[repr(C)] pub struct Vec3 { pub x: Real, pub y: Real, pub z: Real }
#[repr(C, align(16))] pub struct Vec3A(/* SIMD f32x4 with w ignored */);
#[repr(C, align(16))] pub struct Vec4 { pub x: Real, pub y: Real, pub z: Real, pub w: Real }
// Always-f32 variants for renderer-facing code:
#[repr(C)] pub struct Vec2f { pub x: f32, pub y: f32 }
#[repr(C)] pub struct Vec3f { pub x: f32, pub y: f32, pub z: f32 }

impl Vec3 {
    pub const ZERO: Vec3; pub const ONE: Vec3; pub const X: Vec3; pub const Y: Vec3; pub const Z: Vec3;
    pub fn new(x: Real, y: Real, z: Real) -> Vec3;
    pub fn length(self) -> Real;
    pub fn length_squared(self) -> Real;
    pub fn normalize(self) -> Vec3;                 // panics on zero in debug; returns ZERO in release
    pub fn try_normalize(self) -> Option<Vec3>;
    pub fn dot(self, rhs: Vec3) -> Real;
    pub fn cross(self, rhs: Vec3) -> Vec3;
    pub fn lerp(self, rhs: Vec3, t: Real) -> Vec3;
    pub fn slerp(self, rhs: Vec3, t: Real) -> Vec3;
    pub fn distance(self, rhs: Vec3) -> Real;
    pub fn reflect(self, normal: Vec3) -> Vec3;
    pub fn project_onto(self, other: Vec3) -> Vec3;
    pub fn min(self, rhs: Vec3) -> Vec3;
    pub fn max(self, rhs: Vec3) -> Vec3;
    pub fn clamp(self, min: Vec3, max: Vec3) -> Vec3;
    pub fn abs(self) -> Vec3;
    pub fn is_finite(self) -> bool;
}

// === Matrices ===
#[repr(C, align(16))] pub struct Mat4 { pub cols: [Vec4; 4] }
impl Mat4 {
    pub const IDENTITY: Mat4;
    pub fn from_cols(c0: Vec4, c1: Vec4, c2: Vec4, c3: Vec4) -> Mat4;
    pub fn from_translation(t: Vec3) -> Mat4;
    pub fn from_rotation(q: Quat) -> Mat4;
    pub fn from_scale(s: Vec3) -> Mat4;
    pub fn from_srt(s: Vec3, r: Quat, t: Vec3) -> Mat4;
    pub fn look_at_rh(eye: Vec3, target: Vec3, up: Vec3) -> Mat4;
    pub fn perspective_rh(fov_y_rad: f32, aspect: f32, near: f32, far: f32) -> Mat4;
    pub fn perspective_infinite_reverse_rh(fov_y_rad: f32, aspect: f32, near: f32) -> Mat4;
    pub fn ortho_rh(l: f32, r: f32, b: f32, t: f32, n: f32, f: f32) -> Mat4;
    pub fn inverse(self) -> Mat4;
    pub fn transpose(self) -> Mat4;
    pub fn determinant(self) -> Real;
    pub fn transform_point3(self, p: Vec3) -> Vec3;
    pub fn transform_vector3(self, v: Vec3) -> Vec3;
    pub fn project_point3(self, p: Vec3) -> Vec3;       // perspective divide
}
pub struct Mat3 { /* ... */ }     pub struct Mat2 { /* ... */ }
pub struct Affine3A { /* 3×4 + SIMD */ }

// === Quaternion ===
#[repr(C, align(16))] pub struct Quat { pub x: Real, pub y: Real, pub z: Real, pub w: Real }
impl Quat {
    pub const IDENTITY: Quat;
    pub fn from_axis_angle(axis: Vec3, angle_rad: Real) -> Quat;
    pub fn from_euler(order: EulerOrder, a: Real, b: Real, c: Real) -> Quat;
    pub fn from_rotation_arc(from: Vec3, to: Vec3) -> Quat;
    pub fn look_to_rh(forward: Vec3, up: Vec3) -> Quat;
    pub fn normalize(self) -> Quat;
    pub fn inverse(self) -> Quat;
    pub fn slerp(self, rhs: Quat, t: Real) -> Quat;
    pub fn lerp(self, rhs: Quat, t: Real) -> Quat;
    pub fn mul_quat(self, rhs: Quat) -> Quat;
    pub fn mul_vec3(self, v: Vec3) -> Vec3;
    pub fn to_axis_angle(self) -> (Vec3, Real);
    pub fn to_euler(self, order: EulerOrder) -> (Real, Real, Real);
}

// === Transform component (ECS) ===
#[repr(C)] pub struct Transform { pub translation: Vec3, pub rotation: Quat, pub scale: Vec3 }
impl Transform {
    pub const IDENTITY: Transform;
    pub fn from_xyz(x: Real, y: Real, z: Real) -> Transform;
    pub fn to_matrix(&self) -> Mat4;
    pub fn looking_at(self, target: Vec3, up: Vec3) -> Transform;
    pub fn mul_transform(&self, rhs: &Transform) -> Transform;
    pub fn forward(&self) -> Vec3;                        // -Z in local space
    pub fn right(&self) -> Vec3;                          // +X
    pub fn up(&self) -> Vec3;                             // +Y
}

// === Geometry ===
pub struct Aabb3 { pub min: Vec3, pub max: Vec3 }
impl Aabb3 {
    pub fn from_min_max(min: Vec3, max: Vec3) -> Aabb3;
    pub fn from_center_extents(center: Vec3, extents: Vec3) -> Aabb3;
    pub fn from_points(pts: &[Vec3]) -> Aabb3;
    pub fn contains_point(self, p: Vec3) -> bool;
    pub fn intersects(self, other: Aabb3) -> bool;
    pub fn intersects_ray(self, ray: Ray) -> Option<Real>;     // t value
    pub fn merge(self, other: Aabb3) -> Aabb3;
    pub fn surface_area(self) -> Real;
}
pub struct Ray    { pub origin: Vec3, pub dir: Vec3 }
pub struct Plane  { pub normal: Vec3, pub d: Real }
pub struct Sphere { pub center: Vec3, pub radius: Real }
pub struct Frustum { pub planes: [Plane; 6] }
impl Frustum {
    pub fn from_view_proj(vp: Mat4) -> Frustum;
    pub fn contains_sphere(&self, s: Sphere) -> Containment;
    pub fn contains_aabb(&self, a: Aabb3) -> Containment;
}
pub enum Containment { Outside, Intersecting, Inside }

// === Fixed-point ===
#[repr(transparent)] pub struct Fix32(pub i32);     // Q16.16
impl Fix32 {
    pub const ZERO: Fix32; pub const ONE: Fix32; pub const PI: Fix32;
    pub fn from_int(i: i32) -> Fix32;
    pub fn from_f32(f: f32) -> Fix32;                  // debug-asserts in range
    pub fn to_f32(self) -> f32;
    pub fn sqrt(self) -> Fix32;                        // LUT + Newton
    pub fn sin(self) -> Fix32;                         // 256-entry quarter-sine LUT
    pub fn cos(self) -> Fix32; pub fn tan(self) -> Fix32;
    pub fn atan2(y: Fix32, x: Fix32) -> Fix32;
}
impl Add/Sub/Mul/Div/Neg for Fix32 { /* saturating, with debug-mode overflow check */ }

// === Color ===
pub struct Color { pub r: f32, pub g: f32, pub b: f32, pub a: f32 }    // linear sRGB
impl Color {
    pub fn srgb(r: f32, g: f32, b: f32) -> Color;                // converts in
    pub fn srgb_u8(r: u8, g: u8, b: u8) -> Color;
    pub fn linear(r: f32, g: f32, b: f32) -> Color;
    pub fn hex(s: &str) -> Result<Color, ErrMath>;
    pub fn to_srgb_u8(self) -> [u8; 4];
    pub fn lerp(self, rhs: Color, t: f32) -> Color;              // in linear space
    pub fn oklab(self) -> Oklab; pub fn from_oklab(o: Oklab) -> Color;
}

// === PRNG ===
pub struct Rng { /* SplitMix64 seed → Xoshiro256++ state */ }
impl Rng {
    pub fn from_seed(seed: u64) -> Rng;
    pub fn split(&mut self) -> Rng;                              // independent stream
    pub fn next_u64(&mut self) -> u64;
    pub fn next_f32(&mut self) -> f32;                           // [0, 1)
    pub fn range_u32(&mut self, lo: u32, hi: u32) -> u32;
    pub fn range_f32(&mut self, lo: f32, hi: f32) -> f32;
    pub fn shuffle<T>(&mut self, slice: &mut [T]);
    pub fn pick<'a, T>(&mut self, slice: &'a [T]) -> Option<&'a T>;
    pub fn unit_vec3(&mut self) -> Vec3;
    pub fn unit_quat(&mut self) -> Quat;
}

// === Noise ===
pub fn perlin_2d(x: f32, y: f32, seed: u32) -> f32;     // [-1, 1]
pub fn perlin_3d(p: Vec3, seed: u32) -> f32;
pub fn simplex_3d(p: Vec3, seed: u32) -> f32;
pub fn worley_3d(p: Vec3, seed: u32) -> (f32, f32);     // (F1, F2)

// === Easing ===
pub mod ease {
    pub fn linear(t: f32) -> f32;
    pub fn in_quad(t: f32) -> f32; pub fn out_quad(t: f32) -> f32;
    pub fn in_out_quad(t: f32) -> f32;
    pub fn in_cubic(t: f32) -> f32; pub fn out_cubic(t: f32) -> f32;
    pub fn in_out_cubic(t: f32) -> f32;
    pub fn elastic_out(t: f32) -> f32; pub fn bounce_out(t: f32) -> f32;
    // ... full Penner set
}
```

## Performance Contract

| Operation | Target (`f32`) | Hard limit | Notes |
|---|---|---|---|
| `Vec3::dot` / `cross` | ≤ 2 ns | 8 ns | scalar; SIMD via `Vec3A` 2× faster |
| `Vec4 * Vec4` (componentwise) | ≤ 1 ns | 4 ns | SIMD |
| `Mat4 * Mat4` | ≤ 12 ns | 40 ns | 4×4 SIMD |
| `Mat4 * Vec4` (point transform) | ≤ 4 ns | 12 ns | |
| `Mat4::inverse` (general) | ≤ 40 ns | 120 ns | |
| `Mat4::inverse` (affine) | ≤ 15 ns | 50 ns | dedicated path |
| `Quat::slerp` | ≤ 18 ns | 60 ns | |
| `Quat * Vec3` | ≤ 8 ns | 25 ns | |
| `Aabb3::intersects_ray` | ≤ 6 ns | 20 ns | slab method |
| `Frustum::contains_sphere` | ≤ 12 ns | 40 ns | 6 plane dots |
| `Rng::next_u64` | ≤ 2 ns | 8 ns | |
| `perlin_3d` | ≤ 80 ns | 300 ns | |
| `Fix32 * Fix32` | ≤ 1 ns | 4 ns | int mul + shift |
| `Fix32::sin` | ≤ 12 ns | 40 ns | LUT + lerp |
| Cross-arch determinism (`Fix32` arithmetic) | bit-identical | bit-identical | x86_64, aarch64, wasm32 |
| Cross-arch determinism (`f32` arithmetic in `deterministic-f32` mode) | bit-identical | bit-identical | best-effort; trig path uses LUT |
| Memory: `Vec3` | 12 B | n/a | for storage |
| Memory: `Vec3A` | 16 B | n/a | for SIMD hot loops |
| Memory: `Mat4` | 64 B | n/a | |
| Memory: `Transform` | 40 B | 48 B | translation+quat+scale |

`[BENCHMARK NEEDED]` on reference rigs (modern desktop x86_64, M-series aarch64, mid-range Android aarch64, browser wasm32+SIMD).

## Error Contract

Math is mostly infallible. Errors only at the API boundary where data validation is needed.

| Code | Meaning | Caller action |
|---|---|---|
| `MATH.E001` | NaN / non-finite input in debug | Caller bug; release-mode propagates NaN |
| `MATH.E002` | Zero-length vector normalize | Use `try_normalize`; release returns ZERO |
| `MATH.E003` | Mat4 determinant ≈ 0 on inverse | Returns garbage in release; debug warns |
| `MATH.E004` | Fixed-point overflow (debug) | Use `Fix64`; saturate in release |
| `MATH.E005` | Color hex parse failure | Caller fixes input string |
| `MATH.E006` | Frustum plane normalization failed (degenerate VP) | Recompute view-proj |
| `MATH.E007` | Spline t out of `[0,1]` (when bounded mode) | Caller chooses extrapolate or clamp |
| `MATH.E008` | Quaternion drift (length far from 1) on long chain | Renormalize periodically |
| `MATH.E009` | Mixed-mode op (`f32` ↔ `Fix32` without explicit conversion) | Compile-time error (preferred) or runtime panic in debug |

## Integration Points

- **`core::ecs`** — `Transform` is a built-in component. `GlobalTransform(Mat4)` produced by a built-in transform-propagation system. → `docs/specs/core/ecs.md`
- **`renderer`** — uses `Vec3f`/`Mat4`/`Affine3A` exclusively (renderer always-f32 regardless of `fixed-math` feature). View, projection, frustum culling, draw-call transforms. → `docs/contracts/core-renderer.md`
- **`physics`** — integrates in `Real`; if `fixed-math` enabled the integration is bit-deterministic. Else, see `docs/specs/physics/determinism.md` for f32 caveats.
- **`networking`** — rollback / lockstep uses `Fix32` for shared simulation state; deltas are byte-comparable. → `docs/specs/networking/rollback.md`
- **`agent`** — semantic API helpers ("near castle" → spatial query) use `Aabb3`, `Sphere`, `Frustum`. → `docs/specs/agent/semantic.md`
- **`scripting`** — math types are exposed read-only as userdata in Lua/Rune; bridge avoids per-op allocations. → `docs/contracts/core-scripting.md`
- **`assets`** — mesh loaders / texture importers produce `Vec3f`, `Aabb3`; glTF Y-up is direct, FBX/COLLADA Z-up needs conversion at import. → `docs/specs/assets/import.md`
- **`audio`** — 3D positional audio uses `Vec3f` for listener / source positions. → `docs/specs/audio/spatial.md`

## Test Requirements

1. `mat4_inverse_identity` — `M.inverse() * M ≈ Mat4::IDENTITY` (||delta|| < 1e-5) for 10 000 random affine matrices.
2. `quat_slerp_endpoints` — `slerp(a, b, 0) == a`, `slerp(a, b, 1) == b`, length ≈ 1 throughout.
3. `quat_mul_vec3_matches_mat3` — `q.mul_vec3(v) ≈ Mat3::from(q) * v` to 1e-6.
4. `transform_compose_associative` — `(a.mul(b)).mul(c) ≈ a.mul(b.mul(c))` for 1000 random transforms.
5. `aabb_intersects_ray_correctness` — analytical comparison on 10 000 synthetic cases.
6. `frustum_culling_consistency` — every point inside a sphere reported `Inside` is inside all 6 planes; every point outside fails at least one plane.
7. `fix32_arithmetic_cross_arch` — same sequence of ops on x86_64, aarch64, wasm32 produces identical bit pattern (CI gate).
8. `fix32_trig_max_error` — `Fix32::sin/cos` max absolute error vs. f64 reference < 1e-4 over [-2π, 2π].
9. `f32_deterministic_mode_cross_arch` — under `deterministic-f32`, the cross-arch test produces identical results for the engine's used ops (`+ - * /`, `sqrt`, our LUT trig).
10. `rng_reproducible` — `Rng::from_seed(s)` → fixed first 1024 values; bit-identical across architectures.
11. `rng_quality_smallcrush` — passes `TestU01 SmallCrush`; `practrand` no failure to 2^36 bytes.
12. `noise_continuity` — perlin/simplex C¹ continuous (numerical derivative test).
13. `coordinate_convention_invariants` — `Transform::IDENTITY.forward() == -Vec3::Z`, `right() == Vec3::X`, `up() == Vec3::Y`.
14. `gltf_import_no_rotation_needed` — loading a glTF cube produces vertex positions matching engine convention bit-identically.
15. `simd_equals_scalar` — for every SIMD path, output ≈ scalar reference within 1 ULP (or exact for integer ops); fuzz with 1 M random inputs.
16. `mem_layout_repr_c` — `mem::size_of::<Vec3>() == 12`, `<Vec3A>() == 16`, `<Mat4>() == 64`, `<Quat>() == 16` (32 in fixed mode), `<Transform>() == 40` (or 48 in fixed mode).
17. `bytemuck_pod_safe` — all `#[repr(C)]` math types are `Pod` (zero padding except `Vec3A`'s explicit pad lane).
18. `color_srgb_roundtrip` — `Color::srgb_u8(r,g,b).to_srgb_u8() == [r,g,b,255]` for all 256³ values within ±1 LSB (gamma rounding).
19. `oklab_perceptual_uniform` — synthetic test: equal Oklab steps look perceptually equal (regression against reference table).
20. `no_panic_release` — fuzz `Mat4::inverse`, `Vec3::normalize`, `Quat::slerp`, `Color::hex` with random / adversarial inputs; release build never panics.

## Prior Art

- **`glam`** (`bitshifter/glam-rs`) — battle-tested Rust SIMD math used by Bevy.
  - ✓ Clean API, fast, well-tested, multi-target SIMD.
  - ✓ Provides `Vec3A`, `Affine3A` distinctions that match our needs.
  - ✗ No fixed-point, no space-tagging, no deterministic-f32 mode.
  - Likely: depend on `glam` as backend and add our extensions on top. (`[DECISION NEEDED]`)
- **`cgmath`** — older but well-considered. Type-class-heavy.
- **`nalgebra`** — full linear algebra; too large for engine hot path. May use in tools / editor.
- **glTF 2.0 spec** — defines RH/Y-up/-Z forward convention we adopt.
- **Eric Lengyel, *Foundations of Game Engine Development*, vol. 1 (Mathematics)** — reference for matrix conventions, projection math, quaternion derivations.
- **Christer Ericson, *Real-Time Collision Detection*** — source for `Aabb::intersects_ray` (slab method), `Frustum::contains` (plane tests), `Sphere::closest_point_on_aabb`, etc.
- **TLSF paper-style determinism analysis** — informs our cross-arch testing methodology for fixed-point.
- **GGPO docs (Tom Cannon)** on rollback netcode — informs the requirement for deterministic math; cross-ref `docs/prior-art/ggpo.md`.
- **Inigo Quilez's writings on Smin / SDF / noise** — likely influence on our noise and analytical primitives library v1.1+.
- **Bullet Physics math** — informs Affine3A layout choice (3×4 transform is the physics standard).
- **Three.js coordinate convention** — same as ours; informs the import-by-default expectation.
- **Unity convention (LH, Y-up, +Z forward)** — explicitly NOT followed; we document the difference and provide a `unity_import` helper that flips Z.
- **Unreal convention (LH, Z-up, +X forward)** — explicitly NOT followed; documented difference.

## Open Questions

1. `[DECISION NEEDED]` — Depend on `glam` directly, or vendor a stripped subset? Bias: depend (with `default-features = false`), add our `Fix32`, `Vec3f` aliases, space tagging, and noise/PRNG on top.
2. `[DECISION NEEDED]` — Space tagging (`Vec3<World>`, `Vec3<Local>`) as phantom-type wrappers, or purely a convention? Phantom-types catch real bugs (passing a local-space normal to a world-space function) but explode API surface and complicate generic code. Bias: phantom-typed `Point<S>` and `Direction<S>` newtypes around `Vec3`, optional, opt-in per call-site.
3. `[DECISION NEEDED]` — `Real` type alias controlled by feature flag vs. dual `f32` and `Fix32` types always coexisting. Feature-flag approach lets a project pick one mode globally (simpler); dual-coexist allows physics in fixed and renderer in float in the same build (we already need this for the rollback path). Bias: both — `Real` for the project default, `f32` and `Fix32` always available.
4. `[BENCHMARK NEEDED]` — All perf numbers, esp. SIMD vs. scalar on wasm.
5. `[DECISION NEEDED]` — Default Euler order (ZYX vs YXZ vs XYZ). Most "yaw/pitch/roll" conventions imply Y-then-X-then-Z (intrinsic, ZYX extrinsic). Confirm vs. what `[AGENT: 03]` renderer and `[AGENT: 12]` genre modules expect.
6. `[DECISION NEEDED]` — Deterministic-f32 mode policy on trig: ship our own LUT-based `sin`/`cos`/`tan`/`atan2` (cross-arch bit-identical, but slightly less accurate) by default, and forbid `f32::sin` etc. via clippy lint? Bias: yes; document accuracy.
7. `[DECISION NEEDED]` — Color storage: f32 in linear sRGB, or half-float? Half saves memory on huge per-vertex color arrays; f32 simpler. Bias: f32 everywhere; renderer compresses at upload.
8. `[DECISION NEEDED]` — Splines: store control polygons as `SmallVec<[Vec3; 4]>` or `Box<[Vec3]>`? Affects ECS component cost. `[AGENT: 12]` genre racing track and platformer ledge curves to weigh in.
9. `[DECISION NEEDED]` — Should the renderer-facing `Vec3f` and the simulation `Vec3` ever be the same type at compile time when not in fixed mode? Saves API surface; risks confusing the fixed-mode build. Bias: keep distinct types, transmute is allowed and zero-cost in float mode.
