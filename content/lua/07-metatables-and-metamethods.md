# 07 — Metatables & Metamethods

## Metatables Basics

Metatables define behavior for tables when operations occur (operator overloading, custom properties, etc.).

::code-wrapper{language="lua"}
```lua
local t = {a = 1}
local mt = {
  __tostring = function(self)
    return "custom string"
  end
}

setmetatable(t, mt)
print(t)            -- "custom string"

-- Get metatable
local mt2 = getmetatable(t)
mt2 == mt           -- true
```
::

## Metamethods

Metamethods are functions in a metatable that Lua calls automatically.

| Metamethod | Triggered by |
|---|---|
| `__add` | `a + b` |
| `__sub` | `a - b` |
| `__mul` | `a * b` |
| `__div` | `a / b` |
| `__mod` | `a % b` |
| `__pow` | `a ^ b` |
| `__eq` | `a == b` |
| `__lt` | `a < b` |
| `__le` | `a <= b` |
| `__index` | `a[b]` (table access) |
| `__newindex` | `a[b] = c` (table assignment) |
| `__call` | `a()` (function call) |
| `__tostring` | `tostring(a)` |
| `__len` | `#a` (length) |
| `__pairs` | `pairs(a)` |
| `__gc` | garbage collection |

## Arithmetic Metamethods

::code-wrapper{language="lua"}
```lua
local Vector = {}

function Vector.new(x, y)
  return setmetatable({x = x, y = y}, Vector)
end

function Vector.__add(a, b)
  return Vector.new(a.x + b.x, a.y + b.y)
end

function Vector.__sub(a, b)
  return Vector.new(a.x - b.x, a.y - b.y)
end

function Vector.__mul(v, scalar)
  return Vector.new(v.x * scalar, v.y * scalar)
end

function Vector.__eq(a, b)
  return a.x == b.x and a.y == b.y
end

function Vector.__tostring(v)
  return "(" .. v.x .. ", " .. v.y .. ")"
end

Vector.__index = Vector  -- enable method calls

local v1 = Vector.new(1, 2)
local v2 = Vector.new(3, 4)

print(v1 + v2)          -- "(4, 6)"
print(v2 - v1)          -- "(2, 2)"
print(v1 * 2)           -- "(2, 4)"
print(v1 == Vector.new(1, 2))  -- true
```
::

## `__index` Metamethod

Handles table access when key doesn't exist:

::code-wrapper{language="lua"}
```lua
local function newObject(name)
  local obj = {_name = name}
  local mt = {
    __index = function(self, key)
      print("Accessed:", key)
      return "default value"
    end
  }
  setmetatable(obj, mt)
  return obj
end

local o = newObject("test")
print(o.foo)            -- prints "Accessed: foo", returns "default value"
print(o._name)          -- "_name" (returns directly, doesn't call __index)
```
::

### `__index` as table (delegation)

::code-wrapper{language="lua"}
```lua
-- Instead of function, __index can be another table
local Parent = {name = "Parent", value = 42}

local Child = setmetatable({name = "Child"}, {__index = Parent})

print(Child.name)       -- "Child" (in Child itself)
print(Child.value)      -- 42 (delegated to Parent)
```
::

## `__newindex` Metamethod

Handles table assignment when key doesn't exist:

::code-wrapper{language="lua"}
```lua
local obj = {}
local mt = {
  __newindex = function(self, key, value)
    print("Setting " .. key .. " to " .. value)
    rawset(self, key, value)  -- actually set the value
  end
}
setmetatable(obj, mt)

obj.x = 10              -- prints "Setting x to 10"
print(obj.x)            -- 10
```
::

Use `rawset()` and `rawget()` to bypass metamethods:

::code-wrapper{language="lua"}
```lua
local t = setmetatable({}, {
  __index = function() return "default" end
})

t.x                     -- "default" (uses __index)
rawget(t, "x")          -- nil (bypasses __index)
```
::

## `__call` Metamethod

Make a table callable like a function:

::code-wrapper{language="lua"}
```lua
local function newCallable(name)
  local tbl = {count = 0}
  local mt = {
    __call = function(self, arg)
      self.count = self.count + 1
      return self.count, arg
    end
  }
  setmetatable(tbl, mt)
  return tbl
end

local f = newCallable("test")
print(f(10))            -- 1, 10
print(f(20))            -- 2, 20
```
::

## `__len` Metamethod

Override length operator `#`:

::code-wrapper{language="lua"}
```lua
local Set = {}

function Set.new(values)
  local s = {}
  for _, v in ipairs(values) do
    s[v] = true
  end
  return setmetatable(s, Set)
end

function Set.__len(self)
  local count = 0
  for _ in pairs(self) do
    count = count + 1
  end
  return count
end

Set.__index = Set

local s = Set.new({1, 2, 3})
print(#s)               -- 3
```
::

## `__pairs` and `__ipairs` (Lua 5.2+)

Custom iteration behavior:

::code-wrapper{language="lua"}
```lua
local t = {1, 2, 3, hidden = 4}
local mt = {
  __pairs = function(self)
    return function(self, key)
      key = next(self, key)
      if key == "hidden" then key = next(self, key) end
      if key then return key, self[key] end
    end, self, nil
  end
}
setmetatable(t, mt)

for k, v in pairs(t) do
  print(k, v)           -- iterates but skips "hidden"
end
```
::

## Weak References and `__gc`

::code-wrapper{language="lua"}
```lua
-- Weak table (allows garbage collection of values)
local cache = setmetatable({}, {__mode = "v"})

local obj = {id = 1}
cache[1] = obj
print(cache[1])         -- {id = 1}

obj = nil               -- dereferenced
-- cache[1] is now nil (automatically garbage collected)
collectgarbage()        -- force collection
print(cache[1])         -- nil
```
::

Modes:
- `"v"` — weak values (values can be collected)
- `"k"` — weak keys (keys can be collected)
- `"kv"` — both weak

## Comparison Metamethods

::code-wrapper{language="lua"}
```lua
local Point = {}

function Point.new(x, y)
  return setmetatable({x = x, y = y}, Point)
end

function Point.__lt(a, b)   -- less than
  return (a.x ^ 2 + a.y ^ 2) < (b.x ^ 2 + b.y ^ 2)
end

function Point.__le(a, b)   -- less than or equal
  return (a.x ^ 2 + a.y ^ 2) <= (b.x ^ 2 + b.y ^ 2)
end

Point.__index = Point

local p1 = Point.new(1, 1)
local p2 = Point.new(2, 2)

print(p1 < p2)          -- true (distance from origin)
```
::

## Using Metatables for OOP

::code-wrapper{language="lua"}
```lua
-- Base class
local Animal = {}

function Animal:new(name)
  local obj = {name = name}
  setmetatable(obj, {__index = self})
  return obj
end

function Animal:speak()
  return self.name .. " makes a sound"
end

-- Derived class
local Dog = setmetatable({}, {__index = Animal})

function Dog:new(name, breed)
  local obj = Animal:new(name)
  obj.breed = breed
  setmetatable(obj, {__index = self})
  return obj
end

function Dog:speak()
  return self.name .. " barks!"
end

local dog = Dog:new("Buddy", "Golden Retriever")
print(dog:speak())      -- "Buddy barks!"
```
::

## 💡 Tips & Tricks

**Use `__index` for lazy initialization**: Load data on first access instead of upfront.

```lua
local mt = {
  __index = function(self, key)
    local value = loadData(key)
    rawset(self, key, value)  -- cache it
    return value
  end
}
```

**Combine `__index` and `__newindex` for property validation**:

```lua
local mt = {
  __index = function(self, key)
    return rawget(self, "_" .. key)
  end,
  __newindex = function(self, key, value)
    assert(value >= 0, "value must be non-negative")
    rawset(self, "_" .. key, value)
  end
}
```

**Use metatables to prevent accidental global pollution**: Make undefined globals error instead of returning nil.

```lua
setmetatable(_G, {
  __index = function(self, key)
    error("undefined global: " .. key)
  end
})
```

## ⚠️ Edge Cases & Gotchas

**Metatables don't affect raw operations**: `rawget()`, `rawset()` bypass metamethods. Comparisons with raw operations ignore metamethods.

**`__index` called only if key not found**: If key exists in table, `__index` metamethod isn't called. Remove the key first if you want to override.

```lua
local t = setmetatable({x = 1}, {
  __index = function() return "default" end
})
print(t.x)              -- 1 (not "default")
print(t.y)              -- "default"
```

**`__newindex` called only if key doesn't exist**: To intercept all assignments, use a proxy table approach.

**Circular metamethods can cause infinite recursion**: If `__index` references the table itself, you can get infinite loops.

**Metatables are per-table, not per-class**: Each instance needs its own metatable (or share one carefully).

**`__pairs` must return an iterator function**: If you return wrong signature, `pairs()` fails silently.

## 🧠 Spot the Bug

What does this print?

```lua
local t = {}
setmetatable(t, {
  __index = function(self, key)
    return "default"
  end,
  __newindex = function(self, key, value)
    rawset(self, key, value)
  end
})

t.x = 42
print(t.x)
print(t.y)
```

<details>
<summary>Answer</summary>

Prints `42` then `default`.

Here's why:
- `t.x = 42` calls `__newindex`, which uses `rawset()` to store `x = 42`
- `print(t.x)` finds `x` in the table (doesn't call `__index`)
- `print(t.y)` doesn't find `y`, so `__index` is called, returning `"default"`

**The lesson**: `__index` is only called if the key doesn't exist in the table itself.

</details>

## Key Takeaways

- Metatables define metamethods that Lua calls automatically.
- `__index` customizes table access (field not found).
- `__newindex` customizes table assignment (field not found).
- `__add`, `__sub`, etc. for operator overloading.
- `__call` makes a table callable like a function.
- `__tostring` customizes string conversion.
- Use `rawget()`/`rawset()` to bypass metamethods.
- Metatables enable OOP patterns (inheritance via `__index`).
- Weak references with `__mode` allow garbage collection.
