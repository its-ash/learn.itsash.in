# 13 — Indexes & Performance

Indexes are the single most important performance tool in a database. The difference between a 10-second query and a 1-millisecond query is almost always an index. This chapter is a code-first reference for B-tree, composite, covering, partial, expression, GIN/GiST/BRIN indexes, and the `EXPLAIN` skills to verify they're actually used.

## What an Index Does

Without an index, finding rows matching a condition requires a **sequential scan** — reading every row in the table, O(N). An index is a separate sorted data structure that lets the database find matching rows in O(log N), then fetch just those heap tuples.

::code-wrapper{language="sql"}
```sql
-- Without an index: sequential scan reads all 10M heap pages.
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
-- Seq Scan on orders  (cost=0.00..183334.00 rows=5263 width=...)

-- With an index: B-tree lookup → ~3-4 index pages → ~a few heap pages.
CREATE INDEX orders_customer_id_idx ON orders(customer_id);
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
-- Index Scan using orders_customer_id_idx on orders  (cost=0.43..63.27 rows=53 width=...)

-- The cost difference: 183334 → 63. That's 2900x cheaper.
```
::

## B-Tree Indexes (the default)

PostgreSQL's default index type is a **B-tree** — a balanced tree keyed by the indexed column(s). Each leaf page points to heap tuples (CTIDs: `block_id, offset`). It supports:

- **Equality** (`=`, `IS NULL`): tree descent to the leaf.
- **Range** (`<`, `<=`, `>`, `>=`, `BETWEEN`): scan leaves left/right from the match point.
- **Sorting** (`ORDER BY col`): the index is pre-sorted, so the planner reads rows in order without a sort node.
- **Prefix matching** (`LIKE 'prefix%'`): the tree is sorted lexicographically, so prefix matches are a range scan. `LIKE '%middle'` defeats the index (no fixed prefix).
- **NULLs**: PG B-trees include NULL entries (some engines don't) — `IS NULL` / `IS NOT NULL` are indexable.

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_customer_id_idx  ON orders(customer_id);
CREATE INDEX orders_ordered_on_idx   ON orders(ordered_on);
CREATE INDEX users_email_lower_idx   ON users(lower(email));  -- expression index
```
::

## Composite (Multi-Column) Indexes

A composite index covers multiple columns. It's useful when queries filter on multiple columns together, and for "covering" queries.

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_customer_date_idx ON orders(customer_id, ordered_on);

-- ✅ Uses the index (leftmost prefix matches):
SELECT * FROM orders WHERE customer_id = 42;
SELECT * FROM orders WHERE customer_id = 42 AND ordered_on >= '2024-01-01';

-- ❌ Cannot use the index efficiently (skips customer_id — leftmost rule):
SELECT * FROM orders WHERE ordered_on >= '2024-01-01';
-- Planner does a seq scan or a backward full index scan.

-- ✅ Can use the index for ORDER BY matching the index order:
SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on;
-- Index scan returns rows already sorted by ordered_on — no Sort node.
```
::

### The Leftmost-Prefix Rule

A composite index `(a, b, c)` can be used for:
- `WHERE a = ?` — uses `a`
- `WHERE a = ? AND b = ?` — uses `a, b`
- `WHERE a = ? AND b = ? AND c = ?` — uses `a, b, c`
- `WHERE a = ? AND c = ?` — uses `a` only (skips `b`, can't use `c`)

It **cannot** be used efficiently for:
- `WHERE b = ?` — skips `a`
- `WHERE c = ?` — skips `a` and `b`

### Column Ordering Strategy

1. **Equality columns first** (`WHERE customer_id = ?`).
2. **Range columns last** (`WHERE ordered_on >= ?`) — a range "uses up" the index for columns after it.
3. **Sort columns** after equality, before or at range.
4. **Selectivity** — high-cardinality columns first (more discriminating).

For `WHERE customer_id = ? AND ordered_on >= ?`, `(customer_id, ordered_on)` is optimal. The reverse `(ordered_on, customer_id)` can't efficiently combine both (the range on `ordered_on` blocks using `customer_id` as a seek key).

## Covering Indexes (INCLUDE)

A **covering index** includes all columns a query needs, so the database can answer from the index alone — no heap fetch (index-only scan).

::code-wrapper{language="sql"}
```sql
CREATE INDEX orders_cust_date_amt_idx
  ON orders(customer_id, ordered_on) INCLUDE (amount);

-- This query can be answered entirely from the index (index-only scan).
-- INCLUDE columns are stored in leaf pages but are NOT part of the sort key.
-- They don't affect uniqueness or ordering — they're payload for covering scans.
SELECT customer_id, ordered_on, amount
FROM orders
WHERE customer_id = 42;

-- EXPLAIN shows "Index Only Scan" — zero heap fetches.
-- The visibility map must mark the page as all-visible (maintained by VACUUM).
EXPLAIN SELECT customer_id, ordered_on, amount
FROM orders WHERE customer_id = 42;
-- Index Only Scan using orders_cust_date_amt_idx  (cost=0.43..8.45 rows=1 width=...)
```
::

Index-only scans are dramatically faster than heap fetches, especially on large tables where the heap pages aren't in cache. The heap fetch is often the dominant cost — eliminating it is the single biggest index optimization.

## Partial Indexes

A partial index only includes rows matching a `WHERE` — smaller, faster, stays hot in cache, and targets a specific query pattern.

::code-wrapper{language="sql"}
```sql
-- Index only unshipped orders (a small, hot subset of a 50M-row table).
-- The full index would be 50M entries; this one is maybe 50K entries → fits in RAM.
CREATE INDEX orders_unshipped_idx
  ON orders(customer_id) WHERE status = 'unshipped';

-- The query MUST match the index predicate for the planner to use it.
SELECT * FROM orders WHERE customer_id = 42 AND status = 'unshipped';
-- ✅ Uses partial index — predicate matches exactly.

SELECT * FROM orders WHERE customer_id = 42 AND status = 'shipped';
-- ❌ Cannot use the partial index — predicate doesn't match. Seq scan or other index.

-- Partial unique: only one active session per user.
CREATE UNIQUE INDEX sessions_active_one
  ON sessions(user_id) WHERE active = true;
```
::

Partial indexes are ideal for "the small interesting subset" pattern — unshipped orders, pending approvals, active sessions — where the full index would be mostly wasted on the cold majority.

## Expression Indexes

Index the result of an expression — useful for case-insensitive lookups, computed columns, JSON keys:

::code-wrapper{language="sql"}
```sql
-- Case-insensitive email lookup.
-- The index stores lower(email) as the key; the query must use the SAME expression.
CREATE INDEX users_email_lower_idx ON users(lower(email));
SELECT * FROM users WHERE lower(email) = 'alice@example.com';  -- ✅ uses index
SELECT * FROM users WHERE email = 'alice@example.com';          -- ❌ does NOT use index

-- Index a JSON field extraction.
-- ->> returns text; -> returns jsonb. Index the one your queries use.
CREATE INDEX events_payload_type_idx ON events((payload->>'type'));
SELECT * FROM events WHERE payload->>'type' = 'click';  -- ✅ uses index

-- ⚠️ The expression MUST be IMMUTABLE: same input → same output, always.
-- lower() is immutable. now() is stable (not immutable). Date functions that
-- depend on timezone are stable, not immutable — can't be used in expression indexes.
-- ❌ CREATE INDEX ... ON events (created_at::date);  -- ::date depends on DateStyle, not immutable
-- ✅ CREATE INDEX ... ON events ((created_at AT TIME ZONE 'UTC')::date);  -- immutable with explicit TZ
```
::

## Index Types

| Type | Use Case | Size | Write Overhead |
|---|---|---|---|
| **B-tree** (default) | Equality, range, sorting. The workhorse. | Medium | Medium |
| **Hash** (PG) | Equality only (`=`). | Small | Low |
| **GiST** (PG) | Geometric, range, full-text, custom ops. Used by `EXCLUDE`, PostGIS, `pg_trgm`. | Medium | Medium-High |
| **GIN** (PG) | Composite values: arrays, JSONB, `tsvector`. Fast containment (`@>`, `?`, `@@`). | Large | High (slow insert) |
| **SP-GiST** (PG) | Space-partitioned GiST — tries, quadtrees, non-balanced structures. | Medium | Medium |
| **BRIN** (PG) | Block Range Index — tiny, min/max per block range. For huge append-only tables. | Tiny | Very Low |

### GIN for JSONB and Arrays

::code-wrapper{language="sql"}
```sql
-- GIN index on JSONB: indexes every key/path in the column.
-- The default jsonb_path_ops operator class is smaller but only supports @>.
CREATE INDEX events_payload_gin ON events USING gin(payload jsonb_path_ops);

-- Containment query uses the index (most JSONB-friendly operator):
SELECT * FROM events WHERE payload @> '{"type": "click"}';
-- ✅ GIN index scan — fast.

-- Key existence:
SELECT * FROM events WHERE payload ? 'user_id';
-- ✅ GIN index scan (with default opclass, not jsonb_path_ops).

-- Text extraction — needs a separate expression index, NOT the GIN:
SELECT * FROM events WHERE payload->>'type' = 'click';
-- ❌ Does NOT use the GIN index. Create: CREATE INDEX ... ON events((payload->>'type'));

-- GIN on arrays:
CREATE INDEX tags_idx ON articles USING gin(tags);
SELECT * FROM articles WHERE tags @> ARRAY['postgres','indexing'];
-- ✅ GIN index scan — checks containment in the array.
```
::

### BRIN for Time-Series

::code-wrapper{language="sql"}
```sql
-- BRIN stores only min/max per block range (~128 pages, ~1MB default).
-- For naturally-ordered data (time-series logs), consecutive blocks have
-- narrow ranges → range queries skip entire block ranges.
-- A BRIN index on a billion-row table is a few KB vs. GB for a B-tree.
CREATE INDEX logs_ts_brin ON logs USING brin(ts) WITH (pages_per_range = 32);

SELECT * FROM logs WHERE ts BETWEEN '2024-01-01' AND '2024-01-02';
-- BRIN index scan: skips block ranges whose min/max don't overlap the query range.
-- For random data, every block has wide min/max → BRIN skips nothing → useless.
```
::

## When Indexes Hurt

Indexes aren't free. Every index adds overhead:

1. **Write amplification**: every `INSERT`/`UPDATE`/`DELETE` updates every index on the table. A table with 10 indexes takes ~10x longer to write than one with 0. `HOT` (Heap-Only Tuple) updates can skip index updates if no indexed column changed and the new tuple fits on the same page.
2. **Storage**: indexes take disk space — sometimes more than the table. GIN indexes on JSONB can be 2-3x the table size.
3. **Planner overhead**: too many indexes give the planner more plans to consider, slowing planning.
4. **Unused indexes**: an index never used for reads still slows writes. Find and drop them:

::code-wrapper{language="sql"}
```sql
-- PostgreSQL: find unused indexes (since last stats reset).
-- idx_scan = 0 means the planner never chose this index for any query.
SELECT relname      AS table_name,
       indexrelname AS index_name,
       idx_scan     AS scans,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
JOIN pg_index ON pg_index.indexrelid = pg_stat_user_indexes.indexrelid
WHERE idx_scan = 0
  AND indisunique = false    -- don't suggest dropping unique constraints
  AND indisprimary = false   -- don't suggest dropping PKs
ORDER BY pg_relation_size(indexrelid) DESC;

-- Also check duplicate indexes (same columns, same opclass):
SELECT pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid = 'orders'::regclass;
```
::

**Rule of thumb**: index for the queries you actually run, not every column you *might* filter on. Drop indexes that haven't been used in a representative period.

## EXPLAIN Basics

`EXPLAIN` shows the query plan; `EXPLAIN ANALYZE` executes it and shows actual timings. Learn to read these — they're the only way to know if an index is actually used.

::code-wrapper{language="sql"}
```sql
-- EXPLAIN: planner's estimate (no execution).
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
-- Seq Scan on orders  (cost=0.00..183334.00 rows=5263 width=...)
-- ^ If rows estimate is close to total rows, planner chooses seq scan on purpose
--   (cheaper than random heap fetches for a large fraction of the table).

-- EXPLAIN ANALYZE: actual execution with timings (modifies data for DML).
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
-- Index Scan using orders_customer_id_idx on orders
--   (cost=0.43..63.27 rows=53 width=...) (actual time=0.015..0.042 rows=53 loops=1)
--   Index Cond: (customer_id = 42)
-- Planning Time: 0.083 ms
-- Execution Time: 0.065 ms

-- BUFFERS: shows buffer (cache) hit/miss — critical for understanding I/O.
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42;
-- Buffers: shared hit=4 read=1  → 4 pages from cache, 1 from disk
```
::

Key plan node types:
- **Seq Scan**: reads the whole table. Fine for small tables or when the query matches a large fraction of rows.
- **Index Scan**: reads the index, then fetches matching heap tuples. Good for selective queries.
- **Index Only Scan**: reads only the index, no heap fetch. Best case — needs all-visible pages.
- **Bitmap Index Scan + Bitmap Heap Scan**: index produces a bitmap of matching tuple IDs, then heap scan fetches them in physical order. Good for medium selectivity (avoids random I/O of pure index scan).

## Complex Implementation: Production Indexing Strategy

::code-wrapper{language="sql"}
```sql
-- A multi-column query pattern on a 200M-row orders table.
-- Query patterns:
--   1. WHERE customer_id = ? AND status = ? AND ordered_on >= ?
--   2. WHERE customer_id = ? AND ordered_on >= ?  (no status filter)
--   3. WHERE status = 'pending' (small hot subset)

-- Index 1: composite for pattern 1 & 2.
-- customer_id (equality) first, ordered_on (range) last, status in middle.
-- INCLUDE amount for covering index-only scan on the common SELECT.
CREATE INDEX orders_cust_date_status_idx
  ON orders(customer_id, ordered_on, status) INCLUDE (amount);

-- Pattern 1: WHERE customer_id = ? AND ordered_on >= ? AND status = ?
-- → Index Scan using all 3 key columns, amount from INCLUDE. Index-only scan.

-- Pattern 2: WHERE customer_id = ? AND ordered_on >= ?
-- → Index Scan using customer_id + ordered_on (leftmost prefix), status as filter.
--   Not index-only if status is in SELECT (it's a key, so it IS available).

-- Index 2: partial for pattern 3 (small hot subset — pending orders only).
CREATE INDEX orders_pending_idx
  ON orders(customer_id, ordered_on) WHERE status = 'pending';
-- Much smaller than full index, stays hot in cache.

-- Verify with EXPLAIN:
EXPLAIN (ANALYZE, BUFFERS)
SELECT customer_id, ordered_on, amount
FROM orders
WHERE customer_id = 42 AND ordered_on >= '2024-01-01' AND status = 'shipped';
-- Index Only Scan using orders_cust_date_status_idx
--   Index Cond: (customer_id = 42 AND ordered_on >= '2024-01-01')
--   Filter: (status = 'shipped')
--   Buffers: shared hit=5
```
::

## Anti-Pattern: Indexing Without Checking EXPLAIN

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: adding indexes blindly "just in case" on every column.
-- This table has 12 indexes, most unused. Every INSERT updates 12 indexes.
CREATE INDEX idx1 ON orders(customer_id);
CREATE INDEX idx2 ON orders(status);
CREATE INDEX idx3 ON orders(ordered_on);
CREATE INDEX idx4 ON orders(amount);
CREATE INDEX idx5 ON orders(customer_id, status);
-- ... 7 more ...

-- The planner may not even use most of these — and write performance is 12x worse.

-- ✅ CORRECT: measure first, index for actual query patterns.
-- Step 1: run EXPLAIN ANALYZE on slow queries.
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
-- Seq Scan on orders (actual time=1234.567..5678.901 rows=53)

-- Step 2: design the minimal index set that covers the query patterns.
CREATE INDEX orders_cust_status_idx ON orders(customer_id, status);

-- Step 3: verify the index is used.
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
-- Index Scan using orders_cust_status_idx (actual time=0.015..0.042 rows=53)

-- Step 4: monitor usage over time and drop unused indexes.
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE relname = 'orders';
```
::

## 💡 Tips & Tricks

- **Idiom — composite index column ordering**: equality columns first, range columns last, sort columns after equality. `(customer_id, ordered_on)` serves `WHERE customer_id = ? AND ordered_on >= ?` and `ORDER BY customer_id, ordered_on` — one index replacing three.
- **Performance — covering indexes eliminate heap fetches**: `INCLUDE` the columns your query `SELECT`s. The heap fetch is often the dominant cost; index-only scans can be 10-100x faster on large tables.
- **Idiom — partial indexes for "small hot subset" queries**: `WHERE status = 'pending'` — the partial index is a fraction of the size, stays hot in cache, and the planner prefers it when the predicate matches.
- **Idiom — expression indexes for case-insensitive search**: `CREATE INDEX ON users(lower(email))` + `WHERE lower(email) = ?`. Or use a case-insensitive ICU collation on the column to avoid the expression entirely.
- **Performance — BRIN for large append-only tables**: a BRIN index on a billion-row time-series table is a few KB vs. GB for a B-tree. Useless on random data, ideal on naturally-ordered data.
- **Debug — `pg_stat_user_indexes` for finding unused indexes**: `idx_scan = 0` means never used (since last stats reset). Drop unused non-unique indexes to improve write performance.
- **Idiom — `CREATE INDEX CONCURRENTLY` for production**: doesn't block writes (slower, two table scans). Can't run in a transaction. May leave an invalid index if it fails — check `pg_index.indisvalid` and drop with `DROP INDEX CONCURRENTLY` if invalid.
- **Performance — VACUUM maintains the visibility map**: index-only scans need all-visible pages. A table with a covering index but stale visibility map does heap fetches anyway. Autovacuum usually handles this, but bulk-loaded tables may need a manual `VACUUM`.

## ⚠️ Edge Cases & Gotchas

- **`LIKE '%middle'` can't use a B-tree index**: leading wildcards defeat the sorted tree. Use `pg_trgm` GiST/GIN index for substring search, or full-text search.
- **Type mismatches defeat indexes**: `WHERE id = '42'` (string vs integer column) may not use the index on `id` — the planner applies a cast per row, which isn't indexable. Match the column type, or use an expression index on the cast.
- **Functions defeat indexes**: `WHERE lower(email) = 'x'` doesn't use an index on `email` — the function is applied per row. Create an expression index on `lower(email)`, or use a case-insensitive collation.
- **`!=` and `<>` rarely use indexes**: B-trees are good at finding matching values, not "all values except this one" (which is most of the table). `WHERE status != 'deleted'` usually seq-scans. Rewrite as `status IN ('active', 'pending')` or use a partial index on the complement.
- **`OR` conditions and indexes**: `WHERE a = 1 OR b = 2` may not use indexes on `a` or `b`. The planner may do a bitmap OR (if both indexed) or a seq scan. Rewrite as `UNION ALL` of two indexed queries for guaranteed index usage.
- **Index bloat**: `DELETE`/`UPDATE` leave dead tuples; indexes accumulate bloat. `VACUUM` reclaims dead tuples but doesn't shrink indexes — `VACUUM FULL` or `pg_repack` does. Monitor index size vs. table size.
- **`CREATE INDEX CONCURRENTLY` can leave invalid indexes**: if it fails (e.g., unique violation during build), it leaves an invalid index (`pg_index.indisvalid = false`) that the planner won't use but still takes space and write overhead. Check: `SELECT ... FROM pg_index WHERE NOT indisvalid`.
- **Index-only scans need `VACUUM`**: the visibility map that enables index-only scans is maintained by `VACUUM`. A table with a covering index but stale visibility map does heap fetches anyway.
- **Composite index leftmost rule**: `(a, b, c)` can't help `WHERE b = ?` alone. A common mistake is indexing `(tenant_id, created_at)` and expecting it to serve `WHERE created_at > ?` — it can't. Add a separate index on `created_at` if that query matters.
- **BRIN is useless on random data**: BRIN works on naturally-ordered data (time-series, append-only). On shuffled data, every block range has wide min/max, and BRIN skips nothing.
- **Partial index predicate must match the query**: `CREATE INDEX ... WHERE status = 'pending'` is only used if the query has `status = 'pending'` in its WHERE. `WHERE status IN ('pending', 'shipped')` won't use it.
- **Expression index immutability requirement**: the expression must be `IMMUTABLE` — same input always produces the same output. `lower()` is immutable; `now()`, date functions depending on timezone, and functions reading tables are not. PG will reject non-immutable expressions at `CREATE INDEX` time.

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

The index is on `email`, but the query filters on `lower(email)`. The index is organized by the raw `email` value, not by `lower(email)`. Applying `lower()` to every row and comparing is a per-row operation — the planner can't use the B-tree for a lookup. It falls back to a seq scan.

Three fixes:

::code-wrapper{language="sql"}
```sql
-- Option 1: expression index on lower(email) — most common solution.
CREATE INDEX users_email_lower_idx ON users(lower(email));
SELECT * FROM users WHERE lower(email) = 'alice@example.com';  -- ✅ uses index

-- Option 2: drop the lower() and query the raw column (if emails are stored consistently).
SELECT * FROM users WHERE email = 'Alice@example.com';
-- ✅ uses the email index, but fails if stored as 'alice@...' (case mismatch).

-- Option 3: case-insensitive ICU collation on the email column.
ALTER TABLE users ALTER COLUMN email TYPE text COLLATE "und-x-icu";
-- Now email = 'ALICE@...' matches 'alice@...' and the plain index works.
-- Requires ICU support and affects all queries on the column.
```
::

**The lesson**: an index on `col` is not an index on `f(col)`. If you filter on a function of a column, index the function (expression index) or store the pre-computed value (generated column).

</details>