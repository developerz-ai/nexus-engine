<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Racing Genre Module

> Racing primitives: vehicle physics (arcade + sim), track topology, checkpoint/lap counting, racing-line AI with rubber-band scaling, slipstream/drafting.

**Plug-in.** Declared in `Nexus.toml`:
```toml
[genres.racing]
version = "0.1"
vehicle_model = "arcade"     # "arcade" | "semisim" | "sim"
tire_model = "pacejka_lite"  # "pacejka_lite" | "pacejka_full"
ai_difficulty = "adaptive"
```

## Boundaries

- Owns: vehicle components (chassis, wheels, engine, drivetrain), track graph, checkpoints, lap counter, race director, AI driver, rubber-band scaling.
- Does NOT own: rigid body integration (→ `docs/specs/physics/rigid.md`), terrain (→ `docs/specs/renderer/terrain.md`).
- Depends on: physics, audio (engine + tire), input.

## Architecture

```
   ┌─────────────────────────────────────┐
   │           Vehicle Entity            │
   │  ┌───────┐  ┌────────┐  ┌─────────┐ │
   │  │Chassis│  │Drivetr.│  │Wheels[4]│ │
   │  │(rigid)│◄─┤(eng+tx)├─►│(tire fr)│ │
   │  └───┬───┘  └────────┘  └────┬────┘ │
   └──────┼───────────────────────┼──────┘
          │                       │
          ▼                       ▼
     Physics                  Tire forces (Pacejka-lite)
          │
          ▼
   RaceDirector ── Track graph + Checkpoints[]
          │
          ▼
   AI Driver ── racing line spline + lookahead steer

   Rubber-band: scale grip/power vs leader gap.
```

### Track Graph

```
Track = ordered sequence of sectors.
Each sector: spline center, width, racing-line spline, checkpoint plane.
Lap counted on completion of all checkpoints in order.

Sector cw layout:
  ◄── racing line spline ──►
  ════════════════════════════   right edge
  |     |     |     |     |     checkpoint planes
  ════════════════════════════   left edge
```

## Public API

```rust
// components
pub struct Vehicle { def: VehicleDefId, gear: i8, rpm: f32, speed_mps: f32 }
pub struct Wheel { radius: f32, slip_long: f32, slip_lat: f32, grip: f32, contact: bool }
pub struct Driver { kind: DriverKind /*Human|Ai*/, skill: f32 /*0..1*/ }
pub struct RaceProgress { lap: u16, last_cp: u16, sector_t: f32, total_time_s: f32 }

// resources
pub struct Track { sectors: Vec<Sector>, total_length_m: f32 }
pub struct RaceDirector { state: RaceState, lap_target: u16, grid: Vec<Entity> }
pub struct AiPolicy { lookahead_m: f32, rubberband: f32, line_offset: f32 }

// systems
fn tire_force_system();
fn drivetrain_system();
fn vehicle_integrate_system();
fn checkpoint_system();
fn lap_count_system();
fn ai_drive_system();
fn rubberband_scale_system();
fn slipstream_system();

// events
pub enum RaceEvent { CheckpointPassed{e,cp,t}, LapCompleted{e,lap,t,best}, RaceFinished{e,pos,t}, Crashed{e,impact} }
```

## Tire Model (Pacejka-lite)

```
F_long = D * sin(C * atan(B * slip_long))
F_lat  = D * sin(C * atan(B * slip_lat))
combined slip ellipse → clip magnitude to friction circle
```
Coefficients per surface (asphalt, dirt, ice) from data files. Sim mode uses full Pacejka with load/camber.

## Vehicle Modes

| Mode | Wheel sim | Slip | Aids | Use |
|---|---|---|---|---|
| arcade | 4-wheel raycast | scalar grip | full TCS/ABS auto | kart/burnout |
| semisim | sprung 4-wheel | pacejka_lite | toggleable | Forza Horizon-ish |
| sim | sprung + suspension dyn | pacejka_full | none default | Assetto-ish |

## Rubber-Band AI

```
gap_to_leader = leader.total_time - self.total_time   (negative = ahead)
if gap < -3s:   throttle_mul = 0.95
if gap >  5s:   throttle_mul = 1.07 ; grip_mul = 1.05
clamp delta to ±10%; never exceed chassis design limits
```
Disable in time-trial / esports modes.

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| 32 vehicles tick @ 60 Hz | <4 ms | 12 ms |
| Tire eval per wheel | <2 µs | 8 µs |
| Checkpoint test per vehicle | <0.5 µs | 2 µs |
| AI lookahead query | <30 µs | 200 µs |

## Error Contract

| Code | Meaning | Caller action |
|---|---|---|
| `RACE_E001` | checkpoint passed out of order | flag lap invalid |
| `RACE_E002` | vehicle off-track > 3 s | auto-reset to nearest racing-line point |
| `RACE_E010` | tire model NaN (load divergence) | fallback grip, log |

## Integration Points

- Physics: vehicle uses rigid body w/ swept collision → `docs/specs/physics/rigid.md`.
- Audio: rpm-driven engine layer, tire skid → `docs/specs/audio/adaptive.md`.
- Networking: server-auth pos + client prediction → `docs/specs/networking/replication.md`.
- Agent: lap-time regression harness → `docs/specs/agent/scenarios.md`.

## Telemetry

```json
{"t":48.31,"sys":"race","evt":"lap_completed","e":3,"lap":4,"t_lap":81.45,"best":80.92}
```

## Test Requirements

- Determinism: fixed input + same vehicle on same track → same lap time across OS.
- Lap counter robust against cutting (must hit all CPs in order).
- AI completes 5-lap race on every shipped track without crash > 3× per lap (skill=0.7).
- Rubber-band gap convergence within 1 lap when forced 20-s lead.
- Tire model stable up to 400 km/h (no NaN, no negative grip).

## Prior Art

- Pacejka tire model (academic) ✓ industry standard.
- Forza Motorsport drivatar / rubberband transparency ✓.
- Mario Kart blue-shell scaling ✗ overt rubber-band; Nexus default subtle.
- Trackmania checkpoint validation ✓ — order-strict.
- Assetto Corsa physics openness ✓ inspiration for sim mode data formats.

## Open Questions

- [DECISION NEEDED] Default integrator: semi-implicit Euler vs RK4 for vehicle.
- [DECISION NEEDED] Damage model scope (visual only vs handling-impact).
- [BENCHMARK NEEDED] Suspension sim cost at 60 vehicles in sim mode.
