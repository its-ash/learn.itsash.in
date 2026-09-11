# 29 — Common Pitfalls & Idiomatic Fixes

40+ traps that catch SQL developers, organized by category. Each trap shows the **wrong code**, explains the mechanism, and gives the **idiomatic fix**.

## NULL Traps

### 1. `WHERE col = NULL` Returns Nothing

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: NULL = NULL evaluates to UNKNOWN (not TRUE), so no rows match
SELECT * FROM customers WHERE city = NULL;
-- The = operator with NULL always yields UNKNOWN, which is filtered out

-- ✅ RIGHT: IS NULL is the only NULL-safe comparison
SELECT * FROM customers WHERE city IS NULL;
```
::

### 2. `NOT IN` with NULLs Returns Zero Rows

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: if the subquery returns ANY NULL, NOT IN returns zero rows
-- Mechanism: NOT IN (a, b, NULL) = NOT (x = a OR x = b OR x = NULL)
--   x = NULL → UNKNOWN, OR propagates UNKNOWN, NOT(UNKNOWN) → UNKNOWN → filtered
SELECT * FROM customers c
WHERE c.id NOT IN (SELECT customer_id FROM orders);
-- If orders.customer_id has one NULL (a guest checkout?), the entire result is empty

-- ✅ RIGHT: NOT EXISTS is NULL-safe — it uses a correlated predicate, not a value list
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```
::

### 3. `!=` Silently Drops NULLs

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: city != 'NYC' excludes NULL-city rows (NULL != 'NYC' → UNKNOWN → dropped)
SELECT * FROM customers WHERE city != 'NYC';
-- You lose all customers with NULL city — they're not 'NYC', but they're also not != 'NYC'

-- ✅ RIGHT: IS DISTINCT FROM treats NULL as a comparable distinct value
SELECT * FROM customers WHERE city IS DISTINCT FROM 'NYC';
-- NULL IS DISTINCT FROM 'NYC' → TRUE → included
```
::

### 4. `COUNT(*)` vs `COUNT(col)` in a LEFT JOIN

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: COUNT(*) counts the NULL-extended row for unmatched LEFT JOIN rows as 1
-- A customer with 0 orders: LEFT JOIN produces 1 row (customer + NULLs)
-- COUNT(*) counts that row → reports 1 order, should be 0
SELECT c.name, COUNT(*) AS order_count
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;
-- A customer with zero orders shows order_count = 1 (the NULL row)

-- ✅ RIGHT: COUNT(o.id) skips NULLs — counts only matched rows
SELECT c.name, COUNT(o.id) AS order_count
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;
-- A customer with zero orders: o.id is NULL → COUNT skips it → 0
```
::

### 5. `AVG` Ignores NULLs, Doesn't Average Them as 0

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: expecting AVG([10, NULL, 20]) = 10 (treating NULL as 0)
-- AVG skips NULLs → AVG(10, 20) = 15 (divides by 2, not 3)
SELECT AVG(amount) FROM orders;
-- If 30% of rows have NULL amount, AVG is biased high (only non-NULL rows counted)

-- ✅ RIGHT: if NULL means 0, COALESCE before averaging
SELECT AVG(COALESCE(amount, 0)) FROM orders;
-- AVG(10, 0, 20) = 10 — NULLs treated as 0, denominator includes all rows
-- ⚠️ But ask: does NULL semantically mean 0, or "unknown"? If "unknown",
-- skipping it (default AVG behavior) is correct — don't COALESCE.
```
::

### 6. `SUM` of No Rows is NULL, Not 0

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: expecting SUM to return 0 for an empty group
SELECT SUM(amount) AS total FROM orders WHERE customer_id = 99999;
-- Returns NULL, not 0 — SUM of an empty set is NULL

-- ✅ RIGHT: COALESCE to 0 for downstream code that expects a number
SELECT COALESCE(SUM(amount), 0) AS total FROM orders WHERE customer_id = 99999;
-- Returns 0 — downstream code won't crash on NULL arithmetic
```
::

### 7. String Concatenation with NULL Yields NULL

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: 'hello' || NULL = NULL — the entire string is destroyed
SELECT first_name || ' ' || middle_name || ' ' || last_name AS full_name
FROM customers;
-- If middle_name is NULL, full_name is NULL for every customer without a middle name

-- ✅ RIGHT: CONCAT ignores NULLs, or COALESCE each column
SELECT CONCAT(first_name, ' ', middle_name, ' ', last_name) AS full_name
FROM customers;
-- CONCAT('John', ' ', NULL, ' ', 'Doe') = 'John  Doe' (NULL skipped, spaces preserved)
-- For tighter control: COALESCE each part
SELECT first_name || COALESCE(' ' || middle_name, '') || ' ' || last_name AS full_name
FROM customers;
-- 'John' || '' || ' Doe' = 'John Doe' (no double space when middle_name is NULL)
```
::

### 8. `CHECK` Constraint Allows NULLs

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: CHECK (price > 0) passes for price = NULL
-- CHECK evaluates to UNKNOWN for NULL → UNKNOWN passes (only FALSE fails)
CREATE TABLE products (price NUMERIC CHECK (price > 0));
INSERT INTO products VALUES (NULL);  -- succeeds! NULL > 0 → UNKNOWN → passes

-- ✅ RIGHT: add NOT NULL constraint separately, or combine in CHECK
CREATE TABLE products (
  price NUMERIC NOT NULL CHECK (price > 0)  -- NOT NULL + CHECK
);
-- Or: CHECK (price IS NOT NULL AND price > 0) — but NOT NULL column constraint is cleaner
```
::

## JOIN Traps

### 9. `LEFT JOIN` + `WHERE` on the Right Table Demotes to INNER JOIN

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: WHERE o.amount > 100 drops customers with no orders
-- Unmatched LEFT JOIN rows have o.* = NULL; NULL > 100 → UNKNOWN → filtered
SELECT c.name, o.amount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.amount > 100;
-- This is effectively an INNER JOIN — customers with 0 orders or orders ≤ 100 are gone

-- ✅ RIGHT: put right-table filters in ON (not WHERE)
SELECT c.name, o.amount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id AND o.amount > 100;
-- ON is evaluated during the join; WHERE is evaluated after
-- Customers with no qualifying orders still appear (with NULL amount)
```
::

### 10. Joining on NULL Doesn't Match

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: NULL = NULL → UNKNOWN → not a match
SELECT * FROM a JOIN b ON a.col = b.col;
-- Rows where both a.col and b.col are NULL don't join — NULL doesn't equal NULL

-- ✅ RIGHT: IS NOT DISTINCT FROM (NULL-safe equality)
SELECT * FROM a JOIN b ON a.col IS NOT DISTINCT FROM b.col;
-- NULL IS NOT DISTINCT FROM NULL → TRUE → matches
-- ⚠️ But: this can't use a regular B-tree index → full scan
-- Better: fix the schema — avoid NULL join keys, use a sentinel value or NOT NULL
```
::

### 11. Row Multiplication from a "Many" Join

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: joining customers to orders returns one row per order, not per customer
SELECT c.name FROM customers c JOIN orders o ON c.id = o.customer_id;
-- A customer with 100 orders appears 100 times in the result

-- ✅ RIGHT: use DISTINCT or aggregate if you want one row per customer
SELECT DISTINCT c.name FROM customers c JOIN orders o ON c.id = o.customer_id;
-- Or aggregate:
SELECT c.name, COUNT(o.id) AS order_count
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name;
```
::

### 12. `NATURAL JOIN` Joins on All Same-Named Columns

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: NATURAL JOIN silently joins on ALL same-named columns
SELECT * FROM customers NATURAL JOIN orders;
-- If both tables have `id`, it joins on `id` — but customer.id ≠ orders.id!
-- Adding a new same-named column changes the join behavior silently

-- ✅ RIGHT: never use NATURAL JOIN. Use explicit ON or USING
SELECT * FROM customers c JOIN orders o ON c.id = o.customer_id;
-- Or USING (when the column is the same name and same meaning):
SELECT * FROM customers JOIN orders USING (customer_id);
```
::

### 13. Accidental CROSS JOIN

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: missing ON clause creates a Cartesian product
SELECT * FROM customers, orders;  -- N × M rows (every customer × every order)
-- If customers has 10K rows and orders has 1M → 10 billion rows

-- ✅ RIGHT: always specify the join condition
SELECT * FROM customers c JOIN orders o ON c.id = o.customer_id;
```
::

## Performance Traps

### 14. `SELECT *` in Production

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: fetches all columns, prevents Index Only Scan, wastes bandwidth
SELECT * FROM orders WHERE customer_id = 42;
-- If orders has 50 columns including large JSONB, you transfer all of them
-- No covering index can satisfy SELECT * (unless it includes all columns)

-- ✅ RIGHT: select only needed columns — enables Index Only Scan
SELECT id, amount FROM orders WHERE customer_id = 42;
-- With CREATE INDEX ON orders(customer_id) INCLUDE (amount), this is an
-- Index Only Scan — zero heap fetches
```
::

### 15. Leading Wildcard `LIKE` Defeats the Index

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: LIKE '%john%' can't use a B-tree index (leading wildcard)
-- B-tree indexes sort prefix-first; a leading % means scan every leaf node
SELECT * FROM customers WHERE name LIKE '%john%';

-- ✅ RIGHT: use pg_trgm GIN/GiST index for substring search
CREATE EXTENSION pg_trgm;
CREATE INDEX ON customers USING gin (name gin_trgm_ops);
SELECT * FROM customers WHERE name LIKE '%john%';  -- now uses the GIN index
-- Or: for word-level search, use full-text search with tsvector + GIN
```
::

### 16. `OFFSET` Pagination at Scale

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: OFFSET 100000 scans and discards 100000 rows
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 100000;
-- The database reads 100020 rows, discards 100000, returns 20
-- Page 5000 is as slow as the first page of a 100K-row scan

-- ✅ RIGHT: keyset pagination — use WHERE to skip directly to the offset
SELECT * FROM orders
WHERE (ordered_on, id) < ('2024-06-15', 12345)  -- last row from previous page
ORDER BY ordered_on DESC, id DESC
LIMIT 20;
-- Uses the index to find the start point — O(log N), not O(N)
```
::

### 17. `NOT IN` vs `NOT EXISTS` Performance

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: NOT IN can be slow and is NULL-unsafe (see trap #2)
SELECT * FROM customers c
WHERE c.id NOT IN (SELECT customer_id FROM orders);

-- ✅ RIGHT: NOT EXISTS is NULL-safe and often faster (anti-join optimization)
SELECT * FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
-- The planner can implement NOT EXISTS as an Anti Join — stop scanning
-- orders as soon as one match is found per customer
```
::

### 18. Correlated Subquery Re-Execution

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: correlated subquery executes once per outer row
SELECT c.name,
  (SELECT SUM(amount) FROM orders o WHERE o.customer_id = c.id) AS total
FROM customers c;
-- 10K customers → 10K subquery executions

-- ✅ RIGHT: use a JOIN + GROUP BY (single pass over orders)
SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name;
-- Or LATERAL if you need complex per-row logic
```
::

### 19. Missing Index on Foreign Key

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: FK without an index on the child column
ALTER TABLE orders ADD CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
-- No index on orders.customer_id → ON DELETE CASCADE does a full scan of orders
-- JOINs on customer_id also do full scans

-- ✅ RIGHT: always index FK columns
CREATE INDEX ON orders(customer_id);
-- Now CASCADE deletes and JOINs use an index lookup
```
::

### 20. Function Wrapping Prevents Index Use

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: lower(email) prevents using an index on email
SELECT * FROM users WHERE lower(email) = 'john@example.com';
-- The function transforms the column — the index on email is on the raw value

-- ✅ RIGHT: create an expression index matching the function
CREATE INDEX ON users (lower(email));
SELECT * FROM users WHERE lower(email) = 'john@example.com';  -- uses expression index
-- Or: use a case-insensitive collation (no function needed)
CREATE INDEX ON users (email COLLATE "und-x-icu");
SELECT * FROM users WHERE email = 'john@example.com';  -- case-insensitive match
```
::

## Type Traps

### 21. Floating-Point for Money

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: float is binary — 0.1 + 0.2 ≠ 0.3
CREATE TABLE orders (amount float);
INSERT INTO orders VALUES (0.1), (0.2);
SELECT SUM(amount) FROM orders;  -- 0.30000000000000004

-- ✅ RIGHT: NUMERIC/DECIMAL for exact decimal arithmetic
CREATE TABLE orders (amount NUMERIC(10,2));
INSERT INTO orders VALUES (0.10), (0.20);
SELECT SUM(amount) FROM orders;  -- 0.30 exactly
-- NUMERIC stores decimal digits exactly, at the cost of slower arithmetic
```
::

### 22. `char(n)` Padding and Comparison Surprises

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: char(n) pads with spaces — comparisons are surprising
CREATE TABLE t (code char(3));
INSERT INTO t VALUES ('NY');  -- stored as 'NY ' (padded to 3)
SELECT * FROM t WHERE code = 'NY';   -- may match (trailing spaces ignored in char)
SELECT * FROM t WHERE code = 'NY ';  -- also matches
-- Length checks: char_length(code) = 3, not 2

-- ✅ RIGHT: use text or varchar(n) — no padding, predictable behavior
CREATE TABLE t (code varchar(3));
INSERT INTO t VALUES ('NY');  -- stored as 'NY' (no padding)
SELECT * FROM t WHERE code = 'NY';  -- matches
SELECT * FROM t WHERE code = 'NY '; -- does NOT match (different string)
```
::

### 23. Implicit Type Coercion

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: comparing string to integer triggers implicit cast — defeats index
SELECT * FROM orders WHERE id = '42';  -- id is integer, '42' is text
-- PG casts '42' to integer (not the other way) — but some engines cast the column
-- to string, which prevents index use on the integer column

-- ✅ RIGHT: match the column type exactly
SELECT * FROM orders WHERE id = 42;  -- integer = integer, index used
```
::

### 24. `TIMESTAMP` Without Time Zone

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: TIMESTAMP (without time zone) is ambiguous
-- It stores a wall-clock time with NO zone — interpretation depends on the session
CREATE TABLE events (created_at TIMESTAMP);
INSERT INTO events VALUES ('2024-06-15 14:30:00');
-- Is this UTC? Local time? Nobody knows — the zone is lost

-- ✅ RIGHT: use TIMESTAMPTZ for event times
CREATE TABLE events (created_at TIMESTAMPTZ);
INSERT INTO events VALUES ('2024-06-15 14:30:00+00');
-- Stored as UTC, displayed in the session's time zone
-- No ambiguity — the instant is fixed
```
::

## Transaction Traps

### 25. Lost Updates at READ COMMITTED

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: read-then-write — another transaction's update is overwritten
-- T1: SELECT balance FROM accounts WHERE id = 1;  -- 100
-- T2: SELECT balance FROM accounts WHERE id = 1;  -- 100
-- T1: UPDATE accounts SET balance = 100 - 10 WHERE id = 1;  -- 90
-- T2: UPDATE accounts SET balance = 100 - 20 WHERE id = 1;  -- 80 (T1's update lost!)

-- ✅ RIGHT: atomic update (reads and writes in one statement)
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
-- The row is locked for the duration; balance is read and written atomically
-- Or: SELECT ... FOR UPDATE to lock the row
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;  -- locks the row
-- application checks balance
UPDATE accounts SET balance = 90 WHERE id = 1;
COMMIT;
```
::

### 26. Deadlocks from Inconsistent Lock Ordering

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: T1 locks A then B; T2 locks B then A → deadlock
-- T1: BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 1; -- locks id=1
-- T2: BEGIN; UPDATE accounts SET balance = balance - 10 WHERE id = 2; -- locks id=2
-- T1: UPDATE accounts SET balance = balance + 10 WHERE id = 2; -- waits for T2's lock
-- T2: UPDATE accounts SET balance = balance + 10 WHERE id = 1; -- waits for T1's lock
-- → DEADLOCK — one transaction is aborted with 40P01

-- ✅ RIGHT: always lock in a consistent order (e.g., ascending id)
-- Both transactions lock id=1 first, then id=2:
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 1;  -- lock smaller id first
UPDATE accounts SET balance = balance + 10 WHERE id = 2;
COMMIT;
```
::

### 27. Long Transactions Block VACUUM

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: transaction spans an HTTP call — holds locks and pins dead tuples
BEGIN;
SELECT * FROM orders WHERE id = 1 FOR UPDATE;
-- ... application makes an HTTP call to a payment gateway (5 seconds) ...
-- During those 5 seconds: VACUUM can't reclaim dead tuples that are newer
-- than this transaction's snapshot → bloat accumulates
UPDATE orders SET status = 'paid' WHERE id = 1;
COMMIT;

-- ✅ RIGHT: keep transactions short — never span external calls
-- Do the HTTP call OUTSIDE the transaction:
result = call_payment_gateway(order_id)  -- no transaction open
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 1;
COMMIT;
-- Or: set idle_in_transaction_session_timeout = '10s' to kill stuck sessions
```
::

### 28. SERIALIZABLE Without Retry

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: using SERIALIZABLE but not retrying on serialization failure
SET transaction_isolation = 'serializable';
BEGIN;
SELECT balance FROM accounts WHERE id = 1;
-- ... concurrent transaction modifies the same row ...
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
COMMIT;
-- → ERROR: could not serialize access due to concurrent update (40001)
-- Application crashes instead of retrying

-- ✅ RIGHT: retry the entire transaction on 40001
-- In application code (Python example):
-- for attempt in range(3):
--     try:
--         conn.execute("BEGIN ISOLATION LEVEL SERIALIZABLE")
--         ... transaction body ...
--         conn.execute("COMMIT")
--         break
--     except SerializationFailure:
--         conn.execute("ROLLBACK")
--         continue
```
::

## Schema Traps

### 29. Missing Constraints

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: no constraints — bad data enters silently
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  amount NUMERIC,
  status TEXT,
  created_at TIMESTAMP
);
-- customer_id can reference a nonexistent customer
-- amount can be negative, NULL, or 0
-- status can be any string ('pinding', 'PAID!', null)

-- ✅ RIGHT: constrain everything
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
::

### 30. Over-Indexing

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: index every column "just in case"
CREATE INDEX ON orders(customer_id);
CREATE INDEX ON orders(amount);
CREATE INDEX ON orders(status);
CREATE INDEX ON orders(ordered_on);
CREATE INDEX ON orders(customer_id, amount);
CREATE INDEX ON orders(customer_id, status);
CREATE INDEX ON orders(customer_id, ordered_on);
-- Each index slows INSERT/UPDATE/DELETE (maintain every index on every write)
-- Each index consumes disk + cache space (fewer pages for actual data in shared_buffers)

-- ✅ RIGHT: measure with EXPLAIN, index only what queries need
EXPLAIN (ANALYZE) SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
-- If a single composite index covers it:
CREATE INDEX ON orders(customer_id, status) INCLUDE (amount);
-- One index serves this query AND related queries (customer_id + status prefix)
```
::

### 31. Premature Denormalization

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: denormalizing before you have a measured performance problem
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT,
  customer_name TEXT,      -- denormalized — what if customer changes name?
  customer_email TEXT,     -- denormalized — goes stale
  amount NUMERIC
);
-- Now you must UPDATE every order when a customer's name/email changes
-- And the data can be inconsistent (some orders have old name, some new)

-- ✅ RIGHT: normalize first, denormalize only when measured to be needed
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id),
  amount NUMERIC
);
CREATE TABLE customers (
  id BIGINT PRIMARY KEY,
  name TEXT,
  email TEXT
);
-- If JOINs are slow, add a covering index or materialized view — don't duplicate data
```
::

### 32. `SERIAL` vs `IDENTITY`

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: SERIAL creates an implicit sequence that's hard to manage
CREATE TABLE orders (id SERIAL PRIMARY KEY);
-- The sequence is named orders_id_seq — renaming the table doesn't rename it
-- pg_dump may not restore the sequence correctly across schema changes
-- Can't easily override the value in INSERT (must use OVERRIDING SYSTEM VALUE)

-- ✅ RIGHT: IDENTITY columns (SQL standard, PG 10+)
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);
-- Sequence is managed internally, tied to the column
-- GENERATED ALWAYS prevents accidental INSERT of explicit values
-- For controlled overrides: INSERT INTO orders (id, ...) OVERRIDING SYSTEM VALUE VALUES (100, ...)
-- IDENTITY is SQL standard, more portable, and cleaner for schema management
```
::

## GROUP BY Traps

### 33. Column in SELECT but Not in GROUP BY or Aggregated

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: amount is neither in GROUP BY nor aggregated
SELECT customer_id, amount FROM orders GROUP BY customer_id;
-- ERROR: column "orders.amount" must appear in GROUP BY or be used in an aggregate

-- ✅ RIGHT: aggregate it or add to GROUP BY
SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id;
-- Or: SELECT customer_id, amount FROM orders GROUP BY customer_id, amount;
```
::

### 34. Aggregate in WHERE

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: WHERE is evaluated per-row, aggregates work on groups
SELECT customer_id FROM orders WHERE SUM(amount) > 100 GROUP BY customer_id;
-- ERROR: aggregate functions are not allowed in WHERE

-- ✅ RIGHT: use HAVING (evaluated after GROUP BY, on aggregates)
SELECT customer_id FROM orders GROUP BY customer_id HAVING SUM(amount) > 100;
```
::

### 35. Alias in WHERE

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: alias is created in SELECT, which runs after WHERE
SELECT amount * 1.08 AS taxed FROM orders WHERE taxed > 100;
-- ERROR: column "taxed" does not exist
-- SQL execution order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT

-- ✅ RIGHT: repeat the expression or use an outer query
SELECT amount * 1.08 AS taxed FROM orders WHERE amount * 1.08 > 100;
-- Or: SELECT * FROM (SELECT amount * 1.08 AS taxed FROM orders) t WHERE taxed > 100;
```
::

## Ordering and Pagination Traps

### 36. `LIMIT` Without `ORDER BY` Is Non-Deterministic

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: no ORDER BY → arbitrary rows (depends on physical layout)
SELECT * FROM orders LIMIT 10;
-- Returns whatever 10 rows the scan happens to hit first — may differ between runs

-- ✅ RIGHT: always pair LIMIT with ORDER BY on a unique key
SELECT * FROM orders ORDER BY id LIMIT 10;
```
::

### 37. Pagination Without a Unique Tie-Breaker

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: ORDER BY ordered_on isn't unique — tied rows drift between pages
SELECT * FROM orders ORDER BY ordered_on DESC LIMIT 10 OFFSET 10;
-- On page 1 you get rows with ordered_on = '2024-06-15'
-- On page 2, if the physical order changed (VACUUM, new index), different
-- rows with the same ordered_on appear → duplicate or skipped rows

-- ✅ RIGHT: add a unique tie-breaker
SELECT * FROM orders ORDER BY ordered_on DESC, id DESC LIMIT 10 OFFSET 10;
-- id is unique → the sort is total → no ambiguity → no drift
```
::

### 38. NULL Sort Order Is Engine-Specific

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: assuming NULLs sort first (or last) across all engines
-- PostgreSQL: NULLs sort LAST by default in ASC, FIRST in DESC
-- MySQL: NULLs sort FIRST in ASC, LAST in DESC
-- SQLite: NULLs sort FIRST in ASC

-- ✅ RIGHT: specify explicitly
SELECT * FROM orders ORDER BY amount DESC NULLS LAST;
-- Or portable: ORDER BY (amount IS NULL), amount DESC
```
::

## Index Traps

### 39. Composite Index Leftmost-Prefix Rule

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: expecting (customer_id, ordered_on) to serve WHERE ordered_on = ...
CREATE INDEX ON orders(customer_id, ordered_on);
SELECT * FROM orders WHERE ordered_on >= '2024-01-01';
-- Can't use the index — ordered_on is the second column, not the prefix
-- B-tree indexes are sorted by customer_id first, then ordered_on within each
-- customer_id. Without a customer_id filter, the index can't narrow the search.

-- ✅ RIGHT: add a separate index for the non-prefix column
CREATE INDEX ON orders(ordered_on);
-- Or: if ordered_on-only queries dominate, reorder the composite:
CREATE INDEX ON orders(ordered_on, customer_id);
```
::

### 40. `!=` / `<>` Rarely Uses Indexes

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: != matches most rows → index is more expensive than seq scan
SELECT * FROM orders WHERE status != 'cancelled';
-- If 99% of rows are not cancelled, the index would fetch 99% of the table
-- via random I/O — a seq scan is cheaper (sequential is cheaper than random)

-- ✅ RIGHT: use a positive form (indexable) or a partial index
SELECT * FROM orders WHERE status IN ('pending', 'paid', 'shipped');
-- Or: partial index excluding the common case
CREATE INDEX ON orders(id) WHERE status != 'cancelled';
```
::

## DDL Traps

### 41. `ALTER COLUMN ... TYPE` Rewrites the Table

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: changing column type rewrites the entire table
ALTER TABLE orders ALTER COLUMN amount TYPE NUMERIC(12,2);
-- Takes ACCESS EXCLUSIVE lock — no reads or writes until complete
-- On a billion-row table, this is hours of downtime

-- ✅ RIGHT: add new column, backfill in batches, swap, drop old
ALTER TABLE orders ADD COLUMN amount_new NUMERIC(12,2);
-- Backfill in batches (no long lock):
UPDATE orders SET amount_new = amount WHERE id BETWEEN 1 AND 10000;
UPDATE orders SET amount_new = amount WHERE id BETWEEN 10001 AND 20000;
-- ... etc
ALTER TABLE orders RENAME COLUMN amount TO amount_old;
ALTER TABLE orders RENAME COLUMN amount_new TO amount;
ALTER TABLE orders DROP COLUMN amount_old;
-- Each step is brief; the batched updates don't hold a long lock
```
::

### 42. `TRUNCATE` Doesn't Reset Sequences

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: TRUNCATE clears data but leaves the sequence at its old position
TRUNCATE orders;
INSERT INTO orders (customer_id, amount) VALUES (1, 100);
-- id = 1000001 (continuing from where the sequence was before TRUNCATE)

-- ✅ RIGHT: use RESTART IDENTITY to reset sequences
TRUNCATE orders RESTART IDENTITY;
INSERT INTO orders (customer_id, amount) VALUES (1, 100);
-- id = 1 (sequence restarted)
```
::

## Security Traps

### 43. Table Owner Bypasses RLS

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: app connects as the table owner — RLS doesn't apply
-- By default, the table owner bypasses Row Level Security
CREATE TABLE orders (id INT, tenant_id INT, amount NUMERIC);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders USING (tenant_id = current_setting('app.tenant')::int);
-- But if the app connects as the owner (postgres), RLS is bypassed!

-- ✅ RIGHT: FORCE RLS, or connect as a non-owner role
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
-- Now even the owner is subject to RLS policies
-- Better: use a dedicated app role (not the owner) for the application
```
::

### 44. `SECURITY DEFINER` Without `search_path`

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: definer function with default search_path — vulnerable to hijacking
CREATE FUNCTION get_balance(p_id INT) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT balance FROM accounts WHERE id = p_id);  -- unqualified table name
END;
$$;
-- If an attacker can create a table named `accounts` in a schema that's
-- earlier in search_path, the function reads from the attacker's table

-- ✅ RIGHT: set search_path explicitly in the function
CREATE FUNCTION get_balance(p_id INT) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp  -- pg_temp LAST — prevents temp table hijacking
AS $$
BEGIN
  RETURN (SELECT balance FROM public.accounts WHERE id = p_id);  -- schema-qualified
END;
$$;
```
::

## Query Plan Traps

### 45. `MATERIALIZED` CTE Prevents Predicate Pushdown

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: MATERIALIZED forces the full CTE to be computed before filtering
WITH x AS MATERIALIZED (
  SELECT * FROM orders  -- computes ALL orders (50M rows)
)
SELECT * FROM x WHERE customer_id = 42;
-- The WHERE is applied AFTER the CTE materializes — scans all 50M rows

-- ✅ RIGHT: drop MATERIALIZED (let the planner inline and push predicates)
WITH x AS (
  SELECT * FROM orders
)
SELECT * FROM x WHERE customer_id = 42;
-- PG 12+ defaults to NOT MATERIALIZED for non-recursive CTEs
-- The planner inlines → pushes WHERE into the CTE → uses index on customer_id
```
::

## 🧠 Spot the Bug (Comprehensive)

A developer writes a report query and gets wrong results — NULL customers excluded, averages off, and pagination skips rows. Find all the issues:

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

1. **`LEFT JOIN` demoted to INNER JOIN** (trap #9): `WHERE o.amount > 50` filters on the right table in `WHERE`, dropping customers with no orders (the NULL-extended rows have `o.amount = NULL`, and `NULL > 50` is UNKNOWN, not TRUE). The `LEFT JOIN` is pointless — it behaves as an `INNER JOIN`. Fix: move the filter to `ON`: `LEFT JOIN orders o ON c.id = o.customer_id AND o.amount > 50`.

2. **`AVG` ignores NULLs** (trap #5): for a customer with no orders > 50, `AVG(o.amount)` is NULL (no non-NULL values). If the intent was "customers with no qualifying orders show 0," wrap: `COALESCE(AVG(o.amount), 0)`. But if the intent is "only show customers with qualifying orders," the `INNER JOIN` (original behavior) is correct — just remove the `LEFT JOIN` to make the intent explicit.

3. **Pagination without a tie-breaker** (trap #37): `ORDER BY avg_order DESC LIMIT 10` — `avg_order` isn't unique; tied customers can drift between pages. Fix: add a tie-breaker: `ORDER BY avg_order DESC, c.id`.

The corrected query (assuming "all customers, with their average order > 50, or 0 if none"):

::code-wrapper{language="sql"}
```sql
SELECT c.name, COALESCE(AVG(o.amount), 0) AS avg_order
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id AND o.amount > 50
GROUP BY c.id, c.name
ORDER BY avg_order DESC, c.id
LIMIT 10;
```
::

**The lessons**: right-table filters go in `ON` for a `LEFT JOIN`; `AVG` of NULLs is NULL (use `COALESCE` if you want 0); `ORDER BY` for pagination needs a unique tie-breaker.

</details>