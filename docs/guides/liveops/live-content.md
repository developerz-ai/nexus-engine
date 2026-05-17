<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Live Content Service

CDN + signed manifest + per-channel pointer. Atomic flip. < 5 min rollback.

## Architecture

```
   build → bundle → sign → upload → CDN
                                     │
                                     ▼
       ┌───────────────────────────────────────────┐
       │ manifest store (S3/MinIO + edge cache)    │
       │ /channels/<channel>/manifest.json   ← pointer (atomic swap)
       │ /releases/<release>/manifest.json   ← immutable
       │ /releases/<release>/bundles/...      ← content-addressed (sha256)
       └───────────────────────────────────────────┘
                       │
          client polls │ /channels/<channel>/manifest.json (ETag)
                       ▼
                  apply diff → load
```

## Manifest

```json
{
  "schema": "nexus.manifest/1",
  "release_id": "01HXYZ",
  "engine_version_range": ">=0.7,<0.8",
  "game_version": "1.0.4+build.214",
  "channel": "stable",
  "issued_at": "2026-05-17T03:14:15Z",
  "expires_at": "2026-05-24T03:14:15Z",
  "bundles": [
    { "id": "scripts",  "sha256": "abc...", "url": "/releases/01HXYZ/bundles/scripts.tar.zst",  "bytes": 412888 },
    { "id": "shaders",  "sha256": "def...", "url": "/releases/01HXYZ/bundles/shaders.tar.zst",  "bytes": 88122 },
    { "id": "assets-l1","sha256": "ghi...", "url": "/releases/01HXYZ/bundles/assets-l1.tar.zst","bytes": 19288811 }
  ],
  "signature": "ed25519:..."
}
```

## Signing

- Ed25519 key per game. Public key embedded in binary at build.
- Client rejects unsigned or mismatched manifests.
- Key rotation: dual-sign for 30 days, then drop old.

```bash
nexus content sign manifest.json --key=$PRIV_KEY > manifest.signed.json
nexus content verify manifest.signed.json --pubkey=$PUB_KEY
```

## Bundles

| Bundle type | Hot-swap? | Notes |
|-------------|-----------|-------|
| `scripts`   | yes (Lua/Rune) | hot-reload via VM `→ docs/specs/scripting/hotreload.md` |
| `shaders`   | yes (WGSL) | hot-reload via `→ docs/specs/renderer/shaders.md` |
| `assets-l<n>` | yes | LOD tier; level streaming |
| `loc`       | yes | strings table reloaded on idle |
| `ui`        | yes | layout files reloaded |
| `balance`   | yes | served via remote-config too |

Bundles are content-addressed (sha256). Cache-forever. CDN-friendly.

## Atomic flip

```bash
# stage release
aws s3 cp manifest.signed.json s3://content/releases/01HXYZ/manifest.json --acl public-read

# atomic channel swap (single object, single PUT)
aws s3 cp s3://content/releases/01HXYZ/manifest.json \
          s3://content/channels/stable/manifest.json --cache-control "max-age=60"

# warm edges
nexus content purge --channel=stable
```

S3 PUT is atomic. Client either sees old manifest or new — never partial.

## Channels

| Channel | Audience | Manifest TTL |
|---------|----------|--------------|
| dev     | devs only | 0 (no cache) |
| canary  | 1% rollout | 60s |
| beta    | opt-in playerbase | 5 min |
| stable  | everyone | 5 min |

## Client poll

```toml
[live_content]
endpoint        = "https://content.example.com"
channel         = "stable"           # override via launch flag
poll_interval_s = 300                 # 5 min
apply_on        = "idle"              # idle | next_scene | force
max_apply_ms    = 100                 # cap per-frame application
verify_signature = true
```

Engine fetches manifest on launch + every poll interval. Applies on next idle frame (or per `apply_on`).

## Diffing

Client compares current manifest to new:

```
for bundle in new:
   if bundle.sha256 == cached.sha256: skip
   else: download(bundle) → swap atomic
```

Download is range-resumable. Failed downloads keep current bundle.

## Smoke test

```bash
nexus content pack --kind=scripts --src=game/scripts/ --out=scripts.tar.zst
nexus content publish --bundle=scripts.tar.zst --channel=dev
nexus content fetch --channel=dev --verify
```

## Verify

```bash
nexus content status --channel=stable
# → release_id, manifest_age, bundle_health, signature_ok
```

## Rollback

```bash
nexus content rollback --channel=stable --to=01HPREV     # < 60s
# under the hood: copies prior release manifest to channel pointer
```

## Self-host

```yaml
# infra/live-content/docker-compose.yml
services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000","9001:9001"]
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: ${PASS}
    volumes: [minio:/data]
  edge:
    image: caddy
    volumes: [./Caddyfile:/etc/caddy/Caddyfile]
    ports: ["443:443","80:80"]
volumes: { minio: {} }
```

Cost: ~$10/mo VPS + $0.01/GB egress. Cloudflare R2 also free egress.

## Cross-links

- `→ docs/guides/liveops/ota-updates.md` — binary updates
- `→ docs/guides/liveops/feature-flags.md`
- `→ docs/guides/liveops/canary-and-rollback.md`
- `→ docs/specs/scripting/hotreload.md`
- `→ docs/specs/renderer/shaders.md`
- `→ docs/specs/assets/streaming.md`
- `→ docs/specs/assets/registry.md`

## References

- HLS manifest pattern · `https://datatracker.ietf.org/doc/html/rfc8216`
- Ed25519 signatures · `https://datatracker.ietf.org/doc/html/rfc8032`
- TUF (the update framework) · `https://theupdateframework.io/`
- Cloudflare R2 · `https://www.cloudflare.com/products/r2/`

## Open

- `[DECISION NEEDED]` Adopt TUF for stronger key compromise resilience or stay with simple Ed25519.
- `[BENCHMARK NEEDED]` Cold-start manifest fetch latency budget on cellular.
