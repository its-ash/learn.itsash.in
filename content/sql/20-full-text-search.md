# 20 — Full-Text Search

Full-text search (FTS) finds documents matching a query, ranked by relevance — far more powerful than `LIKE` for natural-language search. PostgreSQL has a built-in FTS engine via `tsvector`, `tsquery`, and GIN indexes.

---

## Why Not LIKE?

`LIKE '%word%'` has three fundamental problems:

1. **Slow** — leading wildcards defeat B-tree indexes → full table scan on every query.
2. **No linguistic awareness** — `'running'` doesn't match `'run'` or `'ran'`; `'database'` doesn't match `'databases'`.
3. **No relevance ranking** — you get matches, but no "best match first."

FTS solves all three: it's indexed (GIN inverted index), it stems words (`running` → `run`), and it ranks results by relevance.

---

## tsvector and tsquery

- **`tsvector`** — a document preprocessed into a sorted list of distinct words (lexemes), each with positions. This is the searchable form.
- **`tsquery`** — a query of lexemes combined with `&` (AND), `|` (OR), `!` (NOT), `<->` (followed by), and `<N>` (within N positions).

::code-wrapper{language="sql"}
```sql
-- Convert text to a tsvector: lowercase, remove stop words, stem
SELECT to_tsvector('english', 'The quick brown fox jumps over the lazy dog');
--  'brown':3 'dog':9 'fox':4 'jump':5 'lazi':8 'quick':2
--  Stop words removed: 'the', 'over'
--  Stemmed: 'jumps' → 'jump', 'lazy' → 'lazi'
--  Numbers are positions (word order in the original text)

-- Convert a query string to a tsquery (boolean operators: & | !)
SELECT to_tsquery('english', 'quick & fox');
--  'quick' & 'fox'

-- Phrase search: words in order, adjacent (phraseto_tsquery)
SELECT phraseto_tsquery('english', 'quick brown fox');
--  'quick' <-> 'brown' <-> 'fox'

-- Proximity: within N positions
SELECT to_tsquery('english', 'quick <3> fox');
--  'quick' <3> 'fox'   (quick and fox within 3 positions of each other)

-- User-friendly query syntax (websearch_to_tsquery)
SELECT websearch_to_tsquery('english', '"full text" -mysql postgres');
--  'full' <-> 'text' & !'mysql' & 'postgres'
--  Supports: quotes for phrases, - for NOT, OR for disjunction
```
::

The text search configuration (`'english'`, `'spanish'`, `'german'`, etc.) controls stemming and stop words. Use `'simple'` for no stemming/stop words (exact word matching — useful for codes, identifiers).

---

## The Match Operator: `@@`

::code-wrapper{language="sql"}
```sql
-- Does the document match the query?
SELECT to_tsvector('english', 'The quick brown fox') @@ to_tsquery('english', 'quick & fox');
--  true   (both 'quick' and 'fox' are in the document)

SELECT to_tsvector('english', 'The quick brown fox') @@ to_tsquery('english', 'quick & cat');
--  false  ('cat' is not in the document)

-- Phrase match: words must be adjacent and in order
SELECT to_tsvector('english', 'The quick brown fox') @@ phraseto_tsquery('english', 'quick brown');
--  true

SELECT to_tsvector('english', 'The brown quick fox') @@ phraseto_tsquery('english', 'quick brown');
--  false  (words are present but not in the right order/adjacency)
```
::

`@@` returns true if the tsvector contains all the tsquery's lexemes with the specified boolean/phrase structure.

---

## Storing and Indexing: Generated Column + GIN

Store the `tsvector` in a **generated column** so it's always in sync with the source text, and index it with GIN:

::code-wrapper{language="sql"}
```sql
CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Generated tsvector: combines title (weight A) and body (weight B)
  -- STORED: the column is physically stored (so it can be indexed)
  -- Always in sync with title/body — no trigger needed
  search_vec TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||  -- weight A = highest priority
    setweight(to_tsvector('english', coalesce(body, '')),   'B')    -- weight B = lower priority
  ) STORED
);

-- GIN index on the generated tsvector: makes @@ queries O(matches) not O(all docs)
CREATE INDEX articles_search_vec_gin ON articles USING gin(search_vec);
```
::

`setweight` assigns a weight (A > B > C > D) to each lexeme, so title matches rank higher than body matches. The `||` concatenates the two weighted vectors. The generated column ensures the tsvector is always in sync — no triggers, no stale vectors.

### Why Generated Columns (Not Triggers)?

::code-wrapper{language="sql"}
```sql
-- ❌ Old way: regular column + trigger to keep it in sync
CREATE TABLE articles_old (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  search_vec TSVECTOR                          -- regular column, can go stale
);

CREATE TRIGGER articles_search_vec_update
  BEFORE INSERT OR UPDATE ON articles_old
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vec, 'pg_catalog.english', title, body);
-- Risk: direct updates bypassing the trigger, or trigger bugs → stale tsvector

-- ✅ New way: generated column (PostgreSQL 12+)
-- search_vec is ALWAYS correct — computed from title/body on every read/write
-- No trigger to forget, no stale vectors, no maintenance
```
::

---

## Complex Implementation: Production Article Search

A production search system with weighted multi-column search, GIN indexing, ranking, and headline display:

::code-wrapper{language="sql"}
```sql
-- ============================================================================
-- Schema: article search with weighted title/body matching
-- ============================================================================
CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Generated tsvector: title (weight A) + body (weight B) + author (weight C)
  -- Title hits rank highest, then body hits, then author hits
  search_vec TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')),  'A') ||
    setweight(to_tsvector('english', coalesce(body, '')),   'B') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'C')
  ) STORED
);

-- GIN index: accelerates the @@ filter (the expensive part)
CREATE INDEX articles_search_vec_gin ON articles USING gin(search_vec);

-- B-tree index for secondary sort/filter
CREATE INDEX articles_published_at_idx ON articles(published_at);

-- ============================================================================
-- Sample data
-- ============================================================================
INSERT INTO articles (title, body, author) VALUES
  ('PostgreSQL Full-Text Search Guide',
   'PostgreSQL has a powerful full-text search engine using tsvector and tsquery. It supports stemming, stop words, and relevance ranking with GIN indexes.',
   'Alice Chen'),
  ('Introduction to Databases',
   'A database is an organized collection of data. Relational databases use SQL for querying and managing data. PostgreSQL is a popular relational database.',
   'Bob Smith'),
  ('Advanced PostgreSQL Indexing',
   'GIN indexes accelerate full-text search and JSONB containment queries. GIST indexes support geometric and range queries.',
   'Alice Chen');

-- ============================================================================
-- Query 1: basic search with ranking
-- ============================================================================
SELECT
  id,
  title,
  ts_rank(search_vec, query) AS rank      -- relevance score (higher = better)
FROM articles, to_tsquery('english', 'postgres & search') query
WHERE search_vec @@ query                   -- GIN index accelerates this filter
ORDER BY rank DESC, published_at DESC       -- rank first, then recency
LIMIT 10;

-- ============================================================================
-- Query 2: weighted search — title matches rank higher than body matches
-- ============================================================================
-- The search_vec already has weights (A=title, B=body, C=author)
-- ts_rank incorporates the weights automatically
SELECT
  id,
  title,
  ts_rank(search_vec, query) AS rank,
  ts_rank_cd(search_vec, query) AS rank_cd  -- cover density ranking (different algorithm)
FROM articles, to_tsquery('english', 'postgres') query
WHERE search_vec @@ query
ORDER BY rank DESC
LIMIT 10;

-- ============================================================================
-- Query 3: phrase search + headline display
-- ============================================================================
SELECT
  id,
  title,
  ts_headline(
    'english',
    body,
    phraseto_tsquery('english', 'full text search'),
    'MaxWords=35, MinWords=15, ShortWord=3, MaxFragments=3'
  ) AS snippet,                            -- highlighted snippet of the body
  ts_rank(search_vec, phraseto_tsquery('english', 'full text search')) AS rank
FROM articles
WHERE search_vec @@ phraseto_tsquery('english', 'full text search')
ORDER BY rank DESC;

-- ============================================================================
-- Query 4: websearch_to_tsquery for user-friendly query syntax
-- ============================================================================
-- Accepts: "phrase" -exclude OR alternative
SELECT
  id,
  title,
  ts_rank(search_vec, query) AS rank
FROM articles, websearch_to_tsquery('english', 'postgres -mysql OR database') query
WHERE search_vec @@ query
ORDER BY rank DESC
LIMIT 10;

-- ============================================================================
-- Query 5: prefix matching (typeahead search)
-- ============================================================================
SELECT
  id,
  title,
  ts_rank(search_vec, query) AS rank
FROM articles, to_tsquery('english', 'post:*') query   -- :* = prefix match
WHERE search_vec @@ query                                -- matches 'postgres', 'posting', etc.
ORDER BY rank DESC
LIMIT 10;

-- ============================================================================
-- Query 6: combined FTS + structured filters
-- ============================================================================
SELECT
  id,
  title,
  ts_rank(search_vec, query) AS rank
FROM articles, to_tsquery('english', 'postgres & index') query
WHERE search_vec @@ query
  AND published_at >= now() - INTERVAL '30 days'   -- time filter (uses published_at index)
  AND author = 'Alice Chen'                         -- equality filter
ORDER BY rank DESC
LIMIT 10;
```
::

**Key design decisions**:
1. **Generated column** — `search_vec` is always in sync, no trigger maintenance.
2. **Weighted columns** — `setweight` makes title hits rank higher than body hits.
3. **GIN index** — accelerates the `@@` filter from O(all docs) to O(matches).
4. **`ts_rank` for sorting** — the GIN index finds matches; `ts_rank` ranks the survivors.
5. **`ts_headline` for snippets** — generates highlighted search-result previews.

---

## Ranking: ts_rank vs ts_rank_cd

| Function | Algorithm | When to use |
|---|---|---|
| `ts_rank(vec, query)` | Sum of weighted lexeme frequencies | General relevance |
| `ts_rank_cd(vec, query)` | Cover density (how close lexemes are) | Phrase/proximity relevance |

::code-wrapper{language="sql"}
```sql
-- ts_rank: higher when a lexeme appears more often in the document
SELECT ts_rank(search_vec, to_tsquery('english', 'postgres')) FROM articles;

-- ts_rank_cd: higher when matched lexemes are closer together
SELECT ts_rank_cd(search_vec, to_tsquery('english', 'postgres & index')) FROM articles;

-- ⚠️ ts_rank is NOT normalized: it's not a 0–1 score
-- Don't compare ts_rank across different queries — only within a result set
```
::

---

## Highlighting with ts_headline

::code-wrapper{language="sql"}
```sql
-- Basic headline: snippet of the body with matched terms highlighted
SELECT
  id,
  ts_headline('english', body, to_tsquery('english', 'postgres')) AS snippet
FROM articles
WHERE search_vec @@ to_tsquery('english', 'postgres');

-- Customized headline: control snippet length, highlighting, fragments
SELECT
  id,
  ts_headline(
    'english',
    body,
    to_tsquery('english', 'postgres & index'),
    'MaxWords=35, MinWords=15, ShortWord=3, MaxFragments=3, FragmentDelimiter=" ... "'
  ) AS snippet
FROM articles
WHERE search_vec @@ to_tsquery('english', 'postgres & index');

-- Custom highlight tags (default is <b>...</b>)
SELECT
  ts_headline('english', body, to_tsquery('english', 'postgres'),
    'StartSel=<mark>, StopSel=</mark>') AS snippet
FROM articles
WHERE search_vec @@ to_tsquery('english', 'postgres');
-- Output: ... <mark>PostgreSQL</mark> has a powerful ...
```
::

`ts_headline` returns a snippet of the body with matched terms highlighted — a built-in "search result preview" that beats manually substring-slicing in application code.

---

## Search Features

### Boolean Operators

::code-wrapper{language="sql"}
```sql
to_tsquery('english', 'postgres & index')      -- both terms (AND)
to_tsquery('english', 'postgres | mysql')      -- either term (OR)
to_tsquery('english', 'postgres & !mysql')     -- postgres, NOT mysql
to_tsquery('english', 'postgres & (index | search)')  -- grouping with parentheses
```
::

### Phrase and Proximity Search

::code-wrapper{language="sql"}
```sql
-- Phrase: words must be adjacent and in order
phraseto_tsquery('english', 'full text search')
--  'full' <-> 'text' <-> 'search'

-- Proximity: within N positions (any order)
to_tsquery('english', 'quick <3> fox')
--  'quick' <3> 'fox'   (within 3 positions)

-- Adjacent (distance 1, any order)
to_tsquery('english', 'quick <-> fox')
--  'quick' <-> 'fox'
```
::

### Prefix Matching

::code-wrapper{language="sql"}
```sql
-- :* matches any lexeme starting with the prefix
to_tsquery('english', 'post:*')
--  'post':*   matches 'postgres', 'posting', 'post', etc.
-- Useful for typeahead/as-you-type search
```
::

---

## Anti-Pattern: LIKE for Search at Scale

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: LIKE '%word%' for search at scale
SELECT * FROM articles WHERE body LIKE '%postgres%';
-- Problems:
-- 1. Full table scan (leading wildcard defeats B-tree index)
-- 2. No stemming: 'postgres' won't match 'postgresql' or 'postgreSQL'
-- 3. No ranking: all matches are equal, no "best match first"
-- 4. No linguistic awareness: no stop word removal, no stemming

-- ✅ RIGHT: FTS with GIN index
SELECT id, title, ts_rank(search_vec, query) AS rank
FROM articles, to_tsquery('english', 'postgres') query
WHERE search_vec @@ query    -- GIN index: O(matches), not O(all docs)
ORDER BY rank DESC
LIMIT 10;
-- 1. Index-accelerated (GIN inverted index)
-- 2. Stemming: 'postgres' matches 'postgresql', 'postgreSQL'
-- 3. Ranked by relevance
-- 4. Stop words removed, linguistically aware
```
::

**Why the wrong way fails**: `LIKE '%word%'` wraps the column in a pattern match that can't use any index — it scans every row, compares the pattern, and returns unranked matches. For 1M rows, that's 1M string comparisons per query.

---

## Trigrams: Substring Search Without FTS

For substring search where FTS's stemming/stop-words aren't appropriate (product names, codes, identifiers):

::code-wrapper{language="sql"}
```sql
CREATE EXTENSION pg_trgm;

-- GIN index with trigram ops: accelerates LIKE/ILIKE and similarity matching
CREATE INDEX products_name_trgm ON products USING gin(name gin_trgm_ops);

-- These now use the GIN index (no full table scan):
SELECT * FROM products WHERE name LIKE '%phone%';     -- substring match
SELECT * FROM products WHERE name ILIKE '%PHONE%';    -- case-insensitive substring
SELECT * FROM products WHERE name % 'iphone';         -- similarity match (fuzzy)

-- Similarity score (0–1, higher = more similar)
SELECT name, similarity(name, 'iphone') AS sim
FROM products
WHERE name % 'iphone'
ORDER BY sim DESC
LIMIT 5;
```
::

Trigrams (3-character substrings) enable fast substring and fuzzy matching. Use `pg_trgm` for short-text/substring search; use FTS for natural-language document search.

---

## Choosing: FTS vs Trigrams vs LIKE

| Need | Use | Index |
|---|---|---|
| Natural-language documents (articles, descriptions), ranked | FTS (`tsvector`/`tsquery`) | GIN on tsvector |
| Substring search on short text (product names, codes) | `pg_trgm` | GIN with `gin_trgm_ops` |
| Exact prefix (`LIKE 'foo%'`) | B-tree index | B-tree |
| Simple equality | B-tree index | B-tree |
| Fuzzy/similarity matching | `pg_trgm` (`%` operator, `similarity()`) | GIN with `gin_trgm_ops` |

---

## 💡 Tips & Tricks

- **Idiom** — store the `tsvector` in a **generated column** (`GENERATED ALWAYS AS (...) STORED`): it's always in sync with the source text — no trigger needed, no stale vectors. Index the generated column with GIN.
- **Idiom** — use `setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')` to rank title matches above body matches — `ts_rank` incorporates the weights.
- **Performance** — always GIN-index the `tsvector`: without it, `@@` scans every document. A GIN index makes `@@` queries O(matches) instead of O(all documents).
- **Idiom** — use `websearch_to_tsquery` for user-facing search boxes: it accepts a user-friendly syntax (`"phrase" -exclude OR alternative`) without requiring users to know `&`/`|`/`!`.
- **Idiom** — use `ts_headline` to generate search-result snippets with highlighted terms: it's a built-in "search result preview" that beats manual substring-slicing in application code.
- **Idiom** — use `phraseto_tsquery` for exact phrase matching (`'quick' <-> 'brown' <-> 'fox'` — adjacent, in order) vs `to_tsquery` for boolean presence (`'quick' & 'brown' & 'fox'` — any order).
- **Idiom** — use prefix matching (`:*`) for typeahead search: `to_tsquery('english', 'post:*')` matches any lexeme starting with "post".
- **Portability** — PostgreSQL FTS is PostgreSQL-specific. MySQL has `FULLTEXT` indexes (`MATCH ... AGAINST`). SQLite has FTS5 (a separate virtual table module). The concepts (stemming, ranking, inverted index) are universal; the syntax isn't.

---

## ⚠️ Edge Cases & Gotchas

- **Stop words are removed**: `to_tsquery('english', 'the & fox')` drops `the` (a stop word), so it's just `'fox'`. `phraseto_tsquery` keeps positions, so phrase search still works correctly.
- **Stemming can over-match**: `to_tsquery('english', 'run')` matches "run", "running", "runs", "ran" (all stem to "run"). Good for search, bad for exact-term queries — use `LIKE` or trigrams for exact matching.
- **`ts_rank` is not normalized**: it's a sum of weighted frequencies, not a 0–1 score. Don't compare `ts_rank` across different queries — compare within a result set.
- **GIN index size**: a GIN index on a `tsvector` can be large (it's an inverted index of every lexeme). For huge tables, consider a partial index or periodic reindex.
- **Language matters**: `to_tsvector('english', ...)` uses English stemming/stop words. Use the right configuration for your content (`'spanish'`, `'german'`, etc.) — or `'simple'` for no stemming/stop words.
- **`'simple'` configuration**: no stemming, no stop words — treats every word as a literal lexeme. Useful for codes, identifiers, or non-natural-language text.
- **`tsvector` column must be kept in sync**: if you store it as a regular column (not generated), you need a trigger to update it on `INSERT`/`UPDATE`. Generated columns are the modern, maintenance-free way.
- **`phraseto_tsquery` vs `to_tsquery` with `<->`**: `phraseto_tsquery('a b c')` builds `'a' <-> 'b' <-> 'c'` (adjacent in order). `to_tsquery('a & b & c')` is "all three present, any order." Pick based on whether order/adjacency matters.
- **Prefix matching with `:*`**: `to_tsquery('english', 'post:*')` matches any lexeme starting with "post" — useful for typeahead. The `:*` must be on a single lexeme, not a phrase.
- **FTS doesn't do fuzzy spelling**: `to_tsquery('english', 'popstgres')` won't match "postgres" (different lexeme after stemming). For typo tolerance, use `pg_trgm`'s similarity operator (`%`) alongside FTS.
- **Diacritics handling**: the `'english'` configuration may or may not strip diacritics depending on the dictionary. For multilingual content with diacritics, configure the dictionary appropriately or use `'simple'`.
- **NULL handling**: `to_tsvector('english', NULL)` returns an empty tsvector, not NULL. `coalesce(col, '')` is still recommended for clarity.
- **tsvector position tracking**: positions are tracked per lexeme and used by `ts_rank_cd` (cover density) and phrase/proximity queries. If you rebuild the tsvector differently, positions change and phrase matching may break.

---

## 🧠 Spot the Bug

A developer indexes an article body for FTS and queries it, but gets no results for a search on "databases" even though the body contains the word "databases":

::code-wrapper{language="sql"}
```sql
-- Index built with 'english' config
CREATE INDEX articles_body_gin ON articles USING gin(to_tsvector('english', body));

-- Query built with 'simple' config (different!)
SELECT * FROM articles
WHERE to_tsvector('simple', body) @@ to_tsquery('simple', 'database');
```
::

<details>
<summary>Answer</summary>

**Configuration mismatch**: the index is built with `to_tsvector('english', body)` but the query uses `to_tsvector('simple', body)`. The `'english'` config stems "databases" → `'databas'`, while the `'simple'` config leaves it as `'database'` (no stemming). The tsquery `'database'` (from `'simple'`) doesn't match the tsvector's `'databas'` (from `'english'`) — different lexemes.

The index can't be used either — the query's expression (`to_tsvector('simple', body)`) doesn't match the index's expression (`to_tsvector('english', body)`).

::code-wrapper{language="sql"}
```sql
-- ✅ Fix 1: use the same configuration in both index and query
CREATE INDEX articles_body_gin ON articles USING gin(to_tsvector('english', body));

SELECT * FROM articles
WHERE to_tsvector('english', body) @@ to_tsquery('english', 'database');
-- 'database' stems to 'databas' (english), 'databases' stems to 'databas' (english) → MATCH
```
::

::code-wrapper{language="sql"}
```sql
-- ✅ Fix 2 (better): generated column — name the expression once, reuse the name
ALTER TABLE articles ADD COLUMN body_vec TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
CREATE INDEX articles_body_vec_gin ON articles USING gin(body_vec);

SELECT * FROM articles WHERE body_vec @@ to_tsquery('english', 'database');
-- No expression mismatch possible — the column is the indexed expression
```
::

**The lesson**: when indexing an expression, the query must use the **exact same expression** (including the text search configuration). Generated columns eliminate this class of bug by naming the expression once and reusing the name.

</details>

---

## Summary

You can now build full-text search with `tsvector`/`tsquery`/`@@`, weight and rank results with `setweight`/`ts_rank`, highlight with `ts_headline`, store vectors in generated columns with GIN indexes, and choose between FTS (natural language), `pg_trgm` (substring/fuzzy), and `LIKE` (prefix). Next: views and materialized views.