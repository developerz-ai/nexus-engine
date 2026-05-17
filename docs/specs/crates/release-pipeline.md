<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Release Pipeline

> `nexus crate publish` wraps `cargo publish` with semver checks, manifest validation, index registration, audit-attestation upload, signed SBOM emission, and Conventional-Commits changelog. One command. JSON-out.

→ Overview: `docs/specs/crates/overview.md`.
→ Author flow: `docs/guides/crates/publishing.md`.
→ Quality bar / audit: `docs/specs/crates/quality-bar.md`.
→ `cargo publish` reference: `https://doc.rust-lang.org/cargo/commands/cargo-publish.html`.

## CLI surface

```
nexus crate new <name> --category <key>         # scaffold from template
nexus crate test [--scenarios|--benches|...]    # run the category test pack
nexus crate audit <name>[@<version>]            # run the curator playbook
nexus crate publish [--dry-run] [--verified]    # the release command
nexus crate yank <name>@<version>               # wrap `cargo yank`
nexus crate reserve <name> --category <key>     # Council reservation request
nexus crate health <name>                       # query index health signals
nexus crate license-bundle [--sbom]             # emit THIRD_PARTY_LICENSES.md (+ SBOM)
```

All commands respect global `nexus` CLI flags: `--json`, `--quiet`, `--verbose`, `--manifest`, `--profile`. → `docs/game-template/cli.md`.

## `nexus crate publish` — the canonical flow

```
nexus crate publish [--dry-run] [--verified] [--registry=<name>]
```

Sequence (every step JSON-streamed):

```
1. preflight
   ├── parse Cargo.toml + [package.metadata.nexus]
   ├── validate naming.md rules
   ├── validate license against allow-list
   ├── validate engine_versions parses
   └── validate category enum
2. test
   ├── cargo test --workspace
   ├── cargo test --doc
   ├── nexus crate test --headless --frames=60
   ├── nexus crate test --scenarios
   └── nexus crate test --coverage  → must meet category floor
3. semver
   ├── cargo public-api --diff-git-checkouts <last-tag> HEAD
   ├── cargo semver-checks check-release
   └── refuses non-additive change without major bump
4. supply chain
   ├── cargo deny check
   ├── cargo audit --deny=warnings
   ├── cargo geiger --output-format=Json  → diff vs last release
   └── (Verified tier) cargo vet --locked
5. SBOM
   └── cargo cyclonedx --format json --output sbom.cdx.json
6. changelog
   ├── parse Conventional Commits since last tag
   └── prepend to CHANGELOG.md
7. publish to crates.io
   └── cargo publish [--dry-run]
8. tag + GitHub release
   ├── git tag v<version> -m "<conv-commit summary>"
   ├── git push origin v<version>
   └── gh release create v<version> --title "<version>" --notes-file CHANGELOG.md sbom.cdx.json sbom.cdx.json.sig
9. (optional) sign SBOM via cosign
   └── cosign sign-blob --yes --output-signature sbom.cdx.json.sig sbom.cdx.json
10. (Verified) attestation upload
    └── POST /v1/attest to nexus-hub with audit JSON
11. index notify
    └── POST /v1/refresh/<name> to nexus-hub
12. mirror
    └── (optional) push SBOM + audit to CDN
```

A `--dry-run` stops after step 6.

Exit codes (extends `docs/game-template/cli.md`):

| Code | Meaning |
|---|---|
| 0 | published ok |
| 11 | preflight failed (manifest / naming / license / category) |
| 12 | test failed |
| 13 | semver check failed (breaking change without major bump) |
| 14 | supply-chain failed (deny / audit / geiger) |
| 15 | crates.io publish failed |
| 16 | attestation upload failed |

## JSON output shape

```json
{
  "ok": true,
  "crate": "nexus-style-anime",
  "version": "0.3.1",
  "registry": "crates.io",
  "duration_ms": 84211,
  "steps": [
    { "step": "preflight", "ok": true, "duration_ms": 410 },
    { "step": "test", "ok": true, "duration_ms": 32104 },
    { "step": "semver", "ok": true, "duration_ms": 4112 },
    { "step": "supply-chain", "ok": true, "duration_ms": 6201 },
    { "step": "sbom", "ok": true, "duration_ms": 1024 },
    { "step": "changelog", "ok": true, "duration_ms": 110 },
    { "step": "publish", "ok": true, "duration_ms": 18402 },
    { "step": "tag", "ok": true, "duration_ms": 211 },
    { "step": "release", "ok": true, "duration_ms": 14211, "url": "https://github.com/.../releases/tag/v0.3.1" },
    { "step": "sign", "ok": true, "duration_ms": 4321 },
    { "step": "attestation", "ok": true, "duration_ms": 1521 },
    { "step": "index-notify", "ok": true, "duration_ms": 184 }
  ],
  "artifacts": {
    "crate_url": "https://crates.io/crates/nexus-style-anime/0.3.1",
    "docs_url": "https://docs.rs/nexus-style-anime/0.3.1",
    "github_release": "https://github.com/.../releases/tag/v0.3.1",
    "sbom_url": "https://nexus-hub.dev/sbom/nexus-style-anime/0.3.1.cdx.json",
    "sbom_sig_url": "https://nexus-hub.dev/sbom/nexus-style-anime/0.3.1.cdx.json.sig",
    "audit_url": "https://nexus-hub.dev/audit/nexus-style-anime/0.3.1.json"
  }
}
```

## Conventional Commits → changelog

`nexus crate publish` parses commits since the last tag, classifies via Conventional Commits (`https://www.conventionalcommits.org/`), emits a Keep-a-Changelog (`https://keepachangelog.com/`) entry:

```markdown
## [0.3.1] - 2026-05-17
### Added
- New `with_palette` builder method on `AnimeStyle`.
### Fixed
- Outline shader broke on metal backend (#42).
```

`feat!:` or `BREAKING CHANGE:` footer forces a major bump. The publish refuses to proceed with a major-bump commit unless the user passes `--major`.

## Verified tier publishing

`nexus crate publish --verified` adds:
- `cargo vet --locked` mandatory (step 4).
- `cosign sign-blob` mandatory (step 9) `[DECISION NEEDED]` v1.0 vs v1.1.
- Attestation upload (step 10) signed with a Council member key.
- Auto-PR against `awesome-nexus` to add or update the entry.

Only Council members hold attestation-signing keys. Non-Council authors publish without `--verified`; a Council member runs `nexus crate audit <name> --attest` later to promote.

## CDN mirror (optional)

`nexus-hub` optionally mirrors the published tarball + SBOM to a CDN (Cloudflare R2 or equivalent) for download acceleration in air-gapped or high-latency environments. The mirror does NOT replace crates.io; it shadows. Indexed-only.

## Rollback / yank

```
nexus crate yank nexus-style-anime@0.3.1 --reason "broken outline shader on metal"
```

Wraps `cargo yank` and notifies the index. Yanked versions remain in `Cargo.lock` for existing consumers but are excluded from new resolution. Cite: `https://doc.rust-lang.org/cargo/commands/cargo-yank.html`.

To re-yank (unyank): `nexus crate yank --undo nexus-style-anime@0.3.1` wraps `cargo yank --undo`. Use with care; the index keeps the audit trail.

## Pre-publish checklist (auto-applied)

```markdown
- [ ] [package.metadata.nexus] present and valid
- [ ] License in allow-list; LICENSE file matches SPDX id
- [ ] Naming policy satisfied; no typosquat
- [ ] All tests pass on every supported engine version
- [ ] Coverage ≥ category floor
- [ ] At least one scenario green
- [ ] cargo public-api / semver-checks: no undeclared break
- [ ] cargo deny clean
- [ ] cargo audit clean
- [ ] cargo geiger trend not up
- [ ] SBOM emits cleanly
- [ ] CHANGELOG.md updated
- [ ] (Verified) cargo vet --locked passes
- [ ] (Verified) cosign signature attached
```

`nexus crate publish` runs all of these and refuses on first failure with structured error.

## Crates.io account + auth

`cargo login <TOKEN>` first. The token is read from `~/.cargo/credentials.toml`. `nexus crate publish` does not store or transmit tokens; it shells out to `cargo publish` which handles auth. Cite: `https://doc.rust-lang.org/cargo/reference/publishing.html`.

For CI: store token in repo secret, set `CARGO_REGISTRY_TOKEN` env. GitHub Actions example in `docs/guides/crates/publishing.md`.

## Performance Contract

| Step | Target | Hard limit |
|---|---|---|
| `preflight` | < 1 s | 5 s |
| `test` (typical crate) | < 60 s | 5 min |
| `semver` | < 10 s | 60 s |
| `supply-chain` | < 30 s | 2 min |
| `crates.io publish` | < 30 s | 5 min (network-bound) |
| `attestation upload` | < 5 s | 30 s |

`[BENCHMARK NEEDED]` calibration once first 10 crates published.

## Integration Points

- → `docs/specs/crates/manifest.md` — schema validated in preflight.
- → `docs/specs/crates/naming.md` — name lint in preflight.
- → `docs/specs/crates/licensing.md` — license check in preflight + supply-chain.
- → `docs/specs/crates/testing.md` — test step requirements.
- → `docs/specs/crates/versioning.md` — semver enforcement.
- → `docs/specs/crates/security.md` — supply-chain + SBOM + sign.
- → `docs/specs/crates/quality-bar.md` — Verified flow.
- → `docs/specs/crates/discovery.md` — index notify endpoint.
- → `docs/game-template/cli.md` — global flags + exit codes.

## Open Questions

- `[DECISION NEEDED]` Should `--verified` be a separate CLI command (`nexus crate publish-verified`) or a flag? Default: flag, clearer audit trail.
- `[DECISION NEEDED]` Whether `nexus crate publish` should also push docs to `docs.rs` explicitly or rely on docs.rs's auto-build. Default: rely on docs.rs auto-build; surface failure in `nexus crate health`.
- `[DECISION NEEDED]` Pre-release publish gating: any auto-checks weaker for `-rc.N` versions? Default: same checks; only allowed in dev-deps of Verified consumers.
- `[BENCHMARK NEEDED]` Publish wall-clock for typical and large crates.
