# 08 — Set Operations

Set operations combine the **rows** of two result sets vertically (stacking), as opposed to joins, which combine them horizontally. Both inputs must have compatible column structure.

## The Three Operations

| Operation | Behavior |
|---|---|
| `UNION` | All rows from both inputs, **duplicates removed**. |
| `UNION ALL` | All rows from both inputs, **duplicates kept**. |
| `INTERSECT` | Rows present in **both** inputs, duplicates removed. |
| `EXCEPT` (a.k.a. `MINUS` in Oracle) | Rows in the first input **not in** the second, duplicates removed. |

::code-wrapper{language="sql"}
```sql
-- All cities that appear in either customers or suppliers
SELECT city FROM customers
UNION
SELECT city FROM suppliers;

-- All cities, including duplicates (faster — no dedup)
SELECT city FROM customers
UNION ALL
SELECT city FROM suppliers;

-- Cities that have both customers and suppliers
SELECT city FROM customers
INTERSECT
SELECT city FROM suppliers;

-- Cities with customers but no suppliers
SELECT city FROM customers
EXCEPT
SELECT city FROM suppliers;
``
::

## UNION vs UNION ALL — the performance difference

`UNION` (without `ALL`) removes duplicates, which requires a **sort or hash** across the entire combined result — O(N log N) or O(N) memory. `UNION ALL` just concatenates — O(1).

If you know the inputs are disjoint (or you want duplicates), always use `UNION ALL`. It's dramatically faster on large inputs. A common mistake is reflexively writing `UNION` when `UNION ALL` is correct, paying a hidden dedup cost.

## Column Compatibility Rules

For a set operation to be valid:

1. **Same number of columns** in both inputs.
2. **Compatible types** in each column position (the database coerces where possible).
3. Column **names** come from the **first** input — the second input's column names are ignored.

::code-wrapper{language="sql"}
```sql
-- OK: same column count, compatible types
SELECT id, name FROM customers
UNION ALL
SELECT id, company_name FROM suppliers;   -- result column is named "name" (from first)

-- ❌ ERROR: each SELECT must have the same number of columns
SELECT id, name FROM customers
UNION ALL
SELECT id FROM suppliers;
``
::

Type coercion can surprise: `SELECT 1 UNION SELECT 'a'` may coerce the integer to text or error, depending on the engine. Keep types explicit and matching.

## ORDER BY and LIMIT with Set Operations

`ORDER BY`/`LIMIT` apply to the **whole** combined result and must come at the end. You can't order one input separately (parentheses around individual queries aren't standard, though PostgreSQL allows them with limitations):

::code-wrapper{language="sql"}
```sql
-- Sort the combined result
SELECT name, 'customer' AS kind FROM customers
UNION ALL
SELECT name, 'supplier' AS kind FROM suppliers
ORDER BY name;

-- Limit the combined result
SELECT name FROM customers
UNION ALL
SELECT name FROM suppliers
ORDER BY name
LIMIT 10;
``
::

To limit *each* input before combining, use a subquery or CTE per branch:

::code-wrapper{language="sql"}
```sql
(SELECT name FROM customers ORDER BY name LIMIT 5)
UNION ALL
(SELECT name FROM suppliers ORDER BY name LIMIT 5)
ORDER BY name;
```
::

(PostgreSQL allows parenthesized set operation branches; standard SQL and other engines vary.)

## INTERSECT and EXCEPT with ALL

PostgreSQL supports `INTERSECT ALL` and `EXCEPT ALL`, which keep duplicates based on row multiplicity:

- `INTERSECT ALL`: if a row appears N times in the left and M times in the right, it appears `min(N, M)` times in the result.
- `EXCEPT ALL`: if a row appears N times in the left and M times in the right, it appears `max(0, N - M)` times.

Standard `INTERSECT`/`EXCEPT` (without `ALL`) dedup to one copy. MySQL and SQLite don't support `INTERSECT ALL`/`EXCEPT ALL`.

## Emulating FULL OUTER JOIN with UNION

MySQL and SQLite lack `FULL OUTER JOIN`. Emulate it with `UNION` of a `LEFT JOIN` and an anti-join:

::code-wrapper{language="sql"}
```sql
-- Full outer join of customers and orders on customer_id
SELECT c.*, o.*
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
UNION
SELECT c.*, o.*
FROM customers c RIGHT JOIN orders o ON c.id = o.customer_id
WHERE c.id IS NULL;
``
::

The first branch covers all customers (with their matching orders); the second branch adds orders with no matching customer. `UNION` dedups the overlap.

## Using Set Operations to Compare Tables

Set operations are a clean way to find differences between two tables (useful for testing, syncing, or audit):

::code-wrapper{language="sql"}
```sql
-- Rows in production but not in staging (missing from staging)
SELECT * FROM prod.users
EXCEPT
SELECT * FROM staging.users;

-- Rows in staging but not in production (extra in staging)
SELECT * FROM staging.users
EXCEPT
SELECT * FROM prod.users;

-- Symmetric difference: rows in exactly one of the two
(SELECT * FROM prod.users EXCEPT SELECT * FROM staging.users)
UNION
(SELECT * FROM staging.users EXCEPT SELECT * FROM prod.users);
``
::

For large tables, this is expensive (sorts both sides). For diffing huge tables, hash signatures or a row-by-row join on the primary key with a `WHERE row IS DISTINCT FROM` comparison is often faster.

## 💡 Tips & Tricks

- **Performance**: default to `UNION ALL` — use `UNION` only when you specifically need deduplication. The dedup cost (sort or hash) is often the dominant cost of a `UNION` query, and most real-world `UNION`s are over disjoint inputs where dedup is wasted work.
- **Idiom**: add a **provenance column** to set-operation branches (`SELECT ..., 'left' AS src` vs `SELECT ..., 'right' AS src`) to track which input each result row came from — invaluable for debugging "why did this row appear/disappear" and for building audit-style diffs.
- **Portability**: `EXCEPT` is standard SQL but Oracle calls it `MINUS`. `INTERSECT ALL`/`EXCEPT ALL` are PostgreSQL-specific. If you need multiplicity-preserving set ops portably, use `JOIN` with `GROUP BY` and `count()` comparisons.
- **Debug**: if a set operation returns fewer rows than expected, suspect an unexpected duplicate collapse — `UNION`/`INTERSECT`/`EXCEPT` dedup silently. Switch to `UNION ALL` temporarily to see the raw combined rows, or add a unique row identifier to make duplicates visible.
- **Idiom**: when comparing two tables for equality, use `EXCEPT` in both directions rather than `count(*)` — counts can match while the row contents differ. `(SELECT * FROM A EXCEPT SELECT * FROM B) UNION ALL (SELECT * FROM B EXCEPT SELECT * FROM A)` is empty iff A = B (as multisets if you use `EXCEPT ALL`).

## ⚠️ Edge Cases & Gotchas

- **`UNION` dedup is global**: it dedups across the combined result, not per-input. If `customers` has `'NYC'` and `suppliers` has `'NYC'`, `UNION` returns one `'NYC'`; `UNION ALL` returns two.
- **Column names come from the first input**: `SELECT a AS x FROM t1 UNION SELECT b AS y FROM t2` — the result column is `x`, not `y`. If you need a specific name, alias it in the *first* `SELECT`.
- **Type coercion in set ops**: `SELECT 1 UNION SELECT '1'` may coerce to text or integer depending on the engine. PostgreSQL is strict-ish (it'll try to coerce, sometimes failing); MySQL is lenient. Keep types consistent across branches.
- **`ORDER BY` column names must match the first input**: `ORDER BY` after a set operation references the first input's column names. If the second input named the column differently, you can't sort by that name.
- **`NULL` comparison in set ops**: set operations treat NULLs as equal for dedup — `(1, NULL)` in both inputs is considered a duplicate and `UNION` keeps one. This differs from `NULL = NULL` being UNKNOWN in `WHERE` — set ops use "is not distinct from" semantics.
- **`INTERSECT`/`EXCEPT` precedence**: `INTERSECT` binds tighter than `UNION`/`EXCEPT`. `A UNION B INTERSECT C` is `A UNION (B INTERSECT C)`. Use parentheses to make intent explicit.
- **Set ops don't preserve order**: the inputs' `ORDER BY` (if any inside subqueries) is not preserved. The only `ORDER BY` that matters is the one at the top of the whole set operation.
- **Large `UNION` can spill**: the dedup sort/hash needs `work_mem`; if it exceeds that, it spills to disk. For huge `UNION`s, increase `work_mem` or pre-dedup each branch with `DISTINCT` (which may let the planner use an index).

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

```sql
-- Option 1: UNION dedups
SELECT COUNT(*) FROM (
  SELECT city FROM customers
  UNION
  SELECT city FROM suppliers
) all_cities;

-- Option 2: COUNT DISTINCT over UNION ALL
SELECT COUNT(DISTINCT city) FROM (
  SELECT city FROM customers
  UNION ALL
  SELECT city FROM suppliers
) all_cities;
```

`UNION` is cleaner here — it dedups once during the combine, and `COUNT(*)` then counts the deduped rows. `COUNT(DISTINCT)` over `UNION ALL` works but pays both the `UNION ALL` concatenation *and* a separate hash-sort for `DISTINCT` — usually slower than `UNION` + `COUNT(*)`.

**The lesson**: `UNION ALL` keeps duplicates; `UNION` removes them. When you want "distinct values across inputs," use `UNION`, not `UNION ALL` + `COUNT(*)`.

</details>

## Summary

You can now combine result sets with `UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT`, understand the dedup cost and the `UNION ALL` performance advantage, handle column compatibility, and emulate `FULL OUTER JOIN` on engines that lack it. Next: window functions — the most powerful analytical feature in SQL.