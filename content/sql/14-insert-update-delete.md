# 14 — INSERT, UPDATE, DELETE

DML (Data Manipulation Language) modifies rows. This chapter covers the three core operations, `RETURNING`, upsert, and the cascade interactions that catch beginners.

## INSERT

::code-wrapper{language="sql"}
```sql
-- Basic insert
INSERT INTO customers (name, city) VALUES ('Alice', 'NYC');

-- Multiple rows
INSERT INTO customers (name, city) VALUES
  ('Bob', 'LA'),
  ('Carol', 'NYC'),
  ('Dave', 'Chicago');

-- All columns in order (omit column list — fragile, avoid in app code)
INSERT INTO customers VALUES (DEFAULT, 'Eve', 'Seattle');

-- Insert from a query
INSERT INTO archive_orders
SELECT * FROM orders WHERE ordered_on < '2023-01-01';

-- Insert with default values
INSERT INTO events DEFAULT VALUES;
```
::

### Omitting columns with defaults

If a column has a `DEFAULT` and is omitted from the `INSERT` list, the default is used. If a column is nullable with no default and omitted, it gets NULL. If a `NOT NULL` column with no default is omitted, the insert fails.

### `INSERT ... ON CONFLICT` (Upsert)

PostgreSQL's upsert — insert, or if a conflict occurs, update (or do nothing):

::code-wrapper{language="sql"}
```sql
-- On conflict on the email unique constraint, update the name
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT (email)
DO UPDATE SET name = EXCLUDED.name;

-- On conflict, do nothing (ignore the duplicate)
INSERT INTO subscribers (email) VALUES ('a@x.com')
ON CONFLICT (email) DO NOTHING;

-- Conflict on a specific constraint by name
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT ON CONSTRAINT users_email_key
DO UPDATE SET name = EXCLUDED.name;

-- Conflict on multiple columns (composite unique)
INSERT INTO daily_stats (day, metric, value) VALUES ('2024-01-01', 'sales', 100)
ON CONFLICT (day, metric)
DO UPDATE SET value = EXCLUDED.value;
```
::

`EXCLUDED` is the pseudo-table of "the row that was proposed for insertion" — use it to reference the new values in the `DO UPDATE`. The conflict target (`ON CONFLICT (col)`) must correspond to a unique index or constraint.

MySQL's equivalent is `INSERT ... ON DUPLICATE KEY UPDATE` (similar but less flexible). SQLite uses `INSERT ... ON CONFLICT(col) DO UPDATE/NOTHING` (same syntax as PostgreSQL).

### `RETURNING`

PostgreSQL (and MySQL 8.0+, SQLite 3.35+) can return the inserted/updated/deleted rows:

::code-wrapper{language="sql"}
```sql
-- Get the auto-generated id back without a second query
INSERT INTO customers (name, city) VALUES ('Frank', 'Boston')
RETURNING id, name;

-- Multiple rows
INSERT INTO orders (customer_id, amount) VALUES (1, 50), (1, 75)
RETURNING id, amount;

-- UPDATE returning the changed rows
UPDATE orders SET status = 'shipped' WHERE status = 'pending'
RETURNING id, status;

-- DELETE returning what was removed (audit trail)
DELETE FROM sessions WHERE expires_at < now()
RETURNING id, user_id;
``
::

`RETURNING` is invaluable for:
- Getting auto-generated IDs (`SERIAL`/`IDENTITY`) after insert.
- Building audit trails (delete + `RETURNING` + insert to archive).
- Confirming what changed without a follow-up `SELECT`.

## UPDATE

::code-wrapper{language="sql"}
```sql
-- Update specific rows
UPDATE orders SET status = 'shipped' WHERE id = 42;

-- Update multiple columns
UPDATE customers SET city = 'LA', name = 'Bob' WHERE id = 2;

-- Update based on a calculation
UPDATE products SET price = price * 1.1 WHERE category = 'electronics';

-- Update from another table (PostgreSQL FROM clause)
UPDATE orders o
SET status = c.status
FROM customers c
WHERE o.customer_id = c.id AND c.status = 'banned';

-- Update with a subquery
UPDATE orders
SET amount = (SELECT AVG(amount) FROM orders WHERE customer_id = 1)
WHERE id = 99;
``
::

### `UPDATE` without `WHERE` updates all rows

`UPDATE orders SET status = 'shipped'` (no `WHERE`) updates every row. Always include a `WHERE` unless you genuinely mean to update the whole table. Run a `SELECT` with the same `WHERE` first to see what will change.

### Update from a join (portability)

The `UPDATE ... FROM` syntax is PostgreSQL-specific. Standard SQL (and MySQL) uses a different form:

::code-wrapper{language="sql"}
```sql
-- MySQL
UPDATE orders o JOIN customers c ON o.customer_id = c.id
SET o.status = c.status
WHERE c.status = 'banned';

-- Standard SQL (correlated subquery — portable)
UPDATE orders o
SET status = (SELECT c.status FROM customers c WHERE c.id = o.customer_id)
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.status = 'banned');
``
::

## DELETE

::code-wrapper{language="sql"}
```sql
-- Delete specific rows
DELETE FROM orders WHERE id = 42;

-- Delete all rows (slow — use TRUNCATE for whole-table)
DELETE FROM orders;

-- Delete based on a join (PostgreSQL USING)
DELETE FROM orders o
USING customers c
WHERE o.customer_id = c.id AND c.status = 'banned';

-- Delete returning what was removed
DELETE FROM sessions WHERE expires_at < now() RETURNING id, user_id;
``
::

### `DELETE` without `WHERE` empties the table

Like `UPDATE`, a `WHERE`-less `DELETE` removes every row. It's slower than `TRUNCATE` (per-row work, WAL, triggers) and produces bloat until `VACUUM`. Use `TRUNCATE` for whole-table clears.

### `DELETE` and foreign keys

Deleting a row referenced by a FK triggers the `ON DELETE` action (chapter 12):
- `RESTRICT`/`NO ACTION` — the delete fails if referencing rows exist.
- `CASCADE` — referencing rows are deleted too.
- `SET NULL` — referencing rows' FK column is set to NULL.

Plan deletions in dependency order (children first), or use `CASCADE` deliberately.

## Batch Updates and Deletes

Updating/deleting millions of rows in one statement holds locks for a long time and bloats the table. Batch it:

::code-wrapper{language="sql"}
```sql
-- Delete in batches of 10000
DELETE FROM logs WHERE created_at < '2023-01-01'
  AND id IN (SELECT id FROM logs WHERE created_at < '2023-01-01' LIMIT 10000);
-- Repeat until no rows are deleted.
``
::

For updates, use a CTE to select the IDs to update, then update in batches. This keeps locks short and allows other queries to proceed between batches.

## Upsert Patterns Beyond ON CONFLICT

### "Insert or get the id" (common with `RETURNING`)

::code-wrapper{language="sql"}
```sql
-- Insert the user, or if the email exists, return the existing id — in one statement
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT (email) DO UPDATE SET name = users.name  -- no-op update to return the row
RETURNING id;
``
::

The `DO UPDATE SET name = users.name` is a no-op (sets the column to its current value), but it lets `RETURNING` fire even on the conflict path. Without `DO UPDATE`, a `DO NOTHING` conflict doesn't return the existing row.

## 💡 Tips & Tricks

- **Idiom**: always use `INSERT ... RETURNING id` instead of `INSERT` + `SELECT currval()` + `last_insert_id()` — `RETURNING` is atomic, works for multi-row inserts, returns all generated columns, and doesn't rely on session state.
- **Idiom**: for bulk loads, `INSERT INTO ... SELECT ... FROM` or `COPY` (PostgreSQL) is orders of magnitude faster than per-row inserts from application code — batch inserts (100–1000 rows per statement) reduce network round-trips and parse overhead.
- **Idiom**: use `ON CONFLICT (key) DO UPDATE SET ... = EXCLUDED...` for idempotent upserts — replay-safe ingestion (ETL, webhooks, retries) where the same row may arrive multiple times.
- **Performance**: batch large `UPDATE`/`DELETE` operations (e.g., 10k rows per batch with a `LIMIT` subquery) to keep locks short and avoid bloating the table — a single 10M-row `DELETE` holds locks for minutes and creates 10M dead tuples that autovacuum must clean.
- **Idiom**: run `SELECT ... WHERE <same condition>` before `UPDATE`/`DELETE` to preview affected rows — catches "I forgot the WHERE" and "the condition matches more than I expected" before damage is done.

## ⚠️ Edge Cases & Gotchas

- **`UPDATE`/`DELETE` without `WHERE` affects all rows**: the classic footgun. Always include a `WHERE`, or run a `SELECT` with the same predicate first. Some tools have a "safe updates" mode that blocks `UPDATE`/`DELETE` without `WHERE`.
- **`ON CONFLICT` requires a unique index/constraint on the conflict target**: `ON CONFLICT (email)` needs a unique index on `email`. Without it, "there is no unique or exclusion constraint matching the ON CONFLICT specification" error.
- **`EXCLUDED` vs the table name**: in `DO UPDATE SET col = EXCLUDED.col`, `EXCLUDED.col` is the *new* value (from the INSERT), while `users.col` is the *existing* value. `SET name = EXCLUDED.name` (overwrite) vs `SET count = users.count + EXCLUDED.count` (increment) — pick deliberately.
- **`RETURNING` on `DO NOTHING` returns nothing**: `ON CONFLICT DO NOTHING` returns only the actually-inserted rows; conflicting rows don't appear in `RETURNING`. To get the existing row too, use the no-op `DO UPDATE` trick.
- **`UPDATE ... FROM` ambiguity**: in PostgreSQL, `UPDATE orders o SET status = c.status FROM customers c ...` — the `orders` table can't be referenced in the `FROM` (it's already the target). Re-listing it errors.
- **`DELETE` with `USING` deletes matching rows once**: `DELETE FROM o USING c WHERE o.c_id = c.id` — if multiple `c` rows match one `o`, `o` is still deleted once (not multiple times). Safe.
- **`DELETE` and `LIMIT`**: PostgreSQL doesn't support `DELETE ... LIMIT` (MySQL does). For batched deletes in PostgreSQL, use the `id IN (SELECT ... LIMIT n)` subquery pattern.
- **`UPDATE` of a PK column**: changing a primary key value updates every FK that references it (with `ON UPDATE CASCADE`). On large referenced tables, this is expensive and locks. Prefer surrogate keys that never change.
- **`INSERT` into a view**: only simple views (single-table, no aggregation) are auto-updatable in PostgreSQL. Complex views need `INSTEAD OF` triggers or `INSTEAD` rules.
- **`ON CONFLICT` can't be used with `ON CONFLICT DO UPDATE` referencing columns not in the conflict target**: the `DO UPDATE SET` can reference any column, but the conflict detection is only on the named target.

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

```sql
-- On conflict, increment the existing value by the proposed amount
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

## Summary

You can now insert single/bulk rows, upsert with `ON CONFLICT`, return modified rows with `RETURNING`, update/delete with joins, and batch large modifications — while avoiding the "no WHERE" footgun and the `EXCLUDED` confusion. Next: transactions, isolation levels, and the concurrency hazards they prevent.