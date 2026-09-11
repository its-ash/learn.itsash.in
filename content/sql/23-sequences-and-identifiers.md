---
title: "23 — Sequences & Identifiers"
description: "SEQUENCE primitive (nextval/currval/setval), SERIAL legacy shortcut, IDENTITY columns (ALWAYS vs BY DEFAULT), why sequence gaps are normal (non-transactional by design), CACHE for throughput, UUID vs sequential tradeoffs, replication failover — code-first reference with a production ID strategy and anti-patterns for SERIAL and gap-chasing."
---

# 23 — Sequences & Identifiers

Auto-incrementing IDs have evolved through three mechanisms: `SEQUENCE` (the primitive), `SERIAL` (the legacy shortcut), and `IDENTITY` (the SQL standard). Understanding all three — and why sequence gaps are normal — prevents duplicate-key errors, replication failures, and migration headaches.

## SEQUENCE — the primitive

A sequence is a server-side counter, independent of any table. It's a first-class object in `pg_class` (relkind `S`), stored on disk, updated via `nextval` which is **non-transactional by design**.

::code-wrapper{language="sql"}
```sql
CREATE SEQUENCE my_seq START 1 INCREMENT 1;

SELECT nextval('my_seq');   -- 1 (advances the counter, returns the new value)
SELECT nextval('my_seq');   -- 2
SELECT currval('my_seq');   -- 2 (THIS SESSION's last nextval — not the global value)
SELECT lastval();           -- 2 (last sequence used by nextval in this session)
SELECT setval('my_seq', 100);   -- manually set the value (for migrations)
-- nextval is NEVER rolled back. If a transaction calls nextval, gets 5,
-- then rolls back — the sequence is STILL at 5. The gap (5) is permanent.
-- This is by design: if nextval were transactional, two concurrent
-- transactions would block on the sequence, serializing all inserts.
-- Non-transactional nextval = lock-free concurrency = high throughput.
-- The cost: gaps are normal and expected. A sequence guarantees
-- UNIQUENESS, not CONSECUTIVENESS.
```
::

### currval vs lastval — session-scoped

::code-wrapper{language="sql"}
```sql
-- currval('seq') returns the value that THIS SESSION last obtained from
-- nextval('seq'). It does NOT return the sequence's global current value
-- (another session might have advanced it further). Call nextval first
-- in the session, or currval errors:
-- ERROR: session does not have a current value for sequence "my_seq"

SELECT currval('my_seq');   -- ERROR if no nextval in this session yet
SELECT nextval('my_seq');   -- 3
SELECT currval('my_seq');   -- 3 (this session's last nextval)

-- lastval() returns the last value obtained by nextval for ANY sequence
-- in this session — no argument. Convenient but fragile (depends on
-- call order). Prefer explicit currval('seq_name') in production code.
```
::

## SERIAL — the legacy shortcut (what it actually creates)

`SERIAL` is not a type — it's a declaration-time macro that creates three things: a sequence, a `DEFAULT nextval(...)`, and a `NOT NULL` constraint.

::code-wrapper{language="sql"}
```sql
-- This:
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT
);

-- Is sugar for ALL of this:
CREATE SEQUENCE users_id_seq;                          -- 1. a sequence named <table>_<col>_seq
CREATE TABLE users (
  id INTEGER NOT NULL PRIMARY KEY DEFAULT nextval('users_id_seq')  -- 2. DEFAULT + 3. NOT NULL
);
ALTER SEQUENCE users_id_seq OWNED BY users.id;         -- 4. sequence "owned by" the column
-- OWNED BY means: DROP COLUMN id → sequence is dropped too.

-- The column type is INTEGER, not "serial". SERIAL is not a type.
-- pg_typeof: SELECT pg_typeof(id) FROM users → "integer"
-- You CANNOT do: ALTER COLUMN id TYPE serial (not valid).
```
::

### BIGSERIAL — use this instead of SERIAL

::code-wrapper{language="sql"}
```sql
-- SERIAL is INTEGER → max 2,147,483,647 (~2.1B). High-write tables
-- hit this in months. BIGSERIAL is BIGINT → max 9.2 × 10^18.
-- Always use BIGSERIAL (or BIGINT IDENTITY) for new tables.
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,    -- bigint + sequence + default + not null
  event_data JSONB
);
-- The cost of bigint vs int: 8 bytes vs 4 bytes per column. For a PK
-- that appears in every index and every FK, the 4-byte difference
-- adds up — but overflow is worse. Use bigint.
```
::

### SERIAL gotchas

- The column type is `integer`/`bigint`, not "serial" — `SERIAL` is a macro, not a type.
- The sequence is named `<table>_<column>_seq` by convention (not guaranteed — use `pg_get_serial_sequence`).
- `SERIAL` is PostgreSQL-specific — not portable (MySQL: `AUTO_INCREMENT`, SQL Server: `IDENTITY`).
- Dropping the default (`ALTER TABLE ... ALTER COLUMN id DROP DEFAULT`) leaves the sequence orphaned (it's still `OWNED BY` the column, dropped only when the column is dropped).

## IDENTITY — the SQL-standard modern approach

`GENERATED ... AS IDENTITY` (PostgreSQL 10+) is the SQL-standard equivalent of `SERIAL`, with cleaner semantics, proper dependency tracking, and easier alteration.

::code-wrapper{language="sql"}
```sql
-- GENERATED ALWAYS: the DB always generates the value. Manual inserts
-- specifying id are REJECTED (prevents accidental collisions).
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT
);

-- GENERATED BY DEFAULT: the DB generates a value if id is omitted,
-- but ALLOWS manual inserts (with collision risk if the manual value
-- is below the sequence's current position).
CREATE TABLE users_mutable (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name TEXT
);
```
::

### ALWAYS vs BY DEFAULT — the safety tradeoff

::code-wrapper{language="sql"}
```sql
-- GENERATED ALWAYS: manual id insert is rejected
INSERT INTO users (id, name) VALUES (100, 'Alice');
-- ERROR: cannot insert a non-DEFAULT value into identity column "id"
-- Override (for migrations/data loads):
INSERT INTO users (id, name) OVERRIDING SYSTEM VALUE VALUES (100, 'Alice');
-- OVERRIDING SYSTEM VALUE is an explicit "I know what I'm doing" escape hatch.

-- GENERATED BY DEFAULT: manual id insert is allowed
INSERT INTO users_mutable (id, name) VALUES (100, 'Alice');  -- works
-- But: if 100 is below the sequence's current position, a later
-- auto-generated insert might collide (duplicate key). BY DEFAULT
-- is more flexible for migrations but riskier for production.
```
::

### Why prefer IDENTITY over SERIAL

::code-wrapper{language="sql"}
```sql
-- 1. Standard SQL: portable to Oracle, DB2, SQL Server (with syntax tweaks)
-- 2. Proper dependency tracking: identity is tied to the column
--    DROP COLUMN id → identity is cleaned up automatically
--    SERIAL: the sequence can be orphaned if you DROP DEFAULT first
-- 3. Easier alteration: no manual sequence juggling
ALTER TABLE users ALTER COLUMN id RESTART WITH 1000;          -- reset the identity
ALTER TABLE users ALTER COLUMN id SET GENERATED BY DEFAULT;   -- change generation mode
ALTER TABLE users ALTER COLUMN id INCREMENT BY 10;            -- change increment
-- With SERIAL, you'd ALTER SEQUENCE users_id_seq RESTART WITH 1000 —
-- and you have to know the sequence name (use pg_get_serial_sequence).
-- 4. Cleaner pg_dump/restore: identities restore correctly; SERIAL
--    sequences can get out of sync if the restore order is wrong.
```
::

## Sequence Gaps — Why They're Normal (Not Bugs)

::code-wrapper{language="sql"}
```sql
-- Gaps come from:
-- 1. Rolled-back inserts: nextval advances, the insert rolls back → gap
-- 2. Failed inserts (constraint violation): nextval advanced, insert failed → gap
-- 3. Session crashes: CACHE values reserved but unused → gap
-- 4. Failover: replica's sequence is behind the primary's → gap on failover

-- This is BY DESIGN. nextval is non-transactional to avoid lock contention.
-- If nextval were transactional, two concurrent transactions would need
-- to lock the sequence, serializing all inserts → throughput killed.

-- ❌ WRONG: trying to "fill gaps" by finding missing IDs and reusing them
-- This requires serialization (find the gap, claim it, insert) → kills
-- concurrency. And it breaks FK references (a "reused" ID might point
-- to a deleted row's old data in a foreign table).

-- ✅ RIGHT: accept gaps. Sequences guarantee uniqueness, not consecutiveness.
-- If you need consecutive numbers (invoice numbers, check numbers),
-- use a separate counter table with row-level locking:
CREATE TABLE invoice_counters (
  tenant_id BIGINT PRIMARY KEY,
  next_number BIGINT NOT NULL DEFAULT 1
);
-- Atomically get and increment:
UPDATE invoice_counters
SET next_number = next_number + 1
WHERE tenant_id = $1
RETURNING next_number - 1 AS invoice_number;
-- This is serialized (one transaction at a time per tenant) but guarantees
-- consecutive numbers. Use only when consecutiveness is a business requirement.
```
::

## Sequence Caching — throughput tuning

::code-wrapper{language="sql"}
```sql
-- CACHE N: each session reserves N values at once. Reduces the
-- shared-counter lock contention (the sequence's internal lock is
-- acquired once per N values, not once per value).
CREATE SEQUENCE high_throughput_seq CACHE 1000;

-- Default CACHE is 1 (no caching — every nextval hits the shared counter).
-- For high-throughput insert tables:
ALTER SEQUENCE users_id_seq CACHE 100;
-- Now each session grabs 100 values at once → 100x fewer lock acquisitions.
-- Cost: on session crash, the unused cached values are LOST (gaps).
-- For a table with 10K inserts/sec, CACHE 1000 is reasonable.
-- For a table with 10 inserts/day, CACHE 1 is fine (no gap waste).
```
::

## Sequence Ownership and pg_get_serial_sequence

::code-wrapper{language="sql"}
```sql
-- OWNED BY ties a sequence to a column → DROP COLUMN drops the sequence
ALTER SEQUENCE my_seq OWNED BY users.id;

-- pg_get_serial_sequence: the RELIABLE way to find a column's sequence
-- Don't assume the name is users_id_seq (it is for SERIAL, but IDENTITY
-- and manually-created sequences differ).
SELECT pg_get_serial_sequence('users', 'id');
-- → 'public.users_id_seq' (or the identity's internal sequence)

-- Use it in setval calls (don't hardcode the sequence name):
SELECT setval(pg_get_serial_sequence('users', 'id'),
              (SELECT max(id) FROM users));
```
::

## Resetting Sequences After Data Migration

::code-wrapper{language="sql"}
```sql
-- After a COPY or bulk INSERT with explicit IDs, the sequence is
-- still at its old position. The next auto-insert calls nextval,
-- gets a value that already exists → duplicate key error.
-- Fix: advance the sequence past max(id).

-- For SERIAL / manual sequences:
SELECT setval(pg_get_serial_sequence('users', 'id'),
              (SELECT max(id) FROM users));
-- setval(seq, N) → next nextval returns N+1
-- setval(seq, N, false) → next nextval returns N (the is_called flag)

-- For IDENTITY columns:
ALTER TABLE users ALTER COLUMN id RESTART WITH 10001;
-- Or compute max first, then RESTART:
SELECT max(id) + 1 FROM users;  -- get the value
-- ALTER TABLE users ALTER COLUMN id RESTART WITH <value>;  -- use the literal
-- Note: RESTART doesn't accept a subquery — compute the value first.

-- Bulk reset for ALL tables after a full data load:
-- (Generate and execute the setval statements)
SELECT format(
  'SELECT setval(%L, (SELECT max(%I) FROM %I.%I));',
  pg_get_serial_sequence(schemaname || '.' || tablename, column_name),
  column_name, schemaname, tablename
)
FROM information_schema.columns
WHERE column_default LIKE 'nextval%'
  AND table_schema NOT IN ('pg_catalog', 'information_schema');
-- Copy the output and run it. Or use psql's \gexec:
-- SELECT ... \gexec
```
::

## Complex Implementation — Production ID Strategy

A complete ID strategy showing IDENTITY columns with caching, a sequence reset after a data load, and a comparison with UUID-based IDs.

::code-wrapper{language="sql"}
```sql
-- ── Strategy 1: BIGINT IDENTITY (the default for most tables) ───
CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY
    (START WITH 1 INCREMENT BY 1 CACHE 1000),  -- cache for throughput
  customer_id BIGINT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
-- BIGINT: no overflow risk (9.2 × 10^18 max)
-- GENERATED ALWAYS: prevents manual id injection (collision-safe)
-- CACHE 1000: each session reserves 1000 IDs → low lock contention

-- ── Strategy 2: UUID for distributed/client-side generation ──────
-- Use when: client generates IDs before insert (idempotent retries),
-- multi-master writes (no shared counter), or IDs span databases.
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid() in PG < 13
-- PG 13+: gen_random_uuid() is built-in (no extension needed)

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 128-bit, globally unique
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- UUID v4 (gen_random_uuid): random → B-tree index fragmentation
-- (random insert positions cause page splits). Larger indexes, worse
-- cache locality. For large-scale UUID tables, consider UUIDv7
-- (time-ordered, monotonic → append-only index behavior).

-- ── Post-migration reset ────────────────────────────────────────
-- After loading a dump with explicit IDs into the orders table:
-- The identity sequence is still at 1. Next auto-insert collides.
-- Reset it:
SELECT setval(pg_get_serial_sequence('orders', 'id'),
              (SELECT max(id) FROM users));
-- Next INSERT INTO orders (customer_id, amount) VALUES (...) →
-- nextval returns max(id)+1 → no collision.

-- ── Size comparison: bigint vs UUID ─────────────────────────────
-- BIGINT: 8 bytes. UUID: 16 bytes (2x).
-- In a B-tree index with 10M rows:
--   bigint PK index: ~80MB (8 bytes × 10M + overhead)
--   UUID PK index:   ~160MB (16 bytes × 10M + overhead)
-- Every FK that references the PK also doubles in size.
-- Every composite index that includes the PK column grows.
-- For large-scale systems, the 2x size difference is significant.

-- ── UUIDv7: time-ordered UUID for indexable distributed IDs ─────
-- UUIDv7 combines a Unix timestamp (first 48 bits) with random bits.
-- Monotonic-ish → append-only index behavior (no fragmentation).
-- PostgreSQL doesn't have built-in UUIDv7 (as of PG 16), but you can
-- generate it in the application or via a function:
-- (simplified — use a library in production)
CREATE OR REPLACE FUNCTION uuid_v7() RETURNS UUID AS $$
DECLARE
  unixts_ms BIGINT;
  uuid_bytes BYTEA;
BEGIN
  unixts_ms := (extract(epoch from now()) * 1000)::bigint;
  -- 48-bit timestamp + 12 random bits + version + 62 random bits + variant
  uuid_bytes := substring(int8send(unixts_ms) FROM 3 FOR 6)  -- 6 bytes timestamp
                || gen_random_bytes(10);                      -- 10 random bytes
  -- Set version (7) and variant (10xx) bits (omitted for brevity)
  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;
```
::

## Anti-Pattern: SERIAL When IDENTITY Is Available

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: using SERIAL for new tables (IDENTITY available since PG 10)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,           -- non-standard, harder to migrate, orphanable sequence
  name TEXT
);
-- Problems:
-- 1. Not standard SQL → not portable to other databases
-- 2. The sequence can be orphaned (DROP DEFAULT → sequence survives, junk)
-- 3. Resetting requires knowing the sequence name (pg_get_serial_sequence)
-- 4. pg_dump/restore can desync the sequence from the data

-- ✅ RIGHT: use IDENTITY for all new tables
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT
);
-- Standard SQL, proper dependency tracking, easy ALTER/RESTART,
-- clean dump/restore. Use SERIAL only for legacy compatibility.
```
::

## Anti-Pattern: Worrying About Sequence Gaps

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: "fixing" gaps by reusing skipped IDs
-- A developer notices IDs go 1, 2, 3, 5, 6, 8 (gaps at 4, 7) and
-- writes code to "fill" them:
SELECT generate_series(1, max_id) EXCEPT SELECT id FROM users;  -- find gaps
-- Then inserts into the gaps. This is WRONG:
-- 1. Requires serialization (find gap → claim → insert) → kills throughput
-- 2. Breaks FK references: if id=4 was referenced by an order, then deleted,
--    reusing id=4 makes the order point to the NEW row (wrong data)
-- 3. Sequences are designed to be gap-tolerant — gaps are not errors

-- ✅ RIGHT: accept gaps. A sequence guarantees uniqueness, not consecutiveness.
-- If consecutive numbers are a legal requirement (invoices, checks), use a
-- counter table with explicit locking (see the "Sequence Gaps" section above).
-- For entity IDs, gaps are meaningless — nobody cares that user 4 doesn't exist.
```
::

## Replication and Failover — sequences don't replicate

::code-wrapper{language="sql"}
```sql
-- Sequences are per-server state. Logical replication does NOT replicate
-- sequence values. In a primary + replica setup:
-- - Replicas have their own sequence state (may lag the primary)
-- - On failover, the new primary's sequence might be BEHIND the max(id)
--   already in the table → immediate duplicate-key errors on insert

-- Post-failover fix: advance ALL sequences past max(id)
-- Run this on the new primary after failover:
SELECT format(
  'SELECT setval(%L, (SELECT max(%I) FROM %I.%I), true);',
  pg_get_serial_sequence(n.nspname || '.' || c.relname, a.attname),
  a.attname, n.nspname, c.relname
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE d.adbin LIKE '%nextval%'                          -- columns with sequence defaults
  AND n.nspname NOT IN ('pg_catalog', 'information_schema');
-- Copy and run the output. Or use \gexec in psql.

-- Prevention: allocate IDs in blocks per node (no shared counter)
-- Node 1: CREATE SEQUENCE ... START 1 INCREMENT 1
-- Node 2: CREATE SEQUENCE ... START 1000000001 INCREMENT 1
-- No replication contention, no failover gap. Or use UUIDs (no shared counter).
```
::

## ALTER SEQUENCE — restart, cache, increment

::code-wrapper{language="sql"}
```sql
ALTER SEQUENCE my_seq RESTART WITH 1000;      -- reset (next nextval → 1000)
ALTER SEQUENCE my_seq INCREMENT BY 10;        -- change the increment
ALTER SEQUENCE my_seq CACHE 1000;             -- change the cache size
ALTER SEQUENCE my_seq MINVALUE 1 MAXVALUE 1000000;  -- bounds
ALTER SEQUENCE my_seq CYCLE;                  -- wrap around at MAXVALUE (rare, dangerous)
ALTER SEQUENCE my_seq NO CYCLE;               -- error at MAXVALUE (default, safer)
-- WARNING: ALTER SEQUENCE ... RESTART affects ALL sessions immediately.
-- Concurrent sessions with cached values may still use their cache.
```
::

## 💡 Tips & Tricks

- **Idiom**: use `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` for all new tables — it's the SQL-standard, properly-tracked equivalent of `BIGSERIAL`, with easier `ALTER`/`RESTART`, proper dependency tracking (DROP COLUMN cleans up), and cleaner dump/restore. Reserve `SERIAL` for legacy compatibility.
- **Idiom**: use `UUID` (v4 via `gen_random_uuid()`, or v7 for time-ordered) when you need client-side ID generation (idempotent retries, distributed systems) or global uniqueness across databases — but accept the 16-byte size (2x bigint) and B-tree index fragmentation (random UUIDs cause page splits). For large-scale UUID tables, use UUIDv7 (monotonic, append-only index behavior).
- **Idiom**: after a bulk load or `COPY` that inserted explicit IDs, **always reset the sequence** with `SELECT setval(pg_get_serial_sequence('t', 'id'), (SELECT max(id) FROM t))` — otherwise the next auto-insert collides with a manually-inserted ID. This is the #1 cause of "duplicate key value violates unique constraint" after a data migration.
- **Performance**: increase a sequence's `CACHE` for high-throughput insert tables — `CACHE 1000` means each backend grabs 1000 values at once, reducing the shared-counter lock contention that becomes a bottleneck on heavily concurrent inserts. Default `CACHE 1` acquires the lock on every `nextval`.
- **Reliability**: after a replica failover, advance the new primary's sequences past `max(id)` for every table — sequences don't replicate with logical replication, and a behind-the-data sequence causes immediate duplicate-key errors on the new primary. Automate this in your failover script.
- **Idiom**: use `pg_get_serial_sequence('table', 'column')` to find a column's sequence name — don't assume it's `<table>_<column>_seq` (true for `SERIAL`, but `IDENTITY` and manually-created sequences differ). Use it in `setval` calls for portability.
- **Idiom**: use `GENERATED ALWAYS` (not `BY DEFAULT`) for production tables — it prevents manual ID injection (a common cause of collisions and data inconsistency). Use `OVERRIDING SYSTEM VALUE` only for explicit migrations. `BY DEFAULT` is for migration flexibility, not production.

## ⚠️ Edge Cases & Gotchas

- **Sequence gaps after rollback (by design)**: `nextval` is never rolled back. A rolled-back insert, a failed insert, a crash, or cached-but-unused values all create gaps. Sequences guarantee uniqueness, not consecutiveness. Don't try to fill gaps — it breaks FK references and kills throughput.
- **`currval` without `nextval` in session**: `currval('seq')` errors with "session does not have a current value for sequence" if `nextval('seq')` hasn't been called in the current session. `currval` returns THIS session's last `nextval`, not the global sequence value.
- **Sequence wraparound**: with `CYCLE`, the sequence wraps to `MINVALUE` after `MAXVALUE`. This causes duplicate keys if old rows still exist. `NO CYCLE` (default) errors at `MAXVALUE` — safer. For `BIGINT`, wraparound is practically impossible (9.2 × 10^18), but for `INTEGER` sequences, it's a real risk.
- **Sequence caching and failover**: `CACHE N` reserves N values per session. On crash/failover, the unused cached values are lost (gaps). A `CACHE 1000` sequence on a primary that fails over may have 1000 unused values per active session — the replica's sequence is behind by that much. Advance the sequence post-failover.
- **`SERIAL` type is not real**: the column is `integer`/`bigint`; `SERIAL` is a declaration-time macro. `pg_typeof(id)` returns `integer`, not `serial`. You can't `ALTER COLUMN col TYPE serial`.
- **`IDENTITY ALWAYS` vs `BY DEFAULT`**: `ALWAYS` rejects manual inserts (use `OVERRIDING SYSTEM VALUE` to override). `BY DEFAULT` allows manual inserts (collision risk if the manual value is below the sequence position). Use `ALWAYS` for production, `BY DEFAULT` for migration flexibility.
- **`ALTER SEQUENCE RESTART` affects all sessions**: the restart is immediate and global. Concurrent sessions with cached values may still use their cache (stale values). For a clean restart, ensure no concurrent inserts.
- **Sequence permissions**: a role needs `USAGE` on the sequence to call `nextval`. `GRANT INSERT ON table` does NOT grant `USAGE` on the table's sequence — grant it explicitly: `GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO app_role;` (SELECT for currval, USAGE for nextval).
- **`setval` semantics**: `setval(seq, N)` → next `nextval` returns `N+1` (the `is_called` flag defaults to true). `setval(seq, N, false)` → next `nextval` returns `N` (as if N hasn't been "called" yet). Know which you want — the difference is off-by-one.
- **`OWNED BY` and column drop**: `ALTER SEQUENCE ... OWNED BY table.col` ties the sequence to the column — `DROP COLUMN col` drops the sequence. Without `OWNED BY`, the sequence survives column drop (orphaned). `IDENTITY` handles this automatically; `SERIAL` sets `OWNED BY` in the macro.
- **UUIDv4 index fragmentation**: random UUIDs cause B-tree index fragmentation (random insert positions → page splits). Indexes grow larger than necessary and cache locality is poor. For large-scale UUID tables, use UUIDv7 (time-ordered, monotonic → append-only index behavior) or ULID.
- **`pg_get_serial_sequence` returns NULL for non-sequence columns**: if the column has no sequence default (e.g., a UUID column), `pg_get_serial_sequence` returns NULL. Don't use it blindly in `setval` — check for NULL first.

## 🧠 Spot the Bug

A team migrates a `users` table by loading a dump with explicit IDs (1 through 10000). After the migration, new user registrations fail with "duplicate key value violates unique constraint." The table:

::code-wrapper{language="sql"}
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,           -- sequence users_id_seq starts at 1
  name TEXT
);

-- Migration: loaded dump with explicit IDs
COPY users (id, name) FROM '/tmp/users.csv' WITH CSV HEADER;
-- The dump has IDs 1..10000. COPY inserts them directly, bypassing
-- the DEFAULT nextval('users_id_seq'). The sequence is still at 1.

-- After migration, the app inserts a new user:
INSERT INTO users (name) VALUES ('new_user');
-- → nextval('users_id_seq') returns 1
-- → id=1 already exists (from the dump)
-- → ERROR: duplicate key value violates unique constraint "users_pkey"
```
::

<details>
<summary>Answer</summary>

The dump inserted rows with explicit IDs (1–10000), bypassing the `id` column's default (`nextval('users_id_seq')`). The sequence `users_id_seq` wasn't advanced — it's still at its pre-load position (1). The next auto-generated insert calls `nextval`, gets a value that already exists in the table, and violates the primary key uniqueness constraint.

The fix — after any data load with explicit IDs, advance the sequence past `max(id)`:

::code-wrapper{language="sql"}
```sql
SELECT setval(pg_get_serial_sequence('users', 'id'),
              (SELECT max(id) FROM users));
-- setval(seq, max_id) → next nextval returns max_id + 1 → no collision.
-- Always run this after a COPY or bulk INSERT with explicit IDs.
```
::

For an `IDENTITY` column, the equivalent:

::code-wrapper{language="sql"}
```sql
-- Compute max first (RESTART doesn't accept subqueries):
SELECT max(id) + 1 FROM users;  -- → 10001
ALTER TABLE users ALTER COLUMN id RESTART WITH 10001;
```
::

**The lesson**: explicit-ID inserts (via `COPY`, `INSERT INTO ... VALUES (id, ...)`, or `pg_restore`) don't advance the sequence. After a data load/migration that supplies IDs, always reset the sequence to `max(id)`, or the next auto-generated insert collides.

</details>