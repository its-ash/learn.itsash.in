# 06 — Subqueries

A subquery is a query nested inside another query. Subqueries appear in `WHERE`, `SELECT`, `FROM`, `HAVING`, and join clauses. They compose queries before reaching for CTEs (chapter 07) or joins.

## Subquery Classification — Two Axes

**Return shape** determines where a subquery is legal and which operators accept it:

| Shape | Rows | Columns | Valid in | Operators |
|---|---|---|---|---|
| **Scalar** | ≤1 | 1 | `SELECT`, `WHERE` (comparison), `HAVING`, `VALUES` | `=`, `<>`, `<`, `>`, arithmetic |
| **Row** | ≤1 | N | `WHERE` (row constructor) | `=`, `<>`, `IN`, `IS DISTINCT FROM` |
| **Table** | N | M | `WHERE` (`IN`/`ANY`/`ALL`/`EXISTS`), `FROM` | `IN`, `NOT IN`, `ANY`, `ALL`, `EXISTS` |

**Correlation** determines execution cost:

- **Uncorrelated** — no reference to the outer query; executes once, result cached.
- **Correlated** — references outer columns; logically re-executes per outer row (planner may decorrelate into a join, but not always).

## Scalar Subqueries — One Row, One Column

A scalar subquery returns exactly one row and one column. It can appear anywhere a single value is legal.

::code-wrapper{language="sql"}
```sql
-- Orders above the average order amount.
-- The scalar subquery (SELECT AVG(...)) executes ONCE (uncorrelated),
-- its result is cached, and the outer query compares every row to that constant.
SELECT id, amount
FROM orders
WHERE amount > (SELECT AVG(amount) FROM orders);

-- Each order with the overall average attached for comparison.
-- The subquery runs once; the cached value is attached to every output row.
SELECT id,
       amount,
       (SELECT AVG(amount) FROM orders) AS overall_avg  -- scalar in SELECT list
FROM orders;

-- Per-customer order count via a CORRELATED scalar subquery.
-- The subquery references c.id from the outer row → re-executes per customer.
-- For 1M customers this is 1M subquery executions unless the planner decorrelates it.
SELECT c.name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM customers c;
```
::

**Scalar subquery returning zero rows → NULL.** Returning more than one row → runtime error: `ERROR: more than one row returned by a subquery used as an expression`.

## Row Subqueries — One Row, Multiple Columns

A row subquery returns one row with N columns. Compare against a row constructor:

::code-wrapper{language="sql"}
```sql
-- Row constructor comparison: (customer_id, amount) = (1, 99.50)
-- Expands to: customer_id = 1 AND amount = 99.50
-- Lexicographic, AND-connected → any NULL makes the whole predicate UNKNOWN.
SELECT * FROM orders
WHERE (customer_id, amount) = (1, 99.50);

-- Row subquery form — find orders matching customer 1's first order exactly
SELECT * FROM orders
WHERE (customer_id, amount) = (
  SELECT customer_id, amount FROM orders WHERE id = 1
);
```
::

Row comparisons follow three-valued logic — `(a, b) = (x, y)` is `a = x AND b = y`, so any NULL makes the whole thing UNKNOWN.

## Table Subqueries — IN, ANY, ALL, EXISTS

A table subquery returns multiple rows. Use it with `IN`, `ANY`/`ALL`, `EXISTS`, or in the `FROM` clause.

### IN — Membership Test

::code-wrapper{language="sql"}
```sql
-- Customers who have placed at least one order.
-- IN expands to: c.id = o1.customer_id OR c.id = o2.customer_id OR ...
-- The planner typically implements this as a semi-join (hash or index).
SELECT * FROM customers
WHERE id IN (SELECT customer_id FROM orders);
```
::

### NOT IN — The NULL Poisoning Trap (Dangerous!)

`NOT IN` breaks if the subquery can produce NULL:

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: Returns ZERO rows if ANY customer_id in the subquery is NULL.
-- x NOT IN (a, b, NULL) expands to: x <> a AND x <> b AND x <> NULL
-- x <> NULL is UNKNOWN → the entire AND chain becomes UNKNOWN → WHERE keeps nothing.
SELECT * FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
```
::

**Mechanism**: `x NOT IN (a, b, c)` is `x <> a AND x <> b AND x <> c`. If any element is NULL, `x <> NULL` is UNKNOWN. `TRUE AND UNKNOWN = UNKNOWN`. `WHERE` keeps only TRUE → **one NULL poisons the entire NOT IN**.

The fixes:

::code-wrapper{language="sql"}
```sql
-- Option 1: filter NULLs out of the subquery (works, but verbose)
SELECT * FROM customers
WHERE id NOT IN (
  SELECT customer_id FROM orders WHERE customer_id IS NOT NULL
);

-- Option 2: NOT EXISTS — NULL-safe, planner uses hash anti-join, short-circuits.
-- The subquery returns no rows for unmatched customers → NOT EXISTS = TRUE.
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- Option 3: IS DISTINCT FROM ALL — NULL-safe "not equal to all" (PostgreSQL)
SELECT * FROM customers c
WHERE c.id IS DISTINCT FROM ALL (SELECT customer_id FROM orders);
```
::

**Prefer `NOT EXISTS`.** It's NULL-safe and the planner can use a hash anti-join.

### ANY / ALL — Quantified Comparison

`ANY` (a.k.a. `SOME`) — true if the comparison holds for **at least one** subquery row. `ALL` — true for **every** row.

::code-wrapper{language="sql"}
```sql
-- Orders larger than at least one order from customer 1.
-- Equivalent to: amount > (SELECT MIN(amount) FROM orders WHERE customer_id = 1)
SELECT * FROM orders
WHERE amount > ANY (SELECT amount FROM orders WHERE customer_id = 1);

-- Orders larger than every order from customer 1 (i.e., larger than the max).
-- Equivalent to: amount > (SELECT MAX(amount) FROM orders WHERE customer_id = 1)
SELECT * FROM orders
WHERE amount > ALL (SELECT amount FROM orders WHERE customer_id = 1);

-- = ANY (subquery) is exactly equivalent to IN (subquery).
-- IN is the more common spelling; ANY/ALL matter for non-equality comparisons.
SELECT * FROM orders
WHERE customer_id = ANY (SELECT id FROM customers WHERE status = 'active');
-- Same as: WHERE customer_id IN (SELECT id FROM customers WHERE status = 'active');
```
::

**Empty subquery with ANY/ALL**:

- `x > ALL (empty set)` → **TRUE** (vacuously true — "greater than every element of nothing").
- `x > ANY (empty set)` → **FALSE** (no element satisfies the condition).

## EXISTS — Semi-Join and Anti-Join

`EXISTS` is true if the subquery returns **at least one row** — it doesn't care what the rows contain. By convention, `SELECT 1` is used (the value is irrelevant).

::code-wrapper{language="sql"}
```sql
-- Semi-join: customers who have placed at least one order.
-- EXISTS short-circuits on the FIRST matching row — doesn't collect all matches.
-- The planner can use an index on orders.customer_id to find the first match fast.
SELECT * FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- Anti-join: customers who have NOT placed any order.
-- NOT EXISTS = TRUE when the subquery is empty (no matching rows).
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```
::

`EXISTS` is a **correlated** subquery — it references `c.id` from the outer query. The planner typically implements it as a semi-join (or anti-join for `NOT EXISTS`), which can short-circuit on the first match.

### EXISTS vs IN — Decision Matrix

| Criterion | Prefer `EXISTS` | Prefer `IN` |
|---|---|---|
| Subquery can produce NULLs | ✅ (NULL-safe) | ❌ (use `NOT EXISTS`) |
| Uncorrelated, small list | — | ✅ (simpler syntax) |
| Correlated (depends on outer row) | ✅ (idiomatic) | works but less clear |
| Large subquery result | ✅ (semi-join, short-circuits) | may materialize full list |
| Literal list `IN (1, 2, 3)` | — | ✅ (the only good use of IN) |

## Subqueries in WHERE, SELECT, FROM, HAVING

### WHERE — Filter

::code-wrapper{language="sql"}
```sql
-- Scalar comparison in WHERE
SELECT * FROM orders
WHERE amount > (SELECT AVG(amount) FROM orders WHERE customer_id = 1);

-- HAVING with a scalar subquery — groups whose total exceeds the grand average
SELECT customer_id, SUM(amount) AS total
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > (SELECT AVG(total) FROM (
  SELECT SUM(amount) AS total FROM orders GROUP BY customer_id
) avg_per_customer);
```
::

### SELECT — Computed Column

::code-wrapper{language="sql"}
```sql
-- Correlated subquery in SELECT: per-customer most recent order date.
-- Re-executes per outer row. For millions of rows, rewrite as a join + GROUP BY.
SELECT c.name,
       (SELECT MAX(ordered_on) FROM orders o WHERE o.customer_id = c.id) AS last_order
FROM customers c;
```
::

### FROM — Derived Table

::code-wrapper{language="sql"}
```sql
-- Derived table: aggregate per customer, then aggregate per city.
-- SQL forbids nested aggregates (AVG(SUM(x)) is illegal), so we stage the inner SUM.
-- A derived table MUST be aliased (per_customer) — syntax error without it.
SELECT city, AVG(customer_total) AS avg_customer_spend
FROM (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total
  FROM customers c
  JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
) per_customer
GROUP BY city
HAVING AVG(customer_total) > 100;
```
::

## LATERAL — Correlated Joins (PostgreSQL, MySQL 8.0+, SQLite 3.39+)

A `LATERAL` subquery in a join can reference columns from tables **earlier in the FROM clause** — like a correlated subquery, but in join position.

::code-wrapper{language="sql"}
```sql
-- Top 3 orders per customer by amount.
-- The LATERAL subquery re-evaluates per customer row, with LIMIT bounding each lookup.
-- LEFT JOIN LATERAL + ON true ensures customers with zero orders still appear (with NULLs).
SELECT c.name, top.id AS order_id, top.amount
FROM customers c
LEFT JOIN LATERAL (
  SELECT id, amount
  FROM orders o
  WHERE o.customer_id = c.id    -- references c.id from the outer (left) table
  ORDER BY amount DESC
  LIMIT 3                        -- bounded per-row: planner can use index on customer_id + amount
) top ON true;
```
::

`LATERAL` is the clean way to do "top-N per group" without window functions. The `LIMIT` inside makes it a bounded per-row lookup — with an index on `(customer_id, amount DESC)`, the planner can do an index scan per customer, fetching only 3 rows each.

## Complex Implementation: Per-Customer Metrics with EXISTS + LATERAL

::code-wrapper{language="sql"}
```sql
-- Production query: per-customer analytics dashboard.
-- Combines:
--   1. EXISTS semi-join (has recent orders?)
--   2. Correlated scalar subquery (lifetime value)
--   3. LATERAL join (top 3 most recent orders)
--   4. NOT EXISTS anti-join (no returned orders)
SELECT
  c.id,
  c.name,
  c.email,
  -- Correlated scalar: lifetime value. Re-executes per customer.
  (SELECT SUM(o.amount) FROM orders o WHERE o.customer_id = c.id) AS lifetime_value,
  -- Semi-join: has the customer ordered in the last 30 days?
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id
      AND o.ordered_on >= CURRENT_DATE - INTERVAL '30 days'
  ) AS active_recently,
  -- Anti-join: no returned orders (status = 'returned').
  -- NOT EXISTS is NULL-safe — doesn't poison like NOT IN.
  NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id
      AND o.status = 'returned'
  ) AS has_no_returns,
  -- LATERAL: top 3 most recent orders, bounded per-row.
  top.recent_order_ids,
  top.recent_amounts
FROM customers c
LEFT JOIN LATERAL (
  SELECT
    array_agg(o.id ORDER BY o.ordered_on DESC) AS recent_order_ids,
    array_agg(o.amount ORDER BY o.ordered_on DESC) AS recent_amounts
  FROM (
    SELECT id, amount, ordered_on
    FROM orders o
    WHERE o.customer_id = c.id
    ORDER BY ordered_on DESC
    LIMIT 3                                  -- only fetch 3 rows per customer
  ) o
) top ON true
WHERE c.status = 'active'
ORDER BY lifetime_value DESC NULLS LAST      -- NULL lifetime_value (no orders) sorts last
LIMIT 100;
```
::

## Anti-Pattern: NOT IN with NULL Subquery (NULL Poison)

### ❌ Wrong Way

::code-wrapper{language="sql"}
```sql
-- Intent: find customers who never ordered product #5.
-- Bug: if orders.customer_id is NULL for ANY matched row (e.g., guest checkout),
-- the subquery returns NULL among its results → NOT IN poisons → ZERO rows returned.
SELECT * FROM customers c
WHERE c.id NOT IN (
  SELECT o.customer_id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE oi.product_id = 5
);
```
::

### ✅ Right Way

::code-wrapper{language="sql"}
```sql
-- NOT EXISTS: NULL-safe anti-join. The subquery returning empty = TRUE.
-- The planner can use a hash anti-join on (customer_id, product_id).
SELECT * FROM customers c
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.customer_id = c.id     -- correlated: references outer c.id
    AND oi.product_id = 5
);
```
::

## Anti-Pattern: Correlated Subquery in SELECT for Large Tables

### ❌ Wrong Way

::code-wrapper{language="sql"}
```sql
-- Per-customer order count via correlated scalar subquery.
-- For 1M customers: 1M subquery executions. The planner may not decorrelate it
-- (especially if the subquery has LIMIT, DISTINCT, or volatile functions).
SELECT c.name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM customers c;
```
::

### ✅ Right Way

::code-wrapper{language="sql"}
```sql
-- LEFT JOIN + GROUP BY: single pass over orders, hash-aggregated by customer_id.
-- The planner does ONE scan of orders + ONE hash aggregation — O(N), not O(N*M).
SELECT c.name,
       COALESCE(o.order_count, 0) AS order_count   -- NULL for customers with zero orders
FROM customers c
LEFT JOIN (
  SELECT customer_id, COUNT(*) AS order_count
  FROM orders
  GROUP BY customer_id
) o ON o.customer_id = c.id;
```
::

## 💡 Tips & Tricks

- **Idiom** — prefer `EXISTS`/`NOT EXISTS` over `IN`/`NOT IN` for subqueries. `EXISTS` is NULL-safe (no poisoning), short-circuits on the first match, and the planner can use hash semi/anti-joins. Reserve `IN` for literal lists (`IN (1, 2, 3)`) where it's unambiguous.
- **Performance** — a correlated subquery in the `SELECT` list that can't be decorrelated runs *per outer row*. For a million-row outer table, that's a million subquery executions. Check `EXPLAIN` for "InitPlan"/"SubPlan" nodes; if you see per-row execution, rewrite as a join + `GROUP BY` or a window function.
- **Idiom** — `SELECT 1` in `EXISTS` is convention, not requirement. `SELECT *` works too, but `SELECT 1` signals "I don't care about the columns" and avoids column-resolution surprises.
- **Debug** — when `NOT IN` returns no rows unexpectedly, run the subquery alone and check for NULLs: `SELECT customer_id FROM orders WHERE customer_id IS NULL`. One NULL is all it takes.
- **Idiom** — use `LATERAL` for "top-N per group" queries. It's more readable than `ROW_NUMBER() OVER (...) WHERE rn <= N` and lets the planner use an indexed per-group lookup with `LIMIT`, which can be much faster than sorting the whole partition.
- **Performance** — `> ANY (subquery)` is equivalent to `> (SELECT MIN(...) ...)` and `> ALL (subquery)` to `> (SELECT MAX(...) ...)`. The scalar `MIN`/`MAX` form is often clearer and lets the planner cache a single value.

## ⚠️ Edge Cases & Gotchas

- **`NOT IN` + NULL = zero rows** — the most dangerous subquery gotcha. `x NOT IN (1, NULL)` returns no rows for the entire query. Always use `NOT EXISTS` or filter NULLs.
- **Scalar subquery returning multiple rows** — `WHERE amount > (SELECT amount FROM orders WHERE customer_id = 1)` is a runtime error if customer 1 has more than one order. Aggregate it (`MAX(amount)`) or use `> ALL(...)`/`> ANY(...)`.
- **Correlated subquery re-execution cost** — a correlated subquery logically runs once per outer row. The planner may decorrelate it into a join, but if it can't (e.g., the subquery has a `LIMIT` or volatile function like `random()`), it's a per-row performance trap.
- **Subquery in `SELECT` list performance** — each correlated scalar subquery in the `SELECT` list adds a per-row execution. Multiple such subqueries compound: 5 correlated subqueries × 1M rows = 5M subquery calls.
- **`ANY`/`ALL` with empty subquery** — `x > ALL (empty set)` is **TRUE** (vacuously), `x > ANY (empty set)` is **FALSE**. This surprises: "no orders exceed the max of an empty set" returns all rows for `ALL`, none for `ANY`.
- **Derived table requires an alias** — `SELECT * FROM (SELECT ...)` is a syntax error. You must alias it: `SELECT * FROM (SELECT ...) t`.
- **`EXISTS` and `SELECT *`** — `EXISTS (SELECT * FROM ...)` works (columns are ignored), but if `*` references an unresolvable column, it errors. `SELECT 1` avoids any column-resolution surprises.
- **Duplicate rows from `IN` with a join** — `SELECT c.* FROM customers c JOIN orders o ON c.id IN (...)` can multiply rows if `orders` has multiple matches. `IN` in a join condition is a filter, not a deduplication.
- **`LATERAL` requires the keyword** — `JOIN (subquery referencing outer)` without `LATERAL` is a syntax error in PostgreSQL and MySQL 8.0+. SQLite 3.39+ is more permissive about implicit correlation.

## 🧠 Spot the Bug

This query intends to find customers who have **not** ordered product #5. It returns zero rows even though several customers haven't ordered product #5. Why?

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers c
WHERE c.id NOT IN (
  SELECT customer_id FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE oi.product_id = 5
);
```
::

<details>
<summary>Answer</summary>

If any order row joins to an `order_items` row with `product_id = 5` but `customer_id IS NULL` (e.g., a guest checkout), the subquery returns a NULL among its results — and `NOT IN` with a NULL in the list returns zero rows for the entire outer query (the NULL-poisoning trap).

The fix — use `NOT EXISTS`, which is NULL-safe:

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers c
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.customer_id = c.id
    AND oi.product_id = 5
);
```
::

`NOT EXISTS` checks "no row exists matching this customer and product 5" — it returns TRUE when the subquery is empty, regardless of NULLs anywhere. It also lets the planner use a hash anti-join.

**The lesson**: `NOT IN` with a subquery over nullable columns is a latent bug — it works until a NULL appears, then silently returns nothing. Use `NOT EXISTS` for "not in another table" semantics.

</details>

## Summary

You can now classify subqueries by return shape (scalar/row/table) and correlation; use `IN`/`NOT IN`/`EXISTS`/`ANY`/`ALL` safely (avoiding the NULL-poisoning trap); build derived tables and `LATERAL` joins; and choose between subqueries and joins based on readability, NULL-safety, and performance. Next: CTEs, the cleaner way to compose multi-stage queries.