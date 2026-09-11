# 28 — Database Administration

## Backups — Logical

`pg_dump` produces a SQL script or custom archive that can restore on any PostgreSQL instance. Logical backups are portable across versions and architectures but slow for large databases.

::code-wrapper{language="bash"}
```bash
# Custom format (-Fc): compressed, supports parallel restore, selective table restore
# This is the recommended format for most use cases
pg_dump -Fc -d mydb -f mydb.dump

# Plain SQL: human-readable, can be piped to psql, but SLOW to restore
# and can't be parallelized or selectively restored
pg_dump -d mydb -f mydb.sql

# Parallel dump (PG 11+): use multiple jobs to speed up the dump
# -j 4 uses 4 parallel connections to dump tables concurrently
pg_dump -Fc -j 4 -d mydb -f mydb.dump

# Restore with parallel jobs (much faster than single-threaded)
pg_restore -j 4 -d newdb mydb.dump

# Selective restore: restore only specific tables from a custom-format dump
pg_restore -d newdb -t orders -t customers mydb.dump

# Dump a single table (useful for extracting one table from a large DB)
pg_dump -Fc -d mydb -t orders -f orders.dump

# Dump with schema only (no data) — useful for creating a staging DB
pg_dump -Fc -d mydb --schema-only -f schema.dump

# Dump with data only (schema already exists) — for data refresh
pg_dump -Fc -d mydb --data-only -f data.dump

# ⚠️ pg_dump does NOT dump global objects: roles, tablespaces, database grants
# Use pg_dumpall for those:
pg_dumpall --globals-only -f globals.sql  -- roles + tablespaces only
pg_dumpall -f all_databases.sql            -- ALL databases + globals
```
::

### Backup Strategy Decision Matrix

| Scenario | Tool | Frequency | Retention |
|----------|------|-----------|-----------|
| Small DB (< 10GB) | `pg_dump -Fc` | Daily | 30 days |
| Medium DB (10-100GB) | `pg_dump -Fc -j 4` | Daily | 14 days |
| Large DB (100GB+) | `pg_basebackup` + WAL | Continuous WAL + weekly base | 7 days PITR |
| Cross-version migration | `pg_dump` from old → `pg_restore` to new | One-time | N/A |
| Global objects (roles) | `pg_dumpall --globals-only` | Daily | 30 days |

## Backups — Physical

Physical backups copy the data files directly. Faster for large databases, supports PITR, and is the foundation of streaming replication.

::code-wrapper{language="bash"}
```bash
# pg_basebackup: creates a binary copy of the entire data directory
# -Ft: tar format, -z: gzip compressed, -P: show progress, -R: write recovery config
pg_basebackup -h primary -D /backup/base -Ft -z -P -R

# -R creates standby.signal + primary_conninfo in the backup,
# making it ready to start as a streaming replica immediately

# For PITR (Point-in-Time Recovery): you need the base backup + WAL archives
# Configure WAL archiving in postgresql.conf:
#   archive_mode = on
#   archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'
#   wal_level = replica
# The archive_command must be idempotent: the test prevents overwriting

# Restore to a specific point in time:
# 1. Stop PostgreSQL
# 2. Replace data directory with base backup
# 3. Create recovery.signal in data directory
# 4. Configure recovery in postgresql.auto.conf:
#    restore_command = 'cp /backup/wal/%f %p'
#    recovery_target_time = '2024-06-15 14:30:00+00'
#    recovery_target_action = 'promote'
# 5. Start PostgreSQL — it replays WAL up to the target time, then promotes
```
::

## Complex Example — Production Backup + Recovery Strategy

::code-wrapper{language="bash"}
```bash
#!/bin/bash
# production_backup.sh — daily backup script with rotation + verification
set -euo pipefail

BACKUP_DIR=/backup/postgres
RETENTION_DAYS=7
DB_NAME=production
DATE=$(date +%Y%m%d_%H%M%S)

# ─── 1. Dump global objects (roles, tablespaces) ───
# Without this, a restore has no roles and all GRANTs fail
pg_dumpall --globals-only -f "$BACKUP_DIR/globals_$DATE.sql"

# ─── 2. Logical backup (custom format, parallel) ───
# -Fc: custom compressed format (supports parallel + selective restore)
# -j 4: 4 parallel jobs for faster dump
pg_dump -Fc -j 4 -d "$DB_NAME" -f "$BACKUP_DIR/${DB_NAME}_$DATE.dump"

# ─── 3. Verify the backup (critical — an untested backup is no backup) ───
# Use pg_restore --list to verify the archive is readable
if ! pg_restore --list "$BACKUP_DIR/${DB_NAME}_$DATE.dump" > /dev/null 2>&1; then
  echo "ERROR: Backup verification failed for ${DB_NAME}_$DATE.dump" >&2
  exit 1
fi

# ─── 4. Rotate: delete backups older than RETENTION_DAYS ───
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "globals_*.sql" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: ${DB_NAME}_$DATE.dump"
```
::

::code-wrapper{language="bash"}
```bash
#!/bin/bash
# pitr_restore.sh — point-in-time recovery from base backup + WAL
set -euo pipefail

DATA_DIR=/var/lib/postgresql/data
BASE_BACKUP=/backup/base/latest.tar
WAL_DIR=/backup/wal
TARGET_TIME="2024-06-15 14:30:00+00"

# ─── 1. Stop PostgreSQL ───
pg_ctl -D "$DATA_DIR" stop -m fast

# ─── 2. Replace data directory with base backup ───
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
tar xzf "$BASE_BACKUP" -C "$DATA_DIR"

# ─── 3. Create recovery.signal (tells PG to enter recovery mode) ───
touch "$DATA_DIR/recovery.signal"

# ─── 4. Configure recovery target ───
cat >> "$DATA_DIR/postgresql.auto.conf" << EOF
restore_command = 'cp $WAL_DIR/%f %p'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
EOF

# ─── 5. Start PostgreSQL — replays WAL to target time, then promotes ───
pg_ctl -D "$DATA_DIR" start
# PG logs: "recovery stopping before commit of transaction N at (time)"
# Then: "database system is ready to accept read only connections" (during)
# Then: "archive recovery complete" and promotion to read-write
```
::

## VACUUM and Bloat

PostgreSQL's MVCC creates new row versions on UPDATE/DELETE. Old versions ("dead tuples") remain in the heap until `VACUUM` reclaims them. Without vacuuming, tables and indexes bloat — scans slow, cache efficiency drops.

### How MVCC Creates Dead Tuples

::code-wrapper{language="text"}
```text
-- UPDATE in PostgreSQL is: INSERT new version + mark old version as dead
-- The old version is NOT immediately removed — other transactions may
-- still need to see it (snapshot isolation). It becomes a "dead tuple".

-- Row at T1: {id=1, amount=100, xmin=T1, xmax=∞}  → visible
-- UPDATE at T2: {id=1, amount=100, xmin=T1, xmax=T2}  → dead (xmax set)
--                {id=1, amount=150, xmin=T2, xmax=∞}  → visible
--
-- VACUUM: removes the dead tuple (xmax=T2) → free space for reuse
-- But the heap file doesn't shrink — the space is marked free, not
-- returned to the OS. Only VACUUM FULL (or pg_repack) shrinks the file.
```
::

### Autovacuum Configuration

::code-wrapper{language="text"}
```text
# postgresql.conf — global autovacuum settings
autovacuum = on                    # enabled by default, leave on
autovacuum_max_workers = 3         # max concurrent autovacuum workers
autovacuum_naptime = 1min          # how often to check tables for vacuum need
autovacuum_vacuum_cost_limit = 200 # I/O budget per autovacuum (higher = faster)
autovacuum_vacuum_cost_delay = 2ms # throttle between I/O operations

# Default vacuum trigger: dead_tuples > threshold + scale_factor × total_rows
autovacuum_vacuum_threshold = 50        # minimum dead tuples
autovacuum_vacuum_scale_factor = 0.2    # + 20% of total rows
# A table with 1M rows is vacuumed when dead_tuples > 50 + 0.2 × 1M = 200050
# That's 200K dead tuples before vacuuming — too lenient for hot tables
```
::

### Per-Table Autovacuum Tuning

::code-wrapper{language="sql"}
```sql
-- For high-churn tables (frequent UPDATE/DELETE), vacuum more aggressively
-- Lower scale_factor → vacuum when fewer dead tuples accumulate
ALTER TABLE events SET (
  autovacuum_vacuum_scale_factor = 0.05,   -- vacuum at 5% dead (not 20%)
  autovacuum_analyze_scale_factor = 0.02,  -- analyze at 2% changed (not 10%)
  autovacuum_vacuum_threshold = 1000        -- minimum 1000 dead tuples
);

-- For append-only tables (INSERT only, no UPDATE/DELETE), be lenient
-- They don't produce dead tuples, so aggressive vacuuming wastes resources
ALTER TABLE audit_log SET (
  autovacuum_vacuum_scale_factor = 0.5,    -- vacuum at 50% (rarely needed)
  autovacuum_insert_scale_factor = 0.1     -- analyze on inserts at 10%
);

-- Check current per-table settings:
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'events' AND relkind = 'r';
```
::

### Manual VACUUM Operations

::code-wrapper{language="sql"}
```sql
-- VACUUM (plain): reclaims dead tuples for reuse, does NOT shrink the file
-- No lock held — concurrent reads and writes proceed normally
VACUUM orders;

-- VACUUM ANALYZE: reclaim + update planner statistics
VACUUM ANALYZE orders;

-- VACUUM FULL: rewrites the table, shrinks the file, returns space to OS
-- ⚠️ Takes ACCESS EXCLUSIVE lock — NO reads or writes during the rewrite
-- On a large table, this is DOWNTIME. Use pg_repack for zero-lock rewriting.
VACUUM FULL orders;

-- ANALYZE only: update planner statistics without vacuuming
ANALYZE orders;

-- Check if a table needs vacuuming (dead tuple ratio):
SELECT relname, n_live_tup, n_dead_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) AS dead_pct,
  last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
WHERE n_live_tup > 0
ORDER BY dead_pct DESC;
```
::

### Bloat Diagnosis with pgstattuple

::code-wrapper{language="sql"}
```sql
-- pgstattuple: exact bloat measurement (scans the table, accurate but slow)
CREATE EXTENSION pgstattuple;

SELECT
  table_len,
  tuple_count,
  tuple_len,
  tuple_percent,        -- % of table occupied by live tuples
  dead_tuple_count,
  dead_tuple_len,
  dead_tuple_percent,   -- % wasted by dead tuples
  free_space,
  free_percent          -- % free space (reusable by future inserts)
FROM pgstattuple('orders');

-- pgstatindex: check index bloat
SELECT * FROM pgstatindex('orders_customer_id_idx');
-- If leaf_pages is much larger than expected → index is bloated → REINDEX
```
::

## Replication

### Streaming Replication (Physical)

::code-wrapper{language="text"}
```text
# PRIMARY (postgresql.conf)
wal_level = replica              # required for streaming replication
max_wal_senders = 10             # max simultaneous standby connections
wal_keep_size = 1GB              # retain WAL segments for lagging standbys
hot_standby = on                 # (on standby) allow read-only queries

# STANDBY: create from base backup with -R flag
pg_basebackup -h primary -D /var/lib/postgresql/data -R -P
# -R writes: standby.signal + primary_conninfo to postgresql.auto.conf

# FAILOVER: promote the standby to primary
pg_ctl -D /var/lib/postgresql/data promote
# The standby stops replaying WAL and becomes a read-write primary
# This is irreversible — the standby can no longer rejoin as a replica
# Use Patroni or repmgr for automated failover with replan
```
::

### Logical Replication

::code-wrapper{language="sql"}
```sql
-- PUBLISHER (source database)
-- Create a publication for specific tables
CREATE PUBLICATION my_pub FOR TABLE orders, customers;

-- Or publish ALL tables (use with caution — includes future tables)
CREATE PUBLICATION all_tables FOR ALL TABLES;

-- SUBSCRIBER (destination database — can be a different PG version)
-- Create a subscription that pulls changes from the publisher
CREATE SUBSCRIPTION my_sub
  CONNECTION 'host=publisher.example.com port=5432 dbname=mydb'
  PUBLICATION my_pub;

-- Monitor replication progress on the subscriber:
SELECT subname, pid, relid, received_lsn, last_msg_send_time
FROM pg_stat_subscription;

-- Monitor on the publisher:
SELECT pubname, pid, sent_lsn, write_lsn, flush_lsn, replay_lsn
FROM pg_stat_replication;

-- ⚠️ Limitations of logical replication:
--   No sequences (sequence values diverge — must sync manually)
--   No DDL (schema changes must be applied to both sides separately)
--   No TRUNCATE (unless explicitly added: ALTER PUBLICATION ... ADD TABLE ... TRUNCATE)
--   No schema-less replication (tables must exist on subscriber with compatible types)
--   Conflicts: subscriber is writable — if a row exists, INSERT fails
```
::

## Connection Pooling (PgBouncer)

::code-wrapper{language="ini"}
```ini
# pgbouncer.ini

[databases]
; Route connections to the real PostgreSQL
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432

; ─── Pool Mode ───
; transaction: connections returned to pool at COMMIT/ROLLBACK
;   Highest efficiency — thousands of clients share tens of server connections
;   ⚠️ Breaks: temp tables, SET (session-level), LISTEN/NOTIFY,
;      prepared statements (unless max_prepared_statements > 0, PgBouncer 1.21+),
;      advisory locks (session-level)
; session: connections held for entire client session
;   Compatible with all features, less efficient (1 client = 1 server connection)
pool_mode = transaction

; ─── Capacity ───
max_client_conn = 1000      ; max client connections to PgBouncer
default_pool_size = 25      ; max server connections per database/user pair
reserve_pool_size = 5       ; extra connections when pool is exhausted
reserve_pool_timeout = 3    ; seconds to wait before using reserve pool

; ─── Timeout ───
server_idle_timeout = 600   ; close idle server connections after 10 min
query_wait_timeout = 120    ; client waits max 2 min for a server connection
```
::

::code-wrapper{language="text"}
```text
# When to use which pool mode:
#
# Transaction mode (recommended for most apps):
#   Web apps, serverless/lambda, microservices with short transactions
#   1000 clients → 25 server connections (40:1 multiplexing)
#
# Session mode (when you need session features):
#   Batch jobs using temp tables, apps using LISTEN/NOTIFY,
#   session-level advisory locks, SET search_path per session
#
# Connection count economics:
#   Each PostgreSQL connection forks a backend process (~5-10MB RSS)
#   1000 connections = 5-10GB just for connection overhead
#   With PgBouncer transaction mode: 25 connections = 125-250MB
```
::

## Monitoring

### pg_stat_activity — Current Queries

::code-wrapper{language="sql"}
```sql
-- Find all active queries with duration and wait events
SELECT
  pid,
  usename,
  application_name,
  state,                              -- active, idle, idle in transaction
  wait_event_type,                     -- Lock, IO, LWLock, etc. (NULL = not waiting)
  wait_event,                          -- specific event name
  now() - query_start AS duration,     -- how long the query has been running
  now() - xact_start AS xact_duration, -- how long the TRANSACTION has been open
  LEFT(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY xact_duration DESC NULLS LAST;

-- Find idle-in-transaction sessions (these block VACUUM and hold locks)
SELECT pid, usename, now() - xact_start AS xact_duration, query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '5 minutes'
ORDER BY xact_duration DESC;

-- ⚠️ idle-in-transaction is dangerous:
--   It holds locks, prevents VACUUM from reclaiming dead tuples (bloat),
--   and holds the replication slot's xmin horizon
--   Set: idle_in_transaction_session_timeout = '5min' in postgresql.conf
```
::

### pg_stat_statements — Slow Query Identification

::code-wrapper{language="sql"}
```sql
-- Enable (requires restart — it's a shared_preload_libraries entry):
--   shared_preload_libraries = 'pg_stat_statements' in postgresql.conf
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 queries by total execution time
SELECT
  LEFT(query, 120) AS query_preview,
  calls,                               -- how many times executed
  mean_exec_time,                      -- avg ms per call
  max_exec_time,                       -- worst-case ms (outliers!)
  total_exec_time,                     -- total ms across all calls
  rows,                                -- total rows returned
  shared_blks_hit,                     -- cache hits (fast)
  shared_blks_read,                    -- disk reads (slow)
  round(100.0 * shared_blks_hit /
    NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS hit_pct
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Find queries with high variance (mean vs max) — sporadic slowness
SELECT LEFT(query, 80) AS query_preview,
  calls, mean_exec_time, max_exec_time,
  max_exec_time / NULLIF(mean_exec_time, 0) AS max_to_mean_ratio
FROM pg_stat_statements
WHERE calls > 10
ORDER BY max_to_mean_ratio DESC
LIMIT 10;
-- A ratio > 10x means the query is sometimes fast, sometimes very slow
-- → investigate: stale stats, lock contention, or cold cache

-- Reset stats (after deploying an optimization, to measure fresh)
SELECT pg_stat_statements_reset();
```
::

### Lock Monitoring

::code-wrapper{language="sql"}
```sql
-- Find blocked queries and what's blocking them
SELECT
  blocked.pid     AS blocked_pid,
  blocked.query   AS blocked_query,
  blocking.pid    AS blocking_pid,
  blocking.query  AS blocking_query,
  now() - blocked.xact_start AS blocked_duration
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.state = 'active';

-- Find all locks held by a specific PID (for debugging deadlocks)
SELECT locktype, relation::regclass, mode, granted, pid
FROM pg_locks
WHERE pid = 12345
ORDER BY granted, relation::regclass;

-- Find queries waiting on locks
SELECT pid, wait_event_type, wait_event,
  now() - query_start AS waited_for
FROM pg_stat_activity
WHERE wait_event_type = 'Lock'
ORDER BY waited_for DESC;
```
::

## Maintenance Operations

::code-wrapper{language="sql"}
```sql
-- Reindex without blocking (CONCURRENTLY builds a new index in parallel,
-- then swaps — but can fail, leaving an INVALID index you must DROP)
REINDEX INDEX CONCURRENTLY orders_customer_id_idx;

-- If CONCURRENTLY fails, the old index is still valid but a new INVALID index exists:
-- Check: SELECT indexrelname, indisvalid FROM pg_index WHERE indexrelname LIKE 'orders_%';
-- Clean up: DROP INDEX orders_customer_id_idx_ccnew;  -- the failed new index

-- Cluster: physically reorder rows by an index (improves cache locality)
-- ⚠️ Takes ACCESS EXCLUSIVE lock — don't run in production
CLUSTER orders USING orders_pkey;

-- Analyze: refresh planner statistics (lightweight, no lock)
ANALYZE orders;

-- Vacuum + analyze in one call
VACUUM (ANALYZE) orders;

-- Check index validity (an INVALID index is ignored by the planner)
SELECT indexrelname, indisvalid, indisready
FROM pg_index
WHERE indrelid = 'orders'::regclass;
-- indisvalid = false → index exists but planner won't use it (REINDEX CONCURRENTLY failed)
-- indisready = false → index is still being built
```
::

## 💡 Tips & Tricks

- **Idiom** — enable `pg_stat_statements` in `shared_preload_libraries` from day one. It's the single most valuable monitoring tool (slowest queries by total time, call counts, I/O, buffer hit ratio). It's cheap (uses a shared memory hash table) and works retroactively — without it, you're guessing at what's slow. Requires a restart to enable.

- **Idiom** — tune autovacuum per-table for high-churn tables. `ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.05)` vacuums when 5% (not 20%) of rows are dead, keeping up with high-UPDATE tables. The default 20% is too lenient for hot tables — by the time 20% are dead, bloat has already degraded performance.

- **Idiom** — use `pg_dump -Fc` (custom format) always. It's compressed, supports parallel restore (`pg_restore -j 4`), and selective restore (`pg_restore -t specific_table`). Plain SQL dumps are slow to restore and can't be parallelized or selectively restored. The only reason for plain SQL is cross-version migration to very old PostgreSQL.

- **Idiom** — use PgBouncer in transaction-pooling mode for workloads with many connections (serverless, microservices). It pools at the transaction boundary, letting thousands of clients share tens of PostgreSQL backends. Reserve session-pooling for apps that need temp tables, `LISTEN`/`NOTIFY`, or session-level `SET`.

- **Reliability** — test your backups by restoring to a test instance regularly. An untested backup is no backup. A `pg_dump` that succeeds but produces a corrupt file (rare but possible — disk errors, interrupted writes) is discovered at restore time, which is too late. Monthly restore drills catch this.

- **Performance** — `VACUUM FULL` shrinks a bloated table but takes `ACCESS EXCLUSIVE` lock. Use `pg_repack` (or `pg_squeeze`) for zero-lock rewriting in production. Regular `VACUUM` (autovacuum) prevents bloat from accumulating; `VACUUM FULL` is for reclaiming already-bloated space, not for routine maintenance.

- **Performance** — `REINDEX CONCURRENTLY` rebuilds indexes without blocking writes, but can fail (leaving an invalid index). Check `pg_index.indisvalid` after. If it failed, drop the invalid index and retry. For very large indexes, consider `pg_repack` which rebuilds indexes online.

## ⚠️ Edge Cases & Gotchas

- **`VACUUM FULL` locks the table**: `ACCESS EXCLUSIVE` — no reads or writes during the rewrite. On a large table, this is downtime. Use `pg_repack` for online rewriting. Plain `VACUUM` doesn't shrink but doesn't lock.

- **Autovacuum can fall behind**: on very high-churn tables, autovacuum may not keep up with dead tuple creation. Symptoms: growing table size, slowing queries, high `n_dead_tup` in `pg_stat_user_tables`. Fix: lower `autovacuum_vacuum_scale_factor`, increase `autovacuum_vacuum_cost_limit`, or increase `autovacuum_max_workers`.

- **Long-running transactions block VACUUM**: dead tuples can't be reclaimed until no transaction could see them — a long-running transaction pins the vacuum horizon, causing bloat across ALL tables (not just the one it's querying). Set `idle_in_transaction_session_timeout` and `statement_timeout` to prevent runaway transactions.

- **`pg_dump` doesn't dump global objects**: roles, tablespaces, and database-level grants need `pg_dumpall --globals-only`. A `pg_dump` restore without globals leaves you with no roles — all `GRANT` statements in the dump fail. Always run both.

- **Streaming replication lag**: a standby can lag behind the primary (network, load, slow WAL replay). Reads from the standby may see stale data. Use synchronous replication (`synchronous_commit = on`, `synchronous_standby_names`) for read-after-write consistency, or route critical reads to the primary.

- **Logical replication doesn't replicate sequences or DDL**: a failover to a logical subscriber leaves sequences behind (duplicate key errors on INSERT) and schema differences unhandled. Manually sync sequences after failover: `SELECT setval(pg_get_serial_sequence('t', 'id'), (SELECT max(id) FROM t))`.

- **PgBouncer transaction pooling and prepared statements**: in transaction mode, prepared statements don't work by default (the server connection changes between transactions, losing the prepared statement). Use `max_prepared_statements` (PgBouncer 1.21+) to enable protocol-level prepared statement support, or switch to session pooling for prepared statements.

- **`pg_stat_statements` needs `shared_preload_libraries`**: it's a shared library loaded at server start — you can't `CREATE EXTENSION` it without a restart to add it to `shared_preload_libraries`. Plan for a restart when enabling it. The extension also uses `pg_stat_statements.max` (default 5000) entries of shared memory — increase for high-query-diversity workloads.

- **WAL archive growth**: `archive_mode = on` copies every WAL segment to `archive_command`. If the archive destination fills up, PostgreSQL **pauses** WAL generation (blocking all writes) until archiving succeeds. Monitor archive directory size and set `archive_timeout` to force segment switches on low-write databases.

- **`REINDEX CONCURRENTLY` can fail**: if it encounters a lock conflict or unique constraint violation during the build, it aborts, leaving an INVALID index. The old index is still valid and used. Clean up: `DROP INDEX <new_index_name>` and retry. Check for invalid indexes: `SELECT indexrelname FROM pg_index WHERE NOT indisvalid`.

## 🧠 Spot the Bug

A team restores their database from a `pg_dump` backup after a failure. The restore completes, but when the application tries to connect, it gets `FATAL: role "app_user" does not exist`. They check the backup — it contains all the tables and data. What went wrong, and what's the fix?

::code-wrapper{language="bash"}
```bash
# Their backup script:
pg_dump -Fc -d production -f production.dump

# Their restore:
pg_restore -d newdb production.dump
# All tables and data restored successfully

# Application fails:
# FATAL: role "app_user" does not exist
```
::

<details>
<summary>Answer</summary>

`pg_dump` backs up a **single database** — it does NOT dump global objects (roles, tablespaces, database-level grants). The `app_user` role is a global object stored in `pg_authid`, not in the `production` database's catalog. The restore created all tables and data, but no roles — so `GRANT` statements in the dump that reference `app_user` failed silently (or were skipped), and the application can't connect because the role doesn't exist.

The fix: always dump globals separately with `pg_dumpall --globals-only`, and restore them BEFORE the database dump:

::code-wrapper{language="bash"}
```bash
# Backup — ALWAYS run both:
pg_dumpall --globals-only -f globals.sql
pg_dump -Fc -d production -f production.dump

# Restore — globals FIRST, then the database:
psql -f globals.sql          # creates roles, tablespaces
createdb production          # create the empty database
pg_restore -d production production.dump  # restore schema + data
```
::

The updated backup script should include both:

::code-wrapper{language="bash"}
```bash
#!/bin/bash
set -euo pipefail
DATE=$(date +%Y%m%d_%H%M%S)

# Global objects (roles, tablespaces) — REQUIRED
pg_dumpall --globals-only -f "/backup/globals_$DATE.sql"

# Database dump
pg_dump -Fc -d production -f "/backup/production_$DATE.dump"

echo "Backup complete: globals + production_$DATE.dump"
```
::

**The lesson**: `pg_dump` dumps one database's schema and data, but NOT roles, tablespaces, or database-level grants (those are cluster-level globals). Always pair `pg_dump` with `pg_dumpall --globals-only`. An untested restore would have caught this — another reason to test restores regularly.

</details>