<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Naming (Universal)

Names are grep targets. Treat them as a public contract — even private ones.

## Case mapping (cross-language)

| Concept | Rust | TS | Python | Lua | WGSL | SQL |
|---------|------|----|--------|-----|------|-----|
| Type / class / struct | `PascalCase` | `PascalCase` | `PascalCase` | `PascalCase` (module table) | `PascalCase` | `snake_case` (table) |
| Function / method | `snake_case` | `camelCase` | `snake_case` | `snake_case` | `snake_case` | `snake_case` |
| Variable / local | `snake_case` | `camelCase` | `snake_case` | `snake_case` | `snake_case` | `snake_case` |
| Constant | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` |
| Module / file | `snake_case` (mod) · `kebab-case` (crate) | `kebab-case.ts` · `PascalCase.tsx` | `snake_case.py` | `kebab-case.lua` | `kebab-case.wgsl` | `snake_case.sql` |
| Enum variant | `PascalCase` | `PascalCase` (const union) | `PascalCase` | `PascalCase` (frozen table) | n/a | `SCREAMING_SNAKE_CASE` |
| Boolean | `is_*` / `has_*` / `can_*` | `is*` / `has*` / `can*` | `is_*` / `has_*` | `is_*` / `has_*` | `is_*` | `is_*` / `has_*` |
| Type parameter | `T`, `U`, or `PascalCase` | same | same | n/a | n/a | n/a |

## Files

| Domain | Convention | Example |
|--------|-----------|---------|
| Rust crate | `kebab-case` | `nexus-renderer` |
| Rust module file | `snake_case.rs` | `render_graph.rs` |
| TS / JS source | `kebab-case.ts` | `render-queue.ts` |
| React component | `PascalCase.tsx` | `SceneTree.tsx` |
| Python module | `snake_case.py` | `scenario_runner.py` |
| Lua module | `kebab-case.lua` | `enemy-spawner.lua` |
| WGSL shader | `kebab-case.wgsl` | `pbr-opaque.wgsl` |
| SQL migration | `YYYYMMDDHHMMSS_<verb>_<noun>.sql` | `20260517090000_create_players.sql` |
| Config file | lowercase + dots | `nexus.toml`, `biome.json` |
| Spec / docs | `kebab-case.md` | `coding-style.md` |

## Crate / package names

| Layer | Pattern | Example |
|-------|---------|---------|
| Engine crate | `nexus-<system>` | `nexus-renderer` |
| Engine sub-crate | `nexus-<system>-<sub>` | `nexus-renderer-pbr` |
| Internal-only crate | `nexus-<x>-internal` | `nexus-render-internal` |
| Genre module | `nexus-genre-<genre>` | `nexus-genre-fps` |
| Style module | `nexus-style-<style>` | `nexus-style-pixel` |
| TS package | `@nexus/<scope>` | `@nexus/editor-ui` |
| Python package | `nexus_<scope>` | `nexus_agent_sdk` |
| Game template scaffolds | `<game>-<service>` | `mygame-server` |

No `nx-`, `nex-`, `nxe-` abbreviations. Always `nexus-` / `@nexus/` / `nexus_`.

## Function names — verb-first

| Action | Prefix | Example |
|--------|--------|---------|
| Create | `new`, `create`, `spawn`, `build` | `Frame::new`, `world.spawn` |
| Read | `get`, `find`, `query`, `peek` | `get_entity`, `find_node` |
| Convert | `from_*`, `into_*`, `as_*`, `to_*` | `Mat4::from_quat`, `as_str` |
| Update | `set`, `update`, `with` | `set_position`, `with_color` |
| Delete | `delete`, `remove`, `clear`, `drop` | `world.remove(entity)` |
| Try variant | `try_*` | `try_acquire` |
| Async | suffix `_async` / `_future` only when ambiguous | `load`, `load_async` |
| Test | `is_*`, `has_*`, `can_*` | `is_visible` |

`get_*` may be omitted in Rust when it's a field accessor (`pub fn name(&self) -> &str`, not `get_name`). Cite: rust-lang/api-guidelines C-GETTER.

## Boolean naming

Positive only.

```rust
let is_visible = true;       // good
let is_not_hidden = true;    // bad — double negative

let has_completed = true;    // good
let is_not_pending = true;   // bad — same
```

Test sites: `if is_visible { ... }`, never `if !is_invisible`.

## Acronyms

Acronyms are words. Capitalize the first letter only.

```rust
HttpClient   // good
HTTPClient   // bad
RpcServer    // good
RPCServer    // bad
```

Exceptions when SCREAMING:
- `MAX_HTTP_RETRIES` (constant context — all upper)
- `id`, `uuid`, `url`, `ip` (treat as words in `snake_case`)

## Domain glossary

| Term | Use | Avoid |
|------|-----|-------|
| Entity | The ECS entity ID | "object", "actor" |
| Component | ECS-attached data | "trait" (Rust trait is the keyword) |
| System | ECS function | "service" (server-side noun) |
| World | ECS storage | "scene" (visual term) |
| Scene | Editor/runtime grouping | "level" |
| Asset | On-disk resource | "file", "resource" |
| Frame | One render iteration | "tick" |
| Tick | One simulation step | "step" |
| Scenario | TOML test definition | "test case" |
| Replay | Deterministic recording | "demo" |

→ `docs/guides/glossary.md` (Agent 19) for the full glossary.

## Git branch names

```
<type>/<short-slug>
```

| `type` | Use |
|--------|-----|
| `feat` | new feature |
| `fix` | bug fix |
| `chore` | tooling / deps |
| `docs` | documentation only |
| `refactor` | no behavior change |
| `perf` | performance only |
| `test` | tests only |

Slug: lowercase, hyphen-separated, ≤40 chars.

```
feat/render-graph-async-passes
fix/audio-buffer-underrun
docs/coding-style-rust
```

No personal prefixes (`sebi/feature-x`). nexus-merge IDs the author from git metadata.

## PR titles — Conventional Commits

```
<type>(<scope>): <subject>
```

Scopes match crate / package names: `renderer`, `physics`, `ecs`, `agent-sdk`, `template`, `cli`.

```
feat(renderer): add cascaded shadow maps
fix(physics): rapier joint motor clamp
perf(ecs): replace HashMap with SlotMap in archetype index
docs(coding-style): codify rust comment grammar
chore(deps): bump wgpu to 0.21
```

Footer for breaking changes: `BREAKING CHANGE: <description>`.

Cite: conventionalcommits.org/v1.0.0 · semver.org/v2.0.0.

CI rejects PRs whose title fails the regex `^(feat|fix|chore|docs|refactor|perf|test|build|ci|style|revert)(\([a-z-]+\))?: .+`. → `docs/guides/pr-protocol.md`

## Forbidden

| Pattern | Why |
|---------|-----|
| Hungarian notation (`strName`, `iCount`) | Type lives in the type system |
| `data`, `info`, `manager`, `helper`, `util` | Means nothing |
| Single-letter outside `for i in ...` / `T` generic | Grep-hostile |
| Abbreviations (`usr`, `cfg`, `mgr`) | Spelled out always |
| `temp`, `foo`, `bar` in committed code | Naming debt |
| Trailing numbers (`render2`, `world3`) | Use semantic name |
| Negation in booleans (`is_not_ready`) | Double negative at call sites |
| Mixed case in file names (`SceneTree.rs`) | Rust uses `snake_case.rs` |

## Cross-link

- → `rust.md`, `typescript.md`, `python.md`, `lua.md`, `wgsl.md`, `sql.md`
- → `docs/guides/glossary.md` (Agent 19, domain glossary)
- → `docs/guides/pr-protocol.md` (Agent 16, PR title regex)
