# 15 — Transactions & Isolation

Transactions are the mechanism that makes a database a database — they group operations into atomic, consistent, isolated, durable units. Without transactions, partial failures corrupt data. This chapter covers ACID, isolation levels, and the anomalies they prevent (or don't).

## ACID

| Property | Meaning |
|---|---|
| **Atomicity** | All operations in a transaction succeed or none do — no partial commits. |
| **Consistency** | A transaction takes the database from one valid state to another (constraints hold). |
| **Isolation** | Concurrent transactions appear to run serially — their effects don't interleave. |
| **Durability** | Once committed, the change survives crashes (written to WAL before commit returns). |

Consistency is enforced by constraints (chapter 12). Atomicity, isolation, and durability are the database engine's job.

## Transaction Control

::code-wrapper{language="sql"}
```sql
BEGIN;                  -- start a transaction (or: BEGIN TRANSACTION)
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;                 -- apply both updates

-- Or roll back
BEGIN;
DELETE FROM orders WHERE id = 999;
ROLLBACK;               -- undo the delete
``
::

PostgreSQL implicitly wraps every statement in a transaction (a "BEGIN; statement; COMMIT;" if no explicit `BEGIN`). MySQL's autocommit is on by default (each statement is its own transaction). `BEGIN` always starts an explicit transaction.

### SAVEPOINTs

Partial rollbacks within a transaction:

::code-wrapper{language="sql"}
```sql
BEGIN;
INSERT INTO orders (...) VALUES (...);
SAVEPOINT after_insert;
UPDATE inventory SET qty = qty - 1 WHERE product_id = 5;
-- Oops, something went wrong
ROLLBACK TO SAVEPOINT after_insert;   -- undo only the UPDATE, keep the INSERT
COMMIT;
``
::

`ROLLBACK TO SAVEPOINT` rolls back to the savepoint but keeps the transaction open. `RELEASE SAVEPOINT` discards it (you can no longer roll back to it).

## Isolation Levels

Isolation levels trade off consistency for performance — higher isolation prevents more anomalies but reduces concurrency. The SQL standard defines four levels:

| Level | Prevents |
|---|---|
| **READ UNCOMMITTED** | (Nothing useful — allows dirty reads. Rarely implemented; PostgreSQL maps this to READ COMMITTED.) |
| **READ COMMITTED** (PG default) | Dirty reads. Each statement sees a fresh snapshot. |
| **REPEATABLE READ** | Dirty reads, non-repeatable reads, phantom reads (in PostgreSQL/SI; in the standard, phantoms are allowed). |
| **SERIALIZABLE** | All anomalies — full serializability. |

### Setting the isolation level

::code-wrapper{language="sql"}
```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- ... work ...
COMMIT;

-- Or per session
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE;
``
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

PostgreSQL doesn't allow dirty reads at any level (READ UNCOMMITTED is aliased to READ COMMITTED).

### Non-Repeatable Read (prevented at REPEATABLE READ+)

T1 reads a row twice and gets different values because T2 modified it in between.

::code-wrapper{language="text"}
```text
T1: BEGIN; SELECT balance FROM accounts WHERE id = 1;   -- 100
T2: UPDATE accounts SET balance = 200 WHERE id = 1; COMMIT;
T1: SELECT balance FROM accounts WHERE id = 1;   -- 200 (different!)
T1: COMMIT;
```
::

READ COMMITTED allows this (each statement gets a fresh snapshot). REPEATABLE READ prevents it (one snapshot per transaction).

### Phantom Read (prevented at REPEATABLE READ in PostgreSQL; SERIALIZABLE in standard)

T1 runs a query twice and gets different rows because T2 inserted/deleted matching rows.

::code-wrapper{language="text"}
```text
T1: BEGIN; SELECT count(*) FROM orders WHERE amount > 100;   -- 5
T2: INSERT INTO orders (amount, ...) VALUES (150, ...); COMMIT;
T1: SELECT count(*) FROM orders WHERE amount > 100;   -- 6 (phantom!)
T1: COMMIT;
``
::

In PostgreSQL, REPEATABLE READ (snapshot isolation) prevents phantoms. In the SQL standard, REPEATABLE READ allows phantoms (you need SERIALIZABLE). This is a PostgreSQL strength.

### Write Skew (prevented only at SERIALIZABLE)

Two transactions read overlapping data, make decisions based on what they read, and write to *disjoint* rows — the combined result is inconsistent, but neither transaction saw the other's write.

::code-wrapper{language="text"}
```text
-- Constraint: at least one doctor must be on call
T1: SELECT count(*) FROM doctors WHERE on_call = true;   -- 2
T2: SELECT count(*) FROM doctors WHERE on_call = true;   -- 2
T1: UPDATE doctors SET on_call = false WHERE id = 1; COMMIT;  -- thinks 1 remains
T2: UPDATE doctors SET on_call = false WHERE id = 2; COMMIT;  -- thinks 1 remains
-- Now 0 doctors on call — invariant violated, but each transaction saw a valid state.
```
::

Snapshot isolation (REPEATABLE READ) doesn't prevent write skew — only SERIALIZABLE does, via predicate locking or SSI (Serializable Snapshot Isolation).

## PostgreSQL's Isolation Implementation

PostgreSQL uses **MVCC** (Multi-Version Concurrency Control):

- Each statement/transaction sees a snapshot — a consistent view of the database as of a point in time.
- Writers don't block readers; readers don't block writers.
- `UPDATE`/`DELETE` create new row versions (old versions remain for in-flight transactions).
- Old versions are cleaned by `VACUUM`.

### READ COMMITTED (default)

- Each statement gets a fresh snapshot (as of the statement's start).
- Within a transaction, repeated reads can see different data (non-repeatable reads allowed).
- `UPDATE`/`DELETE` see the latest committed version of rows; `SELECT` sees committed data as of statement start.
- Good default for most workloads — high concurrency, no dirty reads.

### REPEATABLE READ (Snapshot Isolation in PostgreSQL)

- One snapshot per transaction (taken at the first statement).
- Repeated reads return the same data — no non-repeatable reads, no phantoms.
- **Write conflicts**: if T1 updates row R, and T2 (in a REPEATABLE READ transaction) tries to update R after T1 commits, T2 gets `ERROR: could not serialize access due to concurrent update` and must retry. This is "first-updater-wins."
- Prevents phantoms (stronger than the standard's REPEATABLE READ).

### SERIALIZABLE

- Serializable Snapshot Isolation (SSI) — detects serialization anomalies (like write skew) and aborts one transaction with `ERROR: could not serialize access due to read/write dependencies among transactions`.
- Requires retry logic: on a serialization failure, rerun the transaction.
- Lower throughput than lower levels (runtime checks have overhead), but correct for critical invariants.

## Choosing an Isolation Level

| Workload | Level |
|---|---|
| Most web apps, read-heavy, tolerant of slightly stale reads | READ COMMITTED (default) |
| Reports that must see a consistent snapshot | REPEATABLE READ |
| Financial invariants ("at least one doctor on call," "no double-spend") | SERIALIZABLE (with retry) |

For SERIALIZABLE, you **must** implement retry on `40001` (serialization_failure). Without retry, SERIALIZABLE just adds aborts with no correctness benefit.

::code-wrapper{language="sql"}
```sql
-- Pseudo-code for serializable retry
-- (in application code, not SQL)
-- for attempt in 1..max_retries:
--     try:
--         BEGIN ISOLATION LEVEL SERIALIZABLE;
--         ... work ...
--         COMMIT;
--         break;
--     except serialization_failure:
--         ROLLBACK;
--         continue;
```
::

## Deadlocks

Two transactions each hold a lock the other needs — both wait forever. The database detects the cycle and aborts one with `ERROR: deadlock detected`.

::code-wrapper{language="text"}
```text
T1: UPDATE accounts SET balance = balance - 100 WHERE id = 1;   -- locks row 1
T2: UPDATE accounts SET balance = balance - 50  WHERE id = 2;   -- locks row 2
T1: UPDATE accounts SET balance = balance + 100 WHERE id = 2;   -- waits for T2's lock on row 2
T2: UPDATE accounts SET balance = balance + 50  WHERE id = 1;   -- waits for T1's lock on row 1
-- Deadlock — database aborts one transaction.
```
::

**Prevention**: always lock rows in a consistent order. If both transactions update `id=1` then `id=2`, no deadlock. `SELECT ... FOR UPDATE` can establish locks in a deterministic order before the updates.

### `SELECT ... FOR UPDATE`

Locks rows for the duration of the transaction, preventing other transactions from updating/deleting them:

::code-wrapper{language="sql"}
```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;   -- locks row 1
-- ... compute ...
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;
``
::

`FOR UPDATE` is needed when you read a value, make a decision based on it, and then update — to prevent another transaction from changing it between your read and write. Without it, you get a race condition (lost update).

Variants:
- `FOR SHARE` — locks against `UPDATE`/`DELETE` but allows other `FOR SHARE`.
- `FOR NO KEY UPDATE` — locks but allows other `FOR NO KEY UPDATE` / `FOR SHARE` (finer-grained).
- `FOR UPDATE SKIP LOCKED` — skip rows already locked (queue-like patterns).
- `FOR UPDATE NOWAIT` — error immediately if locked, instead of waiting.

::code-wrapper{language="sql"}
```sql
-- Job queue: grab the next available job, skipping locked ones
SELECT id FROM jobs WHERE status = 'pending'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
``
::

`SKIP LOCKED` is the foundation of safe job queues in the database.

## 💡 Tips & Tricks

- **Idiom**: use `SELECT ... FOR UPDATE` whenever you read a value, make a decision, then update it in the same transaction — without it, you have a lost-update race (T2's update overwrites T1's, even at REPEATABLE READ). At SERIALIZABLE the database detects the conflict and aborts, but at lower levels the lost update is *silent*.
- **Performance**: keep transactions **short** — long transactions hold locks, block VACUUM (dead tuples can't be reclaimed until all transactions that might see them finish), and increase bloat. A transaction that spans an HTTP call to an external service is a classic anti-pattern (the external service's latency now determines your lock hold time).
- **Idiom**: use `FOR UPDATE SKIP LOCKED` for database-backed job queues — workers grab rows without blocking each other, and locked rows are skipped (another worker owns them). It's the simplest correct queue pattern, though dedicated queues (RabbitMQ, SQS) are better at high scale.
- **Idiom**: for SERIALIZABLE, always implement retry on `40001` (serialization_failure) — without retry, SERIALIZABLE just adds aborts with no benefit. Retry the *entire* transaction (re-read, re-decide, re-write), not just the failing statement.
- **Debug**: deadlocks almost always indicate **inconsistent lock ordering** — audit the order in which transactions acquire locks (via `FOR UPDATE` or `UPDATE`) and enforce a global order (e.g., always lock by ascending `id`). Once locks are acquired in a consistent order, cycles can't form.

## ⚠️ Edge Cases & Gotchas

- **Lost updates at READ COMMITTED**: `T1: read x=10; T2: read x=10; T1: write x=11; T2: write x=11` — T2 overwrites T1's update, both think they incremented, result is 11 not 12. READ COMMITTED doesn't prevent this. Use `FOR UPDATE`, `UPDATE ... SET x = x + 1` (atomic read-modify-write), or SERIALIZABLE.
- **REPEATABLE READ "first-updater-wins"**: if T2 (REPEATABLE READ) tries to update a row T1 already updated and committed, T2 gets `could not serialize access due to concurrent update` — T2 must retry the whole transaction. This is correct but surprises people expecting "last writer wins."
- **SERIALIZABLE can abort transactions that would have been fine** — SSI is conservative (false positives). This is the cost of serializability without global locks. Retry handles it.
- **`FOR UPDATE` on a `JOIN`**: `SELECT ... FROM a JOIN b ... FOR UPDATE` locks all rows in `a` and `b`. Use `FOR UPDATE OF a` to lock only `a`'s rows.
- **`SKIP LOCKED` is not in the SQL standard**: it's a PostgreSQL/MySQL/Oracle extension (SQLite lacks it). The locked-row-skipping semantics are essential for queues but not portable.
- **Long transactions block VACUUM**: any transaction older than dead tuples prevents their cleanup — bloat grows. Monitor with `pg_stat_activity` (long-running transactions) and `pg_stat_user_tables` (dead tuple count).
- **`BEGIN` doesn't set isolation immediately**: `SET TRANSACTION ISOLATION LEVEL ...` after the first query is too late — the snapshot is taken at the first statement. Set it right after `BEGIN`, or use `BEGIN ISOLATION LEVEL SERIALIZABLE`.
- **Autocommit and multi-statement transactions**: in MySQL (autocommit on), `BEGIN` starts a transaction; in PostgreSQL, every statement is in a transaction (implicit if not explicit). Application drivers differ — know your driver's default.
- **`COMMIT` can fail**: a serialization failure or constraint violation can surface at `COMMIT` (deferred constraints), not at the offending statement. Always check `COMMIT`'s result, not just the statements'.
- **Idle in transaction**: a transaction that's `BEGIN` but never `COMMIT`ed holds locks and blocks VACUUM. Common with connection pools that leak transactions. Use `idle_in_transaction_session_timeout` (PostgreSQL) to auto-kill them.

## 🧠 Spot the Bug

Two tellers transfer money between the same two accounts at the same time. After both transfers, the totals are wrong. What happened, and how do you fix it?

::code-wrapper{language="sql"}
```sql
-- T1: transfer $100 from account 1 to account 2
BEGIN;
SELECT balance FROM accounts WHERE id = 1;   -- 1000
SELECT balance FROM accounts WHERE id = 2;   -- 500
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

-- T2 (concurrently): transfer $50 from account 1 to account 2
BEGIN;
SELECT balance FROM accounts WHERE id = 1;   -- 1000 (before T1 commits, or 900 after?)
SELECT balance FROM accounts WHERE id = 2;   -- 500 (or 600?)
UPDATE accounts SET balance = balance - 50 WHERE id = 1;
UPDATE accounts SET balance = balance + 50 WHERE id = 2;
COMMIT;
``
::

<details>
<summary>Answer</summary>

The `SELECT balance` reads are *not locked*, so they don't prevent the other transaction from modifying the rows between the read and the write. Depending on timing and isolation level:

- At **READ COMMITTED**: each `SELECT` sees the latest committed value, but the `UPDATE ... SET balance = balance - 100` is an atomic read-modify-write on the *current* row value — so the final balances are actually correct (both updates apply to the latest committed value, and the `balance = balance - X` form is safe). The `SELECT`s are misleading (they show a stale value for the decision), but the `UPDATE`s are correct because they use the column's current value, not the value that was `SELECT`ed.

- The **real bug** is if the application reads the balance into application code, computes the new balance there, and writes it back: `UPDATE accounts SET balance = 900 WHERE id = 1` (using the value read by `SELECT`, not `balance - 100`). Then T2 overwrites T1's update — a **lost update**. The `balance = balance - 100` form is safe; the `balance = 900` form is not.

- At **REPEATABLE READ**: if T2's `SELECT` happens before T1 commits, T2 sees the old values (snapshot). When T2 tries to `UPDATE` row 1 (already updated by T1), it gets `could not serialize access due to concurrent update` and must retry. So REPEATABLE READ *prevents* the lost update by aborting T2 — but T2 must handle the abort.

The robust fix — use atomic read-modify-write (`balance = balance - X`, not `balance = <computed value>`) and `FOR UPDATE` if you need to read-decide-write:

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;   -- locks row 1
-- ... decide based on the locked value ...
UPDATE accounts SET balance = balance - 100 WHERE id = 1;   -- atomic
UPDATE accounts SET balance = balance + 100 WHERE id = 2;   -- atomic
COMMIT;
```
::
`FOR UPDATE` serializes the transactions on the locked rows; `balance = balance - X` is an atomic update that doesn't depend on the `SELECT`ed value. At SERIALIZABLE, the database would detect the conflict and abort one — but the `balance = balance - X` form is correct even at READ COMMITTED without explicit locking.

**The lesson**: `UPDATE ... SET col = col - X` is an atomic read-modify-write (safe at any isolation level). `UPDATE ... SET col = <value computed in app from a SELECT>` is a lost-update race. Never read a value, compute in the application, and write it back without `FOR UPDATE` or an atomic expression.

</details>

## Summary

You can now use `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`, choose isolation levels knowing which anomalies each prevents, detect and prevent deadlocks with consistent lock ordering, use `FOR UPDATE`/`SKIP LOCKED` for safe read-decide-write and job queues, and implement SERIALIZABLE retry. Next: views and materialized views.