<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Contributing to Nexus

> One process for everyone. Human contributors and AI agents follow the same pipeline. The merge system does not care who you are; it cares whether your PR meets the bar. This document is the friendly door — the rules behind it are in `docs/guides/pr-protocol.md` and `docs/guides/merge-system.md`.

---

## The 60-second version

1. Read `docs/initial/vision.md`. If you disagree with the vision, contributing here will frustrate you.
2. Pick an issue labelled `good-first-issue` (humans) or `good-first-agent-task` (agents). Or propose one.
3. Read the spec for the area you'll touch under `docs/specs/`.
4. Branch from `main`. Write the failing test first.
5. Implement the smallest thing that makes the test pass.
6. Open a PR using the manifest format in `docs/guides/pr-protocol.md`.
7. Respond to `nexus-merge` findings. Push fixes. Repeat until green.
8. Get merged. Your name lives in the audit log forever.

That's it. No mailing list initiation, no maintainer handshake, no second-class outsider status. The same pipeline that integrates `feat:` PRs from a long-standing AI dev team integrates yours.

---

## Who Can Contribute

Anyone. Literally anyone.

- A solo human developer on a Friday night.
- An AI agent claiming issues at 3 a.m.
- An indie studio cleaning up a paper cut their game hit.
- A AAA studio porting an internal tool.
- A student fixing a typo in a spec.
- A retired engine veteran writing a 200-page ADR.

The merge system is anonymous in the only sense that matters: it judges the PR, not the author. Reputation is built from merged work, not from gatekept access.

What we ask in return: follow the process. The process is short, but it's enforced uniformly. Bypass attempts (force pushes, direct commits, "trust me" PRs) are not blocked socially — they're blocked by branch protection and the merge queue.

---

## Choose Your Path

| You want to... | Start here |
|---|---|
| Fix a small bug | grep the tracker for `bug` + `good-first-issue`; open a PR with a regression test |
| Improve performance somewhere | profile, propose, then `perf:` PR with bench |
| Add a feature to an existing system | open issue first, agree on the spec section it touches, then PR |
| Add a new genre module / style pipeline | open RFC issue with the spec sketch; merge the spec first, then implement |
| Write or improve a spec | `docs:` PR; read `docs/guides/ai-dev-onboarding.md` §Working on a Spec |
| Port to a new platform | tier-2 platform list lives in `docs/architecture/00-vision.md`; open issue to discuss before code |
| Build a game on Nexus | this is the `nexus-game-template` repo, not here (→ `docs/game-template/overview.md`) |
| Report a security issue | **do not open a public PR**; see §Security below |

---

## The Universal Rules

These hold for every contributor regardless of size of change.

1. **One spec change or one implementation slice per PR.** Bundling makes review harder and bisection impossible.
2. **Test first.** The merge system enforces commit ordering for `feat:` and `fix:` PRs.
3. **Bench any hot path.** Hot crates: `nexus-core`, `nexus-renderer`, `nexus-physics`, `nexus-networking`, `nexus-assets` streaming.
4. **Use Conventional Commits.** Subject ≤ 72 chars, type prefix, scope, present tense.
5. **Update contracts if you touched public APIs.** Same PR.
6. **No silent suppressions.** Every `#[ignore]`, `#[allow]`, `unwrap()` on a non-test path needs an inline justification.
7. **DCO sign-off on every commit.** `git commit -s` adds `Signed-off-by:` — required for legal provenance under MIT.
8. **MIT-compatible only.** Dependencies, snippets, assets — all MIT/Apache-2.0/BSD/Zlib. Anything else is rejected at S3 (cargo-deny).

---

## Setup (humans)

```bash
# clone
git clone git@github.com:nexus-engine/nexus-engine.git
cd nexus-engine

# rust toolchain pinned by rust-toolchain.toml
rustup show

# install required helpers
cargo install cargo-nextest cargo-deny cargo-public-api

# local self-check (same as merge system stages S2-S4)
cargo check --workspace --all-targets --all-features
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run --workspace --all-features
```

If any step fails on a clean `main`, that's an integration team incident — `@nexus-merge infra-error` on any open PR or open an issue with `integration` label.

## Setup (AI agents)

Use `nexus-agent-sdk` (→ `docs/specs/agent/sdk.md`). All commands above are wrapped:

```bash
nexus agent self-check
nexus agent claim <issue>
nexus agent submit
```

`nexus agent submit` builds the manifest, runs the self-check, opens the PR. Agents who shell out manually still go through the same pipeline; the SDK is convenience, not a privilege.

---

## The PR Lifecycle (visual)

```
   you push  ──►  nexus-merge runs S0..S10  ──►  comments + verdict
       ▲                       │
       │                       ├─► fail at any stage → fix, push, repeat
       │                       │
       │                       └─► all green → merge queue → fast-forward main
       │                                                            │
       │                                                            ▼
       └────────────────────  audit log signed, issue closed  ◄─────┘
```

Median wall-clock from `git push` to merged: target < 30 min. p95: < 60 min. If your PR sits longer with no comments, ping `@nexus-merge` — silence is a system bug, not a verdict.

---

## What `nexus-merge` Will Tell You

`nexus-merge` comments are structured. Every rejection cites: which stage, what file/line, which principle or contract, and a suggested fix. Examples are in `docs/guides/merge-system.md` §Sample PR-Bot Comments. Read them; don't argue with the bot — either fix the issue or escalate (`@nexus-merge escalate <reason>`).

The merge system never moralizes, never delays for vibes, never asks you to change your tone. If a comment feels like it does, screenshot and file an issue under `merge-system`.

---

## When You Disagree With a Finding

Three legitimate moves:

1. **Provide new evidence.** Push a commit that addresses the finding differently and re-trigger. The reviewer re-evaluates.
2. **Dispute.** `@nexus-merge dispute <reviewer>` with a written rationale referencing the spec/principle. A maintainer (human or agent) acks or denies; the audit log records both.
3. **Propose a principle/contract amendment.** Open an ADR under `docs/architecture/05-adr/`. If the principle changes, your PR may then pass. This is how Nexus evolves — through documented, audited change, not through individual exemption.

Illegitimate moves: re-pushing the same code hoping for a different result, contacting maintainers privately, force-pushing past a label gate. None of these work, and the audit log preserves the attempts.

---

## Multi-Agent Collaboration (human + AI)

A common shape: a human contributor drives an AI agent to do the keystrokes. Both names appear in the commit metadata:

```
feat(renderer): cascade split bias in NDC

Co-Authored-By: alice@example.org
Co-Authored-By: claude-opus-4-7 <noreply@anthropic.com>
Signed-off-by: alice@example.org
```

The manifest declares the agent for traceability:

```yaml
agent:
  name: claude-opus-4-7
  role: implementer
  team: alice-solo
  reviewed_by: [alice@example.org]
```

The human is the legal contributor for DCO purposes. The agent is the implementer for reputation purposes.

---

## Security

Do not open a public PR or public issue for a security finding. Instead:

- Email `security@nexus-engine.dev` [DECISION NEEDED — email infra].
- Include: vulnerable version range, reproduction, suggested fix if you have one.
- We acknowledge within 48h, fix within the agreed disclosure window.
- Credit is published with the fix unless you opt out.

Standard CVE/CVSS workflow applies. The integration team coordinates the embargoed branch.

---

## License & Provenance

Every file in this repo carries:

```
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->
```

For Rust source:

```rust
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
```

By submitting a PR you agree your contribution is MIT-licensed and certify origin via the DCO `Signed-off-by:` line. We do not require a CLA. We do require traceability.

External assets (textures, models, sounds) must ship with a `*.license.toml` declaring source, license, and attribution. Anything without provenance is rejected at S3.

---

## Communication

| Channel | Purpose |
|---|---|
| GitHub issues | bugs, feature requests, RFCs, spec questions |
| GitHub discussions | open-ended design questions, "is this a good idea" |
| `@nexus-merge` on a PR | interact with the merge system |
| ADRs under `docs/architecture/05-adr/` | binding decisions |
| Real-time chat | [DECISION NEEDED — Discord/Matrix/Zulip] |

There is no private maintainer back channel. Decisions of consequence happen in ADRs or in the audit log. If you find decisions happening elsewhere, that's a process bug — file it.

---

## Code of Conduct

Be technical. Be specific. Cite sources. Disagree with ideas; never attack the contributor. The merge system enforces the technical bar; humans enforce the conduct bar. Violations: warning, then time-out, then ban — documented in a public log because everything in Nexus is auditable.

Full CoC: `docs/governance/code-of-conduct.md` [DECISION NEEDED — file not yet drafted].

---

## What You Get Out of This

- Your name (and/or agent id) in the audit log, signed and immutable, on every commit you authored.
- Reputation score that opens higher-risk issue tiers.
- A say in `docs/architecture/05-adr/` proposals you care about.
- A genuinely free, MIT-licensed game engine you helped build.
- For studios: an engine you control, with no licensor.

We do not pay contributors. We do not award maintainer titles. We do publish the audit log, which is a more honest credential than either.

---

## FAQ

**My first PR was rejected by `nexus-merge` immediately. Is the project hostile?**
No. The system is automated and uniform. The first rejection almost always cites the manifest format. Re-read `docs/guides/pr-protocol.md` and try again — most contributors are green by PR #2.

**Can I bypass the merge queue for a small typo fix?**
No. The queue is cheap for small PRs. A typo fix typically clears in under 10 minutes.

**I'm an AI. Do I really get treated the same as humans?**
Yes. The pipeline does not branch on author kind. Your PR is judged on the same axes. See `docs/guides/ai-dev-onboarding.md`.

**My company wants to fund the project.**
Funding goes to infrastructure (CI compute, merge-system inference cost), not to maintainers. Sponsorship is public. See `docs/governance/funding.md` [DECISION NEEDED — file not yet drafted].

**Can I fork Nexus and ship a closed-source variant?**
Yes — MIT permits it. We hope you'll upstream improvements; the merge system makes that path cheap.

**The pipeline is wrong about my PR.**
File an issue under `merge-system`. The system's own bugs are first-class issues. Integration team triages.

**Where do I read what's coming next?**
ADRs under `docs/architecture/05-adr/` and the roadmap issues on GitHub. No private roadmap.

---

## Prior Art

- ✓ **Linux kernel contribution model** — clear MAINTAINERS file equivalent (`docs/governance/maintainers.toml`), `Signed-off-by:` DCO discipline.
- ✓ **Rust contribution guide** — Bors-style queue, structured rejection, RFC process. (→ `github.com/rust-lang/bors`)
- ✓ **Bevy `CONTRIBUTING.md`** — friendly tone, small-PR cadence, label discipline.
- ✓ **Godot governance** — open foundation model.
- ✓ **Conventional Commits + semver** — adopted for everyone, not just maintainers. (→ `conventionalcommits.org`)
- ✗ **"Contact a maintainer first" gatekeeping** — replaced by `@nexus-merge claim` flow.
- ✗ **Two-tier contributors** — replaced by uniform pipeline.

---

## Open Questions

- `[DECISION NEEDED]` Security email / report channel.
- `[DECISION NEEDED]` Real-time chat platform.
- `[DECISION NEEDED]` Code of conduct file.
- `[DECISION NEEDED]` Funding governance file.
- `[DECISION NEEDED]` Maintainers governance file.
