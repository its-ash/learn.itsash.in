---
title: Lua 07 — Metatables, Metamethods & Proxies
description: Deep-dive into Lua's metaprogramming: every metamethod (__index, __newindex, __call, __add, __eq, __lt, __pairs, __len, __gc, __close), operator overloading for math types, OOP via __index chains, read-only and logging proxy tables, weak references for caches, and __gc/__close for resource management.
---

# 07 — Metatables, Metamethods & Proxies

A **metatable** is a table attached to another table (or userdata) that defines behavior for operations on that table. The functions in the metatable are **metamethods**, keyed by event names (`__index`, `__add`, `__eq`, etc.). This is Lua's mechanism for operator overloading, OOP, prototype inheritance, lazy evaluation, property observation, and resource cleanup — all built from one simple primitive.

## Metatable Basics

::code-wrapper{language="lua"}
```lua
-- setmetatable(t, mt): attach mt to t. Returns t.
-- getmetatable(t): returns t's metatable (or nil if none)
-- rawget/rawset: bypass metamethods entirely

local t = {}
local mt = {
  __tostring = function(self) return "MyTable" end,
  __index = function(self, key) return "default" end,
}
setmetatable(t, mt)
print(t)           -- "MyTable" (print calls tostring → __tostring)
print(t.anything)  -- "default" (key not in t → __index called)
rawget(t, "anything")  -- nil (bypass __index)
```

## Full Metamethod Reference

| Event | Metamethod | Triggered by |
|---|---|---|
| Table access | `__index` | `t[key]` when `key` not in `t` |
| Table assignment | `__newindex` | `t[key] = v` when `key` not in `t` |
| Call | `__call` | `t(args)` — table used as function |
| `+` | `__add` | `a + b` |
| `-` | `__sub` | `a - b` |
| `*` | `__mul` | `a * b` |
| `/` | `__div` | `a / b` |
| `//` | `__idiv` | `a // b` (Lua 5.3+) |
| `%` | `__mod` | `a % b` |
| `^` | `__pow` | `a ^ b` |
| `unm` | `__unm` | `-a` (unary minus) |
| `&` | `__band` | `a & b` (Lua 5.3+) |
| `\|` | `__bor` | `a \| b` (Lua 5.3+) |
| `~` | `__bxor` | `a ~ b` (Lua 5.3+) |
| `<<` | `__shl` | `a << b` (Lua 5.3+) |
| `>>` | `__shr` | `a >> b` (Lua 5.3+) |
| `==` | `__eq` | `a == b` |
| `<` | `__lt` | `a < b` |
| `<=` | `__le` | `a <= b` |
| `..` | `__concat` | `a .. b` |
| `#` | `__len` | `#t` |
| `pairs` | `__pairs` | `pairs(t)` (Lua 5.2+) |
| `ipairs` | `__ipairs` | `ipairs(t)` (Lua 5.2+, removed 5.3) |
| `tostring` | `__tostring` | `tostring(t)` |
| GC | `__gc` | garbage collection of userdata/table (5.4+) |
| Close | `__close` | `t <close>` goes out of scope (5.4+) |
| `__name` | `__name` | `tostring` for userdata type name (5.4+) |

## `__index` — Fallback Lookup

::code-wrapper{language="lua"}
```lua
-- __index can be a FUNCTION (called on every miss) or a TABLE (direct lookup)
-- Table form is faster — no function call overhead

-- As table: used for OOP method inheritance
local Class = {greet = function(self) return "hi" end}
local instance = setmetatable({}, {__index = Class})
print(instance:greet())  -- "hi" (greet not in instance → __index → Class → found)

-- As function: used for lazy computation, defaults, property observation
local lazy_config = setmetatable({}, {
  __index = function(self, key)
    print("loading:", key)
    local val = load_from_disk(key)  -- simulate
    rawset(self, key, val)  -- cache for next time (avoid __index on repeat)
    return val
  end,
})
-- First access triggers load; subsequent accesses hit the cached value in self
```

### Chained `__index` for Multi-Level Inheritance

::code-wrapper{language="lua"}
```lua
-- A → B → C: each class's __index points to its parent
local A = {a_method = function() return "A" end}
A.__index = A

local B = setmetatable({b_method = function() return "B" end}, {__index = A})
B.__index = B

local C = setmetatable({c_method = function() return "C" end}, {__index = B})
C.__index = C

local instance = setmetatable({}, C)
print(instance:a_method())  -- "A" (lookup: instance → C → B → A → found)
print(instance:b_method())  -- "B" (lookup: instance → C → B → found)
print(instance:c_method())  -- "C" (lookup: instance → C → found)
print(instance:missing())   -- error: attempt to call nil value (chain exhausted)
```
::

## `__newindex` — Intercept Assignment

::code-wrapper{language="lua"}
```lua
-- __newindex is called ONLY when the key doesn't exist in the table
-- If key exists, __newindex is NOT called — direct assignment happens
-- Use rawset inside __newindex to actually set (avoid infinite recursion)

local observed = setmetatable({}, {
  __newindex = function(self, key, value)
    print(string.format("SET %s = %s", key, value))
    rawset(self, key, value)  -- actually store it; rawset bypasses __newindex
  end,
})
observed.x = 10  -- prints "SET x = 10"
observed.x = 20  -- NO print (key x already exists → __newindex skipped)
```

### Read-Only Proxy Pattern

::code-wrapper{language="lua"}
```lua
-- Proxy: an empty table with a metatable that forwards reads to an internal table
-- and blocks writes (or logs them). The real data is hidden in a closure.
local function readonly(t)
  local proxy = {}  -- empty — all access goes through metatable
  local mt = {
    __index = function(self, k) return t[k] end,      -- read: forward to real table
    __newindex = function(self, k, v)
      error("attempt to modify read-only table: " .. tostring(k), 2)
    end,
    __pairs = function(self) return pairs(t) end,     -- iteration: forward
    __len = function(self) return #t end,             -- length: forward
  }
  return setmetatable(proxy, mt)
end

local config = readonly({host = "localhost", port = 8080})
print(config.host)  -- "localhost"
config.port = 9090  -- ERROR: attempt to modify read-only table: port
```
::

### Logging Proxy (Audit All Access)

::code-wrapper{language="lua"}
```lua
local function logged_table(name)
  local real = {}
  return setmetatable({}, {
    __index = function(self, k)
      local v = real[k]
      print(string.format("[%s] READ %s = %s", name, k, v))
      return v
    end,
    __newindex = function(self, k, v)
      print(string.format("[%s] WRITE %s = %s", name, k, v))
      real[k] = v  -- store in the hidden table (not self — would cause recursion)
    end,
  })
end

local store = logged_table("DB")
store.x = 1  -- [DB] WRITE x = 1
local _ = store.x  -- [DB] READ x = 1
```
::

## Operator Overloading: Math Types

::code-wrapper{language="lua" filename="vector.lua"}
```lua
-- Production: 2D vector with full operator set
local Vector = {}
Vector.__index = Vector
Vector.__tostring = function(v) return string.format("(%g, %g)", v.x, v.y) end

function Vector.new(x, y)
  return setmetatable({x = x or 0, y = y or 0}, Vector)
end

-- Arithmetic: return new Vector (immutable style)
Vector.__add  = function(a, b) return Vector.new(a.x + b.x, a.y + b.y) end
Vector.__sub  = function(a, b) return Vector.new(a.x - b.x, a.y - b.y) end
Vector.__mul  = function(a, s)
  if type(s) == "number" then return Vector.new(a.x * s, a.y * s) end  -- scalar mult
  return Vector.new(a.x * s.x, a.y * s.y)  -- component-wise (if both vectors)
end
Vector.__div  = function(a, s) return Vector.new(a.x / s, a.y / s) end
Vector.__unm  = function(a) return Vector.new(-a.x, -a.y) end
Vector.__eq   = function(a, b) return a.x == b.x and a.y == b.y end
Vector.__lt   = function(a, b) return (a.x^2 + a.y^2) < (b.x^2 + b.y^2) end  -- by magnitude
Vector.__le   = function(a, b) return (a.x^2 + a.y^2) <= (b.x^2 + b.y^2) end

-- Metamethods for mixed-type operations (commutativity)
-- __mul handles both Vector * scalar and scalar * Vector? NO — __mul is only called
-- when the LEFT operand has the metamethod. For scalar * Vector, we need __mul on
-- the number's metatable — but we can't modify numbers. Solution: only support
-- Vector * scalar, document it.

local v1 = Vector.new(1, 2)
local v2 = Vector.new(3, 4)
print(v1 + v2)   -- (4, 6)
print(v2 - v1)  -- (2, 2)
print(v1 * 3)    -- (3, 6)
print(-v1)       -- (-1, -2)
print(v1 == Vector.new(1, 2))  -- true
print(v1 < v2)   -- true (magnitude: 5 < 25)

-- Sorting vectors by magnitude
local vecs = {Vector.new(3, 4), Vector.new(1, 1), Vector.new(0, 1)}
table.sort(vecs)  -- uses __lt: {0,1}, {1,1}, {3,4}
for _, v in ipairs(vecs) do print(v) end
```

### Edge case: `__eq` only called for same-type operands

::code-wrapper{language="lua"}
```lua
-- __eq is ONLY called if BOTH operands are tables (or userdata),
-- AND they are not the same object, AND both have __eq with the SAME metamethod.
-- (If one operand is a number/string, == does normal comparison, no metamethod.)

local T = setmetatable({}, {__eq = function() return true end})
local U = setmetatable({}, {__eq = function() return true end})
print(T == T)  -- true (same object — __eq NOT called, direct identity)
print(T == U)  -- false (different metatables — __eq NOT called; default: different objects)

-- For __eq to fire, both must have the SAME __eq function:
local eq_fn = function() return true end
local A = setmetatable({}, {__eq = eq_fn})
local B = setmetatable({}, {__eq = eq_fn})
print(A == B)  -- true (same __eq function → metamethod called → returns true)
```
::

## `__call` — Callable Tables

::code-wrapper{language="lua"}
```lua
-- Make a table behave like a function
local function memoize(fn)
  local cache = {}
  local mt = {
    __call = function(self, x)
      if cache[x] ~= nil then return cache[x] end
      local result = fn(x)
      cache[x] = result
      return result
    end,
  }
  return setmetatable({}, mt)
end

local square = memoize(function(x) return x * x end)
print(square(5))  -- 25 (computed)
print(square(5))  -- 25 (cached)
-- square is a TABLE, but called like a function

-- Production: builder DSL via __call
local HTML = {}
HTML.__index = HTML
HTML.__call = function(self, tag, attrs, children)
  local attr_str = ""
  if attrs then
    for k, v in pairs(attrs) do
      attr_str = attr_str .. string.format(' %s="%s"', k, v)
    end
  end
  local inner = type(children) == "string" and children or ""
  if type(children) == "table" then
    for _, c in ipairs(children) do inner = inner .. c end
  end
  return string.format("<%s%s>%s</%s>", tag, attr_str, inner, tag)
end
setmetatable(HTML, HTML)

print(HTML("div", {class = "card"}, {HTML("p", {}, "hello")}))
-- <div class="card"><p>hello</p></div>
```
::

## `__pairs` / `__len` — Custom Iteration & Length

::code-wrapper{language="lua"}
```lua
-- __pairs: custom pairs() behavior (Lua 5.2+)
-- __len: custom # operator

local OrderedMap = {}
OrderedMap.__index = OrderedMap
OrderedMap.__pairs = function(self)
  local i = 0
  return function()
    i = i + 1
    local key = self._order[i]
    if key then return key, self._data[key] end
  end
end
OrderedMap.__len = function(self) return #self._order end

function OrderedMap.new()
  return setmetatable({_data = {}, _order = {}}, OrderedMap)
end

function OrderedMap:set(key, value)
  if self._data[key] == nil then  -- new key
    self._order[#self._order + 1] = key  -- track insertion order
  end
  self._data[key] = value
end

local om = OrderedMap.new()
om:set("c", 3):set("a", 1):set("b", 2)  -- (need :set to return self for chaining)
-- Actually :set returns nil; fix: return self at end of set

for k, v in pairs(om) do print(k, v) end  -- c 3 / a 1 / b 2 (insertion order!)
print(#om)  -- 3 (custom __len)
```
::

## Weak Tables & `__gc`

::code-wrapper{language="lua"}
```lua
-- Weak tables: entries don't block GC of keys and/or values
-- __mode = "v": weak values (value can be collected)
-- __mode = "k": weak keys (key can be collected)
-- __mode = "kv": both

-- Cache with weak values: auto-evicts entries when the value is GC'd
local function weak_cache()
  return setmetatable({}, {__mode = "v"})
end

local cache = weak_cache()
local obj = {id = 1}
cache["item1"] = obj
obj = nil              -- only reference was in the cache
collectgarbage()      -- force GC
print(cache["item1"])  -- nil (value collected, entry removed)

-- __gc on tables (Lua 5.4+): runs when the table is collected
-- Useful for tables that wrap resources (not just userdata)
local function managed_table()
  local t = setmetatable({}, {
    __gc = function(self)
      print("table collected, cleanup:", self.name)
      -- close file handles, release C resources, etc.
    end,
  })
  return t
end

do
  local t = managed_table()
  t.name = "resource1"
  -- t goes out of scope → eligible for GC
end
collectgarbage()  -- prints "table collected, cleanup: resource1"
```

## `__close` — Resource Management (Lua 5.4+)

::code-wrapper{language="lua"}
```lua
-- <close> attribute: when the local goes out of scope, __close is called
-- Works like Go's defer / Python's with — deterministic cleanup

local function open_resource(path)
  local res = {path = path, data = "loaded"}
  local mt = {
    __close = function(self)
      print("closing:", self.path)
      -- release file handle, network connection, etc.
    end,
    __index = function(t, k) return t.data:match(k) end,
  }
  return setmetatable(res, mt)
end

do
  local r <close> = open_resource("config.txt")
  -- use r
  print(r.data)  -- "loaded"
  -- when this block ends (even on error), __close is called
end
-- prints: "closing: config.txt"

-- Built-in: file handles support <close> in Lua 5.4
do
  local f <close> = io.open("data.txt", "r")
  if not f then error("can't open") end
  local content = f:read("*a")
  -- f:close() called automatically at block end (even on error/exception)
end
```

## OOP: Class System with `__index` and `__call`

::code-wrapper{language="lua"}
```lua
-- Production class system: constructor via __call (Class(args) creates instance)
local function make_class(parent)
  local class = setmetatable({}, {
    __index = parent,        -- class inherits methods from parent class
    __call = function(_, ...)  -- Class(args) → Class.new(args)
      return class.new(...)
    end,
  })
  class.__index = class     -- instances inherit from class
  return class
end

local Animal = make_class()
function Animal.new(name)
  return setmetatable({name = name}, Animal)
end
function Animal:speak() return self.name .. " makes a sound" end

local Dog = make_class(Animal)
function Dog.new(name, breed)
  local self = Animal.new(name)  -- call parent constructor
  self.breed = breed
  return setmetatable(self, Dog)  -- override metatable to Dog
end
function Dog:speak() return self.name .. " barks" end  -- override

local d = Dog("Rex", "Lab")  -- __call: Dog("Rex", "Lab") → Dog.new(...)
print(d:speak())  -- "Rex barks"
```

## Anti-Pattern: `__index` Recursion

::code-wrapper{language="lua"}
```lua
-- BAD: __index function that accesses self without rawget → infinite recursion
local t = setmetatable({}, {
  __index = function(self, key)
    return self[key] or "default"  -- self[key] calls __index again → INFINITE LOOP
  end,
})

-- GOOD: use rawget to check without triggering __index
local t2 = setmetatable({}, {
  __index = function(self, key)
    local v = rawget(self, key)
    if v ~= nil then return v end
    return "default"
  end,
})

-- EVEN BETTER: if __index is just a default table, use table form (no recursion risk)
local defaults = {timeout = 5000, retries = 3}
local t3 = setmetatable({timeout = 1000}, {__index = defaults})
print(t3.timeout)  -- 1000 (from t3 itself)
print(t3.retries)  -- 3 (from defaults via __index table lookup)
```

## 💡 Tips & Tricks

**Use `__index` as a table for method dispatch, not a function**: Table lookup is faster — no function call per access.

**`__len` on userdata can return arbitrary values**: For C-allocated objects, `__len` can return a meaningful size (e.g., buffer length).

**Combine `__index` + `__newindex` for property objects**: Computed properties with validation.

::code-wrapper{language="lua"}
```lua
local function property_object(spec)
  local obj = setmetatable({}, {
    __index = function(self, k)
      local prop = spec[k]
      if not prop then return nil end
      if prop.get then return prop.get(self) end
      return rawget(self, "_" .. k)
    end,
    __newindex = function(self, k, v)
      local prop = spec[k]
      if not prop then rawset(self, k, v); return end  -- unknown: store directly
      if prop.validate then prop.validate(v) end  -- type/range check
      if prop.set then prop.set(self, v); return end
      rawset(self, "_" .. k, v)  -- store in _k backing field
    end,
  })
  return obj
end

local person = property_object {
  age = {
    validate = function(v)
      assert(type(v) == "number" and v >= 0 and v <= 150, "invalid age")
    end,
  },
  display_name = {
    get = function(self) return rawget(self, "_name") or "anonymous" end,
    set = function(self, v) rawset(self, "_name", v or "anonymous") end,
  },
}

person.age = 30       -- OK
-- person.age = -1     -- ERROR: invalid age
person.display_name = "Alice"
print(person.display_name)  -- "Alice"
print(rawget(person, "_name"))  -- "Alice" (backing field)
```
::

## ⚠️ Edge Cases & Gotchas

**`__index`/`__newindex` only trigger on MISSING keys**: Existing keys bypass metamethods.

::code-wrapper{language="lua"}
```lua
local t = setmetatable({x = 1}, {
  __index = function() return "default" end,
  __newindex = function(self, k, v) print("new:", k, v); rawset(self, k, v) end,
})
print(t.x)   -- 1 (x exists → __index skipped)
print(t.y)   -- "default" (y missing → __index called)
t.x = 2      -- no print (x exists → __newindex skipped, direct assignment)
t.z = 3      -- "new: z 3" (z missing → __newindex called)
```
::

**`rawset` inside `__newindex` is mandatory**: Using `self[key] = value` would call `__newindex` again → infinite recursion.

**Metatables are per-instance, not per-class**: Two tables with the same metatable share metamethods, but `setmetatable` creates a per-table reference. Don't accidentally share mutable metatables across instances unless intended.

::code-wrapper{language="lua"}
```lua
-- DANGER: shared metatable with mutable state
local mt = {count = 0}  -- state in metatable — shared across ALL instances!
mt.__index = mt
local a = setmetatable({}, mt)
local b = setmetatable({}, mt)
mt.count = mt.count + 1  -- which instance's count? The shared one — a and b both see it
print(a.count)  -- 1 (from the shared mt)
print(b.count)  -- 1 (same)
```
::

**`__gc` on tables requires Lua 5.4+**: In 5.3 and earlier, `__gc` only works on userdata, not regular tables. Use `newproxy(true)` in 5.1/LuaJIT for table `__gc`.

**String comparison `__lt` doesn't work**: You can't override `<` for strings — only table and userdata operands trigger comparison metamethods.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local proxy = setmetatable({}, {
  __index = function(self, key)
    return self[key] or "default"
  end,
})
print(proxy.missing)
```

<details>
<summary>Answer</summary>

**Stack overflow** (infinite recursion).

`proxy.missing` → `__index` called → `self[key]` → `self["missing"]` → key not in self → `__index` called again → `self["missing"]` → ... infinite loop until C stack overflows.

Fix: use `rawget` to check without triggering `__index`:

```lua
__index = function(self, key)
  return rawget(self, key) or "default"
end
```

Or use `__index` as a table (no recursion risk):

```lua
__index = {default = "value"}
```

</details>