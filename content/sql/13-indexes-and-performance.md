# 13 — Indexes & Performance

Indexes are the single most important performance tool in a database. The difference between a query that takes 10 seconds and one that takes 1 millisecond is almost always an index. This chapter covers when to index, which types to use, and when indexes hurt.

## What an Index Does

Without an index, finding rows matching a condition requires a **sequential scan** — reading every row in the table (O(N)). An index is a separate data structure that lets the database find matching rows directly (O(log N)), then fetch just those rows.

::code-wrapper{language="sql"}
```sql
-- Without an index: scans all 10M rows
SELECT * FROM orders WHERE customer_id = 42;

-- With an index: reads ~a few index pages, then ~a few heap pages
CREATE INDEX orders_customer_id_idx ON orders(customer_id);
SELECT * FROM orders WHERE customer_id = 42;
```
::

## B-Tree Indexes (the default)

PostgreSQL's default index type is a **B-tree** — a balanced tree keyed by the indexed column(s). It supports:

- Equality (`=`) and range (`<`, `<=`, `>`, `>=`, `BETWEEN`) lookups.
- Sorting (`ORDER BY col`) — the index is pre-sorted, so the planner can read rows in order without sorting.
- Prefix matching on strings (`LIKE 'prefix%'` — but not `LIKE '%middle'`).
- `IS NULL` / `IS NOT NULL` (PostgreSQL B-trees include NULLs; some engines don't).

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_customer_id_idx ON orders(customer_id);
CREATE INDEX orders_ordered_on_idx ON orders(ordered_on);
CREATE INDEX users_email_lower_idx ON users(lower(email));   -- expression index
``
::

## Composite (Multi-Column) Indexes

A composite index covers multiple columns. It's useful when queries filter on multiple columns together, and for "covering" queries.

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_customer_date_idx ON orders(customer_id, ordered_on);

-- Uses the index (leftmost prefix matches)
SELECT * FROM orders WHERE customer_id = 42;
SELECT * FROM orders WHERE customer_id = 42 AND ordered_on >= '2024-01-01';

-- Can use the index for customer_id, but NOT for ordered_on alone (leftmost rule)
SELECT * FROM orders WHERE ordered_on >= '2024-01-01';   -- index not useful here
```
::

### The Leftmost-Prefix Rule

A composite index `(a, b, c)` can be used for:
- `WHERE a = ?`
- `WHERE a = ? AND b = ?`
- `WHERE a = ? AND b = ? AND c = ?`

It **cannot** be used (efficiently) for:
- `WHERE b = ?` (skips `a`)
- `WHERE c = ?` (skips `a` and `b`)

Order columns by:
1. **Equality columns first** (`WHERE customer_id = ?`).
2. **Range columns last** (`WHERE ordered_on >= ?`) — a range "uses up" the index for columns after it.
3. **Selectivity** — high-cardinality columns first (more discriminating).

For `WHERE customer_id = ? AND ordered_on >= ?`, `(customer_id, ordered_on)` is optimal. The reverse `(ordered_on, customer_id)` can't efficiently combine both (the range on `ordered_on` blocks using `customer_id`).

## Covering Indexes (INCLUDE)

A **covering index** includes all columns a query needs, so the database can answer from the index alone — no heap fetch:

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_cust_date_amt_idx
  ON orders(customer_id, ordered_on) INCLUDE (amount);

-- This query can be answered entirely from the index (index-only scan)
SELECT customer_id, ordered_on, amount
FROM orders
WHERE customer_id = 42;
```
::

`INCLUDE` columns aren't part of the index key (so they don't affect ordering or uniqueness), but they're stored in the index leaf pages for covering scans. Index-only scans are dramatically faster than heap fetches, especially on large tables.

## Partial Indexes

A partial index only includes rows matching a `WHERE` — smaller, faster, and targets a specific query pattern:

::code-wrapper{language="sql"}
```sql
-- Index only unshipped orders (a small, hot subset)
CREATE INDEX orders_unshipped_idx
  ON orders(customer_id) WHERE status = 'unshipped';

-- Index only active users
CREATE INDEX users_active_email_idx
  ON users(email) WHERE active = true;
```
::

Partial indexes are ideal for "the small interesting subset" pattern — unshipped orders, pending approvals, active sessions — where the full index would be mostly wasted on the cold majority.

## Expression Indexes

Index the result of an expression — useful for case-insensitive lookups, computed columns, JSON keys:

::code-wrapper{language="sql"}
```sql
-- Case-insensitive email lookup
CREATE INDEX users_email_lower_idx ON users(lower(email));
SELECT * FROM users WHERE lower(email) = 'alice@example.com';

-- Index a JSON field
CREATE INDEX events_payload_type_idx ON events((payload->>'type'));
SELECT * FROM events WHERE payload->>'type' = 'click';
``
::

The query must use the **exact same expression** as the index. `WHERE lower(email) = ...` uses the index; `WHERE email = ...` does not.

## Index Types

| Type | Use case |
|---|---|
| **B-tree** (default) | Equality, range, sorting. The workhorse. |
| **Hash** (PostgreSQL) | Equality only (`=`). Faster than B-tree for pure equality, but historically not crash-safe / not replicated. PostgreSQL 10+ makes them WAL-logged. Rare. |
| **GiST** (PostgreSQL) | Geometric, range, full-text search, custom operators. Used by `EXCLUDE`, PostGIS, `pg_trgm`. |
| **GIN** (PostgreSQL) | Composite values: arrays, JSONB, full-text `tsvector`. Fast containment (`@>`, `?`, `@@`). |
| **SP-GiST** (PostgreSQL) | Space-partitioned GiST — for non-balanced structures (tries, quadtrees). |
| **BRIN** (PostgreSQL) | Block Range Index — tiny, stores min/max per block range. For huge, naturally-ordered tables (time-series). |

### GIN for JSONB and arrays

::code-wrapper{language="sql"}
```sql
-- Index every key/path in a JSONB column
CREATE INDEX events_payload_gin ON events USING gin(payload);

-- Now containment queries use the index
SELECT * FROM events WHERE payload @> '{"type": "click"}';
SELECT * FROM events WHERE payload ? 'user_id';
``
::

`@>` (contains) is the most JSONB-friendly operator for index use. `->>` (text extraction) needs an expression index on the specific path.

### BRIN for time-series

::code-wrapper{language="sql"}
```sql
-- Tiny index on a billion-row time-ordered table
CREATE INDEX logs_ts_brin ON logs USING brin(ts);
``
::

BRIN stores only min/max per block range (~128 pages). For naturally-ordered data (time-series logs), a BRIN index is a few KB vs. GB for a B-tree, and range queries skip entire block ranges. Useless for random data.

## When Indexes Hurt

Indexes aren't free:

1. **Write overhead**: every `INSERT`/`UPDATE`/`DELETE` updates every index on the table. A table with 10 indexes takes ~10x longer to write than one with 0.
2. **Storage**: indexes take disk space — sometimes more than the table.
3. **Planner confusion**: too many indexes can confuse the planner (more plans to consider) and slow down planning.
4. **Unused indexes**: an index that's never used for reads still slows writes. Find and drop them:

::code-wrapper{language="sql"}
```sql
-- PostgreSQL: find unused indexes (since last stats reset)
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
``
::

**Rule of thumb**: index for the queries you actually run, not every column you *might* filter on. Drop indexes that haven't been used in a representative period.

## Index-Only Scans and Visibility Map

PostgreSQL can answer a query from the index alone (no heap fetch) if:

1. All needed columns are in the index (key or `INCLUDE`).
2. The **visibility map** says all tuples on the relevant pages are visible to all transactions (no pending updates).

The visibility map is maintained by `VACUUM`. A table that hasn't been vacuumed recently may not get index-only scans even with a covering index. Run `VACUUM` (autovacuum usually handles this) to keep the visibility map fresh.

## Indexes and ORDER BY

An index on the sort column lets the planner skip a sort — it reads rows in index order:

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_date_idx ON orders(ordered_on);
SELECT * FROM orders ORDER BY ordered_on;   -- index scan, no sort
SELECT * FROM orders ORDER BY ordered_on DESC;   -- backward index scan, no sort
``
::

For `LIMIT` + `ORDER BY` (top-N queries), an index is especially valuable — the planner reads the first N rows in order and stops, vs. sorting the whole table.

## Indexes and NULLs

PostgreSQL B-tree indexes include NULL entries by default. This means:

- `WHERE col IS NULL` can use an index.
- `WHERE col IS NOT NULL` can use an index.

You can exclude NULLs from an index with a partial index:

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_customer_notnull ON orders(customer_id) WHERE customer_id IS NOT NULL;
``
::

## Unique Indexes

A unique index enforces uniqueness (same as a `UNIQUE` constraint, which is implemented as a unique index):

::code-wrapper{language="sql"}
```sql
CREATE UNIQUE INDEX users_email_unique ON users(email);
-- Equivalent to: ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
``
::

Use `UNIQUE` constraint for schema-defined rules; use `CREATE UNIQUE INDEX` for partial/case-insensitive uniqueness that a constraint can't express:

::code-wrapper{language="sql"}
```sql
-- Case-insensitive unique email
CREATE UNIQUE INDEX users_email_ci_unique ON users(lower(email));

-- Only one active session per user
CREATE UNIQUE INDEX sessions_active_one ON sessions(user_id) WHERE active = true;
``
::

## Concurrent Index Creation

`CREATE INDEX` locks the table against writes. `CREATE INDEX CONCURRENTLY` builds the index without blocking writes (slower, but zero downtime):

::code-wrapper{language="sql"}
```sql
-- Doesn't block INSERT/UPDATE/DELETE
CREATE INDEX CONCURRENTLY orders_customer_idx ON orders(customer_id);
``
::

`CONCURRENTLY` takes longer (two table scans) and can fail (leaving an invalid index — drop and retry). Use it for production migrations. It can't run inside a transaction.

## 💡 Tips & Tricks

- **Idiom**: before adding an index, run `EXPLAIN` on the target query — it tells you whether the query is slow because of a missing index or because of a bad plan (e.g., a seq scan that's actually fine for a small table). Adding an index that the planner doesn't use just slows writes for nothing.
- **Performance**: a **covering index** (`INCLUDE` the columns the query selects) can turn a 100ms query into a 1ms query by enabling an index-only scan — the heap fetch is often the dominant cost, and eliminating it is the single biggest index optimization.
- **Idiom**: prefer **one well-designed composite index** over several single-column indexes — `(customer_id, ordered_on)` serves `WHERE customer_id = ? AND ordered_on >= ?` and `WHERE customer_id = ?` and `ORDER BY customer_id, ordered_on`, replacing three separate indexes with one.
- **Performance**: for "small hot subset" queries (`WHERE status = 'pending'`), use a **partial index** — it's a fraction of the size of a full index, stays hot in cache, and the planner prefers it when the predicate matches.
- **Idiom**: use `CREATE INDEX CONCURRENTLY` for any index added to a production table — it doesn't block writes, and the brief extra build time is worth the zero-downtime. Just remember it can't run in a transaction and may leave an invalid index if it fails (drop with `DROP INDEX CONCURRENTLY` and retry).

## ⚠️ Edge Cases & Gotchas

- **`LIKE '%middle'` can't use a B-tree index**: leading wildcards defeat the index (the tree is sorted by prefix). Use a `pg_trgm` GiST/GIN index for substring search, or full-text search (chapter 20).
- **`OR` conditions and indexes**: `WHERE a = 1 OR b = 2` may not use an index on `a` or `b` — the planner might do a seq scan instead. Rewrite as `UNION ALL` of two indexed queries, or use a bitmap OR (PostgreSQL does this automatically if both columns are indexed).
- **Type mismatches defeat indexes**: `WHERE id = '42'` (string vs integer column) may not use the index on `id` — the planner applies a cast function per row, which isn't indexable. Match the column type, or use an expression index on the cast.
- **Functions defeat indexes**: `WHERE lower(email) = 'x'` doesn't use an index on `email` — the function is applied per row. Create an expression index on `lower(email)`, or use a case-insensitive collation.
- **`!=` and `<>` rarely use indexes**: B-trees are good at finding matching values, not "all values except this one" (which is most of the table). `WHERE status != 'deleted'` usually seq-scans. A partial index on the *complement* (`WHERE status != 'deleted'`) or a rewrite (`status IN ('active', 'pending')`) helps.
- **Too many indexes slow writes**: every index adds write overhead. A high-write table with 15 indexes may spend most of its time updating indexes. Audit with `pg_stat_user_indexes` and drop unused ones.
- **Index bloat**: `DELETE`/`UPDATE` leave dead tuples; indexes accumulate bloat. `VACUUM` reclaims dead tuples but doesn't shrink indexes — `VACUUM FULL` or `pg_repack` does. Monitor index size vs. table size.
- **`CREATE INDEX CONCURRENTLY` can fail silently**: if it fails (e.g., a unique violation during build), it leaves an **invalid** index (`pg_index.indisvalid = false`) that the planner won't use but that still takes space and write overhead. Check for invalid indexes after concurrent builds: `SELECT ... FROM pg_index WHERE NOT indisvalid`.
- **Index-only scans need `VACUUM`**: the visibility map that enables index-only scans is maintained by `VACUUM`. A table with a covering index but stale visibility map does heap fetches anyway. Autovacuum usually handles this, but bulk-loaded tables may need a manual `VACUUM`.
- **Composite index leftmost rule**: `(a, b, c)` can't help `WHERE b = ?` alone. A common mistake is indexing `(tenant_id, created_at)` and expecting it to serve `WHERE created_at > ?` — it can't (skips `tenant_id`). Add a separate index on `created_at` if that query matters.
- **BRIN is useless on random data**: BRIN works on naturally-ordered data (time-series, append-only). On shuffled data, every block range has wide min/max, and BRIN skips nothing.

## 🧠 Spot the Bug

This query is slow despite an index on `email`. Why, and what's the fix?

::code-wrapper{language="sql"}
```sql
CREATE INDEX users_email_idx ON users(email);

SELECT * FROM users WHERE lower(email) = 'alice@example.com';
```
::

<details>
<summary>Answer</summary>

The index is on `email`, but the query filters on `lower(email)`. The planner can't use the `email` index because it's organized by the raw `email` value, not by `lower(email)` — applying `lower()` to every row's `email` and comparing is a per-row operation, not an index lookup. The planner falls back to a seq scan.

Two fixes:

```sql
-- Option 1: create an expression index on lower(email)
CREATE INDEX users_email_lower_idx ON users(lower(email));
-- The query WHERE lower(email) = '...' now uses this index.

-- Option 2: drop the lower() and query the raw column (if emails are stored consistently)
SELECT * FROM users WHERE email = 'Alice@example.com';
-- Uses the email index, but fails if the stored email is 'alice@...' (case mismatch).

-- Option 3: use a case-insensitive collation on the email column
ALTER TABLE users ALTER COLUMN email TYPE text COLLATE "und-x-icu";
-- Now email = 'ALICE@...' matches 'alice@...' and the plain index works.
```
::
The expression index (option 1) is the most common solution — it's explicit and works regardless of collation. The collation approach (option 3) is elegant but requires ICU support and affects all queries on the column.

**The lesson**: an index on `col` is not an index on `f(col)`. If you filter on a function of a column, index the function (expression index) or store the pre-computed value (generated column).

</details>

## Summary

You can now create B-tree, composite, covering (`INCLUDE`), partial, expression, GIN, and BRIN indexes; understand the leftmost-prefix rule, index-only scans, and when indexes hurt; and know to use `CONCURRENTLY` for production migrations. Next: modifying data with `INSERT`/`UPDATE`/`DELETE` and upsert.