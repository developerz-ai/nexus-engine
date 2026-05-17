<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Authoring — Packaging

> `nexus mod pack` → reproducible `.nxmod`. Signing key generation. Hash manifest. Tier budgets enforced. → `docs/specs/mods/package-format.md`.

## Pack

```
nexus mod pack [--out target/] [--profile dev|ship]
```

Output: `target/<mod-id>-<version>.nxmod`.

Flags:
- `--profile dev` — warns on lint, includes `--dev`-only artifacts (debug symbols), faster.
- `--profile ship` — strict; rejects warnings; reproducible; default for CI.

## Verify

```
nexus mod verify path/to/mymod-1.0.0.nxmod
```

Checks:
- ZIP layout.
- `MANIFEST.sha256` matches all included files.
- `SIGNATURE` (if present) verifies against `MANIFEST.sha256`.
- `LICENSE` matches declared SPDX id (byte-compare).
- Manifest schema valid.
- Tier budget respected.

Exit 0 = ok. Non-zero with structured stderr JSON on `--json`.

## Inspect

```
nexus mod inspect path/to/mymod-1.0.0.nxmod
```

JSON dump:

```json
{
  "mod_hash": "b3:abcd...1234",
  "manifest": { ... full mod.toml as JSON ... },
  "files": [
    { "path": "src/lib.rn", "size": 2048, "hash": "b3:..." },
    ...
  ],
  "size_bytes": 18432000,
  "tier_budget_remaining_bytes": 506000000,
  "signed": true,
  "signer_pubkey": "z6Mk...",
  "build": {
    "rune": "1.0.4",
    "nxa-encoder": "1.0.0",
    "deterministic": true
  }
}
```

## Signing Key Generation

```
nexus mod keygen --out keys/
```

Generates:
- `keys/signing.key` — Ed25519 private key (PKCS#8 PEM); guard with file perms 600.
- `keys/signing.pub` — public key (multibase base58btc).
- `keys/did.json` — DID document tying pubkey to your identity (optional).

Print the public key for inclusion in marketplace listings:

```
nexus mod keygen --print-pubkey
> z6MkpXyZ...
```

Rotation:

```
nexus mod keygen --rotate --previous keys/signing.key --out keys-new/
```

New key signed by old; engine accepts cross-signed rotation at install time.

## Sign

```
nexus mod sign --key keys/signing.key path/to/mymod-1.0.0.nxmod
```

Reads `MANIFEST.sha256`, signs its bytes, writes/replaces `SIGNATURE`. Verifies before writing; bails on hash mismatch.

## Reproducible Build

Per `docs/specs/mods/package-format.md` § Reproducible Build. CI gate:

```
nexus mod pack
mv target/*.nxmod /tmp/build1.nxmod
nexus mod pack
mv target/*.nxmod /tmp/build2.nxmod
cmp /tmp/build1.nxmod /tmp/build2.nxmod && echo "reproducible"
```

If `cmp` fails, common culprits:
- Build-host paths leaking into bytecode.
- Non-deterministic asset encoder.
- Map / set iteration order in code-gen.
- Timestamps not normalized.

Engine's packer enforces all of these; if you hit a fail, file a bug.

## Bytecode Inclusion

By default `[build]` ships pre-compiled bytecode under `bytecode/` to cut cold-load time:

```
build/
├── bytecode/
│   └── lib.rnc
└── ...
```

Toggle in `mod.toml`:

```toml
[build]
ship_bytecode = true       # default: true
```

Effects:
- Smaller cold-start (~30 ms saved on 5 KB modules).
- Bytecode is pinned to the Rune toolchain version (`[build].rune`).
- Engine refuses to load `.rnc` compiled with a different Rune version (`MOD_E_BYTECODE_VERSION`); falls back to compiling `.rn`.
- Trade-off: opaque to inspection. Some marketplaces / users prefer source-only mods for review.

`[DECISION NEEDED]` default ship-bytecode policy.

## Manual Build Steps (for understanding)

Internally `pack` runs:

```
1. nexus assets pack-from-source     → assets/*.nxa
2. rune compile src/**/*.rn          → bytecode/*.rnc
3. validate mod.toml schema
4. collect all files (sort)
5. compute BLAKE3 of each
6. write MANIFEST.sha256
7. zip --no-extra --no-attr           (timestamps normalized)
8. (optional) sign → SIGNATURE
9. verify → done
```

`nexus mod pack --explain` prints each step's timing.

## Multi-Output

```
nexus mod pack --target linux,windows,web
```

Per-target outputs for cases where assets differ (e.g., compressed for web, full-res for desktop). Outputs `mymod-1.0.0-linux.nxmod`, etc.

Most mods are single-output. Multi-output mainly for total conversions with heavy assets.

## Signing Best Practices

| Recommendation | Why |
|---|---|
| Generate key on offline machine | Keep private key off CI |
| Use CI secret for `signing.key` (encrypted) | Standard for automated signing |
| Rotate before key compromise | Engine accepts cross-signed rotation |
| Publish pubkey alongside mod URL | Lets players pin trust |
| Use DID document for portable identity | Survives provider changes |
| Never reuse keys across mods you don't control | Compromise scope limited |

## CI Template

```yaml
name: mod-package
on:
  push:
    tags: ['mod-v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: nexusengine/setup-nexus@v1
      - run: nexus mod pack --profile ship
      - run: nexus mod verify target/*.nxmod
      - env:
          NEXUS_SIGNING_KEY: ${{ secrets.NEXUS_SIGNING_KEY }}
        run: |
          echo "$NEXUS_SIGNING_KEY" > /tmp/signing.key
          chmod 600 /tmp/signing.key
          nexus mod sign --key /tmp/signing.key target/*.nxmod
      - uses: actions/upload-artifact@v4
        with:
          name: nxmod
          path: target/*.nxmod
```

## Error Contract

(extracts from `docs/specs/mods/package-format.md`)

| Code | Meaning |
|---|---|
| `MOD_E_LAYOUT` | Forbidden file at top level |
| `MOD_E_HASH_MISMATCH` | MANIFEST hash mismatch |
| `MOD_E_SIG_INVALID` | Signature verify failed |
| `MOD_E_SIZE_EXCEEDED` | Over tier budget |
| `MOD_E_LICENSE_MISSING` | LICENSE file missing |
| `MOD_E_LICENSE_MISMATCH` | LICENSE content ≠ SPDX |
| `MOD_E_REPRODUCIBLE` | `[build].deterministic = true` failed |

## Pitfalls

- Forgetting to commit `mod.toml` updates before tagging → CI builds an old version.
- Using `--profile dev` in CI by accident → ship-mode reproducibility lost.
- Including assets that exceed tier budget; engine refuses → split mod or move to TC tier.
- Bytecode shipped from a different Rune version than declared in `[build].rune`; engine refuses to load.

## Cross-Links

- → `docs/specs/mods/package-format.md` — canonical format spec.
- → `quickstart.md` — first-mod walkthrough.
- → `publishing.md` — per-marketplace upload.
- → `versioning.md` — semver and migration.
