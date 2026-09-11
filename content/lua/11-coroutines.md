---
title: Lua 11 — Coroutines, Cooperative Multitasking & Generators
description: Deep-dive into Lua coroutines: coroutine.create/resume/yield mechanics, the yield-resume value passing protocol, generators via coroutine.wrap, cooperative task scheduling, producer-consumer pipelines, and async-like patterns without external libraries. Production patterns for iterators, cooperative scheduling, and backpressure.
---

# 11 — Coroutines, Cooperative Multitasking & Generators

Coroutines are Lua's **cooperative multitasking** primitive. A coroutine is a function with its own stack that can suspend (`coroutine.yield`) and resume (`coroutine.resume`). Unlike threads (preemptive), coroutines yield control explicitly. This makes them perfect for **generators**, **lazy iterators**, **producer-consumer pipelines**, and **async-style code** without callbacks. Lua's coroutines are **symmetric** (one resume ↔ one yield) and **stackful** (can yield from nested calls).

## Coroutine Lifecycle

::code-wrapper{language="lua"}
```lua
-- coroutine.create(fn): create a coroutine (type "thread", NOT OS thread)
-- Returns a coroutine object, status "suspended"
local co = coroutine.create(function()
  print("running")       -- executes on first resume
  coroutine.yield(1)     -- suspend, return 1 to resumer
  print("resumed")       -- executes on second resume
  coroutine.yield(2)     -- suspend, return 2
  print("done")          -- executes on third resume
  return "final"         -- return value goes to last resume
end)

-- coroutine.status(co): "suspended" | "running" | "normal" | "dead"
print(coroutine.status(co))  -- "suspended" (before first resume)

-- coroutine.resume(co, args...): start or continue the coroutine
-- Returns: true, yield_values... OR false, error_message
local ok1, val1 = coroutine.resume(co)  -- runs to first yield; prints "running"; val1 = 1
print(ok1, val1)                         -- true  1
print(coroutine.status(co))             -- "suspended"

local ok2, val2 = coroutine.resume(co)  -- runs to second yield; prints "resumed"; val2 = 2
print(ok2, val2)                         -- true  2

local ok3, val3 = coroutine.resume(co)  -- runs to return; prints "done"; val3 = "final"
print(ok3, val3)                        -- true  "final"
print(coroutine.status(co))            -- "dead" (function completed)

local ok4, err = coroutine.resume(co)  -- cannot resume a dead coroutine
print(ok4, err)                         -- false  "cannot resume dead coroutine"
```

## The Resume-Yield Value Protocol

::code-wrapper{language="lua"}
```lua
-- Values flow BOTH directions through resume/yield:
-- resume(args) → yield receives args (first resume starts the function with these args)
-- yield(values) → resume returns these values
-- return value → final resume returns this value

local co = coroutine.create(function(a, b)  -- a, b from FIRST resume
  print("start:", a, b)                       -- "start: 1 2"
  local c, d = coroutine.yield(a + b)         -- yields a+b; c,d from SECOND resume
  print("resumed with:", c, d)               -- "resumed with: 10 20"
  return c * d                               -- final return → third resume
end)

local r1 = coroutine.resume(co, 1, 2)       -- start: a=1, b=2; yields 3
print(r1)                                    -- true  3 (a+b)

local r2 = coroutine.resume(co, 10, 20)      -- continue: c=10, d=20 (passed to yield)
print(r2)                                    -- true  200 (c*d, the return value)

-- Key: the FIRST resume's args go to the function parameters.
-- Subsequent resume's args go to the yield() expressions.
```

## `coroutine.wrap` — Generator Function

::code-wrapper{language="lua"}
```lua
-- coroutine.wrap(fn): like create, but returns a FUNCTION (not a thread)
-- Calling the function = resume. Returns yield values directly (or errors).
-- No `true/false` wrapper — cleaner for generator use.

local gen = coroutine.wrap(function()
  for i = 1, 3 do
    coroutine.yield(i * 10)  -- yield 10, 20, 30
  end
end)

print(gen())  -- 10
print(gen())  -- 20
print(gen())  -- 30
print(gen())  -- (nothing — coroutine dead; wrap returns nothing, or errors)

-- CRITICAL difference from create+resume:
-- wrap propagates errors directly (no pcall protection)
-- resume catches errors, returns false + error message

-- Production: generator function with control flow
local function fibonacci()
  local a, b = 0, 1
  return coroutine.wrap(function()
    while true do
      coroutine.yield(b)    -- infinite sequence
      a, b = b, a + b       -- advance
    end
  end)
end

local fib = fibonacci()
for i = 1, 10 do
  io.write(fib(), " ")  -- 1 1 2 3 5 8 13 21 34 55
end
```

## Generators as `for` Loop Iterators

::code-wrapper{language="lua"}
```lua
-- A generator function (from wrap) IS an iterator — use directly in generic for
local function range(start, stop, step)
  step = step or 1
  return coroutine.wrap(function()
    for i = start, stop, step do
      coroutine.yield(i)
    end
  end)
end

for x in range(1, 5) do print(x) end       -- 1 2 3 4 5
for x in range(10, 2, -2) do print(x) end  -- 10 8 6 4 2

-- Generator that produces values lazily (no pre-allocation):
local function squares()
  local i = 0
  return coroutine.wrap(function()
    while true do
      i = i + 1
      coroutine.yield(i * i)  -- 1, 4, 9, 16, ... (infinite, lazy)
    end
  end)
end

local sq = squares()
for i = 1, 5 do print(sq()) end  -- 1 4 9 16 25 (only 5 computed, not infinite)
```

## Tree Traversal with Coroutines

::code-wrapper{language="lua"}
```lua
-- Deep tree traversal: coroutines eliminate explicit stack management
-- The yield propagates through nested calls (stackful coroutines!)

local function tree_node(value, children)
  return {value = value, children = children or {}}
end

local function preorder(node)
  return coroutine.wrap(function()
    local function visit(n)
      coroutine.yield(n.value)          -- yield this node's value
      for _, child in ipairs(n.children) do
        visit(child)                    -- recurse — yield propagates up through coroutine
      end
    end
    visit(node)
  end)
end

local function postorder(node)
  return coroutine.wrap(function()
    local function visit(n)
      for _, child in ipairs(n.children) do
        visit(child)
      end
      coroutine.yield(n.value)  -- yield AFTER visiting children
    end
    visit(node)
  end)
end

-- Build a tree:
--       1
--      / \
--     2   3
--    / \   \
--   4   5   6
local root = tree_node(1, {
  tree_node(2, {tree_node(4), tree_node(5)}),
  tree_node(3, {tree_node(6)}),
})

for v in preorder(root) do io.write(v, " ") end  -- 1 2 4 5 3 6
print()
for v in postorder(root) do io.write(v, " ") end -- 4 5 2 6 3 1
print()

-- CRITICAL: this is impossible without stackful coroutines.
-- Python generators can't yield from nested calls without "yield from".
-- Lua coroutines yield transparently through any call depth.
```

## Producer-Consumer Pipeline

::code-wrapper{language="lua"}
```lua
-- Pipeline: each stage is a coroutine that receives from the previous and yields to the next
-- Backpressure: consumer pulls only when ready (cooperative, not push-based)

-- Stage 1: read lines (producer)
local function read_lines(lines)
  local i = 0
  return coroutine.wrap(function()
    while i < #lines do
      i = i + 1
      coroutine.yield(lines[i])  -- produce one line
    end
  end)
end

-- Stage 2: filter (transformer)
local function filter(input, predicate)
  return coroutine.wrap(function()
    for value in input do  -- pull from upstream
      if predicate(value) then
        coroutine.yield(value)  -- re-yield if passes filter
      end
    end
  end)
end

-- Stage 3: map (transformer)
local function map(input, transform)
  return coroutine.wrap(function()
    for value in input do
      coroutine.yield(transform(value))  -- transform and re-yield
    end
  end)
end

-- Stage 4: sink (consumer)
local function drain(input)
  local results = {}
  for value in input do
    results[#results + 1] = value
  end
  return results
end

-- Compose the pipeline:
local lines = {"10", "hello", "20", "world", "30", "40"}
local numbers = filter(read_lines(lines), function(s) return tonumber(s) ~= nil end)
local doubled = map(numbers, function(s) return tonumber(s) * 2 end)
local result = drain(doubled)
print(table.concat(result, ", "))  -- 20, 40, 60, 80
-- Lazy: each value flows through the pipeline only when drain pulls it
```

## Cooperative Task Scheduler

::code-wrapper{language="lua"}
```lua
-- Simple cooperative scheduler: round-robin over coroutines
-- Each task yields voluntarily; scheduler gives each a turn

local Scheduler = {}
Scheduler.__index = Scheduler

function Scheduler.new()
  return setmetatable({tasks = {}, current = 1}, Scheduler)
end

function Scheduler:add(fn, name)
  local co = coroutine.create(fn)
  self.tasks[#self.tasks + 1] = {co = co, name = name or "unnamed"}
  return self
end

function Scheduler:run()
  while true do
    local remaining = 0
    for i, task in ipairs(self.tasks) do
      if coroutine.status(task.co) ~= "dead" then
        remaining = remaining + 1
        local ok, err = coroutine.resume(task.co)
        if not ok then
          print("task " .. task.name .. " error: " .. tostring(err))
        end
      end
    end
    if remaining == 0 then break end  -- all tasks done
  end
end

-- Usage: two tasks that yield to each other
local sched = Scheduler.new()
sched:add(function()
  for i = 1, 3 do
    print("A:" .. i)
    coroutine.yield()  -- give up control, scheduler picks next task
  end
end, "A")
sched:add(function()
  for i = 1, 3 do
    print("B:" .. i)
    coroutine.yield()
  end
end, "B")
sched:run()
-- Output (interleaved): A:1, B:1, A:2, B:2, A:3, B:3
```

## Async-like Pattern (No Callbacks)

::code-wrapper{language="lua"}
```lua
-- Simulate async I/O with coroutines: yield while "waiting", resume when "ready"
-- This is how Lua frameworks (e.g., OpenResty, Luvit) implement async without callbacks

local event_loop = {tasks = {}, timers = {}}

function event_loop.async(fn)
  local co = coroutine.create(fn)
  event_loop.tasks[#event_loop.tasks + 1] = co
end

function event_loop.sleep(seconds)  -- "async sleep" — yields, scheduler resumes later
  local wake_time = os.clock() + seconds
  coroutine.yield(function()  -- yield a RESUME CONDITION (function)
    return os.clock() >= wake_time  -- scheduler calls this; true = ready to resume
  end)
end

function event_loop.run()
  while #event_loop.tasks > 0 do
    local pending = {}
    for _, co in ipairs(event_loop.tasks) do
      if coroutine.status(co) ~= "dead" then
        local condition = coroutine.resume(co)
        -- if the coroutine yielded a condition function, check it
        if type(condition) == "function" and condition() then
          coroutine.resume(co)  -- condition met, resume
        elseif coroutine.status(co) ~= "dead" then
          pending[#pending + 1] = co
        end
      end
    end
    event_loop.tasks = pending
  end
end

-- Usage: "async" code that looks synchronous (no callbacks)
event_loop.async(function()
  print("fetching...")
  event_loop.sleep(0.1)  -- "await" — yields, then resumes after 0.1s
  print("done fetching")
end)
event_loop.run()
-- This pattern scales to thousands of concurrent "async" tasks on one OS thread
```

## Error Handling in Coroutines

::code-wrapper{language="lua"}
```lua
-- coroutine.resume catches errors: returns false + error message (doesn't propagate)
-- coroutine.wrap does NOT catch: errors propagate to the caller

local co = coroutine.create(function()
  error("boom inside coroutine")
end)
local ok, err = coroutine.resume(co)
print(ok, err)  -- false  "stdin:LINE: boom inside coroutine" (caught, not propagated)

-- wrap: error propagates (must pcall the wrapped function)
local gen = coroutine.wrap(function()
  error("boom from wrap")
end)
local ok2, err2 = pcall(gen)  -- must pcall to catch
print(ok2, err2)  -- false  "stdin:LINE: boom from wrap"

-- Production: wrap with error-safe generator
local function safe_generator(fn)
  local co = coroutine.create(fn)
  return function()
    local ok, result = coroutine.resume(co)
    if not ok then return nil, result end  -- nil + error
    return result  -- yield value or nil (dead)
  end
end

local gen = safe_generator(function()
  coroutine.yield(1)
  coroutine.yield(2)
  error("mid-generation failure")
end)
print(gen())  -- 1
print(gen())  -- 2
local val, err = gen()
print(val, err)  -- nil  "mid-generation failure" (error caught, no propagation)
```

## `coroutine.yield` from Deep Nesting (Stackful)

::code-wrapper{language="lua"}
```lua
-- Lua coroutines are STACKFUL: you can yield from arbitrarily deep call stacks
-- This is the key advantage over Python (which needs "yield from") and JS generators
-- (which can't yield from regular function calls)

local function inner()
  coroutine.yield("from inner")  -- yield 3 levels deep
end

local function middle()
  inner()
  coroutine.yield("from middle")
end

local function outer()
  middle()
  coroutine.yield("from outer")
end

local gen = coroutine.wrap(outer)
print(gen())  -- "from inner" (yield propagated through 2 stack frames)
print(gen())  -- "from middle"
print(gen())  -- "from outer"
print(gen())  -- nil (dead)
```

## 💡 Tips & Tricks

**Use `coroutine.wrap` for iterators, `create+resume` for error handling**: wrap is cleaner for for-loops; create lets you catch errors.

**Coroutines are cheap**: Each coroutine has its own stack (starts small, grows as needed). You can have thousands of them.

**Generators are lazy — use them for infinite sequences**: Only compute what the consumer asks for.

::code-wrapper{language="lua"}
```lua
-- Infinite prime generator (lazy)
local function primes()
  local found = {}
  return coroutine.wrap(function()
    coroutine.yield(2)  -- first prime
    local candidate = 3
    while true do
      local is_prime = true
      for _, p in ipairs(found) do
        if p * p > candidate then break end  -- only check up to sqrt
        if candidate % p == 0 then is_prime = false; break end
      end
      if is_prime then
        found[#found + 1] = candidate
        coroutine.yield(candidate)
      end
      candidate = candidate + 2  -- skip even numbers
    end
  end)
end

local p = primes()
for i = 1, 10 do io.write(p(), " ") end  -- 2 3 5 7 11 13 17 19 23 29
```
::

**Use `coroutine.status` to check if a generator is exhausted**: `"dead"` means it's done.

## ⚠️ Edge Cases & Gotchas

**Cannot yield across C call boundaries**: If a coroutine calls a C function that calls back into Lua, you cannot yield from that Lua. This is the "yield across C boundary" error.

::code-wrapper{language="lua"}
```lua
-- table.sort calls a C function; if your comparator yields, it errors
local co = coroutine.create(function()
  table.sort({3, 1, 2}, function(a, b)
    coroutine.yield()  -- ERROR: attempt to yield across a C-call boundary
    return a < b
  end)
end)
coroutine.resume(co)  -- false, "attempt to yield across a C-call boundary"
-- Lua 5.4+ relaxed this for some functions, but not all (e.g., pcall still blocks)
```
::

**Cannot resume a running coroutine**: Resuming from within itself (directly or via a callback) errors.

::code-wrapper{language="lua"}
```lua
local co = coroutine.create(function()
  coroutine.resume(co)  -- ERROR: cannot resume non-suspended coroutine
end)
coroutine.resume(co)
```
::

**`coroutine.wrap` returns nothing (not nil) when dead**: Calling a dead wrapped coroutine returns no values. `nil`-checking the result is the standard pattern, but technically it's "no return values", not "returns nil".

**Coroutines are not OS threads**: They run on the same OS thread, one at a time. No parallelism (only concurrency). For parallelism, use `lua-llthreads` or C-level threads.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local function countdown_gen(n)
  return coroutine.wrap(function()
    for i = n, 1, -1 do
      coroutine.yield(i)
    end
  end)
end

local count = countdown_gen(3)
local values = {}
for v in count do  -- use the generator as an iterator
  values[#values + 1] = v
end
print(table.concat(values, ","))
```

<details>
<summary>Answer</summary>

Prints `3,2,1`.

The generator function (from `coroutine.wrap`) is a valid iterator for the generic `for` loop. The `for` loop calls `count()` repeatedly until it returns `nil` (or no values, which is treated as nil). The loop gets 3, 2, 1, then the coroutine dies (the for loop in the generator completes), `count()` returns nothing → loop ends.

The bug would be if the generator yielded `nil` intentionally — the for loop would terminate early. For generators that might yield nil, use a sentinel value or a different protocol.

</details>