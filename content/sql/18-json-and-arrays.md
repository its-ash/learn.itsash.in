# 18 — JSON & Array Columns

PostgreSQL has first-class support for semi-structured data: `JSONB` (binary JSON) and array columns. This lets you store variable-structure data (event payloads, user preferences, nested objects) without a separate document database, while keeping relational power for the rest of the schema.

## JSON vs JSONB

| Type | Storage | Indexing | Deduplication | Preserves key order | Speed |
|---|---|---|---|---|---|
| `json` | Text (as input) | Limited (expression indexes) | No | Yes | Slower to query (re-parsed) |
| `jsonb` | Binary | Full (GIN, expression) | Yes (duplicate keys merged) | No | Faster to query |

**Use `jsonb`** for almost everything — it's indexable, faster to query, and deduplicates keys. Use `json` only when you need to preserve the exact input (key order, duplicate keys) — rare.

## Inserting JSON

::codewrapper{language="sql"}
```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL
);

-- From a JSON string
INSERT INTO events (payload) VALUES ('{"type": "click", "user": {"id": 42, "name": "Alice"}, "tags": ["web", "mobile"]}');

-- From a row via jsonb_build_object
INSERT INTO events (payload)
SELECT jsonb_build_object('type', 'click', 'user_id', id, 'ts', now())
FROM users WHERE email = 'a@x.com';
```
::

## Querying JSON

### Operators

| Operator | Returns |
|---|---|
| `->` | JSON value at key (or array index), as JSONB. `payload->'user'`. |
| `->>` | Value at key (or index), as **text**. `payload->>'type'`. |
| `#>` | Value at a path (array of keys), as JSONB. `payload #> '{user,id}'`. |
| `#>>` | Value at a path, as text. `payload #>> '{user,name}'`. |
| `@>` | Containment — left contains right. `payload @> '{"type": "click"}'`. |
| `<@` | Contained by. |
| `?` | Key exists. `payload ? 'user'`. |
| `?|` | Any of these keys exist. `payload ?| array['user', 'session']`. |
| `?&` | All of these keys exist. |
| `||` | Concatenate two JSONB values. |

::code-wrapper{language="sql"}
```sql
-- Get a field as text
SELECT payload->>'type' FROM events;

-- Get a nested field
SELECT payload->'user'->>'name' FROM events;
SELECT payload #>> '{user,name}' FROM events;

-- Get an array element
SELECT payload->'tags'->>0 FROM events;   -- first tag

-- Containment (the key JSONB query operator)
SELECT * FROM events WHERE payload @> '{"type": "click"}';
SELECT * FROM events WHERE payload @> '{"user": {"id": 42}}';
```
::

### Containment `@>` is the indexable one

`@>` (contains) is the operator that GIN indexes optimize. Prefer `WHERE payload @> '{"type": "click"}'` over `WHERE payload->>'type' = 'click'` — the former can use a GIN index; the latter needs an expression index on the specific path.

## Indexing JSONB

### GIN index (indexes everything)

::code-wrapper{language="sql"}
```sql
CREATE INDEX events_payload_gin ON events USING gin(payload);

-- Now containment, key-existence, and path queries use the index
SELECT * FROM events WHERE payload @> '{"type": "click"}';
SELECT * FROM events WHERE payload ? 'user_id';
```
::

A full GIN index on a JSONB column indexes every key and value. It's the most flexible (any `@>`/`?` query benefits) but takes space.

### Expression index (indexes a specific path)

::code-wrapper{language="sql"}
```sql
CREATE INDEX events_type_idx ON events((payload->>'type'));

-- Uses this index
SELECT * FROM events WHERE payload->>'type' = 'click';
```
::

Expression indexes are smaller and faster for queries on a known path, but they only help that exact expression.

### Partial GIN for hot subsets

::code-wrapper{language="sql"}
```sql
CREATE INDEX events_clicks_gin ON events USING gin(payload) WHERE payload @> '{"type": "click"}';
```
::

Index only the `click` events — much smaller, and the planner uses it when the predicate matches.

## Modifying JSONB

JSONB is immutable in place — you replace it with a modified version:

::code-wrapper{language="sql"}
```sql
-- Add/set a key (jsonb_set)
UPDATE events SET payload = jsonb_set(payload, '{user,name}', '"Bob"');

-- Add a key (|| merge)
UPDATE events SET payload = payload || '{"processed": true}';

-- Remove a key (- operator)
UPDATE events SET payload = payload - 'tags';

-- Remove a nested key (- with path)
UPDATE events SET payload = payload #- '{user,id}';
```
::

`jsonb_set(target, path, new_value, create_if_missing)`. The path is a text array. The new value must be valid JSONB (so strings need double quotes: `'"Bob"'`).

## Array Columns

PostgreSQL columns can be arrays of any type:

::code-wrapper{language="sql"}
```sql
CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO posts (title, tags) VALUES ('Hello', array['intro', 'welcome']);
INSERT INTO posts (title, tags) VALUES ('World', '{"news", "tech"}');
```
::

### Array operators

| Operator | Meaning |
|---|---|
| `= ANY(arr)` / `IN` | Value equals any element. |
| `@>` | Array contains (all of the right's elements). |
| `<@` | Array is contained by. |
| `&&` | Overlap (any common element). |
| `arr[i]` | Element at 1-based index. |
| `array_length(arr, dim)` | Length. |
| `unnest(arr)` | Expand array to rows. |

::code-wrapper{language="sql"}
```sql
-- Posts with the 'intro' tag
SELECT * FROM posts WHERE 'intro' = ANY(tags);
SELECT * FROM posts WHERE tags @> array['intro'];

-- Posts with any of these tags
SELECT * FROM posts WHERE tags && array['intro', 'news'];

-- Index for containment
CREATE INDEX posts_tags_gin ON posts USING gin(tags);

-- Expand tags to rows (one row per tag)
SELECT id, tag FROM posts, unnest(tags) AS tag;
```
::

### `unnest` — array to rows

::code-wrapper{language="sql"}
```sql
-- Each post's tags as separate rows
SELECT id, unnest(tags) AS tag FROM posts;

-- Aggregate tags back into an array
SELECT id, array_agg(tag) FROM (SELECT id, unnest(tags) AS tag FROM posts) t GROUP BY id;

-- Turn a comma-separated string into an array
SELECT string_to_array('a,b,c', ',');   -- {a,b,c}
SELECT array_to_string(ARRAY['a','b','c'], ',');   -- a,b,c
```
::

`unnest` is the bridge between array columns and relational operations — it expands arrays for joins, aggregations, and filtering.

## When to Use JSONB vs Arrays vs Normalized Tables

- **Normalized tables** — when the nested data is structured, queried independently, or joined often. Relations are still PostgreSQL's strongest suit.
- **Arrays** — for homogeneous lists (tags, categories) that are always read/written together and rarely filtered individually. Smaller and simpler than a join table for simple many-value attributes.
- **JSONB** — for variable-structure data (event payloads, API responses, user settings) where the schema evolves or varies per row, and you query by containment on some keys.

A common anti-pattern: stuffing everything into a JSONB column ("schemaless") and then needing to query/filter on nested fields — at which point normalizing would have been better. Use JSONB for genuine semi-structured data; normalize for structured relationships you query relationally.

## 💡 Tips & Tricks

- **Idiom**: prefer `payload @> '{"key": "value"}'` (containment) over `payload->>'key' = 'value'` (extraction + comparison) — containment can use a full GIN index on the JSONB column, while extraction+comparison needs a per-path expression index. Design queries around `@>`.
- **Idiom**: use `jsonb_build_object(...)` to construct JSONB from columns in a query — cleaner and less error-prone than string concatenation, and it handles quoting/escaping correctly.
- **Performance**: a **GIN index on a JSONB column** is the single most powerful JSONB optimization — it accelerates `@>`, `?`, `?|`, `?&` for any path. For a hot subset, use a partial GIN (`WHERE payload @> '{"type": "click"}'`) to shrink the index.
- **Idiom**: use `unnest(array_col)` to expand an array column into rows for joins/aggregation, and `array_agg(col)` to fold rows back into an array — the two are inverses, and together let you move between array and relational form as needed.
- **Portability**: JSONB is PostgreSQL-specific (MySQL has `JSON`, SQLite stores JSON as `TEXT` with `json_extract`). The `->`/`->>`operators are PostgreSQL (MySQL uses `->`/`->>` too but with some differences; SQLite uses `json_extract`). JSON querying is one of the least portable areas — write per-engine.

## ⚠️ Edge Cases & Gotchas

- **`jsonb` deduplicates keys**: `jsonb '{"a": 1, "a": 2}'` keeps only the last value (`{"a": 2}`). `json` preserves both. Usually fine, but surprising if you expected to see duplicates.
- **`jsonb` doesn't preserve key order**: `jsonb '{"b": 1, "a": 2}'` may display as `{"a": 2, "b": 1}` (keys are sorted). `json` preserves input order. If order matters (rare), use `json`.
- **`->` returns JSONB, `->>` returns text**: `payload->'user'` is JSONB (you can chain `->'id'`); `payload->>'user'` is text (you can't chain). Use `->` for nested traversal, `->>` for the final scalar.
- **Numbers in JSONB**: `payload->>'amount'` returns text — `WHERE payload->>'amount' > 100` does string comparison, not numeric. Cast: `WHERE (payload->>'amount')::numeric > 100`.
- **`@>` requires matching types**: `payload @> '{"id": 42}'` matches only if `id` is stored as a number. If it's stored as a string `"42"`, the containment fails. JSONB preserves the input type.
- **GIN index size**: a full GIN index on a large JSONB column can be huge (indexes every key/value). For large tables, prefer expression indexes on the specific paths you query.
- **`jsonb_set` creates the key only if `create_if_missing` is true** (the 4th arg, default true). To set only existing keys, pass `false`.
- **`||` merges at the top level only**: `payload || '{"user": {"name": "Bob"}}'` replaces the entire `user` object, it doesn't deep-merge. For deep merge, use `jsonb_set` on the specific path.
- **Arrays are 1-indexed**: `arr[1]` is the first element, `arr[0]` is NULL (not an error). Coming from a 0-indexed language, this is a common off-by-one.
- **`array_length(arr, 1)` is NULL for empty arrays**: `array_length('{}', 1)` = NULL, not 0. Use `coalesce(array_length(arr, 1), 0)` for 0, or `cardinality(arr)` (returns 0 for empty).
- **`ANY` vs `@>`**: `'x' = ANY(arr)` checks if `x` is an element; `arr @> array['x']` checks if `arr` contains `x`. They're equivalent for single-value checks, but `@>` can check multiple values at once (`arr @> array['x', 'y']` = "contains both") and uses a GIN index.

## 🧠 Spot the Bug

A developer indexes the `type` field of a JSONB column and is surprised the query doesn't use the index:

::code-wrapper{language="sql"}
```sql
CREATE INDEX events_type_idx ON events ((payload->>'type'));

SELECT * FROM events WHERE payload->>'type' = 'click';
-- EXPLAIN shows a seq scan, not an index scan
```
::

What's a likely cause?

<details>
<summary>Answer</summary>

The expression index is on `(payload->>'type')`, and the query filters on `payload->>'type' = 'click'` — the expressions match, so the index *should* be usable. The likely cause is that the **planner chose a seq scan because it's cheaper** — if the table is small, or if `'click'` events are most of the table, scanning is faster than index lookup + heap fetch.

To confirm, force the index and compare:

```sql
SET enable_seqscan = off;
EXPLAIN SELECT * FROM events WHERE payload->>'type' = 'click';
-- Now it should show an index scan — if it's still slow, the index isn't the issue.
```
::
If forcing the index makes it *slower*, the planner was right to seq-scan — the predicate isn't selective. If forcing makes it *faster*, the planner's stats are off — run `ANALYZE events` to refresh them.

Other possible causes:
- The table hasn't been `ANALYZE`d since the index was created, so the planner doesn't know the index exists or has stale stats.
- The query is in a function with `payload` as a parameter, and the planner can't inline the expression (use `IMMUTABLE` expression or a generated column).
- The expression has a subtle mismatch (e.g., index on `(payload ->> 'type')` with different whitespace than the query's `payload->>'type'` — actually these are the same; the planner normalizes operator spacing).

**The lesson**: an index that matches the query expression isn't always *used* — the planner chooses based on cost. If the predicate isn't selective (most rows match), a seq scan is correct. Run `EXPLAIN` and, if needed, `ANALYZE` to refresh stats before assuming the index is broken.

</details>

## Summary

You can now store and query semi-structured data with `JSONB` (using `->`/`->>`/`@>`/`?`), index it with GIN or expression indexes, modify it with `jsonb_set`/`||`/`-`, and use array columns with `ANY`/`@>`/`unnest` — knowing when JSONB/arrays are appropriate vs. when to normalize. Next: recursive CTEs for tree and graph traversal.