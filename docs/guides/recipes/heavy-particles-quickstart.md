<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Heavy Particles Quick-Start

> Day 1: Returnal-style bullet hell. 10 million particles on screen. Sustained 60 Hz.

## Prerequisites

| Need | Got? |
|---|---|
| `nexus` CLI installed | `which nexus` |
| GPU with compute + SSBO (Vulkan/Metal/D3D12) | required |
| 8 GB VRAM (for 10M particles) | recommended |
| Steam Deck or workstation | both supported (different scale) |

## Scaffold

```
nexus new mygame --template bullet-hell
cd mygame
nexus run
```

Day 1 result: top-down arena. Boss enemy in center emits 100k+ bullets in spiral patterns. Player dodges. Sustained 60 Hz.

## Resulting `Nexus.toml`

```toml
[engine]
features = ["renderer", "physics", "audio", "scripting"]

[style]
preset = "pbr"

[style.particles_heavy]
enabled         = true
capacity        = 10_000_000
determinism     = "seeded"
sort_transparent = true
compact_every   = 8
lod_distances   = [50.0, 200.0, 1000.0]
collide_depth   = true
audio_events_per_frame = 1024

[style.particles_heavy.impostor]
atlas_views     = 64
soft_blend      = true

[genres]
primary = "fps"   # twin-stick shooter; fps gets us camera + input scaffolding

[crates]
nexus-particles-gpu-sim         = "1.0"
nexus-particles-impostor-render = "1.0"
nexus-physics-determinism       = "1.0"

[scripting]
script_dirs = ["scripts/"]
```

## Modules composed

| Module | Purpose |
|---|---|
| `nexus-particles-gpu-sim` | GPU-driven emit + simulate + sort + render |
| `nexus-particles-impostor-render` | view-angle atlas impostor renderer |
| `nexus-physics/determinism` | seeded particle replay |
| `nexus-renderer` | host renderer |
| `nexus-genres/fps` | camera + input (top-down configured) |

→ Full spec: `docs/specs/renderer/particles-heavy.md`.

## Project layout

```
mygame/
  Nexus.toml
  src/main.rs
  scripts/
    boss/
      spiral-pattern.lua    # bullet pattern definitions
      ring-pattern.lua
      laser-grid.lua
    player/
      controller.lua
  assets/
    particles/
      bullet.vfx            # bullet asset (heavy variant)
      muzzle-flash.vfx
  scenarios/
    bullet-hell-10m-sustained.scenario.toml
```

## Opening scene

```rust
// src/main.rs
use nexus_engine::prelude::*;
use nexus_particles_gpu_sim::HeavyParticlesPlugin;

fn main() {
    App::new()
        .add_plugins(NexusDefaultPlugins)
        .add_plugin(HeavyParticlesPlugin::with_capacity(10_000_000))
        .add_startup_system(spawn_boss)
        .run();
}

fn spawn_boss(mut cmd: Commands, mut r: ResMut<Renderer>) {
    let bullet_vfx = r.load_vfx_heavy("particles/bullet.vfx");
    cmd.spawn((
        Boss,
        Transform::from_xyz(0.0, 0.0, 0.0),
        BulletEmitter { asset: bullet_vfx, spawn_rate: 5000.0 },
    ));
}
```

```lua
-- scripts/boss/spiral-pattern.lua
function update_pattern(boss, dt)
  boss.angle = boss.angle + dt * 90.0
  for i = 0, 31 do
    local theta = math.rad(boss.angle + i * 11.25)
    particles_heavy.emit("bullet", boss.pos, vec3(math.cos(theta), 0, math.sin(theta)) * 10.0)
  end
end
```

## Starter scenario test

`scenarios/bullet-hell-10m-sustained.scenario.toml`:

```toml
[scene]
template = "bullet-hell-arena"
[actions]
- { tick = 1,   action = "spawn", archetype = "boss",   at = [0, 0, 0] }
- { tick = 1,   action = "spawn", archetype = "player", at = [0, 0, 5] }
- { tick = 1,   action = "boss_attack_mode", mode = "spiral_x4" }
[asserts]
- { tick = 600,  predicate = "live_particles > 1_000_000" }
- { tick = 1200, predicate = "live_particles > 5_000_000" }
- { tick = 3600, predicate = "frame_budget_ms_p99 < 16.6" }     # sustained 60 Hz
- { tick = 3600, predicate = "live_particles > 8_000_000" }     # at-scale stress
- { tick = 3600, predicate = "fragmentation_pct < 30" }
```

## Next steps

| You want | Add |
|---|---|
| Deterministic replay of a perfect run | already added — `determinism = "seeded"` |
| Soft-particle compositing against sprites | already added — `impostor.soft_blend = true` |
| 2D fluid interaction (bullets push smoke) | `nexus add nexus-physics-fluid`; enable `fluid_couple_2d = true` |
| Audio per-particle hits | tune `audio_events_per_frame` and add LOD downsampling in script |
| Reduce VRAM for Steam Deck | lower `capacity = 1_000_000` (Steam Deck-target) |
| Twin-stick top-down camera | already in `nexus-genres/fps`; switch profile to `top_down` |

## Cross-links

→ `docs/specs/renderer/particles-heavy.md`
→ `docs/specs/renderer/particles.md` (baseline; this extends it)
→ `docs/specs/physics/determinism.md`
→ `docs/specs/physics/fluid.md` (cheap fluid coupling)
→ `docs/specs/styles/2-5d.md` (sprite-particle bridge for billboard games)
→ `docs/architecture/08-compose-dont-build.md` (Housemarque built bespoke for Returnal; this is day 1)

## AI-agent path

```
nexus coder bootstrap-from-recipe heavy-particles-quickstart
```
