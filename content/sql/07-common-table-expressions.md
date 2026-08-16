# 07 — Common Table Expressions (CTEs)

A Common Table Expression (CTE) is a named temporary result set defined with `WITH`, usable within a single `SELECT`/`INSERT`/`UPDATE`/`DELETE`. CTEs make complex queries readable by breaking them into named stages — and enable recursion (chapter 19).

## Basic Syntax

::code-wrapper{language="sql"}
```sql
WITH big_orders AS (
  SELECT customer_id, SUM(amount) AS total
  FROM orders
  GROUP BY customer_id
  HAVING SUM(amount) > 100
)
SELECT c.name, b.total
FROM big_orders b
JOIN customers c ON c.id = b.customer_id
ORDER BY b.total DESC;
```
::

`big_orders` is a named subquery whose result is available in the main query. You can reference a CTE multiple times in the same statement (unlike a derived table, which is inline and used once).

## Multiple CTEs

Chain multiple CTEs, separating with commas. Later CTEs can reference earlier ones:

::code-wrapper{language="sql"}
```sql
WITH
  customer_totals AS (
    SELECT customer_id, SUM(amount) AS total
    FROM orders
    GROUP BY customer_id
  ),
  city_totals AS (
    SELECT c.city, AVG(ct.total) AS avg_customer_spend
    FROM customer_totals ct
    JOIN customers c ON c.id = ct.customer_id
    GROUP BY c.city
  )
SELECT * FROM city_totals WHERE avg_customer_spend > 50;
``
::

This reads top-to-bottom as a pipeline — far clearer than nested derived tables.

## CTEs for Readability

Use a CTE whenever a query has:

- Nested subqueries more than two levels deep.
- A subquery referenced more than once.
- A complex `WHERE`/`CASE` expression you want to name and reuse.
- Multi-stage aggregation (aggregating an aggregate).

Naming a stage turns "what does this subquery do?" into a readable label.

## CTEs Reused Multiple Times

::code-wrapper{language="sql"}
```sql
-- Compare each customer's spend to the overall median and mean
WITH totals AS (
  SELECT customer_id, SUM(amount) AS total
  FROM orders
  GROUP BY customer_id
)
SELECT
  t.customer_id,
  t.total,
  t.total - (SELECT AVG(total) FROM totals) AS diff_from_mean,
  t.total - (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total) FROM totals) AS diff_from_median
FROM totals t;
``
::

A derived table can't be referenced twice in the same query; a CTE can.

## CTEs with INSERT/UPDATE/DELETE

CTEs work with DML too:

::code-wrapper{language="sql"}
```sql
-- Archive old orders: insert into archive, then delete
WITH old_orders AS (
  SELECT id FROM orders WHERE ordered_on < '2023-01-01'
)
INSERT INTO orders_archive
SELECT * FROM orders WHERE id IN (SELECT id FROM old_orders);

-- Update the top spender's status
WITH top AS (
  SELECT customer_id FROM orders
  GROUP BY customer_id ORDER BY SUM(amount) DESC LIMIT 1
)
UPDATE customers SET status = 'vip'
WHERE id IN (SELECT customer_id FROM top);
``
::

## Data-Modifying CTEs (PostgreSQL)

PostgreSQL lets DML statements *be* CTEs, with `RETURNING` feeding subsequent CTEs — atomic multi-step operations:

::code-wrapper{language="sql"}
```sql
WITH moved AS (
  DELETE FROM orders WHERE ordered_on < '2023-01-01'
  RETURNING *
)
INSERT INTO orders_archive SELECT * FROM moved;
``
::

The `DELETE` and `INSERT` run in the same transaction. This is a clean way to "move" rows. Note: data-modifying CTEs see the *pre-statement* snapshot of tables, so they don't see each other's changes within the same statement.

## MATERIALIZED vs NOT MATERIALIZED

By default, PostgreSQL (12+) **inlines** non-recursive CTEs — it folds them into the main query, like a macro, allowing the optimizer to push predicates down and reorder joins. This is usually what you want.

`MATERIALIZED` forces the CTE to be computed once and stored (like a temp table):

::code-wrapper{language="sql"}
```sql
WITH expensive AS MATERIALIZED (
  SELECT id, complex_function(data) AS result FROM big_table
)
SELECT * FROM expensive WHERE result > 0.5;
```
::

Use `MATERIALIZED` when:

- The CTE is **expensive** and referenced **multiple times** — compute once, reuse.
- You want to **fence** the optimizer out of a transformation that would be slower (rare — measure first).
- The CTE has **side effects** (data-modifying CTEs are always materialized).

`NOT MATERIALIZED` forces inlining even when the planner would materialize (e.g., recursive CTEs, or CTEs referenced multiple times with costly re-evaluation).

Before PostgreSQL 12, all CTEs were materialized (CTEs were "optimization fences"). That behavior is now opt-in via `MATERIALIZED`.

## CTEs vs Derived Tables vs Subqueries

| Feature | CTE | Derived table | Subquery |
|---|---|---|---|
| Named | ✅ | ✅ (alias) | inline |
| Reusable in same query | ✅ (multiple refs) | ❌ (one use) | ❌ |
| Can reference earlier CTEs | ✅ | ❌ | ❌ |
| Recursion | ✅ (`WITH RECURSIVE`) | ❌ | ❌ |
| Readability for multi-stage | ✅✅ | ✅ | ❌ |
| Inlined by optimizer (PG 12+) | ✅ (default) | ✅ | ✅ |

Reach for a CTE when you have multiple stages or reuse; reach for a derived table for a single inline step; reach for a subquery for a simple `WHERE`/`SELECT` lookup.

## 💡 Tips & Tricks

- **Idiom**: name CTEs by **what they compute**, not by the table they scan — `big_orders`, `customer_totals`, `city_avg` are good; `cte1`, `data`, `temp` are bad. The name is the documentation.
- **Performance**: in PostgreSQL 12+, default (inlined) CTEs perform like derived tables — no penalty. But if you mark a CTE `MATERIALIZED` and reference it once, you may *prevent* predicate pushdown and slow the query. Use `MATERIALIZED` deliberately (expensive + reused), not reflexively.
- **Idiom**: chain CTEs as a pipeline (each reads the prior) — this top-to-bottom flow matches how you'd explain the query in English and is far more readable than inside-out nested subqueries. Resist the urge to nest CTEs inside CTEs (define them flat at the top, in dependency order).
- **Debug**: to debug a multi-CTE pipeline, comment out the final `SELECT` and replace it with `SELECT * FROM some_cte` to inspect an intermediate stage — much easier than unwinding nested subqueries.
- **Portability**: `WITH` is standard SQL and widely supported (PostgreSQL, MySQL 8.0+, SQLite 3.8+, SQL Server, Oracle). `MATERIALIZED`/`NOT MATERIALIZED` hints are PostgreSQL-specific. Data-modifying CTEs are PostgreSQL-specific (and SQL Server with OUTPUT, differently).

## ⚠️ Edge Cases & Gotchas

- **CTE visibility**: a CTE can reference CTEs defined *before* it in the same `WITH`, but not *after* (no forward references). Define CTEs in dependency order.
- **CTE name shadows tables**: a CTE named `orders` shadows the real `orders` table in the main query. This is legal but confusing — avoid reusing table names as CTE names.
- **A CTE is only valid for one statement**: `WITH ... SELECT ...` — the CTE doesn't persist to the next query. For跨-query reuse, use a temp table or a view.
- **`MATERIALIZED` + single reference can hurt**: materializing prevents predicate pushdown from the outer query into the CTE. If the outer query filters heavily, inlining lets the filter reach the CTE's tables; materializing computes the full CTE first. Measure before forcing materialization.
- **Data-modifying CTEs see a snapshot**: in `WITH ins AS (INSERT ... RETURNING), sel AS (SELECT ... FROM ins)`, the `sel` CTE sees the `RETURNING` rows, but a *separate* CTE reading the same table the `INSERT` targets sees the pre-`INSERT` state. This is "all data-modifying CTEs execute against the same snapshot."
- **Recursive CTEs require the `RECURSIVE` keyword**: `WITH RECURSIVE ...` — forgetting `RECURSIVE` on a self-referencing CTE is a syntax error. See chapter 19.
- **CTEs in `UPDATE`/`DELETE` can't target the CTE's own table**: you can't `WITH t AS (SELECT ...) DELETE FROM t` — the CTE is read-only. You can reference a CTE in the `WHERE` of a `DELETE` from a real table, though.
- **Column names from a CTE**: a CTE's columns are named by its `SELECT` — if an expression has no alias, the column name is implementation-defined (PostgreSQL uses `?column?`). Always alias expressions in CTEs you'll reference by name.

## 🧠 Spot the Bug

A developer writes this and is surprised the query is slow, even though `orders` has an index on `ordered_on`:

::code-wrapper{language="sql"}
```sql
WITH recent AS MATERIALIZED (
  SELECT customer_id, amount, ordered_on
  FROM orders
)
SELECT * FROM recent WHERE ordered_on >= '2024-01-01';
```
::

What's happening, and how should it be fixed?

<details>
<summary>Answer</summary>

`MATERIALIZED` forces the `recent` CTE to be computed fully *before* the outer query's `WHERE` is applied — so PostgreSQL scans the entire `orders` table, materializes all rows into the CTE, and only then filters to `ordered_on >= '2024-01-01'`. The index on `ordered_on` is never used, because the filter isn't pushed down into the CTE's table scan.

Without `MATERIALIZED` (the default in PostgreSQL 12+), the planner would **inline** the CTE, transforming it into `SELECT customer_id, amount, ordered_on FROM orders WHERE ordered_on >= '2024-01-01'` — and the index would be used.

The fix: drop `MATERIALIZED` (let the planner inline), or add the filter inside the CTE:

```sql
-- Option 1: let the planner inline (default)
WITH recent AS (
  SELECT customer_id, amount, ordered_on FROM orders
)
SELECT * FROM recent WHERE ordered_on >= '2024-01-01';

-- Option 2: filter inside the CTE
WITH recent AS (
  SELECT customer_id, amount, ordered_on FROM orders
  WHERE ordered_on >= '2024-01-01'
)
SELECT * FROM recent;
```

**The lesson**: `MATERIALIZED` is an optimization *fence* — it prevents predicate pushdown. Use it only when the CTE is expensive and reused; otherwise, let the planner inline so filters and joins can reach the underlying tables.

</details>

## Summary

You can now write single and chained CTEs, reuse them, drive DML from them, and choose between inlining and materialization — turning multi-stage queries into readable pipelines. Next: set operations for combining result sets.