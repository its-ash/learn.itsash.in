# 06 — Subqueries

A subquery is a query nested inside another query. Subqueries appear in `WHERE`, `SELECT`, `FROM`, and even `HAVING`. They're the primary way to compose queries before reaching for CTEs (chapter 07) or joins.

## Subquery Classifications

Subqueries differ on two axes:

1. **Return shape**: scalar (one row, one column), row (one row, multiple columns), or table (multiple rows, one or more columns).
2. **Correlation**: an *uncorrelated* subquery can run independently of the outer query; a *correlated* subquery references the outer query's columns and re-executes per outer row.

The classification determines where you can use the subquery and which operators apply.

## Scalar Subqueries

A scalar subquery returns exactly one row and one column. It can appear anywhere a single value is legal — in `SELECT`, `WHERE`, `HAVING`, even in `VALUES`.

::code-wrapper{language="sql"}
```sql
-- Orders above the average order amount
SELECT id, amount
FROM orders
WHERE amount > (SELECT AVG(amount) FROM orders);

-- Each order with the overall average for comparison
SELECT id, amount, (SELECT AVG(amount) FROM orders) AS overall_avg
FROM orders;

-- A computed column from a scalar subquery
SELECT c.name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM customers c;
```
::

If a scalar subquery returns zero rows, its value is NULL. If it returns more than one row, it's a runtime error (`ERROR: more than one row returned by a subquery used as an expression`).

## Row Subqueries

A row subquery returns one row with multiple columns. Compare against a row constructor:

::code-wrapper{language="sql"}
```sql
-- Orders matching a specific (customer_id, amount) pair
SELECT * FROM orders
WHERE (customer_id, amount) = (1, 99.50);
``
::

Row comparisons are lexicographic and follow three-valued logic — `(a, b) = (x, y)` is `a = x AND b = y`, so any NULL makes the whole thing UNKNOWN.

## Table Subqueries (IN, ANY, ALL)

A table subquery returns multiple rows. Use it with `IN`, `ANY`/`ALL`, `EXISTS`, or in the `FROM` clause.

### `IN`

::code-wrapper{language="sql"}
```sql
-- Customers who have placed at least one order
SELECT * FROM customers
WHERE id IN (SELECT customer_id FROM orders);
``
::

### `NOT IN` — the NULL trap (dangerous!)

`NOT IN` breaks if the subquery can produce NULL:

::code-wrapper{language="sql"}
```sql
-- ❌ Returns ZERO rows if any customer_id in the subquery is NULL
SELECT * FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
``
::

Why: `x NOT IN (a, b, c)` is `x <> a AND x <> b AND x <> c`. If any element is NULL, `x <> NULL` is UNKNOWN, which makes the whole `AND` chain UNKNOWN, which `WHERE` treats as "not true." **One NULL in the subquery poisons the entire `NOT IN`.**

The fixes:

::code-wrapper{language="sql"}
```sql
-- Option 1: filter NULLs in the subquery
SELECT * FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL);

-- Option 2: use NOT EXISTS (immune to NULL, usually faster)
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- Option 3: IS DISTINCT FROM (NULL-safe)
SELECT * FROM customers c
WHERE c.id IS DISTINCT FROM ALL (SELECT customer_id FROM orders);
``
::

**Prefer `NOT EXISTS`.** It's NULL-safe and the planner can use a hash anti-join.

### `ANY` / `ALL`

`ANY` (a.k.a. `SOME`) — true if the comparison holds for *at least one* subquery row. `ALL` — true for *every* row.

::code-wrapper{language="sql"}
```sql
-- Orders larger than at least one order from customer 1
SELECT * FROM orders
WHERE amount > ANY (SELECT amount FROM orders WHERE customer_id = 1);

-- Orders larger than every order from customer 1 (the max)
SELECT * FROM orders
WHERE amount > ALL (SELECT amount FROM orders WHERE customer_id = 1);
``
::

`> ANY (...)` is equivalent to `> (SELECT MIN(...) ...)`. `> ALL (...)` is equivalent to `> (SELECT MAX(...) ...)`. The scalar form with `MIN`/`MAX` is often clearer.

### `= ANY` vs `IN`

`= ANY (subquery)` is exactly equivalent to `IN (subquery)`. `IN` is the more common spelling. `ANY`/`ALL` matter for non-equality comparisons (`> ANY`, `< ALL`).

## EXISTS — Semi-Join

`EXISTS` is true if the subquery returns **at least one row** — it doesn't care what the rows contain. By convention, `SELECT 1` is used (the value is irrelevant).

::code-wrapper{language="sql"}
```sql
-- Customers who have placed at least one order
SELECT * FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- Customers who have NOT placed any order (anti-join)
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```
::

`EXISTS` is a **correlated** subquery — it references `c.id` from the outer query. The planner typically implements it as a semi-join (or anti-join for `NOT EXISTS`), which can short-circuit on the first match. For large datasets, `EXISTS` is usually faster than `IN` because it doesn't materialize the full subquery result.

### `EXISTS` vs `IN` — when to use which

| Criterion | Prefer `EXISTS` | Prefer `IN` |
|---|---|---|
| Subquery can produce NULLs | ✅ (NULL-safe) | ❌ (use `NOT EXISTS`) |
| Uncorrelated, small list | — | ✅ (simpler) |
| Correlated (depends on outer row) | ✅ | works but less idiomatic |
| Large subquery result | ✅ (semi-join, short-circuits) | can materialize |

## Correlated Subqueries in SELECT

A correlated subquery in the `SELECT` list computes a value per outer row:

::code-wrapper{language="sql"}
```sql
-- Each customer's most recent order date
SELECT c.name,
       (SELECT MAX(ordered_on) FROM orders o WHERE o.customer_id = c.id) AS last_order
FROM customers c;
```
::

This re-executes the subquery for every customer. For a few hundred customers, fine. For millions, a join with `GROUP BY` or a window function (chapter 09) is far faster — the planner can sometimes "decorrelate" it into a join, but don't count on it.

## Subqueries in FROM (Derived Tables)

A subquery in `FROM` is a **derived table** — it acts like a temporary, inline view.

::code-wrapper{language="sql"}
```sql
-- Average spend per customer, then cities whose average customer spends > $100
SELECT city, AVG(customer_total) AS avg_customer_spend
FROM (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
) per_customer
GROUP BY city
HAVING AVG(customer_total) > 100;
``
::

A derived table **must be aliased** (`per_customer` above) — even if you don't reference the alias, the syntax requires it. Columns are referenced via the alias.

Derived tables are the pre-CTE way to break a query into stages. CTEs (chapter 07) are usually clearer, but derived tables can be more performant when you want the planner to inline them (PostgreSQL inlines derived tables aggressively; CTEs were optimization fences before PostgreSQL 12).

## LATERAL — Correlated Joins (PostgreSQL)

A `LATERAL` subquery in a join can reference columns from tables earlier in the `FROM` clause — like a correlated subquery, but in join position.

::code-wrapper{language="sql"}
```sql
-- For each customer, their top 3 orders by amount
SELECT c.name, top.id, top.amount
FROM customers c
LEFT JOIN LATERAL (
  SELECT id, amount
  FROM orders o
  WHERE o.customer_id = c.id
  ORDER BY amount DESC
  LIMIT 3
) top ON true;
```
::

`LATERAL` is the clean way to do "top-N per group" without window functions. The subquery re-evaluates per outer row, and `LIMIT` inside makes it a bounded per-row lookup. MySQL 8.0+ and SQLite 3.39+ also support `LATERAL`.

## Subqueries vs Joins — When to Use Which

Most subqueries can be rewritten as joins, and vice versa. Guidelines:

- **Semi-joins ("exists in another table")**: `EXISTS` / `IN` / `LEFT JOIN ... IS NULL` — pick by readability and NULL-safety.
- **Scalar lookups**: a correlated subquery in `SELECT` reads clearly for one value; a join + `GROUP BY` scales better for many.
- **Multi-stage aggregation**: derived tables / CTEs over nested aggregates (which SQL forbids: `AVG(SUM(x))` is illegal).
- **Top-N per group**: `LATERAL` or window functions (chapter 09) — not raw subqueries.

When in doubt, write the join version and the subquery version, run both with `EXPLAIN ANALYZE`, and compare. Modern planners often transform one into the other, but not always.

## 💡 Tips & Tricks

- **Idiom**: prefer `EXISTS`/`NOT EXISTS` over `IN`/`NOT IN` for subqueries — `EXISTS` is NULL-safe (no poisoning), short-circuits on the first match, and the planner can use hash semi/anti-joins. Reserve `IN` for literal lists (`IN (1, 2, 3)`) where it's unambiguous.
- **Performance**: a correlated subquery in the `SELECT` list that can't be decorrelated runs *per outer row* — for a million-row outer table, that's a million subquery executions. Check `EXPLAIN` for "InitPlan"/"SubPlan" nodes; if you see per-row execution, rewrite as a join + `GROUP BY` or a window function.
- **Idiom**: `SELECT 1` in `EXISTS` is convention, not requirement — `SELECT *` works too, but `SELECT 1` signals "I don't care about the columns" and avoids confusing readers into thinking the columns matter.
- **Debug**: when `NOT IN` returns no rows unexpectedly, run the subquery alone and check for NULLs: `SELECT customer_id FROM orders WHERE customer_id IS NULL` — one NULL is all it takes to poison the whole `NOT IN`.
- **Idiom**: use `LATERAL` for "top-N per group" queries — it's more readable than `ROW_NUMBER() OVER (...) WHERE rn <= N` and lets the planner use an indexed per-group lookup with `LIMIT`, which can be much faster than sorting the whole partition.

## ⚠️ Edge Cases & Gotchas

- **`NOT IN` + NULL = zero rows**: the most dangerous subquery gotcha. `x NOT IN (1, NULL)` returns no rows for the entire query. Always use `NOT EXISTS` or filter NULLs.
- **Scalar subquery returning multiple rows**: `WHERE amount > (SELECT amount FROM orders WHERE customer_id = 1)` is a runtime error if customer 1 has more than one order. Aggregate it (`MAX(amount)`) or use `> ALL(...)`/`> ANY(...)`.
- **Correlated subquery re-execution**: a correlated subquery logically runs once per outer row. The planner may decorrelate it into a join, but if it can't (e.g., the subquery has a `LIMIT` or volatile function), it's a per-row performance trap.
- **Derived table requires an alias**: `SELECT * FROM (SELECT ...) ` is a syntax error — you must alias it: `SELECT * FROM (SELECT ...) t`. Forgetting the alias is a common typo.
- **`EXISTS` and `SELECT *`**: `EXISTS (SELECT * FROM ...)` works — the columns are ignored. But if the subquery's `*` references a column the planner can't resolve, it errors. `SELECT 1` avoids any column-resolution surprises.
- **Duplicate rows from `IN` with a join**: `SELECT c.* FROM customers c JOIN orders o ON c.id IN (...)` can multiply rows if `orders` has multiple matches. `IN` in a join condition is a filter, not a deduplication.
- **`ANY`/`ALL` with empty subquery**: `x > ALL (empty set)` is **TRUE** (vacuously — "greater than every element of nothing" is true), while `x > ANY (empty set)` is **FALSE**. This surprises people: "no orders exceed the max of an empty set" returns all rows for `ALL`, none for `ANY`.
- **Subquery in `SELECT` with no `FROM`**: `SELECT 1, (SELECT COUNT(*) FROM orders)` is legal — the outer query has one row, the scalar subquery runs once. Useful for "return a single row with some counts."
- **`LATERAL` requires the keyword in PostgreSQL**: `JOIN (subquery referencing outer)` without `LATERAL` is a syntax error. MySQL 8.0+ also requires `LATERAL`. SQLite 3.39+ supports it but is more permissive about implicit correlation.

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

If any order row joins to an `order_items` row with `product_id = 5` but `customer_id IS NULL` (or if `orders.customer_id` is NULL for some matched order), the subquery returns a NULL among its results — and `NOT IN` with a NULL in the list returns zero rows for the entire outer query (the NULL-poisoning trap).

Even without NULL `customer_id`s, there's a second, subtler risk: if `orders` has rows where `customer_id` is legitimately NULL (e.g., a guest checkout), and those orders happen to contain product #5, the subquery emits NULL, poisoning `NOT IN`.

The fix — use `NOT EXISTS`, which is NULL-safe:

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

You can now write scalar, row, and table subqueries; use `IN`/`NOT IN`/`EXISTS`/`ANY`/`ALL` safely (avoiding the NULL-poisoning trap); build derived tables and `LATERAL` joins; and choose between subqueries and joins based on readability and performance. Next: CTEs, the cleaner way to compose multi-stage queries.