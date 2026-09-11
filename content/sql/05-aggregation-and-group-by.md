# 05 — Aggregation & GROUP BY

Aggregation collapses multiple rows into summary values — counts, sums, averages, minima, maxima. It's how you answer "how many," "how much," "what's the average per group."

## Aggregate Functions

| Function | Returns | NULL handling |
|---|---|---|
| `COUNT(*)` | Number of rows (including NULLs and duplicates). | Counts all rows. |
| `COUNT(col)` | Number of non-NULL values in `col`. | Skips NULLs in `col`. |
| `COUNT(DISTINCT col)` | Number of distinct non-NULL values. | Skips NULLs. |
| `SUM(col)` | Sum of non-NULL values. | Skips NULLs; returns NULL on empty set. |
| `AVG(col)` | Average of non-NULL values. | Skips NULLs (does NOT treat as 0). |
| `MIN(col)` / `MAX(col)` | Smallest/largest non-NULL value. | Works on text, dates, numbers. |
| `bool_or(col)` / `bool_and(col)` | TRUE if any/all values are TRUE (PostgreSQL). | Skips NULLs. |
| `string_agg(col, ',')` | Concatenate values (PostgreSQL). | Skips NULLs. |
| `GROUP_CONCAT(col)` | Concatenate (MySQL, SQLite). | Skips NULLs. |

::code-wrapper{language="sql"}
```sql
SELECT
  COUNT(*) AS total_orders,                    -- all rows, including any with NULL amounts
  COUNT(DISTINCT customer_id) AS unique_customers,
  SUM(amount) AS revenue,                      -- NULLs skipped; NULL if no rows
  AVG(amount) AS avg_order,                    -- NULLs skipped — not treated as 0
  MIN(amount) AS smallest,
  MAX(amount) AS largest
FROM orders;
--  total_orders | unique_customers | revenue | avg_order | smallest | largest
--  -------------+------------------+---------+----------+----------+---------
--           4   |        3         |  568.75 |  142.19  |   7.25   |  450.00
```
::

### `COUNT(*)` vs `COUNT(col)` vs `COUNT(1)`

::code-wrapper{language="sql"}
```sql
-- COUNT(*): counts ALL rows, including those where every column is NULL
-- COUNT(col): counts rows where col IS NOT NULL — skips NULLs in that column
-- COUNT(1): the constant 1 is never NULL, so it behaves like COUNT(*)
--   (The myth that COUNT(1) is faster is false — the planner optimizes both identically.)
SELECT
  COUNT(*) AS total,           -- 3 (all customers)
  COUNT(city) AS with_city,    -- 2 (Carol has city = NULL, skipped)
  COUNT(1) AS count_one        -- 3 (same as COUNT(*))
FROM customers;
--  total | with_city | count_one
--  ------+-----------+----------
--     3  |     2     |    3
```
::

## GROUP BY

`GROUP BY` splits rows into groups, then applies aggregates **per group**. Each group becomes one row in the output.

::code-wrapper{language="sql"}
```sql
-- Total spend per customer — one output row per customer_id group
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
ORDER BY total_spent DESC;

-- Order count and average per city — groups are defined by c.city
SELECT c.city, COUNT(*) AS order_count, AVG(o.amount) AS avg_amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY c.city;
```
::

### The Golden Rule of GROUP BY

Every column in the `SELECT` list must be either:

1. **Listed in `GROUP BY`**, or
2. **Wrapped in an aggregate function**.

::code-wrapper{language="sql"}
```sql
-- ❌ ERROR: column "o.amount" must appear in GROUP BY or be used in an aggregate
-- When rows collapse into groups, which amount should appear for a 5-row group? Undefined.
SELECT customer_id, amount FROM orders GROUP BY customer_id;

-- ✅ amount is aggregated — one value per group (the sum)
SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id;

-- ✅ amount is in GROUP BY — gives per-(customer, amount) groups (usually not intended)
SELECT customer_id, amount FROM orders GROUP BY customer_id, amount;
```
::

### Functional Dependency Exception (PostgreSQL)

::code-wrapper{language="sql"}
```sql
-- OK in PostgreSQL: c.id is the PK of customers, so c.name is functionally dependent on c.id
-- Standard SQL feature T301 — but not universally supported (MySQL's ONLY_FULL_GROUP_BY enforces it)
SELECT c.id, c.name, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id;   -- c.name not listed, but allowed because c.id is the PK → c.name is determined
```
::

Don't rely on the exception for portability; group by all non-aggregated columns.

## HAVING — Filtering Groups

`WHERE` filters **input rows** (before grouping). `HAVING` filters **output groups** (after grouping). Conditions in `HAVING` can reference aggregates; conditions in `WHERE` cannot.

::code-wrapper{language="sql"}
```sql
-- Customers who spent more than $100 total — HAVING filters on the aggregate
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 100;

-- Customers with at least 3 orders, placed after 2024-01-01
SELECT customer_id, COUNT(*) AS n
FROM orders
WHERE ordered_on >= '2024-01-01'   -- row filter (before grouping — shrinks input)
GROUP BY customer_id
HAVING COUNT(*) >= 3;              -- group filter (after grouping — filters output groups)
```
::

### WHERE vs HAVING — when to use which

| Filter on | Clause | Why |
|---|---|---|
| A raw column value (`amount > 100`) | `WHERE` | Eliminates rows before grouping → less work. |
| An aggregate (`SUM(amount) > 100`) | `HAVING` | Aggregate isn't computed until after grouping. |
| Both | `WHERE` + `HAVING` | Push raw filters to WHERE, aggregate filters to HAVING. |

Putting a raw-column filter in `HAVING` works but is slower — `WHERE` eliminates rows *before* grouping, shrinking the work; `HAVING` groups first, then filters. Push filters as early as possible.

## GROUP BY Multiple Columns

::code-wrapper{language="sql"}
```sql
-- Orders per customer per year — group for each unique (customer_id, yr) combination
SELECT
  customer_id,
  EXTRACT(YEAR FROM ordered_on) AS yr,
  COUNT(*) AS n
FROM orders
GROUP BY customer_id, EXTRACT(YEAR FROM ordered_on)
ORDER BY customer_id, yr;
```
::

The order of columns in `GROUP BY` doesn't affect the result (groups are unordered sets) — but it can affect the planner's choice of sort vs hash aggregation.

## ROLLUP / CUBE / GROUPING SETS

These produce **multiple levels of aggregation** in one query — subtotals and grand totals.

### `GROUPING SETS` — specific combinations

::code-wrapper{language="sql"}
```sql
-- Sales by (city, year), plus subtotals by city, by year, and a grand total — all in one query
SELECT
  city,
  EXTRACT(YEAR FROM ordered_on) AS yr,
  SUM(amount) AS total
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY GROUPING SETS (
  (city, yr),   -- each city-year combo
  (city),       -- subtotal per city (across all years) — yr column is NULL
  (yr),         -- subtotal per year (across all cities) — city column is NULL
  ()            -- grand total — both city and yr are NULL
);
```
::

NULL appears in the columns not being grouped for each subtotal row. Distinguish "real NULL" from "subtotal marker" with `GROUPING(col)`:

::code-wrapper{language="sql"}
```sql
-- GROUPING(col) returns 1 when col is a subtotal (NULL due to grouping), 0 otherwise
SELECT
  CASE WHEN GROUPING(city) = 1 THEN 'ALL CITIES' ELSE city END AS city,
  CASE WHEN GROUPING(yr)   = 1 THEN 'ALL YEARS'  ELSE yr::text END AS yr,
  SUM(amount) AS total
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY GROUPING SETS ((city, yr), (city), (yr), ())
ORDER BY city, yr;
```
::

### `ROLLUP` — hierarchical subtotals

::code-wrapper{language="sql"}
```sql
-- ROLLUP (city, yr) = GROUPING SETS ((city, yr), (city), ())
-- Produces subtotals at each level of the hierarchy: city+yr → city → grand total
SELECT city, yr, SUM(amount) AS total
FROM sales
GROUP BY ROLLUP (city, yr);
```
::

### `CUBE` — all combinations

::code-wrapper{language="sql"}
```sql
-- CUBE (city, yr) = GROUPING SETS ((city, yr), (city), (yr), ())
-- Produces every combination of subtotals — a full cross-tab
SELECT city, yr, SUM(amount) AS total
FROM sales
GROUP BY CUBE (city, yr);
```
::

PostgreSQL supports all three. MySQL supports `ROLLUP` (with a slightly different syntax). SQLite supports `GROUPING SETS` in 3.44+.

## Complex Implementation: Multi-Level Sales Report

::code-wrapper{language="sql"}
```sql
-- A multi-level sales report with subtotals by city, by year, and a grand total.
-- Uses GROUPING SETS to produce all levels in a single pass over the data.
SELECT
  CASE WHEN GROUPING(c.city) = 1 THEN '=== ALL CITIES ===' ELSE c.city END AS city,
  CASE WHEN GROUPING(yr)     = 1 THEN '=== ALL YEARS ==='  ELSE yr::text   END AS yr,
  COUNT(*) AS order_count,
  SUM(o.amount) AS revenue,
  AVG(o.amount) AS avg_order
FROM customers c
JOIN orders o ON c.id = o.customer_id
CROSS JOIN LATERAL (SELECT EXTRACT(YEAR FROM o.ordered_on) AS yr) x
GROUP BY GROUPING SETS (
  (c.city, yr),    -- per city per year
  (c.city),        -- per city (all years)
  (yr),            -- per year (all cities)
  ()               -- grand total
)
ORDER BY
  CASE WHEN GROUPING(c.city) = 1 THEN 1 ELSE 0 END,   -- city subtotals after detail rows
  c.city NULLS LAST,
  CASE WHEN GROUPING(yr)     = 1 THEN 1 ELSE 0 END,
  yr NULLS LAST;
```
::

## Filtering with Aggregates Without GROUP BY

::code-wrapper{language="sql"}
```sql
-- No GROUP BY → the entire table is one group → always returns exactly one row
SELECT SUM(amount) FROM orders;   -- one row: the total of all orders

-- Even on an empty table: returns one row with SUM = NULL (not zero rows!)
SELECT SUM(amount) FROM orders WHERE FALSE;   -- returns NULL, not 0, not zero rows

-- To get zero rows from an empty table, add a HAVING that's false:
SELECT SUM(amount) FROM orders HAVING COUNT(*) > 0;   -- zero rows if table is empty
```
::

## Anti-Pattern: AVG Over a Join (Per-Row vs Per-Entity)

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: AVG over a join computes per-ORDER average, not per-CUSTOMER average
-- If Alice (NYC) has 1 order of $100 and Bob (NYC) has 10 orders averaging $20,
-- this reports NYC's average as (100 + 200) / 11 = $27.27 (per-order)
-- — NOT the average customer spend ($100 vs $200 → $150)
SELECT c.city, AVG(o.amount) AS avg_amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY c.city;

-- ✅ RIGHT: nest the aggregate — first compute per-customer totals, then average those
SELECT c.city, AVG(customer_total) AS avg_customer_spend
FROM (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total    -- level 1: per-customer total
  FROM customers c
  JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
) sub
GROUP BY c.city;   -- level 2: average of per-customer totals
```
::

SQL can't nest aggregates directly (`AVG(SUM(x))` is illegal) — use a subquery/CTE to aggregate at the entity level first, then average.

## 💡 Tips & Tricks

- **Idiom**: use `COUNT(o.id)` (a non-nullable right-table column) instead of `COUNT(*)` when counting matches in a `LEFT JOIN` — `COUNT(*)` counts the NULL-extended row for unmatched left rows as 1, inflating the count; `COUNT(o.id)` skips NULLs and counts only real matches.
- **Performance**: `COUNT(DISTINCT col)` can be slow on large tables (it must sort or hash all values to deduplicate). For approximate distinct counts at scale, PostgreSQL has `HyperLogLog` via the `hll` extension — trading exactness for O(1) memory.

::code-wrapper{language="sql"}
```sql
-- Exact distinct count — O(N) memory, precise
SELECT COUNT(DISTINCT customer_id) FROM orders;

-- Approximate distinct count with HyperLogLog — O(1) memory, ~1-2% error
-- Requires: CREATE EXTENSION hll;
SELECT hll_cardinality(hll_agg(customer_id)) FROM orders;
```
::

- **Idiom**: prefer `COUNT(*) FILTER (WHERE condition)` (PostgreSQL) or `SUM(CASE WHEN condition THEN 1 ELSE 0 END)` (portable) over multiple subqueries for conditional counts — one pass over the data, multiple metrics per row.

::code-wrapper{language="sql"}
```sql
-- Conditional aggregation with FILTER (PostgreSQL 9.4+) — clean and fast
SELECT
  customer_id,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE status = 'shipped') AS shipped,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
  SUM(amount) FILTER (WHERE status = 'shipped') AS shipped_revenue
FROM orders
GROUP BY customer_id;

-- Portable equivalent using CASE
SELECT
  customer_id,
  COUNT(*) AS total_orders,
  SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM orders
GROUP BY customer_id;
```
::

- **Debug**: if a `GROUP BY` query returns *fewer* groups than expected, check whether the grouping column has NULLs — all NULLs collapse into a single "NULL group." If that's not desired, `COALESCE(col, 'unknown')` in the `GROUP BY` makes the NULLs an explicit bucket.
- **Portability**: `string_agg(col, ',' ORDER BY col)` (PostgreSQL) is `GROUP_CONCAT(col ORDER BY col SEPARATOR ',')` (MySQL) or `LISTAGG(col, ',')` (Oracle/SQL Server) — string aggregation is one of the least portable areas of SQL.

## ⚠️ Edge Cases & Gotchas

- **`AVG` ignores NULLs, doesn't treat them as 0**: `AVG(amount)` over rows `[10, 20, NULL]` is `15`, not `10`. If you want NULL treated as 0, use `AVG(COALESCE(amount, 0))` — but ask whether that's semantically right (a missing value isn't necessarily zero).
- **`SUM` of an empty set is NULL, not 0**: `SELECT SUM(amount) FROM orders WHERE FALSE` returns NULL. Use `COALESCE(SUM(amount), 0)` when you need 0 for "no rows."
- **`COUNT` on an empty group is 0, not NULL**: aggregates other than `COUNT` return NULL on empty input; `COUNT` returns 0. This asymmetry is a frequent source of confusion.
- **`GROUP BY` and `SELECT *`**: `SELECT * ... GROUP BY x` is almost always an error (columns not in `GROUP BY` and not aggregated). Don't combine `*` with `GROUP BY`.
- **Floating-point `SUM`/`AVG`**: summing `REAL`/`DOUBLE PRECISION` is subject to floating-point error — `SUM` of `[0.1, 0.1, 0.1]` may be `0.30000000000000004`. Use `NUMERIC`/`DECIMAL` for money and exact arithmetic.
- **`HAVING` without `GROUP BY`**: legal — treats the whole table as one group. `SELECT COUNT(*) FROM orders HAVING COUNT(*) > 0` returns one row if the table is non-empty, zero rows if empty.
- **Alias in `HAVING` portability**: PostgreSQL allows `HAVING total_spent > 100` (using the `SELECT` alias), but the SQL standard and most engines require `HAVING SUM(amount) > 100` (the raw expression). Use the raw expression for portability.
- **`GROUP BY` ordinal fragility**: `GROUP BY 1, 2` (group by first and second selected columns) is legal but fragile — reordering `SELECT` columns silently changes the grouping. Prefer explicit column names.
- **`MIN`/`MAX` on text with collation**: `MIN(name)` returns the lexicographically smallest string per the column's collation — collation affects the result, so `MIN` on a case-insensitive collation may return `'apple'` before `'Banana'` differently than a case-sensitive one.

## 🧠 Spot the Bug

This query is supposed to report the average order amount per city, but the averages look wrong for cities with few orders. What's the subtle issue?

::code-wrapper{language="sql"}
```sql
SELECT c.city, AVG(o.amount) AS avg_amount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.city;
```
::

<details>
<summary>Answer</summary>

The bug: the average is **per-order**, not **per-customer**. `AVG` over a join computes the average over *rows* (orders), not over *entities* (customers).

If Alice (NYC) has 1 order of $100 and Bob (NYC) has 10 orders averaging $20, the query reports NYC's average as `(100 + 200) / 11 = $27.27` — the per-order average. If the intent was "average customer spend in NYC" (Alice's $100 vs Bob's $200, average = $150), you need a nested aggregate: average the per-customer totals.

::code-wrapper{language="sql"}
```sql
-- Per-order average (what the original computes)
SELECT c.city, AVG(o.amount)
FROM customers c JOIN orders o ON c.id = o.customer_id
GROUP BY c.city;

-- Per-customer average (average of each customer's total)
SELECT c.city, AVG(customer_total) AS avg_customer_spend
FROM (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total   -- level 1: per-customer total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
) sub
GROUP BY c.city;   -- level 2: average of per-customer totals
```
::

**The lesson**: `AVG` over a join computes the average over *rows* (orders), not over *entities* (customers). To average per-entity, aggregate to the entity level first, then average those aggregates. SQL can't nest aggregates directly (`AVG(SUM(x))` is illegal), so use a subquery/CTE.

</details>

## Summary

You can now aggregate with `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, group rows with `GROUP BY`, filter groups with `HAVING`, and generate multi-level subtotals with `ROLLUP`/`CUBE`/`GROUPING SETS` — while understanding the NULL-handling quirks that make aggregates surprise the unwary. Next: subqueries, the compositional building block of complex queries.