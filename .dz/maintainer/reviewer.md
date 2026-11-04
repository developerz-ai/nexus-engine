# Reviewer instructions — developerz-ai/nexus-engine

> Read by the developerz.ai reviewer at EVERY review of this repository, at the reviewed
> commit, as this repo's own layer of the reviewer's prompt — established by dz-runner setup mode.
> It refines the platform rules (a finding is cited or withheld; the bot always discloses)
> and never overrides them. Edit freely; keep it under 12,000 characters — past that it is cut.

## Stack

Rust + Cargo + Bun. The gate is `bin/check`: an SPDX header sweep (`bash "$bin_dir/check-spdx"`), then the blocking chain `cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo check --workspace --all-targets && cargo nextest run --workspace --profile ci && cargo deny check && (cd scripts && bun test && bun x biome check .)`, then an advisory `cargo audit` that never fails the gate (a failing audit is reported on stderr and the gate still passes; when cargo-audit is absent, `bin/check` prints a notice naming `cargo audit` and continues). A change that does not pass the blocking part of it is not proven, whatever its description says.

KNOWN DEFECT (OPEN — unfixed at head, tracked): a failure inside that blocking chain never reaches `bin/check`'s exit status — `set -e` is ignored for a command in a non-final `&&` position (`bin/check:38`), so the advisory block's exit 0 (`bin/check:42-51`) becomes the script's status. Reproduced at head: with `cargo fmt --all -- --check` failing, `bin/check` exits 0 and still runs `cargo audit`. Live instance at this head (2026-11-04): `cargo deny check` fails, the chain stops there, the `bun test` step never runs — and `./bin/check` still exits 0. A green `bin/check` therefore does NOT prove the blocking part passed; read the gate's own output for the failing command until the finding is fixed. The fix is known and verified — capture the chain's status into `gate_status`, then `exit "$gate_status"` before the advisory block — but it edits the repository's own gate, which an agent round may not write (`write_locked`, re-confirmed on 2026-11-04: `code_edit` and `code_write` both refuse `bin/check`): it needs a pull request a person opens.

STATE AT THIS HEAD (2026-11-04): the regression test in `scripts/tests/bin-scripts.test.ts` now DEMANDS the fixed behaviour — non-zero exit, no `cargo audit` invocation, the failure reported on stderr — so the `scripts / test` job is RED here by design: that red IS the defect, not a new breakage. The gate patch that turns it green is on the pull request as a comment; it is ~10 lines in `bin/check` and needs a person to apply it (an agent round may not write the gate). Do not flag the red `scripts / test` job as a regression until `bin/check` carries the chain-status propagation.

## Review conventions

- TODO(setup): the conventions a reviewer must hold this repo to (from CLAUDE.md / CONTRIBUTING), each as a rule.

## Gates that matter

- TODO(setup): which checks decide a change here, and what "proven" means for a pull request.

## Never flag

- TODO(setup): what never to flag — generated or vendored files, style a formatter owns, conventions this repo chose on purpose.
