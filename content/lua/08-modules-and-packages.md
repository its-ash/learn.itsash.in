---
title: Lua 08 — Modules, Packages & Dependency Management
description: Deep-dive into Lua's module system: require mechanics, package.path/cpath, package.loaded cache, searchers and preload, module patterns (table, closure, class), circular dependency resolution via lazy require, hot-reload, and luarocks integration.
---

# 08 — Modules, Packages & Dependency Management

A **module** is a chunk that returns a value (usually a table). `require(name)` loads, executes, caches, and returns the module. The search path, the cache (`package.loaded`), and the searchers (`package.searchers`) control resolution. Understanding the cache semantics, circular dependency resolution, and hot-reload mechanics is essential for structuring non-trivial Lua applications.

## `require()` Mechanics

::code-wrapper{language="lua"}
```lua
-- require(name):
-- 1. Check package.loaded[name] → if present, return cached value (no re-execution)
-- 2. If not cached: search package.searchers for a loader function
-- 3. The loader finds the file (via package.searchpath), compiles it, executes it
-- 4. The return value is cached in package.loaded[name] and returned
-- 5. If the module returns nil (or nothing), true is cached

local utils = require("utils")       -- first call: loads utils.lua, executes, caches
local utils2 = require("utils")      -- second call: returns CACHED value
print(utils == utils2)               -- true (same object)

-- package.loaded: the module cache (table)
for name, mod in pairs(package.loaded) do
  print(name, mod)  -- "utils" → table, "string" → string lib, etc.
end

-- Evict from cache to force reload:
package.loaded["utils"] = nil
local utils3 = require("utils")      -- re-executes the chunk, returns new value
print(utils == utils3)              -- false (different object after reload)
```

## Search Path & `package.searchpath`

::code-wrapper{language="lua"}
```lua
-- package.path: semicolon-separated template paths for Lua modules
-- ? is replaced with the module name (dots → slashes for subdirectories)
-- Example: "./?.lua;./?/init.lua;/usr/share/lua/5.4/?.lua"

-- require("a.b.c") searches:
--   ./a/b/c.lua
--   ./a/b/c/init.lua
--   /usr/share/lua/5.4/a/b/c.lua
--   ...

-- package.cpath: same for C modules (.so/.dll)
-- require("cjson") searches cpath for cjson.so, loads via luaopen_cjson

-- Add a custom search path:
package.path = package.path .. ";./lib/?.lua;./lib/?/init.lua"

-- package.searchpath(name, path, sep?, rep?): find file, return path or nil+err
local path, err = package.searchpath("mylib.utils", package.path)
-- path = "./lib/mylib/utils.lua" (or nil with error listing tried paths)

-- Custom search with a different separator:
local path = package.searchpath("mylib::utils", package.path, "::", "/")
-- treats :: as separator, replaces with / for file path
```

## Searchers (`package.searchers`)

::code-wrapper{language="lua"}
```lua
-- package.searchers (5.2+, called package.loaders in 5.1): ordered list of functions
-- Each searcher(name) returns: loader_fn | "error message" | nil (try next)
-- Default searchers (in order):
-- 1. package.preload[name] — check preloaded loaders (programmatic registration)
-- 2. package.path searcher — find .lua file on package.path
-- 3. package.cpath searcher — find .so/.dll on package.cpath, call luaopen_name
-- 4. all-in-one loader — find submodules of C packages

-- Register a module without a file (useful for testing/mocking):
package.preload["fake_http"] = function()
  return {
    get = function(url) return "mocked response for " .. url end,
  }
end
local http = require("fake_http")  -- uses preload, no file needed

-- Custom searcher: load from a database or embedded string
table.insert(package.searchers, 1, function(name)
  local source = embedded_modules[name]  -- your custom source map
  if not source then return nil end  -- not found, try next searcher
  local fn, err = load(source, name, "t")  -- compile
  if not fn then return err end
  return fn  -- loader function (will be called by require)
end)
```

## Module Patterns

### Pattern 1: Table Module (most common)

::code-wrapper{language="lua" filename="math_utils.lua"}
```lua
-- Module = table of exported functions. Local helpers stay private.
local M = {}  -- the module table (exported)

-- Local (private) helper — not in M, not accessible externally
local function validate(x)
  assert(type(x) == "number", "expected number")
  return x
end

-- Public functions assigned to M
function M.add(a, b)
  validate(a); validate(b)
  return a + b
end

function M.multiply(a, b)
  validate(a); validate(b)
  return a * b
end

return M  -- the require() return value
```
::

### Pattern 2: Closure Module (true privacy)

::code-wrapper{language="lua" filename="counter.lua"}
```lua
-- No table returned; the module's value is a single function (or a few closures)
-- All state is in upvalues — truly private, not even accessible via M

local count = 0  -- private upvalue

local function inc() count = count + 1; return count end
local function get() return count end
local function reset() count = 0 end

return {
  inc = inc,
  get = get,
  reset = reset,
}
-- count is NOT accessible — it's an upvalue of the closures, not in the returned table
```
::

### Pattern 3: Class-Like Module

::code-wrapper{language="lua" filename="point.lua"}
```lua
-- Module is a class (metatable); require returns the class table
local Point = {}
Point.__index = Point

function Point.new(x, y)
  return setmetatable({x = x, y = y}, Point)
end

function Point:distance(other)
  local dx, dy = self.x - other.x, self.y - other.y
  return math.sqrt(dx * dx + dy * dy)
end

function Point:__tostring()
  return string.format("(%d, %d)", self.x, self.y)
end

return Point  -- callers do: local Point = require("point"); local p = Point.new(1, 2)
```
::

### Pattern 4: Module with `_ENV` (export-by-assignment)

::code-wrapper{language="lua" filename="config.lua"}
```lua
-- Change _ENV so all globals write to the module table — no `M.` prefix needed
local M = {}
do
  local _ENV = M  -- all unqualified assignments go to M, not _G

  host = "localhost"      -- M.host (not _G.host)
  port = 8080            -- M.port

  function connect()      -- M.connect
    return "connecting to " .. host .. ":" .. port
  end

  function reload(new_host, new_port)
    host = new_host or host  -- _ENV.host, but _ENV = M, so M.host
    port = new_port or port
  end
end
return M
-- Clean syntax, no M. prefix; but reads of `host` inside the block also
-- go through _ENV (M), so they read M.host (correct)
```
::

## Circular Dependencies

::code-wrapper{language="lua"}
```lua
-- Problem: A requires B, B requires A. When A is loading, it requires B.
-- B then requires A — but A is still loading (incomplete). B gets the
-- partially-constructed A (or the true sentinel if A hasn't returned yet).

-- a.lua
local B = require("b")     -- B not loaded yet → loads b.lua
local M = {}
M.value = 1
function M.use_b() return B.value end  -- uses B (which is loaded by now)
return M

-- b.lua
local A = require("a")     -- A is ALREADY loading (in package.loaded as a sentinel)
-- At this point, A is the chunk's return value — but a.lua hasn't returned yet!
-- So A might be nil (if a.lua hasn't reached `return M`)
local M = {}
M.value = 2
function M.use_a()
  -- SAFE: defer the access to call time (A is fully loaded by now)
  return A.value  -- A is the complete module at call time
end
return M
```

### Anti-pattern: accessing circular dep at module load time

::code-wrapper{language="lua"}
```lua
-- BAD: b.lua accesses A at load time — A isn't ready
local A = require("a")
local M = {}
M.cached_a_value = A.value  -- ERROR: A is nil or incomplete at load time
return M

-- GOOD: defer to function call time
local A = require("a")
local M = {}
function M.get_a_value() return A.value end  -- A is complete by call time
return M
```

### Pattern: lazy require (defer the require itself)

::code-wrapper{language="lua"}
```lua
-- If even the require order is problematic, defer the require to call time
local M = {}
function M.use_a()
  local A = require("a")  -- require inside function — runs at call, not load
  return A.value
end
return M
```
::

## Hot-Reload

::code-wrapper{language="lua"}
```lua
-- Evict from cache + re-require: gets a fresh module, preserving state externally
local function reload(name, state_transfer)
  local old = package.loaded[name]
  package.loaded[name] = nil  -- evict
  local new = require(name)   -- re-execute (fresh module table)
  if state_transfer then state_transfer(old, new) end
  return new, old
end

-- Usage: reload game system, preserving player score
local GameState = require("game.state")
GameState = reload("game.state", function(old, new)
  new.player_score = old.player_score  -- transfer state to new module
  new.player_name = old.player_name
end)

-- WARNING: side effects in module body run AGAIN on reload
-- If module registers callbacks at load time, you get double registration
-- Solution: provide an init() function called explicitly, not at load time
```

## Package Structure & `init.lua`

::code-wrapper{language="lua"}
```lua
-- Directory structure:
-- mylib/
--   init.lua        → require("mylib") finds this via ?/init.lua path
--   utils.lua      → require("mylib.utils")
--   models/
--     user.lua     → require("mylib.models.user")
--     post.lua     → require("mylib.models.post")

-- mylib/init.lua: the package entry point, re-exports submodules
return {
  utils  = require("mylib.utils"),
  models = {
    user = require("mylib.models.user"),
    post = require("mylib.models.post"),
  },
}

-- Usage:
local mylib = require("mylib")
mylib.utils.trim("  hello  ")
local user = mylib.models.user.new("Alice")
```

## `luarocks` — Package Manager

::code-wrapper{language="bash"}
```bash
# Install luarocks
brew install luarocks        # macOS

# Install packages (into the system Lua tree)
luarocks install lua-cjson   # C JSON encoder/decoder
luarocks install luasocket   # networking
luarocks install lpeg        # parsing expression grammars
luarocks install luaunit     # testing framework
luarocks install luacheck    # static analyzer

# Project-local installation (doesn't pollute system)
luarocks install --local lua-cjson  # → ~/.luarocks/

# Create a rockspec (package descriptor)
luarocks new-mod  -- generates a template rockspec
```

::code-wrapper{language="lua" filename="myproject-1.0-1.rockspec"}
```lua
-- rockspec: declarative package metadata for luarocks
package = "myproject"
version = "1.0-1"
source = { url = "git+https://github.com/me/myproject.git" }
description = { summary = "A Lua project", license = "MIT" }
dependencies = {
  "lua >= 5.3",
  "lua-cjson >= 2.1",
  "luasocket",
}
build = {
  type = "builtin",
  modules = {
    myproject = "src/myproject.lua",
    ["myproject.utils"] = "src/myproject/utils.lua",
  },
}
```
::

## Production: Dependency Injection

::code-wrapper{language="lua"}
```lua
-- Instead of require() at module load, accept dependencies as parameters
-- This makes modules testable (pass mocks) and decoupled

-- BAD: hard dependency, untestable
local http = require("luasocket.http")  -- can't mock for tests
local M = {}
function M.fetch_user(id)
  return http.request("http://api/users/" .. id)  -- hard to test
end
return M

-- GOOD: dependency injection
local M = {}
function M.new(deps)
  local http = deps.http or require("luasocket.http")  -- inject or default
  return {
    fetch_user = function(id) return http.request("http://api/users/" .. id) end,
  }
end
return M

-- Test: inject a mock http
local mock_http = { request = function(url) return "mock: " .. url end }
local client = require("myclient").new({ http = mock_http })
print(client.fetch_user(42))  -- "mock: http://api/users/42"
```

## 💡 Tips & Tricks

**Use `package.preload` for testing**: Register mock modules before requiring the module under test.

::code-wrapper{language="lua"}
```lua
-- test.lua
package.preload["db"] = function()
  return {
    query = function(sql) return {"mock", "rows"} end,
  }
end
local app = require("app")  -- app requires "db" → gets the mock
```
::

**Lazy-load expensive modules**: Defer require to first use for modules that may never be needed.

::code-wrapper{language="lua"}
```lua
local M = {}
local json  -- not loaded yet
function M.encode(data)
  if not json then json = require("cjson") end  -- load on first call
  return json.encode(data)
end
return M
```
::

**`package.loaded[...]` in a module to get its own name**: A module can discover its own name (5.2+).

::code-wrapper{language="lua"}
```lua
-- Inside a module chunk, `...` is the module name (for require'd modules)
local module_name = ...  -- "mylib.utils" when require'd as that
```
::

## ⚠️ Edge Cases & Gotchas

**`require` caches the return value, not the side effects**: If the module body registers callbacks (global side effects), evicting + re-requiring runs them again — can cause double-registration.

::code-wrapper{language="lua"}
```lua
-- hooks.lua
hooks["on_tick"] = function() print("tick") end  -- side effect at load time
return {}

-- Evicting and re-requiring registers the hook AGAIN:
package.loaded["hooks"] = nil
require("hooks")  -- hooks["on_tick"] now registered twice → prints "tick" twice per tick
```
::

**Module returning `nil` or nothing**: `require` caches `true` (not nil) when the module returns nothing. The module appears loaded but returns `true`, not the intended value.

::code-wrapper{language="lua"}
```lua
-- bad_module.lua
local x = 1 + 1  -- no return statement
-- require("bad_module") → true (not nil!), subsequent requires return true

-- Always return a table explicitly:
return {}
```
::

**`require` name must match the file path**: `require("utils")` looks for `utils.lua`, NOT `Utils.lua` (case-sensitive on most systems).

**`package.path` order matters**: First match wins. If two directories have `utils.lua`, the first in the path is loaded — can cause confusion when a local override is shadowed by a system module.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
-- a.lua
local M = {}
local helper = require("a.helper")  -- requires a/helper.lua
function M.process(x) return helper.transform(x) end
return M

-- b.lua
local A = require("a")
function M.use(x) return A.process(x) + 1 end

-- What happens when b.lua is required first?
```

<details>
<summary>Answer</summary>

When `b.lua` is required first:
1. `require("b")` starts executing `b.lua`
2. `b.lua` does `require("a")` — starts executing `a.lua`
3. `a.lua` does `require("a.helper")` — loads `a/helper.lua` (no circular issue here)
4. `a.lua` completes, returns `M` (the `a` module table)
5. Back in `b.lua`, `A` is now the complete `a` module
6. `b.lua` defines `M.use` and returns

This works fine — no circular dependency issue because `a.lua` doesn't require `b.lua`. The only issue would be if `a.helper` required `a` or `b` (creating a cycle back to an incompletely-loaded module).

The bug would appear if `b.lua` was required by `a.helper`:
- `require("b")` → `b.lua` → `require("a")` → `a.lua` → `require("a.helper")` → `a/helper.lua` → `require("b")` → `b` is still loading (incomplete) → `b`'s `M` is incomplete or nil → error.

Fix: defer the `require("b")` inside `a.helper` to a function body, not at load time.

</details>