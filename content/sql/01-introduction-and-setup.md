# 01 — Introduction & Setup

## What Is SQL?

SQL (Structured Query Language, pronounced "S-Q-L" or "sequel") is the standard language for interacting with **relational databases** — systems that store data in tables of rows and columns with explicit relationships between them. Key characteristics:

- **Declarative** — you describe *what* data you want, not *how* to fetch it. The query planner chooses the algorithm.
- **Set-based** — operations work on entire sets (tables) of rows at once, not one row at a time.
- **Strongly typed** — every column has a declared type; the database enforces and coerces.
- **Transactional** — grouped operations are atomic, consistent, isolated, and durable (ACID).
- **Standardized** — ANSI/ISO SQL is a real standard, but every engine extends it. Portability is aspirational, not guaranteed.

## The Relational Model

Data lives in **tables** (relations). Each table has:

- **Columns** (attributes) — each with a name and a type.
- **Rows** (tuples) — each row is one record; a row's set of column values is the tuple.
- **Keys** — a primary key uniquely identifies a row; foreign keys reference rows in other tables, expressing relationships.

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id    SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE orders (
  id       SERIAL PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  total    NUMERIC(10, 2) NOT NULL,
  placed_at TIMESTAMPTZ DEFAULT now()
);
```
::

A row in `orders` *relates to* a row in `users` via `user_id`. The relational model's power is composing these relationships in queries (joins) without precomputing them.

## SQL Dialects Matter

The SQL standard is a baseline. Each engine (PostgreSQL, MySQL, SQLite, SQL Server, Oracle) extends and occasionally violates it. Examples of divergence:

| Feature | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| `RETURNING` clause | ✅ | ✅ (8.0+) | ❌ |
| `JSONB` type | ✅ | ❌ (JSON only) | ❌ (TEXT) |
| Window functions | ✅ | ✅ (8.0+) | ✅ (3.25+) |
| Recursive CTEs | ✅ | ✅ (8.0+) | ✅ |
| `INTERSECT`/`EXCEPT` | ✅ | ✅ (8.0+) | ✅ |
| Materialized views | ✅ | ❌ (manual) | ❌ |
| `IDENTITY` columns | ✅ (10+) | ✅ | uses `AUTOINCREMENT` |
| Booleans | real `BOOLEAN` | `TINYINT(1)` | integer 0/1 |

This course uses **PostgreSQL** syntax as the default (most standard-compliant, most feature-rich open-source engine) and flags dialect differences where they matter. **SQLite** is fine for chapters 01–20 (no server needed); chapters 21–28 benefit from PostgreSQL.

## Installing PostgreSQL

### macOS (Homebrew)

::code-wrapper{language="bash"}
```bash
brew install postgresql@16
brew services start postgresql@16

# Connect to the default database
psql postgres
```
::

### Linux (apt)

::code-wrapper{language="bash"}
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql
```
::

### Docker (any OS)

::code-wrapper{language="bash"}
```bash
docker run --name pg \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=practice \
  -p 5432:5432 \
  -d postgres:16

psql -h localhost -U postgres -d practice
# password: secret
```
::

## Installing SQLite

SQLite is a single-file embedded database — no server. Perfect for learning and prototyping.

::code-wrapper{language="bash"}
```bash
# macOS
brew install sqlite

# Linux
sudo apt install sqlite3

# Verify
sqlite3 --version

# Create/open a database file
sqlite3 practice.db
sqlite> .tables
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
| `\d tablename` | Describe a table (columns, types, constraints). |
| `\df` | List functions. |
| `\dv` | List views. |
| `\dx` | List extensions. |
| `\x` | Toggle expanded (vertical) display — essential for wide rows. |
| `\timing` | Toggle query timing. |
| `\e` | Open the last query in `$EDITOR`. |
| `\?` | Help for backslash commands. |
| `\h CREATE TABLE` | Syntax help for a SQL command. |
| `\q` | Quit. |

::code-wrapper{language="bash"}
```bash
psql -h localhost -U postgres -d practice -c "SELECT now();"
psql -d practice -f setup.sql        # run a SQL file
psql -d practice < dump.sql          # restore from dump
```
::

## Creating Your First Database

::code-wrapper{language="sql"}
```sql
-- Create a database
CREATE DATABASE practice;

-- Connect to it (in psql: \c practice)

-- Create a table
CREATE TABLE greetings (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL
);

-- Insert a row
INSERT INTO greetings (message) VALUES ('Hello, SQL!');

-- Query it
SELECT * FROM greetings;
--  id |   message
-- ----+------------
--   1 | Hello, SQL!
```
::

## Loading Sample Data

A realistic dataset makes learning stick. Set up the classic `dvdrental` sample database:

::code-wrapper{language="bash"}
```bash
# PostgreSQL — load the dvdrental sample
wget https://www.postgresqltutorial.com/wp-content/uploads/2019/05/dvdrental.zip
unzip dvdrental.zip
createdb dvdrental
pg_restore -d dvdrental dvdrental.tar
psql -d dvdrental -c "\dt"
```
::

The dvdrental database has 15 tables (customer, payment, rental, film, actor, etc.) and is used in many examples in this course. If you prefer a minimal setup, here's a tiny schema to type by hand:

::code-wrapper{language="sql"}
```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  ordered_on DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO customers (name, city) VALUES
  ('Alice', 'NYC'),
  ('Bob', 'LA'),
  ('Carol', 'NYC');

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

## How a Query Executes (Conceptually)

A SQL statement passes through these logical phases (the physical order differs — the planner reorders):

1. **Parse** — syntax check, build a parse tree.
2. **Plan** — the optimizer chooses access paths (seq scan vs index), join order, join methods.
3. **Execute** — the executor runs the plan, fetching and combining rows.

The **logical evaluation order** of a `SELECT` (per the SQL standard) is:

::code-wrapper{language="text"}
```text
FROM / JOIN   →  WHERE  →  GROUP BY  →  HAVING  →  SELECT  →  DISTINCT  →  ORDER BY  →  LIMIT
```
::

This order explains why you can't reference a column alias in `WHERE` (the alias is created in `SELECT`, which runs *after* `WHERE`) but *can* reference it in `ORDER BY` (which runs after `SELECT`).

::code-wrapper{language="sql"}
```sql
-- ❌ ERROR: column "total" does not exist (alias not visible in WHERE)
SELECT amount * 1.08 AS total
FROM orders
WHERE total > 100;

-- ✅ Repeat the expression
SELECT amount * 1.08 AS total
FROM orders
WHERE amount * 1.08 > 100;

-- ✅ Alias IS visible in ORDER BY (runs after SELECT)
SELECT amount * 1.08 AS total
FROM orders
ORDER BY total DESC;
```
::

## 💡 Tips & Tricks

- **Idiom**: always run `EXPLAIN` (or `EXPLAIN ANALYZE`) on a slow query *before* adding an index — the plan tells you whether an index would even help, and adding indexes that aren't used just slows down writes.
- **Debug**: in `psql`, prefix a query with `\x` (expanded display) when a row is too wide to read in horizontal mode — the vertical layout puts each column on its own line and makes inspecting a single wide row trivial.
- **Idiom**: use `\e` in `psql` to edit your last query in `$EDITOR` (vim/nano/VS Code) — far faster than re-typing a multi-line query that had a typo, and the edited buffer re-executes on save/quit.
- **Portability**: prefer `CURRENT_TIMESTAMP` over `now()` in portable SQL — `now()` is PostgreSQL-specific (though widely supported); `CURRENT_TIMESTAMP` is ANSI standard.
- **Performance**: `psql -c "SELECT count(*) FROM big_table"` can take minutes on a huge table because PostgreSQL's MVCC forces a full scan for `count(*)` — use an approximate count from `pg_class.reltuples` for a quick estimate: `SELECT reltuples::bigint FROM pg_class WHERE relname='big_table';`.

## ⚠️ Edge Cases & Gotchas

- **Case sensitivity**: unquoted identifiers in PostgreSQL are folded to lowercase. `CREATE TABLE Users (...)` creates a table named `users`; `SELECT * FROM Users` works. But `CREATE TABLE "Users" (...)` (quoted) creates a literally-cased table that you must *always* quote — a common source of "table does not exist" errors. Avoid quoted identifiers unless you have a specific reason.
- **`psql` semicolons**: `psql` buffers input until it sees a `;` (or a backslash command). If nothing happens when you press Enter, you forgot the semicolon — type `;` and press Enter to run the buffered statement.
- **SQLite type affinity**: SQLite doesn't strictly enforce column types — it uses "type affinity" and will happily store a string in an `INTEGER` column. This masks bugs that PostgreSQL would catch. Use PostgreSQL for learning schema discipline.
- **Keyword conflicts**: `order`, `user`, `group`, `table`, `select` are reserved words. Naming a table `order` or `user` forces you to quote it forever. Use `orders`, `users`, `groups` instead.
- **`createdb` vs `CREATE DATABASE`**: `CREATE DATABASE` cannot run inside a transaction block, so you can't put it in a `BEGIN`/`COMMIT` script. Use the `createdb` shell command instead, or run it standalone.
- **Connection strings**: `psql "postgresql://user:pass@host:5432/dbname"` — the password in the URL is visible in shell history and process lists. Prefer `~/.pgpass` or `PGPASSWORD` env var.
- **`SERIAL` is not atomic across rollback**: if a transaction inserts a row and then rolls back, the sequence value is *not* returned to the pool — gaps in `SERIAL`/`IDENTITY` columns are expected and normal, not a bug.

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

What's wrong, and what are the two distinct bugs here?

<details>
<summary>Answer</summary>

There are **two** bugs, both stemming from the logical evaluation order (`FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`):

1. **Alias in `WHERE`**: `total_spent` is defined in the `SELECT` clause, which runs *after* `WHERE`. At the time `WHERE` is evaluated, `total_spent` doesn't exist yet — the column is unknown. Aliases are only visible to clauses that run *after* `SELECT` (i.e., `ORDER BY` and `LIMIT`).

2. **Aggregate in `WHERE`**: even if you replaced the alias with the real expression `SUM(amount)`, it still fails — aggregates aren't allowed in `WHERE` because `WHERE` filters rows *before* grouping happens. Filtering on an aggregated value is the job of `HAVING`, which runs *after* `GROUP BY`.

**The fix**: move the aggregate condition to `HAVING`:

```sql
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 100;
```
::
**The lesson**: `WHERE` filters *input* rows (before grouping); `HAVING` filters *output* groups (after grouping). Use the raw expression in `HAVING` — aliases defined in `SELECT` aren't visible there either (though PostgreSQL is lenient and accepts the alias in `HAVING`; portability-wise, use the full expression).

</details>

## Recommended Environment

- **PostgreSQL 16+** via Homebrew or Docker for the full feature set.
- **`psql`** for the CLI (install it even if you use a GUI — it's the fastest way to run ad-hoc queries).
- **DBeaver** or **pgAdmin** if you prefer a GUI for browsing schema.
- **SQLite + DB Browser for SQLite** for a zero-server portable option.

## Summary

You now have a database running, understand the relational model and SQL dialect landscape, and know the logical evaluation order of a `SELECT`. Next: writing your first queries with `SELECT` and `WHERE`.