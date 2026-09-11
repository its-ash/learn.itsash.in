# 03 — Sorting, Pagination & LIMIT

## ORDER BY

`ORDER BY` sorts the final result set. It runs *after* `SELECT` (so column aliases are visible here).

::code-wrapper{language="sql"}
```sql
SELECT name, city FROM customers ORDER BY name;               -- ascending (default)
SELECT name, city FROM customers ORDER BY name ASC;           -- explicit ascending
SELECT name, city FROM customers ORDER BY name DESC;          -- descending
SELECT name, city FROM customers ORDER BY city, name;         -- sort by city, then name within city
SELECT name, city FROM customers ORDER BY city DESC, name ASC; -- mixed directions per column
```
::

### Sorting by Column Position (fragile, avoid)

::code-wrapper{language="sql"}
```sql
-- ORDER BY 2 means "the second column in the SELECT list"
SELECT name, city FROM customers ORDER BY 2;    -- fragile: reordering SELECT columns silently changes the sort
```
::

Positional `ORDER BY` is legal SQL but discouraged — it's fragile and harder to read. Always use column names or aliases.

### Sorting by Expression

::code-wrapper{language="sql"}
```sql
-- Sort by a computed value — alias is visible in ORDER BY (runs after SELECT)
SELECT name, length(name) AS name_len
FROM customers
ORDER BY length(name) DESC, name;              -- sort by name length desc, then name asc as tiebreaker

-- Sort by a CASE expression — custom ordering not derivable from column values
SELECT name, city FROM customers
ORDER BY
  CASE city
    WHEN 'NYC' THEN 1                           -- NYC first
    WHEN 'LA'  THEN 2                           -- then LA
    ELSE 3                                      -- then everything else
  END,
  name;                                         -- alphabetical within each city tier
```
::

## NULLs in ORDER BY

NULLs sort either first or last depending on the engine and direction. The SQL standard leaves this implementation-defined — a portability hazard.

| Engine | `ASC` default | `DESC` default |
|---|---|---|
| PostgreSQL | NULLs **last** | NULLs **first** |
| MySQL / SQLite | NULLs **first** | NULLs **last** |
| Oracle | NULLs **last** | NULLs **first** |
| SQL Server | NULLs **first** (smallest) | NULLs **last** |

### Forcing NULL Placement

::code-wrapper{language="sql"}
```sql
-- PostgreSQL: explicit NULLS FIRST / NULLS LAST
SELECT id, ordered_on FROM orders
ORDER BY ordered_on DESC NULLS LAST;           -- NULLs always last, regardless of ASC/DESC

SELECT id, ordered_on FROM orders
ORDER BY ordered_on NULLS FIRST;               -- NULLs always first
```
::

::code-wrapper{language="sql"}
```sql
-- Portable: ORDER BY (col IS NULL) trick — works on all engines
-- (col IS NULL) returns FALSE (0) for non-NULLs, TRUE (1) for NULLs
-- FALSE sorts before TRUE, so non-NULLs come first, NULLs last — in ascending order
SELECT id, ordered_on FROM orders
ORDER BY (ordered_on IS NULL), ordered_on;     -- NULLs last in ASC, portable across engines

-- For NULLs last in DESC, adjust:
SELECT id, ordered_on FROM orders
ORDER BY (ordered_on IS NULL), ordered_on DESC; -- NULLs still last (boolean sort first), then DESC within non-NULLs
```
::

## LIMIT and OFFSET

::code-wrapper{language="sql"}
```sql
-- First 10 rows (must pair with ORDER BY for deterministic results)
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
-- The planner short-circuits: zero rows fetched, only metadata returned
SELECT * FROM orders LIMIT 0;
```
::

### `FETCH ... WITH TIES` (PostgreSQL 13+, SQL Server)

::code-wrapper{language="sql"}
```sql
-- Top 3 amounts, but include any other orders with the same amount as the 3rd row.
-- WITH TIES can return MORE than 3 rows if there are ties at the boundary.
SELECT id, amount FROM orders
ORDER BY amount DESC
FETCH FIRST 3 ROWS WITH TIES;
```
::

## Pagination Patterns

### OFFSET Pagination (simple but slow at scale)

::code-wrapper{language="text"}
```text
Page 1: LIMIT 10 OFFSET 0
Page 2: LIMIT 10 OFFSET 10
Page 3: LIMIT 10 OFFSET 20
...
Page N: LIMIT 10 OFFSET (N-1)*10
```
::

**The O(N) problem**: `OFFSET 100000` still scans and discards 100000 rows before returning 10. On a large table, deep pages become progressively slower — O(offset + page_size) per page. Page 10000 is as slow as scanning 100000 rows.

### Keyset (Seek) Pagination — the fast alternative

Instead of skipping rows, remember the last row's sort value and ask for rows *after* it:

::code-wrapper{language="sql"}
```sql
-- Page 1: fetch the first 10 rows
SELECT id, name, ordered_on
FROM orders
ORDER BY ordered_on DESC, id DESC   -- id as unique tie-breaker (critical!)
LIMIT 10;

-- Suppose the last row was (id=42, ordered_on='2024-03-01').
-- Page 2: fetch rows strictly "before" that row in the sort order.
-- The row-value comparator (ordered_on, id) < (date, id) is lexicographic:
-- compare ordered_on first; if equal, compare id.
SELECT id, name, ordered_on
FROM orders
WHERE (ordered_on, id) < ('2024-03-01', 42)   -- row-value comparison: lexicographic "before"
ORDER BY ordered_on DESC, id DESC
LIMIT 10;

-- Page N: use the last row from page N-1 as the cursor — O(1) seek regardless of depth
SELECT id, name, ordered_on
FROM orders
WHERE (ordered_on, id) < ($last_ordered_on, $last_id)   -- parameterized cursor
ORDER BY ordered_on DESC, id DESC
LIMIT 10;
```
::

The row-value comparison `(ordered_on, id) < (date, id)` is a clean way to express "lexicographically before." It uses an index on `(ordered_on DESC, id DESC)` and is **O(log N) to seek + O(page_size) to fetch** regardless of depth — page 10000 is as fast as page 1.

**Keyset pagination requirements**:
- A stable, unique sort key (or a composite key with a unique tie-breaker).
- An index covering the sort key(s).
- The client must remember the last row's key, not just a page number.

### When OFFSET is fine

- Small result sets (a few thousand rows).
- Admin/internal tools where performance doesn't matter.
- Random-access pages ("jump to page 50") where keyset doesn't apply (keyset only goes forward/backward from a known position).

## Complex Implementation: Production Keyset Pagination

::code-wrapper{language="sql"}
```sql
-- A production-grade keyset pagination query with a composite cursor.
-- Schema: orders(id, customer_id, status, placed_at, total)
-- Index: CREATE INDEX idx_orders_placed_id ON orders (placed_at DESC, id DESC);

-- Page 1 — no cursor, just take the first page
SELECT id, customer_id, status, placed_at, total
FROM orders
ORDER BY placed_at DESC, id DESC
LIMIT 20;

-- Page N — cursor from the previous page's last row
-- $cursor_placed_at and $cursor_id are the last row's values from page N-1
SELECT id, customer_id, status, placed_at, total
FROM orders
WHERE (placed_at, id) < ($cursor_placed_at, $cursor_id)   -- lexicographic "strictly before"
ORDER BY placed_at DESC, id DESC
LIMIT 20;

-- With a WHERE filter on status — the filter applies before the cursor comparison
SELECT id, customer_id, status, placed_at, total
FROM orders
WHERE status = 'shipped'
  AND (placed_at, id) < ($cursor_placed_at, $cursor_id)
ORDER BY placed_at DESC, id DESC
LIMIT 20;
-- Requires a partial index: CREATE INDEX idx_orders_shipped_placed ON orders (placed_at DESC, id DESC) WHERE status = 'shipped';
```
::

## Anti-Pattern: OFFSET Pagination at Scale

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: OFFSET pagination on a large table — deep pages are O(N)
SELECT id, name FROM orders ORDER BY placed_at DESC LIMIT 20 OFFSET 1000000;
-- The planner must produce and discard 1,000,000 rows before returning 20.
-- On a 2M-row table, this can take seconds — and gets worse every page.

-- ✅ RIGHT: keyset pagination — O(log N) seek, constant time per page
SELECT id, name FROM orders
WHERE (placed_at, id) < ($cursor_placed_at, $cursor_id)
ORDER BY placed_at DESC, id DESC
LIMIT 20;
```
::

## 💡 Tips & Tricks

- **Performance**: for user-facing paginated lists on large tables, **always prefer keyset over OFFSET** — keyset is O(log N) to seek plus O(page_size) to fetch, while OFFSET is O(offset + page_size). The difference is invisible at page 5 and dramatic at page 5000.
- **Idiom**: when using `ORDER BY` for pagination, always include a **unique tie-breaker column** (typically the primary key) as the final sort key — without it, rows with equal sort values can appear in arbitrary order across pages, causing duplicates or skips when data changes between page loads.
- **Idiom**: `ORDER BY (col IS NULL), col` is a portable way to push NULLs to the end of an ascending sort without relying on `NULLS LAST` — the boolean expression sorts FALSE (0) before TRUE (1), so non-NULL rows come first, then NULLs, then within each group the actual column values sort normally.
- **Performance**: `LIMIT` without `ORDER BY` is cheap (the planner just stops early), but `LIMIT n` *with* `ORDER BY` on an unindexed column still sorts the entire result set before taking the top n — add an index on the sort column for "top N" queries to avoid a full sort.

## ⚠️ Edge Cases & Gotchas

- **`LIMIT` without `ORDER BY` is non-deterministic**: the database may return *any* rows that match the `WHERE`, in any order, and the set can differ between runs (especially after `VACUUM` or index changes). Never rely on "the first 10 rows" being meaningful without an `ORDER BY`.
- **`OFFSET` counts from the result after `WHERE`/`GROUP BY`/`HAVING`**, not from the table. A query with `WHERE amount > 100 LIMIT 10 OFFSET 20` skips 20 rows *that pass the WHERE*, not 20 rows of the table.
- **NULL sort order is engine-specific**: the same `ORDER BY col ASC` can put NULLs first (MySQL, SQLite) or last (PostgreSQL, Oracle). If the order matters, use `NULLS FIRST/LAST` or the `IS NULL` trick — don't assume.
- **`FETCH FIRST n ROWS ONLY` vs `LIMIT n`**: they're equivalent in PostgreSQL, but `FETCH` is ANSI standard and supports `WITH TIES`, while `LIMIT` is a PostgreSQL/MySQL extension. SQLite uses `LIMIT` only.
- **`OFFSET 0` is legal but pointless**: it's a no-op. Some ORMs generate it; ignore it.
- **Large `OFFSET` can be slower than a full scan**: `OFFSET 1000000 LIMIT 10` on a 2M-row table may take longer than `SELECT count(*)` because the planner has to produce and discard a million rows. Keyset pagination avoids this entirely.
- **`WITH TIES` returns variable-size results**: `FETCH FIRST 3 ROWS WITH TIES` can return *more* than 3 rows if there are ties at the boundary — this is correct behavior (you asked for the top 3 *values*), but callers expecting exactly 3 rows must handle variable result sizes.
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

::code-wrapper{language="sql"}
```sql
SELECT id, name, ordered_on
FROM orders
ORDER BY ordered_on DESC, id DESC    -- id as unique tie-breaker → total order
LIMIT 10 OFFSET 10;
```
::

With a total order (`ordered_on, id`), every row has a deterministic position, and pagination is stable. Even better, use keyset pagination on `(ordered_on, id)` for O(1) page seeks.

**The lesson**: `ORDER BY` on a non-unique column produces a *partial* order — tied rows are in arbitrary order and can drift between queries. Always add a unique tie-breaker for pagination.

</details>

## Summary

You can now sort with `ORDER BY` (including NULL placement and custom orders), limit results with `LIMIT`/`FETCH`, and paginate — knowing why keyset pagination beats `OFFSET` at scale. Next: combining tables with joins, the most powerful feature of relational databases.