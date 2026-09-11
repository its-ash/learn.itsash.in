---
title: "25 — Normalization & Data Modeling"
description: "Why normalize (anomaly elimination), 1NF–BCNF with code examples, denormalization tradeoffs (read performance vs write complexity), surrogate vs natural keys, star schema for analytics, slowly changing dimensions — code-first reference with a normalized e-commerce schema and anti-patterns for premature denormalization and EAV."
---

# 25 — Normalization & Data Modeling

Normalization is the process of organizing data to reduce redundancy and improve integrity. The goal: each fact is stored in exactly one place. Violating normalization causes **anomalies** — data inconsistencies that arise from updates, inserts, or deletes.

## Why Normalize? — The Three Anomalies

::code-wrapper{language="text"}
```text
-- Consider this unnormalized table (customer data stored with each order):
-- orders: order_id | customer_name | customer_city | amount
--         1        | Alice         | NYC            | 100
--         2        | Alice         | NYC            | 200
--         3        | Alice         | Boston         | 150   ← Alice moved, 2 rows stale

-- UPDATE ANOMALY: updating Alice's city in 2 of 3 rows → which is correct?
--   You must update ALL rows for Alice. Miss one → inconsistent data.
--   "How many rows do I need to update?" is the wrong question — the fact
--   should be in ONE place, so one update suffices.

-- INSERTION ANOMALY: can't insert a new customer until they place an order.
--   No order → no row → no customer record. Customer data is hostage to
--   having an order.

-- DELETION ANOMALY: deleting Alice's last order deletes Alice.
--   If Alice has one order and you delete it, the row is gone → Alice's
--   customer data is lost. Deleting one fact (the order) inadvertently
--   deletes another (the customer).

-- Normalization fixes all three: customer data in a `customers` table
-- (one row per customer), orders in an `orders` table (FK to customers).
-- One update to customers.city. Insert a customer without an order.
-- Delete an order without losing the customer.
```
::

## The Normal Forms — Code-First

### 1NF — Atomic Values

**Rule**: every column holds a single, atomic value. No repeating groups, no lists in a single cell.

::code-wrapper{language="sql"}
```sql
-- ❌ Not 1NF: items column holds a comma-separated list
CREATE TABLE bad_orders (
  id SERIAL PRIMARY KEY,
  customer TEXT,
  items TEXT                           -- 'apple, banana, cherry' — one cell, multiple values
);
-- Can't index items for "which orders contain apple?" (LIKE '%apple%' →
-- full scan, false positives on 'pineapple'). Can't enforce integrity.
-- Can't add metadata (quantity, price per item).

-- ✅ 1NF: one row per item (normalize into a child table)
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer TEXT NOT NULL
);
CREATE TABLE order_items (
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, item)
);
-- Each cell is atomic. Can index item, enforce quantity > 0, add price.
```
::

**PostgreSQL exception**: `TEXT[]` (array) or `JSONB` columns are a deliberate denormalization for homogeneous lists you always read together. 1NF is a guideline, not a hard rule — arrays are acceptable when the list is atomic from the application's perspective (e.g., tags).

### 2NF — No Partial Dependencies on a Composite Key

**Rule**: every non-key column depends on the *whole* composite primary key, not just part of it. (Only relevant with composite keys.)

::code-wrapper{language="sql"}
```sql
-- ❌ Not 2NF: PK is (order_id, product_id), but product_name depends
-- only on product_id (not on order_id). If product 5's name changes,
-- you must update every order_items row for product 5.
CREATE TABLE bad_order_items (
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name TEXT NOT NULL,          -- depends on product_id ONLY, not order_id
  quantity INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
-- product_name is duplicated across all orders containing product 5.
-- Rename "Apple" to "Apple Inc." → update N rows. Miss one → inconsistency.

-- ✅ 2NF: move product_name to the products table
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL                   -- depends on product_id (the PK of products)
);
CREATE TABLE order_items (
  order_id BIGINT NOT NULL REFERENCES orders(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)   -- quantity depends on BOTH (which order, which product)
);
-- product_name lives in products (one place). Rename → one update.
-- quantity lives in order_items (depends on the full composite key).
```
::

### 3NF — No Transitive Dependencies

**Rule**: non-key columns depend *only* on the primary key, not on other non-key columns.

::code-wrapper{language="sql"}
```sql
-- ❌ Not 3NF: zip_code determines city, but city isn't the PK.
-- zip_code → city is a transitive dependency (id → zip_code → city).
CREATE TABLE bad_customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  city TEXT NOT NULL                    -- derivable from zip_code, not from id directly
);
-- If zip_code 10001 maps to NYC, every customer with zip 10001 has city=NYC.
-- Duplicated. If the mapping changes (zip boundary redraw), update every row.

-- ✅ 3NF: zip → city in a separate table
CREATE TABLE zip_codes (
  zip TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  zip_code TEXT NOT NULL REFERENCES zip_codes(zip)
);
-- city lives in zip_codes (one place per zip). Join to get the city.
-- "The key, the whole key, and nothing but the key" — city depends on
-- the key (zip) of zip_codes, not on customers.id.
```
::

### BCNF — Boyce-Codd Normal Form (stricter 3NF)

**Rule**: every determinant is a candidate key. 3NF allows a non-key determinant if it's not a superkey for a different dependency; BCNF doesn't.

::code-wrapper{language="sql"}
```sql
-- BCNF matters when you have overlapping candidate keys.
-- Example: a table of (student, course, instructor) where:
--   - Each course has one instructor
--   - Each instructor teaches one course
--   - A student can take multiple courses
-- Candidate keys: (student, course) and (student, instructor)
-- Dependencies: course → instructor AND instructor → course
-- This is 3NF (no transitive dependency on a non-key) but NOT BCNF
-- (course is a determinant but not a superkey in the (student, course) key).
-- Fix: split into (student, course) and (course, instructor).

-- In practice, BCNF violations are rare — most schemas that hit 3NF
-- are already BCNF. The difference matters in academic cases with
-- overlapping candidate keys.
```
::

### 4NF, 5NF, 6NF

Higher normal forms deal with multi-valued dependencies (4NF) and join dependencies (5NF). They're academic for most applications — **3NF/BCNF is the practical target**. Going beyond BCNF rarely improves integrity and can hurt read performance (more joins).

## The Practical Takeaway — the mantra

> **The key, the whole key, and nothing but the key, so help me Codd.**
>
> — Every non-key column depends on the key (1NF/2NF), the whole key (2NF), and nothing but the key (3NF).

**Aim for 3NF/BCNF by default.** Each fact stored once, no redundancy, no anomalies.

## Surrogate vs Natural Keys

::code-wrapper{language="sql"}
```sql
-- Surrogate key: artificial, stable, simple. The default for most tables.
CREATE TABLE customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- surrogate: no business meaning
  email TEXT NOT NULL UNIQUE                           -- natural key as a unique constraint
);
-- Pros: never changes, simple joins (single bigint), no cascade issues.
-- Cons: no business meaning (can't tell anything from id=42).

-- Natural key: meaningful, derived from the domain.
CREATE TABLE countries (
  iso_code CHAR(2) PRIMARY KEY,         -- 'US', 'GB', 'JP' — natural, stable, meaningful
  name TEXT NOT NULL
);
-- Pros: meaningful, no extra column, self-documenting.
-- Cons: mutable (email rename → cascade to every FK), may not be truly unique.

-- Rule of thumb:
-- - Use surrogate keys by default (BIGINT IDENTITY or UUID).
-- - Use natural keys only for genuinely stable, unique identifiers (country codes, ISBN).
-- - Keep natural keys as UNIQUE constraints, not PKs, if they might change.
-- - The PK choice affects every FK that references it — changing a PK type
--   is a massive migration. Choose wisely up front.
```
::

## Complex Implementation — Normalized E-Commerce Schema

A fully normalized e-commerce schema with each normal form applied and annotated reasoning, followed by a denormalized analytics-ready version for comparison.

::code-wrapper{language="sql"}
```sql
-- ── NORMALIZED (3NF) — for the transactional (OLTP) system ──────

-- users: one row per user. 1NF (atomic), 2NF (single-column PK, N/A),
-- 3NF (all columns depend on user id alone).
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,           -- natural key as unique constraint (not PK)
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- addresses: one user can have multiple addresses (1:N).
-- Separate table (not columns on users) because it's multi-valued (1NF).
-- zip_id FK to zip_codes (3NF: city derivable from zip, not stored here).
CREATE TABLE addresses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line1 TEXT NOT NULL,
  line2 TEXT,
  zip_id TEXT NOT NULL REFERENCES zip_codes(zip),
  label TEXT NOT NULL DEFAULT 'home',   -- 'home', 'work', 'shipping'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- zip_codes: the 3NF fix — city/state derivable from zip, stored once.
CREATE TABLE zip_codes (
  zip TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US'
);

-- categories: self-referencing for hierarchy (adjacency list).
-- parent_id is NULL for root categories.
CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

-- products: name/price depend on product id (3NF).
-- category_id FK (not storing category name here — 2NF/3NF).
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  sku TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- products_to_categories: many-to-many (a product can be in multiple categories).
-- Junction table with composite PK (no duplicate pairs).
CREATE TABLE products_to_categories (
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

-- orders: one row per order. FK to user (not storing user name/email — 3NF).
-- shipping_address_id FK (not copying address fields — 3NF).
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  shipping_address_id BIGINT NOT NULL REFERENCES addresses(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','shipped','delivered','cancelled')),
  total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- order_items: the line items. Composite-relevant: quantity depends on
-- (order_id, product_id) — the whole composite key (2NF).
-- product_name is NOT here (it's in products — 2NF fix).
-- unit_price IS here (a snapshot of the price at order time — not a
-- 3NF violation because the current product.price may change, but the
-- historical order price shouldn't. This is a deliberate denormalization
-- for historical accuracy).
CREATE TABLE order_items (
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),  -- price snapshot
  PRIMARY KEY (order_id, product_id)
);
-- The unit_price snapshot is a common pattern: store the price AT THE TIME
-- of the order, not a FK to a changing products.price. This is deliberate,
-- documented denormalization (historical accuracy > normalization purity).
```
::

### Denormalized Analytics Version — for the OLAP system

::code-wrapper{language="sql"}
```sql
-- ── DENORMALIZED (Star Schema) — for the analytics/OLAP system ──
-- The transactional schema is normalized (good for writes, integrity).
-- The analytics schema is denormalized (good for reads, aggregations).
-- They are SEPARATE databases (or schemas). Don't mix OLTP and OLAP
-- in the same schema — they have different access patterns.

-- Fact table: one row per order item (grain = line item).
-- Contains FKs to dimension tables + measures (quantity, amount).
CREATE TABLE fact_order_items (
  order_item_id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  order_date DATE NOT NULL,             -- denormalized from orders.created_at
  user_id BIGINT NOT NULL,
  user_email TEXT,                      -- denormalized from users (for grouping)
  user_city TEXT,                       -- denormalized from zip_codes via addresses
  product_id BIGINT NOT NULL,
  product_name TEXT,                    -- denormalized from products
  category_name TEXT,                   -- denormalized from categories
  category_parent_name TEXT,            -- denormalized (hierarchy flattened)
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,        -- quantity * unit_price (precomputed)
  order_status TEXT NOT NULL
);

-- Dimension tables (smaller, denormalized, for filtering/grouping):
CREATE TABLE dim_users (
  user_id BIGINT PRIMARY KEY,
  email TEXT,
  city TEXT,
  state TEXT,
  first_order_date DATE,
  total_orders INTEGER,
  total_spent NUMERIC(10,2)
);

CREATE TABLE dim_products (
  product_id BIGINT PRIMARY KEY,
  product_name TEXT,
  category_name TEXT,
  category_path TEXT,                   -- 'electronics > phones > accessories'
  current_price NUMERIC(10,2)
);

CREATE TABLE dim_dates (
  date DATE PRIMARY KEY,
  year INTEGER, month INTEGER, quarter INTEGER,
  day_of_week TEXT, is_weekend BOOLEAN,
  is_holiday BOOLEAN, holiday_name TEXT
);

-- Analytics query: total sales by city for Q3 2026 — ONE join, fast.
SELECT u.city, sum(f.amount) AS total
FROM fact_order_items f
JOIN dim_dates d ON d.date = f.order_date
JOIN dim_users u ON u.user_id = f.user_id
WHERE d.quarter = 3 AND d.year = 2026
GROUP BY u.city ORDER BY total DESC;
-- In the normalized schema, this would need 5+ joins (orders → users →
-- addresses → zip_codes, + order_items → products → categories). The
-- star schema pre-joins into the fact table for read performance.
```
::

### Slowly Changing Dimensions (SCD)

::code-wrapper{language="sql"}
```sql
-- Dimension data changes over time (a user moves cities, a product is
-- reclassified). How do you track history in the analytics schema?

-- SCD Type 1: overwrite (no history). Simple, loses the old value.
UPDATE dim_users SET city = 'Boston' WHERE user_id = 42;
-- Lost: the fact that user 42 used to live in NYC.

-- SCD Type 2: track history with validity dates (the standard approach).
CREATE TABLE dim_users_scd2 (
  user_sk BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- surrogate key (not user_id)
  user_id BIGINT NOT NULL,                  -- natural key (business key)
  email TEXT,
  city TEXT,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,                     -- NULL = current version
  is_current BOOLEAN NOT NULL DEFAULT true
);
-- When user 42 moves from NYC to Boston:
UPDATE dim_users_scd2 SET valid_to = now(), is_current = false
WHERE user_id = 42 AND is_current;         -- close the old version
INSERT INTO dim_users_scd2 (user_id, email, city)
VALUES (42, 'alice@example.com', 'Boston'); -- open a new version
-- Fact table records use user_sk (the surrogate) so each fact points to
-- the correct version of the user at the time of the event.
-- Query "where did user 42 live when they placed order X?":
-- JOIN fact_order_items f ON f.user_sk = u.user_sk (point-in-time join).
```
::

## Denormalization — When and How

::code-wrapper{language="sql"}
```sql
-- Denormalize ONLY when you have a measured performance problem.
-- Each denormalization adds a consistency burden (how do you keep it in sync?).

-- 1. Precomputed aggregates (materialized views or trigger-maintained columns)
CREATE MATERIALIZED VIEW daily_sales AS
  SELECT date_trunc('day', created_at)::date AS sale_date,
         count(*) AS order_count,
         sum(total) AS revenue
  FROM orders GROUP BY 1;
-- Refresh periodically: REFRESH MATERIALIZED VIEW daily_sales;
-- Or use a trigger-maintained counter column on customers (order_count).

-- 2. Duplicate columns (with a sync mechanism)
ALTER TABLE orders ADD COLUMN customer_name TEXT;  -- denormalized from users
-- Sync via trigger (see chapter 21) or application code.
-- Cost: if users.name changes, orders.customer_name is stale until synced.

-- 3. JSONB for variable structure (deliberate denormalization)
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'  -- variable key-value pairs
);
-- Better than EAV (see anti-patterns). Indexable with GIN, queryable with ->>.
CREATE INDEX products_attrs_idx ON products USING GIN (attributes);

-- 4. Summary tables (scheduled refresh)
CREATE TABLE monthly_revenue (
  month DATE PRIMARY KEY,
  revenue NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Updated by a nightly job: INSERT ... ON CONFLICT (month) DO UPDATE ...
```
::

## Anti-Pattern: Premature Denormalization

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: denormalizing before you have a performance problem.
-- "Let's copy customer_name into orders to avoid a join" — before
-- measuring whether the join is actually slow.
-- Costs:
-- 1. Consistency burden: a trigger or app code must sync customer_name.
-- 2. Storage: duplicated data.
-- 3. Complexity: two sources of truth for the same fact.
-- 4. The join might be fast (indexed FK, small table) — the denormalization
--    added complexity for zero gain.

-- ✅ RIGHT: normalize first. Denormalize ONLY when you have a MEASURED
-- performance problem (EXPLAIN shows a slow join, profiling shows it's
-- the bottleneck). Then denormalize with a consistency mechanism.
-- Most "joins are slow" fears are unfounded — indexed FKs on small-ish
-- dimension tables are fast. Measure, don't guess.
```
::

## Anti-Pattern: Entity-Attribute-Value (EAV)

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: EAV — a "flexible" properties table
CREATE TABLE product_attributes (
  product_id BIGINT REFERENCES products(id),
  attribute_name TEXT,           -- 'color', 'weight', 'screen_size'
  attribute_value TEXT           -- 'red', '1.5kg', '15"'
);
-- Querying "all red products weighing < 2kg" requires 3+ self-joins:
SELECT p.* FROM products p
JOIN product_attributes a1 ON a1.product_id = p.id AND a1.attribute_name = 'color' AND a1.attribute_value = 'red'
JOIN product_attributes a2 ON a2.product_id = p.id AND a2.attribute_name = 'weight' AND a2.attribute_value::numeric < 2;
-- Problems: no typing (everything is TEXT), no indexes (can't index by
-- attribute_name+value efficiently), query complexity explodes, no
-- integrity (typos: 'Color' vs 'color'), can't enforce NOT NULL on
-- a specific attribute.

-- ✅ RIGHT: use JSONB for variable attributes (typed, indexable, queryable)
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'
  -- {"color": "red", "weight_kg": 1.5, "screen_size": 15}
);
CREATE INDEX products_attrs_idx ON products USING GIN (attributes);
-- Query: all red products < 2kg
SELECT * FROM products
WHERE attributes->>'color' = 'red'
  AND (attributes->>'weight_kg')::numeric < 2;
-- Indexable (GIN), typed at query time, no self-joins. If attributes are
-- well-known and fixed, use real columns instead of JSONB (fully typed,
-- indexable by default, constraint-checkable).
```
::

## Anti-Pattern: Polymorphic Associations

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: polymorphic association — commentable_type + commentable_id
CREATE TABLE comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body TEXT NOT NULL,
  commentable_type TEXT NOT NULL,   -- 'post' or 'video' or 'product'
  commentable_id BIGINT NOT NULL    -- FK to... which table?
);
-- No FK possible — commentable_id could reference posts, videos, or products.
-- Referential integrity is NOT enforced. A deleted post leaves dangling comments.
-- Queries need dynamic SQL or CASE to join the right table.

-- ✅ RIGHT: separate tables per type, or nullable FKs with a CHECK constraint
-- Option 1: separate comment tables (simple, clear)
CREATE TABLE post_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  body TEXT NOT NULL
);

-- Option 2: nullable FKs with a CHECK (exactly one non-NULL)
CREATE TABLE comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body TEXT NOT NULL,
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  video_id BIGINT REFERENCES videos(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  CHECK (num_nonnull(post_id, video_id, product_id) = 1)  -- exactly one target
);
-- FKs enforce integrity. CHECK ensures exactly one. No polymorphic magic.
```
::

## Relationship Patterns — 1:1, 1:N, N:N

::code-wrapper{language="sql"}
```sql
-- One-to-Many: FK on the "many" side
CREATE TABLE customers (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT);
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),  -- FK on the many side
  amount NUMERIC NOT NULL
);

-- One-to-One: FK that's also the PK (UNIQUE + NOT NULL)
CREATE TABLE users (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email TEXT UNIQUE);
CREATE TABLE user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id),  -- PK → UNIQUE + NOT NULL → 1:1
  bio TEXT,
  avatar_url TEXT
);
-- Use 1:1 to: split wide tables, isolate sensitive columns (passwords),
-- model optional subclassing (users + admins).

-- Many-to-Many: junction table with composite PK
CREATE TABLE students (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT);
CREATE TABLE courses  (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title TEXT);
CREATE TABLE enrollments (
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id  BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  grade TEXT,
  PRIMARY KEY (student_id, course_id)  -- prevents duplicate (student, course) pairs
);
-- The junction table can carry relationship attributes (enrolled_at, grade).
```
::

## Hierarchical Data — adjacency list + recursive CTE

::code-wrapper{language="sql"}
```sql
-- Adjacency list: each row has parent_id. Simple to maintain, query
-- subtrees with a recursive CTE (chapter 19).
CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id BIGINT REFERENCES categories(id),  -- NULL = root
  name TEXT NOT NULL
);
CREATE INDEX categories_parent_idx ON categories(parent_id);

-- Recursive CTE to get a subtree:
WITH RECURSIVE subtree AS (
  SELECT id, name, parent_id, 0 AS depth
  FROM categories WHERE id = 1                  -- start node
  UNION ALL
  SELECT c.id, c.name, c.parent_id, s.depth + 1
  FROM categories c
  JOIN subtree s ON c.parent_id = s.id          -- recurse up the tree
)
SELECT * FROM subtree ORDER BY depth, name;
-- Other options: path enumeration (/1/4/7/), nested sets (lft/rgt),
-- materialized path (ARRAY[1,4,7]). Adjacency list + recursive CTE
-- is the simplest and most flexible for most use cases.
```
::

## 💡 Tips & Tricks

- **Idiom**: aim for **3NF/BCNF by default** — each fact stored once, no anomalies. Denormalize *deliberately*, for a measured read-performance gain, with a consistency mechanism (trigger, generated column, materialized view, scheduled refresh). Untracked denormalization corrupts data.
- **Idiom**: prefer **surrogate keys** (`BIGINT IDENTITY` or `UUID`) over natural keys — natural keys that change (email, ISBN) force cascading updates across every referencing FK, and "immutable" natural keys have a habit of turning mutable. Use natural keys only for genuinely stable, unique identifiers (country codes).
- **Idiom**: use a **junction table** for many-to-many relationships, with a composite PK `(a_id, b_id)` — this enforces uniqueness (no duplicate pairs) and gives you a place to put relationship attributes (`enrolled_at`, `role`). Don't model M:N with a delimited string.
- **Idiom**: separate **transactional (normalized, OLTP)** from **analytical (denormalized, OLAP)** schemas — they have different access patterns (writes vs reads, integrity vs aggregation). Use a star schema (fact + dimension tables) for analytics. Don't mix them in the same schema.
- **Idiom**: model hierarchical data with an **adjacency list** (`parent_id` FK) + recursive CTEs for traversal — it's the simplest, most flexible approach. Reserve path enumeration / nested sets for read-heavy trees that rarely change.
- **Idiom**: use a **view layer** for denormalization in read-heavy systems — create a view that joins the normalized tables, grant access on the view, revoke on base tables. The view is always consistent (computed on read), no sync mechanism needed. Materialize it (`CREATE MATERIALIZED VIEW`) if the joins are expensive.
- **Idiom**: store **price snapshots** in order/line-item tables — `unit_price` in `order_items` is the price at order time, not a FK to `products.price`. The current price changes; historical orders shouldn't. This is deliberate, documented denormalization for historical accuracy.
- **Idiom**: use **SCD Type 2** (valid_from/valid_to) for dimension history in analytics — when a user moves cities or a product is reclassified, close the old dimension row and open a new one. Fact records point to the correct version via a surrogate key.

## ⚠️ Edge Cases & Gotchas

- **Over-normalization**: splitting data into too many tiny tables makes every query a 5-table join. Normalization is a tool, not a religion — 3NF is usually enough; 5NF/6NF rarely improve anything practical and can hurt read performance.
- **1NF and PostgreSQL arrays**: `TEXT[]` and `JSONB` columns are a deliberate denormalization — acceptable when the list is atomic from the application's perspective (tags, variable attributes). 1NF is a guideline for reducing redundancy, not a hard rule against composite types.
- **BCNF vs 3NF difference**: BCNF is stricter — every determinant must be a candidate key. 3NF allows a non-key determinant if it's not a superkey for a different dependency. The difference matters only with overlapping candidate keys — rare in practice.
- **Surrogate key vs natural key in replication**: surrogate keys (bigint/UUID) replicate cleanly (no collision across nodes). Natural keys (email) may collide if two nodes insert the same email independently before syncing. For distributed/multi-master systems, use UUIDs.
- **Denormalization consistency maintenance**: copying `customer_name` into `orders` without a trigger means a customer rename leaves stale names in orders. Always pair denormalization with a trigger, generated column, materialized view, or scheduled refresh. Untracked denormalization = data corruption.
- **EAV anti-pattern**: "flexible" `(entity, attribute, value)` tables destroy typing, defeat indexes, and make queries a mess of self-joins. Use `JSONB` for variable attributes — it's typed, indexable (GIN), and queryable (`->>`).
- **Polymorphic associations break FKs**: `commentable_type + commentable_id` can't have a real FK (the id could reference any of several tables). Use per-type tables or nullable FKs with `CHECK (num_nonnull(...) = 1)`.
- **NULL and normalization**: NULL is not a value — it's the absence of one. A column full of NULLs isn't a normalization violation, but it may indicate a missing entity (consider splitting into a 1:1 table for the optional attributes).
- **Multi-valued dependencies (4NF)**: if a table has two independent multi-valued attributes (e.g., a teacher's skills and courses, where skills and courses are independent), storing them in one table causes combinatorial explosion. Split into two tables. Rare in practice.
- **Soft deletes and FKs**: a `deleted_at` column (soft delete) doesn't remove the row, so FKs still point to it. Queries must filter `WHERE deleted_at IS NULL` everywhere — a common source of "I forgot to filter soft-deleted rows" bugs. Consider RLS or a view to enforce the filter.
- **Composite PK column order**: `(tenant_id, id)` serves `WHERE tenant_id = ?` (leftmost prefix) but not `WHERE id = ?` alone. Order by query pattern and selectivity. For B-tree indexes, the leftmost column must be in the `WHERE` clause for the index to be used.
- **God table anti-pattern**: one table with 200 columns covering multiple entity types. Split it. If different rows use different subsets of columns (mostly NULL), that's a missing-entity smell — extract the optional columns into a 1:1 table.

## 🧠 Spot the Bug

A team stores product categories as a delimited string to "avoid a join table":

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  categories TEXT NOT NULL   -- 'electronics,tech,accessories'
);
```
::

They need a report of all products in the "tech" category. What's wrong, and what's the fix?

<details>
<summary>Answer</summary>

Multiple problems:

1. **Can't index for category lookup** — `WHERE categories LIKE '%tech%'` does a full table scan. A B-tree index on `categories` can't help a substring search.
2. **False positives** — `LIKE '%tech%'` matches "biotech," "techwear." Even delimiter-aware logic (`WHERE ',' || categories || ',' LIKE '%,tech,%'`) is fragile and can't use an index.
3. **No integrity** — nothing prevents typos: `'tech'`, `'Tech'`, `'TECH'` are three "different" categories. No FK, no enum, no validation.
4. **Update anomalies** — renaming "tech" → "technology" requires updating every product's `categories` string, with no guarantee of consistency.
5. **No metadata** — the category has no attributes (description, parent category) because it's not an entity.

The fix — normalize with a junction table:

::code-wrapper{language="sql"}
```sql
CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,            -- integrity: no duplicates
  parent_id BIGINT REFERENCES categories(id)  -- hierarchy
);

CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE product_categories (
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)  -- no duplicate pairs
);

CREATE INDEX product_categories_cat_idx ON product_categories(category_id);
-- Index on category_id → fast "products in category X" lookup

-- Query: products in "tech" — indexable, no false positives, has integrity
SELECT p.* FROM products p
JOIN product_categories pc ON pc.product_id = p.id
JOIN categories c ON c.id = pc.category_id
WHERE c.name = 'tech';
-- This is a 2-join query, but both joins use indexes (PK + the cat_idx).
-- Renaming "tech" → "technology" is a one-row UPDATE on categories.
```
::

For a simpler variant if you don't need category metadata, a PostgreSQL `TEXT[]` array with a GIN index is a reasonable middle ground:

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}'  -- ARRAY['electronics', 'tech']
);
CREATE INDEX products_categories_idx ON products USING GIN (categories);
SELECT * FROM products WHERE 'tech' = ANY(categories);  -- uses the GIN index
```
::

**The lesson**: delimited strings for multi-valued attributes defeat indexes, integrity, and queries. Use a junction table (normalized, with FKs and metadata) or an array column with a GIN index (PostgreSQL, lighter, no metadata).

</details>