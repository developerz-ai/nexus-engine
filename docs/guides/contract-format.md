<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract Format

> Canonical template every file under `docs/contracts/` MUST follow. Defines exact interface boundary between two subsystems.

Reference implementation: `docs/contracts/core-renderer.md` (Agent 14).
Companions: `docs/guides/spec-format.md` · `docs/guides/style-guide.md` · `docs/guides/file-conventions.md`.

---

## Contracts vs specs

| | Spec | Contract |
|---|---|---|
| Scope | One system | Boundary between TWO systems |
| Lives in | `docs/specs/<area>/` | `docs/contracts/` |
| Owner | One AI dev team | Both touching teams jointly |
| Filename | `<topic>.md` | `<a>-<b>.md` (alphabetical) |
| Versioning | Section count stable | Semver per `nexus-contract-<name>` crate |
| Required by | One crate | Both crates declare same version |

Rule: any cross-crate API has a contract. Internal-to-crate APIs do not.

---

## Filename rule

`<crate-a>-<crate-b>.md` — alphabetical by crate name.

| Crates | Filename |
|---|---|
| `nexus-core` + `nexus-renderer` | `core-renderer.md` |
| `nexus-core` + `nexus-physics` | `core-physics.md` |
| `nexus-renderer` + `nexus-assets` | `assets-renderer.md` (alphabetical: `a` < `r`) |
| `nexus-physics` + `nexus-renderer` | `physics-renderer.md` (`p` < `r`) |

Prefix drops the `nexus-` per `docs/guides/file-conventions.md`.

---

## Template

Copy exactly. Fixed section order.

```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: <A> ⇄ <B>

> <One sentence: what data flows which way and why.>

Related specs:
- `docs/specs/<a>/...` · `docs/specs/<a>/...`
- `docs/specs/<b>/...` · `docs/specs/<b>/...`
- Sibling contracts: `docs/contracts/...`

---

## Parties

| Role | Crate | File of record |
|---|---|---|
| Provider | `nexus-<a>` | `crates/<a>/src/lib.rs` |
| Consumer | `nexus-<b>` | `crates/<b>/src/lib.rs` |

Pattern reference: <prior art, design-by-contract principle if relevant>.

---

## Call flow

<ASCII diagram of per-frame or per-event interaction>

---

## Provided API (<Provider> surface that <Consumer> calls)

```rust
pub trait <ProviderTrait>: Send + Sync + 'static {
    fn <method>(&mut self, ...) -> Result<..., <Error>>;
    ...
}
```

## Required API (<Consumer> surface that <Provider> calls)

```rust
pub fn <method>(&self) -> ...;
...
```

| Component | Module | Notes |
|---|---|---|
| ... | ... | ... |

---

## Data Schema

```rust
pub struct <T> { ... }
pub enum <E> { ... }
```

Wire fragment (JSON/TOML) for `nexus-agent-sdk`:

```json
{ "channel": "...", "schema": 1, "payload": { ... } }
```

---

## Ordering & Lifetime Guarantees

| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | <party> | <invariant> |
| O-2 | <party> | <invariant> |
| ... | ... | ... |

---

## Threading & Concurrency Rules

- <rule about which thread calls what>
- <rule about Send / Sync requirements>
- <rule about lock acquisition order>

---

## Performance Contract

| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

---

## Error Contract

| Code | Variant | Meaning | Required action |
|---|---|---|---|
| `<SYS-NNN>` | `<Variant>` | ... | ... |

All errors: `#[non_exhaustive]`, fields `code: &'static str`, `message: String`, `frame: FrameId`, `suggested_fix: &'static str`. Per AI-first mandate (→ `docs/initial/vision.md` §AI-First).

---

## Versioning Rule

Semver: `nexus-contract-<name> = "MAJOR.MINOR.PATCH"`. See https://semver.org.

- **MAJOR**: remove or change signature of any trait method; remove required component; change Ordering guarantee; change Data Schema field type.
- **MINOR**: add trait method with default; add optional component (consumer tolerates absence); add new variant to `#[non_exhaustive]` enum.
- **PATCH**: docs, perf-target tightening, internal-only changes.

Both crates MUST declare `nexus-contract-<name> = "X"`. CI fails on mismatch.

---

## Test Matrix

Assertions both crates must pass in `tests/contract_<a>_<b>.rs`:

- T-01 ...
- T-02 ...
- ...

---

## Open Questions

- [DECISION NEEDED] ...
- [BENCHMARK NEEDED] ...
- [AGENT: NN] ...
```

---

## Section-by-section guidance

### Title

`# Contract: <A> ⇄ <B>` — `⇄` (U+21C4) denotes bidirectional. Use `→` for one-way.

| Form | When |
|---|---|
| `# Contract: Core ⇄ Renderer` | data flows both ways |
| `# Contract: Assets → Renderer` | one-way (assets push, renderer never calls back) |

### Summary

Single line. What flows, which way, why.

Bad: `> This is the contract between core and renderer.`
Good: `> ECS World feeds renderable component data to the renderer once per frame; renderer returns GPU timing + present events.`

### Parties

Table. Three fields: Role, Crate, File of record.

Roles allowed: `Provider`, `Consumer`, `Provider (data)`, `Provider (window)`, etc. Multiple roles OK when a contract involves more than two surfaces (rare).

### Call flow

ASCII diagram. Mandatory. Per-frame or per-event interaction.

Show:
1. Trigger (what starts the call)
2. Order of stages
3. Data direction (arrows)
4. Concurrency (parallel branches, joins)
5. Event emission back

### Provided / Required API

Rust signatures. Use traits for replaceable backends. Plain `fn` for stable APIs.

| Section | Direction |
|---|---|
| Provided API | what Consumer calls on Provider |
| Required API | what Provider calls on Consumer (or shared infra) |

Five-line API examples max. Defer full type listings to the relevant spec.

### Data Schema

All concrete types crossing the boundary. Include JSON wire fragment for any data that surfaces through `nexus-agent-sdk` (→ `docs/specs/agent/telemetry.md` [PENDING]).

### Ordering & Lifetime Guarantees

The most load-bearing section. Each row is an enforceable invariant.

Format: `O-NN | <owning party> | <statement that can be tested>`.

Examples of good guarantees:

| Pattern | Form |
|---|---|
| Exclusivity | `extract runs with exclusive World access; no other system mutates.` |
| Lifetime | `After extract returns, renderer holds no &World reference past the frame.` |
| Order | `prepare → queue → submit strict order per frame.` |
| Happens-before | `init happens-before any extract; drop happens-after last submit.` |
| Liveness | `Asset handles in components stay live until next extract boundary.` |

### Threading & Concurrency Rules

Plain bullets. Cover:
- Which thread may call which method.
- Send / Sync requirements.
- Lock acquisition order (deadlock avoidance).
- Forbidden operations (`MUST NOT call X from Y`).

### Performance Contract

Table identical in form to spec performance contracts. Refers to per-call-edge costs, not the system's internal work (that lives in the spec).

### Error Contract

Every error variant a consumer may receive from the boundary. All structured per AI-first mandate.

Required fields:

```rust
pub struct <Error> {
    pub code: &'static str,        // SYS-NNN
    pub message: String,           // plain English
    pub frame: FrameId,            // when
    pub suggested_fix: &'static str,
}
```

### Versioning Rule

Every contract is a semver'd crate (`nexus-contract-<name>`). Both touching crates depend on it. CI mismatch = build failure.

| Change | Bump |
|---|---|
| Remove method | MAJOR |
| Change signature | MAJOR |
| Change ordering guarantee | MAJOR |
| Add method with default | MINOR |
| Add optional component | MINOR |
| Add `#[non_exhaustive]` enum variant | MINOR |
| Tighten perf target | PATCH |
| Docs only | PATCH |

### Test Matrix

Cross-crate integration tests. `tests/contract_<a>_<b>.rs` in workspace root or in each crate's `tests/`.

T-NN format; same as spec test prefix; numbering shared with the referenced specs to allow `T-RND-04` style cross-quotes.

### Open Questions

Same markers as specs: `[DECISION NEEDED]`, `[BENCHMARK NEEDED]`, `[AGENT: NN]`.

---

## Example: minimal contract

See `docs/contracts/core-renderer.md` for the full reference. Below is the structural skeleton with placeholder content kept terse.

```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contract: Core ⇄ Physics

> ECS publishes RigidBody+Transform; physics writes back Transform at fixed step boundaries.

Related specs:
- docs/specs/core/ecs.md · docs/specs/core/events.md
- docs/specs/physics/overview.md · docs/specs/physics/rigid.md

## Parties
| Role | Crate | File of record |
|---|---|---|
| Provider (data) | nexus-core | crates/core/src/lib.rs |
| Consumer / Provider (sim) | nexus-physics | crates/physics/src/lib.rs |

## Call flow
 ┌──────┐  sync_in   ┌─────────┐  step  ┌──────────┐  sync_out  ┌──────┐
 │ Core │ ─────────► │ Physics │ ─────► │ Constraint│ ─────────► │ Core │
 └──────┘            └─────────┘        └──────────┘            └──────┘

## Provided API
```rust
pub trait PhysicsBackend { fn step(&mut self, dt: f32); ... }
```

## Required API
```rust
pub fn world(&self) -> &World;
pub fn fixed_dt(&self) -> f32;
```

## Data Schema
```rust
pub struct RigidBody { ... }
pub enum CollisionEvent { ... }
```

## Ordering & Lifetime Guarantees
| Guarantee | Owner | Statement |
|---|---|---|
| O-1 | Core | Transform writes from physics happen during sync_out stage only. |

## Threading & Concurrency Rules
- step() runs on physics thread; never on main.
- sync_in / sync_out run on main schedule.

## Performance Contract
| Metric | Target | Hard limit | Notes |
|---|---|---|---|
| step() @ 1k bodies | < 2 ms | 5 ms | [BENCHMARK NEEDED] |

## Error Contract
| Code | Variant | Meaning | Required action |
|---|---|---|---|
| PHY-001 | StepDiverged | NaN in sim state | Reset bodies from last snapshot |

## Versioning Rule
nexus-contract-core-physics = "0.1.0".

## Test Matrix
- T-01 1k bodies step deterministically across two runs.

## Open Questions
- [DECISION NEEDED] sub-stepping policy: fixed or adaptive?
```

---

## Lint rules

| Rule | Failure |
|---|---|
| MIT header lines 1–2 exact | hard fail |
| Title `# Contract: <A> ⇄ <B>` form | hard fail |
| Filename matches `<a>-<b>.md` alphabetical | hard fail |
| All required sections present in order | hard fail |
| Both crates declare `nexus-contract-<name>` | CI dep-graph check |
| Versions match across crates | CI hard fail |

Script: `scripts/lint-contracts.sh` [PENDING].
