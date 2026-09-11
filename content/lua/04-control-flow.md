---
title: Lua 04 — Control Flow, Dispatch Tables & Iterator Protocols
description: Deep-dive into Lua's control flow: if/elseif as statements (not expressions), numeric/generic for loops with custom iterators, goto for state machines, table dispatch as switch replacement, and the iterator protocol (stateless, stateful, and coroutine-based).
---

# 04 — Control Flow, Dispatch Tables & Iterator Protocols

Lua's control flow is minimal: `if`/`elseif`/`else`, `while`, `repeat`/`until`, numeric `for`, generic `for` (iterator protocol), `break`, `goto`/labels, and `return`. No `switch`, no `continue`, no ternary expression. Production Lua replaces these with **table dispatch** (O(1) switch), **custom iterators** (the `for k, v in iter() do` protocol), and **goto for state machines**.

## `if`/`elseif`/`else` — Statement, Not Expression

::code-wrapper{language="lua"}
```lua
-- if is a STATEMENT — no value, can't use inline in expressions
local x = 10
if x > 5 then
  print("big")
elseif x > 0 then
  print("medium")
else
  print("small")
end

-- No ternary. `and`/`or` short-circuit is the closest, but with a trap:
local x = false
local result = x and "yes" or "no"  -- "no" (correct here)

local y = nil
local result2 = y and "yes" or "no"  -- "no" (correct here)

-- TRAP: if the "true" branch value is itself falsy, or returns the wrong thing
local z = true
local bad = z and nil or "fallback"  -- "fallback" — BUG: wanted nil when z is true!
-- Because: z and nil → nil (falsy), so `or "fallback"` → "fallback"

-- Safe ternary: wrap in a table to force truthiness
local safe = z and {nil} or {"fallback"}  -- always a 1-element table
local value = safe[1]  -- nil or "fallback" (unwrapped correctly)

-- Production: just use if/else. It's clearer and has no trap.
local value
if z then value = nil else value = "fallback" end
```
::

## Numeric `for` — Precise Semantics

::code-wrapper{language="lua"}
```lua
-- for v = e1, e2, e3 do ... end
-- e1=start, e2=limit, e3=step (default 1)
-- Evaluates e1, e2, e3 ONCE before the loop (then iterates with integer/float math)

-- Integer loop: exact, stops when v > limit (for positive step)
for i = 1, 5 do print(i) end     -- 1 2 3 4 5
for i = 5, 1, -1 do print(i) end -- 5 4 3 2 1
for i = 0, 10, 2 do print(i) end -- 0 2 4 6 8 10

-- Float loop: CAUTION — floating point error accumulates
for i = 0.1, 1.0, 0.1 do print(i) end
-- Prints: 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 — but only by luck
-- 0.1+0.1+0.1 = 0.30000000000000004 in float — loop may stop early or late

-- SAFE float loop: use integer counter, compute float from it
for i = 1, 10 do
  local x = i * 0.1  -- 0.1, 0.2, ... 1.0 (exact multiplication, no accumulation)
  print(x)
end

-- Loop variable is local to the loop body — fresh each iteration (for closures)
local fns = {}
for i = 1, 3 do
  fns[i] = function() return i end  -- each captures its own i (per-iteration local)
end
print(fns[1](), fns[2](), fns[3]())  -- 1 2 3 (NOT 3 3 3)
```

### Edge case: `for` with NaN or inf limits

::code-wrapper{language="lua"}
```lua
for i = 1, math.huge do
  if i > 100 then break end  -- infinite loop without break: math.huge as limit
end

-- NaN limit: loop body never executes (NaN comparisons are always false)
for i = 1, 0/0 do print("never") end  -- 0/0 = NaN; i <= NaN is false; no iterations

-- Zero step: infinite loop (v never changes)
-- for i = 1, 5, 0 do print(i) end  -- INFINITE LOOP — never terminates
```
::

## Generic `for` — The Iterator Protocol

The generic `for` loop: `for var_1, ..., var_n in explist do ... end` desugars to:

```lua
do
  local f, s, var = explist      -- iterator function, state, initial control variable
  while true do
    local results = f(s, var)     -- call: f(state, prev_control_var)
    var = results[1]              -- (but using actual MRV: var1, var2, ... = f(s, var))
    if var == nil then break end  -- loop ends when first return value is nil
    -- loop body with var1, ..., varn in scope
  end
end
```

::code-wrapper{language="lua"}
```lua
-- ipairs: stateless iterator over array part (1..n)
-- f = ipairs iterator fn, s = the table, var = current index (starts at 0)
local function ipairs_iter(t, i)
  i = i + 1
  local v = t[i]
  if v ~= nil then return i, v end  -- return (index, value) — nil v ends loop
  return nil                         -- first return nil → loop terminates
end
local function my_ipairs(t) return ipairs_iter, t, 0 end

for i, v in my_ipairs({10, 20, 30}) do print(i, v) end
-- 1 10 / 2 20 / 3 30

-- pairs: iterate ALL keys (array + hash), order undefined
-- Uses next() as the iterator: next(t, k) returns (next_key, next_value) or nil
for k, v in pairs({a = 1, b = 2}) do print(k, v) end  -- a 1 / b 2 (or b 2 / a 1)
```

### Custom iterator: reverse range (stateless)

::code-wrapper{language="lua"}
```lua
-- Stateless: no closure allocation per iteration — pure function + state + control
local function rev_iter(t, i)
  i = i - 1
  if i >= 1 then return i, t[i] end  -- return (index, value); nil ends loop
  return nil
end

local function reverse_ipairs(t)
  return rev_iter, t, #t + 1  -- f, s, initial_var (start one past end)
end

for i, v in reverse_ipairs({"a", "b", "c"}) do print(i, v) end
-- 3 c / 2 b / 1 a
```

### Custom iterator: stateful (closure-based)

::code-wrapper{language="lua"}
```lua
-- Closure-based: returns a single function that maintains state internally
-- Simpler to write, but allocates a closure per iteration start
local function range(start, stop, step)
  step = step or 1
  local i = start - step
  return function()
    i = i + step
    if (step > 0 and i <= stop) or (step < 0 and i >= stop) then
      return i
    end
  end
end

for x in range(1, 5) do print(x) end       -- 1 2 3 4 5
for x in range(10, 2, -2) do print(x) end  -- 10 8 6 4 2

-- Generator: fibonacci sequence (infinite — caller controls termination)
local function fib()
  local a, b = 0, 1
  return function()
    a, b = b, a + b  -- parallel assignment: RHS evaluated first
    return a
  end
end

local f = fib()
for i = 1, 10 do
  io.write(f(), " ")
end
-- 1 1 2 3 5 8 13 21 34 55
```
::

### Iterator with coroutine (see ch11 for full coroutines)

::code-wrapper{language="lua"}
```lua
-- Coroutines enable complex iteration (e.g., tree traversal) as a simple for-loop
local function tree_preorder(node)
  return coroutine.wrap(function()
    local function visit(n)
      if not n then return end
      coroutine.yield(n.value)        -- yield each value
      for _, child in ipairs(n.children or {}) do
        visit(child)                   -- recurse, yields propagate up
      end
    end
    visit(node)
  end)
end

-- Usage: iterate tree like an array, no stack management needed
for value in tree_preorder(root_node) do
  print(value)
end
```
::

## `while` and `repeat`/`until`

::code-wrapper{language="lua"}
```lua
-- while: check before each iteration (may run zero times)
local i = 1
while i <= 5 do
  print(i)
  i = i + 1
end

-- repeat-until: check AFTER each iteration (runs at least once)
-- Until condition is checked with access to loop-body locals
local input
repeat
  io.write("Enter y/n: ")
  input = io.read()
until input == "y" or input == "n"  -- can see `input` (body-local visible to until)

-- CRITICAL: until condition sees locals from the LAST iteration of the body
-- But NOT from a prior iteration (each iteration's locals are fresh)
```

### `break` and the missing `continue`

::code-wrapper{language="lua"}
```lua
-- break exits the INNERMOST loop only
for i = 1, 3 do
  for j = 1, 3 do
    if j == 2 then break end  -- exits inner loop, outer continues
    print(i, j)
  end
end
-- 1 1 / 2 1 / 3 1

-- No continue in Lua. Options:

-- 1. Wrap body in `if not skip then ... end`
for i = 1, 10 do
  if i % 2 == 0 then  -- skip even
    -- nothing
  else
    print(i)  -- only odd
  end
end

-- 2. goto (Lua 5.2+) — clean continue replacement
for i = 1, 10 do
  if i % 2 == 0 then goto continue end
  print(i)
  ::continue::
end

-- 3. Extract to function with early return (cleanest for complex logic)
local function process(i)
  if i % 2 == 0 then return end  -- skip
  print(i)
end
for i = 1, 10 do process(i) end
```
::

## `goto` — Structured Escape & State Machines

::code-wrapper{language="lua"}
```lua
-- goto is available in Lua 5.2+. Cannot jump into a local variable's scope,
-- cannot jump out of a function, cannot jump into a block's local scope.

-- Pattern 1: multi-level break (break only exits one loop)
for i = 1, 10 do
  for j = 1, 10 do
    if found_at(i, j) then goto found end
  end
end
::found::
print("exited both loops")

-- Pattern 2: continue (shown above)

-- Pattern 3: state machine without function call overhead
local function parse_header(text)
  ::read_key::
  local key = read_token(text)
  if key == "" then goto done end
  ::read_colon::
  if peek_char() ~= ":" then goto error end
  consume_char()
  ::read_value::
  local value = read_token(text)
  store(key, value)
  goto read_key
  ::error::
  return nil, "parse error at key: " .. key
  ::done::
  return true
end
```

### Anti-pattern: goto for general control flow

::code-wrapper{language="lua"}
```lua
-- BAD: goto used as a replacement for normal control flow — unreadable spaghetti
goto step3
::step1::
do_something()
::step2::
do_other()
::step3::
goto step1  -- infinite goto loop — use `while true` instead

-- GOOD: goto is ONLY for: (1) multi-level break, (2) continue, (3) state machines
-- where the state transitions are the logic, not a sequence of steps.
```
::

## Table Dispatch — O(1) Switch Replacement

::code-wrapper{language="lua"}
```lua
-- No switch in Lua. Table of functions is the idiomatic, performant replacement.
local handlers = {
  ["GET"]    = function(req) return fetch_resource(req.path) end,
  ["POST"]   = function(req) return create_resource(req.body) end,
  ["PUT"]    = function(req) return update_resource(req.path, req.body) end,
  ["DELETE"] = function(req) return delete_resource(req.path) end,
  ["PATCH"]  = function(req) return patch_resource(req.path, req.body) end,
}

local function route(req)
  local handler = handlers[req.method]  -- O(1) hash lookup, not O(n) elseif chain
  if not handler then
    return 405, "method not allowed"
  end
  return handler(req)
end

-- Dispatch with default handler:
local function dispatch(event, ...)
  local handler = handlers[event] or default_handler  -- fallback
  return handler(...)
end

-- Pattern: command registry with metadata
local commands = {}
local function register_cmd(name, fn, help)
  commands[name] = {fn = fn, help = help or ""}
end

register_cmd("help", function()
  for name, cmd in pairs(commands) do
    print(name, cmd.help)
  end
end, "show this help")
register_cmd("quit", function() os.exit(0) end, "exit program")

-- Runtime extensible: add commands without touching the dispatch code
register_cmd("version", function() print("v1.0") end, "show version")
```

### Edge case: dispatch table with integer keys vs string keys

::code-wrapper{language="lua"}
```lua
-- Integer keys and string keys that look like integers are DIFFERENT keys
local t = {}
t[1] = "array index 1"
t["1"] = "string key '1'"
print(t[1])    -- "array index 1"
print(t["1"]) -- "string key '1'"
print(t[1.0]) -- "array index 1" (1.0 == 1 in Lua; same key)

-- HTTP status codes: use integer keys, not string
local status_texts = {
  [200] = "OK",
  [404] = "Not Found",
  [500] = "Internal Server Error",
}
print(status_texts[404])  -- "Not Found" (integer key)
print(status_texts["404"]) -- nil (string key — different!)
```
::

## Comparison & Logical Operators

::code-wrapper{language="lua"}
```lua
-- Comparison: ==, ~= (NOT !=), <, >, <=, >=
5 == 5.0   -- true (mathematically equal, int vs float)
"5" == 5   -- false (different types — no coercion in ==)
nil == nil -- true
{} == {}   -- false (table identity comparison, not content)
local t = {}
t == t     -- true (same reference)

-- Metamethod __eq: only called if both operands are tables (or userdata),
-- AND they are NOT the same object, AND both have the same __eq metamethod.
-- (Not called for different types, not called if either is nil/number/string)

-- Logical: and, or, not (lowercase, no && || !)
-- Short-circuit: return the VALUE, not a boolean (like JS, unlike Python's True/False)
true and "yes"        -- "yes" (and returns 2nd operand if 1st is truthy)
false and "yes"       -- false (and returns 1st if it's falsy)
nil and "yes"         -- nil
true or "yes"         -- true (or returns 1st if truthy)
false or "yes"        -- "yes" (or returns 2nd if 1st is falsy)
nil or "yes"          -- "yes"
not nil               -- true (not DOES return boolean)
not false             -- true
not 0                -- false (0 is truthy!)
not ""               -- false ("" is truthy!)
```

## `do`/`end` — Explicit Scope Blocks

::code-wrapper{language="lua"}
```lua
-- do...end creates a lexical scope without a loop or condition
-- Use for: limiting variable lifetime, cleanup, isolating locals

do
  local large_buffer = allocate_megabyte()
  process(large_buffer)
  -- large_buffer goes out of scope here → eligible for GC immediately
end
-- large_buffer is nil here — not holding memory

-- Pattern: resource lifecycle with do/end
do
  local file <close> = io.open("data.txt", "r")  -- Lua 5.4: <close> auto-closes
  local data = file:read("*a")
  process(data)
  -- file:close() called automatically at end of block (even on error)
end
```

## 💡 Tips & Tricks

**Use `goto continue` for clean skip logic**: Better than nested `if` or extracting functions when the skip condition is simple.

::code-wrapper{language="lua"}
```lua
for _, item in ipairs(items) do
  if not validate(item) then goto continue end
  if item.skip then goto continue end
  process(item)
  ::continue::
end
```
::

**Build custom iterators instead of manual indexing**: `for x in my_iter() do` is cleaner and less error-prone than `for i = 1, #t do local x = t[i] end`.

::code-wrapper{language="lua"}
```lua
-- Stateless iterator for iterating two tables in parallel (zip)
local function zip_iter(data, i)
  i = i + 1
  local a, b = data[1][i], data[2][i]
  if a ~= nil or b ~= nil then return i, a, b end
end
local function zip(t1, t2)
  return zip_iter, {t1, t2}, 0
end
for i, a, b in zip({1, 2, 3}, {"a", "b", "c"}) do
  print(i, a, b)  -- 1 1 a / 2 2 b / 3 3 c
end
```
::

**Table dispatch with fallback chain**: For layered handlers (e.g., event bubbling).

::code-wrapper{language="lua"}
```lua
local function dispatch(event_name, ...)
  local handler = specific_handlers[event_name]  -- try specific first
  if handler then return handler(...) end
  handler = general_handlers[event_name]  -- then general
  if handler then return handler(...) end
  return default_handler(...)  -- finally default
end
``
::

## ⚠️ Edge Cases & Gotchas

**`for` loop with a function call as limit**: The function is called ONCE, not per iteration.

::code-wrapper{language="lua"}
```lua
local function count()
  n = n + 1  -- side effect
  return 5
end
for i = 1, count() do print(i) end  -- count() called once; prints 1 2 3 4 5
```
::

**`break` inside a function inside a loop does NOT break the loop**: `break` only breaks the lexically enclosing loop, not dynamically.

::code-wrapper{language="lua"}
```lua
for i = 1, 10 do
  local function f() break end  -- SYNTAX ERROR: break outside loop
  -- Even if legal, calling f() wouldn't break the for — break is lexical, not dynamic
end
```
::

**`goto` cannot jump into the scope of a local**: This is a compile error, not runtime.

::code-wrapper{language="lua"}
```lua
do
  goto skip
  local x = 5    -- x's scope starts here
  ::skip::
  print(x)       -- x is in scope here, but we jumped past its declaration
end
-- ERROR: <goto skip> jumps into the scope of local 'x'
```
::

**`pairs` order is undefined — never rely on insertion order**: Use a separate ordered keys array if you need ordered iteration.

::code-wrapper{language="lua"}
```lua
local ordered = {}
local dict = {}
for _, key in ipairs({"name", "age", "email"}) do
  dict[key] = get_value(key)
  ordered[#ordered + 1] = key  -- maintain order separately
end
for _, key in ipairs(ordered) do  -- ordered iteration
  print(key, dict[key])
end
```
::

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local fns = {}
local i = 1
while i <= 3 do
  fns[i] = function() return i end
  i = i + 1
end
print(fns[1](), fns[2](), fns[3]())
```

<details>
<summary>Answer</summary>

Prints `4 4 4`.

Unlike the `for` loop (which creates a fresh `i` per iteration), the `while` loop uses a single `i` variable. All three closures capture the **same upvalue cell**. By the time the closures are called, `i` has been incremented to 4 (the loop exits when `i > 3`). So all three return 4.

Fix: introduce a new `local` inside the loop body to create a fresh cell per iteration:

```lua
local i = 1
while i <= 3 do
  do
    local captured = i
    fns[i] = function() return captured end
  end
  i = i + 1
end
-- Now fns[1]() → 1, fns[2]() → 2, fns[3]() → 3
```

</details>