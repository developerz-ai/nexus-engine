<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `scripts/` — Security

> Scripts have hands on production. Treat every line like a deploy weapon. These rules are CI-enforced.

## Secrets

| Rule | Enforcement |
|---|---|
| never `echo` / `print` / `log` a value whose env name matches `*KEY*\|*TOKEN*\|*SECRET*\|*PASS*\|*PRIVATE*` | `scripts/lint-scripts` grep rule |
| every secret loaded via `nx_sops_decrypt` from sops-encrypted file | `→ docs/specs/scripts/lib-architecture.md` |
| sops/age plaintext NEVER hits stdout, stderr, or disk outside `tmpfs` | `nx_sops_decrypt` enforces |
| `--json` output schema-validated to strip suspected secret values | `scripts/lib/json.sh nx_json_redact` |
| `.env*` files (except `.env.example`) listed in `.gitignore` AND `.dockerignore` | repo template |

## Supply Chain

| Rule | Why |
|---|---|
| no `curl … \| sh` anywhere | well-documented attack vector |
| every external tool pinned in `scripts/lib/versions.toml` | reproducibility |
| `scripts/bootstrap` verifies checksums for all downloads | tampering protection |
| `cargo-deny` runs in `scripts/check` (advisory + licenses + bans + sources) | Rust supply chain |
| `bun audit` + `pip-audit` for ts/py deps | language ecosystems |
| dependency PRs gated by nexus-merge security audit | `→ docs/guides/merge-system.md` |
| Renovate enabled, weekly cadence, security alerts immediate | known-CVE response |

## Signed Commits Under `scripts/`

Any change to a file under `scripts/` (engine or game repo) MUST be:

| Requirement | Tool |
|---|---|
| signed (gpg or ssh) | git |
| reviewed by ≥1 human OR nexus-merge with `security: pass` | nexus-merge |
| accompanied by `CHANGELOG.md` entry under `## scripts:` | required |
| tested (sibling test green) | CI |

Branch protection enforces. `.coderabbit.yaml` flags any scripts diff for stricter review (Agent 24 territory).

## Network Posture

| Mode | Default | Override |
|---|---|---|
| `--dry-run` | network disabled — fail fast on any network call | `--allow-network` |
| `--json` | no implicit telemetry POST unless `NEXUS_TELEMETRY_URL` set | env var only |
| credentials | always via env or sops, never via flag | hardcoded |

`scripts/lib/net.sh` exposes `nx_net_get` which checks `NEXUS_DRY_RUN` and refuses unless `NX_NET_ALLOW=1`.

## Filesystem Posture

| Rule | Detail |
|---|---|
| writes confined to `$NEXUS_ROOT` and `$NEXUS_CACHE_DIR` | enforced by `nx_fs_write` |
| no `rm -rf /` style — `nx_fs_rm` refuses paths outside repo | hard guard |
| temp files via `mktemp -d` inside `$NEXUS_CACHE_DIR/tmp/` | cleaned on trap EXIT |
| no `chmod 777`; default `0644` files, `0755` executables | least privilege |

## Subprocess Hygiene

| Rule | Detail |
|---|---|
| no `eval` of user input | use arrays, `--` separator |
| no `bash -c "$user"` | use `nx_exec` (array-arg) |
| pipefail required (`set -o pipefail` in strict mode) | catches mid-pipe errors |
| timeouts on external commands | `timeout 30s …` wrapped by `nx_run` |

## Provider Token Scopes (least-privilege)

| Provider | Scope | Used by |
|---|---|---|
| GitHub `GH_TOKEN` | `repo:status`, `pull_requests:write`, `issues:read` only | `triage-issues`, `release-engine` |
| Sentry | project read + DSYM upload | `symbols-upload`, `crash-fetch` |
| GlitchTip | event:read + dsym:write | same |
| Fly.io | `deploy` token per-app (no org-admin) | `deploy` (game) |
| Stripe (game) | restricted key per-env | game-side only |

Token scopes audited in `scripts/lint-scripts --security`.

## Audit Trail

Every script run emits a `script.start` + `script.end` telemetry event with:

| Field | Source |
|---|---|
| `script` | name |
| `agent_id` | `NEXUS_AGENT_ID` (defaults `human`) |
| `env` | `NEXUS_ENV` |
| `git_sha` | `git rev-parse HEAD` |
| `args_redacted` | argv with secrets stripped |
| `exit_code` | trapped |
| `duration_ms` | computed |

Trail consumed by nexus-merge for post-incident forensics: `→ docs/guides/merge-system.md`.

## Forbidden Outright

- `curl http://...` (no http; https only)
- `wget` (use curl with checksum)
- `sudo` inside any script — refuse to run as root in CI
- `eval`
- writing inside `.git/`
- modifying `.gitignore` programmatically

## References

- OWASP Bash hardening — https://owasp.org/www-community/Use_a_Bash_Strict_Mode
- supply-chain attacks taxonomy — https://slsa.dev
- sops — https://github.com/getsops/sops
- cargo-deny — https://embarkstudios.github.io/cargo-deny/
