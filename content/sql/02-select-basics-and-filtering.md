# 02 — SELECT Basics & Filtering

## The SELECT Statement

`SELECT` is the workhorse of SQL. Its core form:

::code-wrapper{language="sql"}
```sql
SELECT column1, column2, ...
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
-- All columns
SELECT * FROM customers;

-- Specific columns (prefer this — explicit, faster, stable)
SELECT name, city FROM customers;

-- Expressions
SELECT name, length(name) AS name_len FROM customers;

-- Constants and computations
SELECT name, 'US' AS country, 2024 - 2000 AS age_estimate FROM customers;
```
::

### `*` vs explicit columns

`SELECT *` is fine for exploration but an anti-pattern in production code:

- It returns columns you may not need, wasting I/O and network bandwidth.
- If the table schema changes (a column is added), `SELECT *` silently returns the new column, which can break applications expecting a fixed shape.
- It prevents the planner from using covering indexes (indexes that include all needed columns).

Always list columns explicitly in application queries.

## Aliasing Columns

::code-wrapper{language="sql"}
```sql
-- AS is optional but improves readability
SELECT amount * 1.08 AS total_with_tax
FROM orders;

-- Without AS (works, but less clear)
SELECT amount * 1.08 total_with_tax
FROM orders;

-- Quoted alias when it contains spaces or reserved words
SELECT amount * 1.08 AS "Total With Tax"
FROM orders;
```
::

Aliases are purely display labels — they don't change data. They're visible in `ORDER BY` and `LIMIT` (clauses after `SELECT`) but **not** in `WHERE` or `GROUP BY` (clauses before `SELECT`). See chapter 01's evaluation order.

## DISTINCT

`DISTINCT` removes duplicate rows from the result:

::code-wrapper{language="sql"}
```sql
-- Unique cities
SELECT DISTINCT city FROM customers;

-- Distinct combinations of multiple columns
SELECT DISTINCT city, name FROM customers;
```
::

`DISTINCT` applies to the *entire row*, not individual columns. `SELECT DISTINCT city, name` returns unique (city, name) pairs, not unique cities and unique names separately.

### `DISTINCT ON` (PostgreSQL-specific)

PostgreSQL has a powerful extension: `DISTINCT ON` keeps the first row of each group per a sort order:

::code-wrapper{language="sql"}
```sql
-- The largest order per customer
SELECT DISTINCT ON (customer_id)
  customer_id, id, amount
FROM orders
ORDER BY customer_id, amount DESC;
```
::

The `ORDER BY` must start with the `DISTINCT ON` columns. This is a concise alternative to window functions (chapter 09) for "greatest-N-per-group" queries.

## WHERE — Filtering Rows

`WHERE` keeps rows where the condition is true. Conditions use comparison and logical operators.

### Comparison Operators

| Operator | Meaning |
|---|---|
| `=` | Equal (note: single `=`, not `==`). |
| `<>` or `!=` | Not equal. `<>` is standard; `!=` is widely supported. |
| `<`, `<=`, `>`, `>=` | Ordering comparisons. |
| `BETWEEN x AND y` | Inclusive range: `>= x AND <= y`. |
| `NOT BETWEEN x AND y` | Outside the range. |
| `IN (a, b, c)` | Equal to any of the listed values. |
| `NOT IN (a, b, c)` | Not equal to any of the listed values. |
| `LIKE` | Pattern match with `%` (any chars) and `_` (one char). |
| `ILIKE` (PostgreSQL) | Case-insensitive `LIKE`. |
| `IS NULL` / `IS NOT NULL` | NULL tests (see chapter 10). |
| `IS [NOT] DISTINCT FROM` | NULL-safe equality (treats NULL = NULL as true). |

::code-wrapper{language="sql"}
```sql
SELECT name, city FROM customers WHERE city = 'NYC';
SELECT name FROM customers WHERE name <> 'Alice';
SELECT * FROM orders WHERE amount >= 100;
SELECT * FROM orders WHERE amount BETWEEN 10 AND 100;
SELECT * FROM orders WHERE customer_id IN (1, 3);
SELECT * FROM customers WHERE name LIKE 'A%';       -- starts with A
SELECT * FROM customers WHERE name LIKE '_a%';      -- second char is 'a'
SELECT * FROM customers WHERE city IS NULL;
```
::

### Logical Operators

| Operator | Meaning |
|---|---|
| `AND` | Both conditions true. |
| `OR` | Either condition true. |
| `NOT` | Negates a condition. |

`AND` binds tighter than `OR`, so `A OR B AND C` is `A OR (B AND C)`. Always use parentheses for clarity:

::code-wrapper{language="sql"}
```sql
-- Unclear precedence — depends on remembering AND > OR
SELECT * FROM orders
WHERE customer_id = 1 OR customer_id = 2 AND amount > 100;

-- Explicit — the intent is obvious
SELECT * FROM orders
WHERE customer_id = 1 OR (customer_id = 2 AND amount > 100);

-- Different intent
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

`%` and `_` are wildcards. To match a literal `%` or `_`, use `ESCAPE`:

::code-wrapper{language="sql"}
```sql
-- Find names containing a literal underscore (e.g., user_name)
SELECT * FROM users WHERE name LIKE '%\_%' ESCAPE '\';
```
::

**Gotcha**: leading wildcards (`'%foo'`, `'%foo%'`) defeat B-tree indexes — the database must scan every row. For substring search at scale, use full-text search (chapter 20) or trigram indexes (`pg_trgm`).

## IN and Subqueries

`IN` accepts a subquery, not just a literal list:

::code-wrapper{language="sql"}
```sql
-- Customers who have placed an order
SELECT * FROM customers
WHERE id IN (SELECT customer_id FROM orders);
```
::

This is a "semi-join." See chapter 06 for subquery semantics and the `EXISTS` alternative (which is often faster and handles NULLs more predictably).

## NULL: Three-Valued Logic (preview)

`NULL` is not a value — it's the absence of one. Comparisons with `NULL` produce `UNKNOWN` (not `TRUE`, not `FALSE`):

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers WHERE city = NULL;     -- ❌ returns nothing — always UNKNOWN
SELECT * FROM customers WHERE city IS NULL;    -- ✅ correct NULL test
SELECT * FROM customers WHERE city != 'NYC';   -- ❌ excludes NULLs too! NULL != 'NYC' is UNKNOWN
```
::

Chapter 10 covers NULL deeply. The key takeaway for now: **always use `IS NULL` / `IS NOT NULL`**, and remember that `!=` and `NOT IN` silently exclude NULLs.

## Filtering on Computed Columns

You can't use a `SELECT` alias in `WHERE` (it doesn't exist yet — see evaluation order). Repeat the expression:

::code-wrapper{language="sql"}
```sql
-- ❌ ERROR
SELECT amount * 1.08 AS taxed FROM orders WHERE taxed > 100;

-- ✅ Repeat the expression
SELECT amount * 1.08 AS taxed FROM orders WHERE amount * 1.08 > 100;
```
::

For complex expressions repeated often, use a CTE (chapter 07) or a computed/generated column (chapter 11).

## Combining Conditions — Realistic Example

::code-wrapper{language="sql"}
```sql
SELECT name, city
FROM customers
WHERE (city = 'NYC' OR city = 'LA')
  AND name LIKE 'A%'
  AND id NOT IN (SELECT customer_id FROM orders WHERE amount > 500);
```
::

## 💡 Tips & Tricks

- **Idiom**: use `IN (...)` for a fixed list of values, but switch to `= ANY(ARRAY[...])` in PostgreSQL when the list is large or comes from a parameter — `IN` with thousands of values can hit parser limits.
- **Performance**: `EXISTS (SELECT 1 FROM ... WHERE ...)` is usually faster than `IN (SELECT ...)` for subqueries over large sets, because `EXISTS` short-circuits on the first match while `IN` may materialize the full list. The difference is most visible when the subquery can produce NULLs (see chapter 06's NULL-in-`IN` trap).
- **Idiom**: prefer `<>` over `!=` for portability — `<>` is ANSI standard and works everywhere; `!=` is supported by most engines but not all (notably, MS Access and some older engines reject it).
- **Debug**: when a query returns fewer rows than expected, check for `NOT IN` with a NULL-producing subquery — `x NOT IN (1, 2, NULL)` returns *zero* rows for the entire query (NULL poison), a silent and surprising bug. Use `NOT EXISTS` or `IS DISTINCT FROM` instead.
- **Idiom**: use `COALESCE(column, fallback)` to substitute a default for NULL in the `SELECT` list, but don't use it in `WHERE` to "fix" NULL filtering — it defeats indexes (the function is applied per row after index lookup is already decided). Add a partial index or use `OR column IS NULL` explicitly.

## ⚠️ Edge Cases & Gotchas

- **`=` is single-equals**: SQL uses `=` for both assignment (in `SET`) and comparison (in `WHERE`). There is no `==`. Programmers coming from JS/Python/C often type `==` and get a syntax error.
- **`!= NULL` is never true**: `WHERE col != NULL` returns zero rows — use `WHERE col IS NOT NULL`. Even `WHERE col = NULL` returns zero rows. NULL comparisons are *always* UNKNOWN.
- **`NOT IN` with NULLs**: `WHERE x NOT IN (1, 2, NULL)` returns *no rows at all* — because `x NOT IN (a, b, c)` is equivalent to `x <> a AND x <> b AND x <> c`, and `x <> NULL` is UNKNOWN, which makes the whole `AND` chain UNKNOWN, which `WHERE` treats as "not true." This is the most dangerous NULL gotcha in SQL. Use `NOT EXISTS` or add `AND col IS NOT NULL` to the subquery.
- **String comparison is case-sensitive in PostgreSQL**: `WHERE name = 'alice'` does *not* match `'Alice'`. Use `ILIKE` or `LOWER(name) = LOWER('alice')` (or a case-insensitive collation). MySQL's default collation is case-insensitive — a portability trap.
- **Trailing whitespace in `LIKE`**: `'alice' = 'alice '` is false in PostgreSQL (strings are compared literally, including trailing spaces), but true in some other engines. Don't rely on implicit trimming.
- **`BETWEEN` is inclusive on both ends**: `amount BETWEEN 10 AND 100` means `>= 10 AND <= 100`, not `> 10 AND < 100`. Off-by-one errors here are common.
- **`IN` with mixed types**: `WHERE id IN ('1', '2', '3')` against an integer column triggers implicit casts — usually fine, but can mask bugs and prevent index use. Match the column type.
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