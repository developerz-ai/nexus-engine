<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Lua Style

Lua 5.4. Game-script language for gameplay logic, hot-reloadable. → `docs/specs/scripting/lua.md`

Used in: `game/scripts/`, `dlc/*/scripts/`, `mods/*/scripts/`. Engine internals: never Lua.

## One tool: stylua

No `luacheck` separately — `stylua` formats; `selene` lints. → `formatting-tools.md`

## `.stylua.toml`

```toml
column_width      = 100
line_endings      = "Unix"
indent_type       = "Spaces"
indent_width      = 2
quote_style       = "AutoPreferSingle"
call_parentheses  = "Always"
collapse_simple_statement = "Never"
```

## `selene.toml`

```toml
std = "lua54+nexus"

[lints]
unused_variable      = "deny"
shadowing            = "deny"
undefined_variable   = "deny"
global_usage         = "deny"            # no globals at all
empty_if             = "deny"
mixed_table          = "warn"
high_cyclomatic_complexity = { level = "warn", maximum_complexity = 15 }
```

`nexus.yml` (selene std-lib def) ships with the template under `.selene/nexus.yml` and lists every engine-exposed function. Adding new engine bindings = updating that file. Selene then validates calls against it.

## Naming

| Item | Convention | Example |
|------|-----------|---------|
| File | `kebab-case.lua` | `enemy-spawner.lua` |
| Module table | `PascalCase` | `EnemySpawner` |
| Function | `snake_case` | `spawn_wave` |
| Local var | `snake_case` | `wave_count` |
| Constant (upvalue) | `SCREAMING_SNAKE_CASE` | `MAX_ENEMIES` |
| Private function | `_leading_underscore` | `_pick_archetype` |
| Boolean | `is_*` / `has_*` | `is_alive` |

→ `naming.md`

## Module pattern

One module per file. Returns a table. Never writes globals.

```lua
-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Nexus Engine contributors

local nexus = require('nexus')
local log   = nexus.log.channel('enemy_spawner')

local EnemySpawner = {}
EnemySpawner.__index = EnemySpawner

local MAX_ENEMIES = 64

function EnemySpawner.new(world, archetype)
  local self = setmetatable({}, EnemySpawner)
  self.world     = world
  self.archetype = archetype
  self.spawned   = {}
  return self
end

function EnemySpawner:spawn_wave(count)
  if #self.spawned + count > MAX_ENEMIES then
    return nil, nexus.error('ENEMY_LIMIT', 'wave exceeds cap', { cap = MAX_ENEMIES })
  end
  for _ = 1, count do
    local e = self.world:spawn(self.archetype)
    table.insert(self.spawned, e)
  end
  log:info({ count = count, total = #self.spawned }, 'wave spawned')
  return #self.spawned
end

return EnemySpawner
```

## Scoping rules

| Rule | Why |
|------|-----|
| All declarations `local` | No globals leak across hot reload |
| `local nexus = require('nexus')` at file top | One require per module |
| `selene` denies global writes | Catches typos that would create globals |
| No `_G[...] = ...` | Same |
| Module returns a single table | Predictable interface |

## Table conventions

| Use | Style |
|-----|-------|
| Array | 1-indexed, contiguous, no holes |
| Map | string keys only, `snake_case` |
| Mixed | forbidden (`selene` warns) |
| Class instance | `setmetatable(self, Class)` |
| Enum | `local Color = { RED = 1, BLUE = 2 }` + `local Color = setmetatable(Color, { __newindex = function() error('frozen') end })` |

## Hot-reload-safe patterns

| Do | Don't |
|----|-------|
| Recreate module instances on reload | Hold C-side handles across reload |
| Re-run `setmetatable` on tables | Mutate metatables in-place |
| Resubscribe event handlers in `on_reload` | Assume subscriptions persist |
| Store state in ECS components, not module-locals | Use file-level `local state = {}` for game state |
| Use `nexus.scope.persist(k, v)` for cross-reload values | `_G` for the same |

Engine hot-reload contract: → `docs/specs/scripting/hotreload.md`

Each module may declare:

```lua
function EnemySpawner.on_reload(prev)
  -- prev: previous module table; copy persistent state if needed
end
```

If absent, instances are discarded and rebuilt on next call.

## Error handling

```lua
local result, err = enemy_spawner:spawn_wave(20)
if not result then
  log:error({ err = err }, 'wave failed')
  return
end
```

Rules:
- All fallible functions return `value, err_or_nil`. → `errors.md`
- `err` is a `nexus.error(code, message, ctx)` table — never a string.
- `assert()` only at API boundaries with `nexus.error` argument.
- `error()` reserved for unrecoverable bugs (caller crash). Use `nexus.error(...)` payload.
- `pcall` only at module boundaries with `xpcall` to capture traceback for telemetry.

## Logging

```lua
local log = nexus.log.channel('enemy_spawner')
log:info({ count = 5 }, 'spawned')
log:warn({ ... }, '...')
log:error({ err = err }, '...')
```

No `print()`. Selene denies it (`std = "lua54+nexus"` removes `print` from the allowed surface).

→ `logging.md`

## Forbidden

| Pattern | Why |
|---------|-----|
| Globals (any) | Hot-reload pollution, no scoping |
| `_G[k] = v` | Same |
| `loadstring` / `load` of untrusted input | Sandbox escape |
| `os.execute`, `io.popen`, `os.exit` | Capability not granted in sandbox |
| `string.format` of error messages | Use structured `err.context` table |
| `for i,v in pairs(arr)` | Use `ipairs` for arrays |
| `table.insert(t, 1, x)` in hot loop | O(n); use deque module |
| Functions > 50 lines | Split |

## File header

```lua
-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Nexus Engine contributors
```

## Cross-link

- → `docs/specs/scripting/lua.md` · → `docs/specs/scripting/hotreload.md` · → `docs/specs/scripting/sandbox.md`
- → `errors.md` · → `logging.md` · → `naming.md` · → `formatting-tools.md`
- → `docs/guides/testing/unit.md` (busted)
