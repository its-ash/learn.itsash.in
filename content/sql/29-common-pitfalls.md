# 29 — Common Pitfalls & Idiomatic Fixes

40+ traps that catch SQL developers, with the idiomatic fix for each.

## NULL Traps

### 1. `WHERE col = NULL` returns nothing

**Wrong**: `WHERE city = NULL` (always UNKNOWN, never TRUE).
**Fix**: `WHERE city IS NULL`.

### 2. `NOT IN` with NULLs returns zero rows

**Wrong**: `WHERE id NOT IN (SELECT customer_id FROM orders)` — one NULL in the subquery poisons everything.
**Fix**: `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)` — NULL-safe.

### 3. `!=` silently drops NULLs

**Wrong**: `WHERE city != 'NYC'` excludes NULL-city rows.
**Fix**: `WHERE city IS DISTINCT FROM 'NYC'` — treats NULL as a distinct value.

### 4. `COUNT(*)` vs `COUNT(col)` in a LEFT JOIN

**Wrong**: `COUNT(*)` counts the NULL-extended row for unmatched left rows as 1.
**Fix**: `COUNT(o.id)` (a non-nullable right-table column) — skips NULLs, counts only matches.

### 5. `AVG` ignores NULLs, doesn't average them as 0

**Wrong**: expecting `AVG([10, NULL])` = 5.
**Fix**: `AVG(COALESCE(amount, 0))` if NULL means 0 (but ask whether that's semantically right).

### 6. `SUM` of no rows is NULL, not 0

**Wrong**: `SELECT SUM(amount) FROM orders WHERE FALSE` returns NULL, not 0.
**Fix**: `COALESCE(SUM(amount), 0)`.

### 7. String concatenation with NULL yields NULL

**Wrong**: `'hello' || NULL` = NULL (the whole string becomes NULL).
**Fix**: `CONCAT(a, b)` (ignores NULLs) or `COALESCE(a, '') || COALESCE(b, '')`.

### 8. `CHECK` allows NULLs

**Wrong**: `CHECK (price > 0)` passes for `price = NULL` (UNKNOWN passes).
**Fix**: add `NOT NULL` separately, or `CHECK (price IS NOT NULL AND price > 0)`.

## JOIN Traps

### 9. `LEFT JOIN` + `WHERE` on the right table demotes to INNER JOIN

**Wrong**: `LEFT JOIN o ON ... WHERE o.amount > 100` drops left-only rows.
**Fix**: put the right-table filter in `ON`: `LEFT JOIN o ON ... AND o.amount > 100`.

### 10. Joining on NULL doesn't match

**Wrong**: `JOIN ON a.col = b.col` fails to match rows where both are NULL.
**Fix**: `JOIN ON a.col IS NOT DISTINCT FROM b.col` (slower, no index) — or fix the schema (avoid NULL join keys).

### 11. Row multiplication from a "many" join

**Wrong**: `SELECT c.* FROM customers c JOIN orders o ON ...` returns one row per order, not per customer.
**Fix**: `DISTINCT` or aggregate (`GROUP BY`) if you want one row per customer.

### 12. `NATURAL JOIN` joins on all same-named columns

**Wrong**: `NATURAL JOIN` silently changes behavior when a same-named column is added.
**Fix**: never use `NATURAL JOIN`. Use `ON` or `USING (specific_column)`.

## GROUP BY Traps

### 13. Column in SELECT but not in GROUP BY or aggregated

**Wrong**: `SELECT customer_id, amount FROM orders GROUP BY customer_id` — error.
**Fix**: aggregate (`SUM(amount)`) or group by it (`GROUP BY customer_id, amount`).

### 14. Aggregate in WHERE

**Wrong**: `WHERE SUM(amount) > 100` — aggregates aren't allowed in WHERE.
**Fix**: `HAVING SUM(amount) > 100`.

### 15. Alias in WHERE

**Wrong**: `SELECT SUM(amount) AS total ... WHERE total > 100` — alias not visible in WHERE (created in SELECT, which runs after).
**Fix**: `WHERE SUM(amount) > 100` (repeat the expression) or `HAVING SUM(amount) > 100`.

### 16. `AVG(SUM(x))` — nested aggregates are illegal

**Wrong**: `SELECT AVG(SUM(amount)) FROM orders GROUP BY customer_id`.
**Fix**: subquery/CTE — aggregate to per-customer totals first, then average those.

## Ordering and Pagination Traps

### 17. `LIMIT` without `ORDER BY` is non-deterministic

**Wrong**: `SELECT * FROM orders LIMIT 10` — arbitrary rows.
**Fix**: always pair `LIMIT` with `ORDER BY` on a unique key.

### 18. `OFFSET` pagination is slow at depth

**Wrong**: `LIMIT 10 OFFSET 100000` scans and discards 100000 rows.
**Fix**: keyset pagination — `WHERE (sort_key, id) < (last_key, last_id) ORDER BY ... LIMIT 10`.

### 19. Pagination without a unique tie-breaker skips/duplicates rows

**Wrong**: `ORDER BY ordered_on LIMIT 10` — tied dates drift between pages.
**Fix**: `ORDER BY ordered_on, id` (unique tie-breaker).

### 20. NULL sort order is engine-specific

**Wrong**: assuming NULLs sort first (or last) across all engines.
**Fix**: `NULLS FIRST`/`NULLS LAST` (PostgreSQL) or `ORDER BY (col IS NULL), col` (portable).

## Index Traps

### 21. `LIKE '%middle'` can't use a B-tree index

**Wrong**: leading wildcards defeat the index.
**Fix**: `pg_trgm` GiST/GIN index for substring search, or full-text search.

### 22. Function on the column defeats the index

**Wrong**: `WHERE lower(email) = 'x'` doesn't use an index on `email`.
**Fix**: expression index on `lower(email)`, or a case-insensitive collation.

### 23. Type mismatch defeats the index

**Wrong**: `WHERE id = '42'` (string vs integer) — cast function per row.
**Fix**: `WHERE id = 42` (match the column type).

### 24. `!=` / `<>` rarely uses indexes

**Wrong**: `WHERE status != 'deleted'` seq-scans (matches most of the table).
**Fix**: `WHERE status IN ('active', 'pending')` (positive form, indexable) or a partial index.

### 25. Composite index leftmost-prefix rule forgotten

**Wrong**: expecting `(a, b)` to serve `WHERE b = ?` alone.
**Fix**: add a separate index on `b`, or reorder the composite to `(b, a)` if `b`-only queries dominate.

### 26. Forgetting to index FK columns

**Wrong**: `ON DELETE CASCADE` scans the child table to find referencing rows.
**Fix**: `CREATE INDEX ON child(parent_id)` — always index FK columns.

## Transaction Traps

### 27. Lost updates at READ COMMITTED

**Wrong**: read-then-write (`SELECT balance; ...; UPDATE SET balance = 900`) — another transaction's update is overwritten.
**Fix**: `UPDATE SET balance = balance - 100` (atomic) or `SELECT ... FOR UPDATE`.

### 28. Deadlocks from inconsistent lock ordering

**Wrong**: T1 locks A then B; T2 locks B then A — deadlock.
**Fix**: always lock in a consistent order (e.g., ascending `id`).

### 29. Long transactions block VACUUM

**Wrong**: a transaction spanning an HTTP call holds locks and pins dead tuples.
**Fix**: keep transactions short; never span external calls; set `idle_in_transaction_session_timeout`.

### 30. SERIALIZABLE without retry

**Wrong**: using SERIALIZABLE but not retrying on `40001` — just adds aborts, no correctness.
**Fix**: retry the entire transaction on serialization failure.

## Type and Coercion Traps

### 31. `BETWEEN` is inclusive on both ends

**Wrong**: expecting `BETWEEN 10 AND 100` to exclude 10 and 100.
**Fix**: it's `>= 10 AND <= 100`. For exclusive, use `> 10 AND < 100`.

### 32. Floating-point `SUM` is inexact

**Wrong**: `SUM(amount::float)` for money — `0.1 + 0.2 ≠ 0.3`.
**Fix**: use `NUMERIC`/`DECIMAL` for money and exact arithmetic.

### 33. `char(n)` pads and causes comparison surprises

**Wrong**: `char(2)` pads `'NY'` to `'NY'` but `'NY' = 'NY  '` may be true or false per engine.
**Fix**: use `text` or `varchar(n)`, not `char(n)`.

### 34. Time zone confusion with `TIMESTAMP` (without zone)

**Wrong**: storing event times as `TIMESTAMP` and assuming a zone — it's ambiguous.
**Fix**: use `TIMESTAMPTZ` for event times.

### 35. `date_trunc('day', ts)` truncates in the session zone

**Wrong**: truncating in UTC when the business day is in New York.
**Fix**: `date_trunc('day', ts AT TIME ZONE 'America/New_York')`.

## DDL and Schema Traps

### 36. `ALTER COLUMN ... TYPE` rewrites the table

**Wrong**: changing a column type on a billion-row table in one statement — hours of downtime.
**Fix**: add a new column, backfill in batches, swap, drop old.

### 37. `ADD COLUMN ... NOT NULL DEFAULT x` rewrites (sometimes)

**Wrong**: `ADD COLUMN processed_at TIMESTAMPTZ NOT NULL DEFAULT now()` — `now()` is volatile, forces a rewrite.
**Fix**: add nullable + default, backfill, then `SET NOT NULL` via `NOT VALID` + `VALIDATE`.

### 38. `TRUNCATE` doesn't reset sequences

**Wrong**: `TRUNCATE orders` leaves the sequence at its old position.
**Fix**: `TRUNCATE orders RESTART IDENTITY`.

### 39. Sequence not advanced after a data load

**Wrong**: `COPY` with explicit IDs, then auto-inserts collide.
**Fix**: `SELECT setval(pg_get_serial_sequence('t', 'id'), (SELECT max(id) FROM t))`.

## Security Traps

### 40. Table owner bypasses RLS

**Wrong**: app connects as the table owner, RLS doesn't apply.
**Fix**: `FORCE ROW LEVEL SECURITY`, or connect as a non-owner role.

### 41. `PUBLIC` grants left in place

**Wrong**: default `PUBLIC` access on databases/functions forgotten.
**Fix**: `REVOKE ... FROM PUBLIC` and grant explicitly.

### 42. `SECURITY DEFINER` without `search_path`

**Wrong**: a definer function with default `search_path` — vulnerable to hijacking.
**Fix**: `SET search_path = my_schema, pg_temp` in the function.

## Query Plan Traps

### 43. Stale statistics cause bad plans

**Wrong**: estimate says 1 row, actual is 1M — nested loop chosen, catastrophic.
**Fix**: `ANALYZE table` to refresh statistics.

### 44. `work_mem` too low causes disk spills

**Wrong**: sort/hash spills to disk — slow.
**Fix**: `SET work_mem = '256MB'` per-session for big queries.

### 45. `MATERIALIZED` CTE prevents predicate pushdown

**Wrong**: `WITH x AS MATERIALIZED (...) SELECT * FROM x WHERE ...` — full CTE computed before the filter.
**Fix**: drop `MATERIALIZED` (let the planner inline) or filter inside the CTE.

## 🧠 Spot the Bug (Comprehensive)

A developer writes a report query and gets wrong results — NULL customers excluded, averages off, and pagination skips rows. Find the issues:

::code-wrapper{language="sql"}
```sql
SELECT c.name, AVG(o.amount) AS avg_order
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.amount > 50
ORDER BY avg_order DESC
LIMIT 10;
```
::

<details>
<summary>Answer</summary>

Three issues:

1. **`LEFT JOIN` demoted to INNER JOIN**: `WHERE o.amount > 50` filters on the right table in `WHERE`, dropping customers with no orders (the NULL-extended rows have `o.amount = NULL`, and `NULL > 50` is UNKNOWN, not TRUE). The `LEFT JOIN` is pointless — it behaves as an `INNER JOIN`. Fix: move the filter to `ON`: `LEFT JOIN orders o ON c.id = o.customer_id AND o.amount > 50`.

2. **`AVG` ignores NULLs**: for a customer with no orders > 50, `AVG(o.amount)` is NULL (no non-NULL values). If the intent was "customers with no qualifying orders show 0," wrap: `COALESCE(AVG(o.amount), 0)`. But if the intent is "only show customers with qualifying orders," the `INNER JOIN` (original behavior) is correct — just remove the `LEFT JOIN` to make the intent explicit.

3. **Pagination without a tie-breaker**: `ORDER BY avg_order DESC LIMIT 10` — `avg_order` isn't unique; tied customers can drift between pages. Fix: add a tie-breaker: `ORDER BY avg_order DESC, c.id`.

The corrected query (assuming "all customers, with their average order > 50, or 0 if none"):

```sql
SELECT c.name, COALESCE(AVG(o.amount), 0) AS avg_order
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id AND o.amount > 50
GROUP BY c.id, c.name
ORDER BY avg_order DESC, c.id
LIMIT 10;
```

**The lessons**: right-table filters go in `ON` for a `LEFT JOIN`; `AVG` of NULLs is NULL (use `COALESCE` if you want 0); `ORDER BY` for pagination needs a unique tie-breaker.

</details>

## Summary

You now have a catalog of 40+ common SQL pitfalls and their idiomatic fixes — NULL traps, join demotion, GROUP BY rules, index defeats, transaction hazards, type/coercion surprises, DDL costs, and security holes. Next: exercises and projects to practice everything.