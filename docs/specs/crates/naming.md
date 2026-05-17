<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Crates — Naming Policy

> The crate name is policy, not aesthetics. Prefix declares trust tier. Subname declares category. Bad names get rejected from the official index.

→ Overview: `docs/specs/crates/overview.md`.
→ Categories enum: `docs/specs/crates/categories.md`.
→ crates.io naming rules: `https://doc.rust-lang.org/cargo/reference/manifest.html#the-name-field` and the policy page: `https://crates.io/policies`.

## Prefix Table

| Prefix | Who may publish | Trust default | Use case |
|---|---|---|---|
| `nexus-*` | Reserved: official engine + Verification-Council-verified third-party | Verified by default | The "we vouch for this" tier |
| `nexus-community-*` | Anyone | Community tier (no audit) | Open ecosystem; auditable but unaudited |
| `nx-*` | Anyone (typically game-side) | Author-scoped | A game studio's internal crates published for re-use |

Other prefixes (`my-nexus-foo`, `nexustools-bar`) are allowed on crates.io but not indexed by `nexus-hub`. → `docs/specs/crates/discovery.md`.

## Subname Rules

Format: `<prefix><category-key>-<distinguisher>`.

| Category | Subname pattern | Example |
|---|---|---|
| `genre` | `nexus-genre-<genre>` | `nexus-genre-spaceflight` |
| `style` | `nexus-style-<style>` | `nexus-style-anime` |
| `physics` | `nexus-physics-<backend>` | `nexus-physics-jolt-bridge` |
| `net` | `nexus-net-<protocol>` | `nexus-net-webtransport` |
| `audio` | `nexus-audio-<backend>` or `nexus-audio-dsp-<effect>` | `nexus-audio-dsp-reverb-convolution` |
| `asset-source` | `nexus-asset-source-<provider>` | `nexus-asset-source-meshy` |
| `telemetry-sink` | `nexus-telemetry-sink-<provider>` | `nexus-telemetry-sink-honeycomb` |
| `feature-flag` | `nexus-feature-flag-<provider>` | `nexus-feature-flag-growthbook` |
| `input` | `nexus-input-<device>` | `nexus-input-eye-tracker-tobii` |
| `platform` | `nexus-platform-<target>` | `nexus-platform-steamdeck` |
| `script-lang` | `nexus-script-lang-<lang>` | `nexus-script-lang-wren` |
| `genre-toolkit` | `nexus-genre-toolkit-<concept>` | `nexus-genre-toolkit-quests` |
| `tools` | `nexus-tools-<purpose>` | `nexus-tools-shader-permutation-gen` |
| `test-fixtures` | `nexus-test-fixtures-<theme>` | `nexus-test-fixtures-determinism-suite` |

Distinguisher MUST be:
- kebab-case, lowercase ASCII, `[a-z0-9-]+`.
- ≤ 32 chars (the full crate name ≤ 64 chars — crates.io caps at 64).
- Not a known typo of an existing crate (`nexus-genere-fps` rejected; Levenshtein ≤ 2 to a verified name).
- Not a trademark of a third party unless the publisher owns the mark (e.g., only Epic publishes `nexus-net-epic-eos`).

## `nexus-*` Reservation Process

Anyone can publish `nexus-*` on crates.io (the registry does not enforce prefix ownership). The Nexus ecosystem mitigates by:

1. **Squatting defense.** The Verification Council pre-registers placeholder crates for likely names. Squatted unverified names get a deprecation banner via the `nexus-hub` index. crates.io itself does not unpublish — see policy → `https://crates.io/policies`.
2. **Verified badge.** Only Council-verified crates display the Verified tier in `nexus-hub` and in `nexus add` output. → `docs/specs/crates/quality-bar.md`.
3. **Name takeover.** If a `nexus-*` name is squatted with no maintenance, the Council can apply to crates.io for "abandoned crate" transfer per crates.io policy. **Slow, manual, last resort.**

`[DECISION NEEDED]` Whether to operate an alt registry (`nexus-registry.dev`) that enforces prefix policy at publish time. Default proposal: **no** in v1.0 (crates.io is the federation point); revisit if squatting becomes endemic.

## Bad Names (Rejected from Index)

| Pattern | Reason | Example |
|---|---|---|
| Collides with existing verified crate | Confusion | `nexus-genre-fps2` (when `nexus-genre-fps` exists) |
| Typosquat of verified crate | Phishing risk | `nexus-genre-fpz` |
| Misleading category | Bait | crate categorized `style` but named `nexus-genre-noir` |
| Implies official without being official | Trademark | `nexus-official-cosmetics` |
| Profanity or slur | Code of Conduct | (any) |
| Uses someone else's brand without permission | IP risk | `nexus-engine-disney-pack` |
| Too generic | Discovery noise | `nexus-helper`, `nexus-utils` |

Index rejection is index-only. Crates.io still hosts the crate; `nexus add` warns the consumer with a banner.

## Reservation request

To pre-reserve a `nexus-*` name without publishing yet:

```
nexus crate reserve nexus-style-claymation \
  --category style \
  --intent "implementing claymation stop-motion StylePipeline" \
  --eta 2026-09-01
```

Submits to the Verification Council queue. Reservation expires in 90 days without movement. → `docs/guides/crates/community-policy.md`.

## Renaming

crates.io does not support rename. To rename: publish a new crate, mark old as `deprecated` in manifest, ship a one-line `pub use new_name::*;` shim in the old crate, yank old versions after one major-version cycle. → `docs/specs/crates/release-pipeline.md`.

## Cross-references

- → `docs/specs/crates/categories.md` — the category enum drives subname.
- → `docs/specs/crates/quality-bar.md` — Verified vs Community tier mapping.
- → `docs/specs/crates/discovery.md` — how the index uses prefix to filter.
- → `docs/specs/crates/release-pipeline.md` — `nexus crate publish` runs the name lint.

## Open Questions

- `[DECISION NEEDED]` Whether to publish a CODEOWNERS-style file in the registry index that maps `nexus-*` subnames to their Council-blessed maintainer.
- `[VERIFY — crates.io policy changes]` Confirm name-squatting and abandoned-crate transfer rules at v1.0 ship date.
- `[DECISION NEEDED]` Reserved length: hard cap or soft? crates.io caps at 64; we recommend ≤ 48 for readability in `nexus add` output.
