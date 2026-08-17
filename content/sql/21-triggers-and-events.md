# 21 — Triggers & Events

Triggers run functions automatically when data changes — for audit logs, derived columns, cross-table consistency, and enforcing rules that constraints can't express. They're powerful and dangerous: invisible side effects, performance overhead, and debugging difficulty. Use them judiciously.

## Trigger Anatomy

A trigger has two parts:
1. A **trigger function** — the code to run (written in PL/pgSQL or another language).
2. A **trigger** — the binding of that function to a table and an event (`INSERT`/`UPDATE`/`DELETE`), with timing (`BEFORE`/`AFTER`) and granularity (`FOR EACH ROW`/`FOR EACH STATEMENT`).

::code-wrapper{language="sql"}
```sql
-- The function
CREATE FUNCTION update_modified_at() RETURNS trigger AS $$
BEGIN
  NEW.modified_at = now();   -- BEFORE row triggers can modify NEW
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_at();
```
::

Now every `UPDATE` on `customers` automatically sets `modified_at = now()`. `NEW` is the incoming row (the post-update values); `OLD` is the pre-update values.

## BEFORE vs AFTER

| Timing | Can modify the row? | Sees other triggers' changes? | Use case |
|---|---|---|---|
| `BEFORE` | Yes (modify `NEW`, return it) | No | Validation, defaulting, transforming input. |
| `AFTER` | No (row already written) | Yes | Audit logging, notifications, cascading to other tables. |

`BEFORE` triggers fire before the row is written; they can modify `NEW` and even cancel the operation (return `NULL` to skip the insert/update). `AFTER` triggers fire after the row is written; they can't change the row but can see the final state and trigger further changes.

## FOR EACH ROW vs FOR EACH STATEMENT

- `FOR EACH ROW` (most common) — fires once per affected row. `NEW`/`OLD` are available.
- `FOR EACH STATEMENT` — fires once per statement, regardless of how many rows it affected. `NEW`/`OLD` aren't available (use transition tables, below).

::code-wrapper{language="sql"}
```sql
-- Statement-level trigger with transition tables (PostgreSQL 10+)
CREATE FUNCTION audit_orders() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (action, count)
  SELECT TG_OP, count(*) FROM new_table;   -- or old_table
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON orders
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_orders();
```
::

`REFERENCING NEW TABLE AS ... OLD TABLE AS ...` gives statement-level triggers access to the full set of changed rows (transition tables). Useful for bulk auditing.

## NEW and OLD

| Trigger | `NEW` | `OLD` |
|---|---|---|
| INSERT | the new row | — |
| UPDATE | the post-update row | the pre-update row |
| DELETE | — | the deleted row |

`BEFORE` row triggers:
- Return `NEW` to proceed (with modifications).
- Return `NULL` to skip the operation (the row isn't inserted/updated/deleted).
- For `DELETE`, `NEW` is NULL; return `OLD` to proceed, `NULL` to skip.

`AFTER` row triggers and all statement triggers: the return value is ignored.

## TG_ Variables

| Variable | Value |
|---|---|
| `TG_OP` | `'INSERT'`, `'UPDATE'`, `'DELETE'`, or `'TRUNCATE'`. |
| `TG_TABLE_NAME` | The table the trigger fired on. |
| `TG_TABLE_SCHEMA` | The schema. |
| `TG_WHEN` | `'BEFORE'` or `'AFTER'`. |
| `TG_LEVEL` | `'ROW'` or `'STATEMENT'`. |
| `TG_NARGS` / `TG_ARGV` | Arguments passed to the trigger. |

## Common Patterns

### Audit log

::code-wrapper{language="sql"}
```sql
CREATE FUNCTION audit_customer() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (table_name, action, row_id, old_data, new_data, changed_at, changed_by)
  VALUES (
    TG_TABLE_NAME, TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    now(), current_user
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_audit
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_customer();
``
::

### Derived column (maintain a denormalized value)

::code-wrapper{language="sql"}
```sql
-- Keep orders.customer_name in sync with customers.name
CREATE FUNCTION sync_customer_name() RETURNS trigger AS $$
BEGIN
  UPDATE orders SET customer_name = NEW.name WHERE customer_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_sync_name
  AFTER UPDATE OF name ON customers
  FOR EACH ROW EXECUTE FUNCTION sync_customer_name();
``
::

Note: **generated columns** (chapter 11) are better for single-row derivations. Triggers are for cross-table denormalization where a generated column can't reach.

### Preventing deletes

::code-wrapper{language="sql"}
```sql
CREATE FUNCTION no_delete_active() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Cannot delete active customer %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_active_delete
  BEFORE DELETE ON customers
  FOR EACH ROW
  WHEN (OLD.active = true)
  EXECUTE FUNCTION no_delete_active();
``
::

The `WHEN` clause limits the trigger to rows matching a condition — a filter that avoids running the function for non-matching rows (performance optimization).

## Conditional Triggers (WHEN)

::code-wrapper{language="sql"}
```sql
-- Only fire when the name actually changes
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  WHEN (NEW.name IS DISTINCT FROM OLD.name)   -- avoids firing on no-op updates
  EXECUTE FUNCTION update_modified_at();
``
::

`WHEN` is evaluated before the function runs; if false, the function is skipped entirely. Use it to avoid firing on no-op updates (`NEW.x IS DISTINCT FROM OLD.x`) — a major performance win on tables with many columns but few changes.

## Trigger Ordering

Multiple triggers on the same table/event fire in **alphabetical order by name** (PostgreSQL). This is a fragile ordering — name your triggers with a prefix that sorts the way you want (`01_validate`, `02_default`, `03_audit`).

## Trigger Pitfalls

1. **Invisible side effects** — a trigger modifies data the application didn't ask for. The application updates `name`; `modified_at` changes silently. Debugging "why did this column change?" becomes a trigger hunt.
2. **Performance** — a trigger fires per row (for `FOR EACH ROW`). A bulk `UPDATE` of a million rows fires the trigger a million times. Use `FOR EACH STATEMENT` with transition tables for bulk operations.
3. **Cascading triggers** — a trigger on table A updates table B, which has a trigger that updates table A... infinite recursion (PostgreSQL has a limit, but the behavior is surprising).
4. **Silent failures** — a trigger that returns `NULL` in a `BEFORE INSERT` silently drops the row. No error, no log — the row just doesn't appear.
5. **Replication** — triggers fire on the source but may or may not fire on replicas (configurable). Logical replication can duplicate effects if triggers fire on both.
6. **Testing** — triggers make "given these SQL statements, the database should be in this state" harder to reason about, because the final state includes trigger side effects.

## When to Use Triggers (and When Not)

**Use triggers for:**
- Audit logging (when you can't change the application).
- Cross-table consistency that constraints can't express (denormalized columns).
- Enforcing rules that span rows/tables (e.g., "no delete if referenced in audit_log").

**Avoid triggers for:**
- Business logic — put it in the application, where it's testable and visible.
- Single-row derivations — use generated columns.
- Referential integrity — use foreign keys.
- Uniqueness — use `UNIQUE` constraints or `EXCLUDE`.
- Anything that could be a constraint — constraints are simpler, visible, and enforced always.

## 💡 Tips & Tricks

- **Idiom**: prefer **constraints over triggers** wherever a constraint can express the rule — constraints are visible in the schema, enforced always (even via `COPY`/bulk load), and don't have the "invisible side effect" problem. Reach for triggers only when no constraint fits (cross-table consistency, audit logging, conditional behavior).
- **Idiom**: use a `WHEN` clause on row triggers to skip no-op updates — `WHEN (NEW IS DISTINCT FROM OLD)` or `WHEN (NEW.col IS DISTINCT FROM OLD.col)` avoids firing the trigger (and its function's overhead) on updates that don't actually change the relevant columns.
- **Performance**: use `FOR EACH STATEMENT` with transition tables (`REFERENCING NEW TABLE AS ...`) for bulk-audit triggers — one function call per statement instead of per row. A million-row `UPDATE` fires a row trigger a million times; a statement trigger fires once with all changed rows in a temp table.
- **Idiom**: name triggers with a numeric prefix (`01_validate`, `02_default`, `03_audit`) to control firing order — PostgreSQL fires same-event triggers alphabetically, so a prefix makes the order explicit and stable.
- **Debug**: when a column changes unexpectedly, query `pg_trigger` to list triggers on the table and check their functions — `SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'customers'::regclass;`.

## ⚠️ Edge Cases & Gotchas

- **`BEFORE` trigger returning `NULL` silently drops the row**: no error, no log — the row just isn't inserted/updated/deleted. A common source of "where did my row go?" debugging. Always return `NEW`/`OLD` from `BEFORE` triggers unless you deliberately want to skip.
- **Triggers fire on `COPY` and bulk loads**: a trigger fires for every row loaded via `COPY`, which can be slow. Disable triggers for bulk loads (`ALTER TABLE x DISABLE TRIGGER all; COPY ...; ALTER TABLE x ENABLE TRIGGER all;`) — but this bypasses constraints too (if you have them as triggers).
- **Trigger recursion**: a trigger on A updates B, whose trigger updates A, whose trigger updates B... PostgreSQL limits recursion depth, but the behavior is surprising. Avoid triggers that modify other tables with their own triggers.
- **`AFTER` triggers can't modify `NEW`**: the row is already written. To transform input, use a `BEFORE` trigger.
- **Statement-level triggers and `NEW`/`OLD`**: not available — use transition tables (`REFERENCING NEW TABLE AS ...`).
- **`TRUNCATE` triggers**: `TRUNCATE` is statement-level only (no row-level trigger). `FOR EACH STATEMENT` on `TRUNCATE` is supported.
- **Firing order is alphabetical by name**: not definition order. Rename a trigger and the order changes. Use a numeric prefix for explicit ordering.
- **Disabled triggers**: `ALTER TABLE x DISABLE TRIGGER name` (or `all` / `user` / `replica`) suspends a trigger. Replicas have `ENABLE REPLICA` / `ENABLE ALWAYS` modes controlling whether triggers fire on replicas.
- **Trigger functions vs regular functions**: trigger functions return `trigger` (not a regular type) and don't take arguments (use `TG_ARGV`). They're invoked only via triggers, not directly.
- **`WHEN` clause can't use subqueries or volatile functions**: it must be a simple expression on `NEW`/`OLD`. For complex conditions, put the check inside the function.

## 🧠 Spot the Bug

A developer adds a trigger to set `modified_at` on every update, but notices that `modified_at` changes even when the update didn't actually change any data (`UPDATE customers SET name = name WHERE id = 1`). Why, and how do you fix it?

::code-wrapper{language="sql"}
```sql
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_at();
``
::

<details>
<summary>Answer</summary>

The trigger fires on every `UPDATE` statement that matches a row, regardless of whether the new values differ from the old values. `UPDATE customers SET name = name WHERE id = 1` is still an `UPDATE` — the row is updated (a new row version is written in MVCC), and the `BEFORE UPDATE` trigger fires, setting `modified_at = now()` even though the data is identical.

The fix — add a `WHEN` clause that skips the trigger when nothing actually changed:

```sql
CREATE TRIGGER touch_modified_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  WHEN (NEW IS DISTINCT FROM OLD)   -- only fire if something actually changed
  EXECUTE FUNCTION update_modified_at();
```
::
`NEW IS DISTINCT FROM OLD` is false when the new and old rows are identical (it's NULL-safe, unlike `NEW <> OLD`), so the trigger skips no-op updates. This avoids spurious `modified_at` bumps and saves the function-call overhead on updates that don't change anything.

**The lesson**: `UPDATE` fires the trigger even if no columns changed — PostgreSQL writes a new row version regardless (MVCC). Use `WHEN (NEW IS DISTINCT FROM OLD)` to make "modified_at" reflect actual modifications, not statement execution.

</details>

## Summary

You can now create `BEFORE`/`AFTER` row and statement triggers, use `NEW`/`OLD`/`TG_*` variables, build audit logs and derived-column triggers, optimize with `WHEN` clauses and transition tables, and know when to prefer constraints over triggers. Next: stored procedures and functions.