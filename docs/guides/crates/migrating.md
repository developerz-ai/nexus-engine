<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Migration Guide

> When the engine ships a new major, your crate has one major-version overlap to migrate. Use deprecation notes, the compat shim, and the per-crate `MIGRATIONS/X.md` template. Coordinate multi-crate ecosystems with lockstep releases.

→ Stable-API + shim policy: `docs/specs/crates/stable-api.md`.
→ Versioning rules: `docs/specs/crates/versioning.md`.
→ Mirrored mod migration: `docs/specs/mods/sdk.md` § Compat Shim.

## When you must migrate

| Trigger | Action |
|---|---|
| Engine ships `2.0` | You have all of `2.x` to migrate (shim covers); migrate before `3.0` |
| You see `MOD_E_SDK_REMOVED`-style log from your crate's bridge calls | API you depend on is shimmed; plan migration |
| `nexus crate health <name>` reports `ok-via-shim` | You're running on borrowed time; migrate |
| `cargo update -p nexus-engine` produces compile errors | Your crate has hit a real break |
| Your audit re-run reports failed `public-api` diff | You introduced your own break — same migration playbook applies |

## Cross-major migration playbook

1. **Read the engine's `MIGRATION.md` for the major.**
   Ships at `docs/MIGRATIONS/<from>-to-<to>.md` (or in the engine release notes).

2. **Set up a working branch with both versions of the engine.**
   ```
   git checkout -b migrate-2.0
   cargo update -p nexus-engine --precise 2.0.0
   ```

3. **First pass: bridge via the compat shim.**
   ```toml
   [dependencies]
   nexus-engine = "2.0"
   nexus-engine-compat-1 = "1.x"
   ```
   Re-runs of `cargo check` now compile your 1.x-targeting code against the shim. Surface area unchanged.

4. **Run your test pack.**
   ```
   nexus crate test --engine=2.0
   ```
   Anything red is a behavioral break the shim doesn't cover.

5. **Migrate one symbol at a time.**
   For each deprecated symbol your crate uses, follow the per-symbol migration in `docs/MIGRATIONS/<symbol>.md`. Commit per symbol (Conventional Commits: `refactor!: replace OldType::method with NewType::method`).

6. **Once shim-free: drop the shim dep.**
   ```toml
   [dependencies]
   nexus-engine = "2.0"
   # nexus-engine-compat-1 = ...  removed
   ```

7. **Widen `engine_versions`.**
   ```toml
   [package.metadata.nexus]
   engine_versions = ">=1.0, <3.0"
   ```
   Your crate now runs on both 1.x (native) and 2.x (native). Consumers on 1.x keep working.

8. **Cut a release.**
   Conventional Commit `feat!:` or `BREAKING CHANGE:` footer triggers a major bump if your crate's own surface changed; otherwise minor.

9. **Update CHANGELOG and `MIGRATIONS/<from>-to-<to>.md`.**
   See template below.

10. **Publish.**
    ```
    nexus crate publish --json
    ```
    Index updates within minutes; `nexus crate health <name>` flips from `ok-via-shim` to `ok-native`.

## `MIGRATIONS/<from>-to-<to>.md` template

```markdown
# Migrating <crate> from <from> to <to>

## Summary
- Engine major bump from <from> to <to>.
- <N> breaking changes, <M> behavioral changes, 0 silent semantic drifts.

## Breaking changes
| Old | New | Reason |
|---|---|---|
| `OldType::method` | `NewType::method` | renamed for clarity |
| `OldEnum::Variant` | `NewEnum::Variant` | namespace migration |

## Behavioral changes
- `foo()` now returns `Err(Empty)` on empty input (previously returned `Ok(0)`).

## New required impls
- Implementors of `Trait` must now add `fn extra(&self) -> Foo;`.

## Compatibility shim
- Engine <to>.x ships `nexus-engine-compat-<from>` re-exporting the <from>.x surface mapped onto <to>.x.
- Crates targeting `engine_versions = ">=<from>, <<to+1>"` work transparently on <to>.x via the shim.
- Shim retired in engine <to+1>.0.

## How to test
- `cargo update -p nexus-engine`.
- `cargo test --features compat-<from>`.
- `nexus crate test --engine-matrix`.

## Rollback
- Yank the broken version: `nexus crate yank <name>@<bad-version>`.
- Publish a hotfix on the previous major line: `<from>.x.<patch+1>`.
```

## Multi-crate ecosystems (lockstep releases)

When you ship multiple crates that depend on each other (e.g., a genre + its toolkit), coordinate the major bump.

| Step | Action |
|---|---|
| 1 | Tag a shared milestone in your monorepo (`v2.0-rc.1` across all crates) |
| 2 | Publish in dependency order: leaves first, roots last |
| 3 | Use `--dry-run` first; failure of any leaf publish aborts the chain |
| 4 | Verify with `nexus crate health <root> --deep` (recursive health) |
| 5 | Update `awesome-nexus` entries in one PR |
| 6 | Announce in release notes; provide a single migration guide for the whole ecosystem |

Cite Bevy ecosystem migrations (every 6 months, coordinated) as prior art. The async-std / tokio split is the cautionary tale of uncoordinated migrations splitting an ecosystem.

## Deprecation policy from the author side

When *your* crate retires an API:

```rust
#[deprecated(
    since = "0.4.0",
    note = "Use `Style::new_v2`. Removal: 1.0. See MIGRATIONS/0.4-to-1.0.md"
)]
pub fn new(name: &str) -> Self { … }
```

Phases mirror the engine's:
- `0.4.0`: mark deprecated; document migration; release minor.
- `0.4.x` (≥ 1 minor cycle): API works with warning; usage tracked via `cargo public-api` diff.
- `1.0.0`: remove from primary surface; ship in the compat shim if relevant.
- `2.0.0`: shim retired.

## What NOT to do

| Anti-pattern | Why |
|---|---|
| Skip a major (jump `1.x` → `3.x`) | Breaks every consumer on `2.x` who depends on you |
| Silent breaking change in a patch | Violates semver, breaks `Cargo.lock` consumers, gets the crate Quarantined |
| Remove API without prior deprecation | Same |
| Yank-and-republish to "fix" a bad release | crates.io forbids; bump and publish |
| Use compat shim forever | Shim is a bridge, not a destination; cleanup expected within one major |
| Migrate piecemeal across releases of your own crate | Confusing for consumers; do migration in one release, document fully |

## Cross-references

- → `docs/specs/crates/stable-api.md` — tier definitions + shim policy.
- → `docs/specs/crates/versioning.md` — what counts as breaking.
- → `docs/specs/crates/release-pipeline.md` — semver-check enforcement at publish.
- → `docs/guides/crates/publishing.md` — bumping and releasing.
- → `docs/specs/mods/sdk.md` — mirrored discipline on the runtime side.

## Open Questions

- `[DECISION NEEDED]` Whether to provide an LLM-driven `nexus crate migrate <crate>` that auto-applies known transforms. Default: yes, by v1.1, via the `crate-author` subagent.
- `[DECISION NEEDED]` Shim retention window: one major or two? Default: one major (matches mod SDK discipline).
