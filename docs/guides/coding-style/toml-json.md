<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# TOML / JSON Style

Configuration files. Engine and game template. Same rules.

## File format choice

| Format | Use |
|--------|-----|
| TOML | Human-edited config: `Nexus.toml`, `Cargo.toml`, `pyproject.toml`, `cargo-deny.toml` |
| JSON | Machine-edited config + schemas: `biome.json`, `tsconfig.json`, `package.json`, telemetry, errors |
| YAML | CI only: `.github/workflows/*.yml`. Forbidden elsewhere. |
| JSON5 / JSONC | Forbidden. |
| INI | Forbidden except `.sqlfluff` (tool requirement). |

YAML's whitespace fragility breaks AI editing. Use it only where GitHub forces it.

## Indent / line endings

| | Indent | Width | Endings |
|--|--------|-------|---------|
| TOML | spaces | 2 | LF |
| JSON | spaces | 2 | LF |
| YAML | spaces | 2 | LF |

Final newline required. Trailing whitespace banned. Enforced by pre-commit (`trailing-whitespace`, `end-of-file-fixer`).

## TOML conventions

```toml
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Nexus Engine contributors

# Top-of-file: brief purpose comment, then the schema link.
# Schema: <repo>/schemas/nexus-toml-v1.json

[package]
name        = "nexus-renderer"
version     = "0.1.0"
edition     = "2024"
license     = "MIT"
description = "Render graph and GPU command submission for Nexus Engine."

[dependencies]
naga      = "0.20"
parking_lot = "0.12"
thiserror = "1"
tracing   = "0.1"
wgpu      = "0.20"
```

Rules:
- Key order: lexicographic within a section. Exception: top-of-section metadata (`name`, `version`) goes first.
- Align `=` within blocks of related keys (helps grep + diff).
- One blank line between sections. Two between major sections (`[dependencies]` vs `[dev-dependencies]`).
- Comments above the key, not after. `# comment` then `key = value`.
- Arrays of strings: one per line when > 3 entries.
- Tables-of-arrays use `[[deps]]` block syntax, not inline.

```toml
# Good — multi-line array
authors = [
  "Nexus Engine contributors",
]

# Good — inline for small
keywords = ["gamedev", "engine", "wgpu"]
```

## JSON conventions

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "ignore": ["dist", "node_modules"]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

Rules:
- `$schema` first key when applicable. Always.
- Keys: `camelCase` (matches JS ecosystem). Exception: data files mirroring SQL columns use `snake_case`.
- Trailing newline required. No trailing comma (real JSON).
- Sorted keys preferred but not enforced (some configs depend on order — `tsconfig.json` `references`).
- Arrays: one element per line for > 3 elements; inline for small.

## Schema files alongside data files

Every TOML/JSON config that nexus-merge or the engine reads has a sibling schema:

```
config/
├── nexus.toml
├── nexus.schema.json          ← JSON Schema for nexus.toml
├── scenarios/
│   ├── boot.toml
│   └── boot.schema.json
```

Rules:
- Schema name: `<config>.schema.json` (same stem).
- `$schema: "https://json-schema.org/draft/2020-12/schema"` at top.
- CI validates every data file against its sibling schema.
- Editors auto-pick schema via `// @ts-check`-equivalent (most editors use the `$schema` URL).
- Schemas live under version control alongside data — never on a remote URL alone.

→ `docs/specs/agent/scenarios.md` (scenario schema) · → `docs/game-template/nexus-toml.md` (Nexus.toml schema)

## Comment policy

| Format | Comments allowed? | Style |
|--------|-------------------|-------|
| TOML | yes | `#` only; comment-above-key |
| JSON | NO (strict spec) | use schema `description` field instead |
| YAML | yes | `#` only |

JSON has no comments. If commentary is needed, use a sibling `.md` file or expand the schema's `description`. Never use JSON5/JSONC.

→ `comments.md` (WHY not WHAT)

## File header

```toml
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Nexus Engine contributors
```

JSON cannot carry a header. License is recorded in:
1. The repository `LICENSE` file.
2. The schema's `description` field (`"description": "... — SPDX-License-Identifier: MIT"`).

## Forbidden

| Pattern | Why |
|---------|-----|
| Tabs | Inconsistent across editors |
| Trailing whitespace | Diff noise |
| Mixed line endings | CRLF/LF flips |
| JSON5 / JSONC | Non-standard parsers |
| YAML outside `.github/workflows/` | Whitespace fragility |
| Anchors / aliases (YAML) | Hard for AI to follow |
| TOML inline tables > 3 keys | Use a section |
| Floating-point keys (TOML) | Spec-undefined |
| Bare keys with special chars | Quote everything ambiguous |
| Schema URLs without local copy | Network dependency |

## Tool gates

| Tool | Files | Check |
|------|-------|-------|
| `taplo` | `*.toml` | Format + lint |
| `biome` | `*.json` (non-schema) | Format |
| `actionlint` | `.github/workflows/*.yml` | Lint |
| `ajv` | `*.json` (schema'd) | Validate against `$schema` |

Pre-commit runs all of these. → `formatting-tools.md`

## Cross-link

- → `comments.md` · → `formatting-tools.md`
- → `docs/game-template/nexus-toml.md` (Nexus.toml schema)
- → `docs/specs/agent/scenarios.md` (scenario TOML schema)
- → `errors.md` (JSON error schema)
