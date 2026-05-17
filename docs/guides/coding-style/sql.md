<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# SQL Style

PostgreSQL 16+ everywhere. Used in:
- `server/` — game backend (accounts, matchmaking, leaderboards, persistence)
- `infra/analytics/` — telemetry warehouse
- `nexus-merge` — PR/audit database
- `ai-agents/` — agent state store

SQLite allowed only for local dev and embedded save files. → `docs/specs/networking/lobby.md`

## One tool: sqlfluff

Formats and lints. No `pgFormatter`. No hand-written style sheets.

Cite: docs.sqlfluff.com.

## `.sqlfluff`

```ini
[sqlfluff]
dialect             = postgres
templater           = jinja
exclude_rules       = LT05, LT09
max_line_length     = 100
indent_unit         = space
tab_size            = 2

[sqlfluff:rules]
allow_scalar              = True
single_table_references   = consistent

[sqlfluff:rules:capitalisation.keywords]
capitalisation_policy = upper

[sqlfluff:rules:capitalisation.identifiers]
capitalisation_policy = lower

[sqlfluff:rules:capitalisation.functions]
extended_capitalisation_policy = lower

[sqlfluff:rules:capitalisation.literals]
capitalisation_policy = upper

[sqlfluff:rules:capitalisation.types]
extended_capitalisation_policy = upper

[sqlfluff:rules:ambiguous.column_references]
group_by_and_order_by_style = explicit
```

## Naming

| Item | Convention | Example |
|------|-----------|---------|
| Table | `snake_case`, plural | `players`, `match_history` |
| Column | `snake_case`, singular | `player_id`, `created_at` |
| Primary key | `id` (uuid v7) | `id uuid` |
| Foreign key | `<table_singular>_id` | `player_id` |
| Boolean | `is_*` / `has_*` | `is_banned` |
| Timestamp | `*_at` | `created_at` |
| Date | `*_on` | `birthday_on` |
| Index | `idx_<table>_<cols>` | `idx_players_email` |
| Unique idx | `uq_<table>_<cols>` | `uq_players_username` |
| FK constraint | `fk_<table>_<col>` | `fk_match_history_player_id` |
| Check constraint | `ck_<table>_<rule>` | `ck_players_email_format` |
| View | `v_*` | `v_active_players` |
| Materialized view | `mv_*` | `mv_leaderboard_daily` |
| Function | `<verb>_<noun>` | `calculate_mmr` |
| Trigger | `tr_<table>_<event>` | `tr_players_updated_at` |
| Migration file | `YYYYMMDDHHMMSS_<verb>_<noun>.sql` | `20260517090000_create_players.sql` |

→ `naming.md`

## Schema conventions

```sql
-- 20260517090000_create_players.sql
-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Nexus Engine contributors

CREATE TABLE players (
  id          UUID        PRIMARY KEY DEFAULT gen_uuid_v7(),
  username    TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  is_banned   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_players_username UNIQUE (username),
  CONSTRAINT uq_players_email    UNIQUE (email),
  CONSTRAINT ck_players_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX idx_players_created_at ON players (created_at DESC);

CREATE TRIGGER tr_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Rules:
- `uuid v7` for all primary keys (time-ordered, index-friendly). Never `serial`/`bigserial`.
- `TIMESTAMPTZ` always, never `TIMESTAMP`.
- `TEXT` over `VARCHAR(n)` unless length is a domain constraint.
- `NOT NULL` by default; nullability is intentional.
- Every table: `created_at`, `updated_at`. Every mutable table: `updated_at` trigger.
- Constraints named explicitly. Never anonymous.
- One statement per migration concern. Split mixed concerns.

## Migrations

| Tool | Use case |
|------|----------|
| `sqlx migrate` | Rust server (default) |
| `dbmate` | non-Rust services |
| Hand-rolled scripts | forbidden |

Rules:
- Migrations are **append-only**. Never edit a merged migration.
- Down-migrations required for every up-migration.
- Reversible. CI runs `up → down → up` on every PR touching `migrations/`.
- One transaction per migration (`BEGIN; ... COMMIT;`).
- Lock-acquiring DDL flagged: `[BENCHMARK NEEDED]` if table > 1M rows.
- No data backfills > 10k rows in a migration. Use a separate job.

## Query style

```sql
SELECT
  p.id,
  p.username,
  COUNT(mh.id) AS match_count
FROM players AS p
LEFT JOIN match_history AS mh
  ON mh.player_id = p.id
WHERE p.is_banned = FALSE
  AND p.created_at >= NOW() - INTERVAL '30 days'
GROUP BY p.id, p.username
ORDER BY match_count DESC
LIMIT 100;
```

Rules:
- Keywords uppercase, identifiers lowercase. (sqlfluff enforces.)
- Always alias tables in joins (`AS p`).
- Always qualify columns in joins (`p.id`, never bare `id`).
- One clause per line for any query > 3 clauses.
- Explicit `INNER JOIN` / `LEFT JOIN`. Never bare `JOIN`.
- `GROUP BY` lists every non-aggregate column. No ordinal references.
- No `SELECT *` outside ad-hoc analysis.
- No untyped placeholders. Use `$1`/`$2` (PG) or named (`:param`).

## Performance contract

| Metric | Target | Hard limit |
|--------|--------|-----------|
| OLTP single-row query | < 1 ms p95 | 10 ms p99 |
| OLTP write | < 5 ms p95 | 50 ms p99 |
| OLAP analytics query | < 5 s | 60 s |
| Migration lock time | < 100 ms | 1 s (else use `ALGORITHM=INPLACE` patterns) |

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` mandatory for any query touching > 100k rows. JSON output piped to nexus-merge for review.

## Forbidden

| Pattern | Why |
|---------|-----|
| `SELECT *` | Implicit schema dependency |
| `NATURAL JOIN` | Hidden column matching |
| Triggers for business logic | Hidden side effects |
| Stored procedures > 50 lines | Move to service layer |
| ORM-generated raw SQL committed | Use migration tool |
| Anonymous constraints | Hard to debug |
| `CHAR(n)` | Padded storage |
| `MONEY` type | Locale issues; use `NUMERIC(19,4)` |
| `serial` / `bigserial` | Predictable IDs, not sortable globally |
| Updates without `WHERE` | Footgun |
| Cross-database joins | Coupling |

## File header

```sql
-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Nexus Engine contributors
```

## Cross-link

- → `errors.md` (SQLSTATE → universal code map)
- → `naming.md` · → `formatting-tools.md` · → `dependencies.md`
- → `docs/specs/networking/lobby.md` (server schema)
- → `docs/guides/testing/integration.md` (testcontainers)
