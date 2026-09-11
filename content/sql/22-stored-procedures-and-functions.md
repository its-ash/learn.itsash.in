---
title: "22 — Stored Procedures & Functions"
description: "FUNCTION vs PROCEDURE, PL/pgSQL control flow, volatility (IMMUTABLE/STABLE/VOLATILE) and its optimizer implications, set-returning functions, exception handling as subtransactions, SECURITY DEFINER and search_path hijacking — code-first reference with a batch-processing function and anti-patterns for volatility mislabeling."
---

# 22 — Stored Procedures & Functions

PostgreSQL has two server-side routine types: **functions** (callable from expressions, return scalars/sets/tables, can't control transactions) and **procedures** (callable only via `CALL`, can `COMMIT`/`ROLLBACK` internally). Both are usually written in **PL/pgSQL** — a block-structured procedural language with variables, conditionals, loops, and exception handling.

## FUNCTION vs PROCEDURE — the decision matrix

| Feature | Function | Procedure |
|---|---|---|
| Called from | Any expression (`SELECT my_func(...)`, in `WHERE`, in index) | Only `CALL my_proc(...)` |
| Returns | Must return a value (scalar, set, `TABLE(...)`) | No row return (can have `INOUT` args read back) |
| Transactions | Runs in caller's transaction — **cannot** `COMMIT`/`ROLLBACK` | Can `COMMIT`/`ROLLBACK` mid-execution |
| Use in index | Yes (if `IMMUTABLE`) | No |
| Use in `WHERE`/`SELECT` | Yes | No |
| Typical use | Computation, data retrieval, encapsulating a query | Multi-step ETL with per-batch transaction control |

## PL/pgSQL Basics — the block structure

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION example(input TEXT) RETURNS TEXT AS $$
DECLARE                          -- DECLARE section (optional): variables, types
  counter   INTEGER := 0;        -- initialized; without :=, defaults to NULL
  name      TEXT;                -- untyped-init → NULL
  ids       BIGINT[];            -- array type
  row       RECORD;              -- generic row — structure assigned at first use
  user_row  users%ROWTYPE;       -- anchored to a table's row type (auto-tracks schema changes)
  user_id   users.id%TYPE;       -- anchored to a column's type
  found     BOOLEAN;             -- set by SELECT INTO / RETURN
BEGIN                           -- executable section
  -- PL/pgSQL is a block-structured language: DECLARE ... BEGIN ... EXCEPTION ... END
  -- Variables live for the function call (not persistent across calls).
  -- %ROWTYPE and %TYPE anchor to the schema — if users.id changes from int to bigint,
  -- the function's user_id variable type updates automatically on next function call.
  RETURN input;
END;
$$ LANGUAGE plpgsql;
```
::

## Control Flow — IF, CASE, LOOP, FOR, WHILE

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION control_flow_demo(n INTEGER) RETURNS TEXT AS $$
DECLARE
  i INTEGER := 0;
  result TEXT;
BEGIN
  -- IF / ELSIF / ELSE
  IF n > 0 THEN
    result := 'positive';
  ELSIF n < 0 THEN
    result := 'negative';
  ELSE
    result := 'zero';
  END IF;

  -- CASE (expression form, like SQL CASE)
  result := CASE
    WHEN n > 100 THEN 'big'
    WHEN n > 10  THEN 'medium'
    ELSE 'small'
  END;

  -- Simple LOOP with EXIT/CONTINUE
  i := 0;
  LOOP
    i := i + 1;
    EXIT WHEN i >= n;             -- breaks the loop
    CONTINUE WHEN i % 2 = 0;      -- skips even iterations (goes to next i)
    -- odd-iteration logic here
  END LOOP;

  -- WHILE (condition checked at loop top)
  WHILE i < n * 2 LOOP
    i := i + 1;
  END LOOP;

  -- FOR (integer range — inclusive bounds)
  FOR i IN 1..10 LOOP             -- 1 to 10 inclusive (REVERSE 10..1 for descending)
    -- i is loop-local; cannot be assigned inside the loop
    NULL;
  END LOOP;

  -- FOR (query result — cursor-like iteration)
  FOR result IN
    SELECT name FROM users WHERE active ORDER BY name
  LOOP
    -- `result` is a RECORD; result.name available
    RAISE NOTICE 'User: %', result;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
```
::

## Function Parameters — IN, OUT, INOUT, DEFAULT

::code-wrapper{language="sql"}
```sql
-- IN: input only (default). OUT: output only (returned to caller).
-- INOUT: both input and output. DEFAULT: optional parameter.
CREATE OR REPLACE FUNCTION split_name(
  full_name TEXT,                 -- IN (default direction)
  OUT first TEXT,                 -- OUT: returned, not passed by caller
  OUT last TEXT,
  separator TEXT DEFAULT ' '      -- DEFAULT: caller can omit
) AS $$
BEGIN
  -- split full_name on first occurrence of separator
  first := split_part(full_name, separator, 1);
  last  := split_part(full_name, separator, 2);
  -- No RETURN needed — OUT params are the return value (composite type)
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Call: returns a composite (first, last)
SELECT * FROM split_name('Ada Lovelace');
--  first |   last
-- -------+----------
--  Ada   | Lovelace

SELECT * FROM split_name('Ada-Lovelace', '-');  -- uses the DEFAULT param
```
::

## Return Types — scalar, set, TABLE

::code-wrapper{language="sql"}
```sql
-- Scalar: returns a single value
CREATE OR REPLACE FUNCTION tax(amount NUMERIC, rate NUMERIC DEFAULT 0.08)
RETURNS NUMERIC AS $$
BEGIN
  RETURN amount * rate;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Set-returning (SETOF): returns 0+ rows. Use RETURN NEXT (one row at a time)
-- or RETURN QUERY (append a query's results).
CREATE OR REPLACE FUNCTION generate_series_custom(lo INTEGER, hi INTEGER)
RETURNS SETOF INTEGER AS $$
BEGIN
  FOR i IN lo..hi LOOP
    RETURN NEXT i;               -- emits one row per call
  END LOOP;
  RETURN;                        -- end of function (no more rows)
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- RETURNS TABLE: typed set-returning (named columns + types)
CREATE OR REPLACE FUNCTION active_orders_for(cust_id BIGINT)
RETURNS TABLE (id BIGINT, amount NUMERIC, ordered_on TIMESTAMPTZ) AS $$
BEGIN
  -- RETURN QUERY appends a query's result set to the function's output
  RETURN QUERY
    SELECT o.id, o.amount, o.ordered_on
    FROM orders o
    WHERE o.customer_id = active_orders_for.cust_id   -- qualify to avoid shadowing
      AND o.status = 'active'
    ORDER BY o.ordered_on DESC;
  -- Can have multiple RETURN QUERY statements (results concatenated)
END;
$$ LANGUAGE plpgsql STABLE;

-- Usage: treat it like a table in FROM
SELECT * FROM active_orders_for(42);
-- Can be joined, filtered, aggregated — it's a relation
SELECT sum(amount) FROM active_orders_for(42);
```
::

## Volatility — IMMUTABLE / STABLE / VOLATILE

The volatility label tells the planner how it can optimize calls. **Mislabeling produces wrong results.**

| Category | Same inputs → same output? | Reads tables? | Planner optimizations |
|---|---|---|---|
| `IMMUTABLE` | Always (for all time) | No | Constant folding, index eligibility, cached per query |
| `STABLE` | Within one statement/transaction | Yes (read-only) | Cached within one statement |
| `VOLATILE` (default) | Can vary per call | Yes (writes allowed) | Re-evaluated every call, no caching |

::code-wrapper{language="sql"}
```sql
-- IMMUTABLE: pure function. No table reads, no time/random/side effects.
-- The planner can precompute the result at plan time and reuse it.
-- REQUIRED for use in expression indexes (the index stores the computed
-- value at index time — if the function could change, the index is stale).
CREATE OR REPLACE FUNCTION normalized_email(raw TEXT) RETURNS TEXT AS $$
  SELECT lower(trim(raw));         -- pure string transform, no tables
$$ LANGUAGE sql IMMUTABLE;

CREATE INDEX users_norm_email_idx ON users(normalized_email(email));
-- The index stores normalized_email(email) for each row. If the function
-- were STABLE (could read tables), the index couldn't guarantee correctness.

-- STABLE: reads tables but result is consistent within one statement.
-- The planner can cache the result for the duration of one query.
CREATE OR REPLACE FUNCTION user_order_count(uid BIGINT) RETURNS BIGINT AS $$
  SELECT count(*) FROM orders WHERE customer_id = uid;
$$ LANGUAGE sql STABLE;
-- STABLE because: the count could change between transactions, but within
-- one statement (one snapshot), it's consistent.

-- VOLATILE (default): can return different results on each call.
-- now(), random(), nextval() are VOLATILE. Functions that write are VOLATILE.
CREATE OR REPLACE FUNCTION add_audit_entry(msg TEXT) RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_log (message) VALUES (msg);  -- side effect = VOLATILE
END;
$$ LANGUAGE plpgsql;  -- VOLATILE is the default, explicitly omitted here
```
::

### Volatility and Index Eligibility — the critical link

::code-wrapper{language="sql"}
```sql
-- Expression indexes REQUIRE IMMUTABLE functions. The index stores the
-- function's result at insert/update time. If the function isn't immutable
-- (reads a table, depends on time), the stored value can go stale.
CREATE INDEX users_email_lower_idx ON users(lower(email));  -- lower() is IMMUTABLE ✓

-- ❌ This will FAIL at CREATE INDEX time:
CREATE OR REPLACE FUNCTION current_tax_rate(state TEXT) RETURNS NUMERIC AS $$
  SELECT rate FROM tax_rates WHERE state_code = state;  -- reads a table!
$$ LANGUAGE sql IMMUTABLE;
CREATE INDEX orders_tax_idx ON orders(current_tax_rate(state));
-- ERROR: functions in index expression must be marked IMMUTABLE
-- (PostgreSQL allows the function to be CREATED with IMMUTABLE even if it
--  reads a table — the mistake surfaces as WRONG RESULTS, not an error,
--  if you trick it. See the Spot the Bug section.)
```
::

## STRICT and LEAKPROOF

::code-wrapper{language="sql"}
```sql
-- STRICT (aka CALLED ON NULL INPUT vs RETURNS NULL ON NULL INPUT):
-- if any argument is NULL, the function is not called and NULL is returned
-- immediately. Saves a function call and simplifies NULL handling.
CREATE OR REPLACE FUNCTION safe_divide(a NUMERIC, b NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN a / b;   -- no need to check for NULL a or b — STRICT handles it
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;
-- safe_divide(NULL, 2) → NULL (function body never executes)

-- LEAKPROOF: guarantees the function throws no error for any input and
-- reveals nothing about arguments via side effects. Used by the planner
-- for security-barrier views and RLS predicate pushdown. Only superusers
-- can mark functions LEAKPROOF. Rarely needed in application code.
```
::

## SQL Functions vs PL/pgSQL — inlining matters

::code-wrapper{language="sql"}
```sql
-- SQL function: no BEGIN/END. The planner can INLINE it (substitute the
-- function body into the calling query), enabling predicate pushdown,
-- better cost estimates, and join optimization across the function boundary.
CREATE OR REPLACE FUNCTION active_customer(cid BIGINT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM orders WHERE customer_id = cid AND status = 'active');
$$ LANGUAGE sql STABLE;
-- The planner can inline this into: WHERE EXISTS (SELECT 1 FROM orders ...)

-- PL/pgSQL function: opaque to the planner. The planner treats it as a
-- black box — it can't see inside, can't push predicates, can't estimate
-- row counts. For hot-path functions, prefer SQL functions (inlinable).
CREATE OR REPLACE FUNCTION active_customer_plpgsql(cid BIGINT) RETURNS BOOLEAN AS $$
DECLARE
  found BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM orders WHERE customer_id = cid AND status = 'active')
  INTO found;
  RETURN found;
END;
$$ LANGUAGE plpgsql STABLE;
-- The planner calls this as a black box. No inlining, no pushdown.
```
::

**When SQL functions don't inline**: if they have multiple statements, use `SET` clauses, reference `tg_*` variables, or return `SETOF` with `RETURNS TABLE` in some cases. Check with `EXPLAIN` — if you see a `Function Scan` instead of the underlying table access, it wasn't inlined.

## Procedures — CALL and Transaction Control

::code-wrapper{language="sql"}
```sql
-- Procedures are called with CALL (not SELECT). They can COMMIT/ROLLBACK
-- mid-execution — the key difference from functions. Use for multi-step
-- ETL that needs per-batch transactions (short transactions = less
-- bloat, resumable on restart).
CREATE OR REPLACE PROCEDURE archive_old_orders(days_old INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  batch_count INTEGER;
  total       INTEGER := 0;
BEGIN
  LOOP
    -- Move one batch (10k rows) in a single statement (atomic)
    WITH to_move AS (
      SELECT id FROM orders
      WHERE ordered_on < now() - (days_old || ' days')::interval
      ORDER BY id
      LIMIT 10000                       -- small batches = short transactions
      FOR UPDATE SKIP LOCKED            -- skip rows locked by other workers
    ),
    moved AS (
      DELETE FROM orders WHERE id IN (SELECT id FROM to_move)
      RETURNING *                        -- capture deleted rows for insert
    )
    INSERT INTO orders_archive SELECT * FROM moved;

    GET DIAGNOSTICS batch_count = ROW_COUNT;   -- rows affected by last statement
    total := total + batch_count;

    COMMIT;                               -- ← PROCEDURES CAN COMMIT. Functions CANNOT.
    -- Each batch is its own transaction. If the procedure crashes after
    -- batch 5, batches 1-5 are committed, 6+ are not — resumable.

    EXIT WHEN batch_count = 0;            -- no more rows to archive
  END LOOP;

  RAISE NOTICE 'Archived % orders', total;
END;
$$;

CALL archive_old_orders(365);
```
::

## Exception Handling — the subtransaction cost

::code-wrapper{language="sql"}
```sql
-- An EXCEPTION block in PL/pgSQL creates a SUBTRANSACTION (savepoint).
-- On error, the block's changes are rolled back to the savepoint — but
-- the surrounding transaction continues. This is EXPENSIVE: each entry
-- into an EXCEPTION block sets up a savepoint, even if no exception
-- occurs. Don't wrap hot-path functions in exception handlers "just in case."
CREATE OR REPLACE FUNCTION safe_divide(a NUMERIC, b NUMERIC) RETURNS NUMERIC AS $$
BEGIN
  RETURN a / b;
EXCEPTION
  WHEN division_by_zero THEN
    RETURN NULL;                       -- specific error: handle gracefully
  WHEN OTHERS THEN                     -- catch-all: log and return NULL
    RAISE NOTICE 'Unexpected: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;
-- The savepoint is set up on EVERY call, even when b is non-zero.
-- For a function called 1M times in a query, that's 1M savepoints.
```
::

### RAISE — NOTICE, WARNING, EXCEPTION

::code-wrapper{language="sql"}
```sql
RAISE NOTICE  'Processed % rows in % ms', row_count, elapsed;  -- client-visible log
RAISE WARNING 'Deprecated function called by role %', current_user;
RAISE EXCEPTION 'Invalid input: %', input;                     -- aborts the transaction
RAISE EXCEPTION 'Division by zero' USING ERRCODE = '22012';   -- custom SQLSTATE
-- After an uncaught EXCEPTION, the transaction is ABORTED — all subsequent
-- statements fail until ROLLBACK. Use EXCEPTION blocks to handle locally.
```
::

## Complex Implementation — Batch Processing with Error Logging

A PL/pgSQL function that processes a batch of records, catches per-row errors, logs failures to an error table, and returns a summary. Uses an exception block per row (subtransaction) to isolate failures.

::code-wrapper{language="sql"}
```sql
-- Error log table for failed processing
CREATE TABLE processing_errors (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  source_id   BIGINT NOT NULL,           -- ID of the row that failed
  error_code  TEXT,                      -- SQLSTATE
  error_msg   TEXT,                      -- SQLERRM
  failed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX processing_errors_batch_idx ON processing_errors(batch_id);

-- The batch processor: processes rows from a staging table, catches
-- per-row errors (subtransaction per row), logs failures, returns summary.
CREATE OR REPLACE FUNCTION process_batch(batch_limit INTEGER DEFAULT 1000)
RETURNS TABLE (processed INTEGER, failed INTEGER, batch_id UUID) AS $$
DECLARE
  rec RECORD;
  ok_count  INTEGER := 0;
  fail_count INTEGER := 0;
  bid       UUID := gen_random_uuid();
BEGIN
  -- Iterate over unprocessed rows in staging. FOR ... IN SELECT is cursor-like.
  FOR rec IN
    SELECT id, payload FROM staging_table
    WHERE status = 'pending'
    ORDER BY id
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED          -- skip rows other workers are processing
  LOOP
    BEGIN                           -- ← subtransaction (savepoint) per row
      -- Business logic: validate and insert into the target table
      INSERT INTO target_table (data, source_id)
      VALUES (rec.payload, rec.id);

      UPDATE staging_table SET status = 'done' WHERE id = rec.id;
      ok_count := ok_count + 1;

    EXCEPTION
      WHEN OTHERS THEN              -- catch per-row errors, log, continue
        INSERT INTO processing_errors (batch_id, source_id, error_code, error_msg)
        VALUES (bid, rec.id, SQLSTATE, SQLERRM);
        -- SQLSTATE: 5-char SQLSTATE code. SQLERRM: error message text.
        UPDATE staging_table SET status = 'error' WHERE id = rec.id;
        fail_count := fail_count + 1;
        -- The subtransaction rolls back the INSERT into target_table but
        -- the INSERT into processing_errors (after EXCEPTION) succeeds.
        -- Without the subtransaction, one bad row would abort the whole batch.
    END;
  END LOOP;

  RETURN QUERY SELECT ok_count, fail_count, bid;
END;
$$ LANGUAGE plpgsql;

-- Usage
SELECT * FROM process_batch(5000);
--  processed | failed |              batch_id
-- -----------+--------+--------------------------------------
--       4998 |      2 | a1b2c3d4-...
-- 4998 rows committed, 2 logged to processing_errors with their SQLSTATE.
```
::

## Anti-Pattern: IMMUTABLE on a Table-Reading Function

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: this function reads from the users table, but is labeled
-- IMMUTABLE. The planner trusts the label and caches the result.
-- If used in an index, the index stores a value that goes STALE when
-- the table changes. Silent data corruption.
CREATE OR REPLACE FUNCTION full_name(uid BIGINT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT first_name || ' ' || last_name FROM users WHERE id = uid);
  --        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  --        This reads a TABLE. The result changes when the table changes.
  --        This function is STABLE at best, NOT IMMUTABLE.
END;
$$ LANGUAGE plpgsql IMMUTABLE;       -- ← LIE. The planner trusts this.

CREATE INDEX users_full_name_idx ON users(full_name(id));
-- The index stores full_name(id) at index time. When a user updates
-- first_name, the index is NOT updated (the planner thinks IMMUTABLE =
-- never changes). Queries via the index return STALE names.

-- ✅ RIGHT: label it STABLE (reads a table, consistent within a statement).
-- Do NOT use it in an index. For indexed computed values, use a generated
-- column (the database maintains it on updates).
CREATE OR REPLACE FUNCTION full_name(uid BIGINT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT first_name || ' ' || last_name FROM users WHERE id = uid);
END;
$$ LANGUAGE plpgsql STABLE;          -- ← honest. Can't be indexed, but correct.

-- ✅ BEST: use a generated column for indexed computed values
ALTER TABLE users ADD COLUMN full_name TEXT
  GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
CREATE INDEX users_full_name_idx ON users(full_name);
-- The generated column is auto-updated on any change to first_name/last_name.
-- The index stays in sync. No function, no volatility question.
```
::

## Anti-Pattern: Complex Business Logic in Functions

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: burying business logic (order pricing, discounts, tax rules)
-- in a PL/pgSQL function. It's invisible to the application, can't be
-- unit-tested without a database, can't be debugged with a debugger,
-- and the version control is in migration files, not the app repo.
CREATE OR REPLACE FUNCTION calculate_order_total(order_id BIGINT) RETURNS NUMERIC AS $$
DECLARE
  total NUMERIC;
BEGIN
  -- 100 lines of pricing rules, discount logic, tax calculation...
  -- This is business logic. It belongs in the application, where it's
  -- testable, reviewable, and version-controlled alongside the app.
  SELECT sum(quantity * unit_price) INTO total FROM order_items WHERE order_id = calculate_order_total.order_id;
  -- apply discounts, tax, etc. (omitted for brevity)
  RETURN total;
END;
$$ LANGUAGE plpgsql STABLE;

-- ✅ RIGHT: put business logic in the application. Use functions for:
--   - Pure data transforms (normalized_email, full_name)
--   - Encapsulating a complex query (active_orders_for)
--   - Computation that must be in the DB (trigger logic, audit)
-- The app calls simple queries; the logic lives in the app's code.
```
::

## SECURITY DEFINER and search_path Hijacking

::code-wrapper{language="sql"}
```sql
-- SECURITY INVOKER (default): runs with the CALLER's privileges.
-- SECURITY DEFINER: runs with the OWNER's privileges. Useful for
-- allowing limited access to tables the caller can't see directly.

CREATE OR REPLACE FUNCTION get_my_salary(emp_id BIGINT) RETURNS NUMERIC
AS $$
BEGIN
  -- Authorization check: only the employee or HR can see a salary
  IF emp_id != current_setting('app.user_id')::bigint
     AND NOT has_role(current_user, 'hr', 'member') THEN
    RAISE EXCEPTION 'Not authorized to view salary for employee %', emp_id;
  END IF;
  RETURN (SELECT salary FROM salaries WHERE employee_id = emp_id);
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER               -- runs as the function's OWNER (who CAN read salaries)
   SET search_path = hr, pg_temp; -- CRITICAL: pin the search_path

-- Revoke direct access; force access through the function
REVOKE ALL ON salaries FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_salary(BIGINT) TO authenticated_users;
-- Users can't SELECT from salaries, but can call get_my_salary (which checks auth).

-- ── The search_path hijack attack ──────────────────────────────
-- If a SECURITY DEFINER function doesn't set search_path, a malicious
-- user can create a malicious function/table in a schema earlier in
-- the search_path, and the DEFINER function calls the MALICIOUS object
-- instead of the intended one — running with the OWNER's privileges.
-- Example: if the function calls lower() and the attacker creates a
-- malicious lower() in pg_temp (which is early in the default
-- search_path), the DEFINER function calls the attacker's lower().
-- Fix: ALWAYS set search_path explicitly in SECURITY DEFINER functions.
-- `SET search_path = my_schema, pg_temp` puts pg_temp LAST (safe).
```
::

## Dollar-Quoting

::code-wrapper{language="sql"}
```sql
-- Function bodies are string literals. If the body contains single quotes
-- (e.g., string literals in SQL), you'd need to escape them: ''.
-- Dollar-quoting $$ ... $$ avoids this: no escaping needed inside $$.
-- Use tags to nest: $outer$ ... $inner$ ... $inner$ ... $outer$.
CREATE FUNCTION example() RETURNS void AS $$
BEGIN
  -- No need to escape the single quotes here:
  EXECUTE 'INSERT INTO log (msg) VALUES (''hello'')';  -- escaped: ugly
  -- With nested dollar-quoting:
  EXECUTE $insert$INSERT INTO log (msg) VALUES ('hello')$insert$;  -- clean
END;
$$ LANGUAGE plpgsql;
```
::

## 💡 Tips & Tricks

- **Idiom**: use `IMMUTABLE` for pure functions (no table reads, no time/random dependence) — it unlocks expression indexes and constant folding. `STABLE` for read-only functions consistent within a statement. `VOLATILE` (default) for functions with side effects. **Always specify volatility explicitly** — the default is `VOLATILE`, and forgetting the label silently disables all optimizations.
- **Idiom**: prefer **SQL functions** (`LANGUAGE sql`, no `BEGIN`/`END`) for simple one-query functions — the planner can inline them (substitute the body into the calling query), enabling predicate pushdown and accurate row estimates. PL/pgSQL functions are opaque black boxes to the planner. Check inlining with `EXPLAIN` (look for the underlying table access, not just `Function Scan`).
- **Idiom**: use `RETURN QUERY` for set-returning functions — it appends a query's result to the function's output in one statement. Multiple `RETURN QUERY` calls concatenate results. For procedural row generation, use `RETURN NEXT` (one row per call).
- **Idiom**: use `DEFAULT` parameters for optional args — `CREATE FUNCTION f(a INT, b INT DEFAULT 10)` lets callers write `f(5)` or `f(5, 20)`. Combined with `OUT`/`INOUT` params, this reduces the number of function overloads needed.
- **Idiom**: use `STRICT` (aka `RETURNS NULL ON NULL INPUT`) for functions that should short-circuit on NULL — saves a function call and simplifies NULL handling (no `IF a IS NULL` boilerplate).
- **Performance**: `EXCEPTION` blocks create a subtransaction (savepoint) per call — expensive even when no exception occurs. Don't wrap hot-path functions in exception handlers "just in case." Handle specific expected errors only, and only in functions that genuinely need per-row error isolation (batch processing).
- **Idiom**: use procedures (`CALL ...`) for multi-step batch jobs that need `COMMIT` per batch — functions can't commit, so a million-row archival in a function is one giant transaction (huge WAL, long lock holds, no resume). A procedure with a loop + `COMMIT` keeps transactions short and is resumable on restart.
- **Security**: always set `search_path` explicitly in `SECURITY DEFINER` functions (`SET search_path = my_schema, pg_temp`) — prevents search-path hijacking where a malicious user creates a shadowing object in `pg_temp` that runs with the owner's privileges.

## ⚠️ Edge Cases & Gotchas

- **`IMMUTABLE` mislabeling produces wrong cached results**: a function that reads a table is at least `STABLE`. Marking it `IMMUTABLE` and using it in an index stores a value that never updates — the index returns stale data. PostgreSQL doesn't verify the label; it trusts you. This is silent data corruption.
- **Functions can't `COMMIT`/`ROLLBACK`**: they run in the caller's transaction. `COMMIT` inside a function raises an error. Use a procedure if you need transaction control.
- **`VOLATILE` is the default**: forgetting to set volatility leaves the function `VOLATILE`, disabling caching and index use. The planner re-evaluates a `VOLATILE` function on every row. Always specify the volatility explicitly.
- **PL/pgSQL functions are opaque to the planner**: the planner can't see inside the function body, so it can't optimize across the function boundary (push predicates, estimate row counts). SQL functions can be inlined. For hot paths, prefer SQL functions or inline the query directly.
- **Exception handling cost**: each entry into an `EXCEPTION` block sets up a savepoint (subtransaction), even if no exception occurs. In a function called 1M times, that's 1M savepoints — significant overhead. Handle specific errors only, not `WHEN OTHERS THEN` on every function.
- **Set-returning function in `SELECT` vs `FROM`**: `SELECT generate_series(1, 5)` emits 5 rows (lateral). `SELECT * FROM generate_series(1, 5)` also emits 5 rows but is the preferred form (clearer, allows aliasing). Don't mix set-returning functions in the `SELECT` list with normal columns — the row count is the product (cross join semantics).
- **Variable shadowing column names**: `WHERE customer_id = customer_id` in a function with a `customer_id` parameter — the parameter shadows the column, making the predicate always true (comparing the param to itself). Qualify column references: `WHERE orders.customer_id = customer_id` (or use a different parameter name like `p_customer_id`).
- **`SELECT INTO` semantics**: `SELECT col INTO var FROM ...` assigns the first matching row; if no rows match, `var` is NULL and `FOUND` is false; if multiple rows match, only the first is used (NO error). Use `SELECT ... INTO STRICT` to raise an error on zero or multiple rows — catches bugs where you expected exactly one row.
- **Function search_path security**: `SECURITY DEFINER` functions run as the owner. If the search_path isn't pinned, a user can create a shadowing function in `pg_temp` that the DEFINER function calls with the owner's privileges. Always `SET search_path = my_schema, pg_temp` in `SECURITY DEFINER` functions.
- **`SECURITY DEFINER` runs as the owner**: a bug in the authorization check is a privilege escalation. Validate all inputs, check authorization explicitly, and grant `EXECUTE` only to roles that need it. Don't make functions `SECURITY DEFINER` unless you need privilege elevation.
- **Procedures can't be called from expressions**: `SELECT my_proc()` fails — use `CALL my_proc()`. Procedures can't return a result set to a `SELECT` (use a function with `RETURNS TABLE` for that). `INOUT` params are the only way to return values from a procedure.
- **Recursive functions and stack depth**: PL/pgSQL functions can call themselves, but PostgreSQL doesn't guarantee tail-call optimization. Deep recursion (thousands of levels) can overflow the stack. Prefer an iterative loop for unbounded input.

## 🧠 Spot the Bug

A developer creates a function to compute a user's full name, marks it `IMMUTABLE`, and uses it in an index. Weeks later, the index returns stale results after users update their names. The function:

::code-wrapper{language="sql"}
```sql
CREATE OR REPLACE FUNCTION full_name(user_id BIGINT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT first_name || ' ' || last_name FROM users WHERE id = user_id);
  --        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ reads a TABLE
END;
$$ LANGUAGE plpgsql IMMUTABLE;                    -- ← claims "never changes"

CREATE INDEX users_full_name_idx ON users(full_name(id));
```
::

<details>
<summary>Answer</summary>

The function reads from the `users` table, so it is **not `IMMUTABLE`** — it's `STABLE` at best (the result changes when the table changes). `IMMUTABLE` means "same inputs always give the same output, for all time" — a table-reading function violates this.

By marking it `IMMUTABLE` and using it in an index, the developer told the planner the result never changes. The index stores `full_name(id)` at index time, but when a user updates `first_name`, the index **is not updated** (the planner thinks the value is immutable) — the index returns stale names. Silent data corruption.

The fix — don't index a table-reading function. Use a **generated column** for indexed computed values:

::code-wrapper{language="sql"}
```sql
-- Option 1: mark it STABLE (honest), don't index it
CREATE OR REPLACE FUNCTION full_name(user_id BIGINT) RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT first_name || ' ' || last_name FROM users WHERE id = user_id);
END;
$$ LANGUAGE plpgsql STABLE;    -- STABLE: reads a table, consistent within a statement
-- Can't be indexed. Correct, but no index acceleration.

-- Option 2: generated column (the right way to index a computed value)
ALTER TABLE users ADD COLUMN full_name TEXT
  GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
CREATE INDEX users_full_name_idx ON users(full_name);
-- The generated column is auto-updated on any change to first_name/last_name.
-- The index stays in sync. No function, no volatility question, no staleness.
```
::

**The lesson**: `IMMUTABLE` means "no table reads, no time dependence, no randomness." A function that reads a table is `STABLE` (or `VOLATILE`), and using it in an index produces stale results. For indexed computed values, use a generated column — the database maintains it on updates.

</details>