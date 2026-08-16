# 30 — Exercises & Project Ideas

Practice makes SQL stick. These exercises and projects progress from beginner to pro, covering every chapter. Set up the sample database (chapter 01) and work through them.

## Beginner

### 1. Customer Lookup (SELECT, WHERE, ORDER BY)

Write a query to find all customers in NYC or LA, sorted by name. Add a column showing whether their name starts with a vowel.

::code-wrapper{language="sql"}
```sql
SELECT name, city,
  CASE WHEN lower(name) ~ '^[aeiou]' THEN true ELSE false END AS starts_with_vowel
FROM customers
WHERE city IN ('NYC', 'LA')
ORDER BY name;
```
::

### 2. Order Summary (aggregation, GROUP BY)

For each customer, show their name, number of orders, total spent, and average order amount. Sort by total spent descending.

::code-wrapper{language="sql"}
```sql
SELECT c.name, COUNT(o.id) AS order_count,
  COALESCE(SUM(o.amount), 0) AS total_spent,
  COALESCE(AVG(o.amount), 0) AS avg_order
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name
ORDER BY total_spent DESC;
```
::

### 3. City Report (GROUP BY, HAVING)

List cities with at least 2 customers, showing the count and the average customer's total spend.

### 4. Pagination (LIMIT, keyset)

Implement keyset pagination for orders ordered by `(ordered_on DESC, id DESC)` — write the query for page 1, then page 2 given the last row's `(ordered_on, id)`.

### 5. Missing Data (anti-join)

Find customers who have never placed an order, using `LEFT JOIN ... IS NULL` and `NOT EXISTS`. Compare the two approaches.

## Intermediate

### 6. Top 3 Orders per Customer (window functions)

For each customer, show their top 3 orders by amount. Use `ROW_NUMBER() OVER (PARTITION BY ...)`.

::code-wrapper{language="sql"}
```sql
WITH ranked AS (
  SELECT customer_id, id, amount,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rn
  FROM orders
)
SELECT customer_id, id, amount FROM ranked WHERE rn <= 3 ORDER BY customer_id, rn;
```
::

### 7. Running Total (window functions)

For each customer, show each order with a running total of their spending, ordered by date. Handle ties (same-day orders) with `ROWS`.

### 8. Monthly Revenue (date_trunc, generate_series)

Build a monthly revenue report for 2024, including months with zero revenue (use `generate_series` + `LEFT JOIN`).

### 9. Gaps and Islands (advanced pattern)

Given an `activity` table `(user_id, activity_date)`, find the longest streak of consecutive active days per user.

### 10. Pivot (conditional aggregation)

Pivot the monthly revenue into a cross-tab: one row per customer, one column per month (Jan, Feb, Mar).

### 11. Recursive Hierarchy (recursive CTE)

Given an `employees` table `(id, name, manager_id)`, list all descendants of employee 1 with their depth. Then, build the management chain path as an array.

### 12. JSONB Events (JSON, indexing)

Create an `events` table with a `JSONB payload`. Insert events with `{"type": "click", "user_id": 42, "amount": 10}`. Create a GIN index and query for all "click" events for user 42 with amount > 5.

## Advanced

### 13. Inventory Reservation (transactions, FOR UPDATE)

Write a transaction that reserves an item: check stock, decrement if available, record the reservation. Use `SELECT ... FOR UPDATE` to prevent overselling under concurrency.

::code-wrapper{language="sql"}
```sql
BEGIN;
SELECT qty FROM inventory WHERE product_id = 5 FOR UPDATE;
-- if qty > 0:
UPDATE inventory SET qty = qty - 1 WHERE product_id = 5;
INSERT INTO reservations (product_id, reserved_at) VALUES (5, now());
COMMIT;
-- else: ROLLBACK
``
::

### 14. SERIALIZABLE Transfer (isolation, retry)

Implement a money transfer between two accounts at SERIALIZABLE isolation, with retry on serialization failure. Test that concurrent transfers don't lose money.

### 15. Audit Trigger (triggers)

Create an audit trigger that logs every `UPDATE` and `DELETE` on `orders` to an `orders_audit` table with the old and new values, timestamp, and user.

### 16. Search Engine (full-text search)

Build a search over an `articles` table: generate a `tsvector` from title + body (title weighted higher), create a GIN index, and query with ranking and highlighting. Support multi-word queries with `&`.

### 17. Materialized View Dashboard (materialized views, refresh)

Create a materialized view for a dashboard (e.g., sales by city by month). Refresh it concurrently (add a unique index first). Schedule a refresh with `pg_cron`.

### 18. Multi-Tenant RLS (security)

Set up a multi-tenant schema: every table has `tenant_id`, RLS policies enforce `tenant_id = current_setting('app.tenant')`, and the app sets `app.tenant` per request. Test that a query with tenant=1 doesn't see tenant=2's rows.

### 19. Query Optimization (EXPLAIN)

Take a slow query (a 3-table join with a filter), run `EXPLAIN (ANALYZE, BUFFERS)`, identify the bottleneck (seq scan, missing index, bad join order), add an index or rewrite, and measure the improvement.

### 20. Backup and Restore (administration)

Take a `pg_dump` of your database, drop a table, restore it from the dump, and verify the data. Then, set up WAL archiving and test point-in-time recovery (restore to a specific timestamp).

## Pro / Capstone

### 21. ETL Pipeline (stored procedure, batches)

Write a stored procedure that archives orders older than N days, in batches of 10000, committing per batch, with progress logging (`RAISE NOTICE`). Test with a million-row table.

### 22. Analytics Schema (data modeling)

Design a normalized schema for an e-commerce analytics system: customers, orders, order_items, products, categories (hierarchical), events. Then denormalize a hot query path (e.g., "customer lifetime spend") with a materialized view or a trigger-maintained summary column.

### 23. Job Queue (SKIP LOCKED, transactions)

Build a database-backed job queue: a `jobs` table, workers grab the next pending job with `FOR UPDATE SKIP LOCKED`, mark it in-progress, process, mark done. Handle worker crashes (stale in-progress jobs) with a timeout.

### 24. Time-Series Aggregation (date_trunc, BRIN, partitioning)

Build a time-series table for millions of log events. Partition it by month. Add a BRIN index on the timestamp. Aggregate events per hour with `date_trunc` + `generate_series`. Drop an old partition and observe it's instant.

### 25. Full-Stack Search App (FTS, ranking, highlighting)

Build a search interface over a documents table: support boolean queries (`postgres & index`), phrase queries (`full text search`), prefix matching (`post:*`), ranking by `ts_rank`, and result highlighting with `ts_headline`. Add a trigram fallback for substring search.

## Exercise: Find the Bug

For each query below, find the bug and write the fix. (Answers in `<details>`.)

### A. NULL in NOT IN

::code-wrapper{language="sql"}
```sql
SELECT * FROM customers WHERE id NOT IN (SELECT customer_id FROM orders);
```
::

<details>
<summary>Answer</summary>

If `orders.customer_id` has any NULL, `NOT IN` returns zero rows. Fix: `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`.
</details>

### B. LEFT JOIN demoted

::code-wrapper{language="sql"}
```sql
SELECT c.name, COUNT(o.id) AS n
FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.ordered_on >= '2024-01-01'
GROUP BY c.name;
```
::

<details>
<summary>Answer</summary>

`WHERE o.ordered_on >= ...` drops customers with no orders (NULL → UNKNOWN). Fix: move to `ON`: `LEFT JOIN orders o ON c.id = o.customer_id AND o.ordered_on >= '2024-01-01'`.
</details>

### C. Alias in WHERE

::code-wrapper{language="sql"}
```sql
SELECT amount * 1.08 AS taxed FROM orders WHERE taxed > 100;
```
::

<details>
<summary>Answer</summary>

`taxed` isn't visible in `WHERE` (created in `SELECT`, which runs after). Fix: `WHERE amount * 1.08 > 100`.
</details>

### D. Division by zero

::code-wrapper{language="sql"}
```sql
SELECT sales / total FROM metrics;
```
::

<details>
<summary>Answer</summary>

Errors if `total = 0`. Fix: `SELECT sales / NULLIF(total, 0) FROM metrics` (returns NULL for zero; wrap in `COALESCE(..., 0)` if you want 0).
</details>

### E. Pagination without tie-breaker

::code-wrapper{language="sql"}
```sql
SELECT * FROM orders ORDER BY ordered_on DESC LIMIT 10 OFFSET 10;
```
::

<details>
<summary>Answer</summary>

`ordered_on` isn't unique — tied rows drift between pages. Fix: `ORDER BY ordered_on DESC, id DESC` (unique tie-breaker). Better: keyset pagination.
</details>

## 📚 Further Reading

- [Use The Index, Luke](https://use-the-index-luke.com) — indexing explained.
- [The Art of PostgreSQL](https://theartofpostgresql.com) — query writing for developers.
- [PostgreSQL Docs](https://www.postgresql.org/docs/) — the reference.
- [PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Main_Page) — performance and tuning guides.
- [pgexercises.com](https://pgexercises.com) — interactive practice.

## License

These notes are yours to use, share, and modify.

🗄️