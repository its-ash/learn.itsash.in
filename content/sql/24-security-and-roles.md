# 24 — Security, Roles & Permissions

Database security is about **least privilege**: every role gets exactly the access it needs, no more. Over-broad grants are how data leaks happen. This chapter covers roles, grants, Row-Level Security, and the patterns for multi-tenant isolation.

## Roles (not just users)

PostgreSQL uses **roles** for both users and groups. A role that can log in is a "user"; a role that can't is a "group." The distinction is just the `LOGIN` attribute.

::code-wrapper{language="sql"}
```sql
-- A login role (a "user")
CREATE ROLE alice LOGIN PASSWORD 'secret';

-- A group role (no LOGIN)
CREATE ROLE analytics_team;

-- Add alice to the group
GRANT analytics_team TO alice;

-- Grant privileges to the group; members inherit them
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO analytics_team;
``
::

Members of a group inherit its privileges (by default — `INHERIT` is the default). Use group roles to manage access by team/function, not per-user.

## Privileges

The core privileges:

| Privilege | On | Meaning |
|---|---|---|
| `SELECT` | Table, view | Read rows. |
| `INSERT` | Table | Insert rows. |
| `UPDATE` | Table | Update rows. |
| `DELETE` | Table | Delete rows. |
| `TRUNCATE` | Table | Truncate. |
| `REFERENCES` | Table | Create FK to this table. |
| `TRIGGER` | Table | Create triggers. |
| `CREATE` | Schema, database | Create objects. |
| `CONNECT` | Database | Connect to it. |
| `USAGE` | Schema, sequence | Use the schema / `nextval` the sequence. |
| `EXECUTE` | Function | Call it. |
| `ALL PRIVILEGES` | — | All applicable privileges. |

## GRANT and REVOKE

::code-wrapper{language="sql"}
```sql
-- Grant on a specific table
GRANT SELECT, INSERT ON orders TO alice;
GRANT SELECT ON orders TO alice WITH GRANT OPTION;   -- alice can grant SELECT to others

-- Grant on all current tables in a schema
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_team;

-- Grant on future tables (default privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO analytics_team;

-- Revoke
REVOKE INSERT ON orders FROM alice;

-- Grant column-level (subset of columns)
GRANT SELECT (id, name, city) ON customers TO analytics_team;
``
::

### `WITH GRANT OPTION`

A grant with `WITH GRANT OPTION` lets the grantee grant that privilege to others. This spreads authorization power — use sparingly. Without it, only the object owner (or a superuser) can grant.

### Default privileges

`GRANT ... ON ALL TABLES` applies to *existing* tables. `ALTER DEFAULT PRIVILEGES` applies to tables created *in the future* by a specified role. Use both to keep access consistent as the schema grows.

## Column-Level Privileges

::code-wrapper{language="sql"}
```sql
-- analytics can see only id, name, city — not salary
GRANT SELECT (id, name, city) ON employees TO analytics_team;
``
::

Column-level grants work but are fiddly — a view (chapter 16) is usually a cleaner way to expose a subset of columns. Views also let you filter rows, which column privileges can't.

## Row-Level Security (RLS)

RLS restricts which rows a role can see/modify, based on policies — database-enforced, can't be bypassed by the application (unless the role has `BYPASSRLS`).

::code-wrapper{language="sql"}
```sql
-- Enable RLS on the orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- By default, policies are restrictive (deny all) unless you add a policy.
-- Allow users to see only their own orders
CREATE POLICY own_orders ON orders
  FOR SELECT
  TO authenticated_users
  USING (user_id = current_user_id());   -- custom function returning the current user's id

-- Allow users to insert only their own orders
CREATE POLICY insert_own_orders ON orders
  FOR INSERT
  TO authenticated_users
  WITH CHECK (user_id = current_user_id());

-- Allow updates only on own orders, and only to shipped status
CREATE POLICY update_own_orders ON orders
  FOR UPDATE
  TO authenticated_users
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());
``
::

- `USING` — the predicate for `SELECT`/`UPDATE`/`DELETE` (which rows are visible).
- `WITH CHECK` — the predicate for `INSERT`/`UPDATE` (which new rows are allowed).
- Multiple policies combine with `OR` (permissive) by default; `AS RESTRICTIVE` policies combine with `AND`.

### RLS and the table owner

By default, the **table owner bypasses RLS**. To enforce RLS on the owner too:

::code-wrapper{language="sql"}
```sql
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
``
::

Superusers always bypass RLS — don't run your app as a superuser.

### RLS and performance

RLS policies are predicates added to every query. A policy like `user_id = current_user_id()` is efficient if `user_id` is indexed. A policy with a subquery (`EXISTS (SELECT 1 FROM ... WHERE ...)`) runs per row and can be slow — index the columns the policy uses.

## Multi-Tenant Isolation with RLS

The canonical multi-tenant pattern: every row has a `tenant_id`, and RLS enforces that a session can only see rows for its tenant:

::code-wrapper{language="sql"}
```sql
-- Every tenant-scoped table has a tenant_id column
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- A session sets its tenant via a custom function or session variable
CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant')::bigint);

-- The app sets the tenant at the start of each request:
SET app.current_tenant = '42';
SELECT * FROM orders;   -- only sees orders where tenant_id = 42
``
::

`current_setting('app.current_tenant')` reads a custom session variable. The app sets it per request (after authenticating the user). RLS ensures no query can leak data across tenants, even if the application has a bug.

**Critical**: the app's database user must not be a superuser or the table owner (both bypass RLS). Use a dedicated app role with `BYPASSRLS` off.

## Principle of Least Privilege

Guidelines:
1. **One role per app per database** — don't run multiple apps as the same role.
2. **No superuser in app code** — superuser bypasses RLS and all checks. Use a limited role.
3. **Revoke `PUBLIC` grants** — by default, some objects are accessible to `PUBLIC` (all roles). Revoke and grant explicitly.
4. **Use views for limited exposure** — grant on the view, revoke on the base table.
5. **Separate read and write roles** — analytics gets `SELECT` only; the app gets `SELECT`/`INSERT`/`UPDATE`.
6. **Rotate passwords** — use `ALTER ROLE ... PASSWORD ...` and update secrets.

## Auditing

Track who did what:

::code-wrapper{language="sql"}
```sql
-- PostgreSQL's pgAudit extension (if installed)
CREATE EXTENSION pgaudit;
ALTER SYSTEM SET pgaudit.log = 'write, ddl';

-- Or a custom audit trigger (chapter 21)
-- Or query pg_stat_activity for current sessions
SELECT pid, usename, application_name, query, state, query_start
FROM pg_stat_activity
WHERE state = 'active';
``
::

## 💡 Tips & Tricks

- **Idiom**: use **group roles** for access management — `GRANT analytics_team TO alice`, `GRANT SELECT ON ... TO analytics_team`. Adding/removing a user is `GRANT`/`REVOKE` of the group role, not per-table grants. Group roles make access management O(teams) instead of O(users × tables).
- **Idiom**: use **RLS for multi-tenant isolation** — a `tenant_id` column + an RLS policy (`USING tenant_id = current_setting('app.tenant')::bigint`) enforces isolation at the database level, immune to application bugs. The app sets `app.tenant` per request; every query is automatically scoped.
- **Idiom**: run the application as a **dedicated role with minimal privileges** (no superuser, no `BYPASSRLS`, `SELECT`/`INSERT`/`UPDATE` only on needed tables) — if the app is compromised, the blast radius is limited to what the role can do, not the whole database.
- **Idiom**: use `ALTER DEFAULT PRIVILEGES` to grant on future tables — `GRANT ON ALL TABLES` covers existing tables only; without default privileges, every new table is invisible to non-owner roles until you grant on it. Pair both for consistent access.
- **Security**: revoke `PUBLIC` grants on databases/schemas/functions you don't want globally accessible — PostgreSQL grants some access to `PUBLIC` by default (e.g., `CONNECT` on databases, `EXECUTE` on functions). Audit with `\dp+` and `\df+` in `psql`.

## ⚠️ Edge Cases & Gotchas

- **Table owner bypasses RLS**: by default, the owner of a table isn't subject to RLS policies. Use `FORCE ROW LEVEL SECURITY` to enforce RLS on the owner too. Superusers always bypass.
- **`BYPASSRLS`**: a role with `BYPASSRLS` ignores all RLS policies. Don't grant `BYPASSRLS` to app roles. Reserve it for migrations/admin.
- **RLS policies combine with `OR` (permissive) by default**: multiple permissive policies are OR'd — a row visible to *any* policy is visible. `AS RESTRICTIVE` policies AND with the permissive result. Understand the combination before stacking policies.
- **`USING` vs `WITH CHECK`**: `USING` filters visible rows (SELECT/UPDATE/DELETE); `WITH CHECK` validates new/updated rows (INSERT/UPDATE). An UPDATE policy should usually have both — `USING` (can see this row) and `WITH CHECK` (can change it to this value).
- **Column-level grants are inconvenient**: a view is usually a cleaner way to expose a column subset. Column grants also don't restrict rows — combine with RLS for row + column restrictions.
- **`GRANT ... ON ALL TABLES` is a snapshot**: it applies to tables existing at grant time. New tables need `ALTER DEFAULT PRIVILEGES` or an explicit grant.
- **`WITH GRANT OPTION` spreads authorization**: a grantee with `WITH GRANT OPTION` can grant to others — including to roles you didn't intend. Avoid unless necessary.
- **RLS and performance**: policy predicates are added to every query. A subquery-based policy (`EXISTS (SELECT ...)`) runs per row — index the columns it uses, or rewrite as a join.
- **`current_setting` errors if unset**: `current_setting('app.tenant')` errors if the variable isn't set. Use `current_setting('app.tenant', true)` to return NULL instead (then handle NULL in the policy).
- **Roles aren't dropped with their objects**: `DROP ROLE alice` fails if alice owns objects. Reassign ownership first: `REASSIGN OWNED BY alice TO bob; DROP OWNED BY alice; DROP ROLE alice;`.
- **`PUBLIC` is a role**: `PUBLIC` represents all roles. Grants to `PUBLIC` apply to everyone. Revoking from `PUBLIC` is how you remove default access.

## 🧠 Spot the Bug

A team enables RLS for multi-tenant isolation, but users report seeing data from other tenants. The RLS policy is correct. What's the likely cause?

::code-wrapper{language="sql"}
```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::bigint);

-- The app connects as the table owner (a single "app" role that owns all tables)
-- and sets app.current_tenant per request.
```
::

<details>
<summary>Answer</summary>

The app connects as the **table owner**, and by default, the **table owner bypasses RLS**. So the `tenant_isolation` policy never applies — the app role sees all rows, regardless of `app.current_tenant`.

Two fixes:

```sql
-- Option 1: force RLS on the owner too
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
-- Now the owner is subject to the policies (but superusers still bypass).

-- Option 2 (better): the app should connect as a non-owner role
-- The owner role creates the schema; a separate app role (with grants, no ownership) runs queries.
-- Then RLS applies to the app role automatically.
```

Option 2 is the principled fix — the app role shouldn't own the tables (ownership is for migrations/schema management; the app role is for data access). With a separate app role that has `SELECT`/`INSERT`/`UPDATE` grants but not ownership, RLS applies automatically, and `FORCE ROW LEVEL SECURITY` isn't needed.

Also check: is the app role a superuser, or does it have `BYPASSRLS`? Both bypass RLS. The app role must be a regular role with no bypass privileges.

**The lesson**: RLS doesn't apply to the table owner (by default) or superusers. For multi-tenant isolation, the app must connect as a non-owner, non-superuser role without `BYPASSRLS` — or you must `FORCE ROW LEVEL SECURITY` on every tenant-scoped table.

</details>

## Summary

You can now create roles and groups, grant/revoke privileges (table, column, schema, default), enforce row-level security with policies, isolate tenants with `tenant_id` + RLS + session variables, and follow least-privilege principles — knowing that owners and superusers bypass RLS. Next: normalization and data modeling.