# 11 — Tables, Schemas & DDL

DDL (Data Definition Language) creates and modifies the database structure itself: tables, schemas, indexes, views, types. This chapter covers tables and schemas; indexes are chapter 13, views chapter 16.

## CREATE TABLE

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  age         INTEGER CHECK (age >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
);
```
::

Each column has a **name**, a **type**, and optional **constraints** (`NOT NULL`, `DEFAULT`, `UNIQUE`, `CHECK`, `PRIMARY KEY`, references). Constraints can be column-level (inline) or table-level (separate clause).

### Column vs table constraints

::code-wrapper{language="sql"}
```sql
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,                          -- column-level
  customer_id BIGINT  NOT NULL REFERENCES customers(id),
  amount      NUMERIC(10, 2) NOT NULL,
  -- table-level constraints (can span multiple columns)
  CONSTRAINT positive_amount CHECK (amount >= 0),
  CONSTRAINT valid_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE CASCADE
);
```
::

Table-level constraints are required for multi-column constraints (e.g., `UNIQUE (a, b)`, `CHECK (a + b <= 100)`) and let you name them.

## Naming Constraints

Named constraints produce readable errors (`violates foreign key constraint "valid_customer"`) and can be dropped by name. Unnamed constraints get auto-generated names like `orders_customer_id_fkey` — workable but less clear.

::code-wrapper{language="sql"}
```sql
CREATE TABLE accounts (
  id    BIGSERIAL,
  email TEXT,
  CONSTRAINT accounts_pk PRIMARY KEY (id),
  CONSTRAINT unique_email UNIQUE (email)
);
```
::

## DEFAULT Values

::code-wrapper{language="sql"}
```sql
CREATE TABLE events (
  id         BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status     TEXT NOT NULL DEFAULT 'pending',
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  counter    INTEGER NOT NULL DEFAULT 0
);
```
::

Defaults apply on `INSERT` when the column is omitted. They can be a constant or a function call (`now()`, `CURRENT_DATE`, `gen_random_uuid()`). A default does **not** update existing rows when changed later (it only affects future inserts).

### `DEFAULT` and `NULL`

`DEFAULT` applies only when the column is **omitted** from the `INSERT` column list. If you explicitly insert `NULL`, NULL is stored — the default doesn't override an explicit NULL. Add `NOT NULL` to prevent NULLs.

## Generated Columns

A generated column's value is computed from other columns — automatically maintained on insert/update:

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id         BIGSERIAL PRIMARY KEY,
  price      NUMERIC(10, 2) NOT NULL,
  qty        INTEGER NOT NULL,
  total      NUMERIC(10, 2) GENERATED ALWAYS AS (price * qty) STORED
);
```
::

`STORED` means the value is computed and stored on disk (takes space, fast to read). `VIRTUAL` (not yet in PostgreSQL; supported by MySQL) computes on read. Generated columns can't be directly written to (`GENERATED ALWAYS` forbids `INSERT`/`UPDATE` of the column).

Use cases: precomputed derivations you query often, or a generated expression that matches an index (e.g., `lower(email)` as a generated column with a unique index, for case-insensitive email uniqueness).

## Schemas

A schema is a namespace within a database — a way to group tables. The default schema is `public`.

::code-wrapper{language="sql"}
```sql
CREATE SCHEMA billing;
CREATE TABLE billing.invoices (...);   -- table "invoices" in schema "billing"
CREATE TABLE billing.payments (...);

-- Set a search path (like PATH for schemas)
SET search_path TO billing, public;
SELECT * FROM invoices;   -- resolves to billing.invoices (first in search_path)
```
::

The `search_path` controls which schemas are consulted for unqualified table names. Use schemas to organize multi-tenant or multi-feature databases without separate database instances.

### Multi-tenant patterns with schemas

- **Schema-per-tenant**: each tenant gets its own schema (`tenant_acme.invoices`). Strong isolation, but schema management is heavy and connection count matters.
- **Shared schema with `tenant_id`**: one `invoices` table, every row has `tenant_id`, enforced by RLS (Row-Level Security, chapter 24). Most common; scales well.
- **Database-per-tenant**: maximum isolation, highest operational cost. Reserved for strict compliance needs.

## Temporary Tables

::code-wrapper{language="sql"}
```sql
CREATE TEMP TABLE staging AS
  SELECT * FROM orders WHERE ordered_on >= '2024-01-01';

-- TEMP tables vanish at session end (or COMMIT, with ON COMMIT DROP)
CREATE TEMP TABLE scratch (id int, val text) ON COMMIT DROP;
```
::

Temporary tables are session-local — no other session sees them, and they're dropped at session end (or transaction end with `ON COMMIT DROP`). They're a scratchpad for multi-step processing without polluting the schema. In PostgreSQL, temp tables aren't autovacuumed by default — analyze them if you load lots of rows.

## ALTER TABLE

::code-wrapper{language="sql"}
```sql
-- Add a column (fast — no table rewrite in PostgreSQL 11+ for nullable columns)
ALTER TABLE users ADD COLUMN phone TEXT;

-- Add with default (may rewrite the table to fill existing rows; PG 11+ avoids rewrite for non-volatile defaults)
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- Drop a column (fast in PostgreSQL — marks it dead; physical space reclaimed by VACUUM)
ALTER TABLE users DROP COLUMN metadata;

-- Rename a column
ALTER TABLE users RENAME COLUMN name TO full_name;

-- Change a column type (requires a rewrite — expensive on big tables)
ALTER TABLE users ALTER COLUMN age TYPE BIGINT USING age::bigint;

-- Add a constraint (may scan the table to validate)
ALTER TABLE orders ADD CONSTRAINT positive_amount CHECK (amount >= 0);

-- Add a constraint without holding a long lock (PG 12+)
ALTER TABLE orders ADD CONSTRAINT fk_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_customer;
```
::

### Type changes can be expensive

`ALTER TABLE ... ALTER COLUMN col TYPE newtype` rewrites the entire table if the types aren't binary-compatible. On a billion-row table, this can be hours of downtime. Strategies:

1. **Add a new column, backfill, swap, drop old** — minimizes lock time.
2. **Use `USING` to convert** — `USING col::newtype` lets you control the conversion.
3. **Plan ahead** — pick the right type at creation.

## TRUNCATE

`TRUNCATE` empties a table instantly — far faster than `DELETE` (no per-row work, no trigger firing by default):

::code-wrapper{language="sql"}
```sql
TRUNCATE orders;                       -- empties the table
TRUNCATE orders, customers;            -- truncate multiple
TRUNCATE orders RESTART IDENTITY;      -- also reset SERIAL sequences
TRUNCATE orders CASCADE;               -- also truncate tables with FKs to this one
``
::

`TRUNCATE` is **not transactional in MySQL** (implicit commit), but **is transactional in PostgreSQL** (can be rolled back). `CASCADE` follows foreign keys — be careful, it can empty tables you didn't name.

## CREATE TABLE LIKE — copy structure

::code-wrapper{language="sql"}
```sql
-- Copy structure (no data)
CREATE TABLE orders_archive (LIKE orders INCLUDING ALL);

-- Copy structure with data
CREATE TABLE orders_2024 AS
  SELECT * FROM orders WHERE ordered_on >= '2024-01-01';
``
::

`INCLUDING ALL` copies defaults, constraints, indexes, and comments. Without it, only column names/types are copied.

## IF NOT EXISTS / IF EXISTS

Avoid errors when running idempotent scripts:

::code-wrapper{language="sql"}
```sql
CREATE TABLE IF NOT EXISTS logs (...);
DROP TABLE IF EXISTS old_logs;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone TEXT;
```
::

Useful for migrations that may run multiple times.

## 💡 Tips & Tricks

- **Idiom**: name your constraints — `CONSTRAINT orders_fk_customer FOREIGN KEY ...` produces readable error messages and lets you drop/replace by name. Auto-generated names like `orders_customer_id_fkey` work but are brittle across schema changes.
- **Performance**: in PostgreSQL 11+, `ADD COLUMN ... DEFAULT x` to a nullable-or-defaulted column is **metadata-only** (no table rewrite) if the default is a non-volatile constant — adding `status TEXT NOT NULL DEFAULT 'active'` to a billion-row table is instant. But `ALTER COLUMN ... TYPE` still rewrites; plan type changes carefully.
- **Idiom**: use `NOT VALID` + `VALIDATE CONSTRAINT` for adding FK/CHECK constraints to large tables without a long lock — `NOT VALID` skips the existing-row scan (instant), `VALIDATE` later scans with only a SHARE UPDATE EXCLUSIVE lock (reads/writes continue). Standard for zero-downtime migrations.
- **Idiom**: prefer `TRUNCATE` over `DELETE FROM table` when emptying a whole table — `TRUNCATE` is O(1) (no per-row work, no WAL per row, no trigger firing), while `DELETE` is O(N) and bloats the table until VACUUM. Reserve `DELETE` for partial removals.
- **Portability**: `CREATE TABLE LIKE INCLUDING ALL` is PostgreSQL-specific; MySQL has `LIKE` (no options); SQLite lacks it. For portable structure copying, generate the DDL from `information_schema`.

## ⚠️ Edge Cases & Gotchas

- **`SERIAL`/`BIGSERIAL` are not types, they're conveniences**: `SERIAL` creates a sequence + column default + NOT NULL. The column's actual type is `integer`. The sequence survives even if you drop the default. Prefer `GENERATED ... AS IDENTITY` (standard SQL, PostgreSQL 10+) going forward.
- **`ADD COLUMN ... DEFAULT` rewrites on volatile defaults**: `DEFAULT now()` or `DEFAULT gen_random_uuid()` are volatile and require a table rewrite to fill existing rows — even in PG 11+. Use a nullable column + backfill + `SET DEFAULT` + `SET NOT NULL` for safe rollout.
- **`ALTER COLUMN ... TYPE` rewrites**: changing `int` to `bigint`, `text` to `varchar(10)`, etc. rewrites the table. On large tables, do it in stages (new column, backfill, swap).
- **`TRUNCATE` and foreign keys**: `TRUNCATE orders` fails if another table has a FK to `orders` — use `CASCADE` (which truncates the dependent tables too) or truncate the dependent table first. `CASCADE` is dangerous in production — it can wipe tables you didn't intend.
- **`TRUNCATE` and sequences**: `TRUNCATE` doesn't reset `SERIAL` sequences by default — use `RESTART IDENTITY` to reset them. Without it, new inserts continue from the last sequence value, creating a gap.
- **`DROP COLUMN` doesn't reclaim space immediately**: PostgreSQL marks the column dead (fast) but the physical space is only reclaimed by `VACUUM FULL` (or `pg_repack`). Don't expect disk usage to drop right after `DROP COLUMN` on a large table.
- **Temp tables and schema search path**: temp tables are created in a special `pg_temp` schema that's searched first, so `CREATE TEMP TABLE users (...)` shadows a `public.users` table for the session — a source of "why isn't my data persisting" confusion.
- **`CREATE TABLE AS` doesn't copy constraints**: `CREATE TABLE x AS SELECT ...` copies columns and data but no PK, FK, UNIQUE, CHECK, or defaults. Add them afterward, or use `LIKE ... INCLUDING ALL` for structure.
- **Generated columns can't reference other tables**: `GENERATED ALWAYS AS (...)` can only use columns of the same row, not subqueries or other tables. For cross-table derivations, use a view or a trigger.
- **`IF NOT EXISTS` masks errors**: `CREATE TABLE IF NOT EXISTS x (...)` does nothing (and returns a notice) if the table exists — even if the existing table has *different columns*. It's idempotent, not a correctness check. Don't use it to "ensure" a schema; use it for migrations that may re-run.

## 🧠 Spot the Bug

A team runs this migration on a 500M-row table and the database locks up for 20 minutes:

::code-wrapper{language="sql"}
```sql
ALTER TABLE events
  ADD COLUMN processed_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01';
``
::

What went wrong, and how should they have done it?

<details>
<summary>Answer</summary>

A non-volatile constant default (`'1970-01-01'`) should be metadata-only in PostgreSQL 11+ — but `NOT NULL` forces a different path. To add a `NOT NULL` column, PostgreSQL must verify no existing row is NULL, which for a column with a default means **filling every existing row** with the default value — a full table rewrite on 500M rows, holding an `ACCESS EXCLUSIVE` lock (no reads or writes) for the duration.

The fix is a staged, lock-light rollout:

```sql
-- Step 1: add the column NULLABLE with a default (metadata-only, instant)
ALTER TABLE events ADD COLUMN processed_at TIMESTAMPTZ DEFAULT '1970-01-01';

-- Step 2: backfill any NULLs in batches (no long lock; backfill is a no-op here
--         since the default already populated new rows, but existing rows pre-default
--         may have NULL — handle in batches)
UPDATE events SET processed_at = '1970-01-01' WHERE processed_at IS NULL;

-- Step 3: add NOT NULL with a CHECK constraint NOT VALID (instant — skips existing rows)
ALTER TABLE events ADD CONSTRAINT events_processed_at_not_null
  CHECK (processed_at IS NOT NULL) NOT VALID;

-- Step 4: validate the constraint (SHARE UPDATE EXCLUSIVE — reads/writes continue)
ALTER TABLE events VALIDATE CONSTRAINT events_processed_at_not_null;
```

Or, in PostgreSQL 12+, `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT x` is still a rewrite — the safe path is the nullable + backfill + NOT VALID + validate pattern.

**The lesson**: `NOT NULL` on a new column with existing rows requires the table to be rewritten/filled, holding an exclusive lock. For zero-downtime migrations, add the column nullable, backfill in batches, then add `NOT NULL` via a `NOT VALID` + `VALIDATE` constraint.

</details>

## Summary

You can now create tables with columns, constraints, defaults, and generated columns; organize them with schemas; use temp tables for scratch work; alter tables safely (knowing which operations rewrite); and choose between `DELETE` and `TRUNCATE`. Next: constraints and keys — the rules that keep your data consistent.