<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mod Sandbox & Capability Model

> Untrusted mods run with zero ambient authority. Every engine interaction requires a typed capability granted at install time. Resource limits are enforced by the VM and the broker.

## Boundaries

- Owns: capability type registry, broker (issue/check/revoke), grant policy schema, resource accounting hooks, audit log.
- Does NOT own:
  - Rune VM internals → `rune.md`
  - Trusted Lua tier (no caps required) → `lua.md`
  - Manifest discovery → `assets/registry.md`
  - Grant approval UI → `editor/` and game-side mod manager
- Depends on:
  - `docs/specs/scripting/rune.md`
  - `docs/contracts/core-scripting.md`
  - `docs/specs/core/events.md`

## Threat Model

Mods are **untrusted code** authored by anyone, installed by a player, executed inside the game process. They may be malicious, buggy, or both.

Threats in scope:
- Reading data the player did not consent to expose (save files, other mods' state, network).
- Writing data the player did not consent to mutate (sim corruption, save tampering).
- Exhausting host resources (cpu, ram, gpu, fs, net).
- Crashing the engine, breaking determinism, or breaking replay.
- Privilege escalation across mods (mod A reading mod B's secrets).
- Non-deterministic side effects that break netcode or replay.

Out of scope:
- Side-channel attacks (timing, cache).
- Kernel/process-level escapes — those are the OS's job; we recommend `nexus run --sandbox=os` (seccomp / AppContainer) for hostile environments → `[DECISION NEEDED]`.
- Reverse engineering of game assets.

## Capability Model

Capabilities are unforgeable, typed tokens. A mod receives a `ModEnv` containing exactly the caps granted by its manifest + player approval. There is no global, no static, no ambient way to get a capability.

inspired by: Object-Capability Model (Mark Miller et al.), E language, Joe-E, WASI capability handles

### Capability Flow

```
   mod.toml (requested caps)
            |
            v
   +--------+---------+
   |  Grant Policy    |  ← default policy + player overrides + signed-by-publisher rules
   +--------+---------+
            |
            v
   +--------+---------+
   |  Player Approval | ← UI: shows requested caps in plain language
   +--------+---------+
            |
            v   approved set
   +--------+---------+
   |  Cap Broker      | ← issues tokens, tracks live mods, audits use
   +--------+---------+
            |
            v
   ModEnv  → mod init(env)
            |
   each mod call:
            v
   +--------+---------+
   |  Bridge          | ← checks token, increments counter, enforces limit
   +--------+---------+
            |
            v
        ECS / events / assets / audio
            |
            v
        Audit log → telemetry
```

### Capability Catalog (v1.0)

| Capability | Grants | Resource cost |
|---|---|---|
| `WorldRead<C>` | Query components of type `C` (whitelisted set) | Read counter |
| `WorldWrite<C>` | Spawn/despawn/mutate components of type `C` | Write counter, spawn cap |
| `EventEmit{names}` | Emit only listed event names | Emit counter |
| `EventSubscribe{names}` | Subscribe to listed event names | None per call |
| `AssetRead{uuids}` | Load assets by listed UUIDs only | Asset cache cost |
| `AudioOneshot{ids}` | Trigger named sfx (no arbitrary path) | Voice slot |
| `Log` | Write to mod log channel | Bounded ring buffer |
| `Rng` | Read per-world seeded RNG | None |
| `SemanticSpawn` | Use `nexus.spawn("...")` NL interface | High; rate-limited |
| `Persist` | Read/write own per-mod state blob | Bounded by cap size |
| `Net` | **Disabled in v1.0.** Reserved for v1.1 with explicit allowlist. | n/a |
| `Fs` | **Never granted to mods.** All file access goes through asset cap. | n/a |
| `Process` | **Never granted.** No subprocess, no shell. | n/a |

Each cap is parameterized (`{...}`) where applicable; the parameters are part of the grant and cannot be expanded at runtime.

### Properties

- **Unforgeable**: cap tokens are Rune opaque types with no constructor exposed to scripts.
- **Attenuable**: a mod can derive a more restrictive cap from one it holds (e.g. read-only view of a write cap) and pass to a sub-component. Not in the reverse direction.
- **Revocable**: the broker can revoke a cap at any time; subsequent use returns `CAP_REVOKED`.
- **Auditable**: every cap use is counted; per-mod, per-cap, per-frame metrics in telemetry.
- **Non-transferable across mods**: mods cannot pass caps to each other directly. Sharing happens only via the event bus, mediated by both mods' caps.

## Grant Policy

```
+----------------+    +-------------------+    +-----------------+
| Default deny   | -> | Manifest request  | -> | Approval prompt |
+----------------+    +-------------------+    +-----------------+
                                                       |
                                                       v
                                            +----------+---------+
                                            | Granted set frozen |
                                            +----------+---------+
                                                       |
                                                       v
                                                  Mod runs
```

Policy layers, evaluated in order, last-write-wins:

1. **Default deny** — nothing granted.
2. **Manifest** — mod declares what it requests (see `mod.toml` in `rune.md`).
3. **Game policy** — game publisher can pre-approve common capabilities (`Nexus.toml::[mods.policy]`).
4. **Player override** — player can approve, deny, or attenuate individual caps at install.
5. **Trust signal** — `[DECISION NEEDED]` whether to support signed-by-publisher auto-approve for marketplace mods.

Re-prompt required on:
- Mod version bump that requests a new cap.
- Cap parameter expansion (e.g. wanting to read more component types).

## Resource Accounting

Each cap use increments a per-mod counter. Counters reset per frame for rate-based caps, per-session for cumulative caps.

| Counter | Reset | Default cap | Breach action |
|---|---|---|---|
| `bridge_calls` | per frame | 1024 | warn → throttle (drop excess) |
| `events_emitted` | per frame | 256 | drop excess, telemetry |
| `entities_spawned` | per frame | 64 | drop excess, telemetry |
| `components_mutated` | per frame | 2048 | drop excess, telemetry |
| `heap_bytes` | live | 32 MB | `SCRIPT_OOM`, mod suspended |
| `cpu_us` | per frame | 250 | `SCRIPT_TIMEOUT`, frame yielded |
| `log_bytes` | per second | 64 KB | drop excess |
| `asset_bytes` | live | 64 MB | next load fails with err |

Three consecutive frame breaches → mod auto-suspended; player notified with structured event.

## Safe API Surface

A function is safe to expose to a mod iff:

1. It has a corresponding capability OR the function is purely computational and deterministic.
2. It cannot panic the engine on any input.
3. It validates all arguments and rejects malformed inputs with `BRIDGE_TYPE_MISMATCH`.
4. It has bounded cost (no unbounded loops on caller's behalf without budget check).
5. It does not return raw pointers, handles to non-mod data, or engine-internal types.
6. It is deterministic (no wall clock, no system RNG, no thread-id read, no env vars).

Each bridge function carries metadata listed in `docs/contracts/core-scripting.md`:

```rust
#[bridge(cap = "WorldRead<C>", cost = "low", deterministic = true)]
fn query<C: Component>(world: &World) -> impl Iterator<Item = (Entity, &C)> { ... }
```

## Audit Log

Every cap use is logged at debug level; every denial at info; every revocation at warn. Aggregated counters at info every second.

```json
{
  "ts_sim": 1234.567,
  "mod": "com.example.healing-pack",
  "cap": "WorldWrite<Health>",
  "action": "use",
  "result": "ok",
  "count_frame": 7
}
```

Denials carry extra context:

```json
{
  "ts_sim": 1234.567,
  "mod": "com.example.evil",
  "cap": "WorldWrite<Health>",
  "action": "use",
  "result": "denied",
  "reason": "cap_not_granted",
  "file": "src/lib.rn",
  "line": 42
}
```

Audit log is part of the agent telemetry feed → `agent/telemetry.md`.

## Determinism Contract

The sandbox layer must not break replay:
- Cap checks are pure functions of granted-set + cap-id.
- Counter resets fire at the same sim frame each replay.
- Denials and revocations are deterministic (revocations driven by sim events, never wall clock).
- Audit log is excluded from sim state — informational only.

## Performance Contract

| Check | Target | Hard limit |
|---|---|---|
| Cap presence check | < 20 ns | 100 ns |
| Counter increment + bound check | < 30 ns | 150 ns |
| Bridge call total overhead (Rune → cap → counter → fn) | < 250 ns | 1 µs |
| Audit log append (sync path) | < 100 ns | 500 ns |
| Mod suspension on breach | < 1 frame | 3 frames |

`[BENCHMARK NEEDED]`

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `CAP_DENIED` | Mod does not hold the requested capability | Return safe default / no-op; log; telemetry |
| `CAP_REVOKED` | Cap was revoked between issue and use | Return safe default; log |
| `CAP_PARAM_OUT_OF_SCOPE` | Mod called with a parameter outside its grant (e.g. unlisted UUID) | Reject; log |
| `LIMIT_EXCEEDED` | A counter passed its cap | Throttle / drop / suspend per policy |
| `MANIFEST_INVALID` | Bad `mod.toml` | Reject install; structured error |
| `GRANT_REJECTED` | Player or policy denied install | Mod not loaded |

## Integration Points

- **Rune** (`rune.md`): all `ModEnv` types and `cap::<T>()` machinery.
- **ECS** (`core/ecs.md`): bridge functions check caps before issuing queries / commands.
- **Events** (`core/events.md`): bus filter consults caps on emit and on subscribe.
- **Assets** (`assets/registry.md`): asset load checks UUID allowlist on `AssetRead`.
- **Agent SDK** (`agent/sdk.md`): agents can read audit log; can install mods with explicit grants for fuzzing.
- **Networking** (`networking/anticheat.md`): in multiplayer, server-side mod set is canonical; clients without matching grants reject the session.

## Test Requirements

- A mod cannot import or call any function not exposed via a granted cap, even via reflection / metatable trickery — verified by negative tests for all engine modules.
- Revoking a cap mid-frame causes the next bridge call from that mod to return `CAP_REVOKED`, with safe default.
- Counter overflow attempts (e.g. emitting 10k events when budget is 256) are bounded; the engine never blocks beyond budget.
- Two mods with overlapping `WorldWrite<Health>` caps see deterministic mutation ordering (lex by mod id).
- Fuzz: 100k malformed mods across 1k random manifests produce only structured errors, zero panics.
- Audit log entries for a given replay are identical across runs.

## Prior Art

- E language ✓ — capability discipline, no ambient authority.
- Joe-E ✓ — applies cap discipline to a real Java subset; we apply it to Rune.
- WASI capability handles ✓ — preopen file/dir caps; we apply same idea to asset UUIDs.
- WASM component model ✓ — typed import/export interfaces; informs cap typing.
- Roblox Luau actors ✓ — sandbox-first scripting at scale.
- Skyrim SKSE / Bethesda mod model ✗ — no caps, full process access; what we avoid.
- Factorio Lua mods ✗ — no caps; mods can break sim.
- Browser permission prompts ✓ — UX model for the player approval flow.

## Open Questions

- `[DECISION NEEDED]` Signed-mod auto-approval policy; how to verify signatures; revocation lists.
- `[DECISION NEEDED]` `Net` capability v1.1 design: allowlisted hostnames? rate limits? player-only opt-in?
- `[DECISION NEEDED]` OS-level sandbox layer (`--sandbox=os`): seccomp on Linux, AppContainer on Windows, sandbox-exec on macOS.
- `[DECISION NEEDED]` Cap attenuation API shape in Rune (combinator vs. derive macro).
- `[BENCHMARK NEEDED]` all perf numbers.
- `[AGENT: 07]` Confirm multiplayer policy on mismatched mod sets → reject session with structured reason.
- `[AGENT: 14]` Confirm cap-typed bridge fn signatures live in `contracts/core-scripting.md`.
- `[AGENT: 10]` Confirm agent SDK exposes audit log subscription.
- `[AGENT: 11]` Confirm editor mod-install dialog mirrors capability schema.
