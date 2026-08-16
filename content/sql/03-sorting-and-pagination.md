# 03 — Sorting, Pagination & LIMIT

## ORDER BY

`ORDER BY` sorts the final result set. It runs *after* `SELECT` (so column aliases are visible here).

::code-wrapper{language="sql"}
```sql
SELECT name, city FROM customers ORDER BY name;           -- ascending (default)
SELECT name, city FROM customers ORDER BY name ASC;       -- explicit ascending
SELECT name, city FROM customers ORDER BY name DESC;      -- descending
SELECT name, city FROM customers ORDER BY city, name;     -- sort by city, then name within city
SELECT name, city FROM customers ORDER BY city DESC, name ASC;  -- mixed directions
```
::

### Sorting by Column Position (deprecated but legal)

::code-wrapper{language="sql"}
```sql
-- ORDER BY 2 means "the second column in the SELECT list"
SELECT name, city FROM customers ORDER BY 2;
```
::

This positional form is legal SQL but discouraged — it's fragile (reordering columns in `SELECT` silently changes the sort) and harder to read. Always use column names or aliases.

### Sorting by Expression

::code-wrapper{language="sql"}
```sql
-- Sort by a computed value
SELECT name, length(name) AS name_len
FROM customers
ORDER BY length(name) DESC, name;

-- Sort by a CASE (custom order)
SELECT name, city FROM customers
ORDER BY
  CASE city
    WHEN 'NYC' THEN 1
    WHEN 'LA'  THEN 2
    ELSE 3
  END,
  name;
```
::

## NULLs in ORDER BY

NULLs sort either first or last depending on the engine and direction. The SQL standard leaves this implementation-defined, which makes it a portability hazard.

| Engine | Default NULL placement |
|---|---|
| PostgreSQL | NULLs **last** in `ASC`, **first** in `DESC`. |
| MySQL / SQLite | NULLs **first** in `ASC`, **last** in `DESC`. |
| Oracle | NULLs **last** in `ASC`, **first** in `DESC` (like PostgreSQL). |
| SQL Server | NULLs treated as the smallest value (first in `ASC`). |

### Forcing NULL placement (PostgreSQL)

PostgreSQL offers `NULLS FIRST` / `NULLS LAST`:

::code-wrapper{language="sql"}
```sql
-- Newest orders first, with NULL ordered_at sorted last regardless of direction
SELECT id, ordered_on FROM orders
ORDER BY ordered_on DESC NULLS LAST;

-- Always put NULLs first
SELECT id, ordered_on FROM orders
ORDER BY ordered_on NULLS FIRST;
```
::

For cross-database portability without `NULLS FIRST/LAST`, use a `CASE` or `COALESCE` trick:

::code-wrapper{language="sql"}
```sql
-- NULLs last in ascending order (portable)
SELECT id, ordered_on FROM orders
ORDER BY (ordered_on IS NULL), ordered_on;
```
::

## LIMIT and OFFSET

`LIMIT` restricts the number of rows returned. `OFFSET` skips rows before counting.

::code-wrapper{language="sql"}
```sql
-- First 10 rows
SELECT * FROM orders ORDER BY ordered_on DESC LIMIT 10;

-- Skip 20, take 10 (page 3 of a 10-per-page listing)
SELECT * FROM orders ORDER BY ordered_on DESC LIMIT 10 OFFSET 20;

-- FETCH syntax (ANSI standard, equivalent to LIMIT/OFFSET)
SELECT * FROM orders ORDER BY ordered_on DESC
OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;
```
::

`LIMIT` without `ORDER BY` returns an **arbitrary** set of rows — the planner is free to return any rows in any order. Always pair `LIMIT` with an `ORDER BY` on a unique column (or a tie-breaker) for deterministic results.

### `LIMIT 0` — a schema probe

::code-wrapper{language="sql"}
```sql
-- Get column names/types without fetching any data — useful for introspection
SELECT * FROM orders LIMIT 0;
```
::

### `FETCH ... WITH TIES` (PostgreSQL 13+, SQL Server)

If the last row ties with the next row on the sort key, `WITH TIES` includes all tied rows:

::code-wrapper{language="sql"}
```sql
-- Top 3 amounts, but include any other orders with the same amount as the 3rd
SELECT id, amount FROM orders
ORDER BY amount DESC
FETCH FIRST 3 ROWS WITH TIES;
```
::

## Pagination Patterns

### OFFSET pagination (simple but slow at scale)

::code-wrapper{language="text"}
```text
Page 1: LIMIT 10 OFFSET 0
Page 2: LIMIT 10 OFFSET 10
Page 3: LIMIT 10 OFFSET 20
...
Page N: LIMIT 10 OFFSET (N-1)*10
```
::

**Problem**: `OFFSET 100000` still scans and discards 100000 rows before returning 10. On a large table, deep pages become progressively slower — O(N) per page. This is the classic "offset pagination is fine until page 1000, then it's terrible."

### Keyset (seek) pagination — the fast alternative

Instead of skipping rows, remember the last row's sort value and ask for rows *after* it:

::code-wrapper{language="sql"}
```sql
-- Page 1
SELECT id, name, ordered_on
FROM orders
ORDER BY ordered_on DESC, id DESC   -- id as tie-breaker
LIMIT 10;

-- Suppose the last row was (id=42, ordered_on='2024-03-01')
-- Page 2 — fetch rows strictly "before" that row in the sort order
SELECT id, name, ordered_on
FROM orders
WHERE (ordered_on, id) < ('2024-03-01', 42)
ORDER BY ordered_on DESC, id DESC
LIMIT 10;
```
::

The row-value comparison `(ordered_on, id) < (date, id)` is a clean way to express "lexicographically before." It uses an index on `(ordered_on DESC, id DESC)` and is **O(1) per page** regardless of depth — page 10000 is as fast as page 1.

**Keyset pagination requirements**:
- A stable, unique sort key (or a composite key with a unique tie-breaker).
- An index covering the sort key(s).
- The client must remember the last row's key, not just a page number.

### When OFFSET is fine

- Small result sets (a few thousand rows).
- Admin/internal tools where performance doesn't matter.
- Random-access pages ("jump to page 50") where keyset doesn't apply (keyset only goes forward/backward from a known position).

## 💡 Tips & Tricks

- **Performance**: for user-facing paginated lists on large tables, **always prefer keyset over OFFSET** — keyset is O(log N) to seek plus O(page_size) to fetch, while OFFSET is O(offset + page_size). The difference is invisible at page 5 and dramatic at page 5000.
- **Idiom**: when using `ORDER BY` for pagination, always include a **unique tie-breaker column** (typically the primary key) as the final sort key — without it, rows with equal sort values can appear in arbitrary order across pages, causing duplicates or skips when data changes between page loads.
- **Debug**: if pagination results seem to skip or duplicate rows, check whether the underlying data changed between page fetches — `OFFSET` pagination is not stable under inserts/deletes. Keyset pagination is stable for inserts *before* the cursor but not for inserts *after* it; for fully stable pagination, snapshot the result set (e.g., into a temp table or a cursor).
- **Idiom**: `ORDER BY (col IS NULL), col` is a portable way to push NULLs to the end of an ascending sort without relying on `NULLS LAST` — the boolean expression sorts FALSE (0) before TRUE (1), so non-NULL rows come first, then NULLs, then within each group the actual column values sort normally.
- **Performance**: `LIMIT` without `ORDER BY` is cheap (the planner just stops early), but `LIMIT n` *with* `ORDER BY` on an unindexed column still sorts the entire result set before taking the top n — add an index on the sort column for "top N" queries to avoid a full sort.

## ⚠️ Edge Cases & Gotchas

- **`LIMIT` without `ORDER BY` is non-deterministic**: the database may return *any* rows that match the `WHERE`, in any order, and the set can differ between runs (especially after `VACUUM` or index changes). Never rely on "the first 10 rows" being meaningful without an `ORDER BY`.
- **`OFFSET` counts from the result after `WHERE`/`GROUP BY`/`HAVING`**, not from the table. A query with `WHERE amount > 100 LIMIT 10 OFFSET 20` skips 20 rows *that pass the WHERE*, not 20 rows of the table.
- **NULL sort order is engine-specific**: the same `ORDER BY col ASC` can put NULLs first (MySQL, SQLite) or last (PostgreSQL, Oracle). If the order matters, use `NULLS FIRST/LAST` or the `IS NULL` trick — don't assume.
- **`FETCH FIRST n ROWS ONLY` vs `LIMIT n`**: they're equivalent in PostgreSQL, but `FETCH` is ANSI standard and supports `WITH TIES`, while `LIMIT` is a PostgreSQL/MySQL extension. SQLite uses `LIMIT` only.
- **`OFFSET 0` is legal but pointless**: it's a no-op. Some ORMs generate it; ignore it.
- **Large `OFFSET` can be slower than a full scan**: `OFFSET 1000000 LIMIT 10` on a 2M-row table may take longer than `SELECT count(*)` because the planner has to produce and discard a million rows. Keyset pagination avoids this entirely.
- **Tie-breakers and `WITH TIES`**: `FETCH FIRST 3 ROWS WITH TIES` can return *more* than 3 rows if there are ties at the boundary — this is correct behavior (you asked for the top 3 *values*), but callers expecting exactly 3 rows must handle variable result sizes.
- **`ORDER BY` in subqueries is ignored by the standard**: the SQL standard does not guarantee that `ORDER BY` inside a subquery or view is preserved in the outer query — the outer query's `ORDER BY` is what matters. PostgreSQL mostly preserves it as an optimization fence, but don't rely on it; move `ORDER BY` to the outermost query.

## 🧠 Spot the Bug

A developer implements pagination like this and reports that "page 2 sometimes shows rows that were already on page 1." What's wrong?

::code-wrapper{language="sql"}
```sql
-- Page 1
SELECT id, name, ordered_on FROM orders ORDER BY ordered_on DESC LIMIT 10;

-- Page 2
SELECT id, name, ordered_on FROM orders ORDER BY ordered_on DESC LIMIT 10 OFFSET 10;
```
::

<details>
<summary>Answer</summary>

The sort key is `ordered_on` alone, and `ordered_on` is **not unique** — many orders can share the same date. When multiple rows have the same `ordered_on` value, their relative order is unspecified, and the planner is free to return them in *any* order on each execution. Between the page-1 and page-2 queries, the planner may choose a different order for the tied rows, causing a row to appear in the `LIMIT 10` window of page 1 and again in the `OFFSET 10 LIMIT 10` window of page 2 (or to be skipped entirely).

The fix: add a **unique tie-breaker** — typically the primary key — as the final sort key:

```sql
SELECT id, name, ordered_on
FROM orders
ORDER BY ordered_on DESC, id DESC
LIMIT 10 OFFSET 10;
```

With a total order (`ordered_on, id`), every row has a deterministic position, and pagination is stable. Even better, use keyset pagination on `(ordered_on, id)` for O(1) page seeks.

**The lesson**: `ORDER BY` on a non-unique column produces a *partial* order — tied rows are in arbitrary order and can drift between queries. Always add a unique tie-breaker for pagination.

</details>

## Summary

You can now sort with `ORDER BY` (including NULL placement and custom orders), limit results with `LIMIT`/`FETCH`, and paginate — knowing why keyset pagination beats `OFFSET` at scale. Next: combining tables with joins, the most powerful feature of relational databases.