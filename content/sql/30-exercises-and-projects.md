# 30 — Exercises & Project Ideas

## Beginner

### 1. Customer Lookup (SELECT, WHERE, ORDER BY)

Find all customers in NYC or LA, sorted by name. Add a column showing whether their name starts with a vowel.

**Expected output:**

::code-wrapper{language="text"}
```text
 name     | city | starts_with_vowel
----------+------+-------------------
 Alice    | NYC  | t
 Bob      | LA   | f
 Eve      | NYC  | t
```
::

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
SELECT name, city,
  CASE WHEN lower(name) ~ '^[aeiou]' THEN true ELSE false END AS starts_with_vowel
FROM customers
WHERE city IN ('NYC', 'LA')
ORDER BY name;
-- ~ is PostgreSQL regex match operator; ^[aeiou] anchors to start
-- lower() makes it case-insensitive (PostgreSQL regex is case-sensitive by default)
```
::

</details>

### 2. Order Summary (Aggregation, GROUP BY)

For each customer, show their name, number of orders, total spent, and average order amount. Sort by total spent descending. Include customers with zero orders.

**Expected output:**

::code-wrapper{language="text"}
```text
 name    | order_count | total_spent | avg_order
---------+-------------+-------------+----------
 Alice   |          15 |     2340.50 |   156.03
 Bob     |           3 |      450.00 |   150.00
 Charlie |           0 |        0.00 |    0.00
```
::

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
SELECT c.name,
  COUNT(o.id) AS order_count,               -- COUNT(o.id) skips NULLs (unmatched LEFT JOIN)
  COALESCE(SUM(o.amount), 0) AS total_spent, -- SUM of empty set is NULL → COALESCE to 0
  COALESCE(AVG(o.amount), 0) AS avg_order    -- AVG of empty set is NULL → COALESCE to 0
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id   -- LEFT JOIN: customers with 0 orders included
GROUP BY c.id, c.name                         -- group by PK + name for correctness
ORDER BY total_spent DESC;
```
::

</details>

### 3. City Report (GROUP BY, HAVING)

List cities with at least 2 customers, showing the count and the average customer's total spend.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
SELECT c.city,
  COUNT(DISTINCT c.id) AS customer_count,     -- DISTINCT: one customer per row even with multiple orders
  ROUND(AVG(o.total_per_customer), 2) AS avg_customer_spend
FROM customers c
LEFT JOIN LATERAL (
  -- LATERAL: per-customer aggregate, then average across customers per city
  SELECT SUM(amount) AS total_per_customer
  FROM orders o WHERE o.customer_id = c.id
) o ON true
GROUP BY c.city
HAVING COUNT(DISTINCT c.id) >= 2              -- HAVING filters on aggregates (WHERE filters per-row)
ORDER BY avg_customer_spend DESC;
```
::

</details>

### 4. Keyset Pagination (LIMIT, WHERE)

Implement keyset pagination for orders ordered by `(ordered_on DESC, id DESC)`. Write the query for page 1, then page 2 given the last row's `(ordered_on, id)`.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- Page 1: no cursor, just the first 20 rows
SELECT id, customer_id, amount, ordered_on
FROM orders
ORDER BY ordered_on DESC, id DESC  -- unique tie-breaker prevents row drift
LIMIT 20;

-- Page 2: use the last row from page 1 as the cursor
-- Suppose page 1 ended with ordered_on='2024-06-15', id=12345
SELECT id, customer_id, amount, ordered_on
FROM orders
WHERE (ordered_on, id) < ('2024-06-15', 12345)  -- row-wise comparison: skip everything ≤ cursor
ORDER BY ordered_on DESC, id DESC
LIMIT 20;
-- The (ordered_on, id) < (cursor) comparison uses the index efficiently
-- O(log N) to find the start point, vs O(N) for OFFSET pagination
```
::

</details>

### 5. Anti-Join (Customers Without Orders)

Find customers who have never placed an order, using both `LEFT JOIN ... IS NULL` and `NOT EXISTS`. Compare the two approaches.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- Approach 1: LEFT JOIN + IS NULL
SELECT c.name
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.id IS NULL;  -- only unmatched rows (o.* is NULL)
-- The LEFT JOIN produces all customers; the WHERE keeps only unmatched ones

-- Approach 2: NOT EXISTS (NULL-safe, often faster as an Anti Join)
SELECT c.name
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.id
);
-- The planner can implement this as an Anti Join: scan orders and stop
-- at the first match per customer — no need to collect all matches
-- NOT EXISTS is also NULL-safe (unlike NOT IN, which breaks on NULLs)
```
::

</details>

## Intermediate

### 6. Top 3 Orders per Customer (Window Functions)

For each customer, show their top 3 orders by amount. Use `ROW_NUMBER() OVER (PARTITION BY ...)`.

**Expected output:**

::code-wrapper{language="text"}
```text
 customer_id | order_id | amount | rank
-------------+----------+--------+------
           1 |      245 | 500.00 |    1
           1 |      189 | 350.00 |    2
           1 |      412 | 280.00 |    3
           2 |      567 | 900.00 |    1
```
::

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
WITH ranked AS (
  SELECT customer_id, id AS order_id, amount,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn
  FROM orders
  -- ROW_NUMBER assigns 1, 2, 3... within each customer partition
  -- Ties get different numbers (use RANK() if ties should share a rank)
)
SELECT customer_id, order_id, amount, rn AS rank
FROM ranked
WHERE rn <= 3
ORDER BY customer_id, rn;
```
::

</details>

### 7. Running Total with Ties (Window Functions)

For each customer, show each order with a running total of their spending, ordered by date. Handle ties (same-day orders) with `ROWS` (not `RANGE`).

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
SELECT customer_id, id, ordered_on, amount,
  SUM(amount) OVER (
    PARTITION BY customer_id
    ORDER BY ordered_on, id  -- unique tie-breaker for deterministic ordering
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total
FROM orders
ORDER BY customer_id, ordered_on, id;
-- ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW: strict per-row accumulation
-- Without ROWS, the default RANGE includes PEERS (rows with same ordered_on),
-- causing the running total to "jump" — all same-day rows get the same total
-- ROWS ensures each row's running total includes only rows up to that exact row
```
::

</details>

### 8. Monthly Revenue with Zero Months (date_trunc, generate_series)

Build a monthly revenue report for 2024, including months with zero revenue. Use `generate_series` + `LEFT JOIN`.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
WITH months AS (
  -- generate_series produces one row per month, including months with no orders
  SELECT generate_series(
    '2024-01-01'::timestamptz,
    '2024-12-01'::timestamptz,
    '1 month'::interval
  ) AS month
),
monthly_revenue AS (
  SELECT date_trunc('month', ordered_on) AS month, SUM(amount) AS revenue
  FROM orders
  WHERE ordered_on >= '2024-01-01' AND ordered_on < '2025-01-01'
  GROUP BY month
)
SELECT m.month,
  COALESCE(mr.revenue, 0) AS revenue,  -- months with no orders show 0, not NULL
  COUNT(o.id) AS order_count            -- COUNT via a LEFT JOIN to orders
FROM months m
LEFT JOIN monthly_revenue mr ON mr.month = m.month
LEFT JOIN orders o ON date_trunc('month', o.ordered_on) = m.month
GROUP BY m.month, mr.revenue
ORDER BY m.month;
-- The LEFT JOIN from months → revenue ensures all 12 months appear
-- COALESCE converts NULL (no match) to 0 for display
```
::

</details>

### 9. Gaps and Islands — Longest Active Streak

Given an `activity` table `(user_id, activity_date)`, find the longest streak of consecutive active days per user.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
WITH day_marks AS (
  SELECT DISTINCT user_id, activity_date::date AS day  -- DISTINCT: deduplicate same-day events
  FROM activity
),
numbered AS (
  SELECT user_id, day,
    day - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day) AS grp
    -- day - rn is constant within a run of consecutive days (gaps-and-islands trick)
  FROM day_marks
),
streaks AS (
  SELECT user_id, grp, COUNT(*) AS streak_length,
    MIN(day) AS streak_start, MAX(day) AS streak_end
  FROM numbered
  GROUP BY user_id, grp
)
SELECT user_id, streak_length, streak_start, streak_end
FROM streaks
WHERE streak_length = (
  -- Find the max streak per user (if there are multiple max-length streaks, pick any)
  SELECT MAX(s2.streak_length) FROM streaks s2 WHERE s2.user_id = streaks.user_id
)
ORDER BY streak_length DESC;
-- Or simpler with DISTINCT ON (PostgreSQL extension):
-- SELECT DISTINCT ON (user_id) user_id, streak_length, streak_start, streak_end
-- FROM streaks ORDER BY user_id, streak_length DESC;
```
::

</details>

### 10. Pivot Report (Conditional Aggregation)

Pivot monthly revenue into a cross-tab: one row per customer, one column per month (Jan, Feb, Mar).

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
SELECT
  customer_id,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 1) AS jan,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 2) AS feb,
  SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM ordered_on) = 3) AS mar,
  SUM(amount) AS total
FROM orders
WHERE ordered_on >= '2024-01-01' AND ordered_on < '2024-04-01'
GROUP BY customer_id
ORDER BY total DESC NULLS LAST;
-- FILTER is SQL standard, one pass over the data
-- Returns NULL for months with no matching rows (SUM of empty set = NULL)
-- Use COALESCE(SUM(...) FILTER (...), 0) for 0 instead of NULL
```
::

</details>

### 11. Recursive CTE — Org Chart

Given an `employees` table `(id, name, manager_id)`, list all descendants of employee 1 with their depth. Then, build the management chain path as an array.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- List all descendants with depth
WITH RECURSIVE org_tree AS (
  -- Anchor: the root employee
  SELECT id, name, manager_id, 0 AS depth, ARRAY[id] AS path
  FROM employees WHERE id = 1
  UNION ALL
  -- Recursive: find direct reports of each employee in the tree
  SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || e.id
  FROM employees e
  JOIN org_tree t ON e.manager_id = t.id
  -- ⚠️ Ensure there are no cycles — a cycle causes infinite recursion
  -- Add: WHERE NOT e.id = ANY(t.path)  (prevents revisiting a node)
  WHERE NOT e.id = ANY(t.path)
)
SELECT id, name, depth, path FROM org_tree ORDER BY depth, id;
-- path is an array of employee IDs from root to current: {1, 5, 12, 34}
```
::

</details>

### 12. JSONB Events with GIN Index

Create an `events` table with a `JSONB payload`. Insert events with `{"type": "click", "user_id": 42, "amount": 10}`. Create a GIN index and query for all "click" events for user 42 with amount > 5.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- GIN index on the entire JSONB document (supports any key lookup)
CREATE INDEX ON events USING gin (payload);

INSERT INTO events (payload) VALUES
  ('{"type": "click", "user_id": 42, "amount": 10}'),
  ('{"type": "click", "user_id": 42, "amount": 3}'),
  ('{"type": "view", "user_id": 42, "amount": 0}'),
  ('{"type": "click", "user_id": 99, "amount": 50}');

-- Query using the @> containment operator (GIN-indexed)
SELECT * FROM events
WHERE payload @> '{"type": "click", "user_id": 42}'
  AND (payload->>'amount')::numeric > 5;
-- @> checks if the JSONB contains the given key-value pairs (index scan)
-- ->> extracts as text, ::numeric casts for numeric comparison
-- Only the first row matches (click, user 42, amount 10 > 5)
```
::

</details>

## Advanced

### 13. Inventory Reservation (Transactions, FOR UPDATE)

Write a transaction that reserves an item: check stock, decrement if available, record the reservation. Use `SELECT ... FOR UPDATE` to prevent overselling under concurrency.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- CONCURRENCY-SAFE: FOR UPDATE locks the row so concurrent transactions
-- wait until this transaction commits/rolls back before reading the stock
BEGIN;
SELECT qty FROM inventory WHERE product_id = 5 FOR UPDATE;
-- Application checks: if qty > 0, proceed; else ROLLBACK

-- Only execute if qty > 0 (checked in application logic):
UPDATE inventory SET qty = qty - 1 WHERE product_id = 5;
INSERT INTO reservations (product_id, reserved_at) VALUES (5, now());
COMMIT;

-- ⚠️ Alternative: do it in one atomic statement (no race possible):
-- INSERT INTO reservations (product_id, reserved_at)
-- SELECT 5, now()
-- FROM inventory
-- WHERE product_id = 5 AND qty > 0
-- RETURNING (UPDATE inventory SET qty = qty - 1 WHERE product_id = 5) AS new_qty;
-- This uses a CTE with a writable CTE (UPDATE + INSERT in one statement)
```
::

</details>

### 14. SERIALIZABLE Transfer with Retry

Implement a money transfer between two accounts at SERIALIZABLE isolation, with retry on serialization failure. Test that concurrent transfers don't lose money.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- The transfer: atomic decrement + increment, always lock in ascending order
-- to prevent deadlocks (see pitfall #26)
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- Lock accounts in ascending id order to prevent deadlocks
-- If from_id > to_id, swap the lock order
UPDATE accounts SET balance = balance - 100 WHERE id = LEAST(1, 2);
UPDATE accounts SET balance = balance + 100 WHERE id = GREATEST(1, 2);
COMMIT;
-- If this fails with SQLSTATE 40001 (serialization_failure), the application
-- must ROLLBACK and retry the entire transaction from the beginning

-- Application retry logic (pseudo-code):
-- max_retries = 3
-- for attempt in range(max_retries):
--     try:
--         conn.execute("BEGIN ISOLATION LEVEL SERIALIZABLE")
--         conn.execute("UPDATE accounts SET balance = balance - 100 WHERE id = $1", from_id)
--         conn.execute("UPDATE accounts SET balance = balance + 100 WHERE id = $1", to_id)
--         conn.execute("COMMIT")
--         break
--     except sql_error as e:
--         conn.execute("ROLLBACK")
--         if e.sqlstate == '40001' and attempt < max_retries - 1:
--             continue  # retry
--         else:
--             raise  # non-retryable error or max retries exceeded
```
::

</details>

### 15. Audit Trigger

Create an audit trigger that logs every `UPDATE` and `DELETE` on `orders` to an `orders_audit` table with the old and new values, timestamp, and user.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
CREATE TABLE orders_audit (
  id BIGSERIAL PRIMARY KEY,
  operation CHAR(1) NOT NULL,        -- 'U' for UPDATE, 'D' for DELETE
  old_data JSONB,                     -- entire old row as JSONB
  new_data JSONB,                     -- entire new row as JSONB (NULL for DELETE)
  changed_by TEXT DEFAULT current_user,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit_orders() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp  -- SECURITY: explicit search_path prevents hijacking
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO orders_audit (operation, old_data, new_data)
    VALUES ('D', to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO orders_audit (operation, old_data, new_data)
    VALUES ('U', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

-- AFTER trigger: fires after the row is modified, so OLD and NEW are both available
-- ROW level: fires once per affected row
CREATE TRIGGER orders_audit_trigger
AFTER UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION audit_orders();

-- ⚠️ Audit tables grow unboundedly — partition by month and add retention
CREATE TABLE orders_audit (
  id BIGSERIAL,
  operation CHAR(1) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT DEFAULT current_user,
  changed_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (changed_at);
```
::

</details>

### 16. Full-Text Search with Ranking

Build a search over an `articles` table: generate a `tsvector` from title + body (title weighted higher), create a GIN index, and query with ranking and highlighting.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Generated column: tsvector is computed from title + body
  -- setweight(A, 1.0) gives title higher rank than body (weight B)
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', body), 'B')
  ) STORED
);

-- GIN index on the generated tsvector column
CREATE INDEX ON articles USING gin (search_vector);

-- Search with ranking and highlighting
SELECT
  id, title,
  ts_rank(search_vector, websearch_to_tsquery('english', 'postgresql index')) AS rank,
  ts_headline('english', title, websearch_to_tsquery('english', 'postgresql index'),
    'StartSel=<mark>, StopSel=</mark>') AS highlighted_title
FROM articles
WHERE search_vector @@ websearch_to_tsquery('english', 'postgresql index')
ORDER BY rank DESC
LIMIT 20;
-- @@ is the tsvector match operator (uses the GIN index)
-- ts_rank scores by term frequency and weight (title matches rank higher)
-- ts_headline wraps matching terms in <mark> tags for display
-- websearch_to_tsquery supports boolean: 'postgresql AND index', 'postgres OR mysql'
```
::

</details>

### 17. Materialized View with Concurrent Refresh

Create a materialized view for a dashboard (sales by city by month). Refresh it concurrently (add a unique index first). Schedule a refresh with `pg_cron`.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- Materialized view: pre-computes the aggregation, stored on disk
CREATE MATERIALIZED VIEW sales_by_city_month AS
SELECT
  c.city,
  date_trunc('month', o.ordered_on) AS month,
  SUM(o.amount) AS revenue,
  COUNT(*) AS order_count
FROM orders o
JOIN customers c ON c.id = o.customer_id
GROUP BY c.city, date_trunc('month', o.ordered_on);

-- CONCURRENT refresh requires at least one UNIQUE index
-- Without it, REFRESH CONCURRENTLY fails with an error
CREATE UNIQUE INDEX ON sales_by_city_month (city, month);

-- Refresh concurrently (doesn't block reads during refresh):
REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city_month;
-- CONCURRENTLY builds a new version in the background, then swaps
-- Readers see the old version until the swap — no blocking

-- Schedule with pg_cron (requires the extension):
-- CREATE EXTENSION pg_cron;
-- SELECT cron.schedule('refresh_sales', '0 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city_month');
-- Runs at minute 0 of every hour
```
::

</details>

### 18. Multi-Tenant SaaS with RLS

Set up a multi-tenant schema: every table has `tenant_id`, RLS policies enforce `tenant_id = current_setting('app.tenant')`, and the app sets `app.tenant` per request.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  amount NUMERIC(10,2) NOT NULL
);

-- Enable RLS and FORCE it (so even the owner is subject to policies)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- Policy: users can only see rows matching their current tenant
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant')::bigint)
  WITH CHECK (tenant_id = current_setting('app.tenant')::bigint);
-- USING: filters existing rows on SELECT/UPDATE/DELETE
-- WITH CHECK: validates new rows on INSERT/UPDATE

-- Application sets the tenant per request:
SET app.tenant = '42';
SELECT * FROM orders;  -- only sees tenant_id = 42 rows
-- Tenant 99's rows are invisible — no WHERE clause needed in the query

-- ⚠️ Test: verify cross-tenant isolation
-- SET app.tenant = '1'; SELECT count(*) FROM orders;  -- only tenant 1's rows
-- SET app.tenant = '2'; SELECT count(*) FROM orders;  -- only tenant 2's rows
```
::

</details>

### 19. Query Optimization with EXPLAIN ANALYZE

Take a slow query (a 3-table join with a filter), run `EXPLAIN (ANALYZE, BUFFERS)`, identify the bottleneck (seq scan, missing index, bad join order), add an index or rewrite, and measure the improvement.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- The slow query:
SELECT c.name, p.name AS product_name, SUM(oi.quantity * oi.price) AS revenue
FROM customers c
JOIN orders o ON c.id = o.customer_id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE c.city = 'NYC' AND o.ordered_on >= '2024-01-01'
GROUP BY c.name, p.name;

-- Step 1: Diagnose
EXPLAIN (ANALYZE, BUFFERS) [query above];
-- Look for: Seq Scan on a large table, Sort spilled to disk, Nested Loop with loops > 1000

-- Step 2: Common fixes
-- Missing index on orders.customer_id → CREATE INDEX ON orders(customer_id)
-- Missing index on order_items.order_id → CREATE INDEX ON order_items(order_id)
-- Missing index on customers.city → CREATE INDEX ON customers(city)
-- Stale stats → ANALYZE orders; ANALYZE order_items;
-- Sort spill → SET work_mem = '256MB';

-- Step 3: Verify
EXPLAIN (ANALYZE, BUFFERS) [query above];
-- Compare: actual time before vs after, shared reads vs hits, sort method
```
::

</details>

### 20. Batch UPSERT with ON CONFLICT

Write a batch upsert that inserts 10,000 rows, updating existing ones if the primary key conflicts, and returns the count of inserts vs updates.

<details>
<summary>Solution</summary>

::code-wrapper{language="sql"}
```sql
-- Batch upsert with conflict tracking
WITH upsert AS (
  INSERT INTO products (id, name, price, updated_at)
  SELECT id, name, price, now()
  FROM staging_products
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      price = EXCLUDED.price,
      updated_at = now()
  WHERE products.name IS DISTINCT FROM EXCLUDED.name  -- only update if changed
     OR products.price IS DISTINCT FROM EXCLUDED.price
  RETURNING id, (xmax = 0) AS was_inserted
  -- xmax = 0 means the row was INSERTed (not updated); xmax ≠ 0 means UPDATEd
)
SELECT
  COUNT(*) FILTER (WHERE was_inserted) AS inserts,
  COUNT(*) FILTER (WHERE NOT was_inserted) AS updates
FROM upsert;
-- The RETURNING clause captures which rows were inserts vs updates
-- IS DISTINCT FROM prevents unnecessary writes (no WAL/bloat for unchanged rows)
```
::

</details>

## Capstone Project Ideas

### 21. Mini E-Commerce Analytics Database

Design a normalized schema for an e-commerce analytics system: customers, orders, order_items, products, categories (hierarchical). Build a materialized view for "customer lifetime spend" with a concurrent refresh strategy. Add keyset pagination for the orders list. Create a GIN index for product name search.

**Key challenges:**
- Recursive CTE for category hierarchy (products → subcategory → category → department)
- Materialized view refresh strategy (concurrent, scheduled via pg_cron)
- Denormalize a hot query path (customer lifetime spend) with a trigger-maintained summary column on `customers`

### 22. Multi-Tenant SaaS Schema with RLS

Every table has `tenant_id`. RLS policies enforce `tenant_id = current_setting('app.tenant')`. The app sets `app.tenant` per request. Test cross-tenant isolation. Add a superadmin role that bypasses RLS via `BYPASSRLS`.

**Key challenges:**
- `FORCE ROW LEVEL SECURITY` so the owner is also subject to policies
- `BYPASSRLS` attribute for the superadmin role
- Verify that a bug in `SET app.tenant` doesn't leak data (test with mismatched tenant)
- Connection pooling: PgBouncer transaction mode + per-transaction `SET LOCAL app.tenant`

### 23. Audit System with Triggers

Build a generic audit system: a single trigger function that logs any table's changes to a shared `audit_log` table using `to_jsonb(OLD)` and `to_jsonb(NEW)`. Partition the audit log by month. Add retention (drop partitions older than 1 year).

**Key challenges:**
- Generic trigger function using `to_jsonb(OLD)` / `to_jsonb(NEW)` (works for any table)
- Partition by `changed_at` month — automatic partition creation via pg_partman or a cron job
- Retention: `DROP TABLE audit_log_2023_01` is instant (no VACUUM needed)
- Track the `search_path` and `current_user` for accountability

### 24. Real-Time Dashboard with Materialized Views + Keyset Pagination

Build a dashboard materialized view (revenue by day by city) refreshed every 5 minutes. Serve the dashboard with keyset pagination over the materialized view. Add a `REFRESH CONCURRENTLY` strategy with a unique index.

**Key challenges:**
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index
- Keyset pagination over the materialized view (sorted by revenue DESC, city, date)
- Stale data handling: the dashboard shows "last refreshed at" timestamp
- pg_cron schedule with error handling (what if the refresh fails?)

## 📚 Further Reading

- [Use The Index, Luke](https://use-the-index-luke.com) — indexing explained.
- [The Art of PostgreSQL](https://theartofpostgresql.com) — query writing for developers.
- [PostgreSQL Docs](https://www.postgresql.org/docs/) — the reference.
- [PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Main_Page) — performance and tuning guides.
- [pgexercises.com](https://pgexercises.com) — interactive practice.