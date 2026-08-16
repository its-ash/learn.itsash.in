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
SELECT
  customer_id,
  ordered_on,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on) AS running_total
FROM orders;
```
::

This computes a running total of `amount` per customer, ordered by date — and every original row appears in the output with its running total alongside. `GROUP BY` would collapse each customer into one row; the window function keeps them all.

## Anatomy of a Window Function

::code-wrapper{language="text"}
```text
function(args) OVER (
  [PARTITION BY ...]     -- groups; default = whole result set
  [ORDER BY ...]         -- order within each partition; default = unspecified
  [frame_clause]         -- which rows to include; default depends on the function
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
| `CUME_DIST()` | Cumulative distribution: rows with a value ≤ current / total. |
| `NTILE(n)` | Divides partition into `n` equal-ish buckets; returns bucket number. |

::code-wrapper{language="sql"}
```sql
-- Rank orders by amount within each customer
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

If a customer has orders `[450, 100, 100, 50]`:
- `ROW_NUMBER`: 1, 2, 3, 4 (ties get distinct arbitrary numbers)
- `RANK`: 1, 2, 2, 4 (skips 3)
- `DENSE_RANK`: 1, 2, 2, 3 (no skip)

### Top-N per group

The canonical pattern — find the top 3 orders per customer:

::code-wrapper{language="sql"}
```sql
WITH ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn
  FROM orders
)
SELECT * FROM ranked WHERE rn <= 3;
``
::

`ROW_NUMBER` (not `RANK`/`DENSE_RANK`) is the right choice for "exactly N" — it never produces ties, so `rn <= 3` returns exactly 3 rows per partition (or fewer if the partition is smaller).

## Aggregate Functions as Windows

Any aggregate (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`) can be a window function with `OVER`:

::code-wrapper{language="sql"}
```sql
-- Each order alongside its customer's total and the overall average
SELECT
  id,
  customer_id,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id) AS customer_total,
  AVG(amount) OVER ()                       AS overall_avg
FROM orders;
```
::

Without `ORDER BY` in the `OVER`, the frame is the **entire partition** — every row gets the same value (the partition total). With `ORDER BY`, the default frame becomes "from the partition start to the current row," enabling running totals.

## Frames

The frame specifies which rows the function sees, relative to the current row. The full syntax:

::code-wrapper{language="text"}
```text
{ROWS | RANGE | GROUPS} BETWEEN <start> AND <end>
  <start>/<end> := UNBOUNDED PRECEDING | <n> PRECEDING | CURRENT ROW | <n> FOLLOWING | UNBOUNDED FOLLOWING
```
::

### Default frames (when `ORDER BY` is present)

- For `SUM`, `AVG`, `MIN`, `MAX`, `COUNT` — **`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`** (a running aggregate, including all peers with the same order key as the current row).
- For ranking functions (`ROW_NUMBER`, `RANK`, etc.) — the whole partition (frame is irrelevant; they use the order, not a frame).
- For `LAG`/`LEAD`/`FIRST_VALUE`/`LAST_VALUE` — the whole partition.

### Common frame patterns

::code-wrapper{language="sql"}
```sql
-- Running total (sum from partition start to current row)
SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)

-- Running total excluding the current row
SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)

-- Moving average over a 3-row window (current + 1 before + 1 after)
AVG(amount) OVER (ORDER BY ordered_on
  ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)

-- Sum of the whole partition (same for every row)
SUM(amount) OVER (PARTITION BY customer_id)

-- Cumulative sum up to and including all peers (default RANGE behavior)
SUM(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on)
```
::

### ROWS vs RANGE vs GROUPS

| Mode | Meaning of `n PRECEDING`/`FOLLOWING` |
|---|---|
| `ROWS` | Exactly `n` rows before/after, counting rows. |
| `RANGE` | All rows whose `ORDER BY` value is within `n` of the current row's value. Needs a numeric `ORDER BY`. |
| `GROUPS` | All peer groups (rows with the same `ORDER BY` value) within `n` groups. |

`RANGE` and `GROUPS` deal with ties — `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` (the default) includes all *peers* (rows with the same `ORDER BY` value as the current row), which is why a running total over ties gives the same value for all tied rows. Use `ROWS` for strict row-count semantics (one row per step).

## Value Functions

| Function | Returns |
|---|---|
| `LAG(col, n, default)` | Value of `col` from `n` rows **before** the current row (within the partition/order). |
| `LEAD(col, n, default)` | Value of `col` from `n` rows **after**. |
| `FIRST_VALUE(col)` | First value in the frame. |
| `LAST_VALUE(col)` | Last value in the frame (⚠️ see below). |
| `NTH_VALUE(col, n)` | Nth value in the frame. |

::code-wrapper{language="sql"}
```sql
-- Day-over-day change in amount
SELECT
  ordered_on,
  amount,
  amount - LAG(amount) OVER (ORDER BY ordered_on) AS daily_delta,
  amount - LAG(amount, 1, 0) OVER (ORDER BY ordered_on) AS delta_with_default
FROM orders;

-- Compare each order to the customer's first order
SELECT
  customer_id, ordered_on, amount,
  amount - FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on) AS diff_from_first
FROM orders;
```
::

### The LAST_VALUE gotcha

`LAST_VALUE` returns the last value **in the current frame**, not the last value in the partition. With the default frame (`RANGE ... CURRENT ROW`), the frame ends at the current row — so `LAST_VALUE` equals the current row's value, which is almost never what you want.

Fix by extending the frame to the partition end:

::code-wrapper{language="sql"}
```sql
-- Wrong (returns the current row's amount)
LAST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on)

-- Right (returns the customer's most recent amount)
LAST_VALUE(amount) OVER (
  PARTITION BY customer_id ORDER BY ordered_on
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
)
```
::

Or use `FIRST_VALUE` with a descending order — cleaner for "last value":

::code-wrapper{language="sql"}
```sql
-- Customer's most recent amount — using FIRST_VALUE with DESC
FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY ordered_on DESC)
```
::

## Window Naming (Reusable OVER Clauses)

If you repeat the same `OVER (...)` clause, name it with `WINDOW` and reference it:

::code-wrapper{language="sql"}
```sql
SELECT
  customer_id, ordered_on, amount,
  ROW_NUMBER() OVER cust_window AS rn,
  SUM(amount)   OVER cust_window AS running_total,
  AVG(amount)   OVER cust_window AS running_avg
FROM orders
WINDOW cust_window AS (PARTITION BY customer_id ORDER BY ordered_on);
```
::

`WINDOW` clauses reduce repetition and make the query's partitioning strategy explicit.

## 💡 Tips & Tricks

- **Idiom**: use `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) AS rn` + `WHERE rn <= N` for "top-N per group" — it's the most portable and readable pattern, and unlike `DISTINCT ON` (PostgreSQL-only) or `LATERAL` (engine-specific), it works in every modern database.
- **Performance**: window functions require **sorting** the partition by the `ORDER BY` key — if that key isn't indexed, the planner does an explicit sort (memory permitting, else disk spill). For large partitions, an index on `(partition_cols..., order_col)` lets the planner use an index scan and avoid the sort.
- **Idiom**: prefer `FIRST_VALUE(x) OVER (... ORDER BY ... DESC)` over `LAST_VALUE(x) OVER (... ROWS BETWEEN ... UNBOUNDED FOLLOWING)` for "last value in partition" — the `FIRST_VALUE`-with-`DESC` form avoids the `LAST_VALUE` default-frame trap and is one less clause to get wrong.
- **Debug**: when a running total looks wrong (jumps, repeats, or excludes the current row), check the frame — the default `RANGE` frame includes peers (ties), which can make the total "jump" at ties; switch to `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` for strict row-by-row accumulation.
- **Idiom**: use `COUNT(*) OVER ()` (empty `OVER`) to attach a total row count to every row — handy for paginated APIs that need `total_count` alongside each page's rows, without a separate `count(*)` query.

## ⚠️ Edge Cases & Gotchas

- **Window functions can't appear in `WHERE`**: they're computed *after* `WHERE`/`GROUP BY`/`HAVING` (logically, in the `SELECT` phase). Filter on window values in an outer query or CTE: `WITH t AS (SELECT ..., ROW_NUMBER() OVER (...) AS rn FROM ...) SELECT * FROM t WHERE rn <= 3`.
- **`RANK` vs `DENSE_RANK` skip behavior**: `RANK` skips numbers after ties (1, 1, 3); `DENSE_RANK` doesn't (1, 1, 2). The "next rank" after two ties is 3 with `RANK`, 2 with `DENSE_RANK`. Pick based on whether you want "how many rows are strictly ahead" (`RANK` - 1) or "how many distinct values are ahead" (`DENSE_RANK` - 1).
- **`ROW_NUMBER` is non-deterministic on ties**: tied rows get distinct but arbitrary numbers (the planner picks). For stable, repeatable `ROW_NUMBER`, add a unique tie-breaker to `ORDER BY` (e.g., `ORDER BY amount DESC, id`).
- **`LAG`/`LEAD` at partition boundaries**: `LAG` at the first row of a partition returns NULL (no preceding row), not a value from the previous partition. Partitions are independent — `LAG` doesn't cross them.
- **Default frame with `ORDER BY` is `RANGE`, not `ROWS`**: this includes peers (rows with the same `ORDER BY` value), so a running `SUM` over tied rows gives the same total for all tied rows. If you want strict per-row accumulation, use `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.
- **`LAST_VALUE` default-frame trap**: the default frame ends at `CURRENT ROW`, so `LAST_VALUE` returns the current row's value. Always specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` for "last in partition," or use `FIRST_VALUE` + `ORDER BY ... DESC`.
- **Window functions and `GROUP BY`**: you can combine them — `GROUP BY` collapses rows, then window functions operate over the grouped rows. `SELECT customer_id, SUM(amount), RANK() OVER (ORDER BY SUM(amount) DESC) FROM orders GROUP BY customer_id` ranks customers by their total — the window function sees the grouped output, not the raw rows.
- **`COUNT(*) OVER ()` vs `COUNT(*)`**: `COUNT(*) OVER ()` returns the total row count as a column on every row; bare `COUNT(*)` without `OVER` is an aggregate that collapses rows (illegal in a non-grouped `SELECT` with other columns). The `OVER ()` is what makes it a window function.
- **Empty partition**: a window function over a partition with zero rows simply produces no rows (the partition doesn't exist). Over a partition with one row, `LAG`/`LEAD` return NULL.

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

The default frame when `ORDER BY` is present is **`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`**. `RANGE` (not `ROWS`) treats the `CURRENT ROW` boundary as including all **peer rows** — rows with the same `ORDER BY` value as the current row. So when two orders share the same `ordered_on`, they're peers, and both include each other in their frame: the running total for the *first* same-day order already includes the *second* same-day order's amount (and vice versa). The running total "jumps ahead" within the tied group.

The fix: use `ROWS` (strict row-count semantics) so the frame is exactly "from the partition start to this physical row":

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

With `ROWS`, each row's frame ends at that specific row, so the running total accumulates one row at a time, even across same-day orders. To make the row order deterministic within ties, add a tie-breaker (`ORDER BY ordered_on, id`).

**The lesson**: `RANGE` (the default) includes peers; `ROWS` doesn't. For running totals that should accumulate row-by-row, always specify `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — the default `RANGE` silently sums all tied rows together.

</details>

## Summary

You can now rank rows, compute running totals and moving averages, compare rows with `LAG`/`LEAD`, and solve "top-N per group" — all without collapsing rows. You understand frames (`ROWS` vs `RANGE`), the `LAST_VALUE` trap, and why `ROW_NUMBER` is the right tool for "exactly N." Next: data types and the three-valued logic of NULL.