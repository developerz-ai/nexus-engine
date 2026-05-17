<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Python Style

Python 3.12+. Used in:
- `ai-agents/` (game template) — AI agents that drive `nexus-agent-sdk`
- `nexus-engine/tools/` — build/release/codegen scripts
- `nexus-agent-sdk` Python bindings → `docs/specs/agent/sdk.md`

Not used in the engine runtime. Not used for shipping game code.

## One tool: Ruff

No Black. No isort. No flake8. No pylint. Ruff formats and lints. Pyright type-checks.

Cite: docs.astral.sh/ruff/configuration · microsoft/pyright.

## `ruff.toml`

```toml
target-version = "py312"
line-length    = 100
indent-width   = 4

[format]
quote-style              = "single"
indent-style             = "space"
docstring-code-format    = true
docstring-code-line-length = 80

[lint]
select = [
  "E",    # pycodestyle errors
  "W",    # pycodestyle warnings
  "F",    # pyflakes
  "I",    # isort
  "N",    # pep8-naming
  "UP",   # pyupgrade
  "B",    # bugbear
  "A",    # builtins shadowing
  "C4",   # comprehensions
  "T20",  # no print
  "SIM",  # simplify
  "RET",  # return
  "PT",   # pytest
  "TID",  # tidy imports
  "ARG",  # unused args
  "PTH",  # pathlib over os.path
  "ERA",  # eradicate commented code
  "PL",   # pylint
  "RUF",  # ruff-specific
  "ANN",  # type annotations
  "S",    # bandit (security)
  "ASYNC",# async best practices
  "TRY",  # tryceratops (errors)
  "PERF", # perflint
]
ignore = [
  "ANN101",  # missing-type-self
  "ANN102",  # missing-type-cls
  "PLR0913", # too-many-arguments (use class)
]

[lint.per-file-ignores]
"tests/**" = ["S101", "PLR2004", "ANN"]   # assert ok, magic nums ok, types optional

[lint.pydocstyle]
convention = "google"

[lint.isort]
known-first-party = ["nexus_agent_sdk", "nexus_tools"]
force-single-line = false
```

## `pyrightconfig.json`

```json
{
  "include": ["src", "tests", "tools"],
  "pythonVersion": "3.12",
  "typeCheckingMode": "strict",
  "reportMissingTypeStubs": "warning",
  "reportImplicitOverride": "error",
  "reportUnknownMemberType": "error",
  "reportUnknownVariableType": "error",
  "reportImplicitStringConcatenation": "error",
  "reportImportCycles": "error",
  "reportUnusedImport": "error",
  "reportUnusedFunction": "error",
  "strictListInference": true,
  "strictDictionaryInference": true,
  "strictSetInference": true
}
```

Strict only. No `pyright: ignore` without an `# pyright: ignore [reportX] -- <reason>` comment.

## Naming

| Item | Convention |
|------|-----------|
| Module file | `snake_case.py` |
| Package dir | `snake_case/` |
| Class | `PascalCase` |
| Function / method | `snake_case` |
| Constant | `SCREAMING_SNAKE_CASE` |
| Type alias | `PascalCase` |
| Private | `_leading_underscore` |
| Dunder | `__only_when_required__` |

→ `naming.md`

## Module layout

```
ai-agents/
├── src/
│   └── playtest_agent/
│       ├── __init__.py
│       ├── main.py                # CLI entry, anyio
│       ├── services/              # business logic
│       │   ├── __init__.py
│       │   ├── scenario_runner.py
│       │   ├── errors.py
│       │   └── telemetry.py
│       ├── lib/                   # pure helpers
│       └── types.py               # shared dataclasses / Protocols
├── tests/
│   └── ...
├── ruff.toml
├── pyrightconfig.json
└── pyproject.toml
```

File length: ≤300 LOC. Function length: ≤60 LOC.

## Type hints

Mandatory on every public function and method.

```python
from collections.abc import Iterable
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class SpawnRequest:
    archetype: str
    count: int
    position: tuple[float, float, float]

async def spawn_batch(
    client: EngineClient,
    requests: Iterable[SpawnRequest],
    *,
    timeout_s: float = 5.0,
) -> list[EntityId]:
    """Spawn entities in a single batched RPC call.

    Args:
        client: Connected engine client.
        requests: Spawn requests to batch.
        timeout_s: RPC timeout.

    Returns:
        List of allocated entity IDs in request order.

    Raises:
        EngineError: ``ENGINE_NOT_READY`` if client is not connected.
    """
    ...
```

Rules:
- `from __future__ import annotations` at top of every file (PEP 563).
- Built-in generics: `list[int]`, `dict[str, T]` — never `List[int]` / `Dict[...]`.
- `X | None` — never `Optional[X]`.
- No implicit `Any`. Strict pyright catches it.
- `Protocol` over ABC for structural typing.
- `@dataclass(frozen=True, slots=True)` for value types.

## Error handling

```python
# services/errors.py
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class EngineError(Exception):
    code: str
    message: str
    location: str | None = None
    suggested_fix: str | None = None
    context: dict[str, Any] | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            'code': self.code,
            'message': self.message,
            'location': self.location,
            'suggested_fix': self.suggested_fix,
            'context': self.context,
        }
```

Rules:
- Subclass `EngineError`, never `Exception` directly. → `errors.md`
- `except Exception:` is banned. Catch concrete types.
- `except EngineError as e:` and re-raise with context (`raise ... from e`).
- `try` body ≤ 5 lines. Move logic out.
- `raise ... from None` only when re-wrapping intentional.

## Async

`anyio` only. No raw `asyncio`. No `trio` direct (use anyio's trio backend).

```python
import anyio

async def main() -> None:
    async with anyio.create_task_group() as tg:
        tg.start_soon(scenario_runner.run)
        tg.start_soon(telemetry.stream)
```

No threads inside an async function. CPU-bound work → `anyio.to_thread.run_sync`.

## Logging

`structlog` only. No `print`. No raw `logging`. → `logging.md`

```python
import structlog
log = structlog.get_logger()

log.info('spawned', entity_id=entity_id, frame=42)
log.error('rpc_failed', err=err.to_json())
```

## Imports

Order (Ruff isort enforces):
1. Standard library
2. Third-party
3. First-party (`nexus_*`)
4. Local relative

`from __future__ import annotations` always first. One import per line for clarity (Biome-equivalent rule).

## Forbidden

| Pattern | Why | Use |
|---------|-----|-----|
| `print` | Unstructured | `structlog` |
| `os.path` | Old API | `pathlib.Path` |
| Bare `except:` | Hides bugs | concrete exception |
| `assert` for control flow | Stripped with `-O` | `if … raise` |
| Mutable default args | Aliasing bugs | `None` + create in body |
| `typing.Any` in public API | Defeats checker | concrete type or `object` |
| `eval` / `exec` | Sandbox escape | restructure |
| `requests` (sync HTTP) | Blocks event loop | `httpx` |
| Star imports | Pollutes namespace | named imports |
| Global mutable state | Test flakes | dependency injection |

## File header

```python
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Nexus Engine contributors
```

## Cross-link

- → `docs/specs/agent/sdk.md` · → `errors.md` · → `logging.md`
- → `naming.md` · → `formatting-tools.md` · → `dependencies.md`
- → `docs/guides/testing/unit.md` (pytest)
