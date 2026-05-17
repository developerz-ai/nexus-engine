<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods — Package Format (`.nxmod`)

> A `.nxmod` is a deterministic, signed, content-addressed archive containing a `mod.toml`, source/bytecode, asset overlays, and a hash manifest. One file, one mod, one signature.

## Boundaries
- Owns: archive layout, hash manifest, signature envelope, reproducible-build rules, per-tier size budgets.
- Does NOT own:
  - Manifest schema → `manifest.md`
  - Capability semantics → `docs/specs/scripting/sandbox.md`
  - Asset format internals → `docs/specs/assets/overview.md`
  - Resolver / lockfile → `dependencies.md`
- Depends on: `docs/specs/assets/overview.md` (`.nxa` asset packs), `docs/specs/assets/registry.md` (UUIDs).

## Container

`.nxmod` is a ZIP64 archive. STORE only for already-compressed members (PNG, OGG, `.nxa`). DEFLATE for text. Sortable file order. UTC timestamps fixed to `2026-01-01T00:00:00Z` for reproducibility.

```
mymod-1.2.3.nxmod  (zip64)
├── mod.toml                 ← REQUIRED, schema → manifest.md
├── MANIFEST.sha256          ← REQUIRED, line-per-file BLAKE3 (despite name)
├── SIGNATURE                ← OPTIONAL until v1.1, REQUIRED for marketplace upload
├── LICENSE                  ← REQUIRED, OSI SPDX id matched in mod.toml
├── README.md                ← OPTIONAL, surfaced in mod browser
├── CHANGELOG.md             ← OPTIONAL, surfaced on update
├── icon.png                 ← OPTIONAL, 256x256 max
├── screenshots/             ← OPTIONAL, up to 6 × 1920x1080 JPEG
├── src/
│   ├── lib.rn               ← Rune entry; path in mod.toml::[mod].entry
│   └── **/*.rn
├── bytecode/                ← OPTIONAL, *.rnc; cuts cold-start
│   └── lib.rnc
├── assets/                  ← .nxa packs only, NEVER raw source assets
│   └── *.nxa
├── overlays/                ← UUID-keyed partial asset overrides
│   └── <ulid>.overlay.toml  ← → asset-overlay.md
├── locale/                  ← Fluent .ftl files
│   └── <lang>.ftl
└── scenarios/               ← OPTIONAL test scenarios
    └── *.toml               ← → docs/specs/agent/scenarios.md
```

Forbidden at top level: anything not listed. Validator rejects with `MOD_E_LAYOUT`.

## Hash Manifest

`MANIFEST.sha256` — name kept for grep, content is BLAKE3-256 (faster, tree-friendly).

```
b3:<64-hex>  mod.toml
b3:<64-hex>  src/lib.rn
b3:<64-hex>  bytecode/lib.rnc
b3:<64-hex>  assets/main.nxa
...
```

Rules:
- Sorted by path (LC_COLLATE=C).
- LF line endings.
- Excludes `MANIFEST.sha256` and `SIGNATURE` themselves.
- Trailing newline.

`mod_hash = blake3(MANIFEST.sha256 bytes)` — 32 bytes, the canonical identity of the package. Used by:
- Multiplayer hash-agreement (→ `multiplayer-sync.md`).
- Asset registry dedupe (→ `docs/specs/assets/registry.md`).
- Update detection.
- Telemetry (→ `telemetry.md`).

## Signature

`SIGNATURE` — TOML, Ed25519.

```toml
[signature]
algorithm = "ed25519"
public_key = "z6Mk..."          # multibase base58btc
mod_hash   = "b3:abcd...1234"   # MUST match computed
signed_at  = "2026-05-17T10:23:00Z"
signature  = "z3..."            # multibase base58btc, 64 bytes
publisher  = "did:key:z6Mk..."  # optional, DID for key rotation
```

Verification:
1. Re-compute `mod_hash` from `MANIFEST.sha256`.
2. Compare to declared `mod_hash`. Fail = `MOD_E_HASH_MISMATCH`.
3. Verify `signature` over the bytes of `MANIFEST.sha256` using `public_key`.
4. Fail = `MOD_E_SIG_INVALID`.

Engine never auto-trusts a key. Trust decisions:
- Marketplace publisher key → trusted via marketplace's web-of-trust.
- Self-hosted key → trusted via player TOFU (trust on first use, prompted).
- Unsigned in dev (`--dev`) → allowed, banner shown.
- Unsigned in `--ship` builds → `[DECISION NEEDED]` default behavior.

→ `docs/specs/scripting/sandbox.md` § Open Questions on signed-mod auto-approval.

## Reproducible Build

A `.nxmod` MUST be byte-identical when built from the same sources by any builder.

Rules enforced by `nexus mod pack`:
- ZIP entries sorted by path.
- All timestamps set to epoch constant (`2026-01-01T00:00:00Z`).
- All UIDs/GIDs zeroed.
- All file modes normalized: 644 for files, 755 for dirs.
- DEFLATE compression level fixed (level 6, default).
- No build-host paths in any artifact.
- Bytecode (`.rnc`) compiled with version-pinned Rune toolchain (declared in `mod.toml::[build].rune`).
- `.nxa` asset packs built with version-pinned encoder.

Test: `nexus mod pack` twice → `cmp` shows zero diff. CI enforces.

## Size Budgets (per tier)

| Tier | Total `.nxmod` | Single `.nxa` | Source dir | Bytecode dir |
|---|---|---|---|---|
| Skin | 250 MB | 200 MB | n/a | n/a |
| Behavior | 500 MB | 400 MB | 5 MB | 5 MB |
| Total Conversion | 8 GB | 4 GB | 100 MB | 100 MB |

Over-budget = `MOD_E_SIZE_EXCEEDED`, install refused. Marketplaces typically enforce lower limits; matrix in `docs/guides/mods/marketplaces/decision-matrix.md`.

`[BENCHMARK NEEDED]` — confirm streaming behavior at upper bound on Steam Deck / mid-tier mobile.

## Build Section in `mod.toml`

```toml
[build]
rune        = "1.0.4"           # toolchain pin
nxa-encoder = "1.0.0"           # asset packer pin
sdk         = "nexus-1.0"       # → sdk.md
deterministic = true            # enforces reproducible-build rules above
```

## CLI

```
nexus mod pack [--out target/]                # build .nxmod
nexus mod verify path/to/mod.nxmod            # hash + signature + layout
nexus mod inspect path/to/mod.nxmod           # JSON dump of manifest + hashes + caps
nexus mod sign --key keys/mod-signing.key path/to/mod.nxmod
nexus mod keygen --out keys/                  # Ed25519 keypair
```

All commands emit structured JSON to stdout when `--json` is set. → `docs/guides/mods/authoring/packaging.md`.

## Error Contract

| Code | Meaning | Action |
|---|---|---|
| `MOD_E_LAYOUT` | Forbidden file at top level / required file missing | Reject install; structured detail |
| `MOD_E_HASH_MISMATCH` | Computed `mod_hash` ≠ MANIFEST | Reject; possible tamper |
| `MOD_E_SIG_INVALID` | Ed25519 verify failed | Reject in `--ship`; warn in `--dev` |
| `MOD_E_SIZE_EXCEEDED` | Tier budget breached | Reject install |
| `MOD_E_BYTECODE_VERSION` | `.rnc` compiled with mismatched Rune | Recompile; or strip bytecode and recompile-on-load |
| `MOD_E_LICENSE_MISSING` | No `LICENSE` file | Reject install |
| `MOD_E_LICENSE_MISMATCH` | LICENSE content ≠ declared SPDX id | Reject install |
| `MOD_E_REPRODUCIBLE` | `[build].deterministic = true` but build is not reproducible | Reject in CI; warn locally |

## Performance Contract

| Metric | Target | Hard limit |
|---|---|---|
| `mod inspect` for 100 MB `.nxmod` | < 50 ms | 200 ms |
| Signature verify | < 5 ms | 20 ms |
| Hash recompute (BLAKE3, 500 MB) | < 800 ms (4 cores) | 3 s |
| Install (verify + extract metadata, no asset decode) | < 1 s for 500 MB | 5 s |

`[BENCHMARK NEEDED]`.

## Integration Points

- `manifest.md` — schema parsed during verify.
- `docs/specs/assets/overview.md` — `.nxa` packs inside `assets/`.
- `docs/specs/assets/registry.md` — overlay declarations resolved against asset UUIDs.
- `docs/specs/scripting/rune.md` — `src/`, `bytecode/` consumed by VM loader.
- `dependencies.md` — resolver reads `[deps]` section from manifest.
- `multiplayer-sync.md` — `mod_hash` is the cross-peer identity.

## Test Requirements

- A `.nxmod` produced from the same source on Linux/Win/Mac is byte-identical.
- Flipping a single byte in any included file fails `mod verify` with `MOD_E_HASH_MISMATCH`.
- Removing `SIGNATURE` in a signed `.nxmod` fails verify in `--ship`; passes with banner in `--dev`.
- Fuzz: 10k malformed archives produce only structured errors, zero panics.
- Reproducible-build CI: two clean runs of `nexus mod pack` produce identical artifacts.

## Prior Art

- `.jar` / `.apk` / `.crx` ✓ — ZIP-with-manifest pattern.
- `.flatpak` / `.snap` ✓ — signed bundle with deterministic layout.
- `.wasm` component ✓ — single-file deployable.
- BepInEx plugins ✗ — loose folder layout; no hash, no sig; what we avoid.
- Thunderstore `.zip` ✓ — simple manifest.json + dependencies; influenced our `[deps]` design.
- Steam Workshop content (loose folders) ✗ — no inherent integrity; we add one.

## Open Questions

- `[DECISION NEEDED]` Default `--ship` policy for unsigned mods.
- `[DECISION NEEDED]` Whether to support delta updates (`.nxmod.patch`) for large total conversions.
- `[DECISION NEEDED]` Bytecode shipping default (yes for size & speed, no for transparency).
- `[BENCHMARK NEEDED]` All perf numbers.
- `[AGENT: 09]` Confirm `.nxa` header surface for embedded packs.
- `[AGENT: 25]` Confirm `nexus mod pack` script lives alongside other CLI scripts.
