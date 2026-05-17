<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# FPS Genre Module

> First-person shooter primitives: character controller, weapon stack, deterministic ballistics, hit detection (hitscan + projectile), ADS, recoil patterns.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.fps]
version = "0.1"
hit_model = "hybrid"      # "hitscan" | "projectile" | "hybrid"
netcode = "server-auth"   # "server-auth" | "rollback"
```

## Boundaries

- Owns: weapon definitions, fire control, recoil curves, ADS state, hit registration, damage events, ammo/reload state, FOV control, view-model rig.
- Does NOT own: character physics body (→ `docs/specs/physics/character.md`), audio cues (→ `docs/specs/audio/spatial.md`), VFX (→ `docs/specs/renderer/particles.md`), netcode transport (→ `docs/specs/networking/replication.md`).
- Depends on: core ECS, physics raycast, animation, input, networking replication, telemetry.

## Architecture

```
Input ─► FireControl ─► AmmoState
            │              │
            ▼              ▼
        Spread/Recoil   ReloadFSM
            │
            ▼
       ┌────────────┐
       │ HitProbe   │── hitscan ──► Physics::raycast ──┐
       │            │── projectile ► ProjectileSystem ─┤
       └────────────┘                                  ▼
                                               DamageEvent ──► Telemetry
```

## Public API

```rust
// component
pub struct Weapon { def: WeaponDefId, mag: u16, reserve: u32, fire_mode: FireMode }
pub struct AdsState { factor: f32 /* 0..1 */, target: f32 }
pub struct RecoilState { yaw: f32, pitch: f32, kick_t: f32 }

// resources
pub struct WeaponRegistry; // WeaponDefId → WeaponDef (RON/TOML data-driven)

// systems (ordered)
fn fire_control_system(...);
fn recoil_apply_system(...);
fn ads_blend_system(...);
fn hit_resolution_system(...);
fn reload_fsm_system(...);

// events
pub enum FpsEvent { Fired{wep,origin,dir}, Hit{victim,attacker,dmg,part}, Reload{stage}, AdsToggle{on} }
```

## Weapon Definition (data, not code)

```toml
[weapon.ak47]
fire_mode = "auto"
rpm = 600
mag = 30
reload_s = 2.4
damage_base = 36
falloff = [[10, 1.0], [40, 0.7], [80, 0.4]]
spread_static_deg = 0.6
spread_move_mul = 2.5
recoil_pattern = "ak47.csv"   # yaw,pitch per shot index
projectile = "hitscan"        # or "bullet_762"
```

## Hit Model

| Mode | Path | Use when |
|---|---|---|
| hitscan | Physics::raycast(origin,dir,range) on fire | low-latency arcade FPS |
| projectile | spawn projectile entity, integrate, swept-collide | tactical, ballistic drop |
| hybrid | hitscan ≤ X m, projectile beyond | rifles + DMRs |

Hitboxes are per-bone capsules; damage multiplier table per part (head 2.0, chest 1.0, limb 0.75) — designer-overridable.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| Fire→hit latency (hitscan, local) | <1 ms | 4 ms |
| Max concurrent projectiles | 4096 | 8192 |
| Recoil sample lookup | O(1) | — |
| Per-frame weapon system cost (64 players) | <0.4 ms | 1 ms |
| Determinism (hybrid mode) | bit-exact under fixed-tick | [BENCHMARK NEEDED] |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `FPS_E001` | unknown WeaponDefId | reject spawn |
| `FPS_E002` | recoil pattern length 0 | fall back to flat |
| `FPS_E010` | fire while reloading | ignore, emit denial event |
| `FPS_E020` | projectile budget exceeded | drop, telemetry warn |

## Integration Points

- Character motion: → `docs/specs/physics/character.md` (ADS slow factor, jump penalty).
- Netcode: server-auth path → `docs/specs/networking/replication.md`; rollback path → `docs/specs/networking/rollback.md`.
- Audio: emits spatial one-shots on Fired/Hit/Reload → `docs/specs/audio/spatial.md`.
- Agent: every event flows to `docs/specs/agent/telemetry.md` schema `fps.*`.

## Telemetry (per event)

```json
{"t":12.43,"sys":"fps","evt":"hit","attacker":42,"victim":17,"wep":"ak47","part":"head","dmg":72.0,"dist":23.7}
```

## Test Requirements

- Stationary shooter, stationary target at 50 m, ak47 single-fire → hit rate ≥ 98% over 1000 shots.
- Recoil pattern reproducible: same seed + inputs → identical view delta.
- Reload interrupt by switch-weapon cancels FSM without ammo loss.
- 64 concurrent shooters, headless 240 Hz, no allocation in steady state.
- Rollback resim of 8 frames with 100 projectiles produces identical state hash.

## Prior Art

- Overwatch netcode (Tim Ford, GDC 2017) ✓ favor-the-shooter rewind window.
- CS:GO sub-tick ✓ input timestamping in hit resolution.
- Valorant 128-tick + Fog of War (Riot tech blog) ✓ server-auth hit model.
- Halo CE recoil ✗ purely random — Nexus uses pattern + bloom.

## Open Questions

- [DECISION NEEDED] Default lag-compensation window (Overwatch=200 ms, CS=200 ms, Valorant=~7 ticks).
- [DECISION NEEDED] Wallbang material penetration table — engine-level or per-game?
- [BENCHMARK NEEDED] hybrid mode determinism under f32 vs fixed.
