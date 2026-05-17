<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Versioning

> Strict semver. Engine SDK compatibility tags. Deprecation cycles. Migration guide template. PATCH = bug fix. MINOR = feature add, no breakage. MAJOR = breaks; ship migration hooks.

## Semver Rules

`MAJOR.MINOR.PATCH[-prerelease][+build]` (per semver.org).

| Bump | When | Save behavior |
|---|---|---|
| PATCH | Bug fix only; no API or schema change | Hot-swap (state preserved) |
| MINOR | New feature, no removal/break | Warm reload; optional `on_reload` hook |
| MAJOR | Removed/renamed API, breaking schema change | Cold reload; `on_save_migrate_major` required if save loaded |

Per `docs/specs/mods/save-compatibility.md` § Version Skew.

Pre-release tags allowed: `1.2.0-rc1`, `1.2.0-beta.3`. Engine considers pre-release < release per semver rules.

Build metadata (`+build.42`) doesn't affect ordering; ignored by resolver.

## When To Bump What

### PATCH (`x.y.Z`)
- Fixed null check in `on_step`.
- Reduced allocations in hot loop.
- Adjusted balance value (a number tweak).
- Typo in description / locale.

### MINOR (`x.Y.0`)
- Added new feature.
- Added new component / event / asset.
- Added new optional dep.
- Widened a cap parameter (more components readable).
- Engine API additions (no removal).

### MAJOR (`X.0.0`)
- Removed a component / event / public function.
- Renamed a `Persist` field (without migration).
- Tightened a cap.
- Changed a save-schema field in incompatible way.
- Required new dep with no soft fallback.

When in doubt, lean MAJOR; players prefer one painful jump over silent data loss.

## Engine SDK Compatibility Tags

`mod.toml`:
```toml
[mod]
nexus = "^1.0"          # engine semver req
sdk = "^1.0"            # SDK semver req
```

Conventions:
- `^1.0` matches `1.x.y` for any `x ≥ 0, y ≥ 0` (semver caret).
- Explicit pinning `=1.4.2` only when truly needed.
- A new engine MAJOR (e.g., `2.0`) triggers SDK MAJOR; engine ships a compat shim for one major back per `docs/specs/mods/sdk.md`.

Mods declaring `sdk = "^1.0"` continue to run on engine `2.x` via shim until engine `3.0`.

## Deprecation Cycle (when YOU deprecate your mod's API)

Mods often expose APIs to other mods (library mods).

```
v1.4: mark deprecated, keep working, warn in log
       └── ATTRIBUTE: #[deprecated(since="1.4", note="use Y", removal="2.0")]
v1.5..1.99: still works; warn at runtime per call
v2.0: removed
```

Consumers see warnings in time to migrate.

CLI helper:

```
nexus mod deprecation-report
```

Lists deprecated APIs your mod calls (from your deps) + APIs you marked deprecated for downstream consumers.

## Save Compatibility Hooks

Declare in `mod.toml`:

```toml
[save_compat]
minor_compat = true
on_save_migrate = "src/migrate.rn::migrate_minor"
on_save_migrate_major = "src/migrate.rn::migrate_major"

[persist_compat]
on_persist_migrate = "src/migrate.rn::persist_migrate"
```

`src/migrate.rn`:

```rune
pub fn migrate_minor(prev: PrevState) -> Result<NewState> {
    Ok(NewState {
        v: 2,
        old_field: prev.old_field,
        new_field_default: 0,
    })
}

pub fn migrate_major(prev_bytes: Vec<u8>, prev_ver: SemVer) -> Result<NewBytes> {
    let prev = decode_v1(&prev_bytes)?;
    let new = NewSave::from(prev);
    Ok(encode_v2(&new))
}

pub fn persist_migrate(prev: Vec<u8>, prev_ver: SemVer, new_ver: SemVer) -> Result<Vec<u8>> {
    match (prev_ver.major, new_ver.major) {
        (1, 2) => migrate_persist_1_to_2(prev),
        _      => Ok(prev),  // unchanged
    }
}
```

Engine calls these once on save load (one-time migration). Backups written to `<save>.pre-migrate.bak`.

→ `docs/specs/mods/save-compatibility.md` for full contract.

## Migration Guide Template

Ship `MIGRATION.md` alongside `CHANGELOG.md`:

```markdown
# Migration — v1.x → v2.0

## Breaking Changes
- Removed `nexus.mod.world.spawn_async` (use `spawn` + `Persist` hook).
- Renamed `[capabilities].events.emit` to `events.publish` in mod.toml schema.
- `Persist` schema field `hp` is now `health.current`.

## Player Impact
- Existing saves auto-migrate on first load (backup saved as `*.pre-migrate.bak`).
- Mods depending on this lib must update to `^2.0` before engine `3.0`.

## Author Migration Steps
1. Replace `spawn_async` calls with `spawn` + `on_persist_load`.
2. Rename event-emit schema fields.
3. Bump `[deps]` for "com.you.this-lib" to `^2.0`.

## Compatibility Shim
- A shim for `1.x` calls remains active until our `3.0` release.
- Warnings logged on each shim hit; migrate at your pace.
```

Engine's `nexus mod outdated` reads `MIGRATION.md` URL from manifest and surfaces "migration guide available" badge in mod browser.

## Versioning Library Mods

Library mods (other mods dep on them) follow stricter semver:
- Every API change reviewed against semver impact.
- PATCH must NEVER break consumers.
- A test in `scenarios/api-stability.toml` exercises every public symbol; CI gate.

## Pre-Release Workflow

```
nexus mod release-candidate 2.0.0-rc1
nexus mod publish --to self-hosted --tag rc      # players opt-in to rc channel
# get feedback...
nexus mod release-candidate 2.0.0-rc2
# ...
nexus mod release 2.0.0
```

Players in dev profile auto-fetch rc tags; default profile sees only release.

## Engine Coupling

If you target only one engine major (`nexus = "1"`), all your version bumps are mod-internal. If you support multiple engines:

```toml
[mod]
nexus = ">=1.4, <3.0"
```

CI matrix tests across each supported engine version.

## Pitfalls

- Forgetting to bump version → publish fails.
- Bumping PATCH for a schema change → silent data corruption on hot-reload; always pick MINOR/MAJOR for schema work.
- Skipping deprecation cycle for library mods → consumer mods break overnight.
- Not shipping `MIGRATION.md` for MAJOR → players abandon your mod at update time.

## Cross-Links

- → `docs/specs/mods/sdk.md` — engine SDK semver promise.
- → `docs/specs/mods/save-compatibility.md` — migration hooks.
- → `packaging.md` — pack with the right version.
- → `publishing.md` — publish gates on uniqueness.
- → `templates.md` `library` template.
