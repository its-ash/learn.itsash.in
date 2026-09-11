# 19 — Recursive Queries

Recursive CTEs let a query refer to its own output — enabling tree traversal, graph walking, hierarchical aggregations, and iterative computations that aren't expressible in a single non-recursive query. They are the SQL-native way to express "repeat until done."

---

## The Structure

A recursive CTE has two parts combined by `UNION ALL`:

1. **Anchor** (base case) — a non-recursive query that seeds the recursion.
2. **Recursive case** — a query that references the CTE itself, joined to produce the next iteration.

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE descendant AS (
  -- Anchor: seed with the starting node (employee 1)
  SELECT id, name, manager_id
  FROM employees
  WHERE id = 1

  UNION ALL   -- must be UNION ALL (UNION dedupes per iteration — slower, different semantics)

  -- Recursive: join the previous iteration's output to find the next level
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id   -- find direct reports of the previous level
)
SELECT * FROM descendant;
```
::

Each iteration takes the **previous iteration's output** (not the accumulated set), joins it to `employees`, and produces the next level. The recursion stops when an iteration produces zero rows. The final result is the union of all iterations.

### Evaluation Model

::code-wrapper{language="text"}
```text
Iteration 0 (anchor):   {employee 1}                              → seed
Iteration 1:            join {employee 1} → {direct reports of 1}  → level 1
Iteration 2:            join {level 1}      → {reports of level 1} → level 2
  ...
Iteration N:            join {level N-1}    → {} (no more reports) → STOP
Result: UNION ALL of all iterations (anchor + level 1 + level 2 + ... + level N-1)
```
::

The working set is the **previous iteration's rows only** — not the full accumulated set. This is "linear recursion" per the SQL standard. The recursion terminates when an iteration produces zero new rows.

---

## Tree Traversal: Employee Hierarchy with Depth

::code-wrapper{language="sql"}
```sql
-- All descendants of employee 1, with their depth in the tree
WITH RECURSIVE descendant AS (
  -- Anchor: the root node, depth 0
  SELECT id, name, manager_id, 0 AS depth
  FROM employees
  WHERE id = 1

  UNION ALL

  -- Recursive: find reports of the previous level, increment depth
  SELECT e.id, e.name, e.manager_id, d.depth + 1
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id   -- previous iteration's rows only
)
SELECT id, name, depth FROM descendant ORDER BY depth, name;
--  id | name     | depth
--  1  | CEO      | 0
--  2  | VP Eng   | 1
--  3  | VP Sales | 1
--  4  | Eng Mgr  | 2
--  5  | Sales Mgr| 2
```
::

`depth` is a free byproduct of the recursion — increment it in the recursive case. Use it for limiting depth (`WHERE depth < 5`) or ordering breadth-first.

### Building the Full Path

::code-wrapper{language="sql"}
```sql
-- Each employee with their management chain as an array (root → current)
WITH RECURSIVE chain AS (
  -- Anchor: roots (employees with no manager), path starts with their own ID
  SELECT id, name, manager_id, ARRAY[id] AS path
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive: append current employee's ID to the parent's path
  SELECT e.id, e.name, e.manager_id, c.path || e.id
  FROM employees e
  JOIN chain c ON e.manager_id = c.id
)
SELECT id, name, path FROM chain;
--  id | name    | path
--  1  | CEO     | {1}
--  2  | VP Eng  | {1,2}
--  4  | Eng Mgr | {1,2,4}
```
::

The `path` array accumulates the chain from root to current node — `||` (array concatenation) builds it iteratively. This is also the basis for cycle detection.

---

## Bidirectional Traversal

The same table can be traversed up (toward roots) or down (toward leaves) — the difference is the join direction:

::code-wrapper{language="sql"}
```sql
-- Walk DOWN: find all descendants of employee 1 (reports, reports of reports, ...)
WITH RECURSIVE descendant AS (
  SELECT id, name, manager_id FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id   -- join: e's manager is d → d's reports
)
SELECT * FROM descendant;

-- Walk UP: find all ancestors of employee 5 (manager, manager's manager, ...)
WITH RECURSIVE ancestor AS (
  SELECT id, name, manager_id FROM employees WHERE id = 5
  UNION ALL
  SELECT e.id, e.name, e.manager_id
  FROM employees e
  JOIN ancestor a ON a.manager_id = e.id    -- join: a's manager is e → a's manager
)
SELECT * FROM ancestor;
--  id | name    | manager_id
--  5  | Eng Mgr | 2
--  2  | VP Eng  | 1
--  1  | CEO     | NULL
```
::

The join direction determines traversal direction: `e.manager_id = d.id` walks down (find reports); `a.manager_id = e.id` walks up (find managers).

---

## Cycle Detection

A graph with cycles (e.g., a→b→a) would recurse infinitely. PostgreSQL does NOT automatically detect cycles — it relies on the recursion producing zero new rows to terminate. In a true cycle, rows are produced forever (until memory or `statement_timeout`).

### Approach 1: Visited Array (Portable)

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE walk AS (
  -- Anchor: start node, visited array contains just this node
  SELECT id, ARRAY[id] AS visited
  FROM nodes WHERE id = 1

  UNION ALL

  -- Recursive: follow edges, append target to visited, skip if already visited
  SELECT n.id, w.visited || n.id
  FROM walk w
  JOIN edges e ON e.from_id = w.id              -- outgoing edges from current node
  JOIN nodes n ON n.id = e.to_id                -- target node
  WHERE NOT n.id = ANY(w.visited)               -- CYCLE DETECTION: skip already-visited
)
SELECT * FROM walk;
```
::

`NOT n.id = ANY(w.visited)` prevents re-entering a node already in the current path. This is the portable approach — works on all databases with recursive CTEs.

### Approach 2: CYCLE Clause (PostgreSQL 14+, Standard SQL)

::code-wrapper{language="sql"}
```sql
WITH RECURSIVE walk AS (
  SELECT id, ARRAY[id] AS path FROM nodes WHERE id = 1
  UNION ALL
  SELECT n.id, w.path || n.id
  FROM walk w
  JOIN edges e ON e.from_id = w.id
  JOIN nodes n ON n.id = e.to_id
  -- CYCLE clause: track id, set is_cycle flag when a cycle is detected
  CYCLE id SET is_cycle TO true DEFAULT false USING path
)
SELECT * FROM walk WHERE NOT is_cycle;   -- filter out cyclic rows
```
::

The `CYCLE` clause automatically detects when `id` repeats and sets `is_cycle = true`. `USING path` specifies the column to store the traversal path. This is cleaner but PostgreSQL 14+ only.

### Approach 3: UNION (Not UNION ALL) for Deduplication

::code-wrapper{language="sql"}
```sql
-- UNION (not UNION ALL) dedupes per iteration — slower but can break some cycles
WITH RECURSIVE walk AS (
  SELECT id FROM nodes WHERE id = 1
  UNION   -- ← dedupes: if the same row appears again, it's not "new" → eventually stops
  SELECT n.id
  FROM walk w JOIN edges e ON e.from_id = w.id JOIN nodes n ON n.id = e.to_id
)
SELECT * FROM walk;
```
::

`UNION` dedupes per iteration — if a cycle keeps producing the same rows, they're deduped to zero "new" rows and the recursion stops. But `UNION` is slower (sort/hash per iteration) and doesn't track the path. Use `UNION ALL` + explicit cycle detection for production.

---

## Graph Traversal: Shortest Path (BFS)

::code-wrapper{language="sql"}
```sql
-- Shortest path (in hops) from node 1 to all reachable nodes — BFS via recursive CTE
WITH RECURSIVE bfs AS (
  -- Anchor: all nodes directly reachable from node 1
  SELECT
    to_id        AS node,
    1            AS hops,
    ARRAY[from_id, to_id] AS path   -- path starts with source + first hop
  FROM edges
  WHERE from_id = 1

  UNION ALL

  -- Recursive: extend the path by one hop, skip visited nodes (cycle detection)
  SELECT
    e.to_id,
    b.hops + 1,
    b.path || e.to_id
  FROM bfs b
  JOIN edges e ON e.from_id = b.node
  WHERE NOT e.to_id = ANY(b.path)   -- don't revisit nodes in the current path
)
-- The recursive CTE produces all paths; take the minimum hops per node
SELECT node, MIN(hops) AS min_hops, array_agg(path ORDER BY hops) AS all_paths
FROM bfs
GROUP BY node
ORDER BY min_hops;
```
::

This is a breadth-first search expressed as a recursive CTE. Each iteration explores one more hop. The `MIN(hops)` in the outer query finds the shortest path. For weighted graphs, recursive CTEs are inefficient — use pgRouting or a dedicated graph algorithm.

---

## Complex Implementation: Bill-of-Materials Explosion

A multi-level product decomposition that aggregates quantities through the component tree, with cycle detection for safety:

::code-wrapper{language="sql"}
```sql
-- ============================================================================
-- Schema: bill of materials (products composed of sub-components, recursively)
-- ============================================================================
CREATE TABLE components (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_assembly BOOLEAN NOT NULL DEFAULT false   -- true = composed of sub-components
);

CREATE TABLE bom (
  assembly_id INT NOT NULL REFERENCES components(id),   -- parent product
  component_id INT NOT NULL REFERENCES components(id),  -- child component
  quantity INT NOT NULL DEFAULT 1,                       -- how many of this child per parent
  PRIMARY KEY (assembly_id, component_id)
);

-- Sample data: a "Bicycle" is made of a frame, wheels (each wheel has a rim + tire)
INSERT INTO components (id, name, is_assembly) VALUES
  (1, 'Bicycle', true),
  (2, 'Frame', false),
  (3, 'Wheel Assembly', true),
  (4, 'Rim', false),
  (5, 'Tire', false),
  (6, 'Spoke', false);

INSERT INTO bom (assembly_id, component_id, quantity) VALUES
  (1, 2, 1),    -- 1 Bicycle  → 1 Frame
  (1, 3, 2),    -- 1 Bicycle  → 2 Wheel Assemblies
  (3, 4, 1),    -- 1 Wheel    → 1 Rim
  (3, 5, 1),    -- 1 Wheel    → 1 Tire
  (3, 6, 12);   -- 1 Wheel    → 12 Spokes

-- ============================================================================
-- BOM explosion: decompose product 1 (Bicycle) into all leaf components
-- with total quantities aggregated through the tree
-- ============================================================================
WITH RECURSIVE bom_explosion AS (
  -- Anchor: direct children of the Bicycle, with their per-unit quantity
  SELECT
    b.component_id                                   AS component_id,
    c.name                                           AS component_name,
    b.quantity                                       AS total_quantity,
    ARRAY[b.assembly_id, b.component_id]             AS path,   -- cycle detection
    1                                                AS depth,
    NOT c.is_assembly                                AS is_leaf
  FROM bom b
  JOIN components c ON c.id = b.component_id
  WHERE b.assembly_id = 1   -- start from the Bicycle

  UNION ALL

  -- Recursive: for each assembly component, explode its sub-components
  -- Multiply quantity: parent's total × child's per-unit quantity
  SELECT
    b.component_id,
    c.name,
    be.total_quantity * b.quantity,                   -- aggregate quantity through the tree
    be.path || b.component_id,                        -- extend the path
    be.depth + 1,
    NOT c.is_assembly
  FROM bom_explosion be
  JOIN bom b ON b.assembly_id = be.component_id       -- explode assemblies only
  JOIN components c ON c.id = b.component_id
  WHERE NOT b.component_id = ANY(be.path)             -- CYCLE DETECTION: skip visited
)
-- ============================================================================
-- Result: all leaf components with their total quantities
-- ============================================================================
SELECT
  component_id,
  component_name,
  total_quantity,   -- total number of this component needed for 1 Bicycle
  depth
FROM bom_explosion
WHERE is_leaf       -- only leaf components (raw materials)
ORDER BY depth, component_name;
--  component_id | component_name | total_quantity | depth
--  2            | Frame          | 1              | 1
--  4            | Rim            | 2              | 2      (2 wheels × 1 rim)
--  5            | Tire           | 2              | 2      (2 wheels × 1 tire)
--  6            | Spoke          | 24             | 2      (2 wheels × 12 spokes)

-- Full explosion (all levels, including sub-assemblies)
SELECT component_id, component_name, total_quantity, depth, path
FROM bom_explosion
ORDER BY depth, component_name;

-- ============================================================================
-- Aggregation: total cost of a Bicycle from leaf component costs
-- ============================================================================
CREATE TABLE component_costs (
  component_id INT PRIMARY KEY REFERENCES components(id),
  unit_cost NUMERIC(10,2) NOT NULL
);

INSERT INTO component_costs VALUES
  (2, 150.00),   -- Frame: $150
  (4, 40.00),    -- Rim: $40
  (5, 25.00),    -- Tire: $25
  (6, 1.50);     -- Spoke: $1.50

SELECT
  SUM(be.total_quantity * cc.unit_cost) AS total_cost
FROM bom_explosion be
JOIN component_costs cc ON cc.component_id = be.component_id
WHERE be.is_leaf;
-- total_cost: 150 + (2×40) + (2×25) + (24×1.50) = 150 + 80 + 50 + 36 = 316.00
```
::

**Key mechanics**: the `total_quantity` is multiplied at each level (`be.total_quantity * b.quantity`), so a Bicycle needs 2 Wheels, each Wheel needs 12 Spokes, so 24 Spokes total. The `path` array provides cycle detection — if a component appears in its own ancestry, it's skipped.

---

## Multiple Anchors

A recursive CTE can have multiple anchor queries combined with `UNION ALL`:

::code-wrapper{language="sql"}
```sql
-- Find all employees reachable from EITHER employee 1 OR employee 10
WITH RECURSIVE descendant AS (
  -- Anchor 1: start from employee 1
  SELECT id, name, manager_id, 0 AS depth, ARRAY[id] AS path
  FROM employees WHERE id = 1

  UNION ALL

  -- Anchor 2: start from employee 10 (a different tree root)
  SELECT id, name, manager_id, 0 AS depth, ARRAY[id] AS path
  FROM employees WHERE id = 10

  UNION ALL

  -- Recursive case (shared by both anchors)
  SELECT e.id, e.name, e.manager_id, d.depth + 1, d.path || e.id
  FROM employees e
  JOIN descendant d ON e.manager_id = d.id
  WHERE NOT e.id = ANY(d.path)   -- cycle detection
)
SELECT DISTINCT id, name, depth FROM descendant ORDER BY depth, name;
```
::

Multiple anchors are useful when the recursion starts from multiple seed nodes (e.g., "find all descendants of these 5 managers").

---

## Iterative Computation: Fibonacci

::code-wrapper{language="sql"}
```sql
-- Fibonacci sequence via recursive CTE (iterative computation)
WITH RECURSIVE fib AS (
  -- Anchor: base cases F(0)=0, F(1)=1
  SELECT 0 AS n, 0::bigint AS a, 1::bigint AS b

  UNION ALL

  -- Recursive: shift (a, b) → (b, a+b), increment n
  SELECT n + 1, b, a + b
  FROM fib
  WHERE n < 10   -- termination condition (without it, runs until bigint overflow)
)
SELECT n, a FROM fib;
--  n  | a
--  0  | 0
--  1  | 1
--  2  | 1
--  3  | 2
--  4  | 3
--  5  | 5
--  6  | 8
--  7  | 13
--  8  | 21
--  9  | 34
--  10 | 55
```
::

The `WHERE n < 10` is the termination condition. Without it, the recursion runs until `a + b` overflows `bigint` — a very large number, but eventually an overflow error.

---

## Hierarchical Aggregation (Roll-Up)

::code-wrapper{language="sql"}
```sql
-- Each manager's total sales including their reports' totals (roll-up)
-- Approach: collect all descendants first, then aggregate in an outer query

WITH RECURSIVE descendant AS (
  -- Anchor: each employee is their own descendant (for self-inclusion)
  SELECT id AS root_id, id AS emp_id, manager_id, ARRAY[id] AS path
  FROM employees

  UNION ALL

  -- Recursive: find reports of the current node, track the root
  SELECT d.root_id, e.id, e.manager_id, d.path || e.id
  FROM descendant d
  JOIN employees e ON e.manager_id = d.emp_id
  WHERE NOT e.id = ANY(d.path)   -- cycle detection
)
-- For each root (manager), sum the sales of all their descendants (including themselves)
SELECT
  d.root_id AS manager_id,
  e.name AS manager_name,
  SUM(e2.sales) AS total_team_sales
FROM descendant d
JOIN employees e  ON e.id  = d.root_id   -- manager
JOIN employees e2 ON e2.id = d.emp_id    -- each descendant
GROUP BY d.root_id, e.name
ORDER BY total_team_sales DESC;
```
::

**Why not aggregate inside the recursion?** `GROUP BY`/aggregates in the recursive case are legal but tricky — the aggregation happens per iteration, not across all iterations. The clean approach: collect all descendants in the recursive CTE, then aggregate in the outer query.

---

## Recursion Limits and Safety

PostgreSQL has **no built-in `max_recursion_depth`** (unlike SQL Server's default 100). An infinite recursion runs until it exhausts memory or hits a statement timeout.

::code-wrapper{language="sql"}
```sql
-- Safety net: set a statement timeout before running recursive CTEs on untrusted data
SET statement_timeout = '10s';

-- Limit depth explicitly (for tree traversal where you know the max useful depth)
WITH RECURSIVE descendant AS (
  SELECT id, name, manager_id, 0 AS depth FROM employees WHERE id = 1
  UNION ALL
  SELECT e.id, e.name, e.manager_id, d.depth + 1
  FROM employees e JOIN descendant d ON e.manager_id = d.id
  WHERE d.depth < 10   -- hard depth limit: stop at level 10
)
SELECT * FROM descendant;
```
::

Always include a termination condition (a `WHERE` that eventually produces zero rows) AND set `statement_timeout` as a safety net.

---

## UNION vs UNION ALL in Recursion

| Property | `UNION ALL` | `UNION` |
|---|---|---|
| Deduplication | No (keeps all rows) | Yes (per iteration) |
| Speed | Faster (no sort/hash) | Slower (sort/hash per iteration) |
| Cycle prevention | ❌ No | ✅ Partial (same rows → stop) |
| Use case | Trees (no duplicates) | Graphs with simple cycles |

Use `UNION ALL` (keeps duplicates) — it's faster and the usual choice. `UNION` (dedupes) is slower but can prevent some infinite loops (a cycle that keeps producing the same rows won't grow). For tree traversal (no duplicates expected), `UNION ALL` is correct and fast.

---

## Anti-Pattern: Infinite Recursion on Cyclic Graphs

::code-wrapper{language="sql"}
```sql
-- ❌ WRONG: no cycle detection on a graph with a cycle (a→b→c→a)
WITH RECURSIVE walk AS (
  SELECT id FROM nodes WHERE id = 1
  UNION ALL
  SELECT n.id
  FROM walk w
  JOIN edges e ON e.from_id = w.id
  JOIN nodes n ON n.id = e.to_id
  -- No cycle detection → if the graph has a cycle, this runs FOREVER
)
SELECT * FROM walk;
-- Eventually: out of memory, or statement_timeout kills it

-- ✅ RIGHT: track visited nodes, skip already-visited
WITH RECURSIVE walk AS (
  SELECT id, ARRAY[id] AS visited
  FROM nodes WHERE id = 1
  UNION ALL
  SELECT n.id, w.visited || n.id
  FROM walk w
  JOIN edges e ON e.from_id = w.id
  JOIN nodes n ON n.id = e.to_id
  WHERE NOT n.id = ANY(w.visited)   -- CYCLE DETECTION
)
SELECT * FROM walk;
```
::

**Why the wrong way fails**: in a cyclic graph, each iteration re-visits nodes and produces their edges again. The working set never empties — the recursion runs until memory is exhausted or a timeout kills it.

---

## 💡 Tips & Tricks

- **Idiom** — add a `depth` column to recursive CTEs for tree traversal: it's a free byproduct (increment in the recursive case) and invaluable for limiting depth (`WHERE depth < 5`) or ordering breadth-first.
- **Idiom** — track the `path` (array of IDs from root to current node) in recursive traversals: it's the cycle-detection mechanism, the debugging aid (see the full chain), and the basis for shortest-path queries.
- **Safety** — set `statement_timeout` before running recursive CTEs on data that might have cycles: it's the safety net that prevents an infinite recursion from hanging the session.
- **Performance** — recursive CTEs are **iterative, not truly recursive**: each iteration is a full query, and the planner can't always optimize across iterations. For deep trees or large graphs, profile with `EXPLAIN ANALYZE` and consider a procedural loop with a temp table.
- **Idiom** — use `UNION ALL` (not `UNION`) for tree traversal: trees don't have duplicates, so `UNION ALL` is faster (no dedup overhead) and correct. Use `UNION` only when you need per-iteration deduplication for simple cycle prevention.
- **Idiom** — collect all descendants in the recursive CTE, then aggregate in the outer query: don't try to aggregate inside the recursion (aggregates happen per iteration, not across all iterations).
- **Portability** — `WITH RECURSIVE` is standard SQL (PostgreSQL, MySQL 8.0+, SQLite 3.8+). SQL Server infers recursion without the `RECURSIVE` keyword. Oracle uses `CONNECT BY`. The `CYCLE` clause is PostgreSQL 14+/standard.

---

## ⚠️ Edge Cases & Gotchas

- **Infinite recursion on cycles**: a graph cycle (a→b→a) recurses forever. Use a `path` array with `WHERE NOT id = ANY(path)` or the `CYCLE` clause (PostgreSQL 14+).
- **No `max_recursion_depth` in PostgreSQL**: unlike SQL Server (default 100), PostgreSQL recurses until termination or resource exhaustion. Always include a `WHERE` termination condition and/or `statement_timeout`.
- **The anchor and recursive cases must have matching columns**: same number, compatible types. Column names come from the anchor.
- **`GROUP BY`/aggregates in the recursive case**: legal but tricky — aggregation happens per iteration, not across all iterations. For roll-up, collect descendants first, then aggregate in the outer query.
- **`ORDER BY` in the recursive case is ignored**: order within each iteration is unspecified. Order the final result in the outer query.
- **`LIMIT` in the recursive case doesn't limit the recursion**: it limits each iteration's output, not the total. Use `LIMIT` in the outer query.
- **`WITH RECURSIVE` keyword**: forgetting `RECURSIVE` on a self-referencing CTE is a syntax error in PostgreSQL. (SQL Server infers recursion without the keyword; MySQL requires it.)
- **The recursive case sees only the previous iteration's output**: not the accumulated set. This is "linear recursion" per the standard.
- **Recursive CTEs are always materialized**: they can't be `MATERIALIZED`/`NOT MATERIALIZED` in PostgreSQL — each iteration depends on the prior's output, so materialization is inherent.
- **NULL in the recursive join**: if `manager_id` is NULL (root nodes), the join `e.manager_id = d.id` won't match them — roots are only included via the anchor, not the recursive case.
- **Self-referencing table edge case**: if the anchor and recursive case can produce the same row, `UNION ALL` includes it twice. Use `UNION` or a `path` check if uniqueness matters.

---

## 🧠 Spot the Bug

This recursive query to find all descendants of employee 1 runs on a hierarchy with a data cycle (a misguided data fix created employee 3's manager as employee 5, and employee 5's manager as employee 3). The query hangs and never returns.

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
```
::

<details>
<summary>Answer</summary>

There's no cycle detection. If the hierarchy has a cycle (employee 3 → manager 5 → manager 3 → ...), the recursion never terminates — each iteration keeps finding the cycle's rows, producing them again, forever.

::code-wrapper{language="sql"}
```sql
-- ✅ Fix 1: track visited nodes with a path array
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

::code-wrapper{language="sql"}
```sql
-- ✅ Fix 2: CYCLE clause (PostgreSQL 14+)
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

::code-wrapper{language="sql"}
```sql
-- ✅ Fix 3: safety net — set statement_timeout before running
SET statement_timeout = '10s';
-- Even without cycle detection, the query is killed after 10 seconds
```
::

**The lesson**: recursive CTEs on self-referencing data (`manager_id`, graph edges) must have cycle detection — either a `visited` array, the `CYCLE` clause, or a `statement_timeout` safety net. Without it, a single data cycle creates an infinite loop.

</details>

---

## Summary

You can now write recursive CTEs with an anchor and recursive case, traverse trees (down and up) with depth and path tracking, walk graphs with cycle detection, explode bills of materials with quantity aggregation, and express iterative computations — with termination conditions and `statement_timeout` as safety nets. Next: full-text search.