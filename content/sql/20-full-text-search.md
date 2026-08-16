# 20 — Full-Text Search

Full-text search (FTS) finds documents matching a query, ranked by relevance — far more powerful than `LIKE` for natural-language search. PostgreSQL has a built-in FTS engine via `tsvector`, `tsquery`, and GIN indexes.

## Why Not LIKE?

`LIKE '%word%'` has three problems:
1. **Slow** — leading wildcards defeat B-tree indexes (full table scan).
2. **No linguistic awareness** — `'running'` doesn't match `'run'` or `'ran'`.
3. **No relevance ranking** — you get matches, but no "best match first."

FTS solves all three: it's indexed (GIN), it stems words (`running` → `run`), and it ranks results by relevance.

## tsvector and tsquery

- **`tsvector`** — a document preprocessed into a sorted list of distinct words (lexemes), each with positions. This is the searchable form.
- **`tsquery`** — a query of lexemes combined with `&` (AND), `|` (OR), `!` (NOT), and `<->` (followed by).

::code-wrapper{language="sql"}
```sql
-- Convert text to a tsvector
SELECT to_tsvector('english', 'The quick brown fox jumps over the lazy dog');
--  'brown':3 'dog':9 'fox':4 'jump':5 'lazi':8 'quick':2

-- Convert a query string to a tsquery
SELECT to_tsquery('english', 'quick & fox');
--  'quick' & 'fox'

-- Phrase search (words in order, adjacent)
SELECT phraseto_tsquery('english', 'quick brown fox');
--  'quick' <-> 'brown' <-> 'fox'
``
::

The English text processor (the "text search configuration") lowercases, removes stop words ("the", "over", "the"), and stems ("jumps" → "jump", "lazy" → "lazi"). Different configurations exist for many languages (`'english'`, `'spanish'`, `'german'`, etc.).

## The Match Operator: `@@`

::code-wrapper{language="sql"}
```sql
-- Does the document match the query?
SELECT to_tsvector('english', 'The quick brown fox') @@ to_tsquery('english', 'quick & fox');
--  true

SELECT to_tsvector('english', 'The quick brown fox') @@ to_tsquery('english', 'quick & cat');
--  false
``
::

`@@` returns true if the tsvector contains all the tsquery's lexemes (with the specified boolean/phrase structure).

## Storing and Indexing

Store the `tsvector` in a **generated column** so it's always in sync with the source text, and index it with GIN:

::code-wrapper{language="sql"}
```sql
CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Generated tsvector combining title (weight A) and body (weight B)
  search_vec TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED
);

CREATE INDEX articles_search_vec_gin ON articles USING gin(search_vec);
``
::

`setweight` assigns a weight (A, B, C, D — A is most important) to each lexeme, so title matches rank higher than body matches. The `||` concatenates the two vectors.

### Querying with the index

::code-wrapper{language="sql"}
```sql
SELECT id, title, ts_rank(search_vec, query) AS rank
FROM articles, to_tsquery('english', 'postgres & index') query
WHERE search_vec @@ query
ORDER BY rank DESC
LIMIT 10;
``
::

`ts_rank` computes a relevance score (higher = better match). The GIN index accelerates the `@@` filter; `ts_rank` ranks the survivors.

## Search Features

### Boolean operators

::code-wrapper{language="sql"}
```sql
to_tsquery('english', 'postgres & index')      -- both terms
to_tsquery('english', 'postgres | mysql')      -- either term
to_tsquery('english', 'postgres & !mysql')     -- postgres, not mysql
```
::

### Phrase search

::code-wrapper{language="sql"}
```sql
phraseto_tsquery('english', 'full text search')   -- the three words in order, adjacent
-- 'full' <-> 'text' <-> 'search'

-- Proximity (within N words)
to_tsquery('english', 'quick <3> fox')   -- 'quick' and 'fox' within 3 positions
``
::

### Prefix matching

::code-wrapper{language="sql"}
```sql
to_tsquery('english', 'post:*')   -- matches 'postgres', 'posting', 'post', etc.
``
::

## Highlighting

::code-wrapper{language="sql"}
```sql
SELECT id, title,
  ts_headline('english', body, to_tsquery('english', 'postgres'), 'MaxWords=20')
FROM articles
WHERE search_vec @@ to_tsquery('english', 'postgres');
``
::

`ts_headline` returns a snippet of the body with the matched terms highlighted (by default, `<b>` tags, configurable).

## Trigrams: Substring Search Without FTS

For "substring search" (`LIKE '%foo%'`) where FTS's stemming/stop-words aren't appropriate (e.g., product names, codes), use the `pg_trgm` extension:

::code-wrapper{language="sql"}
```sql
CREATE EXTENSION pg_trgm;

CREATE INDEX products_name_trgm ON products USING gin(name gin_trgm_ops);

-- Now these use the index:
SELECT * FROM products WHERE name LIKE '%phone%';
SELECT * FROM products WHERE name ILIKE '%PHONE%';
SELECT * FROM products WHERE name % 'iphone';   -- similarity match
``
::

Trigrams (3-character substrings) enable fast substring and fuzzy (similarity) matching. Use `pg_trgm` for short-text/substring search; use FTS for natural-language document search.

## Choosing: FTS vs Trigrams vs LIKE

| Need | Use |
|---|---|
| Natural-language documents (articles, descriptions), ranked | FTS (`tsvector`/`tsquery`) |
| Substring search on short text (product names, codes) | `pg_trgm` |
| Exact prefix (`LIKE 'foo%'`) | B-tree index |
| Simple equality | B-tree index |
| Fuzzy/similarity matching | `pg_trgm` (`%` operator, `similarity()`) |

## 💡 Tips & Tricks

- **Idiom**: store the `tsvector` in a **generated column** (`GENERATED ALWAYS AS (...) STORED`) so it's always in sync with the source text — no trigger needed, no stale vectors after direct updates. Index the generated column with GIN.
- **Idiom**: use `setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')` to rank title matches above body matches — `ts_rank` incorporates the weights, so a title hit outranks a body hit.
- **Performance**: always GIN-index the `tsvector` — without it, `@@` scans every document. A GIN index on a `tsvector` column makes `@@` queries O(matches) instead of O(all documents).
- **Idiom**: use `ts_headline` to generate search-result snippets with highlighted terms — it's a built-in "search result preview" that beats manually substring-slicing the body in application code.
- **Portability**: PostgreSQL FTS is PostgreSQL-specific. MySQL has `FULLTEXT` indexes (`MATCH ... AGAINST`). SQLite has FTS5 (a separate virtual table module). The concepts (stemming, ranking, inverted index) are universal; the syntax isn't.

## ⚠️ Edge Cases & Gotchas

- **Stop words are removed**: `to_tsquery('english', 'the & fox')` drops `the` (a stop word), so it's just `'fox'`. This is usually fine, but `phraseto_tsquery('the quick brown fox')` keeps the positions, so phrase search still works.
- **Stemming can over-match**: `to_tsquery('english', 'run')` matches "run", "running", "runs", "ran" (all stem to "run"). Good for search, bad for exact-term queries — use `LIKE` or trigrams for exact matching.
- **`ts_rank` is not normalized**: it's a sum of weighted frequencies, not a 0–1 score. Don't compare `ts_rank` across different queries; compare within a result set.
- **GIN index size**: a GIN index on a `tsvector` can be large (it's an inverted index of every lexeme). For huge tables, consider a partial index or periodic reindex.
- **Language matters**: `to_tsvector('english', ...)` uses English stemming/stop words. Use the right configuration for your content (`'spanish'`, `'german'`, etc.) — or `'simple'` for no stemming/stop words (exact word matching).
- **`'simple'` configuration**: no stemming, no stop words — treats every word as a literal lexeme. Useful for codes, identifiers, or non-natural-language text.
- **`tsvector` column must be kept in sync**: if you store it as a regular column (not generated), you need a trigger to update it on `INSERT`/`UPDATE`. Generated columns are the modern, maintenance-free way.
- **`phraseto_tsquery` vs `to_tsquery` with `<->`**: `phraseto_tsquery('a b c')` builds `'a' <-> 'b' <-> 'c'` (adjacent in order). `to_tsquery('a & b & c')` is just "all three present, any order." Pick based on whether order/adjacency matters.
- **Prefix matching with `:*`**: `to_tsquery('english', 'post:*')` matches any lexeme starting with "post" — useful for typeahead search. The `:*` must be on a lexeme, not a phrase.
- **FTS doesn't do fuzzy spelling**: `to_tsquery('english', 'popstgres')` won't match "postgres" (it's a different lexeme after stemming). For typo tolerance, use `pg_trgm`'s similarity operator (`%`) alongside FTS.

## 🧠 Spot the Bug

A developer creates an FTS index on an article body and queries it, but gets no results for a search on "databases":

::code-wrapper{language="sql"}
```sql
CREATE INDEX articles_body_gin ON articles USING gin(to_tsvector('english', body));

SELECT * FROM articles WHERE to_tsvector('english', body) @@ to_tsquery('english', 'database');
``
::

The body contains the word "databases". What's the issue?

<details>
<summary>Answer</summary>

This actually *should* work — `to_tsquery('english', 'database')` stems to `'databas'`, and `to_tsvector('english', body)` stems "databases" to `'databas'` too, so they match. If it returns no results, the likely cause is that the **index isn't being used and the seq scan is correct but the body genuinely doesn't contain the word** — or there's a type/config mismatch.

But there's a subtler bug: the index is on `to_tsvector('english', body)`, and the query filters on `to_tsvector('english', body) @@ ...` — the expressions match, so the index *is* usable. The query should work.

The most common real-world version of this bug: **the developer indexed `to_tsvector('english', body)` but queried with `to_tsvector('simple', body)`** (or vice versa) — a different text search configuration produces different lexemes, so the index (built with `'english'`) can't serve a query built with `'simple'`. Or they indexed the column directly (`gin(body)`) which doesn't work for FTS — you must index the `to_tsvector(...)` expression.

The robust fix — store the `tsvector` in a generated column and index that, then query the column directly (no expression mismatch possible):

```sql
ALTER TABLE articles ADD COLUMN body_vec TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
CREATE INDEX articles_body_vec_gin ON articles USING gin(body_vec);
SELECT * FROM articles WHERE body_vec @@ to_tsquery('english', 'database');
```

**The lesson**: when indexing an expression, the query must use the *exact same expression* (including the text search configuration). Generated columns eliminate this class of bug by naming the expression once and reusing the name.

</details>

## Summary

You can now build full-text search with `tsvector`/`tsquery`/`@@`, weight and rank results with `ts_rank`, highlight with `ts_headline`, store vectors in generated columns with GIN indexes, and choose between FTS (natural language), `pg_trgm` (substring/fuzzy), and `LIKE` (prefix). Next: triggers — running code automatically on data changes.