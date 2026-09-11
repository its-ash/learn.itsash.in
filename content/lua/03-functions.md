---
title: Lua 03 — Functions, Closures, Varargs & TCO
description: Deep-dive into first-class functions, multiple return value semantics, varargs via select/pack/unpack, lexical closures with upvalue cells, proper tail calls for state machines, and functional patterns (memoize, compose, curry) used in production Lua codebases.
---

# 03 — Functions, Closures, Varargs & TCO

Functions are first-class values — closures with captured upvalues. Lua optimizes **proper tail calls** (PTC), meaning `return f()` doesn't grow the call stack. Multiple return values and varargs (`...`) are core semantics, not afterthoughts. This chapter covers the mechanics that separate "knowing Lua syntax" from building state machines, pipelines, and zero-allocation iterators.

## Declaration Forms & First-Class Semantics

::code-wrapper{language="lua"}
```lua
-- Syntactic sugar: `local function f() end` is exactly:
local f = function() end  -- but with one difference: the local is visible inside the body
-- This matters for recursion:
local function fact(n)        -- f is visible to itself (can recurse)
  if n <= 1 then return 1 end
  return n * fact(n - 1)       -- fact refers to the local, not a global
end

-- This FAILS — local not yet defined when function is created:
local fact = function(n)
  if n <= 1 then return 1 end
  return n * fact(n - 1)  -- ERROR: fact is nil at call time (local not assigned yet)
end

-- Method syntax: obj:method() is sugar for obj.method(obj)
local Obj = {}
function Obj:method(x)  -- sugar for: Obj.method = function(self, x)
  return self, x
end
Obj:method(42)  -- (Obj, 42) — self = Obj
Obj.method(Obj, 42)  -- equivalent explicit form

-- Functions as values: pass, store, return
local apply = function(f, x) return f(x) end     -- higher-order function
local add = function(a, b) return a + b end
apply(add, 2, 3)  -- 5 (add ignores the extra arg)
```
::

## Multiple Return Values (MRV)

::code-wrapper{language="lua"}
```lua
-- Functions return multiple values separated by commas
local function minmax(arr)
  local lo, hi = math.huge, -math.huge
  for _, v in ipairs(arr) do
    if v < lo then lo = v end
    if v > hi then hi = v end
  end
  return lo, hi
end

local lo, hi = minmax({3, 1, 4, 1, 5, 9, 2, 6})  -- 1, 9
local only_lo = minmax({3, 1, 4})                 -- 1 (extra discarded)
local t = {minmax({3, 1, 4})}                     -- {1, 4} (all values packed)
local t2 = {minmax({3, 1, 4}), 99}                -- {1, 4, 99}

-- MRV adjustment rules (critical to know):
-- 1. As the LAST argument in a call/table: all values used
-- 2. NOT the last argument: only first value used (rest discarded)
print(minmax({3, 1, 4}), 99)    -- 1  9  99  (all from minmax + 99)
print(99, minmax({3, 1, 4}))    -- 99  1      (minmax not last → only first value!)
local t3 = {minmax({3,1,4}), "end"}  -- {1, "end"} — minmax truncated to 1 value
```

### Anti-pattern: MRV truncation in table constructors

::code-wrapper{language="lua"}
```lua
-- BAD: when a multi-return call isn't the last element, values are silently lost
local function get_pos() return 10, 20, 30 end
local points = {get_pos(), get_pos(), get_pos()}
-- Expect: {10,20,30,10,20,30,10,20,30}
-- Actual: {10,10,10}  — only first value from each call!

-- FIX: wrap each in parens to force single-value, or use table.insert loop
local function collect(...)
  local out = {}
  for _, v in ipairs({...}) do
    -- ... but this has the same problem with MRV inside {...}
  end
end

-- Production: use a builder pattern
local points = {}
local function add_point(x, y, z)
  points[#points + 1] = x
  points[#points + 1] = y
  points[#points + 1] = z
end
add_point(get_pos())   -- distributes 10,20,30 into x,y,z → appends 3 values
```
::

## Varargs: `...`, `select`, `table.pack`/`unpack`

::code-wrapper{language="lua"}
```lua
-- `...` is a vararg expression. In a function body, it expands to all arguments.
-- As the last expression in a list, it expands to all values; otherwise just first.

local function log(level, ...)
  -- select("#", ...): count of varargs (zero allocation)
  -- select(i, ...): returns args i..n (zero allocation — no table created)
  local n = select("#", ...)
  if level == "debug" then
    for i = 1, n do
      io.write(tostring(select(i, ...)), " ")  -- stream each arg without packing
    end
    io.write("\n")
  end
end

-- table.pack (5.2+): packs varargs into a table with .n = count
-- CRITICAL: preserves trailing nils (which {...} does NOT)
local function safe_pack(...)
  local t = table.pack(...)
  -- t.n has the count, even if last args were nil
  -- t[1], t[2], ... t[t.n] have the values
  return t
end

local packed = safe_pack(1, nil, 3, nil)
print(packed.n)      -- 4 (count preserved)
print(packed[2])     -- nil (value is nil, but key exists — distinguish from missing)
#packed             -- 0 or 3 (undefined — don't use # on packed varargs with nils)

-- table.unpack: the inverse — unpacks a table into values
local args = {10, 20, 30}
print(table.unpack(args))  -- 10  20  30
print(table.unpack(args, 2, 3))  -- 20  30  (range: start, end)

-- Forwarding varargs:
local function delegate(fn, ...)
  return fn(...)  -- passes all varargs through, preserves MRV
end
delegate(print, "a", "b", "c")  -- a b c
```
::

### Edge case: `nil` in varargs

::code-wrapper{language="lua"}
```lua
-- {...} loses trailing nils — you can't tell if the caller passed (1, nil, nil) or (1)
local function bad(...) return #{...} end
bad(1, nil, nil)  -- 1 (undefined — # sees hole at index 2)

-- table.pack preserves the count via .n
local function good(...)
  local t = table.pack(...)
  return t.n      -- 3 (the actual count, including nils)
end
good(1, nil, nil)  -- 3

-- PRODUCTION: robust vararg iteration (handles nils in middle/end)
local function each_arg(fn, ...)
  local n = select("#", ...)     -- true count, zero allocation
  for i = 1, n do
    fn(select(i, ...))           -- select(i, ...) returns i-th arg (nil if nil)
  end
end
each_arg(print, 1, nil, 3, nil)  -- prints: 1, nil, 3, nil (all 4 args)
```
::

## Closures & Upvalue Mechanics

::code-wrapper{language="lua"}
```lua
-- A closure = function + upvalues (captured locals from enclosing scope)
-- Upvalues are heap-allocated cells. Multiple closures can share the same cell.

-- 1. Counter (shared upvalue cell between get/set)
local function make_counter(initial)
  local count = initial or 0  -- becomes an upvalue cell
  return {
    inc = function() count = count + 1; return count end,
    dec = function() count = count - 1; return count end,
    get = function() return count end,
    reset = function() count = initial or 0 end,
  }
end

local c = make_counter(10)
c.inc()  -- 11
c.inc()  -- 12
c.get()  -- 12
-- inc, dec, get, reset all share the SAME count upvalue cell

-- 2. Private state via closure (no metatable needed)
local function create_bank_account(initial_balance)
  local balance = initial_balance or 0  -- private — not accessible externally

  return {
    deposit = function(amount)
      assert(amount > 0, "must deposit positive amount")
      balance = balance + amount
      return balance
    end,
    withdraw = function(amount)
      assert(amount > 0, "must withdraw positive amount")
      assert(balance >= amount, "insufficient funds")
      balance = balance - amount
      return balance
    end,
    get_balance = function() return balance end,
  }
  -- balance is NOT in the returned table — it's an upvalue. True encapsulation.
end

local acc = create_bank_account(100)
acc.deposit(50)       -- 150
acc.withdraw(30)      -- 120
acc.balance           -- nil (can't access private state directly)
```
::

## Proper Tail Calls (PTC) & State Machines

Lua guarantees **proper tail calls**: `return f(args)` does not grow the stack. The caller's frame is replaced. This enables unbounded recursion and actor-style state machines.

::code-wrapper{language="lua"}
```lua
-- TAIL CALL: `return f()` — no stack growth. Can recurse infinitely.
local function loop(n)
  if n == 0 then return "done" end
  return loop(n - 1)  -- tail position: caller's frame discarded before entering loop
end
loop(100000000)  -- "done" — no stack overflow, constant stack space

-- NOT a tail call: anything after the call prevents PTC
local function sum_bad(n, acc)
  acc = acc or 0
  if n == 0 then return acc end
  return 1 + sum_bad(n - 1, acc)  -- +1 after the call → NOT tail → stack grows
end
-- sum_bad(1000000)  -- stack overflow!

-- Fix: make it tail-recursive with accumulator
local function sum_good(n, acc)
  acc = acc or 0
  if n == 0 then return acc end
  return sum_good(n - 1, acc + n)  -- tail position: acc + n computed, then tail call
end
sum_good(10000000)  -- works — PTC, constant stack

-- State machine via tail calls (no stack growth across state transitions):
local function state_idle(input)
  if input == "start" then return state_running
  elseif input == "quit" then return state_done
  end
  return state_idle  -- stay in current state (tail call to self)
end

local function state_running(input)
  if input == "pause" then return state_paused
  elseif input == "stop" then return state_idle
  elseif input == "quit" then return state_done
  end
  return state_running
end

local function state_paused(input)
  if input == "resume" then return state_running
  elseif input == "stop" then return state_idle
  end
  return state_paused
end

local function state_done(_) return state_done end  -- terminal

-- Run the machine: each transition is a tail call — no stack growth for any path length
local function run_machine(inputs)
  local state = state_idle
  for _, input in ipairs(inputs) do
    state = state(input)  -- tail call: previous state function's frame discarded
  end
  return state == state_done and "terminated" or "active"
end

print(run_machine({"start", "pause", "resume", "stop", "quit"}))  -- "terminated"
```
::

### Anti-pattern: non-tail recursion for large inputs

::code-wrapper{language="lua"}
```lua
-- BAD: naive recursive tree walk — stack overflow on deep trees
local function depth_first_bad(node)
  process(node)
  for _, child in ipairs(node.children or {}) do
    depth_first_bad(child)  -- not tail: process() runs before, loop after
  end
end
-- depth_first_bad(deep_tree) → stack overflow at ~1000-2000 levels (depending on C stack)

-- GOOD: explicit stack (iterative) — handles any depth, same traversal order
local function depth_first_good(root)
  local stack = {root}
  while stack[#stack] do  -- while not empty (but careful with # on sparse — see Array in ch02)
    local node = stack[#stack]
    stack[#stack] = nil  -- pop
    process(node)
    -- push children in reverse for left-to-right traversal
    local children = node.children or {}
    for i = #children, 1, -1 do
      stack[#stack + 1] = children[i]
    end
  end
end
```
::

## Named Arguments & Option Merging

::code-wrapper{language="lua"}
```lua
-- Lua has no named params. Idiom: pass a single table with key-value pairs.
local function create_server(opts)
  -- Merge with defaults: explicit per-field, NOT table.merge (doesn't exist in stdlib)
  opts = opts or {}
  local host = opts.host or "0.0.0.0"      -- default
  local port = opts.port or 8080
  local tls = opts.tls ~= false and true or false  -- default true unless explicitly false
  local max_conn = opts.max_conn or 1024
  -- ... use host, port, tls, max_conn
  return {host = host, port = port, tls = tls, max_conn = max_conn}
end

local server = create_server {
  host = "127.0.0.1",
  port = 3000,
  tls = false,
}
-- Notice: no parens needed when the sole argument is a table literal

-- Production: deep merge utility for nested config
local function merge_defaults(opts, defaults)
  local result = {}
  for k, v in pairs(defaults) do
    result[k] = (type(v) == "table" and type(opts[k]) == "table")
      and merge_defaults(opts[k], v)  -- deep merge nested tables
      or (opts[k] ~= nil and opts[k] or v)  -- shallow copy or default
  end
  for k, v in pairs(opts) do
    if defaults[k] == nil then result[k] = v end  -- pass through unknown keys
  end
  return result
end
```
::

## Higher-Order Functions & Functional Patterns

::code-wrapper{language="lua"}
```lua
-- Memoize: cache results by argument. Uses weak table for auto-eviction.
local function memoize(fn)
  local cache = setmetatable({}, {__mode = "v"})  -- weak values: GC can evict
  return function(x)
    if cache[x] ~= nil then return cache[x] end
    local result = fn(x)
    cache[x] = result
    return result
  end
end

local slow_fib
slow_fib = memoize(function(n)
  if n < 2 then return n end
  return slow_fib(n - 1) + slow_fib(n - 2)  -- recursive calls also hit cache
end)
print(slow_fib(50))  -- fast: each value computed once, O(n) not O(2^n)

-- Compose: right-to-left function composition
local function compose(...)
  local fns = {...}
  return function(x)
    for i = #fns, 1, -1 do
      x = fns[i](x)
    end
    return x
  end
end

local process = compose(
  function(s) return s:upper() end,
  function(s) return s:gsub("%s+", " ") end,
  function(s) return s:reverse() end
)
print(process("hello   world"))  -- "DLROW OLLEH"

-- Curry: partial application
local function curry(fn, arity)
  arity = arity or debug.getinfo(fn, "u").nparams  -- introspect param count
  return function(x)
    if arity <= 1 then return fn(x) end
    return curry(function(...) return fn(x, ...) end, arity - 1)
  end
end

local add = function(a, b, c) return a + b + c end
local add_one = curry(add)(1)       -- takes 2 more args
local add_three = add_one(2)       -- takes 1 more arg
print(add_three(3))                -- 6
```
::

## `pcall` with Multiple Return Values

::code-wrapper{language="lua"}
```lua
-- pcall returns (true, result1, result2, ...) on success, (false, err) on failure
local function safe_divide(a, b)
  local ok, r1, r2 = pcall(function()
    return math.floor(a / b), a % b  -- two return values
  end)
  if not ok then return nil, r1 end  -- r1 is the error message
  return r1, r2                     -- quotient, remainder
end

local q, r = safe_divide(17, 5)  -- 3, 2
local q2, err = safe_divide(17, 0)  -- nil, error message
```
::

## 💡 Tips & Tricks

**Localize functions called in hot loops**: Same as with stdlib — `local fn = expensive` turns a global/upvalue chain into a direct local.

::code-wrapper{language="lua"}
```lua
local function process_items(items)
  local insert = table.insert  -- localize for the loop
  local results = {}
  for _, item in ipairs(items) do
    insert(results, transform(item))  -- fast: insert is a local upvalue
  end
  return results
end
```
::

**`xpcall` with traceback handler for better error messages**:

::code-wrapper{language="lua"}
```lua
local function with_traceback(fn)
  return xpcall(fn, function(err)
    return debug.traceback(tostring(err), 2)  -- full stack with the error
  end)
end
local ok, result = with_traceback(function()
  error("boom")
end)
if not ok then print(result) end  -- boom\nstack traceback:\n\tfile.lua:N: ...
```
::

**Use `__call` metamethod to make table-based objects callable**:

::code-wrapper{language="lua"}
```lua
local Iterator = {}
Iterator.__index = Iterator
Iterator.__call = function(self) return self:next() end  -- obj() == obj:next()
function Iterator.new(t) return setmetatable({_t = t, _i = 1}, Iterator) end
function Iterator:next()
  local v = self._t[self._i]
  self._i = self._i + 1
  return v  -- nil when exhausted
end
local it = Iterator.new({10, 20, 30})
print(it())  -- 10
print(it())  -- 20
```
::

## ⚠️ Edge Cases & Gotchas

**`return f()` is a tail call; `return (f())` is NOT**: Parentheses force single-value and also prevent PTC.

::code-wrapper{language="lua"}
```lua
return f()     -- tail call: stack frame replaced
return (f())   -- NOT a tail call: extra parens force single-value + prevent PTC
```
::

**Functions have no `.name` property**: `function foo() end` has no built-in name. `debug.getinfo(f, "n").name` may return nil for anonymous functions.

**Default parameter via `or` is dangerous for false/nil values**: `function f(x) x = x or default end` — if caller passes `false`, `x` becomes `default`. Use explicit nil check:

::code-wrapper{language="lua"}
```lua
function f(x)
  if x == nil then x = default end  -- preserves false
end
```
::

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local function curry2(fn)
  return function(a)
    return function(b)
      return fn(a, b)
    end
  end
end

local add = curry2(function(a, b) return a + b end)
local add5 = add(5)
print(add5(3))      -- 8
print(add5(10))     -- 13
print(add(5)(3))    -- 8

-- Now: what does this print?
local results = {}
for i = 1, 3 do
  results[i] = add(i)
end
print(results[1](100), results[2](100), results[3](100))
```

<details>
<summary>Answer</summary>

Prints `101 102 103`.

Each `add(i)` call creates a **new closure** capturing `i` at that moment. Since the `for` loop creates a fresh `i` per iteration, each `results[i]` closure captures a different `i` value (1, 2, 3 respectively). So `results[1](100)` = 1 + 100 = 101, `results[2](100)` = 2 + 100 = 102, `results[3](100)` = 3 + 100 = 103.

If this had been a `while` loop with a shared `i`, all three would return `103` (all capturing the final value 3 — see chapter 02's closure capture gotcha).

</details>