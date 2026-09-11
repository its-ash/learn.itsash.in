# 26 — Query Optimization & EXPLAIN

## EXPLAIN Variants — What Each Shows

::code-wrapper{language="sql"}
```sql
-- PLANNER ESTIMATES ONLY — does NOT execute the query
-- cost = startup..total (arbitrary units, NOT milliseconds)
-- rows = estimated row count, width = avg bytes per row
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;

-- EXECUTES the query — shows actual time (ms), actual rows, loops
-- The gap between estimated rows and actual rows reveals stale statistics
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

-- ADDS I/O breakdown: shared hit (cached) vs read (disk) vs dirtied vs written
-- Tells you if the query is I/O-bound (many reads) or CPU-bound (many hits, high time)
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 42;

-- ADDS per-step timing — essential for isolating which node dominates
EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT * FROM orders WHERE customer_id = 42;

-- JSON output for programmatic parsing / diffing plans in CI
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM orders WHERE customer_id = 42;

-- VERBOSE adds schema-qualified names and full expression output
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT * FROM orders WHERE customer_id = 42;
```
::

⚠️ `EXPLAIN ANALYZE` **executes** the query. For `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`, this modifies data. Always wrap DML in a transaction and roll back:

::code-wrapper{language="sql"}
```sql
BEGIN;
EXPLAIN ANALYZE UPDATE orders SET amount = amount * 1.1 WHERE customer_id = 42;
ROLLBACK;  -- revert the update; the plan + timing are still displayed
```
::

## Reading a Plan Tree — Inside-Out

A plan is a tree of nodes. Indentation = parent-child. The innermost (most-indented) nodes execute first; their output feeds the parent. Read **inside-out, bottom-up**:

::code-wrapper{language="text"}
```text
EXPLAIN SELECT c.name, o.amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE c.city = 'NYC';

                                 QUERY PLAN
──────────────────────────────────────────────────────────────────
 Hash Join                           -- ④ final join: probe orders with customer hash
   Hash Cond: (o.customer_id = c.id)
   ->  Seq Scan on orders o          -- ③ full scan of orders (no filter — all rows)
   ->  Hash                          -- ② build hash table from filtered customers
         ->  Seq Scan on customers c  -- ① scan customers, filter city = 'NYC'
               Filter: (city = 'NYC')
```
::

Execution order: ① → ② → ③ → ④. Each node reports `(cost=startup..total rows=N width=W)`. With `ANALYZE`, it also reports `(actual time=T1..T2 rows=R loops=L)`.

### Cost Model Decoded

| Field | Meaning | Source |
|-------|---------|--------|
| `startup` | Cost to produce the **first** row | Index scans: low. Sorts: high (must sort all before first row). |
| `total` | Cost to produce **all** rows | Includes startup + per-row costs. |
| `rows` | **Estimated** output row count | From `pg_class.reltuples` × selectivity estimate. |
| `width` | Avg row width in bytes | From `pg_stats` histogram bounds. |
| `actual time` | Wall-clock ms to first / all rows | Only with `ANALYZE`. |
| `actual rows` | Real output row count | Only with `ANALYZE`. Compare to estimated `rows`. |
| `loops` | How many times this node was invoked | Nested loop inner: loops = outer row count. Multiply `time × loops` for total. |

Cost units are **arbitrary** (not ms) — derived from `seq_page_cost`, `random_page_cost`, `cpu_tuple_cost`. They're only meaningful for **relative** comparison between plan alternatives, never as an absolute time estimate.

## Node Types — Scans

| Node | When Chosen | I/O Pattern | Red Flags |
|------|-------------|-------------|-----------|
| **Seq Scan** | Small table, or most rows match, or no index | Sequential (cheap per page) | On a large table with a selective predicate = missing index |
| **Index Scan** | Selective predicate on an indexed column | Random I/O (index + heap fetch) | High `Heap Fetches` count = consider covering index |
| **Index Only Scan** | All needed columns are in the index + visibility map is fresh | Index-only (no heap access) | `Heap Fetches: N` > 0 = visibility map stale, needs `VACUUM` |
| **Bitmap Index Scan → Bitmap Heap Scan** | Medium selectivity (many matching rows but not all) | Batched random I/O | `Exact` vs `Lossy` bitmap — lossy means recheck per heap row |
| **Tid Scan** | `WHERE ctid = '(0,1)'` — physical row location | Direct page access | Rare; only for CTID-based access |
| **Function Scan** | Set-returning function (`generate_series`, etc.) | N/A | Always estimate 1000 rows unless `ROWS` specified |
| **Subquery Scan** | Wraps a subquery / CTE result | Depends on child | Often a no-op wrapper; check the child node |
| **Sample Scan** | `TABLESAMPLE` | Random subset | Used for approximations |

### Bitmap Scan vs Index Scan — The Planner's Choice

::code-wrapper{language="text"}
```text
-- Index Scan: for each matching tuple, fetch the heap page directly
--   O(matching_rows × random_page_cost)
--   Best when matching_rows is small (high selectivity)

-- Bitmap Index Scan: build a bitmap of matching tuple locations, then
--   batch-fetch heap pages in physical order (sorted by page number)
--   O(matching_pages × seq_page_cost) — amortizes random I/O
--   Best when matching_rows is moderate (many per page)

-- If the bitmap exceeds work_mem × 8 (in pages), it becomes LOSSY:
--   only page-level granularity is kept → must recheck the condition
--   per heap row. Raise work_mem to avoid this.
```
::

## Node Types — Joins

| Node | Algorithm | Best When | Cost | Memory |
|------|-----------|-----------|------|--------|
| **Nested Loop** | For each outer row, scan/lookup inner | One side is small (< ~100 rows) or inner has an index | O(N × M) or O(N × log M) with index | None |
| **Hash Join** | Build hash on smaller side, probe with larger | Both sides large, equality join, no index | O(N + M) | `work_mem` (spills on overflow) |
| **Merge Join** | Both inputs pre-sorted on join key, merge | Both sorted (via index or explicit sort) | O(N + M) | None (but may need Sort inputs) |

::code-wrapper{language="text"}
```text
-- Nested Loop blowup: if the planner estimates 1 outer row but
-- actual is 10000, the inner is executed 10000 times. If the
-- inner is a Seq Scan, that's 10000 full table scans:

Nested Loop  (rows=1) (actual time=0.1..98000 rows=10000 loops=1)
  -> Index Scan on users  (rows=1) (actual rows=10000)   -- estimate: 1, actual: 10000
  -> Seq Scan on orders   (rows=1) (actual rows=500 loops=10000)  -- 10000 × full scan
         Filter: (customer_id = users.id)
         Rows Removed by Filter: 999995   -- discards nearly the entire table each loop

-- Total inner work: 10000 × 1000000 = 10 billion row examinations
-- Fix: CREATE INDEX ON orders(customer_id) → inner becomes Index Scan, O(log N + matches)
-- AND: ANALYZE users → fix the estimate so the planner picks Hash Join instead
```
::

## Node Types — Other

| Node | Meaning |
|------|---------|
| **Sort** | Explicit in-memory or external-merge sort. `Sort Method: quicksort Memory: 25kB` vs `external merge Disk: 50000kB` (spilled — raise `work_mem`). |
| **Hash Aggregate** | Group/aggregate via hash table. Spills to disk if exceeds `work_mem`. PostgreSQL 13+ has disk-based hash aggregation. |
| **Group Aggregate** | Group/aggregate after a sort. Used when input is already sorted or hash would spill. |
| **Limit** | Stops after N rows. With an index on the sort key, enables fast top-N without sorting. |
| **Gather / Gather Merge** | Parallel query — workers scan partitions. `Gather` merges unordered, `Gather Merge` merges pre-sorted. |
| **Append** | Combines child results (`UNION ALL`, partition scanning). |
| **Materialize** | Caches a subquery's output for repeated reads by a Nested Loop. |
| **CTE Scan** | Reads a CTE. If `NOT MATERIALIZED` (default in PG12+ for non-recursive CTEs), the planner may inline it. |
| **Unique** | Removes duplicates (from `DISTINCT`, `EXCEPT`). Usually via sort + dedup. |
| **WindowAgg** | Computes window functions. Often requires a Sort on the `PARTITION BY` + `ORDER BY` columns first. |

## Complex Example — Slow Query Diagnosis

### The Problem Query

::code-wrapper{language="sql"}
```sql
-- "Find the top 10 customers by total spend in Q1 2024, with their email"
SELECT c.id, c.email, c.name, SUM(o.amount) AS total_spend
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.ordered_on >= '2024-01-01'
  AND o.ordered_on <  '2024-04-01'
GROUP BY c.id, c.email, c.name
ORDER BY total_spend DESC
LIMIT 10;
-- Runtime: 45 seconds on 50M orders
```
::

### Step 1 — Diagnose with EXPLAIN (ANALYZE, BUFFERS)

::code-wrapper{language="text"}
```text
EXPLAIN (ANALYZE, BUFFERS) [query above];

 Limit  (cost=3987521.20..3987521.22 rows=10 width=48) (actual time=45210.3..45210.5 rows=10 loops=1)
   Buffers: shared hit=512 read=984321
   ->  GroupAggregate  (cost=3987521.20..4012345.67 rows=1000000 width=48) (actual time=45210.3..45210.4 rows=10 loops=1)
         Group Key: c.id, c.email, c.name
         Buffers: shared hit=512 read=984321
         ->  Sort  (cost=3987521.20..3995678.90 rows=3263072 width=48) (actual time=45100.2..45150.8 rows=3263072 loops=1)
               Sort Key: c.id
               Sort Method: external merge  Disk: 198456kB     -- ← spilled to disk!
               Buffers: shared hit=8 read=984321
               ->  Hash Join  (cost=15432.00..3789001.20 rows=3263072 width=48) (actual time=12.3..44000.5 rows=3263072 loops=1)
                     Hash Cond: (o.customer_id = c.id)
                     Buffers: shared hit=4 read=984321
                     ->  Seq Scan on orders o  (cost=0.00..3765000.00 rows=3263072 width=12) (actual time=0.1..42000.0 rows=3263072 loops=1)
                           Filter: ((ordered_on >= '2024-01-01') AND (ordered_on < '2024-04-01'))
                           Rows Removed by Filter: 46736928
                           Buffers: shared read=984321            -- ← 984321 pages read from disk!
                     ->  Hash  (cost=12345.00..12345.00 rows=100000 width=36) (actual time=11.0..11.0 rows=100000 loops=1)
                           Buckets: 131072  Batches: 1  Memory Usage: 8234kB
                           Buffers: shared hit=4
                           ->  Seq Scan on customers c  (cost=0.00..12345.00 rows=100000 width=36) (actual time=0.1..10.0 rows=100000 loops=1)
```
::

### Reading the Plan

1. **Seq Scan on orders** — full table scan, 50M rows, discarding 46.7M. `read=984321` pages = ~7.7 GB read from disk. No index on `ordered_on`.
2. **Sort spilled to disk** — `external merge Disk: 198456kB` — `work_mem` too low for 3.2M rows.
3. **GroupAggregate after Sort** — the sort + aggregate dominates the 45s.

### Step 2 — The Fixes

::code-wrapper{language="sql"}
```sql
-- FIX 1: Add a partial index on the date range (only Q1 2024 orders)
-- This turns the 50M-row seq scan into a targeted index scan
CREATE INDEX idx_orders_q1_2024 ON orders(customer_id, ordered_on)
  INCLUDE (amount)
  WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-04-01';

-- FIX 2: Raise work_mem for this session to avoid the sort spill
SET work_mem = '256MB';

-- FIX 3: Rewrite using a covering index approach
-- The INCLUDE (amount) makes the index a covering index for this query
-- Now the planner can do an Index Only Scan — no heap fetch needed
```
::

### Step 3 — After: The Fixed Plan

::code-wrapper{language="text"}
```text
EXPLAIN (ANALYZE, BUFFERS) [query above with SET work_mem = '256MB'];

 Limit  (cost=50234.12..50234.14 rows=10 width=48) (actual time=340.5..340.7 rows=10 loops=1)
   Buffers: shared hit=15234 read=0       -- ← all cache hits, 0 disk reads!
   ->  GroupAggregate  (cost=50234.12..50456.78 rows=100000 width=48) (actual time=340.5..340.6 rows=10 loops=1)
         Group Key: c.id, c.email, c.name
         Buffers: shared hit=15234
         ->  Sort  (cost=50234.12..50289.45 rows=22130 width=48) (actual time=320.1..330.2 rows=22130 loops=1)
               Sort Key: c.id
               Sort Method: quicksort  Memory: 2845kB    -- ← in-memory now!
               Buffers: shared hit=15234
               ->  Hash Join  (cost=15432.00..49001.20 rows=22130 width=48) (actual time=12.3..310.0 rows=22130 loops=1)
                     Hash Cond: (o.customer_id = c.id)
                     Buffers: shared hit=15234
                     ->  Index Only Scan using idx_orders_q1_2024 on orders o  (cost=0.42..32000.00 rows=22130 width=12) (actual time=0.2..280.0 rows=22130 loops=1)
                           Index Cond: (ordered_on >= '2024-01-01' AND (ordered_on < '2024-04-01')
                           Heap Fetches: 0                    -- ← covering index, zero heap access
                           Buffers: shared hit=15230
                     ->  Hash  (cost=12345.00..12345.00 rows=100000 width=36) (actual time=11.0..11.0 rows=100000 loops=1)
                           ->  Seq Scan on customers c  (cost=0.00..12345.00 rows=100000 width=36) (actual time=0.1..10.0 rows=100000 loops=1)
```
::

**Result: 45s → 0.34s (132× faster).** Disk reads: 984321 → 0. Sort: external 198MB disk → 2.8MB memory.

## Anti-Pattern — Optimizing Without Measuring

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: Adding indexes blindly "because it might help"
CREATE INDEX idx_orders_amount ON orders(amount);
CREATE INDEX idx_orders_amount_customer ON orders(amount, customer_id);
CREATE INDEX idx_orders_amount_date ON orders(amount, ordered_on);
-- None of these help the actual query pattern. Each one slows down
-- every INSERT/UPDATE/DELETE on orders and wastes disk + cache.
-- You've made writes slower for zero read benefit.

-- ✅ RIGHT: Measure first, index the actual bottleneck
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;  -- see which node dominates
-- Identify: Seq Scan on a 50M-row table with a selective filter
-- Then add the ONE index that turns it into an Index Scan
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on) INCLUDE (amount);
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;  -- verify the improvement
```
::

## Common Optimization Patterns

### Push Predicates — Filter Early

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: join everything, filter at the end
WITH all_orders AS (
  SELECT c.id, c.email, o.amount, o.ordered_on
  FROM customers c JOIN orders o ON c.id = o.customer_id
)
SELECT id, email, SUM(amount) AS total
FROM all_orders
WHERE ordered_on >= '2024-01-01'  -- applied AFTER the full join
GROUP BY id, email;

-- ✅ RIGHT: push the predicate into the join — filter orders first
SELECT c.id, c.email, SUM(o.amount) AS total
FROM customers c
JOIN orders o ON c.id = o.customer_id
  AND o.ordered_on >= '2024-01-01'  -- filter before join
GROUP BY c.id, c.email;
```
::

### Covering Index — Eliminate Heap Fetches

::code-wrapper{language="sql"}
```sql
-- Query: SELECT customer_id, amount FROM orders WHERE customer_id = 42;
-- With a plain index: Index Scan → 1000 heap fetches to get `amount`
CREATE INDEX ON orders(customer_id);

-- With a covering index: Index Only Scan → 0 heap fetches
CREATE INDEX ON orders(customer_id) INCLUDE (amount);
-- The INCLUDE column is stored in the index but not part of the sort key
-- It's smaller than a full composite (customer_id, amount) because
-- amount isn't used for tree navigation, only for covering
```
::

### Partition Pruning — Skip Irrelevant Partitions

::code-wrapper{language="sql"}
```sql
-- Partition by month, prune automatically
CREATE TABLE orders (
  id BIGSERIAL,
  customer_id BIGINT,
  amount NUMERIC(10,2),
  ordered_on TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (ordered_on);

CREATE TABLE orders_2024_01 PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE orders_2024_02 PARTITION OF orders
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- ... etc

-- The planner prunes partitions that can't match the WHERE clause
EXPLAIN SELECT * FROM orders WHERE ordered_on >= '2024-01-15' AND ordered_on < '2024-01-20';
-- → Append
--     -> Seq Scan on orders_2024_01   -- only Jan is scanned
-- Feb, Mar, etc. are not even touched
```
::

### Parallel Query — Use Multiple Workers

::code-wrapper{language="sql"}
```sql
-- The planner auto-parallelizes large scans/aggregations
-- Tune the worker count per session:
SET max_parallel_workers_per_gather = 4;  -- up to 4 workers per query node
SET min_parallel_table_scan_size = '8MB'; -- minimum table size to parallelize
SET parallel_setup_cost = 100;            -- lower = more eager to parallelize

-- Plan with parallelism:
-- Gather  (workers=4)
--   -> Parallel Seq Scan on orders
--        Filter: (amount > 100)
-- Each worker scans a subset of pages; results are merged at the Gather node
-- Overhead: worker startup + result merging. Not worth it for small tables.
```
::

## Statistics and ANALYZE

::code-wrapper{language="sql"}
```sql
-- Manually collect statistics (autovacuum does this, but sometimes stale)
ANALYZE orders;

-- Analyze a specific column (faster than full table)
ANALYZE orders(customer_id);

-- View stored statistics the planner uses
SELECT attname, n_distinct, most_common_vals, most_common_freqs,
       histogram_bounds, null_frac, avg_width
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'customer_id';

-- For skewed distributions (a few values dominate), increase statistics target
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 1000;
ANALYZE orders(customer_id);  -- default is 100; higher = more histogram buckets
-- More buckets = better estimate for skewed data, at the cost of larger pg_statistic
```
::

## Configuration That Affects Plans

| Setting | Effect | Tuning |
|---------|--------|--------|
| `work_mem` | Memory per sort/hash node | `SET work_mem = '256MB'` per-session for big queries. Default 4MB forces disk spills. Beware: per-node, so a 10-node plan × 256MB = 2.5GB. |
| `shared_buffers` | PostgreSQL's shared page cache | 25% of RAM. |
| `effective_cache_size` | Hint about OS cache + shared_buffers | 50-75% of RAM. Affects index-vs-seq-scan decisions. Low value → planner avoids indexes (thinks data isn't cached). |
| `random_page_cost` | Cost of a random page read | Default 4.0 (spinning disk). Set to 1.1 on SSDs — makes planner prefer indexes. |
| `jit` / `jit_above_cost` | JIT compile expressions if plan cost > threshold | Default on, threshold ~100000. For OLTP (short queries), disable: `SET jit = off`. JIT compilation has startup cost that hurts short queries. |
| `enable_seqscan` | Toggle to force/avoid seq scans | `SET enable_seqscan = off` to test if an index *would* be used. Never use in production — it doesn't disable seq scans, just makes them artificially expensive. |

::code-wrapper{language="sql"}
```sql
-- Per-session tuning for a heavy analytical query
SET work_mem = '512MB';
SET random_page_cost = 1.1;          -- SSD
SET effective_cache_size = '8GB';    -- hint: 8GB of OS+PG cache available
SET max_parallel_workers_per_gather = 4;
-- Run the query, then reset:
RESET work_mem;
RESET random_page_cost;
```
::

## 💡 Tips & Tricks

- **Idiom** — run `EXPLAIN (ANALYZE, BUFFERS)` and compute the **buffer hit ratio**: `shared_blks_hit / (shared_blks_hit + shared_blks_read)`. Below 90% means the working set doesn't fit in cache — data is I/O-bound. Above 99% means it's CPU-bound — the bottleneck is computation (sorts, joins, aggregates), not I/O. The fix differs entirely: I/O-bound → index or more cache; CPU-bound → fewer rows, simpler computation, or parallelism.

- **Idiom** — compare **estimated rows vs actual rows** at every node. A >10× discrepancy means stale statistics. The signature symptom: `rows=1 (actual rows=1000000)` on an inner scan → the planner chose a Nested Loop thinking the inner would return 1 row per loop, but it returned 1M per loop. Fix: `ANALYZE table`.

- **Idiom** — use `SET enable_seqscan = off` to **test** whether an index *would* be used. If the plan still shows a Seq Scan with `enable_seqscan = off`, the index genuinely can't serve this query (function wrapping, type mismatch, or leading wildcard). If it switches to an Index Scan, the planner is choosing Seq Scan for cost reasons — possibly because `random_page_cost` is too high for your SSD.

- **Idiom** — set `random_page_cost = 1.1` on SSD storage. The default 4.0 was calibrated for mechanical disks where random reads are 4× slower than sequential. On SSDs, random and sequential reads are nearly equal. Leaving the default makes the planner over-penalize index scans, choosing Seq Scans where Index Scans would be faster.

- **Performance** — increase `work_mem` per-session, not globally. `SET work_mem = '256MB'` before a big sort/hash query, `RESET` after. Global high `work_mem` is dangerous: each connection × each sort node can allocate that much. 100 connections × 256MB × 3 sort nodes = 75GB.

- **Performance** — set `jit = off` for OLTP workloads. JIT compilation has a startup cost (~5-10ms) that's amortized over long analytical queries but pure overhead for sub-millisecond OLTP. The `jit_above_cost` threshold (default 100000) usually excludes OLTP, but set it explicitly to be safe.

- **Debug** — use `EXPLAIN (ANALYZE, BUFFERS, TIMING)` to see per-node wall time. Without `TIMING`, you only see aggregate time. With it, you can pinpoint exactly which node (e.g., a Sort, or a Hash build) dominates, and focus your optimization there.

## ⚠️ Edge Cases & Gotchas

- **`EXPLAIN ANALYZE` executes DML**: `EXPLAIN ANALYZE DELETE FROM orders WHERE ...` actually deletes rows. Wrap in `BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;` — the plan is still displayed after rollback.

- **Cost units are arbitrary, not milliseconds**: `cost=100000` doesn't mean 100 seconds. The units are derived from `seq_page_cost` (1.0), `random_page_cost` (4.0), `cpu_tuple_cost` (0.01). Only use costs for **relative** comparison between plan alternatives, never as a time estimate. Use `ANALYZE`'s `actual time` for wall-clock measurement.

- **Index Only Scan requires a fresh visibility map**: even with a covering index, if the visibility map bit for a page is stale (pages modified since last VACUUM), the planner must do a heap fetch to check row visibility — `Heap Fetches: N > 0`. `VACUUM` updates the visibility map. This is why autovacuum frequency directly affects Index Only Scan performance.

- **Bitmap scan lossy mode**: when the bitmap exceeds memory, PostgreSQL switches to **lossy** mode — keeping only page-level granularity. This forces a `Recheck Cond` per heap row. The plan shows `Rows Removed by Index Recheck: N`. Raise `work_mem` to keep the bitmap exact.

- **Nested Loop blowup on large inputs**: the inner is executed `loops = outer_rows` times. If the inner is a Seq Scan of a 1M-row table and outer has 10000 rows, that's $10^{10}$ row examinations. Always check `loops` and multiply `actual time × loops` for total inner cost.

- **Parallel query overhead for small result sets**: the Gather node has worker startup + result merge cost. For small tables or selective queries, parallelism makes the query **slower**. The planner only parallelizes when `parallel_setup_cost + parallel_tuple_cost × rows` is lower than the serial alternative. Don't force it with `SET min_parallel_table_scan_size = 0`.

- **Estimate vs actual mismatch from stale stats**: autovacuum runs `ANALYZE` periodically, but between runs, bulk loads (`COPY`), large deletes, or skewed inserts leave stats stale. After any bulk data change, run `ANALYZE` manually. The `n_mod_since_analyze` column in `pg_stat_user_tables` shows how many rows changed since the last analyze.

- **`ANALYZE` samples, doesn't scan everything**: by default, `ANALYZE` samples `300 × statistics_target` rows (300 × 100 = 30000 rows). For highly skewed distributions, this may miss rare values. Increase `SET STATISTICS` to 1000 for columns with heavy skew.

- **Prepared statement plan caching**: a prepared statement's plan is generated once and reused. If the first call's parameters are unrepresentative (e.g., a rare selective value returns 1 row), the cached plan (Nested Loop) is catastrophic for subsequent calls (e.g., a common value returning 1M rows). PostgreSQL 16+ supports `generic plans` via `plan_cache_mode = force_generic_plan`, or use `REPREPARE` after `ANALYZE`.

## 🧠 Spot the Bug

A query runs fast in staging (10K rows) but is catastrophically slow in production (50M rows). The plan shows:

::code-wrapper{language="text"}
```text
Nested Loop  (cost=0.58..12.87 rows=1 width=52) (actual time=0.05..87000.0 rows=5000 loops=1)
  ->  Index Scan using users_email_idx on users  (cost=0.29..8.31 rows=1 width=4) (actual time=0.03..0.04 rows=1 loops=1)
        Index Cond: (email = 'vip@enterprise.com')
  ->  Index Scan using orders_customer_id_idx on orders  (cost=0.29..4.55 rows=1 width=12) (actual time=0.02..17.4 rows=5000 loops=1)
        Index Cond: (customer_id = users.id)
```
::

The index `orders_customer_id_idx` exists and is used. What's wrong?

<details>
<summary>Answer</summary>

The planner **estimated 1 row** from `orders` per user (`rows=1`), but the **actual is 5000** — this user (`vip@enterprise.com`) is an outlier with 5000 orders, while most users have ~1. The estimate comes from `pg_stats` which reflects the *average* distribution, not this outlier.

Because the planner expected 1 row, it chose a **Nested Loop** — for 1 outer row × 1 inner row, that's 1 index lookup, cheap. But with 5000 actual inner rows, it's 5000 index lookups, each traversing the B-tree from the root — `5000 × 17.4ms = 87000ms`.

The fix isn't more indexes (the index is already used). The fix is:

1. **Refresh statistics** so the planner knows about the skew:

::code-wrapper{language="sql"}
```sql
ANALYZE orders;
-- Or increase statistics target for better skew detection:
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 1000;
ANALYZE orders;
```
::

2. **If the skew persists and this query is common**, the planner should use a **Hash Join** instead (build a hash on all of this user's orders in one pass, not 5000 index probes). With accurate stats, the planner will choose Hash Join automatically. You can verify:

::code-wrapper{language="sql"}
```sql
SET enable_nestloop = off;  -- testing only — forces Hash/Merge Join
EXPLAIN ANALYZE [query];
-- If Hash Join is faster, the stats fix should make the planner choose it
```
::

**The lesson**: an Index Scan with `rows=1 (actual rows=5000)` inside a Nested Loop is the signature of **skewed statistics**. The index is used but the *join algorithm* is wrong. `ANALYZE` + higher `STATISTICS` target fixes the estimate, and the planner switches to Hash Join.

</details>