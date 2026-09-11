# 12 — Constraints & Keys

Constraints are rules the database enforces on data — the "guardrails" that keep data consistent regardless of application bugs. Constraints are the difference between a database and a spreadsheet. This chapter is a code-first reference for every constraint type, their gotchas, and production patterns for zero-downtime constraint management.

## The Constraint Toolkit

| Constraint | Purpose | NULL Behavior |
|---|---|---|
| `NOT NULL` | Column can't be NULL. | Rejects NULL. |
| `UNIQUE` | No duplicate non-NULL values. | Multiple NULLs allowed (PG, standard). |
| `PRIMARY KEY` | `NOT NULL` + `UNIQUE`. One per table. | Rejects NULL. |
| `FOREIGN KEY` | Value must exist in another table. | NULL allowed (means "no reference"). |
| `CHECK` | Arbitrary boolean expression must be TRUE. | UNKNOWN (NULL) passes. |
| `EXCLUDE` (PG) | No two rows satisfy a custom operator predicate. | Depends on operator. |

## NOT NULL

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,        -- required: INSERT without email fails
  name  TEXT                  -- optional: NULL allowed, default is NULL
);

-- Adding NOT NULL to an existing column with NULLs requires backfilling first.
-- The SET NOT NULL must verify no existing row is NULL → full table scan under lock.

-- ❌ WRONG: fails if any NULL exists, and holds ACCESS EXCLUSIVE lock during scan.
ALTER TABLE users ALTER COLUMN name SET NOT NULL;

-- ✅ CORRECT: backfill, then add via NOT VALID + VALIDATE (light lock).
UPDATE users SET name = 'Unknown' WHERE name IS NULL;

ALTER TABLE users ADD CONSTRAINT users_name_nn CHECK (name IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_name_nn;
-- Then optionally: ALTER TABLE users ALTER COLUMN name SET NOT NULL;
-- (The CHECK constraint is functionally equivalent and was added with a light lock.)
```
::

Add `NOT NULL` to every column unless you have a specific reason to allow NULL. NULL handling is error-prone (three-valued logic); fewer NULLs = fewer bugs.

## UNIQUE

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id        BIGSERIAL PRIMARY KEY,
  email     TEXT UNIQUE,                              -- column-level, single column
  -- Table-level: composite unique on (tenant_id, email).
  -- NULLs in any column are allowed (multiple NULL rows don't violate).
  CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email)
);

-- ⚠️ UNIQUE allows multiple NULLs in PostgreSQL (and standard SQL).
-- NULL != NULL in three-valued logic, so two NULL rows don't "conflict."
-- SQL Server is the exception (allows only one NULL).

-- "At most one non-NULL" pattern: partial unique index excluding NULLs.
CREATE UNIQUE INDEX users_email_one_null
  ON users (email) WHERE email IS NOT NULL;
```
::

A `UNIQUE` constraint is implemented as a unique B-tree index under the hood — so it gives you an index for lookups too. No need to add a separate index on a `UNIQUE` column.

## PRIMARY KEY

The primary key uniquely identifies each row. It's `NOT NULL` + `UNIQUE` + (in some engines) a clustering hint.

::code-wrapper{language="sql"}
```sql
-- Surrogate key: artificial ID, no business meaning. Stable, uniform, simple joins.
CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,        -- auto-incrementing 8-byte integer
  email TEXT NOT NULL
);

-- Natural key: real-world identifier. Meaningful, but can change.
CREATE TABLE countries (
  code        CHAR(2) PRIMARY KEY,    -- ISO 3166-1 alpha-2, genuinely immutable
  name        TEXT NOT NULL
);

-- Composite PK: natural for junction tables (many-to-many).
CREATE TABLE order_items (
  order_id    BIGINT  NOT NULL REFERENCES orders(id),
  product_id  BIGINT  NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)   -- uniqueness on the combination
);
```
::

### Surrogate vs Natural Keys

| Aspect | Surrogate (`BIGSERIAL`/`UUID`) | Natural (`email`, `isbn`) |
|---|---|---|
| Stability | Never changes | Can change (email rename, ISBN-10→13) |
| Joins | Uniform type, simple | Varying types, wider |
| Readability | Opaque ID | Meaningful |
| Storage | Extra column | No extra column |
| FK cascade | No `ON UPDATE CASCADE` needed | If key changes, all FKs must cascade |

**Default to surrogate keys** (`BIGSERIAL` or `UUID`). Use natural keys only when truly immutable and unique (e.g., `country_code`). Natural keys that *might* change force `ON UPDATE CASCADE` across every referencing FK — expensive on large graphs.

### Composite PK Column Order

A composite PK `(tenant_id, id)` can serve `WHERE tenant_id = ?` (leftmost prefix) but **not** `WHERE id = ?` alone. Order PK columns by selectivity and query pattern.

## FOREIGN KEY

A FK enforces referential integrity: "this value must exist in another table."

::code-wrapper{language="sql"}
```sql
-- Column-level FK (inline, auto-named).
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  amount      NUMERIC(10,2) NOT NULL
);

-- Table-level FK with explicit name and ON DELETE action.
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  CONSTRAINT orders_customer_fk
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE CASCADE           -- delete customer → delete their orders
    ON UPDATE CASCADE           -- update customer.id → update orders.customer_id
);
```
::

### ON DELETE / ON UPDATE Actions

| Action | Behavior on parent delete/update |
|---|---|
| `NO ACTION` (default) | Blocks if referencing rows exist. Check is deferred to end of statement (can be deferred to commit). |
| `RESTRICT` | Blocks immediately. Cannot be deferred. |
| `CASCADE` | Deletes/updates referencing rows too. Propagates through cascade chains. |
| `SET NULL` | Sets FK column to NULL in referencing rows. Column must be nullable. |
| `SET DEFAULT` | Sets FK column to its `DEFAULT`. Column must have a default. |

::code-wrapper{language="sql"}
```sql
-- CASCADE chain: deleting a customer → orders → order_items → audit_logs.
-- Always review the full cascade graph before adding CASCADE.
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE order_items (
  id         BIGSERIAL PRIMARY KEY,
  order_id   BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  -- ^ deleting an order cascades to its items (true composition — correct)
);

-- Self-referencing FK: manager_id → employees.id.
-- Root node has manager_id = NULL (must be nullable).
CREATE TABLE employees (
  id         BIGSERIAL PRIMARY KEY,
  manager_id BIGINT REFERENCES employees(id) ON DELETE SET NULL
  -- ^ deleting a manager sets reports' manager_id to NULL (orphan-safe)
);
```
::

**`CASCADE` is powerful and dangerous.** An accidental `DELETE FROM customers WHERE id = 1` can wipe orders, order_items, and audit_logs in one statement. Use `CASCADE` only for true composition (parent owns children). For "soft" relationships, use `SET NULL` or `RESTRICT`.

### FKs and Performance

A FK adds:
- A **lookup** on every `INSERT`/`UPDATE` of the FK column — needs an index on the referenced PK (PKs are indexed by default).
- A **lock** on the referenced row (prevents it being deleted before the FK insert commits).
- **No automatic index on the FK column itself** — you must add one.

::code-wrapper{language="sql"}
```sql
-- ❌ MISSING INDEX: ON DELETE CASCADE from customers scans ALL of orders
--    to find referencing rows, holding a lock the entire time.
-- ✅ ALWAYS index FK columns:
CREATE INDEX orders_customer_id_idx ON orders(customer_id);
```
::

### Deferred FK Checks

By default, FKs are checked at statement end. With `DEFERRABLE INITIALLY DEFERRED`, the check is postponed to transaction commit — useful for circular references or multi-step reorderings.

::code-wrapper{language="sql"}
```sql
-- Circular FK: a has FK to b, b has FK to a. Neither can be inserted first
-- without deferring one of them.
CREATE TABLE a (
  id    BIGSERIAL PRIMARY KEY,
  b_id  BIGINT,
  CONSTRAINT a_b_fk FOREIGN KEY (b_id) REFERENCES b(id)
    DEFERRABLE INITIALLY DEFERRED    -- check at COMMIT, not at INSERT
);

CREATE TABLE b (
  id    BIGSERIAL PRIMARY KEY,
  a_id  BIGINT,
  CONSTRAINT b_a_fk FOREIGN KEY (a_id) REFERENCES a(id)
    DEFERRABLE INITIALLY DEFERRED
);

-- Now you can insert in any order within a transaction:
BEGIN;
INSERT INTO a (id, b_id) VALUES (1, 1);
INSERT INTO b (id, a_id) VALUES (1, 1);
COMMIT;  -- FK checks happen here, both references satisfied

-- You can also defer a DEFERRABLE constraint per-transaction:
SET CONSTRAINTS a_b_fk DEFERRED;
```
::

## CHECK Constraints

::code-wrapper{language="sql"}
```sql
CREATE TABLE products (
  id    BIGSERIAL PRIMARY KEY,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  qty   INTEGER NOT NULL CHECK (qty >= 0),
  -- Table-level: can reference multiple columns.
  CONSTRAINT valid_price_qty CHECK (price * qty >= 0)
);

-- ⚠️ CHECK passes on UNKNOWN (NULL): CHECK (price > 0) allows price = NULL
--    because NULL > 0 is UNKNOWN, and constraints only reject FALSE.
--    Add NOT NULL separately to forbid NULL.

-- CHECK can only reference the CURRENT ROW — no subqueries, no other tables.
-- ❌ This is invalid:
-- CHECK (price < (SELECT MAX(price) FROM products))
-- ✅ Use a trigger for cross-row/cross-table rules.

-- Adding CHECK to a large table without a long lock:
ALTER TABLE products ADD CONSTRAINT positive_price CHECK (price >= 0) NOT VALID;
ALTER TABLE products VALIDATE CONSTRAINT positive_price;
-- NOT VALID: metadata-only, skips existing rows (instant).
-- VALIDATE: scans with SHARE UPDATE EXCLUSIVE lock (concurrent reads/writes continue).
```
::

## EXCLUDE Constraints (PostgreSQL)

An `EXCLUDE` constraint prevents two rows from satisfying a predicate — a generalization of `UNIQUE`. The classic use is **no overlapping time ranges**.

::code-wrapper{language="sql"}
```sql
-- Requires btree_gist extension for = operator on scalars in a GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
  id          BIGSERIAL PRIMARY KEY,
  room_id     INTEGER NOT NULL,
  -- TSTZRANGE: range of timestamps with timezone. '[)' = inclusive start, exclusive end.
  during      TSTZRANGE NOT NULL,

  -- EXCLUDE: no two rows where room_id is equal AND during overlaps (&&).
  -- GiST index supports the && (overlaps) operator on range types.
  EXCLUDE USING gist (
    room_id WITH =,      -- equality on scalar (needs btree_gist)
    during  WITH &&      -- overlap on range (native GiST)
  )
);

-- This insert succeeds (same room, non-overlapping times):
INSERT INTO bookings (room_id, during) VALUES
  (1, '[2024-01-01 09:00, 2024-01-01 10:00)');

-- This insert FAILS (same room, overlapping time):
INSERT INTO bookings (room_id, during) VALUES
  (1, '[2024-01-01 09:30, 2024-01-01 11:00)');
-- ERROR: conflicting key value violates exclusion constraint

-- The constraint is enforced at WRITE TIME — no race conditions,
-- unlike application-level checks which fail under concurrent inserts.
```
::

## Domain Constraints (PostgreSQL)

A **domain** is a custom type with constraints, reusable across columns:

::code-wrapper{language="sql"}
```sql
CREATE DOMAIN email_t AS TEXT
  CHECK (value ~ '^[^@]+@[^@]+\.[^@]+$');

CREATE DOMAIN positive_int AS INTEGER
  CHECK (value > 0);

CREATE TABLE users (
  id    BIGSERIAL PRIMARY KEY,
  email email_t NOT NULL,           -- reuses the domain constraint
  age   positive_int                -- reuses the domain constraint
);

-- Domains can be altered: ALTER DOMAIN email_t ADD CONSTRAINT ...;
-- Changes propagate to all columns using the domain.
```
::

## Complex Implementation: Referential Integrity with Cascades, CHECKs, and EXCLUDE

::code-wrapper{language="sql"}
```sql
-- A hotel booking system with:
-- - FK cascades for composition (booking → booking_services)
-- - FK RESTRICT for soft relationships (guests → bookings)
-- - CHECK constraints for business rules
-- - EXCLUDE for no overlapping room bookings

CREATE TABLE guests (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guests_email_unique UNIQUE (email),
  CONSTRAINT guests_email_format CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

CREATE TABLE rooms (
  id       BIGSERIAL PRIMARY KEY,
  floor    INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  CONSTRAINT rooms_floor CHECK (floor >= 0),
  CONSTRAINT rooms_capacity CHECK (capacity > 0 AND capacity <= 10)
);

CREATE TABLE bookings (
  id         BIGSERIAL PRIMARY KEY,
  guest_id   BIGINT NOT NULL,
  room_id    BIGINT NOT NULL,
  during     TSTZRANGE NOT NULL,
  -- Business rule: checkout must be after checkin (enforced by range type, but
  -- explicit CHECK gives a clearer error message).
  status     TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','checked_in','checked_out','cancelled')),
  total      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  -- FK: don't delete a guest with bookings (archive instead).
  CONSTRAINT bookings_guest_fk FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT,
  -- FK: don't delete a room with bookings.
  CONSTRAINT bookings_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
  -- EXCLUDE: no two active bookings for the same room with overlapping dates.
  -- Only applies to non-cancelled bookings (partial exclusion via WHERE on the constraint).
  EXCLUDE USING gist (
    room_id WITH =,
    during  WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX bookings_guest_id_idx ON bookings(guest_id);
CREATE INDEX bookings_room_id_idx  ON bookings(room_id);

-- Booking services: true composition — cascade delete with parent booking.
CREATE TABLE booking_services (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  BIGINT NOT NULL,
  service_name TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  CONSTRAINT services_booking_fk
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX booking_services_booking_id_idx ON booking_services(booking_id);
```
::

## Anti-Pattern: Application-Level Validation Instead of Database Constraints

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: checking uniqueness in application code.
-- Two concurrent requests both check: "does email exist?" → both see "no" → both insert.
-- This is a TOCTOU (time-of-check-time-of-use) race condition.

-- Pseudo-code (application layer):
--   if not db.query("SELECT 1 FROM users WHERE email = ?", email):
--       db.execute("INSERT INTO users (email) VALUES (?)", email)
--   else:
--       raise "email already exists"

-- Under concurrency:
--   T1: SELECT 1 FROM users WHERE email = 'a@x.com' → 0 rows (no)
--   T2: SELECT 1 FROM users WHERE email = 'a@x.com' → 0 rows (no)
--   T1: INSERT INTO users (email) VALUES ('a@x.com') → success
--   T2: INSERT INTO users (email) VALUES ('a@x.com') → success → DUPLICATE!

-- ✅ CORRECT: enforce in the database with a UNIQUE constraint.
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Now the second INSERT fails atomically, regardless of timing:
--   T2: INSERT INTO users (email) VALUES ('a@x.com')
--   → ERROR: duplicate key value violates unique constraint "users_email_unique"

-- Application catches the error and returns "email already exists."
-- No race condition possible — the constraint is checked at write time under a lock.
```
::

## 💡 Tips & Tricks

- **Idiom — always index FK columns**: the FK constraint doesn't create an index on the referencing column. Without it, `ON DELETE CASCADE`/`SET NULL` and parent-table joins do full scans. `CREATE INDEX ON orders(customer_id)` is a near-universal best practice.
- **Idiom — `ON DELETE RESTRICT` (default) vs `CASCADE`**: use `RESTRICT` when the child shouldn't vanish with the parent (a user's orders shouldn't disappear — archive instead). Use `CASCADE` only for true composition (an order's items).
- **Idiom — deferrable constraints for circular references**: `DEFERRABLE INITIALLY DEFERRED` postpones FK checks to `COMMIT`, allowing inserts in any order within a transaction. Essential for circular FK graphs.
- **Idiom — EXCLUDE for temporal/range data**: `EXCLUDE USING gist (room_id WITH =, during WITH &&)` prevents overlapping bookings at write time — no race conditions, far more reliable than application-level checks.
- **Performance — NOT VALID + VALIDATE for large tables**: `ADD CONSTRAINT ... NOT VALID` is metadata-only (no scan). `VALIDATE` scans with `SHARE UPDATE EXCLUSIVE` (concurrent reads/writes continue). Standard for zero-downtime migrations.
- **Idiom — name every constraint**: named constraints give readable errors and can be dropped/replaced by name. Auto-generated names are brittle across schema diff tools.
- **Idiom — partial unique index for "at most one NULL"**: `CREATE UNIQUE INDEX ... WHERE col IS NOT NULL` enforces uniqueness only on non-NULL rows, since `UNIQUE` constraints allow multiple NULLs.

## ⚠️ Edge Cases & Gotchas

- **`UNIQUE` allows multiple NULLs** (PG, standard; SQL Server allows one): two NULL rows don't violate uniqueness because `NULL != NULL` in three-valued logic. Use a partial unique index (`WHERE col IS NOT NULL`) for "at most one non-NULL."
- **`CHECK` passes on NULL (UNKNOWN)**: `CHECK (price > 0)` allows `price = NULL` because `NULL > 0` is `UNKNOWN`, and constraints only reject `FALSE`. Add `NOT NULL` separately to forbid NULL.
- **`CHECK` can't reference other rows**: a `CHECK` expression can only reference the current row's columns — no subqueries, no other tables. For cross-row/cross-table rules, use triggers or `EXCLUDE`.
- **`ON DELETE SET DEFAULT` requires a default**: the FK column must have a `DEFAULT` set, or `SET DEFAULT` fails at delete time.
- **`CASCADE` chains propagate through the entire FK graph**: deleting a customer can cascade to orders → order_items → audit_logs. Always review the full cascade graph before adding `CASCADE`.
- **FK columns aren't auto-indexed**: without an index on `orders.customer_id`, `ON DELETE CASCADE` from `customers` scans all of `orders` to find referencing rows — and holds a lock while doing so. Always index FK columns.
- **`PRIMARY KEY` is clustered in MySQL/SQL Server, heap in PG**: in MySQL/SQL Server, the PK determines physical row order. In PG, the PK is a B-tree but physical row order is heap (unless you `CLUSTER`). This affects range-scan performance.
- **Composite PK column order matters**: `(tenant_id, id)` serves `WHERE tenant_id = ?` (leftmost prefix) but not `WHERE id = ?` alone. Order by selectivity and query pattern.
- **`DEFERRABLE` must be set at creation**: you can't make a non-deferrable FK deferred mid-transaction. Plan for deferrability if you have circular references.
- **`EXCLUDE` needs a matching index operator class**: `EXCLUDE USING gist (during WITH &&)` requires GiST support for `&&` on the column's type. For scalar columns in an EXCLUDE, install `btree_gist`.
- **Adding `NOT NULL` to a column with existing data**: `ALTER TABLE ... ALTER COLUMN col SET NOT NULL` scans the entire table to verify no NULLs, under `ACCESS EXCLUSIVE` lock. Use the `NOT VALID` + `VALIDATE` CHECK constraint pattern for zero-downtime.

## 🧠 Spot the Bug

A team adds this constraint to enforce that prices are positive, then discovers that a row with `price = NULL` exists and the constraint didn't catch it. Why?

::code-wrapper{language="sql"}
```sql
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price > 0);
```
::

<details>
<summary>Answer</summary>

`CHECK` constraints pass when the expression evaluates to `TRUE` **or `UNKNOWN`**. `NULL > 0` is `UNKNOWN` (any comparison with NULL is UNKNOWN in three-valued logic), and a `CHECK` constraint treats `UNKNOWN` as "not a violation" — the row passes. So `price = NULL` satisfies `CHECK (price > 0)`.

This is by design: `CHECK` constraints only reject rows where the expression is `FALSE`. They don't enforce `NOT NULL` — that's a separate constraint. If you want `price` to be both non-NULL and positive, you need both:

::code-wrapper{language="sql"}
```sql
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price > 0);
```
::

Or combine them in the CHECK with an explicit NULL test (less idiomatic — the `NOT NULL` produces a more specific error message):

::code-wrapper{language="sql"}
```sql
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price IS NOT NULL AND price > 0);
```
::

**The lesson**: `CHECK` constraints allow NULLs (UNKNOWN passes). Use `NOT NULL` to forbid NULL, and `CHECK` to enforce a domain on non-NULL values.

</details>