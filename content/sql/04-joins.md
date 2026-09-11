# 04 — Joins

Joins combine rows from two (or more) tables based on a related column. They are the defining feature of relational databases — the "relational" in "relational" is realized through joins.

## The Mental Model: Cartesian Product + Filter

A join produces a **combined result set** by matching rows from the left and right inputs. Think of it in two steps:

1. **Cartesian product** — every row of the left table paired with every row of the right table.
2. **Filter** — keep only the pairs that satisfy the join condition.

Different join types vary step 2's filter and which un-matched rows are kept. The optimizer doesn't actually compute the full Cartesian product (it uses nested loops, hashes, or merges), but the *result* is as if it did.

## INNER JOIN

Keeps only rows that match in **both** tables.

::code-wrapper{language="sql"}
```sql
-- Customers and their orders (only customers who have orders)
-- INNER JOIN = Cartesian product filtered by ON condition
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id;
```
::

Unmatched rows (customers with no orders, orders with no customer) are dropped.

## LEFT (OUTER) JOIN

Keeps **all rows from the left** table, with NULLs for unmatched right rows.

::code-wrapper{language="sql"}
```sql
-- All customers, with their orders if any (NULLs for customers with no orders)
-- Left rows preserved; right columns are NULL when no match found
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id;
```
::

Customers without orders appear once with `order_id = NULL`, `amount = NULL`.

### LEFT JOIN Anti-Join Pattern

::code-wrapper{language="sql"}
```sql
-- Customers who have never placed an order — the idiomatic "anti-join"
-- LEFT JOIN produces NULL-extended rows for unmatched customers,
-- then WHERE o.id IS NULL filters to only those unmatched rows.
SELECT c.*
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.id IS NULL;                            -- test a NON-NULLABLE column (PK), not o.amount
```
::

Test a **non-nullable** column (like `o.id`, the primary key) — testing `o.amount IS NULL` would also exclude rows where the order exists but `amount` happens to be NULL.

## RIGHT (OUTER) JOIN

Keeps **all rows from the right** table. It's a `LEFT JOIN` with the tables swapped.

::code-wrapper{language="sql"}
```sql
-- All orders, with their customer if any
-- Most teams ban RIGHT JOIN for readability — swap tables and use LEFT JOIN instead
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
RIGHT JOIN orders o ON c.id = o.customer_id;
```
::

## FULL (OUTER) JOIN

Keeps **all rows from both** tables, with NULLs on whichever side has no match.

::code-wrapper{language="sql"}
```sql
-- All customers and all orders, matched where possible
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
FULL JOIN orders o ON c.id = o.customer_id;
```
::

PostgreSQL and SQL Server support `FULL JOIN`. **MySQL and SQLite do not** — emulate with `LEFT JOIN` + `UNION` + anti-join.

## CROSS JOIN

The Cartesian product — every left row paired with every right row, no filter. No `ON` clause.

::code-wrapper{language="sql"}
```sql
-- All (customer, product) pairs — useful for generating combinations or sparse matrices
-- If customers has 3 rows and products has 5, result has 15 rows
SELECT c.name, p.name AS product
FROM customers c
CROSS JOIN products p;
```
::

## JOIN Syntax: ON, USING, NATURAL

### `ON` — explicit condition

::code-wrapper{language="sql"}
```sql
-- ON can include any boolean expression, not just equality
SELECT * FROM customers c
JOIN orders o ON c.id = o.customer_id;

-- Non-equi join: match orders that exceed the customer's credit limit
SELECT c.name, o.id, o.amount
FROM customers c
JOIN orders o ON o.customer_id = c.id AND o.amount > c.credit_limit;
```
::

### `USING` — shorthand for same-named columns

::code-wrapper{language="sql"}
```sql
-- When both tables have a column named "customer_id"
-- USING returns the joined column ONCE in the output (ON returns both c.customer_id and o.customer_id)
SELECT * FROM customers JOIN orders USING (customer_id);
```
::

### `NATURAL JOIN` — auto-join on all same-named columns (avoid)

::code-wrapper{language="sql"}
```sql
-- DANGEROUS: joins on EVERY column with the same name in both tables.
-- If a future schema change adds a same-named column (e.g., created_at),
-- the join silently changes behavior. Never use in production.
SELECT * FROM customers NATURAL JOIN orders;
```
::

## Complex Implementation: 4-Table Production Join Chain

::code-wrapper{language="sql"}
```sql
-- A production join chain: customers → orders → order_items → products
-- Filtering at each step to minimize intermediate result size.
SELECT
  c.name AS customer,
  o.id AS order_id,
  o.placed_at,
  p.name AS product,
  oi.quantity,
  oi.unit_price,
  (oi.quantity * oi.unit_price) AS line_total    -- computed per line item
FROM customers c
JOIN orders o        ON c.id = o.customer_id      -- INNER: only customers with orders
JOIN order_items oi  ON o.id = oi.order_id        -- INNER: only orders with items
JOIN products p      ON oi.product_id = p.id      -- INNER: only items with valid products
WHERE c.city = 'NYC'                              -- filter early — reduces rows before joins
  AND o.status IN ('paid', 'shipped')             -- only fulfilled orders
  AND o.placed_at >= '2024-01-01'                 -- date range filter
ORDER BY o.placed_at DESC, o.id, p.name;
```
::

## Self-Joins

A table can join to itself — use aliases to distinguish the two "copies."

::code-wrapper{language="sql"}
```sql
-- Employees and their managers (manager_id references employees.id)
-- e = employee alias, m = manager alias — same table, two logical roles
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;    -- LEFT JOIN: top-level managers (manager_id IS NULL) still appear
```
::

Self-joins are the classic way to walk a hierarchy (employees→managers). For deep hierarchies, use recursive CTEs (Chapter 19).

## Join Algorithms (What the Planner Chooses)

The optimizer picks one of these per join — visible in `EXPLAIN`:

| Algorithm | Best when | Cost | Memory |
|---|---|---|---|
| **Nested Loop** | One side small, or indexed lookup on inner. | O(N × M) worst, O(N × log M) with index | O(1) |
| **Hash Join** | Both sides large, no usable index, equality condition. | O(N + M) — builds hash table on smaller side | O(min(N,M)) |
| **Merge Join** | Both sides pre-sorted on join key (e.g., via indexes). | O(N + M) — both inputs must be sorted | O(1) |

::code-wrapper{language="sql"}
```sql
-- See which algorithm the planner chose:
EXPLAIN SELECT c.name, o.id
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.amount > 100;

-- If you see "Hash Join" but work_mem is too low, the hash spills to disk → slow.
-- Fix: SET work_mem = '256MB';  (per-session, per-node — beware multi-node plans)
```
::

## Anti-Pattern: LEFT JOIN + WHERE on Right Table → Demoted to INNER JOIN

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: WHERE on the right table demotes LEFT JOIN to INNER JOIN
-- The WHERE filters out NULL-extended rows for unmatched left rows
-- (NULL >= '2024-01-01' is UNKNOWN, not TRUE → row excluded)
SELECT c.name, SUM(o.amount) AS total
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.ordered_on >= '2024-01-01'    -- this condition filters the FINAL result, not the join
GROUP BY c.name;
-- Result: customers with no 2024 orders DISAPPEAR — LEFT JOIN defeated

-- ✅ RIGHT: move the right-table filter into ON
-- ON filters WHICH right rows match, without dropping left rows that have no match
SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
FROM customers c
LEFT JOIN orders o
  ON c.id = o.customer_id
 AND o.ordered_on >= '2024-01-01'     -- ON condition: only match 2024 orders, but keep all customers
GROUP BY c.name;
-- Result: all customers appear; those with no 2024 orders show total = 0 (via COALESCE)
```
::

## Anti-Pattern: Accidental CROSS JOIN

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: forgetting ON in a JOIN → CROSS JOIN (cartesian product)
SELECT * FROM customers c JOIN orders o;   -- 3 customers × 4 orders = 12 rows (not 4!)

-- ✅ RIGHT: always include ON for INNER/OUTER joins, or use explicit CROSS JOIN
SELECT * FROM customers c CROSS JOIN orders o;  -- explicit: "yes, I want the cartesian product"
```
::

## 💡 Tips & Tricks

- **Idiom**: use `LEFT JOIN ... WHERE right.id IS NULL` (anti-join) instead of `NOT IN (subquery)` — the anti-join is immune to the NULL-poisoning trap that breaks `NOT IN`, and it's usually faster because the planner can use a hash anti-join.
- **Performance**: a hash join needs memory to build the hash table (the smaller input). If `work_mem` is too low, PostgreSQL spills the hash to disk and performance collapses. Increase `work_mem` for big join queries per-session: `SET work_mem = '256MB';` — but beware it's per-node, not per-query, so a 10-node plan with 256MB each can consume 2.5GB.
- **Idiom**: prefer `USING (col)` over `ON a.col = b.col` when the column names match — it's shorter, returns the joined column once (no need to pick `a.col` vs `b.col`), and signals intent ("these are the same key").
- **Debug**: when a join returns *more* rows than expected, look for a non-unique join key on the "many" side — a `LEFT JOIN` from customers to orders on `customer_id` produces one row per *order*, not per customer. Use `DISTINCT` or aggregate (`GROUP BY`) if you want one row per customer.

## ⚠️ Edge Cases & Gotchas

- **`LEFT JOIN` + `WHERE` on right table → INNER JOIN demotion**: `SELECT ... FROM c LEFT JOIN o ON c.id=o.customer_id WHERE o.amount > 100` drops customers with no orders (the `WHERE` filters out the NULL-extended rows). To filter right-table rows *without* losing left-only rows, put the condition in the `ON` clause: `LEFT JOIN o ON c.id=o.customer_id AND o.amount > 100`.
- **Row multiplication**: joining to a "many" side multiplies rows. `LEFT JOIN orders` on a customer with 5 orders returns 5 rows for that customer — a `SELECT c.*` "to list customers" unexpectedly has duplicates.
- **`COUNT(*)` on a `LEFT JOIN` lies**: `SELECT c.name, COUNT(*) FROM customers c LEFT JOIN orders o ON ... GROUP BY c.name` counts 1 even for customers with no orders (the NULL-extended row still counts). Use `COUNT(o.id)` — counting a non-nullable right-column — to count only matched rows (NULLs don't count).
- **`USING` and quoted columns**: `USING ("CustomerID")` works but is case-sensitive and fragile; prefer snake_case column names to keep `USING` ergonomic.
- **Joining on NULL**: `NULL = NULL` is UNKNOWN, so a join `ON a.col = b.col` does **not** match rows where both sides are NULL. If NULL-keys should match, use `IS NOT DISTINCT FROM` in the `ON` (slower — no index).
- **`NATURAL JOIN` surprises**: it joins on *all* common columns. If `customers` and `orders` both have `id` and `created_at`, `NATURAL JOIN` requires all four to match — almost certainly not what you want.
- **Three-way joins and column ambiguity**: `SELECT id FROM customers JOIN orders ON ...` fails — `id` exists in both tables. Always qualify (`SELECT c.id`) in multi-table queries.
- **`RIGHT JOIN` readability**: most teams ban `RIGHT JOIN` in code style and require rewriting as `LEFT JOIN` — it's easier to read left-to-right.

## 🧠 Spot the Bug

A developer wants a report of **all customers and the total of their 2024 orders**, including customers who haven't ordered in 2024 (showing $0). This query is wrong. Why?

::code-wrapper{language="sql"}
```sql
SELECT c.name, SUM(o.amount) AS total
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.ordered_on >= '2024-01-01'
GROUP BY c.name;
```
::

<details>
<summary>Answer</summary>

Two bugs:

1. **The `WHERE` converts the LEFT JOIN to an INNER JOIN.** `WHERE o.ordered_on >= '2024-01-01'` filters out the NULL-extended rows for customers with no orders (because `NULL >= '2024-01-01'` is UNKNOWN, not TRUE). Customers who haven't ordered disappear from the result — defeating the purpose of the `LEFT JOIN`.

2. **Even for customers with orders, only 2024 orders are summed** — which may or may not be the intent, but combined with bug #1, the "include customers with no 2024 orders" requirement is violated.

The fix: move the right-table filter into the `ON` clause so it filters *which orders match* without dropping the customer row:

::code-wrapper{language="sql"}
```sql
SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
FROM customers c
LEFT JOIN orders o
  ON c.id = o.customer_id
 AND o.ordered_on >= '2024-01-01'    -- ON: filters which orders match, preserves all customers
GROUP BY c.name;
```
::

Now customers with no (matching) orders still appear, with `SUM` of zero rows = NULL, which `COALESCE` turns into 0.

**The lesson**: conditions on the right table go in `ON` for a `LEFT JOIN` that should preserve all left rows; conditions in `WHERE` filter the *final* rows and silently demote `LEFT JOIN` to `INNER JOIN`.

</details>

## Summary

You can now combine tables with `INNER`/`LEFT`/`RIGHT`/`FULL`/`CROSS` joins, choose between `ON`/`USING`, write self-joins, and avoid the `LEFT JOIN`+`WHERE` trap that demotes outer joins to inner joins. Next: aggregating rows with `GROUP BY` and `HAVING`.