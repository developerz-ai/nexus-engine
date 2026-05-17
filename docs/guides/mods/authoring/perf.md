<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Performance

> Default per-mod budget: 250 µs/frame, 32 MB heap. Profile in the editor. Optimize via deny-list patterns. Mods that breach get throttled; repeat breach = auto-suspend.

## The Budget (canonical)

From `docs/specs/scripting/sandbox.md` § Resource Accounting:

| Counter | Reset | Default cap | Breach |
|---|---|---|---|
| `cpu_us` | per frame | 250 µs | `SCRIPT_TIMEOUT`, frame yielded |
| `heap_bytes` | live | 32 MB | `SCRIPT_OOM`, mod suspended |
| `bridge_calls` | per frame | 1024 | drop excess |
| `events_emitted` | per frame | 256 | drop excess |
| `entities_spawned` | per frame | 64 | drop excess |
| `components_mutated` | per frame | 2048 | drop excess |

Mods can request higher in `mod.toml::[limits]`, but: capacity-only-on-consent and the player can attenuate.

## Profile

Editor: `View → Profiler`. CLI:

```
nexus mod profile com.you.mycoolmod --frames 600
```

Output (per-frame averages + p50/p95/p99):

```
cpu_us:           87 (p50=72, p95=183, p99=240)
allocs:           4
alloc_bytes:      256
bridge_calls:     53
events_emitted:   3
events_subscribe: 12 active
entities_spawned: 0
hot_systems:
   on_step           — 71 µs avg
   damage_loop       — 12 µs avg
   apply_status      —  4 µs avg
```

## Deny-List Patterns

The most common reasons mods exceed budget:

| Anti-pattern | Fix |
|---|---|
| Allocating in hot loop | Pre-allocate; reuse buffers; use arena from SDK |
| Blocking IO from script | Forbidden by sandbox; use `assets.load` (async) |
| Per-entity component mutation in tight query | Batch via command-buffer pattern |
| Heavy use of `world.spawn` per tick | Spawn once, mutate; or pool |
| String formatting in `on_step` | Move to `on_event` or skip; never log at trace in hot path |
| Querying components you don't need | Narrow the query; pay only for what you read |
| `world.query` inside `world.query` (nested) | Materialize one, then iterate; O(N²) becomes O(N) |
| `events.emit` per entity per frame | Coalesce; emit one summary per frame |
| Computing into a new collection each frame | Persist in `self.state`; diff per tick |
| Wide `pairs` over a large table (Lua tier) | Use `ipairs` or index by key |

## Hot Loop Recipe

```rune
// BAD: O(N²), allocates per iter
for (e, h) in w.query::<Health>() {
    for (other, target) in w.query::<Target>() {
        let dist = (h.pos - target.pos).length();      // alloc per call?
        if dist < 5.0 {
            w.set(e, Damaged { from: other });
        }
    }
}

// GOOD: materialize targets, no allocs, batched writes
let targets: Vec<(Entity, Vec3)> = w.query::<Target>().map(|(e,t)| (e, t.pos)).collect();
let mut writes = Vec::with_capacity(32);
for (e, h) in w.query::<Health>() {
    for (other, tp) in &targets {
        let dist_sq = (h.pos - *tp).length_squared();
        if dist_sq < 25.0 {
            writes.push((e, Damaged { from: *other }));
        }
    }
}
for (e, c) in writes { w.add(e, c); }
```

## Memory

- Heap cap default 32 MB. Watch in profiler.
- Use `Vec::with_capacity` to avoid reallocs.
- Free large buffers (`let _ = std::mem::take(&mut self.buf);`) at frame boundaries.
- `Persist` blob has its own cap (`size_kb` in manifest); fit your savedata into it; consider compression (lz4) at the mod-side.

## Per-Frame Budget Tuning

If your mod legitimately needs more than 250 µs/frame:

```toml
[limits]
cpu_us_frame = 500
heap_mb = 64
```

Considerations:
- Players see this in the consent dialog: "this mod is allowed up to 500 µs per frame; engine baseline is 250 µs."
- Mods asking for more should JUSTIFY in `description`.
- Multiplayer servers may reject mods that ask too much.
- Total budget across all mods can crowd the frame; engine warns when sum of mod budgets > 10% of frame time.

## Telemetry-Driven Optimization

Opt-in author analytics (`docs/specs/mods/telemetry.md`) gives you real-world data:

```sql
SELECT mod_version, percentile_cont(0.95) WITHIN GROUP (ORDER BY cpu_us_p95)
FROM perf_summary
WHERE platform = 'web'           -- web is the strictest budget
GROUP BY mod_version;
```

Iterate where players actually feel it.

## Web / Mobile Targets

Web (WASM) target halves effective CPU budget for safety. Mobile is similar. Test on the worst-case target:

```
nexus mod profile --target web
nexus mod profile --target android
```

## Stress Testing

```
nexus mod test --stress scenarios/perf-1000-ents.toml --frames 10000
```

Asserts your mod doesn't drift outside budget after long runs. Catches per-tick allocations that aggregate, leaks, etc.

## Pitfalls

- "It worked in editor" but breaks on web/mobile: profile on those targets.
- Hidden allocs from string formatting; use the engine's structured logging instead of `format!`.
- Subscribing to a high-frequency event (e.g., per-tick `physics.contact`) without filtering — count receives in profiler.
- Using `pairs` over a hash-mapping changes order across runs — bad for determinism AND profiling.

## Cross-Links

- → `docs/specs/scripting/sandbox.md` — canonical resource caps.
- → `docs/specs/mods/manifest.md` — `[limits]` block.
- → `docs/specs/mods/telemetry.md` — author analytics.
- → `docs/specs/editor/debug.md` — profiler panel.
- → `debugging.md` — `SCRIPT_TIMEOUT` troubleshooting.
- → `test-harness.md` — perf assertions.
