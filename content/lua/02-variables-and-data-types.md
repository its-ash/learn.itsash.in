---
title: Lua 02 — Types, Scoping, Integers & Memory Semantics
description: Deep-dive into Lua's 8-type system, integer/float duality, lexical scoping vs block scoping, _ENV upvalue mechanics, and table reference semantics. Production patterns for type guards, nil-safe chains, and memory-safe defaults.
---

# 02 — Types, Scoping, Integers & Memory Semantics

Lua has 8 types: `nil`, `boolean`, `number`, `string`, `table`, `function`, `userdata`, `thread`. There is no integer/float type distinction at the language level — `number` is a union. There is no block scope — only lexical (function/block) scope via `local`. Strings are immutable interned byte sequences. Tables are reference-allocated objects with an array part + hash part. Every one of these facts has production-level consequences.

## The 8 Types & Type Guards

::code-wrapper{language="lua"}
```lua
-- type() returns a string. It's the ONLY function that works on nil without error.
type(nil)            -- "nil"
type(true)           -- "boolean"
type(42)             -- "number"
type(3.14)           -- "number"  (no "float" type in Lua 5.3+; subtype is internal)
type("hi")           -- "string"
type({})             -- "table"
type(print)          -- "function"
type(coroutine.create(function() end))  -- "thread"
type(io.open("x"))   -- "userdata" (C object wrapped)

-- Production type guard: discriminated union via metatable tag
local function is_type(v, tag)
  return type(v) == "table" and getmetatable(v) == tag
end

local Vector = {}
Vector.__index = Vector
function Vector.new(x, y)
  return setmetatable({x = x, y = y}, Vector)  -- metatable IS the type tag
end

local v = Vector.new(1, 2)
is_type(v, Vector)   -- true  — no instanceof, just metatable identity
```
::

## Integer vs Float (Lua 5.3+)

::code-wrapper{language="lua"}
```lua
-- 5.3+: numbers are either 64-bit integers or double-precision floats (internally tagged)
-- The subtypes are observable via math.type()
math.type(42)        -- "integer"
math.type(42.0)      -- "float"
math.type(42 // 1)   -- "integer" (floor division → integer)
math.type(42 / 1)    -- "float"  (true division → always float)
math.type("42")     -- nil (not a number)

-- Arithmetic rules:
10 / 2               -- 5.0   (true division: ALWAYS returns float)
10 // 2              -- 5     (floor division: returns int if both int)
10 % 3               -- 1     (modulo: result type follows operands)
10.0 // 3            -- 3.0   (float floor div if any operand float)
2 ^ 10                -- 1024.0 (pow: ALWAYS returns float, even for int inputs)

-- Integer overflow wraps; float overflow gives inf
math.maxinteger + 1   -- math.mininteger (wraps around — UB in C, defined in Lua)
math.maxinteger * 2   -- -2 (wraps)
1e308 * 10            -- inf (no overflow error, IEEE 754)
```
::

### Edge case: float-to-integer precision loss

::code-wrapper{language="lua"}
```lua
-- Integers beyond 2^53 lose precision when stored as float
local big = 2^53 + 1  -- 9007199254740993.0 (float)
math.tointeger(big)   -- nil  (can't represent as integer — precision lost)

-- Comparing int and float: Lua compares by mathematical value, not bit pattern
1 == 1.0              -- true  (mathematically equal)
1 < 1.5               -- true
math.type(1)          -- "integer"
math.type(1.0)         -- "float"
-- 1 and 1.0 are EQUAL but DIFFERENT subtypes. Use math.type() to distinguish.

-- Anti-pattern: using / for counting
local count = 100 / 2  -- 50.0 (float!) — propagate floats through your int math
-- Use // for integer results
local count = 100 // 2  -- 50 (integer)
```
::

## Scoping: Lexical, Not Block

`local` creates a variable visible in the enclosing **lexical block** (function body, `if`/`for`/`while`/`do` block). This is block scope. But there's a critical distinction: `local` declarations are visible from the point of declaration to the end of the enclosing block — not hoisted.

::code-wrapper{language="lua"}
```lua
-- local IS block-scoped (contrary to popular belief — the "no block scope" myth is wrong)
do
  local x = 10
  do
    local y = 20
    print(x, y)       -- 10  20 (inner block sees outer locals)
  end
  print(y)            -- nil (y is out of scope — block-scoped!)
end
print(x)              -- nil

-- The myth: "Lua has no block scope" comes from pre-5.0 days. 5.0+ has block scope.
-- But: for-loop variables are local to the loop body (block-scoped)
for i = 1, 3 do
  local item = items[i]
end
print(i)              -- nil (i is loop-local)
print(item)           -- nil (item is block-local)
```
::

### Closure capture: upvalues

::code-wrapper{language="lua"}
```lua
-- A local captured by an inner function becomes an "upvalue" — a heap-allocated
-- cell that holds the local's value. The closure references this cell, not a copy.
local function make_counter()
  local count = 0                    -- stack local → becomes upvalue when captured
  return function()
    count = count + 1               -- mutates the upvalue cell, not a copy
    return count
  end
end

local c = make_counter()
c()  -- 1
c()  -- 2
-- count is NOT on the stack anymore — it's on the heap, kept alive by the closure

-- Each closure call creates a NEW upvalue cell — independent state
local c2 = make_counter()
c2()  -- 1 (separate from c's count)
```
::

### Anti-pattern: closure in loop captures variable, not value

::code-wrapper{language="lua"}
```lua
-- BAD: all closures capture the SAME upvalue cell (the loop variable `i`)
local fns = {}
for i = 1, 3 do
  fns[i] = function() return i end
end
print(fns[1](), fns[2](), fns[3]())  -- 1  2  3 (OK in Lua! — for loop creates new i each iter)

-- But with while loops, the variable is shared:
local fns2 = {}
local j = 1
while j <= 3 do
  fns2[j] = function() return j end  -- all capture the SAME j
  j = j + 1
end
print(fns2[1](), fns2[2](), fns2[3]())  -- 4  4  4 (all see final value of j!)

-- FIX: introduce a new scope per iteration to create fresh upvalue cells
local fns3 = {}
local k = 1
while k <= 3 do
  do  -- new block → new local → new upvalue cell
    local captured = k
    fns3[k] = function() return captured end
  end
  k = k + 1
end
print(fns3[1](), fns3[2](), fns3[3]())  -- 1  2  3
```
::

## `_ENV` & Global Access Mechanics

Every chunk is compiled with an implicit upvalue `_ENV` that controls where globals are read/written. `_ENV` defaults to `_G`.

::code-wrapper{language="lua"}
```lua
-- Writing `x = 1` is syntactic sugar for `_ENV.x = 1`
-- Reading `x` is sugar for `_ENV.x`
-- `_G` is a global variable pointing to the global table; `_ENV` is the actual mechanism

-- In a chunk, _ENV is the first upvalue of the main function:
local info = debug.getinfo(1, "u")
print(info.nups)        -- at least 1 (the _ENV upvalue)

-- Swap _ENV to redirect all global access in a scope:
do
  local _ENV = {}       -- shadow _ENV for this block — all globals become nil
  print("still works") -- error: attempt to call nil value 'print' (not in our _ENV)
end

-- Practical: create a "module environment" that can see _G but write to a local table
local M = {}
do
  local _ENV = M       -- all unqualified names in this block write to M, not _G
  function helper()     -- M.helper (not _G.helper)
    return "private"
  end
  value = 42            -- M.value (not _G.value)
end
print(M.helper())      -- "private"
print(M.value)         -- 42
print(_G.helper)       -- nil (didn't pollute _G)
```
::

## Strings: Interned, Immutable, Byte-indexed

::code-wrapper{language="lua"}
```lua
-- Strings are immutable byte sequences, interned (identical strings share storage)
local a = "hello"
local b = "hello"
print(a == b)         -- true (pointer comparison after interning — no memcmp needed)

-- 1-indexed byte access via string.sub; NO s[i] syntax (unlike Python/JS)
local s = "héllo"    -- é is 2 bytes in UTF-8
s:sub(1, 1)          -- "h" (byte 1)
s:sub(2, 2)          -- "\xc3" (first byte of é — NOT the character é!)
#s                   -- 6 (byte length, not character count — é is 2 bytes)
utf8.len(s)           -- 5 (character count, Lua 5.3+)

-- Short literal: "..."
-- Long literal: [[...]] (no escape processing) or [==[...]==] (nestable)
local code = [[
  local x = "no escaping needed: \n is literal"
]]
local nested = [==[
  this [[inner]] is fine — different = count
]==]

-- Conversion:
tostring(42)         -- "42"
tostring(3.14)       -- "3.14"
tostring(true)       -- "true"
tostring(nil)        -- "nil"
tonumber("42")       -- 42
tonumber("0x1F")    -- 31 (hex)
tonumber("3.14e2")   -- 314.0 (scientific)
tonumber("  42 ")   -- 42 (whitespace trimmed)
tonumber("abc")     -- nil (not an error — returns nil)
tonumber("42", 16)  -- 66 (base 16)
```
::

### Anti-pattern: string concatenation in a loop

::code-wrapper{language="lua"}
```lua
-- BAD: O(n²) — each .. allocates a new immutable string, copies both halves
local result = ""
for i = 1, 10000 do
  result = result .. tostring(i) .. ","
end

-- GOOD: O(n) — accumulate in table, single concat at the end
local parts = {}
for i = 1, 10000 do
  parts[i] = tostring(i)           -- pre-allocate: parts[i] not table.insert
end
local result = table.concat(parts, ",")  -- single allocation, single copy

-- BENCHMARK: 10K iterations
-- .. loop:      ~500ms   (50µs per concat, quadratic)
-- table.concat: ~0.5ms  (1000x faster)
```
::

## Tables: Array Part + Hash Part

Tables internally maintain two regions: a contiguous **array part** (1..n) for fast indexed access, and a **hash part** for all other keys. The boundary is managed by the rehash algorithm — when the array part fills, Lua computes a new boundary that maximizes array usage.

::code-wrapper{language="lua"}
```lua
-- Array part (contiguous integer keys 1..n)
local arr = {10, 20, 30}
-- arr[1]=10, arr[2]=20, arr[3]=30 — stored in array part
#arr                -- 3 (length = last contiguous integer index)

-- Hash part (all other keys)
local dict = {name = "Alice", age = 30}
-- "name" and "age" stored in hash part

-- Mixed: array part gets 1,2,3; hash part gets "name"
local mixed = {10, 20, 30, name = "Alice"}
#mixed              -- 3 (array part length only)

-- The # operator: returns ANY border (n where t[n] ~= nil and t[n+1] == nil)
-- For contiguous arrays, this is unambiguous. For sparse arrays, it's undefined.
local sparse = {}
sparse[1] = "a"
sparse[2] = "b"
sparse[1000000] = "z"
#sparse             -- 2 OR 1000000 — implementation-defined! Don't rely on it.
```
::

### Edge case: `#` on tables with nil holes

::code-wrapper{language="lua"}
```lua
local t = {10, 20, 30, 40, 50}
t[3] = nil           -- remove middle element — creates a hole
#t                   -- 2 OR 5 — UNDEFINED BEHAVIOR (any border is valid)

-- Production: never use # on tables with holes. Maintain explicit length.
local Array = {}
Array.__index = Array

function Array.new()
  return setmetatable({n = 0}, Array)   -- explicit length field
end

function Array:push(v)
  self.n = self.n + 1
  self[self.n] = v
  return self
end

function Array:pop()
  if self.n == 0 then return nil end
  local v = self[self.n]
  self[self.n] = nil       -- clear slot for GC
  self.n = self.n - 1
  return v
end

function Array:len()
  return self.n            -- O(1), reliable, no # ambiguity
end

local a = Array.new():push(1):push(2):push(3)
print(a:len())             -- 3
a:pop()
print(a:len())             -- 2
```
::

## Falsy Values: Only `nil` and `false`

::code-wrapper{language="lua"}
```lua
-- ONLY nil and false are falsy. Everything else is truthy.
if 0 then end          -- true  (0 is truthy — unlike JS/Python)
if "" then end         -- true  (empty string is truthy)
if {} then end         -- true  (empty table is truthy)
if 0.0 then end        -- true  (zero float is truthy)

-- Default value pattern: `v or default` — but trap if v can be false/nil
local opts = {timeout = 0}
local timeout = opts.timeout or 5000   -- BUG: if timeout is 0, gets 5000!
-- Fix: explicit nil check
local timeout = (opts.timeout ~= nil) and opts.timeout or 5000  -- 0 preserved

-- Boolean option pattern:
local verbose = opts.verbose ~= false  -- default true unless explicitly false
local debug = opts.debug == true       -- default false unless explicitly true
```
::

## Type Coercion Rules

::code-wrapper{language="lua"}
```lua
-- .. (concatenation) coerces numbers to strings:
"value: " .. 42       -- "value: 42"
"x" .. 3.14           -- "x3.14"
"flag=" .. true       -- ERROR: attempt to concatenate a boolean value

-- Arithmetic coerces string-numbers to numbers:
"10" + 5             -- 15 (string "10" → number 10)
"3.14" * 2            -- 6.28
"0x10" + 0            -- 16 (hex string coerced)
"abc" + 1             -- ERROR: attempt to perform arithmetic on a string value

-- Comparison: NO coercion between string and number
"10" == 10            -- false (different types)
"10" < 20             -- ERROR: attempt to compare string with number
-- (string < string uses lexicographic byte comparison)
"abc" < "abd"          -- true (byte comparison)
```
::

### Anti-pattern: relying on string coercion in arithmetic

::code-wrapper{language="lua"}
```lua
-- BAD: implicit coercion is fragile — breaks on non-numeric strings, no validation
local total = data["count"] + 1  -- if data.count is "N/A" → runtime error

-- GOOD: explicit tonumber with validation
local count = tonumber(data.count)
if not count then
  error("expected number, got: " .. tostring(data.count))
end
local total = count + 1

-- PRODUCTION: typed access layer
local function get_number(t, key, default)
  local v = t[key]
  if v == nil then return default end
  if type(v) == "number" then return v end
  local n = tonumber(v)
  if n then return n end
  error(string.format("field '%s' must be a number, got %s", key, type(v)), 2)
end
```
::

## Memory: References, GC, Weak Tables

::code-wrapper{language="lua"}
```lua
-- Tables, functions, threads, userdata are reference types (GC-allocated)
-- Strings, numbers, booleans, nil are value types (copied on assignment)

local t1 = {a = 1}
local t2 = t1          -- t2 and t1 point to the SAME table object
t2.a = 99
print(t1.a)            -- 99 (same object)

local s1 = "hello"
local s2 = s1          -- s2 gets a reference to the same interned string
s2 = "world"           -- s2 now points to "world"; s1 still "hello" (immutable)

-- Weak tables: entries don't prevent GC of keys/values
local cache = setmetatable({}, {__mode = "v"})  -- weak values
local obj = {id = 1}
cache[1] = obj
obj = nil              -- only reference was in cache — now eligible for GC
collectgarbage()       -- force GC cycle
print(cache[1])        -- nil (value was collected)

-- Weak keys: {__mode = "k"} — key can be collected if no other references
-- Weak both: {__mode = "kv"}

-- Memoization with weak cache (auto-evicts when key is GC'd):
local memoize = setmetatable({}, {__mode = "k"})
local function expensive(x)
  if memoize[x] then return memoize[x] end
  local result = x * x  -- simulate work
  memoize[x] = result
  return result
end
```
::

## 💡 Tips & Tricks

**Use `math.tointeger()` to validate integer inputs**: Returns `nil` if the float can't be represented as an integer (precision loss).

::code-wrapper{language="lua"}
```lua
local function require_int(v)
  local n = math.tointeger(v)
  if not n then error("not an integer: " .. tostring(v), 2) end
  return n
end
```
::

**`select()` for varargs without table allocation**: `select(i, ...)` returns args i..n without packing into a table — zero allocation.

::code-wrapper{language="lua"}
```lua
local function vararg_len(...)
  return select("#", ...)  -- count without allocating {...}
end
```
::

**Use `next(t)` as a "is empty" check**: `next(t)` returns nil if the table is empty — O(1).

::code-wrapper{language="lua"}
```lua
local function is_empty(t)
  return next(t) == nil  -- true if no keys at all (checks both array and hash part)
end
```
::

## ⚠️ Edge Cases & Gotchas

**`nil` in table constructor removes the key**: `local t = {a = 1, b = nil, c = 3}` — key `b` does not exist. It's not "set to nil"; it's absent.

::code-wrapper{language="lua"}
```lua
local t = {a = 1, b = nil, c = 3}
print(t.b)            -- nil (key doesn't exist)
print(next(t, "a"))   -- "c" (b is skipped — it's not in the table)
```
::

**Float comparison is inexact**: `0.1 + 0.2 == 0.3` is `false` due to IEEE 754 representation.

::code-wrapper{language="lua"}
```lua
0.1 + 0.2 == 0.3      -- false
-- Use epsilon comparison for floats:
local function feq(a, b, eps)
  return math.abs(a - b) < (eps or 1e-10)
end
feq(0.1 + 0.2, 0.3)  -- true
```
::

**Integer division `//` rounds toward negative infinity**, not zero:

::code-wrapper{language="lua"}
```lua
7 // 2       -- 3
-7 // 2      -- -4  (floor: toward -inf, not -3 like C's integer division)
7 // -2      -- -4
-7 // -2     -- 3
-- If you need truncation toward zero: math.floor(a / b) won't match // for negatives.
-- Use: a > 0 and b > 0 and a // b or math.ceil(a / b) (careful with signs)
```
::

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local items = {}
for i = 1, 5 do
  items[i] = function() return i * 10 end
end
items[1]()  -- ???
items[5]()  -- ???
```

<details>
<summary>Answer</summary>

`items[1]()` → `10`, `items[5]()` → `50`.

In a `for` loop, the loop variable `i` is a fresh local per iteration (this is defined behavior in Lua 5.0+). Each closure captures its own `i` upvalue. This is different from while-loop capture (shown above). The `for` loop desugars to creating a new local `i` per iteration body, so each closure gets an independent cell.

If you used a `while` loop with a shared `i`, all closures would return `50`.

</details>