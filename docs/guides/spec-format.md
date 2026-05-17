<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Spec Format

> Canonical template every file under `docs/specs/` MUST follow. Fixed section order. No additions, no omissions without ADR.

Upstream: `docs/initial/spawn.md` §SPEC FORMAT.
Companions: `docs/guides/style-guide.md` · `docs/guides/file-conventions.md` · `docs/guides/contract-format.md`.

---

## Why fixed

| Reason | Effect |
|---|---|
| AI agents parse specs | Same offsets every time |
| Humans grep specs | `## Performance Contract` resolves anywhere |
| Reviewers diff structure | Drift = lint fail |
| Cross-references stable | Anchors don't move |

---

## Template

Copy this exactly. Replace `<...>` placeholders. Keep section order.

```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# <System Name>

> <One sentence: what this system does and why it exists. End with period.>

## Boundaries
- Owns: <what this system is responsible for>
- Does NOT own: <explicit exclusions> → <pointer to who does>
- Depends on: <other systems> → <contract reference>

## Architecture

<ASCII diagram OR concise description of internal structure>

## Public API

<Every public type, function, constant — types + one-line doc. ≤ 5-line API examples permitted.>

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

## Error Contract

| Code | Variant | Meaning | Caller action |
|---|---|---|---|
| ... | ... | ... | ... |

## Integration Points

<How this system connects to each system it touches. Reference contracts.>

## Test Requirements

<Scenarios that must pass. Written as assertions. T-NN prefix.>

## Prior Art

<What inspired this design. ✓ wins · ✗ pitfalls. Reference repos.>

## Open Questions

<Unresolved decisions. [DECISION NEEDED] / [BENCHMARK NEEDED] / [AGENT: NN].>
```

---

## Section-by-section rationale

### Title (line 4)

| Rule | Example |
|---|---|
| One `#` heading | `# ECS` |
| Match filename concept | filename `ecs.md` → title `# ECS` |
| Sub-area suffix when needed | `# Renderer · PBR` |

### Summary block (line 6)

| Rule | Example |
|---|---|
| Single line, starts `> ` | `> Archetype-based entity/component storage with parallel system scheduling.` |
| Ends with period | required |
| ≤ 140 chars | hard cap |
| What + why in one sentence | both, not just what |
| Parseable | `grep -A0 '^> ' docs/specs/**/*.md` extracts all summaries |

Bad:

```
> The ECS.
```

Good:

```
> Archetype-based entity/component storage with parallel system scheduling and change detection.
```

### `## Boundaries`

Defines who owns what. Prevents cross-system feature creep.

```markdown
## Boundaries
- Owns: entity IDs, component storage, system schedule, change detection
- Does NOT own: rendering (→ docs/specs/renderer/overview.md), physics (→ docs/specs/physics/overview.md)
- Depends on: jobs (→ docs/specs/core/jobs.md), events (→ docs/specs/core/events.md)
```

### `## Architecture`

ASCII diagram preferred. Inline prose only if relationship is trivially linear.

```
 ┌─────────┐   ┌──────────────┐   ┌──────────────┐
 │ Entity  │──►│  Archetype   │──►│ Component[]  │
 └─────────┘   └──────────────┘   └──────────────┘
                      ▲
                      │
              ┌───────┴────────┐
              │   Schedule     │
              └────────────────┘
```

### `## Public API`

Every public symbol. Rust signatures preferred. Five-line max per example. → `docs/initial/spawn.md` RULES §5.

```markdown
## Public API

```rust
pub struct Entity(NonZeroU64);
pub trait Component: 'static + Send + Sync {}
pub trait System: 'static + Send + Sync { fn run(&mut self, w: &mut World); }

pub fn spawn(&mut self) -> EntityBuilder;
pub fn despawn(&mut self, e: Entity) -> Result<(), EcsError>;
```
```

### `## Performance Contract`

Table. Always. No prose performance claims.

| Column | Meaning |
|---|---|
| Metric | What is measured |
| Target | Steady-state expectation |
| Hard limit | Beyond this triggers error/warning |
| Notes | Hardware baseline, conditions, `[BENCHMARK NEEDED]` if unmeasured |

Never invent numbers. Mark `[BENCHMARK NEEDED]`.

### `## Error Contract`

Table. Every public-API error variant. Caller-actionable.

| Code | Format |
|---|---|
| `SYS-NNN` | Three-letter system prefix, three-digit code |
| Variant | Rust enum variant name |
| Meaning | One-line plain English |
| Caller action | What the caller should DO (retry, fail-stop, fallback) |

Example codes: `ECS-001`, `RND-001`, `PHY-001`, `NET-001`.

### `## Integration Points`

For each touching system: one paragraph + contract link. No re-spec.

```markdown
## Integration Points

- **Renderer** — Renderer's extract stage queries Transform + Visibility from ECS World. Read-only access; exclusive lock during extract. → docs/contracts/core-renderer.md.
- **Physics** — Physics syncs RigidBody → Transform once per fixed step. → docs/contracts/core-physics.md.
```

### `## Test Requirements`

Assertions, not prose. `T-NN` prefix for stable referencing from contracts.

```markdown
- T-01 Spawn 1M entities in < 100 ms on baseline hardware.
- T-02 Despawn during iteration must not invalidate other iterators.
- T-03 Change detection: modifying component C marks entity dirty for systems querying C.
```

### `## Prior Art`

What inspired the design. ✓ / ✗ markers. Reference repos by `owner/name` form.

```markdown
- bevyengine/bevy ✓ archetype storage · ✓ parallel schedule · ✗ Send+Sync ergonomics
- SanderMertens/flecs ✓ relationships · ✓ hierarchical ECS · ✗ C-API surface
- skypjack/entt ✓ sparse-set option · ✓ runtime introspection
```

### `## Open Questions`

Every unresolved decision. Use exactly these markers:

| Marker | Use |
|---|---|
| `[DECISION NEEDED]` | Architect or ADR required |
| `[BENCHMARK NEEDED]` | Number is a guess until measured |
| `[AGENT: NN]` | Cross-agent dependency; resolved by named agent |
| `[PENDING]` | Referenced file does not yet exist |

```markdown
## Open Questions

- [DECISION NEEDED] Sparse-set storage opt-in: per-component flag or global toggle?
- [BENCHMARK NEEDED] 1M-entity iteration on Ryzen 7 / Apple M2 baseline.
- [AGENT: 03] Confirm renderer's extract stage tolerates exclusive World lock.
```

---

## Minimal complete example

```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Events

> Typed publish-subscribe bus for cross-system messages with deterministic ordering per channel.

## Boundaries
- Owns: event channels, subscriber registry, per-frame drain
- Does NOT own: event payload types (defined by sender system)
- Depends on: jobs (→ docs/specs/core/jobs.md)

## Architecture
 ┌────────┐  send   ┌───────────────┐  drain   ┌────────────┐
 │ Sender │ ──────► │   Channel<T>  │ ───────► │ Subscriber │
 └────────┘         └───────────────┘          └────────────┘

## Public API
```rust
pub struct EventBus;
impl EventBus {
    pub fn send<E: Event>(&self, e: E);
    pub fn subscribe<E: Event>(&self) -> Subscriber<E>;
}
pub trait Event: 'static + Send + Sync + Clone {}
```

## Performance Contract
| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| send() latency | < 1 µs | 5 µs | uncontended |
| drain 10k events | < 100 µs | 500 µs | [BENCHMARK NEEDED] |

## Error Contract
| Code | Variant | Meaning | Caller action |
|---|---|---|---|
| `EVT-001` | `ChannelFull` | Bounded channel overflow | Sender drops or back-pressures |

## Integration Points
- All systems may publish/subscribe via &EventBus. → docs/contracts/core-renderer.md, docs/contracts/core-physics.md.

## Test Requirements
- T-01 Send 10k events of type E; subscriber drains all in order.
- T-02 Multiple subscribers each receive every event.
- T-03 Subscriber dropped mid-frame: no panic; queued events GC'd next frame.

## Prior Art
- bevyengine/bevy ✓ typed events · ✗ per-frame double-buffer GC complexity
- crossbeam-channel ✓ MPMC perf · ✗ untyped

## Open Questions
- [DECISION NEEDED] Per-channel bound or shared backpressure pool?
```

---

## Lint rules (CI)

| Rule | Failure |
|---|---|
| MIT header lines 1–2 exact | hard fail |
| Title on line 4, single `#` | hard fail |
| Summary on line 6, starts `> `, ends `.` | hard fail |
| All required sections present in order | hard fail |
| No additional top-level sections | warn |
| Each table has header row | hard fail |
| `[BENCHMARK NEEDED]` allowed but flagged in report | warn |
| File ≤ 1000 lines | hard fail (split or ADR) |

Script: `scripts/lint-specs.sh` [PENDING].

---

## Adding a new section

Forbidden by default. To propose:
1. Write an ADR. → `docs/guides/adr-format.md`.
2. Justify why every existing spec needs to grow.
3. Migrate all specs in same PR.
