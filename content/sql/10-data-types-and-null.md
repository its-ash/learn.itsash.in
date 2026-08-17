# 10 — Data Types & NULL Handling

SQL has rich types and a strict — but surprising — treatment of NULL. NULL is the single biggest source of bugs in SQL. This chapter covers the type system and the three-valued logic that NULL introduces.

## Core Data Types

| Category | PostgreSQL types | Notes |
|---|---|---|
| **Integer** | `smallint` (2B), `integer`/`int` (4B), `bigint` (8B) | Exact. Range: e.g. `int` = −2.1B to +2.1B. |
| **Decimal** | `numeric(p, s)`, `decimal(p, s)` | Exact, arbitrary precision. `p` = precision (total digits), `s` = scale (digits after decimal). |
| **Floating** | `real` (4B), `double precision` (8B) | Inexact, IEEE 754. Don't use for money. |
| **Text** | `text` (variable, unlimited), `varchar(n)` (variable, max n), `char(n)` (fixed n, padded) | PostgreSQL's `text` and `varchar` are identical in performance; `varchar(n)` is a length constraint, not a perf win. |
| **Boolean** | `boolean` | `TRUE`/`FALSE`/`NULL`. |
| **Date/Time** | `date`, `time`, `timestamp`, `timestamptz`, `interval` | See chapter 17. `timestamptz` stores a timestamp *with time zone* (stored as UTC, displayed in session zone). |
| **Binary** | `bytea` | Variable-length binary. |
| **UUID** | `uuid` | 128-bit. Generate with `gen_random_uuid()`. |
| **JSON** | `json`, `jsonb` | See chapter 18. `jsonb` is binary, indexable, deduplicated. |
| **Array** | `int[]`, `text[]`, etc. | PostgreSQL-specific. |
| **Enumerated** | `enum` | Static set of labels. |
| **Bit** | `bit(n)`, `bit varying(n)` | Bit strings. Rare. |
| **Money** | `money` | Don't use — it's a locale-dependent wrapper around `numeric`. Use `numeric(p, 2)`. |

### `numeric` vs floating-point

`numeric` is **exact** — `0.1 + 0.2 = 0.3`, always. Floating-point (`real`/`double precision`) is inexact — `0.1::float + 0.2::float = 0.30000000000000004`. Use `numeric` for money, scientific computations needing exact decimals, and anything where rounding errors are unacceptable. Use floats for approximate scientific work and when storage/speed matter more than exactness.

### `varchar(n)` vs `text`

In PostgreSQL, `text` and `varchar` (no length limit) are identical — there's no performance difference, and `varchar(n)` doesn't save storage (the storage is variable-length either way). `varchar(n)` is just a `CHECK (length(col) <= n)` constraint. Use `text` by default; use `varchar(n)` when you have a real business-rule length limit (e.g., ISO country codes = `char(2)` or `varchar(2)`).

`char(n)` pads with spaces to width `n`. This padding causes subtle comparison bugs (`'NY' = 'NY  '` may be true or false depending on the engine and collation). Avoid `char(n)` except for truly fixed-width codes.

## NULL — The Absence of Value

`NULL` means "unknown" or "not applicable" — it is **not** the same as `0`, `''` (empty string), or `FALSE`. SQL uses **three-valued logic (3VL)**: every comparison evaluates to `TRUE`, `FALSE`, or `UNKNOWN` (also called `NULL`).

### The truth tables

**AND**:
| A | B | A AND B |
|---|---|---|
| TRUE | TRUE | TRUE |
| TRUE | FALSE | FALSE |
| TRUE | UNKNOWN | UNKNOWN |
| FALSE | * | FALSE |
| UNKNOWN | UNKNOWN | UNKNOWN |

**OR**:
| A | B | A OR B |
|---|---|---|
| TRUE | * | TRUE |
| FALSE | FALSE | FALSE |
| FALSE | UNKNOWN | UNKNOWN |
| UNKNOWN | UNKNOWN | UNKNOWN |

**NOT**:
| A | NOT A |
|---|---|
| TRUE | FALSE |
| FALSE | TRUE |
| UNKNOWN | UNKNOWN |

Key insight: `FALSE AND UNKNOWN = FALSE` (one false makes the AND false regardless of the unknown), but `TRUE AND UNKNOWN = UNKNOWN` (the unknown could still be false). Symmetrically, `TRUE OR UNKNOWN = TRUE`, but `FALSE OR UNKNOWN = UNKNOWN`.

### `WHERE` keeps only TRUE

`WHERE` retains rows where the condition is **TRUE**. Rows where it's `FALSE` *or* `UNKNOWN` are discarded. This is why `WHERE col = NULL` returns nothing — `col = NULL` is `UNKNOWN`, and `UNKNOWN` is not `TRUE`.

### NULL comparisons

::code-wrapper{language="sql"}
```sql
NULL  = NULL    -- UNKNOWN (not TRUE!)
NULL <> NULL    -- UNKNOWN (not TRUE!)
NULL  = 5       -- UNKNOWN
NULL <> 5       -- UNKNOWN
NULL  > 5       -- UNKNOWN
```
::

Two NULLs are not "equal" — they're both "unknown," and whether they're the same unknown value is... unknown. This is the core of 3VL and the source of most NULL bugs.

## Testing for NULL

Use `IS NULL` / `IS NOT NULL` — these are the only NULL tests that return TRUE/FALSE (never UNKNOWN):

::code-wrapper{language="sql"}
```sql
WHERE col IS NULL      -- TRUE when col is NULL
WHERE col IS NOT NULL  -- TRUE when col is not NULL
``
::

## NULL-Safe Equality: `IS NOT DISTINCT FROM`

`IS NOT DISTINCT FROM` treats NULLs as equal to NULL:

::code-wrapper{language="sql"}
```sql
NULL IS NOT DISTINCT FROM NULL   -- TRUE
NULL IS DISTINCT FROM NULL       -- FALSE
5   IS NOT DISTINCT FROM 5       -- TRUE
5   IS DISTINCT FROM 6           -- TRUE
``
::

It's the "null-safe `=`" / "null-safe `<>`." Use it in joins where NULL keys should match, and in `WHERE` when "not equal" should include NULLs as a distinct value. Caveat: it can't use a plain B-tree index (the planner must evaluate the expression per row), so it's slower than `=` on indexed columns.

## NULL-Handling Functions

| Function | Behavior |
|---|---|
| `COALESCE(a, b, c, ...)` | Returns the first non-NULL argument; NULL if all are NULL. |
| `NULLIF(a, b)` | Returns NULL if `a = b`, else `a`. Idiom for avoiding divide-by-zero. |
| `GREATEST(a, b, ...)` / `LEAST(a, b, ...)` | Max/min, but return NULL if **any** argument is NULL (PostgreSQL behavior). |
| `a OR b` (with NULLs) | See truth table above. |

### `COALESCE`

::code-wrapper{language="sql"}
```sql
-- Provide a fallback for missing values
SELECT name, COALESCE(city, 'Unknown') AS city FROM customers;

-- Provide multiple fallbacks
SELECT COALESCE(preferred_name, full_name, email) AS display_name FROM users;

-- Default a sum to 0 (SUM of no rows is NULL)
SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE customer_id = 999;
```
::

### `NULLIF` — the divide-by-zero fix

::code-wrapper{language="sql"}
```sql
-- ❌ Division by zero if any total is 0
SELECT sales / total FROM metrics;

-- ✅ NULLIF turns 0 into NULL; division by NULL yields NULL (not an error)
SELECT sales / NULLIF(total, 0) AS ratio FROM metrics;

-- Then COALESCE the NULL result if you want 0 or some sentinel
SELECT COALESCE(sales / NULLIF(total, 0), 0) AS ratio FROM metrics;
``
::

## NULL in Aggregates

Aggregates **ignore NULL** (except `COUNT(*)`):

::code-wrapper{language="sql"}
```sql
-- AVG ignores NULLs: AVG of [10, 20, NULL] = 15, not 10
SELECT AVG(amount) FROM orders;

-- COUNT(*) counts rows; COUNT(col) counts non-NULL values
SELECT COUNT(*), COUNT(amount) FROM orders;

-- SUM of all-NULL is NULL, not 0
SELECT SUM(amount) FROM orders WHERE FALSE;   -- NULL
SELECT COALESCE(SUM(amount), 0) FROM orders WHERE FALSE;   -- 0
``
::

This is usually what you want (averaging non-missing values), but it's a trap if you expected NULL to count as 0. Use `AVG(COALESCE(amount, 0))` if NULL means "zero" — but ask whether that's semantically right first.

## NULL in ORDER BY

NULL sorts either first or last depending on the engine (see chapter 03). Use `NULLS FIRST`/`NULLS LAST` (PostgreSQL) or the `IS NULL` trick for portable control.

## NULL in Constraints

- `NOT NULL` — the column can't be NULL. The most important constraint; add it to every column unless you have a reason not to.
- `UNIQUE` — **allows multiple NULLs** in PostgreSQL and the SQL standard (NULLs aren't "equal," so they don't violate uniqueness). MySQL with `InnoDB` also allows multiple NULLs. SQL Server allows one NULL. Be aware of this divergence.
- `PRIMARY KEY` — implies `NOT NULL` and `UNIQUE`. A PK column can never be NULL.
- `FOREIGN KEY` — a NULL FK value is allowed and means "no reference" (it doesn't violate the FK constraint). This is how optional relationships are modeled.

## NULL in Boolean Contexts

::code-wrapper{language="sql"}
```sql
-- In WHERE, NULL is treated as "not true" (excluded)
WHERE col           -- keeps rows where col IS TRUE (NULL and FALSE excluded)
WHERE NOT col       -- keeps rows where col IS FALSE (NULL and TRUE excluded) — NULL is NOT excluded!
WHERE col = TRUE    -- keeps only TRUE
WHERE col IS TRUE   -- keeps only TRUE (clearer)
WHERE col IS FALSE  -- keeps only FALSE
WHERE col IS UNKNOWN -- keeps only NULL
```
::

`WHERE NOT col` excludes NULLs — because `NOT NULL` is `NULL` (UNKNOWN), which isn't TRUE. This is a subtle trap: "not true" in English feels like it should include NULL, but `NOT col` in SQL doesn't.

## NULL and Set Operations

Set operations (`UNION`, `INTERSECT`, `EXCEPT`) treat NULLs as **equal** for deduplication — `(1, NULL)` and `(1, NULL)` are considered duplicates, and `UNION` keeps one. This differs from `NULL = NULL` being UNKNOWN in `WHERE`. The set ops use "is not distinct from" semantics internally.

## NULL and Joins

A join `ON a.col = b.col` does **not** match rows where both `col`s are NULL — `NULL = NULL` is UNKNOWN, not TRUE. If you need NULL keys to match, use `IS NOT DISTINCT FROM` (slower, no index) or reconsider your schema (use a sentinel value, or split the table).

## NULL and NOT IN (the killer trap)

`x NOT IN (a, b, NULL)` is `x <> a AND x <> b AND x <> NULL` = `... AND UNKNOWN` = `UNKNOWN` for every `x`. The **entire query returns zero rows**. See chapter 06. Use `NOT EXISTS` or filter NULLs.

## 💡 Tips & Tricks

- **Idiom**: mark every column `NOT NULL` unless you have a *specific* reason to allow NULL — most "optional" columns have a natural default (0, '', false) that's safer than NULL. NULLs infect every comparison, aggregate, and join; the fewer the better.
- **Idiom**: use `NULLIF(x, 0)` everywhere you divide by a column that could be 0 — it converts the 0 to NULL, making the division yield NULL instead of throwing "division by zero." Wrap in `COALESCE(..., 0)` if you need a numeric result.
- **Idiom**: prefer `IS NOT DISTINCT FROM` over `=` when comparing nullable columns where NULL should match NULL — but be aware it's slower (no index). For indexed equality with NULLs, consider splitting the predicate: `WHERE (a = b OR (a IS NULL AND b IS NULL))`.
- **Debug**: when a query returns fewer rows than expected, audit every `<>`, `!=`, and `NOT IN` — these silently drop NULLs. Replace `<>` with `IS DISTINCT FROM` if NULL is a meaningful "other" value.
- **Portability**: `UNIQUE` constraint with NULLs is engine-dependent (standard: multiple NULLs allowed; SQL Server: one NULL). If you need "at most one non-NULL value per group" portably, use a partial unique index: `CREATE UNIQUE INDEX ON t(col) WHERE col IS NOT NULL` (PostgreSQL/SQLite).

## ⚠️ Edge Cases & Gotchas

- **`NULL = NULL` is UNKNOWN, not TRUE**: the #1 NULL gotcha. Never compare to NULL with `=`; use `IS NULL`.
- **`NOT (col = 5)` excludes NULLs**: `NOT (NULL = 5)` = `NOT UNKNOWN` = `UNKNOWN` ≠ TRUE. So `WHERE col <> 5` and `WHERE NOT (col = 5)` both drop NULL rows.
- **`COUNT(col)` ignores NULLs, `COUNT(*)` doesn't**: `COUNT(amount)` may be less than `COUNT(*)` if `amount` has NULLs. Pick deliberately.
- **`AVG` ignores NULLs, doesn't average them as 0**: `AVG([10, 20, NULL])` = 15. If NULL means 0, `AVG(COALESCE(amount, 0))` = 10.
- **`SUM` of all-NULL is NULL**: `SUM` over an empty or all-NULL set is NULL, not 0. `COALESCE(SUM(x), 0)` for 0.
- **`UNIQUE` allows multiple NULLs** (in most engines): a `UNIQUE` constraint on a nullable column permits many rows with NULL — NULLs aren't "equal." Use a partial index if you need "at most one NULL."
- **`GREATEST`/`LEAST` return NULL if any arg is NULL** (PostgreSQL): `GREATEST(5, NULL)` = NULL. Use `GREATEST(COALESCE(a, -1), COALESCE(b, -1))` or `MAX(a, b)` in a custom function if you want NULL ignored.
- **String concatenation with NULL**: `'hello' || NULL` = `NULL` (in PostgreSQL and standard SQL). The whole concatenation becomes NULL. Use `CONCAT(a, b)` (ignores NULLs) or `COALESCE(a, '') || COALESCE(b, '')`. MySQL's `||` is `OR` by default (not concat) unless `PIPES_AS_CONCAT` is set.
- **`boolean IS TRUE` vs `boolean = TRUE`**: both work, but `IS TRUE` treats NULL as "not true" cleanly (returns FALSE), while `NULL = TRUE` is UNKNOWN. Use `IS TRUE`/`IS FALSE`/`IS UNKNOWN` for boolean tests.
- **`NULL` in `CASE`**: `CASE WHEN NULL THEN ...` never matches (NULL is not TRUE). `CASE col WHEN NULL THEN ...` (simple form) also never matches (it compares `col = NULL`). Use `CASE WHEN col IS NULL THEN ...`.
- **`ORDER BY` with NULLs is engine-specific**: see chapter 03. Always specify `NULLS FIRST`/`LAST` if the order matters.

## 🧠 Spot the Bug

This query is supposed to find customers whose city is "not NYC" — including those whose city is unknown (NULL). It returns far fewer rows than expected. What's wrong, and how do you fix it portably?

::code-wrapper{language="sql"}
```sql
SELECT name FROM customers WHERE city <> 'NYC';
``
::

<details>
<summary>Answer</summary>

`city <> 'NYC'` is `UNKNOWN` when `city` is `NULL` (any comparison with NULL yields UNKNOWN). `WHERE` keeps only `TRUE`, so NULL-city rows are excluded — they're not "not NYC," they're "unknown." The query silently drops everyone with an unknown city.

Two fixes, depending on intent:

```sql
-- If "not NYC" includes unknown cities (NULL is a distinct "other"):
SELECT name FROM customers WHERE city IS DISTINCT FROM 'NYC';
-- or
SELECT name FROM customers WHERE city <> 'NYC' OR city IS NULL;

-- If "not NYC" means "known to be a city other than NYC" (NULLs excluded):
SELECT name FROM customers WHERE city <> 'NYC';
```
::
`IS DISTINCT FROM` is the NULL-safe "not equal" — it treats NULL and NULL as *not* distinct (so `NULL IS DISTINCT FROM NULL` = FALSE), and NULL and `'NYC'` as distinct (TRUE). It's the cleanest expression of "different from X, counting NULL as a real value." Its only downside is that it can't use a plain B-tree index, so on large tables the `OR city IS NULL` form (which can use an index on `city` plus a scan for NULLs) may be faster.

**The lesson**: `<>` and `!=` silently drop NULLs. If NULL is a meaningful category in your data (not just "missing"), use `IS DISTINCT FROM` or explicitly handle `IS NULL`.

</details>

## Summary

You now understand SQL's type system (when to use `numeric` vs float, `text` vs `varchar`), the three-valued logic of NULL, the `IS NULL` / `IS NOT DISTINCT FROM` / `COALESCE` / `NULLIF` toolkit, and the dozen ways NULL silently breaks queries. Next: defining tables and schema with DDL.