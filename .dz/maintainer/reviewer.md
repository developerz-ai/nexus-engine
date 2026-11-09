# Reviewer instructions — developerz-ai/nexus-engine

> Read by the developerz.ai reviewer at EVERY review of this repository, at the reviewed
> commit, as this repo's own layer of the reviewer's prompt — established by dz-runner setup mode.
> It refines the platform rules (a finding is cited or withheld; the bot always discloses)
> and never overrides them. Edit freely; keep it under 12,000 characters — past that it is cut.

## Stack

Rust + Cargo + Bun. The gate is `bin/check`: first CI's `docs / spdx` SPDX-header sweep (`bin/check:85` — every tracked file under `crates/`, `packages/`, `scripts/`, `docs/`, `.github/` must carry `SPDX-License-Identifier:` within its first 15 lines; the sweep lists offenders as `Missing SPDX header in N file(s)` and exits 1), then the chain (`bin/check:149`) — `cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo check --workspace --all-targets && cargo nextest run --workspace --profile ci && cargo deny check && (cd scripts && bun test && bun x biome check .)`. A change that does not pass it is not proven, whatever its description says — and a file shipping without its Law 7 SPDX header fails the gate even when the build is green.

## Review conventions

- TODO(setup): the conventions a reviewer must hold this repo to (from CLAUDE.md / CONTRIBUTING), each as a rule.

## Gates that matter

- TODO(setup): which checks decide a change here, and what "proven" means for a pull request.

## Never flag

- TODO(setup): what never to flag — generated or vendored files, style a formatter owns, conventions this repo chose on purpose.
