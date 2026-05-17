<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Quickstart

> First mod in 10 minutes. One new weapon, one new texture. `nexus mod new` to `nexus mod pack` to in-game test.

## Prereqs
- `nexus` CLI installed (`curl -fsSL https://get.nexus.engine | sh`).
- A Nexus game to mod (any demo game works; we'll use the FPS demo).

## Step 1 — Scaffold

```
nexus mod new mycoolmod --tier behavior --game com.nexus.fps-demo
cd mycoolmod
```

Files:
```
mycoolmod/
├── mod.toml
├── src/lib.rn
├── assets/
├── overlays/
├── locale/en-US.ftl
├── scenarios/smoke.toml
└── LICENSE                ← MIT by default
```

`mod.toml` pre-filled with minimal valid manifest, behavior tier, `com.you.mycoolmod` id.

## Step 2 — Add a New Weapon

Edit `src/lib.rn`:

```rune
use nexus::mod::{world, events, log};

pub fn init(env: ModEnv) -> Result<Mod, ModError> {
    let w = env.cap::<WorldWrite>()?;
    let e = env.cap::<EventEmit>()?;

    log::info("mycoolmod init");

    Ok(Mod {
        on_step: |dt| {
            for (entity, input) in w.query::<Input>() {
                if input.action_just_pressed("fire_secondary") {
                    let weapon = w.spawn(#{
                        Transform: #{ pos: input.aim_point },
                        Weapon: #{ kind: "rocket_launcher" },
                        Lifetime: #{ seconds: 5.0 },
                    });
                    e.emit("weapon.spawned", #{entity: weapon});
                }
            }
        },
    })
}
```

Update `mod.toml::[capabilities]`:

```toml
[capabilities]
world.read       = ["Input", "Transform"]
world.write      = ["Transform", "Weapon", "Lifetime"]
events.emit      = ["weapon.spawned"]
log              = true
```

## Step 3 — Add a New Texture

Drop a PNG at `assets/source/rocket_albedo.png` (256×256).

Create overlay manifest `overlays/rocket_weapon.overlay.toml`:

```toml
[overlay]
target_uuid = "01HZ8XQK..."           # base rocket asset UUID (find via `nexus assets ls --kind weapon`)
target_kind = "material"
mode        = "patch"

[patch]
"albedo_texture" = "assets/source/rocket_albedo.png"
```

Engine packs the source PNG into a `.nxa` at `nexus mod pack` time.

## Step 4 — Test In-Game (Hot-Reload)

```
nexus mod watch
```

Launches the FPS demo with your mod hot-loaded. Edit any file in `src/` or `assets/`; the mod reloads in < 100 ms. → `docs/specs/mods/hot-reload.md`.

Smoke test:

```
nexus mod test scenarios/smoke.toml
```

Runs the headless scenario from `scenarios/` (→ `docs/specs/agent/scenarios.md`).

## Step 5 — Pack

```
nexus mod pack
```

Produces `target/mycoolmod-0.1.0.nxmod`. Verified and reproducible.

## Step 6 — Sign (Optional but Recommended)

```
nexus mod keygen --out keys/
nexus mod sign --key keys/signing.key target/mycoolmod-0.1.0.nxmod
```

Public key auto-distributed with the mod via the marketplace adapter.

## Step 7 — Publish

```
nexus mod publish --to self-hosted --url https://mods.mygame.com/ --key keys/signing.key
# OR
nexus mod publish --to mod-io --game-id 4321
# OR several at once:
nexus mod publish --to steam --to mod-io --to self-hosted
```

→ `publishing.md` for per-marketplace recipes.

## Step 8 — Iterate

- `nexus mod ls --installed` to see your mod.
- `nexus mod info com.you.mycoolmod` for caps, perf, audit.
- `nexus mod watch` while playing for live edits.
- `nexus mod outdated` to see when deps publish updates.

## What You Just Did

- Created a Behavior-tier mod with two caps requested (Write components, Emit events).
- Added an asset overlay that swaps a texture on the base game's rocket material.
- Tested via scenario + live in-game.
- Packed a reproducible, signed `.nxmod`.
- Optionally published to any marketplace with one command.

## Next Steps

- `templates.md` — pick a richer starter for skin pack / total conversion / etc.
- `editor.md` — modding inside the Nexus editor (scene overlay, capability inspector).
- `ai-assisted.md` — let `nexus-coder` build the next mod for you.
- `perf.md` — stay under the per-frame budget as your mod grows.

## Pitfalls

- Forgetting to add caps to `[capabilities]` when you start using a new API → `CAP_DENIED` at runtime.
- Source PNG larger than your tier budget → `MOD_E_SIZE_EXCEEDED`. → `docs/specs/mods/package-format.md`.
- Editing `mod.toml::[capabilities]` triggers consent re-prompt; expected behavior. → `docs/specs/mods/permissions.md`.

## Cross-Links

- → `docs/specs/mods/overview.md` — modding philosophy.
- → `docs/specs/mods/package-format.md` — `.nxmod` layout.
- → `docs/specs/mods/sdk.md` — SDK surface.
- → `docs/specs/scripting/sandbox.md` — capability catalog.
- → `docs/specs/scripting/rune.md` — Rune VM.
