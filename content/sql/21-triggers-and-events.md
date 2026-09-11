---
title: "21 — Triggers & Events"
description: "Trigger anatomy (function + trigger), BEFORE/AFTER semantics, FOR EACH ROW vs STATEMENT, transition tables, WHEN clauses, firing order, recursion — code-first reference with a production audit-log system and anti-patterns for hidden side effects."
---

# 21 — Triggers & Events

A trigger is two objects: a **function** (the code) and a **trigger** (the binding to a table + event + timing + granularity). The function returns `trigger`; the trigger decides when to call it. Every trigger fires invisibly — the application's `INSERT`/`UPDATE`/`DELETE` statement doesn't reference them. That invisibility is their power and their danger.

## Trigger Anatomy — the two-object model

::code-wrapper{language="sql"}
```sql
-- ── Object 1: the trigger function ──────────────────────────────
-- Returns `trigger` (a pseudo-type). Takes no args (use TG_ARGV for
-- trigger-passed arguments). Lives in pg_proc like any function.
CREATE FUNCTION touch_modified_at() RETURNS trigger AS $$
BEGIN
  -- BEFORE row triggers receive NEW (incoming row) and can mutate it.
  -- Returning NEW proceeds; returning NULL silently drops the row.
  NEW.modified_at = now();          -- mutate in place, then return
  RETURN NEW;                       -- WITHOUT this, the row is dropped
END;
$$ LANGUAGE plpgsql;

-- ── Object 2: the trigger binding ───────────────────────────────
-- Binds the function to (table, event, timing, granularity).
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers        -- timing: BEFORE sees/modifies NEW
  FOR EACH ROW                       -- granularity: fires once per row
  EXECUTE FUNCTION touch_modified_at();
-- Now every UPDATE on customers silently sets modified_at = now().
-- The application never sees this. Debugging "why did modified_at
-- change?" requires hunting pg_trigger, not the app code.
```
::

## BEFORE vs AFTER — the decision matrix

| Timing | Can modify row? | Sees other triggers' changes? | Row written yet? | Use case |
|---|---|---|---|---|
| `BEFORE` | Yes (mutate `NEW`, return it) | No (fires before write) | No | Validation, defaulting, transforming input, canceling the op |
| `AFTER` | No (row already written) | Yes (sees final state) | Yes | Audit logging, notifications, cascading to other tables |

`BEFORE` fires *before* the row hits the table — it can mutate `NEW` and return it (the mutated version is what gets written). Returning `NULL` silently cancels the operation for that row (no error, no log). `AFTER` fires *after* the write — `NEW` is read-only, but the final committed state is visible and other triggers' modifications are reflected.

## FOR EACH ROW vs FOR EACH STATEMENT

::code-wrapper{language="sql"}
```sql
-- FOR EACH ROW: fires once per affected row. NEW/OLD available.
-- A 1M-row UPDATE fires the function 1,000,000 times.
CREATE TRIGGER row_level_audit
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_order_row();

-- FOR EACH STATEMENT: fires once per statement, regardless of row count.
-- NEW/OLD NOT available — use transition tables (REFERENCING) to see
-- the full set of changed rows. A 1M-row UPDATE fires the function ONCE.
CREATE TRIGGER stmt_level_audit
  AFTER UPDATE ON orders
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_order_batch();
-- new_rows / old_rows are pseudo-tables containing ALL changed rows.
-- Bulk-audit in a single INSERT...SELECT instead of 1M function calls.
```
::

## NEW and OLD — availability by event

| Event | `NEW` | `OLD` | `BEFORE` return semantics |
|---|---|---|---|
| `INSERT` | the new row | NULL | Return `NEW` to proceed; `NULL` to skip insert |
| `UPDATE` | post-update row | pre-update row | Return `NEW` (modified) to proceed; `NULL` to skip |
| `DELETE` | NULL | the deleted row | Return `OLD` to proceed; `NULL` to skip delete |
| `TRUNCATE` | NULL | NULL | Statement-level only; return value ignored |

## TG_ Variables — the trigger's runtime context

| Variable | Value | Example |
|---|---|---|
| `TG_OP` | `'INSERT'`/`'UPDATE'`/`'DELETE'`/`'TRUNCATE'` | `IF TG_OP = 'DELETE' THEN ...` |
| `TG_TABLE_NAME` | Table the trigger fired on | `'customers'` |
| `TG_TABLE_SCHEMA` | Schema | `'public'` |
| `TG_WHEN` | `'BEFORE'`/`'AFTER'` | — |
| `TG_LEVEL` | `'ROW'`/`'STATEMENT'` | — |
| `TG_NARGS` / `TG_ARGV` | Args passed to the trigger | `TG_ARGV[0]` is the first arg |

## Multi-Event Triggers with TG_OP — one function, all events

::code-wrapper{language="sql"}
```sql
-- A single trigger function handling INSERT/UPDATE/DELETE via TG_OP.
-- This is the standard pattern for audit logs — one function, one trigger,
-- all three DML events. TG_OP branches the logic.
CREATE FUNCTION audit_generic() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, row_id, old_data, new_data, changed_at, changed_by)
  VALUES (
    TG_TABLE_NAME,                                          -- 'customers'
    TG_OP,                                                  -- 'INSERT' / 'UPDATE' / 'DELETE'
    COALESCE(NEW.id, OLD.id),                               -- NEW.id for INSERT/UPDATE, OLD.id for DELETE
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,  -- OLD only for UPDATE/DELETE
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,  -- NEW only for INSERT/UPDATE
    now(),                                                  -- statement timestamp (same for all rows in a stmt)
    current_user                                            -- the DB role, not the app user
  );
  RETURN COALESCE(NEW, OLD);  -- AFTER trigger: return value ignored, but return something
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_audit
  AFTER INSERT OR UPDATE OR DELETE ON customers   -- one trigger, three events
  FOR EACH ROW EXECUTE FUNCTION audit_generic();
```
::

## WHEN Clause — conditional triggers (skip the function call entirely)

::code-wrapper{language="sql"}
```sql
-- WHEN is evaluated BEFORE the function runs. If false, the function
-- is never called — zero overhead. This is a per-row filter, not a
-- per-row function-internal check. For high-volume tables, a WHEN
-- clause on the relevant column avoids millions of function calls
-- on updates that don't touch that column.
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  WHEN (NEW.name IS DISTINCT FROM OLD.name)   -- IS DISTINCT FROM: NULL-safe inequality
  EXECUTE FUNCTION touch_modified_at();
-- An UPDATE that changes only `email` → WHEN is false → function never called.
-- An UPDATE that sets name = name (no-op) → WHEN is false (DISTINCT FROM handles this).
```
::

**WHEN constraints**: no subqueries, no volatile functions (`random()`, `now()`), must be a simple expression on `NEW`/`OLD`. For complex conditions, check inside the function.

## TRUNCATE Triggers — statement-level only

::code-wrapper{language="sql"}
```sql
-- TRUNCATE has no row-level semantics (it doesn't fire per-row DELETE).
-- FOR EACH STATEMENT is the only option. NEW/OLD are NULL (no rows to
-- reference). Useful for audit-logging truncates (which bypass DELETE
-- triggers entirely — a common security blind spot).
CREATE FUNCTION audit_truncate() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, changed_at, changed_by)
  VALUES (TG_TABLE_NAME, 'TRUNCATE', now(), current_user);
  RETURN NULL;   -- statement-level: return value always ignored
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_truncate_audit
  AFTER TRUNCATE ON customers     -- TRUNCATE triggers are ALWAYS AFTER
  FOR EACH STATEMENT              -- ALWAYS STATEMENT (no row-level)
  EXECUTE FUNCTION audit_truncate();
-- Without this, a TRUNCATE customers; wipes the table with ZERO audit
-- trail — DELETE triggers don't fire on TRUNCATE. This is a common gap.
```
::

## Trigger Ordering — alphabetical by name (PostgreSQL)

Multiple triggers on the same table/event fire in **alphabetical order by name**, not definition order. This is fragile — renaming a trigger changes the order.

::code-wrapper{language="sql"}
```sql
-- ❌ Fragile: firing order depends on names that might get renamed
CREATE TRIGGER validate_email BEFORE INSERT ON users ...;
CREATE TRIGGER set_defaults BEFORE INSERT ON users ...;
CREATE TRIGGER audit_insert BEFORE INSERT ON users ...;
-- Fires as: audit_insert → set_defaults → validate_email (alphabetical)
-- If audit_insert assumes defaults are set, it runs FIRST — wrong order.

-- ✅ Production: numeric prefix makes order explicit and stable
CREATE TRIGGER 01_set_defaults  BEFORE INSERT ON users ...;
CREATE TRIGGER 02_validate_email BEFORE INSERT ON users ...;
CREATE TRIGGER 03_audit_insert  BEFORE INSERT ON users ...;
-- Fires as: 01_set_defaults → 02_validate_email → 03_audit_insert
-- Rename a function, not the trigger — the prefix pins the order.
```
::

## Complex Implementation — Production Audit Log with Transition Tables

A real audit system: `AFTER STATEMENT` trigger with transition tables, recording all changes in a single batch `INSERT`, with old/new values as JSONB, operation type, timestamp, session user, and transaction ID.

::code-wrapper{language="sql"}
```sql
-- ── Audit log table ─────────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  TEXT NOT NULL,
  operation   TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
  row_id      BIGINT,                    -- nullable for TRUNCATE (no row)
  old_data    JSONB,                     -- full row snapshot before change
  new_data    JSONB,                     -- full row snapshot after change
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  NAME NOT NULL DEFAULT current_user,   -- DB role
  txid        BIGINT NOT NULL DEFAULT txid_current() -- transaction ID for grouping
);

-- Index for "what changed in this transaction" and "who changed this row"
CREATE INDEX audit_log_txid_idx ON audit_log(txid);
CREATE INDEX audit_log_table_row_idx ON audit_log(table_name, row_id);
CREATE INDEX audit_log_changed_at_idx ON audit_log(changed_at DESC);

-- ── The trigger function (statement-level, transition tables) ───
-- Uses REFERENCING to get the full set of changed rows as pseudo-tables.
-- One function call per statement, regardless of row count → bulk INSERT.
CREATE FUNCTION audit_batch() RETURNS trigger AS $$
BEGIN
  -- INSERT: only new_table has rows
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, operation, row_id, new_data, txid)
    SELECT TG_TABLE_NAME, 'INSERT', id, to_jsonb(t), txid_current()
    FROM new_table;                          -- new_table = all inserted rows

  -- DELETE: only old_table has rows
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, operation, row_id, old_data, txid)
    SELECT TG_TABLE_NAME, 'DELETE', id, to_jsonb(t), txid_current()
    FROM old_table;                          -- old_table = all deleted rows

  -- UPDATE: both old_table and new_table have rows, joined by PK
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, operation, row_id, old_data, new_data, txid)
    SELECT TG_TABLE_NAME, 'UPDATE',
           n.id,                              -- new row's PK
           to_jsonb(o),                       -- old snapshot
           to_jsonb(n),                       -- new snapshot
           txid_current()
    FROM old_table o                          -- old_table: pre-update rows
    JOIN new_table n ON o.id = n.id;          -- new_table: post-update rows
    -- JOIN on PK (id) aligns old and new versions of the same row.
    -- If your PK isn't `id`, adjust the join column.
  END IF;

  RETURN NULL;   -- statement-level: return value ignored
END;
$$ LANGUAGE plpgsql;

-- ── Bind it: one trigger, all three DML events, statement-level ─
CREATE TRIGGER orders_audit_batch
  AFTER INSERT OR UPDATE OR DELETE ON orders
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_batch();

-- ── Test: a bulk UPDATE fires the trigger ONCE, audits all rows ─
UPDATE orders SET status = 'shipped' WHERE status = 'pending';
-- → audit_log gets N rows (one per changed order) in a single INSERT...SELECT
-- → all share the same txid → grouped as one transaction's changes
-- → a row-level trigger would have fired the function N times (N function calls)
```
::

## Anti-Pattern: Triggers for Business Logic

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: business rule hidden in a trigger. The application's
-- `UPDATE orders SET status = 'shipped'` silently enforces a rule
-- the app code doesn't know about. Debugging: "why did my UPDATE
-- fail?" → hunt through pg_trigger, not the app stack trace.
CREATE FUNCTION enforce_shipping_rule() RETURNS trigger AS $$
BEGIN
  -- Business rule: can't ship if payment isn't settled.
  -- This belongs in the application (visible, testable, in git)
  -- or in a CHECK constraint (if expressible), not a trigger.
  IF NEW.status = 'shipped' AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.order_id = NEW.id AND p.status = 'settled'
  ) THEN
    RAISE EXCEPTION 'Cannot ship order %: payment not settled', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_shipping_rule
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_shipping_rule();

-- ✅ RIGHT: put it in the application where it's visible and testable.
-- The app checks payment status before issuing the UPDATE. If a constraint
-- is needed as a backstop, use a CHECK (if self-contained) or a deferred
-- FK, not a trigger with hidden cross-table logic.
```
::

**Why triggers are bad for business logic**: invisible to the application, invisible in code review, invisible in git history of the app, can't be unit-tested without a database, fire on `COPY`/bulk loads (unexpected), and make "given these SQL statements, what's the final state?" impossible to reason about.

## Anti-Pattern: BEFORE Trigger for Audit (Can't See Final State)

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: BEFORE trigger for audit. It fires BEFORE the row is
-- written, so it logs the INTENDED state, not the ACTUAL state.
-- If a constraint fails after the BEFORE trigger runs (e.g., a
-- deferred FK, or another BEFORE trigger rejects the row), the
-- audit log records a change that never happened.
CREATE FUNCTION audit_before() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (operation, new_data) VALUES ('UPDATE', to_jsonb(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- If the UPDATE is later rolled back, the audit entry is WRONG
-- (logs a change that was reverted). Also: the audit INSERT is in
-- the same transaction — if the txn rolls back, the audit row is
-- rolled back too (no record of the attempted change).

-- ✅ RIGHT: AFTER trigger fires after the write succeeds. The row
-- is in the table. But it's still in the same transaction — if the
-- whole txn rolls back, the audit row rolls back too. For a truly
-- durable audit trail (survives rollback), use a separate transaction
-- via dblink or pg_notify + an async consumer — advanced, rare.
CREATE FUNCTION audit_after() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (operation, new_data) VALUES ('UPDATE', to_jsonb(NEW));
  RETURN NULL;   -- AFTER: return value ignored
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER orders_audit
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION audit_after();
```
::

## Trigger Recursion — the infinite loop

::code-wrapper{language="sql"}
```sql
-- ❌ DANGER: trigger on A updates B, trigger on B updates A → recursion
CREATE FUNCTION a_touches_b() RETURNS trigger AS $$
BEGIN
  UPDATE b SET last_sync = now() WHERE a_id = NEW.id;  -- triggers b_touches_a
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION b_touches_a() RETURNS trigger AS $$
BEGIN
  UPDATE a SET last_sync = now() WHERE id = NEW.a_id;  -- triggers a_touches_b
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER a_sync AFTER UPDATE ON a FOR EACH ROW EXECUTE FUNCTION a_touches_b();
CREATE TRIGGER b_sync AFTER UPDATE ON b FOR EACH ROW EXECUTE FUNCTION b_touches_a();

-- UPDATE a SET x = 1 WHERE id = 1;
-- → a_sync fires → UPDATE b → b_sync fires → UPDATE a → a_sync fires → ...
-- PostgreSQL has a stack depth limit → ERROR: stack depth limit exceeded.
-- Even without the stack limit, this is an infinite loop.

-- ✅ Fix: use a session variable to break the cycle, or restructure so
-- only one direction has a trigger, or use a flag column to avoid
-- re-triggering.
CREATE FUNCTION a_touches_b() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.suppress_b_sync', true) IS NULL THEN
    PERFORM set_config('app.suppress_b_sync', '1', true);  -- local to txn
    UPDATE b SET last_sync = now() WHERE a_id = NEW.id;
    PERFORM set_config('app.suppress_b_sync', NULL, true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
::

## DISABLE TRIGGER for Migrations

::code-wrapper{language="sql"}
```sql
-- Disable triggers for bulk loads / migrations (avoids per-row function
-- calls on COPY / bulk INSERT). Bypasses trigger logic entirely.
ALTER TABLE orders DISABLE TRIGGER ALL;      -- ALL: user + FK triggers
-- WARNING: DISABLE TRIGGER ALL also disables FK enforcement.
-- For FK-safe bulk loads, use DISABLE TRIGGER USER (keeps FK triggers).
ALTER TABLE orders DISABLE TRIGGER USER;     -- only user-defined triggers
COPY orders FROM '/data/orders.csv' WITH CSV HEADER;
ALTER TABLE orders ENABLE TRIGGER USER;      -- re-enable

-- Replica trigger modes:
-- ENABLE REPLICA: fires only on replica (logical replication target)
-- ENABLE ALWAYS:  fires on primary AND replica (use with caution)
ALTER TABLE orders ENABLE ALWAYS TRIGGER orders_audit_batch;
```
::

## Inspecting Triggers

::code-wrapper{language="sql"}
```sql
-- List all triggers on a table with their definitions
SELECT tgname,                          -- trigger name (controls fire order!)
       tgenabled,                       -- O=origin, D=disabled, R=replica, A=always
       pg_get_triggerdef(oid)           -- full CREATE TRIGGER statement
FROM pg_trigger
WHERE tgrelid = 'orders'::regclass      -- cast table name to regclass
  AND NOT tgisinternal;                 -- exclude internally-created triggers (FKs)
ORDER BY tgname;                        -- alphabetical = fire order
```
::

## 💡 Tips & Tricks

- **Idiom**: use `AFTER STATEMENT` with transition tables (`REFERENCING NEW TABLE AS ...`) for bulk audit triggers — one function call per statement instead of per row. A million-row `UPDATE` fires a row trigger a million times; a statement trigger fires once with all changed rows in a temp table. The audit `INSERT...SELECT` is a single batch operation.
- **Idiom**: name triggers with a numeric prefix (`01_set_defaults`, `02_validate`, `03_audit`) to control firing order — PostgreSQL fires same-event triggers alphabetically, so a prefix makes the order explicit, stable, and visible in `pg_trigger`.
- **Idiom**: use `WHEN (NEW.col IS DISTINCT FROM OLD.col)` to skip no-op updates — `UPDATE customers SET name = name` still writes a new row version (MVCC) and fires the trigger; the `WHEN` clause avoids the function call and the spurious `modified_at` bump. `IS DISTINCT FROM` is NULL-safe (unlike `<>`).
- **Idiom**: use `TG_OP` to write a single multi-event trigger function (`AFTER INSERT OR UPDATE OR DELETE`) instead of three separate functions — one function, one trigger, all three events, branched by `TG_OP`. Less code, one place to maintain.
- **Debug**: when a column changes unexpectedly, query `pg_trigger` to list triggers on the table and inspect their functions — `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'orders'::regclass AND NOT tgisinternal ORDER BY tgname;`. The trigger hunt is the first step in "why did this column change?"
- **Migration**: use `ALTER TABLE x DISABLE TRIGGER USER` (not `ALL`) for bulk loads — `USER` disables only your triggers, keeping FK enforcement active. `ALL` disables FK triggers too, risking orphaned rows.
- **Idiom**: add a `TRUNCATE` trigger alongside your `DELETE` audit trigger — `TRUNCATE` bypasses `DELETE` triggers entirely, so without a `TRUNCATE` trigger, a `TRUNCATE orders;` wipes the table with zero audit trail. A common security blind spot.

## ⚠️ Edge Cases & Gotchas

- **`BEFORE` trigger returning `NULL` silently drops the row**: no error, no log — the row just isn't inserted/updated/deleted. A common source of "where did my row go?" debugging. Always return `NEW` (or `OLD` for DELETE) from `BEFORE` triggers unless you deliberately want to skip.
- **Trigger firing order is alphabetical by name**: not definition order. Rename a trigger and the order changes. Use numeric prefixes (`01_`, `02_`) for explicit, stable ordering.
- **Trigger recursion**: a trigger on A updates B, whose trigger updates A → infinite loop until stack depth limit. Avoid triggers that modify other tables with their own triggers, or use a session variable guard.
- **Transition tables memory for large operations**: `REFERENCING NEW TABLE AS ...` materializes ALL changed rows in a temp table. A 10M-row `UPDATE` with transition tables builds a 10M-row temp table in memory/disk. For very large operations, use row-level triggers or `DISABLE TRIGGER` for the bulk load.
- **Triggers on partitioned tables**: PostgreSQL 11+ allows triggers on partitioned tables that propagate to all partitions. Pre-11, you had to create triggers on each partition individually.
- **`WHEN` clause evaluation cost**: `WHEN` is evaluated per row before the function runs. A `WHEN` with a complex expression is cheaper than calling the function, but not free. For extremely hot tables, ensure `WHEN` references indexed columns or is a simple comparison.
- **`NEW`/`OLD` in statement-level triggers**: not available — use transition tables (`REFERENCING`). Attempting to reference `NEW`/`OLD` in a statement-level trigger function raises an error.
- **`TRUNCATE` triggers are statement-level only**: no `FOR EACH ROW` on `TRUNCATE`. `NEW`/`OLD` are NULL. Always `AFTER` (the table is already truncated).
- **Triggers fire on `COPY` and bulk loads**: a trigger fires for every row loaded via `COPY`, which can be orders of magnitude slower than the load itself. `DISABLE TRIGGER USER` for bulk loads, re-enable after.
- **`AFTER` triggers see other `BEFORE`/`AFTER` triggers' changes**: `AFTER` triggers fire in alphabetical order and see the cumulative effect of all `BEFORE` triggers and earlier `AFTER` triggers. This is why audit should be `AFTER` (sees the final state).
- **Replica trigger firing**: by default, triggers fire on the primary only. `ENABLE REPLICA` fires only on replicas; `ENABLE ALWAYS` fires on both. For logical replication where the target has its own triggers, `ENABLE ALWAYS` can cause double-execution of side effects.

## 🧠 Spot the Bug

A developer writes a `BEFORE UPDATE` trigger to set `modified_at`, but users report that `modified_at` changes even when the `UPDATE` didn't change any data (`UPDATE customers SET name = name WHERE id = 1`). The trigger:

::code-wrapper{language="sql"}
```sql
CREATE FUNCTION update_modified_at() RETURNS trigger AS $$
BEGIN
  NEW.modified_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_at();
```
::

<details>
<summary>Answer</summary>

The trigger fires on every `UPDATE` that matches a row, regardless of whether the values changed. `UPDATE customers SET name = name WHERE id = 1` is still an `UPDATE` — PostgreSQL writes a new row version (MVCC semantics: an `UPDATE` is always a delete + insert under the hood), the `BEFORE UPDATE` trigger fires, and `modified_at` is set to `now()` even though the data is identical.

The fix — add a `WHEN` clause that skips no-op updates:

::code-wrapper{language="sql"}
```sql
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  WHEN (NEW IS DISTINCT FROM OLD)   -- NULL-safe: only fire if something actually changed
  EXECUTE FUNCTION update_modified_at();
```
::

`NEW IS DISTINCT FROM OLD` is false when the rows are identical (NULL-safe, unlike `NEW <> OLD` which is NULL if any column is NULL). The trigger skips no-op updates, `modified_at` reflects actual modifications, and the function-call overhead is avoided.

**The lesson**: `UPDATE` fires the trigger even if no columns changed — PostgreSQL writes a new row version regardless. Use `WHEN (NEW IS DISTINCT FROM OLD)` to make `modified_at` reflect actual modifications.

</details>