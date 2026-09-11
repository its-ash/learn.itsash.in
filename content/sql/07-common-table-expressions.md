# 07 — Common Table Expressions (CTEs)

A Common Table Expression (CTE) is a named temporary result set defined with `WITH`, usable within a single `SELECT`/`INSERT`/`UPDATE`/`DELETE`. CTEs make complex queries readable by breaking them into named stages — and enable recursion (chapter 19).

## Basic Syntax

::code-wrapper{language="sql"}
```sql
-- Single CTE: name a subquery, reference it in the main query.
-- The CTE 'big_orders' is a named subquery whose result is available in the main SELECT.
-- PostgreSQL 12+ inlines non-recursive CTEs by default (folds into main query like a macro).
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

## Multiple Chained CTEs

Chain multiple CTEs, separating with commas. Later CTEs can reference earlier ones — top-to-bottom pipeline flow:

::code-wrapper{language="sql"}
```sql
-- Pipeline: customer_totals → city_totals → final filter.
-- Each CTE reads the prior one. This reads like English: "compute totals, then city averages, then filter."
WITH
  customer_totals AS (
    SELECT customer_id, SUM(amount) AS total
    FROM orders
    GROUP BY customer_id
  ),
  city_totals AS (
    -- References customer_totals (defined above) — forward references are allowed.
    SELECT c.city, AVG(ct.total) AS avg_customer_spend
    FROM customer_totals ct
    JOIN customers c ON c.id = ct.customer_id
    GROUP BY c.city
  )
SELECT * FROM city_totals
WHERE avg_customer_spend > 50
ORDER BY avg_customer_spend DESC;
```
::

## CTEs Reused Multiple Times

A derived table can be referenced once; a CTE can be referenced **multiple times** in the same statement:

::code-wrapper{language="sql"}
```sql
-- Compare each customer's spend to the overall mean and median.
-- 'totals' is referenced THREE times: main query + two scalar subqueries.
-- With MATERIALIZED (PG12+), it's computed once and reused; without, it may be inlined.
WITH totals AS (
  SELECT customer_id, SUM(amount) AS total
  FROM orders
  GROUP BY customer_id
)
SELECT
  t.customer_id,
  t.total,
  t.total - (SELECT AVG(total) FROM totals) AS diff_from_mean,
  t.total - (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total) FROM totals
  ) AS diff_from_median
FROM totals t
ORDER BY t.total DESC;
```
::

## MATERIALIZED vs NOT MATERIALIZED (PostgreSQL 12+)

By default, PostgreSQL 12+ **inlines** non-recursive CTEs — folds them into the main query like a macro, allowing predicate pushdown and join reordering.

`MATERIALIZED` forces the CTE to be computed once and stored (like a temp table):

::code-wrapper{language="sql"}
```sql
-- MATERIALIZED: compute once, store result, reuse.
-- Use when: expensive computation + referenced multiple times.
-- Warning: prevents predicate pushdown from the outer query into the CTE.
WITH expensive AS MATERIALIZED (
  SELECT id, complex_function(data) AS result FROM big_table  -- runs ONCE, full scan
)
SELECT * FROM expensive WHERE result > 0.5;

-- NOT MATERIALIZED: force inlining even when planner would materialize
-- (e.g., recursive CTEs or multiply-referenced CTEs with costly re-evaluation).
WITH cheap AS NOT MATERIALIZED (
  SELECT id, name FROM small_table
)
SELECT * FROM cheap WHERE name LIKE 'A%';
```
::

**When to use `MATERIALIZED`**:

- CTE is **expensive** and referenced **multiple times** → compute once, reuse.
- You want to **fence** the optimizer out of a transformation that would be slower (rare — measure first).
- CTE has **side effects** (data-modifying CTEs are always materialized).

**When NOT to use `MATERIALIZED`**:

- CTE referenced once + outer query filters heavily → inlining lets the filter reach the CTE's tables.
- Before PostgreSQL 12, all CTEs were materialized (CTEs were "optimization fences"). Now opt-in.

## CTEs with INSERT/UPDATE/DELETE

CTEs work with DML — use them to drive data modifications:

::code-wrapper{language="sql"}
```sql
-- Archive old orders: CTE identifies rows, INSERT copies them.
WITH old_orders AS (
  SELECT id FROM orders WHERE ordered_on < '2023-01-01'
)
INSERT INTO orders_archive
SELECT * FROM orders WHERE id IN (SELECT id FROM old_orders);

-- Update the top spender's status: CTE finds the top spender, UPDATE applies.
WITH top AS (
  SELECT customer_id
  FROM orders
  GROUP BY customer_id
  ORDER BY SUM(amount) DESC
  LIMIT 1
)
UPDATE customers SET status = 'vip'
WHERE id IN (SELECT customer_id FROM top);
```
::

## Data-Modifying CTEs (PostgreSQL)

PostgreSQL lets DML statements *be* CTEs, with `RETURNING` feeding subsequent CTEs — atomic multi-step operations:

::code-wrapper{language="sql"}
```sql
-- Atomic "move": DELETE from orders, INSERT into archive, all in one statement.
-- The DELETE's RETURNING rows feed the INSERT. Both run in the same transaction.
-- Note: data-modifying CTEs see the PRE-statement snapshot — they don't see
-- each other's changes within the same statement (only RETURNING rows are visible).
WITH moved AS (
  DELETE FROM orders WHERE ordered_on < '2023-01-01'
  RETURNING *
)
INSERT INTO orders_archive SELECT * FROM moved;

-- Multi-table atomic operation: insert customer, use RETURNING id for their first order.
WITH new_customer AS (
  INSERT INTO customers (name, email)
  VALUES ('Alice', 'alice@example.com')
  RETURNING id
)
INSERT INTO orders (customer_id, amount, ordered_on)
SELECT id, 100.00, CURRENT_DATE
FROM new_customer;
```
::

## Complex Implementation: Multi-Stage ETL Pipeline

::code-wrapper{language="sql"}
```sql
-- Production ETL: stage → dedup → aggregate → upsert.
-- Each CTE is a named stage in the pipeline. All run in one atomic statement.
WITH
  -- Stage 1: Read raw events from staging table, filter invalid rows.
  staged AS (
    SELECT
      event_id,
      customer_id,
      product_id,
      amount,
      event_ts,
      source                                  -- track provenance for debugging
    FROM raw_events_staging
    WHERE event_ts >= '2024-01-01'
      AND customer_id IS NOT NULL             -- drop rows with NULL FK (would poison later joins)
      AND amount > 0                          -- drop negative/zero amounts (data quality)
  ),

  -- Stage 2: Deduplicate by event_id (keep latest by event_ts).
  -- ROW_NUMBER partitioned by event_id, ordered by event_ts DESC → rn=1 is the latest.
  deduped AS (
    SELECT *
    FROM (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY event_ts DESC) AS rn
      FROM staged
    ) ranked
    WHERE rn = 1                               -- only the latest version of each event
  ),

  -- Stage 3: Aggregate to daily customer-product totals.
  aggregated AS (
    SELECT
      customer_id,
      product_id,
      DATE(event_ts) AS event_date,
      SUM(amount) AS daily_total,
      COUNT(*) AS event_count
    FROM deduped
    GROUP BY customer_id, product_id, DATE(event_ts)
  ),

  -- Stage 4: Upsert into the fact table (PostgreSQL ON CONFLICT).
  -- INSERT new rows; on conflict, UPDATE the daily_total and event_count.
  upserted AS (
    INSERT INTO fact_daily_sales (customer_id, product_id, event_date, daily_total, event_count)
    SELECT customer_id, product_id, event_date, daily_total, event_count
    FROM aggregated
    ON CONFLICT (customer_id, product_id, event_date)
    DO UPDATE SET
      daily_total = EXCLUDED.daily_total,
      event_count = EXCLUDED.event_count,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, customer_id, product_id, event_date
  )

-- Final: log what was upserted (for audit/monitoring).
SELECT COUNT(*) AS rows_upserted, COUNT(DISTINCT customer_id) AS customers_affected
FROM upserted;
```
::

## Anti-Pattern: Deeply Nested Subqueries vs Flat CTE Pipeline

### ❌ Wrong Way — Nested Subqueries

::code-wrapper{language="sql"}
```sql
-- Three levels of nesting: unreadable, unmaintainable, can't inspect intermediate stages.
SELECT city, AVG(customer_total) AS avg_spend
FROM (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total
  FROM (
    SELECT * FROM customers WHERE status = 'active'
  ) c
  JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
) per_customer
GROUP BY city
HAVING AVG(customer_total) > (
  SELECT AVG(total) FROM (
    SELECT SUM(amount) AS total FROM orders GROUP BY customer_id
  ) avg_per_customer
);
```
::

### ✅ Right Way — Flat CTE Pipeline

::code-wrapper{language="sql"}
```sql
-- Each stage is named and inspectable. Comment out the final SELECT and
-- replace with 'SELECT * FROM aggregated' to debug any intermediate stage.
WITH active_customers AS (
  SELECT * FROM customers WHERE status = 'active'
),
customer_totals AS (
  SELECT c.city, c.id, SUM(o.amount) AS customer_total
  FROM active_customers c
  JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city, c.id
),
overall_avg AS (
  SELECT AVG(customer_total) AS avg_total FROM customer_totals
)
SELECT c.city, AVG(c.customer_total) AS avg_spend
FROM customer_totals c
CROSS JOIN overall_avg oa
GROUP BY c.city
HAVING AVG(c.customer_total) > oa.avg_total
ORDER BY avg_spend DESC;
```
::

## CTEs vs Derived Tables vs Subqueries

| Feature | CTE | Derived table | Subquery |
|---|---|---|---|
| Named | ✅ | ✅ (alias) | inline |
| Reusable in same query | ✅ (multiple refs) | ❌ (one use) | ❌ |
| Can reference earlier CTEs | ✅ | ❌ | ❌ |
| Recursion | ✅ (`WITH RECURSIVE`) | ❌ | ❌ |
| Readability for multi-stage | ✅✅ | ✅ | ❌ |
| Inlined by optimizer (PG 12+) | ✅ (default) | ✅ | ✅ |

## 💡 Tips & Tricks

- **Idiom** — name CTEs by **what they compute**, not by the table they scan. `big_orders`, `customer_totals`, `city_avg` are good; `cte1`, `data`, `temp` are bad. The name is the documentation.
- **Performance** — in PostgreSQL 12+, default (inlined) CTEs perform like derived tables — no penalty. But `MATERIALIZED` + single reference may *prevent* predicate pushdown and slow the query. Use `MATERIALIZED` deliberately (expensive + reused), not reflexively.
- **Idiom** — chain CTEs as a pipeline (each reads the prior). This top-to-bottom flow matches how you'd explain the query in English. Define them flat at the top, in dependency order — don't nest CTEs inside CTEs.
- **Idiom** — use data-modifying CTEs for atomic multi-table operations. `WITH ins AS (INSERT ... RETURNING), sel AS (SELECT ... FROM ins)` keeps everything in one transaction — no partial state on failure.
- **Debug** — to debug a multi-CTE pipeline, comment out the final `SELECT` and replace it with `SELECT * FROM some_cte` to inspect an intermediate stage — much easier than unwinding nested subqueries.
- **Portability** — `WITH` is standard SQL (PostgreSQL, MySQL 8.0+, SQLite 3.8+, SQL Server, Oracle). `MATERIALIZED`/`NOT MATERIALIZED` hints are PostgreSQL-specific. Data-modifying CTEs are PostgreSQL-specific (SQL Server uses `OUTPUT` differently).

## ⚠️ Edge Cases & Gotchas

- **CTE materialization in PG12+ (inlining)** — by default, non-recursive CTEs are inlined (folded into the main query). This is usually good (predicate pushdown), but if you relied on pre-PG12 fence behavior, queries may change performance characteristics. Use `MATERIALIZED` to restore the fence.
- **CTE referencing order** — a CTE can reference CTEs defined *before* it in the same `WITH`, but not *after* (no forward references). Define CTEs in dependency order.
- **CTE name shadows tables** — a CTE named `orders` shadows the real `orders` table in the main query. Legal but confusing — avoid reusing table names as CTE names.
- **A CTE is only valid for one statement** — `WITH ... SELECT ...` — the CTE doesn't persist to the next query. For cross-query reuse, use a temp table or a view.
- **`MATERIALIZED` + single reference can hurt** — materializing prevents predicate pushdown. If the outer query filters heavily, inlining lets the filter reach the CTE's tables; materializing computes the full CTE first. Measure before forcing.
- **Data-modifying CTEs see a snapshot** — in `WITH ins AS (INSERT ... RETURNING), sel AS (SELECT ... FROM ins)`, `sel` sees the `RETURNING` rows, but a *separate* CTE reading the same table the `INSERT` targets sees the pre-`INSERT` state. All data-modifying CTEs execute against the same snapshot.
- **CTE in `UPDATE`/`DELETE` can't target the CTE's own table** — you can't `WITH t AS (SELECT ...) DELETE FROM t`. The CTE is read-only. You can reference a CTE in the `WHERE` of a `DELETE` from a real table.
- **Recursive CTEs require the `RECURSIVE` keyword** — `WITH RECURSIVE ...` — forgetting `RECURSIVE` on a self-referencing CTE is a syntax error. See chapter 19.
- **Column names from a CTE** — a CTE's columns are named by its `SELECT`. If an expression has no alias, the column name is implementation-defined (PostgreSQL uses `?column?`). Always alias expressions in CTEs you'll reference by name.
- **Scope of CTE names** — a CTE name is visible only within the `WITH` statement that defines it. It's not visible in subqueries outside the `WITH`, in functions, or in subsequent statements.

## 🧠 Spot the Bug

A developer writes this data-modifying CTE and expects to see the newly inserted rows in the `audit_log` CTE. But `audit_log` returns zero rows. Why?

::code-wrapper{language="sql"}
```sql
WITH
  inserted AS (
    INSERT INTO customers (name, email)
    VALUES ('Bob', 'bob@example.com')
    RETURNING id, name
  ),
  audit_log AS (
    -- Intent: log that a new customer was added by reading the customers table.
    SELECT id, name FROM customers WHERE name = 'Bob'
  )
SELECT * FROM audit_log;
```
::

<details>
<summary>Answer</summary>

`audit_log` reads the `customers` **table**, not the `inserted` CTE. Data-modifying CTEs all execute against the **same pre-statement snapshot** — so `audit_log` sees the `customers` table as it was *before* the `INSERT` ran. The newly inserted row doesn't exist in `audit_log`'s snapshot, so it returns zero rows.

To see the inserted rows, `audit_log` must reference the `inserted` CTE (which exposes the `RETURNING` rows), not the `customers` table:

::code-wrapper{language="sql"}
```sql
WITH
  inserted AS (
    INSERT INTO customers (name, email)
    VALUES ('Bob', 'bob@example.com')
    RETURNING id, name
  ),
  audit_log AS (
    -- ✅ Read from the 'inserted' CTE, which exposes RETURNING rows.
    SELECT id, name FROM inserted
  )
SELECT * FROM audit_log;
```
::

**The lesson**: within a data-modifying CTE statement, CTEs that read a table see the *pre-statement* snapshot. Only `RETURNING` rows (accessed via the CTE name) reflect the DML changes. Never read the target table of a data-modifying CTE expecting to see that CTE's writes.

</details>

## Summary

You can now write single and chained CTEs, reuse them multiple times, drive DML from them, and choose between inlining and materialization — turning multi-stage queries into readable, atomic pipelines. Next: set operations for combining result sets.