# 25 — Normalization & Data Modeling

Normalization is the process of organizing data to reduce redundancy and improve integrity — the relational schema design discipline. This chapter covers the normal forms (1NF–BCNF), when to denormalize, and the modeling decisions that shape a database.

## Why Normalize?

Unnormalized data has problems:
- **Update anomaly** — updating a fact in one place but not another leaves inconsistent data (Alice's address in 3 rows; updating 2 of 3 → which is correct?).
- **Insertion anomaly** — can't insert a fact without another (can't add a new customer until they place an order, if customer data lives in the orders table).
- **Deletion anomaly** — deleting one fact inadvertently deletes another (deleting the last order for a customer deletes the customer, if they're in the same row).

Normalization eliminates these by ensuring each fact is stored in exactly one place.

## The Normal Forms

### 1NF — Atomic Values

**Rule**: every column holds a single, atomic value; no repeating groups or arrays in a single cell.

::code-wrapper{language="text"}
```text
-- ❌ Not 1NF: a column holding a list
orders: id | customer | items
        1  | Alice    | "apple, banana, cherry"

-- ✅ 1NF: one row per item
orders:    id | customer
           1  | Alice
order_items: order_id | item
             1        | apple
             1        | banana
             1        | cherry
```
::

(PostgreSQL array columns bend this rule — they're a deliberate denormalization for homogeneous lists you always read together.)

### 2NF — No Partial Dependencies on a Composite Key

**Rule**: every non-key column depends on the *whole* primary key, not just part of it. (Only relevant with composite keys.)

::code-wrapper{language="text"}
```text
-- ❌ Not 2NF: PK is (order_id, product_id), but product_name depends only on product_id
order_items: order_id | product_id | product_name | qty
             1        | 5          | Apple        | 3
             2        | 5          | Apple        | 1     -- product_name duplicated

-- ✅ 2NF: move product_name to the products table
order_items: order_id | product_id | qty
products:    product_id | product_name
```
::

`product_name` depends on `product_id` alone, not on `(order_id, product_id)`, so it belongs in `products`.

### 3NF — No Transitive Dependencies

**Rule**: non-key columns depend *only* on the primary key, not on other non-key columns.

::code-wrapper{language="text"}
```text
-- ❌ Not 3NF: zip_code determines city, which isn't the PK
customers: id | name | zip_code | city
           1  | Alice| 10001    | NYC
           2  | Bob  | 10002    | NYC     -- city redundant (derivable from zip)

-- ✅ 3NF: zip → city in a separate table
customers: id | name | zip_code
zip_codes: zip_code | city
```
::

`city` depends on `zip_code`, which depends on `id` — a transitive dependency. Move `zip → city` to its own table.

### BCNF — Boyce-Codd Normal Form (stricter 3NF)

**Rule**: every determinant is a candidate key. (3NF allows a non-key determinant if it's not a superkey; BCNF doesn't.) BCNF matters when you have multiple overlapping candidate keys — rare in practice.

### 4NF, 5NF, 6NF

Higher normal forms deal with multi-valued dependencies and join dependencies. They're academic for most applications — 3NF/BCNF is the practical target.

## The Practical Takeaway

**Aim for 3NF/BCNF by default.** Each fact stored once, no redundancy, no anomalies. The rule of thumb: "the key, the whole key, and nothing but the key" — every non-key column depends on the key (1NF/2NF), the whole key (2NF), and nothing but the key (3NF).

## Denormalization — When to Break the Rules

Normalization optimizes for **integrity and storage**. Sometimes you denormalize for **read performance**:

1. **Precomputed aggregates** — store `order_count` on `customers` instead of `COUNT(*)` per query. Refresh via triggers or a scheduled job. (Or use a materialized view, chapter 16.)
2. **Duplicate columns** — copy `customer_name` into `orders` to avoid a join on the hot read path. Accept the update anomaly (a trigger keeps it in sync).
3. **Summary tables** — a `daily_sales` table updated nightly by a job, queried by dashboards.
4. **JSONB for variable structure** — store semi-structured data in a `JSONB` column instead of normalizing it (chapter 18).

**Denormalize deliberately, with a mechanism to keep it consistent** (triggers, generated columns, materialized views, or a scheduled refresh). Untracked denormalization corrupts data.

## Surrogate vs Natural Keys (recap)

- **Surrogate** (`BIGINT IDENTITY`, `UUID`) — artificial, stable, simple joins. Default.
- **Natural** (`email`, `isbn`) — meaningful, no extra column, but mutable and may not be truly unique. Use sparingly.

See chapter 12 for details. The key choice affects every FK that references it.

## One-to-One, One-to-Many, Many-to-Many

### One-to-Many

The most common relationship. The "many" side has a FK to the "one" side:

::code-wrapper{language="sql"}
```sql
CREATE TABLE customers (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT);
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  amount NUMERIC NOT NULL
);
```
::

A customer has many orders; an order has one customer. The FK is on the "many" side.

### One-to-One

Put the FK on one side with a `UNIQUE` constraint:

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email TEXT UNIQUE);
CREATE TABLE user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id),   -- PK implies UNIQUE → 1:1
  bio TEXT,
  avatar_url TEXT
);
```
::

Making the FK also the PK enforces 1:1 (each user has at most one profile). Use 1:1 to split a wide table (optional/rarely-used columns in a separate table), enforce subclassing (a `users` + `admins` table), or isolate sensitive columns (passwords in a separate table with tighter access).

### Many-to-Many

A junction table with FKs to both sides:

::code-wrapper{language="sql"}
```sql
CREATE TABLE students (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT);
CREATE TABLE courses  (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title TEXT);
CREATE TABLE enrollments (
  student_id BIGINT NOT NULL REFERENCES students(id),
  course_id  BIGINT NOT NULL REFERENCES courses(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, course_id)   -- composite PK enforces uniqueness
);
```
::

The junction table (`enrollments`) may carry relationship attributes (`enrolled_at`, `grade`). The composite PK prevents duplicate (student, course) pairs.

## Hierarchical Data

Trees (manager → reports, categories → subcategories) are awkward in relational databases. Options:

1. **Adjacency list** — each row has a `parent_id`. Simple, but querying a whole subtree needs a recursive CTE (chapter 19).
2. **Path enumeration** — store the full path (`/1/4/7/`) as text. Fast subtree queries (`WHERE path LIKE '/1/4/%'`), but updates are expensive (renumbering).
3. **Nested sets** — store left/right bounds. Fast subtree reads, expensive writes.
4. **Materialized path** — like path enumeration but with an array (`ARRAY[1, 4, 7]`). GIN-indexable.

For most cases, **adjacency list + recursive CTE** is the simplest and most flexible. See chapter 19.

## Modeling Anti-Patterns

- **Entity-Attribute-Value (EAV)** — a "properties" table with `(entity_id, attribute_name, attribute_value)`. Flexible but destroys typing, defeats indexes, and makes queries a mess. Use `JSONB` instead if you need variable attributes.
- **Polymorphic associations** — a `commentable_id` + `commentable_type` pair instead of proper FKs. Breaks referential integrity (no FK on a polymorphic column). Use separate comment tables per type, or a `comments` table with nullable FKs to each commentable type (with a `CHECK` that exactly one is non-NULL).
- **God table** — one table with 200 columns covering multiple entity types. Split it.
- **Storing delimited lists** — `tags = 'a,b,c'` instead of a junction table or array column. Can't index, can't enforce integrity.

## 💡 Tips & Tricks

- **Idiom**: aim for **3NF/BCNF by default** — each fact stored once, no anomalies. Denormalize *deliberately*, for a measured read-performance gain, with a consistency mechanism (trigger, generated column, materialized view, scheduled refresh). Untracked denormalization corrupts data.
- **Idiom**: use a **junction table** for many-to-many relationships, with a composite PK `(a_id, b_id)` — this enforces uniqueness (no duplicate pairs) and gives you a place to put relationship attributes (`enrolled_at`, `role`). Don't model M:N with a delimited string.
- **Idiom**: model hierarchical data with an **adjacency list** (`parent_id` FK) + recursive CTEs for traversal — it's the simplest, most flexible approach, and recursive CTEs (chapter 19) make subtree queries straightforward. Reserve path/nested-sets for read-heavy trees that rarely change.
- **Idiom**: prefer **surrogate keys** (`BIGINT IDENTITY` or `UUID`) over natural keys — natural keys that change (email, ISBN) force cascading updates across every referencing FK, and "immutable" natural keys have a habit of turning mutable. Use natural keys only for genuinely stable, unique identifiers (country codes).
- **Idiom**: use **1:1 relationships** (FK that's also the PK) to split wide tables, isolate sensitive columns (passwords in a separate table with tighter access), or model optional subclassing (`users` + `admins`) — not as a default, but when there's a clear reason to separate concerns.

## ⚠️ Edge Cases & Gotchas

- **Over-normalization**: splitting data into too many tiny tables makes every query a 5-table join. Normalization is a tool, not a religion — 3NF is usually enough; 5NF/6NF rarely improve anything practical and can hurt read performance.
- **EAV anti-pattern**: "flexible" `(entity, attribute, value)` tables destroy typing, defeat indexes, and make queries a mess of self-joins. Use `JSONB` for variable attributes — it's typed, indexable, and queryable.
- **Polymorphic associations break FKs**: a `commentable_type + commentable_id` pair can't have a real FK (the id could reference any of several tables). Use per-type tables or nullable FKs with a `CHECK (exactly one is non-NULL)`.
- **Denormalization without a sync mechanism**: copying `customer_name` into `orders` without a trigger means a customer rename leaves stale names in orders. Always pair denormalization with a trigger, generated column, or scheduled refresh.
- **Natural key mutation**: a natural PK that changes (email rename) forces cascading updates to every referencing FK — expensive and lock-heavy. Surrogate keys never change.
- **Composite PK column order**: `(tenant_id, id)` serves `WHERE tenant_id = ?` (leftmost prefix) but not `WHERE id = ?` alone. Order by query pattern and selectivity.
- **Junction tables need their own PK**: a `PRIMARY KEY (a_id, b_id)` prevents duplicate pairs. Without it, the same pair can be inserted multiple times.
- **NULL in optional 1:1**: a 1:1 via `UNIQUE FK` allows the FK to be NULL (no related row) — that's "0 or 1," not strictly "1." If you require exactly 1, add `NOT NULL` (but then inserts must happen in the right order or use deferrable constraints).
- **Soft deletes and FKs**: a `deleted_at` column (soft delete) doesn't remove the row, so FKs still point to it. Queries must filter `WHERE deleted_at IS NULL` everywhere — a common source of "I forgot to filter soft-deleted rows" bugs. Consider RLS or a view to enforce the filter.
- **Time-series and partitioning**: a time-series table that grows unbounded should be **partitioned by time** (e.g., monthly partitions) — old partitions can be dropped/archived cheaply, and queries on a time range scan only the relevant partitions. Don't put a billion rows in one unpartitioned table.

## 🧠 Spot the Bug

A team stores product categories as a delimited string to "avoid a join table":

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT,
  categories TEXT NOT NULL   -- e.g., 'electronics,tech,accessories'
);
``
::

They need a report of all products in the "tech" category. What's wrong, and what's the fix?

<details>
<summary>Answer</summary>

Multiple problems:

1. **Can't index for category lookup** — `WHERE categories LIKE '%tech%'` does a full scan (and matches "tech" inside other words, a false positive). A B-tree index on `categories` can't help a substring search.
2. **False positives** — `LIKE '%tech%'` matches "biotech," "techwear," etc. Even with delimiter-aware logic (`WHERE ',' || categories || ',' LIKE '%,tech,%'`), it's fragile and slow.
3. **No integrity** — nothing prevents typos like `'tech, Tecch, TECH'` — three "different" categories. No FK, no enum, no validation.
4. **Update anomalies** — renaming a category ("tech" → "technology") requires updating every product's `categories` string, with no guarantee of consistency.
5. **No metadata** — the category has no attributes (description, parent category) because it's not an entity.

The fix — normalize with a junction table:

```sql
CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE product_categories (
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX product_categories_cat_idx ON product_categories(category_id);

-- Query: products in "tech"
SELECT p.* FROM products p
JOIN product_categories pc ON pc.product_id = p.id
JOIN categories c ON c.id = pc.category_id
WHERE c.name = 'tech';
```
::
This is indexable (the `category_id` index), has integrity (FKs + the `categories.name UNIQUE` constraint), supports category metadata, and makes renames a one-row update. For a simpler variant if you don't need category metadata, a PostgreSQL `TEXT[]` array column with a GIN index (`categories TEXT[]`, `WHERE 'tech' = ANY(categories)`) is a reasonable middle ground.

**The lesson**: delimited strings for multi-valued attributes defeat indexes, integrity, and queries. Use a junction table (normalized) or an array column with a GIN index (PostgreSQL, lighter).

</details>

## Summary

You can now normalize to 3NF/BCNF (eliminating update/insertion/deletion anomalies), denormalize deliberately with sync mechanisms, model 1:1/1:N/N:N relationships, handle hierarchical data with adjacency lists + recursive CTEs, and avoid EAV/polymorphic-association/god-table anti-patterns. Next: query optimization and `EXPLAIN`.