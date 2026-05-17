<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# TypeScript Style

TS covers `web/`, `mobile/` (React Native or Tauri), tooling (`nexus-cli` companion plugins), and the editor frontend.

Runtime: Node 22 LTS or Bun 1.x. Browser: ES2023. Package manager: `pnpm` only.

## One tool: Biome

No ESLint. No Prettier. No `eslint-config-airbnb`. No `prettier-plugin-*`. Biome formats and lints in one binary. → `formatting-tools.md`

Cite: biomejs.dev/internals/architecture · biomejs.dev/guides/getting-started.

## `biome.json`

Drop at workspace root. Identical in engine tooling and game template.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "ignore": ["dist", "build", "node_modules", "**/*.gen.ts", "target"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always",
      "bracketSameLine": false
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error",
        "useExhaustiveDependencies": "error"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "error",
        "noDebugger": "error",
        "noEmptyBlockStatements": "error"
      },
      "style": {
        "noDefaultExport": "error",
        "noNamespace": "error",
        "useImportType": "error",
        "useExportType": "error",
        "useNamingConvention": {
          "level": "error",
          "options": {
            "strictCase": true,
            "conventions": [
              { "selector": { "kind": "typeLike" }, "formats": ["PascalCase"] },
              { "selector": { "kind": "variable" }, "formats": ["camelCase", "PascalCase", "CONSTANT_CASE"] },
              { "selector": { "kind": "function" }, "formats": ["camelCase", "PascalCase"] }
            ]
          }
        }
      },
      "complexity": {
        "noExcessiveCognitiveComplexity": { "level": "error", "options": { "maxAllowedComplexity": 15 } },
        "noUselessTypeConstraint": "error"
      },
      "performance": { "recommended": true },
      "security": { "recommended": true }
    }
  },
  "organizeImports": { "enabled": true }
}
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": false,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "incremental": true,
    "composite": true
  },
  "exclude": ["node_modules", "dist", "build"]
}
```

Mandatory strict flags. No project may downgrade. CI rejects `tsconfig.json` diffs that loosen.

Cite: typescript-eslint.io/getting-started/typed-linting · TypeScript handbook (Strict checks).

## Hard rules

| Rule | Enforced by |
|------|-------------|
| No `any` (use `unknown` + narrow) | biome `noExplicitAny` |
| No default exports | biome `noDefaultExport` |
| No `console.log` (use logger) | biome `noConsoleLog` |
| No `enum` (use string literal unions) | review |
| No `namespace` (use modules) | biome `noNamespace` |
| `import type` for type-only imports | biome `useImportType` |
| No `as` casts except `as const` / `as unknown as T` with comment | review |
| Catch `unknown`, narrow before use | tsconfig `useUnknownInCatchVariables` |
| Index access returns `T \| undefined` | tsconfig `noUncheckedIndexedAccess` |

## File naming

| Kind | Convention | Example |
|------|-----------|---------|
| Source file | `kebab-case.ts` | `render-queue.ts` |
| React component file | `PascalCase.tsx` | `SceneTree.tsx` |
| Test file | `*.test.ts` colocated | `render-queue.test.ts` |
| Generated file | `*.gen.ts` (gitignored) | `schema.gen.ts` |
| Barrel | `index.ts` (re-exports only) | `components/index.ts` |

→ `naming.md`

## Module layout

```
web/
├── src/
│   ├── main.tsx              # entry only, no logic
│   ├── app/                  # routes, top-level providers
│   ├── components/           # presentational, no fetch
│   │   ├── scene-tree/
│   │   │   ├── SceneTree.tsx
│   │   │   ├── scene-tree-node.tsx
│   │   │   ├── use-scene-tree.ts
│   │   │   └── SceneTree.test.tsx
│   │   └── index.ts
│   ├── services/             # business logic (per claude-code-bible 03)
│   │   ├── engine/
│   │   │   ├── client.ts
│   │   │   ├── errors.ts
│   │   │   └── client.test.ts
│   │   └── telemetry/
│   ├── lib/                  # pure utilities, no state
│   └── types/                # shared type definitions
├── biome.json                # extends workspace root
├── tsconfig.json
└── package.json
```

File length: ≤300 LOC. Split larger files. Component files: one component per file.

## React conventions

| Topic | Rule |
|-------|------|
| Component kind | Function components only. No class components. |
| Props | `type Props = { ... }` then `function Foo(props: Props)`. |
| Hooks | Prefix `use*`. One concern per hook. |
| State | `useState` for local · Zustand for cross-tree · TanStack Query for server state. No Redux. |
| Fetch | Never in components. Use a hook that wraps a service. |
| Effects | Last resort. Prefer derived state. `useExhaustiveDependencies` enforced. |
| Refs | `useRef<T>(null)`. Never mutate during render. |
| Styling | Tailwind utility classes. No CSS-in-JS runtimes. |
| Memo | Only after profiling. `React.memo` requires a `// Profile: ...` comment. |

```tsx
// components/scene-tree/SceneTree.tsx
import { useSceneTree } from './use-scene-tree';
import { SceneTreeNode } from './scene-tree-node';

type Props = {
  rootId: string;
  onSelect: (entityId: string) => void;
};

export function SceneTree({ rootId, onSelect }: Props) {
  const { nodes, isLoading } = useSceneTree(rootId);
  if (isLoading) return <div>Loading…</div>;
  return (
    <ul>
      {nodes.map((n) => (
        <SceneTreeNode key={n.id} node={n} onSelect={onSelect} />
      ))}
    </ul>
  );
}
```

Cite: react.dev/learn/thinking-in-react · react.dev/reference/react/hooks.

## Error handling

`errors.md` defines the universal contract. TS implementation:

```ts
// services/engine/errors.ts
export type EngineErrorCode =
  | 'ENGINE_NOT_READY'
  | 'SCENE_NOT_FOUND'
  | 'ENTITY_INVALID';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
    public readonly location?: string,
    public readonly suggestedFix?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EngineError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      location: this.location,
      suggestedFix: this.suggestedFix,
    };
  }
}
```

Rules:
- Never throw plain `Error`. Always a domain subclass.
- Never catch `any`. Catch `unknown`, narrow with `instanceof EngineError`.
- Async functions: `Promise<Result<T, EngineError>>` for fallible paths (use `neverthrow`).
- No swallowed errors. Re-throw or log via `logger.error({ err })`.

## Logging

`pino` only. No `console.*`. → `logging.md`

```ts
import { logger } from '@/lib/logger';

logger.info({ entityId, frame: 42 }, 'spawned entity');
```

## Imports

Order (Biome organizes automatically):
1. Node / Bun built-ins
2. External packages
3. Internal absolute (`@/`)
4. Relative (`./`, `../`)
5. Type-only imports — same groups, `import type`

```ts
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { engineClient } from '@/services/engine/client';

import { formatEntity } from './format';

import type { Entity } from '@/types/entity';
```

## Forbidden

| Pattern | Why | Use |
|---------|-----|-----|
| `default export` | Bad grep, rename hazard | named export |
| `enum` | Runtime cost, bad tree-shake | `as const` union |
| `namespace` | Pre-module legacy | ES modules |
| `import * as` | Unclear surface | named imports |
| `// @ts-ignore` | Hides bugs | `// @ts-expect-error: <reason>` |
| `Function`, `Object`, `{}` | Too broad | precise type or `unknown` |
| `JSON.parse(x)` raw | Untyped | `zod.parse(x)` |
| `new Date()` for time math | TZ bugs | `Temporal` (polyfill OK) |
| `console.log` in committed code | Unstructured | `logger.info` |

## File header

Every `.ts` / `.tsx` file:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nexus Engine contributors
```

Pre-commit hook inserts. CI rejects missing.

## Cross-link

- → `errors.md` · → `logging.md` · → `naming.md`
- → `formatting-tools.md` (Biome version pin)
- → `dependencies.md` (`pnpm` policy)
- → `docs/guides/testing/unit.md` (vitest)
