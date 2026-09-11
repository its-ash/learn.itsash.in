# 09 — Window Functions

Window functions perform calculations across a set of rows *related to the current row*, without collapsing them like `GROUP BY` does. They are the most powerful analytical feature in SQL — ranking, running totals, moving averages, lead/lag comparisons, and "top-N per group" all become one-liners.

## The Core Idea

A window function:

1. **Partitions** the result set into groups (`PARTITION BY`).
2. **Orders** each partition (`ORDER BY`).
3. Defines a **frame** (the subset of rows used for the current calculation).
4. Computes a value per row, **keeping all rows** in the output (no collapse).

::code-wrapper{language="sql"}
```sql
-- Running total per customer, ordered by date.
-- GROUP BY would collapse each customer into one row; the window function keeps them all.
-- Default frame (with ORDER BY): RANGE UNBOUNDED PRECEDING TO CURRENT ROW → running accumulation.
SELECT
  customer_id,
  ordered_on,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on) AS running_total
FROM orders;
```
::

## Anatomy of a Window Function

::code-wrapper{language="text"}
```text
function(args) OVER (
  [PARTITION BY ...]     -- groups; default = whole result set is one partition
  [ORDER BY ...]         -- order within each partition; default = unspecified (no order guarantee)
  [frame_clause]         -- which rows to include; default depends on function + presence of ORDER BY
)
```
::

- **`PARTITION BY`** — divides rows into independent groups. Omit it and the whole result set is one partition.
- **`ORDER BY`** — orders rows *within* each partition. For ranking functions (`ROW_NUMBER`, `RANK`), it's essential. For pure aggregates without `ORDER BY`, the frame is the whole partition.
- **Frame** — defines the window's row range. Defaults differ by function (see below).

## Ranking Functions

| Function | Behavior on ties |
|---|---|
| `ROW_NUMBER()` | Unique sequential number — ties get arbitrary but distinct numbers. |
| `RANK()` | Same rank for ties, then **skips** (1, 1, 3). |
| `DENSE_RANK()` | Same rank for ties, **no skip** (1, 1, 2). |
| `PERCENT_RANK()` | Relative rank as a fraction: `(rank - 1) / (total - 1)`. |
| `CUME_DIST()` | Cumulative distribution: rows with value ≤ current / total. |
| `NTILE(n)` | Divides partition into `n` equal-ish buckets; returns bucket number. |

::code-wrapper{language="sql"}
```sql
-- Rank orders by amount within each customer.
-- For amounts [450, 100, 100, 50] within a customer:
--   ROW_NUMBER: 1, 2, 3, 4  (ties get distinct arbitrary numbers — non-deterministic without tie-breaker)
--   RANK:       1, 2, 2, 4  (skips 3 after the tie)
--   DENSE_RANK: 1, 2, 2, 3  (no skip — next distinct value gets next rank)
SELECT
  customer_id,
  id AS order_id,
  amount,
  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn,
  RANK()       OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS drnk
FROM orders;
```
::

### Top-N per Group — Canonical Pattern

::code-wrapper{language="sql"}
```sql
-- Find the top 3 orders per customer.
-- ROW_NUMBER (not RANK/DENSE_RANK) is the right choice for "exactly N":
-- it never produces ties, so rn <= 3 returns exactly 3 rows per partition
-- (or fewer if the partition is smaller).
-- Wrap in a CTE because window functions can't appear in WHERE (computed after WHERE).
WITH ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC, id) AS rn
    -- ↑ added 'id' as tie-breaker for deterministic ordering on equal amounts
  FROM orders
)
SELECT * FROM ranked WHERE rn <= 3;
```
::

## Aggregate Functions as Windows

Any aggregate (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`) can be a window function with `OVER`:

::code-wrapper{language="sql"}
```sql
-- Each order alongside its customer's total and the overall average.
-- Without ORDER BY in OVER, the frame is the ENTIRE partition → every row gets the same value.
-- SUM OVER (PARTITION BY customer_id) → customer's total (same for all their orders).
-- AVG OVER () → grand average across all rows (empty OVER = whole result set is one partition).
SELECT
  id,
  customer_id,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id) AS customer_total,  -- same per customer
  AVG(amount) OVER ()                       AS overall_avg          -- same for all rows
FROM orders;
```
::

## Frames — ROWS vs RANGE vs GROUPS

The frame specifies which rows the function sees, relative to the current row:

::code-wrapper{language="text"}
```text
{ROWS | RANGE | GROUPS} BETWEEN <start> AND <end>
  <start>/<end> := UNBOUNDED PRECEDING | <n> PRECEDING | CURRENT ROW | <n> FOLLOWING | UNBOUNDED FOLLOWING
```
::

### Default Frames (when ORDER BY is present)

- For `SUM`, `AVG`, `MIN`, `MAX`, `COUNT` — **`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`** (running aggregate, including all **peers** with the same order key as the current row).
- For ranking functions (`ROW_NUMBER`, `RANK`, etc.) — the whole partition (frame is irrelevant; they use the order, not a frame).
- For `LAG`/`LEAD`/`FIRST_VALUE`/`LAST_VALUE` — the whole partition.

### Common Frame Patterns

::code-wrapper{language="sql"}
```sql
-- Running total (sum from partition start to current row, strict row-count).
-- ROWS: exactly one row per step. Use this for row-by-row accumulation.
SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)

-- Running total EXCLUDING the current row (sum of all rows before this one).
SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)

-- Moving average over a 3-row window (1 before + current + 1 after).
AVG(amount) OVER (ORDER BY ordered_on
  ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)

-- Sum of the whole partition (same for every row — no ORDER BY, frame = full partition).
SUM(amount) OVER (PARTITION BY customer_id)

-- Cumulative sum up to and including all peers (default RANGE behavior).
-- RANGE CURRENT ROW includes all rows with the same ORDER BY value as the current row.
SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on)
```
::

### ROWS vs RANGE vs GROUPS

| Mode | Meaning of `n PRECEDING`/`FOLLOWING` |
|---|---|
| `ROWS` | Exactly `n` rows before/after, counting physical rows. |
| `RANGE` | All rows whose `ORDER BY` value is within `n` of the current row's value. Needs a numeric `ORDER BY`. |
| `GROUPS` | All peer groups (rows with the same `ORDER BY` value) within `n` groups. |

`RANGE` and `GROUPS` deal with ties — `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` (the default) includes all **peers** (rows with the same `ORDER BY` value), which is why a running total over ties gives the same value for all tied rows. Use `ROWS` for strict row-count semantics.

## Value Functions

| Function | Returns |
|---|---|
| `LAG(col, n, default)` | Value of `col` from `n` rows **before** the current row. |
| `LEAD(col, n, default)` | Value of `col` from `n` rows **after**. |
| `FIRST_VALUE(col)` | First value in the frame. |
| `LAST_VALUE(col)` | Last value in the frame (⚠️ see below). |
| `NTH_VALUE(col, n)` | Nth value in the frame. |

::code-wrapper{language="sql"}
```sql
-- Day-over-day change in amount.
-- LAG(amount, 1, 0): previous row's amount; default 0 if no previous row (first row in partition).
SELECT
  ordered_on,
  amount,
  amount - LAG(amount) OVER (ORDER BY ordered_on) AS daily_delta,
  amount - LAG(amount, 1, 0) OVER (ORDER BY ordered_on) AS delta_with_default
FROM orders;

-- Compare each order to the customer's first order.
-- FIRST_VALUE with ASC order → the earliest order's amount.
SELECT
  customer_id, ordered_on, amount,
  amount - FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on) AS diff_from_first
FROM orders;
```
::

## Complex Implementation: 7-Day Moving Average with Proper Frame

::code-wrapper{language="sql"}
```sql
-- 7-day moving average of daily revenue.
-- The frame is defined by ROWS BETWEEN 6 PRECEDING AND CURRENT ROW:
--   current row + 6 preceding rows = 7 rows total (the 7-day window).
-- ROWS (not RANGE) ensures exactly 7 physical rows, regardless of date gaps.
--   Note: if dates are missing (no orders on some days), ROWS counts rows, not calendar days.
--   For true calendar-day windows, use RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW.
SELECT
  ordered_on,
  daily_revenue,
  AVG(daily_revenue) OVER (
    ORDER BY ordered_on
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW    -- 7-row sliding window
  ) AS moving_avg_7d,
  -- True calendar 7-day window using RANGE with interval (PostgreSQL).
  -- This handles gaps: if a date is missing, RANGE still looks back 6 calendar days.
  AVG(daily_revenue) OVER (
    ORDER BY ordered_on
    RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
  ) AS moving_avg_7d_calendar
FROM (
  -- Stage 1: aggregate to daily revenue (window functions operate on rows, not pre-aggregated).
  SELECT DATE(ordered_on) AS ordered_on, SUM(amount) AS daily_revenue
  FROM orders
  GROUP BY DATE(ordered_on)
) daily
ORDER BY ordered_on;
```
::

## Complex Implementation: Top-N per Group with ROW_NUMBER

::code-wrapper{language="sql"}
```sql
-- Top 3 highest-value orders per customer, with rank and customer's total for context.
-- ROW_NUMBER ensures exactly 3 per customer (no ties, no extra rows).
-- The outer WHERE filters on rn (window functions computed after WHERE, so need a CTE/subquery).
SELECT
  customer_id,
  customer_name,
  order_id,
  amount,
  rn AS rank_in_customer,
  customer_total,
  customer_total - amount AS rest_of_orders_total
FROM (
  SELECT
    o.customer_id,
    c.name AS customer_name,
    o.id AS order_id,
    o.amount,
    ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.amount DESC, o.id) AS rn,
    -- Tie-breaker: o.id ensures deterministic ranking when amounts are equal.
    SUM(o.amount) OVER (PARTITION BY o.customer_id) AS customer_total
    -- ↑ customer's lifetime total (no ORDER BY → frame = full partition → same for all their rows)
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
) ranked
WHERE rn <= 3
ORDER BY customer_id, rn;
```
::

## Anti-Pattern: Default Frame with FIRST_VALUE/LAST_VALUE

### ❌ Wrong Way — LAST_VALUE with Default Frame

::code-wrapper{language="sql"}
```sql
-- Intent: get each customer's most recent order amount.
-- Bug: the default frame (with ORDER BY) is RANGE UNBOUNDED PRECEDING TO CURRENT ROW.
-- The frame ENDS at the current row → LAST_VALUE = the current row's value, not the partition's last.
SELECT
  customer_id,
  ordered_on,
  amount,
  LAST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on) AS last_amount
FROM orders;
-- 'last_amount' equals 'amount' for every row — NOT what was intended.
```
::

### ✅ Right Way — Explicit Frame or FIRST_VALUE with DESC

::code-wrapper{language="sql"}
```sql
-- Option 1: extend the frame to the partition end.
LAST_VALUE(amount) OVER (
  PARTITION BY customer_id ORDER BY ordered_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING  -- frame = whole partition
)

-- Option 2 (cleaner): FIRST_VALUE with descending order.
-- The first row in DESC order is the most recent → no frame trap.
FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on DESC)
```
::

## Window Naming — Reusable OVER Clauses

If you repeat the same `OVER (...)` clause, name it with `WINDOW` and reference it:

::code-wrapper{language="sql"}
```sql
-- WINDOW clause: define the partition/order once, reference by name.
-- Reduces repetition and makes the partitioning strategy explicit.
SELECT
  customer_id, ordered_on, amount,
  ROW_NUMBER() OVER cust_window AS rn,
  SUM(amount)   OVER cust_window AS running_total,    -- same OVER as rn
  AVG(amount)   OVER cust_window AS running_avg        -- same OVER as rn
FROM orders
WINDOW cust_window AS (PARTITION BY customer_id ORDER BY ordered_on);
```
::

## 💡 Tips & Tricks

- **Idiom** — use `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) AS rn` + `WHERE rn <= N` for "top-N per group." It's the most portable pattern (works in every modern database), unlike `DISTINCT ON` (PostgreSQL-only) or `LATERAL` (engine-specific).
- **Performance** — window functions require **sorting** the partition by the `ORDER BY` key. If that key isn't indexed, the planner does an explicit sort (memory permitting, else disk spill). For large partitions, an index on `(partition_cols..., order_col)` lets the planner use an index scan and avoid the sort.
- **Idiom** — prefer `FIRST_VALUE(x) OVER (... ORDER BY ... DESC)` over `LAST_VALUE(x) OVER (... ROWS BETWEEN ... UNBOUNDED FOLLOWING)` for "last value in partition." The `FIRST_VALUE`-with-`DESC` form avoids the `LAST_VALUE` default-frame trap and is one less clause to get wrong.
- **Idiom** — use `COUNT(*) OVER ()` (empty `OVER`) to attach a total row count to every row — handy for paginated APIs that need `total_count` alongside each page's rows, without a separate `count(*)` query.
- **Performance** — `ROWS` vs `RANGE`: `ROWS` is O(1) per step (sliding window via addition/subtraction). `RANGE` with intervals may require re-scanning rows within the range — more expensive. Use `ROWS` when you mean "N physical rows"; use `RANGE` only when you need value-based windows (e.g., calendar-day windows with gaps).
- **Debug** — when a running total looks wrong (jumps, repeats, or excludes the current row), check the frame. The default `RANGE` frame includes peers (ties), which can make the total "jump" at ties. Switch to `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` for strict row-by-row accumulation.

## ⚠️ Edge Cases & Gotchas

- **Window functions can't appear in `WHERE`** — they're computed *after* `WHERE`/`GROUP BY`/`HAVING` (logically, in the `SELECT` phase). Filter on window values in an outer query or CTE: `WITH t AS (SELECT ..., ROW_NUMBER() OVER (...) AS rn FROM ...) SELECT * FROM t WHERE rn <= 3`.
- **NULLs in `ORDER BY` for window functions** — NULLs sort first or last depending on the engine (`NULLS LAST` is PostgreSQL default for ASC). Use explicit `NULLS FIRST`/`NULLS LAST` in the window `ORDER BY` if NULL position matters.
- **Peer groups in `RANK` vs `ROW_NUMBER`** — `RANK` gives the same rank to ties and skips the next rank (1, 1, 3). `ROW_NUMBER` gives distinct arbitrary numbers to ties (1, 2, 3 or 1, 3, 2 — non-deterministic). For stable `ROW_NUMBER`, add a unique tie-breaker: `ORDER BY amount DESC, id`.
- **Default frame for aggregates with `ORDER BY` vs without** — with `ORDER BY`: `RANGE UNBOUNDED PRECEDING TO CURRENT ROW` (running aggregate, includes peers). Without `ORDER BY`: whole partition (same value for all rows). The difference is dramatic — forgetting `ORDER BY` when you want a running total gives you the partition total instead.
- **`LAST_VALUE` with default frame** — the default frame ends at `CURRENT ROW`, so `LAST_VALUE` returns the current row's value. Always specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`, or use `FIRST_VALUE` + `ORDER BY ... DESC`.
- **`NTH_VALUE` out of range** — if the frame has fewer than N rows, `NTH_VALUE` returns NULL (not an error). Check the frame size if you expect a value.
- **`LAG`/`LEAD` at partition boundaries** — `LAG` at the first row of a partition returns NULL (no preceding row), not a value from the previous partition. Partitions are independent — `LAG`/`LEAD` don't cross them.
- **Window functions and `GROUP BY`** — you can combine them. `GROUP BY` collapses rows, then window functions operate over the grouped rows. `SELECT customer_id, SUM(amount), RANK() OVER (ORDER BY SUM(amount) DESC) FROM orders GROUP BY customer_id` ranks customers by total — the window sees grouped output, not raw rows.
- **`COUNT(*) OVER ()` vs `COUNT(*)`** — `COUNT(*) OVER ()` returns the total row count as a column on every row (window function, no collapse). Bare `COUNT(*)` without `OVER` is an aggregate that collapses rows (illegal in a non-grouped `SELECT` with other columns). The `OVER ()` is what makes it a window function.

## 🧠 Spot the Bug

A developer computes a running total per customer, but for orders placed on the same day, the running total "jumps ahead" — the first of two same-day orders already shows the sum of both. Why?

::code-wrapper{language="sql"}
```sql
SELECT
  customer_id,
  ordered_on,
  amount,
  SUM(amount) OVER (
    PARTITION BY customer_id
    ORDER BY ordered_on
  ) AS running_total
FROM orders;
```
::

<details>
<summary>Answer</summary>

The default frame when `ORDER BY` is present is **`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`**. `RANGE` (not `ROWS`) treats `CURRENT ROW` as including all **peer rows** — rows with the same `ORDER BY` value as the current row. So when two orders share the same `ordered_on`, they're peers, and both include each other in their frame: the running total for the *first* same-day order already includes the *second* same-day order's amount (and vice versa). The running total "jumps ahead" within the tied group.

The fix: use `ROWS` (strict row-count semantics) so the frame is exactly "from the partition start to this physical row":

::code-wrapper{language="sql"}
```sql
SELECT
  customer_id,
  ordered_on,
  amount,
  SUM(amount) OVER (
    PARTITION BY customer_id
    ORDER BY ordered_on
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total
FROM orders;
```
::

With `ROWS`, each row's frame ends at that specific row, so the running total accumulates one row at a time, even across same-day orders. To make the row order deterministic within ties, add a tie-breaker (`ORDER BY ordered_on, id`).

**The lesson**: `RANGE` (the default) includes peers; `ROWS` doesn't. For running totals that should accumulate row-by-row, always specify `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — the default `RANGE` silently sums all tied rows together.

</details>

## Summary

You can now rank rows (`ROW_NUMBER`/`RANK`/`DENSE_RANK`), compute running totals and moving averages with explicit frames, compare rows with `LAG`/`LEAD`, and solve "top-N per group" — all without collapsing rows. You understand the `ROWS` vs `RANGE` distinction, the `LAST_VALUE` default-frame trap, and why `ROW_NUMBER` is the right tool for "exactly N." Next: data types and the three-valued logic of NULL.