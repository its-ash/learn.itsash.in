# 26 — Query Optimization & EXPLAIN

`EXPLAIN` is the single most important tool for understanding why a query is slow. It shows the **plan** the optimizer chose: which indexes are used, what join algorithms, the estimated row counts, and (with `ANALYZE`) the actual execution time per step.

## EXPLAIN vs EXPLAIN ANALYZE

::code-wrapper{language="sql"}
```sql
-- Show the plan (estimates only — doesn't run the query)
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;

-- Show the plan AND run it (actual times, rows, loops)
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

-- Show buffers (I/O) too
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42;

-- Show the plan in text (default) or JSON
EXPLAIN (FORMAT JSON) SELECT * FROM orders WHERE customer_id = 42;
``
::

- **`EXPLAIN`** — the planner's *estimate* (cost, rows, width). Fast, doesn't execute. Shows what the planner *thinks* will happen.
- **`EXPLAIN ANALYZE`** — runs the query and shows *actual* times and row counts alongside estimates. Shows what *actually* happened. The gap between estimate and actual reveals stale statistics.

⚠️ `EXPLAIN ANALYZE` **executes** the query — for `INSERT`/`UPDATE`/`DELETE`, this modifies data. Wrap in a transaction and roll back: `BEGIN; EXPLAIN ANALYZE UPDATE ...; ROLLBACK;`.

## Reading a Plan

A plan is a tree. Each node is an operation; indentation shows parent-child relationships. Read it **inside-out** (innermost nodes execute first):

::code-wrapper{language="text"}
```text
EXPLAIN SELECT c.name, o.amount
FROM customers c JOIN orders o ON c.id = o.customer_id
WHERE c.city = 'NYC';

                                QUERY PLAN
--------------------------------------------------------------------------------
 Hash Join  (cost=1.06..2.15 rows=1 width=40)
   Hash Cond: (o.customer_id = c.id)
   ->  Seq Scan on orders o  (cost=0.00..1.04 rows=4 width=12)
   ->  Hash  (cost=1.05..1.05 rows=1 width=36)
         ->  Seq Scan on customers c  (cost=0.00..1.05 rows=1 width=36)
               Filter: (city = 'NYC')
```
::

Read inside-out:
1. **Seq Scan on customers** with `Filter: city = 'NYC'` — scans `customers`, filters.
2. **Hash** — builds a hash table from the filtered customers.
3. **Seq Scan on orders** — scans `orders`.
4. **Hash Join** — joins the two via the hash table.

The `cost` is an arbitrary unit (not milliseconds) — `cost=start..total`. The `rows` is the planner's estimate (compare to actual in `ANALYZE`). `width` is the average row width in bytes.

## Key Node Types

### Scans

| Node | Meaning |
|---|---|
| **Seq Scan** | Full table scan — reads every row. Fine for small tables or when most rows match; bad for selective queries on large tables. |
| **Index Scan** | Reads an index, then fetches matching heap rows. Good for selective queries. |
| **Index Only Scan** | Reads only the index (no heap fetch) — needs a covering index and a fresh visibility map. Fastest. |
| **Bitmap Index Scan + Bitmap Heap Scan** | Index produces a bitmap of matching row locations; heap scan fetches them. Good for medium-selectivity queries (more rows than a plain index scan, fewer than a seq scan). |
| **Tid Scan** | Fetches specific rows by CTID (physical location). Rare. |
| **Subquery Scan** | Wraps a subquery's output. |
| **Function Scan** | Scans a set-returning function (`generate_series`, etc.). |

### Joins

| Node | Meaning |
|---|---|
| **Nested Loop** | For each left row, scan the right (with an index lookup or scan). Best when one side is small. |
| **Hash Join** | Build a hash table on the smaller side, probe with the larger. Best for large, unindexed equality joins. Needs `work_mem`. |
| **Merge Join** | Both inputs pre-sorted on the join key; merge them. Best when both are sorted (via indexes or explicit sorts). |

### Other

| Node | Meaning |
|---|---|
| **Sort** | Explicit sort. If there's an index on the sort key, this is avoided. Expensive on large data. |
| **Hash Aggregate** | Group/aggregate via a hash table. Needs `work_mem`; spills to disk if exceeded. |
| **Group Aggregate** | Group/aggregate after a sort. Used when the input is already sorted or when hash would spill. |
| **Limit** | Stops after N rows. Combined with an index, enables fast top-N. |
| **Unique** | Removes duplicates (from `DISTINCT` or `EXCEPT`). |
| **Gather / Gather Merge** | Parallel query — multiple workers scan partitions of the data. |
| **Append** | Combines results (for `UNION ALL` or partition scanning). |
| **Materialize** | Caches a subquery's output for repeated use. |
| **CTE Scan** | Reads a CTE's result. |

## Estimation vs Reality

The planner's estimates come from **table statistics** (collected by `ANANYZE`/autovacuum). If stats are stale or the data is skewed, estimates are wrong, and the planner chooses a bad plan:

::code-wrapper{language="text"}
```text
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

-- Estimate says 10 rows, actual is 100000:
 Index Scan on orders  (cost=0.29..8.31 rows=10 width=...) (actual time=0.05..50.3 rows=100000 loops=1)
```
::

A 10000x estimate error means the planner picked an Index Scan (good for 10 rows) when a Seq Scan would've been better (for 100000 rows). **Fix: `ANALYZE orders`** to refresh statistics.

## Common Slow-Query Patterns and Fixes

### 1. Seq Scan on a Large Table (missing index)

::code-wrapper{language="text"}
```text
Seq Scan on orders (rows=10000000)  Filter: (customer_id = 42)
``
::

Fix: `CREATE INDEX ON orders(customer_id)`. Then the plan becomes an Index Scan.

### 2. Index Scan with Heap Fetch (no covering index)

::code-wrapper{language="text"}
```text
Index Scan on orders_customer_id_idx (rows=1000)
  -> Heap Fetches: 1000
``
::

For a query `SELECT customer_id, amount FROM orders WHERE customer_id = 42`, the index on `customer_id` finds the rows, but each requires a heap fetch to get `amount`. Fix: `CREATE INDEX ON orders(customer_id) INCLUDE (amount)` — an Index Only Scan, no heap fetch.

### 3. Filesort / Explicit Sort (no index on ORDER BY)

::code-wrapper{language="text"}
```text
Sort  (rows=1000000)  Sort Key: ordered_on  Sort Method: external merge  Disk: 50000kB
```
::

`Sort Method: external merge Disk` means the sort spilled to disk — slow. Fix: an index on `ordered_on` (the planner reads in order, no sort) or increase `work_mem` (in-memory sort).

### 4. Bad Join Order (estimates off)

::code-wrapper{language="text"}
```text
Hash Join  rows=1 (actual rows=1000000)
  -> Seq Scan on small_table  rows=1 (actual rows=1000000)   -- planner thought 1 row, it's 1M
  -> Hash
```
::

The planner built a hash table on what it thought was a 1-row table (actually 1M rows) — hash build is huge and slow. Fix: `ANALYZE small_table`.

### 5. Nested Loop with Inner Seq Scan (missing index on join column)

::code-wrapper{language="text"}
```text
Nested Loop  rows=1000
  -> Seq Scan on a  rows=1000
  -> Seq Scan on b  rows=1  (loops=1000)   -- 1000 seq scans of b!
``
::

For each of 1000 rows in `a`, the planner scans all of `b` (no index on the join column). Fix: `CREATE INDEX ON b(join_column)` — inner becomes an index lookup.

## Statistics and ANALYZE

::code-wrapper{language="sql"}
```sql
-- Manually collect statistics (autovacuum does this automatically)
ANALYZE orders;

-- Analyze a specific column
ANALYZE orders(customer_id);

-- View stored statistics
SELECT * FROM pg_stats WHERE tablename = 'orders' AND attname = 'customer_id';
``
::

`pg_stats` shows the most common values, histogram, and null fraction the planner uses. For skewed distributions (a few values dominate), consider increasing `statistics_target`:

::code-wrapper{language="sql"}
```sql
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 1000;
ANALYZE orders;
``
::

Default is 100; higher gives the planner more detail (at the cost of larger stats).

## Configuration That Affects Plans

| Setting | Effect |
|---|---|
| `work_mem` | Memory per sort/hash. Too low → spills to disk. Increase per-session for big queries. |
| `shared_buffers` | PostgreSQL's shared cache. Usually 25% of RAM. |
| `effective_cache_size` | Hint to the planner about OS cache. Usually 50-75% of RAM. Affects index-vs-seq-scan decisions. |
| `random_page_cost` | Cost of a random read (default 4.0). Lower (1.1) on SSDs — makes the planner prefer indexes. |
| `enable_seqscan`, `enable_indexscan`, etc. | Off switches for debugging (don't use in production). |

::code-wrapper{language="sql"}
```sql
-- Per-session tuning for a big query
SET work_mem = '256MB';
SET random_page_cost = 1.1;   -- SSD
``
::

## Parallel Query

PostgreSQL can use multiple workers for a single query:

::code-wrapper{language="text"}
```text
Gather  (workers=2)
  -> Parallel Seq Scan on orders
```
::

Parallel query helps CPU-bound scans/aggregations on large tables. It's automatic (the planner chooses it when beneficial) and controlled by `max_parallel_workers_per_gather`, `min_parallel_table_scan_size`, etc.

## 💡 Tips & Tricks

- **Idiom**: run `EXPLAIN (ANALYZE, BUFFERS)` on slow queries — `BUFFERS` shows I/O (shared hits vs reads vs dirtied), revealing whether the query is I/O-bound (lots of `read` buffers — data not in cache) or CPU-bound (lots of hits, high time — computation). The fix differs: I/O-bound needs an index or more cache; CPU-bound needs less work (fewer rows, simpler computation).
- **Idiom**: compare the planner's **estimated rows to actual rows** — a large discrepancy (10x or more) means stale statistics; run `ANALYZE table` to refresh. Wrong estimates cause wrong plans (e.g., a nested loop chosen because the planner thought the inner had 1 row, not 1M).
- **Idiom**: read a plan **inside-out and top-to-bottom** — the innermost (most-indented) nodes execute first; their output feeds the parent. The top node is the final operation (e.g., a Limit or Sort). Understanding the data flow makes "why is this slow" tractable.
- **Performance**: increase `work_mem` per-session for big sort/hash queries — `SET work_mem = '256MB'` before a query that sorts/hashes a lot. The default (4MB) forces spills to disk on anything non-trivial. But beware: it's per-node, so a 10-node plan with 256MB each can use 2.5GB.
- **Performance**: set `random_page_cost = 1.1` on SSD storage (vs. the default 4.0 for spinning disks) — this tells the planner random index reads are cheap, making it prefer index scans over seq scans on SSDs. The default 4.0 was for mechanical disks and over-penalizes SSD random reads.

## ⚠️ Edge Cases & Gotchas

- **`EXPLAIN ANALYZE` executes the query**: for `INSERT`/`UPDATE`/`DELETE`, this modifies data. Wrap in `BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;` to avoid side effects.
- **Estimates vs actuals**: the planner's `rows` is an estimate from statistics; `ANALYZE`'s `actual rows` is the truth. A 100x gap means stale stats — `ANALYZE`.
- **`rows=1` (actual rows=1000000)**: the classic stale-statistics symptom. The planner chose a plan for 1 row (nested loop) that's catastrophic for 1M rows. `ANALYZE` fixes it.
- **External sort (disk spill)**: `Sort Method: external merge Disk: ...` means the sort exceeded `work_mem` and spilled — slow. Increase `work_mem` or add an index on the sort key.
- **Bitmap Heap Scan with recheck**: a bitmap scan that's too large for a single-page bitmap falls back to "lossy" mode and rechecks filter conditions per heap row — slower. A more selective index or a higher `work_mem` helps.
- **Nested Loop with inner Seq Scan**: the inner side is scanned once per outer row — if the outer has N rows and the inner has M, it's O(N×M). An index on the inner join column turns it into O(N×log M).
- **Hash Join spilling**: if the hash table exceeds `work_mem`, it spills to disk (slow). Increase `work_mem` or ensure the smaller side is the build input.
- **`ANALYZE` vs `VACUUM`**: `ANALYZE` collects statistics; `VACUUM` reclaims dead tuples. Autovacuum does both. Stale stats → bad plans; dead tuples → bloat. They're different problems with different fixes.
- **Parameterized plans (prepared statements)**: a prepared statement's plan is generated once (with the first parameters) and reused — if the first call's parameters are unrepresentative (e.g., a rare selective value), the cached plan is bad for subsequent calls. Use `generic plans` (PostgreSQL 16+) or re-prepare.
- **`LIMIT` and the planner**: `LIMIT 10` can make the planner prefer an index scan (read 10 rows and stop) even when a seq scan would be better for the full result. This is usually correct, but a `LIMIT 10` on an unindexed sort still sorts the whole table first.
- **Parallel query has overhead**: for small queries, the Gather/worker startup cost exceeds the benefit. The planner only parallelizes when the table is large enough (`min_parallel_table_scan_size`). Don't expect parallelism on small tables.

## 🧠 Spot the Bug

A query that was fast in development is slow in production. `EXPLAIN ANALYZE` shows:

::code-wrapper{language="text"}
```text
Nested Loop  (rows=1) (actual time=0.1..9800.0 rows=5000 loops=1)
  -> Index Scan on users_email_idx  (rows=1) (actual rows=1)
        Index Cond: (email = 'a@x.com')
  -> Seq Scan on orders  (rows=1) (actual rows=5000 loops=1)
        Filter: (customer_id = users.id)
```
::

What's wrong, and what's the fix?

<details>
<summary>Answer</summary>

The planner **estimated 1 row** from `orders` per user (the `rows=1` on the Seq Scan), but the **actual is 5000 rows** (this user has 5000 orders). The estimate is wildly off — the planner's statistics for `orders.customer_id` are stale or don't capture the skew (this user is an outlier with 5000 orders; most have ~1).

Because the planner thought the inner Seq Scan would return 1 row, it chose a **Nested Loop** — for each outer row (1 user), scan `orders` once. With the estimate of 1 row per scan, that's cheap. But the actual is 5000 rows per scan, and there's no index on `orders.customer_id`, so each "scan" is a full table scan of `orders` — catastrophic.

Two fixes:

1. **Add the missing index** (the structural fix):
```sql
CREATE INDEX ON orders(customer_id);
```
Now the inner side becomes an Index Scan (`customer_id = users.id`), finding the 5000 rows in O(log N + 5000) instead of O(N).

2. **Refresh statistics** (the estimate fix):
```sql
ANALYZE orders;
```
With accurate stats, the planner would know this user has 5000 orders and choose a Hash Join (build a hash on `orders`, probe with `users`) instead of a Nested Loop. But the index (fix 1) is still needed — a Hash Join over a full scan is better than a Nested Loop of full scans, but an Index Scan is better still.

**The lesson**: a Nested Loop with an inner Seq Scan and wildly wrong `rows=1` estimate is the signature of (a) a missing index on the inner join column and (b) stale/skewed statistics. Add the index and `ANALYZE` — both, not just one.

</details>

## Summary

You can now read an `EXPLAIN` plan (inside-out), identify Seq Scans, Index Scans, Bitmap Scans, Nested Loop/Hash/Merge joins, Sorts, and parallel Gather nodes; spot estimate-vs-actual gaps (stale stats); and fix slow queries with indexes, covering indexes, `work_mem`, `random_page_cost`, and `ANALYZE`. Next: advanced SQL patterns.