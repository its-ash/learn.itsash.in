# 28 — Database Administration

This chapter covers the operational side of PostgreSQL: backups, `VACUUM` and bloat, replication, connection pooling, and monitoring. You don't need to be a DBA to know these — every developer touching production databases should understand the basics.

## Backups

### Logical backups (`pg_dump`)

`pg_dump` produces a SQL script (or custom archive) that can restore the database on any PostgreSQL instance:

::code-wrapper{language="bash"}
```bash
# Dump a database (custom format — compressed, supports parallel restore)
pg_dump -Fc -d mydb -f mydb.dump

# Dump as plain SQL
pg_dump -d mydb -f mydb.sql

# Dump all databases
pg_dumpall -f all.sql

# Restore
pg_restore -d newdb mydb.dump
# Parallel restore (faster)
pg_restore -j 4 -d newdb mydb.dump

# Dump a single table
pg_dump -d mydb -t orders -f orders.dump
```
::

`-Fc` (custom format) is recommended — it's compressed, supports parallel restore (`-j`), and selective restore (pick tables). Plain SQL is human-readable but slow to restore and can't be parallelized.

### Physical backups (base backup + WAL)

Physical backups copy the data files — faster for large databases, supports point-in-time recovery (PITR):

::code-wrapper{language="bash"}
```bash
# Base backup (via pg_basebackup)
pg_basebackup -D /backup/base -Ft -z -P

# With WAL archiving for PITR
# postgresql.conf:
#   archive_mode = on
#   archive_command = 'cp %p /backup/wal/%f'
# Restore: copy base backup, set recovery.signal, configure restore_command
``
::

Physical backups are the foundation of streaming replication and PITR. Logical backups (`pg_dump`) are simpler but slower for large databases and don't support PITR.

### Backup strategy

- **Logical (`pg_dump`)**: daily, for small/medium databases, dev/staging, and cross-version migrations.
- **Physical + WAL archiving**: for production, large databases, and PITR requirements.
- **Test your restores**: an untested backup is no backup. Regularly restore to a test instance and verify.

## VACUUM and Bloat

PostgreSQL's MVCC creates new row versions on UPDATE/DELETE; old versions ("dead tuples") remain until `VACUUM` reclaims them. Without vacuuming, the table and indexes bloat — scans get slower, cache efficiency drops.

### Autovacuum

PostgreSQL runs **autovacuum** by default — background workers that vacuum tables based on activity:

::code-wrapper{language="text"}
```text
autovacuum_vacuum_threshold = 50              -- + this many dead tuples
autovacuum_vacuum_scale_factor = 0.2          -- + 20% of the table
-- A table is vacuumed when dead_tuples > threshold + scale_factor * total_rows
``
::

Tune per-table for high-churn tables:

::code-wrapper{language="sql"}
```sql
-- Vacuum this table more aggressively
ALTER TABLE events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
``
::

### Manual VACUUM

::code-wrapper{language="sql"}
```sql
VACUUM orders;           -- reclaims dead tuples, doesn't block
VACUUM FULL orders;      -- reclaims AND rewrites the table (shrinks it) — locks the table
VACUUM ANALYZE orders;   -- vacuum + refresh statistics
ANALYZE orders;          -- refresh statistics only (no vacuum)
``
::

`VACUUM` (plain) reclaims dead tuples but doesn't shrink the file (space is reused for future inserts). `VACUUM FULL` rewrites the table, reclaiming space to the OS — but it takes an `ACCESS EXCLUSIVE` lock (no reads/writes during). Use `pg_repack` for zero-lock rewriting in production.

### Bloat detection

::code-wrapper{language="sql"}
```sql
-- Estimate bloat (via pgstattuple extension)
CREATE EXTENSION pgstattuple;
SELECT * FROM pgstattuple('orders');

-- Or via pg_stat_user_tables (dead tuple count)
SELECT relname, n_live_tup, n_dead_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_live_tup > 0
ORDER BY dead_pct DESC;
``
::

A high `dead_pct` means autovacuum isn't keeping up — tune autovacuum settings or run manual `VACUUM`.

## Replication

PostgreSQL replication comes in two forms:

### Streaming Replication (physical)

The standby connects to the primary and streams WAL records, applying them to maintain a byte-identical copy:

::code-wrapper{language="text"}
```text
# primary (postgresql.conf)
wal_level = replica
max_wal_senders = 10

# standby
pg_basebackup -h primary -D /var/lib/postgresql/data -R
# -R writes standby.signal and primary_conninfo
```
::

- **Read-only standbys** — the standby can serve read queries (read replica).
- **Failover** — promote the standby to primary (with `pg_ctl promote` or a tool like Patroni).
- **No selective replication** — the entire cluster is replicated; can't skip tables.

### Logical Replication

A **publisher** publishes changes to a publication; a **subscriber** subscribes and applies them:

::code-wrapper{language="sql"}
```sql
-- Publisher
CREATE PUBLICATION my_pub FOR TABLE orders, customers;

-- Subscriber (a different cluster)
CREATE SUBSCRIPTION my_sub
  CONNECTION 'host=publisher dbname=mydb'
  PUBLICATION my_pub;
``
::

- **Selective** — replicate specific tables.
- **Cross-version** — subscriber can be a different PostgreSQL version (for upgrades).
- **Writable** — the subscriber is a normal table; conflicts must be handled.
- **No sequences, DDL, or schema** — only row changes (INSERT/UPDATE/DELETE).

## Connection Pooling (PgBouncer)

PostgreSQL forks a process per connection — expensive at high connection counts. **PgBouncer** sits between clients and PostgreSQL, pooling connections:

::code-wrapper{language="text"}
```text
# pgbouncer.ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```
::

- **Transaction pooling** (recommended) — connections are returned to the pool at each transaction boundary. Highest efficiency, but breaks session features (temp tables, `SET`, `LISTEN`/`NOTIFY`, prepared statements in some modes).
- **Session pooling** — connections held for the session. Compatible with all features, less efficient.

PgBouncer (or pgcat) is essential for serverless/lambda workloads that open many short-lived connections.

## Monitoring

Key things to monitor:

### `pg_stat_activity` — current queries

::code-wrapper{language="sql"}
```sql
SELECT pid, usename, application_name, state, wait_event_type, wait_event,
  now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle';
``
::

Find long-running queries, locks, and idle-in-transaction sessions.

### `pg_stat_user_tables` — table stats

::code-wrapper{language="sql"}
```sql
SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
  n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze
FROM pg_stat_user_tables;
``
::

High `seq_scan` with high `seq_tup_read` on a large table suggests a missing index.

### `pg_stat_statements` — query performance

::code-wrapper{language="sql"}
```sql
CREATE EXTENSION pg_stat_statements;

SELECT query, calls, mean_exec_time, total_exec_time, rows, shared_blks_hit, shared_blks_read
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
``
::

The most valuable monitoring tool — shows the actual slowest queries by total time, with call counts and I/O. Requires loading the extension via `shared_preload_libraries`.

### Locks

::code-wrapper{language="sql"}
```sql
-- Blocked queries and what's blocking them
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
``
::

## Maintenance Operations

::code-wrapper{language="sql"}
```sql
-- Reindex (rebuild indexes — CONCURRENTLY doesn't block)
REINDEX INDEX CONCURRENTLY orders_customer_id_idx;

-- Analyze (refresh stats)
ANALYZE orders;

-- Cluster (physically reorder by an index — takes an exclusive lock)
CLUSTER orders USING orders_pkey;

-- VACUUM
VACUUM (ANALYZE) orders;
``
::

## 💡 Tips & Tricks

- **Idiom**: enable `pg_stat_statements` in `shared_preload_libraries` from day one — it's the single most valuable monitoring tool (slowest queries by total time, call counts, I/O), and it's cheap. Without it, you're guessing at what's slow.
- **Idiom**: tune autovacuum per-table for high-churn tables — `ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.05)` vacuums when 5% (not 20%) of rows are dead, keeping up with high-update tables. The default 20% is too lenient for hot tables.
- **Idiom**: use **PgBouncer in transaction-pooling mode** in front of PostgreSQL for workloads with many connections (serverless, microservices) — it pools connections at the transaction boundary, letting thousands of clients share tens of PostgreSQL backends. Reserve session-pooling for apps that need session features (temp tables, `LISTEN`).
- **Reliability**: test your backups by restoring to a test instance regularly — an untested backup is no backup. A `pg_dump` that succeeds but produces a corrupt file (rare but possible) is discovered at restore time, which is too late.
- **Performance**: `VACUUM FULL` shrinks a bloated table but takes an `ACCESS EXCLUSIVE` lock — use `pg_repack` (or `pg_squeeze`) for zero-lock rewriting in production. Regular `VACUUM` (autovacuum) prevents bloat from accumulating; `VACUUM FULL` is for reclaiming already-bloated space.

## ⚠️ Edge Cases & Gotchas

- **`VACUUM FULL` locks the table**: `ACCESS EXCLUSIVE` — no reads or writes during the rewrite. On a large table, this is downtime. Use `pg_repack` for online rewriting. Plain `VACUUM` doesn't shrink but doesn't lock.
- **Autovacuum can fall behind**: on very high-churn tables, autovacuum may not keep up with dead tuple creation. Symptoms: growing table size, slowing queries. Monitor `n_dead_tup` in `pg_stat_user_tables` and tune autovacuum settings per-table.
- **Long-running transactions block VACUUM**: dead tuples can't be reclaimed until no transaction could see them — a long-running transaction (or an idle-in-transaction one) pins the vacuum horizon, causing bloat. Set `idle_in_transaction_session_timeout` and monitor for long transactions.
- **`pg_dump` doesn't dump global objects**: roles, tablespaces, and database-level grants need `pg_dumpall --globals-only`. A `pg_dump` restore without globals leaves you with no roles.
- **Streaming replication lag**: a standby can lag behind the primary (network, load). Reads from the standby may see stale data — use synchronous replication (`synchronous_commit = on`) for read-after-write consistency, or route critical reads to the primary.
- **Logical replication doesn't replicate sequences or DDL**: a failover to a logical subscriber leaves sequences behind (chapter 23) and schema differences unhandled. Plan sequence advancement and DDL application separately.
- **PgBouncer transaction pooling and prepared statements**: in transaction mode, prepared statements don't work by default (the connection changes between transactions). Use `max_prepared_statements` (PgBouncer 1.21+) or switch to session pooling for prepared statements.
- **`REINDEX` locks**: plain `REINDEX INDEX` takes a lock; `REINDEX INDEX CONCURRENTLY` doesn't but takes longer and can fail (leaving an invalid index — drop and retry). Use `CONCURRENTLY` in production.
- **`pg_stat_statements` needs `shared_preload_libraries`**: it's a shared library loaded at server start — you can't `CREATE EXTENSION` it without a restart to add it to `shared_preload_libraries`. Plan for a restart when enabling it.
- **Connection count limits**: `max_connections` (default 100) — each connection is a forked process with memory overhead. Don't raise `max_connections` to thousands; use a connection pooler (PgBouncer) instead.

## 🧠 Spot the Bug

A team notices their `orders` table is 50 GB but only has 1 million rows (which should be ~1 GB). Queries are slowing down. `VACUUM` runs but doesn't shrink the table. What's happening, and what's the fix?

<details>
<summary>Answer</summary>

The table is **bloated** — 49 GB of dead tuples (old row versions from UPDATEs/DELETEs) that `VACUUM` has marked as reclaimable but hasn't returned to the OS. Plain `VACUUM` reclaims dead tuples for *reuse* (future inserts fill the empty space) but doesn't *shrink* the file — the 50 GB stays 50 GB.

The likely cause: autovacuum isn't keeping up with the churn (the table has high UPDATE/DELETE activity), OR a long-running transaction is pinning the vacuum horizon (dead tuples can't be reclaimed while any transaction could see them).

The fix:

1. **Identify the cause** — check for long-running transactions (`pg_stat_activity` with `state != 'idle'` and long duration) that block vacuuming, and check `pg_stat_user_tables.n_dead_tup` for the dead tuple count.

2. **Reclaim the space**:
```sql
-- VACUUM FULL rewrites and shrinks the table — but takes an ACCESS EXCLUSIVE lock
VACUUM FULL orders;

-- Or, for zero-lock (production): pg_repack
-- pg_repack -t orders
```

3. **Prevent recurrence** — tune autovacuum for this table:
```sql
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.05,   -- vacuum at 5% dead, not 20%
  autovacuum_vacuum_cost_limit = 1000      -- let autovacuum work faster
);
```

And ensure no long-running transactions block vacuuming — set `idle_in_transaction_session_timeout` and monitor for stuck transactions.

**The lesson**: plain `VACUUM` reclaims dead tuples for reuse but doesn't shrink the file. `VACUUM FULL` (or `pg_repack`) shrinks, at the cost of a lock. Prevent bloat with tuned autovacuum and no long-running transactions.

</details>

## Summary

You can now back up (logical via `pg_dump`, physical via `pg_basebackup` + WAL), manage bloat with `VACUUM`/autovacuum/`VACUUM FULL`/`pg_repack`, set up streaming and logical replication, pool connections with PgBouncer, and monitor with `pg_stat_activity`/`pg_stat_user_tables`/`pg_stat_statements` — the essentials every developer should know. Next: common pitfalls.