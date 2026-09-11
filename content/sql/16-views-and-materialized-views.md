# 16 — Views & Materialized Views

Views are saved queries that act as virtual tables — they encapsulate complexity, enforce consistency, and control access. Materialized views persist the query result, trading freshness for speed. Both are essential tools in a production schema, but they have fundamentally different storage, refresh, and concurrency semantics.

---

## Regular Views: Stored Query, No Storage

A view is a **named, stored query** — it holds no data of its own. When you query a view, the planner macro-expands it into its defining query, then optimizes the whole thing. Predicates from the outer query are pushed into the view's scan:

::code-wrapper{language="sql"}
```sql
-- Define a view: a named, reusable query definition
CREATE VIEW active_customers AS
  SELECT id, name, city, active
  FROM customers
  WHERE active = true;          -- WHERE clause becomes part of every query through the view

-- Querying the view is transparent — the planner expands it:
--   SELECT id, name, city, active FROM customers WHERE active = true AND city = 'NYC'
SELECT * FROM active_customers WHERE city = 'NYC';

-- EXPLAIN shows the base table scan with both predicates pushed down
EXPLAIN SELECT * FROM active_customers WHERE city = 'NYC';
--  Index Scan on customers_city_idx
--    Index Cond: (city = 'NYC'::text)
--    Filter: (active = true)
```
::

The view definition is stored in `pg_views` — the query text, not data. The planner re-optimizes every time, so a view's performance depends on the underlying tables' indexes and the query's complexity.

### Why Use Views?

1. **Encapsulation** — hide a 20-line join behind a single name.
2. **Consistency** — one definition of "active customer" used everywhere, updated in one place.
3. **Security** — grant access to a view (subset of columns/rows) without granting access to the base table.
4. **API stability** — present a stable schema even as underlying tables evolve (add a column, keep the view unchanged).

::code-wrapper{language="sql"}
```sql
-- Security view: hide the salary column from non-HR users
CREATE VIEW employee_directory AS
  SELECT id, name, department       -- salary intentionally excluded
  FROM employees;

GRANT SELECT ON employee_directory TO public;   -- public sees the view
REVOKE SELECT ON employees FROM public;          -- but not the base table

-- Row-level view: per-tenant isolation via a security function
CREATE VIEW my_orders AS
  SELECT * FROM orders
  WHERE customer_id = current_user_id();         -- custom function returns the caller's tenant ID
GRANT SELECT ON my_orders TO public;
```
::

Views are the classic way to expose a limited projection of a table to less-privileged roles — simpler to reason about than per-column grants, and they survive base-table column renames better.

---

## Updatable Views

Simple views (single base table, no aggregation/distinct/grouping/join/window) are **automatically updatable** in PostgreSQL — `INSERT`/`UPDATE`/`DELETE` on the view propagate to the base table:

::code-wrapper{language="sql"}
```sql
CREATE VIEW active_customers AS
  SELECT id, name, city, active
  FROM customers
  WHERE active = true;          -- filter: only active rows are visible

-- INSERT through the view → inserts into the base table
INSERT INTO active_customers (name, city) VALUES ('Eve', 'LA');
-- INSERT INTO customers (name, city, active) VALUES ('Eve', 'LA', true)
-- Note: the view's WHERE active = true is NOT enforced on insert — only on reads

-- UPDATE through the view → updates the base table, only visible rows
UPDATE active_customers SET city = 'SF' WHERE id = 2;

-- DELETE through the view → deletes from the base table, only visible rows
DELETE FROM active_customers WHERE id = 3;
```
::

**The gap**: the view's `WHERE active = true` is a read filter. Inserting a row with `active = false` through the view succeeds — the row lands in the base table, but it's invisible to the view. This is a subtle authorization hole: a user inserts through a view, the row is in the base table but not the view, the user can't see it, but it exists.

### WITH CHECK OPTION

`WITH CHECK OPTION` closes that gap — it enforces that inserts/updates must satisfy the view's `WHERE`:

::code-wrapper{language="sql"}
```sql
CREATE VIEW active_customers AS
  SELECT id, name, city, active
  FROM customers
  WHERE active = true
  WITH CHECK OPTION;            -- inserts/updates must satisfy WHERE active = true

-- This now fails — the row wouldn't be visible in the view
INSERT INTO active_customers (name, city, active) VALUES ('Eve', 'LA', false);
-- ERROR: new row violates check option for view "active_customers"

-- This also fails — updating a visible row to become invisible
UPDATE active_customers SET active = false WHERE id = 2;
-- ERROR: new row violates check option for view "active_customers"
```
::

### LOCAL vs CASCADED check scope

::code-wrapper{language="sql"}
```sql
-- CASCADED (default): checks this view's WHERE AND all underlying views' WHERE
CREATE VIEW vip_active_customers AS
  SELECT * FROM active_customers WHERE city = 'NYC'
  WITH CASCADED CHECK OPTION;   -- must satisfy active = true AND city = 'NYC'

-- LOCAL: checks only this view's WHERE, not underlying views
CREATE VIEW vip_nyc_local AS
  SELECT * FROM active_customers WHERE city = 'NYC'
  WITH LOCAL CHECK OPTION;      -- must satisfy city = 'NYC' (but not active = true)
```
::

Use `CASCADED` for layered security views — it ensures all upstream filters are enforced.

### What Makes a View Non-Updatable?

| Construct | Updatable? | Why |
|---|---|---|
| Single base table, simple SELECT | ✅ | Direct 1:1 mapping to base rows |
| `DISTINCT` | ❌ | Can't map result rows to unique base rows |
| `GROUP BY` / aggregates | ❌ | Multiple base rows → one result row |
| Window functions | ❌ | No 1:1 row mapping |
| `UNION` / `UNION ALL` | ❌ | Ambiguous which base table to update |
| `JOIN` (multi-table) | ❌ (mostly) | Can't determine which table to write to |
| `LIMIT` / `OFFSET` | ❌ | Row identity lost |

For non-updatable views, create `INSTEAD OF` triggers (on views) or `INSTEAD` rules to handle writes manually.

::code-wrapper{language="sql"}
```sql
-- Make a join view updatable with an INSTEAD OF trigger
CREATE VIEW order_summary AS
  SELECT o.id, o.amount, c.name AS customer_name
  FROM orders o JOIN customers c ON o.customer_id = c.id;

CREATE FUNCTION update_order_summary() RETURNS trigger AS $$
BEGIN
  -- Only the orders table is updated — customer_name is read-only through the view
  UPDATE orders SET amount = NEW.amount WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_summary
  INSTEAD OF UPDATE ON order_summary
  FOR EACH ROW EXECUTE FUNCTION update_order_summary();
```
::

---

## Materialized Views: Stored Results

A materialized view (MV) **stores the query result** — it's a cross between a view and a table. Querying it reads the stored data (fast, no re-computation), but it's **stale until refreshed**:

::code-wrapper{language="sql"}
```sql
-- Create: runs the query once, stores the result as a physical table-like object
CREATE MATERIALIZED VIEW sales_by_city AS
  SELECT c.city,
         SUM(o.amount) AS total,
         COUNT(*)      AS order_count
  FROM customers c
  JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;

-- Query: reads stored data — O(result size), no join, no aggregation
SELECT * FROM sales_by_city ORDER BY total DESC;

-- Refresh: re-runs the query, replaces the stored data
REFRESH MATERIALIZED VIEW sales_by_city;

-- Refresh without blocking readers (CONCURRENTLY requires a unique index)
CREATE UNIQUE INDEX sales_by_city_city_idx ON sales_by_city(city);
REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city;
```
::

### Refresh Strategies

| Strategy | Lock | Readers Blocked? | Requirement | Use Case |
|---|---|---|---|---|
| `REFRESH MATERIALIZED VIEW` | `ACCESS EXCLUSIVE` | ✅ Yes | None | Maintenance window, dev |
| `REFRESH ... CONCURRENTLY` | `SHARE` | ❌ No | `UNIQUE` index | Production, zero-downtime |
| Scheduled (`pg_cron`) | As above | As above | `pg_cron` extension | Periodic refresh |
| On-demand (ETL trigger) | As above | As above | App/ETL logic | After data loads |

::code-wrapper{language="sql"}
```sql
-- Schedule hourly refresh with pg_cron (extension must be enabled)
-- SELECT cron.schedule(
--   'refresh-sales-hourly',
--   '0 * * * *',                                  -- cron: every hour at minute 0
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city'
-- );

-- On-demand refresh at the end of an ETL pipeline
-- (in your ETL script, after loading new orders):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city;
```
::

### CONCURRENTLY: The Unique Index Requirement

`REFRESH MATERIALIZED VIEW CONCURRENTLY` builds a new version of the data in the background, then swaps atomically. To do this, it needs to **identify which rows to update in place** — which requires a `UNIQUE` index:

::code-wrapper{language="sql"}
```sql
-- Without a unique index → error
REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city;
-- ERROR: cannot refresh materialized view "sales_by_city" concurrently
-- because it does not have a UNIQUE index that refutes updates

-- Fix: create a unique index on a column (or composite) that uniquely identifies each row
CREATE UNIQUE INDEX sales_by_city_city_idx ON sales_by_city(city);

-- Now CONCURRENTLY works — readers never block
REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city;
```
::

The unique index must cover a set of columns that uniquely identify each MV row. If the MV groups by `(city, month)`, the index must be on `(city, month)`.

---

## Complex Implementation: Dual-View Reporting Architecture

A production analytics system that needs both real-time detail and fast pre-computed aggregates:

::code-wrapper{language="sql"}
```sql
-- ============================================================================
-- Schema: orders and customers for a retail analytics platform
-- ============================================================================
CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | shipped | delivered | cancelled
  ordered_on TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_customer_idx ON orders(customer_id);
CREATE INDEX orders_ordered_on_idx ON orders(ordered_on);
CREATE INDEX orders_status_idx ON orders(status);

-- ============================================================================
-- Regular view: real-time order detail (always current, no storage cost)
-- Use for: operational dashboards that need up-to-the-minute data
-- ============================================================================
CREATE VIEW order_detail AS
  SELECT o.id,
         o.amount,
         o.status,
         o.ordered_on,
         c.name  AS customer_name,
         c.city  AS customer_city
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  WHERE c.active = true;          -- only active customers visible in operational views

-- Query the view — planner expands and pushes down predicates
SELECT * FROM order_detail WHERE status = 'shipped' ORDER BY ordered_on DESC LIMIT 20;

-- ============================================================================
-- Materialized view: pre-computed monthly sales aggregates (fast, slightly stale)
-- Use for: executive dashboard, revenue reports — queried frequently, expensive to compute
-- ============================================================================
CREATE MATERIALIZED VIEW monthly_sales AS
  SELECT date_trunc('month', o.ordered_on) AS month,
         c.city,
         COUNT(*)                       AS order_count,
         SUM(o.amount)                  AS revenue,
         AVG(o.amount)                  AS avg_order_value,
         COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_count
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  WHERE c.active = true
    AND o.status IN ('shipped', 'delivered')   -- only completed sales count in revenue
  GROUP BY date_trunc('month', o.ordered_on), c.city;

-- Unique index: required for CONCURRENTLY refresh, also speeds up point lookups
CREATE UNIQUE INDEX monthly_sales_month_city_idx ON monthly_sales(month, city);

-- Secondary index: speeds up city-filtered queries on the MV
CREATE INDEX monthly_sales_city_idx ON monthly_sales(city);

-- Query the MV — sub-millisecond, no aggregation at query time
SELECT month, city, revenue
FROM monthly_sales
WHERE city = 'NYC'
ORDER BY month DESC;

-- ============================================================================
-- Refresh strategy: CONCURRENTLY every hour via pg_cron
-- ============================================================================
-- SELECT cron.schedule(
--   'refresh-monthly-sales',
--   '0 * * * *',                                                      -- every hour
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_sales'
-- );

-- ============================================================================
-- Security view: row-level isolation per tenant (with WITH CHECK OPTION)
-- ============================================================================
CREATE VIEW tenant_orders AS
  SELECT * FROM orders
  WHERE customer_id IN (SELECT id FROM customers WHERE tenant_id = current_tenant_id())
  WITH CHECK OPTION;              -- prevents inserting orders for other tenants

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_orders TO app_user;
REVOKE ALL ON orders FROM app_user;   -- app_user can only access orders through the view
```
::

**Why this architecture**: the regular view gives real-time detail (no staleness, no storage), while the materialized view gives fast aggregates (pre-computed, CONCURRENTLY refreshed). Using a regular view for the aggregates would recompute the full join + aggregation on every query — fine for 100 rows, catastrophic for 10M.

---

## Anti-Pattern: Regular View for Expensive Aggregates

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: regular view for a dashboard query that runs on every page load
CREATE VIEW dashboard_sales AS
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c
  JOIN orders o ON c.id = o.customer_id   -- join of 1M orders + 100K customers
  GROUP BY c.city;                        -- full aggregation every single query

-- Every SELECT * FROM dashboard_sales recomputes the entire join + aggregation
-- 10-second query on every dashboard load → unusable

-- ✅ RIGHT: materialized view with CONCURRENTLY refresh
CREATE MATERIALIZED VIEW dashboard_sales AS
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c
  JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;

CREATE UNIQUE INDEX dashboard_sales_city_idx ON dashboard_sales(city);  -- required for CONCURRENTLY

-- Refresh hourly (or after ETL loads)
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_sales;

-- Dashboard query is now sub-millisecond — reads pre-computed data
SELECT * FROM dashboard_sales ORDER BY total DESC;
```
::

**Why the wrong way fails**: a regular view has no storage — every query re-runs the full join and aggregation. For a dashboard loaded 1000×/day over millions of rows, this is a CPU and I/O disaster.

---

## Anti-Pattern: Materialized View Without Refresh Strategy

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: MV created but never refreshed → data goes stale forever
CREATE MATERIALIZED VIEW user_stats AS
  SELECT user_id, COUNT(*) AS login_count, MAX(login_at) AS last_login
  FROM logins GROUP BY user_id;
-- No index, no refresh schedule, no trigger → data frozen at creation time

-- ✅ RIGHT: MV with unique index + scheduled CONCURRENTLY refresh
CREATE MATERIALIZED VIEW user_stats AS
  SELECT user_id, COUNT(*) AS login_count, MAX(login_at) AS last_login
  FROM logins GROUP BY user_id;

CREATE UNIQUE INDEX user_stats_user_idx ON user_stats(user_id);

-- Schedule daily refresh
-- SELECT cron.schedule('refresh-user-stats', '0 2 * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats');

-- Or trigger after ETL: REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
```
::

---

## Materialized View vs Regular View: Decision Matrix

| Requirement | Regular View | Materialized View |
|---|---|---|
| Real-time data | ✅ Always current | ❌ Stale until refresh |
| Expensive query, queried often | ❌ Recomputes every time | ✅ Pre-computed, fast read |
| Storage cost | ✅ Zero | ❌ Proportional to result set |
| Updatable | ✅ (if simple) | ❌ Only REFRESH |
| Indexes | On base tables | On the MV itself |
| Schema flexibility | ✅ CREATE OR REPLACE | ❌ DROP + CREATE to change query |
| Zero-downtime refresh | N/A | ✅ CONCURRENTLY (needs unique index) |

---

## Cross-Engine Support

| Engine | Materialized Views | Refresh |
|---|---|---|
| PostgreSQL | `CREATE MATERIALIZED VIEW` | Manual: `REFRESH [CONCURRENTLY]` |
| Oracle | Mature MVs | Fast (incremental) or complete, auto on commit |
| SQL Server | Indexed views | Auto-maintained on base-table changes |
| MySQL | No native MVs | Emulate: table + scheduled job |
| SQLite | No MVs | Emulate: table + triggers |

::code-wrapper{language="sql"}
```sql
-- Emulating an MV in MySQL/SQLite (no native MV support)
CREATE TABLE sales_by_city_mv AS
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;

-- Refresh: truncate + re-insert (brief staleness window, or lock during refresh)
TRUNCATE sales_by_city_mv;
INSERT INTO sales_by_city_mv
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;
```
::

---

## 💡 Tips & Tricks

- **Idiom** — use views to **name and centralize business definitions**: "active customer," "high-value order," "current inventory" — every query uses the same definition instead of each re-implementing the filter (and drifting). A view is a single source of truth for a derived concept.
- **Performance** — use materialized views for **expensive aggregations queried often**: an MV refreshed hourly turns a 10-second aggregation into a 1ms read. Always pair with `CONCURRENTLY` (and a unique index) for zero-downtime refresh in production.
- **Safety** — use `WITH CHECK OPTION` on updatable views that expose a subset of rows: it prevents inserts/updates that create rows invisible to the view, closing a subtle authorization gap.
- **Security** — prefer **security views** (expose a projection, grant on the view, revoke on the base table) over column-level privileges on the base table: views are simpler to reason about, compose, and survive base-table column renames.
- **Debug** — when a view query is slow, check whether predicate pushdown is working: `EXPLAIN` the view query with an outer `WHERE`; if the outer predicate doesn't appear in the base-table scan, the view has a construct (`DISTINCT`, `GROUP BY`, window function, `UNION`) that blocks pushdown.
- **Scheduling** — use `pg_cron` for scheduled `REFRESH CONCURRENTLY` jobs: `cron.schedule('name', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_name')`. Always create the unique index *before* scheduling the first concurrent refresh.

---

## ⚠️ Edge Cases & Gotchas

- **Views aren't indexed**: a view has no storage, so you can't index it. Indexes go on the **base tables**; the planner uses them when expanding the view. If a view query is slow, index the base table's columns.
- **Materialized views are stale until refreshed**: readers see the last-refreshed snapshot. If freshness matters, refresh frequently or trigger a refresh after data loads.
- **`REFRESH` (non-concurrent) blocks readers**: it takes an `ACCESS EXCLUSIVE` lock. Use `CONCURRENTLY` (requires a unique index) for production MVs.
- **`CONCURRENTLY` requires a unique index**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` needs at least one `UNIQUE` index. Without it: `ERROR: cannot refresh materialized view concurrently without a unique index`.
- **Non-updatable views**: views with `DISTINCT`, `GROUP BY`, aggregation, window functions, `UNION`, or joins aren't auto-updatable. Use `INSTEAD OF` triggers or `INSTEAD` rules.
- **`WITH CHECK OPTION` scope**: `LOCAL` checks only the view's own `WHERE`; `CASCADED` (default) checks this view *and* all views it's built on. Use `CASCADED` for layered security views.
- **View dependency**: `DROP TABLE customers CASCADE` drops dependent views too — sometimes surprising. Check `pg_depend` before cascading drops.
- **View schema is frozen at creation**: if the base table adds a column, the view doesn't automatically include it. `CREATE OR REPLACE VIEW` can change the definition but can't remove/reorder existing columns — only add new ones at the end.
- **MV storage**: an MV takes space proportional to its result set. A large MV with many indexes can be bigger than the base table. Monitor disk usage with `pg_total_relation_relation_size('mv_name')`.
- **MV refresh failure is atomic**: if `REFRESH` fails (e.g., a constraint violation in the new data), the MV keeps its old data. But the error must be fixed before the MV updates.
- **`CREATE OR REPLACE VIEW` limitations**: can't remove or reorder columns, can't change column types — only add new columns at the end. For structural changes, `DROP VIEW` + `CREATE VIEW`.

---

## 🧠 Spot the Bug

A team creates a materialized view for a dashboard, refreshed nightly. The dashboard shows data up to 24 hours stale, and a stakeholder complains morning data isn't visible. The team tries `REFRESH MATERIALIZED VIEW CONCURRENTLY` and gets an error.

::code-wrapper{language="sql"}
```sql
CREATE MATERIALIZED VIEW dashboard_sales AS
  SELECT city, SUM(amount) AS total FROM orders GROUP BY city;

-- 24h later...
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_sales;
-- ERROR: cannot refresh materialized view "dashboard_sales" concurrently
-- because it does not have a UNIQUE index that refutes updates
```
::

<details>
<summary>Answer</summary>

**Two issues**:

1. **Staleness** — the MV is only refreshed nightly, so it's up to 24 hours stale. The team needs to refresh more frequently (hourly) or trigger a refresh after data loads.

2. **`CONCURRENTLY` error** — `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a **unique index** on the MV. `dashboard_sales` has none.

::code-wrapper{language="sql"}
```sql
-- Fix 1: add a unique index on the grouping column(s)
CREATE UNIQUE INDEX dashboard_sales_city_idx ON dashboard_sales(city);

-- Fix 2: now concurrent refresh works without blocking readers
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_sales;

-- Fix 3: schedule hourly refresh via pg_cron
-- SELECT cron.schedule('refresh-dashboard', '0 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_sales');
```
::

If `city` isn't unique in the result (e.g., the query groups by more columns), add all grouping columns to the unique index. The unique index must cover a set of columns that uniquely identify each MV row — `CONCURRENTLY` needs to identify rows to update them in place.

**The lesson**: `CONCURRENTLY` requires a unique index (it needs to identify rows during a concurrent refresh). Create the unique index right after creating the MV, before the first concurrent refresh. And match the refresh frequency to the freshness requirement.

</details>

---

## Summary

You can now create views for encapsulation/security/consistency, make them updatable with `WITH CHECK OPTION`, and build materialized views for expensive-query acceleration — with `CONCURRENTLY` refresh (and its unique-index requirement) for zero-downtime. Next: date and time handling, with its time-zone traps.