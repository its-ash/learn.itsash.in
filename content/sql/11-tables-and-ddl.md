# 11 — Tables, Schemas & DDL

DDL defines the skeleton: tables, schemas, constraints, types. Get it wrong and every query downstream pays for it. This chapter is a code-first reference for production DDL — constraints, defaults, generated columns, temp tables, safe `ALTER` patterns, and `TRUNCATE` vs `DELETE`.

## CREATE TABLE — Full Syntax

::code-wrapper{language="sql"}
```sql
-- Complete production-grade table definition.
-- Every clause annotated with its runtime/lifetime implication.
CREATE TABLE billing.invoices (
  -- BIGSERIAL: creates a SEQUENCE + integer column + NOT NULL default.
  -- Sequence is a separate O(1) allocation object; gaps are possible on rollback.
  id              BIGSERIAL   PRIMARY KEY,

  -- TEXT vs VARCHAR(n): PG has no performance difference; VARCHAR(n) adds a CHECK.
  -- Prefer TEXT unless you need a length cap for business rules.
  invoice_number  TEXT        NOT NULL,

  -- NUMERIC(p,s): exact decimal — no floating-point error. p=total digits, s=scale.
  -- Storage: 2 bytes per 4 digits. Slower than float but safe for money.
  amount          NUMERIC(12,2) NOT NULL,

  -- TIMESTAMPTZ stores timestamp + timezone offset, normalized to UTC on disk.
  -- 8 bytes. Use TIMESTAMPTZ over TIMESTAMP unless you have a specific reason.
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dynamic default: now() is STABLE (same value within a statement), not VOLATILE.
  -- The default is evaluated at INSERT time, not at table creation.
  due_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),

  -- JSONB: binary JSON, GIN-indexable, reordered on storage. 1 byte overhead/json.
  -- Keys are stored sorted; duplicate keys keep last value.
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Generated STORED column: computed on write, physically stored, read at no cost.
  -- Cannot be written to (INSERT/UPDATE on this column errors).
  -- Cannot reference other tables, subqueries, or non-immutable functions.
  amount_usd      NUMERIC(12,2) GENERATED ALWAYS AS (amount * 1.0) STORED,

  -- Partial unique: only one non-draft invoice per number.
  -- Implemented as a partial unique index under the hood.
  CONSTRAINT invoices_unique_number UNIQUE (invoice_number)
    WHERE metadata->>'status' <> 'draft',

  -- CHECK constraint: per-row boolean; NULL (UNKNOWN) passes.
  -- CHECK can reference only the current row — no subqueries, no other tables.
  CONSTRAINT invoices_valid_amount CHECK (amount >= 0),

  -- Table-level FK with explicit name for readable error messages.
  -- ON DELETE RESTRICT prevents deleting a customer with invoices.
  CONSTRAINT invoices_customer_fk
    FOREIGN KEY (metadata->>'customer_id')
    REFERENCES billing.customers(id)
    ON DELETE RESTRICT
);
```
::

### Column-Level vs Table-Level Constraints

Column-level constraints appear inline with the column definition; table-level constraints appear as separate clauses. Table-level is required for multi-column constraints and for naming.

::code-wrapper{language="sql"}
```sql
-- Column-level: compact, no name control (auto-generated name).
CREATE TABLE t1 (
  email TEXT NOT NULL UNIQUE,                   -- constraint name: t1_email_key
  amount NUMERIC CHECK (amount > 0)             -- constraint name: t1_amount_check
);

-- Table-level: explicit names, multi-column support.
CREATE TABLE t2 (
  tenant_id   BIGINT  NOT NULL,
  email       TEXT    NOT NULL,
  amount      NUMERIC NOT NULL,
  -- Named constraints → readable error messages, easy DROP CONSTRAINT.
  CONSTRAINT t2_tenant_email_unique UNIQUE (tenant_id, email),
  CONSTRAINT t2_amount_positive     CHECK (amount > 0)
);
```
::

### Named Constraints

Named constraints appear in error messages (`violates foreign key constraint "invoices_customer_fk"`) and can be dropped by name. Auto-generated names (`t1_email_key`) work but are brittle across schema diff tools.

::code-wrapper{language="sql"}
```sql
-- Drop by name — no need to look up the auto-generated identifier.
ALTER TABLE billing.invoices DROP CONSTRAINT invoices_valid_amount;

-- Rename if you inherited a badly named constraint.
ALTER TABLE billing.invoices RENAME CONSTRAINT invoices_customer_fk TO invoices_fk_customer;
```
::

## DEFAULT Values

::code-wrapper{language="sql"}
```sql
CREATE TABLE events (
  id          BIGSERIAL   PRIMARY KEY,
  -- Constant default: metadata-only when added to existing tables (PG 11+).
  status      TEXT        NOT NULL DEFAULT 'pending',

  -- Dynamic default: evaluated at INSERT. now() is STABLE → still metadata-only
  -- for ADD COLUMN (PG 11+), because the planner treats it as a per-row expression.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- gen_random_uuid() is VOLATILE → ADD COLUMN DEFAULT requires a full table rewrite
  -- even in PG 11+ because each row needs a unique value computed at rewrite time.
  uuid        UUID        NOT NULL DEFAULT gen_random_uuid(),

  -- Expression default: any immutable/stable expression works.
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),

  -- Casted literal default — ensures type matches even if input coercion differs.
  config      JSONB       NOT NULL DEFAULT '{}'::jsonb
);
```
::

**`DEFAULT` does not override an explicit `NULL`.** If the column is omitted from `INSERT`, the default fires. If you explicitly `INSERT ... VALUES (NULL)`, NULL is stored. Add `NOT NULL` to forbid NULLs entirely.

## Generated Columns

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id          BIGSERIAL   PRIMARY KEY,
  price       NUMERIC(10,2) NOT NULL,
  qty         INTEGER     NOT NULL,

  -- STORED: computed on INSERT/UPDATE of price or qty, physically written to disk.
  -- Read cost: zero (it's a normal column). Write cost: recomputation on dependent change.
  -- The expression MUST be immutable — no now(), no random(), no subqueries.
  total_value NUMERIC(10,2) GENERATED ALWAYS AS (price * qty) STORED
);

-- PG does not support VIRTUAL generated columns (MySQL 8.0+ does).
-- VIRTUAL computes on read, zero storage, but recomputed per query.

-- Generated columns can be indexed — useful for expression indexes without
-- repeating the expression in every query.
CREATE INDEX products_total_value_idx ON products(total_value);
```
::

**Use case:** precompute a value you query often, or normalize an expression for indexing (e.g., `lower(email)` as a generated column with a unique index for case-insensitive uniqueness).

## Schemas — Multi-Tenant & Module Separation

::code-wrapper{language="sql"}
```sql
-- A schema is a namespace within a database. Default is 'public'.
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Tables live in a schema: schema.table
CREATE TABLE billing.invoices   (id BIGSERIAL PRIMARY KEY, amount NUMERIC);
CREATE TABLE analytics.reports  (id BIGSERIAL PRIMARY KEY, name TEXT);

-- search_path: like $PATH for schemas. First match wins.
SET search_path TO billing, public;
SELECT * FROM invoices;  -- resolves to billing.invoices

-- Permanently for a role:
ALTER ROLE app_user SET search_path TO billing, public;
```
::

### Multi-Tenant Patterns

| Pattern | Isolation | Scalability | Operational Cost |
|---|---|---|---|
| Schema-per-tenant | Strong | Moderate (schema count limits) | High — DDL per tenant |
| Shared schema + `tenant_id` + RLS | Moderate | High | Low — one schema |
| Database-per-tenant | Maximum | Low (conn count) | Highest |

::code-wrapper{language="sql"}
```sql
-- Schema-per-tenant: each tenant gets isolated tables.
CREATE SCHEMA tenant_acme;
CREATE TABLE tenant_acme.invoices (id BIGSERIAL PRIMARY KEY, amount NUMERIC);

-- Shared schema with tenant_id: one table, RLS enforces isolation.
CREATE TABLE shared.invoices (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  amount     NUMERIC NOT NULL
);
-- RLS policy (Chapter 24) ensures each tenant sees only their rows.
```
::

## Temporary Tables

::code-wrapper{language="sql"}
```sql
-- TEMP tables are session-local: no other session sees them.
-- Dropped at session end (or COMMIT with ON COMMIT DROP).
-- Created in pg_temp schema, which is searched first in search_path.
CREATE TEMP TABLE staging_orders AS
  SELECT * FROM billing.invoices WHERE issued_at >= '2024-01-01';

-- ON COMMIT DROP: vanished after each transaction — good for per-batch scratch.
CREATE TEMP TABLE batch_scratch (id bigint, val text) ON COMMIT DROP;

-- ON COMMIT DELETE ROWS: structure persists for the session, rows cleared per txn.
CREATE TEMP TABLE session_cache (key text, value jsonb) ON COMMIT DELETE ROWS;

-- TEMP tables are NOT autovacuumed by default — ANALYZE manually after bulk loads.
ANALYZE staging_orders;
```
::

## UNLOGGED Tables

::code-wrapper{language="sql"}
```sql
-- UNLOGGED: skips WAL writes → 2-3x faster INSERT/UPDATE.
-- Trade-off: NOT crash-safe. On crash, table is truncated.
-- Ideal for caches, ETL staging, ephemeral derived data.
CREATE UNLOGGED TABLE cache.user_scores (
  user_id BIGINT PRIMARY KEY,
  score   INTEGER NOT NULL
);

-- Convert to logged if it becomes important:
ALTER TABLE cache.user_scores SET LOGGED;
```
::

## ALTER TABLE Patterns

::code-wrapper{language="sql"}
```sql
-- ADD COLUMN: nullable, no default → instant (metadata-only, all PG versions).
ALTER TABLE billing.invoices ADD COLUMN notes TEXT;

-- ADD COLUMN with constant default (PG 11+): metadata-only, no rewrite.
-- PG stores the default in pg_attrdef and returns it for existing rows on read.
ALTER TABLE billing.invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';

-- ADD COLUMN with VOLATILE default (gen_random_uuid(), random()): REWRITES the table.
-- Each existing row needs a unique value computed at rewrite time → full table scan
-- under ACCESS EXCLUSIVE lock. On a billion-row table: hours of downtime.
ALTER TABLE billing.invoices ADD COLUMN ref_uuid UUID DEFAULT gen_random_uuid();

-- DROP COLUMN: marks column dead in catalog (fast), physical space reclaimed by VACUUM.
ALTER TABLE billing.invoices DROP COLUMN notes;

-- RENAME COLUMN: metadata-only, no data change.
ALTER TABLE billing.invoices RENAME COLUMN amount TO total;

-- ALTER COLUMN TYPE: rewrites the entire table (unless binary-compatible).
-- USING clause controls the conversion expression.
ALTER TABLE billing.invoices ALTER COLUMN amount TYPE NUMERIC(14,2) USING amount::numeric(14,2);

-- Add constraint normally: scans the table, holds ACCESS EXCLUSIVE lock.
ALTER TABLE billing.invoices ADD CONSTRAINT amount_positive CHECK (amount >= 0);

-- Add constraint NOT VALID: metadata-only, skips existing rows (instant).
-- VALIDATE later: scans with SHARE UPDATE EXCLUSIVE lock (reads/writes continue).
ALTER TABLE billing.invoices ADD CONSTRAINT amount_positive CHECK (amount >= 0) NOT VALID;
ALTER TABLE billing.invoices VALIDATE CONSTRAINT amount_positive;
```
::

### Safe Type Change on a Large Table

::code-wrapper{language="sql"}
```sql
-- ANTI-PATTERN: rewrites the entire table under ACCESS EXCLUSIVE lock.
-- ❌ On a 500M-row table, this is hours of downtime.
ALTER TABLE events ALTER COLUMN user_id TYPE bigint USING user_id::bigint;

-- CORRECT: staged, lock-light migration.
-- Step 1: add new column (nullable, no default — instant).
ALTER TABLE events ADD COLUMN user_id_new bigint;

-- Step 2: backfill in batches (no long lock).
UPDATE events SET user_id_new = user_id::bigint
WHERE id BETWEEN 1 AND 100000;  -- repeat in batches by id range.

-- Step 3: add NOT VALID + VALIDATE (light lock).
ALTER TABLE events ADD CONSTRAINT events_user_id_new_nn CHECK (user_id_new IS NOT NULL) NOT VALID;
ALTER TABLE events VALIDATE CONSTRAINT events_user_id_new_nn;

-- Step 4: swap in a single transaction (brief lock for rename + default).
BEGIN;
ALTER TABLE events RENAME COLUMN user_id     TO user_id_old;
ALTER TABLE events RENAME COLUMN user_id_new TO user_id;
ALTER TABLE events ALTER COLUMN user_id SET NOT NULL;
COMMIT;

-- Step 5: drop old column (fast — marked dead; VACUUM reclaims later).
ALTER TABLE events DROP COLUMN user_id_old;
```
::

## DROP TABLE

::code-wrapper{language="sql"}
```sql
DROP TABLE billing.invoices;                    -- fails if dependent objects exist.
DROP TABLE IF EXISTS billing.invoices;           -- idempotent.
DROP TABLE billing.invoices CASCADE;             -- drops dependent views, FKs, etc.

-- CASCADE is nuclear: it drops every view, materialized view, and FK that references
-- the table — silently. Always check dependencies first:
SELECT depender_ns.nspname AS depender_schema,
       depender.relname    AS depender_name,
       dependee.relname    AS dependee_name
FROM pg_depend d
JOIN pg_class depender ON depender.oid = d.objid
JOIN pg_class dependee ON dependee.oid = d.refobjid
JOIN pg_namespace depender_ns ON depender_ns.oid = depender.relnamespace
WHERE dependee.relname = 'invoices';
```
::

## TRUNCATE vs DELETE

::code-wrapper{language="sql"}
```sql
-- TRUNCATE: O(1). Removes all rows by unlinking the data file. No per-row WAL.
-- No triggers fire (by default). Not MVCC-visible to pre-existing transactions.
TRUNCATE billing.invoices;

-- TRUNCATE multiple tables in one command (single implicit transaction).
TRUNCATE billing.invoices, billing.invoice_items;

-- RESTART IDENTITY: resets SERIAL sequences to initial value.
-- Without it, sequences continue from their last value → gap after truncation.
TRUNCATE billing.invoices RESTART IDENTITY;

-- CASCADE: also truncates tables with FKs pointing INTO this table.
-- ⚠️ DANGEROUS — can empty tables you didn't name. Check FK graph first.
TRUNCATE billing.invoices CASCADE;

-- DELETE: O(N). Row-by-row removal, WAL per row, triggers fire, MVCC-visible.
-- Can be rolled back. Use for partial removals.
DELETE FROM billing.invoices WHERE issued_at < '2023-01-01';

-- TRUNCATE is transactional in PostgreSQL (can ROLLBACK).
-- TRUNCATE is NOT transactional in MySQL (implicit commit).
```
::

## CREATE TABLE LIKE & CREATE TABLE AS

::code-wrapper{language="sql"}
```sql
-- LIKE: copy structure (no data). INCLUDING ALL copies defaults, constraints, indexes.
CREATE TABLE billing.invoices_archive (LIKE billing.invoices INCLUDING ALL);

-- AS: copy structure + data. Does NOT copy constraints, PKs, defaults, or indexes.
CREATE TABLE analytics.invoices_2024 AS
  SELECT * FROM billing.invoices WHERE issued_at >= '2024-01-01';

-- To copy structure + data + constraints: combine LIKE + INSERT.
CREATE TABLE billing.invoices_backup (LIKE billing.invoices INCLUDING ALL);
INSERT INTO billing.invoices_backup SELECT * FROM billing.invoices;
```
::

## IF NOT EXISTS / IF EXISTS — Idempotent Migrations

::code-wrapper{language="sql"}
```sql
CREATE TABLE IF NOT EXISTS billing.invoices (...);
DROP TABLE IF EXISTS billing.invoices;
ALTER TABLE billing.invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE billing.invoices DROP COLUMN IF EXISTS notes;

-- ⚠️ IF NOT EXISTS masks schema drift: if the table exists with DIFFERENT columns,
-- this is a no-op (returns a NOTICE). It does NOT verify the schema matches.
-- Use it for re-runnable migrations, not for schema correctness enforcement.
```
::

## Complex Implementation: Production Multi-Table Schema

::code-wrapper{language="sql"}
```sql
-- A SaaS billing schema with proper constraints, defaults, generated columns,
-- and schema-based organization. Every clause has a production reason.

CREATE SCHEMA IF NOT EXISTS billing;

-- Customers: surrogate PK, soft-delete via deleted_at, partial unique on active email.
CREATE TABLE billing.customers (
  id           BIGSERIAL    PRIMARY KEY,
  email        TEXT         NOT NULL,
  name         TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,                         -- NULL = active; set = soft-deleted
  -- Partial unique: only one active customer per email (deleted customers can reuse).
  CONSTRAINT customers_email_unique UNIQUE (email) WHERE deleted_at IS NULL,
  CONSTRAINT customers_email_format CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX customers_active_idx ON billing.customers(id) WHERE deleted_at IS NULL;

-- Invoices: FK to customers with RESTRICT (don't delete a customer with invoices).
-- Generated column for due date; CHECK for business rules.
CREATE TABLE billing.invoices (
  id            BIGSERIAL    PRIMARY KEY,
  customer_id   BIGINT       NOT NULL,
  invoice_num   TEXT         NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT         NOT NULL DEFAULT 'USD',
  issued_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Generated STORED: due_at = issued_at + 30 days. Recomputed if issued_at changes.
  due_at        TIMESTAMPTZ  GENERATED ALWAYS AS (issued_at + interval '30 days') STORED,
  paid_at       TIMESTAMPTZ,
  metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Named constraints for readable errors and targeted drops.
  CONSTRAINT invoices_customer_fk
    FOREIGN KEY (customer_id) REFERENCES billing.customers(id)
    ON DELETE RESTRICT,
  CONSTRAINT invoices_num_unique UNIQUE (customer_id, invoice_num),
  CONSTRAINT invoices_amount_positive CHECK (amount >= 0),
  -- Business rule: if paid, paid_at must be after issued_at.
  CONSTRAINT invoices_paid_after_issued
    CHECK (paid_at IS NULL OR paid_at >= issued_at)
);

-- Index FK column — FK constraint does NOT auto-create an index.
-- Without this, ON DELETE RESTRICT scans all invoices for each customer delete.
CREATE INDEX invoices_customer_id_idx ON billing.invoices(customer_id);

-- Invoice items: composite PK (natural junction), cascade delete with parent.
CREATE TABLE billing.invoice_items (
  invoice_id  BIGINT       NOT NULL,
  line_num    INTEGER      NOT NULL,
  sku         TEXT         NOT NULL,
  qty         INTEGER      NOT NULL CHECK (qty > 0),
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  -- Generated: line total = qty * unit_price. Indexed for fast sums.
  line_total  NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  PRIMARY KEY (invoice_id, line_num),
  CONSTRAINT items_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES billing.invoices(id)
    ON DELETE CASCADE
);

CREATE INDEX items_invoice_id_idx ON billing.invoice_items(invoice_id);
```
::

## Anti-Pattern: ALTER TABLE ADD COLUMN DEFAULT on a Huge Table

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: VOLATILE default forces a full table rewrite even in PG 11+.
-- gen_random_uuid() is VOLATILE → each existing row needs a unique value computed
-- at rewrite time → ACCESS EXCLUSIVE lock for the entire duration.
ALTER TABLE billing.invoices
  ADD COLUMN ref_uuid UUID NOT NULL DEFAULT gen_random_uuid();
-- On a 500M-row table: 20+ minutes of total downtime.

-- ✅ CORRECT: staged rollout, no long lock.
-- Step 1: add nullable column (instant, metadata-only).
ALTER TABLE billing.invoices ADD COLUMN ref_uuid UUID;

-- Step 2: backfill in batches by id range (no long lock).
UPDATE billing.invoices SET ref_uuid = gen_random_uuid()
WHERE id BETWEEN 1 AND 100000 AND ref_uuid IS NULL;
-- Repeat for next batches...

-- Step 3: set default for future inserts (metadata-only).
ALTER TABLE billing.invoices ALTER COLUMN ref_uuid SET DEFAULT gen_random_uuid();

-- Step 4: add NOT NULL via NOT VALID + VALIDATE (light lock).
ALTER TABLE billing.invoices ADD CONSTRAINT invoices_ref_uuid_nn
  CHECK (ref_uuid IS NOT NULL) NOT VALID;
ALTER TABLE billing.invoices VALIDATE CONSTRAINT invoices_ref_uuid_nn;
```
::

## 💡 Tips & Tricks

- **Idiom — name every constraint**: `CONSTRAINT invoices_customer_fk FOREIGN KEY ...` gives readable errors (`violates foreign key constraint "invoices_customer_fk"`) and lets you `DROP CONSTRAINT` by name. Auto-names like `invoices_customer_id_fkey` are brittle across schema diff tools.
- **Performance — PG 11+ ADD COLUMN DEFAULT constant is metadata-only**: adding `status TEXT NOT NULL DEFAULT 'active'` to a billion-row table is instant. PG stores the default in `pg_attrdef` and returns it for existing rows on read. But `NOT NULL` with a VOLATILE default still requires a rewrite — use the nullable + backfill + NOT VALID pattern for zero-downtime.
- **Idiom — NOT VALID + VALIDATE for zero-downtime constraints**: `ADD CONSTRAINT ... NOT VALID` is metadata-only (no scan). `VALIDATE CONSTRAINT` scans with `SHARE UPDATE EXCLUSIVE` (concurrent reads/writes continue). Standard for adding FK/CHECK to large tables.
- **Idiom — TRUNCATE over DELETE for whole-table clears**: `TRUNCATE` is O(1) (unlinks data file, no per-row WAL, no triggers). `DELETE FROM table` is O(N), creates dead tuples, and bloats until VACUUM. Reserve `DELETE` for partial removals.
- **Idiom — UNLOGGED for ephemeral data**: `CREATE UNLOGGED TABLE` skips WAL → 2-3x faster writes. Trade-off: truncated on crash. Ideal for caches, ETL staging, derived tables that can be rebuilt.
- **Idiom — generated columns for indexed expressions**: `lower(email) GENERATED ALWAYS AS (lower(email)) STORED` + a unique index on it gives case-insensitive uniqueness without repeating `lower()` in every query.
- **Portability — `CREATE TABLE LIKE INCLUDING ALL` is PG-specific**: MySQL has `LIKE` (no options); SQLite lacks it. For portable structure copying, generate DDL from `information_schema`.

## ⚠️ Edge Cases & Gotchas

- **`SERIAL`/`BIGSERIAL` are conveniences, not types**: they create a sequence + column default + NOT NULL. The column's actual type is `integer`/`bigint`. The sequence survives even if you drop the default. Prefer `GENERATED ... AS IDENTITY` (standard SQL, PG 10+) going forward — it's tied to the column and dropped with it.
- **VOLATILE defaults force rewrite**: `DEFAULT now()` is STABLE (metadata-only in PG 11+), but `DEFAULT gen_random_uuid()` is VOLATILE → full table rewrite even in PG 11+. Use the nullable + backfill + `SET DEFAULT` + NOT VALID pattern.
- **`ALTER COLUMN ... TYPE` always rewrites** (unless binary-compatible): `int` → `bigint` rewrites. On large tables, use the staged new-column + backfill + swap pattern.
- **`DROP TABLE CASCADE` is nuclear**: it silently drops every view, materialized view, and FK referencing the table. Always check `pg_depend` first. A `CASCADE` on a central table can drop dozens of views you didn't intend to lose.
- **`TRUNCATE` doesn't reset sequences by default**: use `RESTART IDENTITY` to reset `SERIAL` sequences. Without it, new inserts continue from the last sequence value, creating a gap.
- **`TRUNCATE CASCADE` truncates dependent tables**: if `invoice_items` has a FK to `invoices`, `TRUNCATE invoices CASCADE` also empties `invoice_items` — silently. Always check the FK graph.
- **`DROP COLUMN` doesn't reclaim space immediately**: PG marks the column dead (fast) but physical space is only reclaimed by `VACUUM FULL` (or `pg_repack`). Disk usage doesn't drop right after `DROP COLUMN` on a large table.
- **Temp tables shadow permanent tables**: temp tables are created in `pg_temp`, which is searched first in `search_path`. `CREATE TEMP TABLE users (...)` shadows `public.users` for the session — a source of "why isn't my data persisting" confusion.
- **`CREATE TABLE AS` doesn't copy constraints**: it copies columns and data but no PK, FK, UNIQUE, CHECK, or defaults. Add them afterward, or use `LIKE ... INCLUDING ALL` + `INSERT` for structure + data.
- **Generated columns can't reference other tables**: `GENERATED ALWAYS AS (...)` can only use columns of the same row, no subqueries, no non-immutable functions. For cross-table derivations, use a view or trigger.
- **`IF NOT EXISTS` masks schema drift**: `CREATE TABLE IF NOT EXISTS x (...)` is a no-op if the table exists — even if the existing table has different columns. It's idempotent, not a correctness check.

## 🧠 Spot the Bug

A team runs this migration on a 500M-row `events` table and the database locks up for 20 minutes:

::code-wrapper{language="sql"}
```sql
ALTER TABLE events
  ADD COLUMN ref_uuid UUID NOT NULL DEFAULT gen_random_uuid();
```
::

What went wrong, and how should they have done it?

<details>
<summary>Answer</summary>

`gen_random_uuid()` is a `VOLATILE` function — each existing row needs a unique value computed at rewrite time. Even in PG 11+ (which made constant defaults metadata-only), VOLATILE defaults force a full table rewrite under an `ACCESS EXCLUSIVE` lock. On 500M rows, that's 20+ minutes of total downtime (no reads, no writes).

The fix is a staged, lock-light rollout:

::code-wrapper{language="sql"}
```sql
-- Step 1: add nullable column (metadata-only, instant — no default, no rewrite).
ALTER TABLE events ADD COLUMN ref_uuid UUID;

-- Step 2: backfill in batches by id range (short locks, concurrent reads continue).
UPDATE events SET ref_uuid = gen_random_uuid()
WHERE id BETWEEN 1 AND 100000 AND ref_uuid IS NULL;
-- Repeat for subsequent id ranges...

-- Step 3: set default for future inserts (metadata-only).
ALTER TABLE events ALTER COLUMN ref_uuid SET DEFAULT gen_random_uuid();

-- Step 4: enforce NOT NULL via NOT VALID + VALIDATE (light lock, no rewrite).
ALTER TABLE events ADD CONSTRAINT events_ref_uuid_nn
  CHECK (ref_uuid IS NOT NULL) NOT VALID;
ALTER TABLE events VALIDATE CONSTRAINT events_ref_uuid_nn;
```
::

**The lesson**: `NOT NULL` + `VOLATILE` default on a new column with existing rows forces a full table rewrite under an exclusive lock. For zero-downtime, add nullable → backfill in batches → set default → add NOT NULL via `NOT VALID` + `VALIDATE`.

</details>