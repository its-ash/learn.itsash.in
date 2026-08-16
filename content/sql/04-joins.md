# 04 — Joins

Joins combine rows from two (or more) tables based on a related column. They are the defining feature of relational databases — the "relational" in "relational" is realized through joins.

## The Mental Model

A join produces a **combined result set** by matching rows from the left and right inputs. Think of it in two steps:

1. **Cartesian product** — every row of the left table paired with every row of the right table.
2. **Filter** — keep only the pairs that satisfy the join condition.

Different join types vary step 2's filter and which un-matched rows are kept. The optimizer doesn't actually compute the full Cartesian product (it uses nested loops, hashes, or merges), but the *result* is as if it did.

## INNER JOIN

Keeps only rows that match in **both** tables.

::code-wrapper{language="sql"}
```sql
-- Customers and their orders (only customers who have orders)
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id;
``
::

Unmatched rows (customers with no orders, orders with no customer) are dropped.

## LEFT (OUTER) JOIN

Keeps **all rows from the left** table, with NULLs for unmatched right rows.

::code-wrapper{language="sql"}
```sql
-- All customers, with their orders if any (NULLs for customers with no orders)
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id;
``
::

Customers without orders appear once with `order_id = NULL`, `amount = NULL`.

### Using LEFT JOIN to find "rows with no match"

This is the idiomatic "anti-join" pattern:

::code-wrapper{language="sql"}
```sql
-- Customers who have never placed an order
SELECT c.*
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.id IS NULL;
```
::

The `WHERE o.id IS NULL` filters to rows where the join found no match. Test a **non-nullable** column (like `o.id`, the primary key) — testing `o.amount IS NULL` would also exclude rows where the order exists but `amount` happens to be NULL.

## RIGHT (OUTER) JOIN

Keeps **all rows from the right** table. It's a `LEFT JOIN` with the tables swapped — most people just swap the tables and use `LEFT JOIN` for readability.

::code-wrapper{language="sql"}
```sql
-- All orders, with their customer if any
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
RIGHT JOIN orders o ON c.id = o.customer_id;
``
::

## FULL (OUTER) JOIN

Keeps **all rows from both** tables, with NULLs on whichever side has no match.

::code-wrapper{language="sql"}
```sql
-- All customers and all orders, matched where possible
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
FULL JOIN orders o ON c.id = o.customer_id;
``
::

PostgreSQL and SQL Server support `FULL JOIN`. **MySQL and SQLite do not** — emulate it with a `LEFT JOIN` + `UNION` + `RIGHT JOIN` (or `LEFT JOIN` + `UNION ALL` + anti-join).

## CROSS JOIN

The Cartesian product — every left row paired with every right row, no filter. No `ON` clause.

::code-wrapper{language="sql"}
```sql
-- All (customer, product) pairs — useful for generating combinations
SELECT c.name, p.name AS product
FROM customers c
CROSS JOIN products p;
``
::

If `customers` has 3 rows and `products` has 5, the result has 15 rows. `CROSS JOIN` is rare in business queries but common for generating test data, sparse matrices, or "every X for every Y" reports.

### ⚠️ Accidental CROSS JOIN

Forgetting the `ON` clause in an `INNER JOIN` turns it into a `CROSS JOIN`:

::code-wrapper{language="sql"}
```sql
-- Oops — no ON condition, this is a CROSS JOIN producing 3*4=12 rows
SELECT * FROM customers c JOIN orders o;   -- some engines require ON; PostgreSQL allows this as CROSS JOIN
```
::

MySQL is lenient (allows it). PostgreSQL requires `ON` or `USING` for `JOIN` (use explicit `CROSS JOIN` for the cartesian product). Always include `ON` for inner/outer joins.

## JOIN Syntax: ON, USING, NATURAL

### `ON` — explicit condition

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers c JOIN orders o ON c.id = o.customer_id;
-- ON can include any boolean expression, not just equality
SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id AND o.amount > c.credit_limit;
```
::

### `USING` — shorthand for same-named columns

::code-wrapper{language="sql"}
```sql
-- When both tables have a column named "customer_id"
SELECT * FROM customers JOIN orders USING (customer_id);
```
::

`USING (col)` requires the column to exist in **both** tables with the same name. It's equivalent to `ON a.col = b.col`, but the joined column appears **once** in the output (with `ON`, both `c.customer_id` and `o.customer_id` appear, and you must qualify which to select).

### `NATURAL JOIN` — auto-join on all same-named columns (avoid)

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers NATURAL JOIN orders;
```
::

`NATURAL JOIN` automatically joins on **every** column that has the same name in both tables. This is **dangerous**: if a future schema change adds a same-named column (e.g., both tables get a `created_at`), the join silently changes behavior. Never use `NATURAL JOIN` in production code.

## Multiple Tables and Join Order

You can chain joins. They're evaluated left to right (the optimizer may reorder inner joins, but outer joins constrain order).

::code-wrapper{language="sql"}
```sql
SELECT c.name, o.id, p.name AS product, oi.quantity
FROM customers c
JOIN orders o        ON c.id = o.customer_id
JOIN order_items oi  ON o.id = oi.order_id
JOIN products p      ON oi.product_id = p.id
WHERE c.city = 'NYC';
```
::

## Self-Joins

A table can join to itself — use aliases to distinguish the two "copies."

::code-wrapper{language="sql"}
```sql
-- Employees and their managers (manager_id references employees.id)
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```
::

Self-joins are the classic way to walk a hierarchy (employees→managers). For deep hierarchies, use recursive CTEs (chapter 19).

## Join Algorithms (what the planner chooses)

The optimizer picks one of these per join — visible in `EXPLAIN`:

| Algorithm | Best when | Cost |
|---|---|---|
| **Nested Loop** | One side is small, or indexed lookup on the inner. | O(N × M) worst, O(N × log M) with index. |
| **Hash Join** | Both sides large, no usable index, equality condition. | O(N + M) — builds a hash table on the smaller side. |
| **Merge Join** | Both sides pre-sorted on the join key (e.g., via indexes). | O(N + M) — both inputs must be sorted. |

You don't choose the algorithm — the planner does, based on table stats. But knowing which it picked helps diagnose slow joins. See chapter 26 (EXPLAIN).

## 💡 Tips & Tricks

- **Idiom**: use `LEFT JOIN ... WHERE right.id IS NULL` (anti-join) instead of `NOT IN (subquery)` — the anti-join is immune to the NULL-poisoning trap that breaks `NOT IN`, and it's usually faster because the planner can use a hash anti-join instead of materializing the subquery.
- **Performance**: a hash join needs memory to build the hash table (the smaller input). If `work_mem` is too low, PostgreSQL spills the hash to disk and performance collapses — increase `work_mem` for big join queries (set it per-session: `SET work_mem = '256MB';`), but beware that it's per-node, not per-query, so a 10-node plan with 256MB each can blow up memory.
- **Idiom**: prefer `USING (col)` over `ON a.col = b.col` when the column names match — it's shorter, returns the joined column once (no need to pick `a.col` vs `b.col`), and signals intent ("these are the same key") more clearly than an arbitrary equality.
- **Debug**: when a join returns *more* rows than expected, look for a non-unique join key on the "many" side — a `LEFT JOIN` from customers to orders on `customer_id` produces one row per *order*, not per customer. If you want one row per customer, aggregate (`GROUP BY`) or use a lateral/distinct-on subquery.
- **Portability**: `USING` and `FULL JOIN` aren't supported in older MySQL (pre-8.0 has no `FULL JOIN`) and SQLite (no `FULL JOIN`) — for portable code, stick to `ON` and emulate `FULL JOIN` with `UNION`. `NATURAL JOIN` works everywhere but is dangerous (see above).

## ⚠️ Edge Cases & Gotchas

- **`LEFT JOIN` + `WHERE` on the right table converts to INNER JOIN**: `SELECT ... FROM c LEFT JOIN o ON c.id=o.customer_id WHERE o.amount > 100` drops customers with no orders (the `WHERE` filters out the NULL-extended rows). To filter right-table rows *without* losing left-only rows, put the condition in the `ON` clause: `LEFT JOIN o ON c.id=o.customer_id AND o.amount > 100`.
- **Row multiplication**: joining to a "many" side multiplies rows. `LEFT JOIN orders` on a customer with 5 orders returns 5 rows for that customer — a `SELECT c.*` "to list customers" unexpectedly has duplicates. Use `DISTINCT` or aggregate if you want one row per customer.
- **`COUNT(*)` on a `LEFT JOIN` lies**: `SELECT c.name, COUNT(*) FROM customers c LEFT JOIN orders o ON ... GROUP BY c.name` counts 1 even for customers with no orders (the NULL-extended row still counts). Use `COUNT(o.id)` — counting a non-nullable right-column — to count only matched rows (NULLs don't count).
- **`USING` and quoted columns**: `USING ("CustomerID")` works but is case-sensitive and fragile; prefer snake_case column names to keep `USING` ergonomic.
- **Joining on NULL**: `NULL = NULL` is UNKNOWN, so a join `ON a.col = b.col` does **not** match rows where both sides are NULL. If NULL-keys should match, use `IS NOT DISTINCT FROM` in the `ON` (slower — no index).
- **`NATURAL JOIN` surprises**: it joins on *all* common columns. If `customers` and `orders` both have `id` and `created_at`, `NATURAL JOIN` requires all four to match — almost certainly not what you want.
- **Three-way joins and column ambiguity**: `SELECT id FROM customers JOIN orders ON ...` fails — `id` exists in both tables. Always qualify (`SELECT c.id`) in multi-table queries, even if it happens to be unambiguous today.
- **`RIGHT JOIN` readability**: most teams ban `RIGHT JOIN` in code style and require rewriting as `LEFT JOIN` — it's easier to read left-to-right and most query authors think "preserve the first table." Reserve `RIGHT JOIN` for when rewriting is genuinely awkward.

## 🧠 Spot the Bug

A developer wants a report of **all customers and the total of their orders**, including customers who haven't ordered yet (showing $0). This query is wrong. Why?

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

2. **Even for customers with orders, only orders from 2024 are summed** — which may or may not be the intent, but combined with bug #1, the "include customers with no orders" requirement is violated.

The fix: move the right-table filter into the `ON` clause so it filters *which orders match* without dropping the customer row:

```sql
SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
FROM customers c
LEFT JOIN orders o
  ON c.id = o.customer_id
 AND o.ordered_on >= '2024-01-01'
GROUP BY c.name;
```

Now customers with no (matching) orders still appear, with `SUM` of zero rows = NULL, which `COALESCE` turns into 0.

**The lesson**: conditions on the right table go in `ON` for a `LEFT JOIN` that should preserve all left rows; conditions in `WHERE` filter the *final* rows and silently demote `LEFT JOIN` to `INNER JOIN`.

</details>

## Summary

You can now combine tables with `INNER`/`LEFT`/`RIGHT`/`FULL`/`CROSS` joins, choose between `ON`/`USING`, write self-joins, and avoid the `LEFT JOIN`+`WHERE` trap that demotes outer joins to inner joins. Next: aggregating rows with `GROUP BY` and `HAVING`.