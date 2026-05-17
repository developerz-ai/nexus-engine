<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# `scripts/` — Style

> Bash / Python / TypeScript style rules. ShellCheck-clean, ruff-clean, biome-clean. Enforced by `scripts/lint-scripts`.

## Naming

| Surface | Convention | Example |
|---|---|---|
| canonical entry script | kebab-case, **no extension** | `scripts/build` |
| implementation behind it | same name + lang ext, under `lib/` if reused | `scripts/lib/build.sh` |
| sibling test | same name + test ext | `scripts/build.bats` |
| lib module | snake-case + lang ext | `scripts/lib/json.sh` |
| internal bash function | `nx_<module>_<verb>` | `nx_log_info` |
| python module | `nx.<module>` | `from nx import log` |
| typescript module | `@nx/<module>` (bun import map) | `import { log } from "@nx/log"` |

## Bash Style

| Rule | Detail |
|---|---|
| shebang | `#!/usr/bin/env bash` — never `#!/bin/bash` |
| strict mode | `set -euo pipefail` immediately after SPDX line |
| IFS | `IFS=$'\n\t'` after strict mode |
| lint | ShellCheck must pass clean (no warnings) |
| formatter | `shfmt -i 2 -ci -bn` (2-space indent, case-indented, binary ops at line start) |
| functions | `lower_snake_case`; private prefixed `_` |
| globals | UPPER_SNAKE; library-owned use `NX_LIB_` prefix |
| quoting | always quote `"$var"`, even when "safe" |
| arrays | use them; `for x in "${arr[@]}"`, never `for x in $arr` |
| trap | every script registers `trap _nx_on_exit EXIT` from `telemetry.sh` |
| heredocs | quote the delimiter (`<<'EOF'`) unless interpolation needed |

Bash skeleton: `scripts/lib/skeleton.sh` (copied by `scripts/new-script`).

## Python Style

| Rule | Detail |
|---|---|
| version | 3.11+ |
| formatter | ruff (format + lint) |
| typing | full type hints, `from __future__ import annotations` |
| argparse | **`argparse` from stdlib** — locked choice. No typer, no click. Rationale: stdlib, zero install, agent-stable. |
| modules | snake_case, one CLI = one file |
| imports | sorted, ruff `I` rules |
| docstrings | one-line module + one-line CLI description matching `manifest.toml` |
| logging | `from nx import log` — never `print` for diagnostics |

Lock: argparse. Re-debate via ADR.

## TypeScript Style

| Rule | Detail |
|---|---|
| runtime | **bun** ≥ 1.1 — locked. No deno, no node. |
| arg parser | **commander** ≥ 12 — locked. |
| formatter / linter | biome |
| modules | ESM only, `.ts` extension, `import` not `require` |
| typing | strict, `noImplicitAny`, `exactOptionalPropertyTypes` |
| logging | `import { log } from "@nx/log"` |

Lock: bun + commander. Re-debate via ADR.

## File-Header Template (all bash)

```bash
#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Nexus Engine contributors
# scripts/build — compile workspace with sccache + features.
# See: docs/specs/scripts/cli-contract.md

set -euo pipefail
IFS=$'\n\t'

# shellcheck source=lib/args.sh
source "$(dirname "$0")/lib/args.sh"
# … etc
```

## File-Header Template (python)

```python
#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Nexus Engine contributors
"""scripts/gen-asset — invoke AI asset generation."""
from __future__ import annotations
import argparse, sys
from nx import log, envelope
```

## File-Header Template (typescript)

```typescript
#!/usr/bin/env bun
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
// scripts/deploy — wrap nexus deploy with env validation.
import { Command } from "commander";
import { log, envelope } from "@nx/std";
```

## Forbidden Idioms

| Idiom | Replace with |
|---|---|
| `cd $(dirname $0)/..` | use `NEXUS_ROOT`, set by `nx_env_load` |
| `which foo` | `command -v foo` |
| `[ … ]` | `[[ … ]]` |
| `` `cmd` `` (backticks) | `$(cmd)` |
| `ls \| grep` | `find` / `compgen` |
| python `print(json.dumps(x))` | `envelope.emit(data=x)` |
| typescript `console.log` | `log.info` / `envelope.emit` |

## Linter Enforcement

`scripts/lint-scripts` runs:

| Lang | Command |
|---|---|
| bash | `shellcheck -x scripts/**/*.sh scripts/<entry-scripts>` |
| bash | `shfmt -d -i 2 -ci -bn scripts/**/*.sh` |
| py | `ruff check scripts/` + `ruff format --check scripts/` |
| ts | `biome check scripts/` |
| bats | `bats --no-tempdir-cleanup --lint scripts/*.bats` |

Any non-zero → exit 5.

## References

- ShellCheck wiki — https://www.shellcheck.net/wiki/
- shfmt — https://github.com/mvdan/sh
- Bash strict mode — http://redsymbol.net/articles/unofficial-bash-strict-mode/
- Python argparse — https://docs.python.org/3/library/argparse.html
- commander.js — https://github.com/tj/commander.js
- biome — https://biomejs.dev
