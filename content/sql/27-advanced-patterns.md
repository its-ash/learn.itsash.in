# 27 — Advanced SQL Patterns

This chapter collects powerful query patterns that go beyond basic SELECT/JOIN: pivots (cross-tabs), gaps-and-islands, running medians, histograms, and temporal/state-machine queries. These are the "SQL puzzles" that come up in analytics and reporting.

## Pivot / Cross-Tabulation

Turn rows into columns. Two approaches:

### Conditional Aggregation (portable)

::code-wrapper{language="sql"}
```sql
-- Orders per customer per month, with months as columns
SELECT
  customer_id,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 1) AS jan,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 2) AS feb,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 3) AS mar,
  SUM(amount) AS total
FROM orders
WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-04-01'
GROUP BY customer_id
ORDER BY customer_id;
```
::

`SUM(...) FILTER (WHERE ...)` is PostgreSQL/SQL standard. The portable form is `SUM(CASE WHEN ... THEN amount ELSE 0 END)`:

::code-wrapper{language="sql"}
```sql
SELECT
  customer_id,
  SUM(CASE WHEN EXTRACT(MONTH FROM ordered_on) = 1 THEN amount ELSE 0 END) AS jan,
  SUM(CASE WHEN EXTRACT(MONTH FROM ordered_on) = 2 THEN amount ELSE 0 END) AS feb
FROM orders GROUP BY customer_id;
``
::

### `crosstab` (PostgreSQL `tablefunc`)

::code-wrapper{language="sql"}
```sql
CREATE EXTENSION tablefunc;

SELECT * FROM crosstab(
  'SELECT customer_id, EXTRACT(MONTH FROM ordered_on), SUM(amount)
   FROM orders WHERE ordered_on >= ''2024-01-01'' AND ordered_on < ''2024-04-01''
   GROUP BY customer_id, EXTRACT(MONTH FROM ordered_on)
   ORDER BY customer_id'
) AS ct (customer_id BIGINT, jan NUMERIC, feb NUMERIC, mar NUMERIC);
``
::

`crosstab` is faster for many categories but requires the output schema to be declared statically. Conditional aggregation is more flexible and portable.

## Gaps and Islands

Find runs of consecutive values (islands) and the gaps between them. Classic problem: "find consecutive days a user was active."

### The row-number difference technique

::code-wrapper{language="sql"}
```sql
-- Sessions: consecutive days of activity form a "session"
WITH day_marks AS (
  SELECT DISTINCT user_id, date_trunc('day', activity_at)::date AS day
  FROM events
),
numbered AS (
  SELECT user_id, day,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day) AS rn,
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
``
::

The trick: `day - rn` is constant within a run of consecutive days (each day increments by 1, and `rn` increments by 1, so the difference stays the same). When there's a gap, `day` jumps but `rn` keeps incrementing by 1, so the difference changes — marking a new group.

### Example with integer sequences

::code-wrapper{language="sql"}
```sql
-- Find runs of consecutive integers
WITH nums AS (
  SELECT n, n - ROW_NUMBER() OVER (ORDER BY n) AS grp
  FROM (VALUES (1),(2),(3),(7),(8),(10),(11),(12)) v(n)
)
SELECT MIN(n) AS start, MAX(n) AS end, COUNT(*) AS length
FROM nums GROUP BY grp ORDER BY start;
--  start | end | length
-- -------+-----+--------
--      1 |   3 |   3
--      7 |   8 |   2
--     10 |  12 |   3
``
::

## Histograms

Bucket values and count per bucket:

### Fixed-width buckets

::code-wrapper{language="sql"}
```sql
-- Histogram of order amounts in $50 buckets
SELECT
  width_bucket(amount, 0, 500, 10) AS bucket,
  MIN(amount) AS bucket_min,
  MAX(amount) AS bucket_max,
  COUNT(*) AS count
FROM orders
GROUP BY bucket ORDER BY bucket;
``
::

`width_bucket(value, min, max, num_buckets)` returns the bucket number (1-based; 0 is below min, `num_buckets+1` is above max).

### Manual buckets with `CASE`

::code-wrapper{language="sql"}
```sql
SELECT
  CASE
    WHEN amount < 10   THEN '0-10'
    WHEN amount < 50   THEN '10-50'
    WHEN amount < 100  THEN '50-100'
    WHEN amount < 500  THEN '100-500'
    ELSE '500+'
  END AS bucket,
  COUNT(*) AS count
FROM orders
GROUP BY bucket
ORDER BY MIN(amount);
``
::

## Running Median

PostgreSQL has `PERCENTILE_CONT` as an ordered-set aggregate:

::code-wrapper{language="sql"}
```sql
-- Overall median
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median
FROM orders;

-- Median per customer
SELECT customer_id,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median
FROM orders
GROUP BY customer_id;
``
::

### Running median (per row)

There's no built-in "running median," but a windowed ordered-set aggregate isn't supported directly. Use a self-join or a custom aggregate. A common approach:

::code-wrapper{language="sql"}
```sql
-- Median of all orders up to and including the current row (by date)
SELECT o1.ordered_on,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o2.amount) AS running_median
FROM orders o1
JOIN orders o2 ON o2.ordered_on <= o1.ordered_on
GROUP BY o1.ordered_on
ORDER BY o1.ordered_on;
``
::

This is O(N²) — fine for small data, expensive for large. For large datasets, approximate medians (t-digest, `tdigest` extension) are practical.

## Temporal / State Machine Queries

### State changes (when did status change?)

::code-wrapper{language="sql"}
```sql
-- Find points where the status changed (vs the previous row)
WITH lagged AS (
  SELECT id, status, changed_at,
    LAG(status) OVER (PARTITION BY entity_id ORDER BY changed_at) AS prev_status
  FROM status_history
)
SELECT id, entity_id, status, changed_at
FROM lagged
WHERE status IS DISTINCT FROM prev_status;   -- first row has prev_status = NULL
``
::

`LAG` + `IS DISTINCT FROM` is the pattern for "rows where a value changed."

### Time-in-state (durations)

::code-wrapper{language="sql"}
```sql
-- How long was each entity in each state?
WITH state_changes AS (
  SELECT entity_id, status, changed_at,
    LEAD(changed_at) OVER (PARTITION BY entity_id ORDER BY changed_at) AS next_change
  FROM status_history
)
SELECT entity_id, status,
  changed_at AS entered_at,
  next_change AS exited_at,
  next_change - changed_at AS duration
FROM state_changes
ORDER BY entity_id, changed_at;
``
::

The last row has `next_change = NULL` (still in that state).

## Top-N per Group

Already covered (chapter 09), but the general pattern:

::code-wrapper{language="sql"}
```sql
WITH ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY group_col ORDER BY sort_col DESC) AS rn
  FROM t
)
SELECT * FROM ranked WHERE rn <= N;
``
::

## Deduplication (keep one row per group)

::code-wrapper{language="sql"}
```sql
-- Keep the most recent row per user, delete the rest
DELETE FROM events
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM events
  ) t WHERE rn > 1
);
``
::

## Cumulative / Running Aggregates

::code-wrapper{language="sql"}
```sql
-- Running sum, count, and average
SELECT
  ordered_on,
  amount,
  SUM(amount) OVER (ORDER BY ordered_on) AS running_sum,
  COUNT(*)   OVER (ORDER BY ordered_on) AS running_count,
  AVG(amount) OVER (ORDER BY ordered_on ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS moving_avg_10
FROM orders;
``
::

## Year-over-Year and Month-over-Month Growth

::code-wrapper{language="sql"}
```sql
-- MoM growth in monthly revenue
WITH monthly AS (
  SELECT date_trunc('month', ordered_on) AS month, SUM(amount) AS revenue
  FROM orders GROUP BY month
)
SELECT month, revenue,
  LAG(revenue) OVER (ORDER BY month) AS prev_month,
  revenue - LAG(revenue) OVER (ORDER BY month) AS mom_delta,
  ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
        / NULLIF(LAG(revenue) OVER (ORDER BY month), 0), 2) AS mom_pct
FROM monthly
ORDER BY month;
``
::

`NULLIF(prev, 0)` prevents division by zero (returns NULL, which `ROUND` propagates).

## 💡 Tips & Tricks

- **Idiom**: use **conditional aggregation** (`SUM(amount) FILTER (WHERE ...)`) for pivots/cross-tabs — it's portable (SQL standard), flexible (any condition), and one pass over the data. Reserve `crosstab()` for cases with many fixed categories where the static schema is acceptable.
- **Idiom**: for **gaps-and-islands**, the row-number-difference trick (`value - ROW_NUMBER() OVER (ORDER BY value)`) is the classic — the difference is constant within a run and changes at gaps, giving a free group key. Works for dates, integers, and any ordered sequence.
- **Idiom**: use `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` for medians — it's the SQL-standard ordered-set aggregate, handles even/odd counts correctly, and works as a per-group aggregate. For running medians on large data, use an approximate (t-digest) — exact running median is O(N²).
- **Idiom**: for **state-machine queries** (when did status change, time-in-state), combine `LAG`/`LEAD` with `IS DISTINCT FROM` — `LAG(status) ... WHERE status IS DISTINCT FROM prev_status` finds change points; `LEAD(changed_at) - changed_at` computes durations.
- **Idiom**: use `NULLIF(prev, 0)` in division for growth rates — it converts a zero denominator to NULL (resulting in NULL instead of a division-by-zero error), which `ROUND`/`COALESCE` can then handle gracefully.

## ⚠️ Edge Cases & Gotchas

- **Pivot with dynamic columns**: SQL requires columns to be known at parse time — you can't pivot an arbitrary number of categories in a single SQL query. Either hardcode the categories (if known), or generate the SQL dynamically (in application code), or return rows (not columns) and pivot in the client.
- **`FILTER` vs `CASE` in aggregates**: `SUM(x) FILTER (WHERE cond)` is cleaner and slightly faster than `SUM(CASE WHEN cond THEN x ELSE 0 END)`, but `FILTER` is SQL:2003 (not all engines). `CASE` is universal.
- **Gaps-and-islands with duplicate dates**: if `day` can have duplicates, `day - ROW_NUMBER()` can collide (two rows with the same `day` get different `rn`s, but the same `day - rn`? No — different `rn` means different `grp`, splitting a run). `SELECT DISTINCT day` first, or use `DENSE_RANK` instead of `ROW_NUMBER`.
- **`PERCENTILE_CONT` interpolates**: for an even number of values, the median is the average of the two middle values (linear interpolation). `PERCENTILE_DISC` returns an actual value (no interpolation). Pick based on whether you want a "smooth" or "actual" percentile.
- **`width_bucket` boundaries**: `width_bucket(v, min, max, n)` puts `v = min` in bucket 1, `v = max` in bucket `n`, `v < min` in bucket 0, `v > max` in bucket `n+1`. The range is [min, max] inclusive — values exactly at max go in the last bucket, not over.
- **Running aggregates and `RANGE` peers**: `SUM(x) OVER (ORDER BY d)` with the default `RANGE` frame includes peers (rows with the same `d`) — the running sum "jumps" at ties. Use `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` for strict per-row accumulation (chapter 09).
- **Self-joins for running aggregates are O(N²)**: the `JOIN ... ON o2.date <= o1.date` pattern for running medians is quadratic — fine for thousands of rows, catastrophic for millions. Use window functions for running sums/counts (O(N log N)); use approximate algorithms for running medians on large data.
- **`LAG`/`LEAD` at partition boundaries**: return NULL at the first/last row of a partition (no previous/next row). `LEAD(ts)` for the last row is NULL — handle it (e.g., `COALESCE(LEAD(ts), now())` for "still in this state").
- **`NULLIF(x, 0)` then `ROUND`**: `ROUND(100.0 * (a - b) / NULLIF(b, 0), 2)` — if `b` is 0, the division is NULL, and `ROUND(NULL)` is NULL. Use `COALESCE(..., 0)` if you want 0 instead of NULL for the "infinite growth" case.

## 🧠 Spot the Bug

This query computes month-over-month growth, but every row's `mom_pct` is NULL. Why?

::code-wrapper{language="sql"}
```sql
WITH monthly AS (
  SELECT date_trunc('month', ordered_on) AS month, SUM(amount) AS revenue
  FROM orders GROUP BY month
)
SELECT month, revenue,
  ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
        / LAG(revenue) OVER (ORDER BY month), 2) AS mom_pct
FROM monthly ORDER BY month;
```
::

<details>
<summary>Answer</summary>

Two issues:

1. **Division by zero**: if any month has `revenue = 0` (no orders), `LAG(revenue)` is 0 for the *next* month's calculation, and `x / 0` is a division-by-zero error — but actually, in this query, the `LAG(revenue)` is the *previous* month's revenue, and dividing by it is fine unless the previous month was 0. If the previous month was 0, this errors (not NULL).

2. **The actual "all NULL" symptom**: the first row has `LAG(revenue) = NULL` (no previous row), so `revenue - NULL = NULL` and `NULL / NULL = NULL` — the first row is correctly NULL. But if *all* rows are NULL, the likely cause is that `revenue` itself is NULL — `SUM(amount)` over a month with only NULL `amount`s (or no rows) is NULL, and arithmetic with NULL propagates NULL.

But the most common real cause of "all NULL": the developer used `LAG(revenue) OVER (ORDER BY month)` *twice* (once in the numerator, once in the denominator), and one of them returns NULL for the first row — but that only affects the first row.

The robust fix — use `NULLIF` to handle zero, `COALESCE` to handle NULL, and avoid repeating the `LAG`:

```sql
WITH monthly AS (
  SELECT date_trunc('month', ordered_on) AS month, SUM(amount) AS revenue
  FROM orders GROUP BY month
),
with_lag AS (
  SELECT month, revenue,
    LAG(revenue) OVER (ORDER BY month) AS prev_revenue
  FROM monthly
)
SELECT month, revenue, prev_revenue,
  ROUND(100.0 * (revenue - prev_revenue) / NULLIF(prev_revenue, 0), 2) AS mom_pct
FROM with_lag
ORDER BY month;
```
::
This computes `LAG` once (in a CTE), uses `NULLIF(prev_revenue, 0)` to avoid division by zero (returns NULL for zero previous revenue), and accepts NULL `mom_pct` for the first row (no previous month).

**The lesson**: don't repeat window functions — compute once in a CTE and reference. And guard division with `NULLIF(denominator, 0)` to convert zero-divisor to NULL instead of an error.

</details>

## Summary

You can now pivot with conditional aggregation, solve gaps-and-islands with the row-number-difference trick, build histograms with `width_bucket` or `CASE`, compute medians with `PERCENTILE_CONT`, analyze state transitions with `LAG`/`LEAD`/`IS DISTINCT FROM`, and compute growth rates with `NULLIF` guards. Next: database administration essentials.