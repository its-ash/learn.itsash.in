# 01 — Introduction & Setup

## What Is SQL?

SQL (Structured Query Language) is the standard language for interacting with **relational databases** — systems that store data in tables of rows and columns with explicit relationships between them.

- **Declarative** — you describe *what* data you want, not *how* to fetch it. The query planner chooses the algorithm.
- **Set-based** — operations work on entire sets (tables) of rows at once, not one row at a time.
- **Strongly typed** — every column has a declared type; the database enforces and coerces.
- **Transactional** — grouped operations are atomic, consistent, isolated, and durable (ACID).
- **Standardized** — ANSI/ISO SQL is a real standard, but every engine extends it. Portability is aspirational, not guaranteed.

## The Relational Model

Data lives in **tables** (relations). Each table has **columns** (attributes) — each with a name and a type, **rows** (tuples) — each row is one record, and **keys** — a primary key uniquely identifies a row; foreign keys reference rows in other tables.

### Production Schema Example

::code-wrapper{language="sql" filename="schema.sql"}
```sql
-- A multi-table production schema for an e-commerce system.
-- Each table has explicit constraints, proper types, and indexes.

CREATE TABLE customers (
  -- UUID primary key avoids sequential enumeration attacks and
  -- allows distributed ID generation without central coordination.
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       CITEXT NOT NULL UNIQUE,           -- CITEXT = case-insensitive email lookup
  full_name   TEXT NOT NULL CHECK (full_name <> ''),
  phone       TEXT,                              -- nullable: not every customer has a phone
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exclude soft-deleted customers from the unique email constraint
  deleted_at  TIMESTAMPTZ
);

-- Partial unique index: email must be unique among non-deleted rows only.
-- This allows re-registration after soft-delete without violating uniqueness.
CREATE UNIQUE INDEX customers_email_active_uniq
  ON customers (email)
  WHERE deleted_at IS NULL;

CREATE TABLE orders (
  id           BIGSERIAL PRIMARY KEY,            -- sequential BIGINT (8 bytes); gap-free NOT guaranteed
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','paid','shipped','cancelled','refunded')),
  total        NUMERIC(12, 2) NOT NULL DEFAULT 0
               CHECK (total >= 0),               -- NUMERIC, not REAL — money needs exact arithmetic
  currency     CHAR(3) NOT NULL DEFAULT 'USD',   -- ISO 4217
  placed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for "show me customer X's recent orders" (hot path).
-- Column order matters: equality on customer_id, then sort on placed_at DESC.
CREATE INDEX idx_orders_customer_placed
  ON orders (customer_id, placed_at DESC);

-- Partial index: only pending orders need scanning — skips 99% of rows.
CREATE INDEX idx_orders_pending
  ON orders (placed_at)
  WHERE status = 'pending';

CREATE TABLE products (
  id          BIGSERIAL PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,              -- business identifier, stable across renames
  name        TEXT NOT NULL,
  price       NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  -- Snapshot of price at order time — price in products may change later.
  -- Without this, historical order totals would silently change.
  CHECK (quantity * unit_price <= 1000000)       -- sanity bound, prevents overflow in totals
);

-- Covering index: the join path order_items→products often only needs product_id + name.
-- A covering index lets the planner satisfy the query from the index alone (index-only scan).
CREATE INDEX idx_order_items_order_product
  ON order_items (order_id, product_id)
  INCLUDE (quantity, unit_price);

-- Auto-maintain updated_at on every row update.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();                         -- set before the row is written
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```
::

A row in `orders` *relates to* a row in `customers` via `customer_id`. The relational model's power is composing these relationships in queries (joins) without precomputing them.

## SQL Dialects Matter

The SQL standard is a baseline. Each engine (PostgreSQL, MySQL, SQLite, SQL Server, Oracle) extends and occasionally violates it.

| Feature | PostgreSQL | MySQL | SQLite | SQL Server | Oracle |
|---|---|---|---|---|---|
| `RETURNING` clause | ✅ | ✅ (8.0+) | ❌ | ✅ (`OUTPUT`) | ❌ |
| `JSONB` type | ✅ | ❌ (JSON only) | ❌ (TEXT) | ✅ (`JSON`) | ✅ (`JSON`) |
| Window functions | ✅ | ✅ (8.0+) | ✅ (3.25+) | ✅ | ✅ |
| Recursive CTEs | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| `INTERSECT`/`EXCEPT` | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| Materialized views | ✅ | ❌ (manual) | ❌ | ✅ (indexed views) | ✅ |
| `IDENTITY` columns | ✅ (10+) | ✅ | `AUTOINCREMENT` | ✅ | `GENERATED` |
| Booleans | real `BOOLEAN` | `TINYINT(1)` | integer 0/1 | `BIT` | ❌ (use `1`/`0`) |
| `EXPLAIN` output | plan tree | plan + estimates | query plan | plan XML | plan table |
| `LIMIT`/`OFFSET` | ✅ | ✅ | ✅ | ❌ (`TOP`/`FETCH`) | ❌ (`ROWNUM`/`FETCH`) |

This course uses **PostgreSQL** syntax as the default (most standard-compliant, most feature-rich open-source engine) and flags dialect differences where they matter.

## Installing PostgreSQL

### macOS (Homebrew)

::code-wrapper{language="bash"}
```bash
brew install postgresql@16          # install PostgreSQL 16
brew services start postgresql@16   # start as a background service

psql postgres                       # connect to default maintenance DB
```
::

### Linux (apt)

::code-wrapper{language="bash"}
```bash
sudo apt install postgresql postgresql-contrib   # contrib adds gen_random_uuid() etc.
sudo systemctl enable --now postgresql            # start on boot + immediately
sudo -u postgres psql                              # connect as the postgres superuser
```
::

### Docker (any OS)

::code-wrapper{language="bash"}
```bash
# --name pg: container alias; -e: env vars; -p: map host 5432 → container 5432
docker run --name pg \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=practice \
  -p 5432:5432 \
  -d postgres:16                   # -d: run detached (background)

psql -h localhost -U postgres -d practice
# password: secret
```
::

### SQLite

SQLite is a single-file embedded database — no server. Perfect for local prototyping and mobile apps.

::code-wrapper{language="bash"}
```bash
brew install sqlite                 # macOS
sudo apt install sqlite3            # Linux (Debian/Ubuntu)

sqlite3 --version                   # verify install
sqlite3 practice.db                 # create/open a DB file (created on first connect)
sqlite> .tables                     # list tables
sqlite> .quit
```
::

## The `psql` Client

`psql` is PostgreSQL's official CLI. Learn it — it's far more powerful than GUI tools for quick work.

| Command | Purpose |
|---|---|
| `\l` | List databases. |
| `\c dbname` | Connect to a database. |
| `\dt` | List tables. |
| `\dt+` | List tables with size and description. |
| `\d tablename` | Describe a table (columns, types, constraints). |
| `\d+ tablename` | Describe with storage info and comments. |
| `\df` | List functions. |
| `\dv` | List views. |
| `\dx` | List extensions. |
| `\x` | Toggle expanded (vertical) display — essential for wide rows. |
| `\x on` | Enable expanded display explicitly. |
| `\timing` | Toggle query timing. |
| `\timing on` | Enable query timing explicitly. |
| `\e` | Open the last query in `$EDITOR`. |
| `\ef funcname` | Edit a function definition in `$EDITOR`. |
| `\i file.sql` | Execute a SQL file. |
| `\o file.txt` | Send query output to a file (`\o` alone restores stdout). |
| `\pset pager off` | Disable the pager (useful when piping output). |
| `\set ECHO all` | Echo each statement before execution (debugging scripts). |
| `\?` | Help for backslash commands. |
| `\h CREATE TABLE` | Syntax help for a SQL command. |
| `\q` | Quit. |

::code-wrapper{language="bash"}
```bash
psql -h localhost -U postgres -d practice -c "SELECT now();"  # run one query, exit
psql -d practice -f setup.sql                                 # run a SQL file
psql -d practice < dump.sql                                   # restore from dump
psql -d practice -At -c "SELECT count(*) FROM customers"     # -A: unaligned, -t: tuples only → raw number
```
::

## Creating Your First Database

::code-wrapper{language="sql"}
```sql
-- DDL: create a database. Note: CREATE DATABASE cannot run inside a
-- transaction block (BEGIN/COMMIT), so it must be its own statement.
CREATE DATABASE practice;

-- In psql, switch to the new database:
--   \c practice

-- DDL: define a table. Each column has a type and constraints.
CREATE TABLE greetings (
  id      SERIAL PRIMARY KEY,              -- SERIAL = INTEGER + sequence + default
  message TEXT NOT NULL
);

-- DML: insert a row. The SERIAL column is auto-populated by the sequence.
INSERT INTO greetings (message) VALUES ('Hello, SQL!');

-- DQL: read it back. SELECT * is fine for exploration; in production code,
-- always list explicit columns (see Chapter 02).
SELECT * FROM greetings;
--  id |   message
-- ----+------------
--   1 | Hello, SQL!
```
::

## Loading Sample Data

::code-wrapper{language="bash"}
```bash
# Load the dvdrental sample database (15 tables: customer, payment, rental, film, ...)
wget https://www.postgresqltutorial.com/wp-content/uploads/2019/05/dvdrental.zip
unzip dvdrental.zip
createdb dvdrental
pg_restore -d dvdrental dvdrental.tar       # restore from the tar archive
psql -d dvdrental -c "\dt"                   # verify tables loaded
```
::

Minimal hand-typed schema for the examples in this course:

::code-wrapper{language="sql" filename="seed.sql"}
```sql
CREATE TABLE customers (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  city  TEXT                                  -- nullable: city may be unknown
);

CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  amount       NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  ordered_on   DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO customers (name, city) VALUES
  ('Alice', 'NYC'),
  ('Bob',   'LA'),
  ('Carol', NULL);                            -- Carol's city is unknown — see NULL chapters

INSERT INTO orders (customer_id, amount) VALUES
  (1, 99.50),
  (1, 12.00),
  (2, 450.00),
  (3, 7.25);
```
::

## SQL Statement Categories

| Category | Examples | Purpose |
|---|---|---|
| **DDL** (Data Definition) | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` | Define/modify schema. |
| **DML** (Data Manipulation) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Read/write rows. |
| **DCL** (Data Control) | `GRANT`, `REVOKE` | Permissions. |
| **TCL** (Transaction Control) | `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT` | Transaction boundaries. |

`SELECT` is technically DQL (Data Query Language), a subcategory of DML. Most practitioners just call it "queries."

## How a Query Executes

A SQL statement passes through these physical phases:

1. **Parse** — syntax check, build a parse tree.
2. **Plan** — the optimizer chooses access paths (seq scan vs index), join order, join methods.
3. **Execute** — the executor runs the plan, fetching and combining rows.

### Logical Evaluation Order

The SQL standard defines a **logical** evaluation order for `SELECT` (the physical order differs — the planner reorders for efficiency):

::code-wrapper{language="text"}
```text
FROM / JOIN  →  WHERE  →  GROUP BY  →  HAVING  →  SELECT  →  DISTINCT  →  ORDER BY  →  LIMIT/OFFSET
```
::

This order explains why you can't reference a column alias in `WHERE` (the alias is created in `SELECT`, which runs *after* `WHERE`) but *can* reference it in `ORDER BY` (which runs after `SELECT`).

::code-wrapper{language="sql"}
```sql
-- ❌ ERROR: column "total" does not exist
-- The alias "total" is assigned in SELECT (step 5), but WHERE runs at step 2.
-- At WHERE time, the alias doesn't exist yet — the planner doesn't know what "total" is.
SELECT amount * 1.08 AS total
FROM orders
WHERE total > 100;

-- ✅ Correct: repeat the full expression in WHERE.
-- The planner may optimize this to compute it once, but you must write it out.
SELECT amount * 1.08 AS total
FROM orders
WHERE amount * 1.08 > 100;

-- ✅ Alias IS visible in ORDER BY — ORDER BY runs after SELECT, so the alias exists.
SELECT amount * 1.08 AS total
FROM orders
ORDER BY total DESC;
```
::

### EXPLAIN: Seeing the Real Plan

::code-wrapper{language="sql"}
```sql
EXPLAIN SELECT c.name, o.id, o.amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.amount > 50;
```
::

::code-wrapper{language="text"}
```text
 Hash Join  (cost=38.05..60.15 rows=2 width=46)
   Hash Cond: (c.id = o.customer_id)
   ->  Seq Scan on customers c  (cost=0.00..22.00 rows=1200 width=42)
   ->  Hash  (cost=37.75..37.75 rows=24 width=12)
         ->  Seq Scan on orders o  (cost=0.00..37.75 rows=24 width=12)
               Filter: (amount > 50)
```
::

The plan reads inside-out: `orders` is seq-scanned and filtered (`amount > 50`), then a hash table is built from the filtered rows, then `customers` is seq-scanned and hash-joined. The `cost` is the planner's estimate (arbitrary units, not milliseconds). Use `EXPLAIN ANALYZE` to get actual execution times and compare estimates vs reality.

::code-wrapper{language="sql"}
```sql
-- EXPLAIN ANALYZE actually executes the query and shows real timings.
-- Useful for finding where the planner's estimates diverge from reality.
EXPLAIN ANALYZE SELECT c.name, o.id, o.amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.amount > 50;
```
::

## 💡 Tips & Tricks

- **Idiom**: always run `EXPLAIN` (or `EXPLAIN ANALYZE`) on a slow query *before* adding an index — the plan tells you whether an index would even help, and adding indexes that aren't used just slows down writes.
- **Debug**: in `psql`, prefix a query with `\x` (expanded display) when a row is too wide to read in horizontal mode — the vertical layout puts each column on its own line and makes inspecting a single wide row trivial.
- **Debug**: use `\e` in `psql` to edit your last query in `$EDITOR` (vim/nano/VS Code) — far faster than re-typing a multi-line query that had a typo, and the edited buffer re-executes on save/quit.
- **Portability**: prefer `CURRENT_TIMESTAMP` over `now()` in portable SQL — `now()` is PostgreSQL-specific (though widely supported); `CURRENT_TIMESTAMP` is ANSI standard.
- **Performance**: `psql -c "SELECT count(*) FROM big_table"` can take minutes on a huge table because PostgreSQL's MVCC forces a full scan for `count(*)` — use an approximate count from `pg_class.reltuples` for a quick estimate:

::code-wrapper{language="sql"}
```sql
-- Approximate row count — reads from the catalog, no table scan.
-- reltuples is updated by ANALYZE/VACUUM, so it may be slightly stale.
SELECT reltuples::bigint AS approx_rows
FROM pg_class
WHERE relname = 'big_table';
```
::

## ⚠️ Edge Cases & Gotchas

- **Case sensitivity**: unquoted identifiers in PostgreSQL are folded to lowercase. `CREATE TABLE Users (...)` creates a table named `users`; `SELECT * FROM Users` works. But `CREATE TABLE "Users" (...)` (quoted) creates a literally-cased table that you must *always* quote — a common source of "table does not exist" errors. Avoid quoted identifiers unless you have a specific reason.
- **`psql` semicolons**: `psql` buffers input until it sees a `;` (or a backslash command). If nothing happens when you press Enter, you forgot the semicolon — type `;` and press Enter to run the buffered statement.
- **SQLite type affinity**: SQLite doesn't strictly enforce column types — it uses "type affinity" and will happily store a string in an `INTEGER` column. This masks bugs that PostgreSQL would catch. Use PostgreSQL for learning schema discipline.
- **Keyword conflicts**: `order`, `user`, `group`, `table`, `select` are reserved words. Naming a table `order` or `user` forces you to quote it forever. Use `orders`, `users`, `groups` instead.
- **`SERIAL` gaps**: if a transaction inserts a row and then rolls back, the sequence value is *not* returned to the pool — gaps in `SERIAL`/`IDENTITY` columns are expected and normal, not a bug. Sequences live outside transaction semantics for performance.
- **Connection string security**: `psql "postgresql://user:pass@host:5432/dbname"` — the password in the URL is visible in shell history and process lists. Prefer `~/.pgpass` or `PGPASSWORD` env var.
- **`CREATE DATABASE` in transactions**: `CREATE DATABASE` cannot run inside a transaction block, so you can't put it in a `BEGIN`/`COMMIT` script. Use the `createdb` shell command instead, or run it standalone.

## 🧠 Spot the Bug

A developer writes this and is surprised the alias doesn't work in the `WHERE` clause:

::code-wrapper{language="sql"}
```sql
SELECT
  customer_id,
  SUM(amount) AS total_spent
FROM orders
WHERE total_spent > 100
GROUP BY customer_id;
```
::

What's wrong, and what are the **two** distinct bugs here?

<details>
<summary>Answer</summary>

**Bug 1 — Alias not visible in `WHERE`:** The logical evaluation order is `FROM → WHERE → GROUP BY → HAVING → SELECT`. The alias `total_spent` is created in `SELECT` (step 5), but `WHERE` runs at step 2 — before the alias exists. The planner reports `column "total_spent" does not exist`.

**Bug 2 — Aggregate in `WHERE`:** Even if the alias were somehow available, `WHERE` cannot reference aggregate functions like `SUM()`. Aggregates aren't computed until `GROUP BY` runs (step 3), and `WHERE` runs before grouping. The correct clause for filtering on aggregates is `HAVING` (which runs *after* `GROUP BY`).

::code-wrapper{language="sql"}
```sql
-- ✅ Fix: use HAVING to filter on the aggregate (runs after GROUP BY)
SELECT
  customer_id,
  SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 100;            -- reference the raw aggregate, not the alias (portability)
```
::

</details>

## Summary

You now have a production-grade schema with constraints and indexes, know how to inspect the query plan with `EXPLAIN`, understand the logical evaluation order that governs alias visibility, and can navigate the `psql` CLI efficiently. Next: `SELECT` basics and row filtering with `WHERE`.