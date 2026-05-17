<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Players — Safety

> What the engine does to keep you safe: signed mods, capability sandbox, consent prompts, crash isolation, easy uninstall, hash-blocklist. The trust pyramid.

## The Five Defenses

1. **Sandbox.** Mods run in a capability-secured VM. No raw filesystem. No raw network (v1.0). No subprocess. Ever. → `docs/specs/scripting/sandbox.md`.
2. **Consent.** Behavior mods can't read or change game state without your approval. → `permissions-ui.md`.
3. **Integrity.** Every mod is hashed; signed mods have a verifiable identity. Tampered mods refuse to load.
4. **Isolation.** A mod crashing or misbehaving never crashes the engine. Other mods unaffected.
5. **Reversibility.** Uninstall any mod, anytime. Side-effects cleaned up. Backups taken automatically before risky changes.

## Sandbox Guarantees

Even if a mod is **actively malicious**, it cannot:

| | Why |
|---|---|
| Read your private files | Sandbox blocks raw filesystem |
| Send your data anywhere | No `Net` cap in v1.0 |
| Install other software | No `Process` cap; no subprocess |
| Crash your computer | VM is fault-isolated |
| Make purchases | No payment surface in cap catalog |
| Steal your account | No access to game's auth tokens |
| Mine cryptocurrency | CPU capped per mod; engine kills runaway VMs |
| Spawn a worm | No persistent threat after uninstall |

The strongest mods (Total Conversions) can replace the game, but still cannot leave the sandbox.

## Signed Mods

| Indicator | Meaning |
|---|---|
| Signed | Author proved possession of the private key matching the published public key |
| Verified DID | The DID identifies an author you may have trusted before |
| Marketplace-verified | The marketplace (Steam, Mod.io, etc.) verifies the author identity |
| Unsigned | No cryptographic identity claim |

`--ship` builds refuse unsigned mods by default. `--dev` and editor allow with a banner.

## Hash Blocklist

Known illegal content (CSAM, malware, doxxing) is hash-blocked. Engine refuses to install. Blocklist is signed, distributed via configured feeds. Engine never auto-deletes installed mods; warns on new launches.

→ `docs/specs/mods/nsfw-and-moderation.md`.

## Crash Isolation

If a mod crashes:
- The mod's VM is suspended with a structured `SCRIPT_*` error.
- Other mods continue.
- Engine continues.
- You get a banner: "Healing Pack stopped working. [Restart it] [Disable] [Report]".

A mod cannot take down the game.

## Cap Audit Per Session

The Permissions panel shows what each mod is actually doing in real time. If a mod requests `WorldRead<Inventory>` and never reads it, you'll see it in the audit. If a mod is hammering an event 10× per frame, you'll see the warning.

## Uninstall Always Works

Side-effect cleanup walks the mutation log in reverse:
- Mod-spawned entities despawned.
- Mod-introduced components removed.
- Mod-introduced asset UUIDs unloaded.
- Mod's `Persist` blob deleted.
- Save can be re-loaded without the mod.

No "stuck on disk" states. No "mod can't be removed" surprises.

→ `docs/specs/mods/lifecycle.md`.

## Save Backups

Engine auto-backs up saves before:
- Mod uninstall under `strip` policy (`<save>.pre-strip.bak`).
- MAJOR-version mod update with migration (`<save>.pre-migrate.bak`).
- Profile switch with destructive changes (`<save>.pre-profile-switch.bak`).

Backups kept until you reclaim disk via `nexus save gc`.

## Reporting Bad Mods

`Mods → <mod> → Report`:

- Reason picker: malware / takedown / cheat / privacy violation / other.
- Optional comment.
- Audit log attached automatically (cap-use counts, errors).
- Sent to the marketplace it was installed from; engine has no central report system.

Marketplaces moderate per their policy.

## Server-Side Trust

In multiplayer, the server can:
- Whitelist mods.
- Ban known cheat mods.
- Reject divergent client state.

You can read the server's mod policy before joining. → `docs/specs/mods/multiplayer-sync.md`.

## What The Engine WILL NOT Do

- Phone home about which mods you install.
- Block mods from your country / region (legal jurisdiction issues handled per-marketplace and via hash-blocklist).
- Auto-update mods without your consent (configurable per game).
- Run a "mod is safe" rating system that's gameable (we ship objective signals: signed, audited cap use, marketplace flags).
- DRM your mods.

## Settings That Matter

`Settings → Mods → Safety`:

| Setting | Default | Effect |
|---|---|---|
| Refuse unsigned mods | on (ship builds) | Mods without a signature refused |
| Hash-blocklist feeds | engine defaults | Pull from configured sources |
| Per-mod telemetry consent | per-mod | See `docs/specs/mods/telemetry.md` |
| Auto-update mods | off | When on, engine auto-installs available updates |
| Save backups before destructive ops | on | Disable at your peril |
| Allow Total Conversions | on | Off blocks TC installs entirely |
| Allow accessibility auto-grant | on | Off forces consent for every accessibility mod |

## When Things Go Wrong

1. Disable the mod (no data loss).
2. Read the structured error (`Mods → <mod> → Last Error`).
3. Report to author via their listed `homepage` / `repository`.
4. If marketplace flag warranted: report via marketplace.
5. If engine bug: file at the engine's repo with the cap-use audit + replay.

## Pitfalls

- Allowing unsigned mods in ship build: convenient for direct-install testing, lowers trust floor.
- Disabling save backups: never do this; the per-save cost is trivial.
- Trusting a flashy mod from an unknown source: check signature + audit log first.

## Cross-Links

- → `docs/specs/mods/overview.md`
- → `docs/specs/scripting/sandbox.md`
- → `permissions-ui.md`
- → `docs/specs/mods/lifecycle.md`
- → `docs/specs/mods/nsfw-and-moderation.md`
- → `docs/specs/mods/multiplayer-sync.md`
