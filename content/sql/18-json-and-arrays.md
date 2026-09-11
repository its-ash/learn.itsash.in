# 18 — JSON & Array Columns

PostgreSQL has first-class support for semi-structured data: `JSONB` (binary JSON) and array columns. This lets you store variable-structure data (event payloads, user preferences, nested objects) without a separate document database, while keeping relational power for the rest of the schema.

---

## JSON vs JSONB

| Property | `json` | `jsonb` |
|---|---|---|
| Storage | Raw text (as input) | Decomposed binary |
| Indexing | Limited (expression indexes only) | Full GIN, expression, partial |
| Key deduplication | No (duplicate keys preserved) | Yes (last value wins) |
| Preserves key order | ✅ Yes | ❌ No (keys sorted) |
| Preserves whitespace | ✅ Yes | ❌ No |
| Query speed | Slower (re-parsed each time) | Faster (pre-parsed binary) |
| Write speed | Faster (no parsing) | Slower (parse to binary) |

**Use `jsonb`** for almost everything — it's indexable, faster to query, and deduplicates keys. Use `json` only when you need to preserve the exact input (key order, duplicate keys, whitespace) — rare.

::code-wrapper{language="sql"}
```sql
-- jsonb deduplicates keys (last wins), json preserves duplicates
SELECT '{"a": 1, "a": 2}'::json;     -- {"a": 1, "a": 2}  (both keys preserved)
SELECT '{"a": 1, "a": 2}'::jsonb;    -- {"a": 2}           (last value wins)

-- jsonb sorts keys, json preserves input order
SELECT '{"b": 1, "a": 2}'::json;     -- {"b": 1, "a": 2}   (input order)
SELECT '{"b": 1, "a": 2}'::jsonb;    -- {"a": 2, "b": 1}   (sorted)
```
::

---

## Inserting JSON

::code-wrapper{language="sql"}
```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL
);

-- From a JSON string literal (PostgreSQL parses and converts to binary jsonb)
INSERT INTO events (payload) VALUES (
  '{"type": "click", "user": {"id": 42, "name": "Alice"}, "tags": ["web", "mobile"]}'
);

-- From columns via jsonb_build_object (handles quoting/escaping automatically)
INSERT INTO events (payload)
SELECT jsonb_build_object(
  'type', 'click',
  'user_id', u.id,                -- integer → JSON number
  'email', u.email,               -- text → JSON string
  'ts', now()                     -- timestamptz → JSON string (ISO format)
)
FROM users u WHERE u.email = 'a@x.com';

-- From multiple rows aggregated into a JSON array
INSERT INTO summary (daily_events)
SELECT jsonb_agg(jsonb_build_object('id', e.id, 'type', e.payload->>'type'))
FROM events e
WHERE e.created_at >= CURRENT_DATE;
```
::

`jsonb_build_object` is safer than string concatenation — it handles NULL values, quoting, and escaping correctly. Use it for constructing JSONB from column data.

---

## Querying Operators

| Operator | Returns | Example | Indexable by GIN? |
|---|---|---|---|
| `->` | JSONB value at key/index | `payload->'user'` | ❌ (use expression index) |
| `->>` | **Text** value at key/index | `payload->>'type'` | ❌ (use expression index) |
| `#>` | JSONB at path (array of keys) | `payload #> '{user,id}'` | ❌ |
| `#>>` | **Text** at path | `payload #>> '{user,name}'` | ❌ |
| `@>` | Containment (left contains right) | `payload @> '{"type": "click"}'` | ✅ |
| `<@` | Contained by | `payload <@ '{"type": "click"}'` | ✅ |
| `?` | Key exists | `payload ? 'user'` | ✅ |
| `?|` | Any key exists | `payload ?| array['user', 'session']` | ✅ |
| `?&` | All keys exist | `payload ?& array['user', 'session']` | ✅ |
| `||` | Concatenate two JSONB | `payload || '{"processed": true}'` | N/A |

::code-wrapper{language="sql"}
```sql
-- Get a field as text (->> is the final-step operator — returns text, can't chain)
SELECT payload->>'type' FROM events;                        -- 'click' (text)

-- Get a nested field: chain -> for traversal, ->> for the final scalar
SELECT payload->'user'->>'name' FROM events;                -- 'Alice' (text)
SELECT payload #>> '{user,name}' FROM events;               -- 'Alice' (text, path syntax)

-- Get an array element (arrays are 0-indexed in JSON path)
SELECT payload->'tags'->>0 FROM events;                     -- 'web' (first tag, as text)
SELECT payload->'tags'->>1 FROM events;                     -- 'mobile' (second tag)

-- Containment: the indexable operator (use this for filtered queries)
SELECT * FROM events WHERE payload @> '{"type": "click"}';                 -- top-level key match
SELECT * FROM events WHERE payload @> '{"user": {"id": 42}}';              -- nested object match
SELECT * FROM events WHERE payload @> '{"tags": ["web"]}';                 -- array contains element

-- Key existence
SELECT * FROM events WHERE payload ? 'user_id';                            -- key exists
SELECT * FROM events WHERE payload ?| array['user_id', 'session_id'];      -- any key exists
SELECT * FROM events WHERE payload ?& array['user_id', 'session_id'];      -- all keys exist
```
::

**`@>` (containment) is the GIN-indexable operator**. Prefer `WHERE payload @> '{"type": "click"}'` over `WHERE payload->>'type' = 'click'` — the former can use a GIN index on the whole column; the latter needs a per-path expression index.

### `->` vs `->>`: The Return Type Trap

::code-wrapper{language="sql"}
```sql
-- -> returns JSONB (can chain further -> operators)
SELECT payload->'user'->'id' FROM events;        -- 42 (JSONB number)
-- SELECT payload->'user'->'id'->>'x';           -- ERROR: can't chain ->> (returns text)

-- ->> returns text (final step — can't chain)
SELECT payload->'user'->>'name' FROM events;     -- 'Alice' (text)

-- ⚠️ Numeric comparison trap: ->> returns text, so comparison is string-based
SELECT * FROM events WHERE (payload->>'amount') > 100;
-- String comparison: '100' > '99' is TRUE (lexicographic), '20' > '100' is TRUE — WRONG

-- ✅ Cast to numeric for correct comparison
SELECT * FROM events WHERE (payload->>'amount')::numeric > 100;
```
::

---

## Indexing JSONB

### GIN Index (Indexes Everything)

::code-wrapper{language="sql"}
```sql
-- Full GIN index: indexes every key and value in the JSONB column
CREATE INDEX events_payload_gin ON events USING gin(payload);

-- Now containment, key-existence, and path queries use the index
SELECT * FROM events WHERE payload @> '{"type": "click"}';    -- uses GIN
SELECT * FROM events WHERE payload ? 'user_id';               -- uses GIN
SELECT * FROM events WHERE payload ?| array['a', 'b'];        -- uses GIN

-- ⚠️ The GIN index does NOT help with ->> extraction + comparison
SELECT * FROM events WHERE payload->>'type' = 'click';
-- This needs a separate expression index (see below)
```
::

A full GIN index on a JSONB column indexes every key and value — the most flexible approach (any `@>`/`?` query benefits) but takes more space.

### Expression Index (Indexes a Specific Path)

::code-wrapper{language="sql"}
```sql
-- Expression index: indexes the extracted text value of a specific path
CREATE INDEX events_type_idx ON events ((payload->>'type'));

-- Uses this index (the expression must match exactly)
SELECT * FROM events WHERE payload->>'type' = 'click';

-- Also works for the -> operator returning JSONB (for numeric/scalar comparisons)
CREATE INDEX events_user_id_idx ON events (((payload->'user')->>'id')::int);
SELECT * FROM events WHERE (payload->'user')->>'id'::int = 42;
```
::

Expression indexes are smaller and faster for queries on a known path, but they only help that exact expression.

### Partial GIN for Hot Subsets

::code-wrapper{language="sql"}
```sql
-- Index only the 'click' events — much smaller, used when predicate matches
CREATE INDEX events_clicks_gin ON events USING gin(payload)
  WHERE payload @> '{"type": "click"}';

-- This query uses the partial index
SELECT * FROM events WHERE payload @> '{"type": "click"}' AND payload @> '{"source": "homepage"}';
```
::

### GIN Index with jsonb_path_ops (Smaller, Containment-Only)

::code-wrapper{language="sql"}
```sql
-- jsonb_path_ops: smaller index, but only supports @> (no ?/ ?| / ?&)
CREATE INDEX events_payload_path_gin ON events USING gin(payload jsonb_path_ops);

-- @> uses the index (faster lookup, smaller index)
SELECT * FROM events WHERE payload @> '{"type": "click"}';

-- ? does NOT use this index type
SELECT * FROM events WHERE payload ? 'user_id';   -- seq scan (not supported by jsonb_path_ops)
```
::

Use `jsonb_path_ops` when you only need `@>` containment queries — the index is significantly smaller.

---

## SQL/JSON Path Queries (PostgreSQL 12+)

`jsonb_path_query` uses the SQL/JSON path language for complex nested extraction:

::code-wrapper{language="sql"}
```sql
-- Extract all user IDs from an array of events
SELECT jsonb_path_query(payload, '$.user.id') FROM events;

-- Filter array elements with a condition
SELECT jsonb_path_query(payload, '$.tags[*] ? (@ == "web")') FROM events;

-- Existence check (returns boolean)
SELECT jsonb_path_exists(payload, '$.user.id ? (@ > 10)') FROM events;

-- Query with variables ($1 references the first variable)
SELECT * FROM events
WHERE jsonb_path_exists(payload, '$.user.id ? (@ == $id)', '{"id": 42}');

-- Extract nested arrays and iterate
SELECT jsonb_path_query(payload, '$.items[*].name') FROM orders_json;
```
::

JSON path is more expressive than `->`/`#>` chaining — it supports filters, wildcards, and variables. But for simple lookups, `@>` + GIN is faster and more indexable.

---

## Modifying JSONB

JSONB is immutable in place — you replace it with a modified version:

::code-wrapper{language="sql"}
```sql
-- Add/set a key at a path (jsonb_set: target, path, new_value, create_if_missing)
UPDATE events SET payload = jsonb_set(payload, '{user,name}', '"Bob"'::jsonb);
--                                                                    ^^^^^^^^^^^^
-- new_value must be jsonb — strings need double quotes and cast

-- Add a key only if it doesn't exist (create_if_missing = true is the default)
UPDATE events SET payload = jsonb_set(payload, '{processed}', 'true'::jsonb, true);

-- Set only if the key already exists (create_if_missing = false)
UPDATE events SET payload = jsonb_set(payload, '{existing_key}', '"new"'::jsonb, false);

-- Merge at the top level (|| concatenates — does NOT deep-merge)
UPDATE events SET payload = payload || '{"processed": true, "version": 2}'::jsonb;
-- ⚠️ || replaces entire objects: payload || '{"user": {"name": "Bob"}}'
--    replaces the ENTIRE user object, not just user.name

-- Remove a key (- operator)
UPDATE events SET payload = payload - 'tags';

-- Remove a nested key (#- with path)
UPDATE events SET payload = payload #- '{user,id}';
```
::

**`||` merges at the top level only** — it does NOT deep-merge nested objects. For deep updates, use `jsonb_set` on the specific path.

---

## Array Columns

PostgreSQL columns can be arrays of any type:

::code-wrapper{language="sql"}
```sql
CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'   -- array of text, default empty array
);

-- Insert with array literal syntax
INSERT INTO posts (title, tags) VALUES ('Hello', '{"intro", "welcome"}');

-- Insert with ARRAY constructor
INSERT INTO posts (title, tags) VALUES ('World', ARRAY['news', 'tech']);

-- Insert with array_agg from a subquery
INSERT INTO archive (id, all_tags)
SELECT post_id, array_agg(tag) FROM post_tags GROUP BY post_id;
```
::

### Array Operators

| Operator | Meaning | GIN-indexable? |
|---|---|---|
| `= ANY(arr)` / `val IN` | Value equals any element | ❌ (use `@>`) |
| `@>` | Array contains all of right's elements | ✅ |
| `<@` | Array is contained by | ✅ |
| `&&` | Overlap (any common element) | ✅ |
| `arr[i]` | Element at 1-based index | ❌ |
| `array_length(arr, dim)` | Length (NULL if empty!) | N/A |
| `cardinality(arr)` | Length (0 if empty) | N/A |

::code-wrapper{language="sql"}
```sql
-- Posts with the 'intro' tag (two equivalent forms)
SELECT * FROM posts WHERE 'intro' = ANY(tags);           -- works, no GIN
SELECT * FROM posts WHERE tags @> array['intro'];        -- uses GIN index

-- Posts with ALL of these tags (contains both)
SELECT * FROM posts WHERE tags @> array['intro', 'welcome'];

-- Posts with ANY of these tags (overlap)
SELECT * FROM posts WHERE tags && array['intro', 'news'];

-- GIN index for array containment queries
CREATE INDEX posts_tags_gin ON posts USING gin(tags);

-- Element access (1-indexed!)
SELECT tags[1] FROM posts;        -- first element (tags[0] is NULL, not an error)
SELECT tags[2] FROM posts;        -- second element

-- Length (⚠️ array_length returns NULL for empty arrays!)
SELECT array_length(tags, 1) FROM posts WHERE tags = '{}';   -- NULL, not 0
SELECT cardinality(tags) FROM posts WHERE tags = '{}';        -- 0 (use cardinality)
SELECT coalesce(array_length(tags, 1), 0) FROM posts;         -- 0 (coalesce fallback)
```
::

### unnest — Array to Rows

::code-wrapper{language="sql"}
```sql
-- Expand each post's tags into separate rows (one row per tag)
SELECT id, unnest(tags) AS tag FROM posts;
--  id | tag
--  1  | intro
--  1  | welcome
--  2  | news

-- unnest + array_agg are inverses: expand, filter, re-aggregate
SELECT id, array_agg(tag) AS filtered_tags
FROM (SELECT id, unnest(tags) AS tag FROM posts) t
WHERE tag NOT LIKE 'test_%'   -- filter out test tags
GROUP BY id;

-- Turn a comma-separated string into an array
SELECT string_to_array('a,b,c', ',');              -- {a,b,c}
SELECT array_to_string(ARRAY['a','b','c'], ',');   -- a,b,c

-- Multi-column unnest (parallel expansion)
SELECT unnest(ARRAY[1,2,3]), unnest(ARRAY['a','b','c']);
--  1 | a
--  2 | b
--  3 | c
```
::

`unnest` is the bridge between array columns and relational operations — it expands arrays for joins, aggregations, and filtering.

---

## Complex Implementation: Event Tracking with JSONB

A flexible event tracking schema with GIN indexes for containment queries and JSON path for nested extraction:

::code-wrapper{language="sql"}
```sql
-- ============================================================================
-- Schema: event tracking platform with variable-structure JSONB payloads
-- ============================================================================
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  event_type TEXT NOT NULL,                    -- denormalized for fast filtering
  payload JSONB NOT NULL,                      -- variable-structure event data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN index on the full payload: supports @>, ?, ?|, ?& for any path
CREATE INDEX events_payload_gin ON events USING gin(payload);

-- B-tree index on event_type for equality filtering
CREATE INDEX events_type_idx ON events(event_type);

-- B-tree index on created_at for time-range queries
CREATE INDEX events_created_at_idx ON events(created_at);

-- Partial GIN for the hot 'click' event subset (much smaller than full GIN)
CREATE INDEX events_clicks_gin ON events USING gin(payload)
  WHERE event_type = 'click';

-- ============================================================================
-- Insert: events with different payload structures (schema flexibility)
-- ============================================================================
INSERT INTO events (user_id, event_type, payload) VALUES
  (42, 'click', '{
    "target": "button.submit",
    "page": "/checkout",
    "metadata": {"session_id": "abc123", "ab_variant": "B"}
  }'),
  (42, 'purchase', '{
    "order_id": 9821,
    "items": [
      {"sku": "WIDGET-001", "qty": 2, "price": 19.99},
      {"sku": "GADGET-002", "qty": 1, "price": 49.99}
    ],
    "total": 89.97
  }'),
  (99, 'click', '{
    "target": "link.nav",
    "page": "/home",
    "metadata": {"session_id": "def456", "ab_variant": "A"}
  }');

-- ============================================================================
-- Query 1: containment — uses the full GIN index (fast)
-- ============================================================================
-- All click events on the checkout page
SELECT id, user_id, payload->>'target' AS target
FROM events
WHERE event_type = 'click' AND payload @> '{"page": "/checkout"}';
-- Uses the event_type B-tree index AND the payload GIN index

-- ============================================================================
-- Query 2: nested object containment — GIN index handles nested paths
-- ============================================================================
-- All events from a specific A/B test variant
SELECT id, event_type, payload->>'page' AS page
FROM events
WHERE payload @> '{"metadata": {"ab_variant": "B"}}';
-- GIN index scans the nested path — no full-table scan

-- ============================================================================
-- Query 3: JSON path query for deep extraction
-- ============================================================================
-- Extract all item SKUs from purchase events
SELECT
  e.id,
  jsonb_path_query(e.payload, '$.items[*].sku')::text AS sku
FROM events e
WHERE e.event_type = 'purchase';

-- Extract items with quantity > 1
SELECT
  e.id,
  jsonb_path_query(e.payload, '$.items[*] ? (@.qty > 1)') AS high_qty_item
FROM events e
WHERE e.event_type = 'purchase';

-- ============================================================================
-- Query 4: aggregate JSON from rows (build a summary JSON object)
-- ============================================================================
-- Build a per-user event summary as a JSON array
SELECT
  user_id,
  jsonb_agg(
    jsonb_build_object(
      'type', event_type,
      'page', payload->>'page',
      'ts', created_at
    )
  ) AS event_history
FROM events
WHERE created_at >= now() - INTERVAL '24 hours'
GROUP BY user_id;

-- ============================================================================
-- Query 5: update a nested field with jsonb_set
-- ============================================================================
-- Add a 'processed' flag to an event's metadata
UPDATE events
SET payload = jsonb_set(payload, '{metadata,processed}', 'true'::jsonb, true)
WHERE id = 1;
-- Path '{metadata,processed}' navigates to payload.metadata.processed
-- create_if_missing=true creates the key if it doesn't exist

-- ============================================================================
-- Query 6: array column with GIN for tag-based filtering
-- ============================================================================
CREATE TABLE user_tags (
  user_id BIGINT PRIMARY KEY,
  tags TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX user_tags_gin ON user_tags USING gin(tags);

-- Find users who have all of these tags (containment, uses GIN)
SELECT user_id FROM user_tags WHERE tags @> array['premium', 'newsletter'];

-- Find users who have any of these tags (overlap, uses GIN)
SELECT user_id FROM user_tags WHERE tags && array['premium', 'trial'];

-- Expand tags for a report (one row per user-tag pair)
SELECT user_id, tag FROM user_tags, unnest(tags) AS tag ORDER BY user_id;
```
::

**Key design decisions**:
1. **`event_type` denormalized** — a B-tree index on a text column is cheaper than extracting from JSONB for the most common filter.
2. **Full GIN on `payload`** — supports any `@>`/`?` query without per-path expression indexes.
3. **Partial GIN for `click` events** — the hot subset gets a smaller, faster index.
4. **JSON path for deep extraction** — `jsonb_path_query` handles nested arrays and filters.

---

## Anti-Pattern: JSONB for Everything

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: stuffing structured data into JSONB when a relational schema is better
CREATE TABLE bad_orders (
  id BIGSERIAL PRIMARY KEY,
  data JSONB NOT NULL   -- {"customer_id": 42, "amount": 99.95, "status": "shipped", ...}
);

-- Now every query extracts fields: slow, no type safety, no foreign keys
SELECT * FROM bad_orders WHERE (data->>'customer_id')::int = 42;
SELECT * FROM bad_orders WHERE (data->>'amount')::numeric > 100;
-- No FK to customers, no CHECK constraints, no type safety, slow queries

-- ✅ RIGHT: relational schema for structured data, JSONB only for variable parts
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),  -- FK enforced
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),     -- type + constraint
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB                                          -- variable extra data only
);

CREATE INDEX orders_customer_idx ON orders(customer_id);
CREATE INDEX orders_status_idx ON orders(status);
```
::

**When to use what**:
- **Normalized tables** — structured data queried independently, joined often, with FK constraints.
- **Arrays** — homogeneous lists (tags, categories) always read/written together.
- **JSONB** — variable-structure data (event payloads, API responses, user settings) where the schema evolves per row.

---

## Anti-Pattern: Querying JSONB Without GIN Index

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: containment query without a GIN index → full table scan
SELECT * FROM events WHERE payload @> '{"type": "click"}';
-- Without a GIN index, PostgreSQL must parse every row's JSONB to check containment
-- O(n) over all rows — slow on large tables

-- ✅ RIGHT: create a GIN index, then containment queries use it
CREATE INDEX events_payload_gin ON events USING gin(payload);
SELECT * FROM events WHERE payload @> '{"type": "click"}';
-- GIN index: O(matches) — fast even on millions of rows

-- ⚠️ BUT: ->> extraction + comparison does NOT use the full GIN index
SELECT * FROM events WHERE payload->>'type' = 'click';
-- Needs a separate expression index: CREATE INDEX ON events ((payload->>'type'));
```
::

---

## 💡 Tips & Tricks

- **Idiom** — prefer `payload @> '{"key": "value"}'` (containment) over `payload->>'key' = 'value'` (extraction + comparison): containment can use a full GIN index on the JSONB column, while extraction+comparison needs a per-path expression index. Design queries around `@>`.
- **Idiom** — use `jsonb_build_object(...)` to construct JSONB from columns: cleaner and less error-prone than string concatenation, handles quoting/escaping correctly.
- **Performance** — a **GIN index on a JSONB column** is the single most powerful JSONB optimization: it accelerates `@>`, `?`, `?|`, `?&` for any path. For a hot subset, use a partial GIN (`WHERE payload @> '{"type": "click"}'`) to shrink the index.
- **Idiom** — use `unnest(array_col)` to expand an array column into rows for joins/aggregation, and `array_agg(col)` to fold rows back into an array: the two are inverses.
- **Idiom** — use `#>>` for deep path extraction: `payload #>> '{user,address,city}'` extracts a nested value as text in one expression, cleaner than chaining `->`/`->>`.
- **Idiom** — use `jsonb_path_ops` GIN for containment-only JSONB: smaller index, but only `@>` (no `?`/`?|`/`?&`).
- **Portability** — JSONB is PostgreSQL-specific (MySQL has `JSON`, SQLite stores JSON as `TEXT` with `json_extract`). The `->`/`->>` operators are PostgreSQL (MySQL uses `->`/`->>` too but with some differences; SQLite uses `json_extract`). JSON querying is one of the least portable areas.

---

## ⚠️ Edge Cases & Gotchas

- **`jsonb` deduplicates keys**: `jsonb '{"a": 1, "a": 2}'` keeps only the last value (`{"a": 2}`). `json` preserves both. Usually fine, but surprising if you expected duplicates.
- **`jsonb` doesn't preserve key order**: `jsonb '{"b": 1, "a": 2}'` may display as `{"a": 2, "b": 1}` (keys sorted). `json` preserves input order. If order matters (rare), use `json`.
- **`->` returns JSONB, `->>` returns text**: `payload->'user'` is JSONB (you can chain `->'id'`); `payload->>'user'` is text (you can't chain). Use `->` for nested traversal, `->>` for the final scalar.
- **Numbers in JSONB**: `payload->>'amount'` returns text — `WHERE payload->>'amount' > 100` does string comparison, not numeric. Cast: `WHERE (payload->>'amount')::numeric > 100`.
- **`@>` requires matching types**: `payload @> '{"id": 42}'` matches only if `id` is stored as a number. If it's stored as a string `"42"`, containment fails. JSONB preserves the input type. Also: `1` and `1.0` are equal in JSONB (numeric equality), but `"1"` (string) and `1` (number) are not.
- **GIN index size**: a full GIN index on a large JSONB column can be huge (indexes every key/value). For large tables, prefer expression indexes on the specific paths you query, or `jsonb_path_ops` (smaller, containment-only).
- **`jsonb_set` creates the key only if `create_if_missing` is true** (4th arg, default true). To set only existing keys, pass `false`.
- **`||` merges at the top level only**: `payload || '{"user": {"name": "Bob"}}'` replaces the entire `user` object, it doesn't deep-merge. For deep merge, use `jsonb_set` on the specific path.
- **Arrays are 1-indexed**: `arr[1]` is the first element, `arr[0]` is NULL (not an error). Coming from a 0-indexed language, this is a common off-by-one.
- **`array_length(arr, 1)` is NULL for empty arrays**: `array_length('{}', 1)` = NULL, not 0. Use `coalesce(array_length(arr, 1), 0)` for 0, or `cardinality(arr)` (returns 0 for empty).
- **NULL vs JSON null**: SQL `NULL` (no value) is different from JSON `null` (a JSON value). `payload->>'key'` returns SQL `NULL` if the key doesn't exist, but returns the text `'null'` if the key exists with value `null`.
- **Large JSONB values and TOAST**: very large JSONB values are TOASTed (compressed and stored out-of-line). This is automatic but can affect query performance for large payloads — avoid storing multi-MB JSONB if you query it frequently.

---

## 🧠 Spot the Bug

A developer creates a GIN index on a JSONB column and runs a containment query, but `EXPLAIN` shows a sequential scan instead of an index scan:

::code-wrapper{language="sql"}
```sql
CREATE INDEX events_payload_gin ON events USING gin(payload);

SELECT * FROM events WHERE payload->>'type' = 'click';
-- EXPLAIN shows Seq Scan, not Bitmap Index Scan
```
::

<details>
<summary>Answer</summary>

The GIN index on `payload` accelerates **containment** operators (`@>`, `?`, `?|`, `?&`), **not** extraction + comparison (`->>` + `=`). The query `payload->>'type' = 'click'` extracts the `type` field as text and compares it — the GIN index can't serve this operator pattern.

::code-wrapper{language="sql"}
```sql
-- ✅ Fix 1: rewrite as containment (uses the GIN index)
SELECT * FROM events WHERE payload @> '{"type": "click"}';

-- ✅ Fix 2: add an expression index for the specific path
CREATE INDEX events_type_idx ON events ((payload->>'type'));
SELECT * FROM events WHERE payload->>'type' = 'click';   -- now uses the expression index
```
::

**The lesson**: a GIN index on a JSONB column serves `@>`/`?`/`?|`/`?&` — **not** `->>` extraction + comparison. For `->>` queries, either rewrite as containment (`@>`) or add an expression index on the specific path.

</details>

---

## Summary

You can now store and query semi-structured data with `JSONB` (using `->`/`->>`/`@>`/`?`), index it with GIN or expression indexes, modify it with `jsonb_set`/`||`/`-`, use array columns with `ANY`/`@>`/`unnest`, and query nested data with SQL/JSON path — knowing when JSONB/arrays are appropriate vs. when to normalize. Next: recursive CTEs for tree and graph traversal.