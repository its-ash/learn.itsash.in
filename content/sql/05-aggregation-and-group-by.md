# 05 — Aggregation & GROUP BY

Aggregation collapses multiple rows into summary values — counts, sums, averages, minima, maxima. It's how you answer "how many," "how much," "what's the average per group."

## Aggregate Functions

| Function | Returns |
|---|---|
| `COUNT(*)` | Number of rows (including NULLs and duplicates). |
| `COUNT(col)` | Number of non-NULL values in `col`. |
| `COUNT(DISTINCT col)` | Number of distinct non-NULL values. |
| `SUM(col)` | Sum of non-NULL values. |
| `AVG(col)` | Average of non-NULL values (NULLs excluded, not treated as 0). |
| `MIN(col)` / `MAX(col)` | Smallest/largest non-NULL value. Works on text and dates too. |
| `bool_or(col)` / `bool_and(col)` | TRUE if any/all values are TRUE (PostgreSQL). |
| `string_agg(col, ',')` / `GROUP_CONCAT(col)` | Concatenate values (PostgreSQL / SQLite & MySQL). |

::code-wrapper{language="sql"}
```sql
SELECT
  COUNT(*) AS total_orders,
  COUNT(DISTINCT customer_id) AS unique_customers,
  SUM(amount) AS revenue,
  AVG(amount) AS avg_order,
  MIN(amount) AS smallest,
  MAX(amount) AS largest
FROM orders;
--  total_orders | unique_customers | revenue | avg_order | smallest | largest
--  -------------+------------------+---------+----------+----------+---------
--           4   |        3         |  568.75 |  142.19  |   7.25   |  450.00
```
::

### `COUNT(*)` vs `COUNT(col)` vs `COUNT(1)`

- `COUNT(*)` counts **all rows**, including those where every column is NULL.
- `COUNT(col)` counts rows where `col` is **not NULL** — it skips NULLs in that column.
- `COUNT(1)` (or `COUNT(0)`, `COUNT('x')`) counts all rows — the constant is never NULL, so it behaves like `COUNT(*)`. It's a myth that `COUNT(1)` is faster; the planner optimizes both identically. Use `COUNT(*)` for clarity.

::code-wrapper{language="sql"}
```sql
-- count(*) counts the customer even though city is NULL
SELECT COUNT(*) AS total, COUNT(city) AS with_city FROM customers;
--  total | with_city
--  ------+----------
--     3  |     2     -- Carol has city = NULL
```
::

## GROUP BY

`GROUP BY` splits rows into groups, then applies aggregates **per group**. Each group becomes one row in the output.

::code-wrapper{language="sql"}
```sql
-- Total spend per customer
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
ORDER BY total_spent DESC;

-- Order count and average per city
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
SELECT customer_id, amount FROM orders GROUP BY customer_id;

-- ✅ amount is aggregated
SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id;

-- ✅ amount is in GROUP BY (gives per-(customer, amount) groups — usually not intended)
SELECT customer_id, amount FROM orders GROUP BY customer_id, amount;
```
::

The rule is logical: when rows collapse into groups, which `amount` value should appear for a group with 5 rows? There's no single answer — so SQL requires you to aggregate it or group by it.

### Functional Dependency Exception (PostgreSQL)

PostgreSQL allows selecting a column not in `GROUP BY` if it's **functionally dependent** on the grouping columns — typically a primary key:

::code-wrapper{language="sql"}
```sql
-- OK in PostgreSQL: c.id is the PK of customers, so c.name is determined by it
SELECT c.id, c.name, COUNT(o.id) AS order_count
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id;   -- c.name not listed, but allowed because c.id is the PK
```
::

This is standard SQL (feature T301) but not universally supported — MySQL's `ONLY_FULL_GROUP_BY` mode enforces it; older MySQL allowed *any* column (silently picking an arbitrary value, a common bug source). Don't rely on the exception for portability; group by all non-aggregated columns.

## HAVING — Filtering Groups

`WHERE` filters **input rows** (before grouping). `HAVING` filters **output groups** (after grouping). Conditions in `HAVING` can reference aggregates; conditions in `WHERE` cannot.

::code-wrapper{language="sql"}
```sql
-- Customers who spent more than $100 total
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 100;

-- Customers with at least 3 orders, placed after 2024-01-01
SELECT customer_id, COUNT(*) AS n
FROM orders
WHERE ordered_on >= '2024-01-01'   -- row filter (before grouping)
GROUP BY customer_id
HAVING COUNT(*) >= 3;              -- group filter (after grouping)
```
::

### WHERE vs HAVING — when to use which

| Filter on | Clause |
|---|---|
| A raw column value (`amount > 100`) | `WHERE` |
| An aggregate (`SUM(amount) > 100`) | `HAVING` |
| Both | `WHERE` for the raw, `HAVING` for the aggregate |

Putting a raw-column filter in `HAVING` works but is slower — `WHERE` eliminates rows *before* grouping, shrinking the work; `HAVING` groups first, then filters. Push filters as early as possible.

## GROUP BY Multiple Columns

Grouping by multiple columns produces a group for **each unique combination**:

::code-wrapper{language="sql"}
```sql
-- Orders per customer per year
SELECT customer_id, EXTRACT(YEAR FROM ordered_on) AS yr, COUNT(*) AS n
FROM orders
GROUP BY customer_id, EXTRACT(YEAR FROM ordered_on)
ORDER BY customer_id, yr;
```
::

The order of columns in `GROUP BY` doesn't affect the result (groups are unordered sets) — but it can affect the planner's choice of sort vs hash aggregation.

## GROUP BY ROLLUP / CUBE / GROUPING SETS

These produce **multiple levels of aggregation** in one query — subtotals and grand totals.

### `GROUPING SETS` — specific combinations

::code-wrapper{language="sql"}
```sql
-- Sales by (city, year), plus subtotals by city, by year, and a grand total
SELECT city, EXTRACT(YEAR FROM ordered_on) AS yr, SUM(amount) AS total
FROM customers c JOIN orders o ON c.id = o.customer_id
GROUP BY GROUPING SETS (
  (city, yr),   -- each city-year combo
  (city),       -- subtotal per city (across all years)
  (yr),         -- subtotal per year (across all cities)
  ()            -- grand total
);
```
::

NULL appears in the columns not being grouped for each subtotal row. Distinguish "real NULL" from "subtotal marker" with `GROUPING(col)` — returns 1 when the column is a subtotal (NULL because of grouping), 0 otherwise.

### `ROLLUP` — hierarchical subtotals

::code-wrapper{language="sql"}
```sql
-- Subtotals for (city, year), (city), and grand total — in one hierarchy
SELECT city, yr, SUM(amount) FROM ... GROUP BY ROLLUP (city, yr);
```
::

Equivalent to `GROUPING SETS ((city, yr), (city), ())`. Useful for hierarchical dimensions (region → country → city).

### `CUBE` — all combinations

::code-wrapper{language="sql"}
```sql
-- Every combination of city and year subtotals
SELECT city, yr, SUM(amount) FROM ... GROUP BY CUBE (city, yr);
```
::

Equivalent to `GROUPING SETS ((city, yr), (city), (yr), ())`. Use when you want a full cross-tab of subtotals.

PostgreSQL supports all three. MySQL supports `ROLLUP` (with a slightly different syntax for NULL handling). SQLite supports `GROUP BY` extensions only via `GROUPING SETS` in 3.44+.

## Filtering with Aggregates Without GROUP BY

A query with an aggregate but no `GROUP BY` produces a **single group** (the whole table):

::code-wrapper{language="sql"}
```sql
SELECT SUM(amount) FROM orders;   -- one row: the total of all orders
```
::

Even if the table has zero rows, this returns one row with `SUM = NULL` (not zero rows). To get zero rows from an empty table, add a `HAVING` that's false, or filter in an outer query.

## 💡 Tips & Tricks

- **Idiom**: use `COUNT(o.id)` (a non-nullable right-table column) instead of `COUNT(*)` when counting matches in a `LEFT JOIN` — `COUNT(*)` counts the NULL-extended row for unmatched left rows as 1, inflating the count; `COUNT(o.id)` skips NULLs and counts only real matches.
- **Performance**: `COUNT(DISTINCT col)` can be slow on large tables (it must sort or hash all values to deduplicate). For approximate distinct counts at scale, PostgreSQL has `HyperLogLog` via the `hll` extension, or the native `approx_count_distinct` in some setups — trading exactness for O(1) memory.
- **Idiom**: prefer `SUM(CASE WHEN condition THEN 1 ELSE 0 END)` (or the shorter `COUNT(*) FILTER (WHERE condition)` in PostgreSQL) over multiple subqueries for conditional counts — one pass over the data, multiple metrics per row.
- **Debug**: if a `GROUP BY` query returns *fewer* groups than expected, check whether the grouping column has NULLs — all NULLs collapse into a single "NULL group," so 100 NULL-valued rows become one group. If that's not desired, `COALESCE(col, 'unknown')` in the `GROUP BY` makes the NULLs an explicit bucket.
- **Portability**: `string_agg(col, ',' ORDER BY col)` (PostgreSQL) is `GROUP_CONCAT(col ORDER BY col SEPARATOR ',')` (MySQL) or `LISTAGG(col, ',')` (Oracle/SQL Server) — string aggregation is one of the least portable areas of SQL. Pick your engine's function and document it.

## ⚠️ Edge Cases & Gotchas

- **`AVG` ignores NULLs, doesn't treat them as 0**: `AVG(amount)` over rows `[10, 20, NULL]` is `15`, not `10`. If you want NULL treated as 0, use `AVG(COALESCE(amount, 0))` — but ask whether that's semantically right (a missing value isn't necessarily zero).
- **`SUM` of an empty set is NULL, not 0**: `SELECT SUM(amount) FROM orders WHERE FALSE` returns NULL. Use `COALESCE(SUM(amount), 0)` when you need 0 for "no rows."
- **`COUNT(*)` on an empty group is 0, not NULL**: aggregates other than `COUNT` return NULL on empty input; `COUNT` returns 0. This asymmetry is a frequent source of confusion.
- **`GROUP BY` and `SELECT *`**: `SELECT * ... GROUP BY x` is almost always an error (columns not in `GROUP BY` and not aggregated). Don't combine `*` with `GROUP BY`.
- **Floating-point `SUM`/`AVG`**: summing `REAL`/`DOUBLE PRECISION` is subject to floating-point error — `SUM` of `[0.1, 0.1, 0.1]` may be `0.30000000000000004`. Use `NUMERIC`/`DECIMAL` for money and exact arithmetic.
- **`HAVING` without `GROUP BY`**: legal — treats the whole table as one group. `SELECT COUNT(*) FROM orders HAVING COUNT(*) > 0` returns one row if the table is non-empty, zero rows if empty (a way to "return something only if there's data").
- **Alias in `HAVING`**: PostgreSQL allows `HAVING total_spent > 100` (using the `SELECT` alias), but the SQL standard and most engines require `HAVING SUM(amount) > 100` (the raw expression). Use the raw expression for portability.
- **`GROUP BY` ordinal**: `GROUP BY 1, 2` (group by first and second selected columns) is legal but fragile — reordering `SELECT` columns silently changes the grouping. Prefer explicit column names.
- **`MIN`/`MAX` on text**: `MIN(name)` returns the lexicographically smallest string per the column's collation — collation affects the result, so `MIN` on a case-insensitive collation may return `'apple'` before `'Banana'` differently than a case-sensitive one.

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

There are two potential surprises, depending on the data:

1. **Customers with no orders pull the average toward NULL/0 via the NULL-extended row.** The `LEFT JOIN` produces a row with `o.amount = NULL` for customers with no orders. `AVG` ignores NULLs, so a customer with no orders contributes nothing to the average — *not* zero. This is actually correct behavior, but it can confuse someone who expects "no orders" to count as $0.

2. **The real bug: the average is per-(customer's orders), weighted equally per order, not per customer.** If Alice (NYC) has 1 order of $100 and Bob (NYC) has 10 orders averaging $20, the query reports NYC's average as `(100 + 200) / 11 = $27.27` — the per-order average. If the intent was "average customer spend in NYC" (Alice's $100 vs Bob's $200, average = $150), you need a nested aggregate: average the per-customer totals.

```sql
-- Per-order average (what the original computes)
SELECT c.city, AVG(o.amount) FROM customers c JOIN orders o ON c.id=o.customer_id GROUP BY c.city;

-- Per-customer average (average of each customer's total)
SELECT c.city, AVG(customer_total) AS avg_customer_spend
FROM (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
) c
GROUP BY c.city;
```
::
**The lesson**: `AVG` over a join computes the average over *rows* (orders), not over *entities* (customers). To average per-entity, aggregate to the entity level first, then average those aggregates. SQL can't nest aggregates directly (`AVG(SUM(x))` is illegal), so use a subquery/CTE.

</details>

## Summary

You can now aggregate with `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, group rows with `GROUP BY`, filter groups with `HAVING`, and generate multi-level subtotals with `ROLLUP`/`CUBE`/`GROUPING SETS` — while understanding the NULL-handling quirks that make aggregates surprise the unwary. Next: subqueries, the compositional building block of complex queries.