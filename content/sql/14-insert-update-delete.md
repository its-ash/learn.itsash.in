# 14 — INSERT, UPDATE, DELETE

DML (Data Manipulation Language) modifies rows. This chapter is a code-first reference for `INSERT`, upsert (`ON CONFLICT`), `RETURNING`, join-based `UPDATE`/`DELETE`, and the batch patterns that keep large-table modifications from locking your database.

## INSERT

::code-wrapper{language="sql"}
```sql
-- Single row.
INSERT INTO customers (name, city) VALUES ('Alice', 'NYC');

-- Multi-row: one statement, multiple value tuples. Reduces parse + round-trip overhead.
-- PG sends one PARSE + N BINDs; the planner plans once, executes N times.
INSERT INTO customers (name, city) VALUES
  ('Bob', 'LA'),
  ('Carol', 'NYC'),
  ('Dave', 'Chicago');

-- All columns in declaration order (omit column list — fragile, avoid in app code).
-- If the table's column order changes, this INSERT breaks silently.
INSERT INTO customers VALUES (DEFAULT, 'Eve', 'Seattle');

-- Insert from a query (data migration, ETL, archiving).
INSERT INTO archive_orders
SELECT * FROM orders WHERE ordered_on < '2023-01-01';

-- Insert with default values for all columns.
INSERT INTO events DEFAULT VALUES;
```
::

### Omitting Columns with Defaults

- Column has `DEFAULT` and is omitted → default value is used.
- Column is nullable with no default and omitted → NULL is stored.
- Column is `NOT NULL` with no default and omitted → insert fails.

### Bulk Load: COPY

::code-wrapper{language="sql"}
```sql
-- For large loads (100K+ rows), COPY is 10-100x faster than INSERT.
-- COPY streams rows directly into the table, bypassing most per-row overhead.
COPY customers (name, city) FROM '/path/to/customers.csv' WITH (FORMAT csv, HEADER true);

-- COPY from stdin (application drivers support this):
COPY customers (name, city) FROM STDIN WITH (FORMAT csv);
-- Application sends rows terminated by \n, then \. to end.

-- For bulk INSERT from application code: batch 100-1000 rows per statement
-- to reduce network round-trips and parse overhead.
```
::

## INSERT ... ON CONFLICT (Upsert)

PostgreSQL's upsert — insert, or if a conflict occurs, update (or do nothing). This is the foundation of idempotent ingestion.

::code-wrapper{language="sql"}
```sql
-- DO UPDATE: on conflict on the email unique constraint, update the name.
-- EXCLUDED is the pseudo-table of "the row that was proposed for insertion."
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT (email)
DO UPDATE SET name = EXCLUDED.name;       -- overwrite with the new value

-- DO NOTHING: ignore the duplicate (silent skip, no error).
INSERT INTO subscribers (email) VALUES ('a@x.com')
ON CONFLICT (email) DO NOTHING;

-- Conflict on a specific constraint by name (not column):
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT ON CONSTRAINT users_email_key
DO UPDATE SET name = EXCLUDED.name;

-- Conflict on composite unique key:
INSERT INTO daily_stats (day, metric, value) VALUES ('2024-01-01', 'sales', 100)
ON CONFLICT (day, metric)
DO UPDATE SET value = EXCLUDED.value;

-- Conditional update: only update if the new value is different.
-- The WHERE clause on DO UPDATE acts as a guard — skip the update if it's false.
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT (email)
DO UPDATE SET name = EXCLUDED.name
WHERE users.name IS DISTINCT FROM EXCLUDED.name;
-- IS DISTINCT FROM handles NULL safely (NULL IS DISTINCT FROM NULL = false).
```
::

**Dialect differences**: MySQL uses `INSERT ... ON DUPLICATE KEY UPDATE` (similar but less flexible — no conflict target specification). SQLite uses `INSERT ... ON CONFLICT(col) DO UPDATE/NOTHING` (same syntax as PG).

### `EXCLUDED` vs Table Name

In `DO UPDATE SET col = ...`:
- `EXCLUDED.col` — the **new** value (from the `INSERT` that was proposed).
- `users.col` — the **existing** value (the row that won the conflict).

::code-wrapper{language="sql"}
```sql
-- Overwrite: set name to the new value from the INSERT.
DO UPDATE SET name = EXCLUDED.name;

-- Increment: add the new value to the existing value.
DO UPDATE SET count = counters.value + EXCLUDED.value;

-- Conditional: only update if the new value is larger.
DO UPDATE SET value = EXCLUDED.value
WHERE EXCLUDED.value > stats.value;
```
::

## RETURNING

PostgreSQL (and MySQL 8.0+, SQLite 3.35+) can return the inserted/updated/deleted rows — no second query needed.

::code-wrapper{language="sql"}
```sql
-- Get the auto-generated id back without a second query.
-- RETURNING is atomic with the INSERT — no race condition, no currval() fragility.
INSERT INTO customers (name, city) VALUES ('Frank', 'Boston')
RETURNING id, name;

-- Multiple rows: returns one row per inserted tuple.
INSERT INTO orders (customer_id, amount) VALUES (1, 50), (1, 75)
RETURNING id, amount;

-- UPDATE returning the changed rows.
UPDATE orders SET status = 'shipped' WHERE status = 'pending'
RETURNING id, status;

-- DELETE returning what was removed (audit trail).
DELETE FROM sessions WHERE expires_at < now()
RETURNING id, user_id;

-- Upsert with RETURNING: get the id whether it was an insert or a conflict.
-- DO UPDATE is required (DO NOTHING returns nothing on conflict).
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT (email) DO UPDATE SET name = users.name  -- no-op update
RETURNING id;
-- Returns the id of the existing row (if conflict) or the new row (if inserted).
```
::

`RETURNING` is invaluable for:
- Getting auto-generated IDs (`SERIAL`/`IDENTITY`) after insert — atomic, no `currval()` or `last_insert_id()`.
- Building audit trails (delete + `RETURNING` + insert to archive in one statement).
- Confirming what changed without a follow-up `SELECT`.

## UPDATE

::code-wrapper{language="sql"}
```sql
-- Update specific rows.
UPDATE orders SET status = 'shipped' WHERE id = 42;

-- Update multiple columns.
UPDATE customers SET city = 'LA', name = 'Bob' WHERE id = 2;

-- Atomic read-modify-write: the expression is evaluated against the current row value.
-- Safe at any isolation level — no lost update because the DB reads + writes in one step.
UPDATE products SET price = price * 1.1 WHERE category = 'electronics';

-- Update based on a join (PostgreSQL FROM clause).
-- The target table (orders) is NOT re-listed in FROM — it's already the target.
UPDATE orders o
SET status = c.status
FROM customers c
WHERE o.customer_id = c.id AND c.status = 'banned';

-- Update with a subquery (portable, standard SQL).
UPDATE orders
SET amount = (SELECT AVG(amount) FROM orders WHERE customer_id = 1)
WHERE id = 99;
```
::

### UPDATE without WHERE — The Classic Footgun

::code-wrapper{language="sql"}
```sql
-- ❌ This updates EVERY row in the table. Always include WHERE.
UPDATE orders SET status = 'shipped';  -- no WHERE → all rows updated

-- ✅ Safety check: run SELECT with the same WHERE first.
SELECT count(*) FROM orders WHERE status = 'pending' AND id = 42;
-- Confirm the count is what you expect, then:
UPDATE orders SET status = 'shipped' WHERE status = 'pending' AND id = 42;
```
::

### UPDATE FROM — Join-Based Updates (Portability)

::code-wrapper{language="sql"}
```sql
-- PostgreSQL: UPDATE ... FROM (the target table is NOT in FROM).
UPDATE orders o
SET status = c.status
FROM customers c
WHERE o.customer_id = c.id AND c.status = 'banned';

-- MySQL: UPDATE ... JOIN.
UPDATE orders o JOIN customers c ON o.customer_id = c.id
SET o.status = c.status
WHERE c.status = 'banned';

-- Standard SQL (portable): correlated subquery.
UPDATE orders o
SET status = (SELECT c.status FROM customers c WHERE c.id = o.customer_id)
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.status = 'banned');
```
::

## DELETE

::code-wrapper{language="sql"}
```sql
-- Delete specific rows.
DELETE FROM orders WHERE id = 42;

-- Delete all rows (slow — use TRUNCATE for whole-table).
-- Creates N dead tuples, fires triggers, WAL per row, bloats until VACUUM.
DELETE FROM orders;

-- Delete based on a join (PostgreSQL USING).
DELETE FROM orders o
USING customers c
WHERE o.customer_id = c.id AND c.status = 'banned';

-- Delete returning what was removed.
DELETE FROM sessions WHERE expires_at < now() RETURNING id, user_id;

-- ⚠️ DELETE without WHERE empties the table — same footgun as UPDATE.
```
::

### DELETE with Subquery vs USING

::code-wrapper{language="sql"}
```sql
-- PostgreSQL USING: join-based delete, concise.
DELETE FROM orders o
USING customers c
WHERE o.customer_id = c.id AND c.status = 'banned';

-- Standard SQL subquery (portable, but may be slower if planner can't optimize):
DELETE FROM orders
WHERE customer_id IN (SELECT id FROM customers WHERE status = 'banned');

-- ⚠️ If multiple `c` rows match one `o` row, `o` is still deleted ONCE (not multiple times).
--    USING is safe — no duplicate deletion.
```
::

### DELETE and Foreign Keys

Deleting a row referenced by a FK triggers the `ON DELETE` action:
- `RESTRICT`/`NO ACTION` — delete fails if referencing rows exist.
- `CASCADE` — referencing rows are deleted too (propagates through the cascade chain).
- `SET NULL` — referencing rows' FK column is set to NULL.

Plan deletions in dependency order (children first), or use `CASCADE` deliberately.

## Complex Implementation: Production Upsert for Real-Time Stats Aggregation

::code-wrapper{language="sql"}
```sql
-- Real-time stats aggregation: events arrive continuously, stats are upserted.
-- The same (day, metric) key may arrive hundreds of times per second.

CREATE TABLE daily_stats (
  day        DATE         NOT NULL,
  metric     TEXT         NOT NULL,
  count      BIGINT       NOT NULL DEFAULT 0,
  sum_value  NUMERIC(20,2) NOT NULL DEFAULT 0,
  max_value  NUMERIC(20,2),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (day, metric)
);

-- Upsert: on conflict, increment count, add to sum, take max, update timestamp.
-- EXCLUDED.count is the proposed insert value (the batch's count for this key).
-- stats.count is the existing row's value.
-- IS DISTINCT FROM guards against pointless updates (reduces write amplification).
INSERT INTO daily_stats (day, metric, count, sum_value, max_value)
VALUES ('2024-01-01', 'sales', 1, 150.00, 150.00)
ON CONFLICT (day, metric)
DO UPDATE SET
  count      = daily_stats.count + EXCLUDED.count,
  sum_value  = daily_stats.sum_value + EXCLUDED.sum_value,
  max_value  = LEAST(daily_stats.max_value, EXCLUDED.max_value),
  updated_at = now()
WHERE EXCLUDED.count > 0;  -- skip no-op upserts

-- Join-based UPDATE for denormalized data sync:
-- Sync the customer's total_orders and total_amount into a denormalized cache.
UPDATE customer_stats cs
SET
  total_orders  = agg.order_count,
  total_amount  = agg.total_amount,
  updated_at    = now()
FROM (
  SELECT customer_id,
         count(*)   AS order_count,
         sum(amount) AS total_amount
  FROM orders
  WHERE ordered_on >= now() - interval '1 day'
  GROUP BY customer_id
) agg
WHERE cs.customer_id = agg.customer_id;
-- The subquery aggregates once; the UPDATE joins to it by customer_id.
-- Without the subquery (correlated subquery per row), this would be O(N*M).
```
::

## Complex Implementation: Batched DELETE for Large Tables

::code-wrapper{language="sql"}
```sql
-- Deleting millions of rows in one statement holds locks for a long time,
-- creates millions of dead tuples, and can block VACUUM.
-- Batch it: delete N rows per statement, repeat until no rows are deleted.

-- PostgreSQL doesn't support DELETE ... LIMIT (MySQL does).
-- Use the id IN (SELECT ... LIMIT n) pattern.

DO $$
DECLARE
  deleted_count INTEGER;
  batch_size    INTEGER := 10000;
BEGIN
  LOOP
    DELETE FROM logs
    WHERE created_at < '2023-01-01'
      AND id IN (
        SELECT id FROM logs
        WHERE created_at < '2023-01-01'
        ORDER BY id
        LIMIT batch_size
      );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXIT WHEN deleted_count = 0;
    PERFORM pg_sleep(0.01);  -- brief pause to let other queries proceed
  END LOOP;
END $$;

-- For updates, use a CTE to select IDs to update, then update in batches:
WITH batch AS (
  SELECT id FROM orders
  WHERE status = 'pending' AND created_at < '2024-01-01'
  ORDER BY id
  LIMIT 10000
  FOR UPDATE SKIP LOCKED   -- skip rows locked by other workers
)
UPDATE orders SET status = 'expired'
WHERE id IN (SELECT id FROM batch);
```
::

## Anti-Pattern: Row-by-Row Updates in a Loop vs Set-Based UPDATE

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: row-by-row updates from application code.
-- N separate queries = N round-trips, N parses, N plan executions.
-- For 100K rows: 100K queries, ~100 seconds of round-trip overhead alone.

-- Pseudo-code (application layer):
-- for row in rows:
--     db.execute("UPDATE products SET price = ? WHERE id = ?", new_price, row.id)

-- ✅ CORRECT: set-based UPDATE — one query, one plan, one scan.
UPDATE products SET price = price * 1.1 WHERE category = 'electronics';
-- 100K rows updated in one statement, ~1 second.

-- ✅ If the new values are heterogeneous (different price per row), use a VALUES join:
UPDATE products p
SET price = v.new_price
FROM (VALUES
  (1, 10.99),
  (2, 25.50),
  (3, 7.00)
) AS v(id, new_price)
WHERE p.id = v.id;
-- One statement, N rows — the planner can use an index on p.id for the join.
```
::

## Anti-Pattern: UPDATE without WHERE

::code-wrapper{language="sql"}
```sql
-- ❌ This updates every row in the table — the classic footgun.
UPDATE orders SET status = 'shipped';

-- ✅ Always include WHERE. Run a SELECT with the same predicate first.
SELECT count(*) FROM orders WHERE status = 'pending';
-- Confirm the count, then:
UPDATE orders SET status = 'shipped' WHERE status = 'pending';

-- Some tools (mysql --safe-updates, psql with \set) block WHERE-less DML.
```
::

## 💡 Tips & Tricks

- **Idiom — `INSERT ... RETURNING id` over `currval()`/`last_insert_id()`**: `RETURNING` is atomic, works for multi-row inserts, returns all generated columns, and doesn't rely on session state. `currval()` can be polluted by triggers; `last_insert_id()` is per-connection.
- **Idiom — `ON CONFLICT` for idempotent upserts**: replay-safe ingestion (ETL, webhooks, retries) where the same row may arrive multiple times. `ON CONFLICT (key) DO UPDATE SET ... = EXCLUDED...` is the standard pattern.
- **Performance — batch large `UPDATE`/`DELETE`**: 10K rows per batch with `LIMIT` subquery + `FOR UPDATE SKIP LOCKED`. Keeps locks short, allows concurrent queries, and limits dead tuple creation per transaction.
- **Idiom — `INSERT FROM SELECT` for data migration**: `INSERT INTO archive SELECT * FROM source WHERE ...` — one statement, no application loop. Add `RETURNING` for audit.
- **Idiom — `UPDATE ... FROM` for join-based updates**: one statement, planner can use indexes on the join key. Avoid correlated subqueries when a join is clearer and faster.
- **Performance — `COPY` for bulk loads**: 10-100x faster than per-row `INSERT`. Stream from CSV or stdin, bypasses most per-row overhead.
- **Idiom — `IS DISTINCT FROM` for conditional upserts**: `WHERE users.name IS DISTINCT FROM EXCLUDED.name` skips no-op updates, reducing write amplification and WAL volume.
- **Idiom — run `SELECT` before `UPDATE`/`DELETE`**: preview affected rows with the same `WHERE` to catch "forgot WHERE" and "matches more than expected" before damage is done.

## ⚠️ Edge Cases & Gotchas

- **`UPDATE`/`DELETE` without `WHERE` affects all rows**: the classic footgun. Always include `WHERE`, or run a `SELECT` with the same predicate first. Some tools have a "safe updates" mode that blocks `WHERE`-less DML.
- **`ON CONFLICT` requires a unique index/constraint on the conflict target**: `ON CONFLICT (email)` needs a unique index on `email`. Without it: `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`.
- **`ON CONFLICT` partial index matching**: if you have a partial unique index (`WHERE active = true`), `ON CONFLICT (email) WHERE active = true` must match the partial index's predicate exactly. A plain `ON CONFLICT (email)` won't match a partial index.
- **`EXCLUDED` vs table name confusion**: `DO UPDATE SET col = EXCLUDED.col` (new value) vs `SET col = table.col` (existing value). `SET count = EXCLUDED.count` overwrites; `SET count = table.count + EXCLUDED.count` accumulates. Pick deliberately.
- **`RETURNING` on `DO NOTHING` returns nothing**: `ON CONFLICT DO NOTHING` returns only actually-inserted rows; conflicting rows don't appear. To get the existing row too, use the no-op `DO UPDATE SET col = table.col` trick.
- **`UPDATE ... FROM` ambiguity**: in PostgreSQL, `UPDATE orders o SET ... FROM customers c ...` — the target table can't be referenced in the `FROM` (it's already the target). Re-listing it errors.
- **`DELETE` with `LIMIT`**: PostgreSQL doesn't support `DELETE ... LIMIT` (MySQL does). For batched deletes in PG, use the `id IN (SELECT ... LIMIT n)` subquery pattern.
- **`UPDATE` of a PK column**: changing a primary key value updates every FK that references it (with `ON UPDATE CASCADE`). On large referenced tables, this is expensive and locks. Prefer surrogate keys that never change.
- **Cascading FK deletes ordering**: `ON DELETE CASCADE` propagates through the entire FK chain. Deleting a parent can delete thousands of descendants — plan the order or accept the cascade.
- **Large `DELETE` lock duration**: a single `DELETE` of millions of rows holds row locks for the entire duration. Other queries touching those rows block. Batch it.
- **Upsert on composite unique key**: `ON CONFLICT (col1, col2)` requires a unique index/constraint on `(col1, col2)` — not separate indexes on each column. The conflict target must match the index exactly.
- **`INSERT` into a view**: only simple views (single-table, no aggregation) are auto-updatable in PG. Complex views need `INSTEAD OF` triggers or `INSTEAD` rules.

## 🧠 Spot the Bug

A developer writes this to "increment a counter or create it if missing," but it occasionally overwrites the counter to 1 instead of incrementing. Why?

::code-wrapper{language="sql"}
```sql
INSERT INTO counters (key, value) VALUES ('visits', 1)
ON CONFLICT (key) DO UPDATE SET value = 1;
```
::

<details>
<summary>Answer</summary>

The `DO UPDATE SET value = 1` always sets `value` to 1, regardless of whether it was a conflict or an insert — it's not "set to 1 if inserting, increment if conflicting." The `1` is the literal from the `VALUES` clause, applied unconditionally on conflict.

The fix: use `EXCLUDED.value` (the proposed insert value) plus the existing value, or just increment the existing row:

::code-wrapper{language="sql"}
```sql
-- On conflict, increment the existing value by the proposed amount.
INSERT INTO counters (key, value) VALUES ('visits', 1)
ON CONFLICT (key) DO UPDATE SET value = counters.value + EXCLUDED.value;

-- Or, if you always want to add 1 on conflict regardless of the INSERT value:
INSERT INTO counters (key, value) VALUES ('visits', 1)
ON CONFLICT (key) DO UPDATE SET value = counters.value + 1;
```
::

`counters.value` is the existing row's value; `EXCLUDED.value` is the value from the `VALUES` clause (the "excluded" insert that lost the conflict). For an increment-on-conflict, you want the existing value plus the proposed increment — `counters.value + EXCLUDED.value`.

**The lesson**: `DO UPDATE SET col = <literal>` overwrites; `DO UPDATE SET col = table.col + EXCLUDED.col` accumulates. Always reference `EXCLUDED` for the proposed values and the table name for existing values; don't restate the literal.

</details>