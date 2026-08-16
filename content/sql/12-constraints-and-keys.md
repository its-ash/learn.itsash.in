# 12 — Constraints & Keys

Constraints are rules the database enforces on data — they're the "guardrails" that keep your data consistent regardless of what application bugs do. Constraints are the difference between a database and a spreadsheet.

## The Constraint Toolkit

| Constraint | Purpose |
|---|---|
| `NOT NULL` | Column can't be NULL. |
| `UNIQUE` | Column (or column combo) has no duplicate non-NULL values. |
| `PRIMARY KEY` | `NOT NULL` + `UNIQUE`. Identifies a row. One per table. |
| `FOREIGN KEY` | Value must exist in another table's column. |
| `CHECK` | Arbitrary boolean expression must be TRUE. |
| `EXCLUDE` (PostgreSQL) | No two rows can satisfy a custom operator predicate (e.g., no overlapping time ranges). |

## NOT NULL

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,        -- required
  name  TEXT                  -- optional (NULL allowed)
);
``
::

Add `NOT NULL` to every column unless you have a specific reason to allow NULL. NULL handling is error-prone (chapter 10); fewer NULLs = fewer bugs.

Adding `NOT NULL` to an existing column with NULLs requires backfilling first:

::code-wrapper{language="sql"}
```sql
UPDATE users SET name = 'Unknown' WHERE name IS NULL;
ALTER TABLE users ALTER COLUMN name SET NOT NULL;
```
::

## UNIQUE

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE,                    -- column-level
  CONSTRAINT unique_pair UNIQUE (tenant_id, email)   -- table-level, multi-column
);
``
::

`UNIQUE` allows multiple NULLs (in PostgreSQL and standard SQL) — NULLs aren't "equal," so they don't violate uniqueness. If you need "at most one NULL," use a partial unique index:

::code-wrapper{language="sql"}
```sql
CREATE UNIQUE INDEX users_email_one_null
  ON users (email) WHERE email IS NOT NULL;
``
::

A `UNIQUE` constraint is implemented as a unique index under the hood — so it gives you an index for lookups too.

## PRIMARY KEY

The primary key uniquely identifies each row. It's `NOT NULL` + `UNIQUE` + a clustering hint (rows are physically ordered by the PK in PostgreSQL when using a B-tree, though this isn't guaranteed).

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,        -- surrogate key (auto-generated)
  -- or
  email TEXT PRIMARY KEY              -- natural key (user-provided)
);
``
::

### Surrogate vs natural keys

- **Surrogate** — an artificial ID (`SERIAL`, `UUID`) with no business meaning. Pros: stable (never changes), simple joins, uniform. Cons: extra column, less readable.
- **Natural** — a real-world identifier (`email`, `isbn`). Pros: no extra column, meaningful. Cons: can change (email rename), format can change (ISBN-10 → ISBN-13), may not actually be unique.

**Default to surrogate keys** (`BIGSERIAL` or `UUID`). Use natural keys only when they're truly immutable and unique (e.g., `country_code` in a `countries` table). Natural keys that *might* change force cascading updates across every referencing FK.

### Composite primary keys

::code-wrapper{language="sql"}
```sql
CREATE TABLE order_items (
  order_id    BIGINT NOT NULL REFERENCES orders(id),
  product_id  BIGINT NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)   -- composite PK
);
``
::

A composite PK enforces uniqueness on the combination. It's natural for junction tables (many-to-many). Foreign keys that reference a composite PK must include all its columns.

## FOREIGN KEY

A FK says "this value must exist in another table" — it enforces referential integrity.

::code-wrapper{language="sql"}
```sql
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  amount      NUMERIC(10, 2) NOT NULL
);
``
::

### ON DELETE / ON UPDATE actions

When a referenced row is deleted (or its PK updated), what happens to referencing rows?

| Action | Behavior |
|---|---|
| `NO ACTION` (default) | Blocks the delete/update if referencing rows exist. Same as `RESTRICT` but deferred-checkable. |
| `RESTRICT` | Blocks immediately. |
| `CASCADE` | Deletes/updates the referencing rows too. |
| `SET NULL` | Sets the FK column to NULL in referencing rows. |
| `SET DEFAULT` | Sets the FK column to its `DEFAULT` in referencing rows. |

::code-wrapper{language="sql"}
```sql
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  ref_order   BIGINT REFERENCES orders(id) ON DELETE SET NULL
);
``
::

**`CASCADE` is powerful and dangerous** — deleting one customer cascades to all their orders, and if `order_items` cascades from `orders`, it cascades further. An accidental `DELETE` can wipe a lot of data. Use `CASCADE` only when you genuinely want dependent rows to vanish (e.g., `order_items` when an `order` is deleted). For "soft" relationships, use `SET NULL`.

### Self-referencing FKs

::code-wrapper{language="sql"}
```sql
CREATE TABLE employees (
  id         BIGSERIAL PRIMARY KEY,
  manager_id BIGINT REFERENCES employees(id) ON DELETE SET NULL
);
``
::

A FK from a table to itself. The FK column must be nullable (or the root row with `manager_id = NULL` violates it).

### FKs and performance

A FK adds:
- A **lookup** on every `INSERT`/`UPDATE` of the FK column (checking the referenced row exists) — needs an index on the referenced PK (PKs are indexed by default).
- A **lock** on the referenced row (to prevent it being deleted before the FK insert commits).
- **No automatic index on the FK column itself** — but you should add one, so that `ON DELETE CASCADE` / `SET NULL` can find the referencing rows without a full scan.

::code-wrapper{language="sql"}
```sql
-- Always index FK columns (the constraint doesn't do it for you)
CREATE INDEX orders_customer_id_idx ON orders(customer_id);
``
::

### Deferred FK checks

By default, FKs are checked at statement end. With `DEFERRABLE INITIALLY DEFERRED`, the check is postponed to transaction commit — useful for circular references or multi-step reorderings:

::code-wrapper{language="sql"}
```sql
ALTER TABLE orders
  ALTER CONSTRAINT orders_customer_id_fkey
  DEFERRABLE INITIALLY DEFERRED;
``
::

## CHECK Constraints

A `CHECK` constraint enforces an arbitrary boolean expression:

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id    BIGSERIAL PRIMARY KEY,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  qty   INTEGER NOT NULL CHECK (qty >= 0),
  CONSTRAINT valid_price_qty CHECK (price * qty >= 0)   -- table-level
);
``
::

The expression must evaluate to TRUE or UNKNOWN (NULL is allowed — if the expression is UNKNOWN, the constraint passes). This is a gotcha: `CHECK (price > 0)` allows `price = NULL` because `NULL > 0` is UNKNOWN. Add `NOT NULL` separately if you want to forbid NULL.

### Adding CHECK to existing tables without a long lock

::code-wrapper{language="sql"}
```sql
ALTER TABLE products ADD CONSTRAINT positive_price CHECK (price >= 0) NOT VALID;
ALTER TABLE products VALIDATE CONSTRAINT positive_price;
``
::

`NOT VALID` skips the existing-row scan (instant); `VALIDATE` scans with a light lock.

## EXCLUDE Constraints (PostgreSQL)

An `EXCLUDE` constraint prevents two rows from satisfying a predicate — a generalization of `UNIQUE`. The classic use is **no overlapping time ranges**:

::code-wrapper{language="sql"}
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
  id          BIGSERIAL PRIMARY KEY,
  room_id     INTEGER NOT NULL,
  during      TSTZRANGE NOT NULL,
  EXCLUDE USING gist (room_id WITH =, during WITH &&)
);
-- No two bookings for the same room can have overlapping time ranges.
``
::

`room_id WITH =` means "equal room," `during WITH &&` means "overlapping range." The constraint fails if any two rows satisfy both. Requires the `btree_gist` extension (for `=` on scalars in a GiST index).

## Domain Constraints (PostgreSQL)

A **domain** is a custom type with constraints, reusable across columns:

::code-wrapper{language="sql"}
```sql
CREATE DOMAIN email_t AS TEXT
  CHECK (value ~ '^[^@]+@[^@]+\.[^@]+$');

CREATE TABLE users (id BIGSERIAL PRIMARY KEY, email email_t NOT NULL);
``
::

Use domains when the same constrained type (email, positive_int, iso_country_code) appears in many tables.

## 💡 Tips & Tricks

- **Idiom**: prefer surrogate keys (`BIGSERIAL` or `UUID`) over natural keys unless the natural key is genuinely immutable and unique — natural keys that change force cascading updates, and "immutable" natural keys have a habit of turning out to be mutable (email renames, ISBN format changes).
- **Idiom**: **always index FK columns** — the FK constraint doesn't create an index on the referencing column, so `ON DELETE CASCADE`/`SET NULL` and parent-table joins do full scans without one. `CREATE INDEX ON orders(customer_id)` is a near-universal best practice.
- **Idiom**: use `ON DELETE RESTRICT` (the default) for relationships where the child shouldn't vanish with the parent (a user's orders shouldn't disappear when the user is deleted — archive instead), and `ON DELETE CASCADE` only for true composition (an `order`'s `order_items`).
- **Performance**: add constraints to large existing tables with `NOT VALID` + `VALIDATE` — `NOT VALID` is metadata-only (no scan, no long lock), `VALIDATE` scans with `SHARE UPDATE EXCLUSIVE` (concurrent reads/writes continue). Standard for zero-downtime migrations.
- **Idiom**: use `EXCLUDE USING gist (room_id WITH =, during WITH &&)` for "no overlapping bookings" — it's enforced at write time (no race conditions) and far more reliable than application-level checks, which fail under concurrent inserts.

## ⚠️ Edge Cases & Gotchas

- **`UNIQUE` allows multiple NULLs** (PostgreSQL, standard; SQL Server allows one): a `UNIQUE` constraint on a nullable column permits many NULL rows. If you need "at most one non-NULL," use a partial unique index (`WHERE col IS NOT NULL`).
- **`CHECK` allows NULLs**: `CHECK (price > 0)` passes for `price = NULL` because `NULL > 0` is UNKNOWN, and constraints pass on UNKNOWN. Add `NOT NULL` separately to forbid NULL.
- **`CHECK` can't reference other rows**: a `CHECK` expression can only reference the current row's columns — no subqueries, no other tables. For cross-row/cross-table rules, use triggers (chapter 21) or `EXCLUDE`.
- **`ON DELETE SET DEFAULT` requires a default**: the FK column must have a `DEFAULT` set, or `SET DEFAULT` fails at delete time.
- **`CASCADE` chains**: `ON DELETE CASCADE` propagates through every cascading FK in the chain — deleting a customer can cascade to orders → order_items → audit_logs. Always review the full cascade graph before adding `CASCADE`.
- **FK columns aren't auto-indexed**: a common performance surprise. Without an index on `orders.customer_id`, `ON DELETE CASCADE` from `customers` scans all of `orders` to find referencing rows — and holds a lock while doing so. Always index FK columns.
- **`PRIMARY KEY` implies a clustered index in some engines**: in MySQL/SQL Server, the PK is the clustered (row-order) index. In PostgreSQL, the PK is a B-tree but the physical row order is heap (unless you `CLUSTER`). The distinction affects range-scan performance.
- **Composite PK column order matters for queries**: a composite PK `(tenant_id, id)` can be used for `WHERE tenant_id = ?` lookups (leftmost prefix), but not for `WHERE id = ?` alone. Order PK columns by selectivity and query pattern.
- **`DEFERRABLE` FKs require the constraint to be `DEFERRABLE` at creation**: you can't make a non-deferrable FK deferred mid-transaction. Plan for deferrability if you have circular references.
- **`EXCLUDE` needs a matching index operator class**: `EXCLUDE USING gist (during WITH &&)` requires GiST support for the `&&` operator on the column's type. For scalar columns in an EXCLUDE, install `btree_gist`.

## 🧠 Spot the Bug

A team adds this constraint to enforce that prices are positive, then discovers that a row with `price = NULL` exists and the constraint didn't catch it. Why?

::code-wrapper{language="sql"}
```sql
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price > 0);
``
::

<details>
<summary>Answer</summary>

`CHECK` constraints pass when the expression evaluates to TRUE **or UNKNOWN**. `NULL > 0` is `UNKNOWN` (any comparison with NULL is UNKNOWN in three-valued logic), and a `CHECK` constraint treats UNKNOWN as "not a violation" — the row passes. So `price = NULL` satisfies `CHECK (price > 0)`.

This is by design: `CHECK` constraints only reject rows where the expression is FALSE. They don't enforce NOT NULL — that's a separate constraint. If you want `price` to be both non-NULL and positive, you need both:

```sql
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price > 0);
```

Or combine them in the CHECK with an explicit NULL test (less idiomatic):

```sql
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price IS NOT NULL AND price > 0);
```

The separate `NOT NULL` + `CHECK` form is clearer and the `NOT NULL` produces a more specific error message ("null value in column price violates not-null constraint") than a generic CHECK violation.

**The lesson**: `CHECK` constraints allow NULLs (UNKNOWN passes). Use `NOT NULL` to forbid NULL, and `CHECK` to enforce a domain on non-NULL values.

</details>

## Summary

You can now enforce data integrity with `NOT NULL`, `UNIQUE`, `PRIMARY KEY`, `FOREIGN KEY` (with `CASCADE`/`SET NULL`/`RESTRICT`), `CHECK`, and `EXCLUDE`. You know to index FK columns, prefer surrogate keys, add constraints to large tables with `NOT VALID`+`VALIDATE`, and that `CHECK` allows NULLs. Next: indexes — how to make queries fast.