# 16 — Views & Materialized Views

Views are saved queries that act as virtual tables. They encapsulate complexity, enforce consistency, and control access. Materialized views persist the query result — trading freshness for speed.

## Views

A view is a **named, stored query** — no data of its own. Querying a view runs the underlying query:

::code-wrapper{language="sql"}
```sql
CREATE VIEW active_customers AS
  SELECT id, name, city FROM customers WHERE active = true;

-- Use it like a table
SELECT * FROM active_customers WHERE city = 'NYC';
``
::

The planner expands the view into its definition and optimizes the whole query — predicates from the outer query (`WHERE city = 'NYC'`) are pushed into the view's scan.

### Why use views?

1. **Encapsulation** — hide a complex join/aggregation behind a simple name.
2. **Consistency** — one definition of "active customer" used everywhere, updated in one place.
3. **Security** — grant access to a view (subset of columns/rows) without granting access to the base table.
4. **Compatibility** — present a stable schema even as the underlying tables evolve (add a column, keep the view unchanged).

### Updatable Views

Simple views (single base table, no aggregation/distinct/grouping/join) are **automatically updatable** in PostgreSQL — `INSERT`/`UPDATE`/`DELETE` on the view propagate to the base table:

::code-wrapper{language="sql"}
```sql
CREATE VIEW active_customers AS
  SELECT id, name, city, active FROM customers WHERE active = true;

INSERT INTO active_customers (name, city) VALUES ('Eve', 'LA');   -- inserts into customers
UPDATE active_customers SET city = 'SF' WHERE id = 2;             -- updates customers
DELETE FROM active_customers WHERE id = 3;                        -- deletes from customers
```
::

The view's `WHERE active = true` is a filter — inserting a row with `active = false` through the view succeeds (the check is only on reads), but the row won't appear in the view. Use `WITH CHECK OPTION` to enforce that inserts/updates must satisfy the view's `WHERE`:

::code-wrapper{language="sql"}
```sql
CREATE VIEW active_customers AS
  SELECT id, name, city, active FROM customers WHERE active = true
  WITH CHECK OPTION;

-- This now fails — the row wouldn't be visible in the view
INSERT INTO active_customers (name, city, active) VALUES ('Eve', 'LA', false);
-- ERROR: new row violates check option for view "active_customers"
```
::

### Security: column and row-level views

::code-wrapper{language="sql"}
```sql
-- Hide the salary column from non-HR users
CREATE VIEW employee_directory AS
  SELECT id, name, department FROM employees;

GRANT SELECT ON employee_directory TO public;
-- public can see the view but not the employees table (don't grant on employees).

-- Row-level view (per-tenant)
CREATE VIEW my_orders AS
  SELECT * FROM orders WHERE customer_id = current_user_id();  -- custom function
GRANT SELECT ON my_orders TO public;
```
::

Views are the classic way to expose a limited projection of a table to less-privileged roles.

## Materialized Views

A materialized view (MV) **stores the query result** — it's a cross between a view and a table. Querying it reads the stored data (fast, no re-computation), but it's **stale** until refreshed:

::code-wrapper{language="sql"}
```sql
CREATE MATERIALIZED VIEW sales_by_city AS
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;

-- Fast — reads stored data
SELECT * FROM sales_by_city ORDER BY total DESC;

-- Refresh (re-runs the query, replaces the data)
REFRESH MATERIALIZED VIEW sales_by_city;

-- Refresh without blocking readers (CONCURRENTLY requires a unique index)
CREATE UNIQUE INDEX sales_by_city_city_idx ON sales_by_city(city);
REFRESH MATERIALIZED VIEW CONCURRENTLY sales_by_city;
```
::

### When to use a materialized view

- The underlying query is **expensive** (aggregation over millions of rows, complex joins) and queried **often**.
- Slight staleness is acceptable (refresh every hour, every night, or on-demand).
- You'd otherwise pre-compute into a real table (MV is a managed version of that).

### Refresh strategies

- **`REFRESH MATERIALIZED VIEW`** — locks the MV, rebuilds it fully. Readers block during refresh.
- **`REFRESH MATERIALIZED VIEW CONCURRENTLY`** — builds a new version, swaps atomically. Requires a `UNIQUE` index on the MV. Readers never block.
- **Scheduled refresh** — `pg_cron` extension or an external scheduler (`cron`, Airflow) running `REFRESH` periodically.
- **On-demand refresh** — trigger a refresh after data loads (e.g., `REFRESH MATERIALIZED VIEW ... ` at the end of an ETL pipeline).

### Materialized view vs real table

An MV is essentially a table that the database knows how to rebuild. Differences:
- You can't `INSERT`/`UPDATE`/`DELETE` an MV directly — only `REFRESH`.
- The MV's schema is fixed by its defining query; changing the query requires `DROP` + `CREATE`.
- Indexes on an MV survive refreshes (except non-concurrent, which rebuilds them).

If you need write access or schema flexibility, use a real table populated by a scheduled job. If you want automatic rebuild management, use an MV.

## Materialized Views in Other Engines

| Engine | Support |
|---|---|
| PostgreSQL | `CREATE MATERIALIZED VIEW`, `REFRESH [CONCURRENTLY]` |
| Oracle | Mature MVs with fast/complete refresh, query rewrite |
| SQL Server | Indexed views (auto-maintained, no manual refresh) |
| MySQL | No native MVs — emulate with tables + triggers/scheduled jobs |
| SQLite | No MVs — emulate with tables + triggers |

PostgreSQL's MVs are manual-refresh (no auto-maintenance). Oracle/SQL Server auto-maintain on base-table changes (with restrictions).

## Emulating Materialized Views in MySQL/SQLite

::code-wrapper{language="sql"}
```sql
-- Create a real table
CREATE TABLE sales_by_city_mv AS
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;

-- Refresh: truncate and re-insert (or INSERT ... ON DUPLICATE KEY UPDATE for incremental)
TRUNCATE sales_by_city_mv;
INSERT INTO sales_by_city_mv
  SELECT c.city, SUM(o.amount) AS total
  FROM customers c JOIN orders o ON c.id = o.customer_id
  GROUP BY c.city;
``
::

Wrap this in a scheduled procedure or `cron` job. The tradeoff: a window of staleness (or a lock during refresh) vs. PostgreSQL's `CONCURRENTLY`.

## 💡 Tips & Tricks

- **Idiom**: use views to **name and centralize business definitions** — "active customer," "high-value order," "current inventory" — so every query uses the same definition instead of each re-implementing the filter (and drifting). A view is a single source of truth for a derived concept.
- **Performance**: use materialized views for **expensive aggregations queried often** — an MV refreshed hourly turns a 10-second aggregation query into a 1ms read. Always pair with `CONCURRENTLY` (and a unique index) for zero-downtime refresh in production.
- **Idiom**: use `WITH CHECK OPTION` on updatable views that expose a subset of rows — it prevents inserts/updates that would create rows invisible to the view, closing a subtle authorization gap (a user inserts through a view, the row is in the base table but not the view, the user can't see it but it exists).
- **Idiom**: prefer **security views** (expose a projection, grant on the view, revoke on the base table) over column-level privileges on the base table — views are simpler to reason about and compose, and they survive base-table column renames better than per-column grants.
- **Debug**: when a view query is slow, check whether predicate pushdown is working — `EXPLAIN` the view query with an outer `WHERE`; if the outer predicate doesn't appear in the base-table scan, the view has a construct (DISTINCT, GROUP BY, window function, UNION) that blocks pushdown, and the scan is wider than necessary.

## ⚠️ Edge Cases & Gotchas

- **Views aren't indexed**: a view has no storage, so you can't index it. Indexes go on the **base tables**; the planner uses them when expanding the view. If a view query is slow, index the base table's columns.
- **Materialized views are stale until refreshed**: readers see the last-refreshed snapshot. If freshness matters, refresh frequently or use triggers to update the MV on base-table changes (complex).
- **`REFRESH MATERIALIZED VIEW` (non-concurrent) blocks readers**: it takes an `ACCESS EXCLUSIVE` lock. Use `CONCURRENTLY` (requires a unique index) for production MVs.
- **`CONCURRENTLY` requires a unique index**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` needs at least one `UNIQUE` index on the MV. Without it, "cannot refresh materialized view concurrently without a unique index" error.
- **Non-updatable views**: views with `DISTINCT`, `GROUP BY`, aggregation, window functions, `UNION`, or joins aren't auto-updatable. To make them updatable, create `INSTEAD OF` triggers (on views) or `INSTEAD` rules.
- **`WITH CHECK OPTION` scope**: `LOCAL` checks only the view's own `WHERE`; `CASCADED` (default) checks the `WHERE` of this view *and* all views it's built on. Use `CASCADED` for layered views.
- **View dependency**: you can't `DROP` a table that a view depends on without `CASCADE`. `DROP TABLE customers CASCADE` drops dependent views too — sometimes surprising. Check `pg_depend` before cascading drops.
- **View schema is frozen at creation**: if the base table adds a column, the view doesn't automatically include it (the view's column list is fixed). `CREATE OR REPLACE VIEW` can change the view's definition but can't remove/reorder existing columns — only add new ones at the end.
- **Materialized view storage**: an MV takes space proportional to its result set. A large MV with many indexes can be bigger than the base table. Monitor disk usage.
- **MV refresh failure**: if `REFRESH` fails (e.g., a constraint violation in the new data), the MV keeps its old data (the refresh is atomic). But the error must be fixed before the MV updates.

## 🧠 Spot the Bug

A team creates a materialized view for a dashboard, refreshed nightly. The dashboard shows data that's up to 24 hours stale, and a stakeholder complains that morning data isn't visible until the next day. The team tries `REFRESH MATERIALIZED VIEW CONCURRENTLY` and gets an error. What two things are wrong?

::code-wrapper{language="sql"}
```sql
CREATE MATERIALIZED VIEW dashboard_sales AS
  SELECT city, SUM(amount) AS total FROM ... GROUP BY city;
```
::

<details>
<summary>Answer</summary>

Two issues:

1. **Staleness**: the MV is only refreshed nightly, so it's up to 24 hours stale. The team needs to refresh more frequently (e.g., hourly) or trigger a refresh after data loads, not rely on a fixed nightly schedule.

2. **`CONCURRENTLY` error**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a **unique index** on the MV. The `dashboard_sales` MV has no unique index (it was created with just `CREATE MATERIALIZED VIEW`, no index). Without a unique index, `CONCURRENTLY` fails with "cannot refresh materialized view concurrently without a unique index."

The fix:

```sql
-- Add a unique index (on a column or combination that's unique in the result)
CREATE UNIQUE INDEX dashboard_sales_city_idx ON dashboard_sales(city);

-- Now concurrent refresh works (no reader blocking)
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_sales;

-- And refresh more frequently — e.g., via pg_cron every hour
-- SELECT cron.schedule('refresh-dashboard', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_sales');
```

If `city` isn't unique in the result (e.g., the query groups by something else), add the grouping columns to the unique index. The unique index must cover a set of columns that uniquely identify each MV row.

**The lesson**: `CONCURRENTLY` requires a unique index (it needs to identify rows to update them in place during a concurrent refresh). Create the unique index right after creating the MV, before the first concurrent refresh. And match the refresh frequency to the freshness requirement — nightly refresh gives up to 24h staleness.

</details>

## Summary

You can now create views for encapsulation/security/consistency, make them updatable with `WITH CHECK OPTION`, and build materialized views for expensive-query acceleration — with `CONCURRENTLY` refresh (and its unique-index requirement) for zero-downtime. Next: date and time handling, with its time-zone traps.