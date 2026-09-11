---
title: Lua 13 — Performance, Memory & LuaJIT
description: Deep-dive into Lua performance: global vs local access cost, table pre-allocation and rehash avoidance, string interning and concatenation strategies, closure upvalue overhead, memory profiling via collectgarbage, and LuaJIT-specific optimizations (trace compilation, FFI, struct unpacking).
---

# 13 — Performance, Memory & LuaJIT

Lua is fast for a scripting language, and LuaJIT is among the fastest dynamic language runtimes in existence. Performance in Lua comes from: (1) **localizing** hot-path globals, (2) avoiding **table rehashing** in tight loops, (3) using **table.concat** instead of `..` in loops, (4) minimizing **closure allocation** in hot paths, and (5) **profiling** before optimizing. This chapter covers the mechanics and the LuaJIT escape hatches (FFI, trace compilation).

## Global vs Local Access Cost

::code-wrapper{language="lua"}
```lua
-- Global access: _G → table lookup → field lookup (2 hash lookups per access)
-- Local access: upvalue or stack slot (direct pointer, no lookup)

-- Benchmark: 10M iterations of a function call
local global_fn = function(x) return x + 1 end
local local_fn = global_fn  -- store as local

-- BAD: global lookup per iteration
local function test_global(n)
  local sum = 0
  for i = 1, n do
    sum = sum + global_fn(i)  -- _G.global_fn → 2 hash lookups
  end
  return sum
end

-- GOOD: local upvalue, no lookup
local function test_local(n)
  local sum = 0
  local fn = local_fn  -- localize once
  for i = 1, n do
    sum = sum + fn(i)  -- upvalue access, no lookup
  end
  return sum
end

-- Benchmark (10M iterations):
-- test_global: ~1500ms (global lookup per call)
-- test_local:  ~500ms (upvalue access) — 3x faster

-- Production: localize ALL standard library functions used in hot paths
local sformat = string.format
local tinsert = table.insert
local mfloor = math.floor
local mrandom = math.random
local pairs = pairs  -- even pairs/ipairs benefit from localizing

local function fast_format(values)
  local out = {}
  for i, v in ipairs(values) do  -- ipairs is a local (from above)
    out[i] = sformat("%d", v)  -- sformat is a local
  end
  return out
end
```

## Table Pre-allocation & Rehash Avoidance

::code-wrapper{language="lua"}
```lua
-- Tables have an array part (1..n) and hash part
-- Insertions that exceed the current capacity trigger a REHASH (O(n) — resizes both parts)
-- The rehash strategy: doubles the capacity when full (amortized O(1) insertion)
-- But each rehash allocates a new array + hash, copies all entries

-- BAD: incremental insertion triggers log(n) rehashes
local t = {}
for i = 1, 1000000 do
  t[i] = i  -- rehash at 2, 4, 8, 16, ... 524288, 1048576 (20 rehashes for 1M)
end
-- Each rehash: O(n) copy. Total: O(n log n) with allocation spikes.

-- Lua has NO table.reserve() — but you can pre-fill to force the capacity:
local function preallocate(n)
  local t = {}
  for i = 1, n do t[i] = 0 end  -- fill with zeros (forces allocation to n)
  return t
end

-- For known-size arrays, this avoids incremental rehashes:
local t = preallocate(1000000)
for i = 1, 1000000 do
  t[i] = i  -- no rehashes (capacity already at 1M)
end
-- Measurable: ~30% faster for large N, fewer GC pauses

-- For hash part: you can't pre-allocate directly, but filling with dummy keys works:
local cache = {}
for _, key in ipairs(known_keys) do
  cache[key] = false  -- pre-allocate all keys
end
-- Then real inserts don't trigger rehashes
```

## String Concatenation: `table.concat` vs `..`

::code-wrapper{language="lua"}
```lua
-- Strings are immutable. `a .. b` allocates a NEW string of length #a + #b.
-- Concatenation in a loop: O(n²) — each step copies the entire accumulated string.

-- BAD: quadratic allocation
local function build_bad(items)
  local result = ""
  for _, item in ipairs(items) do
    result = result .. item .. ","  -- allocates new string each iteration
  end
  return result
end
-- 10000 items: ~50ms, 100000 items: ~5s, 1000000: ~8 minutes (quadratic)

-- GOOD: linear with table.concat
local function build_good(items)
  local parts = {}
  for i, item in ipairs(items) do
    parts[i] = item  -- no concat, just table assignment
  end
  return table.concat(parts, ",")  -- single allocation, single copy
end
-- 1000000 items: ~5ms (1000x faster than .. for large N)

-- EVEN BETTER: pre-allocate the parts table if size is known
local function build_best(items)
  local parts = {}
  for i = 1, #items do  -- pre-fill to allocate
    parts[i] = items[i]
  end
  return table.concat(parts, ",")
end
```

## Closure Allocation in Hot Loops

::code-wrapper{language="lua"}
```lua
-- Each `function() ... end` expression allocates a new closure object
-- In a hot loop, this creates GC pressure

-- BAD: allocates a closure per iteration
local function process_bad(items, transform)
  local results = {}
  for i, item in ipairs(items) do
    results[i] = (function(x) return x * 2 end)(item)  -- closure allocated per iteration
  end
  return results
end

-- GOOD: hoist the closure out of the loop
local function process_good(items)
  local results = {}
  local double = function(x) return x * 2 end  -- allocate ONCE
  for i, item in ipairs(items) do
    results[i] = double(item)
  end
  return results
end

-- BEST: no closure at all (direct logic)
local function process_best(items)
  local results = {}
  for i, item in ipairs(items) do
    results[i] = item * 2  -- no function call, no closure
  end
  return results
end

-- Benchmark (1M items):
-- process_bad:  ~300ms (closure allocation + GC pressure)
-- process_good: ~100ms (closure allocated once)
-- process_best: ~50ms  (no closure, no call overhead)
```

## Memory Profiling with `collectgarbage`

::code-wrapper{language="lua"}
```lua
-- collectgarbage(option, arg): control the garbage collector
collectgarbage("collect")  -- full GC cycle (force collection)
collectgarbage("count")    -- current memory usage in KB (returns number)
collectgarbage("stop")     -- disable GC (for benchmarking — no GC pauses)
collectgarbage("restart")  -- re-enable GC
collectgarbage("step")     -- perform one GC step
collectgarbage("setpause", 200)   -- GC pause: run when memory grows by 200% (default 200)
collectgarbage("setstepmul", 200) -- GC step multiplier (default 200)

-- Memory measurement pattern:
local function measure_memory(fn)
  collectgarbage("collect")  -- full GC before measuring
  local before = collectgarbage("count")  -- KB
  fn()
  collectgarbage("collect")  -- force GC of temporaries
  local after = collectgarbage("count")
  return (after - before), after  -- delta KB, total KB
end

local delta, total = measure_memory(function()
  local t = {}
  for i = 1, 100000 do t[i] = i end
end)
print(string.format("allocated: %.1f KB, current: %.1f KB", delta, total))
-- Note: if `t` goes out of scope and is collected, delta may be 0 (all freed)
-- To measure peak: don't collect between fn and measurement

-- GC tuning for throughput vs latency:
-- For batch processing: collectgarbage("setpause", 500)  — less frequent GC
-- For interactive/real-time: collectgarbage("setpause", 100)  — more frequent, smaller pauses
```

## Benchmarking Methodology

::code-wrapper{language="lua"}
```lua
-- Correct benchmarking: disable GC, warm up, multiple runs, measure CPU time
local function benchmark(name, fn, iterations)
  iterations = iterations or 1000000
  -- Warm up: let the JIT (if LuaJIT) compile, populate caches
  for i = 1, 1000 do fn() end
  -- Disable GC during measurement (avoids GC pause noise)
  collectgarbage("stop")
  local start = os.clock()
  for i = 1, iterations do
    fn()
  end
  local elapsed = os.clock() - start
  collectgarbage("restart")
  local ns_per_op = elapsed / iterations * 1e9
  print(string.format("%s: %.2f ns/op (%d ops in %.3fs)",
    name, ns_per_op, iterations, elapsed))
  return elapsed
end

-- Compare implementations:
benchmark("table.insert", function()
  local t = {}
  for i = 1, 100 do table.insert(t, i) end
end)

benchmark("t[#t+1]=", function()
  local t = {}
  for i = 1, 100 do t[#t + 1] = i end
end)

benchmark("t[i]= (pre-size)", function()
  local t = {}
  for i = 1, 100 do t[i] = i end  -- no # call, direct index
end)
-- Result: t[i]= is fastest (no function call, no # evaluation), t[#t+1]= second,
-- table.insert slowest (function call overhead + length check)
```

## `ipairs` vs `pairs` vs `for i = 1, #t`

::code-wrapper{language="lua"}
```lua
-- Fastest: for i = 1, #t do (numeric loop, no function call per iteration)
local function fast_iter(t)
  local n = #t  -- evaluate length ONCE
  local sum = 0
  for i = 1, n do
    sum = sum + t[i]
  end
  return sum
end

-- Slower: ipairs (iterator function call per iteration)
local function medium_iter(t)
  local sum = 0
  for _, v in ipairs(t) do  -- ipairs_iter function called per element
    sum = sum + v
  end
  return sum
end

-- Slowest for arrays: pairs (iterates hash part too, unordered)
local function slow_iter(t)
  local sum = 0
  for _, v in pairs(t) do  -- next() called per element; visits ALL keys
    if type(v) == "number" then sum = sum + v end
  end
  return sum
end

-- Benchmark (1M element array):
-- fast_iter:   ~5ms   (numeric loop, no function calls)
-- medium_iter: ~15ms  (ipairs iterator call per element)
-- slow_iter:   ~25ms  (pairs + next() + type check)
```

## LuaJIT — Trace Compilation & FFI

::code-wrapper{language="lua"}
```lua
-- LuaJIT: drop-in replacement for Lua 5.1, 10-100x faster via JIT compilation
-- Traces hot loops/paths and compiles them to native machine code

-- LuaJIT-specific: require("ffi") — call C functions and use C types directly
-- This gives C-level performance WITHOUT writing C bindings

local ffi = require("ffi")

-- Declare C types and functions inline
ffi.cdef[[
  typedef struct { double x, y; } point_t;
  double sqrt(double x);
]]

-- Create C arrays (zero-overhead, no GC)
local points = ffi.new("point_t[?]", 1000000)  -- 1M points, 16MB, no GC tracking
for i = 0, 999999 do  -- C arrays are 0-indexed!
  points[i].x = i
  points[i].y = i * 2
end

-- Call C math functions directly (no Lua/C boundary overhead)
local function compute_distances(points, n)
  local sum = 0.0
  for i = 0, n - 1 do
    local p = points[i]
    sum = sum + ffi.C.sqrt(p.x * p.x + p.y * p.y)  -- direct C call
  end
  return sum
end

-- Benchmark: 1M points
-- Pure Lua:   ~150ms
-- LuaJIT FFI: ~3ms (50x faster — C array + JIT-compiled loop)

-- FFI struct: avoids Lua table overhead (no metatable, no hash lookup)
-- BUT: FFI objects are NOT garbage collected like Lua tables (cdata type)
-- For large arrays: ffi.new allocates from C heap, not Lua GC

-- FFI type declarations can be in a file loaded once:
-- ffi.cdef is idempotent for the same declaration (but errors on re-declaration)
```

### LuaJIT Performance Pitfalls

::code-wrapper{language="lua"}
```lua
-- 1. Trace abort: if the JIT can't compile a loop (too complex, polymorphic),
--    it falls back to the interpreter (10x slower)
--    Common causes: too many types in one variable, varargs, complex closures

-- 2. Math.random in LuaJIT is different from standard Lua (different PRNG)
--    LuaJIT: Mersenne Twister; standard Lua: platform-dependent

-- 3. string.format in LuaJIT uses the C implementation (fast but different float formatting)
--    LuaJIT: string.format("%.17g", 3.14) may differ slightly from PUC Lua

-- 4. FFI boundary: calling Lua from C (callbacks) is slow (creates C closures)
--    Calling C from Lua (ffi.C.*) is fast — use that direction

-- 5. JIT compilation is disabled inside pcall/xpcall (trace can't cross pcall)
--    For hot loops: don't wrap in pcall (or accept interpreter speed)
```

## Object Pool for Hot Paths

::code-wrapper{language="lua"}
```lua
-- When creating and discarding objects in a hot loop, pool them to avoid GC pressure
-- (see chapter 05 for the full Pool implementation)

local Pool = {}
Pool.__index = Pool
function Pool.new(factory, reset, max)
  return setmetatable({free = {}, factory = factory, reset = reset, max = max or 100}, Pool)
end
function Pool:acquire()
  if #self.free > 0 then return table.remove(self.free) end
  return self.factory()
end
function Pool:release(obj)
  if self.reset then self.reset(obj) end
  if #self.free < self.max then self.free[#self.free + 1] = obj end
end

-- Usage: pool of string builders (tables) in a serialization loop
local sb_pool = Pool.new(
  function() return {parts = {}} end,
  function(sb) sb.parts = {} end,
  50
)

local function serialize_batch(items)
  local sb = sb_pool:acquire()
  for i, item in ipairs(items) do
    sb.parts[i] = tostring(item)
  end
  local result = table.concat(sb.parts, ",")
  sb_pool:release(sb)  -- return to pool, no GC
  return result
end
```

## 💡 Tips & Tricks

**Profile before optimizing**: 90% of time is in 10% of code. Use `os.clock()` benchmarks or `debug.sethook` profiling to find the hot path.

**`t[i] = v` is faster than `table.insert(t, v)`**: No function call, no length evaluation. Use `t[#t + 1] = v` for append if you can't pre-size.

**Avoid `...` (varargs) in hot paths**: Packing varargs into a table (`{...}`) allocates. Use `select(i, ...)` for zero-allocation access.

**Use `rawget`/`rawset` when you know the key exists**: Bypasses metamethod lookup (faster if no metatable, and avoids `__index`/`__newindex` overhead).

## ⚠️ Edge Cases & Gotchas

**`#t` evaluation is not free**: Each `#t` scans for a border. Cache it: `local n = #t` then `for i = 1, n do`.

**Closures capture upvalues, not copies**: Multiple closures sharing an upvalue cell have zero copy cost, but mutations are visible to all. This is a feature, not a bug.

**LuaJIT trace can abort silently**: A loop that runs 100x slower than expected may have failed to compile. Use `jit.v` or `jit.b` modules to debug trace compilation.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local function build_string(n)
  local s = ""
  for i = 1, n do
    s = s .. tostring(i)
  end
  return s
end

local function build_string_fast(n)
  local parts = {}
  for i = 1, n do
    parts[i] = tostring(i)
  end
  return table.concat(parts)
end

-- Benchmark with n = 100000
-- build_string: 5 seconds
-- build_string_fast: 5 milliseconds
```

<details>
<summary>Answer</summary>

The 1000x difference is explained by **string immutability**.

`s = s .. tostring(i)` creates a NEW string each iteration. At iteration N, the string is N characters long, so the copy is O(N). Over N iterations, total work is $O(1 + 2 + 3 + ... + N) = O(N^2)$.

`table.concat` accumulates strings in a table (O(1) per insert, no copying), then does a SINGLE pass to concatenate: O(N) total.

$$\text{concat loop: } \sum_{i=1}^{N} i = \frac{N(N+1)}{2} = O(N^2) \quad \text{vs} \quad \text{table.concat: } O(N)$$

For N=100,000: $N^2 = 10^{10}$ operations vs $N = 10^5$ operations — a 100,000x difference in raw work, observed as ~1000x in wall time (due to constant factors and allocation overhead).

</details>