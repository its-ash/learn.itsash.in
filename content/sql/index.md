---
title: Learn SQL — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic SQL curriculum. 30 chapters covering SELECT, joins, aggregations, window functions, CTEs, transactions, indexing, normalization, JSON columns, recursive queries, performance tuning, and more. Go from beginner to pro SQL developer.
---

# 🗄️ Learn SQL — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic SQL curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro SQL developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 30).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the exercises** in chapter 30 against a real database.
4. **Read your database's docs** (PostgreSQL, MySQL, SQLite) alongside.

## Prerequisites

- A SQL database (PostgreSQL recommended; SQLite works for most chapters).
- A client tool (`psql`, DBeaver, or `sqlite3` CLI).
- Comfort with basic programming concepts.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/sql/01-introduction-and-setup) | Relational model, PostgreSQL/SQLite install, `psql`/`sqlite3`. |
| 02 | [SELECT Basics & Filtering](/sql/02-select-basics-and-filtering) | Projection, `WHERE`, comparison & logical operators. |
| 03 | [Sorting, Pagination & LIMIT](/sql/03-sorting-and-pagination) | `ORDER BY`, `LIMIT`/`OFFSET`, keyset pagination. |
| 04 | [Joins](/sql/04-joins) | `INNER`/`LEFT`/`RIGHT`/`FULL`/`CROSS`, join mechanics. |
| 05 | [Aggregation & GROUP BY](/sql/05-aggregation-and-group-by) | `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, `HAVING`, grouping quirks. |

### Part II — Query Composition

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Subqueries](/sql/06-subqueries) | Scalar, correlated, `EXISTS`/`IN`, semi/anti-joins. |
| 07 | [Common Table Expressions](/sql/07-common-table-expressions) | `WITH`, readability, chaining, materialization hints. |
| 08 | [Set Operations](/sql/08-set-operations) | `UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT`, column matching. |
| 09 | [Window Functions](/sql/09-window-functions) | `OVER`, `PARTITION BY`, frames, ranking, running totals. |
| 10 | [Data Types & NULL Handling](/sql/10-data-types-and-null) | Three-valued logic, `COALESCE`, `NULLIF`, type coercion. |

### Part III — Schema & Data Definition

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [Tables, Schemas & DDL](/sql/11-tables-and-ddl) | `CREATE`/`ALTER`/`DROP`, schemas, temporary tables. |
| 12 | [Constraints & Keys](/sql/12-constraints-and-keys) | `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `CHECK`, `NOT NULL`. |
| 13 | [Indexes & Performance](/sql/13-indexes-and-performance) | B-tree, partial, expression, composite, when indexes hurt. |
| 14 | [INSERT, UPDATE, DELETE](/sql/14-insert-update-delete) | DML, `RETURNING`, upsert, cascading deletes. |
| 15 | [Transactions & Isolation](/sql/15-transactions-and-isolation) | ACID, `BEGIN`/`COMMIT`/`ROLLBACK`, isolation levels, deadlocks. |

### Part IV — Advanced Querying

| # | Topic | Why It Matters |
|---|---|---|
| 16 | [Views & Materialized Views](/sql/16-views-and-materialized-views) | Virtual tables, refresh strategies, updatable views. |
| 17 | [Date & Time Handling](/sql/17-date-and-time) | `DATE`/`TIMESTAMP`/`INTERVAL`, time zones, DST traps. |
| 18 | [JSON & Array Columns](/sql/18-json-and-arrays) | `JSONB`, indexing JSON, array operators, unnesting. |
| 19 | [Recursive Queries](/sql/19-recursive-queries) | Recursive CTEs, tree traversal, graph patterns. |
| 20 | [Full-Text Search](/sql/20-full-text-search) | `tsvector`, ranking, `tsquery`, trigrams, `LIKE` vs FTS. |

### Part V — Programming in the Database

| # | Topic | Why It Matters |
|---|---|---|
| 21 | [Triggers & Events](/sql/21-triggers-and-events) | `BEFORE`/`AFTER`, statement vs row, audit tables. |
| 22 | [Stored Procedures & Functions](/sql/22-stored-procedures-and-functions) | `FUNCTION` vs `PROCEDURE`, PL/pgSQL, volatility. |
| 23 | [Sequences & Identifiers](/sql/23-sequences-and-identifiers) | `SERIAL`/`IDENTITY`/`SEQUENCE`, gaps, `currval`/`nextval`. |
| 24 | [Security, Roles & Permissions](/sql/24-security-and-roles) | `GRANT`/`REVOKE`, roles, RLS, least privilege. |

### Part VI — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 25 | [Normalization & Data Modeling](/sql/25-normalization) | 1NF–BCNF, denormalization tradeoffs, surrogate keys. |
| 26 | [Query Optimization & EXPLAIN](/sql/26-query-optimization) | `EXPLAIN ANALYZE`, seq vs index scans, join strategies. |
| 27 | [Advanced SQL Patterns](/sql/27-advanced-patterns) | Pivots, gaps-and-islands, running medians, histograms. |
| 28 | [Database Administration](/sql/28-database-administration) | Backups, `VACUUM`, replication, connection pooling. |
| 29 | [Common Pitfalls & Idiomatic Fixes](/sql/29-common-pitfalls) | 40+ traps and their fixes. |
| 30 | [Exercises & Project Ideas](/sql/30-exercises-and-projects) | From beginner to pro. |

## Learning Path Suggestions

### If you're new to databases

1. Read 01–10 in order.
2. Build a small schema (11–14) and insert real data.
3. Read 15 (Transactions) before writing any app code.
4. Do exercises 1–5 in chapter 30.

### If you're coming from a NoSQL background

Read 04 (Joins) and 05 (Aggregation) carefully — they're the core differentiator. Read 25 (Normalization) to understand why schemas exist. Skim 10 (NULL) — three-valued logic is a common surprise.

### If you're coming from a programming language

Read 06–09 (subqueries, CTEs, set ops, windows) — these are the "control flow" of SQL. Don't skip 10 (NULL) — `NULL = NULL` is `UNKNOWN`, not `TRUE`. Read 26 (EXPLAIN) early — query plans matter more than syntax.

### If you're a senior engineer

Skim 01–14. Read 09 (Windows), 15 (Isolation), 18 (JSON), 19 (Recursive), 26 (EXPLAIN) closely. Use 27 (Patterns) and 29 (Pitfalls) as references. Read 28 (Admin) for production readiness.

## Companion Resources

- [PostgreSQL Docs](https://www.postgresql.org/docs/) — the reference implementation used in most examples.
- [SQLite Docs](https://www.sqlite.org/docs.html) — embedded SQL, great for learning.
- [Use The Index, Luke](https://use-the-index-luke.com) — indexing explained deeply.
- [SQL Performance Explained](https://sql-performance-explained.com) — index mechanics.
- [pgexercises.com](https://pgexercises.com) — interactive practice.
- [Mode SQL Tutorial](https://mode.com/sql/tutorial) — guided examples.

## Tooling to Install

::code-wrapper{language="bash"}
```bash
# PostgreSQL (macOS)
brew install postgresql@16
brew services start postgresql@16
psql postgres

# SQLite
brew install sqlite
sqlite3 practice.db

# Or use Docker
docker run --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
psql -h localhost -U postgres
```
::

## License

These notes are yours to use, share, and modify.

🗄️