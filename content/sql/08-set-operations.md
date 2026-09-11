# 08 — Set Operations

Set operations combine the **rows** of two result sets vertically (stacking), as opposed to joins, which combine them horizontally. Both inputs must have compatible column structure.

## The Four Operations

| Operation | Behavior | Dedup? |
|---|---|---|
| `UNION` | All rows from both inputs, **duplicates removed** | ✅ (sort/hash) |
| `UNION ALL` | All rows from both inputs, **duplicates kept** | ❌ (concatenate) |
| `INTERSECT` | Rows present in **both** inputs, duplicates removed | ✅ |
| `EXCEPT` (a.k.a. `MINUS` in Oracle) | Rows in the first input **not in** the second, duplicates removed | ✅ |

::code-wrapper{language="sql"}
```sql
-- All cities that appear in either customers or suppliers (deduplicated).
-- UNION sorts/hashes the combined result to remove duplicates: O(N log N) or O(N) memory.
SELECT city FROM customers
UNION
SELECT city FROM suppliers;

-- All cities including duplicates. UNION ALL just concatenates: O(1) per row.
-- Use when inputs are known-disjoint or duplicates are desired.
SELECT city FROM customers
UNION ALL
SELECT city FROM suppliers;

-- Cities that have BOTH customers and suppliers (intersection).
SELECT city FROM customers
INTERSECT
SELECT city FROM suppliers;

-- Cities with customers but NO suppliers (set difference / anti-join).
-- EXCEPT is NULL-safe: (1, NULL) in both inputs → treated as equal → removed.
SELECT city FROM customers
EXCEPT
SELECT city FROM suppliers;
```
::

## UNION vs UNION ALL — The Hidden Dedup Cost

`UNION` (without `ALL`) removes duplicates, which requires a **sort or hash** across the entire combined result — O(N log N) time or O(N) memory. `UNION ALL` just concatenates — O(1).

::code-wrapper{language="sql"}
```sql
-- ❌ Reflexive UNION: pays dedup cost even though the two queries can never overlap
-- (different 'kind' values). The sort/hash is wasted work.
SELECT id, name, 'customer' AS kind FROM customers
UNION
SELECT id, name, 'supplier' AS kind FROM suppliers;

-- ✅ UNION ALL: no dedup, O(1) concatenation. Correct when inputs are disjoint.
SELECT id, name, 'customer' AS kind FROM customers
UNION ALL
SELECT id, name, 'supplier' AS kind FROM suppliers;
```
::

If you know the inputs are disjoint (or you want duplicates), always use `UNION ALL`. A common mistake is reflexively writing `UNION` when `UNION ALL` is correct, paying a hidden dedup cost.

## Column Compatibility Rules

For a set operation to be valid:

1. **Same number of columns** in both inputs.
2. **Compatible types** in each column position (the database coerces where possible).
3. Column **names** come from the **first** input — the second input's column names are ignored.

::code-wrapper{language="sql"}
```sql
-- ✅ OK: same column count, compatible types. Result column is named "name" (from first SELECT).
SELECT id, name FROM customers
UNION ALL
SELECT id, company_name FROM suppliers;   -- 'company_name' is ignored; result column = 'name'

-- ❌ ERROR: each SELECT must have the same number of columns.
SELECT id, name FROM customers
UNION ALL
SELECT id FROM suppliers;

-- Type coercion can surprise: integer + text may coerce or error depending on engine.
SELECT 1 UNION SELECT 'a';   -- PostgreSQL: errors; MySQL: coerces to text
```
::

## ORDER BY and LIMIT with Set Operations

`ORDER BY`/`LIMIT` apply to the **whole** combined result and must come at the end. You can't order one input separately:

::code-wrapper{language="sql"}
```sql
-- ORDER BY applies to the ENTIRE combined result, not individual SELECTs.
-- Column names in ORDER BY must match the FIRST input's column names.
SELECT name, 'customer' AS kind FROM customers
UNION ALL
SELECT name, 'supplier' AS kind FROM suppliers
ORDER BY name;                             -- sorts the combined 2-row-per-entity result

-- LIMIT also applies to the whole combined result.
SELECT name FROM customers
UNION ALL
SELECT name FROM suppliers
ORDER BY name
LIMIT 10;
```
::

To limit *each* input before combining, use parenthesized subqueries:

::code-wrapper{language="sql"}
```sql
-- Limit each branch to 5 rows, then combine and sort the 10-row result.
-- PostgreSQL allows parenthesized set operation branches; standard SQL and other engines vary.
(SELECT name FROM customers ORDER BY name LIMIT 5)
UNION ALL
(SELECT name FROM suppliers ORDER BY name LIMIT 5)
ORDER BY name;
```
::

## INTERSECT ALL and EXCEPT ALL (PostgreSQL)

PostgreSQL supports `INTERSECT ALL` and `EXCEPT ALL`, which keep duplicates based on row multiplicity:

- `INTERSECT ALL`: if a row appears N times in the left and M times in the right, it appears `min(N, M)` times.
- `EXCEPT ALL`: if a row appears N times in the left and M times in the right, it appears `max(0, N - M)` times.

Standard `INTERSECT`/`EXCEPT` (without `ALL`) dedup to one copy. MySQL and SQLite don't support `INTERSECT ALL`/`EXCEPT ALL`.

::code-wrapper{language="sql"}
```sql
-- EXCEPT ALL: preserves multiplicity. If 'NYC' appears 3x in customers and 1x in suppliers,
-- the result has 'NYC' 2x (3 - 1 = 2). EXCEPT (without ALL) would show 'NYC' 0x (deduped to 1, then removed).
SELECT city FROM customers
EXCEPT ALL
SELECT city FROM suppliers;
```
::

## Complex Implementation: Unified Customer View from Multiple Sources

::code-wrapper{language="sql"}
```sql
-- Build a unified customer view from three sources: CRM, billing, and support.
-- UNION ALL because the sources are disjoint (different ID ranges, tagged by source).
-- A provenance column ('source') tracks origin for debugging and dedup audits.
SELECT
  id,
  email,
  name,
  company,
  'crm' AS source,                           -- provenance: which system this row came from
  created_at
FROM crm.customers
WHERE email IS NOT NULL                       -- drop rows without email (can't dedup on NULL)

UNION ALL

SELECT
  id + 1000000 AS id,                         -- offset to avoid ID collision with CRM
  email,
  billing_contact AS name,
  company_name AS company,
  'billing' AS source,
  registered_at AS created_at
FROM billing.accounts
WHERE email IS NOT NULL

UNION ALL

SELECT
  id + 2000000 AS id,                         -- offset to avoid ID collision with CRM and billing
  email,
  display_name AS name,
  organization AS company,
  'support' AS source,
  first_seen AS created_at
FROM support.users
WHERE email IS NOT NULL

ORDER BY email, source;                       -- group duplicates together for inspection
```
::

## Complex Implementation: EXCEPT-Based Missing Data Query

::code-wrapper{language="sql"}
```sql
-- Find products that exist in the catalog but have NEVER been ordered.
-- EXCEPT is a NULL-safe anti-join: (product_id, NULL) in both sides → treated as equal → removed.
-- Unlike NOT IN, EXCEPT doesn't poison on NULL.
SELECT product_id, product_name
FROM (
  SELECT id AS product_id, name AS product_name FROM products
) catalog
EXCEPT
SELECT product_id, NULL AS product_name        -- column count must match; NULL placeholder
FROM (
  SELECT DISTINCT product_id FROM order_items
) ordered

ORDER BY product_id;

-- Symmetric difference: rows in exactly one of two tables (useful for prod vs staging diffs).
-- (A EXCEPT B) UNION (B EXCEPT A) = empty iff A = B (as sets).
(SELECT * FROM prod.users
 EXCEPT
 SELECT * FROM staging.users)
UNION
(SELECT * FROM staging.users
 EXCEPT
 SELECT * FROM prod.users);
```
::

## Anti-Pattern: Reflexive UNION When UNION ALL Is Correct

### ❌ Wrong Way

::code-wrapper{language="sql"}
```sql
-- Intent: combine active and inactive users into one report.
-- Bug: using UNION forces a sort/hash dedup across the entire result.
-- But active and inactive users are DISJOINT (status = 'active' vs 'inactive') —
-- there can be no duplicates between them. The dedup is wasted work.
SELECT id, name, 'active' AS status FROM users WHERE status = 'active'
UNION
SELECT id, name, 'inactive' AS status FROM users WHERE status = 'inactive';
```
::

### ✅ Right Way

::code-wrapper{language="sql"}
```sql
-- UNION ALL: no dedup, O(1) concatenation. Correct because the WHERE clauses
-- partition the table into disjoint sets — no row can satisfy both conditions.
SELECT id, name, 'active' AS status FROM users WHERE status = 'active'
UNION ALL
SELECT id, name, 'inactive' AS status FROM users WHERE status = 'inactive';
```
::

## Emulating FULL OUTER JOIN with UNION

MySQL and SQLite lack `FULL OUTER JOIN`. Emulate it with `UNION` of a `LEFT JOIN` and an anti-join:

::code-wrapper{language="sql"}
```sql
-- Full outer join of customers and orders on customer_id.
-- Branch 1: all customers with their matching orders (LEFT JOIN).
-- Branch 2: orders with no matching customer (RIGHT JOIN anti-join: WHERE c.id IS NULL).
-- UNION dedups the overlap (customers with orders appear in both branches).
SELECT c.id AS customer_id, c.name, o.id AS order_id, o.amount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
UNION
SELECT c.id AS customer_id, c.name, o.id AS order_id, o.amount
FROM customers c
RIGHT JOIN orders o ON c.id = o.customer_id
WHERE c.id IS NULL;
```
::

## 💡 Tips & Tricks

- **Performance** — default to `UNION ALL`. Use `UNION` only when you specifically need deduplication. The dedup cost (sort or hash) is often the dominant cost of a `UNION` query, and most real-world `UNION`s are over disjoint inputs where dedup is wasted work.
- **Idiom** — add a **provenance column** (`SELECT ..., 'left' AS src` vs `SELECT ..., 'right' AS src`) to track which input each result row came from — invaluable for debugging "why did this row appear/disappear" and for building audit-style diffs.
- **Idiom** — use `EXCEPT` as a NULL-safe anti-join. `NOT IN` poisons on NULL; `LEFT JOIN ... IS NULL` requires careful NULL handling. `EXCEPT` treats NULLs as equal for dedup, making it the cleanest "in A but not in B" operation.
- **Idiom** — when comparing two tables for equality, use `EXCEPT` in both directions rather than `count(*)`. Counts can match while row contents differ. `(A EXCEPT B) UNION ALL (B EXCEPT A)` is empty iff A = B (as sets; use `EXCEPT ALL` for multiset equality).
- **Debug** — if a set operation returns fewer rows than expected, suspect an unexpected duplicate collapse. `UNION`/`INTERSECT`/`EXCEPT` dedup silently. Switch to `UNION ALL` temporarily to see the raw combined rows, or add a unique row identifier.
- **Portability** — `EXCEPT` is standard SQL but Oracle calls it `MINUS`. `INTERSECT ALL`/`EXCEPT ALL` are PostgreSQL-specific. For portable multiplicity-preserving set ops, use `JOIN` with `GROUP BY` and `count()` comparisons.

## ⚠️ Edge Cases & Gotchas

- **Column count mismatch** — `SELECT id, name FROM t1 UNION SELECT id FROM t2` is a syntax error. Both inputs must have the same number of columns. No implicit NULL padding.
- **Type coercion in set ops** — `SELECT 1 UNION SELECT '1'` may coerce to text or integer depending on the engine. PostgreSQL is strict (may error); MySQL is lenient. Keep types consistent across branches.
- **`ORDER BY` applies to the entire result** — `ORDER BY` after a set operation sorts the combined output, not individual SELECTs. It must reference the first input's column names. You cannot `ORDER BY` inside an individual branch without parentheses.
- **`ORDER BY` column names must match the first input** — if the second input named the column differently, you can't sort by that name. Alias in the first SELECT.
- **NULL handling in set operations** — set ops treat NULLs as **equal** for dedup. `(1, NULL)` in both inputs is considered a duplicate and `UNION` keeps one. This differs from `NULL = NULL` being UNKNOWN in `WHERE` — set ops use "is not distinct from" semantics internally.
- **`INTERSECT`/`EXCEPT` precedence** — `INTERSECT` binds tighter than `UNION`/`EXCEPT`. `A UNION B INTERSECT C` is `A UNION (B INTERSECT C)`. Use parentheses to make intent explicit.
- **Set ops don't preserve order** — the inputs' `ORDER BY` (if any inside subqueries) is not preserved. The only `ORDER BY` that matters is the one at the top of the whole set operation.
- **Large `UNION` can spill** — the dedup sort/hash needs `work_mem`; if it exceeds that, it spills to disk. For huge `UNION`s, increase `work_mem` or pre-dedup each branch with `DISTINCT` (which may let the planner use an index).
- **`EXCEPT` vs `EXCEPT ALL`** — `EXCEPT` dedups (a row in both sides is removed entirely). `EXCEPT ALL` preserves multiplicity (if a row appears 3x left and 1x right, result has 2x). Pick based on whether duplicates matter.

## 🧠 Spot the Bug

A developer wants to count how many distinct cities have either a customer or a supplier. This returns a much larger number than expected. What's wrong?

::code-wrapper{language="sql"}
```sql
SELECT COUNT(*) FROM (
  SELECT city FROM customers
  UNION ALL
  SELECT city FROM suppliers
) all_cities;
```
::

<details>
<summary>Answer</summary>

`UNION ALL` does **not** remove duplicates — it concatenates with multiplicity. So `'NYC'` appearing 50 times in `customers` and 20 times in `suppliers` contributes 70 rows, not 1. `COUNT(*)` counts all 70, inflating the "distinct cities" count dramatically.

The fix: use `UNION` (which dedups), or `COUNT(DISTINCT city)`:

::code-wrapper{language="sql"}
```sql
-- Option 1: UNION dedups, then COUNT(*) counts the deduped rows.
SELECT COUNT(*) FROM (
  SELECT city FROM customers
  UNION
  SELECT city FROM suppliers
) all_cities;

-- Option 2: COUNT DISTINCT over UNION ALL (works, but pays both concat AND a distinct hash).
SELECT COUNT(DISTINCT city) FROM (
  SELECT city FROM customers
  UNION ALL
  SELECT city FROM suppliers
) all_cities;
```
::

`UNION` is cleaner here — it dedups once during the combine, and `COUNT(*)` then counts the deduped rows. `COUNT(DISTINCT)` over `UNION ALL` works but pays both the `UNION ALL` concatenation *and* a separate hash for `DISTINCT` — usually slower.

**The lesson**: `UNION ALL` keeps duplicates; `UNION` removes them. When you want "distinct values across inputs," use `UNION`, not `UNION ALL` + `COUNT(*)`.

</details>

## Summary

You can now combine result sets with `UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT`, understand the dedup cost and the `UNION ALL` performance advantage, handle column compatibility, use set operations for NULL-safe anti-joins, and emulate `FULL OUTER JOIN` on engines that lack it. Next: window functions — the most powerful analytical feature in SQL.