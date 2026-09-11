---
title: Lua 05 — Tables, OOP, Copy Semantics & Data Structures
description: Deep-dive into Lua's unified table model: array/hash part internals, reference vs value semantics, shallow vs deep copy, OOP via metatables with inheritance and mixins, and production data structures (linked list, ring buffer, object pool, observer pattern).
---

# 05 — Tables, OOP, Copy Semantics & Data Structures

Tables are Lua's **only composite data structure**. They serve as arrays, dictionaries, objects, classes, sets, and namespaces. Internally, each table has an **array part** (1..n, contiguous) and a **hash part** (all other keys). The boundary is determined by a rehash algorithm. Understanding copy semantics (reference vs value), OOP patterns via `__index`, and how to build production data structures is the core of writing non-trivial Lua.

## Table Internals: Array Part vs Hash Part

::code-wrapper{language="lua"}
```lua
-- The array part stores keys 1..n contiguously (C array — O(1) access)
-- The hash part stores everything else (hash table — O(1) amortized)
-- The VM automatically decides the split during rehash (triggered on insertion)

local t = {10, 20, 30}       -- array part: [1]=10, [2]=20, [3]=30
t.name = "Alice"             -- hash part: name="Alice"
t[5] = 50                    -- hash part (non-contiguous: gap at 4)
t[4] = 40                    -- NOW contiguous 1..5 → rehash moves 4,5 to array part
#t                           -- 5 (length of array part)

-- Constructor: positional args go to array part, named to hash part
local mixed = {
  100, 200,                  -- array: [1]=100, [2]=200
  name = "test",             -- hash:  name="test"
  [10] = "x",                -- hash:  [10]="x" (non-contiguous)
}

-- The # operator: returns ANY n where t[n] ~= nil and t[n+1] == nil
-- For contiguous arrays, this is the length. For sparse arrays, undefined.
local sparse = {1, 2, nil, 4}  -- literal: actually {1, 2, [4]=4} — key 3 doesn't exist
#sparse                      -- 2 (any border 2 or 4 is valid; impl-dependent)
```

### Edge case: rehash triggers and array part growth

::code-wrapper{language="lua"}
```lua
-- Each insertion that hits a new hash key may trigger a rehash if the hash part is full.
-- Rehash: O(n) — resizes both parts, reinserts all entries.
-- Anti-pattern: building a large array one element at a time triggers log(n) rehashes.

-- BAD: N rehashes for N insertions (amortized O(1) but with allocation spikes)
local t = {}
for i = 1, 1000000 do
  t[i] = i  -- triggers rehash at powers of 2: 2, 4, 8, ... 524288, 1048576
end

-- GOOD: pre-allocate by filling the array part in one shot (constructor or loop)
local t = {}
for i = 1, 1000000 do
  t[i] = 0  -- still triggers rehashes, but at least the values are cheap
end
-- BEST: if you know the size, use a single constructor or set all at once
local t = table.pack(table.unpack({}))  -- no, just use a loop and accept it
-- Lua doesn't expose a "reserve" API. The rehash doubling strategy is amortized O(1).
```
::

## Reference vs Value Semantics

::code-wrapper{language="lua"}
```lua
-- Tables are REFERENCE types: assignment copies the reference, not the data
local a = {x = 1}
local b = a           -- b and a point to the SAME table object
b.x = 99
print(a.x)            -- 99 (same object)

-- Passing to a function: also passes the reference (mutation visible to caller)
local function mutate(t)
  t.x = t.x + 1       -- mutates the caller's table
end
local data = {x = 10}
mutate(data)
print(data.x)         -- 11

-- Identity check: == compares references, NOT content
local t1, t2 = {1,2}, {1,2}
print(t1 == t2)       -- false (different objects, even if content identical)
print(t1 == t1)       -- true (same object)

-- Strings ARE compared by content (interned)
print("hello" == "hello")  -- true (same interned string object)
```

## Shallow vs Deep Copy

::code-wrapper{language="lua"}
```lua
-- Shallow copy: copy top-level keys; nested tables are still shared references
local function shallow_copy(t)
  local c = {}
  for k, v in pairs(t) do
    c[k] = v  -- if v is a table, c[k] and t[k] point to the SAME nested table
  end
  return c
end

local original = {a = 1, nested = {b = 2}}
local copy = shallow_copy(original)
copy.a = 99
copy.nested.b = 999
print(original.a)        -- 1 (not affected — top-level copy)
print(original.nested.b) -- 999 (AFFECTED — nested table is shared!)

-- Deep copy: recursively copy nested tables. Handles cycles via memo table.
local function deep_copy(t, seen)
  seen = seen or {}
  if seen[t] then return seen[t] end  -- cycle detected — return existing copy
  if type(t) ~= "table" then return t end  -- non-table: return as-is (value type)
  local c = {}
  seen[t] = c  -- register before recursing (for cycles)
  for k, v in pairs(t) do
    c[deep_copy(k, seen)] = deep_copy(v, seen)  -- keys can also be tables (rare)
  end
  return setmetatable(c, getmetatable(t))  -- preserve metatable
end

local cyclic = {}
cyclic.self = cyclic  -- self-referential
local safe = deep_copy(cyclic)
print(safe.self == safe)  -- true (cycle preserved correctly, no infinite loop)
```

### Anti-pattern: shared default table in function parameters

::code-wrapper{language="lua"}
```lua
-- BAD: default table is shared across all calls — mutations persist!
local function process(data)
  data = data or {}  -- if nil, uses the SAME {} every call? NO — Lua creates fresh {} per call
  -- Actually this is safe in Lua! Unlike Python's mutable default args, Lua's
  -- `or {}` evaluates the {} constructor fresh each call. This is fine.
  data.count = (data.count or 0) + 1
  return data
end
process().count  -- 1
process().count  -- 1 (fresh table each call — safe)

-- The REAL trap: default table stored in an upvalue (shared)
local default_opts = {verbose = false, timeout = 5000}  -- shared object!
local function process2(opts)
  opts = opts or default_opts  -- if caller passes nothing, uses SHARED default_opts
  opts.verbose = true  -- MUTATES the shared default!
  -- Next call with no args: opts.verbose is NOW true (leaked state)
end
process2()
process2()  -- default_opts.verbose is now true — BUG

-- FIX: copy the defaults, don't share the reference
local function process3(opts)
  opts = opts and shallow_copy(opts) or shallow_copy(default_opts)
  opts.verbose = true  -- safe: mutates a copy, not the shared default
end
```
::

## OOP: Classes via Metatables

::code-wrapper{language="lua"}
```lua
-- Class pattern: metatable as the class, __index = self for method lookup
local Animal = {}
Animal.__index = Animal  -- instances inherit methods from Animal table

function Animal.new(name, sound)
  -- setmetatable creates the instance; __index routes unknown lookups to Animal
  local self = setmetatable({}, Animal)
  self.name = name
  self.sound = sound
  return self
end

function Animal:speak()
  return self.name .. " says " .. self.sound
end

function Animal:rename(new_name)
  self.name = new_name
  return self
end

local cat = Animal.new("Whiskers", "meow")
print(cat:speak())  -- "Whiskers says meow"
-- cat:speak() → cat.speak → not in instance → __index → Animal.speak → call with self=cat

-- Method call syntax: `:` passes self automatically, `.` does not
cat:speak()       -- self = cat (implicit)
cat.speak(cat)    -- explicit self (same thing)
```

## Inheritance via `__index` Chain

::code-wrapper{language="lua"}
```lua
-- Single inheritance: derived class's __index points to base class
local Dog = setmetatable({}, {__index = Animal})  -- Dog inherits from Animal
Dog.__index = Dog  -- Dog instances inherit from Dog (which inherits from Animal)

function Dog.new(name, breed)
  local self = Animal.new(name, "woof")  -- call base constructor
  self.breed = breed
  return setmetatable(self, Dog)  -- override metatable to Dog
end

function Dog:fetch()
  return self.name .. " fetches the ball"
end

-- Override base method
function Dog:speak()
  return self.name .. " barks loudly!"
end

local buddy = Dog.new("Buddy", "Labrador")
print(buddy:speak())  -- "Buddy barks loudly!" (Dog's override)
print(buddy:fetch())  -- "Buddy fetches the ball" (Dog's method)
print(buddy:rename("Doge"):speak())  -- "Doge barks loudly!" (inherited from Animal)
-- Method lookup chain: buddy → Dog (speak found here) → stop
-- Method lookup chain: buddy → Dog (rename not found) → Animal (found here)

-- Multi-level inheritance: A → B → C via chained __index
local Puppy = setmetatable({}, {__index = Dog})
Puppy.__index = Puppy
function Puppy.new(name, breed)
  local self = Dog.new(name, breed)
  self.age = 0
  return setmetatable(self, Puppy)
end
function Puppy:growth_year()
  self.age = self.age + 1
  return self
end
local pup = Puppy.new("Rex", "Poodle")
print(pup:speak())  -- "Rex barks loudly!" (inherited from Dog via chain)
```

## Mixins: Multiple Inheritance Alternative

::code-wrapper{language="lua"}
```lua
-- Lua has no multiple inheritance. Mixins: copy methods from multiple tables into one class.
local function mixin(target, ...)
  for _, source in ipairs({...}) do
    for k, v in pairs(source) do
      if k ~= "__index" and type(v) == "function" then
        target[k] = v  -- copy method references
      end
    end
  end
end

-- Define capabilities as independent tables
local Observable = {}
function Observable:on(event, fn)
  self._listeners = self._listeners or {}
  self._listeners[event] = self._listeners[event] or {}
  table.insert(self._listeners[event], fn)
  return self
end
function Observable:emit(event, ...)
  for _, fn in ipairs(self._listeners and self._listeners[event] or {}) do
    fn(...)
  end
end

local Serializable = {}
function Serializable:serialize()
  local t = {}
  for k, v in pairs(self) do
    if type(k) == "string" and not k:match("^_") then
      t[k] = v
    end
  end
  return t
end

-- Compose: a class with multiple capabilities
local EventEmitter = {}
EventEmitter.__index = EventEmitter
mixin(EventEmitter, Observable, Serializable)

function EventEmitter.new(id)
  return setmetatable({id = id}, EventEmitter)
end

local emitter = EventEmitter.new("e1")
emitter:on("data", function(x) print("got:", x) end)
emitter:emit("data", 42)  -- "got: 42"
print(emitter:serialize().id)  -- "e1"
```

## Production Data Structures

### Linked list (O(1) prepend)

::code-wrapper{language="lua"}
```lua
local List = {}
List.__index = List

function List.new()
  return setmetatable({head = nil, tail = nil, size = 0}, List)
end

function List:push_front(v)  -- O(1)
  self.head = {value = v, next = self.head}
  if not self.tail then self.tail = self.head end
  self.size = self.size + 1
  return self
end

function List:push_back(v)  -- O(1) (with tail pointer)
  local node = {value = v, next = nil}
  if self.tail then
    self.tail.next = node
  else
    self.head = node
  end
  self.tail = node
  self.size = self.size + 1
  return self
end

function List:pop_front()  -- O(1)
  if not self.head then return nil end
  local v = self.head.value
  self.head = self.head.next
  if not self.head then self.tail = nil end
  self.size = self.size - 1
  return v
end

function List:iter()  -- stateless iterator
  local function walker(node) return node and node.value, node.next end
  return coroutine.wrap(function()
    local node = self.head
    while node do
      coroutine.yield(node.value)
      node = node.next
    end
  end)
end

local list = List.new()
list:push_back(1):push_front(0):push_back(2)
for v in list:iter() do io.write(v, " ") end  -- 0 1 2
```

### Ring buffer (fixed-size, O(1) push/pop)

::code-wrapper{language="lua"}
```lua
local RingBuffer = {}
RingBuffer.__index = RingBuffer

function RingBuffer.new(capacity)
  return setmetatable({
    buf = {}, capacity = capacity, head = 1, size = 0
  }, RingBuffer)
end

function RingBuffer:push(v)
  local idx = (self.head + self.size - 1) % self.capacity + 1
  self.buf[idx] = v
  if self.size < self.capacity then
    self.size = self.size + 1
  else
    self.head = (self.head % self.capacity) + 1  -- overwrite oldest, advance head
  end
  return self
end

function RingBuffer:pop()  -- oldest element
  if self.size == 0 then return nil end
  local v = self.buf[self.head]
  self.buf[self.head] = nil  -- clear for GC
  self.head = (self.head % self.capacity) + 1
  self.size = self.size - 1
  return v
end

local rb = RingBuffer.new(3)
rb:push("a"):push("b"):push("c"):push("d")  -- overwrites "a"
print(rb:pop())  -- "b" (oldest remaining)
```

### Object pool (reuse allocations, reduce GC pressure)

::code-wrapper{language="lua"}
```lua
local Pool = {}
Pool.__index = Pool

function Pool.new(factory, reset_fn, max_size)
  return setmetatable({
    free = {}, factory = factory, reset_fn = reset_fn, max = max_size or 100
  }, Pool)
end

function Pool:acquire()
  if #self.free > 0 then
    return table.remove(self.free)  -- reuse existing object
  end
  return self.factory()  -- create new if pool empty
end

function Pool:release(obj)
  if self.reset_fn then self.reset_fn(obj) end  -- clear state for reuse
  if #self.free < self.max then
    self.free[#self.free + 1] = obj  -- return to pool
  end
  -- else: let GC collect (pool full)
end

-- Usage: pool of buffers (avoid allocation in hot loop)
local buffer_pool = Pool.new(
  function() return {data = {}} end,
  function(buf) buf.data = {} end,  -- reset: clear data
  50
)
local buf = buffer_pool:acquire()
buf.data[1] = 42
-- ... use buf ...
buffer_pool:release(buf)  -- return for reuse, no GC
```

## Table Library: `table.move`, `table.sort`, `table.concat`

::code-wrapper{language="lua"}
```lua
-- table.move(src, f, e, t, dest?): move elements src[f..e] to dest starting at t
local src = {10, 20, 30, 40, 50}
local dest = {}
table.move(src, 2, 4, 1, dest)  -- dest = {20, 30, 40}
-- In-place move (overlapping regions):
local a = {1, 2, 3, 4, 5}
table.move(a, 1, 3, 3)  -- a = {1, 2, 1, 2, 3} (shifted right)

-- table.sort: in-place, stable in 5.4+. Only sorts array part (1..n).
local nums = {5, 3, 1, 4, 2}
table.sort(nums)  -- {1, 2, 3, 4, 5}
table.sort(nums, function(a, b) return a > b end)  -- descending: {5, 4, 3, 2, 1}

-- Multi-key sort: sort by one field, then another (stable sort in reverse priority)
local users = {{name="B", age=30}, {name="A", age=30}, {name="C", age=25}}
table.sort(users, function(a, b) return a.age < b.age end)  -- primary: age
table.sort(users, function(a, b) return a.name < b.name end)  -- secondary: name
-- Result: A(30), B(30), C(25) → sorted by name, then age (stable sort preserves)
```

## 💡 Tips & Tricks

**Use `next(t)` to check if a table is empty**: O(1), no iteration.

::code-wrapper{language="lua"}
```lua
local function is_empty(t) return next(t) == nil end
```
::

**`table.concat` is the fastest way to build large strings**: Single allocation, no intermediate strings.

::code-wrapper{language="lua"}
```lua
-- CSV builder: 100K rows, 10 columns → 1M string fragments
local rows = {}
for i = 1, 100000 do
  rows[i] = table.concat({i, "name" .. i, "val" .. i, '"quoted"'} , ",")
end
local csv = table.concat(rows, "\n")  -- 2 concats total: per-row, then all rows
```
::

**Use `__index` as a table for method sharing, not a function**: Table lookup is faster than function call lookup.

::code-wrapper{language="lua"}
```lua
-- SLOWER: __index as function (called on every miss)
setmetatable(obj, {__index = function(t, k) return methods[k] end})

-- FASTER: __index as table (direct table lookup, no function call overhead)
setmetatable(obj, {__index = methods})
```
::

## ⚠️ Edge Cases & Gotchas

**`table.sort` only sorts the array part**: Hash keys (string keys, non-contiguous integer keys) are not sorted. Collect them into an array first.

::code-wrapper{language="lua"}
```lua
local t = {3, 1, name = "X", 2}
table.sort(t)  -- sorts array part: {1, 2, 3}; name="X" untouched
```
::

**Modifying a table during `pairs` iteration is undefined behavior**: Adding new keys may or may not be visited; removing keys may cause nil access.

::code-wrapper{language="lua"}
```lua
local t = {a = 1, b = 2, c = 3}
for k in pairs(t) do
  t[k .. "_new"] = t[k]  -- adding keys during iteration — UNDEFINED
end
-- Some new keys may be visited, some may not. Don't do this.

-- SAFE: collect keys first, then modify
local keys = {}
for k in pairs(t) do keys[#keys + 1] = k end
for _, k in ipairs(keys) do
  t[k .. "_new"] = t[k]  -- safe: iterating a separate array
end
```
::

**`ipairs` stops at the first `nil`**: Not suitable for sparse arrays or tables with intentional nil holes.

::code-wrapper{language="lua"}
```lua
local t = {1, 2, nil, 4, 5}
for i, v in ipairs(t) do print(i, v) end  -- 1 1 / 2 2 (stops at nil at index 3)
-- Use pairs() to iterate all existing keys, or maintain explicit length
```
::

**Deep copy with metatables must preserve the metatable**: Forgetting `setmetatable` breaks OOP after copy.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local Base = {}
Base.__index = Base
function Base.new() return setmetatable({x = 1}, Base) end
function Base:get() return self.x end

local Derived = setmetatable({}, {__index = Base})
Derived.__index = Derived
function Derived.new() return setmetatable({y = 2}, Derived) end

local d = Derived.new()
print(d:get(), d.y)
```

<details>
<summary>Answer</summary>

Prints `1 2`.

- `d:get()` → `d.get` not found → `__index = Derived` → `Derived.get` not found → `Derived.__index` → `{__index = Base}` → `Base.get` found → called with `self = d` → `d.x` → `1` (x set by... wait, Base.new was NOT called).

Actually: `Derived.new()` returns `setmetatable({y = 2}, Derived)`. The table only has `y = 2`, not `x = 1`. So `d:get()` → `self.x` → `nil`.

The output is `nil 2`. The bug: `Derived.new` doesn't call `Base.new()`, so `x` is never set. Fix:

```lua
function Derived.new()
  local self = Base.new()  -- set x = 1
  self.y = 2
  return setmetatable(self, Derived)  -- override metatable
end
```

Now `d:get()` returns `1` and `d.y` returns `2`.

</details>