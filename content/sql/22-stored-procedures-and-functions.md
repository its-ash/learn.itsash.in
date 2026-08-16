# 22 — Stored Procedures & Functions

PostgreSQL has two kinds of server-side routines: **functions** (callable from expressions, can return scalars/sets/tables) and **procedures** (callable only via `CALL`, can manage transactions). Both are typically written in **PL/pgSQL** — PostgreSQL's procedural language with variables, conditionals, loops, and error handling.

## Functions vs Procedures

| Feature | Function | Procedure |
|---|---|---|
| Called from | Any expression (`SELECT my_func(...)`) | Only `CALL my_proc(...)` |
| Returns | Must return a value (scalar, set, table) | Doesn't return rows (can have `INOUT` args) |
| Transactions | Can't `COMMIT`/`ROLLBACK` (runs in caller's transaction) | Can `COMMIT`/`ROLLBACK` (manages its own transactions) |
| Use case | Computation, data retrieval, encapsulating a query | Multi-step operations with transaction control |

Use a **function** when you want to call it from a `SELECT` or use its result in an expression. Use a **procedure** when you need transaction control within the routine (e.g., a multi-step ETL that commits per batch).

## Writing Functions in PL/pgSQL

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION price_with_tax(price NUMERIC, tax_rate NUMERIC DEFAULT 0.08)
RETURNS NUMERIC AS $$
BEGIN
  RETURN price * (1 + tax_rate);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Call it
SELECT price_with_tax(100);
SELECT price_with_tax(100, 0.10);
SELECT price_with_tax(amount, 0.07) FROM orders;
``
::

### Function volatility

| Category | Meaning | Optimization implications |
|---|---|---|
| `IMMUTABLE` | Same inputs always give same output, no side effects. | Can be precomputed; eligible for index use and constant folding. |
| `STABLE` | Same inputs give same output within a single statement/transaction (reads from tables allowed). | Can be cached within a statement. |
| `VOLATILE` (default) | Can return different results on each call (e.g., `now()`, `random()`, writes). | Re-evaluated per row; not cached. |

**Label functions correctly** — `IMMUTABLE` lets the planner cache results and use the function in indexes; mislabeling a `VOLATILE` function as `IMMUTABLE` produces wrong results (e.g., caching `now()`).

::code-wrapper{language="sql"}
```sql
-- Index on a function result (requires IMMUTABLE)
CREATE INDEX users_email_lower_idx ON users(lower(email));

-- Custom immutable function in an index
CREATE OR REPLACE FUNCTION normalized_email(text) RETURNS text AS $$
  SELECT lower($1);
$$ LANGUAGE sql IMMUTABLE;
CREATE INDEX users_norm_email_idx ON users(normalized_email(email));
```
::

## Set-Returning Functions (table functions)

A function can return a set of rows — usable like a table in `FROM`:

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION active_orders_for(customer_id BIGINT)
RETURNS TABLE (id BIGINT, amount NUMERIC, ordered_on TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
    SELECT o.id, o.amount, o.ordered_on
    FROM orders o
    WHERE o.customer_id = active_orders_for.customer_id
      AND o.status = 'active';
END;
$$ LANGUAGE plpgsql STABLE;

SELECT * FROM active_orders_for(42);
```
::

`RETURN QUERY` appends a query's results to the function's output. Functions returning `SETOF record` or `TABLE(...)` are the standard way to encapsulate a parameterized query.

## SQL Functions (no PL/pgSQL)

For simple functions, plain SQL (no `BEGIN`/`END`) is faster to parse:

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION customer_order_count(cust_id BIGINT)
RETURNS BIGINT AS $$
  SELECT COUNT(*) FROM orders WHERE customer_id = cust_id;
$$ LANGUAGE sql STABLE;
``
::

SQL functions can sometimes be inlined by the planner (folded into the calling query), enabling better optimization than PL/pgSQL functions (which are opaque to the planner).

## Procedures

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE PROCEDURE archive_old_orders(days_old INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  batch_count INTEGER;
  total_archived INTEGER := 0;
BEGIN
  LOOP
    -- Archive a batch in its own transaction
    WITH to_archive AS (
      SELECT id FROM orders
      WHERE ordered_on < now() - (days_old || ' days')::interval
      LIMIT 10000
    ),
    moved AS (
      DELETE FROM orders WHERE id IN (SELECT id FROM to_archive)
      RETURNING *
    )
    INSERT INTO orders_archive SELECT * FROM moved;

    GET DIAGNOSTICS batch_count = ROW_COUNT;
    total_archived := total_archived + batch_count;

    COMMIT;   -- procedures can commit mid-execution

    EXIT WHEN batch_count = 0;
  END LOOP;

  RAISE NOTICE 'Archived % orders', total_archived;
END;
$$;

-- Call it
CALL archive_old_orders(365);
``
::

Procedures can `COMMIT`/`ROLLBACK` within their body — essential for long-running batch jobs that commit per batch.

## Variables and Declarations

::code-wrapper{language="sql"}
```sql
CREATE FUNCTION example(input TEXT) RETURNS TEXT AS $$
DECLARE
  counter INTEGER := 0;          -- initialized
  name TEXT;                     -- defaults to NULL
  ids BIGINT[];                  -- array
  row RECORD;                    -- generic row type
  user_row users%ROWTYPE;        -- row type of a table
  user_id users.id%TYPE;         -- type of a column
BEGIN
  -- ...
END;
$$ LANGUAGE plpgsql;
```
::

`%ROWTYPE` and `%TYPE` anchor declarations to table/column types, so they stay in sync if the schema changes.

## Control Flow

::code-wrapper{language="sql"}
```sql
-- If/elsif/else
IF x > 0 THEN
  RETURN 'positive';
ELSIF x < 0 THEN
  RETURN 'negative';
ELSE
  RETURN 'zero';
END IF;

-- Case (expression)
RETURN CASE
  WHEN x > 100 THEN 'big'
  WHEN x > 10 THEN 'medium'
  ELSE 'small'
END;

-- Loop
LOOP
  counter := counter + 1;
  EXIT WHEN counter >= 10;
  CONTINUE WHEN counter % 2 = 0;   -- skip even iterations
END LOOP;

-- While
WHILE counter < 100 LOOP
  counter := counter + 1;
END LOOP;

-- For (integer range)
FOR i IN 1..10 LOOP
  -- ...
END LOOP;

-- For (query result)
FOR row IN SELECT id, name FROM users WHERE active LOOP
  -- row.id, row.name available
END LOOP;
``
::

## Error Handling

::code-wrapper{language="sql"}
```sql
CREATE FUNCTION safe_divide(a NUMERIC, b NUMERIC) RETURNS NUMERIC AS $$
BEGIN
  RETURN a / b;
EXCEPTION
  WHEN division_by_zero THEN
    RETURN NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'Unexpected error: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
``
::

An `EXCEPTION` block catches errors and rolls back to the start of the block (a subtransaction). This is expensive (sets up a subtransaction per call) — avoid exception handling in hot paths.

### RAISE

::code-wrapper{language="sql"}
```sql
RAISE NOTICE 'Processed % rows', row_count;       -- log (client-visible)
RAISE WARNING 'Deprecated call by user %', user_id;
RAISE EXCEPTION 'Invalid input: %', input;        -- error, aborts
RAISE EXCEPTION 'Division by zero' USING ERRCODE = '22012';
``
::

## Procedures and Transactions

A procedure runs in the caller's transaction by default, but can issue `COMMIT`/`ROLLBACK` to manage transactions internally. This is the key difference from functions.

::code-wrapper{language="sql"}
```sql
CREATE PROCEDURE transfer(from_id BIGINT, to_id BIGINT, amount NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE accounts SET balance = balance - amount WHERE id = from_id;
  UPDATE accounts SET balance = balance + amount WHERE id = to_id;
  COMMIT;   -- commits the transfer
END;
$$;

CALL transfer(1, 2, 100);
``
::

Without `COMMIT`, the procedure's changes commit when the caller commits. With `COMMIT`, each `COMMIT` inside the procedure is a separate transaction.

## Security Definer vs Security Invoker

By default, functions run with the privileges of the caller (`SECURITY INVOKER`). `SECURITY DEFINER` runs with the privileges of the function's *owner* — useful for allowing limited access to tables the caller can't directly see:

::code-wrapper{language="sql"}
```sql
CREATE FUNCTION get_my_salary(emp_id BIGINT) RETURNS NUMERIC
AS $$
BEGIN
  -- Only allow employees to see their own salary
  IF emp_id != current_user_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (SELECT salary FROM salaries WHERE employee_id = emp_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON salaries FROM public;
-- Now users can't SELECT from salaries directly, but can call get_my_salary (which checks authorization).
``
::

`SECURITY DEFINER` is powerful for controlled access — but be careful (the function runs with *your* privileges, so bugs in the authorization check are privilege escalations). Set the `search_path` explicitly in `SECURITY DEFINER` functions to prevent search-path hijacking.

## 💡 Tips & Tricks

- **Idiom**: label function volatility correctly — `IMMUTABLE` for pure functions (same inputs → same output, no side effects), `STABLE` for functions that read tables but are consistent within a statement, `VOLATILE` (default) for functions with side effects or time-dependence. Correct labels unlock planner optimizations (caching, index use); wrong labels cause wrong results.
- **Idiom**: prefer plain **SQL functions** (`LANGUAGE sql`, no `BEGIN`/`END`) for simple one-query functions — they can be inlined by the planner, enabling better optimization than opaque PL/pgSQL functions. Reserve PL/pgSQL for logic that needs variables, loops, or conditionals.
- **Idiom**: use `SECURITY DEFINER` with an explicit `search_path` for controlled-access functions — but always set `search_path` (e.g., `SET search_path = my_schema, pg_temp`) to prevent search-path hijacking where a malicious user creates a function/table shadowing one you call.
- **Performance**: `EXCEPTION` blocks in PL/pgSQL create a subtransaction per call (expensive — savepoint + rollback on error). Don't wrap hot-path functions in exception handlers "just in case"; handle specific expected errors only.
- **Idiom**: use procedures (`CALL ...`) for multi-step batch jobs that need `COMMIT` per batch — functions can't commit, so a million-row archival in a function is one giant transaction. A procedure with a loop + `COMMIT` keeps transactions short and allows resume-on-restart.

## ⚠️ Edge Cases & Gotchas

- **Functions can't `COMMIT`/`ROLLBACK`**: they run in the caller's transaction. Use a procedure if you need transaction control.
- **`IMMUTABLE` functions can't query tables**: a function that reads a table is at least `STABLE` (the table could change between calls). Mislabeling a table-reading function as `IMMUTABLE` and using it in an index produces stale/wrong results.
- **`VOLATILE` is the default**: forgetting to set volatility leaves the function `VOLATILE`, disabling caching and index use. Always specify volatility explicitly.
- **PL/pgSQL functions are opaque to the planner**: the planner can't see inside a PL/pgSQL function body, so it can't optimize across the function boundary (push predicates, estimate row counts). SQL functions can be inlined and optimized. For hot paths, prefer SQL functions or inline the query.
- **`SECURITY DEFINER` runs as the owner**: a bug in the authorization check is a privilege escalation. Set `search_path` explicitly (prevent hijacking), validate all inputs, and grant `EXECUTE` only to the roles that need it.
- **`RAISE EXCEPTION` aborts the transaction**: after an uncaught exception, the transaction is aborted and all subsequent statements fail until `ROLLBACK`. Use `EXCEPTION` blocks to handle expected errors locally.
- **Function argument names shadow columns**: `WHERE customer_id = customer_id` in a function with a `customer_id` parameter — the parameter shadows the column, making the predicate always true (or always false). Qualify column references: `WHERE orders.customer_id = customer_id` (or alias the parameter).
- **`SELECT INTO` in PL/pgSQL**: `SELECT col INTO var FROM ...` assigns the first matching row's value to `var`; if no rows match, `var` is NULL and `FOUND` is false; if multiple rows match, only the first is used (no error). Use `SELECT ... INTO STRICT` to error on zero-or-multiple rows.
- **Procedures can't be called from expressions**: `SELECT my_proc()` doesn't work — use `CALL my_proc()`. Procedures can't return a result set to a `SELECT` (use a function for that).
- **Recursive functions**: PL/pgSQL functions can call themselves, but PostgreSQL doesn't guarantee tail-call optimization — deep recursion can overflow the stack. Prefer an iterative loop.

## 🧠 Spot the Bug

A developer creates a function to compute a user's full name, marks it `IMMUTABLE`, and uses it in an index. Weeks later, the index returns stale results after users update their names. What went wrong?

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION full_name(user_id BIGINT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT first_name || ' ' || last_name FROM users WHERE id = user_id);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE INDEX users_full_name_idx ON users(full_name(id));
```
::

<details>
<summary>Answer</summary>

The function reads from the `users` table, so it's **not `IMMUTABLE`** — it's `STABLE` at best (the result can change when the table changes). `IMMUTABLE` means "same inputs always give the same output, for all time" — a function that reads a table violates this because the table's contents can change.

By marking it `IMMUTABLE` and using it in an index, the developer told the planner the function's result never changes. The index stores the function's result at index time, but when a user updates `first_name`, the index **isn't updated** (the planner thinks the function is immutable, so the indexed value is still valid) — the index returns stale results.

The fix — either don't index the function, or use a **generated column** (which the database keeps in sync on updates):

```sql
-- Option 1: mark it STABLE and don't use it in an index
CREATE OR REPLACE FUNCTION full_name(user_id BIGINT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT first_name || ' ' || last_name FROM users WHERE id = user_id);
END;
$$ LANGUAGE plpgsql STABLE;
-- Don't index it — STABLE functions can't be in indexes (and wouldn't stay in sync).

-- Option 2: use a generated column (the right way to index a computed value)
ALTER TABLE users ADD COLUMN full_name TEXT
  GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
CREATE INDEX users_full_name_idx ON users(full_name);
-- The generated column is automatically updated on any change to first_name/last_name,
-- so the index stays in sync.
```

**The lesson**: `IMMUTABLE` means "no table reads, no time dependence, no randomness." A function that reads a table is `STABLE` (or `VOLATILE`), and using it in an index produces stale results. For indexed computed values, use a generated column — the database maintains it on updates.

</details>

## Summary

You can now write PL/pgSQL functions and procedures, choose between `IMMUTABLE`/`STABLE`/`VOLATILE`, build set-returning functions, handle errors, use `SECURITY DEFINER` for controlled access, and pick between functions (callable from expressions) and procedures (with transaction control). Next: sequences and identifiers.