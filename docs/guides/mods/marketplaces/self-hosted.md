<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Marketplaces — Self-Hosted

> The MIT-default. S3 / GitHub Pages / any HTTPS bucket + signed index file. Zero platform cut. Zero vendor lock. The recommended path for projects that want maximum freedom.

## When To Use
- You value zero vendor lock.
- You want zero revenue cut.
- You have a domain and can serve HTTPS.
- You want a path that survives every marketplace policy change.

## When NOT To Use
- You want discovery to come for free.
- You don't want to maintain hosting.

## Architecture

```
https://mods.mygame.com/
├── index.toml                       ← signed index, lists all mods
├── pubkey                           ← author's Ed25519 public key (multibase)
├── mods/
│   ├── com.example.healing-pack/
│   │   ├── 1.0.0.nxmod
│   │   ├── 1.0.1.nxmod
│   │   └── metadata.toml             ← per-mod, signed
│   └── com.example.ui-kit/
│       ├── 0.5.2.nxmod
│       └── metadata.toml
└── feed.rss                          ← optional, for human discovery
```

Anything that serves byte-for-byte HTTPS works: S3, R2, GitHub Pages, Fastly, Caddy on a VPS, IPFS gateway. The engine doesn't care.

## `index.toml` Format

```toml
version = 1
url = "https://mods.mygame.com/"
publisher = "did:key:z6Mk..."
updated = "2026-05-17T10:23:00Z"
signed_by = "z6Mk..."                  # signature over file bytes minus this line, multibase
signature = "z3..."

[[mod]]
id = "com.example.healing-pack"
versions = [
  { v = "1.0.0", path = "mods/com.example.healing-pack/1.0.0.nxmod", mod_hash = "b3:abcd...1234" },
  { v = "1.0.1", path = "mods/com.example.healing-pack/1.0.1.nxmod", mod_hash = "b3:beef...5678" },
]
latest = "1.0.1"
nsfw = false
accessibility = false

[[mod]]
id = "com.example.ui-kit"
versions = [
  { v = "0.5.2", path = "mods/com.example.ui-kit/0.5.2.nxmod", mod_hash = "b3:cafe...0000" },
]
latest = "0.5.2"
```

Engine fetches `index.toml`, verifies signature, then `.nxmod` files (each independently signed too).

## Engine Integration

`Nexus.toml::[mods.marketplaces]`:

```toml
[mods.marketplaces.self-hosted-mygame]
url = "https://mods.mygame.com/"
trust = "tofu"                          # tofu | pinned
pinned_key = "z6Mk..."                  # if trust = pinned
```

Player adds via UI:
```
Settings → Mods → Add Source
  URL: https://mods.mygame.com/
  Trust: [Pin key] [TOFU]
```

Trust-on-first-use (TOFU) prompts the player at first sync; key pinned after.

## Author Workflow

```
nexus mod publish --to self-hosted --url https://mods.mygame.com/ --key keys/signing.key
```

Engine:
1. Verifies `.nxmod` signed with declared key.
2. Uploads to configured backend (S3, R2, SFTP, rsync, git push for GH Pages).
3. Recomputes `index.toml` with new entry.
4. Re-signs `index.toml`.
5. Uploads index.

Backends configured via `~/.nexus/publish/self-hosted-<host>.toml`:

```toml
backend = "s3"
bucket = "mods.mygame.com"
region = "us-east-1"
# OR
backend = "git"
repo = "git@github.com:example/mods.git"
branch = "gh-pages"
```

## Player Install

```
nexus mod install self-hosted:mods.mygame.com:com.example.healing-pack@1.0.1
```

Or via in-game browser if source is added.

## Signing

Authors generate Ed25519 keypair:

```
nexus mod keygen --out keys/
```

Public key published as `pubkey` next to index. Engine adapters use `did:key:` URI for portable identity.

Key rotation supported via DID document with `verificationMethod` history; rotated key signed by previous. Engine accepts old signatures on already-installed mods, requires new key for new installs after rotation date.

## Multi-Backend

```
nexus mod publish --to self-hosted --to self-hosted-mirror
```

Engine uploads to multiple hosts, generates identical signed indices, helps with HA / community mirrors.

## Federation

A self-hosted index can declare upstream indices:

```toml
[upstream]
indices = [
  "https://mods.othergame.com/",        # cross-game library mods
  "https://nexus-hub.example/"          # if nexus-hub ships
]
```

Engine walks one level of upstream; doesn't recurse to avoid amplification. Detects index cycles.

## Cost

| Backend | Approximate cost |
|---|---|
| GitHub Pages | $0 (within limits) |
| Cloudflare R2 | $0 + egress (R2 has $0 egress) |
| S3 + CloudFront | per-GB egress, often pennies for small mods |
| VPS + Caddy | $5/mo |
| IPFS gateway | $0 if community pins; pay for pinning service otherwise |

Compare to marketplace cuts: 0% always wins on revenue, costs traded for hosting fees.

## Moderation

You moderate your own index. Engine ships no central moderation overlay for self-hosted. NSFW + takedown handled per `docs/specs/mods/nsfw-and-moderation.md`.

## CLI Reference

```
nexus mod publish --to self-hosted --url URL --key PATH
nexus mod source add URL                            # player adds source
nexus mod source list
nexus mod source pin URL <key>
nexus mod search self-hosted:URL --tag weapons
nexus mod fetch self-hosted:URL:ID@VER --out path/
nexus mod keygen --out keys/
nexus mod sign --key keys/signing.key path.nxmod
```

## CI Recipe

```yaml
on: { push: { tags: ['mod-v*'] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: nexus mod pack
      - run: nexus mod verify target/*.nxmod
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: us-east-1
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - env:
          NEXUS_SIGNING_KEY: ${{ secrets.NEXUS_SIGNING_KEY }}
        run: |
          echo "$NEXUS_SIGNING_KEY" > /tmp/signing.key
          nexus mod publish --to self-hosted --url https://mods.mygame.com/ --key /tmp/signing.key
```

## Pitfalls

- Signing key management: lose it and you can't push updates; rotate carefully.
- Cache invalidation on CDN: engine sets `Cache-Control: public, max-age=300, must-revalidate` on `index.toml`.
- No built-in discovery: rely on game-side `[mods.marketplaces]` defaults to add your URL.
- CORS: serving `index.toml` to a web-target game requires `Access-Control-Allow-Origin: *`.

## Error Contract

| Code | Meaning |
|---|---|
| `MOD_E_SELF_INDEX_FETCH` | Network / 404 |
| `MOD_E_SELF_INDEX_SIG` | Index signature invalid |
| `MOD_E_SELF_INDEX_KEY_UNTRUSTED` | TOFU not yet completed |
| `MOD_E_SELF_INDEX_KEY_ROTATED` | Key rotated; player must re-trust |
| `MOD_E_SELF_UPLOAD_BACKEND` | Backend upload failed; check creds |

## Integration Points

- `docs/specs/mods/package-format.md` — `.nxmod` signing.
- `docs/specs/mods/manifest.md` — `[marketplace]` block.
- `docs/guides/mods/marketplaces/nexus-hub.md` — federation upstream.
- `docs/guides/mods/marketplaces/decision-matrix.md`.

## Open Questions

- `[DECISION NEEDED]` IPFS / content-addressed mirror support out of the box.
- `[DECISION NEEDED]` Engine-bundled `nexus mod serve` for local dev / LAN testing.
- `[DECISION NEEDED]` Standardize a `.well-known/nexus-mods/index.toml` discovery path so any HTTPS root can be auto-detected.

## Prior Art

- Cargo registry protocol ✓ — signed manifests + content-addressed.
- Debian / RPM package signing ✓ — Ed25519 / GPG-signed indices.
- DAT / Hyperdrive / IPFS signed feeds ✓ — DID-based identity.
- Linux distros' mirror network ✓ — federation model.
- Crates.io alternative registries ✓ — multi-source pattern.
