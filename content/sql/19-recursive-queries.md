# 19 — Recursive Queries

Recursive CTEs let a query refer to its own output — enabling tree traversal, graph walking, hierarchical aggregations, and iterative computations that aren't expressible in a single non-recursive query.

## The Structure

A recursive CTE has two parts combined by `UNION ALL`:

1. **Base case** (the anchor) — a non-recursive query that seeds the recursion.
2. **Recursive case** — a query that references the CTE itself.

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE descendant AS (
  -- Anchor: start with employee 1
  SELECT id, name, manager_id FROM employees WHERE id = 1

  UNION ALL

  -- Recursive: find direct reports of the previous iteration's employees
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id
)
SELECT * FROM descendant;
```
::

Each iteration takes the previous iteration's output, joins it to `employees`, and produces the next level. The recursion stops when an iteration produces zero rows. The final result is the union of all iterations.

## How It Evaluates

::code-wrapper{language="text"}
```text
Iteration 0: anchor → {employee 1}
Iteration 1: join {employee 1} to employees → {direct reports of 1}
Iteration 2: join {iter 1 results} to employees → {direct reports of iter 1}
...
Iteration N: produces {} → stop
Result: UNION ALL of all iterations
```
::

The working set shrinks each iteration (in a finite hierarchy) — the recursion terminates when no new rows are produced.

## Tree Traversal: Employee Hierarchy

::code-wrapper{language="sql"}
```sql
-- All descendants of employee 1, with their depth in the tree
WITH RECURSIVE descendant AS (
  SELECT id, name, manager_id, 0 AS depth
  FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, d.depth + 1
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id
)
SELECT id, name, depth FROM descendant ORDER BY depth, name;
```
::

### Building the full path

::code-wrapper{language="sql"}
```sql
-- Each employee with their management chain as an array
WITH RECURSIVE chain AS (
  SELECT id, name, manager_id, ARRAY[id] AS path
  FROM employees WHERE manager_id IS NULL   -- roots
  UNION ALL
  SELECT e.id, e.name, e.manager_id, c.path || e.id
  FROM employees e
  JOIN chain c ON e.manager_id = c.id
)
SELECT id, name, path FROM chain;
```
::

The `path` array accumulates the chain from root to the current node — `array_append`/`||` builds it iteratively.

## Bidirectional Traversal

The same table can be traversed up (toward roots) or down (toward leaves):

::code-wrapper{language="sql"}
```sql
-- All ancestors of employee 5 (walk up)
WITH RECURSIVE ancestor AS (
  SELECT id, name, manager_id FROM employees WHERE id = 5
  UNION ALL
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN ancestor a ON a.manager_id = e.id   -- join on the previous row's manager
)
SELECT * FROM ancestor;
```
::

The difference is the join direction: `e.manager_id = d.id` walks down (find reports); `a.manager_id = e.id` walks up (find managers).

## Cycle Detection

A graph with cycles (e.g., a→b→a) would recurse infinitely. PostgreSQL detects this only via the **cycle not producing new rows** — in a true cycle, it loops forever (until `max_recursion_depth` or memory limits). Use explicit cycle detection with a `path` array:

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE walk AS (
  SELECT id, ARRAY[id] AS visited
  FROM nodes WHERE id = 1
  UNION ALL
  SELECT n.id, w.visited || n.id
  FROM nodes n
  JOIN edges e ON e.from_id = w.id
  JOIN nodes n ON n.id = e.to_id
  JOIN walk w ON true
  WHERE NOT n.id = ANY(w.visited)   -- don't revisit
)
SELECT * FROM walk;
```
::

Or use the standard `CYCLE` clause (PostgreSQL 14+):

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE walk AS (
  SELECT id, ARRAY[id] AS path FROM nodes WHERE id = 1
  UNION ALL
  SELECT n.id, w.path || n.id
  FROM walk w
  JOIN edges e ON e.from_id = w.id
  JOIN nodes n ON n.id = e.to_id
  CYCLE id SET is_cycle TO true DEFAULT false USING path
)
SELECT * FROM walk WHERE NOT is_cycle;
```
::

## Graph Traversal

Recursive CTEs work for general graphs, not just trees:

::code-wrapper{language="sql"}
```sql
-- Shortest path (in hops) from node 1 to all reachable nodes
WITH RECURSIVE bfs AS (
  SELECT to_id AS node, 1 AS hops, ARRAY[from_id, to_id] AS path
  FROM edges WHERE from_id = 1
  UNION ALL
  SELECT e.to_id, b.hops + 1, b.path || e.to_id
  FROM bfs b
  JOIN edges e ON e.from_id = b.node
  WHERE NOT e.to_id = ANY(b.path)   -- avoid cycles
)
SELECT node, MIN(hops) AS min_hops FROM bfs GROUP BY node ORDER BY min_hops;
``
::

This is a breadth-first search expressed as a recursive CTE. For shortest-path on weighted graphs, recursive CTEs are inefficient — use pgRouting or a dedicated graph algorithm.

## Iterative Computation: Fibonacci

Recursive CTEs can express iterative numeric computations:

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE fib AS (
  SELECT 0 AS n, 0 AS a, 1 AS b
  UNION ALL
  SELECT n + 1, b, a + b FROM fib WHERE n < 10
)
SELECT n, a FROM fib;
--  n | a
-- ---+---
--  0 | 0
--  1 | 1
--  2 | 1
--  3 | 2
--  ... up to n=10
```
::

The `WHERE n < 10` is the termination condition (the anchor plus 10 recursive steps). Without it, the recursion runs until `a + b` overflows `bigint` — a very large number.

## Hierarchical Aggregation

Compute aggregates up a tree (each manager's total including their reports' totals):

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE tree AS (
  -- Leaves: each employee's own sales
  SELECT id, manager_id, sales AS total_sales
  FROM employees
  UNION ALL
  -- Aggregate: a manager's total = own sales + sum of reports' totals
  SELECT e.id, e.manager_id, e.sales + sum(reports.total_sales)
  FROM employees e
  JOIN tree reports ON reports.manager_id = e.id
  GROUP BY e.id, e.manager_id, e.sales
)
SELECT id, total_sales FROM tree WHERE id = 1;   -- the CEO's total
```
::

This is tricky — the recursion produces multiple rows per manager (one per iteration as reports roll up), and deduplication/aggregation must be handled carefully. Often, a recursive CTE that collects all descendants, then a `GROUP BY` aggregate, is cleaner than aggregating inside the recursion.

## Recursion Limits

PostgreSQL has no built-in `max_recursion_depth` (unlike SQL Server's default 100). An infinite recursion runs until it exhausts memory or hits a statement timeout. Always include a termination condition (a `WHERE` that eventually produces zero rows), and set a `statement_timeout` as a safety net:

::code-wrapper{language="sql"}
```sql
SET statement_timeout = '10s';
```
::

## UNION vs UNION ALL in Recursion

Use `UNION ALL` (keeps duplicates) — it's faster and the usual choice. `UNION` (dedupes) is slower (sort/hash per iteration) but can prevent some infinite loops (a cycle that keeps producing the same rows won't grow). For tree traversal (no duplicates expected), `UNION ALL` is correct and fast.

## 💡 Tips & Tricks

- **Idiom**: add a `depth` column to recursive CTEs for tree traversal — it's a free byproduct (increment it in the recursive case) and invaluable for limiting depth (`WHERE depth < 5`) or ordering the output breadth-first.
- **Idiom**: track the `path` (array of IDs from root to current node) in recursive traversals — it's the cycle-detection mechanism (skip visited nodes), the debugging aid (see the full chain), and the basis for shortest-path queries.
- **Performance**: recursive CTEs are **iterative, not truly recursive** — each iteration is a full query, and the planner can't always optimize across iterations. For deep trees or large graphs, a single recursive CTE can be slower than a procedural loop with a temp table. Profile with `EXPLAIN ANALYZE`.
- **Idiom**: set a `statement_timeout` before running recursive CTEs on data that might have cycles — it's the safety net that prevents an infinite recursion from hanging your session or exhausting memory.
- **Portability**: `WITH RECURSIVE` is standard SQL and supported by PostgreSQL, MySQL 8.0+, SQLite 3.8+, SQL Server (via `WITH` — SQL Server infers recursion), Oracle (via `CONNECT BY`). The `CYCLE` clause is PostgreSQL 14+/standard; cycle detection via a `path` array is the portable approach.

## ⚠️ Edge Cases & Gotchas

- **Infinite recursion on cycles**: a graph cycle (a→b→a) recurses forever. Use a `path` array with `WHERE NOT id = ANY(path)` to avoid revisiting, or the `CYCLE` clause (PostgreSQL 14+).
- **`UNION` (not `UNION ALL`) dedupes per iteration**: slower, but can stop a cycle that keeps producing the same rows. For trees (no duplicates), `UNION ALL` is faster and correct.
- **No `max_recursion_depth` in PostgreSQL**: unlike SQL Server (default 100), PostgreSQL recurses until termination or resource exhaustion. Always include a `WHERE` termination condition and/or `statement_timeout`.
- **The anchor and recursive cases must have matching columns**: same number, compatible types. The column names come from the anchor.
- **`GROUP BY`/aggregates in the recursive case**: legal but tricky — the aggregation happens per iteration, not across all iterations. For "roll-up" aggregations, collect all descendants first, then aggregate in an outer query.
- **`ORDER BY` in the recursive case is ignored**: the order within each iteration is unspecified; order the final result in the outer query.
- **`LIMIT` in the recursive case doesn't limit the recursion**: it limits each iteration's output, not the total. To limit the total, use `LIMIT` in the outer query.
- **`WITH RECURSIVE` keyword**: forgetting `RECURSIVE` on a self-referencing CTE is a syntax error in PostgreSQL. (SQL Server infers recursion without the keyword; MySQL requires it.)
- **Recursion references only the CTE's prior iteration**: the recursive case sees the *previous iteration's* output, not the accumulated output. This is "linear recursion" per the standard. (Some engines allow more, but stick to the standard.)
- **Recursive CTEs can't be `MATERIALIZED`/`NOT MATERIALIZED` in PostgreSQL**: they're always materialized (by necessity — each iteration depends on the prior).

## 🧠 Spot the Bug

This recursive query to find all descendants of employee 1 returns an error on a hierarchy with a cycle (a misguided data fix created a loop). What's missing?

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE descendant AS (
  SELECT id, name, manager_id FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id
)
SELECT * FROM descendant;
``
::

<details>
<summary>Answer</summary>

There's no cycle detection. If the hierarchy has a cycle (e.g., employee 3's manager is employee 5, and employee 5's manager is employee 3), the recursion never terminates — each iteration keeps finding the cycle's rows, producing them again, forever. Eventually it exhausts memory or hits `statement_timeout`, but until then it's a runaway query.

The fix — track the visited path and skip already-visited nodes:

```sql
WITH RECURSIVE descendant AS (
  SELECT id, name, manager_id, ARRAY[id] AS visited
  FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, d.visited || e.id
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id
  WHERE NOT e.id = ANY(d.visited)   -- skip if already in the chain
)
SELECT id, name, manager_id FROM descendant;
```
::
`visited` accumulates the chain of IDs from the root; `WHERE NOT e.id = ANY(d.visited)` prevents re-entering a node already in the current path. This breaks cycles without altering the tree-traversal semantics for acyclic data.

Alternatively, use the `CYCLE` clause (PostgreSQL 14+):

```sql
WITH RECURSIVE descendant AS (
  SELECT id, name, manager_id FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id
  FROM employees e JOIN descendant d ON e.manager_id = d.id
  CYCLE id SET is_cycle TO true DEFAULT false
)
SELECT id, name, manager_id FROM descendant WHERE NOT is_cycle;
```
::
And as a safety net, set `statement_timeout` before running recursive CTEs on data with unknown integrity:

```sql
SET statement_timeout = '10s';
```
::
**The lesson**: recursive CTEs on self-referencing data (manager_id, graph edges) must have cycle detection — either a `visited` array with `NOT id = ANY(visited)`, the `CYCLE` clause, or a `statement_timeout` safety net. Without it, a single data cycle creates an infinite loop.

</details>

## Summary

You can now write recursive CTEs with an anchor and a recursive case, traverse trees (down and up) with depth and path tracking, walk graphs with cycle detection, and express iterative computations — with termination conditions and `statement_timeout` as safety nets. Next: full-text search.