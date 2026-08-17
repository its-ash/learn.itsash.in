# 08 — Modules & Packages

## Module Basics

A module is a Lua file (or chunk) that defines functions and data, then returns them in a table.

::code-wrapper{language="lua"}
```lua
-- math_utils.lua
local M = {}

function M.add(a, b)
  return a + b
end

function M.multiply(a, b)
  return a * b
end

return M
```
::

Use the module:

::code-wrapper{language="lua"}
```lua
local math_utils = require("math_utils")

print(math_utils.add(2, 3))          -- 5
print(math_utils.multiply(2, 3))     -- 6
```
::

## `require()` Mechanism

`require()` loads a module and caches it:

::code-wrapper{language="lua"}
```lua
-- Load module (Lua searches package.path for module file)
local utils = require("utils")

-- Second require returns cached module (doesn't re-execute)
local utils2 = require("utils")
utils == utils2         -- true (same instance)

-- To force reload, clear cache
package.loaded["utils"] = nil
local utils3 = require("utils")  -- re-executed
```
::

Module search paths:

::code-wrapper{language="lua"}
```lua
-- View search path
print(package.path)
-- Output: "./?.lua;/usr/share/lua/5.4/?.lua;..." (approximate)

-- Add to search path
package.path = package.path .. ";/my/modules/?.lua"

-- Or programmatically
table.insert(package.searchers, 2, function(name)
  -- custom loader function
end)
```
::

## Package Namespace Convention

Group related modules in "packages":

::code-wrapper{language="lua"}
```lua
-- mylib/utils.lua
local M = {}
function M.trim(s)
  return (s:gsub("^%s*(.-)%s*$", "%1"))
end
return M

-- mylib/math.lua
local M = {}
function M.square(x)
  return x * x
end
return M

-- main.lua
local utils = require("mylib.utils")
local math_lib = require("mylib.math")

print(utils.trim("  hello  "))  -- "hello"
print(math_lib.square(5))       -- 25
```
::

## Submodules

Modules can require other modules:

::code-wrapper{language="lua"}
```lua
-- config/default.lua
return {
  api_url = "https://api.example.com",
  timeout = 5000
}

-- config/production.lua
local default = require("config.default")
return {
  api_url = "https://prod-api.example.com",
  timeout = 10000,
  -- inherit from default
  retries = default.timeout // 5000
}
```
::

## Encapsulation with Local Variables

Use local variables for private state:

::code-wrapper{language="lua"}
```lua
-- cache.lua
local cache_data = {}  -- private to this module

local M = {}

function M.get(key)
  return cache_data[key]
end

function M.set(key, value)
  cache_data[key] = value
end

function M.clear()
  cache_data = {}
end

return M
```
::

Users can't access `cache_data` directly:

::code-wrapper{language="lua"}
```lua
local cache = require("cache")

cache.set("foo", "bar")
print(cache.get("foo"))         -- "bar"
print(cache.cache_data)         -- nil (private)
```
::

## Module Patterns

### Pattern 1: Simple Module (table-based)

::code-wrapper{language="lua"}
```lua
-- string_utils.lua
return {
  trim = function(s)
    return (s:gsub("^%s*(.-)%s*$", "%1"))
  end,
  
  split = function(s, sep)
    local parts = {}
    s:gsub("([^" .. sep .. "]+)", function(m)
      table.insert(parts, m)
    end)
    return parts
  end
}
```
::

### Pattern 2: Module with Initialization

::code-wrapper{language="lua"}
```lua
-- db.lua
local M = {}
local connection = nil

function M.connect(url)
  connection = {url = url, connected = true}
  print("Connected to " .. url)
end

function M.disconnect()
  if connection then
    connection = nil
    print("Disconnected")
  end
end

function M.query(sql)
  if not connection then
    error("Not connected")
  end
  return "Results for: " .. sql
end

return M
```
::

### Pattern 3: Class-Like Module

::code-wrapper{language="lua"}
```lua
-- Point.lua
local Point = {}
Point.__index = Point

function Point.new(x, y)
  local self = setmetatable({x = x, y = y}, Point)
  return self
end

function Point:distance()
  return math.sqrt(self.x ^ 2 + self.y ^ 2)
end

function Point:__tostring()
  return "(" .. self.x .. ", " .. self.y .. ")"
end

return Point
```
::

## `package.loaded` and Module Caching

::code-wrapper{language="lua"}
```lua
-- Check if module is already loaded
if package.loaded["mymodule"] then
  print("already loaded")
end

-- Access cached module without re-executing
local m1 = require("mymodule")
local m2 = package.loaded["mymodule"]
m1 == m2            -- true

-- Clear cache to force reload
package.loaded["mymodule"] = nil
local m3 = require("mymodule")  -- re-executed
```
::

## Circular Dependencies

If module A requires B and B requires A, you can hit circular dependency issues:

::code-wrapper{language="lua"}
```lua
-- a.lua
local B = require("b")
local M = {}
function M.funcA()
  return B.funcB()
end
return M

-- b.lua
local A = require("a")  -- circular!
local M = {}
function M.funcB()
  return A.funcA()  -- may be incomplete
end
return M
```
::
Solution: delay the require or use a different pattern:

::code-wrapper{language="lua"}
```lua
-- a.lua
local M = {}
function M.funcA()
  local B = require("b")  -- require inside function
  return B.funcB()
end
return M

-- b.lua
local M = {}
function M.funcB()
  local A = require("a")
  return A.funcA()
end
return M
```
::

## Global vs Module Variables

Best practice: keep modules self-contained:

::code-wrapper{language="lua"}
```lua
-- bad.lua (pollutes globals)
CONFIG = {timeout = 5000}

function helper()
  return CONFIG.timeout
end

return {helper = helper}

-- good.lua (contained)
local CONFIG = {timeout = 5000}

local function helper()
  return CONFIG.timeout
end

return {helper = helper}
```
::

## 💡 Tips & Tricks

**Use `local` declarations in modules**: Prevents globals pollution.

**Structure large projects with package hierarchy**: `app/models/`, `app/views/`, `app/utils/`.

**Create an `__init.lua` for packages** (Lua 5.4 style):

::code-wrapper{language="lua"}
```lua
-- mylib/__init.lua
return {
  utils = require("mylib.utils"),
  models = require("mylib.models"),
}
```
::

**Use `debug.getinfo()` to find calling module**:

::code-wrapper{language="lua"}
```lua
local function who_called_me()
  local info = debug.getinfo(2)
  return info.source
end
```
::

**Lazy load expensive modules**:

::code-wrapper{language="lua"}
```lua
local M = {}
local json = nil  -- load on first use

function M.parse(s)
  if not json then json = require("json") end
  return json.decode(s)
end

return M
```
::

## ⚠️ Edge Cases & Gotchas

**Module name must match filename**: `require("math_utils")` loads `math_utils.lua` (or in subdirectory with `.` separator).

**`require()` caches globally**: All uses of `require("foo")` get the same instance. Modifications affect all users.

**Search path is searched in order**: First match wins. If you have name conflicts, the one in earlier paths takes precedence.

**No namespace privacy**: Module tables are just tables. Users can modify returned table: `utils.add = function() return 0 end` (bad practice, but possible).

**Circular requires can fail unpredictably**: If modules access each other at load time (not function time), you can get nil errors.

**Large files loaded completely**: `require()` loads and executes the entire file. For huge modules, consider lazy loading inside functions.

## 🧠 Spot the Bug

What happens here?

::code-wrapper{language="lua"}
```lua
-- a.lua
print("Loading A")
local B = require("b")
print("Loaded A")
return {name = "A"}

-- b.lua
print("Loading B")
local A = require("a")
print("Loaded B")
return {name = "B"}

-- main.lua
require("a")
```
::

<details>
<summary>Answer</summary>

Prints:
::code-wrapper{language="text"}
```text
Loading A
Loading B
Loaded A
Loaded B
```
::

Here's why:
- Require A: prints "Loading A", then requires B
- Require B: prints "Loading B", requires A (already partially loaded, returns the incomplete module)
- B finishes: prints "Loaded B"
- A finishes: prints "Loaded A"

Both modules complete, but B gets an incomplete version of A (without the return value applied yet). If B tries to access `A.something` at load time, it fails.

**The lesson**: Avoid circular dependencies at module load time. Use lazy loading (require inside functions) if you need circular dependencies.

</details>

## Key Takeaways

- Modules are Lua files that return a table of functions/data.
- `require("name")` loads and caches modules.
- Use local variables for private state.
- Package naming: `require("package.submodule")` loads file at `package/submodule.lua`.
- Modules can require other modules (submodules).
- Avoid circular dependencies at load time; use lazy loading in functions.
- `package.loaded` holds cached modules.
- Module patterns: simple table, with initialization, class-like.
