# 10 — Data Types & NULL Handling

SQL has rich types and a strict — but surprising — treatment of NULL. NULL is the single biggest source of bugs in SQL. This chapter covers the type system and the three-valued logic that NULL introduces.

## Core Data Types — PostgreSQL Reference

| Category | PostgreSQL types | Storage | Notes |
|---|---|---|---|
| **Integer** | `smallint` (2B), `integer`/`int` (4B), `bigint` (8B) | 2/4/8 bytes | Exact. `int` range: −2,147,483,648 to +2,147,483,647. `bigint` for PKs expecting > 2B rows. |
| **Decimal** | `numeric(p, s)`, `decimal(p, s)` | variable | Exact, arbitrary precision. `p` = precision (total digits), `s` = scale (digits after decimal). |
| **Floating** | `real` (4B), `double precision` (8B) | 4/8 bytes | Inexact, IEEE 754. **Never use for money.** |
| **Text** | `text` (variable, unlimited), `varchar(n)` (variable, max n), `char(n)` (fixed n, space-padded) | variable | `text` and `varchar` are identical in performance in PostgreSQL. `varchar(n)` is a length constraint, not a perf win. |
| **Boolean** | `boolean` | 1 byte | `TRUE`/`FALSE`/`NULL`. |
| **Date/Time** | `date` (4B), `time` (8B), `timestamp` (8B), `timestamptz` (8B), `interval` (16B) | 4-16 bytes | `timestamptz` stores as UTC, displays in session zone. Always prefer `timestamptz` over `timestamp` for application timestamps. |
| **Binary** | `bytea` | variable | Variable-length binary. |
| **UUID** | `uuid` | 16 bytes | 128-bit. Generate with `gen_random_uuid()` (PG 13+). |
| **JSON** | `json` (text), `jsonb` (binary) | variable | `jsonb` is binary, indexable, deduplicated. Prefer `jsonb` unless you need to preserve input key order. |
| **Array** | `int[]`, `text[]`, etc. | variable | PostgreSQL-specific. Useful for small fixed-size lists; use a separate table for large/queried collections. |
| **Enumerated** | `enum` | 4 bytes | Static set of labels. Immutable (can't remove values without a cast dance). |
| **Bit** | `bit(n)`, `bit varying(n)` | variable | Bit strings. Rare. |
| **Money** | `money` | 8 bytes | Don't use — it's a locale-dependent wrapper around `numeric`. Use `numeric(p, 2)`. |

## numeric vs float — Precision Matters

`numeric` is **exact** — `0.1 + 0.2 = 0.3`, always. Floating-point (`real`/`double precision`) is inexact — IEEE 754 can't represent 0.1 exactly.

::code-wrapper{language="sql"}
```sql
-- numeric: exact arithmetic. 0.1 + 0.2 = 0.3 (stored as decimal digits, not binary float).
SELECT 0.1::numeric + 0.2::numeric;          -- 0.3

-- float: inexact. 0.1 in binary is a repeating fraction → rounded → accumulation error.
SELECT 0.1::float + 0.2::float;              -- 0.30000000000000004

-- The classic float trap: money calculations drift over many additions.
-- Over 1 million additions of $0.10, float drifts by cents; numeric stays exact.
SELECT sum_amount::float AS float_sum,       -- drifts: e.g., 100000.00000001
       sum_amount::numeric AS numeric_sum    -- exact:   100000.00
FROM (SELECT SUM(0.10::numeric) AS sum_amount FROM generate_series(1, 1000000)) t;
```
::

Use `numeric` for money, scientific computations needing exact decimals, and anything where rounding errors are unacceptable. Use floats for approximate scientific work and when storage/speed matter more than exactness.

## varchar(n) vs text vs char(n)

::code-wrapper{language="sql"}
```sql
-- In PostgreSQL, text and varchar (no limit) are IDENTICAL in performance and storage.
-- Both use variable-length storage. varchar(n) is just a CHECK (length(col) <= n) constraint.
-- Use text by default; use varchar(n) only for real business-rule length limits.

-- char(n) pads with spaces to width n. This causes subtle comparison bugs:
-- 'NY' stored as char(3) becomes 'NY ' (padded).
-- Depending on collation, 'NY' = 'NY ' may be TRUE (trailing spaces ignored) or FALSE.
-- Avoid char(n) except for truly fixed-width codes (ISO country codes = char(2)).
SELECT 'NY'::char(3) = 'NY';                  -- TRUE in PG (trailing spaces trimmed in comparison)
SELECT 'NY'::varchar = 'NY ';                 -- FALSE (varchar does not trim)
```
::

| Type | Padding | Performance | Use case |
|---|---|---|---|
| `text` | No | Same as varchar | Default for all variable-length strings |
| `varchar(n)` | No | Same as text | When a business-rule length limit is needed |
| `varchar` (no n) | No | Same as text | Identical to `text` — use `text` instead |
| `char(n)` | Yes (space-padded) | Same (padding is overhead) | Fixed-width codes only (e.g., `char(2)` for ISO country codes) |

## NULL — Three-Valued Logic (3VL)

`NULL` means "unknown" or "not applicable" — it is **not** the same as `0`, `''` (empty string), or `FALSE`. SQL uses **three-valued logic**: every comparison evaluates to `TRUE`, `FALSE`, or `UNKNOWN` (also called `NULL`).

### Truth Tables

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

**Key insight**: `FALSE AND UNKNOWN = FALSE` (one false makes AND false regardless of the unknown), but `TRUE AND UNKNOWN = UNKNOWN` (the unknown could still be false). Symmetrically, `TRUE OR UNKNOWN = TRUE`, but `FALSE OR UNKNOWN = UNKNOWN`.

### WHERE Keeps Only TRUE

`WHERE` retains rows where the condition is **TRUE**. Rows where it's `FALSE` *or* `UNKNOWN` are discarded. This is why `WHERE col = NULL` returns nothing — `col = NULL` is `UNKNOWN`, and `UNKNOWN` is not `TRUE`.

::code-wrapper{language="sql"}
```sql
-- NULL comparisons — ALL of these evaluate to UNKNOWN, never TRUE or FALSE.
NULL  = NULL    -- UNKNOWN (not TRUE! two NULLs are not "equal")
NULL <> NULL    -- UNKNOWN (not TRUE! can't confirm they're different)
NULL  = 5       -- UNKNOWN
NULL <> 5       -- UNKNOWN
NULL  > 5       -- UNKNOWN
NULL  < 5       -- UNKNOWN

-- WHERE keeps only TRUE → WHERE col = NULL returns ZERO rows (UNKNOWN is not TRUE).
SELECT * FROM customers WHERE city = NULL;    -- ❌ returns nothing, always
SELECT * FROM customers WHERE city IS NULL;   -- ✅ correct NULL test
```
::

## NULL-Safe Equality: IS NOT DISTINCT FROM

`IS NOT DISTINCT FROM` treats NULLs as equal to NULL (the "null-safe `=`"). `IS DISTINCT FROM` is the "null-safe `<>`":

::code-wrapper{language="sql"}
```sql
-- IS NOT DISTINCT FROM: NULL-safe equality (NULL = NULL → TRUE)
NULL IS NOT DISTINCT FROM NULL   -- TRUE   (unlike NULL = NULL which is UNKNOWN)
NULL IS DISTINCT FROM NULL       -- FALSE
5   IS NOT DISTINCT FROM 5       -- TRUE
5   IS DISTINCT FROM 6           -- TRUE
NULL IS DISTINCT FROM 5          -- TRUE   (NULL is distinct from any non-NULL)

-- Practical use: join on nullable columns where NULL should match NULL.
-- Caveat: can't use a plain B-tree index → slower than = on indexed columns.
SELECT * FROM a JOIN b ON a.key IS NOT DISTINCT FROM b.key;
```
::

## NULL-Handling Functions

| Function | Behavior |
|---|---|
| `COALESCE(a, b, c, ...)` | Returns the first non-NULL argument; NULL if all are NULL. |
| `NULLIF(a, b)` | Returns NULL if `a = b`, else `a`. Idiom for avoiding divide-by-zero. |
| `GREATEST(a, b, ...)` / `LEAST(a, b, ...)` | Max/min, but return NULL if **any** argument is NULL (PostgreSQL). |

### COALESCE — Fallback Chain

::code-wrapper{language="sql"}
```sql
-- Provide a fallback for missing values.
SELECT name, COALESCE(city, 'Unknown') AS city FROM customers;

-- Multiple fallbacks: try preferred_name, then full_name, then email, then 'Anonymous'.
SELECT COALESCE(preferred_name, full_name, email, 'Anonymous') AS display_name
FROM users;

-- Default a SUM to 0 (SUM of no rows is NULL, not 0).
-- Without COALESCE, a customer with no orders shows NULL instead of 0.
SELECT COALESCE(SUM(amount), 0) AS total
FROM orders
WHERE customer_id = 999;                     -- no rows match → SUM = NULL → COALESCE → 0
```
::

### NULLIF — The Divide-by-Zero Fix

::code-wrapper{language="sql"}
```sql
-- ❌ Division by zero error if any total is 0.
SELECT sales / total FROM metrics;

-- ✅ NULLIF turns 0 into NULL; division by NULL yields NULL (not an error).
SELECT sales / NULLIF(total, 0) AS ratio FROM metrics;

-- Then COALESCE the NULL result if you want 0 or some sentinel.
SELECT COALESCE(sales / NULLIF(total, 0), 0) AS ratio FROM metrics;

-- NULLIF is also useful for normalizing sentinel values to NULL.
SELECT NULLIF(status, '') AS status FROM logs;        -- empty string → NULL
SELECT NULLIF(status, 'unknown') AS status FROM logs; -- 'unknown' → NULL
```
::

## NULL in Aggregates

Aggregates **ignore NULL** (except `COUNT(*)`):

::code-wrapper{language="sql"}
```sql
-- AVG ignores NULLs: AVG of [10, 20, NULL] = 15 (avg of 10 and 20), NOT 10 (avg of 10, 20, 0).
SELECT AVG(amount) FROM orders;

-- COUNT(*) counts ALL rows (including NULL rows). COUNT(col) counts non-NULL values only.
-- If amount has NULLs, COUNT(amount) < COUNT(*).
SELECT COUNT(*) AS total_rows, COUNT(amount) AS non_null_amounts FROM orders;

-- SUM of all-NULL (or empty set) is NULL, not 0. Use COALESCE for 0.
SELECT SUM(amount) FROM orders WHERE FALSE;              -- NULL
SELECT COALESCE(SUM(amount), 0) FROM orders WHERE FALSE; -- 0

-- If NULL means "zero" (not "missing"), average them as 0:
SELECT AVG(COALESCE(amount, 0)) FROM orders;  -- AVG of [10, 20, 0] = 10, not 15
-- But ask: is NULL really 0, or is it "unknown"? Semantically different.
```
::

## NULL in String Concatenation

::code-wrapper{language="sql"}
```sql
-- String concatenation with || : any NULL operand → entire result is NULL.
SELECT 'Hello ' || NULL;           -- NULL (the whole string becomes NULL)
SELECT 'Hello ' || name || '!' FROM customers;  -- NULL if name is NULL

-- Fix 1: COALESCE each operand to empty string.
SELECT 'Hello ' || COALESCE(name, '') || '!' FROM customers;

-- Fix 2: CONCAT() ignores NULLs (PostgreSQL, MySQL).
SELECT CONCAT('Hello ', name, '!') FROM customers;  -- NULLs skipped, not propagated

-- Fix 3: CONCAT_WS (with separator) — skips NULLs but keeps separators between non-NULLs.
SELECT CONCAT_WS(' ', first_name, middle_name, last_name) FROM customers;
-- 'John Q Public' or 'John Public' (middle_name NULL → separator not doubled)
```
::

## NULL in Boolean Contexts

::code-wrapper{language="sql"}
```sql
-- In WHERE, NULL is treated as "not true" (excluded).
WHERE col           -- keeps rows where col IS TRUE (NULL and FALSE excluded)
WHERE NOT col       -- keeps rows where col IS FALSE (NULL and TRUE excluded) — NULL is NOT excluded!
WHERE col = TRUE    -- keeps only TRUE (NULL → UNKNOWN → excluded)
WHERE col IS TRUE   -- keeps only TRUE (clearer, explicit)
WHERE col IS FALSE  -- keeps only FALSE
WHERE col IS UNKNOWN -- keeps only NULL (the only test that finds NULL booleans)

-- The subtle trap: WHERE NOT col EXCLUDES NULLs.
-- NOT NULL = UNKNOWN (not TRUE). So 'WHERE NOT active' drops rows where active IS NULL.
-- English "not active" feels like it should include NULL — SQL doesn't agree.
```
::

## NULL in Constraints

- **`NOT NULL`** — the column can't be NULL. The most important constraint; add it to every column unless you have a reason not to.
- **`UNIQUE`** — **allows multiple NULLs** in PostgreSQL and the SQL standard (NULLs aren't "equal," so they don't violate uniqueness). SQL Server allows only one NULL. Be aware of this divergence.
- **`PRIMARY KEY`** — implies `NOT NULL` and `UNIQUE`. A PK column can never be NULL.
- **`FOREIGN KEY`** — a NULL FK value is allowed and means "no reference" (doesn't violate the FK constraint). This is how optional relationships are modeled.

::code-wrapper{language="sql"}
```sql
-- Partial unique index: "at most one non-NULL value per group" (portable across engines).
-- UNIQUE constraint allows multiple NULLs; this index enforces uniqueness only on non-NULL rows.
CREATE UNIQUE INDEX idx_users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```
::

## NULL and Set Operations

Set operations (`UNION`, `INTERSECT`, `EXCEPT`) treat NULLs as **equal** for deduplication — `(1, NULL)` and `(1, NULL)` are considered duplicates, and `UNION` keeps one. This differs from `NULL = NULL` being UNKNOWN in `WHERE`. Set ops use "is not distinct from" semantics internally.

## NULL and Joins

A join `ON a.col = b.col` does **not** match rows where both `col`s are NULL — `NULL = NULL` is UNKNOWN, not TRUE. If you need NULL keys to match, use `IS NOT DISTINCT FROM` (slower, no index) or reconsider your schema (use a sentinel value, or split the table).

## NULL and NOT IN — The Killer Trap

`x NOT IN (a, b, NULL)` is `x <> a AND x <> b AND x <> NULL` = `... AND UNKNOWN` = `UNKNOWN` for every `x`. The **entire query returns zero rows**. See chapter 06. Use `NOT EXISTS` or filter NULLs.

## Complex Implementation: Production Schema with Annotated Type Choices

::code-wrapper{language="sql"}
```sql
-- Production e-commerce schema with type choices annotated with reasoning.
-- Every type is chosen deliberately; every NULL is chosen deliberately.

-- Create the enum type (must be done before the table if used in a column).
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'returned', 'cancelled');

CREATE TABLE customers (
  -- bigint for PK: 8 bytes, supports > 2B rows. int (4B) would overflow at 2.1B.
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- text for names: no business-rule length limit, variable-length storage.
  -- varchar(255) would be an arbitrary limit with no perf benefit in PostgreSQL.
  name        text        NOT NULL,

  -- citext (case-insensitive text) for email: queries and unique constraint
  -- are case-insensitive without LOWER() in every query. Requires citext extension.
  email       citext      NOT NULL UNIQUE,

  -- numeric(10,2) for account_balance: exact decimal, 10 total digits, 2 after decimal.
  -- Max value: $99,999,999.99. Never use float for money (0.1+0.2 ≠ 0.3 in float).
  account_balance numeric(10,2) NOT NULL DEFAULT 0,

  -- boolean for flags: 1 byte, clear semantics. NOT NULL with default.
  is_active   boolean     NOT NULL DEFAULT true,

  -- timestamptz for timestamps: stored as UTC, displayed in session timezone.
  -- Never use plain 'timestamp' (without tz) for app timestamps — timezone bugs.
  created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- jsonb for flexible metadata: binary, indexable, deduplicated keys.
  -- Use for semi-structured data that doesn't warrant its own table.
  metadata    jsonb
);

CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- bigint FK: must match the PK type exactly (bigint → bigint).
  customer_id bigint      NOT NULL REFERENCES customers(id),

  -- numeric(12,2) for amount: 12 total digits, 2 after decimal.
  -- Max: $9,999,999,999.99. Exact decimal for financial accuracy.
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),

  -- enum for status: small fixed set of labels, 4 bytes, type-safe.
  -- Can't add values without ALTER TYPE (and can't remove values at all).
  status      order_status NOT NULL DEFAULT 'pending',

  -- uuid for external-facing IDs: 16 bytes, globally unique, no sequential leak.
  -- Generated by the application or gen_random_uuid() (PG 13+).
  external_ref uuid       UNIQUE,

  -- timestamp with tz for the order date.
  ordered_on  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- text[] array for tags: small, fixed-size list of labels.
  -- For large or frequently-queried collections, use a separate tags table + join table.
  tags        text[]      NOT NULL DEFAULT '{}'
);

-- Index on (customer_id, ordered_on DESC) for "recent orders per customer" queries.
CREATE INDEX idx_orders_customer_date ON orders (customer_id, ordered_on DESC);
```
::

## Anti-Pattern: Using float for Money

### ❌ Wrong Way

::code-wrapper{language="sql"}
```sql
-- float for money: 0.1 + 0.2 ≠ 0.3 in IEEE 754 binary floating-point.
-- Over millions of transactions, cents drift. Financial reports don't tie out.
CREATE TABLE bad_orders (
  id     int PRIMARY KEY,
  amount double precision NOT NULL  -- ❌ float: 0.1 + 0.2 = 0.30000000000000004
);

-- The drift is invisible at first, then catastrophic:
SELECT 0.10::float + 0.20::float;           -- 0.30000000000000004
SELECT (0.10::float + 0.20::float) = 0.30::float;  -- FALSE (they're not equal!)
```
::

### ✅ Right Way

::code-wrapper{language="sql"}
```sql
-- numeric for money: exact decimal arithmetic. 0.1 + 0.2 = 0.3, always.
-- numeric(p, s): p = total digits, s = digits after decimal point.
CREATE TABLE good_orders (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0)  -- ✅ exact, max $9,999,999,999.99
);

SELECT 0.10::numeric + 0.20::numeric;        -- 0.30 (exact)
SELECT (0.10::numeric + 0.20::numeric) = 0.30::numeric;  -- TRUE
```
::

## Anti-Pattern: char(n) for Variable-Length Strings

### ❌ Wrong Way

::code-wrapper{language="sql"}
```sql
-- char(50) for names: pads with spaces to 50 chars. Wastes storage, causes comparison bugs.
-- 'Alice' stored as 'Alice' + 45 spaces. 'Alice' = 'Alice     ' may be TRUE or FALSE
-- depending on collation and whether trailing spaces are trimmed.
CREATE TABLE bad_customers (
  id   int PRIMARY KEY,
  name char(50) NOT NULL  -- ❌ padded, comparison surprises
);

SELECT 'Alice'::char(50) = 'Alice';          -- TRUE in PG (trailing spaces trimmed in char comparison)
SELECT 'Alice'::char(50) = 'Alice   ';       -- TRUE in PG (both sides trimmed)
-- But in other engines or with certain collations, this may be FALSE.
```
::

### ✅ Right Way

::code-wrapper{language="sql"}
```sql
-- text for variable-length strings: no padding, no comparison surprises, same performance.
-- Use varchar(n) only if there's a real business-rule length limit.
CREATE TABLE good_customers (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL  -- ✅ variable-length, no padding, exact comparison
);

SELECT 'Alice'::text = 'Alice';              -- TRUE
SELECT 'Alice'::text = 'Alice   ';           -- FALSE (trailing spaces are significant in text)
```
::

## Type Coercion and Casting Rules

::code-wrapper{language="sql"}
```sql
-- Explicit casting with :: (PostgreSQL-specific, concise).
SELECT '2024-01-15'::date;
SELECT 42::text;
SELECT '123.45'::numeric(10,2);

-- Standard SQL CAST (portable to all engines).
SELECT CAST('2024-01-15' AS date);
SELECT CAST(42 AS text);

-- Implicit coercion: PostgreSQL coerces in some contexts, but not all.
SELECT 1 + 1.0;           -- int + numeric → numeric (implicit upcast)
SELECT '5'::text + 3;     -- ERROR: text + int is not valid (no implicit text→int)

-- generate_series for testing: produce a range of values for testing queries.
SELECT * FROM generate_series(1, 10);                    -- 1..10
SELECT * FROM generate_series('2024-01-01'::date, '2024-01-07'::date, '1 day');  -- 7 dates
```
::

## 💡 Tips & Tricks

- **Idiom** — mark every column `NOT NULL` unless you have a *specific* reason to allow NULL. Most "optional" columns have a natural default (0, '', false) that's safer than NULL. NULLs infect every comparison, aggregate, and join; the fewer the better.
- **Idiom** — use `NULLIF(x, 0)` everywhere you divide by a column that could be 0. It converts the 0 to NULL, making the division yield NULL instead of throwing "division by zero." Wrap in `COALESCE(..., 0)` if you need a numeric result.
- **Idiom** — prefer `IS NOT DISTINCT FROM` over `=` when comparing nullable columns where NULL should match NULL. But be aware it's slower (no index). For indexed equality with NULLs, split the predicate: `WHERE (a = b OR (a IS NULL AND b IS NULL))`.
- **Idiom** — use `NUMERIC(p, 2)` for money. Never use `float`, `real`, or `double precision` for financial values. The `money` type is locale-dependent — avoid it too.
- **Idiom** — use `CONCAT()` or `CONCAT_WS()` for string concatenation with NULLs. `||` propagates NULL (one NULL operand → NULL result); `CONCAT` ignores NULLs.
- **Debug** — when a query returns fewer rows than expected, audit every `<>`, `!=`, and `NOT IN` — these silently drop NULLs. Replace `<>` with `IS DISTINCT FROM` if NULL is a meaningful "other" value.
- **Idiom** — use `generate_series` for testing: generate synthetic rows to test queries, fill date gaps for time-series, or create fixture data. `SELECT * FROM generate_series(1, 1000000)` gives you a million-row test table instantly.
- **Portability** — `UNIQUE` constraint with NULLs is engine-dependent (standard: multiple NULLs allowed; SQL Server: one NULL). If you need "at most one non-NULL value per group" portably, use a partial unique index: `CREATE UNIQUE INDEX ON t(col) WHERE col IS NOT NULL`.

## ⚠️ Edge Cases & Gotchas

- **`NULL = NULL` is UNKNOWN, not TRUE** — the #1 NULL gotcha. Never compare to NULL with `=`; use `IS NULL`.
- **`NOT (col = 5)` excludes NULLs** — `NOT (NULL = 5)` = `NOT UNKNOWN` = `UNKNOWN` ≠ TRUE. So `WHERE col <> 5` and `WHERE NOT (col = 5)` both drop NULL rows.
- **`COUNT(col)` ignores NULLs, `COUNT(*)` doesn't** — `COUNT(amount)` may be less than `COUNT(*)` if `amount` has NULLs. Pick deliberately.
- **`AVG` ignores NULLs, doesn't average them as 0** — `AVG([10, 20, NULL])` = 15. If NULL means 0, `AVG(COALESCE(amount, 0))` = 10.
- **`SUM` of all-NULL is NULL** — `SUM` over an empty or all-NULL set is NULL, not 0. `COALESCE(SUM(x), 0)` for 0.
- **String concatenation with NULL** — `'hello' || NULL` = `NULL` (the whole string becomes NULL). Use `CONCAT(a, b)` (ignores NULLs) or `COALESCE(a, '') || COALESCE(b, '')`. MySQL's `||` is `OR` by default (not concat) unless `PIPES_AS_CONCAT` is set.
- **NULL in boolean logic** — `WHERE NOT col` excludes NULLs because `NOT NULL` = `UNKNOWN`, which isn't TRUE. Use `WHERE col IS NOT TRUE` if you want FALSE + NULL.
- **`UNIQUE` allows multiple NULLs** (in most engines) — a `UNIQUE` constraint on a nullable column permits many rows with NULL. Use a partial index if you need "at most one NULL."
- **`GREATEST`/`LEAST` return NULL if any arg is NULL** (PostgreSQL) — `GREATEST(5, NULL)` = NULL. Use `GREATEST(COALESCE(a, -1), COALESCE(b, -1))` or restructure.
- **Float precision issues** — `0.1::float + 0.2::float ≠ 0.3::float`. Never use float for money or exact decimal arithmetic. Use `numeric`.
- **`varchar` vs `text` equivalence in PG** — identical in performance and storage. `varchar(n)` is just a length constraint. Use `text` by default.
- **`char(n)` padding bugs** — `char(n)` pads with spaces, causing comparison surprises across engines and collations. Avoid except for truly fixed-width codes.
- **Enum immutability** — you can `ALTER TYPE ... ADD VALUE` but can't remove values. If the value set might change, use a lookup table + FK instead of an enum.
- **Array vs separate table** — `text[]` is fine for small, rarely-queried lists. For large collections or ones you need to filter/join on, use a separate table — arrays can't be indexed for individual element queries efficiently (except GIN indexes).
- **Numeric scale overflow** — `numeric(10, 2)` can store up to $99,999,999.99. Inserting $100,000,000.00 overflows. Choose precision with headroom for growth.
- **`NULL` in `CASE`** — `CASE WHEN NULL THEN ...` never matches (NULL is not TRUE). `CASE col WHEN NULL THEN ...` (simple form) also never matches (it compares `col = NULL`). Use `CASE WHEN col IS NULL THEN ...`.
- **`ORDER BY` with NULLs is engine-specific** — PostgreSQL defaults to `NULLS LAST` for ASC, `NULLS FIRST` for DESC. Always specify `NULLS FIRST`/`NULLS LAST` if the order matters.

## 🧠 Spot the Bug

This query builds a customer display name by concatenating title, first name, and last name. For some customers, `display_name` is NULL even though all three columns have values. Why?

::code-wrapper{language="sql"}
```sql
SELECT
  title || ' ' || first_name || ' ' || last_name AS display_name
FROM customers;
```
::

<details>
<summary>Answer</summary>

The `||` operator propagates NULL: if **any** operand is NULL, the entire concatenation result is NULL. So if `title` is NULL (e.g., a customer with no title like "Mr"/"Ms"), the whole expression becomes NULL — even though `first_name` and `last_name` have values. The display name vanishes silently.

The fix — use `CONCAT()` (ignores NULLs) or `COALESCE` each operand:

::code-wrapper{language="sql"}
```sql
-- Option 1: CONCAT ignores NULLs (PostgreSQL, MySQL).
SELECT CONCAT(title, ' ', first_name, ' ', last_name) AS display_name
FROM customers;
-- 'John Smith' (title NULL → skipped, but extra spaces may appear: ' John Smith ')

-- Option 2: CONCAT_WS (with separator) — cleaner, no double spaces from NULLs.
SELECT CONCAT_WS(' ', title, first_name, last_name) AS display_name
FROM customers;
-- 'John Smith' (NULL title → separator not emitted → no leading space)

-- Option 3: COALESCE each operand to empty string (works with ||).
SELECT COALESCE(title, '') || ' ' || first_name || ' ' || last_name AS display_name
FROM customers;
-- ' John Smith' (leading space from the title being '' — may need trimming)
```
::

`CONCAT_WS` is the cleanest — it handles NULLs gracefully and doesn't emit separators for NULL values, avoiding the double-space problem.

**The lesson**: `||` propagates NULL — one NULL operand makes the entire result NULL. Use `CONCAT` or `CONCAT_WS` for NULL-safe string concatenation.

</details>

## Summary

You now understand SQL's type system (`numeric` vs float, `text` vs `varchar` vs `char`, `timestamptz` vs `timestamp`, `jsonb` vs `json`), the three-valued logic of NULL, the `IS NULL` / `IS NOT DISTINCT FROM` / `COALESCE` / `NULLIF` toolkit, and the dozen ways NULL silently breaks queries. Next: defining tables and schema with DDL.