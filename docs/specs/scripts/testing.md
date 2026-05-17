<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `scripts/` — Testing

> Every script has a sibling test. Same directory. Same name. Different extension. CI fails if a script ships without one.

## Stack per Language

| Language | Test runner | Sibling file | Why |
|---|---|---|---|
| bash | bats-core ≥ 1.11 | `<name>.bats` | de-facto bash test standard |
| python | pytest ≥ 8.3 | `<name>.test.py` | mature, fast, snapshot via `syrupy` |
| typescript | vitest ≥ 2.0 (bun runtime) | `<name>.test.ts` | matches bun/commander stack |

Runner dispatch: `scripts/test --scripts` discovers all three by extension.

## Mandatory Assertions (every script)

Every sibling test MUST include these four cases:

| # | Case | Assertion |
|---|---|---|
| 1 | `--help` | exit 0, stdout non-empty, contains "Usage:" |
| 2 | `--help --json` | exit 0, stdout parses as JSON, matches index entry |
| 3 | `--json --dry-run` | exit 0, stdout parses as JSON, envelope keys present, `dry_run: true` |
| 4 | bogus flag (`--xxxnope`) | exit 2, stderr non-empty |

Snapshot test for `--help` output (locks the CLI surface) — file: `scripts/tests/__snapshots__/<name>-help.txt`.

## Bats Skeleton

```bash
# scripts/build.bats
#!/usr/bin/env bats
# SPDX-License-Identifier: MIT

load 'tests/helpers'

setup() {
  cd "$BATS_TEST_DIRNAME/.."
  export NEXUS_ENV=dev
  export NEXUS_AGENT_ID=test
}

@test "build: --help exits 0 with usage" {
  run scripts/build --help
  assert_success
  assert_output --partial "Usage:"
}

@test "build: --help --json matches index entry" {
  run scripts/build --help --json
  assert_success
  echo "$output" | jq -e '.name == "build"'
}

@test "build: --json --dry-run produces envelope" {
  run scripts/build --json --dry-run
  assert_success
  echo "$output" | jq -e '.ok == true and .dry_run == true and (.script == "build")'
}

@test "build: bogus flag exits 2" {
  run scripts/build --xxxnope
  assert_failure 2
}
```

## Pytest Skeleton

```python
# scripts/gen_asset.test.py
# SPDX-License-Identifier: MIT
import json, subprocess, pytest

SCRIPT = "scripts/gen-asset"

def run(*args):
    return subprocess.run([SCRIPT, *args], capture_output=True, text=True)

def test_help_exits_zero():
    r = run("--help")
    assert r.returncode == 0
    assert "Usage:" in r.stdout

def test_help_json_matches_index():
    r = run("--help", "--json")
    assert r.returncode == 0
    payload = json.loads(r.stdout)
    assert payload["name"] == "gen-asset"

def test_json_dry_run_envelope():
    r = run("--json", "--dry-run", "--kind", "mesh", "--prompt", "x")
    env = json.loads(r.stdout)
    assert env["ok"] is True and env["dry_run"] is True

def test_bad_flag_exits_two():
    r = run("--xxxnope")
    assert r.returncode == 2
```

## Vitest Skeleton

```typescript
// scripts/deploy.test.ts
// SPDX-License-Identifier: MIT
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

const run = (...args: string[]) =>
  spawnSync("scripts/deploy", args, { encoding: "utf8" });

describe("scripts/deploy", () => {
  it("--help exits 0", () => {
    const r = run("--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });
  it("--json --dry-run envelope", () => {
    const r = run("--json", "--dry-run", "--env", "staging");
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.dry_run).toBe(true);
  });
  it("bad flag exits 2", () => {
    expect(run("--xxxnope").status).toBe(2);
  });
});
```

## Coverage Gate

| Lang | Tool | Floor |
|---|---|---|
| bash | `kcov` + bats | 80% line coverage |
| python | `pytest-cov` | 90% |
| typescript | `vitest --coverage` | 90% |

`scripts/check --only coverage` enforces. Below floor → exit 5.

## Snapshot Tests

`--help` output snapshotted. Update with:

```bash
scripts/test --scripts --update-snapshots
```

Review the diff in PR. nexus-merge fails the PR if snapshots changed without a `CHANGELOG.md` entry under `## scripts:` header.

## Helpers

`scripts/tests/helpers.bash`:
- loads `bats-assert`, `bats-support`, `bats-file`
- `assert_envelope` — validates the universal JSON envelope
- `assert_exit_code N`
- `with_clean_env` — isolates `NEXUS_*` vars per test

Python helpers: `scripts/tests/helpers.py` (`assert_envelope`, fixtures).

## CI Integration

```
scripts/test --scripts --json
```

- runs bats + pytest + vitest, aggregated
- emits one envelope with `data.results: [{name, lang, passed, duration_ms}]`
- exit 5 on any failure, 0 on all pass

Wired in `→ docs/guides/ci-and-scripts.md`.

## References

- bats-core — https://bats-core.readthedocs.io
- pytest — https://docs.pytest.org
- vitest — https://vitest.dev
- kcov — https://github.com/SimonKagstrom/kcov
