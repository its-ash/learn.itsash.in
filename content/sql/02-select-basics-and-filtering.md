# 02 — SELECT Basics & Filtering

## The SELECT Statement

`SELECT` is the workhorse of SQL. Its core form:

::code-wrapper{language="sql"}
```sql
-- projection: which columns to return
-- selection:  which rows to return (WHERE)
-- source:     which table (or join/CTE/subquery) to read from
SELECT column1, column2
FROM table_name
WHERE condition;
```
::

- `SELECT` chooses **columns** (projection).
- `FROM` chooses the **source** (a table, or later: a join, subquery, CTE).
- `WHERE` chooses **rows** (selection / filtering).

## Selecting Columns

::code-wrapper{language="sql"}
```sql
-- Explicit columns — the only safe form for application code.
-- The planner can use covering indexes that include exactly these columns.
SELECT name, city FROM customers;

-- Expressions with aliases
SELECT
  name,
  length(name) AS name_len,               -- function call + alias
  upper(city) AS city_upper
FROM customers;

-- Constants and computations
SELECT
  name,
  'US' AS country,                        -- literal column
  2024 - 2000 AS age_estimate             -- arithmetic on literals
FROM customers;
```
::

### `SELECT *` — the production anti-pattern

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: SELECT * in production application code
SELECT * FROM customers;

-- ✅ RIGHT: explicit column list
SELECT id, name, city, created_at FROM customers;
```
::

`SELECT *` is fine for quick exploration but an anti-pattern in production code:

- It returns columns you may not need, wasting I/O, memory, and network bandwidth — especially with wide tables (50+ columns) or large TEXT/JSONB columns.
- If the table schema changes (a column is added), `SELECT *` silently returns the new column, which can break applications expecting a fixed shape (ORM mapping errors, JSON deserialization failures).
- It prevents the planner from using **covering indexes** — indexes that include all needed columns. If you only need `name, city` and there's an index on `(name, city)`, `SELECT name, city` can be served entirely from the index (index-only scan, no table visit). `SELECT *` forces a heap visit for every row.

Always list columns explicitly in application queries.

## Aliasing Columns

::code-wrapper{language="sql"}
```sql
-- AS is optional but improves readability — always use it in production code
SELECT amount * 1.08 AS total_with_tax
FROM orders;

-- Quoted alias when it contains spaces or mixed case
SELECT amount * 1.08 AS "Total With Tax"   -- quoted: preserves case and spaces
FROM orders;

-- Alias scoping: visible in ORDER BY (runs after SELECT), NOT in WHERE (runs before)
SELECT amount * 1.08 AS taxed
FROM orders
-- WHERE taxed > 100;          -- ❌ ERROR: column "taxed" does not exist
ORDER BY taxed DESC;           -- ✅ works — ORDER BY runs after SELECT
```
::

Aliases are purely display labels — they don't change data. The scoping rule follows the logical evaluation order (see Chapter 01): aliases are created in `SELECT` (step 5) and are visible only in clauses that run *after* it: `ORDER BY`, `LIMIT`.

## DISTINCT

::code-wrapper{language="sql"}
```sql
-- Unique cities — DISTINCT applies to the entire row, not individual columns
SELECT DISTINCT city FROM customers;

-- Distinct combinations — returns unique (city, name) pairs, not unique cities + unique names
SELECT DISTINCT city, name FROM customers;
```
::

`DISTINCT` applies to the *entire row*, not individual columns. `SELECT DISTINCT city, name` returns unique (city, name) pairs.

### `DISTINCT ON` (PostgreSQL-specific)

::code-wrapper{language="sql"}
```sql
-- The largest order per customer — "greatest-N-per-group" in one query.
-- DISTINCT ON (customer_id) keeps the first row per customer_id group.
-- ORDER BY must start with the DISTINCT ON columns, then the ranking within each group.
SELECT DISTINCT ON (customer_id)
  customer_id, id, amount
FROM orders
ORDER BY customer_id, amount DESC;   -- within each customer, sort by amount DESC → keep the biggest
```
::

This is a concise alternative to window functions (Chapter 09) for "greatest-N-per-group" queries.

## WHERE — Filtering Rows

`WHERE` keeps rows where the condition is `TRUE`. Rows where the condition is `FALSE` or `UNKNOWN` (NULL-related) are discarded.

### Comparison Operators

| Operator | Meaning | Notes |
|---|---|---|
| `=` | Equal | Single `=`, not `==`. |
| `<>` or `!=` | Not equal | `<>` is ANSI standard; `!=` widely supported. |
| `<`, `<=`, `>`, `>=` | Ordering | |
| `BETWEEN x AND y` | Inclusive range | `>= x AND <= y` — both ends inclusive. |
| `NOT BETWEEN x AND y` | Outside range | `x > col OR col > y`. |
| `IN (a, b, c)` | Equal to any listed value | |
| `NOT IN (a, b, c)` | Not equal to any listed value | ⚠️ NULL poison — see below. |
| `LIKE` | Pattern: `%` = any chars, `_` = one char | Case-sensitive in PostgreSQL. |
| `ILIKE` (PostgreSQL) | Case-insensitive LIKE | PostgreSQL extension. |
| `IS NULL` / `IS NOT NULL` | NULL tests | The only correct way to test for NULL. |
| `IS [NOT] DISTINCT FROM` | NULL-safe equality | Treats `NULL = NULL` as true. |

::code-wrapper{language="sql"}
```sql
SELECT name, city FROM customers WHERE city = 'NYC';
SELECT name FROM customers WHERE name <> 'Alice';
SELECT * FROM orders WHERE amount >= 100;
SELECT * FROM orders WHERE amount BETWEEN 10 AND 100;   -- 10 <= amount <= 100 (inclusive)
SELECT * FROM orders WHERE customer_id IN (1, 3);
SELECT * FROM customers WHERE name LIKE 'A%';            -- starts with 'A'
SELECT * FROM customers WHERE name LIKE '_a%';           -- second char is 'a'
SELECT * FROM customers WHERE city IS NULL;              -- correct NULL test
SELECT * FROM customers WHERE city IS DISTINCT FROM 'NYC'; -- NULL-safe "not NYC" — includes NULL cities
```
::

### Logical Operators

| Operator | Meaning |
|---|---|
| `AND` | Both conditions true. |
| `OR` | Either condition true. |
| `NOT` | Negates a condition. |

`AND` binds tighter than `OR`, so `A OR B AND C` is `A OR (B AND C)`. Always use parentheses:

::code-wrapper{language="sql"}
```sql
-- ❌ Unclear — relies on remembering AND > OR precedence
SELECT * FROM orders
WHERE customer_id = 1 OR customer_id = 2 AND amount > 100;

-- ✅ Explicit — intent is obvious
SELECT * FROM orders
WHERE customer_id = 1 OR (customer_id = 2 AND amount > 100);

-- ✅ Different intent entirely
SELECT * FROM orders
WHERE (customer_id = 1 OR customer_id = 2) AND amount > 100;
```
::

## LIKE Patterns

| Pattern | Matches |
|---|---|
| `'A%'` | Anything starting with `A`. |
| `'%a'` | Anything ending with `a`. |
| `'%a%'` | Anything containing `a`. |
| `'_a%'` | Second character is `a`. |
| `'A__e'` | Four chars: `A`, any, any, `e`. |

::code-wrapper{language="sql"}
```sql
-- Escape literal wildcards using ESCAPE clause
SELECT * FROM users WHERE name LIKE '%\_%' ESCAPE '\';   -- match literal underscore in name
```
::

**Index implications**: leading wildcards (`'%foo'`, `'%foo%'`) defeat B-tree indexes — the database must scan every row. For high-volume substring search, use full-text search (Chapter 20) or trigram indexes (`pg_trgm`):

::code-wrapper{language="sql"}
```sql
-- pg_trgm trigram index supports %foo% with index acceleration
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING gin (name gin_trgm_ops);

SELECT * FROM users WHERE name LIKE '%alice%';   -- now uses the GIN trigram index
```
::

## IN and Subqueries vs EXISTS

::code-wrapper{language="sql"}
```sql
-- IN with a subquery — a "semi-join": keep left rows that have at least one match in the subquery
SELECT * FROM customers
WHERE id IN (SELECT customer_id FROM orders);

-- EXISTS — same result, different execution strategy
SELECT * FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.id   -- SELECT 1: we only care about existence, not values
);

-- NOT EXISTS — immune to NULL poisoning (unlike NOT IN)
SELECT * FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.id
);
```
::

`EXISTS` short-circuits on the first match — it doesn't need to materialize the full subquery result. `IN` may build the full list first. The difference is most visible when the subquery can produce NULLs (see the NULL poison gotcha below).

## NULL: Three-Valued Logic (preview)

`NULL` is not a value — it's the absence of one. Comparisons with `NULL` produce `UNKNOWN` (not `TRUE`, not `FALSE`):

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers WHERE city = NULL;     -- ❌ returns nothing — NULL = NULL is UNKNOWN
SELECT * FROM customers WHERE city IS NULL;    -- ✅ correct NULL test
SELECT * FROM customers WHERE city != 'NYC';   -- ❌ excludes NULLs too! NULL != 'NYC' is UNKNOWN
```
::

| Expression | Result |
|---|---|
| `NULL = NULL` | UNKNOWN |
| `NULL != 'NYC'` | UNKNOWN |
| `NULL IS NULL` | TRUE |
| `NULL IS NOT NULL` | FALSE |
| `NULL + 1` | NULL |
| `UNKNOWN AND TRUE` | UNKNOWN |
| `UNKNOWN AND FALSE` | FALSE |
| `UNKNOWN OR TRUE` | TRUE |

`WHERE` only keeps rows where the condition is `TRUE`. `UNKNOWN` is treated as "not true" → row excluded.

## NULL-Safe Operators

::code-wrapper{language="sql"}
```sql
-- IS DISTINCT FROM — NULL-safe "not equal": treats NULL = NULL as equal (not distinct)
SELECT * FROM customers WHERE city IS DISTINCT FROM 'NYC';
-- Returns rows where city != 'NYC' OR city IS NULL — includes unknown cities

-- IS NOT DISTINCT FROM — NULL-safe "equal": NULL IS NOT DISTINCT FROM NULL → TRUE
SELECT * FROM orders WHERE amount IS NOT DISTINCT FROM NULL;
-- Equivalent to: WHERE amount IS NULL, but useful in generic/comparison code
```
::

`IS DISTINCT FROM` is the cleanest way to say "not equal, counting NULL as a real value." It's essential in `WHERE` clauses where NULL is a meaningful "other" state.

## Filtering on Computed Columns

You can't use a `SELECT` alias in `WHERE` (it doesn't exist yet — see evaluation order). Repeat the expression or use a CTE:

::code-wrapper{language="sql"}
```sql
-- ❌ ERROR: alias "taxed" doesn't exist in WHERE (WHERE runs before SELECT)
SELECT amount * 1.08 AS taxed FROM orders WHERE taxed > 100;

-- ✅ Repeat the expression
SELECT amount * 1.08 AS taxed FROM orders WHERE amount * 1.08 > 100;

-- ✅ Or use a CTE to compute once, filter twice (cleaner for complex expressions)
WITH taxed_orders AS (
  SELECT *, amount * 1.08 AS taxed FROM orders
)
SELECT * FROM taxed_orders WHERE taxed > 100;
```
::

## Complex Implementation: Multi-Condition Report Filter

::code-wrapper{language="sql"}
```sql
-- A realistic report query: find high-value customers in major cities
-- who haven't placed any orders over $500 in the last 90 days.
SELECT
  c.id,
  c.name,
  c.city,
  c.created_at
FROM customers c
WHERE c.city IN ('NYC', 'LA', 'SF')                         -- restrict to major cities (uses index)
  AND c.name LIKE 'A%'                                       -- name filter (index-accelerated if no leading %)
  AND c.deleted_at IS NULL                                    -- exclude soft-deleted
  AND NOT EXISTS (                                            -- anti-join: no large recent orders
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id
      AND o.amount > 500
      AND o.ordered_on >= CURRENT_DATE - INTERVAL '90 days'
  )
ORDER BY c.created_at DESC;
```
::

## Anti-Pattern: `SELECT *` in Production

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: SELECT * in a production query
-- Problems: fetches all columns (wasteful), breaks if schema changes,
-- prevents index-only scans, exposes sensitive columns (e.g., password_hash)
SELECT * FROM customers WHERE city = 'NYC';

-- ✅ RIGHT: explicit columns
SELECT id, name, city, created_at FROM customers WHERE city = 'NYC';
```
::

## 💡 Tips & Tricks

- **Idiom**: use `IN (...)` for a fixed list of values, but switch to `= ANY(ARRAY[...])` in PostgreSQL when the list is large or comes from a parameter — `IN` with thousands of values can hit parser limits and is slower to parse.

::code-wrapper{language="sql"}
```sql
-- Large IN list — can be slow to parse and hit limits
SELECT * FROM orders WHERE customer_id IN (1, 2, 3, /* ... 5000 values */);

-- Better for large lists — ARRAY is passed as a single parameter, parsed once
SELECT * FROM orders WHERE customer_id = ANY(ARRAY[1, 2, 3, /* ... 5000 values */]::bigint[]);
```
::

- **Performance**: `EXISTS (SELECT 1 FROM ... WHERE ...)` is usually faster than `IN (SELECT ...)` for subqueries over large sets, because `EXISTS` short-circuits on the first match while `IN` may materialize the full list. The difference is most visible when the subquery can produce NULLs.
- **Portability**: prefer `<>` over `!=` — `<>` is ANSI standard and works everywhere; `!=` is supported by most engines but not all (notably MS Access and some older engines reject it).
- **Debug**: when a query returns fewer rows than expected, check for `NOT IN` with a NULL-producing subquery — `x NOT IN (1, 2, NULL)` returns *zero* rows for the entire query (NULL poison). Use `NOT EXISTS` instead.
- **Idiom**: use `COALESCE(column, fallback)` to substitute a default for NULL in the `SELECT` list, but don't use it in `WHERE` to "fix" NULL filtering — it defeats indexes (the function is applied per row after index lookup is decided). Add a partial index or use `OR column IS NULL` explicitly.

## ⚠️ Edge Cases & Gotchas

- **`=` is single-equals**: SQL uses `=` for both assignment (in `SET`) and comparison (in `WHERE`). There is no `==`. Programmers coming from JS/Python/C often type `==` and get a syntax error.
- **`!= NULL` is never true**: `WHERE col != NULL` returns zero rows — use `WHERE col IS NOT NULL`. Even `WHERE col = NULL` returns zero rows. NULL comparisons are *always* UNKNOWN.
- **`NOT IN` with NULLs (NULL poison)**: `WHERE x NOT IN (1, 2, NULL)` returns *no rows at all* — because `x NOT IN (a, b, c)` is equivalent to `x <> a AND x <> b AND x <> c`, and `x <> NULL` is UNKNOWN, which makes the whole `AND` chain UNKNOWN, which `WHERE` treats as "not true." This is the most dangerous NULL gotcha in SQL. Use `NOT EXISTS` or add `AND col IS NOT NULL` to the subquery.

::code-wrapper{language="sql"}
```sql
-- ❌ NULL poison: if the subquery returns any NULL, the entire NOT IN returns zero rows
SELECT * FROM customers WHERE id NOT IN (SELECT customer_id FROM orders WHERE city IS NULL);

-- ✅ Safe: NOT EXISTS is immune to NULLs in the subquery
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.city IS NULL);
```
::

- **Case-sensitive string comparison in PostgreSQL**: `WHERE name = 'alice'` does *not* match `'Alice'`. Use `ILIKE` or `LOWER(name) = LOWER('alice')` (or a case-insensitive collation). MySQL's default collation is case-insensitive — a portability trap.
- **Trailing whitespace**: `'alice' = 'alice '` is `false` in PostgreSQL (strings compared literally, including trailing spaces), but `true` in some other engines. Don't rely on implicit trimming.
- **`BETWEEN` is inclusive on both ends**: `amount BETWEEN 10 AND 100` means `>= 10 AND <= 100`, not `> 10 AND < 100`. Off-by-one errors here are common.
- **`IN` with mixed types**: `WHERE id IN ('1', '2', '3')` against an integer column triggers implicit casts — can mask bugs and prevent index use. Match the column type.
- **Column order in `SELECT *`**: the order of columns in `SELECT *` is the order they were defined in `CREATE TABLE` (or the order in `ALTER TABLE ADD COLUMN`). It's not guaranteed stable across schema changes — another reason to avoid `*` in application code.

## 🧠 Spot the Bug

This query is supposed to find customers who are *not* in NYC, but it's missing Carol, whose `city` is NULL. Why, and how do you fix it?

::code-wrapper{language="sql"}
```sql
SELECT name FROM customers WHERE city != 'NYC';
```
::

<details>
<summary>Answer</summary>

`city != 'NYC'` is `UNKNOWN` when `city` is `NULL` (any comparison with NULL yields UNKNOWN, not TRUE or FALSE). `WHERE` only keeps rows where the condition is `TRUE`, so NULL-city rows are excluded — even though "unknown city" intuitively means "not NYC."

The fix depends on intent:

::code-wrapper{language="sql"}
```sql
-- If "not NYC" includes unknown cities:
SELECT name FROM customers WHERE city IS DISTINCT FROM 'NYC';
-- or
SELECT name FROM customers WHERE city != 'NYC' OR city IS NULL;

-- If "not NYC" means "known to be not NYC":
SELECT name FROM customers WHERE city != 'NYC';
-- (NULLs correctly excluded — this is the rare case where the original is right)
```
::

`IS DISTINCT FROM` is the NULL-safe "not equal" — it treats `NULL` and `NULL` as equal (distinct = false), and `NULL` and `'NYC'` as distinct (true). It's the cleanest way to say "not equal, counting NULL as a real value."

**The lesson**: `!=` and `<>` silently drop NULLs. If NULL is a meaningful "other" value in your data, use `IS DISTINCT FROM` or explicitly handle `IS NULL`.

</details>

## Summary

You can now project columns, alias them, remove duplicates, and filter rows with `WHERE` using comparison and logical operators — while avoiding the NULL traps that catch most beginners. Next: sorting results and paginating through large result sets.