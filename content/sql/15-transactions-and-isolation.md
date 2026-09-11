# 15 — Transactions & Isolation

Transactions group operations into atomic, consistent, isolated, durable units. Without them, partial failures corrupt data. This chapter is a code-first reference for ACID, isolation levels, MVCC, anomalies, explicit locking, deadlocks, and the retry patterns that make SERIALIZABLE safe.

## ACID

| Property | Meaning | Enforced By |
|---|---|---|
| **Atomicity** | All operations succeed or none do — no partial commits. | DB engine (WAL + rollback). |
| **Consistency** | Transaction takes the DB from one valid state to another (constraints hold). | Constraints (Chapter 12). |
| **Isolation** | Concurrent transactions appear to run serially — effects don't interleave. | Isolation level + MVCC. |
| **Durability** | Once committed, the change survives crashes. | WAL (write-ahead log) flushed before commit returns. |

## Transaction Control

::code-wrapper{language="sql"}
```sql
-- Basic transaction: BEGIN ... COMMIT or ROLLBACK.
BEGIN;                  -- start a transaction (or: BEGIN TRANSACTION)
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;                 -- apply both updates atomically

-- Rollback: undo all changes since BEGIN.
BEGIN;
DELETE FROM orders WHERE id = 999;
ROLLBACK;               -- the delete is undone

-- PostgreSQL: every statement is implicitly in a transaction.
-- A standalone statement gets an implicit BEGIN + COMMIT.
-- MySQL: autocommit is on by default (each statement is its own transaction).
```
::

### SAVEPOINTs — Partial Rollbacks

::code-wrapper{language="sql"}
```sql
BEGIN;
INSERT INTO orders (...) VALUES (...);
SAVEPOINT after_insert;
UPDATE inventory SET qty = qty - 1 WHERE product_id = 5;
-- Something went wrong with the inventory update.
ROLLBACK TO SAVEPOINT after_insert;   -- undo only the UPDATE, keep the INSERT
-- Continue with other work...
UPDATE inventory SET qty = qty - 1 WHERE product_id = 6;
COMMIT;   -- commits the INSERT + the second UPDATE

-- SAVEPOINTs can be nested:
-- SAVEPOINT outer; ... SAVEPOINT inner; ... ROLLBACK TO inner; ... RELEASE SAVEPOINT outer;
-- RELEASE SAVEPOINT discards the savepoint (you can no longer roll back to it).
-- There are no true nested transactions in PG — savepoints are the mechanism.
```
::

## Isolation Levels

Isolation levels trade off consistency for performance. Higher isolation prevents more anomalies but reduces concurrency.

| Level | Prevents | PG Implementation |
|---|---|---|
| **READ UNCOMMITTED** | (Nothing — allows dirty reads. PG maps to READ COMMITTED.) | N/A (aliased) |
| **READ COMMITTED** (PG default) | Dirty reads. Each statement sees a fresh snapshot. | Per-statement snapshot. |
| **REPEATABLE READ** | Dirty reads, non-repeatable reads, phantom reads (PG/SI). | Per-transaction snapshot. |
| **SERIALIZABLE** | All anomalies — full serializability. | SSI (Serializable Snapshot Isolation). |

::code-wrapper{language="sql"}
```sql
-- Set isolation for a single transaction.
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- ... work ...
COMMIT;

-- Shorthand:
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- ... work ...
COMMIT;

-- Set default isolation for the session.
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- ⚠️ SET TRANSACTION ISOLATION LEVEL must come BEFORE the first query.
-- The snapshot is taken at the first statement — setting it after is too late.
```
::

## The Anomalies

### Dirty Read (prevented at READ COMMITTED+)

T1 reads uncommitted data from T2. If T2 rolls back, T1 saw data that never "happened."

::code-wrapper{language="text"}
```text
T1: BEGIN; UPDATE accounts SET balance = balance + 100 WHERE id = 1;   -- not committed
T2: SELECT balance FROM accounts WHERE id = 1;   -- sees the +100 (dirty read)
T1: ROLLBACK;   -- T2 saw a value that never committed
```
::

PostgreSQL doesn't allow dirty reads at any level (READ UNCOMMITTED is aliased to READ COMMITTED). MVCC ensures readers always see committed snapshots.

### Non-Repeatable Read (prevented at REPEATABLE READ+)

T1 reads a row twice and gets different values because T2 modified it in between.

::code-wrapper{language="text"}
```text
T1: BEGIN; SELECT balance FROM accounts WHERE id = 1;   -- 100
T2: UPDATE accounts SET balance = 200 WHERE id = 1; COMMIT;
T1: SELECT balance FROM accounts WHERE id = 1;   -- 200 (different!) — READ COMMITTED
T1: COMMIT;

-- At REPEATABLE READ: T1's second SELECT still returns 100 (same snapshot).
```
::

READ COMMITTED allows this (each statement gets a fresh snapshot). REPEATABLE READ prevents it (one snapshot per transaction).

### Phantom Read (prevented at REPEATABLE READ in PG; SERIALIZABLE in standard)

T1 runs a query twice and gets different rows because T2 inserted/deleted matching rows.

::code-wrapper{language="text"}
```text
T1: BEGIN; SELECT count(*) FROM orders WHERE amount > 100;   -- 5
T2: INSERT INTO orders (amount, ...) VALUES (150, ...); COMMIT;
T1: SELECT count(*) FROM orders WHERE amount > 100;   -- 6 (phantom!) — standard RR
T1: COMMIT;

-- In PostgreSQL, REPEATABLE READ (snapshot isolation) prevents phantoms.
-- In the SQL standard, REPEATABLE READ allows phantoms (you need SERIALIZABLE).
```
::

This is a PostgreSQL strength — its REPEATABLE READ is stronger than the standard's.

### Write Skew (prevented only at SERIALIZABLE)

Two transactions read overlapping data, make decisions based on what they read, and write to *disjoint* rows — the combined result is inconsistent, but neither transaction saw the other's write.

::code-wrapper{language="text"}
```text
-- Constraint: at least one doctor must be on call.
T1: SELECT count(*) FROM doctors WHERE on_call = true;   -- 2
T2: SELECT count(*) FROM doctors WHERE on_call = true;   -- 2
T1: UPDATE doctors SET on_call = false WHERE id = 1; COMMIT;  -- thinks 1 remains
T2: UPDATE doctors SET on_call = false WHERE id = 2; COMMIT;  -- thinks 1 remains
-- Now 0 doctors on call — invariant violated, but each transaction saw a valid state.
```
::

Snapshot isolation (REPEATABLE READ) doesn't prevent write skew — only SERIALIZABLE does, via SSI (Serializable Snapshot Isolation) which tracks read/write dependencies and aborts one transaction.

## PostgreSQL's MVCC Implementation

PostgreSQL uses **MVCC** (Multi-Version Concurrency Control):

- Each statement/transaction sees a **snapshot** — a consistent view of the DB as of a point in time.
- Writers don't block readers; readers don't block writers.
- `UPDATE`/`DELETE` create new row versions (old versions remain for in-flight transactions).
- Old versions are cleaned by `VACUUM` (dead tuples).

### READ COMMITTED (default)

- Each statement gets a fresh snapshot (as of the statement's start).
- Within a transaction, repeated reads can see different data (non-repeatable reads allowed).
- `UPDATE`/`DELETE` see the latest committed version of rows; `SELECT` sees committed data as of statement start.
- Good default for most workloads — high concurrency, no dirty reads.

### REPEATABLE READ (Snapshot Isolation in PG)

- One snapshot per transaction (taken at the first statement).
- Repeated reads return the same data — no non-repeatable reads, no phantoms.
- **Write conflicts**: if T1 updates row R, and T2 (REPEATABLE READ) tries to update R after T1 commits, T2 gets `ERROR: could not serialize access due to concurrent update` and must retry. This is "first-updater-wins."
- Prevents phantoms (stronger than the standard's REPEATABLE READ).

### SERIALIZABLE

- Serializable Snapshot Isolation (SSI) — detects serialization anomalies (like write skew) and aborts one transaction with `ERROR: could not serialize access due to read/write dependencies among transactions`.
- SQLSTATE: `40001` (serialization_failure).
- Requires retry logic: on a serialization failure, rerun the entire transaction.
- Lower throughput than lower levels (runtime checks have overhead), but correct for critical invariants.

## Choosing an Isolation Level

| Workload | Level |
|---|---|
| Most web apps, read-heavy, tolerant of slightly stale reads | READ COMMITTED (default) |
| Reports that must see a consistent snapshot | REPEATABLE READ |
| Financial invariants ("at least one doctor on call," "no double-spend") | SERIALIZABLE (with retry) |

For SERIALIZABLE, you **must** implement retry on `40001` (serialization_failure). Without retry, SERIALIZABLE just adds aborts with no correctness benefit.

## Complex Implementation: Bank Transfer with Retry Logic

::code-wrapper{language="sql"}
```sql
-- A bank transfer at SERIALIZABLE isolation with retry on serialization failure.
-- This PL/pgSQL function encapsulates the retry loop.
-- In application code (Python, Go, etc.), use the same pattern with your driver's
-- transaction API and catch SQLSTATE 40001.

CREATE OR REPLACE FUNCTION transfer_money(
  p_from   BIGINT,
  p_to     BIGINT,
  p_amount NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  max_retries INTEGER := 5;
  attempt     INTEGER := 0;
  balance     NUMERIC;
BEGIN
  <<retry>>
  LOOP
    attempt := attempt + 1;
    IF attempt > max_retries THEN
      RAISE EXCEPTION 'transfer failed after % attempts', max_retries;
    END IF;

    BEGIN
      -- SERIALIZABLE: detect write skew and other anomalies.
      BEGIN ISOLATION LEVEL SERIALIZABLE;

      -- Lock both rows in deterministic order (ascending id) to prevent deadlocks.
      -- FOR UPDATE ensures no other transaction can modify these rows concurrently.
      IF p_from < p_to THEN
        SELECT balance INTO balance FROM accounts WHERE id = p_from FOR UPDATE;
        SELECT balance INTO balance FROM accounts WHERE id = p_to   FOR UPDATE;
      ELSE
        SELECT balance INTO balance FROM accounts WHERE id = p_to   FOR UPDATE;
        SELECT balance INTO balance FROM accounts WHERE id = p_from FOR UPDATE;
      END IF;

      -- Check sufficient balance.
      SELECT balance INTO balance FROM accounts WHERE id = p_from;
      IF balance < p_amount THEN
        RAISE EXCEPTION 'insufficient balance: % < %', balance, p_amount;
      END IF;

      -- Atomic read-modify-write — safe at any isolation level.
      UPDATE accounts SET balance = balance - p_amount WHERE id = p_from;
      UPDATE accounts SET balance = balance + p_amount WHERE id = p_to;

      COMMIT;
      RETURN;  -- success, exit the retry loop

    EXCEPTION
      WHEN serialization_failure OR deadlock_detected THEN
        ROLLBACK;
        -- Retry the entire transaction — re-read, re-decide, re-write.
        CONTINUE retry;
    END;
  END LOOP;
END;
$$;

-- Application-level pseudo-code (Python / psycopg2):
-- for attempt in range(max_retries):
--     try:
--         conn.execute("BEGIN ISOLATION LEVEL SERIALIZABLE")
--         conn.execute("SELECT balance FROM accounts WHERE id = %s FOR UPDATE", (p_from,))
--         ... check + update ...
--         conn.execute("COMMIT")
--         break
--     except psycopg2.errors.SerializationFailure:
--         conn.execute("ROLLBACK")
--         continue
--     except psycopg2.errors.DeadlockDetected:
--         conn.execute("ROLLBACK")
--         continue
```
::

## Deadlocks

Two transactions each hold a lock the other needs — both wait forever. The database detects the cycle and aborts one with `ERROR: deadlock detected` (SQLSTATE `40P01`).

::code-wrapper{language="text"}
```text
T1: UPDATE accounts SET balance = balance - 100 WHERE id = 1;   -- locks row 1
T2: UPDATE accounts SET balance = balance - 50  WHERE id = 2;   -- locks row 2
T1: UPDATE accounts SET balance = balance + 100 WHERE id = 2;   -- waits for T2's lock on row 2
T2: UPDATE accounts SET balance = balance + 50  WHERE id = 1;   -- waits for T1's lock on row 1
-- Deadlock — database detects the cycle and aborts one transaction.
```
::

**Prevention**: always lock rows in a consistent order. If both transactions lock `id=1` then `id=2`, no deadlock. `SELECT ... FOR UPDATE` establishes locks in a deterministic order before the updates.

::code-wrapper{language="sql"}
```sql
-- Deadlock-safe: lock both rows in ascending id order before any updates.
BEGIN;
SELECT id FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;
-- Both rows locked in the same order regardless of transfer direction.
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```
::

## Explicit Locking — SELECT FOR UPDATE

Locks rows for the duration of the transaction, preventing other transactions from updating/deleting them. Needed when you read a value, make a decision based on it, and then update.

::code-wrapper{language="sql"}
```sql
-- FOR UPDATE: locks rows against UPDATE/DELETE/other FOR UPDATE.
-- Needed for read-decide-write patterns to prevent lost updates.
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;   -- locks row 1
-- ... compute decision based on the locked value ...
UPDATE accounts SET balance = balance - 100 WHERE id = 1;   -- atomic update
COMMIT;

-- Variants:
-- FOR SHARE: locks against UPDATE/DELETE but allows other FOR SHARE.
-- FOR NO KEY UPDATE: locks but allows other FOR NO KEY UPDATE / FOR SHARE (finer-grained).
-- FOR UPDATE SKIP LOCKED: skip rows already locked (queue patterns).
-- FOR UPDATE NOWAIT: error immediately if locked, instead of waiting.

-- Job queue: grab the next available job, skipping locked ones.
-- Multiple workers can run this concurrently without blocking each other.
SELECT id FROM jobs WHERE status = 'pending'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
-- Worker A gets job 1, Worker B skips job 1 (locked) and gets job 2.

-- Lock only specific tables in a JOIN:
SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'pending'
FOR UPDATE OF o;   -- locks only orders rows, not customers rows
```
::

`SKIP LOCKED` is the foundation of safe job queues in the database. It's a PG/MySQL/Oracle extension (not in the SQL standard; SQLite lacks it).

## Advisory Locks

Application-level locks that aren't tied to table rows — for coordinating across transactions at a higher level.

::code-wrapper{language="sql"}
```sql
-- Session-level advisory lock: held until explicitly released or session ends.
SELECT pg_advisory_lock(12345);   -- lock with key 12345
-- ... critical section ...
SELECT pg_advisory_unlock(12345);

-- Transaction-level advisory lock: auto-released at COMMIT/ROLLBACK.
BEGIN;
SELECT pg_advisory_xact_lock(12345);  -- auto-released at transaction end
-- ... critical section ...
COMMIT;  -- lock released automatically

-- Use cases: migrate coordination (only one worker runs a migration),
-- global rate limiting, serializing access to an external resource.
```
::

## Anti-Pattern: Long-Running Transactions Holding Locks

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: transaction spans an HTTP call to an external service.
-- The external service's latency now determines your lock hold time.
-- If it's slow, other transactions block, connections exhaust, app hangs.

-- Pseudo-code (application layer):
-- BEGIN;
-- SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;  -- locks row
-- response = http.post('https://api.payment.com/charge', ...)  -- 30s timeout!
-- UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- COMMIT;  -- lock held for 30+ seconds

-- ✅ CORRECT: keep the transaction tight — do the HTTP call outside.
-- 1. Read + decide (no lock).
-- 2. Call the external service (outside transaction).
-- 3. BEGIN; lock; verify decision still holds; update; COMMIT (milliseconds).

response = http.post('https://api.payment.com/charge', ...)
if response.success:
    BEGIN;
    SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
    -- verify balance still sufficient, then update
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    COMMIT;  -- lock held for <1ms
```
::

## Anti-Pattern: Ignoring Serialization Failures Without Retry

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: using SERIALIZABLE but not retrying on serialization_failure.
-- SSI will abort transactions it detects as anomalies — if you don't retry,
-- the transaction just fails. You get all the throughput cost of SERIALIZABLE
-- with none of the correctness benefit.

-- Pseudo-code (application layer):
-- try:
--     BEGIN ISOLATION LEVEL SERIALIZABLE
--     ... work ...
--     COMMIT
-- except:
--     ROLLBACK
--     raise  -- ❌ just propagates the error, no retry

-- ✅ CORRECT: retry the entire transaction on SQLSTATE 40001.
-- for attempt in range(max_retries):
--     try:
--         BEGIN ISOLATION LEVEL SERIALIZABLE
--         ... work ...
--         COMMIT
--         break
--     except sqlstate == '40001':  # serialization_failure
--         ROLLBACK
--         continue
--     except sqlstate == '40P01':  # deadlock_detected
--         ROLLBACK
--         continue
```
::

## 💡 Tips & Tricks

- **Idiom — `SELECT ... FOR UPDATE` for read-decide-write**: without it, you have a lost-update race (T2's update overwrites T1's, even at REPEATABLE READ). At SERIALIZABLE the database detects the conflict and aborts, but at lower levels the lost update is *silent*. Always use `FOR UPDATE` when you read a value, decide, then write.
- **Performance — keep transactions short**: long transactions hold locks, block VACUUM (dead tuples can't be reclaimed until all transactions that might see them finish), and increase bloat. A transaction spanning an HTTP call is a classic anti-pattern — the external service's latency determines your lock hold time.
- **Idiom — `FOR UPDATE SKIP LOCKED` for job queues**: workers grab rows without blocking each other; locked rows are skipped. Simplest correct queue pattern in the database. At high scale, use dedicated queues (RabbitMQ, SQS).
- **Idiom — SERIALIZABLE with retry on `40001`**: without retry, SERIALIZABLE just adds aborts with no benefit. Retry the *entire* transaction (re-read, re-decide, re-write), not just the failing statement.
- **Debug — deadlocks indicate inconsistent lock ordering**: audit the order in which transactions acquire locks (via `FOR UPDATE` or `UPDATE`) and enforce a global order (e.g., always lock by ascending `id`). Once locks are acquired in a consistent order, cycles can't form.
- **Idiom — `SET TRANSACTION ISOLATION LEVEL` right after `BEGIN`**: the snapshot is taken at the first statement. Setting it after the first query is too late. Use `BEGIN ISOLATION LEVEL SERIALIZABLE` for clarity.
- **Idiom — advisory locks for application-level coordination**: `pg_advisory_xact_lock(key)` for migration coordination, global serialization, or external resource access — auto-released at COMMIT.

## ⚠️ Edge Cases & Gotchas

- **Lost updates at READ COMMITTED**: `T1: read x=10; T2: read x=10; T1: write x=11; T2: write x=11` — T2 overwrites T1's update, both think they incremented, result is 11 not 12. READ COMMITTED doesn't prevent this. Use `FOR UPDATE`, `UPDATE ... SET x = x + 1` (atomic), or SERIALIZABLE.
- **REPEATABLE READ "first-updater-wins"**: if T2 (REPEATABLE READ) tries to update a row T1 already updated and committed, T2 gets `could not serialize access due to concurrent update` — T2 must retry. Correct but surprises people expecting "last writer wins."
- **SERIALIZABLE can abort transactions that would have been fine** — SSI is conservative (false positives). This is the cost of serializability without global locks. Retry handles it.
- **SERIALIZABLE serialization_failure SQLSTATE is `40001`**: catch this specifically in your driver. Deadlock is `40P01`. Both require retry.
- **`FOR UPDATE` on a `JOIN`**: `SELECT ... FROM a JOIN b ... FOR UPDATE` locks all rows in `a` and `b`. Use `FOR UPDATE OF a` to lock only `a`'s rows.
- **`SKIP LOCKED` is not in the SQL standard**: PG/MySQL/Oracle extension (SQLite lacks it). The locked-row-skipping semantics are essential for queues but not portable.
- **Long transactions block VACUUM**: any transaction older than dead tuples prevents their cleanup — bloat grows. Monitor with `pg_stat_activity` (long-running transactions) and `pg_stat_user_tables` (dead tuple count).
- **`BEGIN` doesn't set isolation immediately**: `SET TRANSACTION ISOLATION LEVEL ...` after the first query is too late — the snapshot is taken at the first statement. Set it right after `BEGIN`, or use `BEGIN ISOLATION LEVEL SERIALIZABLE`.
- **Autocommit and multi-statement transactions**: in MySQL (autocommit on), `BEGIN` starts a transaction; in PG, every statement is in a transaction (implicit if not explicit). Application drivers differ — know your driver's default.
- **`COMMIT` can fail**: a serialization failure or deferred constraint violation can surface at `COMMIT`, not at the offending statement. Always check `COMMIT`'s result, not just the statements'.
- **Idle in transaction**: a transaction that's `BEGIN` but never `COMMIT`ed holds locks and blocks VACUUM. Common with connection pools that leak transactions. Set `idle_in_transaction_session_timeout` (PG) to auto-kill them.
- **REPEATABLE READ in MySQL vs PG**: MySQL's REPEATABLE READ does *not* prevent all phantoms (it uses gap locking, which has edge cases). PG's REPEATABLE READ (snapshot isolation) prevents phantoms completely but allows write skew.

## 🧠 Spot the Bug

Two tellers transfer money between the same two accounts at the same time. After both transfers, the totals are wrong. What happened, and how do you fix it?

::code-wrapper{language="sql"}
```sql
-- T1: transfer $100 from account 1 to account 2
BEGIN;
SELECT balance FROM accounts WHERE id = 1;   -- 1000
SELECT balance FROM accounts WHERE id = 2;   -- 500
UPDATE accounts SET balance = 900 WHERE id = 1;  -- ← writes a computed value!
UPDATE accounts SET balance = 600 WHERE id = 2;  -- ← writes a computed value!
COMMIT;

-- T2 (concurrently): transfer $50 from account 1 to account 2
BEGIN;
SELECT balance FROM accounts WHERE id = 1;   -- 1000 (or 900)
SELECT balance FROM accounts WHERE id = 2;   -- 500  (or 600)
UPDATE accounts SET balance = 950 WHERE id = 1;  -- ← computed from the SELECT
UPDATE accounts SET balance = 550 WHERE id = 2;  -- ← computed from the SELECT
COMMIT;
```
::

<details>
<summary>Answer</summary>

The application reads the balance via `SELECT`, computes the new balance in application code (`1000 - 100 = 900`), and writes it back as a literal (`SET balance = 900`). This is a **lost update** — T2 overwrites T1's update because T2's `SELECT` saw the pre-T1 value and wrote a computed result, not a delta.

If T1 commits before T2's `UPDATE`, T2's `SET balance = 950` overwrites T1's `balance = 900`. The $100 transfer is lost. Final balance: 950 instead of 850.

The `SELECT` reads are *not locked*, so they don't prevent the other transaction from modifying the rows between the read and the write. At READ COMMITTED, the lost update is **silent** — no error, just wrong data.

The fix — use atomic read-modify-write (`balance = balance - X`, not `balance = <computed value>`) and `FOR UPDATE` if you need to read-decide-write:

::code-wrapper{language="sql"}
```sql
BEGIN;
-- Lock both rows in deterministic order (ascending id) to prevent deadlocks.
SELECT balance FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;
-- Atomic read-modify-write: the DB reads the current value and writes the delta
-- in one step — safe at any isolation level, no lost update possible.
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```
::

`FOR UPDATE` serializes the transactions on the locked rows; `balance = balance - X` is an atomic update that doesn't depend on the `SELECT`ed value. At SERIALIZABLE, the database would detect the conflict and abort one — but `balance = balance - X` is correct even at READ COMMITTED without explicit locking.

**The lesson**: `UPDATE ... SET col = col - X` is an atomic read-modify-write (safe at any isolation level). `UPDATE ... SET col = <value computed in app from a SELECT>` is a lost-update race. Never read a value, compute in the application, and write it back without `FOR UPDATE` or an atomic expression.

</details>