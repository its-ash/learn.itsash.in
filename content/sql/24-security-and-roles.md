---
title: "24 — Security, Roles & Permissions"
description: "Roles vs users (LOGIN), group roles, GRANT/REVOKE, privilege table, DEFAULT PRIVILEGES for future objects, column-level privileges, Row-Level Security with multi-tenant isolation, BYPASSRLS, search_path hijacking — code-first reference with a multi-tenant SaaS security model and anti-patterns for over-broad grants and superuser app connections."
---

# 24 — Security, Roles & Permissions

Database security is **least privilege**: every role gets exactly the access it needs, no more. Over-broad grants (`GRANT ALL`), superuser app connections, and missing `DEFAULT PRIVILEGES` are how data leaks and breaches happen. PostgreSQL's security model is role-based with table/column/row-level granularity.

## Roles — users and groups are the same thing

PostgreSQL uses **roles** for both users and groups. A role with the `LOGIN` attribute is a "user" (can connect); without `LOGIN`, it's a "group" (exists only for privilege inheritance).

::code-wrapper{language="sql"}
```sql
-- A login role (a "user") — has LOGIN + PASSWORD
CREATE ROLE alice LOGIN PASSWORD 'secret_passphrase_here';

-- A group role (no LOGIN) — exists only for privilege inheritance
CREATE ROLE analytics_team;

-- Add alice to the group (alice INHERITS the group's privileges by default)
GRANT analytics_team TO alice;

-- Grant privileges to the GROUP, not to alice directly
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO analytics_team;
-- Now alice inherits SELECT on reporting tables via analytics_team.
-- To remove alice's access: REVOKE analytics_team FROM alice (one command,
-- not per-table). This is O(teams) management, not O(users × tables).
```
::

### Role attributes

::code-wrapper{language="sql"}
```sql
CREATE ROLE app_user LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
-- LOGIN: can connect
-- SUPERUSER: bypasses ALL permission checks (dangerous — avoid for apps)
-- CREATEDB: can create databases
-- CREATEROLE: can create/drop roles
-- REPLICATION: can stream replication
-- BYPASSRLS: bypasses Row-Level Security (dangerous for app roles)
-- CONNECTION LIMIT n: max concurrent connections for this role
-- VALID UNTIL 'timestamp': password expiry

ALTER ROLE app_user CONNECTION LIMIT 50;          -- pool size cap
ALTER ROLE alice VALID UNTIL '2026-12-31';        -- password expires
ALTER ROLE alice PASSWORD 'new_passphrase';       -- rotate password
```
::

## Privileges — the complete table

| Privilege | Object | Meaning |
|---|---|---|
| `SELECT` | Table, view, column | Read rows (or specific columns) |
| `INSERT` | Table, column | Insert rows |
| `UPDATE` | Table, column | Update rows |
| `DELETE` | Table | Delete rows |
| `TRUNCATE` | Table | Truncate the table |
| `REFERENCES` | Table, column | Create FK to this table/column |
| `TRIGGER` | Table | Create triggers on this table |
| `CREATE` | Schema, database | Create objects in it |
| `CONNECT` | Database | Connect to the database |
| `TEMPORARY` | Database | Create temp tables |
| `USAGE` | Schema, sequence, FDW, type | Use the schema / `nextval` / connect / use type |
| `EXECUTE` | Function, procedure | Call it |
| `MAINTAIN` | Table (PG 17+) | Run VACUUM, ANALYZE, etc. |

## GRANT and REVOKE

::code-wrapper{language="sql"}
```sql
-- Grant on a specific table
GRANT SELECT, INSERT, UPDATE ON orders TO app_role;
-- app_role can read, insert, and update orders, but NOT delete or truncate

-- Grant with GRANT OPTION: the grantee can grant this privilege to others
GRANT SELECT ON orders TO alice WITH GRANT OPTION;
-- alice can now: GRANT SELECT ON orders TO bob;
-- Use sparingly — this spreads authorization power unpredictably.

-- Grant on all current tables in a schema (snapshot — applies to EXISTING tables only)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_team;

-- Grant on all sequences in a schema
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
-- USAGE: needed for nextval(). SELECT: needed for currval().
-- Without USAGE on the sequence, INSERT into a table with a SERIAL/IDENTITY
-- column fails — the user can't call nextval on the sequence.

-- Revoke
REVOKE INSERT ON orders FROM app_role;
REVOKE ALL ON orders FROM app_role;           -- remove all privileges
REVOKE SELECT ON orders FROM alice CASCADE;   -- also revokes grants alice made
```
::

## DEFAULT PRIVILEGES — grants on future objects

::code-wrapper{language="sql"}
```sql
-- GRANT ON ALL TABLES applies to EXISTING tables only. New tables created
-- after the grant are NOT covered — the creator owns them, and no one else
-- has access until you grant explicitly. This is a common "new table is
-- invisible to the app" bug.

-- DEFAULT PRIVILEGES: grants that apply to FUTURE objects created by a
-- specified role. The most important security pattern in PostgreSQL.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_role;

-- Now any table created in `public` by the role (specified implicitly as
-- current_user) automatically gets these grants. No more "forgot to grant
-- on the new table" outages.

-- Per-creator: DEFAULT PRIVILEGES are scoped to the creator.
-- If alice and bob both create tables, you need DEFAULT PRIVILEGES
-- for EACH creator:
ALTER DEFAULT PRIVILEGES FOR ROLE alice IN SCHEMA public
  GRANT SELECT ON TABLES TO analytics_team;
ALTER DEFAULT PRIVILEGES FOR ROLE bob IN SCHEMA public
  GRANT SELECT ON TABLES TO analytics_team;
-- Or: use a single migration role that creates all tables, and set
-- DEFAULT PRIVILEGES for that role only.
```
::

## Column-Level Privileges — PII protection

::code-wrapper{language="sql"}
```sql
-- Grant access to only some columns (protect PII like salary, ssn)
GRANT SELECT (id, name, email, department) ON employees TO analytics_team;
-- analytics_team can SELECT id, name, email, department but NOT salary, ssn.
-- SELECT * FROM employees → ERROR: permission denied for table employees
-- SELECT id, name FROM employees → OK

-- Column-level grants are fiddly:
-- 1. SELECT * is denied (it includes un-granted columns)
-- 2. Views are usually a cleaner alternative (expose only safe columns)
-- 3. Column grants don't restrict ROWS — combine with RLS for row + column
```
::

## Row-Level Security (RLS) — database-enforced row filtering

RLS adds a predicate to every query on a table. It's database-enforced — the application can't bypass it (unless the role has `BYPASSRLS` or is the table owner/superuser).

::code-wrapper{language="sql"}
```sql
-- Enable RLS on the orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- By default: NO policies exist → ALL access is DENIED (deny-by-default).
-- Without a policy, even the table owner can't SELECT (unless FORCE RLS
-- is off — the owner bypasses by default, see below).

-- A SELECT policy: users can see only their own orders
CREATE POLICY own_orders ON orders
  FOR SELECT
  TO authenticated_users                    -- applies to this role only
  USING (user_id = current_setting('app.user_id')::bigint);
  -- USING: the predicate added to SELECT/UPDATE/DELETE.
  -- Every SELECT on orders gets: WHERE user_id = current_setting('app.user_id')
  -- The user CANNOT see rows where user_id doesn't match — enforced by the DB.

-- An INSERT policy: users can insert only their own orders
CREATE POLICY insert_own_orders ON orders
  FOR INSERT
  TO authenticated_users
  WITH CHECK (user_id = current_setting('app.user_id')::bigint);
  -- WITH CHECK: the predicate validated on INSERT/UPDATE.
  -- A user can't insert an order with a different user_id.

-- An UPDATE policy: users can update only their own orders
CREATE POLICY update_own_orders ON orders
  FOR UPDATE
  TO authenticated_users
  USING (user_id = current_setting('app.user_id')::bigint)         -- can SEE the row
  WITH CHECK (user_id = current_setting('app.user_id')::bigint);   -- can SET these values
  -- USING: which rows are visible (the user can only update rows they can see)
  -- WITH CHECK: what the new values can be (can't reassign to another user)

-- A DELETE policy: users can delete only their own orders
CREATE POLICY delete_own_orders ON orders
  FOR DELETE
  TO authenticated_users
  USING (user_id = current_setting('app.user_id')::bigint);
  -- DELETE uses USING (which rows are visible for deletion). No WITH CHECK.
```
::

### USING vs WITH CHECK — the two predicates

| Command | `USING` (visibility) | `WITH CHECK` (validation) |
|---|---|---|
| `SELECT` | ✓ (filters visible rows) | — |
| `UPDATE` | ✓ (can only update visible rows) | ✓ (new row must pass) |
| `DELETE` | ✓ (can only delete visible rows) | — |
| `INSERT` | — | ✓ (new row must pass) |

For `UPDATE`, you need BOTH: `USING` (can see this row) and `WITH CHECK` (can change it to this value). Without `WITH CHECK`, a user could update their row's `user_id` to someone else's — a privilege escalation.

### Policy combination — permissive (OR) vs restrictive (AND)

::code-wrapper{language="sql"}
```sql
-- Multiple permissive policies (default) combine with OR:
-- a row visible to ANY permissive policy is visible.
CREATE POLICY p1 ON orders FOR SELECT USING (status = 'active');
CREATE POLICY p2 ON orders FOR SELECT USING (user_id = 42);
-- Visible rows: status='active' OR user_id=42

-- AS RESTRICTIVE policies combine with AND:
-- a row must pass ALL restrictive policies (in addition to the permissive OR).
CREATE POLICY restrict_active_tenant ON orders
  FOR SELECT
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.tenant')::bigint);
-- Visible rows: (status='active' OR user_id=42) AND tenant_id=current_tenant
-- Use RESTRICTIVE for guard-rail policies (tenant isolation, soft-delete filter)
-- that should AND with everything else.
```
::

### Table owner and superuser bypass

::code-wrapper{language="sql"}
```sql
-- By DEFAULT, the table OWNER bypasses RLS policies.
-- Superusers ALWAYS bypass RLS (can't be changed).
-- To enforce RLS on the owner too:
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
-- Now the owner is subject to policies. Superusers still bypass.

-- BYPASSRLS attribute: a role with BYPASSRLS ignores all RLS policies
CREATE ROLE admin_role LOGIN BYPASSRLS;
-- Don't grant BYPASSRLS to app roles — it defeats the purpose of RLS.
-- Reserve for migration/admin roles that need to see all rows.
```
::

## Complex Implementation — Multi-Tenant SaaS Security Model

A complete multi-tenant security model: group roles for team management, default privileges for future-proofing, RLS policies for tenant isolation via session variables, a read-only analytics role, and a service role with limited access.

::code-wrapper{language="sql"}
```sql
-- ── 1. Group roles for team-based access ────────────────────────
CREATE ROLE tenant_app_role;        -- app connections (read/write tenant data)
CREATE ROLE tenant_readonly;        -- analytics (read-only)
CREATE ROLE tenant_migrator;        -- schema migrations (DDL, no BYPASSRLS)

-- ── 2. The app role (non-owner, non-superuser, no BYPASSRLS) ────
-- CRITICAL: the app role must NOT own the tables (owners bypass RLS)
-- and must NOT be a superuser or have BYPASSRLS.
CREATE ROLE app_connection LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
GRANT tenant_app_role TO app_connection;
-- app_connection inherits tenant_app_role's privileges.

-- ── 3. Schema and tenant-scoped tables ──────────────────────────
CREATE SCHEMA IF NOT EXISTS tenant_data;

CREATE TABLE tenant_data.orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,                -- the tenant scope column
  customer_id BIGINT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_data.customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  email TEXT
);

-- Index the tenant_id column (RLS policies filter on it → needs an index)
CREATE INDEX orders_tenant_idx ON tenant_data.orders(tenant_id);
CREATE INDEX customers_tenant_idx ON tenant_data.customers(tenant_id);

-- ── 4. Enable RLS on all tenant-scoped tables ───────────────────
ALTER TABLE tenant_data.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.customers ENABLE ROW LEVEL SECURITY;
-- Force RLS on the owner too (in case the migrator role owns the tables):
ALTER TABLE tenant_data.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.customers FORCE ROW LEVEL SECURITY;

-- ── 5. RLS policy: tenant isolation via session variable ────────
-- The app sets app.current_tenant at the start of each request.
-- RLS ensures no query can leak data across tenants.
CREATE POLICY tenant_isolation ON tenant_data.orders
  FOR ALL
  TO tenant_app_role
  USING (tenant_id = current_setting('app.current_tenant', true)::bigint)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::bigint);
-- current_setting('app.current_tenant', true) returns NULL if unset
-- (the `true` arg suppresses the error). NULL::bigint → NULL → no rows match
-- → deny-by-default when the tenant isn't set. Safe.

CREATE POLICY tenant_isolation_customers ON tenant_data.customers
  FOR ALL
  TO tenant_app_role
  USING (tenant_id = current_setting('app.current_tenant', true)::bigint)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::bigint);

-- ── 6. Table-level grants ───────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant_data TO tenant_app_role;
GRANT SELECT ON ALL TABLES IN SCHEMA tenant_data TO tenant_readonly;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tenant_data TO tenant_app_role;

-- ── 7. DEFAULT PRIVILEGES for future tables ─────────────────────
-- The migrator role creates future tables. Set defaults so the app role
-- automatically gets access to new tables.
ALTER DEFAULT PRIVILEGES FOR ROLE tenant_migrator IN SCHEMA tenant_data
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_app_role;
ALTER DEFAULT PRIVILEGES FOR ROLE tenant_migrator IN SCHEMA tenant_data
  GRANT SELECT ON TABLES TO tenant_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE tenant_migrator IN SCHEMA tenant_data
  GRANT USAGE, SELECT ON SEQUENCES TO tenant_app_role;

-- ── 8. Usage: the app sets the tenant per request ───────────────
-- App code (after authenticating the user, determining their tenant):
--   SET app.current_tenant = '42';
--   SELECT * FROM tenant_data.orders;  -- only sees orders where tenant_id=42
--   INSERT INTO tenant_data.orders (tenant_id, ...) VALUES (42, ...);  -- OK
--   INSERT INTO tenant_data.orders (tenant_id, ...) VALUES (99, ...);  -- ERROR (WITH CHECK fails)
-- Even if the app has a bug (e.g., missing WHERE tenant_id=?), RLS prevents
-- cross-tenant data access. The database enforces it, not the application.
```
::

## Anti-Pattern: GRANT ALL PRIVILEGES to Every Role

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: granting everything to everyone
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
-- ALL PRIVILEGES includes TRUNCATE, REFERENCES, TRIGGER — none of which
-- the app needs. PUBLIC means EVERY role. This is how data gets deleted
-- by a role that should only read.

-- ✅ RIGHT: grant exactly what's needed, to specific roles
GRANT SELECT, INSERT, UPDATE ON orders TO app_role;  -- no DELETE, no TRUNCATE
GRANT SELECT ON orders TO analytics_role;             -- read-only
-- Principle of least privilege: if the app doesn't need DELETE, don't grant it.
```
::

## Anti-Pattern: Superuser for Application Connections

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: app connects as superuser
-- Connection string: postgresql://superuser:pass@host/db
-- A single SQL injection → full database compromise.
-- Superuser bypasses RLS, all permission checks, can DROP databases,
-- can read pg_shadow (password hashes), can execute OS commands via
-- COPY TO PROGRAM, can create SECURITY DEFINER functions as any role.

-- ✅ RIGHT: app connects as a dedicated role with minimal privileges
CREATE ROLE app_role LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE mydb TO app_role;
GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_role;
-- If compromised: the attacker can read/insert/update app tables.
-- They CANNOT drop the database, read password hashes, bypass RLS,
-- or escalate to other roles. Blast radius is limited.
```
::

## PUBLIC Role — revoke default access

::code-wrapper{language="sql"}
```sql
-- PUBLIC is a pseudo-role that represents ALL roles.
-- PostgreSQL grants some access to PUBLIC by default:
-- - CONNECT on databases
-- - USAGE on public schema (pre-PG 15)
-- - EXECUTE on all functions

-- Revoke unwanted PUBLIC grants:
REVOKE ALL ON DATABASE mydb FROM PUBLIC;          -- restrict who can connect
GRANT CONNECT ON DATABASE mydb TO app_role;       -- re-grant to specific roles

-- PG 15+: public schema no longer grants CREATE to PUBLIC by default.
-- Pre-PG 15: revoke CREATE to prevent users from creating objects in public:
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Functions are EXECUTE-able by PUBLIC by default. For SECURITY DEFINER
-- functions (which run as the owner), revoke PUBLIC and grant explicitly:
REVOKE EXECUTE ON FUNCTION get_my_salary(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_salary(BIGINT) TO authenticated_users;
```
::

## Inspecting Permissions

::code-wrapper{language="sql"}
```sql
-- List privileges on a table (\dp in psql)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'orders'
ORDER BY grantee, privilege_type;

-- List all roles and their memberships
SELECT r.rolname AS role, m.rolname AS member
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid      -- the group role
JOIN pg_roles m ON m.oid = am.member;     -- the member role

-- Check if a role has a specific privilege
SELECT has_table_privilege('app_role', 'orders', 'SELECT');  -- true/false

-- List RLS policies on a table
SELECT polname, polcmd, polqual, polwithcheck
FROM pg_policy
WHERE polrelid = 'orders'::regclass;
```
::

## Dropping Roles — reassign ownership first

::code-wrapper{language="sql"}
```sql
-- DROP ROLE fails if the role owns objects.
-- Reassign ownership first, then drop:
REASSIGN OWNED BY alice TO bob;    -- transfer alice's objects to bob
DROP OWNED BY alice;               -- drop alice's remaining privileges/objects
DROP ROLE alice;                   -- now safe to drop
```
::

## 💡 Tips & Tricks

- **Idiom**: use **group roles** for access management — `GRANT analytics_team TO alice`, `GRANT SELECT ON ... TO analytics_team`. Adding/removing a user is `GRANT`/`REVOKE` of the group role, not per-table grants. Group roles make access management O(teams) instead of O(users × tables).
- **Idiom**: use **RLS for multi-tenant isolation** — a `tenant_id` column + an RLS policy (`USING tenant_id = current_setting('app.tenant', true)::bigint`) enforces isolation at the database level, immune to application bugs. The app sets `app.tenant` per request; every query is automatically scoped. Use `current_setting(..., true)` to return NULL instead of erroring when unset.
- **Idiom**: run the application as a **dedicated non-owner role** with minimal privileges (no superuser, no `BYPASSRLS`, `SELECT`/`INSERT`/`UPDATE` only on needed tables). The table owner and superuser bypass RLS — if the app connects as the owner, RLS is useless. Separate the migration role (owns tables, runs DDL) from the app role (data access, subject to RLS).
- **Idiom**: use `ALTER DEFAULT PRIVILEGES` to grant on future tables — `GRANT ON ALL TABLES` covers existing tables only; without default privileges, every new table is invisible to the app until you grant on it (a common "new table 403" outage). Set `DEFAULT PRIVILEGES FOR ROLE <migrator>` so tables created by the migration role auto-grant to the app role.
- **Security**: revoke `PUBLIC` grants on databases, schemas, and `SECURITY DEFINER` functions — PostgreSQL grants `CONNECT` on databases and `EXECUTE` on functions to `PUBLIC` by default. Revoke and grant explicitly to specific roles. Audit with `\dp+` and `\df+` in `psql`.
- **Security**: use a separate **read-only role** for analytics/reporting — `GRANT SELECT ON ... TO analytics_role`. Dashboards and BI tools connect as this role, preventing accidental writes. Combined with RLS, this limits both what analytics can see (rows) and what they can do (read only).
- **Idiom**: use column-level privileges for PII protection — `GRANT SELECT (id, name, city) ON employees TO analytics_team` hides `salary`, `ssn`. For more complex column subsets or row filtering, use a view (cleaner, supports row filtering, can compute derived columns).
- **Security**: use `pg_hba.conf` for connection-level security — restrict which IPs can connect, which databases, which roles, and enforce TLS. The database can't help if anyone can connect as any role from any IP.

## ⚠️ Edge Cases & Gotchas

- **Table owner bypasses RLS**: by default, the owner of a table isn't subject to RLS policies. Use `ALTER TABLE ... FORCE ROW LEVEL SECURITY` to enforce RLS on the owner. Superusers always bypass (can't be changed). This is the #1 RLS bug: the app connects as the table owner, RLS silently doesn't apply.
- **`BYPASSRLS`**: a role with `BYPASSRLS` ignores all RLS policies. Don't grant `BYPASSRLS` to app roles. Reserve for migration/admin roles that need to see all rows. Only superusers can set `BYPASSRLS`.
- **RLS on views requires `security_barrier`**: a view over an RLS-protected table doesn't automatically prevent the view's caller from pushing predicates that leak information (e.g., a `WHERE` that errors on rows from other tenants). Create the view with `security_barrier`: `CREATE VIEW my_view WITH (security_barrier) AS SELECT ...`. This prevents predicate pushdown past the view's boundary.
- **`DEFAULT PRIVILEGES` scope is per-creator**: `ALTER DEFAULT PRIVILEGES FOR ROLE alice` applies only to tables created by alice. If bob creates a table, alice's defaults don't apply. Use a single migration role for all DDL, or set defaults for every role that creates objects.
- **`GRANT ON ALL TABLES` is a snapshot**: it applies to tables existing at grant time. New tables need `ALTER DEFAULT PRIVILEGES` or an explicit grant. This is the "new table is invisible to the app" bug.
- **`WITH GRANT OPTION` spreads authorization**: a grantee with `WITH GRANT OPTION` can grant to others — including roles you didn't intend. Avoid unless necessary. Use `REVOKE ... CASCADE` to undo a grant and all grants derived from it.
- **`PUBLIC` is a role**: `PUBLIC` represents all roles. Grants to `PUBLIC` apply to everyone (including future roles). Revoking from `PUBLIC` is how you remove default access (CONNECT on databases, EXECUTE on functions).
- **Roles aren't dropped with their objects**: `DROP ROLE alice` fails if alice owns objects. `REASSIGN OWNED BY alice TO bob; DROP OWNED BY alice; DROP ROLE alice;` reassigns ownership, drops remaining privileges, then drops the role.
- **Privilege inheritance with `INHERIT`/`NO INHERIT`**: by default, roles have `INHERIT` — a member of a group automatically has the group's privileges. With `NO INHERIT`, the member must `SET ROLE group_name` to use the group's privileges. Use `NO INHERIT` for roles that should have explicit privilege activation (auditing).
- **`current_setting` errors if unset**: `current_setting('app.tenant')` raises an error if the variable isn't set. Use `current_setting('app.tenant', true)` to return NULL instead. Handle NULL in the policy (NULL::bigint → no rows match → deny-by-default).
- **Password in connection strings**: passwords in `postgresql://user:pass@host/db` are visible in `ps` output, logs, and error messages. Use `PGPASSWORD` env var, `.pgpass` file, or connection pools with server-side auth. Never commit connection strings to git.
- **`ALTER DEFAULT PRIVILEGES` doesn't retroactively apply**: it affects only objects created AFTER the ALTER. Existing objects need an explicit `GRANT ON ALL TABLES`. Use both together for complete coverage.
- **Sequence permissions are separate from table permissions**: `GRANT INSERT ON table` does NOT grant `USAGE` on the table's sequence. A role that can INSERT but can't `nextval` the sequence gets an error. `GRANT USAGE, SELECT ON SEQUENCE seq TO role` explicitly.

## 🧠 Spot the Bug

A team enables RLS for multi-tenant isolation, but users report seeing data from other tenants. The RLS policy is correct. The setup:

::code-wrapper{language="sql"}
```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::bigint);

-- The app connects as the table owner (a single "app" role that owns all tables)
-- and sets app.current_tenant per request.
-- Connection: postgresql://app_owner:pass@host/db
```
::

<details>
<summary>Answer</summary>

The app connects as the **table owner**, and by default, the **table owner bypasses RLS**. So the `tenant_isolation` policy never applies — the app role sees all rows, regardless of `app.current_tenant`. Users see data from all tenants.

Two fixes:

::code-wrapper{language="sql"}
```sql
-- Option 1: force RLS on the owner too
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
-- Now the owner is subject to policies. But superusers still bypass.

-- Option 2 (BETTER): the app should connect as a NON-OWNER role.
-- The owner role creates the schema (migrations); a separate app role
-- (with grants, no ownership) runs queries. RLS applies to the app role.
CREATE ROLE app_connection LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO app_connection;
-- Now the app connects as app_connection (not the owner).
-- RLS applies automatically. FORCE RLS isn't needed.
```
::

Option 2 is the principled fix — the app role shouldn't own the tables. Ownership is for migrations/schema management; the app role is for data access. With a separate app role that has grants but not ownership, RLS applies automatically.

Also check: is the app role a superuser, or does it have `BYPASSRLS`? Both bypass RLS. The app role must be a regular role with no bypass privileges.

**The lesson**: RLS doesn't apply to the table owner (by default) or superusers. For multi-tenant isolation, the app must connect as a non-owner, non-superuser role without `BYPASSRLS` — or you must `FORCE ROW LEVEL SECURITY` on every tenant-scoped table.

</details>