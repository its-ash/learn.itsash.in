# 27 — Advanced SQL Patterns

## Pivot / Cross-Tabulation

### Conditional Aggregation with FILTER (SQL Standard, Portable)

::code-wrapper{language="sql"}
```sql
-- Pivot: orders per customer per month, months as columns
-- FILTER clause: evaluates the aggregate ONLY for rows matching the condition
-- Rows that don't match are skipped entirely (not counted as 0 — they're absent)
-- This is different from CASE: SUM(CASE WHEN ... THEN x ELSE 0 END) counts
-- non-matching rows as 0 (affecting AVG), while FILTER excludes them
SELECT
  customer_id,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 1) AS jan,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 2) AS feb,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 3) AS mar,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 4) AS apr,
  SUM(amount)                                          AS total
FROM orders
WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-05-01'
GROUP BY customer_id
ORDER BY customer_id;
-- A customer with orders only in Feb: jan=NULL, feb=500, mar=NULL, apr=NULL
-- FILTER returns NULL for months with no matching rows (SUM of empty set = NULL)
-- Use COALESCE(SUM(...) FILTER (...), 0) if you want 0 instead of NULL
```
::

### Portable CASE Form (Universal, Slightly Slower)

::code-wrapper{language="sql"}
```sql
-- CASE form: works on every SQL engine, but the ELSE 0 is included in
-- the SUM. For SUM this is equivalent to FILTER (0 doesn't change the sum).
-- For AVG/COUNT it differs: AVG(CASE WHEN ... THEN x ELSE 0 END) counts
-- the 0s in the denominator, skewing the average down.
SELECT
  customer_id,
  SUM(CASE WHEN EXTRACT(MONTH FROM ordered_on) = 1 THEN amount ELSE 0 END) AS jan,
  SUM(CASE WHEN EXTRACT(MONTH FROM ordered_on) = 2 THEN amount ELSE 0 END) AS feb,
  SUM(CASE WHEN EXTRACT(MONTH FROM ordered_on) = 3 THEN amount ELSE 0 END) AS mar
FROM orders
GROUP BY customer_id;
-- For COUNT: COUNT(CASE WHEN ... THEN 1 END) — no ELSE, so non-matching
-- rows produce NULL, which COUNT skips. This is the portable FILTER equivalent.
```
::

### crosstab Function (PostgreSQL `tablefunc`)

::code-wrapper{language="sql"}
```sql
-- crosstab is faster for many fixed categories but requires:
-- 1. The source query ordered by row_id, then category
-- 2. A static output schema declaration (columns must be known at parse time)
-- 3. Missing category values produce NULL (not 0) for that row
CREATE EXTENSION IF NOT EXISTS tablefunc;

SELECT * FROM crosstab(
  'SELECT customer_id,
          EXTRACT(MONTH FROM ordered_on)::int AS month,
          SUM(amount)::numeric AS total
   FROM orders
   WHERE ordered_on >= ''2024-01-01'' AND ordered_on < ''2024-04-01''
   GROUP BY customer_id, month
   ORDER BY customer_id, month'
  -- The output schema MUST be declared — SQL can't infer dynamic columns
) AS ct (customer_id BIGINT, jan NUMERIC, feb NUMERIC, mar NUMERIC);
-- Note: doubled single quotes inside the string literal (''2024-01-01'')
-- crosstab has no way to handle missing months in the middle of a row —
-- if a customer has Jan and Mar but not Feb, the values SHIFT: jan gets
-- Jan's total, feb gets Mar's total. Use the 2-parameter crosstab form
-- with a category source query to avoid this misalignment.
```
::

## Gaps and Islands

### The Row-Number Difference Technique

::code-wrapper{language="sql"}
```sql
-- Problem: find consecutive-day streaks of user activity ("sessions")
-- A run of consecutive days forms an "island"; gaps separate islands
-- The trick: day - ROW_NUMBER() is constant within a run of consecutive days
--   Day 1: day=Jan 1, rn=1, diff=Dec 31  → group key
--   Day 2: day=Jan 2, rn=2, diff=Dec 31  → same group key
--   Day 3: day=Jan 5, rn=3, diff=Jan 2   → DIFFERENT key (gap of 2 days)
-- When there's a gap, day jumps but rn increments by 1, so diff changes
WITH day_marks AS (
  -- DISTINCT first: duplicate activity on the same day would break the
  -- rn-diff trick (same day, different rn → different diff → splits the run)
  SELECT DISTINCT user_id, date_trunc('day', activity_at)::date AS day
  FROM events
),
numbered AS (
  SELECT user_id, day,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day) AS rn,
    -- day - rn: subtracting an integer from a date gives a date in PG
    -- The exact value doesn't matter — only that it's CONSTANT within a run
    day - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day) AS grp
  FROM day_marks
)
SELECT user_id, grp,
  MIN(day) AS session_start,
  MAX(day) AS session_end,
  COUNT(*) AS session_days
FROM numbered
GROUP BY user_id, grp
ORDER BY user_id, session_start;
```
::

### Integer Sequence Example

::code-wrapper{language="sql"}
```sql
-- Find runs of consecutive integers in a set
WITH nums AS (
  SELECT n,
    n - ROW_NUMBER() OVER (ORDER BY n) AS grp  -- constant within a run
  FROM (VALUES (1),(2),(3),(7),(8),(10),(11),(12)) v(n)
)
SELECT MIN(n) AS start_val, MAX(n) AS end_val, COUNT(*) AS length
FROM nums
GROUP BY grp
ORDER BY start_val;
--  start_val | end_val | length
-- -----------+---------+--------
--          1 |       3 |      3
--          7 |       8 |      2
--         10 |      12 |      3
```
::

## Histograms

### width_bucket (Fixed-Width Buckets)

::code-wrapper{language="sql"}
```sql
-- Histogram of order amounts in 10 equal-width buckets from $0 to $500
-- width_bucket(value, min, max, num_buckets) returns:
--   0           if value < min
--   1..n        if value is in [min, max)
--   n           if value == max (max goes in the LAST bucket, not overflow)
--   n+1         if value > max
-- Bucket boundaries: [0,50), [50,100), ..., [450,500]
-- The range is half-open: [min, max) except the last bucket which is [max-n*step, max]
SELECT
  width_bucket(amount, 0, 500, 10) AS bucket,
  -- Reconstruct the bucket boundaries for display:
  (width_bucket(amount, 0, 500, 10) - 1) * 50 AS bucket_min,
  width_bucket(amount, 0, 500, 10) * 50 AS bucket_max,
  COUNT(*) AS count,
  ROUND(AVG(amount), 2) AS avg_in_bucket
FROM orders
WHERE amount > 0  -- exclude negative/zero; they'd go to bucket 0
GROUP BY bucket
ORDER BY bucket;
-- ⚠️ Off-by-one: a value exactly at a boundary (e.g., 50.00) goes into
-- the HIGHER bucket (bucket 2), not bucket 1. width_bucket uses [low, high)
-- half-open intervals. Only the last bucket [450, 500] is closed on both ends.
```
::

### Manual Buckets with CASE (Variable-Width)

::code-wrapper{language="sql"}
```sql
-- Variable-width buckets — useful when data is log-distributed
-- The CASE is evaluated top-to-bottom; the first matching WHEN wins
-- So ranges must be in ascending order with no gaps
SELECT
  CASE
    WHEN amount < 10   THEN '00-10'
    WHEN amount < 50   THEN '10-50'
    WHEN amount < 100  THEN '50-100'
    WHEN amount < 500  THEN '100-500'
    WHEN amount < 1000 THEN '500-1000'
    ELSE '1000+'
  END AS bucket,
  COUNT(*) AS count,
  ROUND(AVG(amount), 2) AS avg_amount
FROM orders
GROUP BY bucket
-- ORDER BY MIN(amount) sorts by the natural bucket order, not alphabetically
-- (alphabetical would put '00-10' after '100-500' — wrong)
ORDER BY MIN(amount);
```
::

## Running Medians

### Overall and Per-Group Median

::code-wrapper{language="sql"}
```sql
-- PERCENTILE_CONT is an ordered-set aggregate: it sorts the values
-- internally and interpolates for even-count groups
-- For 4 values [10, 20, 30, 40]: p=0.5 → interpolate between 20 and 30 → 25
-- PERCENTILE_DISC returns an actual value (no interpolation): → 20

-- Overall median across all orders
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount) AS p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount) AS p75,
  -- IQR (interquartile range) = p75 - p25 — useful for outlier detection
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)
    - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount) AS iqr
FROM orders;

-- Median per customer
SELECT customer_id,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median
FROM orders
GROUP BY customer_id
ORDER BY median DESC;
```
::

### Running Median (Per Row)

::code-wrapper{language="sql"}
```sql
-- There's no built-in "windowed ordered-set aggregate" in PostgreSQL
-- PERCENTILE_CONT can't be used as a window function directly
-- Workaround: self-join — for each row, compute the median of all rows
-- up to and including it
-- ⚠️ This is O(N²) — fine for <10K rows, catastrophic for millions
-- For large data: use t-digest extension for approximate running percentiles
SELECT o1.ordered_on,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o2.amount) AS running_median
FROM orders o1
JOIN orders o2 ON o2.ordered_on <= o1.ordered_on  -- all prior + current
GROUP BY o1.ordered_on
ORDER BY o1.ordered_on;
-- For production: install tdigest extension and use:
--   tdigest(0.5, amount) — approximate, O(N log N) memory, very fast
```
::

## Temporal / State-Machine Queries

### Sessionization with Window Functions

::code-wrapper{language="sql"}
```sql
-- Group user events into sessions: a new session starts when there's
-- a gap of > 30 minutes since the previous event for the same user
-- This is a classic "gaps-and-islands" applied to timestamps
WITH lagged AS (
  SELECT user_id, event_type, event_at,
    -- LAG gets the previous event time for the same user
    LAG(event_at) OVER (PARTITION BY user_id ORDER BY event_at) AS prev_event_at,
    -- Gap in seconds: if first event, prev is NULL → gap is NULL → new session
    EXTRACT(EPOCH FROM (
      event_at - LAG(event_at) OVER (PARTITION BY user_id ORDER BY event_at)
    )) AS gap_seconds
  FROM events
),
session_marks AS (
  SELECT user_id, event_type, event_at, gap_seconds,
    -- SUM(1) over a window: increments by 1 whenever a new session starts
    -- Each row where gap > 1800 (30 min) gets a 1; others get 0
    -- The cumulative sum is the session number
    SUM(CASE WHEN gap_seconds > 1800 OR gap_seconds IS NULL THEN 1 ELSE 0 END)
      OVER (PARTITION BY user_id ORDER BY event_at) AS session_num
  FROM lagged
)
SELECT user_id, session_num,
  MIN(event_at) AS session_start,
  MAX(event_at) AS session_end,
  COUNT(*) AS event_count,
  -- Session duration: from first to last event in the session
  EXTRACT(EPOCH FROM (MAX(event_at) - MIN(event_at))) AS duration_seconds
FROM session_marks
GROUP BY user_id, session_num
ORDER BY user_id, session_start;
```
::

### State Change Detection

::code-wrapper{language="sql"}
```sql
-- Find points where an entity's status changed (vs the previous row)
-- IS DISTINCT FROM treats NULL as a distinct value:
--   NULL IS DISTINCT FROM NULL → FALSE (same)
--   'active' IS DISTINCT FROM NULL → TRUE (different)
--   'active' IS DISTINCT FROM 'active' → FALSE (same)
-- This correctly handles the first row (prev_status = NULL → IS DISTINCT FROM → TRUE)
WITH lagged AS (
  SELECT id, entity_id, status, changed_at,
    LAG(status) OVER (PARTITION BY entity_id ORDER BY changed_at) AS prev_status
  FROM status_history
)
SELECT id, entity_id, status, changed_at
FROM lagged
WHERE status IS DISTINCT FROM prev_status  -- only rows where status changed
ORDER BY entity_id, changed_at;
```
::

### Time-in-State Durations

::code-wrapper{language="sql"}
```sql
-- How long was each entity in each state?
-- LEAD gets the NEXT changed_at; the difference is the time in the current state
-- The last row per entity has LEAD = NULL (still in that state — no next change)
WITH state_changes AS (
  SELECT entity_id, status, changed_at,
    LEAD(changed_at) OVER (PARTITION BY entity_id ORDER BY changed_at) AS next_change
  FROM status_history
)
SELECT entity_id, status,
  changed_at AS entered_at,
  next_change AS exited_at,
  -- COALESCE: if no next change, use now() — entity is still in this state
  COALESCE(next_change, now()) - changed_at AS duration
FROM state_changes
ORDER BY entity_id, changed_at;
```
::

## Complex Example — Sessionization + Histogram

::code-wrapper{language="sql"}
```sql
-- Combine sessionization with a histogram of session durations
-- Goal: for each user, find their sessions (30-min timeout), then
-- build a histogram of session durations across all users
WITH lagged AS (
  SELECT user_id, event_at,
    EXTRACT(EPOCH FROM (
      event_at - LAG(event_at) OVER (PARTITION BY user_id ORDER BY event_at)
    )) AS gap_seconds
  FROM events
),
sessions AS (
  SELECT user_id, event_at, gap_seconds,
    SUM(CASE WHEN gap_seconds > 1800 OR gap_seconds IS NULL THEN 1 ELSE 0 END)
      OVER (PARTITION BY user_id ORDER BY event_at) AS session_num
  FROM lagged
),
session_stats AS (
  SELECT user_id, session_num,
    MIN(event_at) AS session_start,
    MAX(event_at) AS session_end,
    EXTRACT(EPOCH FROM (MAX(event_at) - MIN(event_at))) AS duration_seconds
  FROM sessions
  GROUP BY user_id, session_num
)
-- Histogram: 0-60s, 60-300s, 300-900s, 900-1800s, 1800s+
SELECT
  CASE
    WHEN duration_seconds < 60   THEN '0-1min'
    WHEN duration_seconds < 300  THEN '1-5min'
    WHEN duration_seconds < 900  THEN '5-15min'
    WHEN duration_seconds < 1800 THEN '15-30min'
    ELSE '30min+'
  END AS duration_bucket,
  COUNT(*) AS session_count,
  ROUND(AVG(duration_seconds)::numeric, 1) AS avg_duration_seconds
FROM session_stats
GROUP BY duration_bucket
ORDER BY MIN(duration_seconds);
```
::

## Batch Insertion with RETURNING + CTE

::code-wrapper{language="sql"}
```sql
-- Insert a batch of orders and immediately use their generated IDs
-- to insert child rows (order_items) — all in one statement
WITH new_orders AS (
  INSERT INTO orders (customer_id, amount, ordered_on)
  SELECT customer_id, amount, now()
  FROM (VALUES
    (1, 50.00), (2, 75.50), (3, 120.00), (1, 30.00)
  ) AS v(customer_id, amount)
  RETURNING id, customer_id  -- RETURNING captures the generated IDs
)
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT o.id, p.id, 1, o.amount
FROM new_orders o
-- LATERAL: for each new order, look up a product (correlated subquery)
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE category_id = o.customer_id % 5 LIMIT 1
) p;
-- The CTE + RETURNING pattern lets you chain INSERTs atomically:
-- if the order_items insert fails, the orders insert is rolled back too
```
::

## Conditional UPSERT

::code-wrapper{language="sql"}
```sql
-- ON CONFLICT: if the row exists, conditionally update only if the new
-- data is "newer" or "different" — avoid unnecessary writes that trigger
-- WAL + replication traffic + index updates
INSERT INTO product_prices (product_id, price, effective_at)
VALUES (42, 19.99, '2024-06-01 10:00:00+00')
ON CONFLICT (product_id) DO UPDATE
SET price = EXCLUDED.price,
    effective_at = EXCLUDED.effective_at
WHERE product_prices.price IS DISTINCT FROM EXCLUDED.price
  -- IS DISTINCT FROM: only update if the price actually changed
  -- (handles NULL correctly: NULL IS DISTINCT FROM 19.99 → TRUE)
  OR product_prices.effective_at < EXCLUDED.effective_at;
-- Without the WHERE clause, every UPSERT writes a new row version
-- (even if nothing changed) → MVCC bloat + WAL + replication for nothing
```
::

## Dynamic SQL with EXECUTE

::code-wrapper{language="sql"}
```sql
-- Dynamic SQL: build and execute SQL at runtime inside PL/pgSQL
-- Use EXECUTE FORMAT for safe identifier injection (prevent SQL injection)
DO $$
DECLARE
  tbl text := 'orders_' || to_char(now(), 'YYYY_MM');  -- dynamic table name
  schema_name text := 'public';
BEGIN
  -- %I = identifier (quoted, injection-safe), %s = string literal, %L = literal
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.%I (
       id BIGSERIAL PRIMARY KEY,
       amount NUMERIC(10,2) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now()
     ) PARTITION BY RANGE (created_at)',
    schema_name, tbl
  );
  RAISE NOTICE 'Created table %.%', schema_name, tbl;
END $$;

-- ⚠️ NEVER use string concatenation for dynamic SQL:
--   EXECUTE 'SELECT * FROM ' || tbl;  -- SQL injection if tbl is user input
-- ALWAYS use format('%I', tbl) for identifiers, format('%L', val) for literals
```
::

## Anti-Pattern — Procedural Code Where Set-Based SQL Works

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: Multiple correlated subqueries (re-executes per row)
SELECT c.name,
  (SELECT SUM(amount) FROM orders o WHERE o.customer_id = c.id) AS total_spend,
  (SELECT COUNT(*)    FROM orders o WHERE o.customer_id = c.id) AS order_count,
  (SELECT MAX(ordered_on) FROM orders o WHERE o.customer_id = c.id) AS last_order
FROM customers c;
-- 3 correlated subqueries → 3 index lookups per customer → O(N × 3 × log M)
-- Each subquery is planned and executed independently

-- ✅ RIGHT: Single scan with window/aggregate functions
SELECT c.name, COALESCE(o.total_spend, 0) AS total_spend,
       COALESCE(o.order_count, 0) AS order_count, o.last_order
FROM customers c
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS total_spend,
         COUNT(*)    AS order_count,
         MAX(ordered_on) AS last_order
  FROM orders o WHERE o.customer_id = c.id
) o ON true;
-- LATERAL: one pass over orders per customer, all aggregates computed together
-- Or even simpler — a plain JOIN + GROUP BY:
SELECT c.name, COALESCE(SUM(o.amount), 0) AS total_spend,
       COUNT(o.id) AS order_count, MAX(o.ordered_on) AS last_order
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name;
```
::

## 💡 Tips & Tricks

- **Idiom** — use `SUM(amount) FILTER (WHERE cond)` for conditional aggregation. It's SQL standard, one pass over the data, and correctly excludes non-matching rows from `AVG`/`COUNT` (unlike `CASE ... ELSE 0` which includes 0s in the denominator). `CASE` is the portable fallback for engines without `FILTER`.

- **Idiom** — the gaps-and-islands row-number trick: `value - ROW_NUMBER() OVER (ORDER BY value)` is constant within a run and jumps at gaps. Works for dates, integers, any ordered sequence. Always `DISTINCT` first if duplicates exist — same value with different `rn` produces different `grp`, splitting the run.

- **Idiom** — `width_bucket(v, min, max, n)` for histograms: `v=min` → bucket 1, `v=max` → bucket `n` (max goes in last, not overflow), `v < min` → bucket 0, `v > max` → bucket `n+1`. Half-open intervals `[low, high)` except the last bucket. Reconstruct boundaries as `(bucket-1) × step` and `bucket × step`.

- **Idiom** — `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` for medians. Interpolates for even-count groups (average of two middle values). Use `PERCENTILE_DISC` for an actual value (no interpolation). Can't be a window function — use self-join (O(N²)) or t-digest (approximate, O(N log N)) for running medians.

- **Idiom** — sessionization pattern: `LAG` to compute gap → `SUM(CASE WHEN gap > threshold THEN 1 ELSE 0 END) OVER (...)` as a running session counter. Each gap > threshold increments the counter, creating a new session ID. This is the standard way to group events into sessions in pure SQL.

- **Idiom** — `LATERAL` for correlated subqueries: `LEFT JOIN LATERAL (SELECT ... WHERE child.col = parent.col) ON true`. The subquery can reference parent columns (like a correlated subquery) but returns a join row (not a scalar). Useful for per-row aggregation or top-N-per-group without a window function.

- **Idiom** — `array_agg(col ORDER BY sort_col)` to build ordered lists in a single aggregate. `array_agg` doesn't guarantee order without `ORDER BY` inside the aggregate — always specify it. Useful for denormalizing child rows into a single column: `array_agg(product_name ORDER BY item_id)`.

## ⚠️ Edge Cases & Gotchas

- **`FILTER` vs `CASE` performance**: `FILTER` can be slightly faster because the engine skips non-matching rows entirely (no evaluation of the ELSE branch). In PostgreSQL, the difference is usually negligible — the planner optimizes `CASE` well. Choose `FILTER` for readability and correctness with `AVG`/`COUNT`.

- **Gaps-and-islands with NULL dates**: if `day` can be NULL, `day - ROW_NUMBER()` produces NULL, and `GROUP BY NULL` lumps all NULL-day rows into one group. Filter NULLs first: `WHERE day IS NOT NULL` in the `day_marks` CTE.

- **`width_bucket` boundary off-by-one**: a value exactly at a bucket boundary (e.g., 50.00 with buckets [0,500] in 10) goes into the **higher** bucket (bucket 2, not bucket 1). Intervals are `[low, high)` half-open. Only the last bucket is `[max-step, max]` (closed on both ends). If you need different boundary behavior, use manual `CASE` buckets.

- **`PERCENTILE_CONT` interpolation**: for even N, the median is the linear interpolation of the two middle values. For `[10, 20, 30, 40]`, p=0.5 → 25.0 (average of 20 and 30). This may surprise users expecting an "actual" data point. Use `PERCENTILE_DISC` for a non-interpolated value (returns 20 for the same input with p=0.5, since it picks the value at position `ceil(0.5 × N)`).

- **Session timeout edge cases**: if the first event has `prev_event_at = NULL`, the gap is NULL. `gap_seconds > 1800` evaluates to NULL (not TRUE), so the first event wouldn't start a new session without the `OR gap_seconds IS NULL` guard. Always handle the first-row case explicitly.

- **`crosstab` output schema declaration**: the output column types and names must be declared statically — `AS ct (customer_id BIGINT, jan NUMERIC, ...)`. If the source query returns fewer categories than declared columns, extra columns are NULL. If it returns more, they're silently dropped. Use the 2-parameter `crosstab(source_sql, category_sql)` form to pin category ordering and avoid value-shifting.

- **`array_agg` ordering**: `array_agg(x)` does NOT guarantee element order without `ORDER BY` inside the aggregate: `array_agg(x ORDER BY y)`. The planner may happen to produce sorted output due to an index scan, but this is not guaranteed and can change between plans. Always specify `ORDER BY`.

- **Dynamic columns can't be pivoted in pure SQL**: SQL requires all output columns to be known at parse time. To pivot an arbitrary number of categories, either hardcode them (if known), generate SQL dynamically in application code, or return rows (not columns) and pivot in the client.

## 🧠 Spot the Bug

This gaps-and-islands query is supposed to find consecutive-day streaks per user, but it produces wrong groupings — some users have sessions split across multiple groups despite having consecutive days. Why?

::code-wrapper{language="sql"}
```sql
WITH numbered AS (
  SELECT user_id, activity_date,
    activity_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date) AS grp
  FROM user_activity
)
SELECT user_id, grp, MIN(activity_date) AS start_date, MAX(activity_date) AS end_date
FROM numbered
GROUP BY user_id, grp
ORDER BY user_id, start_date;
```
::

<details>
<summary>Answer</summary>

The query doesn't `DISTINCT` the `(user_id, activity_date)` pairs first. If a user has **multiple activity records on the same day**, each gets a different `ROW_NUMBER()` but the same `activity_date`. This means:

- Day Jan 1, row 1: `activity_date = Jan 1`, `rn = 1`, `grp = Dec 31`
- Day Jan 1, row 2: `activity_date = Jan 1`, `rn = 2`, `grp = Dec 30` ← **different grp!**
- Day Jan 2, row 3: `activity_date = Jan 2`, `rn = 3`, `grp = Dec 30`

The duplicate day splits into two groups, and the next day may join the wrong group. The `grp` values are inconsistent because `ROW_NUMBER` increments per row, not per day.

Fix: `DISTINCT` the days first, so each day appears once and `ROW_NUMBER` increments per unique day:

::code-wrapper{language="sql"}
```sql
WITH day_marks AS (
  SELECT DISTINCT user_id, activity_date  -- ← deduplicate first
  FROM user_activity
),
numbered AS (
  SELECT user_id, activity_date,
    activity_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date) AS grp
  FROM day_marks
)
SELECT user_id, grp, MIN(activity_date) AS start_date, MAX(activity_date) AS end_date,
       COUNT(*) AS streak_days
FROM numbered
GROUP BY user_id, grp
ORDER BY user_id, start_date;
```
::

Alternatively, use `DENSE_RANK` instead of `ROW_NUMBER` — `DENSE_RANK` gives the same rank to identical values, so duplicates on the same day get the same `rn`, and `activity_date - DENSE_RANK()` stays consistent. But `DISTINCT` is cleaner and more efficient (fewer rows to process).

**The lesson**: the row-number-difference trick requires **unique, consecutive** values in the `ORDER BY` column. Duplicates break the invariant that `value - rn` is constant within a run. Always `DISTINCT` first or use `DENSE_RANK`.

</details>