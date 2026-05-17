<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Security & Supply Chain

> Full-trust (no sandbox) means supply-chain hygiene is the only line of defense. `cargo-deny` + `cargo-audit` mandatory. `cargo-vet` recommended; Verified tier requires it. SBOM per release. No git deps in release builds.

→ Overview: `docs/specs/crates/overview.md`.
→ Engine-side parent policy: `docs/guides/coding-style/dependencies.md`.
→ Audit playbook integration: `docs/specs/crates/quality-bar.md` § supply-chain step.

## The threat model

Third-party crates run native Rust code with the same privileges as the game binary. No VM, no capability gates (those are the mod layer). The hostile-crate surface includes:

| Threat | Example | Mitigation |
|---|---|---|
| Malicious publish | Compromised crates.io account pushes backdoor | `cargo-vet` attestations; pin via lockfile; signature verification |
| Typosquat | `nexus-genere-fps` ships malware | Index naming policy + name-lint |
| Dep confusion | Internal-named crate published publicly | Reserve names + `[patch.crates-io]` for internal |
| CVE in transitive | `serde_yaml` polyglot exploit | `cargo-audit` + RustSec |
| License contagion | GPL pulled in transitively | `cargo-deny` (license step) |
| `unsafe` exploit | UAF in physics bindings | `cargo-geiger` + manual review |
| Build-script abuse | `build.rs` exfiltrates env | Reviewed in audit; future: build-script sandbox |
| Yanked dep silently | Removed dep with no fix | `cargo-audit` fails on yanked |
| Proc-macro abuse | `proc-macro` evaluates malicious code at compile time | Audit list; pin versions; consider macro sandbox |

## Mandatory tools

| Tool | Use | Engine policy | Cite |
|---|---|---|---|
| `cargo-deny` | License + advisory + edge ban + source rules | Required in CI for every consumer | `https://github.com/EmbarkStudios/cargo-deny` |
| `cargo-audit` | RustSec advisory check | Required in CI | `https://github.com/rustsec/rustsec` |
| `cargo-vet` | Cross-org review attestations | Required for Verified tier | `https://mozilla.github.io/cargo-vet/` |
| `cargo-cyclonedx` | SBOM emission (CycloneDX) | Required per release | `https://github.com/CycloneDX/cyclonedx-rust-cargo` |
| `cargo-geiger` | `unsafe` audit | Required for Verified tier | `https://github.com/rust-secure-code/cargo-geiger` |
| `cargo-semver-checks` | API semver enforcement | Required at publish | `https://github.com/obi1kenobi/cargo-semver-checks` |
| `cosign` | Sigstore artifact signing | Optional; surfaced in index | `https://docs.sigstore.dev/` |

## Per-crate CI requirements

Every `nexus-*` crate's CI MUST include:

```yaml
- run: cargo deny check
- run: cargo audit --deny=warnings
- run: cargo geiger --output-format=Json > geiger.json
- run: cargo public-api --diff-git-checkouts main HEAD
- run: cargo semver-checks check-release
- run: cargo cyclonedx --format json --output sbom.cdx.json
```

For Verified tier add:

```yaml
- run: cargo vet --locked
- run: cosign sign-blob --yes --output-signature sbom.cdx.json.sig sbom.cdx.json
```

Provided as a copy-paste workflow at `docs/guides/crates/publishing.md` § CI template.

## `cargo-vet`

Cross-organizational review chain. Each Verified crate ships `.cargo-vet/audits.toml` attestations declaring "we read the source at this version" with a signature.

```toml
# .cargo-vet/audits.toml
[[audits.serde]]
who = "alice@nexus-council"
criteria = "safe-to-deploy"
version = "1.0.197"
notes = "Reviewed for unsafe, build.rs, proc-macro abuse. Clean."

[[audits.serde]]
who = "bob@embark"
criteria = "safe-to-deploy"
version = "1.0.197"
delta = "1.0.196 -> 1.0.197"
notes = "Delta only; CI-only change."
```

Aggregator: `nexus-hub` mirrors verified attestations into an org-wide `audits.toml` so consumers don't reaudit. → `docs/guides/crates/publishing.md` § Vet.

## `cargo-audit` + RustSec

`cargo-audit` consumes the RustSec Advisory DB (`https://rustsec.org/advisories/`). Run on every PR; block on `vulnerability = "deny"`.

Failure modes:
- Direct dep has open advisory → block.
- Transitive dep has open advisory → block; consumer chooses to override via documented exception (PR review).
- Dep is yanked → block; force upgrade.

`nexus-hub` cross-references: when a new advisory is filed, every indexed crate's status updates within 15 minutes; Verified crates auto-downgrade to Quarantine on critical advisories.

## SBOM (CycloneDX)

Every `nexus crate publish` emits an SBOM and uploads it alongside the artifact.

```bash
cargo cyclonedx --format json --output sbom.cdx.json
```

Includes: every dep, version, license, hash, source URL. Format: `https://cyclonedx.org/specification/overview/`.

`nexus-hub` stores SBOMs and offers diffing:

```
GET /v1/sbom/nexus-style-anime/0.3.1.cdx.json
GET /v1/sbom-diff/nexus-style-anime/0.3.0/0.3.1
```

Game builders generate per-release SBOM via `nexus crate license-bundle --sbom`. → `docs/specs/crates/licensing.md`.

## Git deps

| Context | Policy |
|---|---|
| `[dependencies]` of a published `nexus-*` crate | Forbidden. `cargo-deny` rejects. |
| `[dev-dependencies]` | Allowed for local-only test infrastructure. |
| `[patch.crates-io]` | Allowed in consumer game projects only; never published. |
| `path = "..."` deps | Allowed inside one workspace; forbidden when publishing. |

Reproducible builds require crates.io as the source of truth. Cite: `https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#specifying-dependencies-from-git-repositories`.

## Vendoring policy (offline / air-gapped studios)

For studios under NDA, console SDKs, or air-gap requirements:

```bash
cargo vendor --locked vendor/
```

Plus `.cargo/config.toml`:

```toml
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
```

Effect: full dep tree captured locally; `cargo build` makes zero network calls. Encouraged for production releases; CI verifies vendor dir is byte-identical to lock.

## `unsafe` audit

`cargo-geiger` counts `unsafe` occurrences per crate, per version. Tracked in audit JSON:

```json
{ "id": "unsafe", "status": "pass", "count": 0, "trend": "flat" }
```

Verified tier policy:
- `count > 0` requires `// SAFETY:` block per Law 6 with the three required parts (invariant, why-not-safe, test/fuzz).
- Trend: flat or down over time. A crate that grows `unsafe` between minor versions triggers re-audit.
- Build scripts (`build.rs`) and proc-macros get heavier scrutiny — they execute at compile time.

## Sigstore signing

`[DECISION NEEDED]` Mandatory vs optional for Verified tier.

`cosign sign-blob` produces an offline-verifiable signature for the published crate tarball + SBOM. `nexus add` optionally verifies via Sigstore transparency log:

```
nexus add nexus-style-anime --verify-sigstore
```

Default proposal: **optional in v1.0, mandatory for Verified in v1.1**.

## Crates.io provenance

When crates.io ships build provenance (`https://crates.io/policies` evolves), `nexus crate audit` consumes it as an additional health signal. `[VERIFY — crates.io policy changes]`.

## Yank semantics

A yanked crate is still downloadable (existing `Cargo.lock` consumers unaffected) but excluded from new resolution. Policy:

| Reason | Action |
|---|---|
| Author yanks for severe bug | Auto-flag as Quarantine pending re-audit |
| Author yanks for non-security cleanup | No tier change; banner in index |
| CVE disclosed | Yank + force advisory in RustSec; consumers see `cargo-audit` failure |

Note: crates.io does not support delete. Even a yanked crate's source persists. Cite: `https://crates.io/policies` and `https://doc.rust-lang.org/cargo/commands/cargo-yank.html`.

## Integration Points

- → `docs/specs/crates/licensing.md` — license enforcement is a subset of supply chain.
- → `docs/specs/crates/quality-bar.md` — supply-chain check feeds the audit verdict.
- → `docs/specs/crates/manifest.md` — `sbom`, `vet_attestation`, `audit_log_url` fields.
- → `docs/guides/coding-style/dependencies.md` — engine-side baseline (we extend it).
- → `docs/specs/mods/anti-cheat.md` — analogous trust model on the runtime side.

## Prior Art

- **Mozilla `cargo-vet`** ✓ — exactly this pattern; we adopt without modification. `https://mozilla.github.io/cargo-vet/`.
- **RustSec advisory DB** ✓ — community-maintained CVE feed.
- **GitHub Dependabot** ✓ — automated PRs for vuln-fix bumps; complementary to `cargo-audit`.
- **Sigstore / cosign** ✓ — keyless signing; pairs well with crates.io publish.
- **SLSA framework** ✓ — provenance levels; `nexus-hub` aims for SLSA L2 minimum.
- **`event-stream` npm hijack** ✗ — the cautionary tale for ownership-transfer hygiene.
- **`xz-utils` backdoor** ✗ — the cautionary tale for slow-burn social engineering; vet attestations help, full prevention is open research.

## Open Questions

- **RESOLVED 2026-05-17** — Sigstore: **optional v1.0, mandatory v1.1**. See `docs/architecture/decisions-resolved.md`.
- `[DECISION NEEDED]` Whether to operate a `nexus-vet` shared review pool (mirroring Mozilla's). Default: yes, by v1.1.
- `[DECISION NEEDED]` Build-script sandbox: explore `cargo-sandbox` or Bubblewrap wrapper. Default proposal: defer to v2.0; document risk.
- `[BENCHMARK NEEDED]` Indexer-side CVE re-evaluation cycle: target ≤ 15 min from RustSec publish.
- `[VERIFY — crates.io policy changes]` confirm provenance + yank semantics at v1.0 ship date.
