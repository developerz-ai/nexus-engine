<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Mods Distribution — Overview

> Decision matrix for picking mod marketplaces. Engine ships adapters for every major hub plus self-hosted. `nexus mod publish --to <hub>` works the same everywhere.

## Top-Level Choices

| Goal | Recommended channel |
|---|---|
| Reach most Steam players | Steam Workshop |
| Cross-platform (Steam + Epic + consoles + mobile) | Mod.io |
| Active modding community, non-Steam | Thunderstore |
| Large established fanbase (Bethesda-style RPGs) | Nexus Mods |
| Minecraft-style ecosystem (modpacks, launcher integration) | CurseForge (reference) |
| Freedom-maxxer, zero platform | Self-hosted |
| Federated, no vendor lock | nexus-hub `[DECISION NEEDED]` |
| Free-text experimental | itch.io as mod host |

Full decision matrix → `marketplaces/decision-matrix.md`.

## The Engine's Stance

- One mod format (`.nxmod`) works on every channel. Authors do not refactor per store.
- Adapters live in `crates/nexus-publish/` (spec-only; impl elsewhere); each adapter implements `Marketplace::upload`, `Marketplace::list_versions`, `Marketplace::fetch`.
- Player-side: in-game browser federates across configured marketplaces; one search bar, one install button.
- No marketplace is required. A solo dev can ship a Nexus game and never touch any store; players install via direct `.nxmod` file or self-hosted index.

## Adapter Interface (sketch)

```rust
trait Marketplace {
    fn id(&self) -> &str;                          // "steam" | "mod_io" | ...
    fn auth(&self, creds: AuthSpec) -> Result<Token>;
    fn upload(&self, pkg: &Path, meta: MetaPerStore) -> Result<UploadReceipt>;
    fn update(&self, id: ModRef, pkg: &Path) -> Result<UploadReceipt>;
    fn fetch(&self, id: ModRef) -> Result<DownloadStream>;
    fn list_versions(&self, id: ModRef) -> Result<Vec<VersionInfo>>;
    fn search(&self, q: SearchQuery) -> Result<Vec<ModSummary>>;
    fn report(&self, id: ModRef, kind: ReportKind, body: String) -> Result<()>;
}
```

Per-store metadata lives in `mod.toml::[marketplace.<id>]` (→ `docs/specs/mods/manifest.md`).

## What Each Channel Owns

- Hosting bytes.
- Discovery (browse, search, recommend).
- Moderation per their TOS.
- Age verification (legal). → `docs/specs/mods/nsfw-and-moderation.md`.
- Reviews, ratings, comments.
- Monetization rails (where applicable).
- Subscription / install management for Steam Workshop-style channels.

Engine owns:
- Integrity (hash, signature).
- Capabilities and sandbox.
- Save / multiplayer compatibility.
- Resolver.
- Lifecycle.
- Cross-marketplace abstraction.

## Cost To Publish (snapshot, `[VERIFY]`)

| Channel | Author fee | Revenue cut on paid mods | Setup friction |
|---|---|---|---|
| Steam Workshop | none | n/a (paid mods mostly discontinued) | Steam Direct $100/game |
| Mod.io | none | varies per game-author contract | OAuth registration, free |
| Thunderstore | none | none (donation-based) | account, free |
| Nexus Mods | none | none for free; Donation Points program for free mods; Collections fee structure | account, free |
| CurseForge | none | varies for premium / Overwolf | account, free |
| itch.io | none | optional 10% on paid | account, free |
| Self-hosted | author pays hosting | none | varies (S3, GitHub Pages, VPS) |
| nexus-hub `[DECISION NEEDED]` | none | none | account, free |

All numbers above are `[VERIFY — marketplace policy changes]`. Cite the matrix doc, not this overview, for the canonical table.

## Multi-Publish

```
nexus mod publish --to steam --to mod-io --to thunderstore --to self-hosted
```

Engine:
1. Verifies `.nxmod`.
2. Looks up per-marketplace metadata.
3. Uploads in parallel.
4. Aggregates receipts into a JSON report.
5. Updates lockfile sources (→ `docs/specs/mods/dependencies.md`).

→ `authoring/publishing.md` for the recipe.

## Marketplace Selection Per Game

A game ships with `Nexus.toml::[mods.marketplaces]` configuring the in-game browser's federated sources:

```toml
[mods.marketplaces]
order = ["steam", "mod_io", "self-hosted"]
[mods.marketplaces.steam]
app_id = 1234567
[mods.marketplaces.mod_io]
game_id = 4321
[mods.marketplaces.self-hosted]
url = "https://mods.mygame.com/"
```

Players see results from all configured sources, deduplicated by `mod_id` (lowest priority wins on tie).

## Doc Map

```
guides/mods/marketplaces/
├── steam-workshop.md
├── mod-io.md
├── thunderstore.md
├── nexus-mods.md
├── curseforge.md
├── itch-io-mods.md
├── self-hosted.md
├── nexus-hub.md             ← [DECISION NEEDED]
└── decision-matrix.md       ← table + JSON variant
```

## Open Questions

- `[DECISION NEEDED]` Whether engine ships a default `nexus-hub` federated index.
- `[DECISION NEEDED]` Console marketplace strategy (Mod.io is the practical option; Sony/Microsoft policies `[VERIFY]`).
- `[DECISION NEEDED]` Default `Nexus.toml::[mods.marketplaces]` for `nexus new`-scaffolded games.
- `[AGENT: 21]` Confirm `nexus mod publish` recipes align with store-publishing pipelines in `docs/guides/release/**`.
