<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Hotfix Pipeline

What can ship without a binary rebuild. What cannot. Risk per category.

## Rule

- Default to live-content for anything that can. Binary rebuild = last resort.
- Every hotfix has a kill switch: feature flag or content channel.
- Hotfix CI is the same as regular CI — same scenario gate, same canary gate.

## Risk matrix

| Category | Hotfixable? | Mechanism | Risk | Rollback |
|----------|------------|-----------|------|----------|
| Lua / Rune scripts        | yes | live-content | low (sandboxed) | swap manifest |
| WGSL shaders              | yes | live-content | medium (driver crash possible) | swap manifest + version pin |
| Textures / meshes / audio | yes | live-content | low | swap manifest |
| Localization strings      | yes | live-content | low | swap manifest |
| Balance tables (TOML/JSON)| yes | remote config | low | revert version |
| Drop tables / loot        | yes | remote config | medium (economy) | revert version |
| Feature toggles           | yes | feature flag | low | flip flag |
| UI layouts                | yes | live-content | low | swap manifest |
| Native plugins (.so/.dll) | no  | OTA only | high (signed) | OTA rollback |
| Engine code               | no  | OTA only | high | OTA rollback |
| Server logic              | yes | server deploy | low | redeploy prior |
| Schema migrations         | partial | server, forward-only | high | forward-fix |

## Decision tree

```
Is it native compiled code?       ─yes→ OTA  (→ ota-updates.md)
                  no
                   ↓
Is it player-facing economy?      ─yes→ Remote config + A/B   (→ remote-config.md, ab-testing.md)
                  no
                   ↓
Is it a toggle / variant?         ─yes→ Feature flag          (→ feature-flags.md)
                  no
                   ↓
Is it an asset, script, or shader? ─yes→ Live-content         (→ live-content.md)
                  no
                   ↓
Server change?                    ─yes→ Server deploy         (→ canary-and-rollback.md)
```

## Hotfix CI

Same workflow file. Two extra gates:

| Gate | When | Tool |
|------|------|------|
| `hotfix-changeset` | only hotfixable files changed | `nexus hotfix lint` |
| `hotfix-canary`    | always before promote | `nexus publish --canary 1%` |

```bash
nexus hotfix lint diff   # fails if PR mixes binary + content changes
```

## Hotfix CLI

```bash
nexus hotfix new --kind=script --reason='fix off-by-one in inventory'
nexus hotfix package                      # builds live-content bundle
nexus hotfix publish --channel=canary     # 1%
nexus hotfix promote --channel=stable     # after canary clean
nexus hotfix rollback --to=<release>      # < 60s for content
```

## Time-to-rollback budgets

| Mechanism | Rollback time |
|-----------|---------------|
| Feature flag | seconds |
| Remote config | < 1 min (CDN cache TTL) |
| Live-content | < 5 min (signed manifest flip) |
| Server deploy | < 5 min (k8s rollout undo) |
| OTA | hours (store review possible) |

Plan around the slowest link. Cap the blast.

## Safety constraints

| Constraint | Default |
|-----------|---------|
| Hotfix must include scenario test | yes |
| Hotfix bypass requires `--break-glass` | yes, audited |
| Hotfix forbidden in last 24h before tournament | per game |
| Hotfix changes more than 3 systems | reject (split it) |
| Hotfix touches save-data format | reject (needs migration plan) |

## Smoke test

```bash
nexus hotfix lint diff
nexus hotfix package --dry-run
nexus hotfix verify --manifest=./out/manifest.json
```

## Cross-links

- `→ docs/guides/liveops/live-content.md`
- `→ docs/guides/liveops/ota-updates.md`
- `→ docs/guides/liveops/feature-flags.md`
- `→ docs/guides/liveops/remote-config.md`
- `→ docs/guides/liveops/canary-and-rollback.md`
- `→ docs/guides/release/` (Agent 21)
- `→ docs/guides/testing/scenarios.md`

## References

- Google SRE on canary releases · `https://sre.google/workbook/canarying-releases/`
- Facebook gatekeeper concept · `https://atscaleconference.com/videos/feature-flags-config-management/`

## Open

- `[DECISION NEEDED]` Default break-glass policy: who can sign off when no human is present.
